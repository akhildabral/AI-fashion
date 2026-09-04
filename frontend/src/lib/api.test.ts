// The web session client: one refresh per burst of 401s, a spent or refused
// refresh ends the session the way a sign-out does, and a session issued
// before refresh tokens existed still behaves as it always did.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Browser globals the client reads at import time and on every request.
const { storage, session } = vi.hoisted(() => {
  const mem = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    }
  }
  const storage = mem()
  const session = mem()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', session)
  return { storage, session }
})

import { ApiError, apiFetch, getRefreshToken, getToken, onAuthExpired, refreshSession, sessionExpiredPending, signOut } from './api'

const TOKEN_KEY = 'ai-fashion-token'
const REFRESH_KEY = 'ai-fashion-refresh'

type Call = { url: string; init: RequestInit }
let calls: Call[]

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * A backend where only the access token `fresh` is valid, and the refresh
 * token `r1` exchanges (once, after a tick) for `fresh` + `r2`.
 */
function installBackend({ refreshStatus = 200 }: { refreshStatus?: number } = {}) {
  let spent = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization
      if (url.endsWith('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 5))
        const { refreshToken } = JSON.parse(String(init.body)) as { refreshToken: string }
        if (refreshStatus !== 200 || spent || refreshToken !== 'r1') return json(401, { error: 'This session has ended' })
        spent = true
        return json(200, { token: 'fresh', refreshToken: 'r2' })
      }
      if (url.endsWith('/auth/logout')) return auth === 'Bearer fresh' ? new Response(null, { status: 204 }) : json(401, { error: 'Invalid token' })
      if (url.endsWith('/auth/me')) return auth === 'Bearer fresh' ? json(200, { user: { id: 'u1' } }) : json(401, { error: 'Invalid token' })
      return json(404, { error: 'no such route' })
    }),
  )
}

const refreshCalls = () => calls.filter((c) => c.url.endsWith('/auth/refresh')).length

beforeEach(() => {
  calls = []
  storage.clear()
  session.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', session)
})

describe('refresh on 401', () => {
  it('renews once for a burst of concurrent 401s and retries each request', async () => {
    installBackend()
    storage.setItem(TOKEN_KEY, 'stale')
    storage.setItem(REFRESH_KEY, 'r1')

    const results = await Promise.all([apiFetch('/auth/me'), apiFetch('/auth/me'), apiFetch('/auth/me')])

    expect(results).toEqual([{ user: { id: 'u1' } }, { user: { id: 'u1' } }, { user: { id: 'u1' } }])
    expect(refreshCalls()).toBe(1)
    expect(getToken()).toBe('fresh')
    expect(getRefreshToken()).toBe('r2')
    expect(sessionExpiredPending()).toBe(false)
  })

  it('ends the session like a sign-out when the refresh is refused', async () => {
    installBackend({ refreshStatus: 401 })
    storage.setItem(TOKEN_KEY, 'stale')
    storage.setItem(REFRESH_KEY, 'r1')
    const expired = vi.fn()
    const off = onAuthExpired(expired)

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 })

    off()
    expect(refreshCalls()).toBe(1)
    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
    expect(sessionExpiredPending()).toBe(true)
  })

  it('leaves a pre-refresh session (access token only) on the old sign-out path', async () => {
    installBackend()
    storage.setItem(TOKEN_KEY, 'stale')
    const expired = vi.fn()
    const off = onAuthExpired(expired)

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError)

    off()
    expect(refreshCalls()).toBe(0)
    expect(getToken()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
    expect(sessionExpiredPending()).toBe(true)
  })

  it('does not send a request that carried no token through the refresh', async () => {
    installBackend()
    storage.setItem(REFRESH_KEY, 'r1')

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 })

    expect(refreshCalls()).toBe(0)
  })
})

describe('refreshSession across tabs', () => {
  it('treats a token rotated by another tab while waiting for the lock as renewed', async () => {
    installBackend()
    storage.setItem(TOKEN_KEY, 'stale')
    storage.setItem(REFRESH_KEY, 'r1')
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, cb: () => Promise<boolean>) => {
          // Another tab finished its exchange before we got the lock.
          storage.setItem(TOKEN_KEY, 'fresh')
          storage.setItem(REFRESH_KEY, 'r2')
          return cb()
        },
      },
    })

    await expect(refreshSession()).resolves.toBe(true)

    expect(refreshCalls()).toBe(0)
    expect(getToken()).toBe('fresh')
  })

  it('treats a refusal as renewed when the stored token changed underneath the exchange', async () => {
    installBackend()
    storage.setItem(TOKEN_KEY, 'stale')
    storage.setItem(REFRESH_KEY, 'r1')
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, cb: () => Promise<boolean>) => {
          const done = cb()
          // Racing tab (no lock support there) spends r1 first and stores the new pair.
          storage.setItem(TOKEN_KEY, 'fresh')
          storage.setItem(REFRESH_KEY, 'r2')
          await new Promise((r) => setTimeout(r, 1))
          return done
        },
      },
    })
    // The exchange itself is refused (r1 was spent by the other tab).
    const real = fetch
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        calls.push({ url, init })
        await new Promise((r) => setTimeout(r, 5))
        return json(401, { error: 'spent' })
      }
      return real(url, init)
    })

    await expect(refreshSession()).resolves.toBe(true)

    expect(refreshCalls()).toBe(1)
    expect(getRefreshToken()).toBe('r2')
  })

  it('resolves false with nothing to present', async () => {
    installBackend()
    await expect(refreshSession()).resolves.toBe(false)
    expect(refreshCalls()).toBe(0)
  })
})

describe('signOut', () => {
  it("revokes this browser's session, then clears both tokens and the expired flag", async () => {
    installBackend()
    storage.setItem(TOKEN_KEY, 'fresh')
    storage.setItem(REFRESH_KEY, 'r2')
    session.setItem('auth-expired', '1')

    await signOut()

    const logout = calls.find((c) => c.url.endsWith('/auth/logout'))
    expect(logout).toBeDefined()
    expect(JSON.parse(String(logout!.init.body))).toEqual({ refreshToken: 'r2' })
    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(sessionExpiredPending()).toBe(false)
  })

  it('renews an expired access token on the way out and revokes the rotated session too', async () => {
    installBackend()
    storage.setItem(TOKEN_KEY, 'stale')
    storage.setItem(REFRESH_KEY, 'r1')

    await signOut()

    // The first attempt went out with the stale token and was retried after
    // the renewal; only the calls the server accepted matter.
    const accepted = calls
      .filter((c) => c.url.endsWith('/auth/logout') && (c.init.headers as Record<string, string>).Authorization === 'Bearer fresh')
      .map((c) => JSON.parse(String(c.init.body)))
    expect(accepted).toEqual([{ refreshToken: 'r1' }, { refreshToken: 'r2' }])
    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('still clears locally when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network')
    })
    storage.setItem(TOKEN_KEY, 'fresh')
    storage.setItem(REFRESH_KEY, 'r2')

    await signOut()

    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})
