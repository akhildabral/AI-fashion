// The frame every You sheet shares: a Bodoni title, a line, the content in a
// keyboard-aware scroll, and the primary action pinned at the foot.
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'

export function SheetShell({ title, line, children, foot }: { title: string; line?: string; children?: ReactNode; foot?: ReactNode }) {
  const { t } = useTheme()
  return (
    <Screen edges={['bottom']}>
      <KeyboardAwareScrollView bottomOffset={40} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <T role="h2" accessibilityRole="header">
            {title}
          </T>
          {line ? (
            <T role="bodySm" tone="muted">
              {line}
            </T>
          ) : null}
        </View>
        {children}
      </KeyboardAwareScrollView>
      {foot ? <View style={[styles.foot, { borderTopColor: alpha(t.ink, 0.1) }]}>{foot}</View> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  head: { gap: space.xs, paddingBottom: space.xs },
  foot: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: hairline, flexDirection: 'row', alignItems: 'center', gap: space.md },
})
