import type { BankCode } from '../../lib/types';

export interface BankMessage {
  kind: 'in' | 'out';
  amount: number;
  /** Who paid or where the money went, when the message says it. */
  title?: string;
  /** Money left on the account after the operation. */
  balance?: number;
  bank?: BankCode;
}

/** «15 000», «1 234,50», «450» followed by a currency mark. */
const AMOUNT = String.raw`(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s?(?:₽|руб\.?|rub|rur|р\.?(?![а-яё]))`;
const BALANCE_RE = new RegExp(String.raw`(?:баланс|доступно|остаток)[^\d-]{0,12}${AMOUNT}`, 'iu');

/** Words that open a money-in or a money-out message. */
const IN_RE = /пополнени|зачислени|поступлени|перевод[^.\n]{0,40}\sот\s|входящий|получен|зарплат|кэшб[эе]к|возврат|\+\s?\d/iu;
const OUT_RE = /покупк|оплат|списани|снятие|платеж|платёж|перевод/iu;

const BANKS: [RegExp, BankCode][] = [
  [/т-?банк|тинькофф|tinkoff|t-?bank/iu, 'tbank'],
  [/сбер|sber/iu, 'sber'],
  [/альфа|alfa/iu, 'alfa'],
  [/втб|vtb/iu, 'vtb'],
  [/озон|ozon/iu, 'ozon'],
];

const toNumber = (whole: string, frac?: string) => Number(whole.replace(/\D/g, '')) + (frac ? Number(frac.padEnd(2, '0')) / 100 : 0);

/** What is written after the amount: the shop or the sender, without service words. */
function titleAfter(rest: string): string | undefined {
  const line = rest.split(/\n|(?:баланс|доступно|остаток)/iu)[0];
  const t = line
    .replace(/^[\s.,:;·—-]+/, '')
    .replace(/^(?:от|в|на|для)\s+/iu, '')
    .replace(/[\s.,:;·—-]+$/, '')
    .trim();
  return /\p{L}{2}/u.test(t) ? t.slice(0, 60) : undefined;
}

/**
 * Reads a bank's SMS, push or a screenshot's text. Returns null when no operation is recognised,
 * so an advert or a login code never turns into money.
 */
export function parseBankMessage(text: string): BankMessage | null {
  const src = text.replace(/\r/g, '').trim();
  if (!src) return null;

  const bal = BALANCE_RE.exec(src);
  const balance = bal ? toNumber(bal[1], bal[2]) : undefined;
  // The balance is an amount too; blank it so it is never taken for the operation.
  const body = bal ? src.slice(0, bal.index) + ' '.repeat(bal[0].length) + src.slice(bal.index + bal[0].length) : src;

  const inAt = body.search(IN_RE);
  const outAt = body.search(OUT_RE);
  if (inAt < 0 && outAt < 0) return null;
  const kind = inAt >= 0 && (outAt < 0 || inAt <= outAt) ? 'in' : 'out';

  const from = kind === 'in' ? inAt : outAt;
  const re = new RegExp(AMOUNT, 'iu');
  const after = re.exec(body.slice(from));
  const m = after ?? re.exec(body);
  if (!m) return null;
  const amount = toNumber(m[1], m[2]);
  if (!amount) return null;

  const end = (after ? from : 0) + m.index + m[0].length;
  const title = titleAfter(body.slice(end));
  const bank = BANKS.find(([r]) => r.test(src))?.[1];

  return { kind, amount, ...(title ? { title } : {}), ...(balance !== undefined ? { balance } : {}), ...(bank ? { bank } : {}) };
}
