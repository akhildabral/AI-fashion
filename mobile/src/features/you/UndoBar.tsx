// The web's UndoBar: one line at the foot with an Undo, for a delete that is
// held for a few seconds before it lands.
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { T } from '@/src/components/Text'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hitSlopFor, radius, shadowFloat } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'

export function UndoBar({ message, onUndo, bottom = 16 }: { message: string; onUndo: () => void; bottom?: number }) {
  const { t } = useTheme()
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <Animated.View entering={rise()} exiting={fadeOut} accessibilityLiveRegion="polite" style={[styles.bar, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.4), borderRadius: radius }]}>
        <T role="bodySm" style={{ flexShrink: 1 }}>
          {message}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={onUndo} hitSlop={hitSlopFor(20)} pressRetentionOffset={12}>
          <T role="bodySm" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
            Undo
          </T>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1, maxWidth: 420 },
})
