import { averageColor, removeFlatBackground, trimTransparent } from '../../lib/cutout';
import { cutoutFromBlob, type CutoutResult } from '../../lib/cutoutBrowser';
import type { CutReply } from './cut.worker';
import { cleanMask, type Rect } from './mask';
import { removeSmoothBackground } from './smooth';

/*
 * The product, cut out of its photo. Studio shots on a plain background are cut instantly by
 * flood fill; anything else goes to ORMBG (Apache-2.0), a salient-object model run by
 * transformers.js in a worker (see cut.worker.ts). The model is downloaded once and cached.
 */

export type CutStage = 'model' | 'cut';

const MAX_SIDE = 768;
let worker: Worker | null = null;
let nextId = 0;

function segment(blob: Blob, onStage?: (stage: CutStage, share: number) => void): Promise<ImageData> {
  worker ??= new Worker(new URL('./cut.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<CutReply>) => {
      const m = e.data;
      if (m.id !== id) return;
      if ('stage' in m) return onStage?.(m.stage, m.share);
      w.removeEventListener('message', onMessage);
      if ('error' in m) reject(new Error(m.error));
      else resolve(new ImageData(new Uint8ClampedArray(m.data), m.width, m.height));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, blob });
  });
}

/** Crops the model's output to the object; null when it found nothing or kept everything. */
async function fromMask(img: ImageData, clear?: Rect[]): Promise<CutoutResult | null> {
  const share = cleanMask(img, clear);
  if (share < 0.02 || share > 0.97) return null;

  const t = trimTransparent(img);
  const full = document.createElement('canvas');
  full.width = t.width;
  full.height = t.height;
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.data), t.width, t.height), 0, 0);
  const k = Math.min(1, MAX_SIDE / Math.max(t.width, t.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(t.width * k));
  out.height = Math.max(1, Math.round(t.height * k));
  out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/webp', 0.9));
  return blob && { blob, tint: averageColor(t), removed: true };
}

/** `clear`: areas that are never the product, such as app buttons drawn over a screenshot. */
export async function cutOut(blob: Blob, onStage?: (stage: CutStage, share: number) => void, clear?: Rect[]): Promise<CutoutResult> {
  const flat = await cutoutFromBlob(blob, { removeBg: true });
  if (flat.removed) return flat;
  try {
    return (await fromMask(await segment(blob, onStage), clear)) ?? flat;
  } catch {
    return flat;
  }
}

async function decode(blob: Blob, max = 1024): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return x.getImageData(0, 0, c.width, c.height);
}

/**
 * A render on pure white (what Gemini draws): the white goes by flood fill and stray bits such
 * as a watermark in a corner are dropped, so the crop hugs the product alone.
 */
export async function cutWhite(blob: Blob): Promise<CutoutResult> {
  const img = await decode(blob);
  if (!removeFlatBackground(img).removed) return keepWhole(blob);
  return (await fromMask(img)) ?? keepWhole(blob);
}

/**
 * A 3D model's studio render: the smoothly shaded backdrop is grown away from the edges in
 * milliseconds; only when that leaves too little or too much does the model take over.
 */
export async function cutRender(blob: Blob, onStage?: (stage: CutStage, share: number) => void): Promise<CutoutResult> {
  const img = await decode(blob);
  const { kept } = removeSmoothBackground(img);
  if (kept > 0.03 && kept < 0.8) {
    const r = await fromMask(img);
    if (r) return r;
  }
  return cutOut(blob, onStage);
}

/** Kept as is, background and all. */
export const keepWhole = (blob: Blob) => cutoutFromBlob(blob, { removeBg: false });
