// What else is on this morning: a trip coming up, and the circle's three
// most recent notes. Each is one card with one place to go. TodayPage.tsx:
// `card p-4`, a tracked brass eyebrow, a two-line 14px note at ink/75, 12 apart.
import { Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import type { FeedCard, Trip } from '@zauq/shared/brief'
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

/** One nudge: the web's `card card-hover press p-4`. */
function NudgeCard({ eyebrow, line, accessibilityLabel, onPress }: { eyebrow: string; line: string; accessibilityLabel: string; onPress: () => void }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressRetentionOffset={12}
      onPress={onPress}
      style={[styles.card, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}
    >
      <T role="micro" tone="brass" style={styles.eyebrow}>
        {eyebrow}
      </T>
      <T role="bodySm" numberOfLines={2} style={{ color: alpha(t.ink, 0.75) }}>
        {line}
      </T>
    </Pressable>
  )
}

export function TripBanner({ trip, index = 0 }: { trip: Trip; index?: number }) {
  const on = tripIsOn(trip)
  const tomorrow = tripIsTomorrow(trip)
  const line = `${trip.destination}${on ? '' : ` from ${tripDay(trip.startDate)}`} · ${tomorrow ? 'the checklist is ready' : `${trip.packedItemIds.length} pieces packed`}`
  return (
    <Animated.View entering={rise(index)}>
      <NudgeCard
        eyebrow={tomorrow ? 'Packing tonight?' : on ? 'On the road' : 'Trip coming up'}
        line={line}
        accessibilityLabel={`${trip.destination}. Open the trip`}
        onPress={() => go(paths.trip(trip.id))}
      />
    </Animated.View>
  )
}

export function Nudges({ cards, index = 0 }: { cards: FeedCard[]; index?: number }) {
  if (cards.length === 0) return null
  return (
    <Animated.View entering={rise(index)} style={styles.list}>
      {cards.map((card, i) => (
        <NudgeCard key={`${card.type}-${card.at}-${i}`} eyebrow={cardEyebrow(card)} line={cardLine(card)} accessibilityLabel={`${cardEyebrow(card)}. ${cardLine(card)}`} onPress={() => go(cardPath(card))} />
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  card: { borderWidth: hairline, padding: space.lg, gap: space.xs },
  eyebrow: { letterSpacing: 1.8 },
})
