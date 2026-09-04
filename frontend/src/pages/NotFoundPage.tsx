import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { PageShell } from '../components/ui'

/** Dead links get an explanation instead of a silent teleport to Today. */
export function NotFoundPage() {
  usePageTitle('Not found')
  return (
    <PageShell narrow>
      {/* The head pair, then one italic line and the single way forward. */}
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="animate-rise eyebrow">Not found</p>
        <h1 className="page-title mt-2 animate-rise-1">
          This page <em className="text-accent-text">doesn’t exist.</em>
        </h1>
        <p className="mt-3 max-w-md animate-rise-2 font-display text-xl italic text-ink/55">The link may be old, mistyped, or something we’ve since moved.</p>
        <Link to="/" className="btn-primary mt-8 animate-rise-3">
          Back to Today
        </Link>
      </div>
    </PageShell>
  )
}
