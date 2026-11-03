import type { PSM, Worker } from 'tesseract.js';
import { shortTitle } from './link';

type Rect = [x: number, y: number, w: number, h: number];

/*
 * A screenshot of a product page in a shop app → name and price. Ozon lets no outside reader at
 * its pages, but the user can always screenshot what they are looking at.
 * Ozon's product page: the photo card on top, the price row right under it with the current
 * price in green (the old one is grey and struck out), then «С банками»… and, further down, the
 * product's name in plain type. That name, when the screenshot shows it, reads almost without
 * mistakes; otherwise the big headline printed on the photo stands in for it.
 */

export type ShotStage = 'read';

export interface ShotInfo {
  /** A shop screen was read: something like a name or a price came off it. */
  screen: boolean;
  /** The green price row of the Ozon app was found. */
  ozon: boolean;
  title?: string;
  price?: number;
}

interface Px {
  d: Uint8ClampedArray;
  w: number;
  h: number;
}

const isGreen = (d: Uint8ClampedArray, i: number) => d[i + 1] > 140 && d[i + 1] > d[i] + 60 && d[i + 1] > d[i + 2] + 30;
const near = (d: Uint8ClampedArray, i: number, c: number[]) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < 24;

interface PriceRow {
  top: number;
  bottom: number;
  /** Glyph columns, left to right; the last one is «₽». */
  glyphs: [number, number][];
}

/** The first band of green text in the lower part of the screen. */
export function findPrice({ d, w, h }: Px): PriceRow | null {
  let top = -1, bottom = -1, x0 = w, x1 = 0;
  for (let y = Math.round(h * 0.45); y < Math.round(h * 0.9); y++) {
    let count = 0;
    for (let x = 0; x < w * 0.6; x++) {
      if (!isGreen(d, (y * w + x) * 4)) continue;
      count++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
    if (count > 3) {
      if (top < 0) top = y;
      bottom = y;
    } else if (top >= 0 && y - bottom > 4) break;
  }
  if (top < 0 || bottom - top < h * 0.008) return null;

  const glyphs: [number, number][] = [];
  let start = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    let any = false;
    for (let y = top; y <= bottom && x <= x1; y++) if (isGreen(d, (y * w + x) * 4)) (any = true), (y = bottom);
    if (any && start < 0) start = x;
    if (!any && start >= 0) glyphs.push([start, x - 1]), (start = -1);
  }
  return glyphs.length >= 2 ? { top, bottom, glyphs } : null;
}

/** The photo card: from the price row up to where the page background ends, and down from the status bar. */
export function findCard({ d, w, h }: Px, priceTop: number): { top: number; bottom: number } {
  const bg = Array.from(d.slice((priceTop * w + Math.round(w * 0.02)) * 4, (priceTop * w + Math.round(w * 0.02)) * 4 + 3));
  const isBg = (y: number, a: number, b: number) => near(d, (y * w + Math.round(w * a)) * 4, bg) && near(d, (y * w + Math.round(w * b)) * 4, bg);
  // Columns clear of the badges beside the price («Покупайте за 1 ₽»)…
  let bottom = priceTop - 1;
  while (bottom > h * 0.2 && isBg(bottom, 0.3, 0.5)) bottom--;
  // …and of the clock and the island in the status bar, which shares the page background.
  let top = Math.round(h * 0.02);
  for (let run = 0; top < bottom && run < 3; top++) run = isBg(top, 0.3, 0.7) ? 0 : run + 1;
  return { top: Math.max(0, top - 3), bottom };
}

/** Digits from OCR with «3 410» spacing or stray marks → 3410. */
export function priceFrom(text: string): number | undefined {
  const digits = text.replace(/[^\d]/g, '');
  const n = Number(digits);
  return digits && n > 0 && n < 1e8 ? n : undefined;
}

export interface OcrLine {
  text: string;
  /** Height of the line box, px. */
  size: number;
  y: number;
  x0: number;
  x1: number;
  confidence: number;
}

/**
 * Lines from several OCR passes. Where two cover the same spot the surer one stays, but a whole
 * line beats a fragment of it read only a little more surely.
 */
export function mergeLines(passes: OcrLine[][]): OcrLine[] {
  const out: OcrLine[] = [];
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));
  const width = (l: OcrLine) => l.x1 - l.x0;
  for (const l of passes.flat().sort((a, b) => b.confidence - a.confidence)) {
    const i = out.findIndex((o) => overlap(o.y, o.y + o.size, l.y, l.y + l.size) > 0.5 && overlap(o.x0, o.x1, l.x0, l.x1) > 0.5);
    if (i < 0) out.push(l);
    else if (width(l) > width(out[i]) * 1.2 && l.confidence >= out[i].confidence - 15) out[i] = l;
  }
  return out;
}

const UI_WORDS = /похожие|видео|в корзину|доставим|отзыв|купить|подробнее/i;

/** Lines of the shop's own interface around the product: buttons, payment offers, delivery. */
const PAGE_UI =
  /банк|мили |постоплат|покупайте|подробнее|корзин|доставим|доставк|распродаж|отзыв|вопрос|оценк|рассрочк|кэшбэк|балл|продав|магазин|похож|характеристик|описани|наличии|осталось|купили|выбрат|ozon|озон|карт[аоуы]|скидк|акци|артикул|бренд|в избранн|поделит|сравнит|₽/i;

const letters = (s: string) => (s.match(/[a-zа-яё]/gi) ?? []).length;

/**
 * The product's name among the page's plain text: the longest block of evenly sized,
 * left-aligned lines that are words rather than buttons, prices or offers.
 */
export function nameFrom(lines: OcrLine[]): string | undefined {
  const cand = lines
    .map((l) => ({ ...l, text: l.text.replace(/[|_«»"“”]+/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((l) => {
      const n = letters(l.text);
      const chars = l.text.replace(/\s/g, '').length;
      return l.confidence >= 55 && n >= 5 && n / chars >= 0.55 && l.text.split(' ').length >= 2 && !PAGE_UI.test(l.text);
    })
    .sort((a, b) => a.y - b.y);

  const blocks: OcrLine[][] = [];
  for (const l of cand) {
    const block = blocks.at(-1);
    const prev = block?.at(-1);
    const joins = prev && Math.abs(l.size - prev.size) <= Math.max(l.size, prev.size) * 0.3 && l.y - (prev.y + prev.size) < prev.size * 1.1 && Math.abs(l.x0 - prev.x0) < prev.size * 1.5;
    if (joins) block!.push(l);
    else blocks.push([l]);
  }
  const best = blocks
    .map((b) => ({ b, n: b.reduce((t, l) => t + letters(l.text), 0) }))
    .filter((x) => x.n >= 12)
    .sort((a, b) => b.n - a.n)[0];
  if (!best) return undefined;
  const text = best.b
    .map((l) => l.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,\-–—\s]+$/, '')
    .trim();
  return shortTitle(fixUnits(text), 70);
}

/** Read with Latin letters on, Russian units after a number come out Latin: «5 n» → «5 л». */
const UNITS: Record<string, string> = { n: 'л', r: 'г', mn: 'мл', mл: 'мл', kr: 'кг', kг: 'кг', wt: 'шт', cm: 'см', mm: 'мм' };
export function fixUnits(text: string): string {
  if (!/[а-яё]/i.test(text)) return text;
  return text.replace(/(\d)\s*([a-zл]{1,2})(?![a-zа-яё])/gi, (all, d: string, u: string) => {
    const ru = UNITS[u.toLowerCase()];
    return ru ? `${d} ${ru}` : all;
  });
}

/** A price in the page text when there is no green price row: the biggest «12 990 ₽». */
export function priceInLines(lines: OcrLine[]): number | undefined {
  const found = lines
    .map((l) => ({ l, m: l.text.match(/(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d+)\s*[₽Р]/) }))
    .filter((x) => x.m)
    .sort((a, b) => b.l.size - a.l.size)[0];
  return found ? priceFrom(found.m![1]) : undefined;
}

/**
 * The headline printed on the photo: the line with big, surely read letters near the top, plus
 * the lines that sit right with it. `height` is the photo's height in the same pixels as the lines.
 */
export function titleFrom(lines: OcrLine[], height: number): string | undefined {
  const clean = lines
    .map((l) => ({ ...l, text: l.text.replace(/[^a-zа-яё0-9%+\-.,\s]/gi, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((l) => {
      const letters = (l.text.match(/[a-zа-яё]/gi) ?? []).length;
      return l.confidence >= 45 && letters >= 3 && letters / l.text.replace(/\s/g, '').length >= 0.7 && !UI_WORDS.test(l.text);
    })
    .sort((a, b) => a.y - b.y);
  if (!clean.length) return undefined;

  const score = (l: OcrLine) => l.size * (l.confidence / 100) * (1 - (0.6 * l.y) / height);
  const biggest = clean.reduce((m, l) => (score(l) > score(m) ? l : m));
  const i = clean.indexOf(biggest);
  const keep = [biggest];
  // Neighbours belong to the headline when they are close, not tiny and surely read.
  const fits = (l: OcrLine, next: OcrLine) => l.confidence >= 60 && l.size >= biggest.size * 0.3 && Math.abs(l.y - next.y) < biggest.size * 1.8;
  for (let j = i - 1; j >= 0 && fits(clean[j], keep[0]); j--) keep.unshift(clean[j]);
  for (let j = i + 1; j < clean.length && fits(clean[j], keep.at(-1)!); j++) keep.push(clean[j]);

  const text = keep
    .map((l) => (l.text === l.text.toUpperCase() ? l.text.toLowerCase() : l.text))
    .join(' ')
    .split(' ')
    .map((w) => w.replace(/^[.,\-]+|[.,\-]+$/g, ''))
    .filter(Boolean)
    .join(' ');
  return text ? shortTitle(text.charAt(0).toUpperCase() + text.slice(1), 56) : undefined;
}

/* ───────── browser side ───────── */

async function pixels(file: Blob) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0);
  bmp.close();
  return { c, x, px: { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height } };
}

/** Green price digits on white, «₽» left out, scaled up: the cleanest input OCR can get. */
function priceCanvas({ d, w }: Px, row: PriceRow) {
  const [x0] = row.glyphs[0];
  const x1 = row.glyphs.at(-2)![1];
  const pad = 8, k = 2;
  const cw = x1 - x0 + 1, ch = row.bottom - row.top + 1;
  const c = document.createElement('canvas');
  c.width = (cw + pad * 2) * k;
  c.height = (ch + pad * 2) * k;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#000';
  for (let y = 0; y < ch; y++)
    for (let i = 0; i < cw; i++) if (isGreen(d, ((row.top + y) * w + x0 + i) * 4)) x.fillRect((i + pad) * k, (y + pad) * k, k, k);
  return c;
}

/** The headline sits in the upper part of the photo; the rest is product and fine print. */
const HEADLINE_SHARE = 0.6;

/**
 * The upper part of the photo card without the app's own buttons on it (back, search, share,
 * like): each is painted over so OCR does not read their icons as letters.
 */
function cardCanvas(src: HTMLCanvasElement, w: number, card: { top: number; bottom: number }, share = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((card.bottom - card.top) * share);
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, card.top, w, c.height, 0, 0, w, c.height);
  const u = w / 100;
  const patches: Rect[] = [
    [1.5 * u, 1.5 * u, 10.5 * u, 10.5 * u],
    [67.5 * u, 1.5 * u, 31 * u, 10.5 * u],
  ];
  for (const [px, py, pw, ph] of patches) {
    // Flat colour of the strip under the button: copying the photo itself would bring in
    // pieces of the headline and confuse OCR.
    const strip = x.getImageData(Math.round(px), Math.round(py + ph + 2), Math.round(pw), 4).data;
    const avg = [0, 1, 2].map((k) => {
      let t = 0;
      for (let i = k; i < strip.length; i += 4) t += strip[i];
      return Math.round(t / (strip.length / 4));
    });
    x.fillStyle = `rgb(${avg.join(',')})`;
    x.fillRect(px, py, pw, ph);
  }
  return c;
}

// tesseract.js declares PSM as a const enum, which does not survive per-file compilation.
const SINGLE_LINE = '7' as PSM;
const SPARSE_TEXT = '11' as PSM;
const AUTO = '3' as PSM;

async function linesOf(worker: Worker, c: HTMLCanvasElement, mode: PSM, scale: number): Promise<OcrLine[]> {
  await worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: '' });
  const { data } = await worker.recognize(c, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) =>
      p.lines.map((l) => ({
        text: l.text,
        size: (l.bbox.y1 - l.bbox.y0) / scale,
        y: l.bbox.y0 / scale,
        x0: l.bbox.x0 / scale,
        x1: l.bbox.x1 / scale,
        confidence: l.confidence,
      })),
    ),
  );
}

const readers: { mixed?: Promise<Worker>; russian?: Promise<Worker> } = {};

function reader(slot: 'mixed' | 'russian', langs: string[]): Promise<Worker> {
  readers[slot] ??= import('tesseract.js')
    .then(({ createWorker }) => createWorker(langs, 1))
    .catch((e) => {
      delete readers[slot];
      throw e;
    });
  return readers[slot];
}

/**
 * The OCR, started once and kept: loading it is a good part of the wait, so the form calls
 * this as soon as it opens and the screenshot then meets a ready reader. Two of them: page
 * text needs English too (names mix in Latin brands, «Гель для душа GRASS Milana»), while the
 * stylised poster lettering reads better with Russian alone.
 */
export function warmOcr(): Promise<[Worker, Worker]> {
  return Promise.all([reader('mixed', ['rus', 'eng']), reader('russian', ['rus'])]);
}

/**
 * The page's plain text below the photo, made easy for OCR: grey, dark letters on light (dark
 * themes are inverted), half again as big.
 */
function pageCanvas(src: HTMLCanvasElement, px: Px, top: number, bottom: number) {
  const k = 1.5;
  const c = document.createElement('canvas');
  c.width = Math.round(px.w * k);
  c.height = Math.round((bottom - top) * k);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, 0, top, px.w, bottom - top, 0, 0, c.width, c.height);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const dark = sum / (d.length / 4) < 110;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, ((dark ? 255 - l : l) - 128) * 1.4 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  x.putImageData(img, 0, 0);
  return { c, k };
}

export async function readShot(file: Blob, onStage?: (stage: ShotStage, share: number) => void): Promise<ShotInfo> {
  onStage?.('read', 0);
  const workers = warmOcr();
  const { c, px } = await pixels(file);
  // A phone screen is tall; product photos are not, and their green bits are no price row.
  if (px.h / px.w < 1.8) return { screen: false, ozon: false };
  const row = findPrice(px);
  const card = row ? findCard(px, row.top) : null;

  const [w, ru] = await workers;
  let price: number | undefined;
  if (row) {
    await w.setParameters({ tessedit_pageseg_mode: SINGLE_LINE, tessedit_char_whitelist: '0123456789 ' });
    price = priceFrom((await w.recognize(priceCanvas(px, row))).data.text);
  }

  // The name proper, when the screenshot shows it: plain text under the photo (or anywhere,
  // once the photo has scrolled away), above the tab bar.
  const top = card ? card.bottom : Math.round(px.h * 0.05);
  const page = pageCanvas(c, px, top, Math.round(px.h * 0.92));
  const pageLines = (await linesOf(w, page.c, AUTO, page.k)).map((l) => ({ ...l, y: l.y + top }));
  const name = nameFrom(pageLines);
  price ??= priceInLines(pageLines);
  if (name || !card) return { screen: !!(name || price), ozon: !!row, title: name, price };

  const whole = cardCanvas(c, px.w, card);
  const head = cardCanvas(c, px.w, card, HEADLINE_SHARE);

  // Poster lettering reads unevenly: a sparse pass at twice the size (over the headline part
  // only — it is the slow one) and a page pass over the whole card each catch lines the
  // other misses.
  const big = document.createElement('canvas');
  big.width = head.width * 2;
  big.height = head.height * 2;
  big.getContext('2d')!.drawImage(head, 0, 0, big.width, big.height);
  const sparse = await linesOf(ru, big, SPARSE_TEXT, 2);
  const poster = await linesOf(ru, whole, AUTO, 1);
  // Scored against the whole card, as the lines' heights and places were tuned on it.
  const title = titleFrom(mergeLines([sparse, poster]), card.bottom - card.top);
  return { screen: true, ozon: true, title, price };
}
