import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { Modal, PageShell } from '../components/ui'
import { useAuth } from '../context/useAuth'

interface AdminUser {
  id: string
  email: string
  handle: string | null
  role: string
  status: string
  emailVerified: boolean
  firstName: string | null
  lastName: string | null
  viaGoogle: boolean
  plan: string
  planStatus: string
  createdAt: string
  items: number
  wears: number
  aiCalls7d: number
  invitesLeft: number
  invited: number
  invitedBy: string | null
}

interface AdminReport {
  id: string
  targetType: string
  targetId: string
  target: string
  reason: string
  detail: string | null
  reporter: string
  createdAt: string
  resolvedAt: string | null
}

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam or ads',
  impersonation: 'Impersonation',
  harassment: 'Harassment',
  not_their_clothes: 'Not their clothes',
  other: 'Other',
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  waitlist: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  invited: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  suspended: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
}

const WAITING = ['waitlist', 'pending', 'invited']

function displayName(u: AdminUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ')
  return name || u.email
}

export function AdminPage() {
  usePageTitle('Admin')
  const { user: me } = useAuth()
  const [tab, setTab] = useState<'waitlist' | 'members' | 'reports'>('waitlist')
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string | null; viaGoogle?: boolean; emailed?: boolean } | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const loadReports = useCallback(async () => {
    try {
      const res = await apiFetch<{ reports: AdminReport[] }>('/admin/reports')
      setReports(res.reports)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    }
  }, [])
  useEffect(() => {
    void loadReports()
  }, [loadReports])

  async function resolveReport(id: string) {
    setBusyId(id)
    try {
      await apiFetch(`/admin/reports/${id}/resolve`, { method: 'POST' })
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve that')
    } finally {
      setBusyId(null)
    }
  }

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

  async function approveInvite(u: AdminUser) {
    setBusyId(u.id)
    setError(null)
    try {
      const res = await apiFetch<{ inviteUrl: string | null; viaGoogle: boolean; emailed?: boolean }>(
        `/admin/users/${u.id}/invite`,
        { method: 'POST' },
      )
      setInviteLink({ email: u.email, url: res.inviteUrl, viaGoogle: res.viaGoogle, emailed: res.emailed })
      setCopied(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invite')
    } finally {
      setBusyId(null)
    }
  }

  async function inviteSomeone(e: FormEvent) {
    e.preventDefault()
    setInviting(true)
    setError(null)
    try {
      const res = await apiFetch<{ inviteUrl: string; email: string; emailed?: boolean }>('/admin/invite', {
        method: 'POST',
        body: { email: inviteEmail.trim() },
      })
      setInviteLink({ email: res.email, url: res.inviteUrl, emailed: res.emailed })
      setCopied(false)
      setInviteEmail('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invite')
    } finally {
      setInviting(false)
    }
  }

  function handleResetPassword(u: AdminUser) {
    const password = window.prompt(`New password for ${u.email} (min 8 characters):`)
    if (!password) return
    void runAction(u.id, `/admin/users/${u.id}/reset-password`, { password }).then((ok) => {
      if (ok) setNotice(`Password updated for ${u.email}`)
    })
  }

  async function copyInvite() {
    if (!inviteLink?.url) return
    const text = inviteLink.url
    // Clipboard API needs a secure context + permission; fall back to the
    // legacy textarea trick, and to manual selection as a last resort.
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      return
    } catch {
      // fall through
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        setCopied(true)
        return
      }
    } catch {
      // fall through
    }
    setCopied(false)
    setNotice('Copy blocked by the browser — tap the link text to select it, then copy manually.')
  }

  function selectLinkText(e: React.MouseEvent<HTMLDivElement>) {
    const range = document.createRange()
    range.selectNodeContents(e.currentTarget)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  if (!users && !error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/60">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const waiting = (users ?? []).filter((u) => WAITING.includes(u.status))
  const members = (users ?? []).filter((u) => !WAITING.includes(u.status))

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="animate-rise font-display text-4xl font-extrabold tracking-tight text-ink">
            Admin
          </h1>
          <p className="mt-1 animate-rise-1 text-sm text-ink/55">
            {members.length} members · {waiting.length} waiting
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-ghost animate-rise-1">
          Refresh
        </button>
      </div>

      <div className="mt-6 flex animate-rise-1 gap-1 rounded-[3px] border border-ink/10 bg-surface p-1 sm:w-fit">
        {(
          [
            ['waitlist', `Waitlist · ${waiting.length}`],
            ['members', `Members · ${members.length}`],
            ['reports', `Reports · ${reports?.filter((r) => !r.resolvedAt).length ?? 0}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-[3px] px-5 py-2 text-sm font-medium transition-colors sm:flex-none ${
              tab === key ? 'bg-ink text-bone' : 'text-ink/55 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="mt-4 rounded-[3px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 alert-error">
          {error}
        </p>
      )}

      {tab === 'waitlist' && (
        <div className="mt-6">
          <form
            onSubmit={inviteSomeone}
            className="flex max-w-md items-center gap-2 rounded-[3px] border border-ink/10 bg-surface p-1.5 pl-4 focus-within:border-iris/60 focus-within:ring-2 focus-within:ring-iris/20"
          >
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite someone by email…"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink/35"
            />
            <button type="submit" disabled={inviting} className="btn-primary btn-sm">
              {inviting ? <Spinner className="h-4 w-4" /> : 'Invite'}
            </button>
          </form>

          {waiting.length === 0 ? (
            <p className="mt-8 rounded-[3px] border border-dashed border-ink/15 p-8 text-center text-sm text-ink/50">
              Nobody is waiting right now.
            </p>
          ) : (
            <div className="card mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-3 font-medium">Person</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((u) => (
                    <tr key={u.id} className="border-b border-ink/5 last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{displayName(u)}</div>
                        <div className="text-xs text-ink/50">
                          {u.email}
                          {u.viaGoogle && (
                            <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/60">
                              google
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-[3px] px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[u.status] ?? 'bg-ink/10 text-ink/70'}`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink/70">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void approveInvite(u)}
                          className="btn-primary btn-sm"
                        >
                          {busyId === u.id
                            ? 'Working…'
                            : u.status === 'invited'
                              ? 'New invite link'
                              : u.viaGoogle
                                ? 'Approve'
                                : 'Approve & invite'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'members' && users && (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {members.map((u) => (
                <tr key={u.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{displayName(u)}</div>
                    <div className="text-xs text-ink/50">
                      {u.email}
                      {u.handle ? ` · @${u.handle}` : ''}
                      {u.role === 'admin' && (
                        <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/70">
                          admin
                        </span>
                      )}
                      {u.viaGoogle && (
                        <span className="ml-1 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/60">
                          google
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-[3px] px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[u.status] ?? 'bg-ink/10 text-ink/70'}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      disabled={busyId === u.id}
                      onChange={(e) =>
                        void runAction(u.id, `/admin/users/${u.id}/plan`, { plan: e.target.value })
                      }
                      className="rounded-[3px] border border-ink/15 bg-surface px-2 py-1 text-xs text-ink"
                    >
                      {['free', 'plus', 'pro', 'premium', 'founder'].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {u.items} items · {u.wears} wears
                    <div className="text-xs text-ink/45">{u.aiCalls7d} AI calls / 7d</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink/45">
                      <span>
                        {u.role === 'admin' ? 'Invites: unlimited' : `Invites: ${u.invitesLeft} left`} · brought in {u.invited}
                        {u.invitedBy ? ` · came in via ${u.invitedBy}` : ''}
                      </span>
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void runAction(u.id, `/admin/users/${u.id}/invites`, { invitesLeft: u.invitesLeft + 5 })}
                          className="font-semibold text-brass hover:underline"
                        >
                          +5
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(u.role !== 'admin' || u.id === me?.id) && !u.viaGoogle && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => handleResetPassword(u)}
                          className="btn-ghost btn-sm"
                        >
                          Reset password
                        </button>
                      )}
                      {u.status === 'approved' && u.role !== 'admin' && u.id !== me?.id && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void runAction(u.id, `/admin/users/${u.id}/suspend`)}
                          className="btn-ghost !border-rose-200 btn-sm !text-rose-700 dark:!border-rose-900 dark:!text-rose-400"
                        >
                          Suspend
                        </button>
                      )}
                      {u.status === 'suspended' && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void runAction(u.id, `/admin/users/${u.id}/approve`)}
                          className="btn-primary btn-sm"
                        >
                          Reinstate
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

      {tab === 'reports' && (
        <div className="mt-6">
          {!reports && (
            <div className="flex justify-center py-10 text-ink/50">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {reports && reports.length === 0 && (
            <p className="rounded-[3px] border border-dashed border-ink/15 p-8 text-center text-sm text-ink/50">Nothing reported. Good.</p>
          )}
          {reports && reports.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-3 font-medium">About</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">From</th>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className={`border-b border-ink/5 last:border-b-0 ${r.resolvedAt ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">
                          {r.targetType === 'user' ? `@${r.target}` : `${r.targetType} ${r.target.slice(0, 8)}…`}
                        </div>
                        {r.detail && <div className="mt-0.5 max-w-md text-xs text-ink/55">{r.detail}</div>}
                      </td>
                      <td className="px-4 py-3 text-ink/70">{REASON_LABEL[r.reason] ?? r.reason}</td>
                      <td className="px-4 py-3 text-ink/70">{r.reporter}</td>
                      <td className="px-4 py-3 text-ink/70">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {r.resolvedAt ? (
                          <span className="text-xs text-ink/45">Resolved</span>
                        ) : (
                          <button type="button" disabled={busyId === r.id} onClick={() => void resolveReport(r.id)} className="btn-ghost btn-sm">
                            Resolve
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
      )}

      <Modal
        open={inviteLink !== null}
        onClose={() => setInviteLink(null)}
        title={inviteLink?.viaGoogle ? 'Approved' : 'Invite ready'}
      >
        {inviteLink && (
          <>
            {inviteLink.viaGoogle ? (
              <p className="text-sm text-ink/70">
                <span className="font-semibold text-ink">{inviteLink.email}</span> signed up with
                Google, so they're approved directly — they can sign in with Google right now.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink/70">
                  Invite for <span className="font-semibold text-ink">{inviteLink.email}</span> —{' '}
                  {inviteLink.emailed
                    ? 'an invite email is on its way (tell them to check spam). You can also copy the link. Valid 7 days.'
                    : 'the invite email could not be sent, so copy the link below and share it yourself. Valid 7 days.'}
                </p>
                <div
                  onClick={selectLinkText}
                  title="Click to select"
                  className="mt-4 cursor-text select-all break-all rounded-[3px] border border-ink/10 bg-bone p-3 font-mono text-xs text-ink/75"
                >
                  {inviteLink.url}
                </div>
                <button type="button" onClick={() => void copyInvite()} className="btn-primary mt-4 btn-sm">
                  {copied ? 'Copied' : 'Copy invite link'}
                </button>
              </>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  )
}
