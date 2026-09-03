// Trips: the ones ahead and the ones behind, each a page you can open.
// The web's PackingPage above the form: header, then 32 to the list.
import { useQuery } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { getTrips, type Trip } from '@zauq/shared/brief'
import { EmptyState, LoadError, Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { dayKey, formatDay } from '@/src/features/you/dates'
import { routes } from '@/src/features/you/nav'

/** The web's TripRow: `plaque p-4 pl-5`, the destination and dates left, "Open" right. */
function TripRow({ trip, past, onPress }: { trip: Trip; past?: boolean; onPress: () => void }) {
  const today = dayKey(new Date())
  const on = !past && trip.startDate <= today && trip.endDate >= today
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${trip.destination}, ${formatDay(trip.startDate)} to ${formatDay(trip.endDate)}`} onPress={onPress} pressRetentionOffset={12} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Plaque style={styles.row}>
        <View style={styles.rowText}>
          <T role="h3">{trip.destination}</T>
          <T role="caption" tone="muted">
            {formatDay(trip.startDate)} to {formatDay(trip.endDate)} · {trip.packedItemIds.length} pieces packed
          </T>
          <T role="lede" tone="faint" style={styles.rowNote}>
            {past ? 'what you packed, and what you wore' : on ? 'on now, the brief dresses you from the capsule' : 'the plan, and a checklist that remembers'}
          </T>
        </View>
        <T role="micro" tone="brass" style={styles.open}>
          Open →
        </T>
      </Plaque>
    </Pressable>
  )
}

export default function Trips() {
  const router = useRouter()
  const { t } = useTheme()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const q = useQuery({ queryKey: qk.trips, queryFn: getTrips })
  const trips = q.data?.trips ?? []
  const past = q.data?.past ?? []
  const list = tab === 'upcoming' ? trips : past

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Trips' }} />
      <Screen>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl tintColor={t.brass} refreshing={q.isFetching && !!q.data} onRefresh={() => void q.refetch()} />}>
          <RoomHeader
            eyebrow="Trips"
            title="Pack from"
            emphasis="your closet."
            lead="Where and when. Your stylist builds the capsule from clothes you own, plans each day, and lists the rest. Save it, and the trip keeps."
            style={styles.header}
          />
          <View style={styles.content}>
            {q.isError && !q.data ? (
              <LoadError message="Couldn’t load your trips. Check your connection and try again." onRetry={() => void q.refetch()} />
            ) : !q.data ? (
              <View style={styles.list} accessibilityLabel="Loading your trips">
                {[0, 1].map((i) => (
                  <Plaque key={i}>
                    <SkeletonBlock width="66%" height={20} />
                    <SkeletonBlock width="50%" height={16} style={{ marginTop: space.md }} />
                  </Plaque>
                ))}
              </View>
            ) : trips.length === 0 && past.length === 0 ? (
              <EmptyState title="Where next?" line="Name a destination and dates, and your stylist packs a capsule from your own closet." />
            ) : (
              <>
                <Tabs
                  items={[
                    { key: 'upcoming', label: 'Upcoming', count: trips.length },
                    { key: 'past', label: 'Past', count: past.length },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                {list.length === 0 ? (
                  <T role="bodySm" tone="muted" style={styles.none}>
                    {tab === 'upcoming' ? 'Nothing planned yet. Start one below.' : 'No trips have ended yet.'}
                  </T>
                ) : (
                  <View style={[styles.list, styles.afterTabs]}>
                    {list.map((trip) => (
                      <TripRow key={trip.id} trip={trip} past={tab === 'past'} onPress={() => router.push(routes.trip(trip.id))} />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
        <ActionBar>
          <Button label="Plan a trip" block onPress={() => router.push(routes.newTrip)} />
        </ActionBar>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: ACTION_BAR_HEIGHT + space.xl },
  header: { paddingBottom: 0 },
  content: { marginTop: space.xxl },
  list: { gap: space.md },
  afterTabs: { marginTop: space.lg },
  none: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingLeft: 20 },
  rowText: { flex: 1 },
  // The web's `mt-1 font-display text-xs italic`: Bodoni at 12 on a 16 line.
  rowNote: { marginTop: space.xs, fontSize: 12, lineHeight: 16 },
  open: { letterSpacing: 1.8 },
})
