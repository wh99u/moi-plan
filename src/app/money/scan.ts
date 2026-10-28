import { parseFiscalQr, parseReceiptText, type ParsedReceipt } from './receipt';

export type ScanStage = 'prepare' | 'qr' | 'model' | 'text' | 'done';

/** Long side of the image fed to OCR: enough for receipt print, light on a phone. */
const MAX_SIDE = 2000;

async function toCanvas(file: Blob) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return { c, x };
}

/** Grey and a touch more contrast: thermal print reads better that way. */
function grey(x: CanvasRenderingContext2D, w: number, h: number) {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (l - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  x.putImageData(img, 0, 0);
  return img;
}

/**
 * Photo of a receipt → store, lines, total and date. The QR code (every Russian fiscal receipt
 * has one) gives the exact total and date; the lines come from OCR. Both libraries load on first
 * use only; the Russian OCR model (~10 MB) is cached by the browser after that.
 */
export async function scanReceipt(file: Blob, onProgress: (stage: ScanStage, share: number) => void): Promise<ParsedReceipt> {
  onProgress('prepare', 0);
  const { c, x } = await toCanvas(file);

  onProgress('qr', 0.05);
  let fiscal: ReturnType<typeof parseFiscalQr> = null;
  try {
    const { default: jsQR } = await import('jsqr');
    const raw = x.getImageData(0, 0, c.width, c.height);
    const code = jsQR(raw.data, raw.width, raw.height, { inversionAttempts: 'dontInvert' });
    if (code) fiscal = parseFiscalQr(code.data);
  } catch {
    /* no QR: the text alone will do */
  }

  grey(x, c.width, c.height);
  onProgress('model', 0.1);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('rus', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress('text', 0.3 + m.progress * 0.68);
      else if (m.status.includes('loading')) onProgress('model', 0.1 + m.progress * 0.2);
    },
  });
  try {
    const { data } = await worker.recognize(c);
    const parsed = parseReceiptText(data.text);
    if (fiscal) {
      parsed.total = fiscal.total;
      parsed.date = fiscal.date;
    }
    onProgress('done', 1);
    return parsed;
  } finally {
    await worker.terminate();
  }
}

let pending: File | null = null;

/** The photo picked before the spend form opened; read once. */
export function takePendingReceipt() {
  const f = pending;
  pending = null;
  return f;
}

/**
 * Opens the camera or gallery. Call it straight from a tap handler: browsers only allow the
 * picker inside a user gesture.
 */
export function pickReceipt(keep = false): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (f: File | null) => {
      input.remove();
      if (keep) pending = f;
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    input.click();
  });
}
