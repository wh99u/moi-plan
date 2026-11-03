import { fallbacks } from './words';

/*
 * The product on its card is a white line icon from Iconify — a free, keyless library of
 * open icon sets (200 000+ icons). Searched by the English name; the chosen icon is saved on
 * the device as an SVG, so the card shows it offline too.
 */

const API = 'https://api.iconify.design';

/** Sets whose object icons look best as one big white glyph, best first. */
const PREFERRED = ['iconoven', 'tabler', 'lucide', 'lucide-lab', 'hugeicons', 'mingcute', 'mdi', 'material-symbols', 'solar', 'ph', 'game-icons'];
/** Sets that are colourful, brand logos or app icons even with the colour filter on. */
const SKIP = /^(icon-park|arcticons|selfhst|thesvg|logos|skill-icons|devicon|simple-icons|vscode-icons|flat-color|fluent-emoji|noto|twemoji|emojione|openmoji|streamline-.*color|.*-color)$/;
/** Variants that read poorly when big and white. */
const SKIP_NAME = /-(off|slash|duotone|twotone|two-tone|broken|bold-duotone|line-duotone)(-|$)/;

/** Filled glyphs: kept, but after the outline ones, so the cards share one line style. */
const FILLED = /-(fill|filled|solid|bold|sharp)(-|$)/;

/** Iconify ids → the clean ones: outlines first, the preferred sets first, otherwise in Iconify's order. */
export function rankIcons(ids: string[]): string[] {
  const rank = (id: string) => {
    const [prefix, name = ''] = id.split(':');
    const i = PREFERRED.indexOf(prefix);
    return (FILLED.test(name) ? 100 : 0) + (i < 0 ? PREFERRED.length : i);
  };
  return ids
    .filter((id) => {
      const [prefix, name = ''] = id.split(':');
      return !SKIP.test(prefix) && !SKIP_NAME.test(name);
    })
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((x) => x.id);
}

/** White SVG of an icon, sized for the card. */
export const iconUrl = (id: string, size = 256) => {
  const [prefix, name] = id.split(':');
  return `${API}/${prefix}/${name}.svg?color=%23ffffff&height=${size}`;
};

async function searchOnce(query: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API}/search?query=${encodeURIComponent(query)}&limit=64&palette=false`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = (await res.json()) as { icons?: string[] };
  return rankIcons(json.icons ?? []).slice(0, 12);
}

/** The first of the simpler queries that finds icons, and what it found. */
export async function searchIcons(query: string, signal?: AbortSignal): Promise<{ query: string; icons: string[] }> {
  for (const q of fallbacks(query)) {
    const icons = await searchOnce(q, signal);
    if (icons.length) return { query: q, icons };
  }
  return { query, icons: [] };
}

/** The icon itself, to keep on the device. */
export async function fetchIcon(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(iconUrl(id), { signal });
  if (!res.ok) throw new Error(String(res.status));
  return new Blob([await res.text()], { type: 'image/svg+xml' });
}
