// The web's UndoBar, and the deferred delete behind it: the thing leaves the
// list now, the server call waits five seconds, and one tap pulls it back.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ACTION_BAR_HEIGHT } from '@/src/components/Room'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeOut, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, shadowFloat } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'

const UNDO_MS = 5000

export function UndoBar({ message, onUndo, aboveActionBar = true }: { message: string; onUndo: () => void; aboveActionBar?: boolean }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const bottom = (aboveActionBar ? ACTION_BAR_HEIGHT : 0) + Math.max(insets.bottom, 12) + 12
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <Animated.View
        entering={rise()}
        exiting={fadeOut}
        accessibilityLiveRegion="polite"
        style={[styles.bar, shadowFloat, { backgroundColor: t.surface, borderColor: alpha(t.brass, 0.4), borderRadius: radius }]}
      >
        <T role="bodySm" style={{ flexShrink: 1 }} numberOfLines={2}>
          {message}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo" hitSlop={12} pressRetentionOffset={12} onPress={onUndo}>
          <T role="bodySm" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
            Undo
          </T>
        </Pressable>
      </Animated.View>
    </View>
  )
}

export interface Pending<Item> {
  item: Item
  message: string
}

/**
 * A deferred delete with an undo window. `remove` hides the item at once
 * (through `onHide`) and fires `commit` after five seconds unless `undo` is
 * called; a second removal flushes the first.
 */
export function useUndoDelete<Item>({
  commit,
  onHide,
  onRestore,
  onFail,
}: {
  commit: (item: Item) => Promise<unknown>
  onHide: (item: Item) => void
  onRestore: (item: Item) => void
  onFail?: (item: Item) => void
}) {
  const [pending, setPending] = useState<Pending<Item> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef<Pending<Item> | null>(null)

  const flush = useCallback(() => {
    const p = current.current
    if (!p) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    current.current = null
    setPending(null)
    commit(p.item).catch(() => {
      onFail?.(p.item)
      onRestore(p.item)
    })
  }, [commit, onFail, onRestore])

  const remove = useCallback(
    (item: Item, message: string) => {
      flush()
      haptics.thud()
      onHide(item)
      const p = { item, message }
      current.current = p
      setPending(p)
      timer.current = setTimeout(flush, UNDO_MS)
    },
    [flush, onHide],
  )

  const undo = useCallback(() => {
    const p = current.current
    if (!p) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    current.current = null
    setPending(null)
    haptics.tap()
    onRestore(p.item)
  }, [onRestore])

  // Leaving the screen commits what was pending: the member saw it go.
  useEffect(() => () => flush(), [flush])

  return { pending, remove, undo }
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter, alignItems: 'center', zIndex: 20 },
  // The web's px-4 py-2.5 gap-3 border-brass/40
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, maxWidth: 420 },
})
