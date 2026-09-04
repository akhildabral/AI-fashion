/** A brass arc — the only spinning thing in the system. */
export interface SpinnerProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}
export function Spinner(props: SpinnerProps): JSX.Element

export interface SkeletonBlockProps {
  className?: string
  style?: React.CSSProperties
}
export function SkeletonBlock(props: SkeletonBlockProps): JSX.Element

export interface ArchSkeletonProps {
  count?: number
  aspect?: '3/4' | '4/5' | '5/6' | '1/1'
  /** grid-template-columns value. */
  columns?: string
  className?: string
  style?: React.CSSProperties
}
export function ArchSkeleton(props: ArchSkeletonProps): JSX.Element

export interface LoadErrorProps {
  message?: string
  onRetry?: () => void
  className?: string
  style?: React.CSSProperties
}
export function LoadError(props: LoadErrorProps): JSX.Element
