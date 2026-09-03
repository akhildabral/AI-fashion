// The contextual menu a long-press opens on a tile or a card: a sheet of
// verbs from the bottom, one line each, the destructive one last in danger.
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Hairline } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { fadeIn, fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, shadowFloat } from '@/src/design/tokens'

export interface MenuItem {
  label: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
  /** A hairline above this item. */
  section?: boolean
}

export function Menu({ open, title, items, onClose }: { open: boolean; title?: string; items: MenuItem[]; onClose: () => void }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  if (!open) return null
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={fadeIn} exiting={fadeOut} style={[StyleSheet.absoluteFill, { backgroundColor: alpha(t.ink, 0.35) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the menu" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.host, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <Animated.View entering={rise()} exiting={fadeOut} style={[styles.panel, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.3), borderRadius: radius }]}>
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

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: gutter },
  panel: { borderWidth: 1, paddingVertical: 6, overflow: 'hidden' },
  title: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 },
  item: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18 },
  rule: { marginVertical: 6 },
})
