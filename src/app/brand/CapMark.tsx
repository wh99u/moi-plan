import type { CSSProperties } from 'react';
import capLight from './cap-light.png';
import capMask from './cap-mask.png';

interface Props {
  size?: number;
  /** Flat silhouette in currentColor, for small spots like the tab bar. */
  mono?: boolean;
  /** Floats gently, the smoke trailing behind it. */
  animated?: boolean;
  className?: string;
}

/**
 * The brand: the owner's avatar, a cap dissolving into smoke. The full-colour version is a
 * light rendering of the photo for the dark hero; `mono` is its silhouette as a CSS mask.
 */
export function CapMark({ size = 32, mono = false, animated = false, className = '' }: Props) {
  const style: CSSProperties = mono
    ? { width: size, height: size, maskImage: `url(${capMask})`, WebkitMaskImage: `url(${capMask})` }
    : { width: size, height: size, backgroundImage: `url(${capLight})` };
  return <span className={`capmark${mono ? ' capmark--mono' : ''}${animated ? ' capmark--live' : ''} ${className}`} style={style} aria-hidden="true" />;
}
