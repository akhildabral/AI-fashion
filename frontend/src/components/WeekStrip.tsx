import { useEffect, useState } from 'react'
import { getWeek, shiftKey, todayKey, type WeekDay } from '../lib/brief'
import { EVENT_LABEL } from '../lib/outfits'

// The week strip: seven days, today in brass. Past days show what you wore,
// future days what you told it. Tap a day to see it, name it, or rest it.

export function WeekStrip({ selected, onSelect, refreshKey = 0 }: { selected: string; onSelect: (date: string) => void; refreshKey?: number }) {
  const [days, setDays] = useState<WeekDay[] | null>(null)
  const today = todayKey()
  const from = shiftKey(today, -2)

  useEffect(() => {
    let alive = true
    getWeek(from)
      .then((r) => alive && setDays(r.days))
      .catch(() => alive && setDays([]))
    return () => {
      alive = false
    }
  }, [from, refreshKey])

  const list: WeekDay[] =
    days && days.length
      ? days
      : Array.from({ length: 7 }, (_, i) => {
          const date = shiftKey(from, i)
          return { date, past: date < today, today: date === today, rest: false, eventType: null, occasion: null, planned: false, worn: false, wearLogId: null, shared: false, photoUrl: null, itemIds: [], items: [] }
        })

  return (
    <div className="mt-5 grid animate-rise-1 grid-cols-7 gap-1.5" role="tablist" aria-label="The week">
      {list.map((d) => {
        const dt = new Date(`${d.date}T12:00:00`)
        const wd = dt.toLocaleDateString(undefined, { weekday: 'short' })
        const n = dt.getDate()
        const on = d.date === selected
        let mark: string | null = null
        if (d.rest) mark = 'rest'
        else if (d.past) mark = d.worn ? 'worn' : null
        else if (d.today) mark = null
        else if (d.planned || d.eventType) mark = d.occasion ?? (d.eventType ? EVENT_LABEL[d.eventType] ?? d.eventType : null)
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            aria-current={d.today ? 'date' : undefined}
            onClick={() => onSelect(d.date)}
            className={`press rounded-[3px] border px-1 py-2 text-center transition-colors ${on ? 'border-brass bg-iris-soft' : d.today ? 'border-brass/50' : 'border-ink/12 hover:border-brass/60'}`}
          >
            <span className={`block text-[9px] font-bold uppercase tracking-[0.14em] ${d.today ? 'text-brass' : 'text-ink/45'}`}>{wd}</span>
            <span className={`mt-0.5 block font-display text-lg leading-none ${d.rest ? 'text-ink/35' : 'text-ink'}`}>{n}</span>
            <span className="mt-1 flex h-4 items-center justify-center gap-0.5">
              {d.past && d.worn && !d.rest && d.items.slice(0, 3).map((it) => <i key={it.id} className="block h-1.5 w-1.5 bg-ink/40" />)}
              {d.today && !d.rest && (
                <>
                  <i className="block h-1.5 w-1.5 bg-brass" />
                  <i className="block h-1.5 w-1.5 bg-brass" />
                  <i className="block h-1.5 w-1.5 bg-brass" />
                </>
              )}
              {mark && (!d.past || d.rest) && <span className="truncate text-[8px] font-bold uppercase tracking-[0.08em] text-ink/45">{mark}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
