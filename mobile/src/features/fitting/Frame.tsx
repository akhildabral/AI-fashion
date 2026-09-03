import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated from 'react-native-reanimated'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { useFitting } from './FittingProvider'
import { type StepKey } from './steps'
import { Thread } from './Thread'

interface FrameProps {
  step: StepKey
  /** The small brass line above the question ("First", "Taste · 2 of 8"). */
  who: string
  /** The one question, Bodoni. */
  ask: ReactNode
  lead?: ReactNode
  children?: ReactNode
  /** The screen's actions, pinned under the content: one brass primary at most. */
  actions?: ReactNode
  /** Wrap the content in a keyboard-aware scroll (forms); off for the deck. */
  scroll?: boolean
  /** Something for the top-right corner of the threshold. */
  corner?: ReactNode
}

/**
 * The shape every step shares: a quiet Back, the thread, the stylist's
 * question, the content, the actions. Focusing a step records it in the
 * draft so a killed app resumes here.
 *
 * FittingPage.tsx: Who is 11px tracked 0.32em in brass, Ask (text-4xl: the
 * h1 role) 12 beneath, Lead 16 beneath, the content 24 beneath, the actions
 * 12 apart.
 */
export function Frame({ step, who, ask, lead, children, actions, scroll = true, corner }: FrameProps) {
  const router = useRouter()
  const { hydrated, patch } = useFitting()

  useFocusEffect(
    useCallback(() => {
      if (hydrated && step !== 'index') patch({ step })
    }, [hydrated, step, patch]),
  )

  const body = (
    <>
      <View style={styles.head}>
        <Animated.View entering={rise(0)}>
          <T role="label" tone="brass" style={styles.who}>
            {who}
          </T>
        </Animated.View>
        <View style={styles.ask}>
          <Animated.View entering={rise(1)}>
            <T role="h1" accessibilityRole="header">
              {ask}
            </T>
          </Animated.View>
          {lead ? (
            <Animated.View entering={rise(2)}>
              <T role="lede" tone="muted">
                {lead}
              </T>
            </Animated.View>
          ) : null}
        </View>
      </View>
      {children ? (
        <Animated.View entering={rise(3)} style={styles.content}>
          {children}
        </Animated.View>
      ) : null}
    </>
  )

  return (
    <Screen edges={['top', 'bottom']} padded>
      <View style={styles.top}>
        {step === 'index' ? <View /> : <Button label="Back" variant="quiet" size="sm" onPress={() => router.back()} />}
        {corner ?? null}
      </View>
      {step !== 'push' ? <Thread step={step} /> : null}
      {scroll ? (
        <KeyboardAwareScrollView bottomOffset={48} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {body}
        </KeyboardAwareScrollView>
      ) : (
        <View style={styles.scroll}>{body}</View>
      )}
      {actions ? (
        <Animated.View entering={rise(4)} style={styles.actions}>
          {actions}
        </Animated.View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // The quiet Back carries 6 of its own padding: pull it onto the gutter.
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginLeft: -6 },
  scroll: { flexGrow: 1, paddingTop: space.lg, paddingBottom: space.lg, gap: space.xl },
  head: { gap: space.md },
  who: { letterSpacing: 3.52 },
  ask: { gap: space.lg },
  content: { gap: space.lg },
  actions: { gap: space.md, paddingTop: space.lg, paddingBottom: space.sm, alignItems: 'stretch' },
})
