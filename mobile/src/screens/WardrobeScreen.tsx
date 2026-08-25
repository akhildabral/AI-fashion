import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import { chooseImage } from '../lib/imagePicker'
import type { WardrobeItem } from '../lib/types'
import { Screen } from '../components/Screen'
import { WardrobeCard } from '../components/WardrobeCard'
import { OutfitSuggestions } from '../components/OutfitSuggestions'
import {
  Button,
  Card,
  CenteredSpinner,
  EmptyState,
  ErrorText,
  Heading,
  Subtle,
} from '../components/ui'
import { spacing } from '../theme'

export function WardrobeScreen() {
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    setLoadError(null)
    try {
      const { items: list } = await getWardrobe()
      setItems(list ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your wardrobe.')
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadedOnce(true)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!loadedOnce) void load()
    }, [load, loadedOnce]),
  )

  async function handleAdd() {
    setUploadError(null)
    const image = await chooseImage()
    if (!image) return
    setAnalyzing(true)
    try {
      const { item } = await addWardrobeItem(image)
      setItems((prev) => (prev ? [item, ...prev] : [item]))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not add that item.')
    } finally {
      setAnalyzing(false)
    }
  }

  function handleUpdated(updated: WardrobeItem) {
    setItems((prev) =>
      prev ? prev.map((it) => (it.id === updated.id ? updated : it)) : prev,
    )
  }

  function handleDeleted(id: string) {
    setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev))
  }

  const hasItems = items != null && items.length > 0

  return (
    <Screen
      title="Your wardrobe"
      subtitle="Add the clothes you own and we'll tag each one, then build outfits from your real closet."
      refreshing={refreshing}
      onRefresh={() => load(true)}
    >
      <Card style={styles.addCard}>
        <Heading size={22}>Add an item</Heading>
        <Subtle style={{ marginTop: 4 }}>
          Photograph a single garment. We&apos;ll auto-tag its category, color,
          pattern, and more — you can correct anything after.
        </Subtle>
        <Button
          title="Add item"
          loadingTitle="Analyzing garment…"
          loading={analyzing}
          onPress={handleAdd}
          style={{ marginTop: spacing.lg }}
        />
        <Subtle style={styles.hint}>JPG, PNG, or WebP · up to 10MB.</Subtle>
        {uploadError && (
          <View style={{ marginTop: spacing.md }}>
            <ErrorText>{uploadError}</ErrorText>
          </View>
        )}
      </Card>

      {loading && <CenteredSpinner />}

      {!loading && loadError && <ErrorText>{loadError}</ErrorText>}

      {!loading && !loadError && !hasItems && (
        <EmptyState>
          <Subtle>Your wardrobe is empty.</Subtle>
          <Subtle>Add your first item above to get started.</Subtle>
        </EmptyState>
      )}

      {!loading && !loadError && hasItems && (
        <>
          <View style={styles.grid}>
            {items.map((item) => (
              <View key={item.id} style={styles.gridItem}>
                <WardrobeCard
                  item={item}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              </View>
            ))}
          </View>

          <View style={styles.ideas}>
            <View style={{ marginBottom: spacing.lg }}>
              <Heading size={26}>Outfit ideas</Heading>
              <Subtle style={{ marginTop: spacing.sm }}>
                Let your stylist pull outfits together from the pieces you own.
              </Subtle>
            </View>
            <OutfitSuggestions />
          </View>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  addCard: {
    marginBottom: spacing.xl,
  },
  hint: {
    marginTop: spacing.md,
    fontSize: 12,
  },
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
  ideas: {
    marginTop: spacing.xxl,
  },
})
