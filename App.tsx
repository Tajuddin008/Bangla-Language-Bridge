import React, { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio, translateText, textToSpeech, getPhoneticTranscription } from './services/geminiService';
import { SUPPORTED_LANGUAGES, SUPPORTED_VOICES, DEFAULT_TARGET_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, DEFAULT_VOICE } from './constants';
import { decode, pcmToWavBlob } from './utils';
import { MicrophoneIcon, StopIcon, SpeakerIcon, CopyIcon, ClearIcon, DownloadIcon } from './components/icons';

const App: React.FC = () => {
    const [inputText, setInputText] = useState('');
    const [outputText, setOutputText] = useState('');
    const [phoneticText, setPhoneticText] = useState('');
    const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
    const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);
    const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE);
    const [outputAudio, setOutputAudio] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioVisualizerRef = useRef<AnalyserNode | null>(null);
    const visualizerAnimationRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const currentAudioUrlRef = useRef<string | null>(null);
    
    useEffect(() => {
        if (audioElementRef.current) {
            audioElementRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        const audio = audioElementRef.current;
        return () => {
            if (audio) {
                audio.pause();
                audio.src = '';
            }
            if (currentAudioUrlRef.current) {
                URL.revokeObjectURL(currentAudioUrlRef.current);
            }
        };
    }, []);

    const handleGenerateAudio = useCallback(async (text: string, language: string, voice: string) => {
        setLoadingMessage('Generating audio...');
        setOutputAudio(null);
        try {
            const audio = await textToSpeech(text, language, voice);
            setOutputAudio(audio);
        } catch (err) {
            setError(err instanceof Error ? `Audio generation failed: ${err.message}` : String(err));
        } finally {
            setLoadingMessage('');
        }
    }, []);

    const handleTranslate = useCallback(async (textToTranslate: string, fromLanguage: string, toLanguage: string, voice: string) => {
        if (!textToTranslate.trim()) {
            setOutputText('');
            setOutputAudio(null);
            setPhoneticText('');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setOutputText('');
        setOutputAudio(null);
        setPhoneticText('');

        try {
            setLoadingMessage('Translating...');
            const translated = await translateText(textToTranslate, fromLanguage, toLanguage);
            setOutputText(translated);

            setLoadingMessage('Generating pronunciation...');
            const phonetic = await getPhoneticTranscription(translated, toLanguage);
            setPhoneticText(phonetic);

            await handleGenerateAudio(translated, toLanguage, voice);

        } catch (err) {
            setError(err instanceof Error ? `Translation failed: ${err.message}` : String(err));
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [handleGenerateAudio]);
    
    useEffect(() => {
        if (isRecording) return;
        
        const handler = setTimeout(() => {
            if (inputText.trim()) {
                handleTranslate(inputText, sourceLanguage, targetLanguage, selectedVoice);
            } else {
                 setOutputText('');
                 setOutputAudio(null);
                 setPhoneticText('');
            }
        }, 1000);

        return () => {
            clearTimeout(handler);
        };
    }, [inputText, sourceLanguage, targetLanguage, selectedVoice, handleTranslate, isRecording]);

    // Re-generate audio if the voice is changed
    useEffect(() => {
        if (outputText && outputAudio) {
            handleGenerateAudio(outputText, targetLanguage, selectedVoice);
        }
    }, [selectedVoice, targetLanguage, outputText, handleGenerateAudio]);


    const drawVisualizer = useCallback(() => {
        if (!audioVisualizerRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;

        const analyser = audioVisualizerRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            visualizerAnimationRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            canvasCtx.fillStyle = 'rgb(243 244 246)'; // bg-gray-100
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                 canvasCtx.fillStyle = 'rgb(31 41 55)'; // dark:bg-gray-800
            }
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = 'rgb(59 130 246)'; // blue-500

            canvasCtx.beginPath();
            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            for(let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;
                if(i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        };
        draw();
    }, []);

    const handleStartRecording = async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            audioVisualizerRef.current = analyser;

            setIsRecording(true);
            setError(null);
            setInputText('');

            drawVisualizer();

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                if (visualizerAnimationRef.current) cancelAnimationFrame(visualizerAnimationRef.current);
                audioVisualizerRef.current = null;
                audioContext.close();

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                if (audioBlob.size === 0) return;

                setLoadingMessage('Transcribing...');
                setIsLoading(true);
                try {
                    const transcribedText = await transcribeAudio(audioBlob, sourceLanguage);
                    setInputText(transcribedText);
                } catch (err) {
                    setError(err instanceof Error ? `Transcription failed: ${err.message}` : String(err));
                    setOutputText('');
                    setOutputAudio(null);
                } finally {
                    setIsLoading(false);
                    setLoadingMessage('');
                }
            };

            mediaRecorder.start();
        } catch (err) {
            setError(err instanceof Error ? `Microphone access denied: ${err.message}` : String(err));
            setIsRecording(false);
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handlePlayAudio = async () => {
        if (!outputAudio || isPlayingAudio) return;
        try {
            setIsPlayingAudio(true);
    
            const audioData = decode(outputAudio);
            const wavBlob = pcmToWavBlob(audioData, 24000, 1, 16);
    
            if (currentAudioUrlRef.current) {
                URL.revokeObjectURL(currentAudioUrlRef.current);
            }
    
            const audioUrl = URL.createObjectURL(wavBlob);
            currentAudioUrlRef.current = audioUrl;
    
            if (!audioElementRef.current) {
                audioElementRef.current = new Audio();
            }
            const audio = audioElementRef.current;
            
            audio.src = audioUrl;
            audio.preservesPitch = true;
            audio.playbackRate = playbackRate;
    
            audio.onended = () => {
                setIsPlayingAudio(false);
            };
            audio.onerror = (e) => {
                setError('An error occurred during audio playback.');
                console.error('Audio playback error:', e);
                setIsPlayingAudio(false);
            };
    
            await audio.play();
    
        } catch (err) {
            setError(err instanceof Error ? `Failed to play audio: ${err.message}` : String(err));
            setIsPlayingAudio(false);
        }
    };

    const handleDownloadAudio = () => {
        if (!outputAudio) return;
        try {
            const audioData = decode(outputAudio);
            const wavBlob = pcmToWavBlob(audioData, 24000, 1, 16);
            
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            const safeTargetLanguage = targetLanguage.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `translation_${safeTargetLanguage}.wav`;
            
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError(err instanceof Error ? `Failed to prepare audio for download: ${err.message}` : String(err));
        }
    };

    const handleCopy = () => {
        if (!outputText) return;
        navigator.clipboard.writeText(outputText);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };
    
    const handleClearInput = () => {
        setInputText('');
        setOutputText('');
        setPhoneticText('');
        setOutputAudio(null);
        setError(null);
    };
    
    return (
        <div className="min-h-screen text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900 flex flex-col p-4 sm:p-6 lg:p-8">
            <header className="text-center mb-8">
                <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
                    Global Language Bridge
                </h1>
                <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                    Speak or type in any language for instant, effortless translations.
                </p>
            </header>

            <main className="flex-grow flex flex-col gap-8 max-w-6xl w-full mx-auto">
                {error && (
                    <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md shadow-md" role="alert">
                        <p className="font-bold">An error occurred</p>
                        <p>{error}</p>
                    </div>
                )}
                
                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Input Card */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col">
                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex flex-wrap justify-between items-center gap-4">
                             <div className="flex items-center gap-2">
                                <label htmlFor="source-language-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Language:</label>
                                <select
                                    id="source-language-select"
                                    value={sourceLanguage}
                                    onChange={(e) => setSourceLanguage(e.target.value)}
                                    className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50"
                                    disabled={isRecording || isPlayingAudio}
                                >
                                    {SUPPORTED_LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.name}>{lang.name}</option>
                                    ))}
                                </select>
                            </div>
                             <button
                                onClick={isRecording ? handleStopRecording : handleStartRecording}
                                className={`p-3 rounded-full transition-all duration-300 ease-in-out ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                            >
                                {isRecording ? <StopIcon className="h-6 w-6" /> : <MicrophoneIcon className="h-6 w-6" />}
                            </button>
                        </div>
                        <div className="p-4 sm:p-6 flex-grow relative">
                            {inputText && !isRecording && (
                                 <button onClick={handleClearInput} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Clear input">
                                     <ClearIcon className="h-5 w-5"/>
                                 </button>
                            )}
                             <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Type or record audio..."
                                className="w-full h-full min-h-[200px] bg-transparent text-gray-800 dark:text-gray-200 border-none focus:ring-0 resize-none text-lg p-2 rounded-md"
                                disabled={isRecording}
                            />
                            {isRecording && <canvas ref={canvasRef} className="w-full h-full absolute inset-0 opacity-80" width="500" height="200"></canvas>}
                        </div>
                    </div>

                    {/* Output Card */}
                     <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col">
                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex flex-wrap justify-between items-center gap-4">
                            <div className="flex items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-2">
                                  <label htmlFor="language-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Translate to:</label>
                                  <select
                                      id="language-select"
                                      value={targetLanguage}
                                      onChange={(e) => setTargetLanguage(e.target.value)}
                                      className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50"
                                      disabled={isPlayingAudio || isRecording}
                                  >
                                      {SUPPORTED_LANGUAGES.map(lang => (
                                          <option key={lang.code} value={lang.name}>{lang.name}</option>
                                      ))}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label htmlFor="voice-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Voice:</label>
                                    <select
                                        id="voice-select"
                                        value={selectedVoice}
                                        onChange={(e) => setSelectedVoice(e.target.value)}
                                        className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled:opacity-50"
                                        disabled={!outputAudio || isPlayingAudio || isRecording || isLoading}
                                    >
                                        {SUPPORTED_VOICES.map(voice => (
                                            <option key={voice.code} value={voice.code}>{voice.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                             <div className="flex flex-wrap justify-end items-center gap-x-4 gap-y-2">
                                <button onClick={handleDownloadAudio} disabled={!outputAudio || isLoading || isPlayingAudio} className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Download translation audio">
                                    <DownloadIcon className="h-6 w-6" />
                                </button>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm text-blue-600 dark:text-blue-400 transition-opacity duration-300 ${isCopied ? 'opacity-100' : 'opacity-0'}`}>Copied!</span>
                                    <button onClick={handleCopy} disabled={!outputText || isLoading || isPlayingAudio} className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Copy translation">
                                        <CopyIcon className="h-6 w-6" />
                                    </button>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <button onClick={handlePlayAudio} disabled={!outputAudio || isLoading || isPlayingAudio} className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Play translation audio">
                                        <SpeakerIcon className={`h-6 w-6 transition-colors ${isPlayingAudio ? 'text-blue-500 dark:text-blue-400' : ''}`} />
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <label htmlFor="playback-speed" className="sr-only">Playback Speed</label>
                                        <input
                                            id="playback-speed"
                                            type="range"
                                            min="0.5"
                                            max="1.5"
                                            step="0.1"
                                            value={playbackRate}
                                            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                                            className="w-24 h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={!outputAudio || isLoading || isPlayingAudio}
                                            aria-label="Playback speed control"
                                        />
                                        <span className="text-sm font-mono w-10 text-center text-gray-600 dark:text-gray-400">{playbackRate.toFixed(1)}x</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 sm:p-6 flex-grow relative overflow-y-auto">
                            {isLoading && (
                                <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex flex-col items-center justify-center rounded-b-2xl z-10">
                                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="mt-4 text-lg font-medium">{loadingMessage}</p>
                                </div>
                            )}
                            <div className="w-full min-h-[200px] text-gray-800 dark:text-gray-200 text-lg p-2 whitespace-pre-wrap space-y-4">
                                {outputText ? (
                                    <>
                                        <p>{outputText}</p>
                                        {phoneticText && (
                                            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pronunciation:</p>
                                                <p className="text-base italic text-gray-600 dark:text-gray-300">{phoneticText}</p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-gray-400 dark:text-gray-500">Translation will appear here...</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;