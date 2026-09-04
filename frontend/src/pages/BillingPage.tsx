import { useCallback, useEffect, useState } from 'react'
import { Alert, PageShell, PageHead, Modal, SectionHead, SkeletonBlock, LoadError } from '../components/ui'
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

/** A meter: the figure tabular, the bar flat brass, the warning as coloured text on its own wash. */
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
          className="[font-variant-numeric:tabular-nums]"
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
      {near && <Alert tone="warning" className="mt-2">Almost out for this cycle.</Alert>}
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
      setError(err instanceof Error ? err.message : 'Couldn’t load your plan. Check your connection and try again.')
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
        <div aria-busy="true" aria-label="Loading your plan">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-64" />
          <div className="card mt-8 p-5">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-2 h-7 w-40" />
            <div className="mt-6 flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <SkeletonBlock className="h-4 w-full !bg-ink/[0.07]" />
                  <SkeletonBlock className="mt-2 h-2 w-full" />
                </div>
              ))}
            </div>
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
      <PageHead
        eyebrow="Membership"
        title={
          <>
            Plan &amp; <em className="text-accent-text">usage.</em>
          </>
        }
      />

      {notice && <Alert tone="success" className="mt-8">{notice}</Alert>}
      {error && !summary && <LoadError message={error} onRetry={() => { setError(null); void load() }} />}
      {error && summary && (
        <div className="alert-error mt-8 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void load() }} className="btn-quiet btn-quiet-sm shrink-0">Try again</button>
        </div>
      )}

      {summary && (
        <>
          <div className="card mt-8 animate-rise-2 p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <p className="eyebrow">Current plan</p>
                <p className="mt-2 font-display text-2xl font-medium text-ink">{summary.label}</p>
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
            {/* The alert sits directly above the thing it concerns: the plan's meters. */}
            {summary.planStatus === 'grace' && (
              <Alert tone="warning" className="mt-4">A payment failed. Update your payment method, or your plan will lapse.</Alert>
            )}

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
            <section className="mt-10 animate-rise-3">
              <SectionHead title="Upgrade" />
              {!summary.billingConfigured && (
                <Alert tone="warning" className="mb-4">Payments aren’t switched on yet. Plans will be purchasable soon.</Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Only the tiers above the one you are on. Ghost, not brass: three cards make one row, and a row holds at most one primary. */}
                {PLANS.filter((p) => PLANS.findIndex((x) => x.id === p.id) > PLANS.findIndex((x) => x.id === summary.plan)).map((p) => (
                  <div key={p.id} className="card flex flex-col p-5">
                    <p className="font-display text-2xl font-medium text-ink">{p.name}</p>
                    <p className="mt-1 font-display text-xl text-ink [font-variant-numeric:tabular-nums]">{p.price}</p>
                    <ul className="mt-3 flex-1 space-y-1 text-sm text-ink/70">
                      {p.perks.map((perk) => (
                        <li key={perk}>· {perk}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={!summary.billingConfigured || busy === p.id}
                      onClick={() => void upgrade(p.id)}
                      className="btn-ghost btn-sm mt-4"
                    >
                      {busy === p.id ? 'Opening checkout…' : `Get ${p.name}`}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel subscription?">
        <p className="text-sm text-ink/70">
          Your plan stays active until {periodEnd ?? 'the period ends'}. You can come back any time.
        </p>
        <div className="action-row mt-6">
          <button type="button" className="btn-danger" onClick={() => void cancelPlan()}>
            Cancel plan
          </button>
          <button type="button" className="btn-quiet" onClick={() => setConfirmCancel(false)}>
            Keep it
          </button>
        </div>
      </Modal>
    </PageShell>
  )
}
