const KEY = 'ai-fashion-theme'

export function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

/** Apply saved (or system) theme — called once before first render. */
export function initTheme(): void {
  let dark: boolean
  try {
    const saved = localStorage.getItem(KEY)
    dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    dark = false
  }
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light')
  } catch {
    // Storage unavailable — theme just won't persist.
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }))
}

export function toggleTheme(): boolean {
  const next = !isDark()
  setTheme(next)
  return next
}
