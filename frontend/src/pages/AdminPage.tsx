import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/useAuth'

interface AdminUser {
  id: string
  email: string
  handle: string | null
  role: string
  status: string
  emailVerified: boolean
  createdAt: string
  items: number
  wears: number
  aiCalls7d: number
  plan: string
  planStatus: string
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
  suspended: 'bg-rose-100 text-rose-800',
}

const actionBtn =
  'rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50'

export function AdminPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ users: AdminUser[] }>('/admin/users')
      setUsers(res.users)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function runAction(id: string, path: string, body?: unknown) {
    setBusyId(id)
    setError(null)
    try {
      await apiFetch(path, { method: 'POST', body })
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
      return false
    } finally {
      setBusyId(null)
    }
  }

  function handleResetPassword(u: AdminUser) {
    const password = window.prompt(
      `New password for ${u.email} (min 8 characters):`,
    )
    if (!password) return
    void runAction(u.id, `/admin/users/${u.id}/reset-password`, { password }).then(
      (ok) => {
        if (ok) setNotice(`Password updated for ${u.email}`)
      },
    )
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: { email: newEmail.trim(), password: newPassword },
      })
      setNotice(`Account created for ${newEmail.trim()} — verified and approved, ready to log in.`)
      setNewEmail('')
      setNewPassword('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  if (!users && !error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/60">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const pending = users?.filter((u) => u.status === 'pending').length ?? 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink">Accounts</h1>
          <p className="mt-1 text-sm text-ink/60">
            {users?.length ?? 0} accounts · {pending} waiting for approval
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bone transition hover:bg-ink/85"
          >
            {showCreate ? 'Cancel' : 'New user'}
          </button>
          <button type="button" onClick={() => void load()} className="btn-ghost">
            Refresh
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-ink/10 bg-white/60 p-4"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-ink/60">
            Email
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-64 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              placeholder="person@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink/60">
            Password
            <input
              type="text"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-56 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              placeholder="min 8 characters"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create — verified & approved'}
          </button>
          <p className="basis-full text-xs text-ink/50">
            Admin-created accounts skip email verification and the waitlist; share the
            password with the person yourself.
          </p>
        </form>
      )}

      {notice && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {users && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink/10 bg-white/60">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Verified</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{u.email}</div>
                    <div className="text-xs text-ink/50">
                      {u.handle ? `@${u.handle}` : '—'}
                      {u.role === 'admin' && (
                        <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/70">
                          admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[u.status] ?? 'bg-ink/10 text-ink/70'}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      disabled={busyId === u.id}
                      onChange={(e) =>
                        void runAction(u.id, `/admin/users/${u.id}/plan`, {
                          plan: e.target.value,
                        })
                      }
                      className="rounded-lg border border-ink/15 bg-surface px-2 py-1 text-xs text-ink"
                    >
                      {['free', 'plus', 'pro', 'founder'].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {u.planStatus !== 'none' && (
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-ink/45">
                        {u.planStatus}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{u.emailVerified ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {u.items} items · {u.wears} wears
                    <div className="text-xs text-ink/45">{u.aiCalls7d} AI calls / 7d</div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!u.emailVerified && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void runAction(u.id, `/admin/users/${u.id}/verify`)}
                          className={`${actionBtn} border border-ink/15 text-ink/70 hover:bg-ink/5`}
                        >
                          Verify
                        </button>
                      )}
                      {u.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void runAction(u.id, `/admin/users/${u.id}/approve`)}
                          className={`${actionBtn} bg-emerald-600 text-white hover:bg-emerald-700`}
                        >
                          Approve
                        </button>
                      )}
                      {(u.role !== 'admin' || u.id === me?.id) && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => handleResetPassword(u)}
                          className={`${actionBtn} border border-ink/15 text-ink/70 hover:bg-ink/5`}
                        >
                          Reset password
                        </button>
                      )}
                      {u.status === 'approved' && u.role !== 'admin' && u.id !== me?.id && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void runAction(u.id, `/admin/users/${u.id}/suspend`)}
                          className={`${actionBtn} border border-rose-200 text-rose-700 hover:bg-rose-50`}
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
