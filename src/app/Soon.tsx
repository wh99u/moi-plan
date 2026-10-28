import { motion } from 'motion/react';
import { Icon } from '../ui/Icon';
import { section, type Route } from './route';
import { EASE, MorphText } from './ui/text';

/** Placeholder for sections that are not built yet. */
export function Soon({ route }: { route: Route }) {
  const s = section(route);
  return (
    <div className="soon">
      <motion.div className="soon-orbit" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1, ease: EASE }}>
        <span className="soon-ring" />
        <span className="soon-ring soon-ring--2" />
        <span className="soon-sat" />
        <span className="soon-icon">
          <Icon name={s.icon} size={34} stroke={1.6} />
        </span>
      </motion.div>
      <h1 className="t-display soon-title">
        <MorphText text={s.label} delay={0.15} />
      </h1>
      <motion.p className="t-body muted" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: EASE }}>
        {s.hint}
      </motion.p>
      <motion.span className="soon-chip t-label" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7, type: 'spring', stiffness: 300, damping: 18 }}>
        <span className="soon-chip-text">Скоро</span>
      </motion.span>
    </div>
  );
}
