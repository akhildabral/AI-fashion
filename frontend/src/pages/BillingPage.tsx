import { useCallback, useEffect, useState } from 'react'
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
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full ${full ? 'bg-rose-500' : 'bg-clay'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function BillingPage() {
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

  async function upgrade(plan: 'plus' | 'pro') {
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
        name: 'AI Fashion',
        description: `${plan === 'plus' ? 'Plus' : 'Pro'} subscription`,
        prefill: { email: session.email },
        theme: { color: '#B0704F' },
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

  const onPaid = summary && (summary.plan === 'plus' || summary.plan === 'pro')
  const periodEnd = summary?.currentPeriodEnd
    ? new Date(summary.currentPeriodEnd).toLocaleDateString()
    : null

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl font-semibold text-ink">Plan &amp; usage</h1>

      {notice && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {summary && (
        <>
          <div className="mt-6 rounded-xl border border-ink/10 bg-white/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/50">Current plan</p>
                <p className="font-serif text-2xl font-semibold text-ink">{summary.label}</p>
                {summary.planStatus === 'grace' && (
                  <p className="mt-1 text-sm text-amber-700">
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
                  className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/70 transition hover:bg-ink/5 disabled:opacity-50"
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

          {user?.role !== 'admin' && summary.plan !== 'pro' && summary.plan !== 'founder' && (
            <>
              <h2 className="mt-10 font-serif text-2xl font-semibold text-ink">Upgrade</h2>
              {!summary.billingConfigured && (
                <p className="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Payments aren't switched on yet — plans will be purchasable soon.
                </p>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {PLANS.filter((p) => p.id !== summary.plan).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-xl border border-ink/10 bg-white/60 p-6"
                  >
                    <p className="font-serif text-xl font-semibold text-ink">{p.name}</p>
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
                      className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bone transition hover:bg-ink/85 disabled:opacity-40"
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
    </div>
  )
}
