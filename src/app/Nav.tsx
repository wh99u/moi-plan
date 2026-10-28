import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../ui/Icon';
import { CapMark } from './brand/CapMark';
import { TABS, href, type Route } from './route';
import { toggleSheet, useSheet } from './sheet';
import { EASE } from './ui/text';

const SPRING = { type: 'spring', stiffness: 460, damping: 36 } as const;

/** Floating dock: the four main sections in one pill, «Ещё» as its own round button. */
export function Nav({ route }: { route: Route }) {
  const sheet = useSheet();
  const moreOpen = sheet === 'more';
  const extraActive = !TABS.some((t) => t.id === route);

  return (
    <motion.div className="dock" initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5, duration: 0.9, ease: EASE }}>
      <nav className="tabbar" aria-label="Разделы">
        {TABS.map((t) => {
          const active = t.id === route;
          return (
            <motion.a
              key={t.id}
              layout
              transition={SPRING}
              href={href(t.id)}
              className={`tab${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={t.label}
              whileTap={{ scale: 0.88 }}
            >
              {active && <motion.span layoutId="tab-pill" className="tab-pill" transition={SPRING} />}
              <motion.span layout="position" className="tab-icon">
                {t.id === 'home' ? <CapMark size={30} mono /> : <Icon name={t.icon} size={22} stroke={1.9} />}
              </motion.span>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.span
                    className="tab-label t-caption"
                    initial={{ width: 0, opacity: 0, filter: 'blur(4px)' }}
                    animate={{ width: 'auto', opacity: 1, filter: 'blur(0px)' }}
                    exit={{ width: 0, opacity: 0, filter: 'blur(4px)' }}
                    transition={SPRING}
                  >
                    <span>{t.label}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.a>
          );
        })}
      </nav>
      <motion.button
        type="button"
        className={`dock-more${moreOpen || extraActive ? ' is-active' : ''}`}
        aria-label={moreOpen ? 'Закрыть' : 'Ещё разделы'}
        aria-expanded={moreOpen}
        onClick={() => toggleSheet('more')}
        whileTap={{ scale: 0.86 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={moreOpen ? 'x' : 'grid'}
            className="dock-more-icon"
            initial={{ rotate: -90, scale: 0.3, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            <Icon name={moreOpen ? 'close' : 'grid'} size={22} stroke={1.9} />
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}
