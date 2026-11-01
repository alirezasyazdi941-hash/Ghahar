import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import {
  TranslationData,
  TranslationHistoryItem,
  ToneSetting,
  TypographyStyle,
} from '../models/translator.model';

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    readonly length: number;
  } & Record<number, Record<number, SpeechRecognitionResultItem>>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

@Injectable({
  providedIn: 'root',
})
export class TranslationEngine {
  private readonly http = inject(HttpClient);

  // Signals
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly currentResult = signal<TranslationData | null>(null);
  readonly history = signal<TranslationHistoryItem[]>([]);
  readonly isRecording = signal<boolean>(false);
  readonly speechStatus = signal<string>('');
  readonly isSpeaking = signal<boolean>(false);

  // 5 Distinct Typography Options for English
  readonly englishTypographies: TypographyStyle[] = [
    {
      id: 'en-sans',
      name: 'Inter Sans-Serif',
      nameFa: 'سنس‌سریف مینیمال',
      cssClass: 'font-en-sans',
      sample: 'The quick brown fox jumps over the lazy dog',
      lang: 'en',
    },
    {
      id: 'en-bold',
      name: 'Syne Ultra Bold',
      nameFa: 'بولد سنگین نمایشی',
      cssClass: 'font-en-bold',
      sample: 'Mastering the Art of Nuanced Expression',
      lang: 'en',
    },
    {
      id: 'en-script',
      name: 'Zaria Script & Serif',
      nameFa: 'پیچ‌وتاب هنری و کالیگرافی',
      cssClass: 'font-en-script',
      sample: 'Poetry in bilingual eloquence & refined cadence',
      lang: 'en',
    },
    {
      id: 'en-mono',
      name: 'JetBrains Cyber Mono',
      nameFa: 'تک‌فاصله سایبری و مهندسی',
      cssClass: 'font-en-mono',
      sample: 'syntax.translate(stream, mode="fluid")',
      lang: 'en',
    },
    {
      id: 'en-display',
      name: 'Space Grotesk Modern',
      nameFa: 'نئوگروتسک معاصر',
      cssClass: 'font-en-display',
      sample: 'Architecting cross-cultural dialogue seamlessly',
      lang: 'en',
    },
  ];

  // 5 Distinct Typography Options for Persian
  readonly persianTypographies: TypographyStyle[] = [
    {
      id: 'fa-nastaliq',
      name: 'Nastaliq Calligraphy',
      nameFa: 'نستعلیق فاخر و عروس خطوط',
      cssClass: 'font-fa-nastaliq text-2xl',
      sample: 'ای نام تو بهترین سرآغاز، بی‌نام تو نامه کی کنم باز',
      lang: 'fa',
    },
    {
      id: 'fa-kufi',
      name: 'Modern Kufic',
      nameFa: 'کوفی اصیل و ساختاریافته',
      cssClass: 'font-fa-kufi',
      sample: 'ترجمان دانایی در افق‌های بی‌کران معنا',
      lang: 'fa',
    },
    {
      id: 'fa-minimal',
      name: 'Vazirmatn Minimal',
      nameFa: 'مینیمال فوق‌العاده مدرن (وزیر)',
      cssClass: 'font-fa-minimal',
      sample: 'طراحی شده برای بیشترین خوانایی در متن‌های بلند',
      lang: 'fa',
    },
    {
      id: 'fa-geometric',
      name: 'Geometric Display',
      nameFa: 'هندسی و تیتر جذاب (لاله‌زار)',
      cssClass: 'font-fa-geometric',
      sample: 'نوآوری در بازآفرینی کلمات با هوش مصنوعی',
      lang: 'fa',
    },
    {
      id: 'fa-naskh',
      name: 'Amiri Naskh Classic',
      nameFa: 'نسخ کتبی و دانشگاهی (امیری)',
      cssClass: 'font-fa-naskh text-lg',
      sample: 'فصاحت کلام و روانی تعابیر در محافل رسمی',
      lang: 'fa',
    },
  ];

  // Nuanced Tones for Persian eloquence
  readonly tones: ToneSetting[] = [
    {
      id: 'daily',
      name: 'Fluent Daily',
      nameFa: 'روان و طبیعی روزمره',
      icon: 'chat',
      description: 'مناسب برای مکالمات، ایمیل‌ها و محتوای روان عمومی',
    },
    {
      id: 'academic',
      name: 'Academic & Formal',
      nameFa: 'رسمی، دانشگاهی و اداری',
      icon: 'school',
      description: 'لحن وزین، دایره واژگان غنی اداری و متون مقالات',
    },
    {
      id: 'literary',
      name: 'Literary & Nuanced',
      nameFa: 'ادبی، فاخر و شاعرانه',
      icon: 'auto_stories',
      description: 'آهنگین، استفاده از اصطلاحات اصیل و تشبیهات زیبای فارسی',
    },
    {
      id: 'colloquial',
      name: 'Slang & Street',
      nameFa: 'عامیانه و کوچه بازاری',
      icon: 'forum',
      description: 'معادل‌سازی اصطلاحات خیابانی، متلک‌ها و تکیه‌کلام‌های روز',
    },
    {
      id: 'technical',
      name: 'Technical & Engineering',
      nameFa: 'تخصصی، فنی و مهندسی',
      icon: 'terminal',
      description: 'دقت میلی‌متری در واژگان علوم، نرم‌افزار، پزشکی و صنعت',
    },
  ];

  private recognition: SpeechRecognitionInstance | null = null;

  constructor() {
    this.loadHistory();
  }

  async translate(params: {
    text: string;
    sourceLang: string;
    targetLang: string;
    tone: string;
    context?: string;
  }): Promise<TranslationData | null> {
    if (!params.text.trim()) {
      return null;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await firstValueFrom(
        this.http
          .post<{ success: boolean; data: TranslationData; error?: string }>(
            '/api/translate',
            params
          )
          .pipe(timeout(25000))
      );

      if (response && response.success && response.data) {
        this.currentResult.set(response.data);
        this.addToHistory(
          params.text,
          response.data.primaryTranslation,
          params.sourceLang,
          params.targetLang,
          params.tone
        );
        return response.data;
      } else {
        throw new Error(response.error || 'خطا در دریافت پاسخ ترجمه');
      }
    } catch (err: unknown) {
      console.error('Translation error:', err);
      const httpErr = err as { status?: number; error?: { error?: string }; message?: string };
      let msg = 'خطا در پردازش هوشمند ترجمه. لطفاً مجدداً امتحان نمایید.';

      if (httpErr?.status === 0) {
        msg = 'عدم برقراری ارتباط با سرور. لطفاً اتصال شبکه را بررسی کرده و مجدداً تلاش فرمایید.';
      } else if (httpErr?.error?.error) {
        msg = httpErr.error.error;
      } else if (httpErr?.message && !httpErr.message.includes('Http failure')) {
        msg = httpErr.message;
      }

      this.errorMessage.set(msg);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  // Speech Recognition (Voice Input)
  startSpeechRecognition(lang: 'en' | 'fa', onResult: (text: string) => void): boolean {
    if (typeof window === 'undefined') return false;

    const win = window as WindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      this.speechStatus.set('مرورگر شما از ورودی صوتی پشتیبانی نمی‌کند.');
      return false;
    }

    try {
      if (this.recognition) {
        this.recognition.stop();
      }

      this.recognition = new SpeechRecognitionClass();
      this.recognition.lang = lang === 'en' ? 'en-US' : 'fa-IR';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isRecording.set(true);
        this.speechStatus.set('در حال شنیدن صدای شما... سخن بگویید');
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          onResult(transcript);
        }
      };

      this.recognition.onerror = (event: { error: string }) => {
        console.warn('Speech recognition error:', event.error);
        this.isRecording.set(false);
        this.speechStatus.set(`خطا در ضبط صدا: ${event.error}`);
      };

      this.recognition.onend = () => {
        this.isRecording.set(false);
        this.speechStatus.set('');
      };

      this.recognition.start();
      return true;
    } catch (err) {
      console.error('Voice recognition start error:', err);
      this.isRecording.set(false);
      return false;
    }
  }

  stopSpeechRecognition(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.isRecording.set(false);
      this.speechStatus.set('');
    }
  }

  // Speech Synthesis (Text-to-Speech)
  speakText(text: string, lang: 'en' | 'fa', rate = 1.0, pitch = 1.0): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    if (!text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'en' ? 'en-US' : 'fa-IR';
    utterance.rate = rate;
    utterance.pitch = pitch;

    // Pick best voice if available
    const voices = window.speechSynthesis.getVoices();
    if (lang === 'en') {
      const enVoice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google'))
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    } else {
      const faVoice = voices.find((v) => v.lang.startsWith('fa') || v.lang.startsWith('ar'));
      if (faVoice) utterance.voice = faVoice;
    }

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }

  // History & Bookmarks Management
  private addToHistory(
    sourceText: string,
    translatedText: string,
    sourceLang: string,
    targetLang: string,
    tone: string
  ): void {
    const newItem: TranslationHistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      sourceText,
      translatedText,
      sourceLang,
      targetLang,
      tone,
      isFavorite: false,
    };

    const updated = [newItem, ...this.history().slice(0, 49)];
    this.history.set(updated);
    this.saveHistory();
  }

  toggleFavorite(id: string): void {
    const updated = this.history().map((item) =>
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    );
    this.history.set(updated);
    this.saveHistory();
  }

  deleteHistoryItem(id: string): void {
    const updated = this.history().filter((item) => item.id !== id);
    this.history.set(updated);
    this.saveHistory();
  }

  clearHistory(): void {
    this.history.set([]);
    this.saveHistory();
  }

  private loadHistory(): void {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('master_translator_history');
      if (saved) {
        this.history.set(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load translation history:', e);
    }
  }

  private saveHistory(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('master_translator_history', JSON.stringify(this.history()));
    } catch (e) {
      console.warn('Failed to save translation history:', e);
    }
  }
}
