import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { EASE } from '../ui/text';
import { convert, useCurrency } from './currency';

const MASK = '••••';

/**
 * A big amount in whole roubles or dollars that counts to its value and to every new one. A change
 * of currency is the exception: it happens under the smear, so the number jumps straight there.
 */
export function Amt({ rub, hidden = false, delay = 0 }: { rub: number; hidden?: boolean; delay?: number }) {
  const { cur, rate } = useCurrency();
  const dollars = cur === 'USD' && !!rate;
  const value = Math.round(convert(rub, cur, rate));
  const mv = useMotionValue(0);
  const shown = useTransform(mv, (v) => Math.round(v).toLocaleString('ru-RU').replace(/\s/g, ' ').replace('-', '−'));
  const wasDollars = useRef(dollars);
  const wait = useRef(delay);

  useEffect(() => {
    if (wasDollars.current !== dollars) {
      wasDollars.current = dollars;
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 1.1, delay: wait.current, ease: EASE });
    wait.current = 0;
    return () => c.stop();
  }, [mv, value, dollars]);

  if (hidden) return <span className="b-amt">{MASK}</span>;
  return (
    <span className="b-amt t-num">
      <motion.span>{shown}</motion.span>
      <span className="b-sym">{dollars ? '$' : '₽'}</span>
    </span>
  );
}
