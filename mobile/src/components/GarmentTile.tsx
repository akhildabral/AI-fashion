import { Image } from 'expo-image'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { PRESS_SCALE, timing } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, radius } from '@/src/design/tokens'
import { resolveImageUrl } from '@/src/lib/api'
import { Arch } from './Arch'
import { T } from './Text'

export interface GarmentTileProps {
  imageUrl?: string | null
  width: number
  aspect?: number
  label?: string | null
  sublabel?: string | null
  /** A small tag inside the niche, top-left: "new", "twin", a wear count. */
  badge?: string | null
  selected?: boolean
  /** Still being catalogued: the tile reads "developing". */
  processing?: boolean
  /** A photo of a person (a reflection, a worn look) rather than a cut-out garment. */
  photo?: boolean
  sweep?: boolean
  onPress?: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  /** For the Maestro flows; reaches the pressable. */
  testID?: string
}

/** A garment spotlit in an arch, with its label beneath. */
export function GarmentTile({
  imageUrl,
  width,
  aspect = 5 / 6,
  label,
  sublabel,
  badge,
  selected,
  processing,
  photo,
  sweep,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: GarmentTileProps) {
  const { t } = useTheme()
  const scale = useSharedValue(1)
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  const uri = imageUrl ? resolveImageUrl(imageUrl) : undefined
  const interactive = !!(onPress || onLongPress)

  const tile = (
    <Animated.View style={pressed}>
      <Arch width={width} aspect={aspect} variant={photo ? 'photo' : 'niche'} selected={selected} sweep={sweep}>
        {uri ? (
          <Image
            source={{ uri }}
            style={photo ? StyleSheet.absoluteFill : styles.garment}
            contentFit={photo ? 'cover' : 'contain'}
            transition={220}
            cachePolicy="disk"
            accessible={false}
          />
        ) : null}
        {badge ? (
          <View style={[styles.badge, { backgroundColor: alpha(t.onBrass, 0.82), borderRadius: radius }]}>
            <T role="micro" style={{ color: t.niche[0] }}>
              {badge}
            </T>
          </View>
        ) : null}
        {processing ? (
          <View style={[StyleSheet.absoluteFill, styles.developing, { backgroundColor: alpha(t.niche[2], 0.55) }]}>
            <T role="micro" style={{ color: t.onBrass }}>
              developing
            </T>
          </View>
        ) : null}
      </Arch>
      {label ? (
        <View style={styles.caption}>
          <T role="caption" numberOfLines={1} style={{ color: alpha(t.ink, 0.85) }}>
            {label}
          </T>
          {sublabel ? (
            <T role="micro" tone="faint" numberOfLines={1}>
              {sublabel}
            </T>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  )

  if (!interactive) return <View style={{ width }} testID={testID}>{tile}</View>
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? 'Garment'}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      pressRetentionOffset={12}
      onPressIn={() => {
        scale.set(withTiming(PRESS_SCALE, timing.press))
      }}
      onPressOut={() => {
        scale.set(withTiming(1, timing.press))
      }}
      style={{ width }}
    >
      {tile}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  garment: { position: 'absolute', left: '8%', right: '8%', top: '9%', bottom: '7%' },
  // Below the crown, where the arch's sides are straight, so nothing clips.
  badge: { position: 'absolute', bottom: 10, left: 10, paddingHorizontal: 6, paddingVertical: 3 },
  developing: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 },
  caption: { marginTop: 8, gap: 2 },
})
