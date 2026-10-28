import { EASE } from './text';

/** Fade-and-rise entrance used by cards across the app. */
export const rise = (delay: number) => ({
  initial: { opacity: 0, y: 24, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
  transition: { delay, duration: 0.9, ease: EASE },
});
