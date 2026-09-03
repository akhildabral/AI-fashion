// The rail: the pieces on you, each a switch. A horizontal row of arches
// under the glass, three to the content width and 12 apart as the web's
// `grid-cols-3 gap-3`; tap takes a piece off or puts it back, long-press
// swaps it for something of the same kind, the last tile adds a piece.
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { WardrobeItem } from '@zauq/shared/types'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'
import { pieceLabel } from './data'
import type { RailEntry } from './store'

type Piece = Pick<WardrobeItem, 'id' | 'imageUrl' | 'category' | 'subtype'>

const GAP = 12

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
  const tile = Math.floor((width - GAP * 2) / 3)
  // The web's `grid-cols-4 gap-2` of suggestions inside a `card p-5`.
  const suggestion = Math.floor((width - 40 - 8 * 3) / 4)
  const suggestions = empty ? closet.slice(0, 12) : []

  return (
    <View>
      <View style={styles.head}>
        <T role="micro" tone="faint">
          On you
        </T>
        {!empty ? <Button label="Clear the rail" variant="quiet" size="sm" onPress={onClear} /> : null}
      </View>

      {empty ? (
        <View style={[styles.card, { borderRadius: radius, backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1) }]}>
          <T role="lede" tone="muted">
            Nothing on the rail yet.
          </T>
          <T role="bodySm" tone="muted" style={styles.cardLine}>
            {closetLoaded && closet.length === 0 ? 'Add pieces to your closet first, and they appear here.' : 'Bring a look from Today or the Closet, or pick pieces from your closet here.'}
          </T>
          <View style={styles.cardActions}>
            <Button label="Today’s look" variant="ghost" size="sm" onPress={() => router.navigate('/today')} />
            <Button label="Outfits" variant="quiet" size="sm" onPress={() => router.navigate('/closet/outfits')} />
          </View>
          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${pieceLabel(p)}. Put it on the rail.`}
                  pressRetentionOffset={12}
                  onPress={() => {
                    haptics.tap()
                    onPick(p.id)
                  }}
                  style={styles.suggestion}
                >
                  <GarmentTile width={suggestion} imageUrl={p.imageUrl} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
          {pieces.map(({ id, on, piece }) => {
            const label = pieceLabel(piece)
            return (
              <View key={id} style={{ opacity: on ? 1 : 0.35 }}>
                <GarmentTile
                  width={tile}
                  imageUrl={piece.imageUrl}
                  label={label}
                  sublabel={on ? 'take it off' : 'put it back'}
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

          <Pressable accessibilityRole="button" accessibilityLabel="Add a piece" onPress={onAdd} pressRetentionOffset={12} style={{ width: tile }}>
            <View style={styles.plusArch}>
              <Arch width={tile}>
                <View style={[StyleSheet.absoluteFill, styles.plus]}>
                  <T role="h1" style={{ color: alpha(t.onBrass, 0.45) }}>
                    +
                  </T>
                </View>
              </Arch>
            </View>
            <T role="caption" numberOfLines={1} style={[styles.plusLabel, { color: alpha(t.ink, 0.4) }]}>
              Add a piece
            </T>
          </Pressable>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // The web's `flex h-8 items-center justify-between gap-3`.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 },
  // `mt-3 card p-5`.
  card: { marginTop: 12, padding: 20, borderWidth: hairline },
  cardLine: { marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 16, rowGap: 8, marginTop: 16 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  suggestion: { opacity: 0.8 },
  strip: { flexDirection: 'row', gap: GAP, paddingTop: 12, paddingBottom: 2 },
  plusArch: { opacity: 0.4 },
  plus: { alignItems: 'center', justifyContent: 'center' },
  plusLabel: { marginTop: 8 },
})
