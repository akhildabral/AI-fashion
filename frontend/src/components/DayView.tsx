import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBrief, getWeek, planDay, todayKey, type BriefResponse, type WeekDay } from '../lib/brief'
import { LookBoard } from './LookBoard'
import { ShareButton } from './ShareButton'
import { Spinner } from './Spinner'
import { EVENT_LABEL } from '../lib/outfits'

// A day that isn't today. Past: what you wore, the recap, share it. Future:
// name the day and the look is composed now; or rest it.

const DAY_CHIPS: { key: string; label: string; ask?: string }[] = [
  { key: 'work', label: 'Work' },
  { key: 'casual', label: 'Weekend' },
  { key: 'evening', label: 'Evening' },
  { key: 'occasion', label: 'Occasion' },
  { key: 'athletic', label: 'Training' },
]

function longDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function DayView({ date, laidOut = false, onChanged, onNote }: { date: string; /** Tomorrow, at night: compose without being asked. */ laidOut?: boolean; onChanged?: () => void; onNote?: (line: string) => void }) {
  const navigate = useNavigate()
  const today = todayKey()
  const past = date < today
  const [day, setDay] = useState<WeekDay | null>(null)
  const [brief, setBrief] = useState<BriefResponse | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [occasion, setOccasion] = useState('')
  const tomorrow = date === new Date(new Date(`${today}T12:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10)

  useEffect(() => {
    let alive = true
    setDay(null)
    setBrief(null)
    if (past) {
      getWeek(date)
        .then((r) => alive && setDay(r.days.find((d) => d.date === date) ?? null))
        .catch(() => alive && setDay(null))
    } else {
      getBrief({ date, peek: !laidOut })
        .then((r) => alive && setBrief(r))
        .catch(() => alive && setBrief({ mode: 'starter' }))
    }
    return () => {
      alive = false
    }
  }, [date, past, laidOut])

  async function plan(body: { eventType?: string; occasion?: string; rest?: boolean }) {
    setBusy(body.rest ? 'rest' : body.eventType ?? 'occasion')
    try {
      const r = await planDay({ date, ...body })
      setBrief(r)
      onChanged?.()
      onNote?.(body.rest ? 'A home day. No look, no push.' : `${longDay(date)} is planned.`)
    } catch (err) {
      onNote?.(err instanceof Error ? err.message : 'Could not plan that day.')
    } finally {
      setBusy(null)
    }
  }

  const eyebrow = past ? longDay(date) : tomorrow ? `Tomorrow · ${longDay(date)}` : longDay(date)

  // ---- past: the recap ----
  if (past) {
    return (
      <div className="animate-rise">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">{eyebrow}</p>
        {day === null && (
          <div className="mt-6 text-ink/45">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {day && !day.worn && (
          <>
            <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
              {day.rest ? 'A home day.' : 'Nothing logged.'}
            </h1>
            <p className="mt-3 font-display text-lg italic text-ink/55">{day.rest ? 'A rest. The streak stayed honest.' : 'The look for that day was never worn, or never logged.'}</p>
          </>
        )}
        {day && day.worn && (
          <>
            <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
              You wore <em className="text-brass">this.</em>
            </h1>
            {day.eventType && <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">{EVENT_LABEL[day.eventType] ?? day.eventType}</p>}
            <div className="mt-6 max-w-2xl">
              <LookBoard items={day.items} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {day.wearLogId && <ShareButton target={{ kind: 'look', id: day.wearLogId, title: 'What I wore', text: `What I wore on ${longDay(date)}.`, url: day.shared ? `${window.location.origin}/look/${day.wearLogId}` : undefined }} onDone={(l) => l && onNote?.(l)} className="btn-primary !text-sm" label="Share it" />}
              <button type="button" onClick={() => navigate(`/mirror?items=${day.itemIds.join(',')}`)} className="btn-ghost">
                See it on you
              </button>
              <button type="button" onClick={() => navigate(`/closet/compose?from=`)} className="press px-2 text-sm text-ink/45 hover:text-ink/70">
                Compose from it
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ---- future: plan the day ----
  const b = brief
  const rest = b?.mode === 'rest'
  const look = b?.mode === 'brief' ? b.brief : null
  const current = rest ? 'rest' : look?.eventType ?? null
  return (
    <div className="animate-rise">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">{eyebrow}</p>
      <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
        {laidOut && look ? (
          <>
            Laid <em className="text-brass">out.</em>
          </>
        ) : rest ? (
          <>
            A home <em className="text-brass">day.</em>
          </>
        ) : (
          <>
            What kind of <em className="text-brass">day?</em>
          </>
        )}
      </h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {DAY_CHIPS.map((c) => (
          <button key={c.key} type="button" disabled={busy !== null} onClick={() => void plan({ eventType: c.key })} className={`chip ${current === c.key && !look?.occasion ? 'chip-on' : ''}`}>
            {busy === c.key ? '…' : c.label}
          </button>
        ))}
        <button type="button" disabled={busy !== null} onClick={() => void plan({ rest: true })} className={`chip ${rest ? 'chip-on' : ''}`}>
          {busy === 'rest' ? '…' : 'Home day'}
        </button>
      </div>
      <form
        className="mt-3 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (occasion.trim()) void plan({ occasion: occasion.trim() })
        }}
      >
        <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field !py-2 !text-sm" placeholder="Or name it: a wedding, a first day, a long flight" />
        <button type="submit" disabled={busy !== null || !occasion.trim()} className="btn-ghost !px-4 !py-2 !text-xs disabled:opacity-50">
          Plan
        </button>
      </form>

      {b === null && (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink/50">
          <Spinner className="h-4 w-4" /> reading the day…
        </div>
      )}
      {rest && <p className="mt-5 font-display text-lg italic text-ink/55">No look, no push. The streak stays honest.</p>}
      {b?.mode === 'starter' && <p className="mt-5 font-display text-lg italic text-ink/55">The closet needs a few more clean pieces to plan this day.</p>}
      {b?.mode === 'unplanned' && <p className="mt-5 font-display text-lg italic text-ink/55">Nothing planned. Name the day and the look is composed now; the morning push will confirm it.</p>}
      {look && (
        <>
          <p className="mt-5 text-[15px] leading-relaxed text-ink/55">
            {look.weather && (
              <span className="font-semibold text-brass">
                {Math.round(look.weather.temperatureC)}° · {look.weather.description}
                {'  ·  '}
              </span>
            )}
            <span className="font-display italic text-ink/70">{look.rationale}</span>
          </p>
          {look.occasion && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">{look.occasion}</p>}
          <div className="mt-5 max-w-2xl">
            <LookBoard items={look.items} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy !== null} onClick={() => void plan({ eventType: look.eventType, occasion: look.occasion ?? undefined })} className="btn-ghost">
              Another
            </button>
            <button type="button" onClick={() => navigate(`/mirror?items=${look.itemIds.join(',')}`)} className="btn-ghost">
              See it on you
            </button>
          </div>
          {laidOut && <p className="mt-3 text-xs text-ink/45">The morning push will say it was laid out tonight.</p>}
        </>
      )}
    </div>
  )
}
