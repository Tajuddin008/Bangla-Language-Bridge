import React, { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio, translateText, textToSpeech, getPhoneticTranscription } from './services/geminiService';
import { SUPPORTED_LANGUAGES, DEFAULT_TARGET_LANGUAGE } from './constants';
import { decode, decodeAudioData } from './utils';
import { MicrophoneIcon, StopIcon, SpeakerIcon, CopyIcon, ClearIcon } from './components/icons';

const App: React.FC = () => {
    const [inputText, setInputText] = useState('');
    const [outputText, setOutputText] = useState('');
    const [phoneticText, setPhoneticText] = useState('');
    const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);
    const [outputAudio, setOutputAudio] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioVisualizerRef = useRef<AnalyserNode | null>(null);
    const visualizerAnimationRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const handleTranslate = useCallback(async (textToTranslate: string, language: string) => {
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
            const translated = await translateText(textToTranslate, language);
            setOutputText(translated);

            setLoadingMessage('Generating pronunciation...');
            const phonetic = await getPhoneticTranscription(translated, language);
            setPhoneticText(phonetic);

            setLoadingMessage('Generating audio...');
            const audio = await textToSpeech(translated);
            setOutputAudio(audio);
        } catch (err) {
            setError(err instanceof Error ? `Translation failed: ${err.message}` : String(err));
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, []);
    
    // Automatic translation on text input change with debounce
    useEffect(() => {
        if (isRecording) return;
        
        const handler = setTimeout(() => {
            if (inputText.trim()) {
                handleTranslate(inputText, targetLanguage);
            } else {
                 setOutputText('');
                 setOutputAudio(null);
                 setPhoneticText('');
            }
        }, 1000); // 1 second debounce

        return () => {
            clearTimeout(handler);
        };
    }, [inputText, targetLanguage, handleTranslate, isRecording]);

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
            
            // Setup audio context for visualizer
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            audioVisualizerRef.current = analyser;

            setIsRecording(true);
            setError(null);
            setInputText(''); // Clear text when starting new recording

            drawVisualizer();

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop()); // Stop microphone access
                if (visualizerAnimationRef.current) cancelAnimationFrame(visualizerAnimationRef.current);
                audioVisualizerRef.current = null;
                audioContext.close();

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                if (audioBlob.size === 0) return;

                setLoadingMessage('Transcribing...');
                setIsLoading(true);
                try {
                    const transcribedText = await transcribeAudio(audioBlob);
                    setInputText(transcribedText);
                    // Translation will be triggered by the useEffect watching inputText
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
        if (!outputAudio) return;
        try {
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
            }
            const audioContext = audioContextRef.current;
            const audioData = decode(outputAudio);
            const audioBuffer = await decodeAudioData(audioData, audioContext, 24000, 1);
            
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (err) {
            setError(err instanceof Error ? `Failed to play audio: ${err.message}` : String(err));
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
                    Bangla Language Bridge
                </h1>
                <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                    Speak or type in Bengali for instant, effortless translations.
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
                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                             <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Bengali Input</h2>
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
                                placeholder="এখানে টাইপ করুন অথবা রেকর্ড করতে মাইক বাটনে ক্লিক করুন..."
                                className="w-full h-full min-h-[200px] bg-transparent text-gray-800 dark:text-gray-200 border-none focus:ring-0 resize-none text-lg p-2 rounded-md"
                                disabled={isRecording}
                            />
                            {isRecording && <canvas ref={canvasRef} className="w-full h-full absolute inset-0 opacity-80" width="500" height="200"></canvas>}
                        </div>
                    </div>

                    {/* Output Card */}
                     <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col">
                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center gap-4">
                            <div className="flex items-center gap-2">
                                <label htmlFor="language-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Translate to:</label>
                                <select
                                    id="language-select"
                                    value={targetLanguage}
                                    onChange={(e) => setTargetLanguage(e.target.value)}
                                    className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                                >
                                    {SUPPORTED_LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.name}>{lang.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm text-blue-600 dark:text-blue-400 transition-opacity duration-300 ${isCopied ? 'opacity-100' : 'opacity-0'}`}>Copied!</span>
                                <button onClick={handleCopy} disabled={!outputText || isLoading} className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Copy translation">
                                    <CopyIcon className="h-6 w-6" />
                                </button>
                                <button onClick={handlePlayAudio} disabled={!outputAudio || isLoading} className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Play translation audio">
                                    <SpeakerIcon className="h-6 w-6" />
                                </button>
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