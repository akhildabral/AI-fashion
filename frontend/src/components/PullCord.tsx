import { useEffect, useRef, useState } from 'react'
import { isDark, toggleTheme } from '../lib/theme'

/**
 * The app's light switch — a hanging cord you pull. Tugging it toggles the
 * theme; the cord answers with a tug-and-swing, and sways when brushed.
 */
export function PullCord() {
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

  return (
    <button
      type="button"
      onClick={pull}
      aria-label={dark ? 'Pull for light mode' : 'Pull for dark mode'}
      title={dark ? 'Lights on' : 'Lights off'}
      className={`group flex origin-top flex-col items-center ${swinging ? 'animate-cord-swing' : ''}`}
    >
      <span
        className="flex origin-top flex-col items-center"
        style={{
          transform: tugging ? 'translateY(7px)' : 'translateY(0)',
          transition: 'transform 170ms cubic-bezier(0.3, 0.9, 0.4, 1.3)',
        }}
      >
        {/* braided rope */}
        <span
          className="block h-8 w-[2px] rounded-b-sm opacity-60"
          style={{
            background:
              'repeating-linear-gradient(180deg, rgb(var(--c-spark)) 0px, rgb(var(--c-spark-deep)) 2.5px, rgb(var(--c-spark)) 5px)',
          }}
        />
        {/* handle in the brand primary */}
        <span className="mt-0.5 block h-5 w-2.5 rounded-full border border-iris-deep bg-iris transition-colors group-hover:bg-iris-deep" />
      </span>
    </button>
  )
}
