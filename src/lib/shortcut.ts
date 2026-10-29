/**
 * Finds an incoming amount in a bank notification. The same source must stay
 * valid for JavaScript (flags `iu`) and for ICU in iOS Shortcuts («Сопоставить текст»).
 */
export const AMOUNT_PATTERN = String.raw`(?:пополнение|зачисление|поступление|перевод от|входящий перевод|\+)[^\d+]{0,40}?\+?\s?(\d{1,3}(?:[\s ]\d{3})+|\d+)(?:[.,]\d{1,2})?\s?(?:₽|руб|rub|rur|р(?![а-яё]))`;

/** iOS Shortcuts has no flags field, so case-insensitivity goes inline. */
export const SHORTCUT_PATTERN = `(?i)${AMOUNT_PATTERN}`;

const AMOUNT_RE = new RegExp(AMOUNT_PATTERN, 'iu');

export function extractAmount(text: string): number | null {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/\D/g, ''));
  return n > 0 ? n : null;
}

/** Bot link (url, t.me/…, @name or name) → the link that opens its mini app with `startapp=<param>`. */
export function botAppUrl(botLink: string, param: string): string {
  let link = botLink.trim();
  if (!link) return '';
  if (link.startsWith('@')) link = `https://t.me/${link.slice(1)}`;
  else if (/^t\.me\//i.test(link)) link = `https://${link}`;
  else if (/^\w+$/.test(link)) link = `https://t.me/${link}`;
  return `${link}${link.includes('?') ? '&' : '?'}startapp=${param}`;
}

/** The URL the top-up shortcut opens, amount appended after it. */
export const shortcutUrl = (botLink: string) => botAppUrl(botLink, 'inc_');
