import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiFetch } from '../lib/api'
import type { Look, LooksResponse } from '../lib/types'
import { Screen } from '../components/Screen'
import { LookCard } from '../components/LookCard'
import { CenteredSpinner, EmptyState, ErrorText, Subtle } from '../components/ui'
import { colors, spacing } from '../theme'

export function LooksScreen() {
  const [looks, setLooks] = useState<Look[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    setError(null)
    try {
      const { looks: l } = await apiFetch<LooksResponse>('/looks')
      setLooks(l ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your looks.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  function handleFavoriteChange(updated: Look) {
    setLooks((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)) : prev,
    )
  }

  function handleDeleted(id: string) {
    setLooks((prev) => (prev ? prev.filter((l) => l.id !== id) : prev))
  }

  const hasFavorites = Boolean(looks?.some((l) => l.favorite))
  const visible = looks && favoritesOnly ? looks.filter((l) => l.favorite) : looks

  return (
    <Screen
      title="My Looks"
      subtitle="Every look your stylist has composed — favorite the ones you love."
      refreshing={refreshing}
      onRefresh={() => load(true)}
      headerRight={
        hasFavorites ? (
          <Pressable
            style={styles.toggle}
            onPress={() => setFavoritesOnly((v) => !v)}
          >
            <View style={[styles.checkbox, favoritesOnly && styles.checkboxOn]}>
              {favoritesOnly && <Text style={styles.tick}>✓</Text>}
            </View>
            <Text style={styles.toggleText}>Favorites</Text>
          </Pressable>
        ) : undefined
      }
    >
      {loading && <CenteredSpinner />}

      {!loading && error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && looks && looks.length === 0 && (
        <EmptyState>
          <Subtle>You haven&apos;t saved any looks yet.</Subtle>
          <Subtle>Generate one from the Stylist tab.</Subtle>
        </EmptyState>
      )}

      {!loading && !error && visible && visible.length > 0 && (
        <View style={styles.grid}>
          {visible.map((look, i) => (
            <LookCard
              key={look.id ?? i}
              look={look}
              onFavoriteChange={handleFavoriteChange}
              onDeleted={handleDeleted}
            />
          ))}
        </View>
      )}

      {!loading &&
        !error &&
        visible &&
        visible.length === 0 &&
        looks &&
        looks.length > 0 && (
          <EmptyState>
            <Subtle>No favorites yet — tap the heart on a look to save it here.</Subtle>
          </EmptyState>
        )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.xl,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  toggleText: {
    fontSize: 13,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  checkbox: {
    height: 18,
    width: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.inkLine2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.clay,
    borderColor: colors.clay,
  },
  tick: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
})
