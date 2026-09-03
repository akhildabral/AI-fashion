import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import * as haptics from '@/src/design/haptics'
import { timing } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { T } from './Text'

export interface TabItem<K extends string = string> {
  key: K
  label: string
  count?: number
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
  if (active && (x.get() !== active.x || w.get() !== active.w)) {
    x.set(withTiming(active.x, timing.move))
    w.set(withTiming(active.w, timing.move))
  }
  const rule = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], width: w.get() }))

  return (
    <View style={[styles.rail, { borderBottomColor: alpha(t.ink, 0.12) }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((it) => {
          const on = it.key === value
          return (
            <Pressable
              key={it.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onLayout={(e: LayoutChangeEvent) => {
                const { x: lx, width: lw } = e.nativeEvent.layout
                setLayouts((prev) => (prev[it.key]?.x === lx && prev[it.key]?.w === lw ? prev : { ...prev, [it.key]: { x: lx, w: lw } }))
              }}
              onPress={() => {
                if (!on) {
                  haptics.select()
                  onChange(it.key)
                }
              }}
              style={styles.tab}
            >
              <T role="label" style={{ color: on ? t.ink : alpha(t.ink, 0.5), fontFamily: fonts.sansSemi }}>
                {it.label}
                {typeof it.count === 'number' ? <T role="label" tone="faint">{`  ${it.count}`}</T> : null}
              </T>
            </Pressable>
          )
        })}
        <Animated.View pointerEvents="none" style={[styles.rule, { backgroundColor: t.brass }, rule]} />
      </ScrollView>
    </View>
  )
}

/** The quiet token: ink wash when on, never brass, so brass keeps meaning "act". */
export function Filter({ label, on, count, onPress }: { label: string; on: boolean; count?: number; onPress: () => void }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptics.select()
        onPress()
      }}
      style={[
        styles.filter,
        { height: height.filter, borderRadius: radius, borderColor: alpha(t.ink, on ? 0 : 0.16), backgroundColor: on ? alpha(t.ink, 0.08) : 'transparent' },
      ]}
    >
      <T role="caption" style={{ color: on ? t.ink : alpha(t.ink, 0.7), fontFamily: on ? fonts.sansSemi : fonts.sans }}>
        {label}
        {typeof count === 'number' ? <T role="caption" tone="faint">{`  ${count}`}</T> : null}
      </T>
    </Pressable>
  )
}

/** A selectable option on the 36px scale: day types, occasions, sizes. Brass edge when chosen. */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptics.select()
        onPress()
      }}
      style={[
        styles.chip,
        { height: height.secondary, borderRadius: radius, borderColor: on ? t.brass : alpha(t.ink, 0.2), backgroundColor: on ? t.brassSoft : 'transparent' },
      ]}
    >
      <T role="bodySm" style={{ color: on ? t.ink : alpha(t.ink, 0.75) }}>
        {label}
      </T>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rail: { borderBottomWidth: hairline },
  row: { flexDirection: 'row', gap: 22, paddingHorizontal: 2 },
  tab: { paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  rule: { position: 'absolute', bottom: 0, left: 0, height: 2 },
  filter: { paddingHorizontal: 12, justifyContent: 'center', borderWidth: hairline },
  chip: { paddingHorizontal: 14, justifyContent: 'center', borderWidth: hairline },
})
