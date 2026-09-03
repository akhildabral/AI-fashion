import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Stat } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useJobs } from '@/src/context/JobsProvider'
import { gutter, space } from '@/src/design/tokens'
import { PermissionDenied, pickImages, type PickSource } from '@/src/lib/upload'
import { Frame } from '@/src/features/fitting/Frame'
import { PieceArches } from '@/src/features/fitting/PieceArches'
import { hrefOf, PIECES_MIN, PIECES_WANTED } from '@/src/features/fitting/steps'
import { usePieces } from '@/src/features/fitting/usePieces'

/** Step 4, the quick win: four pieces into four arches already waiting. */
export default function Pieces() {
  const router = useRouter()
  const { width: screenW } = useWindowDimensions()
  const { enqueueUploads } = useJobs()
  const [focused, setFocused] = useState(true)
  const [picking, setPicking] = useState<PickSource | null>(null)
  const [denied, setDenied] = useState<PermissionDenied | null>(null)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )

  const { items, processing, uploading, uploadError } = usePieces(focused)
  const count = Math.min(items.length, PIECES_WANTED)
  const enough = items.length >= PIECES_WANTED

  const add = async (source: PickSource) => {
    setDenied(null)
    setError(null)
    setPicking(source)
    try {
      const images = await pickImages(source, { multiple: true, limit: PIECES_WANTED * 2 })
      if (images.length) enqueueUploads(images)
    } catch (err) {
      if (err instanceof PermissionDenied) setDenied(err)
      else setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setPicking(null)
    }
  }

  const next = () => router.push(hrefOf('reveal'))

  const status = enough
    ? `${count} pieces. That is a look.`
    : processing || uploading
      ? 'Developing… each piece takes a moment.'
      : items.length === 0
        ? 'A top, a bottom, shoes, and one more. Flat or on a hanger; the stylist does the rest.'
        : `${PIECES_WANTED - items.length} to go. Each one develops in front of you.`

  return (
    <Frame
      step="pieces"
      who="Last"
      ask={
        <>
          Four pieces <T role="h1" tone="brass" italic>to start.</T>
        </>
      }
      actions={
        <>
          {enough ? (
            <Button label="Continue" block onPress={next} />
          ) : (
            <Button label="Photograph a piece" block loading={picking === 'camera'} disabled={picking !== null} onPress={() => void add('camera')} />
          )}
          {enough ? (
            <Button label="Add one more" variant="quiet" size="sm" style={styles.center} disabled={picking !== null} onPress={() => void add('camera')} />
          ) : (
            <Button label="From your photos" variant="ghost" block loading={picking === 'library'} disabled={picking !== null} onPress={() => void add('library')} />
          )}
          {!enough && items.length >= PIECES_MIN ? (
            <Button label={`Continue with ${items.length}`} variant="quiet" size="sm" style={styles.center} onPress={next} />
          ) : null}
        </>
      }
    >
      <View style={styles.count}>
        <Stat value={`${count} of ${PIECES_WANTED}`} label="pieces" tone={enough ? 'brass' : 'ink'} />
        <T role="bodySm" tone="muted" style={styles.status} accessibilityLiveRegion="polite">
          {status}
        </T>
      </View>
      <PieceArches items={items} width={screenW - gutter * 2} />
      {denied ? (
        <View style={styles.notice}>
          <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
            {denied.message}
          </T>
          <Button label="Open Settings" variant="ghost" size="sm" onPress={() => void Linking.openSettings()} />
        </View>
      ) : error || uploadError ? (
        <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
          {error ?? uploadError}
        </T>
      ) : null}
    </Frame>
  )
}

const styles = StyleSheet.create({
  count: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  status: { flex: 1, paddingBottom: 2 },
  notice: { gap: space.sm, alignItems: 'flex-start' },
  center: { alignSelf: 'center' },
})
