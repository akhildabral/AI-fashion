import { createContext } from 'react'
import type { TryOn, WardrobeItem } from '@zauq/shared/types'

/** Aggregate state of an in-flight batch of uploads. */
export interface UploadState {
  active: boolean
  total: number
  done: number
  failed: number
}

/**
 * App-level jobs: the long-running work that must survive navigation and tab
 * switches. Uploads and renders both persist server-side (a wardrobe row goes
 * `processing`, a try-on row goes `queued`/`rendering`), so this layer owns the
 * queues and the polling above the router and re-derives that state on load.
 */
export interface JobsContextValue {
  // ---- uploads ----
  upload: UploadState
  enqueueUploads: (files: File[]) => void
  /** Items the upload just created, so a mounted grid can show them at once. */
  addedItems: WardrobeItem[]
  consumeAddedItems: () => void
  /** The last upload-related error line, for a global surface. */
  uploadError: string | null

  // ---- processing (server-side "developing") ----
  processingCount: number
  /** Force a wardrobe poll now (e.g. after a page mutates items). */
  refreshProcessing: () => void

  // ---- renders ----
  activeRenders: TryOn[]
  trackRender: (t: TryOn) => void
  /** A render that just finished, for a page/tray to surface; then cleared. */
  readyRender: TryOn | null
  clearReadyRender: () => void
}

export const JobsContext = createContext<JobsContextValue | null>(null)
