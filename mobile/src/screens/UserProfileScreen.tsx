import { useCallback, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import {
  followUser,
  getOverlap,
  getProfileByHandle,
  sendPick,
  unfollowUser,
  type OverlapResult,
  type PublicProfile,
} from '../lib/social'
import type { FriendsStackParamList } from '../navigation/types'
import { resolveImageUrl } from '../config'
import { Screen } from '../components/Screen'
import { ZoomableImage } from '../components/ImageViewer'
import { Button, Card, CenteredSpinner, ErrorText, Subtle, TextField } from '../components/ui'
import { colors, fonts, radius, spacing } from '../theme'

const MAX_PICK_ITEMS = 8

export function UserProfileScreen() {
  const route = useRoute<RouteProp<FriendsStackParamList, 'UserProfile'>>()
  const handle = route.params.handle

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [overlap, setOverlap] = useState<OverlapResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      getProfileByHandle(handle)
        .then((p) => {
          if (cancelled) return
          setProfile(p)
          if (!p.isMe && p.publicItems.length > 0) {
            void getOverlap(handle)
              .then((o) => {
                if (!cancelled) setOverlap(o)
              })
              .catch(() => {})
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Profile not found.')
        })
      return () => {
        cancelled = true
      }
    }, [handle]),
  )

  async function toggleFollow() {
    if (!profile || busy) return
    setBusy(true)
    try {
      if (profile.isFollowing) {
        await unfollowUser(handle)
        setProfile({ ...profile, isFollowing: false, isFriend: false })
      } else {
        const { isFriend } = await followUser(handle)
        setProfile({ ...profile, isFollowing: true, isFriend })
      }
    } catch {
      // Leave state as-is.
    } finally {
      setBusy(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length >= MAX_PICK_ITEMS
          ? prev
          : [...prev, id],
    )
  }

  async function handleSendPick() {
    if (sending || selected.length < 2) return
    setSending(true)
    try {
      await sendPick(handle, { itemIds: selected, note: note.trim() || undefined })
      setSent(true)
      setPicking(false)
      setSelected([])
      setNote('')
      setTimeout(() => setSent(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your pick.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen
      title={`@${handle}`}
      subtitle={
        profile
          ? `${profile.counts.followers} follower${profile.counts.followers === 1 ? '' : 's'} · following ${profile.counts.following} · ${profile.counts.publicItems} public item${profile.counts.publicItems === 1 ? '' : 's'}${profile.isFriend ? ' · friends ✓' : profile.followsYou ? ' · follows you' : ''}`
          : ' '
      }
    >
      {!profile && !error && <CenteredSpinner />}
      {error && <ErrorText>{error}</ErrorText>}

      {profile && !profile.isMe && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => void toggleFollow()}
            disabled={busy}
            style={[styles.followBtn, profile.isFollowing && styles.followBtnActive]}
          >
            <Text style={[styles.followText, profile.isFollowing && styles.followTextActive]}>
              {profile.isFollowing ? 'Following ✓' : 'Follow'}
            </Text>
          </Pressable>
          {profile.isFriend && profile.publicItems.length >= 2 && (
            <Pressable
              onPress={() => {
                setPicking((v) => !v)
                setSelected([])
              }}
              style={styles.pickToggle}
            >
              <Text style={styles.pickToggleText}>
                {picking ? 'Cancel' : 'Pick an outfit for them'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {sent && (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.sage, fontSize: 14 }}>
            Outfit sent — it's waiting in their picks ✓
          </Text>
        </Card>
      )}

      {overlap && overlap.matchedCount > 0 && (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={styles.overlapTitle}>
            You could recreate {overlap.matchedCount} of their {overlap.theirCount} public
            piece{overlap.theirCount === 1 ? '' : 's'}
          </Text>
          <View style={styles.overlapRow}>
            {overlap.matches.slice(0, 4).map((m) => (
              <View key={m.theirs.id} style={styles.overlapPair}>
                <Image
                  source={{ uri: resolveImageUrl(m.theirs.imageUrl) }}
                  style={styles.overlapThumb}
                  resizeMode="cover"
                />
                <Text style={{ color: colors.inkFaint }}>≈</Text>
                <Image
                  source={{ uri: resolveImageUrl(m.yours.imageUrl) }}
                  style={[styles.overlapThumb, styles.overlapMine]}
                  resizeMode="cover"
                />
              </View>
            ))}
          </View>
          <Text style={styles.overlapHint}>Theirs left, your closest match right.</Text>
        </Card>
      )}

      {picking && (
        <Card style={{ marginBottom: spacing.lg }}>
          <Subtle>
            Tap 2–{MAX_PICK_ITEMS} of their pieces to build the outfit, add a note, and send.
          </Subtle>
          <View style={{ marginTop: spacing.md }}>
            <TextField
              value={note}
              onChangeText={setNote}
              placeholder="Why this works (optional)"
            />
          </View>
          <Button
            title={`Send outfit (${selected.length})`}
            loadingTitle="Sending…"
            loading={sending}
            onPress={handleSendPick}
            style={{ marginTop: spacing.md, opacity: selected.length < 2 ? 0.4 : 1 }}
          />
        </Card>
      )}

      {profile && profile.publicItems.length === 0 && (
        <Subtle>
          Their public wardrobe is empty
          {profile.isMe ? ' — publish items from your Wardrobe tab.' : '.'}
        </Subtle>
      )}

      {profile && profile.publicItems.length > 0 && (
        <View style={styles.grid}>
          {profile.publicItems.map((item) => {
            const selectedIndex = selected.indexOf(item.id)
            return (
              <View key={item.id} style={styles.gridItem}>
                <View style={[styles.card, selectedIndex >= 0 && styles.cardSelected]}>
                  <View style={styles.imageWrap}>
                    <ZoomableImage
                      uri={resolveImageUrl(item.imageUrl)}
                      style={styles.image}
                    />
                    {picking && (
                      <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => toggleSelect(item.id)}
                      >
                        {selectedIndex >= 0 && (
                          <View style={styles.selectBadge}>
                            <Text style={styles.selectBadgeText}>{selectedIndex + 1}</Text>
                          </View>
                        )}
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {item.subtype ?? item.category}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  followBtn: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: 9,
  },
  followBtnActive: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.inkLine2,
  },
  followText: {
    color: colors.white,
    fontSize: 13,
    fontFamily: fonts.sans,
  },
  followTextActive: {
    color: colors.ink,
  },
  pickToggle: {
    borderWidth: 1,
    borderColor: 'rgba(185,141,111,0.5)',
    backgroundColor: 'rgba(185,141,111,0.1)',
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  pickToggleText: {
    fontSize: 13,
    color: colors.clay,
    fontFamily: fonts.sans,
  },
  overlapTitle: {
    fontSize: 14,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  overlapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  overlapPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overlapThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
  overlapMine: {
    borderWidth: 2,
    borderColor: 'rgba(138,154,134,0.6)',
  },
  overlapHint: {
    marginTop: spacing.sm,
    fontSize: 11,
    color: colors.inkFaint,
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
  },
  cardSelected: {
    borderColor: colors.clay,
    borderWidth: 2,
  },
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.boneSoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  selectBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBadgeText: {
    color: colors.white,
    fontSize: 13,
  },
  itemLabel: {
    paddingVertical: spacing.sm,
    fontSize: 12,
    textAlign: 'center',
    color: colors.inkSoft,
    textTransform: 'capitalize',
  },
})
