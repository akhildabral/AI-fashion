// App-level jobs: the long-running work that must survive navigation. Uploads
// and renders both persist server-side (a wardrobe row goes `processing`, a
// try-on row goes `queued`/`rendering`), so this layer owns the queues and
// the polling above the router and re-derives that state on launch. Polling
// runs only while the app is in the foreground; a push brings the member
// back when a render finishes in the background.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { getTryOn, getTryOns } from '@zauq/shared/tryon'
import type { TryOn, WardrobeItem } from '@zauq/shared/types'
import { getWardrobe } from '@zauq/shared/wardrobe'
import * as haptics from '@/src/design/haptics'
import { apiUpload } from '@/src/lib/api'
import { qk, queryClient } from '@/src/lib/query'
import { imageForm, type PickedImage } from '@/src/lib/upload'
import { useAuth } from './AuthProvider'

const WORKERS = 3
const PROCESSING_POLL_MS = 3000
const RENDER_POLL_MS = 2500

export interface UploadState {
  active: boolean
  total: number
  done: number
  failed: number
}

export interface JobsValue {
  upload: UploadState
  enqueueUploads: (images: PickedImage[]) => void
  /** Items the upload just created, so a mounted grid can show them at once. */
  addedItems: WardrobeItem[]
  consumeAddedItems: () => void
  uploadError: string | null
  /** Garments still being catalogued ("developing"). */
  processingCount: number
  refreshProcessing: () => void
  activeRenders: TryOn[]
  trackRender: (t: TryOn) => void
  /** A render that just finished, for a screen or the tray to surface; then cleared. */
  readyRender: TryOn | null
  clearReadyRender: () => void
}

const JobsContext = createContext<JobsValue | null>(null)
const EMPTY_UPLOAD: UploadState = { active: false, total: 0, done: 0, failed: 0 }

interface AddResponse {
  item: WardrobeItem
  items?: WardrobeItem[]
}

function useForeground(): boolean {
  const [fg, setFg] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setFg(s === 'active'))
    return () => sub.remove()
  }, [])
  return fg
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const foreground = useForeground()

  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD)
  const [addedItems, setAddedItems] = useState<WardrobeItem[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const queue = useRef<PickedImage[]>([])
  const running = useRef(0)

  const [processingCount, setProcessingCount] = useState(0)
  const [activeRenders, setActiveRenders] = useState<TryOn[]>([])
  const [readyRender, setReadyRender] = useState<TryOn | null>(null)

  const runWorkers = useCallback(() => {
    const spawn = async () => {
      for (let image = queue.current.shift(); image; image = queue.current.shift()) {
        try {
          const res = await apiUpload<AddResponse>('/wardrobe', imageForm('image', image))
          const added = res.items ?? [res.item]
          setAddedItems((prev) => [...added, ...prev])
          setProcessingCount((n) => n + added.filter((i) => i.status === 'processing').length)
          setUpload((u) => ({ ...u, done: u.done + 1 }))
          void queryClient.invalidateQueries({ queryKey: qk.wardrobe })
        } catch (err) {
          setUpload((u) => ({ ...u, failed: u.failed + 1 }))
          setUploadError(err instanceof Error ? err.message : 'A piece didn’t upload.')
          haptics.failure()
        }
      }
      running.current -= 1
      if (running.current === 0) setUpload((u) => ({ ...u, active: false }))
    }
    while (running.current < WORKERS && queue.current.length > 0) {
      running.current += 1
      void spawn()
    }
  }, [])

  const enqueueUploads = useCallback(
    (images: PickedImage[]) => {
      if (images.length === 0) return
      setUploadError(null)
      queue.current.push(...images)
      setUpload((u) => ({
        active: true,
        total: u.active ? u.total + images.length : images.length,
        done: u.active ? u.done : 0,
        failed: u.active ? u.failed : 0,
      }))
      runWorkers()
    },
    [runWorkers],
  )

  const consumeAddedItems = useCallback(() => setAddedItems([]), [])

  const pollProcessing = useCallback(async () => {
    try {
      const { items } = await getWardrobe()
      const n = (items ?? []).filter((i) => i.status === 'processing').length
      setProcessingCount((prev) => {
        if (prev > 0 && n === 0) void queryClient.invalidateQueries({ queryKey: qk.wardrobe })
        return n
      })
    } catch {
      /* keep the last count */
    }
  }, [])

  const refreshProcessing = useCallback(() => {
    void pollProcessing()
  }, [pollProcessing])

  // Reconcile on sign-in and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!user) {
      setUpload(EMPTY_UPLOAD)
      setProcessingCount(0)
      setActiveRenders([])
      setReadyRender(null)
      queue.current = []
      return
    }
    if (!foreground) return
    void pollProcessing()
    getTryOns()
      .then(({ tryOns }) => {
        const live = (tryOns ?? []).filter((t) => t.status === 'queued' || t.status === 'rendering')
        setActiveRenders((prev) => {
          const ids = new Set(prev.map((p) => p.id))
          return [...prev, ...live.filter((t) => !ids.has(t.id))]
        })
      })
      .catch(() => undefined)
  }, [user, foreground, pollProcessing])

  useEffect(() => {
    if (!user || !foreground || processingCount === 0) return
    const id = setInterval(pollProcessing, PROCESSING_POLL_MS)
    return () => clearInterval(id)
  }, [user, foreground, processingCount, pollProcessing])

  const trackRender = useCallback((t: TryOn) => {
    if (t.status === 'ready') {
      setReadyRender(t)
      return
    }
    setActiveRenders((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]))
  }, [])

  const clearReadyRender = useCallback(() => setReadyRender(null), [])

  useEffect(() => {
    if (!user || !foreground || activeRenders.length === 0) return
    const id = setInterval(() => {
      activeRenders.forEach((job) => {
        getTryOn(job.id)
          .then(({ tryOn }) => {
            if (tryOn.status === 'ready') {
              setActiveRenders((prev) => prev.filter((x) => x.id !== job.id))
              setReadyRender(tryOn)
              haptics.success()
              void queryClient.invalidateQueries({ queryKey: qk.tryons })
            } else if (tryOn.status === 'failed') {
              setActiveRenders((prev) => prev.filter((x) => x.id !== job.id))
              haptics.failure()
              void queryClient.invalidateQueries({ queryKey: qk.tryons })
            }
          })
          .catch(() => undefined)
      })
    }, RENDER_POLL_MS)
    return () => clearInterval(id)
  }, [user, foreground, activeRenders])

  const value = useMemo<JobsValue>(
    () => ({
      upload,
      enqueueUploads,
      addedItems,
      consumeAddedItems,
      uploadError,
      processingCount,
      refreshProcessing,
      activeRenders,
      trackRender,
      readyRender,
      clearReadyRender,
    }),
    [upload, enqueueUploads, addedItems, consumeAddedItems, uploadError, processingCount, refreshProcessing, activeRenders, trackRender, readyRender, clearReadyRender],
  )

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useJobs(): JobsValue {
  const v = useContext(JobsContext)
  if (!v) throw new Error('useJobs outside JobsProvider')
  return v
}
