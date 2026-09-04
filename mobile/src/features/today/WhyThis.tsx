// The brief's reasoning as skimmable facts, not a paragraph: the weather,
// the kind of day, the closet, the last wear. The section head, then a card
// 16 beneath with hairline rows, a tracked key on the left and a Bodoni
// value on the right; the notes (the forecast moved, the capsule, laid out
// last night) beneath as inline alerts.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { Brief, BriefResponse } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'
import { temp } from '@zauq/shared/units'
import { Alert, Card, SectionHead, VerdictNotes } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
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
      <SectionHead title="Why this" />
      <Card style={styles.card}>
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
      </Card>
      {/* The stylist's verdict: the rules the look bends or breaks, under the facts. */}
      <VerdictNotes verdict={brief.verdict} />
      {notes ? (
        <View style={styles.notes}>
          {data.weatherNote ? <Alert tone="warning">{`Weather moved · ${data.weatherNote}`}</Alert> : null}
          {brief.trip ? <Alert tone="warning">{`Styling from your ${brief.trip.destination} capsule · until ${tripDay(brief.trip.endDate)}`}</Alert> : null}
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
  // Head to card to notes: element to element.
  wrap: { gap: space.lg },
  card: { paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.md },
  value: { flexShrink: 1 },
  notes: { gap: space.sm, alignItems: 'flex-start' },
})
