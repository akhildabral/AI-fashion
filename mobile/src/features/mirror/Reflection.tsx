// The glass at the top of the Mirror, state for state as the web's
// MirrorFrame: the door when there is no photo; the developing state while a
// render is a job; the latest render on the glass with the photo underneath;
// "You're in the mirror" when there is a photo and nothing on it yet; and
// the compare grid, two glasses side by side. The glass is a standing
// figure's 2/3; while the photo is still being looked up it keeps its shape
// and stays empty, which is the loading state.
import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import type { TryOn } from '@zauq/shared/types'
import { MirrorFrame } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { fadeIn, fadeOut } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, arch, dark, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { resolveImageUrl } from '@/src/lib/api'
import { DRESSING_LINES, isLive, isReady, renderLabel } from './data'
import { Filament } from './Filament'

/** Text on the glass is always the night palette's ink: the mirror is dark in both themes. */
const GLASS_INK = dark.ink
/** The web's `max-w-[26ch]` and `[28ch]` at 14px Archivo. */
const CH_26 = 208
const CH_28 = 224
const LETTERS = ['A', 'B', 'C', 'D']

export interface ReflectionProps {
  width: number
  /** Whether the photo has been looked up yet (the glass keeps its shape meanwhile). */
  checked: boolean
  photoUrl: string | null
  /** The render on the glass: the latest that did not fail (the web's `current`). */
  current: TryOn | null
  /** A render is a job: the figure is being dressed. */
  developing: boolean
  /** Pieces are on the rail, for the line under "You're in the mirror." */
  chosen: boolean
  onAdd: () => void
  /** Open a render (the one on the glass, or the one developing). */
  onOpen: (id: string) => void
}

export function Reflection({ width, checked, photoUrl, current, developing, chosen, onAdd, onOpen }: ReflectionProps) {
  const { t } = useTheme()
  const height = Math.round(width / arch.mirror.ratio)
  const [line, setLine] = useState(0)

  const dressing = developing || isLive(current)
  useEffect(() => {
    if (!dressing) return
    setLine(0)
    const id = setInterval(() => setLine((n) => (n + 1) % DRESSING_LINES.length), 3200)
    return () => clearInterval(id)
  }, [dressing])

  const uri = photoUrl ? resolveImageUrl(photoUrl) : null
  const failed = current?.status === 'failed'
  const onGlass = !dressing && !!uri && !!current && isReady(current) && !!current.imageUrl

  return (
    <MirrorFrame width={width}>
      {/* rendering: the figure is being dressed */}
      {dressing ? (
        <Press accessibilityRole="button" accessibilityLabel="Dressing you. Open the render." haptic="tap" onPress={() => onOpen(current?.id ?? '')} wrapStyle={StyleSheet.absoluteFill} style={[styles.fill, styles.developing]}>
          {uri ? <Image source={{ uri }} blurRadius={2} style={[StyleSheet.absoluteFill, styles.underlay]} contentFit="cover" cachePolicy="disk" accessible={false} /> : null}
          <Filament height={height} />
          <Animated.View key={line} entering={fadeIn} exiting={fadeOut}>
            <T role="lede" align="center" style={{ color: alpha(GLASS_INK, 0.8) }}>
              {DRESSING_LINES[line]}
            </T>
          </Animated.View>
          <T role="micro" align="center" style={{ color: alpha(GLASS_INK, 0.5) }}>
            developing
          </T>
          <T role="label" align="center" style={{ color: alpha(GLASS_INK, 0.5) }}>
            Leave if you like; you’ll hear when it’s ready
          </T>
        </Press>
      ) : null}

      {/* no photo: the door */}
      {!dressing && checked && !uri ? (
        <View style={[StyleSheet.absoluteFill, styles.door]}>
          <Svg width={52} height={72} viewBox="0 0 52 72" accessible={false}>
            <Path d="M4 68V26C4 13.85 13.85 4 26 4s22 9.85 22 22v42" fill="none" stroke={alpha(t.brass, 0.55)} strokeWidth={1.5} />
            <Path d="M14 68V30a12 12 0 0 1 24 0v38" fill="none" stroke={alpha(t.brass, 0.3)} strokeWidth={1} />
          </Svg>
          <T role="h3" align="center" style={{ color: GLASS_INK }}>
            The mirror is waiting for you.
          </T>
          <T role="bodySm" align="center" style={{ color: alpha(GLASS_INK, 0.6), maxWidth: CH_26 }}>
            One clear, full-length photo, and every outfit renders on you.
          </T>
          <Button label="Add your photo" variant="ghost" onGlass onPress={onAdd} />
        </View>
      ) : null}

      {/* a render on the glass, with the photo underneath */}
      {onGlass ? (
        <Press accessibilityRole="imagebutton" accessibilityLabel="You, in the render. Open it." haptic="tap" onPress={() => onOpen(current.id)} wrapStyle={StyleSheet.absoluteFill} style={styles.fill}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" accessible={false} />
          <Image source={{ uri: resolveImageUrl(current.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="disk" accessible={false} />
        </Press>
      ) : null}

      {/* failed */}
      {!dressing && failed ? (
        <View style={[StyleSheet.absoluteFill, styles.failed]}>
          <T role="h3" align="center" style={{ color: GLASS_INK }}>
            That one didn’t take.
          </T>
          <T role="bodySm" align="center" style={{ color: alpha(GLASS_INK, 0.6), maxWidth: CH_28 }}>
            Nothing was charged. Try again, or change a piece on the rail.
          </T>
        </View>
      ) : null}

      {/* a photo, no render yet */}
      {!dressing && uri && !onGlass && !failed ? (
        <View style={[StyleSheet.absoluteFill, styles.door]}>
          <Image source={{ uri }} style={[styles.thumb, { borderRadius: radius }]} contentFit="cover" cachePolicy="disk" accessibilityLabel="You" />
          <T role="h3" align="center" style={{ color: GLASS_INK }}>
            You’re in the mirror.
          </T>
          <T role="bodySm" align="center" style={{ color: alpha(GLASS_INK, 0.6), maxWidth: CH_26 }}>
            {chosen ? 'The pieces are on the rail. Tap See it on me.' : 'Bring pieces from Today or the Closet, or pick them here.'}
          </T>
        </View>
      ) : null}
    </MirrorFrame>
  )
}

/** Compare: the chosen renders, each in its own glass, two across, 12 apart. */
export function CompareGlass({ width, renders }: { width: number; renders: TryOn[] }) {
  const { t } = useTheme()
  const w = Math.floor((width - space.md) / 2)
  return (
    <View style={[styles.compare, { width }]}>
      {renders.map((r, i) => (
        <View key={r.id} style={{ width: w }}>
          <MirrorFrame width={w}>
            <Image source={{ uri: resolveImageUrl(r.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" accessibilityLabel={LETTERS[i]} />
            {/* the letter sits below the crown, where the arch's sides are straight, so nothing clips: a brass square, like an avatar */}
            <View style={[styles.letter, { backgroundColor: t.brass, borderRadius: radius }]}>
              <T role="caption" tone="onBrass" style={{ fontFamily: fonts.sansSemi }}>
                {LETTERS[i]}
              </T>
            </View>
          </MirrorFrame>
          <T role="caption" align="center" numberOfLines={2} style={[styles.compareLabel, { color: alpha(t.ink, 0.5) }]}>
            {renderLabel(r)}
          </T>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Inside the glass: 16 between the lines while dressing and at the door, 12 when it failed; 32 all round.
  developing: { alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
  door: { alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
  failed: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  underlay: { opacity: 0.25 },
  thumb: { width: 112, height: 112, opacity: 0.8 },
  compare: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  letter: { position: 'absolute', left: space.md, bottom: space.md, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  compareLabel: { marginTop: space.sm },
})
