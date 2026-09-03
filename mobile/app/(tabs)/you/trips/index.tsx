// Trips: the ones ahead and the ones behind, each a page you can open.
import { useQuery } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { getTrips, type Trip } from '@zauq/shared/brief'
import { EmptyState, LoadError, Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { ActionBar, ACTION_BAR_HEIGHT } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { dayKey, formatDay } from '@/src/features/you/dates'
import { routes } from '@/src/features/you/nav'

function TripRow({ trip, past, onPress }: { trip: Trip; past?: boolean; onPress: () => void }) {
  const today = dayKey(new Date())
  const on = !past && trip.startDate <= today && trip.endDate >= today
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${trip.destination}, ${formatDay(trip.startDate)} to ${formatDay(trip.endDate)}`} onPress={onPress} pressRetentionOffset={12} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Plaque style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <T role="h3">{trip.destination}</T>
          <T role="caption" tone="muted">
            {formatDay(trip.startDate)} to {formatDay(trip.endDate)} · {trip.packedItemIds.length} pieces packed
          </T>
          <T role="lede" tone="faint" style={{ fontSize: 13, lineHeight: 18 }}>
            {past ? 'what you packed, and what you wore' : on ? 'on now, the brief dresses you from the capsule' : 'the plan, and a checklist that remembers'}
          </T>
        </View>
        <T role="micro" tone="brass">
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
          <View style={styles.head}>
            <T role="h1" accessibilityRole="header">
              Pack from <T role="h1" tone="brass" italic>{`your closet.`}</T>
            </T>
            <T role="bodySm" tone="muted">
              Where and when. Your stylist builds the capsule from clothes you own, plans each day, and lists the rest.
            </T>
          </View>
          {q.isError && !q.data ? (
            <LoadError message="Couldn’t load your trips. Check your connection and try again." onRetry={() => void q.refetch()} />
          ) : !q.data ? (
            <View style={styles.list} accessibilityLabel="Loading your trips">
              {[0, 1].map((i) => (
                <Plaque key={i}>
                  <SkeletonBlock width="60%" height={18} />
                  <SkeletonBlock width="45%" height={10} style={{ marginTop: 10 }} />
                </Plaque>
              ))}
            </View>
          ) : trips.length === 0 && past.length === 0 ? (
            <EmptyState title="No trips yet." line="Name a destination and dates, and your stylist packs a capsule from your own closet." />
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
                <T role="bodySm" tone="muted">
                  {tab === 'upcoming' ? 'Nothing planned yet. Start one below.' : 'No trips have ended yet.'}
                </T>
              ) : (
                <View style={styles.list}>
                  {list.map((trip) => (
                    <TripRow key={trip.id} trip={trip} past={tab === 'past'} onPress={() => router.push(routes.trip(trip.id))} />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
        <ActionBar>
          <Button label="Plan a trip" block onPress={() => router.push(routes.newTrip)} />
        </ActionBar>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: ACTION_BAR_HEIGHT + space.xl, gap: space.lg },
  head: { gap: space.sm },
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 16, paddingLeft: 20 },
})
