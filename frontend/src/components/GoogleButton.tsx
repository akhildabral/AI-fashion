import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/useAuth'
import type { User } from '@zauq/shared/types'
import { isDark } from '../lib/theme'

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
export function GoogleButton({
  onMessage,
  joinCode,
  redirectTo = '/',
}: {
  onMessage: (msg: string) => void
  /** Present on a /join/:code page: signing in with Google comes in on that invite. */
  joinCode?: string
  redirectTo?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const { adoptSession } = useAuth()
  const navigate = useNavigate()
  // Latest callbacks, without making the draw effect depend on their identity.
  const latest = useRef({ onMessage, adoptSession, navigate, redirectTo })
  latest.current = { onMessage, adoptSession, navigate, redirectTo }

  useEffect(() => {
    apiFetch<{ googleClientId: string | null }>('/auth/config', { auth: false })
      .then((c) => setClientId(c.googleClientId))
      .catch(() => setClientId(null))
  }, [])

  useEffect(() => {
    if (!clientId || !holder.current) return
    let cancelled = false
    let cleanup: (() => void) | null = null
    loadGsi()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: { credential: string }) => {
            apiFetch<{ token: string; user: User }>('/auth/google', {
              method: 'POST',
              body: { credential: resp.credential, ...(joinCode ? { joinCode } : {}) },
              auth: false,
            })
              .then((r) => {
                latest.current.adoptSession(r.token, r.user)
                latest.current.navigate(latest.current.redirectTo, { replace: true })
              })
              .catch((err) => {
                latest.current.onMessage(err instanceof Error ? err.message : 'Google sign-in failed.')
              })
          },
        })
        const el = holder.current
        const draw = () => {
          if (!window.google || !el.isConnected) return
          const w = Math.min(400, Math.max(200, Math.floor(el.getBoundingClientRect().width) || 360))
          el.innerHTML = ''
          window.google.accounts.id.renderButton(el, {
            theme: isDark() ? 'filled_black' : 'outline',
            size: 'large',
            shape: 'rectangular',
            text: 'continue_with',
            width: w,
          })
        }
        draw()
        // Google sizes the button once; keep it fitting the panel as the window changes.
        let last = el.getBoundingClientRect().width
        const ro = new ResizeObserver(() => {
          const w = el.getBoundingClientRect().width
          if (Math.abs(w - last) > 8) {
            last = w
            draw()
          }
        })
        ro.observe(el)
        cleanup = () => ro.disconnect()
      })
      .catch(() => latest.current.onMessage('Could not load Google sign-in.'))
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [clientId, joinCode])

  if (!clientId) return null
  return <div ref={holder} className="flex w-full justify-center overflow-hidden" />
}
