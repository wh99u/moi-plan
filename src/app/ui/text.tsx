import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { Fragment, useEffect } from 'react';

export const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Text that writes itself in letter by letter (blur → sharp) and, when `text` changes,
 * lets the old letters drift up and out first. Words never break mid-word.
 */
export function MorphText({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const words = text.split(' ');
  let n = 0;
  return (
    <span className={`morph ${className}`} aria-label={text}>
      <AnimatePresence mode="wait" initial={true}>
        <motion.span
          key={text}
          className="morph-inner"
          aria-hidden="true"
          initial="hidden"
          animate="show"
          exit="exit"
          variants={{
            show: { transition: { staggerChildren: 0.028, delayChildren: delay } },
            exit: { transition: { staggerChildren: 0.012 } },
          }}
        >
          {words.map((w, wi) => (
            <Fragment key={wi}>
              {wi > 0 && ' '}
              <span className="morph-word">
              {[...w].map((c) => (
                <motion.span
                  key={n++}
                  className="morph-ch"
                  variants={{
                    hidden: { opacity: 0, y: '0.5em', filter: 'blur(10px)' },
                    show: { opacity: 1, y: '0em', filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE } },
                    exit: { opacity: 0, y: '-0.35em', filter: 'blur(8px)', transition: { duration: 0.32, ease: 'easeIn' } },
                  }}
                >
                  {c}
                </motion.span>
              ))}
              </span>
            </Fragment>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Each character in its own slot; a changed one rolls in from below, the old one rolls up. */
export function RollingText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`roll ${className}`} aria-label={text}>
      {[...text].map((c, i) => (
        <span key={i} className="roll-slot" aria-hidden="true">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={c}
              className="roll-ch"
              initial={{ y: '90%', opacity: 0, filter: 'blur(4px)' }}
              animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: '-90%', opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              {c}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/** Counts from the previous value to the new one; `group` adds thousands spaces: 35 652. */
export function CountUp({ value, delay = 0, group = false }: { value: number; delay?: number; group?: boolean }) {
  const mv = useMotionValue(0);
  const shown = useTransform(mv, (v) => (group ? Math.round(v).toLocaleString('ru-RU').replace(/\s/g, ' ') : Math.round(v).toString()));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, delay, ease: EASE });
    return () => c.stop();
  }, [mv, value, delay]);
  return <motion.span className="t-num">{shown}</motion.span>;
}
