import { ArchMark, Wordmark } from './Brand'

/**
 * The first-paint splash. Shown full-screen while auth and the profile
 * resolve, so the app opens on the ZAUQ arch rather than two spinner flashes.
 * The arch breathes and a thin brass line sweeps beneath the wordmark.
 */
export function AppBoot() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-bone">
      <div className="animate-boot-breathe">
        <ArchMark variant="script" size={76} />
      </div>
      <Wordmark className="text-[15px] text-ink/75" />
      <div className="h-px w-24 overflow-hidden bg-ink/10" aria-hidden>
        <div className="animate-boot-sweep h-full w-1/3 bg-brass" />
      </div>
      <span className="sr-only" role="status">Loading ZAUQ</span>
    </div>
  )
}
