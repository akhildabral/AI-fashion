import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { getQuiz } from '@zauq/shared/quiz'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { gutter, height, space } from '@/src/design/tokens'
import { type Answer } from '@/src/features/fitting/draft'
import { useFitting } from '@/src/features/fitting/FittingProvider'
import { Frame } from '@/src/features/fitting/Frame'
import { fk } from '@/src/features/fitting/keys'
import { DECK_MAX, hrefOf } from '@/src/features/fitting/steps'
import { TasteDeck } from '@/src/features/fitting/TasteDeck'

/** Step 2, taste: this or that, eight times, by swipe. The peak. */
export default function Taste() {
  const router = useRouter()
  const { width: screenW } = useWindowDimensions()
  const { draft, patch } = useFitting()
  const quiz = useQuery({ queryKey: fk.quiz, queryFn: getQuiz, staleTime: Infinity })
  const [answers, setAnswers] = useState(draft.answers)

  const pairs = useMemo(() => (quiz.data?.pairs ?? []).slice(0, DECK_MAX), [quiz.data])
  const index = pairs.findIndex((p) => !(p.id in answers))
  const pair = index >= 0 ? pairs[index] : null
  const answered = Object.keys(answers).filter((id) => pairs.some((p) => p.id === id)).length

  const go = (next: Record<string, Answer>) => {
    patch({ answers: next, quizDone: true, step: 'city' })
    router.push(hrefOf('city'))
  }

  const pick = (answer: Answer) => {
    if (!pair) return
    const next = { ...answers, [pair.id]: answer }
    setAnswers(next)
    patch({ answers: next })
    if (pairs.every((p) => p.id in next)) go(next)
  }

  const undo = () => {
    const prev = pairs[index >= 0 ? index - 1 : pairs.length - 1]
    if (!prev) return
    const next = { ...answers }
    delete next[prev.id]
    setAnswers(next)
    patch({ answers: next })
  }

  const who = pair ? `Taste · ${index + 1} of ${pairs.length}` : 'Taste'
  // The deck's shape while the pairs arrive: a card of two 3:4 arches, the two choices beneath.
  const cardH = Math.round(((screenW - gutter * 2 - 96) / 2) * (4 / 3)) + 96

  return (
    <Frame
      step="taste"
      scroll={false}
      who={who}
      ask={
        <>
          This, <T role="h1" tone="brass" italic>or that?</T>
        </>
      }
      lead={answered === 0 ? 'No wrong answers. Tap the one you’d reach for.' : 'Keep going, the stylist is taking notes.'}
      actions={
        <View style={styles.row}>
          {answered > 0 && pairs.length > 0 ? <Button label="Previous pair" variant="quiet" size="sm" onPress={undo} /> : <View />}
          {pair && pairs.length > 0 ? <Button label={answered >= DECK_MAX ? 'Continue' : 'Skip the rest'} variant="quiet" size="sm" onPress={() => go(answers)} /> : null}
        </View>
      }
    >
      {quiz.isPending ? (
        <View style={styles.loading}>
          <SkeletonBlock height={cardH} />
          <View style={styles.choices}>
            <SkeletonBlock height={height.action} style={styles.choice} />
            <SkeletonBlock height={height.action} style={styles.choice} />
          </View>
        </View>
      ) : quiz.isError ? (
        <View style={styles.loading}>
          <LoadError message="The pairs did not arrive." onRetry={() => void quiz.refetch()} />
          <Button label="Continue without" variant="quiet" size="sm" style={styles.center} onPress={() => go(answers)} />
        </View>
      ) : pairs.length === 0 ? (
        <View style={styles.loading}>
          <T role="body" tone="muted" align="center">
            Nothing to ask today. The stylist will learn as you go.
          </T>
          <Button label="Continue" block onPress={() => go(answers)} />
        </View>
      ) : pair ? (
        <TasteDeck pair={pair} next={index + 1 < pairs.length ? pairs[index + 1] : null} onPick={pick} />
      ) : (
        <View style={styles.loading}>
          <T role="body" tone="muted" align="center">
            Noted, all of it.
          </T>
          <Button label="Continue" block onPress={() => go(answers)} />
        </View>
      )}
    </Frame>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loading: { gap: space.lg },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: { flex: 1, width: undefined },
  center: { alignSelf: 'center' },
})
