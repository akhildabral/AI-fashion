// Every change on the profile saves itself, a moment after the last tap or
// keystroke, exactly as the web's ProfilePage: the context updates at once,
// the request follows after `delay`, and the server's copy replaces the
// optimistic one when it lands.
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveFitting, type FittingPatch } from '@zauq/shared/fitting'
import type { StyleProfile } from '@zauq/shared/types'
import { useFlash } from '@/src/components/Toast'
import { useProfile } from '@/src/context/ProfileProvider'
import { qk, queryClient } from '@/src/lib/query'

export function useProfileSave() {
  const { profile, setProfile } = useProfile()
  const flash = useFlash()
  const latest = useRef<StyleProfile | null>(profile)
  latest.current = profile
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [whisper, setWhisper] = useState('')

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout)
      if (whisperTimer.current) clearTimeout(whisperTimer.current)
    },
    [],
  )

  const save = useCallback(
    (patch: FittingPatch, key = 'profile', delay = 400) => {
      const merged = { ...(latest.current as StyleProfile), ...(patch as Partial<StyleProfile>) } as StyleProfile
      latest.current = merged
      setProfile(merged)
      if (timers.current[key]) clearTimeout(timers.current[key])
      timers.current[key] = setTimeout(() => {
        delete timers.current[key]
        saveFitting(patch)
          .then(({ profile: saved }) => {
            latest.current = saved
            setProfile(saved)
            queryClient.setQueryData(qk.profile, { profile: saved })
            setWhisper('Saved.')
            if (whisperTimer.current) clearTimeout(whisperTimer.current)
            whisperTimer.current = setTimeout(() => setWhisper(''), 1600)
          })
          .catch((err) => flash(err instanceof Error ? err.message : 'Could not save that.'))
      }, delay)
    },
    [setProfile, flash],
  )

  return { profile, save, whisper }
}
