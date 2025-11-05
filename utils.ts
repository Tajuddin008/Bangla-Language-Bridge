import * as lamejs from 'lamejs';

// Base64 encoding for browser
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // remove the data URL prefix e.g. "data:audio/webm;base64,"
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Base64 decoding for audio playback
export const decode = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Decode raw PCM audio data into an AudioBuffer
export const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// Helper for pcmToWavBlob to write strings into the ArrayBuffer.
const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

/**
 * Converts raw PCM audio data into a WAV file Blob, which can be played by an <audio> element.
 * This allows for features like pitch-preserved playback speed changes.
 * @param pcmData The raw PCM data (as a Uint8Array).
 * @param sampleRate The sample rate of the audio (e.g., 24000).
 * @param numChannels The number of audio channels (e.g., 1 for mono).
 * @param bitsPerSample The number of bits per sample (e.g., 16).
 * @returns A Blob representing the WAV file.
 */
export const pcmToWavBlob = (pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Blob => {
    const dataSize = pcmData.byteLength;
    // The WAV header is 44 bytes.
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const blockAlign = numChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // (file size - 8)
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write PCM data
    const pcmBytes = new Uint8Array(pcmData.buffer);
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(44 + i, pcmBytes[i]);
    }

    return new Blob([view], { type: 'audio/wav' });
};

/**
 * Encodes raw PCM audio data into an MP3 file Blob using lamejs.
 * @param pcmData The raw PCM data (as a Uint8Array, expected to be 16-bit).
 * @param sampleRate The sample rate of the audio (e.g., 24000).
 * @param numChannels The number of audio channels (e.g., 1 for mono).
 * @returns A Blob representing the MP3 file.
 */
export const pcmToMp3Blob = (pcmData: Uint8Array, sampleRate: number, numChannels: number): Blob => {
    const dataInt16 = new Int16Array(pcmData.buffer);
    
    const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128 kbps bitrate
    const mp3Data: Int8Array[] = [];

    const sampleBlockSize = 1152; // Fixed block size for MP3 encoding
    for (let i = 0; i < dataInt16.length; i += sampleBlockSize) {
        const sampleChunk = dataInt16.subarray(i, i + sampleBlockSize);
        const mp3buf = encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    const mp3buf = encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
};