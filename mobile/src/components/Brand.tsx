// The ZAUQ identity, from the official artwork in /brand (see
// scripts/brand-assets.mjs: the painted grounds are knocked out, nothing is
// redrawn). The cream set sits on the night palette, the ink set on the day.
// Which mark where, from the guide: the script mark (arch + ذوق + rule) is
// the ceremonial form the web's boot screen uses; the wordmark alone heads
// pages; the lockup pairs the two; the empty mirror is the Mirror's own.
import { Image } from 'expo-image'
import { Image as RNImage, View, type ImageSourcePropType } from 'react-native'
import { useTheme } from '@/src/design/theme'

const ART = {
  markScript: { cream: require('../../assets/brand/mark-script-cream.png'), ink: require('../../assets/brand/mark-script-ink.png') },
  markWord: { cream: require('../../assets/brand/mark-word-cream.png'), ink: require('../../assets/brand/mark-word-ink.png') },
  markMirror: { cream: require('../../assets/brand/mark-mirror-cream.png'), ink: require('../../assets/brand/mark-mirror-cream.png') },
  wordmark: { cream: require('../../assets/brand/wordmark-cream.png'), ink: require('../../assets/brand/wordmark-ink.png') },
  lockup: { cream: require('../../assets/brand/lockup-cream.png'), ink: require('../../assets/brand/lockup-ink.png') },
  ceremonial: { cream: require('../../assets/brand/ceremonial-cream.png'), ink: require('../../assets/brand/ceremonial-ink.png') },
} as const

type Art = keyof typeof ART

function aspect(source: ImageSourcePropType): number {
  const meta = RNImage.resolveAssetSource(source)
  return meta && meta.width && meta.height ? meta.width / meta.height : 1
}

function Artwork({ art, width, height, label }: { art: Art; width?: number; height?: number; label: string }) {
  const { dark } = useTheme()
  const source = ART[art][dark ? 'cream' : 'ink']
  const ratio = aspect(source)
  const w = width ?? Math.round((height as number) * ratio)
  const h = height ?? Math.round((width as number) / ratio)
  return (
    <View style={{ width: w, height: h }} accessibilityRole="image" accessibilityLabel={label}>
      <Image source={source} style={{ width: w, height: h }} contentFit="contain" accessible={false} />
    </View>
  )
}

export interface WordmarkProps {
  /** Cap height in points. */
  size?: number
  ceremonial?: boolean
}

/** The wordmark: Playfair, kerned by the studio, alone (or with its rule when ceremonial). */
export function Wordmark({ size = 22, ceremonial = false }: WordmarkProps) {
  // The trimmed wordmark artwork is the caps' height; the ceremonial adds the rule beneath.
  return <Artwork art={ceremonial ? 'ceremonial' : 'wordmark'} height={ceremonial ? Math.round(size * 1.7) : size} label="ZAUQ" />
}

export interface ArchMarkProps {
  /** Width in points. */
  size?: number
  /** `script` carries ذوق and its rule; `word` carries ZAUQ (the app icon); `mirror` is the empty arch. */
  variant?: 'script' | 'word' | 'mirror'
}

/** The arch mark, as delivered. */
export function ArchMark({ size = 40, variant = 'script' }: ArchMarkProps) {
  const art: Art = variant === 'word' ? 'markWord' : variant === 'mirror' ? 'markMirror' : 'markScript'
  return <Artwork art={art} width={size} label={variant === 'script' ? 'ZAUQ, taste' : 'ZAUQ'} />
}

/** Mark and wordmark side by side, the studio's lockup. */
export function Lockup({ height = 40 }: { height?: number }) {
  return <Artwork art="lockup" height={height} label="ZAUQ" />
}
