import { useCallback, useEffect, useState } from 'react'
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
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
  suspended: 'bg-rose-100 text-rose-800',
}

export function AdminPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  async function setStatus(id: string, action: 'approve' | 'suspend') {
    setBusyId(id)
    try {
      await apiFetch(`/admin/users/${id}/${action}`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusyId(null)
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
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink">Accounts</h1>
          <p className="mt-1 text-sm text-ink/60">
            {users?.length ?? 0} accounts · {pending} waiting for approval
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-ghost">
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {users && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink/10 bg-white/60">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                  <td className="px-4 py-3 text-ink/70">{u.emailVerified ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {u.items} items · {u.wears} wears
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.status !== 'approved' && (
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => void setStatus(u.id, 'approve')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}
                    {u.status === 'approved' && u.role !== 'admin' && u.id !== me?.id && (
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => void setStatus(u.id, 'suspend')}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
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
