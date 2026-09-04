// The frame every sheet shares: an h2 title, a lead, the content, and the
// primary action pinned beneath, above the home indicator. Keyboard aware so
// a field near the bottom is never covered. Secondary flows are sheets, and
// so are destructive confirmations: never a system alert for anything with
// copy worth writing.
import { type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'
import { Screen } from './Screen'
import { SkeletonBlock } from './Skeleton'
import { T } from './Text'

export interface SheetShellProps {
  title: string
  /** A Bodoni italic clause in brass at the end of the title. */
  emphasis?: string
  lead?: string
  children?: ReactNode
  /** The primary `Button` (and at most one alternative), pinned in the thumb zone. */
  footer?: ReactNode
  /** The content is a list of rows or fields 16 apart, rather than blocks 32 apart. */
  dense?: boolean
  /** The list is still arriving: three rows of a thumb and a line stand in for the content. */
  busy?: boolean
  /** Gap between the blocks of the sheet: 32 by default (block to block). */
  contentStyle?: ViewStyle
}

export function SheetShell({ title, emphasis, lead, children, footer, dense, busy, contentStyle }: SheetShellProps) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Screen edges={[]}>
      <KeyboardAwareScrollView
        bottomOffset={space.xl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={[styles.body, dense && styles.dense, !footer && { paddingBottom: insets.bottom + space.xl }, contentStyle]}
      >
        <View style={styles.head}>
          <T role="h2" accessibilityRole="header">
            {title}
            {emphasis ? (
              <T role="h2" tone="brass" italic>
                {` ${emphasis}`}
              </T>
            ) : null}
          </T>
          {lead ? (
            <T role="bodySm" tone="muted">
              {lead}
            </T>
          ) : null}
        </View>
        {busy ? (
          <View style={styles.busy} accessibilityState={{ busy: true }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.busyRow}>
                <SkeletonBlock width={44} height={44} />
                <SkeletonBlock width={i === 1 ? '48%' : '64%'} height={14} />
              </View>
            ))}
          </View>
        ) : (
          children
        )}
      </KeyboardAwareScrollView>
      {footer ? <View style={[styles.footer, { borderTopColor: alpha(t.ink, 0.1), paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // The sheet's 24 padding; blocks 32 apart.
  body: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xl, gap: space.xxl },
  dense: { gap: space.lg },
  // Title to lead: the label-to-line 8.
  head: { gap: space.sm },
  busy: { gap: space.md },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: gutter, paddingTop: space.md, borderTopWidth: hairline },
})
