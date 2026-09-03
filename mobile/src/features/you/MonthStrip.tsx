// The month, with the holes showing: a 7-column grid, logged days marked with
// a brass dot, unlogged past days dashed, today ringed in brass. Laid out as
// the web's MonthStrip: the month between its arrows on the left, the count
// beneath (the web's row wraps at this width), the grid 12 below.
import { Pressable, StyleSheet, View } from 'react-native'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { dayKey, formatMonth, monthKey, pad, shiftMonth } from './dates'

export function MonthStrip({ month, days, onMonth, onPick }: { month: string; days: Set<string>; onMonth: (m: string) => void; onPick: (day: string, logged: boolean) => void }) {
  const { t } = useTheme()
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const count = new Date(y, m, 0).getDate()
  const today = dayKey(new Date())
  const thisMonth = monthKey(new Date())
  const lead = (first.getDay() + 6) % 7 // Monday first
  const logged = [...days].filter((d) => d.startsWith(month)).length
  const past = month < thisMonth ? count : month > thisMonth ? 0 : Number(today.slice(-2))

  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <Button
          variant="icon"
          accessibilityLabel="Earlier month"
          onPress={() => {
            haptics.select()
            onMonth(shiftMonth(month, -1))
          }}
          icon={<T role="h3">‹</T>}
        />
        <T role="h2" accessibilityRole="header">
          {formatMonth(month)}
        </T>
        <Button
          variant="icon"
          accessibilityLabel="Later month"
          disabled={month >= thisMonth}
          onPress={() => {
            haptics.select()
            onMonth(shiftMonth(month, 1))
          }}
          icon={<T role="h3">›</T>}
        />
      </View>
      <T role="caption" tone="faint">
        {logged} of {past} days logged{past > logged ? ' · tap a dashed day to fill it' : ''}
      </T>
      <View style={styles.grid}>
        <View style={styles.weekdays}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <View key={i} style={styles.cell}>
              <T role="micro" tone="faint" align="center">
                {d}
              </T>
            </View>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((key, ci) => {
              if (!key) return <View key={`blank-${wi}-${ci}`} style={styles.cell} />
              const isLogged = days.has(key)
              const future = key > today
              const isToday = key === today
              return (
                <View key={key} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${key}${isLogged ? ', logged' : future ? '' : ', not logged'}`}
                    accessibilityState={{ disabled: future }}
                    disabled={future}
                    onPress={() => {
                      haptics.select()
                      onPick(key, isLogged)
                    }}
                    pressRetentionOffset={8}
                    style={({ pressed }) => [
                      styles.day,
                      {
                        borderRadius: radius,
                        borderWidth: isToday ? 1.5 : hairline,
                        borderStyle: isLogged || future ? 'solid' : 'dashed',
                        borderColor: isToday ? t.brass : isLogged ? alpha(t.ink, 0.25) : future ? 'transparent' : alpha(t.ink, 0.2),
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <T role="caption" style={{ fontFamily: fonts.sansSemi, fontVariant: ['tabular-nums'], color: isLogged ? t.ink : future ? alpha(t.ink, 0.2) : alpha(t.ink, 0.4) }}>
                      {String(Number(key.slice(-2)))}
                    </T>
                    {isLogged ? <View style={[styles.dot, { backgroundColor: t.brass }]} /> : null}
                  </Pressable>
                </View>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // The web's `flex-wrap ... gap-3`: 12 between the wrapped rows, and `mt-3` to the grid.
  wrap: { gap: space.md },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grid: { gap: space.xs },
  weekdays: { flexDirection: 'row', gap: space.xs, paddingBottom: space.xs },
  week: { flexDirection: 'row', gap: space.xs },
  cell: { flex: 1 },
  day: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  dot: { position: 'absolute', bottom: 4, width: 4, height: 4 },
})
