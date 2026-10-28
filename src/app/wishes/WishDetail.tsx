import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { actions, useStore } from '../../lib/appStore';
import { deleteImage } from '../../lib/images';
import { Icon } from '../../ui/Icon';
import { useImage } from '../../ui/useImage';
import { money } from '../money/logic';
import { closeSheet, openSheet, useSheet, useSheetData } from '../sheet';
import { EASE } from '../ui/text';
import { shopOf } from './link';
import { dueOf } from './logic';
import { artId, nameId, WishArt } from './WishCard';

const SPRING = { type: 'spring', stiffness: 320, damping: 34 } as const;

/** A wish opened full screen, after the reference: product on a light stage, details below. */
export function WishDetail() {
  const kind = useSheet();
  const { id } = useSheetData();
  const open = kind === 'wishView' && !!id;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSheet();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  return <AnimatePresence>{open && <Page key={id} id={id!} />}</AnimatePresence>;
}

function Page({ id }: { id: string }) {
  const buy = useStore((s) => s.shared.buys.find((b) => b.id === id && !b.deleted));
  const img = useImage(buy?.imgId);
  const [sure, setSure] = useState(false);
  const [done, setDone] = useState(false);
  if (!buy) return null;
  const due = dueOf(buy.due, new Date());
  const shop = buy.shop || (buy.url ? shopOf(buy.url) : '');
  const rise = (d: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 10 }, transition: { duration: 0.45, ease: EASE, delay: d } });

  const toggleBought = () => {
    setDone(true);
    setTimeout(() => {
      actions.updateBuy(buy.id, { boughtAt: buy.boughtAt ? undefined : Date.now() });
      closeSheet();
    }, 550);
  };

  return (
    <motion.div className="wd" role="dialog" aria-modal="true" aria-label={buy.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.1 } }}>
      <motion.div className="wd-top" initial={{ y: '-30%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-20%', opacity: 0 }} transition={SPRING}>
        <motion.button type="button" className="wd-back" aria-label="Назад" onClick={closeSheet} whileTap={{ scale: 0.88 }} {...rise(0.15)}>
          <Icon name="back" size={20} stroke={2.2} />
        </motion.button>
      </motion.div>
      <motion.div className="wd-art" layoutId={artId(id)} transition={SPRING}>
        <WishArt img={img} cut={buy.cut} title={buy.title} tint={buy.tint} />
      </motion.div>

      <div className="wd-body">
        <motion.span className="wd-cat t-caption" {...rise(0.12)}>
          {buy.category || shop || 'Хотелка'}
        </motion.span>
        <motion.h1 className="wd-name" layoutId={nameId(id)} transition={SPRING}>
          {buy.title}
        </motion.h1>
        {buy.note && (
          <motion.p className="wd-note t-body" {...rise(0.18)}>
            {buy.note}
          </motion.p>
        )}
        <motion.div className="wd-buy" {...rise(0.22)}>
          <span className="wd-price t-num">{buy.price ? money(buy.price) : 'Цена не указана'}</span>
          <motion.button type="button" className={`wd-act${done ? ' is-done' : ''}`} aria-label={buy.boughtAt ? 'Вернуть в список' : 'Купил'} onClick={toggleBought} whileTap={{ scale: 0.86 }}>
            <Icon name={done ? 'check' : buy.boughtAt ? 'repeat' : 'plus'} size={22} stroke={2.4} />
          </motion.button>
        </motion.div>

        <motion.section className="wd-sheet" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ ...SPRING, delay: 0.12 }}>
          <span className="wd-grip" />
          <h2 className="wd-sheet-title">Подробности</h2>
          <ul className="wd-rows">
            <li>
              <span>Срок</span>
              <span className={due?.urgent ? 'wd-urgent' : undefined}>{due ? due.long : 'без срока'}</span>
            </li>
            {shop && (
              <li>
                <span>Магазин</span>
                <span>{shop}</span>
              </li>
            )}
            {buy.boughtAt && (
              <li>
                <span>Куплено</span>
                <span>{new Date(buy.boughtAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
              </li>
            )}
          </ul>
          {buy.url && (
            <a className="wd-open" href={buy.url} target="_blank" rel="noopener noreferrer">
              Открыть в {shop || 'магазине'}
              <Icon name="arrowRight" size={18} stroke={2.2} />
            </a>
          )}
          <div className="wd-actions">
            <button type="button" className="wd-ghost" onClick={() => openSheet('wish', { id: buy.id })}>
              <Icon name="edit" size={17} />
              Изменить
            </button>
            <button
              type="button"
              className={`wd-ghost${sure ? ' is-sure' : ''}`}
              onClick={() => {
                if (!sure) return setSure(true);
                if (buy.imgId) void deleteImage(buy.imgId).catch(() => {});
                actions.deleteBuy(buy.id);
                closeSheet();
              }}
            >
              <Icon name="trash" size={17} />
              {sure ? 'Точно удалить?' : 'Удалить'}
            </button>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
