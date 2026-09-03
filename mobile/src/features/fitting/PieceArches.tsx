import { StyleSheet, View } from 'react-native'
import type { WardrobeItem } from '@zauq/shared/types'
import { Arch } from '@/src/components/Arch'
import { GarmentTile } from '@/src/components/GarmentTile'
import { T } from '@/src/components/Text'
import { space } from '@/src/design/tokens'
import { PIECES_WANTED } from './steps'

/** FittingPage.tsx: the closet's arches sit `gap-4` apart; an empty one at half strength. */
const GAP = space.lg
/** The four slots are drawn before anything is in them: the endowed start. */
const SLOTS = ['Top', 'Bottom', 'Shoes', 'One more']

/** The four arches of the quick win, filling from the first as photos land. */
export function PieceArches({ items, width }: { items: WardrobeItem[]; width: number }) {
  const tileW = Math.floor((width - GAP) / 2)
  return (
    <View style={styles.grid}>
      {SLOTS.slice(0, PIECES_WANTED).map((slot, i) => {
        const it = items[i]
        if (!it) return <EmptyArch key={slot} width={tileW} label={slot} />
        const failed = it.status === 'failed'
        const ready = it.status === 'ready'
        return (
          <GarmentTile
            key={it.id}
            width={tileW}
            imageUrl={it.imageUrl}
            processing={it.status === 'processing'}
            sweep={ready}
            label={ready ? (it.subtype ?? it.category) : failed ? 'Did not develop' : null}
            sublabel={failed ? 'Try another photo' : null}
            accessibilityLabel={ready ? `${it.subtype ?? it.category}, catalogued` : failed ? 'This piece did not develop' : 'A piece, developing'}
          />
        )
      })}
    </View>
  )
}

function EmptyArch({ width, label }: { width: number; label: string }) {
  return (
    <View style={[styles.empty, { width }]} accessible accessibilityLabel={`${label}: empty`}>
      <Arch width={width}>
        <View style={styles.slot}>
          <T role="micro" tone="faint" style={styles.tracked}>
            {label}
          </T>
        </View>
      </Arch>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { opacity: 0.5 },
  slot: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  tracked: { letterSpacing: 2 },
})
