import { Language, Voice } from './types';

export const SUPPORTED_LANGUAGES: Language[] = [
  { name: 'Afrikaans', code: 'af' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Bengali', code: 'bn' },
  { name: 'Bulgarian', code: 'bg' },
  { name: 'Chinese (Simplified)', code: 'zh-CN' },
  { name: 'Chinese (Traditional)', code: 'zh-TW' },
  { name: 'Croatian', code: 'hr' },
  { name: 'Czech', code: 'cs' },
  { name: 'Danish', code: 'da' },
  { name: 'Dutch', code: 'nl' },
  { name: 'English', code: 'en' },
  { name: 'Estonian', code: 'et' },
  { name: 'Filipino', code: 'fil' },
  { name: 'Finnish', code: 'fi' },
  { name: 'French', code: 'fr' },
  { name: 'German', code: 'de' },
  { name: 'Greek', code: 'el' },
  { name: 'Hebrew', code: 'he' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Hungarian', code: 'hu' },
  { name: 'Indonesian', code: 'id' },
  { name: 'Italian', code: 'it' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Latvian', code: 'lv' },
  { name: 'Lithuanian', code: 'lt' },
  { name: 'Malay', code: 'ms' },
  { name: 'Norwegian', code: 'no' },
  { name: 'Polish', code: 'pl' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Romanian', code: 'ro' },
  { name: 'Russian', code: 'ru' },
  { name: 'Slovak', code: 'sk' },
  { name: 'Slovenian', code: 'sl' },
  { name: 'Spanish', code: 'es' },
  { name: 'Swahili', code: 'sw' },
  { name: 'Swedish', code: 'sv' },
  { name: 'Thai', code: 'th' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Ukrainian', code: 'uk' },
  { name: 'Vietnamese', code: 'vi' },
].sort((a, b) => a.name.localeCompare(b.name));

export const SUPPORTED_VOICES: Voice[] = [
    { name: 'Aura (Female)', code: 'Kore' },
    { name: 'Echo (Male)', code: 'Puck' },
    { name: 'Nova (Friendly Male)', code: 'Zephyr' },
    { name: 'Deepwave (Deep Male)', code: 'Charon' },
    { name: 'Storm (Energetic Male)', code: 'Fenrir' },
];

export const DEFAULT_VOICE = 'Kore';
export const DEFAULT_SOURCE_LANGUAGE = 'Bengali';
export const DEFAULT_TARGET_LANGUAGE = 'English';
