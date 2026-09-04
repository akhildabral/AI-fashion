/** An origin-aware overflow menu with a floating panel. */
export interface MoreMenuProps {
  /** A labelled control instead of the default ··· icon button. */
  trigger?: React.ReactNode
  align?: 'left' | 'right'
  /** Open above the trigger — for controls low on the screen. */
  up?: boolean
  label?: string
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function MoreMenu(props: MoreMenuProps): JSX.Element

export interface MenuItemProps {
  onClick?: () => void
  danger?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function MenuItem(props: MenuItemProps): JSX.Element
