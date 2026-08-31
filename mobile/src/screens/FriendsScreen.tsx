import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  dismissPick,
  getNetwork,
  getPicks,
  getSocialMe,
  getStyleTwins,
  searchUsers,
  setHandle,
  type FriendPick,
  type NetworkEntry,
  type SocialMe,
  type StyleTwin,
} from '../lib/social'
import { logWear } from '../lib/wearlog'
import type { FriendsStackParamList } from '../navigation/types'
import { resolveImageUrl } from '../config'
import { Screen } from '../components/Screen'
import { ZoomableImage } from '../components/ImageViewer'
import { Button, Card, CenteredSpinner, ErrorText, Heading, Label, Subtle, TextField } from '../components/ui'
import { colors, fonts, radius, spacing } from '../theme'

type Nav = NativeStackNavigationProp<FriendsStackParamList, 'FriendsHome'>

function HandlePill({ handle, extra, onPress }: { handle: string; extra?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.pill} onPress={onPress}>
      <Text style={styles.pillText}>
        @{handle}
        {extra ? ` ${extra}` : ''}
      </Text>
    </Pressable>
  )
}

function PickCard({ pick, onGone }: { pick: FriendPick; onGone: (id: string) => void }) {
  const [logged, setLogged] = useState(false)

  return (
    <Card>
      <Text style={styles.pickBy}>
        <Text style={{ color: colors.clay }}>@{pick.byHandle}</Text> picked this for you
      </Text>
      {pick.note ? <Text style={styles.pickNote}>“{pick.note}”</Text> : null}
      <View style={styles.pickThumbs}>
        {pick.items.map((item) => (
          <ZoomableImage
            key={item.id}
            uri={resolveImageUrl(item.imageUrl)}
            style={styles.pickThumb}
          />
        ))}
      </View>
      <View style={styles.pickActions}>
        <Pressable
          disabled={logged || pick.items.length === 0}
          onPress={() => {
            void logWear({ itemIds: pick.items.map((i) => i.id) })
              .then(() => setLogged(true))
              .catch(() => {})
          }}
          style={[styles.woreBtn, logged && styles.woreBtnDone]}
        >
          <Text style={[styles.woreText, logged && styles.woreTextDone]}>
            {logged ? 'Logged ✓' : 'I wore it'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void dismissPick(pick.id)
              .then(() => onGone(pick.id))
              .catch(() => {})
          }}
        >
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    </Card>
  )
}

export function FriendsScreen() {
  const navigation = useNavigation<Nav>()
  const [me, setMe] = useState<SocialMe | null>(null)
  const [network, setNetwork] = useState<{ following: NetworkEntry[]; followers: NetworkEntry[] } | null>(null)
  const [picks, setPicks] = useState<FriendPick[] | null>(null)
  const [twins, setTwins] = useState<StyleTwin[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ handle: string }[]>([])
  const [handleDraft, setHandleDraft] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [savingHandle, setSavingHandle] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [meRes, netRes, picksRes, twinsRes] = await Promise.all([
        getSocialMe().catch(() => null),
        getNetwork().catch(() => null),
        getPicks().catch(() => ({ picks: [] })),
        getStyleTwins().catch(() => ({ twins: [] })),
      ])
      setMe(meRes)
      setNetwork(netRes)
      setPicks(picksRes.picks ?? [])
      setTwins(twinsRes.twins ?? [])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function handleSearch(q: string) {
    setQuery(q)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    try {
      const { users } = await searchUsers(q.trim())
      setResults(users ?? [])
    } catch {
      setResults([])
    }
  }

  async function claimHandle() {
    if (savingHandle) return
    setSavingHandle(true)
    setHandleError(null)
    try {
      const { user } = await setHandle(handleDraft)
      setMe((prev) => (prev ? { ...prev, handle: user.handle } : prev))
    } catch (err) {
      setHandleError(err instanceof Error ? err.message : 'Could not set that handle.')
    } finally {
      setSavingHandle(false)
    }
  }

  const goTo = (handle: string) => navigation.navigate('UserProfile', { handle })

  return (
    <Screen
      title="Friends"
      subtitle="Follow people, browse their public wardrobes, and dress each other."
      refreshing={refreshing}
      onRefresh={() => load(true)}
    >
      {!me && <CenteredSpinner />}

      {me && !me.handle && (
        <Card>
          <Heading size={22}>Pick your handle</Heading>
          <Subtle style={{ marginTop: 4 }}>
            Your name in the community — friends find and follow you by it.
          </Subtle>
          <View style={{ marginTop: spacing.md }}>
            <TextField
              value={handleDraft}
              onChangeText={setHandleDraft}
              placeholder="your_handle"
              autoCapitalize="none"
            />
          </View>
          <Button
            title="Claim it"
            loadingTitle="Saving…"
            loading={savingHandle}
            onPress={claimHandle}
            style={{ marginTop: spacing.md }}
          />
          {handleError && (
            <View style={{ marginTop: spacing.md }}>
              <ErrorText>{handleError}</ErrorText>
            </View>
          )}
        </Card>
      )}

      {me?.handle && (
        <Subtle style={{ marginBottom: spacing.lg }}>
          You are <Text style={{ color: colors.ink }}>@{me.handle}</Text> · {me.followers}{' '}
          follower{me.followers === 1 ? '' : 's'} · following {me.following}
        </Subtle>
      )}

      {me && (
        <>
          <View style={{ marginBottom: spacing.xl }}>
            <Label>Find people</Label>
            <TextField
              value={query}
              onChangeText={(q) => void handleSearch(q)}
              placeholder="Search by handle…"
              autoCapitalize="none"
            />
            {results.length > 0 && (
              <View style={styles.pillRow}>
                {results.map((u) => (
                  <HandlePill key={u.handle} handle={u.handle} onPress={() => goTo(u.handle)} />
                ))}
              </View>
            )}
          </View>

          {twins.length > 0 && (
            <View style={{ marginBottom: spacing.xl }}>
              <Heading size={22}>People with your taste</Heading>
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {twins.map((twin) => (
                  <Pressable key={twin.handle} onPress={() => goTo(twin.handle)}>
                    <Card>
                      <View style={styles.twinRow}>
                        <Text style={styles.twinHandle}>@{twin.handle}</Text>
                        <Text style={styles.twinMatch}>{twin.match}% match</Text>
                      </View>
                      {twin.sharedTaste.length > 0 && (
                        <Text style={styles.twinShared} numberOfLines={2}>
                          You both: {twin.sharedTaste.join(' · ')}
                        </Text>
                      )}
                    </Card>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {picks && picks.length > 0 && (
            <View style={{ marginBottom: spacing.xl }}>
              <Heading size={22}>Picked for you</Heading>
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {picks.map((pick) => (
                  <PickCard
                    key={pick.id}
                    pick={pick}
                    onGone={(id) => setPicks((prev) => prev?.filter((p) => p.id !== id) ?? prev)}
                  />
                ))}
              </View>
            </View>
          )}

          {network && (network.following.length > 0 || network.followers.length > 0) && (
            <View style={{ gap: spacing.lg }}>
              {network.following.length > 0 && (
                <View>
                  <Heading size={20}>Following · {network.following.length}</Heading>
                  <View style={styles.pillRow}>
                    {network.following.map((u) => (
                      <HandlePill
                        key={u.handle}
                        handle={u.handle}
                        extra={u.isFriend ? '· friends' : undefined}
                        onPress={() => goTo(u.handle)}
                      />
                    ))}
                  </View>
                </View>
              )}
              {network.followers.length > 0 && (
                <View>
                  <Heading size={20}>Followers · {network.followers.length}</Heading>
                  <View style={styles.pillRow}>
                    {network.followers.map((u) => (
                      <HandlePill
                        key={u.handle}
                        handle={u.handle}
                        extra={u.isFriend ? '· friends' : undefined}
                        onPress={() => goTo(u.handle)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: 13,
    color: colors.inkSoft,
    fontFamily: fonts.sans,
  },
  twinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  twinHandle: {
    fontSize: 15,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  twinMatch: {
    fontSize: 13,
    color: colors.clay,
  },
  twinShared: {
    marginTop: 4,
    fontSize: 12,
    color: colors.inkFaint,
  },
  pickBy: {
    fontSize: 14,
    color: colors.inkSoft,
  },
  pickNote: {
    marginTop: 4,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.inkFaint,
  },
  pickThumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pickThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
  },
  pickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  woreBtn: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  woreBtnDone: {
    borderColor: 'rgba(138,154,134,0.5)',
    backgroundColor: 'rgba(138,154,134,0.12)',
  },
  woreText: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  woreTextDone: {
    color: colors.sage,
  },
  dismissText: {
    fontSize: 12,
    color: colors.inkFaint,
  },
})
