import { useSyncExternalStore } from 'react';
import { actions, appStore } from '../../lib/appStore';
import { visible } from '../../lib/records';
import { BANK_NAMES } from '../../lib/types';
import { parseBankMessage } from './bankText';
import { money } from './logic';

export type Ingest =
  | { ok: true; text: string; undo: () => void }
  | { ok: false; reason: 'unread' | 'nocard' | 'repeat' };

/** The same message arriving twice in this window is one operation, not two. */
const REPEAT_WINDOW = 120_000;

function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Turns a bank's message into an entry on the right card, and trusts its balance over our sum. */
export function ingestBankMessage(text: string, now = Date.now()): Ingest {
  const msg = parseBankMessage(text);
  if (!msg) return { ok: false, reason: 'unread' };

  const s = appStore.get();
  const banks = visible(s.shared.banks).sort((a, b) => a.order - b.order);
  if (!banks.length) return { ok: false, reason: 'nocard' };
  if (!actions.markLaunch(`sms:${hash(text.trim())}:${Math.floor(now / REPEAT_WINDOW)}`)) return { ok: false, reason: 'repeat' };

  const bank = banks.find((b) => b.code === msg.bank) ?? banks.find((b) => b.id === s.personal.settings.lastTopUpBankId) ?? banks[0];
  const before = bank.sum;
  const id = msg.kind === 'in' ? actions.topUp(bank.id, msg.amount, 'shortcut', msg.title).id : actions.spendFrom(bank.id, msg.amount, { title: msg.title, auto: true }).id;
  if (msg.balance !== undefined) actions.updateBank(bank.id, { sum: msg.balance });

  return {
    ok: true,
    text: `${msg.kind === 'in' ? '+' : '−'}${money(msg.amount)}, ${BANK_NAMES[bank.code]}`,
    undo: () => {
      if (msg.kind === 'in') actions.revertTopUp(id);
      else actions.revertSpend(id);
      actions.updateBank(bank.id, { sum: before });
    },
  };
}

/* ───────── what the screen says about it ───────── */

export interface Notice {
  text: string;
  undo?: () => void;
  /** The way out when there is no card to put the money on. */
  needCard?: boolean;
}

let notice: Notice | null = null;
const listeners = new Set<() => void>();

export function setNotice(next: Notice | null) {
  notice = next;
  listeners.forEach((l) => l());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useNotice = () => useSyncExternalStore(subscribe, () => notice);

export function noticeOf(r: Ingest): Notice {
  if (r.ok) return { text: `Добавлено: ${r.text}`, undo: r.undo };
  if (r.reason === 'nocard') return { text: 'Сначала добавь карту, потом операции будут попадать на неё', needCard: true };
  if (r.reason === 'repeat') return { text: 'Это сообщение уже добавлено' };
  return { text: 'В сообщении нет суммы и типа операции, ничего не добавлено' };
}

/** `#/money?sms=…` → the message; null for any other address. */
export function bankLinkText(hash: string): string | null {
  const q = hash.indexOf('?');
  return q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('sms');
}

/** Handles a link from the phone's automation once, and drops the message from the address. */
export function takeBankLink() {
  const text = bankLinkText(location.hash);
  if (text === null) return;
  history.replaceState(null, '', '#/money');
  setNotice(noticeOf(ingestBankMessage(text)));
}
