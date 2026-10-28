import type { Pixels } from '../../lib/cutout';

export type Rect = [x: number, y: number, w: number, h: number];

const LOW = 90;
const HIGH = 200;
/** Islands smaller than this share of the biggest one are scraps: bits of lettering, sparkles. */
const KEEP = 0.25;

/**
 * Tidies the model's alpha in place: the faint haze it leaves over busy posters goes, edges stay
 * soft, the given rectangles (app buttons) are emptied and only the big islands are kept.
 * Returns the share of the picture still covered.
 */
export function cleanMask(img: Pixels, clear: Rect[] = []): number {
  const { width: w, height: h, data: d } = img;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    d[i] = a <= LOW ? 0 : a >= HIGH ? 255 : Math.round(((a - LOW) / (HIGH - LOW)) * 255);
  }
  for (const [x, y, rw, rh] of clear) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(h, Math.ceil(y + rh)); yy++)
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(w, Math.ceil(x + rw)); xx++) d[(yy * w + xx) * 4 + 3] = 0;
  }

  // Islands of visible pixels, 4-connected.
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (label[p] >= 0 || d[p * 4 + 3] === 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = p;
    label[p] = id;
    while (head < tail) {
      const q = queue[head++];
      size++;
      const x = q % w;
      for (const n of [q - w, q + w, x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1]) {
        if (n < 0 || n >= w * h || label[n] >= 0 || d[n * 4 + 3] === 0) continue;
        label[n] = id;
        queue[tail++] = n;
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return 0;

  const min = Math.max(...sizes) * KEEP;
  let kept = 0;
  for (let p = 0; p < w * h; p++) {
    if (label[p] < 0) continue;
    if (sizes[label[p]] < min) d[p * 4 + 3] = 0;
    else kept++;
  }
  return kept / (w * h);
}
