const KEY = 'ai-fashion-theme'
const CHROME = { light: '#EBE5D7', dark: '#0E0D0B' }

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
  // Atelier is dark-first — new visitors meet the room at night, then can
  // pull the cord to the day-gallery. An explicit saved choice always wins.
  let dark: boolean
  try {
    const saved = localStorage.getItem(KEY)
    dark = saved ? saved === 'dark' : true
  } catch {
    dark = true
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
