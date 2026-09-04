// Save to a lookbook: pick one, or make one. With `remove`, the sheet is the
// confirmation for deleting a lookbook (the renders stay).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { createLookbook, deleteLookbook, toggleLookbookItem, type Lookbook } from '@zauq/shared/brief'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Press } from '@/src/components/Press'
import { SheetShell } from '@/src/components/Sheet'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius, space } from '@/src/design/tokens'
import { useLookbooks } from '@/src/features/mirror/data'
import { qk } from '@/src/lib/query'

type Books = { lookbooks: Lookbook[] }

export default function LookbookSheet() {
  const p = useLocalSearchParams<{ tryOnId?: string; remove?: string }>()
  const tryOnId = typeof p.tryOnId === 'string' && p.tryOnId ? p.tryOnId : null
  const removeId = typeof p.remove === 'string' && p.remove ? p.remove : null
  const { t } = useTheme()
  const flash = useFlash()
  const qc = useQueryClient()
  const booksQ = useLookbooks()
  const lookbooks = booksQ.data?.lookbooks ?? []
  const [name, setName] = useState('')

  const patch = (fn: (books: Lookbook[]) => Lookbook[]) => qc.setQueryData<Books>(qk.lookbooks, (d) => ({ lookbooks: fn(d?.lookbooks ?? []) }))

  const toggle = useMutation({
    mutationFn: ({ bookId, id }: { bookId: string; id: string }) => toggleLookbookItem(bookId, id),
    onMutate: ({ bookId, id }) => {
      patch((books) => books.map((b) => (b.id === bookId ? { ...b, tryOnIds: b.tryOnIds.includes(id) ? b.tryOnIds.filter((x) => x !== id) : [...b.tryOnIds, id] } : b)))
    },
    onSuccess: ({ lookbook }) => patch((books) => books.map((b) => (b.id === lookbook.id ? lookbook : b))),
    onError: () => flash('Could not update that lookbook.'),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.lookbooks }),
  })

  const create = useMutation({
    mutationFn: async () => {
      const { lookbook } = await createLookbook(name.trim())
      if (tryOnId) {
        const r = await toggleLookbookItem(lookbook.id, tryOnId)
        return r.lookbook
      }
      return lookbook
    },
    onSuccess: (lookbook) => {
      haptics.success()
      patch((books) => [lookbook, ...books.filter((b) => b.id !== lookbook.id)])
      setName('')
      flash(tryOnId ? `Saved to ${lookbook.name}.` : `${lookbook.name} is ready.`)
      void qc.invalidateQueries({ queryKey: qk.lookbooks })
    },
    onError: () => flash('Could not create the lookbook.'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteLookbook(id),
    onSuccess: (_r, id) => {
      haptics.thud()
      patch((books) => books.filter((b) => b.id !== id))
      void qc.invalidateQueries({ queryKey: qk.lookbooks })
      flash('Gone. The renders stay.')
      router.back()
    },
    onError: () => flash('Could not delete that lookbook.'),
  })

  const removing = removeId ? lookbooks.find((b) => b.id === removeId) : null

  if (removeId) {
    return (
      <SheetShell
        title="Delete this lookbook?"
        lead={removing ? `${removing.name} goes; its ${removing.tryOnIds.length} render${removing.tryOnIds.length === 1 ? '' : 's'} stay in the Mirror.` : 'The renders stay in the Mirror. Only the name goes.'}
        footer={
          <>
            <Button label="Delete lookbook" variant="danger" block style={styles.grow} loading={remove.isPending} disabled={remove.isPending} onPress={() => remove.mutate(removeId)} />
            <Button label="Keep it" variant="quiet" onPress={() => router.back()} />
          </>
        }
      >
        <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      </SheetShell>
    )
  }

  return (
    <SheetShell title="Save to a lookbook" footer={<Button label="Create" block loading={create.isPending} disabled={!name.trim() || create.isPending} onPress={() => create.mutate()} />}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      {booksQ.isPending ? (
        <View style={styles.list} accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
          <SkeletonBlock height={height.action} />
          <SkeletonBlock height={height.action} />
        </View>
      ) : null}
      {booksQ.isError && lookbooks.length === 0 ? <LoadError onRetry={() => void booksQ.refetch()} /> : null}
      {lookbooks.length > 0 ? (
        <View style={styles.list}>
          {lookbooks.map((b) => {
            const inBook = tryOnId ? b.tryOnIds.includes(tryOnId) : false
            return (
              <Press
                key={b.id}
                accessibilityRole="button"
                accessibilityState={{ selected: inBook, disabled: !tryOnId }}
                accessibilityLabel={`${b.name}, ${inBook ? 'added' : `${b.tryOnIds.length} renders`}`}
                disabled={!tryOnId}
                haptic="tap"
                onPress={() => tryOnId && toggle.mutate({ bookId: b.id, id: tryOnId })}
                style={[styles.rowItem, { borderRadius: radius, borderColor: inBook ? t.brass : alpha(t.ink, 0.14), backgroundColor: inBook ? t.brassSoft : 'transparent' }]}
              >
                <T role="bodySm">{b.name}</T>
                <T role="caption" tone="faint">
                  {inBook ? 'added' : `${b.tryOnIds.length} renders`}
                </T>
              </Press>
            )
          })}
        </View>
      ) : booksQ.data ? (
        <T role="bodySm" tone="muted">
          No lookbooks yet. Name the first one: an occasion, a trip, a mood.
        </T>
      ) : null}
      <Field label="New lookbook" value={name} onChangeText={setName} placeholder="e.g. Wedding options" returnKeyType="done" onSubmitEditing={() => name.trim() && create.mutate()} />
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // The lookbooks 8 apart, each a 44 row.
  list: { gap: space.sm },
  rowItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: height.action, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: hairline },
})
