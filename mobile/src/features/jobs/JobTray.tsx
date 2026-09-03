// The one persistent progress surface: a strip above the tab bar while
// uploads run, garments develop, or a reflection renders, and a tappable
// card the moment a render is ready.
import { router } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { T } from '@/src/components/Text'
import { useJobs } from '@/src/context/JobsProvider'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, shadowFloat } from '@/src/design/tokens'

const READY_CARD_MS = 8000

export function JobTray({ bottomOffset = 56 }: { bottomOffset?: number }) {
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
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset + 8 }]}>
      {readyRender ? (
        <Animated.View entering={rise()} exiting={fadeOut}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your reflection is ready. Open it."
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
          </Pressable>
        </Animated.View>
      ) : null}
      {lines.length > 0 ? (
        <Animated.View entering={rise()} exiting={fadeOut} style={[styles.strip, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), borderRadius: radius }]}>
          <View style={[styles.filament, { backgroundColor: t.brass }]} />
          <T role="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {lines.join(' · ')}
          </T>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter, gap: 8 },
  card: { padding: 14, gap: 2 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  filament: { width: 6, height: 6, borderRadius: 3 },
})
