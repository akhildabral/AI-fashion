// One look in the day's timeline. The act the clock is on gets its full
// board and the pieces beneath; an act that has passed folds to a row; one
// still to come is laid out smaller, waiting its turn.
//
// Values from TodayPage.tsx (the main brief) and LookAct.tsx (the later
// acts): a tracked brass eyebrow with LOGGED on its baseline, the headline 4
// beneath, the rationale 16 (main) or 8 beneath, the board 32 (main) or 24
// beneath, the action row 24 beneath at 16 / 8, a section rule 24 above.
import { useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import type { BriefItem, LookSlot } from '@zauq/shared/brief'
import { temp } from '@zauq/shared/units'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, height, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
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
}

function defaultHeadline(look: LookSlot, first: boolean, evening: boolean): Headline {
  if (look.worn) return first ? { lead: 'Looking good', emphasis: 'today.' } : { lead: 'You', emphasis: 'wore this.' }
  if (look.occasion) return { lead: 'For', emphasis: `${look.occasion.toLowerCase()}.` }
  if (first) return { lead: evening ? 'Tonight,' : 'Today,', emphasis: 'wear this.' }
  return { lead: 'Then,', emphasis: 'wear this.' }
}

/** `text-[10px] tracking-[0.28em] text-brass`, the time at ink/40, LOGGED on the same baseline. */
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

/** The web's logged pill: a brass hairline box on the soft wash, in the action row. */
function LoggedPill({ label }: { label: string }) {
  const { t } = useTheme()
  return (
    <View style={[styles.pill, { borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft, borderRadius: radius }]} accessible accessibilityLabel={label}>
      <T role="caption" tone="brass" style={styles.semi}>
        {label}
      </T>
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

export function LookAct({ look, state, index, first, planning = false, onReconsider, onWear, wearing, onRemove, removing, headline, evening = false }: LookActProps) {
  const { t } = useTheme()
  const W = useWindowDimensions().width - gutter * 2
  const [open, setOpen] = useState(false)
  const shown = look.wornLook?.items?.length ? look.wornLook.items : look.items
  const head = headline === undefined ? defaultHeadline(look, first, evening) : headline
  const busy = !!wearing || !!removing
  const seeOnYou = () => go(paths.mirror(shown.map((i) => i.id)))
  const title = lookTitle(look)

  // ---- an act that has passed: one row, opening to its board on a tap ----
  if (state === 'past') {
    return (
      <Animated.View entering={rise(index)} style={[styles.act, { borderTopColor: alpha(t.ink, 0.1) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}, ${look.worn ? 'logged' : 'not logged'}. ${open ? 'Hide' : 'Show'} the look`}
          pressRetentionOffset={12}
          onPress={() => {
            haptics.tap()
            setOpen((v) => !v)
          }}
          style={styles.pastRow}
        >
          <View style={styles.pastText}>
            <Eyebrow look={look} />
            <T role="bodySm" tone="muted">
              {look.worn ? 'Worn, and on record.' : planning ? 'Laid out.' : 'Laid out, not logged.'}
            </T>
          </View>
          <Thumbs items={shown} width={40} />
        </Pressable>
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
  const tile = (W - 24) / 3
  const role = first ? 'display' : 'h2'
  const showActions = (!planning && !current && !look.worn && !!onWear) || (!planning && look.worn) || !current || (!first && !look.worn && !!onRemove)

  return (
    <Animated.View entering={rise(index)} style={[styles.act, first ? styles.first : { borderTopColor: alpha(t.ink, 0.1) }, { gap: first ? space.xxl : space.xl }]}>
      <View style={{ gap: first ? space.lg : space.sm }}>
        <View style={styles.head}>
          {(!first || !current) && <Eyebrow look={look} />}
          {head ? (
            <T role={role} accessibilityRole="header">
              {head.lead}{' '}
              <T role={role} tone="brass" italic>
                {head.emphasis}
              </T>
            </T>
          ) : null}
        </View>
        {look.weather || look.rationale ? (
          <T role="lede" tone="muted">
            {look.weather ? (
              <T role="bodySm" tone="brass" style={styles.semi}>
                {`${temp(look.weather.temperatureC)} · ${look.weather.description}   `}
              </T>
            ) : null}
            {look.rationale}
          </T>
        ) : null}
      </View>

      <View style={styles.boards}>
        <View style={{ alignSelf: 'flex-start' }}>
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
        <View style={[styles.record, { borderTopColor: alpha(t.ink, 0.1) }]}>
          <T role="bodySm" tone="muted">
            <T role="bodySm" style={styles.semi}>
              What you wore, from your photo.
            </T>{' '}
            {look.wornLook.instead ? 'The stylist had laid out these; they stay on record.' : 'Laid out that morning:'}
          </T>
          <Thumbs items={look.items} width={64} gap={space.md} />
        </View>
      ) : null}

      {showActions ? (
        <View style={styles.actions}>
          {!planning && look.worn ? <LoggedPill label={first ? 'Logged for today' : `Logged for ${title.toLowerCase()}`} /> : null}
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
  // `border-t border-ink/10 pt-6`; the parent keeps acts 32 apart.
  act: { borderTopWidth: hairline, paddingTop: space.xl, gap: space.xl },
  first: { borderTopWidth: 0, paddingTop: 0 },
  head: { gap: space.xs },
  eyebrow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  tracked: { letterSpacing: 2.8 },
  semi: { fontFamily: fonts.sansSemi },
  boards: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap' },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  pastText: { flex: 1, gap: space.xs },
  pastOpen: { gap: space.md, paddingTop: space.md },
  // `mt-5 border-t border-ink/10 pt-4`, thumbs `mt-3 gap-3`.
  record: { borderTopWidth: hairline, paddingTop: space.lg, gap: space.md },
  // `action-row`: gap-x-4 gap-y-2.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.lg, rowGap: space.sm },
  right: { marginLeft: 'auto' },
  pill: { height: height.secondary, justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: hairline },
})
