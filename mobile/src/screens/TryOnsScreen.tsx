import { useCallback, useState } from 'react'
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { deleteTryOn, getTryOns } from '../lib/tryon'
import { createPoll } from '../lib/polls'
import type { TryOn } from '../lib/types'
import { resolveImageUrl } from '../config'
import { Screen } from '../components/Screen'
import { ZoomableImage } from '../components/ImageViewer'
import { PollsList } from '../components/PollsList'
import { Button, CenteredSpinner, EmptyState, ErrorText, Label, Subtle } from '../components/ui'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const MAX_POLL_OPTIONS = 3

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function TryOnsScreen() {
  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    setError(null)
    try {
      const { tryOns: t } = await getTryOns()
      setTryOns(t ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your try-ons.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // Verdict-poll creation: select 2-3 try-ons, ask friends which one.
  const [pollMode, setPollMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [creating, setCreating] = useState(false)
  const [pollsRefresh, setPollsRefresh] = useState(0)

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length >= MAX_POLL_OPTIONS
          ? prev
          : [...prev, id],
    )
  }

  async function handleCreatePoll() {
    if (creating || selected.length < 2 || !tryOns) return
    setCreating(true)
    setError(null)
    try {
      const imageUrls = selected
        .map((id) => tryOns.find((t) => t.id === id)?.imageUrl)
        .filter((u): u is string => !!u)
      const { poll } = await createPoll({
        imageUrls,
        question: question.trim() || undefined,
      })
      setPollMode(false)
      setSelected([])
      setQuestion('')
      setPollsRefresh((n) => n + 1)
      await Share.share({ message: `${poll.question} ${poll.shareUrl}`, url: poll.shareUrl })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the poll.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Screen
      title="Try-Ons"
      subtitle="Every look you've rendered onto your photo — see yourself styled, over and over."
      refreshing={refreshing}
      onRefresh={() => load(true)}
    >
      {loading && <CenteredSpinner />}

      {!loading && error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && tryOns && tryOns.length >= 2 && (
        <View style={styles.pollBar}>
          <Pressable
            style={[styles.pollToggle, pollMode && styles.pollToggleActive]}
            onPress={() => {
              setPollMode((v) => !v)
              setSelected([])
            }}
          >
            <Text style={[styles.pollToggleText, pollMode && styles.pollToggleTextActive]}>
              {pollMode ? 'Cancel' : 'Ask friends'}
            </Text>
          </Pressable>
        </View>
      )}

      {pollMode && (
        <View style={styles.pollForm}>
          <Subtle>
            Tap 2–3 looks below, then share the link. The poll closes in 30 minutes and only
            you see the votes.
          </Subtle>
          <View style={{ marginTop: spacing.md }}>
            <Label>Question</Label>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Which one should I wear tonight?"
              placeholderTextColor={colors.inkFaint}
              style={styles.questionInput}
              maxLength={140}
            />
          </View>
          <Button
            title={`Create & share (${selected.length}/${MAX_POLL_OPTIONS})`}
            loadingTitle="Creating…"
            loading={creating}
            onPress={handleCreatePoll}
            style={{ marginTop: spacing.md, opacity: selected.length < 2 ? 0.4 : 1 }}
          />
        </View>
      )}

      {!loading && !error && tryOns && tryOns.length === 0 && (
        <EmptyState>
          <Subtle>You haven&apos;t tried on any looks yet.</Subtle>
          <Subtle>Try on a look from the Looks or Wardrobe tab.</Subtle>
        </EmptyState>
      )}

      {!loading && !error && tryOns && tryOns.length > 0 && (
        <View style={styles.grid}>
          {tryOns.map((tryOn) => {
            const uri = resolveImageUrl(tryOn.imageUrl)
            return (
              <View key={tryOn.id} style={styles.gridItem}>
                <View style={[styles.card, selected.includes(tryOn.id) && styles.cardSelected]}>
                  <View style={styles.imageWrap}>
                    {uri ? <ZoomableImage uri={uri} style={styles.image} /> : null}
                    {pollMode && (
                      <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => toggleSelect(tryOn.id)}
                        accessibilityLabel="Select for poll"
                      >
                        {selected.includes(tryOn.id) && (
                          <View style={styles.selectBadge}>
                            <Text style={styles.selectBadgeText}>
                              {selected.indexOf(tryOn.id) + 1}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.removeBtn}
                      accessibilityLabel="Remove this try-on"
                      onPress={() =>
                        Alert.alert('Remove try-on', 'Remove this render from your gallery?', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => {
                              void deleteTryOn(tryOn.id)
                                .then(() =>
                                  setTryOns((prev) => prev?.filter((t) => t.id !== tryOn.id) ?? prev),
                                )
                                .catch(() => setError('Could not remove that try-on.'))
                            },
                          },
                        ])
                      }
                    >
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.date}>{formatDate(tryOn.createdAt)}</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <PollsList refreshKey={pollsRefresh} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  pollBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  pollToggle: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  pollToggleActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  pollToggleText: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  pollToggleTextActive: {
    color: colors.white,
  },
  pollForm: {
    borderWidth: 1,
    borderColor: 'rgba(185,141,111,0.35)',
    backgroundColor: 'rgba(185,141,111,0.08)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  questionInput: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  cardSelected: {
    borderColor: colors.clay,
    borderWidth: 2,
  },
  selectBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBadgeText: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.sans,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrap: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.boneSoft,
  },
  removeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  meta: {
    padding: spacing.md,
  },
  date: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.clay,
  },
})
