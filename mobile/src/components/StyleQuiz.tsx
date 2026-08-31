import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { getQuiz, submitQuiz } from '../lib/quiz'
import { useProfile } from '../context/ProfileContext'
import type { QuizPair } from '../lib/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { Card, ErrorText, Heading, Subtle } from './ui'

/**
 * The cold-start taste quiz as a fullscreen modal: one tap per pair, ~60
 * seconds total. Answers become style signals the stylist uses before any
 * wear history exists.
 */
function QuizModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { setProfile } = useProfile()
  const [pairs, setPairs] = useState<QuizPair[] | null>(null)
  const [index, setIndex] = useState(0)
  const [choices, setChoices] = useState<Record<string, 'left' | 'right'>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setIndex(0)
    setChoices({})
    setSaving(false)
    setError(null)
    getQuiz()
      .then(({ pairs: p }) => setPairs(p ?? []))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load the quiz.'),
      )
  }, [visible])

  async function choose(side: 'left' | 'right') {
    if (!pairs || saving) return
    const next = { ...choices, [pairs[index].id]: side }
    setChoices(next)

    if (index < pairs.length - 1) {
      setIndex(index + 1)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { profile } = await submitQuiz(next)
      setProfile(profile)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answers.')
      setSaving(false)
    }
  }

  const pair = pairs?.[index]

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close quiz">
          <Text style={styles.closeText}>×</Text>
        </Pressable>

        <Text style={styles.eyebrow}>STYLE QUIZ</Text>
        <Heading size={26} style={{ textAlign: 'center' }}>
          {pair ? pair.question : 'Finding your taste'}
        </Heading>
        <Subtle style={{ textAlign: 'center', marginTop: spacing.sm }}>
          Tap the one you&apos;d rather wear. No wrong answers.
        </Subtle>

        {!pairs && !error && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.clay} />
          </View>
        )}

        {error && (
          <View style={{ marginTop: spacing.xl }}>
            <ErrorText>{error}</ErrorText>
          </View>
        )}

        {pair && !saving && (
          <>
            <View style={styles.pairRow}>
              {(['left', 'right'] as const).map((side) => (
                <Pressable
                  key={`${pair.id}-${side}`}
                  style={styles.option}
                  onPress={() => void choose(side)}
                >
                  <Image
                    source={{ uri: resolveImageUrl(pair[side].imageUrl) }}
                    style={styles.optionImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.optionLabel}>{pair[side].label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.dots}>
              {pairs!.map((p, i) => (
                <View
                  key={p.id}
                  style={[
                    styles.dot,
                    i === index && styles.dotActive,
                    i < index && styles.dotDone,
                  ]}
                />
              ))}
            </View>
          </>
        )}

        {saving && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.clay} />
            <Subtle style={{ marginTop: spacing.md }}>Tuning your stylist…</Subtle>
          </View>
        )}
      </ScrollView>
    </Modal>
  )
}

/** Entry card for the Profile screen: take (or retake) the quiz. */
export function StyleQuizCard() {
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const taken = !!profile?.styleSignals?.signals?.length

  return (
    <Card>
      <Heading size={22}>Style quiz</Heading>
      <Subtle style={{ marginTop: 4 }}>
        {taken
          ? 'Taken ✓ — your stylist knows your taste. Retake it any time your style shifts.'
          : 'Eight quick picks teach your stylist what you actually like. About 60 seconds.'}
      </Subtle>
      <Pressable style={styles.quizBtn} onPress={() => setOpen(true)}>
        <Text style={styles.quizBtnText}>{taken ? 'Retake the quiz' : 'Take the quiz'}</Text>
      </Pressable>
      <QuizModal visible={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bone,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 72,
    paddingBottom: spacing.xxl,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...shadow.card,
  },
  closeText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.inkSoft,
  },
  eyebrow: {
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 2.5,
    color: colors.clay,
    fontFamily: fonts.sans,
    marginBottom: spacing.sm,
  },
  center: {
    marginTop: spacing.xxl,
    alignItems: 'center',
  },
  pairRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  option: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  optionImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.boneSoft,
  },
  optionLabel: {
    textAlign: 'center',
    paddingVertical: spacing.md,
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.ink,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inkLine2,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.ink,
  },
  dotDone: {
    backgroundColor: colors.clay,
  },
  quizBtn: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  quizBtnText: {
    fontSize: 14,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
})
