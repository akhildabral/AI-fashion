import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { sendItemFeedback, suggestOutfits, whatToWearToday } from '../lib/wardrobe'
import { logWear } from '../lib/wearlog'
import { TravelPacking } from './TravelPacking'
import type {
  EventType,
  FeedbackSignal,
  WardrobeOutfit,
  WardrobeWeather,
} from '../lib/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { ZoomableImage } from './ImageViewer'
import { Button, ErrorText, Heading, Label, Subtle, TextField, TogglePill } from './ui'
import { TryOnModal } from './TryOnModal'

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'casual', label: 'Casual' },
  { value: 'evening', label: 'Evening' },
  { value: 'occasion', label: 'Occasion' },
  { value: 'athletic', label: 'Athletic' },
]

/** Event-type picker: professional/work is the default, never a cage. */
function EventTypeSelect({
  value,
  onChange,
}: {
  value: EventType
  onChange: (v: EventType) => void
}) {
  return (
    <View>
      <Label>Setting</Label>
      <View style={styles.eventRow}>
        {EVENT_TYPES.map((t) => (
          <TogglePill
            key={t.value}
            label={t.label}
            active={value === t.value}
            onPress={() => onChange(t.value)}
          />
        ))}
      </View>
    </View>
  )
}

const FEEDBACK_OPTIONS: { signal: FeedbackSignal; label: string }[] = [
  { signal: 'too-formal', label: 'Too formal for this' },
  { signal: 'too-casual', label: 'Too casual for this' },
  { signal: 'not-warm-enough', label: 'Not warm enough' },
  { signal: 'too-warm', label: 'Too warm' },
  { signal: 'wrong-color', label: 'Wrong color' },
  { signal: 'dont-suggest', label: "Don't suggest this item" },
]

// Inline correction at the point of pain (plan §4.3): complaining about a
// suggestion quietly adjusts the item's attributes.
function showFeedbackMenu(itemId: string, itemName: string) {
  Alert.alert(itemName, 'Something off about this piece?', [
    ...FEEDBACK_OPTIONS.map((opt) => ({
      text: opt.label,
      onPress: () => {
        void sendItemFeedback(itemId, opt.signal).catch(() => {})
      },
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ])
}

/** One-tap wear logging — the action the whole product optimizes for. */
function WoreItButton({
  itemIds,
  eventType,
  location,
}: {
  itemIds: string[]
  eventType: EventType
  location?: string
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  async function handlePress() {
    if (state === 'saving' || state === 'done') return
    setState('saving')
    try {
      await logWear({ itemIds, eventType, location })
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.woreBtn, state === 'done' && styles.woreBtnDone]}
      disabled={state === 'saving' || state === 'done'}
    >
      {state === 'saving' ? (
        <ActivityIndicator size="small" color={colors.inkSoft} />
      ) : (
        <Text style={[styles.woreText, state === 'done' && styles.woreTextDone]}>
          {state === 'done' ? 'Logged ✓' : state === 'error' ? 'Try again' : 'Wore it'}
        </Text>
      )}
    </Pressable>
  )
}

/** Renders one suggested outfit: its item photos in a row + the rationale. */
function OutfitRow({
  outfit,
  eventType,
  location,
}: {
  outfit: WardrobeOutfit
  eventType: EventType
  location?: string
}) {
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
                  <ZoomableImage uri={uri} style={styles.itemImage} />
                ) : null}
              </View>
              <Text style={styles.itemLabel} numberOfLines={1}>
                {label}
              </Text>
              <Pressable
                onPress={() => showFeedbackMenu(item.id, label)}
                accessibilityLabel={`Give feedback on ${label}`}
                hitSlop={8}
              >
                <Text style={styles.feedbackDots}>⋯</Text>
              </Pressable>
            </View>
          )
        })}
      </View>

      {outfit.rationale ? (
        <Text style={styles.rationale}>{outfit.rationale}</Text>
      ) : null}

      {outfit.validation && outfit.validation.warnings.length > 0 ? (
        <Text style={styles.warning}>
          {outfit.validation.warnings.map((w) => w.message).join(' · ')}
        </Text>
      ) : null}

      {itemIds.length > 0 && (
        <View style={styles.tryOnWrap}>
          <WoreItButton itemIds={itemIds} eventType={eventType} location={location} />
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

function OutfitList({
  outfits,
  eventType,
  location,
}: {
  outfits: WardrobeOutfit[]
  eventType: EventType
  location?: string
}) {
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
        <OutfitRow key={i} outfit={outfit} eventType={eventType} location={location} />
      ))}
    </View>
  )
}

/** Mix & match: an occasion → suggested outfits from owned items. */
function MixAndMatch() {
  const [occasion, setOccasion] = useState('')
  const [eventType, setEventType] = useState<EventType>('work')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outfits, setOutfits] = useState<WardrobeOutfit[] | null>(null)

  async function handleSubmit() {
    if (!occasion.trim()) return
    setError(null)
    setLoading(true)
    setOutfits(null)
    try {
      const res = await suggestOutfits(occasion.trim(), eventType)
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
        <EventTypeSelect value={eventType} onChange={setEventType} />
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
          <OutfitList outfits={outfits} eventType={eventType} />
        </View>
      )}
    </View>
  )
}

/** What to wear today: a city → weather summary + weather-aware outfits. */
function WhatToWearToday() {
  const [location, setLocation] = useState('')
  const [eventType, setEventType] = useState<EventType>('work')
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
      const res = await whatToWearToday(location.trim(), eventType)
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
        <EventTypeSelect value={eventType} onChange={setEventType} />
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
          <OutfitList outfits={outfits} eventType={eventType} location={location.trim() ? location.trim() : undefined} />
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
      <TravelPacking />
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
  warning: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 16,
    color: colors.clay,
  },
  feedbackDots: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  eventRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tryOnWrap: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  woreBtn: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: 'center',
  },
  woreBtnDone: {
    borderColor: 'rgba(138,154,134,0.5)',
    backgroundColor: 'rgba(138,154,134,0.12)',
  },
  woreText: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  woreTextDone: {
    color: colors.sage,
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
