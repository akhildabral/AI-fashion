/** The only spinning thing in ZAUQ: a brass arc, inside a button. Size it
 *  with h-* w-* classes (16 default, 20 or 24 at most). */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
