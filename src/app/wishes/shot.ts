import type { PSM, Worker } from 'tesseract.js';
import type { CutoutResult } from '../../lib/cutoutBrowser';
import { cutOut, type CutStage } from './cutout';
import { shortTitle } from './link';
import type { Rect } from './mask';

/*
 * A screenshot of a product page in the Ozon app → name, price, product photo. Ozon lets no
 * outside reader at its pages, but the user can always screenshot what they are looking at.
 * Layout of the app's product page: the photo card on top, the price row right under it with
 * the current price in green (the old one is grey and struck out), then «С банками»…
 * The name proper is further down, so the big headline printed on the photo stands in for it.
 */

export type ShotStage = 'read' | CutStage;

export interface ShotInfo {
  /** The price row was found, so it is the Ozon product page. */
  ozon: boolean;
  title?: string;
  price?: number;
  photo?: CutoutResult;
  /** The photo card as is, for «Как есть». */
  card?: Blob;
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

/**
 * The card without the app's own buttons on it (back, search, share, like, «Похожие»):
 * each is painted over with the photo right below it so the cut-out does not pick it up.
 */
function cardCanvas(src: HTMLCanvasElement, w: number, card: { top: number; bottom: number }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = card.bottom - card.top;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, card.top, w, c.height, 0, 0, w, c.height);
  const u = w / 100;
  const patches: Rect[] = [
    [1.5 * u, 1.5 * u, 10.5 * u, 10.5 * u],
    [67.5 * u, 1.5 * u, 31 * u, 10.5 * u],
    [79 * u, c.height - 10 * u, 20 * u, 8.5 * u],
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
  return { c, patches };
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

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));

export async function readShot(file: Blob, onStage?: (stage: ShotStage, share: number) => void): Promise<ShotInfo> {
  onStage?.('read', 0);
  const { c, px } = await pixels(file);
  // A phone screen is tall; product photos are not, and their green bits are no price row.
  if (px.h / px.w < 1.8) return { ozon: false };
  const row = findPrice(px);
  if (!row) return { ozon: false };
  const card = findCard(px, row.top);
  const { c: cardC, patches } = cardCanvas(c, px.w, card);

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('rus', 1, {
    logger: (m) => m.status === 'recognizing text' && onStage?.('read', m.progress),
  });
  let price: number | undefined;
  let title: string | undefined;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: SINGLE_LINE, tessedit_char_whitelist: '0123456789 ' });
    price = priceFrom((await worker.recognize(priceCanvas(px, row))).data.text);

    // Poster lettering reads unevenly: a sparse pass at twice the size and a page pass at
    // full size each catch lines the other misses.
    const big = document.createElement('canvas');
    big.width = cardC.width * 2;
    big.height = cardC.height * 2;
    big.getContext('2d')!.drawImage(cardC, 0, 0, big.width, big.height);
    const sparse = await linesOf(worker, big, SPARSE_TEXT, 2);
    const page = await linesOf(worker, cardC, AUTO, 1);
    title = titleFrom(mergeLines([sparse, page]), cardC.height);
  } finally {
    await worker.terminate();
  }

  const cardBlob = await toBlob(cardC);
  const photo = await cutOut(cardBlob, onStage, patches);
  return { ozon: true, title, price, photo, card: cardBlob };
}
