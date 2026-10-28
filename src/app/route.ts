import { useSyncExternalStore } from 'react';

export type Tab = 'home' | 'money' | 'wishes' | 'tasks';
export type Extra = 'stocks' | 'sleep' | 'mood' | 'github' | 'jarvis';
export type Route = Tab | Extra;

export interface Section {
  id: Route;
  label: string;
  icon: string;
  hint: string;
}

/** Bottom bar, left to right. */
export const TABS: Section[] = [
  { id: 'home', label: 'Главная', icon: 'home', hint: '' },
  { id: 'money', label: 'Траты', icon: 'wallet', hint: 'Траты за месяц и общий бюджет' },
  { id: 'wishes', label: 'Желания', icon: 'heart', hint: 'Машина мечты и список желаний' },
  { id: 'tasks', label: 'Задачи', icon: 'calendar', hint: 'Календарь задач и смен' },
];

/** Everything behind the «Ещё» button. */
export const EXTRAS: Section[] = [
  { id: 'jarvis', label: 'Джарвис', icon: 'sparkle', hint: 'Личный ассистент' },
  { id: 'stocks', label: 'Акции', icon: 'trend', hint: 'Портфель и котировки' },
  { id: 'sleep', label: 'Сон', icon: 'moon', hint: 'Режим и качество сна' },
  { id: 'mood', label: 'Состояние', icon: 'smile', hint: 'Настроение и самочувствие' },
  { id: 'github', label: 'GitHub', icon: 'github', hint: 'Полезные приложения и файлы' },
];

const ALL = [...TABS, ...EXTRAS];
export const section = (r: Route) => ALL.find((s) => s.id === r)!;
export const tabIndex = (r: Route) => {
  const i = TABS.findIndex((t) => t.id === r);
  return i < 0 ? TABS.length : i;
};

/** Hash routes (#/money) keep GitHub Pages happy and make the browser «Back» work. */
function read(): Route {
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ALL.some((s) => s.id === path) ? (path as Route) : 'home';
}

let current = read();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = read();
  listeners.forEach((l) => l());
});

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useRoute = () => useSyncExternalStore(subscribe, () => current);

export const href = (r: Route) => `#/${r === 'home' ? '' : r}`;

export function navigate(r: Route) {
  location.hash = href(r);
}
