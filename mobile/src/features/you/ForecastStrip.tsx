// The trip's weather, day by day, as a row of plaques you can scroll: the
// web's `plaque min-w-[7.5rem] p-3 pl-4`, 12 apart, 12 under the heading.
import { ScrollView, StyleSheet, View } from 'react-native'
import type { TripForecast } from '@zauq/shared/types'
import { tempRange } from '@zauq/shared/units'
import { Plaque } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { gutter, space } from '@/src/design/tokens'
import { formatDay } from './dates'

export function ForecastStrip({ forecast, partialNote }: { forecast: TripForecast; partialNote?: string }) {
  return (
    <View>
      <T role="h2" accessibilityRole="header">
        {forecast.location}
      </T>
      {forecast.days.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
          {forecast.days.map((d) => (
            <Plaque key={d.date} style={styles.plaque}>
              <T role="micro" tone="brass">
                {formatDay(d.date)}
              </T>
              <T role="h3" style={styles.temp}>
                {tempRange(d.minC, d.maxC)}
              </T>
              <T role="caption" tone="muted" style={styles.sky}>
                {d.description}
                {d.rainChance ? ' · rain' : ''}
              </T>
            </Plaque>
          ))}
        </ScrollView>
      ) : null}
      {forecast.partial ? (
        <T role="caption" tone="faint" style={styles.note}>
          {partialNote ?? 'Part of the trip is beyond the forecast, so it is packed for typical seasonal weather.'}
        </T>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  scroller: { marginHorizontal: -gutter, marginTop: space.md },
  row: { paddingHorizontal: gutter, gap: space.md },
  plaque: { minWidth: 120, padding: space.md, paddingLeft: space.lg },
  temp: { marginTop: space.xs, fontVariant: ['tabular-nums'] },
  sky: { marginTop: 2, textTransform: 'capitalize' },
  note: { marginTop: space.sm },
})
