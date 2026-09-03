import { useEffect, useState } from 'react'
import { getWeek, shiftKey, todayKey, type WeekDay } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'

// The week, as a timeline rather than a calendar: seven days on one hairline,
// today underlined in brass. Past days carry a small mark when something was
// worn; future days a quiet word when they've been named. Nothing boxed.

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
    <div className="mt-6 animate-rise-1 border-b border-ink/10" role="tablist" aria-label="The week">
      <div className="grid grid-cols-7">
        {list.map((d) => {
          const dt = new Date(`${d.date}T12:00:00`)
          const wd = dt.toLocaleDateString(undefined, { weekday: 'short' })
          const n = dt.getDate()
          const on = d.date === selected
          const word = d.rest ? 'rest' : !d.past && !d.today && (d.planned || d.eventType) ? (d.occasion ?? (d.eventType ? EVENT_LABEL[d.eventType] ?? d.eventType : null)) : null
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={on}
              aria-current={d.today ? 'date' : undefined}
              onClick={() => onSelect(d.date)}
              className="press group relative flex flex-col items-center gap-1 pb-3 pt-1 text-center"
            >
              <span className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${d.today ? 'text-brass' : 'text-ink/35'}`}>{wd}</span>
              <span className={`font-display text-xl leading-none transition-colors ${d.rest ? 'text-ink/30' : d.today ? 'text-brass' : on ? 'text-ink' : 'text-ink/70 group-hover:text-ink'}`}>{n}</span>
              <span className="flex h-3.5 items-center justify-center gap-0.5">
                {d.past && d.worn && !d.rest &&
                  Array.from({ length: Math.min(Math.max(d.lookCount ?? 1, 1), 3) }).map((_, i) => (
                    <i key={i} className="block h-1 w-1 rounded-full bg-brass/70" aria-label="worn" />
                  ))}
                {word && <span className={`truncate font-display text-[11px] italic leading-none ${d.rest ? 'text-ink/35' : 'text-brass/80'}`}>{word}</span>}
              </span>
              {/* the rule: brass under today, ink under the day you're looking at */}
              <span aria-hidden className={`absolute inset-x-[18%] bottom-[-1px] h-[2px] transition-colors ${d.today ? 'bg-brass' : on ? 'bg-ink/50' : 'bg-transparent group-hover:bg-ink/20'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
