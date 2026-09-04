/** The arch mark: the brand's one curved form, at a locked 3:4. */
export interface ArchMarkProps {
  /** script = ذوق + rule (48px+); mirror = empty; bare = heavier outline; solid = filled (below 32px). */
  variant?: 'script' | 'mirror' | 'bare' | 'solid'
  /** Width in px; height is always 4/3 of it. Default 40. */
  size?: number
  /** Stroke or fill colour. Default the brand gold. */
  color?: string
  /** Colour of the ذوق script. Defaults to currentColor. */
  ink?: string
  className?: string
}
export function ArchMark(props: ArchMarkProps): JSX.Element
