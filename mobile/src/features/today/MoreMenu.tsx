// The small menu behind the "···" in the action bar: everything that changes
// the day lives here so the primary act stays the obvious one. Floats above
// the bar, closes on any tap outside.
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat } from '@/src/design/tokens'

export interface MenuItem {
  label: string
  onPress: () => void
  disabled?: boolean
}

export function MoreMenu({ open, items, onClose }: { open: boolean; items: MenuItem[]; onClose: () => void }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  if (!open) return null
  const bottom = 12 + 44 + Math.max(insets.bottom, 12) + 8
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="Close the menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View
        entering={rise()}
        exiting={fadeOut}
        accessibilityRole="menu"
        style={[styles.menu, shadowFloat, { bottom, right: gutter, backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), borderRadius: radius }]}
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
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
})
