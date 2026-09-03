// A consent checkbox: a 3px-cornered box with a brass tick, the line beside it.
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      pressRetentionOffset={12}
      onPress={() => {
        haptics.tap()
        onChange(!checked)
      }}
      style={[styles.row, disabled && { opacity: 0.5 }]}
    >
      <View style={[styles.box, { borderRadius: radius, borderColor: checked ? t.brass : alpha(t.ink, 0.35), backgroundColor: checked ? t.brass : 'transparent' }]}>
        {checked ? (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path d="M2 6.5l2.6 2.5L10 3" stroke={t.onBrass} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <T role="bodySm" tone="muted" style={styles.label}>
        {label}
      </T>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingVertical: 4 },
  box: { width: 22, height: 22, borderWidth: hairline, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  label: { flex: 1 },
})
