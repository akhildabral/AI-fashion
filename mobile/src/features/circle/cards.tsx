// The Circle's cards, ported from CircleCards.tsx: a look, a verdict, a
// pick, the week. Every card asks something of you. The board is the
// flat-lay engine every look sits on; a double tap on it is "would wear".
//
// The web's rhythm, value by value: the card is `p-4` (16); the handle row
// sits at the top; the caption, the board and the foot each follow at 12
// (`mt-3`); the foot is a hairline with the verbs first and the reactions
// after, in `text-xs font-semibold`, brass when on.
import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { dressingOrder } from '@zauq/shared/flatlay'
import { timeAgo, timeLeft, type CirclePost, type LookPost, type PickPost, type PostItem, type PostTarget, type ReactionKind, type ReactionSummary, type VerdictPost, type WeekPost } from '@zauq/shared/circle'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { FlatLay, LookBoard } from '@/src/components/LookBoard'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, height, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { ActionChip, CARD_PAD, Card, Count, GarmentThumb, Initials, PhotoArch, Plate, Press } from './atoms'
import type { CardActions } from './hooks'
import { MenuSheet, MoreButton, type MenuItem } from './MenuSheet'
import { userHref } from './notifications'

/* ---------- atoms ---------- */

function mirrorHref(items: PostItem[]) {
  return `/(tabs)/mirror?items=${items.map((i) => i.id).join(',')}` as never
}

/** The handle row: a 36 square of initials, the name in `text-sm font-semibold`, the meta in `text-xs`, the kicker, the "···". */
function PostHeader({ handle, name, label, meta, plate, menu }: { handle: string | null; name: string; label?: string; meta: string; plate: string; menu: ReactNode }) {
  const open = handle ? () => router.push(userHref(handle)) : undefined
  return (
    <View style={styles.head}>
      <Press accessibilityRole="button" accessibilityLabel={name} disabled={!open} onPress={open}>
        <Initials handle={handle} name={name} />
      </Press>
      <View style={styles.headText}>
        <T role="bodySm" numberOfLines={1} style={{ fontFamily: fonts.sansSemi }} onPress={open}>
          {label ?? (name.trim() || handle || 'someone')}
        </T>
        <T role="caption" tone="faint" numberOfLines={1}>
          {meta}
        </T>
      </View>
      <Plate>{plate}</Plate>
      {menu}
    </View>
  )
}

function reactionLine(r: ReactionSummary, verb = 'would wear this'): string | null {
  const { total, sample, mine } = r
  if (total === 0) return null
  const others = total - (mine ? 1 : 0)
  const parts: string[] = []
  if (mine) parts.push('You')
  parts.push(...sample.slice(0, 2))
  const rest = others - Math.min(2, sample.length)
  let s = parts.join(', ')
  if (rest > 0) s += ` and ${rest} other${rest === 1 ? '' : 's'}`
  return `${s} ${verb}`
}

/** The same three reactions on every post. On a look, "Would wear" is the primary verb and sits first. */
function Reactions({ target, id, reactions, actions, skipWouldWear = false }: { target: PostTarget; id: string; reactions: ReactionSummary; actions: CardActions; skipWouldWear?: boolean }) {
  const { mine, counts } = reactions
  const toggle = (k: ReactionKind) => actions.react(target, id, mine === k ? null : k)
  return (
    <>
      {!skipWouldWear ? <ActionChip icon="favorite-border" iconOn="favorite" label="Would wear" count={counts.would_wear} on={mine === 'would_wear'} onPress={() => toggle('would_wear')} accessibilityLabel="Would wear" /> : null}
      <ActionChip icon="bolt" label="Bold" count={counts.bold} on={mine === 'bold'} onPress={() => toggle('bold')} accessibilityLabel="Bold" />
      <ActionChip icon="star-border" iconOn="star" label="Love" count={counts.love} on={mine === 'love'} onPress={() => toggle('love')} accessibilityLabel="Love" />
    </>
  )
}

function NotesButton({ count, onPress }: { count: number; onPress: () => void }) {
  return <ActionChip icon="chat-bubble-outline" label={count > 0 ? undefined : 'Note'} count={count} onPress={onPress} accessibilityLabel={count > 0 ? `${count} notes` : 'Add a note'} />
}

/**
 * A card's foot (the web's `CardFoot`): a hairline 12 below the last line,
 * the verbs first (primary leading), then the row of reactions and notes,
 * wrapping as wholes. The verbs sit on the card's 16 gutter; the chips
 * carry their own 8 of padding, pulled back so their icons sit on it too.
 */
function CardFoot({ verbs, children, brass }: { verbs?: ReactNode; children: ReactNode; brass?: boolean }) {
  const { t } = useTheme()
  return (
    <View style={[styles.foot, { borderTopColor: alpha(brass ? t.brass : t.ink, brass ? 0.2 : 0.1) }]}>
      {verbs ? <View style={styles.verbs}>{verbs}</View> : null}
      <View style={styles.reactions}>{children}</View>
    </View>
  )
}

/* ---------- the board ---------- */

/**
 * The look, hung two ways. With a photo: the person in the arch, the pieces
 * as a strip beneath. Without: the flat-lay. A tap shows the recipe (the
 * pieces named in dressing order); a double tap says you'd wear it.
 */
function LookHero({ items, photoUrl, width, onDouble }: { items: PostItem[]; photoUrl?: string | null; width: number; onDouble?: () => void }) {
  const { t } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const pulse = useSharedValue(0)
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get(), transform: [{ scale: 0.7 + pulse.get() * 0.4 }] }))

  const fire = () => {
    if (!onDouble) return
    haptics.tap()
    pulse.set(withSequence(withTiming(1, { duration: 140, easing: EASE_OUT }), withDelay(320, withTiming(0, { duration: 260, easing: EASE_OUT }))))
    onDouble()
  }
  const toggle = () => setExpanded((v) => !v)

  const double = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(fire)()
    })
  const single = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(toggle)()
    })
  const gesture = Gesture.Exclusive(double, single)

  if (items.length === 0 && !photoUrl) return null
  const strip = dressingOrder(items)
  // The web's `w-12` strip thumbs.
  const thumb = 48

  const overlay = (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pulse, pulseStyle]}>
      <View style={[styles.pulseDisc, { backgroundColor: alpha(t.brass, 0.85) }]}>
        <MaterialIcons name="favorite" size={30} color={t.onBrass} />
      </View>
    </Animated.View>
  )

  return (
    <View style={styles.hero}>
      <GestureDetector gesture={gesture}>
        <View accessible accessibilityRole="button" accessibilityLabel={photoUrl ? 'The look, worn' : 'The look, laid out'} accessibilityHint="Tap to name the pieces. Double tap to say you would wear it.">
          {photoUrl ? <PhotoArch uri={photoUrl} width={width} aspect={3 / 4} /> : <LookBoard items={items} width={width} aspect={5 / 4} />}
          {overlay}
        </View>
      </GestureDetector>
      {strip.length > 0 ? (
        expanded || photoUrl ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {strip.map((it) => (
              <View key={it.id} style={{ width: thumb, gap: 4 }}>
                <GarmentThumb item={it} width={thumb} />
                {expanded ? (
                  <T role="micro" tone="faint" numberOfLines={1} align="center">
                    {it.subtype ?? it.category}
                  </T>
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.names}>
            {strip.slice(0, 6).map((it) => (
              <T key={it.id} role="micro" tone="faint">
                {it.subtype ?? it.category}
              </T>
            ))}
          </View>
        )
      ) : null}
    </View>
  )
}

/* ---------- cards ---------- */

/** A card's inner width: the screen less the gutters and the card's own padding. Boards fill it. */
export function useCardWidth(): number {
  const { width } = useWindowDimensions()
  return width - gutter * 2 - CARD_PAD * 2
}

export function LookCard({ post, actions }: { post: LookPost; actions: CardActions }) {
  const inner = useCardWidth()
  const line = reactionLine(post.reactions)
  const on = post.reactions.mine === 'would_wear'
  const menu: MenuItem[] = []
  if (!post.isMine) menu.push({ label: post.saved ? 'Remove from your board' : 'Save to your board', onSelect: () => actions.save(post.id, !post.saved) })
  if (post.isMine) menu.push({ label: 'Share the page', onSelect: () => void actions.share('look', post.id, 'Wore this today') })
  if (!post.isMine && post.handle) menu.push({ label: `Mute ${post.name} for a while`, onSelect: () => void actions.mute(post.handle as string) })
  if (!post.isMine) menu.push({ label: 'Report', onSelect: () => actions.report('look', post.id, `${post.name}’s look`) })
  if (post.isMine) menu.push({ label: 'Take it down', danger: true, onSelect: () => void actions.takeDown('look', post.id) })

  return (
    <Card tone={post.featured ? 'brass' : 'plain'}>
      <PostHeader
        handle={post.handle}
        name={post.name}
        meta={`Outfit of the day${post.eventType ? ` · ${post.eventType}` : ''} · ${timeAgo(post.at)}`}
        plate={post.featured ? 'Featured' : 'Look'}
        menu={<MoreButton items={menu} title={`${post.name}’s look`} />}
      />
      <LookHero items={post.items} photoUrl={post.photoUrl} width={inner} onDouble={post.isMine || on ? undefined : () => actions.react('look', post.id, 'would_wear')} />
      {line ? (
        <T role="caption" tone="faint" style={styles.line}>
          {line}
        </T>
      ) : null}
      <CardFoot
        verbs={
          post.isMine ? (
            <T role="caption" tone="faint">
              Your look, on the circle.
            </T>
          ) : (
            <Button
              label={on ? 'Would wear ✓' : 'Would wear'}
              variant={on ? 'ghost' : 'primary'}
              size="sm"
              accessibilityState={{ selected: on }}
              onPress={() => actions.react('look', post.id, on ? null : 'would_wear')}
              icon={post.reactions.counts.would_wear ? <Count n={post.reactions.counts.would_wear} /> : undefined}
            />
          )
        }
      >
        {!post.isMine ? <Reactions target="look" id={post.id} reactions={post.reactions} actions={actions} skipWouldWear /> : null}
        <NotesButton count={post.comments} onPress={() => actions.open('look', post.id)} />
        {!post.isMine && post.items.length > 0 ? <ActionChip icon="autorenew" label="Recreate" onPress={() => actions.recreate(post.name, post.items)} accessibilityLabel="Recreate from my closet" /> : null}
        {!post.isMine ? <ActionChip icon="bookmark-border" iconOn="bookmark" on={post.saved} onPress={() => actions.save(post.id, !post.saved)} accessibilityLabel={post.saved ? 'Remove from your board' : 'Save to your board'} /> : null}
      </CardFoot>
    </Card>
  )
}

export function VerdictCard({ post, actions }: { post: VerdictPost; actions: CardActions }) {
  const { t } = useTheme()
  const inner = useCardWidth()
  const [voting, setVoting] = useState<string | null>(null)
  const canVote = !post.settled && !post.isMine
  const counts = post.counts
  const leader = counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] : null
  const options = post.options.slice(0, 3)
  // Three options across the card's inner width, `gap-3` apart.
  const optW = Math.floor((inner - OPTION_GAP * (options.length - 1)) / options.length)

  const menu: MenuItem[] = []
  if (post.isMine && !post.settled) menu.push({ label: 'Share the vote page', onSelect: () => void actions.share('verdict', post.id, post.question) })
  if (post.isMine && !post.settled) menu.push({ label: 'Settle it now', onSelect: () => void actions.settle(post.id) })
  if (!post.isMine && post.handle) menu.push({ label: `Mute ${post.name} for a while`, onSelect: () => void actions.mute(post.handle as string) })
  if (!post.isMine) menu.push({ label: 'Report', onSelect: () => actions.report('verdict', post.id, `${post.name}’s verdict`) })
  if (post.isMine) menu.push({ label: 'Take it down', danger: true, onSelect: () => void actions.takeDown('verdict', post.id) })

  const meta = post.isMine
    ? `Your verdict${post.audience === 'friends' ? ` · asked ${post.askedOf.slice(0, 2).join(' and ')}${post.askedOf.length > 2 ? ` +${post.askedOf.length - 2}` : ''}` : post.audience === 'link' ? ' · by link' : ''} · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
    : `${post.askedMe ? 'asked you' : 'needs a verdict'} · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`

  const tally = post.settled
    ? `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} · settled`
    : post.isMine
      ? post.voters.length > 0
        ? `${post.voters
            .map((v) => `${v.name} (${v.optionId.toUpperCase()})`)
            .slice(0, 4)
            .join(', ')}${post.voters.length > 4 ? ` and ${post.voters.length - 4} more` : ''}${post.totalVotes > post.voters.length ? ` · ${post.totalVotes - post.voters.length} by link` : ''}`
        : `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} so far`
      : post.myVote
        ? 'You weighed in. Tap another to change your mind until it settles.'
        : 'Tap the one they should wear.'

  return (
    <Card>
      <PostHeader handle={post.handle} name={post.name} meta={meta} plate={post.settled ? 'Verdict is in' : 'Verdict'} menu={<MoreButton items={menu} title={`${post.name}’s verdict`} />} />
      <T role="h3" style={styles.question}>
        {post.question}
      </T>
      <View style={styles.options}>
        {options.map((o) => {
          const won = Boolean(post.settled && leader && leader === o.id)
          const chosen = post.myVote === o.id
          const n = counts?.[o.id] ?? 0
          const share = counts && post.totalVotes > 0 ? Math.round((n / post.totalVotes) * 100) : null
          const body = (
            <View style={{ width: optW }}>
              <PhotoArch uri={o.imageUrl} width={optW} aspect={3 / 4} selected={won || chosen} cover={false} />
              {counts ? (
                <>
                  <View style={[styles.bar, { backgroundColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
                    <View style={[styles.barFill, { width: `${share ?? 0}%`, backgroundColor: t.brass }]} />
                  </View>
                  <View style={styles.optMeta}>
                    <T role="caption" tone={won || chosen ? 'brass' : 'faint'} style={{ fontFamily: fonts.sansSemi }}>
                      {o.id.toUpperCase()}
                      {won ? ' · won' : chosen ? ' · yours' : ''}
                    </T>
                    {/* the web's `font-display text-sm` figure */}
                    <T role="statSm" style={styles.share}>
                      {`${share ?? 0}%`}
                    </T>
                  </View>
                </>
              ) : (
                <T role="label" tone={chosen ? 'brass' : 'faint'} align="center" style={styles.optLabel}>
                  {voting === o.id ? 'Sending…' : chosen ? `${o.id.toUpperCase()} · yours` : o.id.toUpperCase()}
                </T>
              )}
            </View>
          )
          return canVote ? (
            <Press
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={chosen ? `Your vote: ${o.id.toUpperCase()}` : `Vote ${o.id.toUpperCase()}`}
              accessibilityState={{ selected: chosen, disabled: voting !== null }}
              disabled={voting !== null}
              onPress={() => {
                if (chosen) return
                setVoting(o.id)
                void actions.vote(post.id, o.id).finally(() => setVoting(null))
              }}
            >
              {body}
            </Press>
          ) : (
            <View key={o.id}>{body}</View>
          )
        })}
      </View>
      <T role="caption" tone="faint" style={styles.line}>
        {tally}
      </T>
      <CardFoot>
        {!post.isMine ? <Reactions target="verdict" id={post.id} reactions={post.reactions} actions={actions} /> : null}
        <NotesButton count={post.comments} onPress={() => actions.open('verdict', post.id)} />
      </CardFoot>
    </Card>
  )
}

export function PickCard({ post, actions }: { post: PickPost; actions: CardActions }) {
  const { t } = useTheme()
  const [thanking, setThanking] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [photoMenu, setPhotoMenu] = useState(false)
  const byMe = post.role === 'by_me'
  const worn = !!post.wornLogId || !!post.wornAt

  const menu: MenuItem[] = []
  if (post.handle && !byMe) menu.push({ label: `Mute ${post.name} for a while`, onSelect: () => void actions.mute(post.handle as string) })
  if (!byMe) menu.push({ label: 'Report', onSelect: () => actions.report('pick', post.id, `${post.name}’s pick`) })
  if (byMe && !post.wornAt) menu.push({ label: 'Take it back', danger: true, onSelect: () => void actions.withdraw(post.id) })
  if (!byMe) menu.push({ label: 'Dismiss', danger: true, onSelect: () => void actions.dismiss(post.id) })

  const forLine = post.forDay ? ` · for ${post.forDay}` : ''
  const meta = byMe ? `you styled a look for ${post.name}${forLine} · ${timeAgo(post.at)}` : `styled a look for you${forLine} · ${timeAgo(post.at)}`
  const state = post.wornAt
    ? byMe
      ? `${post.name} wore it${post.photoUrl ? '' : '. The photo will land here'}.`
      : 'Worn. They’ll know.'
    : post.thanksAt
      ? byMe
        ? `${post.name} said thanks${post.reply ? `: “${post.reply}”` : '.'}`
        : `You said thanks${post.reply ? `: “${post.reply}”` : '.'}`
      : byMe
        ? 'Waiting for them.'
        : null

  return (
    <Card tone={byMe ? 'plain' : 'soft'}>
      <PostHeader handle={post.handle} name={post.name} label={byMe ? `For ${post.name}` : undefined} meta={meta} plate={byMe ? 'Your pick' : 'For you'} menu={<MoreButton items={menu} title={byMe ? `Your pick for ${post.name}` : `${post.name}’s pick`} />} />
      {post.note ? (
        // The caption: `font-display italic text-base`.
        <T role="lede" tone="muted" style={[styles.line, styles.note]}>
          {`“${post.note}”`}
        </T>
      ) : null}
      <View style={styles.pickBody}>
        <View style={styles.thumbs}>
          {post.items.slice(0, 5).map((it) => (
            <GarmentThumb key={it.id} item={it} width={56} />
          ))}
        </View>
        {post.photoUrl ? <PhotoArch uri={post.photoUrl} width={96} aspect={3 / 4} selected /> : null}
      </View>
      {state ? (
        <T role="caption" tone="muted" style={styles.line}>
          {state}
        </T>
      ) : null}
      {thanking && !byMe ? (
        <View style={styles.thanks}>
          <View style={[styles.replyBox, { borderColor: alpha(t.ink, 0.18), backgroundColor: t.surface, borderRadius: radius }]}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              maxLength={280}
              autoFocus
              placeholder="A line back (optional)"
              placeholderTextColor={alpha(t.ink, 0.4)}
              selectionColor={t.brass}
              accessibilityLabel="A line back"
              style={[styles.replyInput, { color: t.ink, fontFamily: fonts.sans }]}
            />
          </View>
          <Button
            label="Send thanks"
            size="sm"
            loading={sending}
            onPress={() => {
              setSending(true)
              void actions
                .thank(post.id, reply.trim())
                .then(() => setThanking(false))
                .finally(() => setSending(false))
            }}
          />
        </View>
      ) : null}
      <CardFoot
        brass={!byMe}
        verbs={
          byMe ? undefined : (
            <>
              <Button label={worn ? 'Worn ✓' : 'I wore it'} variant={worn ? 'ghost' : 'primary'} size="sm" disabled={worn || post.items.length === 0} onPress={() => void actions.wear(post)} />
              {post.wornLogId && !post.photoUrl ? <Button label="Add the photo" variant="ghost" size="sm" onPress={() => setPhotoMenu(true)} /> : null}
              {!worn ? <Button label="See it on me" variant="ghost" size="sm" onPress={() => router.push(mirrorHref(post.items))} /> : null}
              {!post.thanksAt && !thanking ? <Button label="Say thanks" variant="quiet" size="sm" onPress={() => setThanking(true)} /> : null}
            </>
          )
        }
      >
        {!byMe ? <Reactions target="pick" id={post.id} reactions={post.reactions} actions={actions} /> : null}
        <NotesButton count={post.comments} onPress={() => actions.open('pick', post.id)} />
      </CardFoot>
      <MenuSheet
        open={photoMenu}
        title="The photo of you in it"
        onClose={() => setPhotoMenu(false)}
        items={[
          { label: 'Take a photo', onSelect: () => void actions.photo(post, 'camera') },
          { label: 'Choose from your photos', onSelect: () => void actions.photo(post, 'library') },
        ]}
      />
    </Card>
  )
}

/** Sunday's gathering: what the circle did this week, as one card. */
export function WeekCard({ post, actions }: { post: WeekPost; actions: CardActions }) {
  const { t } = useTheme()
  const from = new Date(post.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const to = new Date(post.to).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const tile = { borderColor: alpha(t.ink, 0.1), borderRadius: radius }
  return (
    <Card tone="brass">
      <View style={styles.head}>
        <View style={[styles.seven, { borderColor: alpha(t.brass, 0.5), borderRadius: radius }]}>
          <T role="h3" tone="brass">
            7
          </T>
        </View>
        <View style={styles.headText}>
          <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
            Your circle this week
          </T>
          <T role="caption" tone="faint" numberOfLines={1}>
            {`${from} – ${to} · ${post.looksShared} look${post.looksShared === 1 ? '' : 's'} from ${post.people} ${post.people === 1 ? 'person' : 'people'}`}
          </T>
        </View>
        <Plate>The week</Plate>
      </View>
      <View style={styles.week}>
        {post.topLook ? (
          <Press accessibilityRole="button" accessibilityLabel="Look of the week" onPress={() => actions.open('look', post.topLook!.id)}>
            <View style={[styles.tile, tile]}>
              <Arch width={64} aspect={4 / 5} variant={post.topLook.photoUrl ? 'photo' : 'niche'} selected>
                {post.topLook.photoUrl ? <PhotoArch uri={post.topLook.photoUrl} width={64} aspect={4 / 5} /> : <FlatLay items={post.topLook.items} frameRatio={0.8} />}
              </Arch>
              <View style={styles.tileText}>
                <Plate>Look of the week</Plate>
                <T role="bodySm">
                  <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                    {post.topLook.name}
                  </T>
                  {` · ${post.topLook.wouldWear} would wear it`}
                </T>
              </View>
            </View>
          </Press>
        ) : null}
        {post.mostWorn ? (
          <View style={[styles.tile, tile]}>
            <GarmentThumb item={post.mostWorn.item} width={56} />
            <View style={styles.tileText}>
              <Plate>Most on the table</Plate>
              <T role="bodySm">
                {'The '}
                <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                  {post.mostWorn.item.subtype ?? post.mostWorn.item.category}
                </T>
                {`, ${post.mostWorn.count} times${post.mostWorn.by.length > 0 ? ` · ${post.mostWorn.by.join(', ')}` : ''}`}
              </T>
            </View>
          </View>
        ) : null}
        {post.bestVerdict ? (
          <Press accessibilityRole="button" accessibilityLabel="The verdict of the week" onPress={() => actions.open('verdict', post.bestVerdict!.id)}>
            <View style={[styles.tile, styles.tileColumn, tile]}>
              <Plate>The verdict of the week</Plate>
              <T role="h3">{`“${post.bestVerdict.question}”`}</T>
              <T role="caption" tone="muted">
                {`${post.bestVerdict.name} asked · ${post.bestVerdict.votes} vote${post.bestVerdict.votes === 1 ? '' : 's'} · ${post.bestVerdict.winner ? `${post.bestVerdict.winner} won` : 'a split'}`}
              </T>
            </View>
          </Press>
        ) : null}
        {post.dressed.length > 0 ? (
          <View style={[styles.tile, styles.tileColumn, tile]}>
            <Plate>Dressed each other</Plate>
            <View style={styles.dressed}>
              {post.dressed.map((d, i) => (
                <T key={i} role="bodySm">
                  <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                    {d.by}
                  </T>
                  {' dressed '}
                  <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                    {d.for}
                  </T>
                  {d.worn ? (
                    <T role="bodySm" tone="faint">
                      {' · worn'}
                    </T>
                  ) : null}
                </T>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  )
}

/** One card for any post. */
export function PostCard({ post, actions }: { post: CirclePost; actions: CardActions }) {
  switch (post.type) {
    case 'look':
      return <LookCard post={post} actions={actions} />
    case 'verdict':
      return <VerdictCard post={post} actions={actions} />
    case 'pick':
      return <PickCard post={post} actions={actions} />
    default:
      return <WeekCard post={post} actions={actions} />
  }
}

/**
 * A card while its post loads, shaped like the real one (the web's
 * `card animate-pulse p-4`): a handle row's worth of block, then a board.
 */
export function CardSkeleton() {
  const inner = useCardWidth()
  const v = useSharedValue(0.35)
  useEffect(() => {
    v.set(withRepeat(withTiming(0.7, { duration: 900, reduceMotion: ReduceMotion.System }), -1, true))
  }, [v])
  const pulse = useAnimatedStyle(() => ({ opacity: v.get() }))
  return (
    <Card style={styles.skeleton}>
      <SkeletonBlock width={160} height={36} />
      <Animated.View style={pulse}>
        <Arch width={inner} aspect={4 / 3} bezel={false} variant="plain" />
      </Animated.View>
    </Card>
  )
}

/** The web's `gap-3` between a verdict's options. */
const OPTION_GAP = 12

const styles = StyleSheet.create({
  // `flex items-center gap-3 px-4 pt-4`
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: CARD_PAD, paddingTop: CARD_PAD },
  headText: { flex: 1 },
  // `mx-4 mt-3`, the strip `mt-3 gap-2`, the names `mt-2.5 gap-x-4 gap-y-1 px-0.5`
  hero: { paddingHorizontal: CARD_PAD, paddingTop: 12, gap: 12 },
  pulse: { alignItems: 'center', justifyContent: 'center' },
  pulseDisc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: 8 },
  names: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, paddingHorizontal: 2, marginTop: -2 },
  // `px-4 pt-3`
  line: { paddingHorizontal: CARD_PAD, paddingTop: 12 },
  note: { fontSize: 16, lineHeight: 24 },
  question: { paddingHorizontal: CARD_PAD, paddingTop: 12 },
  options: { flexDirection: 'row', gap: OPTION_GAP, paddingHorizontal: CARD_PAD, paddingTop: 12, alignItems: 'flex-start' },
  // `mt-2 h-1`, then `mt-1.5 px-0.5`
  bar: { height: 4, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%' },
  optMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 2, marginTop: 6 },
  share: { fontSize: 14, lineHeight: 20 },
  optLabel: { marginTop: 8 },
  // `mt-3 border-t px-3 py-2.5 gap-y-1.5`; the verbs `gap-2`; the chips `gap-x-0.5`
  foot: { marginTop: 12, paddingHorizontal: CARD_PAD, paddingVertical: 10, borderTopWidth: hairline, gap: 6 },
  verbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginHorizontal: -8 },
  // `mt-3 flex items-start gap-3 px-4`; the thumbs `gap-3`, left-aligned
  pickBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: CARD_PAD, paddingTop: 12 },
  thumbs: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // `mt-3 flex gap-2 px-4`
  thanks: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: CARD_PAD, paddingTop: 12 },
  replyBox: { flex: 1, height: height.secondary, borderWidth: hairline, paddingHorizontal: 12, justifyContent: 'center' },
  replyInput: { fontSize: 16, paddingVertical: 0, height: '100%' },
  seven: { width: 36, height: 36, borderWidth: hairline, alignItems: 'center', justifyContent: 'center' },
  // `mt-3 grid gap-3 px-4 pb-4`; each tile `gap-3 p-3`
  week: { paddingHorizontal: CARD_PAD, paddingTop: 12, paddingBottom: CARD_PAD, gap: 12 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: hairline },
  tileColumn: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  tileText: { flex: 1, gap: 4 },
  dressed: { gap: 2 },
  skeleton: { padding: CARD_PAD, gap: 12 },
})
