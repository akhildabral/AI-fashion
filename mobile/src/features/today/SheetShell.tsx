// The frame every Today sheet shares: a Bodoni title, a lead, the content,
// and the primary action pinned beneath, above the home indicator. Keyboard
// aware so a field near the bottom is never covered.
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'

export function SheetShell({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Screen edges={[]}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, !footer && { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.head}>
          <T role="h2" accessibilityRole="header">
            {title}
          </T>
          {lead ? (
            <T role="bodySm" tone="muted">
              {lead}
            </T>
          ) : null}
        </View>
        {children}
      </KeyboardAwareScrollView>
      {footer ? (
        <View style={[styles.footer, { borderTopColor: alpha(t.ink, 0.1), paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xl, gap: space.xl },
  head: { gap: space.sm },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: gutter, paddingTop: 12, borderTopWidth: hairline },
})
