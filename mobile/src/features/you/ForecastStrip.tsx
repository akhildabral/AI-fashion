// The trip's weather, day by day, as a row of plaques you can scroll.
import { ScrollView, StyleSheet, View } from 'react-native'
import type { TripForecast } from '@zauq/shared/types'
import { tempRange } from '@zauq/shared/units'
import { Plaque } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { gutter, space } from '@/src/design/tokens'
import { formatDay } from './dates'

export function ForecastStrip({ forecast, partialNote }: { forecast: TripForecast; partialNote?: string }) {
  return (
    <View style={styles.wrap}>
      <T role="h2">{forecast.location}</T>
      {forecast.days.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
          {forecast.days.map((d) => (
            <Plaque key={d.date} style={styles.plaque}>
              <T role="micro" tone="brass">
                {formatDay(d.date)}
              </T>
              <T role="statSm" style={{ marginTop: 4 }}>
                {tempRange(d.minC, d.maxC)}
              </T>
              <T role="caption" tone="muted" style={{ textTransform: 'capitalize' }}>
                {d.description}
                {d.rainChance ? ' · rain' : ''}
              </T>
            </Plaque>
          ))}
        </ScrollView>
      ) : null}
      {forecast.partial ? (
        <T role="caption" tone="faint">
          {partialNote ?? 'Part of the trip is beyond the forecast, so it is packed for typical seasonal weather.'}
        </T>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  scroller: { marginHorizontal: -gutter },
  row: { paddingHorizontal: gutter, gap: space.md },
  plaque: { minWidth: 124, padding: 12, paddingLeft: 16 },
})
