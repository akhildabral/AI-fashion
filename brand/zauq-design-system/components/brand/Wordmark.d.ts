/**
 * The ZAUQ wordmark as live type — Playfair Display caps, optically kerned.
 * @startingPoint section="Brand" subtitle="Wordmark and arch mark, every variant" viewport="700x200"
 */
export interface WordmarkProps {
  /** Font size in px (number) or any CSS length. Default 19. */
  size?: number | string
  /** Any CSS colour. Default currentColor. */
  color?: string
  /** Adds the gold rule beneath. Only at 200px wide and up. */
  ceremonial?: boolean
  className?: string
  style?: React.CSSProperties
}
export function Wordmark(props: WordmarkProps): JSX.Element
