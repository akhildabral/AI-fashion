// The "···" on a card or a person: the quiet actions, one list from the
// bottom, closes on any choice or a tap outside. Never a native Alert.
import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { spring, timing } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { Press } from './atoms'

export interface MenuItem {
  label: string
  danger?: boolean
  onSelect: () => void
}

export function MenuSheet({ open, title, items, onClose }: { open: boolean; title?: string; items: MenuItem[]; onClose: () => void }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const y = useSharedValue(40)
  const fade = useSharedValue(0)

  useEffect(() => {
    if (open) {
      y.set(40)
      fade.set(0)
      y.set(withSpring(0, spring.sheet))
      fade.set(withTiming(1, timing.toggle))
    }
  }, [open, y, fade])

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }], opacity: fade.get() }))
  const dim = useAnimatedStyle(() => ({ opacity: fade.get() }))

  return (
    <Modal visible={open} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, dim]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14, 13, 11, 0.55)' }]} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.panel, shadowFloat, panel, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.3), borderRadius: radius, paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          {title ? (
            <View style={[styles.title, { borderBottomColor: alpha(t.ink, 0.1) }]}>
              <T role="caption" tone="faint" numberOfLines={1}>
                {title}
              </T>
            </View>
          ) : null}
          {items.map((it, i) => (
            <Pressable
              key={it.label}
              accessibilityRole="menuitem"
              pressRetentionOffset={12}
              onPress={() => {
                onClose()
                it.onSelect()
              }}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.08) }, pressed && { backgroundColor: alpha(t.ink, 0.05) }]}
            >
              <T role="body" tone={it.danger ? 'danger' : 'ink'}>
                {it.label}
              </T>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.row, styles.cancel, { borderTopColor: alpha(t.ink, 0.1) }]}>
            <T role="bodySm" tone="muted" style={{ fontFamily: fonts.sansSemi }}>
              Cancel
            </T>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}

/** The "···" control with its sheet. Renders nothing when there is nothing to offer. */
export function MoreButton({ items, title, label = 'More' }: { items: MenuItem[]; title?: string; label?: string }) {
  const { t } = useTheme()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <>
      <Press
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        onPress={() => {
          haptics.select()
          setOpen(true)
        }}
      >
        <View style={styles.more}>
          <MaterialIcons name="more-horiz" size={22} color={alpha(t.ink, 0.6)} />
        </View>
      </Press>
      <MenuSheet open={open} title={title} items={items} onClose={() => setOpen(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: { marginHorizontal: gutter, marginBottom: 12, borderWidth: hairline, overflow: 'hidden' },
  title: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: hairline },
  row: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' },
  cancel: { borderTopWidth: hairline, alignItems: 'center' },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
})
