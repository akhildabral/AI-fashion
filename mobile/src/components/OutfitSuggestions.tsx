import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { suggestOutfits, whatToWearToday } from '../lib/wardrobe'
import type { WardrobeOutfit, WardrobeWeather } from '../lib/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { Button, ErrorText, Heading, Label, Subtle, TextField } from './ui'
import { TryOnModal } from './TryOnModal'

/** Renders one suggested outfit: its item photos in a row + the rationale. */
function OutfitRow({ outfit }: { outfit: WardrobeOutfit }) {
  const [tryOnOpen, setTryOnOpen] = useState(false)
  const itemIds = outfit.items.map((i) => i.id)

  return (
    <View style={styles.outfitCard}>
      <View style={styles.itemRow}>
        {outfit.items.map((item) => {
          const uri = resolveImageUrl(item.imageUrl)
          const label = item.subtype?.trim() || item.category
          return (
            <View key={item.id} style={styles.itemThumbWrap}>
              <View style={styles.itemThumb}>
                {uri ? (
                  <Image source={{ uri }} style={styles.itemImage} resizeMode="cover" />
                ) : null}
              </View>
              <Text style={styles.itemLabel} numberOfLines={1}>
                {label}
              </Text>
            </View>
          )
        })}
      </View>

      {outfit.rationale ? (
        <Text style={styles.rationale}>{outfit.rationale}</Text>
      ) : null}

      {itemIds.length > 0 && (
        <View style={styles.tryOnWrap}>
          <Pressable style={styles.tryOnBtn} onPress={() => setTryOnOpen(true)}>
            <Text style={styles.tryOnText}>Try it on</Text>
          </Pressable>
        </View>
      )}

      {itemIds.length > 0 && (
        <TryOnModal
          visible={tryOnOpen}
          itemIds={itemIds}
          onClose={() => setTryOnOpen(false)}
        />
      )}
    </View>
  )
}

function OutfitList({ outfits }: { outfits: WardrobeOutfit[] }) {
  if (outfits.length === 0) {
    return (
      <Text style={styles.muted}>
        No outfits came back — try adding more items or a different prompt.
      </Text>
    )
  }
  return (
    <View style={{ gap: spacing.lg }}>
      {outfits.map((outfit, i) => (
        <OutfitRow key={i} outfit={outfit} />
      ))}
    </View>
  )
}

/** Mix & match: an occasion → suggested outfits from owned items. */
function MixAndMatch() {
  const [occasion, setOccasion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outfits, setOutfits] = useState<WardrobeOutfit[] | null>(null)

  async function handleSubmit() {
    if (!occasion.trim()) return
    setError(null)
    setLoading(true)
    setOutfits(null)
    try {
      const res = await suggestOutfits(occasion.trim())
      setOutfits(res.outfits ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assemble outfits.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.panel}>
      <Heading size={22}>Mix &amp; match</Heading>
      <Subtle style={{ marginTop: 4 }}>
        Name an occasion and we&apos;ll assemble outfits from what you already own.
      </Subtle>

      <View style={styles.form}>
        <View>
          <Label>Occasion</Label>
          <TextField
            value={occasion}
            onChangeText={setOccasion}
            placeholder="e.g. dinner with friends"
          />
        </View>
        <Button
          title="Suggest outfits"
          loadingTitle="Assembling…"
          loading={loading}
          onPress={handleSubmit}
        />
      </View>

      {error && (
        <View style={{ marginTop: spacing.lg }}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}

      {!loading && outfits && (
        <View style={{ marginTop: spacing.xl }}>
          <OutfitList outfits={outfits} />
        </View>
      )}
    </View>
  )
}

/** What to wear today: a city → weather summary + weather-aware outfits. */
function WhatToWearToday() {
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weather, setWeather] = useState<WardrobeWeather | null>(null)
  const [outfits, setOutfits] = useState<WardrobeOutfit[] | null>(null)

  async function handleSubmit() {
    if (!location.trim()) return
    setError(null)
    setLoading(true)
    setWeather(null)
    setOutfits(null)
    try {
      const res = await whatToWearToday(location.trim())
      setWeather(res.weather)
      setOutfits(res.outfits ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan for today.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.panel}>
      <Heading size={22}>What to wear today</Heading>
      <Subtle style={{ marginTop: 4 }}>
        Give us your city and we&apos;ll dress you for the weather.
      </Subtle>

      <View style={styles.form}>
        <View>
          <Label>City</Label>
          <TextField
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. London"
          />
        </View>
        <Button
          title="Plan my day"
          loadingTitle="Checking…"
          loading={loading}
          onPress={handleSubmit}
        />
      </View>

      {error && (
        <View style={{ marginTop: spacing.lg }}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}

      {!loading && weather && (
        <View style={styles.weatherPill}>
          <Text style={styles.weatherStrong}>{weather.location}</Text>
          <Text style={styles.weatherDot}>·</Text>
          <Text style={styles.weatherText}>{Math.round(weather.temperatureC)}°C</Text>
          <Text style={styles.weatherDot}>·</Text>
          <Text style={styles.weatherText}>{weather.description}</Text>
        </View>
      )}

      {!loading && outfits && (
        <View style={{ marginTop: spacing.xl }}>
          <OutfitList outfits={outfits} />
        </View>
      )}
    </View>
  )
}

/** Both outfit-suggestion panels, shown on the Wardrobe screen. */
export function OutfitSuggestions() {
  return (
    <View style={{ gap: spacing.lg }}>
      <MixAndMatch />
      <WhatToWearToday />
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    padding: spacing.xl,
    ...shadow.card,
  },
  form: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  muted: {
    color: colors.inkFaint,
    fontSize: 14,
  },
  outfitCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    padding: spacing.lg,
    ...shadow.card,
  },
  itemRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  itemThumbWrap: {
    width: 84,
  },
  itemThumb: {
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemLabel: {
    marginTop: 4,
    fontSize: 11,
    textAlign: 'center',
    color: colors.inkSoft,
    textTransform: 'capitalize',
  },
  rationale: {
    marginTop: spacing.md,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  tryOnWrap: {
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  tryOnBtn: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
  tryOnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  weatherPill: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  weatherStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  weatherText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  weatherDot: {
    fontSize: 13,
    color: colors.inkFaint,
  },
})
