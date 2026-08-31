import { useCallback, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { deleteTryOn, getTryOns } from '../lib/tryon'
import type { TryOn } from '../lib/types'
import { resolveImageUrl } from '../config'
import { Screen } from '../components/Screen'
import { ZoomableImage } from '../components/ImageViewer'
import { CenteredSpinner, EmptyState, ErrorText, Subtle } from '../components/ui'
import { colors, radius, shadow, spacing } from '../theme'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function TryOnsScreen() {
  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    setError(null)
    try {
      const { tryOns: t } = await getTryOns()
      setTryOns(t ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your try-ons.')
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

  return (
    <Screen
      title="Try-Ons"
      subtitle="Every look you've rendered onto your photo — see yourself styled, over and over."
      refreshing={refreshing}
      onRefresh={() => load(true)}
    >
      {loading && <CenteredSpinner />}

      {!loading && error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && tryOns && tryOns.length === 0 && (
        <EmptyState>
          <Subtle>You haven&apos;t tried on any looks yet.</Subtle>
          <Subtle>Try on a look from the Looks or Wardrobe tab.</Subtle>
        </EmptyState>
      )}

      {!loading && !error && tryOns && tryOns.length > 0 && (
        <View style={styles.grid}>
          {tryOns.map((tryOn) => {
            const uri = resolveImageUrl(tryOn.imageUrl)
            return (
              <View key={tryOn.id} style={styles.gridItem}>
                <View style={styles.card}>
                  <View style={styles.imageWrap}>
                    {uri ? <ZoomableImage uri={uri} style={styles.image} /> : null}
                    <Pressable
                      style={styles.removeBtn}
                      accessibilityLabel="Remove this try-on"
                      onPress={() =>
                        Alert.alert('Remove try-on', 'Remove this render from your gallery?', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => {
                              void deleteTryOn(tryOn.id)
                                .then(() =>
                                  setTryOns((prev) => prev?.filter((t) => t.id !== tryOn.id) ?? prev),
                                )
                                .catch(() => setError('Could not remove that try-on.'))
                            },
                          },
                        ])
                      }
                    >
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.date}>{formatDate(tryOn.createdAt)}</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrap: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.boneSoft,
  },
  removeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  meta: {
    padding: spacing.md,
  },
  date: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.clay,
  },
})
