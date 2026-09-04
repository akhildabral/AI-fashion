// The deferred delete behind the UndoBar: the thing leaves the list now, the
// server call waits five seconds, and one tap pulls it back. The bar itself
// is shared furniture (`@/src/components/UndoBar`).
import { useCallback, useEffect, useRef, useState } from 'react'
import * as haptics from '@/src/design/haptics'

export { UndoBar } from '@/src/components/UndoBar'

const UNDO_MS = 5000

export interface Pending<Item> {
  item: Item
  message: string
}

/**
 * A deferred delete with an undo window. `remove` hides the item at once
 * (through `onHide`) and fires `commit` after five seconds unless `undo` is
 * called; a second removal flushes the first.
 */
export function useUndoDelete<Item>({
  commit,
  onHide,
  onRestore,
  onFail,
}: {
  commit: (item: Item) => Promise<unknown>
  onHide: (item: Item) => void
  onRestore: (item: Item) => void
  onFail?: (item: Item) => void
}) {
  const [pending, setPending] = useState<Pending<Item> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef<Pending<Item> | null>(null)

  const flush = useCallback(() => {
    const p = current.current
    if (!p) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    current.current = null
    setPending(null)
    commit(p.item).catch(() => {
      onFail?.(p.item)
      onRestore(p.item)
    })
  }, [commit, onFail, onRestore])

  const remove = useCallback(
    (item: Item, message: string) => {
      flush()
      haptics.thud()
      onHide(item)
      const p = { item, message }
      current.current = p
      setPending(p)
      timer.current = setTimeout(flush, UNDO_MS)
    },
    [flush, onHide],
  )

  const undo = useCallback(() => {
    const p = current.current
    if (!p) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    current.current = null
    setPending(null)
    haptics.tap()
    onRestore(p.item)
  }, [onRestore])

  // Leaving the screen commits what was pending: the member saw it go.
  useEffect(() => () => flush(), [flush])

  return { pending, remove, undo }
}
