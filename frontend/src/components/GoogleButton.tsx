import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/useAuth'
import type { User } from '../lib/types'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void
          renderButton: (el: HTMLElement, options: object) => void
        }
      }
    }
  }
}

let gsiLoading: Promise<void> | null = null
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Could not load Google sign-in'))
      document.head.appendChild(s)
    })
  }
  return gsiLoading
}

/**
 * "Continue with Google". Renders nothing until the server reports a
 * configured client id. SSO never bypasses invite-only — unknown accounts
 * land on the waitlist and see that message here.
 */
export function GoogleButton({ onMessage }: { onMessage: (msg: string) => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const { adoptSession } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch<{ googleClientId: string | null }>('/auth/config', { auth: false })
      .then((c) => setClientId(c.googleClientId))
      .catch(() => setClientId(null))
  }, [])

  useEffect(() => {
    if (!clientId || !holder.current) return
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: { credential: string }) => {
            apiFetch<{ token: string; user: User }>('/auth/google', {
              method: 'POST',
              body: { credential: resp.credential },
              auth: false,
            })
              .then((r) => {
                adoptSession(r.token, r.user)
                navigate('/', { replace: true })
              })
              .catch((err) => {
                onMessage(err instanceof Error ? err.message : 'Google sign-in failed.')
              })
          },
        })
        window.google.accounts.id.renderButton(holder.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 320,
        })
      })
      .catch(() => onMessage('Could not load Google sign-in.'))
    return () => {
      cancelled = true
    }
  }, [clientId, adoptSession, navigate, onMessage])

  if (!clientId) return null
  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={holder} />
      <p className="text-xs text-ink/40">or use your email below</p>
    </div>
  )
}
