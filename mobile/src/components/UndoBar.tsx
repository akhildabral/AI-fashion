// The UndoBar: ZAUQ does not confirm destructive actions, it performs them
// and offers this. One line, an Undo, the float shadow, above the tab bar.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { Press } from './Press'
import { TAB_BAR_HEIGHT } from './Room'
import { T } from './Text'

export function UndoBar({ message, onUndo, aboveTabBar = true }: { message: string; onUndo: () => void; aboveTabBar?: boolean }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const bottom = (aboveTabBar ? TAB_BAR_HEIGHT : 0) + Math.max(insets.bottom, space.md) + space.md
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <Animated.View
        entering={rise()}
        exiting={fadeOut}
        accessibilityLiveRegion="polite"
        style={[styles.bar, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.4), borderRadius: radius }]}
      >
        <T role="bodySm" style={styles.message} numberOfLines={2}>
          {message}
        </T>
        <Press accessibilityRole="button" accessibilityLabel="Undo" haptic="tap" visual={20} onPress={onUndo} style={styles.undo}>
          <T role="bodySm" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
            Undo
          </T>
        </Press>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter, alignItems: 'center', zIndex: 20 },
  // The design system's UndoBar: 16 x 12, a 12 gap, a brass hairline at 40%.
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: hairline, maxWidth: 420 },
  message: { flexShrink: 1 },
  undo: { minHeight: 20, justifyContent: 'center' },
})
