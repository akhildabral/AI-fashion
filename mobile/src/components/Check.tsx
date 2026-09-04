// A consent checkbox: a 3px-cornered box with a brass tick drawn at 1.5px,
// the line beside it. The one place a box is ticked; a value is a Chip.
import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius, space } from '@/src/design/tokens'
import { Press } from './Press'
import { T } from './Text'

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  const { t } = useTheme()
  return (
    <Press
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      haptic="tap"
      onPress={() => onChange(!checked)}
      style={[styles.row, disabled && styles.disabled]}
    >
      <View style={[styles.box, { borderRadius: radius, borderColor: checked ? t.brass : alpha(t.ink, 0.35), backgroundColor: checked ? t.brass : 'transparent' }]}>
        {checked ? (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path d="M2 6.5l2.6 2.5L10 3" stroke={t.onBrass} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <T role="bodySm" tone="muted" style={styles.label}>
        {label}
      </T>
    </Press>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: height.action, paddingVertical: space.xs },
  disabled: { opacity: 0.5 },
  box: { width: 22, height: 22, borderWidth: hairline, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  label: { flex: 1 },
})
