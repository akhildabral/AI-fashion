import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'

/** Dead links get an explanation instead of a silent teleport to Today. */
export function NotFoundPage() {
  usePageTitle('Not found')
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-display text-6xl font-medium text-ink/15">404</p>
      <h1 className="mt-3 font-display text-2xl font-medium text-ink">
        This page doesn't exist
      </h1>
      <p className="mt-2 font-display text-sm italic text-ink/55">
        the link may be old, mistyped, or something we've since moved
      </p>
      <Link to="/" className="btn-primary mt-6">
        Back to Today
      </Link>
    </div>
  )
}
