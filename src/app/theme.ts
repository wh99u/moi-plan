import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'app_theme';
const BAR: Record<Theme, string> = { dark: '#0c0608', light: '#f6f1f0' };
const mq = matchMedia('(prefers-color-scheme: dark)');

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* private mode: follow the system */
  }
  return 'system';
}

const resolve = (p: ThemePref): Theme => (p === 'system' ? (mq.matches ? 'dark' : 'light') : p);

let state = { pref: read(), theme: resolve(read()) };
const listeners = new Set<() => void>();

function apply() {
  const el = document.documentElement;
  el.dataset.theme = state.theme;
  el.style.colorScheme = state.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[state.theme]);
}

function commit(pref: ThemePref) {
  state = { pref, theme: resolve(pref) };
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* keeps working for this visit */
  }
  apply();
  listeners.forEach((l) => l());
}

mq.addEventListener('change', () => state.pref === 'system' && commit('system'));
apply();

/**
 * Switches the theme with a circle that grows from the tapped point (View Transitions API).
 * Browsers without it, or with reduced motion, just swap instantly.
 */
export function setThemePref(pref: ThemePref, from?: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const changes = resolve(pref) !== state.theme;
  if (!changes || !doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commit(pref);
    return;
  }
  const { x, y } = from ?? { x: innerWidth / 2, y: 0 };
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = doc.startViewTransition(() => commit(pref));
  vt.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 720, easing: 'cubic-bezier(0.65, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {
      /* transition skipped: the theme is already applied */
    });
}

export const toggleTheme = (from?: { x: number; y: number }) => setThemePref(state.theme === 'dark' ? 'light' : 'dark', from);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useTheme = () => useSyncExternalStore(subscribe, () => state);
