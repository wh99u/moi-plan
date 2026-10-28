import { useSyncExternalStore } from 'react';

export type SheetKind = 'more' | 'task' | 'profile' | 'spend' | 'spendView' | 'income' | 'budget' | 'category' | 'subs' | 'wish' | 'wishView' | 'dream' | 'dreamSave';

/** What a sheet is about: the month it works in, and the record it edits or shows. */
export interface SheetData {
  ym?: string;
  id?: string;
  /** Open the spend form straight into the receipt camera. */
  scan?: boolean;
}

let current: { kind: SheetKind; data: SheetData } | null = null;
const listeners = new Set<() => void>();

function set(next: typeof current) {
  if (next?.kind === current?.kind && next?.data === current?.data) return;
  current = next;
  listeners.forEach((l) => l());
}

export const openSheet = (kind: SheetKind, data: SheetData = {}) => set({ kind, data });
export const closeSheet = () => set(null);
export const toggleSheet = (kind: SheetKind) => set(current?.kind === kind ? null : { kind, data: {} });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useSheet = () => useSyncExternalStore(subscribe, () => current?.kind ?? null);
export const useSheetData = () => useSyncExternalStore(subscribe, () => current?.data ?? EMPTY);
const EMPTY: SheetData = {};
