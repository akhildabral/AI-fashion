/** The page container: one of three widths, consistent gutters. */
export interface PageShellProps {
  /** narrow = 768px (prose, auth); default = 1152px; wide = 1400px (boards, header). */
  width?: 'narrow' | 'default' | 'wide'
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function PageShell(props: PageShellProps): JSX.Element

export interface SectionHeadProps {
  title?: React.ReactNode
  /** Rendered flush right — usually a quiet Button or a MoreMenu. */
  action?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function SectionHead(props: SectionHeadProps): JSX.Element
