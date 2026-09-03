// What else is on this morning: a trip coming up, and the circle's three
// most recent notes. Each is one card with one place to go.
import { Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import type { FeedCard, Trip } from '@zauq/shared/brief'
import { Plaque } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { tripDay, tripIsOn, tripIsTomorrow } from './copy'
import { go, paths } from './nav'

function cardEyebrow(card: FeedCard): string {
  switch (card.type) {
    case 'ootd':
      return 'Circle OOTD'
    case 'pick_received':
      return 'A friend styled you'
    case 'poll_result':
      return 'Your poll ended'
    case 'poll_open':
      return 'Poll running'
    case 'new_follower':
      return 'New follower'
    default:
      return 'Your circle'
  }
}

function cardLine(card: FeedCard): string {
  const s = (v: unknown) => String(v ?? '')
  switch (card.type) {
    case 'ootd':
      return `${s(card.name ?? card.handle)} shared today's outfit`
    case 'pick_received':
      return `${s(card.byName ?? card.byHandle ?? 'A friend')} picked an outfit for you`
    case 'poll_result':
      return `"${s(card.question)}", ${s(card.totalVotes)} ${card.totalVotes === 1 ? 'vote' : 'votes'} in`
    case 'poll_open':
      return `"${s(card.question)}" is collecting votes`
    case 'new_follower':
      return `${s(card.name ?? card.handle)} started following you`
    default:
      return 'Pick an outfit for a friend'
  }
}

function cardPath(card: FeedCard): string {
  if ((card.type === 'new_follower' || card.type === 'ootd') && typeof card.handle === 'string' && card.handle) return paths.person(card.handle)
  return paths.circle
}

export function TripBanner({ trip, index = 0 }: { trip: Trip; index?: number }) {
  const on = tripIsOn(trip)
  const tomorrow = tripIsTomorrow(trip)
  return (
    <Animated.View entering={rise(index)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${trip.destination}. Open the trip`} pressRetentionOffset={12} onPress={() => go(paths.trip(trip.id))}>
        <Plaque style={styles.plaque}>
          <T role="micro" tone="brass">
            {tomorrow ? 'Packing tonight?' : on ? 'On the road' : 'Trip coming up'}
          </T>
          <T role="lede" numberOfLines={2} style={styles.plaqueLine}>
            {trip.destination}
            {on ? '' : ` from ${tripDay(trip.startDate)}`} · {tomorrow ? 'the checklist is ready' : `${trip.packedItemIds.length} pieces packed`}
          </T>
        </Plaque>
      </Pressable>
    </Animated.View>
  )
}

export function Nudges({ cards, index = 0 }: { cards: FeedCard[]; index?: number }) {
  const { t } = useTheme()
  if (cards.length === 0) return null
  return (
    <Animated.View entering={rise(index)} style={styles.list}>
      {cards.map((card, i) => (
        <Pressable
          key={`${card.type}-${card.at}-${i}`}
          accessibilityRole="button"
          accessibilityLabel={`${cardEyebrow(card)}. ${cardLine(card)}`}
          pressRetentionOffset={12}
          onPress={() => go(cardPath(card))}
          style={[styles.card, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}
        >
          <T role="micro" tone="brass">
            {cardEyebrow(card)}
          </T>
          <T role="bodySm" tone="muted" numberOfLines={2}>
            {cardLine(card)}
          </T>
        </Pressable>
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  card: { borderWidth: hairline, padding: space.lg, gap: 4 },
  plaque: { padding: space.lg, paddingLeft: 20, gap: 4 },
  plaqueLine: { fontSize: 16, lineHeight: 22 },
})
