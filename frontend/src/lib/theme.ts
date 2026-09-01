const KEY = 'ai-fashion-theme'
const CHROME = { light: '#FBFAF8', dark: '#141314' }

/** Point both theme-color metas at the active theme so the browser chrome
 *  follows the pull-cord, not just the OS preference. */
function syncChrome(dark: boolean): void {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = dark ? CHROME.dark : CHROME.light))
}

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
  syncChrome(dark)
}

export function setTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  syncChrome(dark)
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
