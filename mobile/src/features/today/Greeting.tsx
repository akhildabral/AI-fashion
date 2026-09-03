// The room's header: the date, the greeting with the name in brass, and the
// two facts the wardrobe has earned (wears logged, the streak). A stat, not
// a badge.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { RitualStats } from '@zauq/shared/brief'
import { Stat } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { dateLine, greeting } from './copy'

export function Greeting({ name, stats }: { name: string; stats?: RitualStats | null }) {
  const show = !!stats && (stats.wearsLogged > 0 || stats.streak > 0)
  return (
    <View style={styles.wrap}>
      <Animated.View entering={rise(0)} style={styles.text}>
        <T role="label" tone="faint">
          {dateLine()}
        </T>
        <T role="h2" italic tone="muted" accessibilityRole="header">
          {greeting()},{' '}
          <T role="h2" italic tone="brass">
            {name}
          </T>
        </T>
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
  wrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.lg, paddingTop: space.sm, flexWrap: 'wrap' },
  text: { gap: 6, flexShrink: 1 },
  stats: { flexDirection: 'row', gap: space.xl },
})
