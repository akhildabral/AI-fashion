// The furniture every room shares: the header a room draws itself (a Bodoni
// title, an eyebrow, actions on the right) and the thumb-zone action bar that
// sits above the tab bar with the screen's one primary action.
import { type ReactNode } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline } from '@/src/design/tokens'
import { T } from './Text'

export function RoomHeader({ eyebrow, title, emphasis, lead, right, style }: { eyebrow?: string; title: string; emphasis?: string; lead?: string; right?: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headText}>
        {eyebrow ? (
          <T role="label" tone="faint">
            {eyebrow}
          </T>
        ) : null}
        <T role="h1" accessibilityRole="header">
          {title}
          {emphasis ? (
            <T role="h1" tone="brass" italic>
              {` ${emphasis}`}
            </T>
          ) : null}
        </T>
        {lead ? (
          <T role="body" tone="muted">
            {lead}
          </T>
        ) : null}
      </View>
      {right ? <View style={styles.headRight}>{right}</View> : null}
    </View>
  )
}

/** The floating native tab bar's footprint above the safe area (iOS 26 / Material). */
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 62 : 80

/** Space a scrolling screen must leave at the bottom when it has an ActionBar. */
export const ACTION_BAR_HEIGHT = 72 + TAB_BAR_HEIGHT

/**
 * The bar above the tab bar for the screen's primary action (and at most
 * one alternative). Thumb zone, always reachable, never scrolls away.
 */
export function ActionBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.bar,
        { bottom: insets.bottom + TAB_BAR_HEIGHT, backgroundColor: alpha(t.bone, 0.94), borderTopColor: alpha(t.ink, 0.1), paddingBottom: 12 },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 8, paddingBottom: 16 },
  headText: { flex: 1, gap: 6 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: gutter,
    paddingTop: 12,
    borderTopWidth: hairline,
  },
})
