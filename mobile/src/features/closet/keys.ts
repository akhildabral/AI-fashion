// Query keys the Closet adds beyond `qk` in src/lib/query. Every per-piece
// key nests under `qk.piece(id)` so invalidating the piece clears its story,
// its pairings and its verdict with it.
import { qk } from '@/src/lib/query'

export const ck = {
  story: (id: string) => [...qk.piece(id), 'story'] as const,
  pairs: (id: string) => [...qk.piece(id), 'pairs'] as const,
  verdict: (id: string) => [...qk.piece(id), 'verdict'] as const,
}
