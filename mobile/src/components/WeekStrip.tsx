import { useQuery } from '@tanstack/react-query'
import { StyleSheet, View } from 'react-native'
import { getWeek, shiftKey, todayKey, type WeekDay } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { Press } from './Press'
import { T } from './Text'

function blankWeek(from: string, today: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftKey(from, i)
    return {
      date,
      past: date < today,
      today: date === today,
      rest: false,
      eventType: null,
      occasion: null,
      planned: false,
      worn: false,
      wearLogId: null,
      shared: false,
      photoUrl: null,
      itemIds: [],
      items: [],
    }
  })
}

/**
 * The week as a timeline: seven days on one hairline, today in brass. Past
 * days carry a dot per look worn; future days a quiet word when named. Each
 * day is a tab: the micro weekday, the Bodoni figure, the brass rule.
 */
export function WeekStrip({ selected, onSelect }: { selected: string; onSelect: (date: string) => void }) {
  const { t } = useTheme()
  const today = todayKey()
  const from = shiftKey(today, -2)
  const { data } = useQuery({ queryKey: qk.week(from), queryFn: () => getWeek(from), staleTime: 60_000 })
  const days = data?.days?.length ? data.days : blankWeek(from, today)

  return (
    <View style={[styles.rail, { borderBottomColor: alpha(t.ink, 0.12) }]} accessibilityRole="tablist" accessibilityLabel="The week">
      {days.map((d) => {
        const dt = new Date(`${d.date}T12:00:00`)
        const wd = dt.toLocaleDateString(undefined, { weekday: 'short' })
        const n = dt.getDate()
        const on = d.date === selected
        const word = d.rest
          ? 'rest'
          : !d.past && !d.today && (d.planned || d.eventType)
            ? (d.occasion ?? (d.eventType ? (EVENT_LABEL[d.eventType] ?? d.eventType) : null))
            : null
        const dots = d.past && d.worn && !d.rest ? Math.min(Math.max(d.lookCount ?? 1, 1), 3) : 0
        return (
          <Press
            key={d.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${wd} ${n}${d.today ? ', today' : ''}${word ? `, ${word}` : ''}`}
            haptic={on ? 'none' : 'select'}
            onPress={() => {
              if (!on) onSelect(d.date)
            }}
            wrapStyle={styles.cell}
            style={styles.day}
          >
            <T role="micro" style={{ color: d.today ? t.brass : alpha(t.ink, 0.35) }}>
              {wd}
            </T>
            <T role="h3" style={{ color: d.rest ? alpha(t.ink, 0.3) : d.today ? t.brass : on ? t.ink : alpha(t.ink, 0.7) }}>
              {String(n)}
            </T>
            <View style={styles.mark}>
              {dots > 0
                ? Array.from({ length: dots }).map((_, i) => <View key={i} style={[styles.dot, { backgroundColor: alpha(t.brass, 0.7) }]} />)
                : null}
              {word ? (
                <T numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.word, { color: d.rest ? alpha(t.ink, 0.35) : alpha(t.brass, 0.8) }]}>
                  {word}
                </T>
              ) : null}
            </View>
            <View style={[styles.rule, { backgroundColor: d.today ? t.brass : on ? alpha(t.ink, 0.5) : 'transparent' }]} />
          </Press>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', borderBottomWidth: hairline },
  cell: { flex: 1 },
  // 4 above the weekday, 12 below the mark to the rule; the box meets the 44 floor.
  day: { alignItems: 'center', gap: space.xs, paddingTop: space.xs, paddingBottom: space.md, minHeight: height.action },
  mark: { height: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  // The quiet word: Bodoni italic, kept at 1.2x leading so nothing clips.
  word: { fontFamily: fonts.serifItalic, fontSize: 11, lineHeight: 14 },
  rule: { position: 'absolute', left: '18%', right: '18%', bottom: -1, height: 2 },
})
