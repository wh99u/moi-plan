import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { haptic } from '../lib/telegram';
import { springs } from './motion';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Segmented control whose white pill slides between options. */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const group = useId();
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => {
            if (o.id !== value) haptic('selection');
            onChange(o.id);
          }}
        >
          {o.id === value && <motion.i className="seg-drop" layoutId={`seg-${group}`} transition={springs.snappy} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
