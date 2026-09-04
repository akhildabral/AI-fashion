// The small menu behind the "···" in an action row: everything that changes
// the day lives here so the primary act stays the obvious one. Floats from
// the control that opened it (below it, or above when the tab bar is in the
// way), closes on any tap outside.
import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TAB_BAR_HEIGHT } from '@/src/components/Room'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat, space } from '@/src/design/tokens'

export interface MenuItem {
  label: string
  onPress: () => void
  disabled?: boolean
}

/** Where the "···" sits, in window coordinates, measured the moment it is pressed. */
export type MenuAnchor = LayoutRectangle

const ITEM_H = 44

/**
 * The state behind a MoreMenu: put `ref` on the View wrapping the "···"
 * (with `collapsable={false}`), call `show` from its press, and hand `open`,
 * `anchor` and `hide` to the menu.
 */
export function useMoreMenu() {
  const ref = useRef<View>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)
  const show = useCallback(() => {
    const node = ref.current
    if (!node) {
      setAnchor(null)
      setOpen(true)
      return
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setOpen(true)
    })
  }, [])
  const hide = useCallback(() => setOpen(false), [])
  return { ref, open, anchor, show, hide }
}

export function MoreMenu({ open, items, onClose, anchor = null }: { open: boolean; items: MenuItem[]; onClose: () => void; anchor?: MenuAnchor | null }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const [host, setHost] = useState<LayoutRectangle | null>(null)
  const hostRef = useRef<View>(null)
  if (!open) return null

  // The menu is placed in the overlay's own frame, so the overlay is measured
  // in the window too and the anchor is read relative to it.
  const floor = TAB_BAR_HEIGHT + insets.bottom + space.md
  let place: { top: number; right: number } | { bottom: number; right: number } = { bottom: floor, right: gutter }
  if (anchor && host) {
    const right = Math.max(gutter, host.x + host.width - (anchor.x + anchor.width))
    const below = anchor.y + anchor.height + space.sm - host.y
    const menuH = items.length * ITEM_H + 2
    const fits = below + menuH <= host.height - floor
    place = fits ? { top: below, right } : { bottom: host.y + host.height - anchor.y + space.sm, right }
  }

  return (
    <View
      ref={hostRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={() => hostRef.current?.measureInWindow((x, y, width, height) => setHost({ x, y, width, height }))}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Close the menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View
        entering={rise()}
        exiting={fadeOut}
        accessibilityRole="menu"
        style={[styles.menu, shadowFloat, place, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), borderRadius: radius }]}
      >
        {items.map((it, i) => (
          <Pressable
            key={it.label}
            accessibilityRole="menuitem"
            accessibilityState={{ disabled: !!it.disabled }}
            disabled={it.disabled}
            pressRetentionOffset={12}
            onPress={() => {
              haptics.select()
              onClose()
              it.onPress()
            }}
            style={({ pressed }) => [
              styles.item,
              i < items.length - 1 && { borderBottomWidth: hairline, borderBottomColor: alpha(t.ink, 0.08) },
              pressed && { backgroundColor: alpha(t.ink, 0.06) },
              it.disabled && { opacity: 0.5 },
            ]}
          >
            <T role="bodySm">{it.label}</T>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', minWidth: 220, borderWidth: hairline, overflow: 'hidden' },
  item: { minHeight: ITEM_H, justifyContent: 'center', paddingHorizontal: 16 },
})
