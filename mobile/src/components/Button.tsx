import { type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { PRESS_SCALE, timing } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, hitSlopFor, radius, space } from '@/src/design/tokens'
import { control, fonts } from '@/src/design/type'
import { T } from './Text'

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger' | 'icon'
type Size = 'md' | 'sm'

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label?: string
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Fill the row. */
  block?: boolean
  /** An icon element for `variant="icon"` or a leading glyph. */
  icon?: ReactNode
  /** An icon button that sits in an action bar beside 44pt actions takes their height. */
  tall?: boolean
  style?: ViewStyle
}

/** Padding X per variant: primary 24, ghost and danger 20, quiet 4; every small button 20. Never vertical. */
function paddingFor(variant: Variant, size: Size): number {
  if (variant === 'icon') return 0
  if (variant === 'quiet') return space.xs
  if (size === 'sm') return space.ml
  return variant === 'primary' ? space.xl : space.ml
}

/**
 * The action vocabulary: one brass primary per screen, ghost for the
 * alternative, quiet for the link, danger for the irreversible. Press
 * feedback scales the whole thing, label and all, to 0.97 in 150ms. The
 * visual is 44 (36 small); hitSlop lifts the touch to the platform floor.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  tall = false,
  disabled,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const { t } = useTheme()
  const scale = useSharedValue(1)
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  const h = variant === 'icon' ? (tall ? height.action : height.secondary) : size === 'sm' ? height.secondary : height.action
  const off = disabled || loading

  const fill =
    variant === 'primary'
      ? { backgroundColor: t.brass }
      : variant === 'ghost' || variant === 'danger'
        ? { borderWidth: hairline, borderColor: alpha(variant === 'danger' ? t.danger : t.ink, 0.28) }
        : variant === 'icon'
          ? { borderWidth: hairline, borderColor: alpha(t.ink, 0.2), width: h }
          : {}
  const tone = variant === 'primary' ? 'onBrass' : variant === 'danger' ? 'danger' : variant === 'quiet' ? 'muted' : 'ink'
  // 14 on a 44 control, 13 on a 36 one; primary is semibold, the rest medium.
  const text = h === height.action ? control.md : control.sm
  const face = variant === 'primary' ? fonts.sansSemi : fonts.sansMedium

  return (
    <Animated.View style={[pressed, block && styles.block]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!off, busy: loading }}
        disabled={off}
        hitSlop={hitSlopFor(h)}
        pressRetentionOffset={12}
        onPressIn={() => {
          scale.set(withTiming(PRESS_SCALE, timing.press))
        }}
        onPressOut={() => {
          scale.set(withTiming(1, timing.press))
        }}
        {...rest}
        style={[styles.base, { height: h, paddingHorizontal: paddingFor(variant, size), borderRadius: radius, opacity: off ? 0.5 : 1 }, fill, block && styles.block, style]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? t.onBrass : t.ink} />
        ) : (
          <View style={styles.row}>
            {icon}
            {label ? (
              <T role="bodySm" tone={tone} style={[text, { fontFamily: face }]} numberOfLines={1}>
                {label}
              </T>
            ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  block: { alignSelf: 'stretch', width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
