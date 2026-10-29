import { GRAB_PREFIX, type Grabbed } from './grab';

export interface Pasted {
  /** Read off a shop page by the shortcut or the bookmark: ready cards. */
  grabbed: Grabbed[];
  /** Bare links, looked up one by one. */
  urls: string[];
}

const LINKS = /https?:\/\/[^\s<>"«»]+/gi;

/** Same product, however the link was shared: no tracking tail, no trailing slash, no «www.». */
export function sameLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Everything a pasted text holds: the app's own product line and any number of plain links. */
export function parsePasted(text: string): Pasted {
  const grabbed: Grabbed[] = [];
  let rest = text;
  const at = text.indexOf(GRAB_PREFIX);
  if (at >= 0) {
    try {
      const list = JSON.parse(text.slice(at + GRAB_PREFIX.length).trim()) as unknown;
      if (Array.isArray(list))
        for (const g of list as Partial<Grabbed>[])
          if (g && typeof g.title === 'string' && g.title.trim() && typeof g.url === 'string')
            grabbed.push({
              url: g.url,
              title: g.title.trim().slice(0, 200),
              price: typeof g.price === 'number' && g.price > 0 ? g.price : undefined,
              image: typeof g.image === 'string' && /^https?:/.test(g.image) ? g.image : undefined,
            });
      rest = text.slice(0, at);
    } catch {
      /* a cut-off copy: fall back to the links in it */
    }
  }
  const seen = new Set(grabbed.map((g) => sameLink(g.url)));
  const urls: string[] = [];
  for (const m of rest.match(LINKS) ?? []) {
    const url = m.replace(/[),.!?;:]+$/, '');
    const k = sameLink(url);
    if (seen.has(k)) continue;
    seen.add(k);
    urls.push(url);
  }
  return { grabbed, urls };
}
