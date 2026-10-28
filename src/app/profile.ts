import { useSyncExternalStore } from 'react';

/** Same key as the previous site, so a name typed there carries over. */
const KEY = 'site_profile_v1';
const SEEN = 'app_last_seen';

export interface Profile {
  name: string;
  picture?: string;
  /** Where the name came from: the Google account or typed by hand. */
  via?: 'google' | 'manual';
}

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { name: '', ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    /* fall back to an empty profile */
  }
  return { name: '' };
}

let profile = read();
const listeners = new Set<() => void>();

export function setProfile(patch: Partial<Profile>) {
  profile = { ...profile, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* keeps working for this visit */
  }
  listeners.forEach((l) => l());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useProfile = () => useSyncExternalStore(subscribe, () => profile);

/** «Иван Богоцкий» from Google → «Иван» in the greeting. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** True when this browser has opened the app before; read once per page load. */
export const isReturning = (() => {
  try {
    const seen = localStorage.getItem(SEEN);
    localStorage.setItem(SEEN, String(Date.now()));
    return !!seen;
  } catch {
    return false;
  }
})();

/** 5–12 утро, 12–18 день, 18–23 вечер, остальное ночь. */
export function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}
