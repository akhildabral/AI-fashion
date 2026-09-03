// Theme: dark-first like the web, following the system unless the member
// picks one in Settings. The choice persists under the web's key so the
// idea of "my theme" carries across.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { dark, light, type Palette } from './tokens'

export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'ai-fashion-theme'

interface ThemeValue {
  /** The palette in force. */
  t: Palette
  dark: boolean
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

export function ThemeProvider({ children, initialMode = 'dark' }: { children: ReactNode; initialMode?: ThemeMode }) {
  const system = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>(initialMode)

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved)
      })
      .catch(() => undefined)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    AsyncStorage.setItem(KEY, next).catch(() => undefined)
  }, [])

  // Dark is the house default: the atelier by night.
  const isDark = mode === 'system' ? system !== 'light' : mode === 'dark'
  const value = useMemo<ThemeValue>(() => ({ t: isDark ? dark : light, dark: isDark, mode, setMode }), [isDark, mode, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme outside ThemeProvider')
  return v
}

/**
 * Read the saved mode before the first render so the splash hands over
 * without a flash. Like the web, the house default is the atelier by night.
 */
export async function readSavedThemeMode(): Promise<ThemeMode> {
  try {
    const saved = await AsyncStorage.getItem(KEY)
    return saved === 'light' || saved === 'system' ? saved : 'dark'
  } catch {
    return 'dark'
  }
}
