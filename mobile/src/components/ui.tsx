import { type ReactNode, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { colors, fonts, radius, shadow, spacing } from '../theme'

/** Serif-ish heading. */
export function Heading({
  children,
  size = 28,
  style,
}: {
  children: ReactNode
  size?: number
  style?: TextStyle
}) {
  return (
    <Text style={[styles.heading, { fontSize: size, lineHeight: size * 1.1 }, style]}>
      {children}
    </Text>
  )
}

export function Subtle({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.subtle, style]}>{children}</Text>
}

/** Small uppercase tracking label, matching the web `.label`. */
export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode
  style?: ViewStyle
  padded?: boolean
}) {
  return (
    <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  )
}

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'ghost'
  loading?: boolean
  disabled?: boolean
  loadingTitle?: string
  style?: ViewStyle
  fullWidth?: boolean
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  loadingTitle,
  style,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || loading
  const isPrimary = variant === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnGhost,
        fullWidth && styles.btnFullWidth,
        isDisabled && styles.btnDisabled,
        pressed && !isDisabled && styles.btnPressed,
        style,
      ]}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={isPrimary ? colors.bone : colors.ink}
          style={{ marginRight: spacing.sm }}
        />
      )}
      <Text style={isPrimary ? styles.btnPrimaryText : styles.btnGhostText}>
        {loading && loadingTitle ? loadingTitle : title}
      </Text>
    </Pressable>
  )
}

/** A text link styled with the clay accent. */
export function LinkText({
  children,
  onPress,
}: {
  children: ReactNode
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  )
}

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkFaint}
      {...props}
      style={[styles.field, props.style]}
    />
  )
}

interface SelectProps {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  placeholder?: string
  /** Render a nicer label for each option (default: as-is). */
  formatOption?: (value: string) => string
  /** Allow clearing the selection back to empty. */
  allowEmpty?: boolean
}

/**
 * A cross-platform select built on a modal list (no native picker dependency).
 * Shows the current value in a field-styled trigger; tapping opens a sheet.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  formatOption = (v) => v,
  allowEmpty = true,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>
          {value ? formatOption(value) : placeholder}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView bounces={false}>
              {allowEmpty && (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  <Text style={styles.sheetPlaceholderText}>{placeholder}</Text>
                </Pressable>
              )}
              {options.map((opt) => {
                const selected = opt === value
                return (
                  <Pressable
                    key={opt}
                    style={styles.sheetRow}
                    onPress={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                  >
                    <Text
                      style={[styles.sheetRowText, selected && styles.sheetRowSelected]}
                    >
                      {formatOption(opt)}
                    </Text>
                    {selected && <Text style={styles.sheetCheck}>✓</Text>}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

/** A pill toggle used for multi-select sets (e.g. seasons). */
export function TogglePill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.togglePill, active ? styles.togglePillActive : styles.togglePillIdle]}
    >
      <Text style={active ? styles.togglePillActiveText : styles.togglePillIdleText}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A read-only tag chip. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{children}</Text>
    </View>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>{children}</View>
    </View>
  )
}

export function CenteredSpinner() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.clay} />
    </View>
  )
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.serif,
    fontWeight: '600',
    color: colors.ink,
  },
  subtle: {
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
  },
  label: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.clay,
    marginBottom: 4,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  cardPadded: {
    padding: spacing.xl,
  },
  errorBox: {
    borderRadius: radius.sm,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  btnFullWidth: {
    alignSelf: 'stretch',
  },
  btnPrimary: {
    backgroundColor: colors.ink,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    backgroundColor: 'transparent',
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPrimaryText: {
    color: colors.bone,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  btnGhostText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  link: {
    color: colors.clay,
    fontSize: 14,
    fontWeight: '600',
  },
  field: {
    width: '100%',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkLine2,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    justifyContent: 'center',
    minHeight: 48,
  },
  selectValue: {
    fontSize: 15,
    color: colors.ink,
  },
  selectPlaceholder: {
    fontSize: 15,
    color: colors.inkFaint,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,26,26,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingVertical: spacing.sm,
    maxHeight: '70%',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  sheetRowText: {
    fontSize: 16,
    color: colors.ink,
  },
  sheetPlaceholderText: {
    fontSize: 16,
    color: colors.inkFaint,
  },
  sheetRowSelected: {
    fontWeight: '700',
    color: colors.clay,
  },
  sheetCheck: {
    color: colors.clay,
    fontSize: 16,
    fontWeight: '700',
  },
  togglePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  togglePillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  togglePillIdle: {
    backgroundColor: 'transparent',
    borderColor: colors.inkLine2,
  },
  togglePillActiveText: {
    color: colors.bone,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  togglePillIdleText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  empty: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkLine2,
    paddingVertical: 56,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
