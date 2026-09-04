/** A brass-engraved figure: the ledger's payoff surface. */
export interface PlaqueProps {
  /** The tracked uppercase eyebrow. */
  label?: string
  /** The figure itself — Bodoni, tabular numerals, brass. */
  value?: React.ReactNode
  /** A sans note trailing the figure, e.g. "earned back this month". */
  note?: string
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Plaque(props: PlaqueProps): JSX.Element
