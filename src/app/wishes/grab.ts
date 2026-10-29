/*
 * Products read off a shop page the user has open in their own browser: an iOS shortcut runs this
 * in Safari («Поделиться» → «В Мой план»), a bookmark runs it on a computer. The page is the one
 * the shop showed the user, so nothing is fetched from outside. The result goes to the clipboard
 * as one line and is pasted into the app (see paste.ts).
 *
 * `grabPage` is sent to the page as source text, so it must not use anything from outside its body.
 */

export interface Grabbed {
  url: string;
  title: string;
  price?: number;
  image?: string;
}

/** A product page gives one product; a cart, a shared list or a catalogue gives every product on it. */
export function grabPage(doc: Document): Grabbed[] {
  const MAX = 60;
  const base = doc.location?.href || doc.baseURI;
  const abs = (u: string | null | undefined) => {
    if (!u || /^(data|blob|javascript):/i.test(u)) return '';
    try {
      return new URL(u, base).href;
    } catch {
      return '';
    }
  };
  // Ozon serves thumbnails as …/wc250/…; the same picture comes bigger as wc1000.
  const big = (u: string) => u.replace(/\/wc\d{2,4}\//, '/wc1000/');
  const tidy = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
  const toPrice = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[\s   ]/g, '').replace(',', '.'));
    return n > 0 && n < 1e8 ? Math.round(n) : undefined;
  };
  const rubles = (text: string) => {
    const m = text.match(/(\d{1,3}(?:[\s   ]\d{3})+|\d+)(?:[.,]\d{1,2})?[\s   ]*(?:₽|руб)/i);
    return m ? toPrice(m[1]) : undefined;
  };

  /* 1. Structured data the shop publishes for search engines. */
  const nodes: Record<string, unknown>[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    nodes.push(o);
    if (o['@graph']) walk(o['@graph']);
    if (o.itemListElement) walk(o.itemListElement);
    if (o.item) walk(o.item);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      walk(JSON.parse(s.textContent || ''));
    } catch {
      /* not JSON after all */
    }
  });
  const isProduct = (o: Record<string, unknown>) => [o['@type']].flat().some((t) => /^(Product|ProductGroup|IndividualProduct)$/.test(String(t)));
  const imageOf = (v: unknown): string => {
    if (Array.isArray(v)) return imageOf(v[0]);
    if (v && typeof v === 'object') return imageOf((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).contentUrl);
    return typeof v === 'string' ? abs(v) : '';
  };
  const priceOf = (v: unknown): number | undefined => {
    if (Array.isArray(v)) return v.map(priceOf).find(Boolean);
    if (!v || typeof v !== 'object') return undefined;
    const o = v as Record<string, unknown>;
    return toPrice(o.price) ?? toPrice(o.lowPrice) ?? priceOf(o.offers) ?? priceOf(o.priceSpecification);
  };
  const fromLd = nodes.filter(isProduct).map(
    (o): Grabbed => ({
      url: abs(String(o.url || '')) || '',
      title: tidy(String(o.name || '')),
      price: priceOf(o.offers),
      image: big(imageOf(o.image)) || undefined,
    }),
  );
  const canonical = abs(doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href')) || base;
  if (fromLd.length === 1 && fromLd[0].title) return [{ ...fromLd[0], url: fromLd[0].url || canonical }];

  /* 2. Product tiles: every link to a product page, with the box around it that holds only that product. */
  const key = (href: string) => {
    try {
      const u = new URL(href);
      const ozon = u.pathname.match(/\/product\/[^/]+/);
      if (ozon) return u.origin.replace('//ozon.', '//www.ozon.') + ozon[0] + '/';
      const wb = u.pathname.match(/\/catalog\/(\d{5,12})\/detail/);
      if (wb) return `${u.origin}/catalog/${wb[1]}/detail.aspx`;
    } catch {
      /* skip */
    }
    return '';
  };
  const groups = new Map<string, HTMLAnchorElement[]>();
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const k = key(abs(a.getAttribute('href')));
    if (k) groups.set(k, [...(groups.get(k) ?? []), a]);
  });
  const keysIn = (el: Element) => {
    const s = new Set<string>();
    el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const k = key(abs(a.getAttribute('href')));
      if (k) s.add(k);
    });
    return s.size;
  };
  const textOf = (el: Element) => {
    const out: string[] = [];
    const w = doc.createTreeWalker(el, 4);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = tidy(n.nodeValue);
      if (t && n.parentElement && !/^(SCRIPT|STYLE|S|DEL)$/.test(n.parentElement.tagName)) out.push(t);
    }
    return out.join(' \n ');
  };

  const tiles = [...groups].map(([url, links]) => {
    let box: Element = links[0];
    while (box.parentElement && box.parentElement !== doc.body && keysIn(box.parentElement) <= 1) box = box.parentElement;
    const named = links
      .map((a) => tidy(a.textContent))
      .filter((t) => t.length > 3 && !/\d[\s   ]*₽/.test(t))
      .sort((a, b) => b.length - a.length)[0];
    const img = [...box.querySelectorAll('img')].find((i) => {
      const src = i.getAttribute('src') || '';
      return src && !/^data:/.test(src) && !/(icon|logo|sprite|badge)/i.test(src);
    });
    const title = named || tidy(img?.getAttribute('alt'));
    const src = img ? abs(img.getAttribute('src')) : '';
    return {
      item: { url, title, price: rubles(textOf(box)), image: src ? big(src) : undefined } as Grabbed,
      // A cart lets each line be ticked; recommendations under it do not.
      ticked: !!box.querySelector('input[type="checkbox"], [role="checkbox"]'),
    };
  });
  const named = tiles.filter((t) => t.item.title);
  const ticked = named.filter((t) => t.ticked);
  const list = (ticked.length ? ticked : named).map((t) => t.item).slice(0, MAX);
  if (list.length) return list;

  /* 3. A page with no tiles: its own preview card. */
  const meta = (p: string) => doc.querySelector<HTMLMetaElement>(`meta[property="${p}"], meta[name="${p}"], meta[itemprop="${p}"]`)?.content;
  const title = tidy(meta('og:title') || doc.querySelector('h1')?.textContent || doc.title);
  if (!title) return [];
  const image = abs(meta('og:image'));
  return [{ url: canonical, title, price: toPrice(meta('product:price:amount') || meta('price')), image: image ? big(image) : undefined }];
}

/** Marks a clipboard line as products for the app, so any other text is never mistaken for one. */
export const GRAB_PREFIX = 'moi-plan/wishes:';

/** Shortcut action «Выполнить JavaScript на веб-странице»: Shortcuts hands back what `completion` gets. */
export const shortcutScript = () => `completion(${JSON.stringify(GRAB_PREFIX)} + JSON.stringify((${grabPage.toString()})(document)));`;

/** A bookmark that copies the products of the open page. */
export function bookmarklet(): string {
  const body = `(function(){var items=(${grabPage.toString()})(document);if(!items.length){alert('Мой план: на странице не нашлось товаров');return}var text=${JSON.stringify(GRAB_PREFIX)}+JSON.stringify(items);var done=function(){alert('Мой план: скопировано товаров — '+items.length+'. Вставьте в «Желания».')};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,function(){prompt('Скопируйте и вставьте в «Мой план»',text)})}else{prompt('Скопируйте и вставьте в «Мой план»',text)}})();`;
  return `javascript:${encodeURIComponent(body)}`;
}
