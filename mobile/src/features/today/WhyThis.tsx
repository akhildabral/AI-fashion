// The brief's reasoning as skimmable facts, not a paragraph: the weather,
// the kind of day, the closet, the last wear. TodayPage.tsx: an h2, then a
// card 12 beneath with hairline rows, a tracked key on the left and a Bodoni
// value on the right; the notes (the forecast moved, the capsule, laid out
// last night) beneath.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { Brief, BriefResponse } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'
import { temp } from '@zauq/shared/units'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { daysAgoPhrase, spellCount, tripDay } from './copy'

export function WhyThis({ brief, data, index = 3 }: { brief: Brief; data: BriefResponse; index?: number }) {
  const { t } = useTheme()

  const rows = (
    [
      brief.weather ? ['The weather', `${temp(brief.weather.temperatureC)} · ${brief.weather.description}`] : null,
      ['The day', brief.occasion ?? EVENT_LABEL[brief.eventType] ?? brief.eventType],
      ['The closet', `All ${spellCount(brief.items.length)}, clean`],
      data.lastWorn ? ['Last worn', `The ${data.lastWorn.label.toLowerCase()}, ${daysAgoPhrase(data.lastWorn.days)}`] : null,
    ] as ([string, string] | null)[]
  ).filter((r): r is [string, string] => r !== null)

  const notes = !!data.weatherNote || !!brief.trip || (!!data.plannedAt && !data.worn)

  return (
    <Animated.View entering={rise(index)} style={styles.wrap}>
      <T role="h2" accessibilityRole="header">
        Why this
      </T>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: hairline, borderBottomColor: alpha(t.ink, 0.1) }]}>
            <T role="micro" tone="faint">
              {k}
            </T>
            <T role="h3" align="right" style={styles.value}>
              {v}
            </T>
          </View>
        ))}
      </View>
      {notes ? (
        <View style={styles.notes}>
          {data.weatherNote ? (
            <View style={[styles.note, styles.noteWeather, { borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft, borderRadius: radius }]}>
              <T role="caption" tone="brass" style={styles.semi}>
                Weather moved ·{' '}
                <T role="caption" style={{ fontFamily: fonts.sans, color: alpha(t.ink, 0.7) }}>
                  {data.weatherNote}
                </T>
              </T>
            </View>
          ) : null}
          {brief.trip ? (
            <View style={[styles.note, styles.noteTrip, { borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft, borderRadius: radius }]}>
              <T role="caption" tone="brass" style={styles.tracked}>
                Styling from your {brief.trip.destination} capsule
                <T role="caption" style={{ fontFamily: fonts.sansSemi, letterSpacing: 0, textTransform: 'none', color: alpha(t.ink, 0.4) }}>
                  {` · until ${tripDay(brief.trip.endDate)}`}
                </T>
              </T>
            </View>
          ) : null}
          {data.plannedAt && !data.worn ? (
            <T role="caption" tone="faint">
              Laid out last night.
            </T>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  // `card mt-3 px-4`, rows `py-2.5 gap-4`.
  card: { paddingHorizontal: space.lg, borderWidth: hairline },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, paddingVertical: 10 },
  value: { flexShrink: 1 },
  notes: { gap: space.sm, alignItems: 'flex-start' },
  note: { borderWidth: hairline },
  // `px-3 py-1.5` and `px-3.5 py-2`.
  noteWeather: { paddingHorizontal: 12, paddingVertical: 6 },
  noteTrip: { paddingHorizontal: 14, paddingVertical: 8 },
  semi: { fontFamily: fonts.sansSemi },
  tracked: { fontFamily: fonts.sansSemi, textTransform: 'uppercase', letterSpacing: 1.68 },
})
