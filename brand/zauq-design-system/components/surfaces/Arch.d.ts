/**
 * The arch: the one curved form. A brass bezel around a lit niche.
 */
export interface ArchProps {
  /**
   * Frame aspect. The crown height follows automatically (a semicircle of
   * radius w/2). PORTRAIT ONLY — 1/1 is the widest an arch may be. A
   * landscape picture is a 3px rectangle, not an arch.
   */
  aspect?: '2/3' | '3/4' | '4/5' | '5/6' | '1/1'
  /** A photograph is lit by itself: drops the vitrine glow and the warm fill. */
  photo?: boolean
  /** A brighter bezel — the lit / selected state. */
  bright?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Arch(props: ArchProps): JSX.Element
