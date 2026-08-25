import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing } from '../theme'
import { Heading, Subtle } from './ui'

interface ScreenProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Extra content rendered on the right of the header (e.g. a toggle). */
  headerRight?: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
}

/** Standard scrollable screen with a serif title header. */
export function Screen({
  title,
  subtitle,
  children,
  headerRight,
  refreshing,
  onRefresh,
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.clay}
            />
          ) : undefined
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Heading size={32}>{title}</Heading>
            {subtitle ? <Subtle style={{ marginTop: spacing.sm }}>{subtitle}</Subtle> : null}
          </View>
          {headerRight}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bone,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl * 1.5,
  },
  header: {
    marginBottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
})
