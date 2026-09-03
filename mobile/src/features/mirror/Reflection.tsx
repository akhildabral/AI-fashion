// The glass at the top of the Mirror: your reflection in the brass-bezelled
// dark frame; the door when there is none; the developing state while a
// render is a job.
import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { fadeIn, fadeOut } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, dark } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { resolveImageUrl } from '@/src/lib/api'
import { DRESSING_LINES } from './data'
import { Filament } from './Filament'

/** Text on the glass is always the night palette's ink: the mirror is dark in both themes. */
const GLASS_INK = dark.ink

export interface ReflectionProps {
  width: number
  /** Whether the photo has been looked up yet (the glass keeps its shape meanwhile). */
  checked: boolean
  photoUrl: string | null
  /** A render is in progress: the figure is being dressed. */
  developing: boolean
  onAdd: () => void
  onOpenDeveloping?: () => void
}

export function Reflection({ width, checked, photoUrl, developing, onAdd, onOpenDeveloping }: ReflectionProps) {
  const { t } = useTheme()
  const height = Math.round((width * 4) / 3)
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (!developing) return
    setLine(0)
    const id = setInterval(() => setLine((n) => (n + 1) % DRESSING_LINES.length), 3200)
    return () => clearInterval(id)
  }, [developing])

  const uri = photoUrl ? resolveImageUrl(photoUrl) : null

  return (
    <View style={[styles.host, { width }]}>
      <Arch width={width} height={height} variant="mirror">
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="disk" accessible={false} /> : null}

        {checked && !uri && !developing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add your reflection"
            onPress={onAdd}
            pressRetentionOffset={12}
            style={[StyleSheet.absoluteFill, styles.center]}
          >
            <Svg width={52} height={72} viewBox="0 0 52 72" accessible={false}>
              <Path d="M4 68V26C4 13.85 13.85 4 26 4s22 9.85 22 22v42" fill="none" stroke={alpha(t.brass, 0.55)} strokeWidth={1.5} />
              <Path d="M14 68V30a12 12 0 0 1 24 0v38" fill="none" stroke={alpha(t.brass, 0.3)} strokeWidth={1} />
            </Svg>
            <T role="h3" align="center" style={{ color: GLASS_INK }}>
              The mirror is waiting for you.
            </T>
            <T role="bodySm" align="center" style={[styles.copy, { color: alpha(GLASS_INK, 0.6) }]}>
              One clear, full-length photo, and every outfit renders on you.
            </T>
            <Button label="Add your photo" onPress={onAdd} style={styles.link} />
          </Pressable>
        ) : null}

        {developing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dressing you. Open the render."
            onPress={onOpenDeveloping}
            disabled={!onOpenDeveloping}
            style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: alpha(dark.bone, uri ? 0.7 : 0.2) }]}
          >
            <Filament height={height} />
            <Animated.View key={line} entering={fadeIn} exiting={fadeOut}>
              <T role="lede" align="center" style={{ color: alpha(GLASS_INK, 0.85), fontFamily: fonts.serifItalic }}>
                {DRESSING_LINES[line]}
              </T>
            </Animated.View>
            <T role="label" align="center" style={{ color: alpha(GLASS_INK, 0.5) }}>
              Leave if you like; you’ll hear when it’s ready
            </T>
          </Pressable>
        ) : null}
      </Arch>
    </View>
  )
}

const styles = StyleSheet.create({
  host: { alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  copy: { maxWidth: 220 },
  link: { marginTop: 4 },
})
