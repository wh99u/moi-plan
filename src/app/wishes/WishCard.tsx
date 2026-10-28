import { motion } from 'motion/react';
import { useState } from 'react';
import { Icon, iconForTitle } from '../../ui/Icon';
import { money } from '../money/logic';
import type { Due } from './logic';

export interface Face {
  title: string;
  category?: string;
  price: number;
  due: Due | null;
  img: string | null;
  cut?: boolean;
  tint?: string;
}

/** The product itself: a cut-out stands free, a whole photo sits in a soft frame. */
export function WishArt({ img, cut, title, tint, className = '' }: Pick<Face, 'img' | 'cut' | 'title' | 'tint'> & { className?: string }) {
  if (img) return <img className={`wish-img ${cut ? 'is-cut' : 'is-photo'} ${className}`} src={img} alt="" draggable={false} />;
  return (
    <span className={`wish-ph ${className}`} style={tint ? { ['--tint' as string]: tint } : undefined}>
      <Icon name={iconForTitle(title)} size={40} stroke={1.5} />
    </span>
  );
}

/** Shared-element ids, so the card grows into its page. */
export const artId = (id: string) => `wish-art-${id}`;
export const nameId = (id: string) => `wish-name-${id}`;

/**
 * Card face, after the reference: one dark grey tile, category, name and price centred on top,
 * the product centred below and cut off by the bottom edge a little under its middle.
 */
export function WishFace({ face, id, hideArt, onAct }: { face: Face; id?: string; hideArt?: boolean; onAct?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <div className="wish-face">
      <div className="wish-text">
        <span className="wish-cat">
          {face.category || 'Хотелка'}
          {face.due && <span className={`wish-due${face.due.urgent ? ' is-urgent' : ''}`}> · {face.due.short}</span>}
        </span>
        <motion.span className="wish-name" layoutId={id && nameId(id)}>
          {face.title || 'Название'}
        </motion.span>
        <span className="wish-price t-num">{face.price ? money(face.price) : '— ₽'}</span>
      </div>
      <div className="wish-stage">
        {!hideArt && (
          <motion.div
            className="wish-art"
            layoutId={id && artId(id)}
            initial={{ y: 30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22, delay: 0.1 }}
          >
            <WishArt img={face.img} cut={face.cut} title={face.title} tint={face.tint} />
          </motion.div>
        )}
      </div>
      {onAct && (
        <motion.button
          type="button"
          className={`wish-act${done ? ' is-done' : ''}`}
          aria-label="Купил"
          whileTap={{ scale: 0.82 }}
          onClick={(e) => {
            e.stopPropagation();
            if (done) return;
            setDone(true);
            setTimeout(onAct, 650);
          }}
        >
          <motion.span key={done ? 'y' : 'n'} initial={{ scale: 0.4, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
            <Icon name={done ? 'check' : 'plus'} size={20} stroke={2.4} />
          </motion.span>
        </motion.button>
      )}
    </div>
  );
}
