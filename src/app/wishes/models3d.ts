/*
 * A 3D picture of the product without any AI: the name goes to English (MyMemory, a free
 * translator, with a small dictionary behind it), then Sketchfab — the big public library of
 * 3D models — is searched and each model's studio render serves as the product picture.
 * Both services answer browsers directly, need no key and work without VPN.
 */

export interface Model3d {
  id: string;
  name: string;
  /** Small render for the picker grid. */
  thumb: string;
  /** Larger render to cut the product out of. */
  big: string;
}

/** Sizes, volumes and counts only confuse the search: «Гель для душа 5 л» → «Гель для душа». */
export function cleanQuery(title: string): string {
  return title
    .replace(/\d+(?:[.,]\d+)?\s*(?:(?:мл|л|г|кг|шт|см|мм|гб|тб|ml|l|g|kg|pcs|cm|mm|gb|tb)(?![а-яёa-z]))?[%"]?/gi, ' ')
    .replace(/[«»"'()[\]{}|/\\,.:;!?+–—-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}

/** Common goods by word stem: what the dictionary falls back to when the translator is out. */
const DICT: [RegExp, string][] = [
  [/^банк/, 'can'], [/^бутыл/, 'bottle'], [/^газиров/, 'soda'], [/^напит/, 'drink'], [/^кофе/, 'coffee'], [/^чай/, 'tea'],
  [/^гел/, 'gel'], [/^душ/, 'shower'], [/^шампун/, 'shampoo'], [/^крем/, 'cream'], [/^дезодорант/, 'deodorant'], [/^духи|^парфюм/, 'perfume'],
  [/^кроссов/, 'sneakers'], [/^кед/, 'sneakers'], [/^ботин/, 'boots'], [/^сапог/, 'boots'], [/^туфл/, 'shoes'], [/^обув/, 'shoes'],
  [/^куртк/, 'jacket'], [/^пухов/, 'puffer jacket'], [/^пальт/, 'coat'], [/^футбол/, 't-shirt'], [/^худи|^толстов/, 'hoodie'], [/^джинс/, 'jeans'], [/^брюк|^штан/, 'pants'], [/^шапк/, 'beanie'], [/^кепк/, 'cap'], [/^рюкзак/, 'backpack'], [/^сумк/, 'bag'], [/^час/, 'watch'], [/^очк/, 'glasses'],
  [/^телефон|^смартфон/, 'smartphone'], [/^наушн/, 'headphones'], [/^монитор/, 'monitor'], [/^ноутбук/, 'laptop'], [/^компьютер/, 'computer'], [/^клавиат/, 'keyboard'], [/^мыш/, 'mouse'], [/^планшет/, 'tablet'], [/^колонк/, 'speaker'], [/^телевиз/, 'tv'], [/^приставк|^консол/, 'game console'], [/^джойстик|^геймпад/, 'gamepad'], [/^камер|^фотоаппарат/, 'camera'], [/^зарядк/, 'charger'], [/^чехол/, 'phone case'],
  [/^пылесос/, 'vacuum cleaner'], [/^чайник/, 'kettle'], [/^кофемаш/, 'coffee machine'], [/^микроволн/, 'microwave'], [/^утюг/, 'iron'], [/^фен/, 'hair dryer'], [/^лампа|^светильн/, 'lamp'], [/^стол/, 'table'], [/^стул/, 'chair'], [/^кресл/, 'armchair'], [/^диван/, 'sofa'], [/^кроват/, 'bed'], [/^шкаф/, 'wardrobe'], [/^полк/, 'shelf'], [/^подушк/, 'pillow'], [/^кружк/, 'mug'], [/^тарелк/, 'plate'], [/^сковород/, 'frying pan'], [/^кастрюл/, 'pot'],
  [/^велосипед/, 'bicycle'], [/^самокат/, 'scooter'], [/^мяч/, 'ball'], [/^гантел/, 'dumbbell'], [/^коврик/, 'mat'], [/^машин|^автомоб/, 'car'], [/^шин/, 'tire'], [/^игрушк/, 'toy'], [/^книг/, 'book'], [/^кольц/, 'ring'], [/^цеп/, 'chain'], [/^браслет/, 'bracelet'],
];

/** Word by word through the dictionary; words it doesn't know (brands stay as they are) are kept if Latin. */
export function translateByDict(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/[а-яё]/.test(w) ? (DICT.find(([re]) => re.test(w))?.[1] ?? '') : w))
    .filter(Boolean)
    .join(' ');
}

const TRANSLATE = 'https://api.mymemory.translated.net/get';

export async function toEnglish(text: string, signal?: AbortSignal): Promise<string> {
  const q = cleanQuery(text);
  if (!/[а-яё]/i.test(q)) return q;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 3000);
  const abort = () => stop.abort();
  signal?.addEventListener('abort', abort);
  try {
    const res = await fetch(`${TRANSLATE}?q=${encodeURIComponent(q)}&langpair=ru|en`, { signal: stop.signal });
    const json = (await res.json()) as { responseData?: { translatedText?: string } };
    const out = json.responseData?.translatedText?.trim() ?? '';
    // Out of free translations, it says so in place of the answer.
    if (out && !/MYMEMORY WARNING|QUERY LENGTH|INVALID/i.test(out) && !/[а-яё]/i.test(out)) return out.toLowerCase();
  } catch {
    /* offline or slow: the dictionary below */
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
  return translateByDict(q) || q;
}

interface SketchfabImage {
  url: string;
  width: number;
}
interface SketchfabSearch {
  results?: { uid: string; name: string; thumbnails?: { images?: SketchfabImage[] } }[];
}

/** Sketchfab's answer → models with a grid-sized and a cut-sized render. */
export function toModels(json: SketchfabSearch): Model3d[] {
  return (json.results ?? []).flatMap((m) => {
    const imgs = [...(m.thumbnails?.images ?? [])].sort((a, b) => a.width - b.width);
    const thumb = imgs.find((i) => i.width >= 200) ?? imgs.at(-1);
    const big = [...imgs].reverse().find((i) => i.width <= 1024) ?? imgs[0];
    return thumb && big ? [{ id: m.uid, name: m.name, thumb: thumb.url, big: big.url }] : [];
  });
}

const SEARCH = 'https://api.sketchfab.com/v3/search';
const FILLER = new Set(['a', 'an', 'the', 'for', 'with', 'and', 'of', 'in', 'on', 'to', 'by', 'from', 'set', 'scent', 'flavor', 'flavour', 'new', 'original', 'pcs', 'pack']);

/**
 * Sketchfab wants every word to match, so a long name finds nothing. Simpler and simpler
 * queries are tried: the whole phrase, then shorter from the end, then its last two words
 * («vacuum cleaner»), then the head word (English puts it last in «shoe deodorant»), then
 * each word alone.
 */
export function fallbacks(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w && !FILLER.has(w));
  const out: string[] = [];
  for (let n = Math.min(words.length, 4); n >= 2; n--) out.push(words.slice(0, n).join(' '));
  if (words.length > 2) out.push(words.slice(-2).join(' '));
  if (words.length >= 2) out.push(words[1], words[0]);
  out.push(...words.slice(2));
  if (words.length === 1) out.push(words[0]);
  return [...new Set(out)];
}

async function searchOnce(query: string, signal?: AbortSignal): Promise<Model3d[]> {
  const res = await fetch(`${SEARCH}?type=models&count=12&q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return toModels((await res.json()) as SketchfabSearch);
}

/** The first of the simpler queries that finds models, and what it found. */
export async function searchModels(query: string, signal?: AbortSignal): Promise<{ query: string; models: Model3d[] }> {
  for (const q of fallbacks(query)) {
    const models = await searchOnce(q, signal);
    if (models.length) return { query: q, models };
  }
  return { query, models: [] };
}

/**
 * The render's bytes. Bypasses the HTTP cache on purpose: the picker grid shows the same files
 * through <img>, and a copy cached that way may lack the header that lets a page read pixels.
 */
export async function fetchRender(model: Model3d, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(model.big, { cache: 'reload', signal });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}
