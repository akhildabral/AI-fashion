import React from 'react'

/** The tailor's tape: a range input drawn as a brass thread. Used in the fitting. */
export function Tape({ min = 0, max = 100, step = 1, value, onChange, label, className = '', style }) {
  const pct = ((Number(value) - min) / (max - min)) * 100
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      aria-label={label}
      className={`zq-tape ${className}`}
      style={{ '--p': `${pct}%`, ...style }}
    />
  )
}
