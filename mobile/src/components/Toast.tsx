import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { T } from './Text'

interface FlashValue {
  flash: (message: string) => void
}

const FlashContext = createContext<FlashValue | null>(null)

const SHOW_MS = 4000

/**
 * The app-wide transient notice: one line at the bottom, above the tab bar,
 * gone after four seconds. Errors that need action use inline copy instead.
 */
export function ToastProvider({ children, bottomOffset = 0 }: { children: ReactNode; bottomOffset?: number }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { t } = useTheme()
  const insets = useSafeAreaInsets()

  const flash = useCallback((m: string) => {
    setMessage(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), SHOW_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const value = useMemo(() => ({ flash }), [flash])

  return (
    <FlashContext.Provider value={value}>
      {children}
      {message ? (
        <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + bottomOffset + 16 }]}>
          <Animated.View
            entering={rise()}
            exiting={fadeOut}
            accessibilityLiveRegion="polite"
            style={[styles.toast, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.3), borderRadius: radius }]}
          >
            <T role="bodySm" align="center" style={{ fontFamily: fonts.sansMedium }}>
              {message}
            </T>
          </Animated.View>
        </View>
      ) : null}
    </FlashContext.Provider>
  )
}

export function useFlash(): (message: string) => void {
  const v = useContext(FlashContext)
  if (!v) throw new Error('useFlash outside ToastProvider')
  return v.flash
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter, alignItems: 'center' },
  // The design system's Toast: 12 x 20, a brass hairline at 30%, the float shadow.
  toast: { paddingHorizontal: space.ml, paddingVertical: space.md, borderWidth: hairline, maxWidth: 420 },
})
