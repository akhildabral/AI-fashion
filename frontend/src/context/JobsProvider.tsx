import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { JobsContext, type UploadState } from './jobs-context'
import { useAuth } from './useAuth'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import { getTryOns, getTryOn } from '../lib/tryon'
import { pinFile } from '../lib/api'
import type { TryOn, WardrobeItem } from '../lib/types'

const MAX_BYTES = 12 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const WORKERS = 3
const PROCESSING_POLL_MS = 3000
const RENDER_POLL_MS = 2500

const EMPTY_UPLOAD: UploadState = { active: false, total: 0, done: 0, failed: 0 }

export function JobsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  // ---- uploads ----
  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD)
  const [addedItems, setAddedItems] = useState<WardrobeItem[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const queue = useRef<File[]>([])
  const running = useRef(0)

  // ---- processing + renders ----
  const [processingCount, setProcessingCount] = useState(0)
  const [activeRenders, setActiveRenders] = useState<TryOn[]>([])
  const [readyRender, setReadyRender] = useState<TryOn | null>(null)

  const runWorkers = useCallback(() => {
    const spawn = async () => {
      for (let file = queue.current.shift(); file; file = queue.current.shift()) {
        try {
          const res = await addWardrobeItem(file)
          const added = res.items ?? [res.item]
          setAddedItems((prev) => [...added, ...prev])
          setProcessingCount((n) => n + added.filter((i) => i.status === 'processing').length)
          setUpload((u) => ({ ...u, done: u.done + 1 }))
        } catch (err) {
          setUpload((u) => ({ ...u, failed: u.failed + 1 }))
          setUploadError(err instanceof Error ? err.message : 'A piece didn’t upload.')
        }
      }
      running.current -= 1
      // The whole batch is finished when the last worker drains the queue.
      if (running.current === 0) {
        setUpload((u) => ({ ...u, active: false }))
      }
    }
    while (running.current < WORKERS && queue.current.length > 0) {
      running.current += 1
      void spawn()
    }
  }, [])

  const enqueueUploads = useCallback(
    (files: File[]) => {
      void (async () => {
        // Pin each file into memory now: a phone can drop the picker's handle
        // before a queued upload reaches it.
        const pinned = (await Promise.all(files.map((f) => pinFile(f).catch(() => null)))).filter(
          (f): f is File => f !== null,
        )
        const valid = pinned.filter(
          (f) => (ACCEPTED.includes(f.type) || /\.hei[cf]$/i.test(f.name)) && f.size <= MAX_BYTES,
        )
        if (valid.length === 0) {
          setUploadError('Use JPG, PNG, WebP or HEIC photos up to 12MB.')
          return
        }
        setUploadError(null)
        queue.current.push(...valid)
        setUpload((u) => ({
          active: true,
          total: u.active ? u.total + valid.length : valid.length,
          done: u.active ? u.done : 0,
          failed: u.active ? u.failed : 0,
        }))
        runWorkers()
      })()
    },
    [runWorkers],
  )

  const consumeAddedItems = useCallback(() => setAddedItems([]), [])

  // ---- global processing poll: reload-safe, route-independent ----
  const pollProcessing = useCallback(async () => {
    try {
      const { items } = await getWardrobe()
      setProcessingCount((items ?? []).filter((i) => i.status === 'processing').length)
    } catch {
      /* keep last count */
    }
  }, [])

  const refreshProcessing = useCallback(() => {
    void pollProcessing()
  }, [pollProcessing])

  // Reconcile once on sign-in (catches work started before this session/tab).
  useEffect(() => {
    if (!user) {
      setUpload(EMPTY_UPLOAD)
      setProcessingCount(0)
      setActiveRenders([])
      setReadyRender(null)
      queue.current = []
      return
    }
    void pollProcessing()
    getTryOns()
      .then(({ tryOns }) => {
        const live = (tryOns ?? []).filter((t) => t.status === 'queued' || t.status === 'rendering')
        if (live.length) setActiveRenders(live)
      })
      .catch(() => undefined)
  }, [user, pollProcessing])

  // Poll while anything is developing.
  useEffect(() => {
    if (!user || processingCount === 0) return
    const id = window.setInterval(pollProcessing, PROCESSING_POLL_MS)
    return () => window.clearInterval(id)
  }, [user, processingCount, pollProcessing])

  // ---- renders ----
  const trackRender = useCallback((t: TryOn) => {
    if (t.status === 'ready') {
      setReadyRender(t)
      return
    }
    setActiveRenders((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]))
  }, [])

  const clearReadyRender = useCallback(() => setReadyRender(null), [])

  useEffect(() => {
    if (!user || activeRenders.length === 0) return
    const id = window.setInterval(() => {
      activeRenders.forEach((job) => {
        getTryOn(job.id)
          .then(({ tryOn }) => {
            if (tryOn.status === 'ready') {
              setActiveRenders((prev) => prev.filter((x) => x.id !== job.id))
              setReadyRender(tryOn)
            } else if (tryOn.status === 'failed') {
              setActiveRenders((prev) => prev.filter((x) => x.id !== job.id))
            }
          })
          .catch(() => undefined)
      })
    }, RENDER_POLL_MS)
    return () => window.clearInterval(id)
  }, [user, activeRenders])

  return (
    <JobsContext.Provider
      value={{
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
      }}
    >
      {children}
    </JobsContext.Provider>
  )
}
