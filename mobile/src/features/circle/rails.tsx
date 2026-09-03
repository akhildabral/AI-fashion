// The furniture around the feed: who wore what today, people with your
// taste, you in the circle, and the quiet room when nothing hangs yet.
import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { type ReactNode } from 'react'
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
import { CARD_PAD, Card, Dashed, GarmentThumb, Initials, PhotoArch, Plate, Press } from './atoms'
import { userHref } from './notifications'

/** The web's `w-16` rail thumb. The label beneath may run a little wider so "Share yours" never truncates. */
const RAIL_W = 64
const RAIL_LABEL_W = 76

/** A rail thumb: the person when there's a photo, else the lead piece. */
function RailThumb({ look }: { look: LookPost }) {
  if (look.photoUrl) return <PhotoArch uri={look.photoUrl} width={RAIL_W} aspect={4 / 5} />
  return <GarmentThumb item={look.items[0]} width={RAIL_W} />
}

/** A rail tile: the arch, its label 6 beneath (`mt-1.5 text-[11px] text-ink/55`), wrapping to a second line rather than clipping. */
function RailTile({ label, accessibilityLabel, onPress, children }: { label: string; accessibilityLabel: string; onPress: () => void; children: ReactNode }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.railTile}>
      <View style={styles.railItem}>
        {children}
        <T role="caption" tone="faint" numberOfLines={2} align="center" style={styles.railLabel}>
          {label}
        </T>
      </View>
    </Press>
  )
}

/** Today in your circle: your look (or the door to share it), then everyone else's. */
export function TodayRail({ today, onShare }: { today: LookPost[] | null; onShare: () => void }) {
  const { t } = useTheme()
  const mine = today?.find((x) => x.isMine) ?? null
  const others = (today ?? []).filter((x) => !x.isMine && (x.photoUrl || x.items[0]))
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityLabel="Today in your circle">
      <RailTile label={mine ? 'Your look' : 'Share yours'} accessibilityLabel={mine ? 'Your look today. Share another.' : 'Share your look'} onPress={onShare}>
        {mine && (mine.photoUrl || mine.items[0]) ? (
          <RailThumb look={mine} />
        ) : (
          <View style={{ opacity: 0.5 }}>
            <Arch width={RAIL_W} aspect={4 / 5}>
              <View style={styles.plus}>
                <MaterialIcons name="add" size={18} color={t.brassLo} />
              </View>
            </Arch>
          </View>
        )}
      </RailTile>
      {others.map((look) => (
        <RailTile key={look.id} label={look.name} accessibilityLabel={`${look.name}’s look today`} onPress={() => look.handle && router.push(userHref(look.handle))}>
          <RailThumb look={look} />
        </RailTile>
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

/** People to follow, threaded into the feed after the second post (the web's `SuggestedRail`, a `card p-4`). */
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
      {/* `-mx-4 px-4`: the row bleeds to the card's edge and scrolls under it */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestedBleed} contentContainerStyle={styles.suggestedRow}>
        {people.map((p) => (
          <View key={p.handle} style={[styles.twin, { borderColor: alpha(t.ink, 0.1), backgroundColor: t.bone, borderRadius: radius }]}>
            <Press accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(userHref(p.handle))}>
              <View style={styles.twinPerson}>
                <Initials handle={p.handle} name={p.name} size={40} />
                <T role="bodySm" numberOfLines={1} align="center" style={[styles.twinName, { fontFamily: fonts.sansSemi }]}>
                  {p.name}
                </T>
                <T role="caption" tone="faint" numberOfLines={1} align="center" style={styles.twinSub}>
                  {p.sharedTaste[0] ?? `${p.match}% match`}
                </T>
              </View>
            </Press>
            <Button label="Follow" variant="ghost" size="sm" block onPress={() => onFollow(p.handle)} accessibilityLabel={`Follow ${p.name}`} />
          </View>
        ))}
        <View style={styles.seeAll}>
          <Button label="See all →" variant="quiet" size="sm" onPress={onSeeAll} accessibilityLabel="See all people with your taste" />
        </View>
      </ScrollView>
    </Card>
  )
}

/** You in the circle (the web's side card): a Bodoni title, three figures 24 apart, and the door. */
export function YouInCircle({ me, onInvite, onPeople }: { me: SocialMe | null | undefined; onInvite: () => void; onPeople: () => void }) {
  return (
    <Card style={styles.you}>
      <T role="h3" accessibilityRole="header">
        You in the circle
      </T>
      {me?.handle ? (
        <>
          <View style={styles.stats}>
            <Stat small value={me.followers} label="Followers" />
            <Stat small value={me.following} label="Following" />
            <Stat small value={me.picks} label="Styled for you" />
          </View>
          <View style={styles.youActions}>
            <View style={styles.youButton}>
              <Button label="Your people" variant="ghost" size="sm" block onPress={onPeople} />
            </View>
            <View style={styles.youButton}>
              <Button label="Invite a friend" variant="primary" size="sm" block onPress={onInvite} />
            </View>
          </View>
        </>
      ) : (
        <T role="bodySm" tone="muted">
          One moment…
        </T>
      )}
    </Card>
  )
}

/** No handle yet: friends can't find you until you pick one. */
export function HandleNudge({ onPick }: { onPick: () => void }) {
  return (
    <Card tone="brass" style={styles.nudge}>
      <View style={styles.nudgeText}>
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

/** The quiet room (the web's `EmptyFeed`): a dashed panel, `px-6 py-14`, the one thing to do beneath. */
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
      <T role="bodySm" tone="muted" align="center" style={styles.emptyBody}>
        {c.body}
      </T>
      {social && circleSize === 0 ? (
        <View style={styles.emptyActions}>
          <Button label="Invite a friend" onPress={onInvite} />
          <Button label="Find people already here" variant="quiet" onPress={onFind} />
        </View>
      ) : null}
      {social && circleSize !== 0 ? <Button label="Share a look" onPress={onShare} style={styles.emptyAction} /> : null}
    </Dashed>
  )
}

const styles = StyleSheet.create({
  // `flex gap-4 px-4 pb-2`
  rail: { flexDirection: 'row', gap: 16, paddingHorizontal: gutter, paddingBottom: 8, alignItems: 'flex-start' },
  railTile: { width: RAIL_W },
  railItem: { alignItems: 'center', gap: 6 },
  railLabel: { width: RAIL_LABEL_W },
  plus: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // `self-center pl-2`, level with the arch
  railNote: { height: Math.round(RAIL_W / (4 / 5)), justifyContent: 'center', paddingLeft: 8 },
  // `card p-4`, the row `mt-3 gap-3 pb-1`
  suggested: { padding: CARD_PAD, gap: 12 },
  suggestedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  suggestedBleed: { marginHorizontal: -CARD_PAD },
  suggestedRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: CARD_PAD, paddingBottom: 4 },
  // `w-36 p-3`: initials, name `mt-2`, sub `mt-0.5`, Follow `mt-3 w-full`
  twin: { width: 144, padding: 12, gap: 12, borderWidth: hairline },
  twinPerson: { alignItems: 'center' },
  twinName: { marginTop: 8, maxWidth: '100%' },
  twinSub: { marginTop: 2, maxWidth: '100%' },
  seeAll: { paddingHorizontal: 4 },
  // `card p-4`; the stats `mt-4 gap-6`; the actions `mt-4 gap-2`
  you: { marginHorizontal: gutter, padding: CARD_PAD, gap: 16 },
  stats: { flexDirection: 'row', gap: 24 },
  youActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  youButton: { flex: 1 },
  nudge: { marginHorizontal: gutter, padding: CARD_PAD, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nudgeText: { flex: 1, gap: 2 },
  // `px-6 py-14`; the body `mt-2 max-w-sm`; the actions `mt-5 gap-x-4 gap-y-2`
  empty: { marginHorizontal: gutter, marginTop: 4, paddingVertical: 56, paddingHorizontal: 24 },
  emptyBody: { maxWidth: 300 },
  emptyActions: { alignItems: 'center', gap: 8, marginTop: 12 },
  emptyAction: { marginTop: 12 },
})
