// One post with its notes. The composer sits above the keyboard.
import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getPost, type PostTarget } from '@zauq/shared/circle'
import { LoadError, SectionHead } from '@/src/components/Bits'
import { Screen } from '@/src/components/Screen'
import { gutter, space } from '@/src/design/tokens'
import { useTheme } from '@/src/design/theme'
import { qk } from '@/src/lib/query'
import { CardSkeleton, PostCard } from '@/src/features/circle/cards'
import { CommentComposer, CommentList } from '@/src/features/circle/CommentThread'
import { useCardActions } from '@/src/features/circle/hooks'

const TITLES: Record<PostTarget, string> = { look: 'Look', verdict: 'Verdict', pick: 'Pick' }

export default function PostScreen() {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const { type = 'look', id = '' } = useLocalSearchParams<{ type: string; id: string }>()
  const target: PostTarget = type === 'verdict' || type === 'pick' ? type : 'look'
  const q = useQuery({ queryKey: qk.post(target, id), queryFn: () => getPost(target, id), enabled: !!id })
  const actions = useCardActions()
  const post = q.data?.post

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: TITLES[target] }} />
      <KeyboardAwareScrollView bottomOffset={80} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 96 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {post ? (
          <PostCard post={post} actions={actions} />
        ) : q.isError ? (
          <LoadError message="That post isn’t on the circle any more." onRetry={() => void q.refetch()} />
        ) : (
          <CardSkeleton />
        )}
        {post && post.type !== 'week' ? (
          <View style={styles.notes}>
            <SectionHead title="Notes" />
            <CommentList target={post.type} id={post.id} />
          </View>
        ) : null}
      </KeyboardAwareScrollView>
      {post && post.type !== 'week' ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.sticky}>
          <View style={{ backgroundColor: t.bone, paddingBottom: insets.bottom }}>
            <CommentComposer target={post.type} id={post.id} />
          </View>
        </KeyboardStickyView>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // The card, then the notes a block (32) beneath; the head and its list 16 apart.
  content: { paddingHorizontal: gutter, paddingTop: space.md, gap: space.xxl },
  notes: { gap: space.lg },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0 },
})
