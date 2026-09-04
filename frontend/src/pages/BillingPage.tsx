import { useCallback, useEffect, useState } from 'react'
import { PageShell, Modal, SkeletonBlock } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/useAuth'

interface Meter {
  used: number
  limit: number
}

interface BillingSummary {
  plan: string
  label: string
  lifetime: boolean
  usage: { looks: Meter; tryons: Meter; catalog: Meter; items: Meter }
  planStatus: string
  currentPeriodEnd: string | null
  billingConfigured: boolean
}

interface CheckoutSession {
  subscriptionId: string
  keyId: string
  plan: string
  email: string
}

const PLANS = [
  {
    id: 'plus',
    name: 'Plus',
    price: '₹199/mo',
    perks: ['100 wardrobe items', '30 looks / month', '30 try-ons / month'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹499/mo',
    perks: ['500 wardrobe items', '100 looks / month', '100 try-ons / month', 'Priority processing'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '₹999/mo',
    perks: ['2,000 wardrobe items', '300 looks / month', '300 try-ons / month', 'Priority processing'],
  },
] as const

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

async function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the payment window'))
    document.body.appendChild(script)
  })
}

function MeterBar({ label, meter, per }: { label: string; meter: Meter; per: string }) {
  const pct = meter.limit > 0 ? Math.min(100, Math.round((meter.used / meter.limit) * 100)) : 0
  const full = meter.used >= meter.limit
  const near = !full && pct >= 80
  const tone = full ? 'var(--c-danger)' : near ? 'var(--c-warning)' : null
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink/80">{label}</span>
        <span
          className="tabular-nums"
          style={tone ? { color: `rgb(${tone})`, fontWeight: 500 } : { color: 'rgb(var(--c-ink) / 0.6)' }}
        >
          {meter.used} / {meter.limit} {per}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-[3px] bg-ink/10">
        <div
          className="h-full rounded-[3px]"
          style={{ width: `${pct}%`, background: tone ? `rgb(${tone})` : 'rgb(var(--c-iris))' }}
        />
      </div>
      {near && (
        <p className="mt-1 text-xs" style={{ color: 'rgb(var(--c-warning))' }}>
          Almost out for this cycle.
        </p>
      )}
    </div>
  )
}

export function BillingPage() {
  usePageTitle('Plan & usage')
  const { user } = useAuth()
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const load = useCallback(async () => {
    try {
      setSummary(await apiFetch<BillingSummary>('/billing/summary'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing info')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function upgrade(plan: 'plus' | 'pro' | 'premium') {
    setBusy(plan)
    setError(null)
    try {
      const session = await apiFetch<CheckoutSession>('/billing/checkout', {
        method: 'POST',
        body: { plan },
      })
      await loadRazorpay()
      if (!window.Razorpay) throw new Error('Payment window unavailable')
      new window.Razorpay({
        key: session.keyId,
        subscription_id: session.subscriptionId,
        name: 'ZAUQ',
        description: `${PLANS.find((p) => p.id === plan)?.name ?? plan} subscription`,
        prefill: { email: session.email },
        theme: { color: '#B98C3B' },
        handler: () => {
          setNotice('Payment received. Activating your plan…')
          // The webhook confirms a beat after the handler fires — poll a few
          // times so the plan flips on its own; no manual refresh.
          void (async () => {
            for (let i = 0; i < 6; i++) {
              await new Promise((r) => setTimeout(r, 2500))
              try {
                const next = await apiFetch<BillingSummary>('/billing/summary')
                setSummary(next)
                if (next.plan === plan) {
                  setNotice('You’re on ' + (next.label ?? plan) + '. Enjoy.')
                  return
                }
              } catch {
                /* keep polling */
              }
            }
          })()
        },
      }).open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
    } finally {
      setBusy(null)
    }
  }

  async function cancelPlan() {
    setConfirmCancel(false)
    setBusy('cancel')
    try {
      const res = await apiFetch<{ message: string }>('/billing/cancel', { method: 'POST' })
      setNotice(res.message)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel')
    } finally {
      setBusy(null)
    }
  }

  if (!summary && !error) {
    return (
      <PageShell narrow>
        <SkeletonBlock className="h-12 w-64" />
        <div className="mt-6 rounded-[3px] border border-ink/10 bg-surface p-6" aria-busy="true" aria-label="Loading your plan">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-2 h-7 w-40" />
          <div className="mt-6 flex flex-col gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="mt-2 h-2 w-full" />
              </div>
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  const onPaid = summary && (summary.plan === 'plus' || summary.plan === 'pro' || summary.plan === 'premium')
  const periodEnd = summary?.currentPeriodEnd
    ? new Date(summary.currentPeriodEnd).toLocaleDateString()
    : null

  return (
    <PageShell narrow>
      <h1 className="font-display text-5xl font-medium leading-none text-ink sm:text-6xl">Plan &amp; usage</h1>

      {notice && (
        <p className="mt-4 rounded-[3px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>
      )}
      {error && (
        <div className="mt-4 alert-error !py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void load() }} className="btn-quiet btn-quiet-sm shrink-0">Try again</button>
        </div>
      )}

      {summary && (
        <>
          <div className="mt-6 rounded-[3px] border border-ink/10 bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-ink/50">Current plan</p>
                <p className="font-display text-2xl font-medium text-ink">{summary.label}</p>
                {summary.planStatus === 'grace' && (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    A payment failed. Update your payment method, or your plan will lapse.
                  </p>
                )}
                {summary.planStatus === 'cancelled' && periodEnd && (
                  <p className="mt-1 text-sm text-ink/60">Cancelled. Active until {periodEnd}.</p>
                )}
                {summary.planStatus === 'active' && periodEnd && (
                  <p className="mt-1 text-sm text-ink/60">Renews {periodEnd}.</p>
                )}
                {summary.plan === 'founder' && (
                  <p className="mt-1 text-sm text-ink/60">
                    Founder access. Pro-level limits, on the house. Thank you for being early.
                  </p>
                )}
              </div>
              {onPaid && summary.planStatus !== 'cancelled' && (
                <button
                  type="button"
                  disabled={busy === 'cancel'}
                  onClick={() => setConfirmCancel(true)}
                  className="btn-ghost btn-sm"
                >
                  Cancel subscription
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-4">
              <MeterBar
                label="Wardrobe items"
                meter={summary.usage.items}
                per=""
              />
              <MeterBar
                label="Generated looks"
                meter={summary.usage.looks}
                per={summary.lifetime ? 'free allowance' : 'this month'}
              />
              <MeterBar
                label="Virtual try-ons"
                meter={summary.usage.tryons}
                per={summary.lifetime ? 'free allowance' : 'this month'}
              />
            </div>
          </div>

          {user?.role !== 'admin' && summary.plan !== 'premium' && summary.plan !== 'founder' && (
            <>
              <h2 className="mt-10 font-display text-2xl font-medium text-ink">Upgrade</h2>
              {!summary.billingConfigured && (
                <p className="mt-2 rounded-[3px] bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Payments aren’t switched on yet. Plans will be purchasable soon.
                </p>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Only the tiers above the one you are on. */}
                {PLANS.filter((p) => PLANS.findIndex((x) => x.id === p.id) > PLANS.findIndex((x) => x.id === summary.plan)).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-[3px] border border-ink/10 bg-surface p-6"
                  >
                    <p className="font-display text-xl font-medium text-ink">{p.name}</p>
                    <p className="mt-1 text-2xl font-semibold text-ink">{p.price}</p>
                    <ul className="mt-3 flex-1 space-y-1 text-sm text-ink/70">
                      {p.perks.map((perk) => (
                        <li key={perk}>· {perk}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={!summary.billingConfigured || busy === p.id}
                      onClick={() => void upgrade(p.id)}
                      className="btn-dark btn-sm mt-4"
                    >
                      {busy === p.id ? 'Opening checkout…' : `Get ${p.name}`}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel subscription?">
        <p className="text-sm text-ink/70">
          Your plan stays active until {periodEnd ?? 'the period ends'}. You can come back any time.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-quiet" onClick={() => setConfirmCancel(false)}>
            Keep it
          </button>
          <button type="button" className="btn-danger" onClick={() => void cancelPlan()}>
            Cancel plan
          </button>
        </div>
      </Modal>
    </PageShell>
  )
}
