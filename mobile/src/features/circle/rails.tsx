// The furniture around the feed: who wore what today, people with your
// taste, you in the circle, and the quiet room when nothing hangs yet.
import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { Lens, LookPost } from '@zauq/shared/circle'
import type { SocialMe, StyleTwin } from '@zauq/shared/social'
import { Arch } from '@/src/components/Arch'
import { Stat } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { Card, Dashed, GarmentThumb, Initials, PhotoArch, Plate, Press } from './atoms'
import { userHref } from './notifications'

const RAIL_W = 64

/** A rail thumb: the person when there's a photo, else the lead piece. */
function RailThumb({ look }: { look: LookPost }) {
  if (look.photoUrl) return <PhotoArch uri={look.photoUrl} width={RAIL_W} aspect={4 / 5} />
  return <GarmentThumb item={look.items[0]} width={RAIL_W} />
}

/** Today in your circle: your look (or the door to share it), then everyone else's. */
export function TodayRail({ today, onShare }: { today: LookPost[] | null; onShare: () => void }) {
  const { t } = useTheme()
  const mine = today?.find((x) => x.isMine) ?? null
  const others = (today ?? []).filter((x) => !x.isMine && (x.photoUrl || x.items[0]))
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityLabel="Today in your circle">
      <Press accessibilityRole="button" accessibilityLabel={mine ? 'Your look today. Share another.' : 'Share your look'} onPress={onShare} style={{ width: RAIL_W }}>
        <View style={styles.railItem}>
          {mine && (mine.photoUrl || mine.items[0]) ? (
            <RailThumb look={mine} />
          ) : (
            <View style={{ opacity: 0.6 }}>
              <Arch width={RAIL_W} aspect={4 / 5}>
                <View style={styles.plus}>
                  <MaterialIcons name="add" size={20} color={t.brassLo} />
                </View>
              </Arch>
            </View>
          )}
          <T role="caption" tone="faint" numberOfLines={1} align="center">
            {mine ? 'Your look' : 'Share yours'}
          </T>
        </View>
      </Press>
      {others.map((look) => (
        <Press key={look.id} accessibilityRole="button" accessibilityLabel={`${look.name}’s look today`} onPress={() => look.handle && router.push(userHref(look.handle))} style={{ width: RAIL_W }}>
          <View style={styles.railItem}>
            <RailThumb look={look} />
            <T role="caption" tone="faint" numberOfLines={1} align="center">
              {look.name}
            </T>
          </View>
        </Press>
      ))}
      {today && others.length === 0 ? (
        <View style={styles.railNote}>
          <T role="caption" tone="faint">
            No one in your circle has shared a look today.
          </T>
        </View>
      ) : null}
    </ScrollView>
  )
}

/** People to follow, threaded into the feed after the second post. */
export function SuggestedRail({ people, onFollow, onDismiss, onSeeAll }: { people: StyleTwin[]; onFollow: (handle: string) => void; onDismiss: () => void; onSeeAll: () => void }) {
  const { t } = useTheme()
  return (
    <Card style={styles.suggested}>
      <View style={styles.suggestedHead}>
        <Plate>Kindred taste</Plate>
        <Press accessibilityRole="button" accessibilityLabel="Hide these suggestions" hitSlop={8} onPress={onDismiss}>
          <T role="caption" tone="faint">
            Hide
          </T>
        </Press>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestedRow}>
        {people.map((p) => (
          <View key={p.handle} style={[styles.twin, { borderColor: alpha(t.ink, 0.1), backgroundColor: t.bone, borderRadius: radius }]}>
            <Press accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(userHref(p.handle))}>
              <View style={styles.twinPerson}>
                <Initials handle={p.handle} name={p.name} size={40} />
                <T role="bodySm" numberOfLines={1} align="center" style={{ fontFamily: fonts.sansSemi }}>
                  {p.name}
                </T>
                <T role="caption" tone="faint" numberOfLines={1} align="center">
                  {p.sharedTaste[0] ?? `${p.match}% match`}
                </T>
              </View>
            </Press>
            <Button label="Follow" variant="ghost" size="sm" block onPress={() => onFollow(p.handle)} accessibilityLabel={`Follow ${p.name}`} />
          </View>
        ))}
        <View style={styles.seeAll}>
          <Button label="See all" variant="quiet" size="sm" onPress={onSeeAll} />
        </View>
      </ScrollView>
    </Card>
  )
}

/** You in the circle: three figures and the door. */
export function YouInCircle({ me, onInvite, onPeople }: { me: SocialMe | null | undefined; onInvite: () => void; onPeople: () => void }) {
  const { t } = useTheme()
  return (
    <View style={[styles.you, { borderTopColor: alpha(t.ink, 0.1), borderBottomColor: alpha(t.ink, 0.1) }]}>
      <View style={styles.stats}>
        <Stat small value={me?.followers ?? '–'} label="Followers" />
        <Stat small value={me?.following ?? '–'} label="Following" />
        <Stat small value={me?.picks ?? '–'} label="Styled for you" />
      </View>
      <View style={styles.youActions}>
        <Button label="Your people" variant="quiet" size="sm" onPress={onPeople} />
        <Button label="Invite a friend" variant="ghost" size="sm" onPress={onInvite} />
      </View>
    </View>
  )
}

/** No handle yet: friends can't find you until you pick one. */
export function HandleNudge({ onPick }: { onPick: () => void }) {
  return (
    <Card tone="brass" style={styles.nudge}>
      <View style={{ flex: 1, gap: 2 }}>
        <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
          Pick a handle
        </T>
        <T role="caption" tone="muted">
          So friends can find you and @mention you.
        </T>
      </View>
      <Button label="Choose" variant="primary" size="sm" onPress={onPick} />
    </Card>
  )
}

export function EmptyFeed({ lens, circleSize, onFind, onShare, onInvite }: { lens: Lens; circleSize: number | null; onFind: () => void; onShare: () => void; onInvite: () => void }) {
  const copy: Record<Lens, { title: string; body: string }> = {
    foryou: {
      title: 'The salon is quiet',
      body: circleSize === 0 ? 'Bring in someone whose taste you trust. Their looks, verdicts and picks gather here.' : 'Your circle’s gone quiet. Share yours and get it going.',
    },
    following: { title: 'Nothing new from your people', body: 'When they share a look or ask a verdict, it lands here in order.' },
    explore: { title: 'Nothing hung yet', body: 'When people post their outfit of the day, the best of it lands here.' },
    saved: { title: 'Your board is empty', body: 'Tap Save on any look you’d wear. It waits here for when you need the idea.' },
  }
  const c = copy[lens]
  const social = lens === 'foryou' || lens === 'following'
  return (
    <Dashed style={styles.empty}>
      <T role="h2" align="center">
        {c.title}
      </T>
      <T role="bodySm" tone="muted" align="center" style={{ maxWidth: 300 }}>
        {c.body}
      </T>
      {social && circleSize === 0 ? (
        <View style={styles.emptyActions}>
          <Button label="Invite a friend" onPress={onInvite} />
          <Button label="Find people already here" variant="quiet" size="sm" onPress={onFind} />
        </View>
      ) : null}
      {social && circleSize !== 0 ? <Button label="Share a look" onPress={onShare} style={{ marginTop: 8 }} /> : null}
    </Dashed>
  )
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', gap: 14, paddingHorizontal: gutter, paddingVertical: 4 },
  railItem: { gap: 6 },
  plus: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  railNote: { justifyContent: 'center', paddingLeft: 4 },
  suggested: { padding: 14, gap: 12 },
  suggestedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  suggestedRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  twin: { width: 140, padding: 12, gap: 10, borderWidth: hairline },
  twinPerson: { alignItems: 'center', gap: 6 },
  seeAll: { paddingHorizontal: 6 },
  you: { marginHorizontal: gutter, paddingVertical: 14, gap: 12, borderTopWidth: hairline, borderBottomWidth: hairline },
  stats: { flexDirection: 'row', gap: 28 },
  youActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nudge: { marginHorizontal: gutter, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { marginHorizontal: gutter, paddingVertical: 36 },
  emptyActions: { alignItems: 'center', gap: 8, marginTop: 8 },
})
