// Compose another look for the day: a quick time-of-day preset composed on
// the spot, or a custom ritual with its own name and time through the sheet.
// LookAct.tsx (AddLook) on the web: a section rule, the tracked brass
// eyebrow, one line 4 beneath, the chips 12 beneath.
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { LookSlotKind } from '@zauq/shared/brief'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { longDay } from './copy'
import { go, paths } from './nav'
import { useAddLook } from './useToday'

const PRESETS: { slot: LookSlotKind; label: string }[] = [
  { slot: 'afternoon', label: 'Afternoon' },
  { slot: 'evening', label: 'Evening' },
]

export function AddLook({ date, isToday, index = 0 }: { date: string; isToday: boolean; index?: number }) {
  const { t } = useTheme()
  const flash = useFlash()
  const add = useAddLook(date)

  function preset(slot: LookSlotKind) {
    if (add.isPending) return
    add.mutate(
      { slot },
      {
        onSuccess: () => {
          haptics.success()
          flash('Another look, laid out.')
        },
        onError: (err) => flash(err instanceof Error ? err.message : 'Could not add a look.'),
      },
    )
  }

  return (
    <Animated.View entering={rise(index)} style={[styles.section, { borderTopColor: alpha(t.ink, 0.1) }]}>
      <View style={styles.text}>
        <T role="micro" tone="brass" style={styles.tracked}>
          Add a look
        </T>
        <T role="bodySm" tone="muted">
          Another outfit for {isToday ? 'later today' : longDay(date)}: an event, a change, or a ritual of its own.
        </T>
      </View>
      <View style={styles.chips}>
        {PRESETS.map((p) => (
          <Chip key={p.slot} label={add.isPending && add.variables?.slot === p.slot ? 'Composing…' : p.label} on={false} onPress={() => preset(p.slot)} />
        ))}
        <Chip label="Custom…" on={false} onPress={() => go(paths.addLook(date))} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  section: { borderTopWidth: hairline, paddingTop: space.xl, gap: space.md },
  text: { gap: space.xs },
  tracked: { letterSpacing: 2.8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
})
