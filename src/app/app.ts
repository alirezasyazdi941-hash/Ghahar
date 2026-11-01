import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslationEngine } from './services/translation';
import { ToneSetting } from './models/translator.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly engine = inject(TranslationEngine);

  // Form Controls
  readonly sourceTextControl = new FormControl<string>('', { nonNullable: true });
  readonly historySearchControl = new FormControl<string>('', { nonNullable: true });

  // State Signals
  readonly sourceLang = signal<'en' | 'fa'>('en');
  readonly targetLang = signal<'fa' | 'en'>('fa');
  readonly selectedTone = signal<ToneSetting['id']>('daily');
  readonly meetingContext = signal<string>('');

  // Typography selection signals
  readonly selectedEnTypography = signal<string>('en-sans');
  readonly selectedFaTypography = signal<string>('fa-nastaliq');
  readonly fontSizeLevel = signal<number>(18); // Base font size in px

  // UI Modals & Views
  readonly activeTab = signal<'translation' | 'vocabulary' | 'cultural' | 'alternatives'>('translation');
  readonly isGatheringMode = signal<boolean>(false); // "حالت محفل و کنفرانس"
  readonly showHistoryModal = signal<boolean>(false);
  readonly showPromptModal = signal<boolean>(false);
  readonly showAudioSettings = signal<boolean>(false);
  readonly toastMessage = signal<string | null>(null);

  // Audio settings
  readonly speechRate = signal<number>(1.0);
  readonly speechPitch = signal<number>(1.0);

  // Preset inspirational phrases for quick testing
  readonly quickPresets = [
    {
      title: 'ادبی & استعاری',
      text: 'To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.',
      tone: 'literary' as const,
    },
    {
      title: 'اصطلاح کوچه بازاری',
      text: "Stop beating around the bush and bite the bullet! Don't throw me under the bus.",
      tone: 'colloquial' as const,
    },
    {
      title: 'دانشگاهی و رسمی',
      text: 'The empirical evidence corroborates the paradigm shift in artificial intelligence paradigms.',
      tone: 'academic' as const,
    },
    {
      title: 'تخصصی مهندسی',
      text: 'Asynchronous streaming pipelines minimize latency and eliminate blocking thread pool contention.',
      tone: 'technical' as const,
    },
  ];

  // Computed Values
  readonly activeSourceTypography = computed(() => {
    if (this.sourceLang() === 'en') {
      return (
        this.engine.englishTypographies.find((t) => t.id === this.selectedEnTypography()) ||
        this.engine.englishTypographies[0]
      );
    } else {
      return (
        this.engine.persianTypographies.find((t) => t.id === this.selectedFaTypography()) ||
        this.engine.persianTypographies[0]
      );
    }
  });

  readonly activeTargetTypography = computed(() => {
    if (this.targetLang() === 'fa') {
      return (
        this.engine.persianTypographies.find((t) => t.id === this.selectedFaTypography()) ||
        this.engine.persianTypographies[0]
      );
    } else {
      return (
        this.engine.englishTypographies.find((t) => t.id === this.selectedEnTypography()) ||
        this.engine.englishTypographies[0]
      );
    }
  });

  readonly filteredHistory = computed(() => {
    const search = this.historySearchControl.value.toLowerCase().trim();
    const list = this.engine.history();
    if (!search) return list;
    return list.filter(
      (item) =>
        item.sourceText.toLowerCase().includes(search) ||
        item.translatedText.toLowerCase().includes(search)
    );
  });

  readonly favoriteHistory = computed(() => {
    return this.engine.history().filter((item) => item.isFavorite);
  });

  ngOnInit(): void {
    // Set a rich initial demo phrase
    this.sourceTextControl.setValue(
      'Knowledge is a treasure, but practice is the key to it. Eloquence in speech opens doors that brute force can never budge.'
    );
  }

  // Execution
  async executeTranslation(): Promise<void> {
    const text = this.sourceTextControl.value.trim();
    if (!text) {
      this.showToast('لطفاً متنی برای ترجمه وارد نمایید.');
      return;
    }

    await this.engine.translate({
      text,
      sourceLang: this.sourceLang(),
      targetLang: this.targetLang(),
      tone: this.selectedTone(),
      context: this.meetingContext(),
    });
  }

  // Swap Languages
  swapLanguages(): void {
    const currentSource = this.sourceLang();
    const currentTarget = this.targetLang();
    const currentResult = this.engine.currentResult();

    this.sourceLang.set(currentTarget);
    this.targetLang.set(currentSource);

    if (currentResult && currentResult.primaryTranslation) {
      this.sourceTextControl.setValue(currentResult.primaryTranslation);
      this.engine.currentResult.set(null);
    }
  }

  // Load Preset
  loadPreset(preset: { text: string; tone: ToneSetting['id'] }): void {
    this.sourceLang.set('en');
    this.targetLang.set('fa');
    this.selectedTone.set(preset.tone);
    this.sourceTextControl.setValue(preset.text);
    this.executeTranslation();
  }

  // Voice Input Toggle
  toggleVoiceInput(): void {
    if (this.engine.isRecording()) {
      this.engine.stopSpeechRecognition();
    } else {
      const lang = this.sourceLang();
      const started = this.engine.startSpeechRecognition(lang, (transcript) => {
        const current = this.sourceTextControl.value;
        const separator = current && !current.endsWith(' ') ? ' ' : '';
        this.sourceTextControl.setValue(current + separator + transcript);
      });
      if (!started) {
        this.showToast('دسترسی به میکروفن یا پشتیبانی مرورگر مقدور نشد.');
      }
    }
  }

  // Speech Output
  speakSource(): void {
    const text = this.sourceTextControl.value;
    if (!text.trim()) return;
    this.engine.speakText(text, this.sourceLang(), this.speechRate(), this.speechPitch());
  }

  speakTranslation(): void {
    const result = this.engine.currentResult();
    if (!result?.primaryTranslation) return;
    this.engine.speakText(
      result.primaryTranslation,
      this.targetLang(),
      this.speechRate(),
      this.speechPitch()
    );
  }

  // Typography Adjustments
  adjustFontSize(delta: number): void {
    const next = Math.max(14, Math.min(36, this.fontSizeLevel() + delta));
    this.fontSizeLevel.set(next);
  }

  resetFontSize(): void {
    this.fontSizeLevel.set(18);
  }

  // Clipboard & Toast
  async copyToClipboard(text: string, label = 'متن'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(`${label} با موفقیت کپی شد ✨`);
    } catch {
      this.showToast('خطا در کپی متن به حافظه');
    }
  }

  showToast(message: string): void {
    this.toastMessage.set(message);
    setTimeout(() => {
      if (this.toastMessage() === message) {
        this.toastMessage.set(null);
      }
    }, 3200);
  }

  // File Upload Handling (.txt, .md)
  onFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        this.sourceTextControl.setValue(content);
        this.showToast(`فایل "${file.name}" با موفقیت خوانده شد 📄`);
      }
    };

    reader.onerror = () => {
      this.showToast('خطا در بارگذاری فایل');
    };

    reader.readAsText(file);
    input.value = '';
  }

  // Export current translation
  exportTranslation(format: 'json' | 'txt' | 'md'): void {
    const result = this.engine.currentResult();
    const source = this.sourceTextControl.value;
    if (!result || !result.primaryTranslation) {
      this.showToast('ترجمه‌ای برای خروجی وجود ندارد.');
      return;
    }

    let content = '';
    let mimeType = 'text/plain';
    const filename = `translation-${Date.now()}.${format}`;

    if (format === 'json') {
      content = JSON.stringify(
        {
          sourceLanguage: this.sourceLang(),
          targetLanguage: this.targetLang(),
          tone: this.selectedTone(),
          sourceText: source,
          ...result,
        },
        null,
        2
      );
      mimeType = 'application/json';
    } else if (format === 'md') {
      content = `# ترجمان هوشمند قهار | Master Bilingual Translation\n\n` +
        `**تاریخ:** ${new Date().toLocaleString('fa-IR')}\n` +
        `**لحن:** ${this.selectedTone()}\n\n` +
        `### متن مبدأ (${this.sourceLang()}):\n> ${source}\n\n` +
        `### ترجمه شاهکار (${this.targetLang()}):\n${result.primaryTranslation}\n\n`;

      if (result.reverseTranslation) {
        content += `### ترجمه معکوس (اعتبارسنجی):\n${result.reverseTranslation}\n\n`;
      }
      if (result.culturalNotes) {
        content += `### نکات فرهنگی و اصطلاحات:\n${result.culturalNotes}\n\n`;
      }
      if (result.vocabularyBreakdown && result.vocabularyBreakdown.length > 0) {
        content += `### واژه‌نامه تخصصی:\n`;
        result.vocabularyBreakdown.forEach((v) => {
          content += `- **${v.word}** (${v.partOfSpeech || 'واژه'}): ${v.meaning}\n`;
        });
      }
    } else {
      content = `متن مبدأ:\n${source}\n\n-----------------\nترجمه فارسی:\n${result.primaryTranslation}`;
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast(`فایل با پسوند .${format} دانلود شد 📥`);
  }

  // Clear Source Text
  clearSourceText(): void {
    this.sourceTextControl.setValue('');
    this.engine.currentResult.set(null);
  }

  // Master Prompt for Google AI Studio
  readonly masterPromptPersian = `نقش: تو یک «مترجم قهار، ادیب دوزبانه و سخن‌شناس هوشمند انگلیسی و فارسی» هستی که به تمامی دقایق، ظرایف و ریزه‌کاری‌های زبان و ادبیات فارسی (از تعابیر فاخر و کهن تا اصطلاحات داغ کوچه و بازار، استعارات، کنایات و ضرب‌المثل‌های معادل) و زبان انگلیسی تسلط کامل داری.

مأموریت تو:
۱. ترجمه معنادار، عمیق و طبیعی بدون هیچ‌گونه بوی ترجمه مکانیکی.
۲. انطباق دقیق با لحن انتخابی (رسمی و آکادمیک / ادبی و فاخر / عامیانه و تکیه‌کلام‌های روز / فنی و علمی / روان روزمره).
۳. ارائه ترجمه معکوس (Reverse Translation) جهت اطمینان از عدم تحریف معنا.
۴. ارائه تحلیل واژگان (مترادف، متضاد، نقش دستوری و جمله نمونه کاربردی).
۵. استخراج ضرب‌المثل‌ها و بار فرهنگی عبارات (Cultural Equivalence).
۶. ارائه حداقل ۲ الی ۳ گزینه جایگزین با تفاوت‌های ساختاری و بیانی.

فرمت خروجی مورد نیاز: فرمت ساخت‌یافته JSON همراه با کلیدهای primaryTranslation, alternativeTranslations, reverseTranslation, culturalNotes, vocabularyBreakdown.`;

  readonly masterPromptEnglish = `Role: You are a World-Class Bilingual Master Translator and Literary Polymath specializing in English <-> Persian translation.
Core Directives:
1. Deliver translations that resonate naturally with native Persian speakers, completely eliminating robotic phrasing.
2. Adapt seamlessly across 5 registers: Academic/Formal, Poetic/Literary, Colloquial/Slang, Technical/Scientific, and Fluent Daily.
3. Provide rigorous back-translation (Reverse Translation) to verify semantic fidelity.
4. Extract idiomatic expressions, cultural proverbs, and provide comprehensive vocabulary breakdowns (synonyms, antonyms, parts of speech, usage examples).
5. Output structured, robust JSON responses for production integration.`;
}
