import { money } from '@zauq/shared/money'
import type { ReactNode } from 'react'
import type { VerdictPlaqueLine, VerdictV2 } from '@zauq/shared/types'
import { Plaque } from './ui'
import { toneClass } from '../lib/fitting-room'

// Verdict v2's plaques — your closet, the money, your build, your taste —
// as the Fitting Room engraves them. The store page and the compare page
// render the same four from the same verdict, so the wording lives here once.

/** One plaque's lines, each in its tone: a flag in the danger token, good in brass, a note quiet. */
export function Lines({ lines, className = '' }: { lines: VerdictPlaqueLine[] | undefined; className?: string }) {
  const list = (lines ?? []).filter((l) => l && l.line)
  if (list.length === 0) return null
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {list.map((l, i) => (
        <li key={i} className={`text-sm leading-relaxed ${toneClass(l.tone)}`}>
          {l.line}
        </li>
      ))}
    </ul>
  )
}

export function eventLabel(e: string): string {
  switch (e) {
    case 'work':
      return 'Work'
    case 'casual':
      return 'Weekends'
    case 'evening':
      return 'Evenings'
    case 'occasion':
      return 'Occasions'
    case 'athletic':
      return 'Training'
    default:
      return e.charAt(0).toUpperCase() + e.slice(1)
  }
}

export type PlaqueKey = 'closet' | 'money' | 'build' | 'taste'

/** Which closet facts the stylist's own lines already state, so nothing is said twice. */
function closetSaid(v2: VerdictV2) {
  const text = (v2.closet.lines ?? []).map((l) => l.line.toLowerCase()).join(' ')
  return {
    pairs: text.includes(`pairs with ${v2.closet.pairs}`) || text.includes(`goes with ${v2.closet.pairs}`),
    closest: v2.closet.closest ? text.includes(v2.closet.closest.label.toLowerCase()) || text.includes('closest') : false,
    unlock: v2.closet.unlock ? text.includes(v2.closet.unlock.slot.toLowerCase().replace(/s$/, '')) || text.includes('unlock') || text.includes('take it to') : false,
  }
}

export function VerdictPlaques({
  v2,
  priceLine,
  priceDate,
  showEmpty = false,
  labelFor,
  className = '',
}: {
  v2: VerdictV2
  /** The price as shown, already formatted; null when the shop did not say. */
  priceLine: string | null
  /** "as of 12 Sep" — a price never travels without its date. */
  priceDate: string | null
  /** Render the build and taste plaques even when they have nothing to say (two columns stay aligned). */
  showEmpty?: boolean
  /** Decorate a plaque's label — the compare page marks the side with the edge. */
  labelFor?: (key: PlaqueKey, label: string) => ReactNode
  className?: string
}) {
  const said = closetSaid(v2)
  const label = (key: PlaqueKey, text: string) => (labelFor ? labelFor(key, text) : text)
  const hasBuild = Boolean(v2.build && (v2.build.lines?.length || v2.build.flags?.length))
  const hasTaste = Boolean(v2.taste && v2.taste.lines?.length)
  return (
    <div className={`grid gap-4 ${className}`}>
      {/* Your closet: pairs, the closest thing you own, what it unlocks */}
      <Plaque label={label('closet', 'Your closet')}>
        {/* The stylist's lines carry the facts; the composed sentences only
            stand in when a line is missing, so nothing is said twice. */}
        {said.pairs ? null : (
          <p className="mt-1 text-sm text-ink">
            Pairs with <b>{v2.closet.pairs} of your {v2.closet.closetSize}</b> pieces.
          </p>
        )}
        {v2.closet.closest && !said.closest && (
          <p className="mt-1 text-sm text-ink">
            Closest thing you own: the {v2.closet.closest.label}
            {v2.closet.closest.wears > 0 ? `, worn ${v2.closet.closest.wears}×` : ', never worn'}.{' '}
            <span className={v2.closet.duplicate ? toneClass('flag') : 'text-ink/55'}>{v2.closet.duplicate ? 'Close to a duplicate.' : 'Not a duplicate.'}</span>
          </p>
        )}
        {v2.closet.unlock && !said.unlock && (
          <p className="mt-1 text-sm text-ink/60">
            A {[v2.closet.unlock.colour, v2.closet.unlock.formality, v2.closet.unlock.slot].filter(Boolean).join(' ')} alongside it would unlock {v2.closet.unlock.gain} more.
          </p>
        )}
        <Lines lines={v2.closet.lines} className="mt-1" />
      </Plaque>

      {/* The money */}
      <Plaque label={label('money', 'The money')} value={priceLine ?? undefined} note={priceLine ? priceDate ?? undefined : undefined}>
        {!priceLine && <p className="mt-1 font-display text-lg italic text-ink/55">The shop didn’t say what it costs.</p>}
        <p className="mt-2 text-sm text-ink/60">
          {v2.money.budget === 'within' ? 'Inside how you shop.' : v2.money.budget === 'above' ? 'A step above how you usually shop.' : v2.money.budget === 'far' ? 'Well above how you usually shop.' : ''}
          {v2.money.costPerWear != null && (
            <>
              {' '}
              About <b className="text-ink [font-variant-numeric:tabular-nums]">{money(v2.money.costPerWear, { currency: v2.money.currency ?? undefined, digits: v2.money.costPerWear < 10 ? 1 : 0 })} a wear</b>
              {v2.money.projectedWearsPerYear != null ? `, on ${v2.money.projectedWearsPerYear} wears a year.` : '.'}
            </>
          )}
        </p>
        <Lines lines={v2.money.lines} className="mt-2" />
      </Plaque>

      {/* Your build */}
      {hasBuild || showEmpty ? (
        <Plaque label={label('build', 'Your build')}>
          {hasBuild ? (
            <>
              <Lines lines={v2.build!.lines} className="mt-1" />
              {v2.build!.flags?.length ? <p className="mt-2 text-xs text-ink/45">{v2.build!.flags.join(' · ')}</p> : null}
            </>
          ) : (
            <p className="mt-1 font-display text-lg italic text-ink/55">Nothing to say about the cut yet.</p>
          )}
        </Plaque>
      ) : null}

      {/* Your taste */}
      {hasTaste || showEmpty ? (
        <Plaque label={label('taste', 'Your taste')}>
          {hasTaste ? <Lines lines={v2.taste!.lines} className="mt-1" /> : <p className="mt-1 font-display text-lg italic text-ink/55">Too few wears to read your taste yet.</p>}
        </Plaque>
      ) : null}
    </div>
  )
}
