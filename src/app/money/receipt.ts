import type { SpendItem } from '../../lib/types';

/*
 * Turning a photographed receipt into a spend. Russian fiscal receipts carry a QR code with the
 * exact total and time; the lines themselves come from OCR text, which is noisy, so the parser
 * is forgiving and the user confirms everything before saving.
 */

export interface ParsedReceipt {
  store?: string;
  items: SpendItem[];
  total?: number;
  date?: string;
  /** Budget category the store usually belongs to. */
  catName?: string;
}

/** `t=20261028T1531&s=246.76&fn=…` → total and date. */
export function parseFiscalQr(text: string): { total: number; date: string } | null {
  const q = new URLSearchParams(text.trim().replace(/^.*?\?/, ''));
  const s = Number(q.get('s')?.replace(',', '.'));
  const t = q.get('t')?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!s || !t) return null;
  return { total: Math.round(s * 100) / 100, date: `${t[1]}-${t[2]}-${t[3]}` };
}

const STORES: [RegExp, string, string][] = [
  [/п[яa]т[её]р[оo]чк/i, 'Пятёрочка', 'Еда'],
  [/перекр[её]ст/i, 'Перекрёсток', 'Еда'],
  [/магнит/i, 'Магнит', 'Еда'],
  [/вкусвилл|вкус\s*вилл/i, 'ВкусВилл', 'Еда'],
  [/\bлента\b/i, 'Лента', 'Еда'],
  [/ашан|auchan/i, 'Ашан', 'Еда'],
  [/дикси/i, 'Дикси', 'Еда'],
  [/о['’]?к[еэ]й|okey/i, 'О’кей', 'Еда'],
  [/spar|спар\b/i, 'Spar', 'Еда'],
  [/светофор/i, 'Светофор', 'Еда'],
  [/азбука\s*вкуса/i, 'Азбука вкуса', 'Еда'],
  [/metro|\bметро\b/i, 'Metro', 'Еда'],
  [/самокат/i, 'Самокат', 'Еда'],
  [/красное\s*[&и]\s*белое/i, 'Красное&Белое', 'Еда'],
  [/вкусно\s*[-—–]?\s*и\s*точка/i, 'Вкусно — и точка', 'Еда'],
  [/додо/i, 'Додо Пицца', 'Еда'],
  [/fix\s*price|фикс\s*прайс/i, 'Fix Price', 'Развлечения'],
  [/аптек|ригла|горздрав/i, 'Аптека', 'Здоровье'],
  [/лукойл|роснефть|газпромнефть|азс/i, 'АЗС', 'Транспорт'],
];

/** Lines that are about the payment, the till or the tax office, never a product. */
const SERVICE =
  /итог|сумм[аы]|ндс|налич|безнал|карт[аой]|электрон|сдач|ккт|\bфн\b|\bфд\b|\bфп\b|инн|смена|кассир|приход|расч[её]т|оплат|получено|скидк|бонус|баланс|телефон|сайт|адрес|кассов|чек\b|\bсно\b|\bосн\b|\bусн\b|www|http|\S+@\S+\.\w|благодар|спасибо|покупк[аи]\s*№|продавец|магазин\s*№|ofd|офд|налог/i;

const PRICE = /(\d{1,6})[.,](\d{2})(?!\d)/g;
const toNum = (m: RegExpMatchArray) => Number(`${m[1]}.${m[2]}`);
const hasLetters = (s: string) => /[a-zа-яё]{2,}/i.test(s);

/** OCR reads «0» as «О», «@» or «©» and «,» as «.» inside numbers; also drops junk around prices. */
function normalise(line: string) {
  return line
    .replace(/[@©®](?=[.,]?\d)/g, '0')
    .replace(/(?<=\d)[OoОо](?=\d)/g, '0')
    .replace(/(?<=\d)\s+(?=[.,]\d{2}\b)/g, '')
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «2. Молоко 3,2% 1л  1 x 89.99 =89.99» → «Молоко 3,2% 1л». */
function cleanName(s: string) {
  return s
    .replace(/^\s*\d{1,3}\s*[.)]\s*/, '')
    .replace(/\s*\d+(?:[.,]\d+)?\s*(?:шт\.?|кг)?\s*[xх*×]\s*[\d.,]+\s*(?:=\s*[\d.,]*)?\s*$/i, '')
    .replace(/[\s=*:.]+$/, '')
    .replace(/^["«']|["»']$/g, '')
    .trim();
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(normalise).filter(Boolean);
  const out: ParsedReceipt = { items: [] };

  for (const line of lines) {
    const hit = STORES.find(([re]) => re.test(line));
    if (hit) {
      out.store = hit[1];
      out.catName = hit[2];
      break;
    }
  }

  for (const line of lines) {
    const d = line.match(/\b(\d{2})[./](\d{2})[./](\d{2,4})\b/);
    if (d) {
      const y = d[3].length === 2 ? `20${d[3]}` : d[3];
      if (+d[1] <= 31 && +d[2] <= 12) {
        out.date = `${y}-${d[2]}-${d[1]}`;
        break;
      }
    }
  }

  let pending: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prices = [...line.matchAll(PRICE)];

    if (/итог/i.test(line)) {
      const p = prices.at(-1) ?? [...(lines[i + 1] ?? '').matchAll(PRICE)].at(-1);
      if (p && out.total === undefined) out.total = toNum(p);
      pending = null;
      continue;
    }
    if (SERVICE.test(line)) {
      pending = null;
      continue;
    }
    if (!prices.length) {
      // A name on its own line; its price follows on the next one.
      pending = hasLetters(line) ? cleanName(line) : pending;
      continue;
    }
    const price = toNum(prices.at(-1)!);
    const before = line.slice(0, prices.at(-1)!.index).trim();
    if (hasLetters(before)) {
      const name = cleanName(before);
      if (name) out.items.push({ name, price });
      pending = null;
    } else if (pending) {
      // «1 x 89.99 =89.99» under the name.
      out.items.push({ name: pending, price });
      pending = null;
    }
  }

  if (out.total === undefined && out.items.length) out.total = Math.round(out.items.reduce((t, x) => t + x.price, 0) * 100) / 100;
  return out;
}

/** Store-name guess for a spend typed by hand: «пятерочка» → Пятёрочка, «Еда». */
export function storeHint(title: string) {
  const hit = STORES.find(([re]) => re.test(title));
  return hit ? { store: hit[1], catName: hit[2] } : null;
}
