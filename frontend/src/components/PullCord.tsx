import { useEffect, useRef, useState } from 'react'
import { isDark, toggleTheme } from '../lib/theme'

/**
 * The app's light switch — a hanging cord you pull. Tugging it toggles the
 * theme; the cord answers with a tug-and-swing, and sways when brushed.
 */
export function PullCord({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const [dark, setDark] = useState(() => isDark())
  const [tugging, setTugging] = useState(false)
  const [swinging, setSwinging] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const onChange = () => setDark(isDark())
    window.addEventListener('themechange', onChange)
    return () => {
      window.removeEventListener('themechange', onChange)
      timers.current.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  function pull() {
    if (tugging) return
    setTugging(true)
    setSwinging(false)
    timers.current.push(
      window.setTimeout(() => {
        setDark(toggleTheme())
        setTugging(false)
        setSwinging(true)
      }, 170),
      window.setTimeout(() => setSwinging(false), 1400),
    )
  }

  const line = size === 'md' ? 'h-16' : 'h-9'
  const handle = size === 'md' ? 'h-7 w-3.5' : 'h-5 w-2.5'

  return (
    <button
      type="button"
      onClick={pull}
      aria-label={dark ? 'Pull for light mode' : 'Pull for dark mode'}
      title={dark ? 'Lights on' : 'Lights off'}
      className={`group flex origin-top flex-col items-center ${swinging ? 'animate-cord-swing' : ''}`}
    >
      <span
        className="flex origin-top flex-col items-center transition-transform duration-200 ease-out group-hover:rotate-3"
        style={{
          transform: tugging ? 'translateY(9px)' : 'translateY(0)',
          transition: 'transform 170ms cubic-bezier(0.3, 0.9, 0.4, 1.3)',
        }}
      >
        <span className={`block w-px ${line} bg-gradient-to-b from-ink/10 via-ink/35 to-ink/55`} />
        <span
          className={`mt-0.5 block ${handle} rounded-full border border-ink/30 bg-surface transition-colors group-hover:border-iris group-hover:bg-iris-soft`}
        />
      </span>
    </button>
  )
}
