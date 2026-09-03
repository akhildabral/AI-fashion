import { forwardRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { T } from './Text'

export interface FieldProps extends TextInputProps {
  label?: string
  error?: string | null
  helper?: string
  /** A password field with its show/hide toggle. */
  password?: boolean
  /** A short field that sits on one line with others. */
  compact?: boolean
}

/** A labelled input on the 44px scale, with its error beneath. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, helper, password, compact, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { t } = useTheme()
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)
  const border = error ? t.danger : focused ? t.brass : alpha(t.ink, 0.18)

  return (
    <View style={styles.wrap}>
      {label ? (
        <T role="label" tone="faint" style={styles.label}>
          {label}
        </T>
      ) : null}
      <View style={[styles.box, { borderColor: border, backgroundColor: t.surface, height: compact ? height.secondary : height.action, borderRadius: radius }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={alpha(t.ink, 0.4)}
          selectionColor={t.brass}
          secureTextEntry={password && !shown}
          autoCapitalize={password ? 'none' : rest.autoCapitalize}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          accessibilityLabel={label}
          {...rest}
          style={[styles.input, { color: t.ink, fontFamily: fonts.sans }, style]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setShown((s) => !s)}
            style={styles.toggle}
          >
            <T role="micro" tone="faint">
              {shown ? 'Hide' : 'Show'}
            </T>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <T role="caption" tone="danger" style={styles.note} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : helper ? (
        <T role="caption" tone="faint" style={styles.note}>
          {helper}
        </T>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 1 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: hairline, paddingHorizontal: 12 },
  // 16px so iOS never zooms the field.
  input: { flex: 1, fontSize: 16, paddingVertical: 0, height: '100%' },
  toggle: { paddingLeft: 10, height: '100%', justifyContent: 'center' },
  note: { marginLeft: 1 },
})
