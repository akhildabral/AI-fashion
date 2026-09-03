import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { WardrobeItem } from '@zauq/shared/types'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { useJobs } from '@/src/context/JobsProvider'
import { qk } from '@/src/lib/query'

const POLL_MS = 3000

/**
 * The member's owned pieces, newest first, with what the upload just
 * created merged in so an arch fills the moment a photo is taken. Polls the
 * catalogue every three seconds while `polling` (a screen in focus).
 */
export function usePieces(polling: boolean) {
  const { addedItems, upload, uploadError } = useJobs()
  const query = useQuery({
    queryKey: qk.wardrobe,
    queryFn: getWardrobe,
    refetchInterval: polling ? POLL_MS : false,
  })

  const items = useMemo(() => {
    const seen = new Map<string, WardrobeItem>()
    // The server's row is fresher than the upload's echo, so it goes first.
    for (const it of [...(query.data?.items ?? []), ...addedItems]) {
      if (it.owned === false || seen.has(it.id)) continue
      seen.set(it.id, it)
    }
    return [...seen.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }, [query.data, addedItems])

  const readyCount = items.filter((i) => i.status === 'ready').length
  const processing = items.some((i) => i.status === 'processing')

  return { items, readyCount, processing, uploading: upload.active, uploadError, query }
}
