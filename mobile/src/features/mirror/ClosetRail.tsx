// The rail: the pieces on you, each a switch. A horizontal strip of arches
// under the glass; tap takes a piece off or puts it back, long-press swaps
// it for something of the same kind, the last tile adds a piece.
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { WardrobeItem } from '@zauq/shared/types'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha } from '@/src/design/tokens'
import { pieceLabel } from './data'
import type { RailEntry } from './store'

export const RAIL_TILE = 104

type Piece = Pick<WardrobeItem, 'id' | 'imageUrl' | 'category' | 'subtype'>

export interface ClosetRailProps {
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

export function ClosetRail({ rail, byId, closet, closetLoaded, onToggle, onSwap, onAdd, onPick, onClear }: ClosetRailProps) {
  const { t } = useTheme()
  const pieces = rail.map((r) => ({ ...r, piece: byId.get(r.id) })).filter((r): r is RailEntry & { piece: Piece } => !!r.piece)
  const empty = pieces.length === 0
  const suggestions = empty ? closet.slice(0, 12) : []

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <T role="label" tone="faint">
          On you
        </T>
        {!empty ? <Button label="Clear the rail" variant="quiet" size="sm" onPress={onClear} /> : null}
      </View>

      {empty ? (
        <View style={styles.emptyCopy}>
          <T role="lede" tone="muted">
            Nothing on the rail yet.
          </T>
          <T role="bodySm" tone="muted">
            {closetLoaded && closet.length === 0 ? 'Add pieces to your closet first, and they appear here.' : 'Bring a look from Today or the Closet, or pick pieces from your closet here.'}
          </T>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
        {pieces.map(({ id, on, piece }) => {
          const label = pieceLabel(piece)
          return (
            <View key={id} style={{ opacity: on ? 1 : 0.35 }}>
              <GarmentTile
                width={RAIL_TILE}
                imageUrl={piece.imageUrl}
                label={label}
                sublabel={on ? undefined : 'off'}
                accessibilityLabel={on ? `${label}, on you. Take it off.` : `${label}, off. Put it back.`}
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

        {suggestions.map((p) => (
          <View key={p.id} style={{ opacity: 0.8 }}>
            <GarmentTile
              width={RAIL_TILE}
              imageUrl={p.imageUrl}
              label={pieceLabel(p)}
              accessibilityLabel={`${pieceLabel(p)}. Put it on the rail.`}
              onPress={() => {
                haptics.tap()
                onPick(p.id)
              }}
            />
          </View>
        ))}

        <Pressable accessibilityRole="button" accessibilityLabel="Add a piece" onPress={onAdd} pressRetentionOffset={12} style={{ width: RAIL_TILE }}>
          <Arch width={RAIL_TILE}>
            <View style={[StyleSheet.absoluteFill, styles.plus]}>
              <T role="display" style={{ color: alpha(t.onBrass, 0.45) }}>
                +
              </T>
            </View>
          </Arch>
          <T role="caption" tone="faint" numberOfLines={1} style={styles.plusLabel}>
            Add a piece
          </T>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  emptyCopy: { gap: 4 },
  strip: { flexDirection: 'row', gap: 12, paddingVertical: 2 },
  plus: { alignItems: 'center', justifyContent: 'center' },
  plusLabel: { marginTop: 8 },
})
