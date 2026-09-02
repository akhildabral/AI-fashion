import { useCallback, useEffect, useState } from 'react'
import { PageShell } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
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
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink/80">{label}</span>
        <span className={`tabular-nums ${full ? 'font-medium text-rose-600' : 'text-ink/60'}`}>
          {meter.used} / {meter.limit} {per}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-[3px] bg-ink/10">
        <div
          className={`h-full rounded-[3px] ${full ? 'bg-rose-500' : 'bg-iris'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function BillingPage() {
  usePageTitle('Subscription')
  const { user } = useAuth()
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
        theme: { color: '#D9481F' },
        handler: () => {
          setNotice(
            'Payment received! Your plan activates as soon as the payment is confirmed — refresh in a few seconds.',
          )
          void load()
        },
      }).open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
    } finally {
      setBusy(null)
    }
  }

  async function cancelPlan() {
    if (!window.confirm('Cancel your subscription? Your plan stays active until the period ends.'))
      return
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
      <div className="flex min-h-[50vh] items-center justify-center text-ink/60">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const onPaid = summary && (summary.plan === 'plus' || summary.plan === 'pro' || summary.plan === 'premium')
  const periodEnd = summary?.currentPeriodEnd
    ? new Date(summary.currentPeriodEnd).toLocaleDateString()
    : null

  return (
    <PageShell narrow>
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Plan &amp; usage</h1>

      {notice && (
        <p className="mt-4 rounded-[3px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>
      )}
      {error && (
        <p className="mt-4 alert-error !py-3">{error}</p>
      )}

      {summary && (
        <>
          <div className="mt-6 rounded-[3px] border border-ink/10 bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/50">Current plan</p>
                <p className="font-display text-2xl font-bold text-ink">{summary.label}</p>
                {summary.planStatus === 'grace' && (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    A payment failed — update your payment method or your plan will lapse.
                  </p>
                )}
                {summary.planStatus === 'cancelled' && periodEnd && (
                  <p className="mt-1 text-sm text-ink/60">Cancelled — active until {periodEnd}.</p>
                )}
                {summary.planStatus === 'active' && periodEnd && (
                  <p className="mt-1 text-sm text-ink/60">Renews {periodEnd}.</p>
                )}
                {summary.plan === 'founder' && (
                  <p className="mt-1 text-sm text-ink/60">
                    Founder access — Pro-level limits, on the house. Thank you for being early.
                  </p>
                )}
              </div>
              {onPaid && summary.planStatus !== 'cancelled' && (
                <button
                  type="button"
                  disabled={busy === 'cancel'}
                  onClick={() => void cancelPlan()}
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
              <h2 className="mt-10 font-display text-2xl font-bold text-ink">Upgrade</h2>
              {!summary.billingConfigured && (
                <p className="mt-2 rounded-[3px] bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Payments aren't switched on yet — plans will be purchasable soon.
                </p>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Only the tiers above the one you are on. */}
                {PLANS.filter((p) => PLANS.findIndex((x) => x.id === p.id) > PLANS.findIndex((x) => x.id === summary.plan)).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-[3px] border border-ink/10 bg-surface p-6"
                  >
                    <p className="font-display text-xl font-bold text-ink">{p.name}</p>
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
                      className="btn-dark mt-4 !px-4 !py-2 !text-sm"
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
    </PageShell>
  )
}
