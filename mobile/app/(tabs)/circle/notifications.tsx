// What happened to you, behind the bell: one line each, repeats folded,
// every row landing on its post or its person. Opening marks it read.
import { FlashList } from '@shopify/flash-list'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useFocusEffect } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { getNotifications, markNotificationsRead, timeAgo } from '@zauq/shared/circle'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { Initials, Press } from '@/src/features/circle/atoms'
import { digest, digestLine, type Digest } from '@/src/features/circle/notifications'

export default function NotificationsScreen() {
  const { t } = useTheme()
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: qk.notifications, queryFn: getNotifications })
  const unread = q.data?.unread ?? 0

  // Opening settles the badge. The rows keep their "new" weight while the
  // screen is open; the list revalidates once it's left.
  useEffect(() => {
    if (unread === 0) return
    queryClient.setQueryData(qk.unread, { unread: 0 })
    void markNotificationsRead().catch(() => undefined)
  }, [unread, queryClient])
  useFocusEffect(
    useCallback(
      () => () => {
        void queryClient.invalidateQueries({ queryKey: qk.notifications })
      },
      [queryClient],
    ),
  )

  const rows = q.data ? digest(q.data.items) : []

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'What happened' }} />
      {!q.data && q.isPending ? (
        <View style={styles.skeleton}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={44} />
          ))}
        </View>
      ) : !q.data && q.isError ? (
        <LoadError message="Couldn’t load these." onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing yet" line="When your circle reacts, it lands here." />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(d) => d.key}
          renderItem={({ item, index }) => <Row d={item} first={index === 0} />}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={t.brass} />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </Screen>
  )
}

function Row({ d, first }: { d: Digest; first: boolean }) {
  const { t } = useTheme()
  const l = digestLine(d)
  return (
    <Press accessibilityRole="button" accessibilityLabel={l.text} onPress={() => router.push(l.to)}>
      <View style={[styles.row, !first && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }]}>
        <Initials handle={d.first.actorHandle} name={d.names[0] ?? null} size={32} />
        <T role="bodySm" tone={d.read ? 'muted' : 'ink'} style={[styles.text, !d.read && { fontFamily: fonts.sansMedium }]}>
          {l.text}
        </T>
        <T role="caption" tone="faint">
          {timeAgo(d.at)}
        </T>
      </View>
    </Press>
  )
}

const styles = StyleSheet.create({
  skeleton: { paddingHorizontal: gutter, paddingTop: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: gutter, paddingVertical: 12, minHeight: 56 },
  text: { flex: 1 },
})
