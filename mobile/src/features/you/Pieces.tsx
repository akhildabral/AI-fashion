// Garments in the You room: a row of small arches for a look's pieces, and a
// wrapping grid of tiles to pick from (a sheet's content scrolls as one, so
// this is a plain grid rather than a virtualized list).
import { Image } from 'expo-image'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Arch } from '@/src/components/Arch'
import { GarmentTile } from '@/src/components/GarmentTile'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, space } from '@/src/design/tokens'
import { resolveImageUrl } from '@/src/lib/api'

export interface PieceLike {
  id: string
  imageUrl: string
  category: string
  subtype: string | null
}

export const pieceName = (i: { subtype: string | null; category: string }) => i.subtype?.trim() || i.category

/** Small arches in a row: a look's pieces at a glance. */
export function MiniPieces({ items, size = 48, dim, empty = 'Pieces no longer in your closet.' }: { items: PieceLike[]; size?: number; dim?: boolean; empty?: string }) {
  if (items.length === 0)
    return (
      <T role="caption" tone="faint">
        {empty}
      </T>
    )
  return (
    <View style={[styles.mini, dim && { opacity: 0.7 }]}>
      {items.map((it) => (
        <Arch key={it.id} width={size} aspect={4 / 5}>
          <Image source={{ uri: resolveImageUrl(it.imageUrl) }} contentFit="contain" cachePolicy="disk" transition={200} accessible accessibilityLabel={pieceName(it)} style={styles.miniImage} />
        </Arch>
      ))}
    </View>
  )
}

/** Tiles to pick from, in `columns`; a brass count badge marks the order picked. */
export function PieceGrid({
  items,
  selected,
  onToggle,
  columns = 3,
  gap = 12,
  ordered = false,
  max,
  width,
  sublabel,
}: {
  items: PieceLike[]
  selected: string[]
  onToggle: (id: string) => void
  columns?: number
  /** Between tiles, both ways: the web's `gap-3` (12) or `gap-2` (8). */
  gap?: number
  /** Show the pick order as a badge. */
  ordered?: boolean
  max?: number
  /** The grid's width; defaults to the screen minus the gutters. */
  width?: number
  sublabel?: (item: PieceLike) => string | null | undefined
}) {
  const { t } = useTheme()
  const { width: screen } = useWindowDimensions()
  const w = width ?? screen - gutter * 2
  const tile = Math.floor((w - gap * (columns - 1)) / columns)
  return (
    <View style={[styles.grid, { gap }]}>
      {items.map((it) => {
        const idx = selected.indexOf(it.id)
        const on = idx >= 0
        const blocked = !on && max !== undefined && selected.length >= max
        return (
          <View key={it.id} style={{ width: tile, opacity: blocked ? 0.45 : 1 }}>
            <GarmentTile
              imageUrl={it.imageUrl}
              width={tile}
              aspect={4 / 5}
              label={pieceName(it)}
              sublabel={sublabel?.(it) ?? null}
              selected={on}
              badge={ordered && on ? String(idx + 1) : null}
              accessibilityLabel={`${on ? 'Remove' : 'Choose'} ${pieceName(it)}`}
              onPress={() => {
                if (blocked) return
                haptics.tap()
                onToggle(it.id)
              }}
            />
          </View>
        )
      })}
      {items.length === 0 ? (
        <View style={[styles.empty, { borderColor: alpha(t.ink, 0.2), borderRadius: radius, width: w }]}>
          <T role="bodySm" tone="muted" align="center">
            Nothing here yet.
          </T>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  mini: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  miniImage: { position: 'absolute', left: '10%', right: '10%', top: '10%', bottom: '8%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { borderWidth: 1, borderStyle: 'dashed', padding: space.xl },
})
