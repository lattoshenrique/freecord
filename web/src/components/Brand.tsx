import { useLayoutEffect, useRef, useState } from 'react';
import Logo from './Logo';
import { useI18n } from '../i18n';
import './brand.css';

type Props = {
  /** Side of the mark, in px. */
  size?: number;
  /** Draw the name beside the mark. Off leaves the mark alone — the name
   *  stays in the markup for screen readers, since the mark is aria-hidden. */
  name?: boolean;
  /**
   * Play the full entrance: the mark arrives alone in the middle of the pair,
   * then walks left into place and writes the name as it goes. For the screen
   * that is nothing but the brand; a small link back home just fades in.
   */
  march?: boolean;
  className?: string;
};

/**
 * The mark and the name, as one thing.
 *
 * Every screen shows the brand at a different size and in a different
 * context — 88px alone in the middle of the home, 24px inside the link back
 * home on the prejoin and the two text pages — and some show the mark with
 * no name at all. So the component carries only what is the same everywhere:
 * the pair, in reading order, with the name spelled from the catalog.
 *
 * Colour, gap and type size belong to the surrounding screen: the name
 * inherits, and the callers' own classes (`.start-brand`, `.how-brand`, …)
 * dress it. That is what lets one component sit inside a link that lights up
 * on hover and inside a page title that does not.
 *
 * At rest the name is set plainly — the way the share card sets it
 * (web/public/og.png), so the brand looks the same wherever it turns up. It
 * is cut into one span per letter only so each can arrive on its own; the
 * pieces are hidden from assistive tech, since a word cut into eight is read
 * as eight words, and the whole name rides beside them unseen.
 */
export default function Brand({ size = 26, name = true, march, className }: Props) {
  const { t } = useI18n();
  const word = t('app.name');
  const rootRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  /**
   * How far right the mark starts, so that it starts centred on the pair:
   * half of everything that is not the mark. CSS cannot know the width of a
   * word, so we measure it and hand it over — before paint, so the first
   * frame is already the mark in the middle.
   */
  const [shift, setShift] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!march) {
      return;
    }
    const root = rootRef.current;
    const span = wordRef.current;
    if (!root || !span) {
      return;
    }
    const measure = () => {
      const gap = parseFloat(getComputedStyle(root).columnGap) || 0;
      setShift((span.offsetWidth + gap) / 2);
    };
    measure();
    /*
     * The word's width is not settled at first paint — the face may still be
     * loading, and the viewport decides the type size — and a walk that
     * starts from a stale measurement lands the mark off centre. Watching the
     * span covers both, and the walk is two seconds away either way.
     */
    const observer = new ResizeObserver(measure);
    observer.observe(span);
    return () => observer.disconnect();
  }, [march, word, size]);

  return (
    <span
      ref={rootRef}
      className={['brand', className ?? ''].join(' ').trim()}
      data-march={march && shift !== null ? 'true' : undefined}
      style={shift === null ? undefined : ({ '--brand-shift': `${shift}px` } as React.CSSProperties)}
    >
      <Logo size={size} />
      <span className={name ? 'brand-name' : 'brand-name brand-name-off'}>
        <span className="brand-word" aria-hidden="true" ref={wordRef}>
          {[...word].map((letter, index) => (
            <span
              key={index}
              className="brand-letter"
              style={
                {
                  '--i': index,
                  // While they are still arriving they cross over one
                  // another: earlier letters pass in front, always.
                  '--z': word.length - index,
                } as React.CSSProperties
              }
            >
              {letter}
            </span>
          ))}
        </span>
        <span className="brand-said">{word}</span>
      </span>
    </span>
  );
}
