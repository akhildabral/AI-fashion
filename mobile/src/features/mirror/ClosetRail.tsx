// The rail: the pieces on you, each a switch. A horizontal strip of 64-wide
// arches under the glass, 12 apart, dimmed to 35% when a piece is off; tap
// takes a piece off or puts it back, long-press swaps it for something of
// the same kind, the last tile adds a piece.
import { router } from 'expo-router'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { WardrobeItem } from '@zauq/shared/types'
import { Arch } from '@/src/components/Arch'
import { Card } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Press } from '@/src/components/Press'
import { GRID_GAP } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { space } from '@/src/design/tokens'
import { pieceLabel } from './data'
import type { RailEntry } from './store'

type Piece = Pick<WardrobeItem, 'id' | 'imageUrl' | 'category' | 'subtype'>

/** A piece on the rail: the kit's 64-wide arch. */
const TILE = 64

export interface ClosetRailProps {
  /** The content width (screen minus the gutters). */
  width: number
  rail: RailEntry[]
  byId: Map<string, Piece>
  /** The closet, for the strip of suggestions when the rail is empty. */
  closet: Piece[]
  closetLoaded: boolean
  onToggle: (id: string) => void
  onSwap: (piece: Piece) => void
  onAdd: () => void
  onPick: (id: string) => void
  onClear: () => void
}

export function ClosetRail({ width, rail, byId, closet, closetLoaded, onToggle, onSwap, onAdd, onPick, onClear }: ClosetRailProps) {
  const { t } = useTheme()
  const pieces = rail.map((r) => ({ ...r, piece: byId.get(r.id) })).filter((r): r is RailEntry & { piece: Piece } => !!r.piece)
  const empty = pieces.length === 0
  // Four suggestions across inside the card's 20 padding, 12 apart.
  const suggestion = Math.floor((width - space.ml * 2 - GRID_GAP * 3) / 4)
  const suggestions = empty ? closet.slice(0, 12) : []

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <T role="label" tone="faint">
          On you
        </T>
        {!empty ? <Button label="Clear the rail" variant="quiet" size="sm" onPress={onClear} /> : null}
      </View>

      {empty ? (
        <Card padding={space.ml} style={styles.card}>
          <View style={styles.cardText}>
            <T role="lede" tone="muted">
              Nothing on the rail yet.
            </T>
            <T role="bodySm" tone="muted">
              {closetLoaded && closet.length === 0 ? 'Add pieces to your closet first, and they appear here.' : 'Bring a look from Today or the Closet, or pick pieces from your closet here.'}
            </T>
          </View>
          <View style={styles.cardActions}>
            <Button label="Today’s look" variant="ghost" size="sm" onPress={() => router.navigate('/today')} />
            <Button label="Outfits" variant="quiet" size="sm" onPress={() => router.navigate('/closet/outfits')} />
          </View>
          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((p) => (
                <Press key={p.id} accessibilityRole="button" accessibilityLabel={`${pieceLabel(p)}. Put it on the rail.`} haptic="tap" visual={suggestion} onPress={() => onPick(p.id)} style={styles.suggestion}>
                  <GarmentTile width={suggestion} imageUrl={p.imageUrl} />
                </Press>
              ))}
            </View>
          ) : null}
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
          {pieces.map(({ id, on, piece }) => {
            const label = pieceLabel(piece)
            return (
              <View key={id} style={{ opacity: on ? 1 : 0.35 }}>
                <GarmentTile
                  width={TILE}
                  imageUrl={piece.imageUrl}
                  label={label}
                  accessibilityLabel={on ? `${label}, on you. Tap to take it off, hold to swap.` : `${label}, off. Tap to put it back, hold to swap.`}
                  onPress={() => {
                    haptics.tap()
                    onToggle(id)
                  }}
                  onLongPress={() => {
                    haptics.select()
                    onSwap(piece)
                  }}
                />
              </View>
            )
          })}

          <Press accessibilityRole="button" accessibilityLabel="Add a piece" haptic="tap" visual={TILE} onPress={onAdd} wrapStyle={{ width: TILE }} style={styles.add}>
            <Arch width={TILE}>
              <View style={[StyleSheet.absoluteFill, styles.plus]}>
                <T role="h2" style={{ color: t.inNicheMuted }}>
                  +
                </T>
              </View>
            </Arch>
            <T role="label" tone="faint" align="center" numberOfLines={2}>
              Add a piece
            </T>
          </Press>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // The label 8 over the rail.
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 36 },
  // The card's parts 16 apart, its lines 8.
  card: { gap: space.lg },
  cardText: { gap: space.sm },
  cardActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  suggestion: { opacity: 0.8 },
  strip: { flexDirection: 'row', gap: GRID_GAP, paddingBottom: 2 },
  add: { gap: space.sm, opacity: 0.6 },
  plus: { alignItems: 'center', justifyContent: 'center' },
})
