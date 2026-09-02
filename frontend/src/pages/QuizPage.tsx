import { useEffect, useState } from 'react'
import { PageShell } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getQuiz, submitQuiz } from '../lib/quiz'
import { useProfile } from '../context/useProfile'
import type { QuizPair } from '../lib/types'
import { Spinner } from '../components/Spinner'

/**
 * The cold-start taste quiz: a fast visual this-or-that. One tap per pair,
 * ~60 seconds total; the answers seed the stylist before any wear history
 * exists. Feels like a personality quiz, not setup.
 */
export function QuizPage() {
  usePageTitle('Style quiz')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromWelcome = searchParams.get('from') === 'welcome'
  const { setProfile } = useProfile()
  const [pairs, setPairs] = useState<QuizPair[] | null>(null)
  const [index, setIndex] = useState(0)
  const [choices, setChoices] = useState<Record<string, 'left' | 'right'>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getQuiz()
      .then(({ pairs: p }) => {
        if (!cancelled) setPairs(p ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the quiz.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function choose(side: 'left' | 'right') {
    if (!pairs || saving) return
    const next = { ...choices, [pairs[index].id]: side }
    setChoices(next)

    if (index < pairs.length - 1) {
      setIndex(index + 1)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { profile } = await submitQuiz(next)
      setProfile(profile)
      navigate(fromWelcome ? '/welcome?step=3' : '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answers.')
      setSaving(false)
    }
  }

  const pair = pairs?.[index]

  return (
    <PageShell narrow>
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-brass">
          {fromWelcome ? 'step 2 of 3 · Style quiz' : 'Style quiz'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          {pair ? pair.question : 'Finding your taste'}
        </h1>
        <p className="mt-2 text-sm text-ink/55">
          Tap the one you'd rather wear. No wrong answers.
        </p>
      </div>

      {!pairs && !error && (
        <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}

      {pair && !saving && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={`${pair.id}-${side}`}
                type="button"
                onClick={() => choose(side)}
                className="group overflow-hidden rounded-[3px] border border-ink/10 bg-surface text-left  transition hover:border-iris/60"
              >
                <div className="aspect-square overflow-hidden bg-bone">
                  <img
                    src={pair[side].imageUrl}
                    alt={pair[side].label}
                    className="h-full w-full object-cover transition duration-200"
                  />
                </div>
                <p className="px-4 py-3 text-center text-sm font-medium text-ink/80">
                  {pair[side].label}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-2">
            {pairs!.map((p, i) => (
              <span
                key={p.id}
                className={
                  i === index
                    ? 'h-2 w-6 rounded-[3px] bg-ink'
                    : i < index
                      ? 'h-2 w-2 rounded-[3px] bg-iris'
                      : 'h-2 w-2 rounded-[3px] bg-ink/15'
                }
              />
            ))}
          </div>
        </>
      )}

      {saving && (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-ink/60">
          <Spinner className="h-6 w-6" />
          <p className="text-sm">Tuning your stylist…</p>
        </div>
      )}
    </PageShell>
  )
}
