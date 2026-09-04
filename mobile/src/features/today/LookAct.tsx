// One look in the day's timeline. The act the clock is on gets its full
// board and the pieces beneath; an act that has passed folds to a row; one
// still to come is laid out smaller, waiting its turn.
//
// Every act is a section: the tracked brass eyebrow (LOGGED on its baseline)
// 8 over the Bodoni h2, the rationale 8 beneath, the board and the two-column
// brief 16 apart, the action row at 16 / 8; a hairline 32 above every act but
// the first. The act the clock is on takes the room's action row (`actions`)
// directly under its tiles, as the web's Today does.
import { useState, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import type { BriefItem, LookSlot } from '@zauq/shared/brief'
import { temp } from '@zauq/shared/units'
import { Badge } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { Press } from '@/src/components/Press'
import { GRID_GAP } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, height, space } from '@/src/design/tokens'
import { fonts, track, tracking } from '@/src/design/type'
import { itemLabel, itemSublabel, lookTitle, prettyTime } from './copy'
import { go, paths } from './nav'

export type ActState = 'past' | 'current' | 'future'

export interface Headline {
  lead: string
  emphasis: string
}

interface LookActProps {
  look: LookSlot
  state: ActState
  /** Position in the timeline, for the stagger. */
  index: number
  /** The day's main look: no "Remove", the room's own headline. */
  first: boolean
  /** A day being planned: no wearing yet. */
  planning?: boolean
  /** Long-press on a piece opens Reconsider. */
  onReconsider?: (item: BriefItem) => void
  onWear?: (look: LookSlot) => void
  wearing?: boolean
  onRemove?: (look: LookSlot) => void
  removing?: boolean
  headline?: Headline | null
  evening?: boolean
  /** The room's action row for the act the clock is on: rendered under its tiles. */
  actions?: ReactNode
}

function defaultHeadline(look: LookSlot, first: boolean, evening: boolean): Headline {
  if (look.worn) return first ? { lead: 'Looking good', emphasis: 'today.' } : { lead: 'You', emphasis: 'wore this.' }
  if (look.occasion) return { lead: 'For', emphasis: `${look.occasion.toLowerCase()}.` }
  if (first) return { lead: evening ? 'Tonight,' : 'Today,', emphasis: 'wear this.' }
  return { lead: 'Then,', emphasis: 'wear this.' }
}

/** The tracked brass eyebrow (.28em), the time at ink/40, LOGGED on the same baseline. */
function Eyebrow({ look }: { look: LookSlot }) {
  const { t } = useTheme()
  const time = prettyTime(look.time)
  const quiet = { color: alpha(t.ink, 0.4) }
  return (
    <View style={styles.eyebrow}>
      <T role="micro" tone="brass" style={styles.tracked}>
        {lookTitle(look)}
        {time ? <T role="micro" style={[styles.tracked, quiet]}>{`  ${time}`}</T> : null}
      </T>
      {look.worn ? (
        <T role="micro" style={quiet}>
          Logged
        </T>
      ) : null}
    </View>
  )
}

/** The pieces in a row of small arches, for a folded act and the laid-out record. */
function Thumbs({ items, width = 44, gap = space.sm }: { items: BriefItem[]; width?: number; gap?: number }) {
  return (
    <View style={[styles.thumbs, { gap }]}>
      {items.slice(0, 6).map((it) => (
        <GarmentTile key={it.id} imageUrl={it.imageUrl} width={width} accessibilityLabel={itemLabel(it)} />
      ))}
    </View>
  )
}

export function LookAct({ look, state, index, first, planning = false, onReconsider, onWear, wearing, onRemove, removing, headline, evening = false, actions }: LookActProps) {
  const { t } = useTheme()
  const W = useWindowDimensions().width - gutter * 2
  const [open, setOpen] = useState(false)
  const shown = look.wornLook?.items?.length ? look.wornLook.items : look.items
  const head = headline === undefined ? defaultHeadline(look, first, evening) : headline
  const busy = !!wearing || !!removing
  const seeOnYou = () => go(paths.mirror(shown.map((i) => i.id)))
  const title = lookTitle(look)
  const rule = { borderTopColor: alpha(t.ink, 0.1) }

  // ---- an act that has passed: one row, opening to its board on a tap ----
  if (state === 'past') {
    return (
      <Animated.View entering={rise(index)} style={[styles.act, rule]}>
        <Press
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}, ${look.worn ? 'logged' : 'not logged'}. ${open ? 'Hide' : 'Show'} the look`}
          haptic="tap"
          onPress={() => setOpen((v) => !v)}
          style={styles.pastRow}
        >
          <View style={styles.pastText}>
            <Eyebrow look={look} />
            <T role="bodySm" tone="muted">
              {look.worn ? 'Worn, and on record.' : planning ? 'Laid out.' : 'Laid out, not logged.'}
            </T>
          </View>
          <Thumbs items={shown} width={40} />
        </Press>
        {open ? (
          <Animated.View entering={fadeIn} style={styles.pastOpen}>
            <LookBoard items={shown} width={W} />
            <View style={styles.actions}>
              {!planning && !look.worn && onWear ? <Button label="Wearing it" variant="ghost" size="sm" loading={wearing} disabled={busy} onPress={() => onWear(look)} /> : null}
              <Button label="See it on you" variant="quiet" size="sm" onPress={seeOnYou} />
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    )
  }

  // ---- the act the clock is on, or one still to come ----
  const current = state === 'current'
  const boardWidth = current ? W : Math.round(W * 0.72)
  const tile = Math.floor((W - GRID_GAP) / 2)
  const showActions = (!planning && !current && !look.worn && !!onWear) || (!planning && look.worn) || !current || (!first && !look.worn && !!onRemove)

  return (
    <Animated.View entering={rise(index)} style={[styles.act, first ? styles.first : rule]}>
      <View style={styles.head}>
        <Eyebrow look={look} />
        {head ? (
          <T role="h2" accessibilityRole="header">
            {head.lead}{' '}
            <T role="h2" tone="brass" italic>
              {head.emphasis}
            </T>
          </T>
        ) : null}
        {look.weather || look.rationale ? (
          <T role="lede" tone="muted">
            {look.weather ? <T role="bodySm" tone="muted" style={styles.semi}>{`${temp(look.weather.temperatureC)} · ${look.weather.description}   `}</T> : null}
            {look.rationale}
          </T>
        ) : null}
      </View>

      <View style={styles.boards}>
        <View style={styles.boardWrap}>
          <LookBoard items={shown} width={boardWidth} sweep={current} />
        </View>
        {current ? (
          <View style={styles.grid}>
            {shown.map((item) => (
              <GarmentTile
                key={item.id}
                width={tile}
                imageUrl={item.imageUrl}
                label={itemLabel(item)}
                sublabel={itemSublabel(item)}
                onLongPress={onReconsider ? () => onReconsider(item) : undefined}
                onPress={onReconsider ? () => onReconsider(item) : undefined}
                accessibilityLabel={onReconsider ? `${itemLabel(item)}. Reconsider it` : itemLabel(item)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {look.wornLook ? (
        <View style={[styles.record, rule]}>
          <T role="bodySm" tone="muted">
            <T role="bodySm" style={styles.semi}>
              What you wore, from your photo.
            </T>{' '}
            {look.wornLook.instead ? 'The stylist had laid out these; they stay on record.' : 'Laid out that morning:'}
          </T>
          <Thumbs items={look.items} width={64} gap={space.md} />
        </View>
      ) : null}

      {current && actions ? actions : null}

      {showActions ? (
        <View style={styles.actions}>
          {!planning && look.worn ? <Badge>{first ? 'Logged for today' : `Logged for ${title.toLowerCase()}`}</Badge> : null}
          {!planning && !current && !look.worn && onWear ? <Button label="Wearing it" variant="ghost" size="sm" loading={wearing} disabled={busy} onPress={() => onWear(look)} /> : null}
          {!current ? <Button label="See it on you" variant="quiet" size="sm" onPress={seeOnYou} /> : null}
          {!first && !look.worn && onRemove ? (
            <Button label="Remove" variant="quiet" size="sm" loading={removing} disabled={busy} onPress={() => onRemove(look)} style={styles.right} />
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // A hairline, then 16 to the act; the parent keeps acts 32 apart. Inside, element to element.
  act: { borderTopWidth: hairline, paddingTop: space.lg, gap: space.lg },
  first: { borderTopWidth: 0, paddingTop: 0 },
  // Eyebrow, headline, rationale: the label-to-line 8.
  head: { gap: space.sm },
  eyebrow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, minHeight: 14 },
  tracked: { letterSpacing: track(10, tracking.eyebrow) },
  semi: { fontFamily: fonts.sansSemi },
  boards: { gap: space.lg },
  boardWrap: { alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap' },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: height.action },
  pastText: { flex: 1, gap: space.xs },
  pastOpen: { gap: space.lg, paddingTop: space.lg },
  record: { borderTopWidth: hairline, paddingTop: space.lg, gap: space.md },
  // The action row: 16 across, 8 down when it wraps.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.lg, rowGap: space.sm },
  right: { marginLeft: 'auto' },
})
