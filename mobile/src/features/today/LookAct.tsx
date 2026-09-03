// One look in the day's timeline. The act the clock is on gets its full
// board and the pieces beneath; an act that has passed folds to a row; one
// still to come is laid out smaller, waiting its turn.
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
import { alpha, gutter, hairline, space } from '@/src/design/tokens'
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

function Eyebrow({ look }: { look: LookSlot }) {
  const time = prettyTime(look.time)
  return (
    <View style={styles.eyebrow}>
      <T role="label" tone="brass">
        {lookTitle(look)}
        {time ? (
          <T role="label" tone="faint">
            {`  ${time}`}
          </T>
        ) : null}
      </T>
      {look.worn ? (
        <T role="micro" tone="faint">
          Logged
        </T>
      ) : null}
    </View>
  )
}

/** The pieces in a row of small arches, for a folded act and the laid-out record. */
function Thumbs({ items, width = 44 }: { items: BriefItem[]; width?: number }) {
  return (
    <View style={styles.thumbs}>
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
  const seeOnMe = () => go(paths.mirror(shown.map((i) => i.id)))

  // ---- an act that has passed: one row, opening to its board on a tap ----
  if (state === 'past') {
    return (
      <Animated.View entering={rise(index)} style={[styles.act, { borderTopColor: alpha(t.ink, 0.1) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${lookTitle(look)}, ${look.worn ? 'logged' : 'not logged'}. ${open ? 'Hide' : 'Show'} the look`}
          pressRetentionOffset={12}
          onPress={() => {
            haptics.tap()
            setOpen((v) => !v)
          }}
          style={styles.pastRow}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <Eyebrow look={look} />
            <T role="bodySm" tone="muted">
              {look.worn ? 'Worn, and on record.' : planning ? 'Laid out.' : 'Laid out, not logged.'}
            </T>
          </View>
          <Thumbs items={shown} width={40} />
        </Pressable>
        {open ? (
          <Animated.View entering={fadeIn} style={{ gap: space.md, paddingTop: space.md }}>
            <LookBoard items={shown} width={W} />
            <View style={styles.actions}>
              {!planning && !look.worn && onWear ? <Button label="Wearing it" variant="ghost" size="sm" loading={wearing} disabled={busy} onPress={() => onWear(look)} /> : null}
              <Button label="See it on me" variant="quiet" size="sm" onPress={seeOnMe} />
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

  return (
    <Animated.View entering={rise(index)} style={[styles.act, !first && { borderTopColor: alpha(t.ink, 0.1) }, first && styles.first]}>
      {(!first || !current) && <Eyebrow look={look} />}
      {head ? (
        <T role={current ? 'display' : 'h2'} accessibilityRole="header" style={current ? styles.display : undefined}>
          {head.lead}{' '}
          <T role={current ? 'display' : 'h2'} tone="brass" italic>
            {head.emphasis}
          </T>
        </T>
      ) : null}
      {look.weather || look.rationale ? (
        <T role="bodySm" tone="muted" style={styles.rationale}>
          {look.weather ? (
            <T role="bodySm" tone="brass" style={styles.weather}>
              {`${temp(look.weather.temperatureC)} · ${look.weather.description}   `}
            </T>
          ) : null}
          <T role="lede" tone="muted" style={styles.rationaleText}>
            {look.rationale}
          </T>
        </T>
      ) : null}

      <View style={{ alignSelf: 'flex-start', marginTop: space.md }}>
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

      {look.wornLook ? (
        <View style={[styles.record, { borderTopColor: alpha(t.ink, 0.1) }]}>
          <T role="bodySm" tone="muted">
            <T role="bodySm">What you wore, from your photo.</T> {look.wornLook.instead ? 'The stylist had laid out these; they stay on record.' : 'Laid out that morning:'}
          </T>
          <Thumbs items={look.items} width={56} />
        </View>
      ) : null}

      <View style={styles.actions}>
        {!planning && !current && !look.worn && onWear ? <Button label="Wearing it" variant="ghost" size="sm" loading={wearing} disabled={busy} onPress={() => onWear(look)} /> : null}
        {!current ? <Button label="See it on me" variant="quiet" size="sm" onPress={seeOnMe} /> : null}
        {!first && !look.worn && onRemove ? (
          <Button label="Remove" variant="quiet" size="sm" loading={removing} disabled={busy} onPress={() => onRemove(look)} style={{ marginLeft: 'auto' }} />
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  act: { borderTopWidth: hairline, paddingTop: space.xl, gap: space.sm },
  first: { borderTopWidth: 0, paddingTop: space.xs },
  eyebrow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  display: { marginTop: 2 },
  rationale: { marginTop: 2 },
  weather: { fontFamily: 'Archivo_600SemiBold' },
  rationaleText: { fontSize: 16, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: space.md },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  record: { borderTopWidth: hairline, paddingTop: space.md, marginTop: space.sm, gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xs },
})
