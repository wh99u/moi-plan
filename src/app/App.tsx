import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Home } from './home/Home';
import { takeBankLink } from './money/auto';
import { MoneyPage } from './money/MoneyPage';
import { PlanPage } from './money/PlanPage';
import { Nav } from './Nav';
import { tabIndex, useRoute } from './route';
import { closeSheet } from './sheet';
import { Sheets } from './sheets';
import { Soon } from './Soon';
import { EASE } from './ui/text';

export function App() {
  const route = useRoute();
  // Pages slide in from the side of the tab they came from.
  const prev = useRef(route);
  const dir = Math.sign(tabIndex(route) - tabIndex(prev.current));
  useEffect(() => {
    prev.current = route;
    closeSheet();
    window.scrollTo({ top: 0 });
  }, [route]);

  // A bank's message can arrive through a link, at start or while the app is open.
  useEffect(() => {
    takeBankLink();
    addEventListener('hashchange', takeBankLink);
    return () => removeEventListener('hashchange', takeBankLink);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.main
            key={route}
            className={`page page--${route}`}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 28, filter: 'blur(10px)' }),
              center: { opacity: 1, x: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
              exit: (d: number) => ({ opacity: 0, x: d * -28, filter: 'blur(8px)' }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.42, ease: EASE }}
          >
            {route === 'home' ? <Home /> : route === 'money' ? <MoneyPage /> : route === 'plan' ? <PlanPage /> : <Soon route={route} />}
          </motion.main>
        </AnimatePresence>
        <Nav route={route} />
        <Sheets />
      </div>
    </MotionConfig>
  );
}
