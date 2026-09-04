import { temp } from '@zauq/shared/units'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBrief, getWeek, planDay, todayKey, type BriefResponse, type WeekDay } from '@zauq/shared/brief'
import { LookBoard } from './LookBoard'
import { LookAct, AddLook } from './LookAct'
import { ShareButton } from './ShareButton'
import { Spinner } from './Spinner'
import { resolveImageUrl } from '../lib/api'
import { EVENT_LABEL } from '@zauq/shared/outfits'

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
  const [pastLoading, setPastLoading] = useState(false)
  const [pastFailed, setPastFailed] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [occasion, setOccasion] = useState('')
  const tomorrow = date === new Date(new Date(`${today}T12:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10)

  useEffect(() => {
    let alive = true
    setDay(null)
    setBrief(null)
    if (past) {
      setPastLoading(true)
      setPastFailed(false)
      getWeek(date)
        .then((r) => {
          if (!alive) return
          setDay(r.days.find((d) => d.date === date) ?? null)
          setPastLoading(false)
        })
        .catch(() => {
          if (!alive) return
          setPastFailed(true)
          setPastLoading(false)
        })
    } else {
      getBrief({ date, peek: !laidOut })
        .then((r) => alive && setBrief(r))
        .catch(() => alive && setBrief({ mode: 'starter' }))
    }
    return () => {
      alive = false
    }
  }, [date, past, laidOut, nonce])

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
      <div className="animate-rise lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 xl:gap-16">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">{eyebrow}</p>
        {pastLoading && (
          <div className="mt-6 text-ink/45">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {!pastLoading && pastFailed && (
          <div className="mt-6">
            <p className="text-sm text-ink/60">Couldn’t load that day.</p>
            <button type="button" onClick={() => setNonce((n) => n + 1)} className="btn-ghost btn-sm mt-3">Try again</button>
          </div>
        )}
        {!pastLoading && !pastFailed && !day && (
          <>
            <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">Nothing on record.</h1>
            <p className="mt-3 font-display text-lg italic text-ink/55">No look was worn or logged that day.</p>
          </>
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
            <div className="mt-6 max-w-3xl">
              <LookBoard items={day.items} />
            </div>
            <div className="action-row mt-5">
              {day.wearLogId && <ShareButton target={{ kind: 'look', id: day.wearLogId, title: 'What I wore', text: `What I wore on ${longDay(date)}.`, url: day.shared ? `${window.location.origin}/look/${day.wearLogId}` : undefined }} onDone={(l) => l && onNote?.(l)} className="btn-primary !text-sm" label="Share it" />}
              <button type="button" onClick={() => navigate(`/mirror?items=${day.itemIds.join(',')}`)} className="btn-ghost">
                See it on you
              </button>
              <button type="button" onClick={() => navigate('/closet/compose')} className="btn-quiet">
                Compose from it
              </button>
            </div>
          </>
        )}
      </div>
      {/* The rail: that day's facts */}
      {day && day.worn && (
        <aside className="mt-8 lg:mt-0 lg:self-start">
          <div className="plaque p-5 pl-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">That day</p>
            <ul className="mt-3 divide-y divide-ink/10">
              {day.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2">
                  <div className="arch-bezel w-10 flex-none aspect-[5/6]">
                    <div className="arch-niche flex h-full w-full items-center justify-center">
                      <img src={resolveImageUrl(it.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                    </div>
                  </div>
                  <span className="text-sm capitalize text-ink/80">{it.subtype ?? it.category}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink/50">
              {day.eventType ? `${EVENT_LABEL[day.eventType] ?? day.eventType} · ` : ''}
              {day.shared ? 'shared to your circle' : 'kept to yourself'}
              {day.photoUrl ? ' · with a photo' : ''}
            </p>
          </div>
        </aside>
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
    <div className="animate-rise lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 xl:gap-16">
    <div className="min-w-0">
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
        <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field field-sm" placeholder="Or name it: a wedding, a first day, a long flight" />
        <button type="submit" disabled={busy !== null || !occasion.trim()} className="btn-ghost btn-sm">
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
                {temp(look.weather.temperatureC)} · {look.weather.description}
                {'  ·  '}
              </span>
            )}
            <span className="font-display italic text-ink/70">{look.rationale}</span>
          </p>
          {look.occasion && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">{look.occasion}</p>}
          <div className="mt-5 max-w-3xl">
            <LookBoard items={look.items} />
          </div>
          <div className="action-row mt-5">
            <button type="button" onClick={() => navigate(`/mirror?items=${look.itemIds.join(',')}`)} className="btn-ghost">
              See it on you
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void plan({ eventType: look.eventType, occasion: look.occasion ?? undefined })} className="btn-quiet">
              Another
            </button>
          </div>
          {laidOut && <p className="mt-3 text-xs text-ink/45">The morning push will say it was laid out tonight.</p>}
        </>
      )}
      {/* Plan the rest of the day — more looks for later, or a wedding's rituals. */}
      {look && (b?.looks ?? []).slice(1).map((l) => (
        <LookAct key={l.id} look={l} date={date} planning onReload={() => setNonce((n) => n + 1)} onNote={onNote ?? (() => {})} />
      ))}
      {look && <AddLook date={date} onReload={() => setNonce((n) => n + 1)} onNote={onNote ?? (() => {})} />}
    </div>
    {/* The rail: the forecast and the pieces */}
    {look && (
      <aside className="mt-8 lg:mt-0 lg:self-start">
        <div className="plaque p-5 pl-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">{longDay(date)}</p>
          {look.weather ? (
            <p className="mt-1 font-display text-3xl font-semibold text-brass [font-variant-numeric:tabular-nums]">
              {temp(look.weather.temperatureC)} <span className="font-sans text-xs font-semibold normal-case text-ink/55">{look.weather.description}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink/55">Add your city in the fitting for the forecast.</p>
          )}
          <ul className="mt-3 divide-y divide-ink/10 border-t border-ink/10">
            {look.items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <div className="arch-bezel w-10 flex-none aspect-[5/6]">
                  <div className="arch-niche flex h-full w-full items-center justify-center">
                    <img src={resolveImageUrl(it.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                  </div>
                </div>
                <span className="text-sm capitalize text-ink/80">{it.subtype ?? it.category}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    )}
    </div>
  )
}
