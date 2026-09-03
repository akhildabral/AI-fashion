// The Inspiration lens: an ask, two looks on a model, and on each the three
// doors: see it on you, make it from your closet, keep it or throw it back.
// The "Two looks" verb sits in the room's action bar; this is the rest.
// Spacing follows the web's InspirationLens value for value.
import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { InspirationLook } from '@zauq/shared/looks'
import { Arch } from '@/src/components/Arch'
import { Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { fadeIn, fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { resolveImageUrl } from '@/src/lib/api'
import { CHIPS, WAIT_LINES, type Inspiration } from './inspiration'

/** The Plaque's own padding (20, and 24 on the engraved edge). */
const PLAQUE_INSET = 44

export function InspirationLens({ width, inspiration, onCloset }: { width: number; inspiration: Inspiration; onCloset: (look: InspirationLook) => void }) {
  const { t } = useTheme()
  const { ask, setAsk, chip, setChip, looks, kept, generating, error, generate, verdict, seeOnMe, seeing, recall } = inspiration
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (!generating) return
    setLine(0)
    const id = setInterval(() => setLine((n) => (n + 1) % WAIT_LINES.length), 3500)
    return () => clearInterval(id)
  }, [generating])

  return (
    <View>
      <T role="micro" tone="faint">
        Inspiration
      </T>
      <T role="h2" style={styles.title}>
        A look{' '}
        <T role="h2" tone="brass" italic>
          for the fun of it.
        </T>
      </T>
      <T role="bodySm" tone="muted" style={styles.lead}>
        Not from your closet. A mood, a place, an evening, or a surprise. Two looks on a model; see them on you, or make them from what you own.
      </T>

      <View style={styles.form}>
        <Field
          label="A mood, a place, an occasion"
          value={ask}
          onChangeText={setAsk}
          placeholder="a rooftop in October, bolder than I’d dare…"
          editable={!generating}
          returnKeyType="go"
          onSubmitEditing={generate}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {CHIPS.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            on={chip === c.key && !ask}
            onPress={() => {
              setChip(c.key)
              setAsk('')
            }}
          />
        ))}
      </ScrollView>

      {generating ? (
        <Animated.View key={line} entering={fadeIn} exiting={fadeOut} style={styles.note}>
          <T role="lede" tone="muted">
            {WAIT_LINES[line]}
          </T>
        </Animated.View>
      ) : null}
      {error ? (
        <T role="bodySm" tone="danger" accessibilityLiveRegion="polite" style={styles.note}>
          {error}
        </T>
      ) : null}

      {looks.length > 0 ? (
        <View style={styles.looks}>
          {looks.map((look, i) => (
            <Animated.View key={look.id} entering={rise(i)}>
              <LookCard width={width} look={look} seeing={seeing === look.id} busy={seeing !== null} onSee={() => void seeOnMe(look)} onCloset={() => onCloset(look)} onVerdict={(v) => verdict(look, v)} />
            </Animated.View>
          ))}
        </View>
      ) : null}

      {kept.length > 0 ? (
        <View style={[styles.kept, { borderTopColor: alpha(t.ink, 0.1) }]}>
          <T role="micro" tone="faint">
            Kept
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keptStrip}>
            {kept.map((k) => (
              <GarmentTile
                key={k.id}
                width={96}
                aspect={3 / 4}
                photo
                imageUrl={k.imageUrl}
                label={k.outfit.title ?? k.occasion}
                accessibilityLabel={`${k.outfit.title ?? k.occasion}. Bring it back.`}
                onPress={() => recall(k)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  )
}

function LookCard({
  width,
  look,
  seeing,
  busy,
  onSee,
  onCloset,
  onVerdict,
}: {
  width: number
  look: InspirationLook
  seeing: boolean
  busy: boolean
  onSee: () => void
  onCloset: () => void
  onVerdict: (v: 'keep' | 'no') => void
}) {
  const { t } = useTheme()
  const title = look.outfit.title ?? look.occasion
  const pieces = look.outfit.pieces ?? []
  const archW = width - PLAQUE_INSET
  return (
    <Plaque>
      <Arch width={archW} aspect={3 / 4} variant="photo">
        {look.imageUrl ? (
          <Image source={{ uri: resolveImageUrl(look.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="disk" accessibilityLabel={title} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noPicture]}>
            <T role="bodySm" tone="muted" align="center" style={{ fontFamily: fonts.serifItalic }}>
              The picture didn’t come; the pieces did.
            </T>
          </View>
        )}
      </Arch>
      <T role="h2" style={styles.cardTitle}>
        {title}
      </T>
      <T role="bodySm" tone="muted" style={[styles.rationale, { fontFamily: fonts.serifItalic }]}>
        {look.rationale}
      </T>
      {pieces.length > 0 ? (
        <View style={styles.pieces}>
          {pieces.map((p, i) => (
            <T key={i} role="caption" style={{ color: alpha(t.ink, 0.7) }}>
              <T role="caption" style={{ color: t.ink, fontFamily: fonts.sansSemi }}>
                {p.category === 'accessory' ? 'Extra' : p.category[0].toUpperCase() + p.category.slice(1)}
              </T>
              {` · ${p.color} ${p.subtype}${p.material ? `, ${p.material}` : ''}`}
            </T>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button label={seeing ? 'Dressing you…' : 'See it on me'} variant="ghost" size="sm" loading={seeing} disabled={busy} onPress={onSee} />
        <Button label="From my closet" variant="ghost" size="sm" disabled={busy} onPress={onCloset} />
        <Chip label={look.verdict === 'keep' ? 'Kept' : 'Keep'} on={look.verdict === 'keep'} onPress={() => onVerdict('keep')} />
        <Chip label="Not for me" on={look.verdict === 'no'} onPress={() => onVerdict('no')} />
      </View>
    </Plaque>
  )
}

const styles = StyleSheet.create({
  // The web's mt-2 / mt-2 / mt-4 / mt-3 / mt-3 / mt-6 / mt-8 pt-5.
  title: { marginTop: 8 },
  lead: { marginTop: 8 },
  form: { marginTop: 16 },
  chips: { flexDirection: 'row', gap: 8, paddingTop: 12, paddingBottom: 2 },
  note: { marginTop: 12 },
  looks: { marginTop: 24, gap: 16 },
  noPicture: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  cardTitle: { marginTop: 12 },
  rationale: { marginTop: 4 },
  pieces: { gap: 4, marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 8, marginTop: 16 },
  kept: { marginTop: 32, borderTopWidth: hairline, paddingTop: 20 },
  keptStrip: { flexDirection: 'row', gap: 12, paddingTop: 12, paddingBottom: 2 },
})
