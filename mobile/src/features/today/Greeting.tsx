// The room's header: the date as the eyebrow, the greeting as the Bodoni
// title with the name in brass italic, and beneath it the two facts the
// wardrobe has earned (wears logged, the streak). A stat, not a badge.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { RitualStats } from '@zauq/shared/brief'
import { Stat } from '@/src/components/Bits'
import { RoomHeader } from '@/src/components/Room'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { dateLine, greeting } from './copy'

export function Greeting({ name, stats }: { name: string; stats?: RitualStats | null }) {
  const show = !!stats && (stats.wearsLogged > 0 || stats.streak > 0)
  return (
    <View>
      <Animated.View entering={rise(0)}>
        <RoomHeader eyebrow={dateLine()} title={name ? `${greeting()},` : `${greeting()}.`} emphasis={name || undefined} />
      </Animated.View>
      {show ? (
        <Animated.View entering={rise(1)} style={styles.stats}>
          {stats.wearsLogged > 0 ? <Stat value={stats.wearsLogged} label="Wears logged" /> : null}
          {stats.streak > 0 ? <Stat value={stats.streak} label="Day streak" tone="brass" /> : null}
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // The stats 32 apart, in the header's own 16 below the title.
  stats: { flexDirection: 'row', gap: space.xxl },
})
