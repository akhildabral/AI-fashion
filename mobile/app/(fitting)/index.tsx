import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ArchMark } from '@/src/components/Brand'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { useFitting } from '@/src/features/fitting/FittingProvider'
import { Frame } from '@/src/features/fitting/Frame'
import { hrefOf, INTENTS, type Intent } from '@/src/features/fitting/steps'

/**
 * Step 1, the threshold: a name and the one thing that matters most. The
 * web's threshold and intent screens in one sitting: the intents are its
 * 20-padded card choices, an h3 over one line, brass-edged when chosen.
 */
export default function Threshold() {
  const router = useRouter()
  const { t } = useTheme()
  const { user, signOut } = useAuth()
  const { draft, hydrated, patch } = useFitting()
  const [name, setName] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const started = useRef(false)

  // Once the draft is read: prefill, and resume a fitting the app was killed in.
  useEffect(() => {
    if (!hydrated || started.current) return
    started.current = true
    setName(draft.firstName || user?.firstName || '')
    setIntent(draft.intent)
    if (draft.step !== 'index') router.push(hrefOf(draft.step))
  }, [hydrated, draft.firstName, draft.intent, draft.step, user?.firstName, router])

  const next = () => {
    patch({ firstName: name.trim(), intent, step: 'taste' })
    router.push(hrefOf('taste'))
  }

  return (
    <Frame
      step="index"
      who="Welcome in"
      ask={
        <>
          Let’s take <T role="h1" tone="brass" italic>your measure.</T>
        </>
      }
      lead="A few taps, and tomorrow morning is decided for you, from clothes you already own."
      corner={<Button label="Sign out" variant="quiet" size="sm" onPress={() => void signOut()} />}
      actions={<Button label="Begin the fitting" block disabled={!hydrated || !intent} onPress={next} testID="fitting-continue" />}
    >
      <View style={styles.mark}>
        <ArchMark size={44} variant="script" />
      </View>
      <Field
        label="First name"
        testID="fitting-name"
        value={name}
        onChangeText={(v) => {
          setName(v)
          patch({ firstName: v })
        }}
        placeholder="What the stylist should call you"
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="givenName"
        autoComplete="given-name"
        returnKeyType="done"
      />
      <View style={styles.group} accessibilityRole="radiogroup">
        <T role="label" tone="faint">
          What matters most
        </T>
        <T role="bodySm" tone="muted">
          Pick the one that rings truest. It decides what the stylist puts first.
        </T>
        <View style={styles.cards}>
          {INTENTS.map(([k, label, line]) => {
            const on = intent === k
            return (
              <Press
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                accessibilityLabel={`${label}. ${line}`}
                onPress={() => {
                  haptics.select()
                  setIntent(k)
                  patch({ intent: k })
                }}
              >
                <View style={[styles.card, { borderRadius: radius, borderColor: on ? t.brass : alpha(t.ink, 0.1), backgroundColor: on ? alpha(t.brassSoft, 0.4) : t.surface }]}>
                  <T role="h3">{label}</T>
                  <T role="bodySm" tone="muted">
                    {line}
                  </T>
                </View>
              </Press>
            )
          })}
        </View>
      </View>
    </Frame>
  )
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', paddingVertical: space.sm },
  group: { gap: space.sm },
  // `grid gap-3`; each `card p-5`, the line `mt-2`.
  cards: { gap: space.md, paddingTop: space.xs },
  card: { padding: space.ml, gap: space.xs, borderWidth: hairline },
})
