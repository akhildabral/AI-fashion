/**
 * The arch: the one curved form. A brass bezel around a lit niche.
 * @startingPoint section="Surfaces" subtitle="The arch, the mirror and the plaque" viewport="700x360"
 */
export interface ArchProps {
  /** Frame aspect. The crown height follows automatically. */
  aspect?: '3/4' | '4/5' | '5/6' | '1/1' | '5/4' | '4/3'
  /** A photograph is lit by itself: drops the vitrine glow and the warm fill. */
  photo?: boolean
  /** A brighter bezel — the lit / selected state. */
  bright?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Arch(props: ArchProps): JSX.Element
