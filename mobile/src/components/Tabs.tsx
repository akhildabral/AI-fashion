import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import * as haptics from '@/src/design/haptics'
import { PRESS_SCALE, timing } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, hitSlopFor, radius, space } from '@/src/design/tokens'
import { control, fonts, track, tracking } from '@/src/design/type'
import { T } from './Text'

export interface TabItem<K extends string = string> {
  key: K
  label: string
  count?: number
}

/** The press on a tab, filter or chip: the whole token to 0.97 in 150ms. */
function usePress() {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  return {
    style,
    onPressIn: () => scale.set(withTiming(PRESS_SCALE, timing.press)),
    onPressOut: () => scale.set(withTiming(1, timing.press)),
  }
}

/** A tab's label: 12px, .14em, uppercase, semibold. Fixed at every width. */
const TAB_TEXT = { fontFamily: fonts.sansSemi, fontSize: 12, lineHeight: 16, letterSpacing: track(12, tracking.labelSm), textTransform: 'uppercase' } as const

function Tab<K extends string>({ item, on, onLayout, onPress }: { item: TabItem<K>; on: boolean; onLayout: (e: LayoutChangeEvent) => void; onPress: () => void }) {
  const { t } = useTheme()
  const press = usePress()
  return (
    // The layout is measured on the wrapper, so `x` is in the row's coordinates for the rule.
    <Animated.View style={press.style} onLayout={onLayout}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        hitSlop={hitSlopFor(height.action)}
        pressRetentionOffset={12}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onPress}
        style={styles.tab}
      >
        <T role="caption" style={[TAB_TEXT, { color: on ? t.ink : alpha(t.ink, 0.55) }]}>
          {item.label}
          {typeof item.count === 'number' ? <T role="caption" tone="faint" style={styles.count}>{`  ${item.count}`}</T> : null}
        </T>
      </Pressable>
    </Animated.View>
  )
}

/**
 * Text on a hairline, a brass rule under the active one: the room's lenses
 * (For you / Following / Explore) and a piece's Facts / Story / Goes with.
 */
export function Tabs<K extends string>({ items, value, onChange }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void }) {
  const { t } = useTheme()
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>({})
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  const active = layouts[value]
  useEffect(() => {
    if (!active) return
    x.set(withTiming(active.x, timing.move))
    w.set(withTiming(active.w, timing.move))
  }, [active, x, w])
  const rule = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], width: w.get() }))

  return (
    <View style={[styles.rail, { borderBottomColor: alpha(t.ink, 0.12) }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((it) => (
          <Tab
            key={it.key}
            item={it}
            on={it.key === value}
            onLayout={(e: LayoutChangeEvent) => {
              const { x: lx, width: lw } = e.nativeEvent.layout
              setLayouts((prev) => (prev[it.key]?.x === lx && prev[it.key]?.w === lw ? prev : { ...prev, [it.key]: { x: lx, w: lw } }))
            }}
            onPress={() => {
              if (it.key !== value) {
                haptics.select()
                onChange(it.key)
              }
            }}
          />
        ))}
        <Animated.View pointerEvents="none" style={[styles.rule, { backgroundColor: t.brass }, rule]} />
      </ScrollView>
    </View>
  )
}

/** The quiet token, 32 tall: an 8% ink wash when on, transparent when off, never brass, so brass keeps meaning "act". */
export function Filter({ label, on, count, onPress }: { label: string; on: boolean; count?: number; onPress: () => void }) {
  const { t } = useTheme()
  const press = usePress()
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        hitSlop={hitSlopFor(height.filter)}
        pressRetentionOffset={12}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          haptics.select()
          onPress()
        }}
        style={[styles.filter, { height: height.filter, borderRadius: radius, backgroundColor: on ? alpha(t.ink, 0.08) : 'transparent' }]}
      >
        <T role="bodySm" style={[control.sm, { color: on ? t.ink : alpha(t.ink, 0.55), fontFamily: fonts.sansMedium }]}>
          {label}
          {typeof count === 'number' ? <T role="bodySm" style={[control.sm, { color: alpha(t.ink, 0.4) }]}>{`  ${count}`}</T> : null}
        </T>
      </Pressable>
    </Animated.View>
  )
}

/** A choice on the 36 scale: day types, occasions, sizes. Bordered when off, brass fill when chosen. */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { t } = useTheme()
  const press = usePress()
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        hitSlop={hitSlopFor(height.secondary)}
        pressRetentionOffset={12}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          haptics.select()
          onPress()
        }}
        style={[styles.chip, { height: height.secondary, borderRadius: radius, borderColor: on ? t.brass : alpha(t.ink, 0.15), backgroundColor: on ? t.brass : 'transparent' }]}
      >
        <T role="bodySm" style={[control.sm, { color: on ? t.onBrass : alpha(t.ink, 0.65), fontFamily: fonts.sansMedium }]}>
          {label}
        </T>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  rail: { borderBottomWidth: hairline },
  // Tab rows: gap 20 on a phone.
  row: { flexDirection: 'row', gap: space.ml, paddingHorizontal: 2 },
  // 4 above the label, 12 below it to the rule; the box still meets the 44 floor.
  tab: { paddingTop: space.xs, paddingBottom: space.md, minHeight: height.action, justifyContent: 'flex-end' },
  count: { fontFamily: fonts.sansMedium, letterSpacing: 0, textTransform: 'none' },
  rule: { position: 'absolute', bottom: 0, left: 0, height: 2 },
  filter: { paddingHorizontal: 10, justifyContent: 'center' },
  chip: { paddingHorizontal: 14, justifyContent: 'center', borderWidth: hairline },
})
