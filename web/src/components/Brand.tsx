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
 */
export default function Brand({ size = 26, name = true, className }: Props) {
  const { t } = useI18n();

  return (
    <span className={['brand', className ?? ''].join(' ').trim()}>
      <Logo size={size} />
      <span className={name ? 'brand-name' : 'brand-name brand-name-off'}>{t('app.name')}</span>
    </span>
  );
}
