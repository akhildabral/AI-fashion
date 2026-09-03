// The room's header: the date, the greeting with the name in brass, and the
// two facts the wardrobe has earned (wears logged, the streak). A stat, not
// a badge. TodayPage.tsx: the date is 11px tracked 0.24em at ink/40, the
// greeting Bodoni italic 20px at ink/80, the stats 32 apart.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { RitualStats } from '@zauq/shared/brief'
import { Stat } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, space } from '@/src/design/tokens'
import { dateLine, greeting } from './copy'

export function Greeting({ name, stats }: { name: string; stats?: RitualStats | null }) {
  const { t } = useTheme()
  const show = !!stats && (stats.wearsLogged > 0 || stats.streak > 0)
  return (
    <View style={styles.wrap}>
      <Animated.View entering={rise(0)} style={styles.text}>
        <T role="label" style={{ letterSpacing: 2.64, color: alpha(t.ink, 0.4) }}>
          {dateLine()}
        </T>
        <T role="h3" italic accessibilityRole="header" style={{ color: alpha(t.ink, 0.8) }}>
          {greeting()},{' '}
          <T role="h3" italic tone="brass">
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
  // The web's `items-end justify-between gap-x-10 gap-y-4`.
  wrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: space.xxl, rowGap: space.lg },
  text: { gap: space.sm, flexShrink: 1 },
  stats: { flexDirection: 'row', gap: space.xxl },
})
