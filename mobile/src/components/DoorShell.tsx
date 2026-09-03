import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated from 'react-native-reanimated'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { ArchMark, Wordmark } from './Brand'
import { Screen } from './Screen'
import { T } from './Text'

interface DoorShellProps {
  /** The small line above the title: "You're invited", "New password". */
  eyebrow: string
  /** The title; the emphasised tail is set in brass italic. */
  title: string
  emphasis?: string
  lead?: string
  children?: ReactNode
  foot?: ReactNode
}

/**
 * The frame every door screen shares: the mark, an eyebrow, a Bodoni title
 * with its brass tail, a lead, the form, and a quiet footer.
 */
export function DoorShell({ eyebrow, title, emphasis, lead, children, foot }: DoorShellProps) {
  return (
    <Screen edges={['top', 'bottom']} padded>
      <KeyboardAwareScrollView bottomOffset={40} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Animated.View entering={rise(0)} style={styles.brand}>
          <ArchMark size={40} />
          <Wordmark size={18} />
        </Animated.View>
        <Animated.View entering={rise(1)} style={styles.head}>
          <T role="label" tone="brass">
            {eyebrow}
          </T>
          <T role="h1" accessibilityRole="header">
            {title}
            {emphasis ? (
              <T role="h1" tone="brass" italic>
                {` ${emphasis}`}
              </T>
            ) : null}
          </T>
          {lead ? (
            <T role="body" tone="muted">
              {lead}
            </T>
          ) : null}
        </Animated.View>
        {children ? (
          <Animated.View entering={rise(2)} style={styles.form}>
            {children}
          </Animated.View>
        ) : null}
        {foot ? (
          <Animated.View entering={rise(3)} style={styles.foot}>
            {foot}
          </Animated.View>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, paddingVertical: space.xxl, gap: space.xxl },
  brand: { alignItems: 'center', gap: space.md, paddingTop: space.sm },
  head: { gap: space.sm },
  form: { gap: space.lg },
  foot: { marginTop: 'auto', alignItems: 'center', gap: space.xs },
})

export function DoorFootLink({ children }: { children: ReactNode }) {
  return <View style={{ alignItems: 'center' }}>{children}</View>
}
