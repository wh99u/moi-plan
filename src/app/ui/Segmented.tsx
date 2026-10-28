import { motion } from 'motion/react';

export function Segmented<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; name: string }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="segmented-opt t-caption" onClick={() => onChange(o.id)}>
          {value === o.id && <motion.span layoutId={`seg-${name}`} className="segmented-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="segmented-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

