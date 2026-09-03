import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ArchMark } from '@/src/components/Brand'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useAuth } from '@/src/context/AuthProvider'
import { space } from '@/src/design/tokens'
import { useFitting } from '@/src/features/fitting/FittingProvider'
import { Frame } from '@/src/features/fitting/Frame'
import { hrefOf, INTENTS, type Intent } from '@/src/features/fitting/steps'

/** Step 1, the threshold: a name and the one thing that matters most. */
export default function Threshold() {
  const router = useRouter()
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

  const chosen = intent ? INTENTS.find(([k]) => k === intent) : undefined

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
          A sitting with <T role="h1" tone="brass" italic>the tailor.</T>
        </>
      }
      lead="A few taps, and this morning is decided for you, from clothes you already own."
      corner={<Button label="Sign out" variant="quiet" size="sm" onPress={() => void signOut()} />}
      actions={<Button label="Continue" block disabled={!hydrated || !intent} onPress={next} testID="fitting-continue" />}
    >
      <View style={styles.mark}>
        <ArchMark size={44} script />
      </View>
      <Field
        label="First name"
        testID="fitting-name"
        value={name}
        onChangeText={(v) => {
          setName(v)
          patch({ firstName: v })
        }}
        placeholder="What the tailor should call you"
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
        <View style={styles.chips}>
          {INTENTS.map(([k, label]) => (
            <Chip
              key={k}
              label={label}
              on={intent === k}
              onPress={() => {
                setIntent(k)
                patch({ intent: k })
              }}
            />
          ))}
        </View>
        <T role="bodySm" tone="muted" accessibilityLiveRegion="polite">
          {chosen ? chosen[2] : 'Pick the one that rings truest. It decides what the stylist puts first.'}
        </T>
      </View>
    </Frame>
  )
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', paddingVertical: space.sm },
  group: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
