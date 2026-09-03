// The notes under a post: who said what, @handles as links, and the line
// you add. The composer lives apart so a screen can pin it above the keyboard.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native'
import { addComment, deleteComment, getComments, timeAgo, type Comment, type CommentTarget, type LookPost, type PickPost, type VerdictPost } from '@zauq/shared/circle'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, height, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { Initials, Press } from './atoms'
import { patchPost } from './cache'
import { ck } from './keys'
import { userHref } from './notifications'

const MENTION = /(@[a-z0-9_]{3,20})/gi

/** Render @handles in a note as links to their room. */
export function Mentions({ text }: { text: string }) {
  const parts = text.split(MENTION)
  return (
    <>
      {parts.map((p, i) =>
        /^@[a-z0-9_]{3,20}$/i.test(p) ? (
          <T key={i} role="bodySm" tone="brass" style={{ fontFamily: fonts.sansSemi }} onPress={() => router.push(userHref(p.slice(1).toLowerCase()))} accessibilityRole="link">
            {p}
          </T>
        ) : (
          <T key={i} role="bodySm">
            {p}
          </T>
        ),
      )}
    </>
  )
}

type Commentable = LookPost | VerdictPost | PickPost

function setCount(target: CommentTarget, id: string, n: number) {
  patchPost<Commentable>(target, id, (p) => ({ ...p, comments: n }))
}

export function useComments(target: CommentTarget, id: string) {
  return useQuery({ queryKey: ck.comments(target, id), queryFn: () => getComments(target, id) })
}

export function CommentList({ target, id }: { target: CommentTarget; id: string }) {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const q = useComments(target, id)
  const key = ck.comments(target, id)

  const remove = useMutation({
    mutationFn: (cid: string) => deleteComment(cid),
    onMutate: (cid) => {
      const prev = queryClient.getQueryData<{ comments: Comment[] }>(key)
      if (prev) {
        const next = prev.comments.filter((c) => c.id !== cid)
        queryClient.setQueryData(key, { comments: next })
        setCount(target, id, next.length)
      }
      haptics.thud()
      return { prev }
    },
    onError: (_e, _cid, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(key, ctx.prev)
        setCount(target, id, ctx.prev.comments.length)
      }
      flash('Could not remove that.')
    },
  })

  if (q.isPending && !q.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.brass} />
      </View>
    )
  }
  if (q.isError && !q.data) {
    return (
      <View style={styles.center}>
        <T role="caption" tone="faint">
          Couldn’t load the notes.
        </T>
        <Button label="Try again" variant="quiet" size="sm" onPress={() => void q.refetch()} />
      </View>
    )
  }
  const comments = q.data?.comments ?? []
  if (comments.length === 0) {
    return (
      <View style={styles.center}>
        <T role="caption" tone="faint" align="center">
          No notes yet. Say what works, or @mention a friend.
        </T>
      </View>
    )
  }
  // The web's thread: rows `gap-2.5` apart, a 24 square of initials, the
  // handle in `text-xs font-semibold`, the note in `text-sm`, the time after.
  return (
    <View style={styles.list}>
      {comments.map((c) => (
        <View key={c.id} style={styles.row}>
          <Press accessibilityRole="button" accessibilityLabel={c.name} disabled={!c.handle} onPress={() => c.handle && router.push(userHref(c.handle))} style={styles.avatar}>
            <Initials handle={c.handle} name={c.name} size={24} />
          </Press>
          <View style={styles.body}>
            <T role="bodySm" tone="muted">
              <T role="caption" style={{ fontFamily: fonts.sansSemi }} onPress={c.handle ? () => router.push(userHref(c.handle as string)) : undefined}>
                {c.name?.trim() || c.handle || 'someone'}
              </T>
              {' '}
              <Mentions text={c.body} />
              {'  '}
              <T role="caption" tone="faint">
                {timeAgo(c.at)}
              </T>
            </T>
          </View>
          {c.isMine ? (
            <Press accessibilityRole="button" accessibilityLabel="Remove note" hitSlop={8} onPress={() => remove.mutate(c.id)}>
              <T role="caption" tone="faint">
                Remove
              </T>
            </Press>
          ) : null}
        </View>
      ))}
    </View>
  )
}

/** The line you add. Pin it above the keyboard with `KeyboardStickyView`. */
export function CommentComposer({ target, id }: { target: CommentTarget; id: string }) {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const key = ck.comments(target, id)

  const add = useMutation({
    mutationFn: (text: string) => addComment(target, id, text),
    onSuccess: ({ comment }) => {
      const prev = queryClient.getQueryData<{ comments: Comment[] }>(key)
      const next = [...(prev?.comments ?? []), comment]
      queryClient.setQueryData(key, { comments: next })
      setCount(target, id, next.length)
      setBody('')
      haptics.success()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not post that.')
    },
  })

  const text = body.trim()
  const submit = () => {
    if (!text || add.isPending) return
    add.mutate(text)
  }

  return (
    <View style={[styles.composer, { backgroundColor: t.bone, borderTopColor: alpha(t.ink, 0.1) }]}>
      <View style={[styles.field, { borderColor: alpha(t.ink, 0.18), backgroundColor: t.surface, borderRadius: radius }]}>
        <TextInput
          value={body}
          onChangeText={setBody}
          maxLength={500}
          placeholder="Add a note… @mention a friend"
          placeholderTextColor={alpha(t.ink, 0.4)}
          selectionColor={t.brass}
          accessibilityLabel="Add a note"
          returnKeyType="send"
          onSubmitEditing={submit}
          blurOnSubmit={false}
          multiline
          style={[styles.input, { color: t.ink, fontFamily: fonts.sans }]}
        />
      </View>
      <Button label="Post" variant="ghost" size="sm" disabled={!text} loading={add.isPending} onPress={submit} />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { paddingVertical: 12, alignItems: 'center', gap: 8 },
  // `gap-2.5 pb-1`
  list: { gap: 10, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // `mt-0.5`, so the square sits on the first line
  avatar: { marginTop: 2 },
  body: { flex: 1 },
  // `mt-2 flex gap-2`
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 12, borderTopWidth: hairline },
  field: { flex: 1, borderWidth: hairline, minHeight: height.secondary, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  input: { fontSize: 16, lineHeight: 20, paddingVertical: 0 },
})
