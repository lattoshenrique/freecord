import Logo from './Logo';
import { useI18n } from '../i18n';
import './brand.css';

type Props = {
  /** Side of the mark, in px. */
  size?: number;
  /** Draw the name beside the mark. Off leaves the mark alone — the name
   *  stays in the markup for screen readers, since the mark is aria-hidden. */
  name?: boolean;
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
export default function Brand({ size = 26, name = true, className }: Props) {
  const { t } = useI18n();
  const word = t('app.name');

  return (
    <span className={['brand', className ?? ''].join(' ').trim()}>
      <Logo size={size} />
      <span className={name ? 'brand-name' : 'brand-name brand-name-off'}>
        <span className="brand-word" aria-hidden="true">
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
