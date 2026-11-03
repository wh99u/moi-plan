import { useSyncExternalStore } from 'react';
import { actions } from '../../lib/appStore';
import { accountId, balance, setBalance } from './account';
import { parseBankMessage } from './bankText';
import { money } from './logic';

export type Ingest =
  | { ok: true; text: string; undo: () => void }
  | { ok: false; reason: 'unread' | 'repeat' };

/** The same message arriving twice in this window is one operation, not two. */
const REPEAT_WINDOW = 120_000;

function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Turns a bank's message into an operation, and trusts its balance over our sum. */
export function ingestBankMessage(text: string, now = Date.now()): Ingest {
  const msg = parseBankMessage(text);
  if (!msg) return { ok: false, reason: 'unread' };
  if (!actions.markLaunch(`sms:${hash(text.trim())}:${Math.floor(now / REPEAT_WINDOW)}`)) return { ok: false, reason: 'repeat' };

  const account = accountId();
  const before = balance();
  const id = msg.kind === 'in' ? actions.topUp(account, msg.amount, 'shortcut', msg.title).id : actions.spendFrom(account, msg.amount, { title: msg.title, auto: true }).id;
  if (msg.balance !== undefined) setBalance(msg.balance);

  return {
    ok: true,
    text: `${msg.kind === 'in' ? '+' : '−'}${money(msg.amount)}`,
    undo: () => {
      if (msg.kind === 'in') actions.revertTopUp(id);
      else actions.revertSpend(id);
      setBalance(before);
    },
  };
}

/* ───────── what the screen says about it ───────── */

export interface Notice {
  text: string;
  undo?: () => void;
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
