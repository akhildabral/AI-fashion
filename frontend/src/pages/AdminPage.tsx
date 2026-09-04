import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { Alert, Badge, EmptyState, Modal, PageHead, PageShell, Tabs, SkeletonBlock, LoadError } from '../components/ui'
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

/** A one-word state is a Badge: brass for "in", a quiet ink wash for waiting; suspended takes danger text on its own wash. */
function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge>{status}</Badge>
  if (status === 'suspended') return <Badge tone="quiet" className="!bg-[rgb(var(--c-danger)/0.1)] !text-[rgb(var(--c-danger))]">{status}</Badge>
  return <Badge tone="quiet">{status}</Badge>
}

/** A quiet tag beside a name: "google", "admin". */
function Tag({ children }: { children: string }) {
  return (
    <Badge tone="quiet" className="ml-2 !text-[10px] uppercase tracking-label-xs">
      {children}
    </Badge>
  )
}

const TH = 'px-4 py-3 text-[11px] font-semibold uppercase tracking-label-xs text-ink/45'

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
      setError(err instanceof Error ? err.message : 'Couldn’t load the members. Check your connection and try again.')
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
      setError(err instanceof Error ? err.message : 'Couldn’t load the reports. Check your connection and try again.')
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
      setError(err instanceof Error ? err.message : 'That didn’t go through. Try again.')
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
    setNotice('Copy blocked by the browser. Tap the link text to select it, then copy manually.')
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
      <PageShell>
        <div aria-busy="true" aria-label="Loading the house">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-3 h-9 w-40" />
          <SkeletonBlock className="mt-3 h-4 w-48 !bg-ink/[0.07]" />
          <div className="card mt-8 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className={`h-10 w-full ${i ? 'mt-3' : ''}`} />
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  if (!users && error) {
    return (
      <PageShell>
        <LoadError message={error} onRetry={() => { setError(null); void load() }} />
      </PageShell>
    )
  }

  const waiting = (users ?? []).filter((u) => WAITING.includes(u.status))
  const members = (users ?? []).filter((u) => !WAITING.includes(u.status))

  return (
    <PageShell>
      <PageHead
        eyebrow="The house"
        title="Admin"
        line={
          <span className="[font-variant-numeric:tabular-nums]">
            {members.length} members · {waiting.length} waiting
          </span>
        }
        aside={
          <button type="button" onClick={() => void load()} className="btn-ghost">
            Refresh
          </button>
        }
      />

      {/* Three views of the same house: tabs, with the brass rule under the one you are in. */}
      <Tabs
        className="mt-8 animate-rise-1"
        label="Admin"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'waitlist', label: 'Waitlist', count: waiting.length },
          { key: 'members', label: 'Members', count: members.length },
          { key: 'reports', label: 'Reports', count: reports?.filter((r) => !r.resolvedAt).length ?? 0 },
        ]}
      />

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert className="mt-4">{error}</Alert>}

      {tab === 'waitlist' && (
        <div className="mt-8">
          <form onSubmit={inviteSomeone} className="flex max-w-md items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="admin-invite-email" className="label">
                Invite someone by email
              </label>
              <input
                id="admin-invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="them@example.com"
                className="field"
              />
            </div>
            <button type="submit" disabled={inviting} className="btn-primary shrink-0">
              {inviting ? <Spinner className="h-4 w-4" /> : 'Invite'}
            </button>
          </form>

          {waiting.length === 0 ? (
            <EmptyState className="mt-8" line="Nobody is waiting right now." />
          ) : (
            <div className="card mt-8 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className={TH}>Person</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Joined</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((u) => (
                    <tr key={u.id} className="border-b border-ink/5 last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{displayName(u)}</div>
                        <div className="text-xs text-ink/50">
                          {u.email}
                          {u.viaGoogle && <Tag>google</Tag>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3 text-ink/70 [font-variant-numeric:tabular-nums]">
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
        <div className="card mt-8 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10">
                <th className={TH}>Member</th>
                <th className={TH}>Status</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Activity</th>
                <th className={TH} />
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
                      {u.role === 'admin' && <Tag>admin</Tag>}
                      {u.viaGoogle && <Tag>google</Tag>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      disabled={busyId === u.id}
                      onChange={(e) =>
                        void runAction(u.id, `/admin/users/${u.id}/plan`, { plan: e.target.value })
                      }
                      aria-label={`Plan for ${displayName(u)}`}
                      className="field field-sm !w-auto"
                    >
                      {['free', 'plus', 'pro', 'premium', 'founder'].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-ink/70 [font-variant-numeric:tabular-nums]">
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
                          className="press font-semibold text-accent-text hover:underline disabled:opacity-50"
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
                          className="btn-danger btn-sm"
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
        <div className="mt-8">
          {!reports && !error && (
            <div className="card p-4" aria-busy="true" aria-label="Loading reports">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonBlock key={i} className={`h-10 w-full ${i ? 'mt-3' : ''}`} />
              ))}
            </div>
          )}
          {!reports && error && <LoadError className="!min-h-0 py-10" message="Couldn’t load the reports. Check your connection and try again." onRetry={() => { setError(null); void loadReports() }} />}
          {reports && reports.length === 0 && <EmptyState line="Nothing reported. Good." />}
          {reports && reports.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className={TH}>About</th>
                    <th className={TH}>Reason</th>
                    <th className={TH}>From</th>
                    <th className={TH}>When</th>
                    <th className={TH} />
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
                      <td className="px-4 py-3 text-ink/70 [font-variant-numeric:tabular-nums]">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {r.resolvedAt ? (
                          <Badge tone="quiet">Resolved</Badge>
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
                Google, so they’re approved directly. They can sign in with Google right now.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink/70">
                  Invite for <span className="font-semibold text-ink">{inviteLink.email}</span>:{' '}
                  {inviteLink.emailed
                    ? 'an invite email is on its way (tell them to check spam). You can also copy the link. Valid 7 days.'
                    : 'the invite email couldn’t be sent, so copy the link below and share it yourself. Valid 7 days.'}
                </p>
                <div
                  onClick={selectLinkText}
                  title="Click to select"
                  className="mt-4 cursor-text select-all break-all rounded-[3px] border border-ink/10 bg-bone p-3 text-xs text-ink/75"
                >
                  {inviteLink.url}
                </div>
                <button type="button" onClick={() => void copyInvite()} className="btn-primary mt-4">
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
