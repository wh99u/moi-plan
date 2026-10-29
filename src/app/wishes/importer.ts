import { useSyncExternalStore } from 'react';
import { actions, appStore } from '../../lib/appStore';
import { cutoutFromBlob } from '../../lib/cutoutBrowser';
import { putImage } from '../../lib/images';
import { visible } from '../../lib/records';
import { toast } from '../../ui/Toast';
import { openSheet } from '../sheet';
import type { Grabbed } from './grab';
import { fetchImage, lookup, proxied, shopOf } from './link';
import { parsePasted, sameLink } from './paste';

/*
 * A pasted text → cards. Products the shortcut or the bookmark read off a page are added at once;
 * plain links are looked up a few at a time. Photos follow on their own, so the list fills fast.
 */

export interface ImportRun {
  total: number;
  done: number;
}

let run: ImportRun | null = null;
const listeners = new Set<() => void>();
const set = (next: ImportRun | null) => {
  run = next;
  listeners.forEach((l) => l());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useImportRun = () => useSyncExternalStore(subscribe, () => run);

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

/** The product photo, its plain backdrop taken off when it has one. */
async function attachPhoto(id: string, image: string) {
  const blob = (await fetchImage(image)) ?? (image.includes('wsrv.nl') ? null : await fetchImage(proxied(image)));
  if (!blob) return;
  try {
    const r = await cutoutFromBlob(blob, { removeBg: true });
    const imgId = await putImage(r.blob);
    actions.updateBuy(id, { imgId, tint: r.tint, cut: r.removed });
  } catch {
    /* an unreadable picture: the card keeps its icon */
  }
}

function add(g: Grabbed, extra: { category?: string; shop?: string } = {}) {
  const buy = actions.addBuy({ title: g.title.slice(0, 120), url: g.url, price: g.price ?? 0, shop: extra.shop || shopOf(g.url) || undefined, category: extra.category });
  if (g.image) void attachPhoto(buy.id, g.image);
}

/** Runs `work` over `list`, `n` at a time. */
async function pool<T>(list: T[], n: number, work: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await work(list[i++]);
  }));
}

/** False when the text has nothing to add; the caller then keeps it as typed. */
export function importText(text: string): boolean {
  const { grabbed, urls } = parsePasted(text);
  if (!grabbed.length && !urls.length) return false;
  if (run) {
    toast('Подождите, добавляю прошлые товары');
    return true;
  }

  const have = new Set(visible(appStore.get().shared.buys).filter((b) => !b.boughtAt && b.url).map((b) => sameLink(b.url)));
  const fresh = (u: string) => !have.has(sameLink(u));
  const toAdd = grabbed.filter((g) => fresh(g.url));
  const links = urls.filter(fresh);
  const ozon = links.filter((u) => shopOf(u) === 'Ozon');
  const lookups = links.filter((u) => shopOf(u) !== 'Ozon');
  const twice = grabbed.length + urls.length - toAdd.length - links.length;

  toAdd.forEach((g) => add(g));
  let added = toAdd.length;
  let missed = 0;

  const finish = () => {
    set(null);
    const parts: string[] = [];
    if (added) parts.push(`Добавлено ${added} ${plural(added, 'товар', 'товара', 'товаров')}`);
    if (twice) parts.push(`уже в списке: ${twice}`);
    if (missed) parts.push(`магазин не открыл ${missed} ${plural(missed, 'ссылку', 'ссылки', 'ссылок')}`);
    if (ozon.length)
      toast(`${parts.length ? `${parts.join(' · ')}. ` : ''}Ozon по ссылке не открывается — добавьте через Safari`, 'info', { label: 'Как', run: () => openSheet('wishImport') });
    else if (parts.length) toast(parts.join(' · '), added ? 'success' : 'info');
  };

  if (!lookups.length) {
    finish();
    return true;
  }
  set({ total: lookups.length, done: 0 });
  void pool(lookups, 3, async (url) => {
    const p = await lookup(url).catch(() => null);
    if (p?.title) {
      add({ url, title: p.title, price: p.price, image: p.image }, { category: p.category, shop: p.shop });
      added++;
    } else missed++;
    set({ total: lookups.length, done: (run?.done ?? 0) + 1 });
  }).finally(finish);
  return true;
}
