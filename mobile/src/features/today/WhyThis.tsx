// The brief's reasoning as skimmable facts, folded under one line: the
// weather, the kind of day, the closet, the last wear. Opens on a tap.
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import type { Brief, BriefResponse } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'
import { temp } from '@zauq/shared/units'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { daysAgoPhrase, spellCount, tripDay } from './copy'

export function WhyThis({ brief, data, index = 3 }: { brief: Brief; data: BriefResponse; index?: number }) {
  const { t } = useTheme()
  const [open, setOpen] = useState(false)

  const rows = (
    [
      brief.weather ? ['The weather', `${temp(brief.weather.temperatureC)} · ${brief.weather.description}`] : null,
      ['The day', brief.occasion ?? EVENT_LABEL[brief.eventType] ?? brief.eventType],
      ['The closet', `All ${spellCount(brief.items.length)}, clean`],
      data.lastWorn ? ['Last worn', `The ${data.lastWorn.label.toLowerCase()}, ${daysAgoPhrase(data.lastWorn.days)}`] : null,
    ] as ([string, string] | null)[]
  ).filter((r): r is [string, string] => r !== null)

  return (
    <Animated.View entering={rise(index)} style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide why this' : 'Show why this'}
        pressRetentionOffset={12}
        onPress={() => {
          haptics.tap()
          setOpen((v) => !v)
        }}
        style={styles.head}
      >
        <T role="h3" accessibilityRole="header">
          Why this
        </T>
        <Svg width={22} height={22} viewBox="0 0 24 24" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Path d="M6 9l6 6 6-6" fill="none" stroke={alpha(t.ink, 0.45)} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: space.md }}>
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
            {rows.map(([k, v], i) => (
              <View key={k} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: hairline, borderBottomColor: alpha(t.ink, 0.1) }]}>
                <T role="micro" tone="faint">
                  {k}
                </T>
                <T role="h3" align="right" style={{ flexShrink: 1 }}>
                  {v}
                </T>
              </View>
            ))}
          </View>
          {data.weatherNote ? (
            <View style={[styles.note, { borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft, borderRadius: radius }]}>
              <T role="caption" tone="brass" style={styles.semi}>
                Weather moved{' '}
                <T role="caption" tone="muted">
                  · {data.weatherNote}
                </T>
              </T>
            </View>
          ) : null}
          {brief.trip ? (
            <View style={[styles.note, { borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft, borderRadius: radius }]}>
              <T role="micro" tone="brass">
                Styling from your {brief.trip.destination} capsule
                <T role="micro" tone="faint">
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
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  card: { paddingHorizontal: space.lg, borderWidth: hairline },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, paddingVertical: 10 },
  note: { borderWidth: hairline, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  semi: { fontFamily: 'Archivo_600SemiBold' },
})
