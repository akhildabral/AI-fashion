/**
 * The one action control. Brass fill leads a row; ghost outlines a secondary;
 * quiet is a text action on the same height scale.
 * @startingPoint section="Actions" subtitle="Buttons, icon buttons and chips, all states" viewport="700x260"
 */
export interface ButtonProps {
  /** primary = brass fill (one per row); ghost = outline; quiet = text; danger; dark = ink fill (marketing). */
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger' | 'dark'
  /** md = 44px (default), sm = 36px for cards and rails. */
  size?: 'md' | 'sm'
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Button(props: ButtonProps): JSX.Element
