// The Mirror's local state: the rail (which pieces are on you, each a
// switch), the lens, and the compare selection. It lives outside React so
// the sheets (swap, add, recreate, ask) can change it and the room reads it
// back when they close, and so the rail survives a tab switch. Everything
// here is optimistic and local; nothing renders until "See it on me".
import { useSyncExternalStore } from 'react'

export type Lens = 'closet' | 'inspiration'

export interface RailEntry {
  id: string
  on: boolean
}

export interface MirrorState {
  lens: Lens
  rail: RailEntry[]
  compareMode: boolean
  compare: string[]
}

/** How many renders can go side by side to the circle. */
export const MAX_COMPARE = 4

let state: MirrorState = { lens: 'closet', rail: [], compareMode: false, compare: [] }
const listeners = new Set<() => void>()

function set(patch: Partial<MirrorState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

export const mirror = {
  get: () => state,
  setLens(lens: Lens) {
    set({ lens })
  },
  /** Replace the rail: everything on. */
  setRail(ids: string[]) {
    set({ rail: unique(ids).map((id) => ({ id, on: true })) })
  },
  add(ids: string[]) {
    const have = new Set(state.rail.map((r) => r.id))
    const next = unique(ids).filter((id) => !have.has(id))
    if (next.length === 0) return
    set({ rail: [...state.rail, ...next.map((id) => ({ id, on: true }))] })
  },
  toggle(id: string) {
    set({ rail: state.rail.map((r) => (r.id === id ? { ...r, on: !r.on } : r)) })
  },
  swap(outId: string, inId: string) {
    set({ rail: state.rail.map((r) => (r.id === outId ? { id: inId, on: true } : r)) })
  },
  remove(id: string) {
    set({ rail: state.rail.filter((r) => r.id !== id) })
  },
  clear() {
    set({ rail: [] })
  },
  setCompareMode(on: boolean) {
    set({ compareMode: on, compare: [] })
  },
  toggleCompare(id: string) {
    const has = state.compare.includes(id)
    if (has) {
      set({ compare: state.compare.filter((x) => x !== id) })
      return true
    }
    if (state.compare.length >= MAX_COMPARE) return false
    set({ compare: [...state.compare, id], compareMode: true })
    return true
  },
  /** Drop renders that no longer exist (deleted, or a photo went with them). */
  prune(existing: Set<string>) {
    const compare = state.compare.filter((id) => existing.has(id))
    if (compare.length !== state.compare.length) set({ compare })
  },
}

export function useMirrorStore(): MirrorState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
