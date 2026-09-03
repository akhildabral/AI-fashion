// The frame of every Circle sheet: a Bodoni title, a lead, the content in a
// keyboard-aware scroll, and the primary action pinned beneath.
import { type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline } from '@/src/design/tokens'

export function SheetFrame({ title, lead, children, action, busy }: { title: string; lead?: string; children: ReactNode; action?: ReactNode; busy?: boolean }) {
  const { t } = useTheme()
  return (
    <Screen edges={['bottom']}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <T role="h2" accessibilityRole="header">
          {title}
        </T>
        {lead ? (
          <T role="bodySm" tone="muted">
            {lead}
          </T>
        ) : null}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={t.brass} />
          </View>
        ) : (
          children
        )}
      </KeyboardAwareScrollView>
      {action ? <View style={[styles.action, { borderTopColor: alpha(t.ink, 0.1) }]}>{action}</View> : null}
    </Screen>
  )
}

/**
 * A brass kicker above a group in a sheet: "Ask with", "For", "Their public
 * closet". The web's `mt-5 text-[10px] tracking-[0.28em] text-brass`, with
 * its group `mt-2` beneath.
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
  // The web's modal body: `p-5`, the title above; the column runs 12 apart.
  content: { paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 24, gap: 12 },
  busy: { paddingVertical: 40, alignItems: 'center' },
  // `action-row mt-5`: gap-x-4
  action: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 8, borderTopWidth: hairline, flexDirection: 'row', gap: 16, alignItems: 'center' },
  label: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8, marginBottom: -4 },
  labelText: { letterSpacing: 2.8 },
})
