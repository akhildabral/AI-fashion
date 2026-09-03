// Ask the circle: the renders you are torn between go out as a verdict,
// "Which one should I wear?", open for a day.
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { createPoll, type PollAudience } from '@zauq/shared/polls'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { gutter } from '@/src/design/tokens'
import { useTryOns } from '@/src/features/mirror/data'
import { mirror } from '@/src/features/mirror/store'

const LETTERS = ['A', 'B', 'C', 'D']
const AUDIENCES: { key: PollAudience; label: string }[] = [
  { key: 'circle', label: 'Your circle' },
  { key: 'link', label: 'A link, anyone' },
]

export default function AskSheet() {
  const p = useLocalSearchParams<{ ids?: string }>()
  const ids = typeof p.ids === 'string' ? p.ids.split(',').filter(Boolean) : []
  const { width: sw } = useWindowDimensions()
  const flash = useFlash()
  const tryOnsQ = useTryOns()
  const renders = ids.map((id) => (tryOnsQ.data?.tryOns ?? []).find((x) => x.id === id)).filter((x) => !!x)
  const tileW = Math.floor((sw - gutter * 2 - 12 * Math.max(1, renders.length - 1)) / Math.max(2, renders.length))

  const [question, setQuestion] = useState('Which one should I wear?')
  const [audience, setAudience] = useState<PollAudience>('circle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    if (busy || renders.length < 2) return
    setBusy(true)
    setError(null)
    try {
      await createPoll({ imageUrls: renders.map((r) => r.imageUrl), question: question.trim() || 'Which one should I wear?', audience, expiresInMinutes: 24 * 60 })
      haptics.success()
      mirror.setCompareMode(false)
      flash('It’s with your circle. Share the link anywhere.')
      router.back()
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not create the poll.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen padded edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <T role="h2" accessibilityRole="header">
          Ask the circle
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {renders.map((r, i) => (
            <GarmentTile key={r.id} photo width={tileW} aspect={3 / 4} imageUrl={r.imageUrl} badge={LETTERS[i]} accessibilityLabel={`Option ${LETTERS[i]}`} />
          ))}
        </ScrollView>
        {renders.length < 2 ? (
          <T role="bodySm" tone="muted">
            Pick two or more renders in the Mirror first.
          </T>
        ) : null}
        <Field label="The question" value={question} onChangeText={setQuestion} returnKeyType="done" />
        <View>
          <T role="label" tone="faint" style={styles.label}>
            Who answers
          </T>
          <View style={styles.chips}>
            {AUDIENCES.map((a) => (
              <Chip key={a.key} label={a.label} on={audience === a.key} onPress={() => setAudience(a.key)} />
            ))}
          </View>
        </View>
        <T role="caption" tone="faint">
          Open for 24 hours. You see the count; they see the pictures.
        </T>
        {error ? (
          <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
        <Button label={busy ? 'Sending…' : 'Ask the circle'} block loading={busy} disabled={busy || renders.length < 2} onPress={() => void ask()} />
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 24, paddingBottom: 24, gap: 16 },
  strip: { flexDirection: 'row', gap: 12, paddingVertical: 2 },
  label: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
