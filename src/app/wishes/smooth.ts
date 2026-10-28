import type { Pixels } from '../../lib/cutout';

/*
 * Background of a 3D render: a studio backdrop that shades smoothly (vignette, gradient, soft
 * floor). It is grown from the edges into every neighbour whose colour differs only a little
 * from the pixel it is reached from — smooth shading lets the fill through, the object's edge
 * stops it. A flat-colour flood fill can't follow a gradient; this can, and in milliseconds.
 */

/** Largest step between neighbours (sum over R, G, B) still taken for backdrop. */
const STEP = 15;
/** Soft rim: pixels next to the backdrop fade a little so the edge isn't jagged. */
const RIM_ALPHA = 150;

export interface SmoothCut {
  /** Share of the picture left as the object. */
  kept: number;
}

/** Clears the backdrop in place (alpha 0) and softens the rim. */
export function removeSmoothBackground(img: Pixels, step = STEP): SmoothCut {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const seed = (p: number) => {
    if (!bg[p]) (bg[p] = 1), (queue[tail++] = p);
  };
  for (let x = 0; x < w; x++) seed(x), seed((h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) seed(y * w), seed(y * w + w - 1);

  const diff = (a: number, b: number) => Math.abs(d[a * 4] - d[b * 4]) + Math.abs(d[a * 4 + 1] - d[b * 4 + 1]) + Math.abs(d[a * 4 + 2] - d[b * 4 + 2]);
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const near = [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1];
    for (const q of near) {
      if (q < 0 || q >= n || bg[q]) continue;
      if (diff(p, q) <= step) {
        bg[q] = 1;
        queue[tail++] = q;
      }
    }
  }

  let kept = 0;
  for (let p = 0; p < n; p++) {
    if (bg[p]) {
      d[p * 4 + 3] = 0;
      continue;
    }
    kept++;
    const x = p % w;
    const edge = (p >= w && bg[p - w]) || (p < n - w && bg[p + w]) || (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]);
    if (edge) d[p * 4 + 3] = Math.min(d[p * 4 + 3], RIM_ALPHA);
  }
  return { kept: kept / n };
}
