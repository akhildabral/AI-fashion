import { Image } from 'expo-image'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTheme } from '@/src/design/theme'
import { alpha, radius } from '@/src/design/tokens'
import { track, tracking } from '@/src/design/type'
import { resolveImageUrl } from '@/src/lib/api'
import { Arch } from './Arch'
import { LONG_PRESS_MS, usePressScale } from './Press'
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

/**
 * A garment spotlit in an arch, with a tracked label beneath. Cut-outs sit
 * at 7% padding (11% under 64pt) so nothing touches the bezel.
 */
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
  const press = usePressScale()
  const uri = imageUrl ? resolveImageUrl(imageUrl) : undefined
  const interactive = !!(onPress || onLongPress)
  const inset = width < 64 ? '11%' : '7%'

  const tile = (
    <Animated.View style={press.style}>
      <Arch width={width} aspect={aspect} variant={photo ? 'photo' : 'niche'} selected={selected} sweep={sweep}>
        {uri ? (
          <Image
            source={{ uri }}
            style={photo ? StyleSheet.absoluteFill : [styles.garment, { left: inset, right: inset, top: inset, bottom: inset }]}
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
            <T role="micro" style={{ color: t.inNiche }}>
              developing
            </T>
          </View>
        ) : null}
      </Arch>
      {label || sublabel ? (
        <View style={styles.caption}>
          {label ? (
            <T role="label" numberOfLines={1} align="center" style={[styles.label, { color: alpha(t.ink, 0.75) }]}>
              {label}
            </T>
          ) : null}
          {sublabel ? (
            <T role="caption" tone="brass" numberOfLines={1} align="center">
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
      delayLongPress={LONG_PRESS_MS}
      pressRetentionOffset={12}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ width }}
    >
      {tile}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  garment: { position: 'absolute' },
  // Below the crown, where the arch's sides are straight, so nothing clips.
  badge: { position: 'absolute', bottom: 10, left: 10, paddingHorizontal: 6, paddingVertical: 3 },
  developing: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 },
  // The web's `pt-2 px-1`: label 8 below the arch, the tile label tracked .12em.
  caption: { marginTop: 8, paddingHorizontal: 4, gap: 2 },
  label: { letterSpacing: track(11, tracking.labelXs) },
})
