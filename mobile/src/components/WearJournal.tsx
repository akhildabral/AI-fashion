import { useCallback, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { getWearInsights, getWearLog } from '../lib/wearlog'
import type { WearInsightsResponse, WearLogEntry } from '../lib/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, spacing } from '../theme'
import { ZoomableImage } from './ImageViewer'
import { Heading, Subtle } from './ui'

const RECENT_LOGS = 5

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

/**
 * Compact wear journal: totals, orphan count, and the last few logged
 * outfits. Reloads whenever the screen regains focus so fresh "wore it"
 * taps show up.
 */
export function WearJournal() {
  const [insights, setInsights] = useState<WearInsightsResponse | null>(null)
  const [logs, setLogs] = useState<WearLogEntry[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      Promise.all([getWearInsights(), getWearLog()])
        .then(([insightRes, logRes]) => {
          if (cancelled) return
          setInsights(insightRes)
          setLogs(logRes.logs ?? [])
        })
        .catch(() => {
          // Journal is a passive panel — stay quiet on transient failures.
        })
      return () => {
        cancelled = true
      }
    }, []),
  )

  if (!insights || !logs) return null

  const recent = logs.slice(0, RECENT_LOGS)
  const mostWorn = [...insights.items]
    .filter((i) => i.wearCount > 0)
    .sort((a, b) => b.wearCount - a.wearCount)
    .slice(0, 4)

  return (
    <View style={styles.wrap}>
      <Heading size={26}>Journal</Heading>
      <Subtle style={{ marginTop: spacing.sm }}>
        What you actually wore — the record that makes your suggestions personal.
      </Subtle>

      <View style={styles.statsRow}>
        <StatCard label="Logged" value={insights.totals.logged} />
        <StatCard label="Items" value={insights.totals.items} />
        <StatCard label="Orphans" value={insights.totals.orphans} />
      </View>

      {mostWorn.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.subTitle}>Most worn</Text>
          <View style={styles.mostWornRow}>
            {mostWorn.map((item) => (
              <View key={item.itemId} style={styles.mostWornItem}>
                <ZoomableImage uri={resolveImageUrl(item.imageUrl)} style={styles.mostWornThumb} />
                <Text style={styles.mostWornLabel} numberOfLines={1}>
                  {item.wearCount}× worn
                </Text>
                {item.costPerWear != null && (
                  <Text style={styles.mostWornCpw} numberOfLines={1}>
                    ≈{item.costPerWear}/wear
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {recent.length === 0 ? (
        <Text style={styles.empty}>
          Nothing logged yet — tap “Wore it” on any suggested outfit.
        </Text>
      ) : (
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {recent.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <View style={styles.logMeta}>
                <Text style={styles.logDate}>{formatDay(log.wornOn)}</Text>
                {log.eventType ? <Text style={styles.logSub}>{log.eventType}</Text> : null}
                {log.weather ? (
                  <Text style={styles.logSub}>
                    {Math.round(log.weather.temperatureC)}°C · {log.weather.description}
                  </Text>
                ) : null}
              </View>
              <View style={styles.logThumbs}>
                {log.items.map((item) => {
                  const uri = resolveImageUrl(item.imageUrl)
                  return uri ? (
                    <ZoomableImage key={item.id} uri={uri} style={styles.thumb} />
                  ) : null
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  statLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.clay,
    fontFamily: fonts.sans,
  },
  statValue: {
    marginTop: 4,
    fontSize: 24,
    fontFamily: fonts.serif,
    color: colors.ink,
  },
  subTitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.inkSoft,
    marginBottom: spacing.sm,
  },
  mostWornRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mostWornItem: {
    width: 68,
  },
  mostWornThumb: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
  mostWornLabel: {
    marginTop: 3,
    fontSize: 10,
    textAlign: 'center',
    color: colors.inkSoft,
  },
  mostWornCpw: {
    fontSize: 9,
    textAlign: 'center',
    color: colors.inkFaint,
  },
  empty: {
    marginTop: spacing.lg,
    fontSize: 14,
    color: colors.inkFaint,
    fontFamily: fonts.sans,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  logMeta: {
    width: 92,
  },
  logDate: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.clay,
    fontFamily: fonts.sans,
  },
  logSub: {
    marginTop: 2,
    fontSize: 11,
    color: colors.inkFaint,
    fontFamily: fonts.sans,
    textTransform: 'capitalize',
  },
  logThumbs: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
})
