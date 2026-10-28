import { useSyncExternalStore } from 'react';

/*
 * Gemini does the two things plain code can't: reads any product screenshot (name, price,
 * category, a line of description) and draws a clean, unbranded 3D render of the product on
 * white, which then cuts out instantly. The key is the user's own, kept on this device only:
 * it never goes into the synced data. Google serves the API only in supported countries.
 */

const KEY = 'gemini_key_v1';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

interface Model {
  name: string;
  /** Generation settings only this model understands. */
  config?: object;
}
/** Tried in order: model names move between releases. */
const TEXT_MODELS: Model[] = [
  // Thinking off: reading a price off a screenshot needs no deliberation, and it costs 10–30 s.
  { name: 'gemini-2.5-flash', config: { thinkingConfig: { thinkingBudget: 0 } } },
  { name: 'gemini-flash-latest' },
];
const IMAGE_MODELS: Model[] = [{ name: 'gemini-2.5-flash-image' }, { name: 'gemini-3.1-flash-image-preview' }];
/** A stalled VPN must end in a message, not an endless spinner. */
const READ_TIMEOUT = 45_000;
const DRAW_TIMEOUT = 100_000;
const CHECK_TIMEOUT = 20_000;

const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export function setGeminiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the key lives for this visit only */
  }
  listeners.forEach((l) => l());
}
export const useGeminiKey = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
  );
export const geminiKey = read;

export class AiError extends Error {}

/** Google's error → a sentence for the user. */
export function explain(status: number, message: string): string {
  if (/location is not supported|not available in your country|region/i.test(message)) return 'Gemini не работает из вашей страны — включите VPN и попробуйте ещё раз';
  if (status === 400 && /api key/i.test(message)) return 'Ключ Gemini не подошёл — проверьте его в профиле';
  if (status === 403) return 'Ключ Gemini не подошёл или у него нет доступа';
  if (status === 429) return 'Лимит Gemini на сегодня исчерпан — попробуйте позже';
  if (status >= 500) return 'Gemini сейчас не отвечает — попробуйте через минуту';
  return 'Не получилось обратиться к Gemini';
}

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface Request {
  contents: object[];
  generationConfig?: object;
}

async function generate(models: Model[], body: Request, key: string, timeout: number, signal?: AbortSignal): Promise<Part[]> {
  let last = new AiError('Не получилось обратиться к Gemini');
  for (const model of models) {
    const stop = new AbortController();
    let late = false;
    const timer = setTimeout(() => ((late = true), stop.abort()), timeout);
    const abort = () => stop.abort();
    signal?.addEventListener('abort', abort);
    let res: Response;
    let json: { candidates?: { content?: { parts?: Part[] } }[]; error?: { message?: string } };
    try {
      res = await fetch(`${API}/${model.name}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, ...model.config } }),
        signal: stop.signal,
      });
      json = await res.json().catch(() => ({}));
    } catch {
      if (late) throw new AiError('Gemini долго не отвечает — проверьте VPN и попробуйте ещё раз');
      throw new AiError('Нет связи с Gemini — проверьте интернет или VPN');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (res.ok) return json.candidates?.[0]?.content?.parts ?? [];
    const message: string = json.error?.message ?? '';
    last = new AiError(explain(res.status, message));
    // An unknown model name is worth another try; anything else is final.
    if (res.status !== 404) throw last;
  }
  throw last;
}

/** Screenshots are 3–6 MB of PNG; 1600 px of JPEG reads just as well and uploads in a blink. */
export async function shrink(blob: Blob, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return (await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))) ?? blob;
  } catch {
    return blob;
  }
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export interface ShotRead {
  title: string;
  price?: number;
  category: string;
  shop?: string;
  note?: string;
  /** The object in plain English, without brands: what to draw. */
  render: string;
}

export const DEFAULT_CATEGORIES = ['Одежда', 'Обувь', 'Техника', 'Дом', 'Красота', 'Здоровье', 'Еда и напитки', 'Спорт', 'Хобби', 'Авто', 'Подарки'];

export function shotPrompt(categories: string[]) {
  const list = [...new Set([...categories, ...DEFAULT_CATEGORIES])].join(', ');
  return `На картинке — товар: скриншот из магазина или приложения (Ozon, Wildberries и т. п.) либо просто фото.
Верни JSON:
- title — короткое название товара по-русски, как в списке покупок: 2–5 слов, бренд можно оставить, без рекламных слов и характеристик;
- price — текущая цена в рублях числом (не старая зачёркнутая и не цена «в рассрочку»); если цены нет — null;
- category — одна категория из списка: ${list}; если ни одна не подходит, придумай свою короткую по-русски;
- shop — магазин, если он виден (Ozon, Wildberries, Яндекс Маркет…), иначе null;
- note — одно короткое предложение по-русски: что это за товар (объём, размер, назначение);
- render — по-английски, что нарисовать: сам предмет без брендов, надписей и логотипов — форма, материал, основной цвет (например: "a plain red aluminum soda can").`;
}

const SHOT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    price: { type: 'NUMBER', nullable: true },
    category: { type: 'STRING' },
    shop: { type: 'STRING', nullable: true },
    note: { type: 'STRING', nullable: true },
    render: { type: 'STRING' },
  },
  required: ['title', 'category', 'render'],
};

/** Gemini's JSON → a tidy result; tolerant to stray fields and odd numbers. */
export function parseShotRead(text: string): ShotRead | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return null;
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined);
  const title = str(j.title);
  const render = str(j.render);
  if (!title || !render) return null;
  const price = typeof j.price === 'number' ? j.price : Number(String(j.price ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
  return {
    title,
    price: price > 0 ? Math.round(price) : undefined,
    category: str(j.category) ?? 'Подарки',
    shop: str(j.shop),
    note: str(j.note),
    render,
  };
}

export async function readShotAi(image: Blob, key: string, categories: string[], signal?: AbortSignal): Promise<ShotRead> {
  const small = await shrink(image);
  const parts = await generate(
    TEXT_MODELS,
    {
      contents: [{ parts: [{ inlineData: { mimeType: small.type || 'image/png', data: await toBase64(small) } }, { text: shotPrompt(categories) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SHOT_SCHEMA, temperature: 0.2 },
    },
    key,
    READ_TIMEOUT,
    signal,
  );
  const read = parseShotRead(parts.map((p) => p.text ?? '').join(''));
  if (!read) throw new AiError('Не разобрал скрин — попробуйте другой или заполните вручную');
  return read;
}

/** The render prompt: a single plain object on pure white, so the background cuts out cleanly. */
export const renderPrompt = (subject: string) =>
  `A clean studio 3D product render of ${subject}. One single object, centered, the whole object in frame with generous margins, front three-quarter view, slightly from above. Completely plain and unbranded: no text, no letters, no numbers, no labels, no logos, no stickers. Soft even studio lighting, no cast shadow, no reflection on the floor. Pure white seamless background (#FFFFFF), nothing else in the scene. Square image.`;

export async function drawProduct(subject: string, key: string, signal?: AbortSignal): Promise<Blob> {
  const parts = await generate(
    IMAGE_MODELS,
    { contents: [{ parts: [{ text: renderPrompt(subject) }] }], generationConfig: { responseModalities: ['IMAGE'] } },
    key,
    DRAW_TIMEOUT,
    signal,
  );
  const img = parts.find((p) => p.inlineData)?.inlineData;
  if (!img) throw new AiError('Gemini не нарисовал картинку — попробуйте ещё раз');
  const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: img.mimeType || 'image/png' });
}

/** A tiny request that proves the key works from here (and that the country is served). */
export async function checkKey(key: string): Promise<void> {
  await generate(TEXT_MODELS, { contents: [{ parts: [{ text: 'Ответь одним словом: ок' }] }], generationConfig: { maxOutputTokens: 5 } }, key, CHECK_TIMEOUT);
}
