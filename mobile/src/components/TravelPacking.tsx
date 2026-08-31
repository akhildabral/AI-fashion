import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { packForTrip } from '../lib/wardrobe'
import type { PackingResponse } from '../lib/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, spacing } from '../theme'
import { ZoomableImage } from './ImageViewer'
import { Button, ErrorText, Heading, Label, Subtle, TextField } from './ui'

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Travel packing: destination + dates → a capsule from the real wardrobe,
 * a day-by-day plan, and a tappable checklist.
 */
export function TravelPacking() {
  const today = new Date().toISOString().slice(0, 10)
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [activities, setActivities] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackingResponse | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  async function handleSubmit() {
    if (!destination.trim()) return
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
      setError('Dates must look like 2026-09-12.')
      return
    }
    setError(null)
    setLoading(true)
    setResult(null)
    setChecked({})
    try {
      const res = await packForTrip({
        destination: destination.trim(),
        startDate,
        endDate,
        activities: activities.trim() || undefined,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan your packing.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <View style={styles.panel}>
      <Heading size={22}>Pack for a trip</Heading>
      <Subtle style={{ marginTop: 4 }}>
        Where and when — we&apos;ll build a capsule from clothes you own and plan each day.
      </Subtle>

      <View style={styles.form}>
        <View>
          <Label>Destination</Label>
          <TextField value={destination} onChangeText={setDestination} placeholder="e.g. Lisbon" />
        </View>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Label>From (YYYY-MM-DD)</Label>
            <TextField value={startDate} onChangeText={setStartDate} placeholder={today} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>To</Label>
            <TextField value={endDate} onChangeText={setEndDate} placeholder={today} />
          </View>
        </View>
        <View>
          <Label>Plans (optional)</Label>
          <TextField
            value={activities}
            onChangeText={setActivities}
            placeholder="e.g. hiking, a wedding"
          />
        </View>
        <Button
          title="Plan my packing"
          loadingTitle="Packing…"
          loading={loading}
          onPress={handleSubmit}
        />
      </View>

      {error && (
        <View style={{ marginTop: spacing.lg }}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}

      {result && !loading && (
        <View style={{ marginTop: spacing.xl, gap: spacing.xl }}>
          <View>
            <Text style={styles.sectionTitle}>{result.forecast.location}</Text>
            <View style={styles.weatherRow}>
              {result.forecast.days.map((d) => (
                <View key={d.date} style={styles.weatherCard}>
                  <Text style={styles.weatherDay}>{formatDay(d.date)}</Text>
                  <Text style={styles.weatherTemp}>
                    {d.minC}–{d.maxC}°
                  </Text>
                  <Text style={styles.weatherDesc}>
                    {d.description}
                    {d.rainChance ? ' ☂' : ''}
                  </Text>
                </View>
              ))}
            </View>
            {result.forecast.partial && (
              <Text style={styles.partialNote}>
                Part of the trip is beyond the forecast — packed for typical seasonal weather.
              </Text>
            )}
          </View>

          <View>
            <Text style={styles.sectionTitle}>
              The capsule · {result.plan.capsule.length} pieces
            </Text>
            <Text style={styles.rationale}>{result.plan.rationale}</Text>
            <View style={styles.capsuleRow}>
              {result.plan.capsule.map((item) => (
                <View key={item.id} style={styles.capsuleItem}>
                  <ZoomableImage uri={resolveImageUrl(item.imageUrl)} style={styles.capsuleThumb} />
                  <Text style={styles.capsuleLabel} numberOfLines={1}>
                    {item.subtype ?? item.category}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {result.plan.days.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Day by day</Text>
              <View style={{ gap: spacing.md }}>
                {result.plan.days.map((day) => (
                  <View key={day.label} style={styles.dayCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayLabel}>{day.label}</Text>
                      <Text style={styles.dayNote}>{day.note}</Text>
                    </View>
                    <View style={styles.dayThumbs}>
                      {day.items.map((item) => (
                        <ZoomableImage
                          key={item.id}
                          uri={resolveImageUrl(item.imageUrl)}
                          style={styles.dayThumb}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View>
            <Text style={styles.sectionTitle}>Packing checklist</Text>
            <View style={{ gap: spacing.sm }}>
              {[
                ...result.plan.capsule.map((i) => ({
                  key: `item-${i.id}`,
                  label: i.subtype ?? i.category,
                  extra: false,
                })),
                ...result.plan.essentials.map((e) => ({ key: `extra-${e}`, label: e, extra: true })),
              ].map(({ key, label, extra }) => (
                <Pressable
                  key={key}
                  style={[styles.checkRow, extra && styles.checkRowExtra]}
                  onPress={() => toggle(key)}
                >
                  <View style={[styles.checkbox, checked[key] && styles.checkboxOn]}>
                    {checked[key] ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.checkLabel, checked[key] && styles.checkLabelDone]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  form: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  weatherRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weatherCard: {
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 92,
  },
  weatherDay: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.clay,
    fontFamily: fonts.sans,
  },
  weatherTemp: {
    marginTop: 2,
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.ink,
  },
  weatherDesc: {
    marginTop: 2,
    fontSize: 10,
    color: colors.inkFaint,
    textTransform: 'capitalize',
  },
  partialNote: {
    marginTop: spacing.sm,
    fontSize: 11,
    color: colors.inkFaint,
  },
  rationale: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  capsuleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  capsuleItem: {
    width: 76,
  },
  capsuleThumb: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
  capsuleLabel: {
    marginTop: 4,
    fontSize: 11,
    textAlign: 'center',
    color: colors.inkSoft,
    textTransform: 'capitalize',
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  dayLabel: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.ink,
  },
  dayNote: {
    marginTop: 2,
    fontSize: 11,
    color: colors.inkFaint,
  },
  dayThumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  dayThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkRowExtra: {
    borderStyle: 'dashed',
    borderColor: 'rgba(185,141,111,0.45)',
    backgroundColor: 'rgba(185,141,111,0.06)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.inkLine2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  checkmark: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 14,
  },
  checkLabel: {
    fontSize: 14,
    color: colors.ink,
    textTransform: 'capitalize',
    flex: 1,
  },
  checkLabelDone: {
    color: colors.inkFaint,
    textDecorationLine: 'line-through',
  },
})
