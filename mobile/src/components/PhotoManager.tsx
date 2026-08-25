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
import { deletePhoto, getPhoto, uploadPhoto } from '../lib/tryon'
import { chooseImage } from '../lib/imagePicker'
import { resolveImageUrl } from '../config'
import { colors, radius, shadow, spacing } from '../theme'
import { Button, ErrorText, Heading, Subtle } from './ui'

/**
 * "Your photo" manager: shows the currently stored try-on photo, lets the user
 * upload a new one (behind an explicit consent checkbox) and remove it.
 */
export function PhotoManager() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [consent, setConsent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPhoto()
      .then(({ photoUrl: url }) => {
        if (!cancelled) setPhotoUrl(url)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your photo.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePick() {
    setError(null)
    const image = await chooseImage()
    if (!image) return
    setUploading(true)
    try {
      const { photoUrl: url } = await uploadPhoto(image)
      setPhotoUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload your photo.')
    } finally {
      setUploading(false)
    }
  }

  function confirmRemove() {
    if (removing) return
    Alert.alert('Remove photo', 'Remove your stored photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void handleRemove() },
    ])
  }

  async function handleRemove() {
    setError(null)
    setRemoving(true)
    try {
      await deletePhoto()
      setPhotoUrl(null)
      setConsent(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your photo.')
    } finally {
      setRemoving(false)
    }
  }

  const busy = uploading || removing
  const previewUri = resolveImageUrl(photoUrl)
  const uploadDisabled = busy || (!photoUrl && !consent)

  return (
    <View style={styles.card}>
      <View style={{ gap: spacing.sm }}>
        <Heading size={22}>Your photo</Heading>
        <Subtle>
          Upload a clear, front-facing photo and we&apos;ll render your saved looks onto
          it — so you can see yourself in every outfit before you commit.
        </Subtle>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.clay} />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.previewWrap}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={styles.previewEmpty}>
                <Text style={styles.previewEmptyText}>No photo yet</Text>
              </View>
            )}
          </View>

          <View style={styles.controls}>
            {!photoUrl && (
              <Pressable
                style={styles.consentRow}
                onPress={() => setConsent((c) => !c)}
                disabled={busy}
              >
                <View style={[styles.checkbox, consent && styles.checkboxOn]}>
                  {consent && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
                <Text style={styles.consentText}>
                  I consent to my photo being stored to generate try-on images.
                </Text>
              </Pressable>
            )}

            <Button
              title={photoUrl ? 'Replace photo' : 'Upload photo'}
              loadingTitle="Uploading…"
              loading={uploading}
              disabled={uploadDisabled}
              onPress={handlePick}
            />

            {photoUrl && (
              <Pressable
                onPress={confirmRemove}
                disabled={busy}
                style={styles.removeBtn}
              >
                {removing && <ActivityIndicator size="small" color={colors.inkFaint} />}
                <Text style={styles.removeText}>
                  {removing ? 'Removing…' : 'Remove photo'}
                </Text>
              </Pressable>
            )}

            <Text style={styles.hint}>
              JPG, PNG, or WebP · up to 10MB.
              {photoUrl ? ' Replacing overwrites your current photo.' : ''}
            </Text>

            {error && <ErrorText>{error}</ErrorText>}
          </View>
        </View>
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
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadow.card,
  },
  loadingBox: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'flex-start',
  },
  previewWrap: {
    width: 128,
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  previewEmptyText: {
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: 'center',
  },
  controls: {
    flex: 1,
    gap: spacing.md,
  },
  consentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  checkbox: {
    marginTop: 2,
    height: 20,
    width: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.inkLine2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.clay,
    borderColor: colors.clay,
  },
  checkboxTick: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.inkFaint,
  },
  hint: {
    fontSize: 12,
    color: colors.inkFaint,
    lineHeight: 17,
  },
})
