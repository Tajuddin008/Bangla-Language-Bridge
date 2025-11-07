import React, { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio, translateText, textToSpeech, getPhoneticTranscription } from './services/geminiService';
import { SUPPORTED_LANGUAGES, SUPPORTED_VOICES, DEFAULT_TARGET_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, DEFAULT_VOICE, FREE_TRANSLATION_LIMIT, PREMIUM_TRANSLATION_LIMIT } from './constants';
import { decode, pcmToWavBlob } from './utils';
import { MicrophoneIcon, StopIcon, SpeakerIcon, CopyIcon, ClearIcon, DownloadIcon } from './components/icons';
import PaymentModal from './components/PaymentModal';

export type SubscriptionPlan = 'FREE' | 'PREMIUM' | 'PRO';

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
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    
    // Freemium model state
    const [usageCount, setUsageCount] = useState(0);
    const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>('FREE');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioVisualizerRef = useRef<AnalyserNode | null>(null);
    const visualizerAnimationRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const currentAudioUrlRef = useRef<string | null>(null);
    
    // Initialize usage and subscription status from localStorage
    useEffect(() => {
        try {
            const storedUsage = localStorage.getItem('usageCount');
            const storedPlan = localStorage.getItem('subscriptionPlan') as SubscriptionPlan;
            if (storedUsage) {
                setUsageCount(parseInt(storedUsage, 10));
            }
            if (storedPlan && ['FREE', 'PREMIUM', 'PRO'].includes(storedPlan)) {
                setSubscriptionPlan(storedPlan);
            }
        } catch (e) {
            console.error("Could not access localStorage:", e);
        }
    }, []);

    const handleCoreAction = useCallback((action: () => void) => {
        if (subscriptionPlan === 'PRO') {
            action();
            return;
        }

        const limit = subscriptionPlan === 'PREMIUM' ? PREMIUM_TRANSLATION_LIMIT : FREE_TRANSLATION_LIMIT;
        
        if (usageCount < limit) {
            const newCount = usageCount + 1;
            setUsageCount(newCount);
            try {
               localStorage.setItem('usageCount', newCount.toString());
            } catch(e) {
                console.error("Could not write to localStorage:", e);
            }
            action();
        } else {
            setError(`You have reached your ${subscriptionPlan.toLowerCase()} plan's usage limit. Please upgrade to continue.`);
            setIsPaymentModalOpen(true);
        }
    }, [subscriptionPlan, usageCount]);


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
                handleCoreAction(() => handleTranslate(inputText, sourceLanguage, targetLanguage, selectedVoice));
            } else {
                 setOutputText('');
                 setOutputAudio(null);
                 setPhoneticText('');
            }
        }, 1000);

        return () => {
            clearTimeout(handler);
        };
    }, [inputText, sourceLanguage, targetLanguage, selectedVoice, handleTranslate, isRecording, handleCoreAction]);

    // Re-generate audio if the voice is changed
    useEffect(() => {
        if (outputText && outputAudio && (subscriptionPlan !== 'FREE' || !SUPPORTED_VOICES.find(v => v.code === selectedVoice)?.premium)) {
             handleGenerateAudio(outputText, targetLanguage, selectedVoice);
        }
    }, [selectedVoice, targetLanguage, outputText, handleGenerateAudio, subscriptionPlan]);


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

            const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            canvasCtx.fillStyle = isDarkMode ? '#374151' : '#FDFBF7'; // paper-dark or paper-light
            
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
        if (subscriptionPlan === 'FREE') {
            setError('Please upgrade to the Premium or Pro plan to download audio.');
            setIsPaymentModalOpen(true);
            return;
        }
        handleCoreAction(() => {
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
        });
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

    const handlePurchaseSuccess = (plan: SubscriptionPlan) => {
        setSubscriptionPlan(plan);
        setUsageCount(0); // Reset usage on upgrade
        try {
            localStorage.setItem('subscriptionPlan', plan);
            localStorage.setItem('usageCount', '0');
        } catch (e) {
            console.error("Could not write to localStorage:", e);
        }
        setIsPaymentModalOpen(false);
    };
    
    const renderFooter = () => {
        if (subscriptionPlan === 'PRO') {
            return <p className="font-semibold text-green-400">You are on the Pro Plan ✨</p>;
        }

        const limit = subscriptionPlan === 'PREMIUM' ? PREMIUM_TRANSLATION_LIMIT : FREE_TRANSLATION_LIMIT;
        const remainingUses = limit - usageCount;
        const hasUsesLeft = remainingUses > 0;

        return (
            <div className="flex flex-col items-center gap-2">
                 <p>
                    You have <span className="font-bold text-amber-200">{hasUsesLeft ? remainingUses : 0}</span> translation{remainingUses !== 1 ? 's' : ''} left on the <span className="font-semibold">{subscriptionPlan}</span> plan.
                </p>
                <button 
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="bg-amber-800/80 hover:bg-amber-800 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 ease-in-out"
                >
                    {subscriptionPlan === 'FREE' ? 'Upgrade Plan' : 'Upgrade to Pro'}
                </button>
            </div>
        );
    };


    return (
        <div className="min-h-screen text-gray-800 dark:text-gray-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <header className="text-center mb-6">
                <h1 className="text-4xl sm:text-5xl font-serif font-bold text-amber-50">
                    Global Language Bridge
                </h1>
                <p className="mt-2 text-lg text-amber-50/70">
                    Speak or type in any language for instant, effortless translations.
                </p>
            </header>
            
            {error && (
                <div className="w-full max-w-6xl mb-4 bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md shadow-md" role="alert">
                    <p className="font-bold">An error occurred</p>
                    <p>{error}</p>
                </div>
            )}

            <main className="w-full max-w-6xl flex-grow shadow-2xl rounded-2xl grid grid-cols-1 md:grid-cols-[1fr_20px_1fr] gap-y-4 md:gap-y-0 md:gap-x-0">
                {/* Left Page */}
                <div className="bg-paper-light dark:bg-paper-dark rounded-2xl md:rounded-l-2xl md:rounded-r-none flex flex-col text-gray-800 dark:text-gray-200">
                    <div className="p-4 sm:p-6 border-b border-black/10 dark:border-white/10 flex flex-wrap justify-between items-center gap-4">
                         <div className="flex items-center gap-2">
                            <label htmlFor="source-language-select" className="text-sm font-medium shrink-0">Language:</label>
                            <select
                                id="source-language-select"
                                value={sourceLanguage}
                                onChange={(e) => setSourceLanguage(e.target.value)}
                                className="bg-transparent border border-black/20 dark:border-white/20 text-sm rounded-lg focus:ring-amber-700 focus:border-amber-700 block w-full p-2 disabled:opacity-50"
                                disabled={isRecording || isPlayingAudio}
                            >
                                {SUPPORTED_LANGUAGES.map(lang => (
                                    <option className="bg-paper-light dark:bg-paper-dark" key={lang.code} value={lang.name}>{lang.name}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={isRecording ? handleStopRecording : handleStartRecording}
                            className={`p-3 rounded-full transition-all duration-300 ease-in-out ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20'}`}
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
                            className="w-full h-full min-h-[200px] bg-transparent border-none focus:ring-0 resize-none text-lg p-2 rounded-md"
                            disabled={isRecording}
                        />
                        {isRecording && <canvas ref={canvasRef} className="w-full h-full absolute inset-0 opacity-80" width="500" height="200"></canvas>}
                    </div>
                </div>

                {/* Spine */}
                <div className="hidden md:block bg-gradient-to-r from-black/20 via-black/40 to-black/20 dark:from-black/30 dark:via-black/60 dark:to-black/30"></div>

                {/* Right Page */}
                 <div className="bg-paper-light dark:bg-paper-dark rounded-2xl md:rounded-r-2xl md:rounded-l-none flex flex-col text-gray-800 dark:text-gray-200">
                    <div className="p-4 sm:p-6 border-b border-black/10 dark:border-white/10 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                             <div className="flex items-center gap-2">
                               <label htmlFor="language-select" className="text-sm font-medium shrink-0">Translate to:</label>
                               <select
                                   id="language-select"
                                   value={targetLanguage}
                                   onChange={(e) => setTargetLanguage(e.target.value)}
                                   className="bg-transparent border border-black/20 dark:border-white/20 text-sm rounded-lg focus:ring-amber-700 focus:border-amber-700 block w-full p-2 disabled:opacity-50"
                                   disabled={isPlayingAudio || isRecording}
                               >
                                   {SUPPORTED_LANGUAGES.map(lang => (
                                       <option className="bg-paper-light dark:bg-paper-dark" key={lang.code} value={lang.name}>{lang.name}</option>
                                   ))}
                               </select>
                             </div>
                             <div className="flex items-center gap-2">
                                <label htmlFor="voice-select" className="text-sm font-medium shrink-0">Voice:</label>
                                <select
                                    id="voice-select"
                                    value={selectedVoice}
                                    onChange={(e) => setSelectedVoice(e.target.value)}
                                    className="bg-transparent border border-black/20 dark:border-white/20 text-sm rounded-lg focus:ring-amber-700 focus:border-amber-700 block w-full p-2 disabled:opacity-50"
                                    disabled={!outputAudio || isPlayingAudio || isRecording || isLoading}
                                >
                                    {SUPPORTED_VOICES.map(voice => {
                                        const isDisabled = voice.premium && subscriptionPlan === 'FREE';
                                        return (
                                          <option className="bg-paper-light dark:bg-paper-dark" key={voice.code} value={voice.code} disabled={isDisabled}>
                                              {voice.name} {voice.premium && '(Premium)'}
                                          </option>
                                        )
                                    })}
                                </select>
                             </div>
                        </div>
                         <div className="flex flex-wrap justify-end items-center gap-x-4 gap-y-2">
                            <button onClick={handleDownloadAudio} disabled={!outputAudio || isLoading || isPlayingAudio} className="p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Download translation audio">
                                <DownloadIcon className="h-6 w-6" />
                            </button>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm text-green-600 dark:text-green-400 transition-opacity duration-300 ${isCopied ? 'opacity-100' : 'opacity-0'}`}>Copied!</span>
                                <button onClick={handleCopy} disabled={!outputText || isLoading || isPlayingAudio} className="p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Copy translation">
                                    <CopyIcon className="h-6 w-6" />
                                </button>
                            </div>
                         </div>
                    </div>
                    <div className="p-4 sm:p-6 flex-grow relative overflow-y-auto">
                        <div className="absolute top-4 right-4 flex items-center gap-2">
                            <button onClick={handlePlayAudio} disabled={!outputAudio || isLoading || isPlayingAudio} className="p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Play translation audio">
                                <SpeakerIcon className={`h-6 w-6 transition-colors ${isPlayingAudio ? 'text-amber-700 dark:text-amber-500' : ''}`} />
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
                                <span className="text-sm font-mono w-10 text-center">{playbackRate.toFixed(1)}x</span>
                            </div>
                        </div>

                        {isLoading && (
                            <div className="absolute inset-0 bg-paper-light/80 dark:bg-paper-dark/80 flex flex-col items-center justify-center rounded-b-2xl z-10">
                                <div className="w-12 h-12 border-4 border-amber-700 border-t-transparent rounded-full animate-spin"></div>
                                <p className="mt-4 text-lg font-medium">{loadingMessage}</p>
                            </div>
                        )}
                        <div className="w-full min-h-[200px] text-lg p-2 whitespace-pre-wrap space-y-4 pt-16">
                            {outputText ? (
                                <>
                                    <p>{outputText}</p>
                                    {phoneticText && (
                                        <div className="pt-2 border-t border-black/10 dark:border-white/10">
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
            </main>
             <footer className="text-center mt-6 text-amber-50/70">
                {renderFooter()}
            </footer>
            <PaymentModal 
                isOpen={isPaymentModalOpen} 
                onClose={() => setIsPaymentModalOpen(false)} 
                onPurchaseSuccess={handlePurchaseSuccess}
                currentPlan={subscriptionPlan}
            />
        </div>
    );
};

export default App;