import { pipeline, RawImage } from '@huggingface/transformers';

/*
 * Runs ORMBG off the main thread. Phones with fp16 WebGPU get the 88 MB half-precision model
 * (about a second a photo); everything else gets the 44 MB 8-bit model on WASM (10–30 s).
 */

const MODEL = 'onnx-community/ormbg-ONNX';
type Mask = { width: number; height: number; channels: number; data: Uint8ClampedArray; rgba(): Mask };
type Segmenter = (img: RawImage) => Promise<Mask | Mask[]>;
type Gpu = { requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null> };

export type CutRequest = { id: number; blob: Blob };
export type CutReply =
  | { id: number; stage: 'model' | 'cut'; share: number }
  | { id: number; width: number; height: number; data: Uint8ClampedArray }
  | { id: number; error: string };

const port = self as unknown as Worker;
const say = (m: CutReply, transfer: Transferable[] = []) => port.postMessage(m, transfer);
let segmenter: Promise<Segmenter> | null = null;

async function load(onShare: (s: number) => void): Promise<Segmenter> {
  const gpu = (navigator as unknown as { gpu?: Gpu }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  const fast = !!adapter?.features.has('shader-f16');
  const files = new Map<string, [number, number]>();
  const seg = await pipeline('background-removal', MODEL, {
    device: fast ? 'webgpu' : 'wasm',
    dtype: fast ? 'fp16' : 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, [p.loaded ?? 0, p.total]);
      let loaded = 0, total = 0;
      for (const [l, t] of files.values()) (loaded += l), (total += t);
      onShare(total ? loaded / total : 0);
    },
  });
  return seg as unknown as Segmenter;
}

port.onmessage = async (e: MessageEvent<CutRequest>) => {
  const { id, blob } = e.data;
  try {
    segmenter ??= load((share) => say({ id, stage: 'model', share }));
    const seg = await segmenter;
    say({ id, stage: 'cut', share: 1 });
    const out = await seg(await RawImage.fromBlob(blob));
    const m = (Array.isArray(out) ? out[0] : out).rgba();
    say({ id, width: m.width, height: m.height, data: m.data }, [m.data.buffer]);
  } catch (err) {
    segmenter = null;
    say({ id, error: String(err) });
  }
};
