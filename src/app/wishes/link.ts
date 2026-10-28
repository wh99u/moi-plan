/*
 * A product link → name, category, price and photo. Shops guard their pages, so each source
 * is used for what it actually gives a browser:
 * - Wildberries keeps a public card (name, category, photos) on its CDN; prices are not public.
 * - Any other page goes through microlink.io, which reads its title and preview image.
 * - Ozon blocks every outside reader: the user fills the card by hand.
 * Pictures from other sites go through the wsrv.nl image proxy, which allows canvas reads,
 * so the background can be cut out.
 */

export interface Product {
  url: string;
  shop: string;
  title?: string;
  category?: string;
  price?: number;
  image?: string;
}

/** The first link in a pasted share text («Смотри, что нашёл https://…»). */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"«»]+/i) ?? text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ru|com|net|org|shop|store|io)\/[^\s<>"«»]*/i);
  if (!m) return null;
  const url = m[0].replace(/[),.!?;:]+$/, '');
  return /^https?:/i.test(url) ? url : `https://${url}`;
}

const SHOPS: [RegExp, string][] = [
  [/(^|\.)(wildberries\.(ru|by|kz|am|kg|uz)|wb\.ru)$/, 'Wildberries'],
  [/(^|\.)ozon\.(ru|by|kz)$/, 'Ozon'],
  [/(^|\.)market\.yandex\.ru$/, 'Яндекс Маркет'],
  [/(^|\.)amazon\.[a-z.]+$/, 'Amazon'],
  [/(^|\.)aliexpress\.(ru|com|us)$/, 'AliExpress'],
  [/(^|\.)megamarket\.ru$/, 'Мегамаркет'],
  [/(^|\.)lamoda\.ru$/, 'Lamoda'],
  [/(^|\.)dns-shop\.ru$/, 'DNS'],
  [/(^|\.)mvideo\.ru$/, 'М.Видео'],
  [/(^|\.)eldorado\.ru$/, 'Эльдорадо'],
  [/(^|\.)citilink\.ru$/, 'Ситилинк'],
  [/(^|\.)avito\.ru$/, 'Авито'],
  [/(^|\.)apple\.com$/, 'Apple'],
  [/(^|\.)ikea\.(com|ru)$/, 'IKEA'],
];

export function shopOf(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
  return SHOPS.find(([re]) => re.test(host))?.[1] ?? host;
}

/** Wildberries article from `…/catalog/172466373/detail.aspx` or `?nm=172466373`. */
export function wbArticle(url: string): number | null {
  if (shopOf(url) !== 'Wildberries') return null;
  const m = url.match(/\/catalog\/(\d{5,12})(?:\/|$|\?)/) ?? url.match(/[?&](?:nm|card)=(\d{5,12})/);
  return m ? Number(m[1]) : null;
}

/** «Чехол … – купить в интернет-магазине Wildberries» → «Чехол …». */
export function cleanTitle(title: string): string {
  return title
    .replace(/^amazon\.[a-z.]+\s*:\s*/i, '')
    .replace(/\s*[|–—-]\s*(купить|buy|цены?|отзывы|интернет-магазин|amazon|ozon|wildberries|яндекс маркет|aliexpress).*$/i, '')
    .replace(/\s*:\s*[^:]*(?:amazon|electronics|computers|clothing)[^:]*$/i, '')
    .replace(/^купить\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Marketplace titles run on with specs; a card needs the first phrase. */
export function shortTitle(title: string, max = 48): string {
  if (title.length <= max) return title;
  const cuts = [' with ', ', ', ': ', ' (', ' - ', ' – ', ' | ', '; ', ' / ']
    .map((s) => title.indexOf(s, 16))
    .filter((i) => i > 0);
  const at = cuts.length ? Math.min(...cuts) : -1;
  if (at > 0 && at <= max + 12) return title.slice(0, at);
  return `${title.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** «12 990 ₽», «12990 руб.» → 12990. Other currencies are not guessed. */
export function rublesIn(text: string): number | undefined {
  const m = text.match(/(\d{1,3}(?:[\s  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:₽|руб\b|руб\.|р\.)/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/\D/g, '')) + (m[2] ? Number(`0.${m[2]}`) : 0);
  return n > 0 ? n : undefined;
}

/** Pages that are a bot check rather than the product. */
const WALL = /проверяем браузер|нет соединения|access denied|robot|captcha|just a moment|attention required|доступ ограничен/i;

/** CORS-friendly copy of a picture from any site. */
export const proxied = (img: string, w = 900) => `https://wsrv.nl/?url=${encodeURIComponent(img)}&w=${w}&output=png`;

const wbPath = (nm: number) => `vol${Math.floor(nm / 1e5)}/part${Math.floor(nm / 1e3)}/${nm}`;
const WB_HOSTS = 48;

/** Last volume on each CDN shard, as Wildberries' own site maps them; newer shards are guessed. */
const WB_VOLS = [143, 287, 431, 719, 1007, 1061, 1115, 1169, 1313, 1601, 1655, 1919, 2045, 2189, 2405, 2621, 2837, 3053, 3269, 3485, 3701, 3917, 4133, 4349, 4565, 4877];

export function wbShard(nm: number): number {
  const vol = Math.floor(nm / 1e5);
  const i = WB_VOLS.findIndex((v) => vol <= v);
  return i >= 0 ? i + 1 : Math.min(WB_HOSTS, WB_VOLS.length + 1 + Math.floor((vol - WB_VOLS.at(-1)! - 1) / 216));
}

interface WbCard {
  imt_name?: string;
  subj_name?: string;
}

async function wbCard(nm: number, shard: number, signal: AbortSignal) {
  const b = `https://basket-${String(shard).padStart(2, '0')}.wbbasket.ru/${wbPath(nm)}`;
  const res = await fetch(`${b}/info/ru/card.json`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return { b, card: (await res.json()) as WbCard };
}

/** The shard is guessed from the article first; when the guess misses, all of them are asked at once. */
async function wbProduct(nm: number, url: string, signal?: AbortSignal): Promise<Product> {
  const stop = new AbortController();
  const abort = () => stop.abort();
  signal?.addEventListener('abort', abort);
  try {
    const guess = wbShard(nm);
    const { b, card } = await wbCard(nm, guess, stop.signal).catch(() =>
      Promise.any(
        Array.from({ length: WB_HOSTS }, (_, i) => i + 1)
          .filter((s) => s !== guess)
          .map((s) => wbCard(nm, s, stop.signal)),
      ),
    );
    stop.abort();
    const price = await fetch(`${b}/info/price-history.json`, { signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ price?: { RUB?: number } }[]>) : []))
      .then((h) => h.at(-1)?.price?.RUB)
      .catch(() => undefined);
    return {
      url,
      shop: 'Wildberries',
      title: card.imt_name?.trim() || undefined,
      category: card.subj_name,
      price: price ? Math.round(price / 100) : undefined,
      image: `${b}/images/big/1.webp`,
    };
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

interface Microlink {
  status: string;
  data?: { title?: string | null; description?: string | null; image?: { url?: string } | null };
}

async function pageProduct(url: string, signal?: AbortSignal): Promise<Product> {
  const shop = shopOf(url);
  const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal });
  const json = (await res.json()) as Microlink;
  const d = json.status === 'success' ? json.data : undefined;
  const title = d?.title && !WALL.test(d.title) && d.title !== '...' ? shortTitle(cleanTitle(d.title)) : undefined;
  const image = d?.image?.url && !/challenge|incident|captcha|favicon|logo/i.test(d.image.url) ? d.image.url : undefined;
  if (!title && !image) return { url, shop };
  return { url, shop, title, image: image && proxied(image), price: rublesIn(`${d?.title ?? ''} ${d?.description ?? ''}`) };
}

/** Whatever the link gives away; fields it could not read stay empty for the user to fill. */
export async function lookup(url: string, signal?: AbortSignal): Promise<Product> {
  const nm = wbArticle(url);
  try {
    if (nm) return await wbProduct(nm, url, signal);
    if (shopOf(url) === 'Ozon') return { url, shop: 'Ozon' };
    return await pageProduct(url, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    return { url, shop: shopOf(url) };
  }
}

/** The product photo as bytes, or null when the site would not give it. */
export async function fetchImage(src: string, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const res = await fetch(src, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  }
}
