// The furniture every room shares: the header a room draws itself (a Bodoni
// title, an eyebrow, actions on the right) and the inline action row that
// sits under the thing it acts on.
//
// The owner's rule: no floating action bars on a page. A screen's actions
// live in the page flow, directly beneath their subject (the look, the rail,
// the board, the form), exactly as the web lays them out. One brass primary
// per row, a ghost for the alternative, a quiet for the escape, on a
// hairline. Sheets (`SheetShell`) keep their pinned footer; that is a bottom
// sheet's own shape, and it never scrolls. A room-level verb with no subject
// on the page (Add pieces, Log a day, Plan a trip) goes in the header aside.
import { type ReactNode } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { T } from './Text'

export interface RoomHeaderProps {
  eyebrow?: string
  /** The web's two eyebrow voices: a tracked brass micro-label (Closet, Circle) or Bodoni italic in brass (Mirror). */
  eyebrowVoice?: 'label' | 'italic'
  title: string
  emphasis?: string
  lead?: string
  /** The header aside: a 36 control beside the title (the room's verb when it has no subject on the page). */
  right?: ReactNode
  style?: ViewStyle
}

export function RoomHeader({ eyebrow, eyebrowVoice = 'label', title, emphasis, lead, right, style }: RoomHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headText}>
        {eyebrow ? (
          eyebrowVoice === 'italic' ? (
            <T role="bodySm" tone="brass" style={styles.eyebrowItalic}>
              {eyebrow}
            </T>
          ) : (
            <T role="micro" tone="brass" style={styles.eyebrowLabel}>
              {eyebrow}
            </T>
          )
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

/**
 * What a page reserves at the bottom. Nothing floats above the tab bar any
 * more, so this is the tab bar alone; kept for anything still adding it.
 * Prefer `useBottomReserve()` for a scroll view's bottom padding.
 */
export const ACTION_BAR_HEIGHT = TAB_BAR_HEIGHT

/**
 * The bottom padding a room's scroll view keeps so its last block clears the
 * floating tab bar: the bar, the safe inset, then a block of air.
 */
export function useBottomReserve(): number {
  const insets = useSafeAreaInsets()
  return TAB_BAR_HEIGHT + insets.bottom + space.xl
}

export interface ActionRowProps {
  children: ReactNode
  /** Space above the rule. A block (32) by default; pass less where the parent's gap already supplies some of it. */
  top?: number
  /** Drop the hairline: the row sits on a surface that already rules it. */
  plain?: boolean
  style?: ViewStyle
}

/**
 * The inline action row: a hairline, 16 to the 44-tall controls, 12 between
 * them, wrapping when the labels need it. In the page flow, under the thing
 * it acts on; never absolutely positioned, never on its own ground.
 */
export function ActionRow({ children, top = space.xxl, plain = false, style }: ActionRowProps) {
  const { t } = useTheme()
  return <View style={[styles.row, { marginTop: top }, !plain && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }, style]}>{children}</View>
}

/** The old name. It renders inline now; see the rule at the top of this file. */
export const ActionBar = ActionRow

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, paddingTop: space.sm, paddingBottom: space.lg },
  // Eyebrow to title to lead: the label-to-line 8.
  headText: { flex: 1, gap: space.sm },
  // The web's `text-[10px] tracking-[0.28em]` and `font-display text-sm italic`.
  eyebrowLabel: { letterSpacing: 2.8 },
  eyebrowItalic: { fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 18 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  // The rule, then 16 to the controls; 12 across, 12 down when they wrap.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: space.md, paddingTop: space.lg },
})
