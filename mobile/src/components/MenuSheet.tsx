// The contextual menu: the quiet actions on a tile, a card or a person, one
// list from the bottom, closes on any choice or a tap outside. On a tile or
// a card it opens from a 320ms hold (the phone's overflow; there is no `···`
// on a card); a screen-level `···` (MoreButton) is only for a room's own
// header. One line each, the destructive one last in danger. Never a native
// Alert.
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as haptics from '@/src/design/haptics'
import { fadeIn, fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, height, radius, shadowFloat, space } from '@/src/design/tokens'
import { Hairline } from './Bits'
import { MoreGlyph } from './Glyphs'
import { Press } from './Press'
import { T } from './Text'

export interface MenuItem {
  label: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
  /** A hairline above this item. */
  section?: boolean
}

export function MenuSheet({ open, title, items, onClose }: { open: boolean; title?: string; items: MenuItem[]; onClose: () => void }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  if (!open) return null
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={fadeIn} exiting={fadeOut} style={[StyleSheet.absoluteFill, { backgroundColor: alpha(t.ink, 0.35) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the menu" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.host, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        <Animated.View entering={rise()} exiting={fadeOut} accessibilityRole="menu" style={[styles.panel, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.3), borderRadius: radius }]}>
          {title ? (
            <View style={styles.title}>
              <T role="label" tone="faint" numberOfLines={1}>
                {title}
              </T>
            </View>
          ) : null}
          {items.map((it, i) => (
            <View key={it.label}>
              {it.section && i > 0 ? <Hairline style={styles.rule} /> : null}
              <Pressable
                accessibilityRole="menuitem"
                accessibilityState={{ disabled: !!it.disabled }}
                disabled={it.disabled}
                pressRetentionOffset={12}
                onPress={() => {
                  haptics.select()
                  onClose()
                  it.onPress()
                }}
                style={({ pressed }) => [styles.item, { backgroundColor: pressed ? alpha(t.ink, 0.06) : 'transparent', opacity: it.disabled ? 0.5 : 1 }]}
              >
                <T role="body" tone={it.danger ? 'danger' : 'ink'}>
                  {it.label}
                </T>
              </Pressable>
            </View>
          ))}
        </Animated.View>
      </View>
    </Modal>
  )
}

/**
 * The screen-level `···` with its sheet, for a room's header (a person's
 * room): a bordered square, 36 (44 `tall` beside 44 actions). Renders
 * nothing when there is nothing to offer. Cards do not use this; they open
 * the same sheet from a long press.
 */
export function MoreButton({ items, title, label = 'More', tall = false }: { items: MenuItem[]; title?: string; label?: string; tall?: boolean }) {
  const { t } = useTheme()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const side = tall ? height.action : height.secondary
  return (
    <>
      <Press accessibilityRole="button" accessibilityLabel={label} haptic="select" visual={side} onPress={() => setOpen(true)}>
        <View style={[styles.more, { width: side, height: side, borderColor: alpha(t.ink, 0.2), borderRadius: radius }]}>
          <MoreGlyph />
        </View>
      </Press>
      <MenuSheet open={open} title={title} items={items} onClose={() => setOpen(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: gutter },
  panel: { borderWidth: hairline, paddingVertical: space.sm, overflow: 'hidden' },
  title: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  // Every row meets the 48 floor.
  item: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.lg },
  rule: { marginVertical: space.sm },
  more: { alignItems: 'center', justifyContent: 'center', borderWidth: hairline },
})
