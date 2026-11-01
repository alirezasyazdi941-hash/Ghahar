import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Middleware for parsing JSON requests
app.use(express.json({ limit: '10mb' }));

// Enable CORS for all origins and methods to prevent status 0 in browser
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

/**
 * Initialize Gemini API client on the server side
 */
const ai = new GoogleGenAI({
  apiKey: process.env['GEMINI_API_KEY'],
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Master Translation API Endpoint
 */
app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLang = 'auto', targetLang = 'fa', tone = 'daily', context = '' } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'متن برای ترجمه الزامی است.' });
    }

    const toneDescriptions: Record<string, string> = {
      academic: 'رسمی، دانشگاهی، وزین و اداری (Academic & Formal)',
      literary: 'ادبی، فاخر، پرمغز و با اصالت (Literary & Poetic)',
      colloquial: 'عامیانه، صمیمی، اصطلاحات روزمره و کوچه بازاری (Colloquial & Slang)',
      technical: 'تخصصی، دقیق، علمی و مهندسی (Technical & Scientific)',
      daily: 'روان، رسا، طبیعی و شیوا (Natural & Fluent Daily)',
    };

    const targetToneDesc = toneDescriptions[tone] || toneDescriptions['daily'];

    const prompt = `You are a world-class, master bilingual translator between English and Persian (مترجم قهار و استاد ادب و زبان).
Translate the following source text.
Source language instruction: ${sourceLang === 'auto' ? 'Detect automatically between English and Persian' : sourceLang}.
Target language: ${targetLang === 'fa' ? 'Persian (فارسی روان و اصیل)' : 'English'}.
Desired tone / register: ${targetToneDesc}.
Additional audience context: ${context ? context : 'Professional and engaging presentation / conversational context'}.

Source Text to translate:
"""
${text}
"""

Requirements:
1. Deliver a master-level primary translation that sounds completely natural to native speakers, preserving idioms, subtext, and emotional resonance.
2. Provide 2-3 distinct alternative translations (e.g. one more formal, one more poetic/concise, one conversational).
3. Provide a reverse translation back to the source language to confirm fidelity.
4. For difficult or noteworthy terms, provide phonetic guide (IPA or pronunciation) and a vocabulary breakdown (synonyms, antonyms, meaning, example sentence).
5. Give cultural / contextual notes explaining idioms, Persian cultural equivalents (ضرب‌المثل یا کنایه معادل), or linguistic nuances.
6. Calculate an eloquence score (85-100) representing verbal elegance and naturalness.`;

    const modelConfig = {
      systemInstruction: `You are the master translator and linguistic polymath specialized in Persian and English. You excel in classical literature, contemporary idioms, technical jargon, and natural speech. Always output valid JSON strictly conforming to the requested schema.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryTranslation: {
            type: Type.STRING,
            description: 'The primary, most accurate and fluent translation.',
          },
          detectedSourceLang: {
            type: Type.STRING,
            description: 'The detected source language: "en" or "fa".',
          },
          alternativeTranslations: {
            type: Type.ARRAY,
            description: 'Alternative translations with different nuances or tones.',
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: 'Label describing this variation (e.g. ادبی‌تر، عامیانه‌تر، موجز)' },
                translation: { type: Type.STRING, description: 'The alternate translation text.' },
                nuance: { type: Type.STRING, description: 'Brief explanation of when to use this variant.' },
              },
              required: ['label', 'translation'],
            },
          },
          reverseTranslation: {
            type: Type.STRING,
            description: 'Back-translation to the original source language for verification.',
          },
          phonetic: {
            type: Type.STRING,
            description: 'Phonetic transcription or pronunciation guide.',
          },
          culturalNotes: {
            type: Type.STRING,
            description: 'Cultural context, equivalent proverbs (ضرب‌المثل), or nuances in Persian/English.',
          },
          vocabularyBreakdown: {
            type: Type.ARRAY,
            description: 'Key vocabulary terms, idioms, or difficult words.',
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING, description: 'The word or phrase.' },
                partOfSpeech: { type: Type.STRING, description: 'Noun, verb, idiom, etc.' },
                meaning: { type: Type.STRING, description: 'Detailed definition in target language.' },
                synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                example: { type: Type.STRING, description: 'Exemplary sentence illustrating usage.' },
              },
              required: ['word', 'meaning'],
            },
          },
          eloquenceScore: {
            type: Type.INTEGER,
            description: 'A score from 85 to 100 for fluency and mastery.',
          },
        },
        required: ['primaryTranslation', 'detectedSourceLang'],
      },
    };

    // Try primary fast model, with fallback models
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let lastError: unknown = null;
    let responseText = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: modelConfig,
        });
        if (response && response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: unknown) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next candidate...`, (err as Error)?.message);
      }
    }

    if (!responseText) {
      throw lastError || new Error('پاسخی از مدل‌های هوش مصنوعی دریافت نشد.');
    }

    // Clean potential codeblock fences
    const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: unknown) {
    console.error('Translation API error:', error);
    const errorMsg = error instanceof Error ? error.message : 'خطا در ارتباط با موتور هوش مصنوعی مترجم. لطفا مجددا تلاش فرمایید.';
    return res.status(500).json({
      success: false,
      error: errorMsg,
    });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
