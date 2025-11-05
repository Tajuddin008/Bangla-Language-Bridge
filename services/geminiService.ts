import { GoogleGenAI, Modality } from '@google/genai';
import { blobToBase64 } from '../utils';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  // In a real app, you'd want to handle this more gracefully,
  // maybe showing a message to the user.
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Transcribes audio using a multimodal Gemini model.
 * @param audioBlob The audio data as a Blob.
 * @returns A promise that resolves to the transcribed text.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    const audioBase64 = await blobToBase64(audioBlob);
    const audioPart = {
      inlineData: {
        mimeType: audioBlob.type || 'audio/webm',
        data: audioBase64,
      },
    };
    const textPart = {
      text: "Transcribe this Bengali audio recording accurately. Provide only the transcribed text.",
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [audioPart, textPart] },
    });

    return response.text.trim();
};

/**
 * Translates text from Bengali to a target language.
 * @param text The Bengali text to translate.
 * @param targetLanguage The language to translate into.
 * @returns A promise that resolves to the translated text.
 */
export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
    const prompt = `You are an expert translator. Translate the following Bengali text to ${targetLanguage}. Provide only the translation, without any additional explanations, labels, or pleasantries.\n\nBengali text: "${text}"`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    return response.text.trim();
};

/**
 * Generates a phonetic pronunciation guide for text.
 * @param text The text to get pronunciation for.
 * @param language The language of the text.
 * @returns A promise that resolves to the phonetic guide.
 */
export const getPhoneticTranscription = async (text: string, language: string): Promise<string> => {
    const prompt = `You are a linguistic expert. Provide a simple, user-friendly phonetic pronunciation guide for the following ${language} text. Use common English letters and syllable breaks to represent the sounds. For example, for the Spanish 'hola', you could provide 'oh-lah'. Do not add any extra explanation, just the phonetic guide.\n\nText: "${text}"`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text.trim();
};


/**
 * Converts text to speech using the Gemini TTS model.
 * @param text The text to convert to audio.
 * @returns A promise that resolves to a base64 encoded audio string (raw PCM data).
 */
export const textToSpeech = async (text: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' }, // A generic, clear voice
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("Failed to generate audio from text.");
    }
    return base64Audio;
};