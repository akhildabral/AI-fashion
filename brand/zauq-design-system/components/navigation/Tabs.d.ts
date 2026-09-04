/**
 * Tabs: text on a hairline with a brass rule under the active one.
 * @startingPoint section="Navigation" subtitle="Tabs, filters and the overflow menu" viewport="700x300"
 */
export interface TabItem {
  key: string
  label: React.ReactNode
  /** Optional count, rendered small and un-tracked beside the label. */
  count?: number
}
export interface TabsProps {
  items: TabItem[]
  value: string
  onChange?: (key: string) => void
  /** Accessible name for the tablist. */
  label?: string
  className?: string
  style?: React.CSSProperties
}
export function Tabs(props: TabsProps): JSX.Element
