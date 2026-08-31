import { useCallback, useState } from 'react'
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { deletePoll, listPolls, type Poll } from '../lib/polls'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, spacing } from '../theme'
import { Heading, Subtle } from './ui'

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} min left`
  return `${Math.round(mins / 60)} h left`
}

const LETTERS: Record<string, string> = { a: 'A', b: 'B', c: 'C' }

/** The asker's verdict polls with live counts; votes are asker-only. */
export function PollsList({ refreshKey }: { refreshKey: number }) {
  const [polls, setPolls] = useState<Poll[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      listPolls()
        .then(({ polls: p }) => {
          if (!cancelled) setPolls(p ?? [])
        })
        .catch(() => {
          if (!cancelled) setPolls([])
        })
      return () => {
        cancelled = true
      }
    }, [refreshKey]),
  )

  if (!polls || polls.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Heading size={24}>Your polls</Heading>
      <Subtle style={{ marginTop: spacing.sm }}>
        Votes are only visible to you. Friends just see the choices.
      </Subtle>

      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {polls.map((poll) => {
          const winner =
            poll.counts && Object.keys(poll.counts).length > 0
              ? Object.entries(poll.counts).sort((a, b) => b[1] - a[1])[0][0]
              : null
          return (
            <View key={poll.id} style={styles.card}>
              <View style={styles.headRow}>
                <Text style={styles.question} numberOfLines={1}>
                  {poll.question}
                </Text>
                <Text style={styles.meta}>
                  {poll.totalVotes ?? 0}v · {timeLeft(poll.expiresAt)}
                </Text>
              </View>
              <View style={styles.optionsRow}>
                {poll.options.map((opt) => {
                  const count = poll.counts?.[opt.id] ?? 0
                  const isWinner = winner === opt.id && count > 0
                  return (
                    <View key={opt.id} style={styles.option}>
                      <Image
                        source={{ uri: resolveImageUrl(opt.imageUrl) }}
                        style={[styles.optionImage, isWinner && styles.optionWinner]}
                        resizeMode="cover"
                      />
                      <Text style={styles.optionLabel}>
                        {LETTERS[opt.id]} · {count}
                        {isWinner ? ' 🏆' : ''}
                      </Text>
                    </View>
                  )
                })}
              </View>
              <View style={styles.actions}>
                {!poll.expired && (
                  <Pressable
                    onPress={() =>
                      void Share.share({
                        message: `${poll.question} ${poll.shareUrl}`,
                        url: poll.shareUrl,
                      })
                    }
                  >
                    <Text style={styles.actionLink}>Share link</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    void deletePoll(poll.id)
                      .then(() => setPolls((prev) => prev?.filter((p) => p.id !== poll.id) ?? prev))
                      .catch(() => {})
                  }}
                >
                  <Text style={styles.removeLink}>Remove</Text>
                </Pressable>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xxl,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inkLine,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  question: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  meta: {
    fontSize: 11,
    color: colors.inkFaint,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  option: {
    width: 72,
  },
  optionImage: {
    width: 72,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
  optionWinner: {
    borderWidth: 2,
    borderColor: colors.sage,
  },
  optionLabel: {
    marginTop: 3,
    fontSize: 11,
    textAlign: 'center',
    color: colors.inkSoft,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  actionLink: {
    fontSize: 12,
    color: colors.clay,
  },
  removeLink: {
    fontSize: 12,
    color: colors.inkFaint,
  },
})
