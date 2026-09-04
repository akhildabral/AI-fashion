import { useEffect, useState } from 'react'
import { SkeletonBlock } from './ui'
import { currentSubscription, disableRitual, enableRitual, getPushStatus, pushSupported, sendTestPush, updateEveningPush, updatePushHour, type PushStatus } from '../lib/push'

// The morning ritual: one switch and an hour. When it's on, this browser is
// woken with the day's look, composed from the closet, at the person's own
// morning.

const HOURS = [5, 6, 7, 8, 9, 10] as const

function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`
}

export function RitualSettings({ onNotice }: { onNotice: (msg: string) => void }) {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [thisDevice, setThisDevice] = useState<PushSubscription | null>(null)
  const [busy, setBusy] = useState(false)
  const [hour, setHour] = useState(7)
  const [evening, setEvening] = useState(false)
  const supported = pushSupported()

  useEffect(() => {
    void getPushStatus()
      .then((s) => {
        setStatus(s)
        setHour(s.hour)
        setEvening(Boolean(s.eveningPush))
      })
      .catch(() => setStatus({ enabled: false, devices: 0, hour: 7, timezone: null, endpoints: [] }))
    if (supported) void currentSubscription().then(setThisDevice).catch(() => setThisDevice(null))
  }, [supported])

  const onHere = Boolean(thisDevice && status?.endpoints.includes(thisDevice.endpoint))

  async function toggle() {
    setBusy(true)
    try {
      if (onHere) {
        await disableRitual()
        setThisDevice(null)
        onNotice('The ritual is off on this device.')
      } else {
        const sub = await enableRitual(hour)
        setThisDevice(sub)
        onNotice(`Set. Your look will be waiting at ${hourLabel(hour)}.`)
      }
      setStatus(await getPushStatus())
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Could not change that.')
    } finally {
      setBusy(false)
    }
  }

  async function changeHour(h: number) {
    setHour(h)
    if (!status || status.devices === 0) return
    try {
      await updatePushHour(h)
      onNotice(`Moved to ${hourLabel(h)}.`)
    } catch {
      onNotice('Could not change the hour.')
    }
  }

  async function toggleEvening() {
    const next = !evening
    setEvening(next)
    try {
      await updateEveningPush(next)
      onNotice(next ? 'Tomorrow will be laid out at 8pm, and you’ll hear about it.' : 'The evening nudge is off; tomorrow is still laid out quietly.')
    } catch {
      setEvening(!next)
      onNotice('Could not change that.')
    }
  }

  if (status === null) {
    return (
      <section className="plaque p-5 pl-6" aria-busy="true" aria-label="Loading the ritual">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="mt-3 h-7 w-3/4" />
        <SkeletonBlock className="mt-3 h-4 w-1/2 !bg-ink/[0.07]" />
      </section>
    )
  }

  // The system has no Switch: on/off is a value, so the control is a chip, brass when on.
  const toggleClass = (on: boolean) => `chip shrink-0 ${on ? 'chip-on' : ''}`

  return (
    <section className="plaque p-5 pl-6" aria-labelledby="ritual-h">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">The morning ritual</p>
          <h2 id="ritual-h" className="mt-2 font-display text-2xl font-medium text-ink">
            Your look, waiting when you wake.
          </h2>
          <p className="mt-2 max-w-md text-sm text-ink/60">
            {!supported
              ? 'This browser can’t receive notifications. On iPhone, add the app to your Home Screen first.'
              : !status.enabled
                ? 'Notifications aren’t switched on for this app yet.'
                : onHere
                  ? `On for this device at ${hourLabel(hour)}${status.timezone ? ` (${status.timezone.replace('_', ' ')})` : ''}.`
                  : status.devices > 0
                    ? `On for ${status.devices} other device${status.devices === 1 ? '' : 's'}. Turn it on here too?`
                    : 'One nudge a day, at your hour, with the outfit already composed.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={onHere}
          disabled={busy || !supported || !status.enabled}
          onClick={() => void toggle()}
          className={toggleClass(onHere)}
          aria-label={onHere ? 'Turn the morning ritual off on this device' : 'Turn the morning ritual on for this device'}
        >
          {busy ? '…' : onHere ? 'On here' : 'Turn on here'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Wake me at">
        <span className="mr-1 text-xs font-semibold uppercase tracking-label-lg text-ink/45">At</span>
        {HOURS.map((h) => (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={hour === h}
            onClick={() => void changeHour(h)}
            className={`chip ${hour === h ? 'chip-on' : ''}`}
          >
            {hourLabel(h)}
          </button>
        ))}
      </div>

      {onHere && thisDevice && (
        <button
          type="button"
          onClick={() => void sendTestPush(thisDevice.endpoint).then((r) => onNotice(r.sent ? 'Sent. Check your notifications.' : 'The test did not go through.')).catch(() => onNotice('The test did not go through.'))}
          className="btn-quiet btn-quiet-sm mt-4"
        >
          Send a test to this device
        </button>
      )}
      {/* Tomorrow, laid out tonight */}
      <div className="mt-8 flex items-start justify-between gap-4 border-t border-ink/10 pt-5">
        <div>
          <p className="eyebrow">The evening</p>
          <p className="mt-2 text-sm text-ink/70">Tomorrow is laid out at 8pm either way. Want a nudge when it is?</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={evening}
          disabled={!supported || !status.enabled || status.devices === 0}
          onClick={() => void toggleEvening()}
          className={toggleClass(evening)}
          aria-label="Nudge me when tomorrow is laid out"
        >
          {evening ? 'Nudge me' : 'Quietly'}
        </button>
      </div>
    </section>
  )
}
