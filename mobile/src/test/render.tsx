// Render a primitive the way the app does: inside the theme. Testing
// Library 14 renders asynchronously, so await it (and every fireEvent).
import { render, type RenderOptions } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { ThemeProvider, type ThemeMode } from '@/src/design/theme'

export function renderWithTheme(ui: ReactElement, opts: RenderOptions & { mode?: ThemeMode } = {}) {
  const { mode = 'dark', ...rest } = opts
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
  )
  return render(ui, { wrapper, ...rest })
}
