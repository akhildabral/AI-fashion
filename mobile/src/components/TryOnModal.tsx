import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { createTryOn, getPhoto } from '../lib/tryon'
import { tryOnWardrobeOutfit } from '../lib/wardrobe'
import type { TryOn } from '../lib/types'
import type { MainTabsParamList } from '../navigation/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, spacing } from '../theme'
import { Button, Heading } from './ui'

type Phase = 'checking' | 'no-photo' | 'rendering' | 'done' | 'error'

/**
 * The modal renders the user in either a saved look (`lookId`) or a set of
 * wardrobe items (`itemIds`) — exactly one of the two is provided.
 */
type TryOnModalProps = { visible: boolean; onClose: () => void } & (
  | { lookId: string; itemIds?: never }
  | { itemIds: string[]; lookId?: never }
)

/**
 * Full try-on flow inside a modal:
 *  1. Check whether the user has a stored photo (GET /api/photo).
 *  2. If not, prompt them to add one on the Profile tab.
 *  3. Otherwise render the look/items onto their photo (slow, ~30-40s), showing
 *     a clear spinner + copy, then the result image.
 */
export function TryOnModal({ visible, onClose, ...target }: TryOnModalProps) {
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabsParamList>>()
  const [phase, setPhase] = useState<Phase>('checking')
  const [tryOn, setTryOn] = useState<TryOn | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lookId = 'lookId' in target ? target.lookId : undefined
  const itemIds = 'itemIds' in target ? target.itemIds : undefined
  const itemsKey = itemIds?.join(',')

  useEffect(() => {
    if (!visible) return
    let cancelled = false

    async function run() {
      setPhase('checking')
      setTryOn(null)
      setError(null)
      try {
        const { photoUrl } = await getPhoto()
        if (cancelled) return
        if (!photoUrl) {
          setPhase('no-photo')
          return
        }
        setPhase('rendering')
        const { tryOn: result } =
          lookId !== undefined
            ? await createTryOn(lookId)
            : await tryOnWardrobeOutfit(itemIds ?? [])
        if (cancelled) return
        setTryOn(result)
        setPhase('done')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        setPhase('error')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [visible, lookId, itemsKey])

  const resultUri = tryOn ? resolveImageUrl(tryOn.imageUrl) : undefined

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>

          <ScrollView contentContainerStyle={styles.body}>
            {phase === 'checking' && (
              <View style={styles.centerBlock}>
                <ActivityIndicator size="large" color={colors.clay} />
                <Text style={styles.muted}>Getting ready…</Text>
              </View>
            )}

            {phase === 'rendering' && (
              <View style={styles.centerBlock}>
                <ActivityIndicator size="large" color={colors.clay} />
                <Heading size={22} style={{ textAlign: 'center' }}>
                  Rendering you in this look…
                </Heading>
                <Text style={[styles.muted, { textAlign: 'center' }]}>
                  This can take up to a minute — hang tight.
                </Text>
              </View>
            )}

            {phase === 'no-photo' && (
              <View style={styles.centerBlock}>
                <Heading size={22} style={{ textAlign: 'center' }}>
                  Add a photo first
                </Heading>
                <Text style={[styles.muted, { textAlign: 'center' }]}>
                  To see yourself in this look, add a clear, front-facing photo of
                  yourself on your profile.
                </Text>
                <Button
                  title="Go to my photo"
                  onPress={() => {
                    onClose()
                    navigation.navigate('Profile', { focusPhoto: true })
                  }}
                />
              </View>
            )}

            {phase === 'done' && resultUri && (
              <View style={{ gap: spacing.lg }}>
                <Heading size={22} style={{ textAlign: 'center' }}>
                  You in this look
                </Heading>
                <View style={styles.resultWrap}>
                  <Image
                    source={{ uri: resultUri }}
                    style={styles.resultImage}
                    resizeMode="contain"
                  />
                </View>
                <Pressable
                  onPress={() => {
                    onClose()
                    navigation.navigate('TryOns')
                  }}
                  style={{ alignSelf: 'center' }}
                >
                  <Text style={styles.link}>See all your try-ons →</Text>
                </Pressable>
              </View>
            )}

            {phase === 'error' && (
              <View style={styles.centerBlock}>
                <Heading size={22} style={{ textAlign: 'center' }}>
                  Couldn't render this look
                </Heading>
                <Text style={[styles.errorText, { textAlign: 'center' }]}>{error}</Text>
                <Button title="Close" variant="ghost" onPress={onClose} />
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,26,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.inkLine,
    overflow: 'hidden',
  },
  close: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    zIndex: 10,
    height: 34,
    width: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.ink,
  },
  body: {
    padding: spacing.xxl,
  },
  centerBlock: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  muted: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  resultWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.boneSoft,
    overflow: 'hidden',
  },
  resultImage: {
    width: '100%',
    height: 420,
  },
  link: {
    color: colors.clay,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.sans,
  },
})
