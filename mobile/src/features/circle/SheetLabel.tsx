// A brass kicker above a group in a Circle sheet: "Ask with", "For", "Their
// public closet". The sheet frame itself is shared furniture
// (`@/src/components/Sheet`, used `dense`); this is the one Circle-only part.
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { T } from '@/src/components/Text'
import { space } from '@/src/design/tokens'

/**
 * The web's `text-[10px] tracking-[0.28em] text-brass`: 32 from the block
 * above (block to block), its group 8 beneath (label to line), in a sheet
 * whose rows run 16 apart.
 */
export function SheetLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.label}>
      <T role="micro" tone="brass" style={styles.labelText}>
        {children}
      </T>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.lg, marginBottom: -space.sm },
  labelText: { letterSpacing: 2.8 },
})
