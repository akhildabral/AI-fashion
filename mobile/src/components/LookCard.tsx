import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { apiFetch } from '../lib/api'
import type { FavoriteResponse, Look } from '../lib/types'
import { getPalette, normalizeOutfit, toCssColor } from '../lib/outfit'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { ZoomableImage } from './ImageViewer'
import { Label } from './ui'
import { TryOnModal } from './TryOnModal'

interface LookCardProps {
  look: Look
  onFavoriteChange?: (look: Look) => void
  onDeleted?: (id: string) => void
}

export function LookCard({ look, onFavoriteChange, onDeleted }: LookCardProps) {
  const items = normalizeOutfit(look.outfit)
  const palette = getPalette(look.outfit)
  const imageUri = resolveImageUrl(look.imageUrl)
  const canPersist = typeof look.id === 'string' && look.id.length > 0

  const [favorite, setFavorite] = useState<boolean>(Boolean(look.favorite))
  const [favBusy, setFavBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tryOnOpen, setTryOnOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFavorite(Boolean(look.favorite))
  }, [look.favorite])

  async function toggleFavorite() {
    if (!canPersist || favBusy) return
    const next = !favorite
    setFavorite(next)
    setFavBusy(true)
    setError(null)
    try {
      const res = await apiFetch<FavoriteResponse>(`/looks/${look.id}/favorite`, {
        method: 'POST',
        body: { favorite: next },
      })
      setFavorite(Boolean(res.look.favorite))
      onFavoriteChange?.(res.look)
    } catch (err) {
      setFavorite(!next)
      setError(err instanceof Error ? err.message : 'Could not update favorite.')
    } finally {
      setFavBusy(false)
    }
  }

  function confirmDelete() {
    if (!canPersist || deleting) return
    Alert.alert('Remove look', 'Remove this look from your history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void handleDelete() },
    ])
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await apiFetch<void>(`/looks/${look.id}`, { method: 'DELETE' })
      onDeleted?.(look.id as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this look.')
      setDeleting(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        {imageUri ? (
          <ZoomableImage uri={imageUri} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>No image available</Text>
          </View>
        )}

        {canPersist && (
          <Pressable
            onPress={toggleFavorite}
            disabled={favBusy}
            style={styles.heart}
            hitSlop={6}
          >
            <Text style={[styles.heartIcon, favorite && styles.heartActive]}>
              {favorite ? '♥' : '♡'}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <View>
          {(look.occasion || look.gender) && (
            <Text style={styles.eyebrow}>
              {[look.occasion, look.gender].filter(Boolean).join(' · ')}
            </Text>
          )}
          <Text style={styles.title}>Your Look</Text>
        </View>

        {items.length > 0 && (
          <View style={styles.section}>
            <Label>The pieces</Label>
            <View style={{ gap: 6 }}>
              {items.map((item, i) => (
                <View key={i} style={styles.pieceRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.pieceText}>
                    {item.label ? (
                      <Text style={styles.pieceLabel}>{item.label}: </Text>
                    ) : null}
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {palette.length > 0 && (
          <View style={styles.section}>
            <Label>Palette</Label>
            <View style={styles.paletteRow}>
              {palette.map((color, i) => (
                <View key={i} style={styles.swatchChip}>
                  <View
                    style={[styles.swatch, { backgroundColor: toCssColor(color) }]}
                  />
                  <Text style={styles.swatchText}>{color}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {look.rationale ? (
          <View style={styles.section}>
            <Label>Why it works</Label>
            <Text style={styles.rationale}>{look.rationale}</Text>
          </View>
        ) : null}

        {error && <Text style={styles.error}>{error}</Text>}

        {canPersist && (
          <View style={styles.actions}>
            <Pressable style={styles.tryOnBtn} onPress={() => setTryOnOpen(true)}>
              <Text style={styles.tryOnText}>Try it on</Text>
            </Pressable>

            {onDeleted && (
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                style={styles.removeBtn}
              >
                {deleting && (
                  <ActivityIndicator size="small" color={colors.inkFaint} />
                )}
                <Text style={styles.removeText}>
                  {deleting ? 'Removing…' : 'Remove'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {canPersist && (
        <TryOnModal
          visible={tryOnOpen}
          lookId={look.id as string}
          onClose={() => setTryOnOpen(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
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
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.inkFaint,
    fontSize: 13,
  },
  heart: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: {
    fontSize: 20,
    color: colors.ink,
  },
  heartActive: {
    color: colors.clay,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.clay,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    fontWeight: '600',
    color: colors.ink,
  },
  section: {
    gap: spacing.sm,
  },
  pieceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bullet: {
    marginTop: 7,
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: colors.clay,
  },
  pieceText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  pieceLabel: {
    fontWeight: '600',
    color: colors.ink,
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 4,
  },
  swatch: {
    height: 16,
    width: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  swatchText: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  rationale: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  tryOnBtn: {
    borderWidth: 1,
    borderColor: colors.inkLine2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
  tryOnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.inkFaint,
  },
})
