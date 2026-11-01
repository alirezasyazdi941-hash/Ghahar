export interface AlternativeTranslation {
  label: string;
  translation: string;
  nuance?: string;
}

export interface VocabularyItem {
  word: string;
  partOfSpeech?: string;
  meaning: string;
  synonyms?: string[];
  antonyms?: string[];
  example?: string;
}

export interface TranslationData {
  primaryTranslation: string;
  detectedSourceLang: string;
  alternativeTranslations?: AlternativeTranslation[];
  reverseTranslation?: string;
  phonetic?: string;
  culturalNotes?: string;
  vocabularyBreakdown?: VocabularyItem[];
  eloquenceScore?: number;
}

export interface TranslationHistoryItem {
  id: string;
  timestamp: number;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  tone: string;
  isFavorite: boolean;
}

export interface TypographyStyle {
  id: string;
  name: string;
  nameFa: string;
  cssClass: string;
  sample: string;
  lang: 'en' | 'fa';
}

export interface ToneSetting {
  id: 'daily' | 'academic' | 'literary' | 'colloquial' | 'technical';
  name: string;
  nameFa: string;
  icon: string;
  description: string;
}
