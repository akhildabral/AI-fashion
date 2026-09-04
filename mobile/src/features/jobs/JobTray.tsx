// The one persistent progress surface: a strip above the tab bar while
// uploads run, garments develop, or a reflection renders, and a tappable
// card the moment a render is ready. Both float: the one shadow.
import { router } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Press } from '@/src/components/Press'
import { TAB_BAR_HEIGHT } from '@/src/components/Room'
import { T } from '@/src/components/Text'
import { useJobs } from '@/src/context/JobsProvider'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat, space } from '@/src/design/tokens'

const READY_CARD_MS = 8000

export function JobTray({ bottomOffset = TAB_BAR_HEIGHT }: { bottomOffset?: number }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const { upload, processingCount, activeRenders, readyRender, clearReadyRender, uploadError } = useJobs()

  useEffect(() => {
    if (!readyRender) return
    const id = setTimeout(clearReadyRender, READY_CARD_MS)
    return () => clearTimeout(id)
  }, [readyRender, clearReadyRender])

  const lines: string[] = []
  if (upload.active) lines.push(`Adding ${upload.done + upload.failed} of ${upload.total}`)
  if (processingCount > 0) lines.push(`${processingCount} developing`)
  if (activeRenders.length > 0) lines.push(activeRenders.length === 1 ? 'Rendering your reflection' : `Rendering ${activeRenders.length} reflections`)
  if (uploadError && !upload.active) lines.push(uploadError)

  if (lines.length === 0 && !readyRender) return null

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset + space.sm }]}>
      {readyRender ? (
        <Animated.View entering={rise()} exiting={fadeOut}>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Your reflection is ready. Open it."
            haptic="tap"
            onPress={() => {
              const id = readyRender.id
              clearReadyRender()
              router.push(`/reveal/${id}`)
            }}
            style={[styles.card, shadowFloat, { backgroundColor: t.brass, borderRadius: radius }]}
          >
            <T role="label" tone="onBrass">
              Your reflection is ready
            </T>
            <T role="bodySm" tone="onBrass">
              Tap to see it on you.
            </T>
          </Press>
        </Animated.View>
      ) : null}
      {lines.length > 0 ? (
        <Animated.View entering={rise()} exiting={fadeOut} accessibilityLiveRegion="polite" style={[styles.strip, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), borderRadius: radius }]}>
          <View style={[styles.filament, { backgroundColor: t.brass }]} />
          <T role="caption" tone="muted" numberOfLines={1} style={styles.line}>
            {lines.join(' · ')}
          </T>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter, gap: space.sm },
  card: { padding: space.lg, gap: space.xs },
  // The toast's 12 x 16.
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: hairline },
  // A 6px brass mark at the smallest radius.
  filament: { width: 6, height: 6, borderRadius: 2 },
  line: { flex: 1 },
})
