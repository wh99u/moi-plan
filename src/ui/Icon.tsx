import type { CSSProperties } from 'react';

/* Static 24×24 line icons (stroke = currentColor). Filled shapes use class "f". */
const P: Record<string, string> = {
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3.5"/><path d="M3 10.5h18M15.5 15h2"/>',
  car: '<path d="M4 15l1.6-4.6A2 2 0 0 1 7.5 9h9a2 2 0 0 1 1.9 1.4L20 15v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 15h16"/>',
  bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path class="f" d="M8 5.2v13.6L19 12z"/>',
  pause: '<path class="f" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 15.9a5 5 0 0 1 6.8 0"/><circle class="f" cx="12" cy="19.2" r="1.3"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.7 4.7 0 0 0 7 18.5z"/>',
  receipt: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21zM9 8h6M9 12h6M9 16h3.5"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7.5 12h9"/>',
  minus: '<path d="M5 12h14"/>',
  repeat: '<path d="M17 2.5l3 3-3 3M4 11v-1.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 0 1-4 4H4"/>',
  dots: '<circle class="f" cx="6" cy="12" r="1.6"/><circle class="f" cx="12" cy="12" r="1.6"/><circle class="f" cx="18" cy="12" r="1.6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.3 5.6-6A4.6 4.6 0 0 0 18.5 6a4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.6 2.5 5.6 2.8 5.6 2.8A4.3 4.3 0 0 0 5.5 6a4.6 4.6 0 0 0-1.3 3.3c0 4.6 2.8 5.6 5.5 6a3 3 0 0 0-.8 2.3V21"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  transfer: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pie: '<path d="M12 3v9h9A9 9 0 1 1 12 3z"/><path d="M15.5 3.7A9 9 0 0 1 20.3 8.5h-4.8z"/>',
  bolt: '<path d="M13 3L5 13.5h6.2L10 21l8.5-10.5h-6.3z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9.5h18M7 15h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  bell: '<path d="M18 9.5a6 6 0 0 0-12 0c0 5.5-2.5 7-2.5 7h17s-2.5-1.5-2.5-7zM10 20a2.1 2.1 0 0 0 4 0"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  sparkle: '<path class="f" d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9zM18 13.5l.9 2.6 2.6.9-2.6.9L18 20.5l-.9-2.6-2.6-.9 2.6-.9z"/>',
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  // budget categories
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  food: '<path d="M3 4h2.2l2.3 10.6a1.2 1.2 0 0 0 1.2.9h8.6a1.2 1.2 0 0 0 1.2-.9L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="16.5" cy="19.5" r="1.3"/>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 18v2.5M16 18v2.5M8.5 14.5h.01M15.5 14.5h.01"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  fun: '<path d="M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4zM15 6v12"/>',
  health: '<path d="M12 20s-7.5-4.4-7.5-10.2A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M3 9h18M12 9C9 9 7 8 7 6s3-2 5 3c2-5 5-5 5-3s-2 3-5 3"/>',
  // shifts
  sun: '<circle class="f" cx="12" cy="12" r="4.4"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7"/>',
  moon: '<path class="f" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  // purchases (from the original app)
  table: '<rect x="3" y="8" width="18" height="3" rx="1"/><path d="M6 11v9M18 11v9"/>',
  chair: '<path d="M8 3h8v8H8zM6 11h12v3H6zM8 14v7M16 14v7"/>',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4H3zM6 17v2M18 17v2"/>',
  bed: '<path d="M3 19V6M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l.8-3h4.4L15 6M9 18l.8 3h4.4l.8-3M12 10v2.5l1.5 1"/>',
  shoe: '<path d="M3 16v-5l5-1 2 2h4l5 2v3H3zM3 19h18"/>',
  shirt: '<path d="M8 4L3 7l2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  lamp: '<path d="M8 3h8l3 8H5zM12 11v8M8 20h8"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M12 16l3-8"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6M12 17v4"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-3h3L15 7"/>',
};

const BY_TITLE: [RegExp, string][] = [
  [/стол|парт/i, 'table'],
  [/стул|кресл/i, 'chair'],
  [/диван/i, 'sofa'],
  [/кроват|матрас/i, 'bed'],
  [/телефон|айфон|iphone|смартфон/i, 'phone'],
  [/ноут|макбук|компьют|macbook/i, 'laptop'],
  [/науш|airpods/i, 'headphones'],
  [/часы|watch/i, 'watch'],
  [/кросс|обув|ботин|туфл/i, 'shoe'],
  [/куртк|футбол|худи|одежд|рубаш|джинс/i, 'shirt'],
  [/сумк|рюкзак/i, 'bag'],
  [/ламп|светиль/i, 'lamp'],
  [/велос/i, 'bike'],
  [/телев|монитор/i, 'tv'],
  [/книг/i, 'book'],
  [/камер|фотоаппарат/i, 'camera'],
];

export const iconForTitle = (title: string) => BY_TITLE.find(([re]) => re.test(title))?.[1] ?? 'gift';

interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 24, stroke = 1.8, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: (P[name] ?? P.gift).replace(/class="f"/g, 'fill="currentColor" stroke="none"') }}
    />
  );
}
