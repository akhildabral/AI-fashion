// In the store: hold a piece up to the camera and the whole closet answers.
// One frame, no form. The same reading that catalogues your closet reads it;
// the pairing engine gives a number you can act on; keep it in mind, pass,
// or buy it.
import { useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { currencySymbol, money } from '@zauq/shared/money'
import type { WardrobeItem } from '@zauq/shared/types'
import { addCandidate, deleteWardrobeItem, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { Arch } from '@/src/components/Arch'
import { Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { EASE_IN_OUT, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { pickImages, type PickedImage } from '@/src/lib/upload'
import { CountUp } from '@/src/features/closet/CountUp'
import { labelOf, useInvalidateCloset, useVerdict } from '@/src/features/closet/data'
import { ck } from '@/src/features/closet/keys'

type Stage = 'viewfinder' | 'reading' | 'verdict' | 'kept' | 'bought' | 'failed'
const READING_LINES = ['Cutting it out…', 'Reading the colour and cut…', 'Checking it against your closet…']
const READ_TIMEOUT_MS = 100_000

/** The brass filament that scans the frame while the piece is read. */
function Filament({ width, height }: { width: number; height: number }) {
  const { t } = useTheme()
  const x = useSharedValue(0)
  useEffect(() => {
    x.set(withRepeat(withTiming(1, { duration: 1800, easing: EASE_IN_OUT, reduceMotion: ReduceMotion.System }), -1, true))
  }, [x])
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * (width - 2) }] }))
  return <Animated.View pointerEvents="none" style={[styles.filament, { height, backgroundColor: alpha(t.brass, 0.7) }, style]} />
}

/** The viewfinder's corner brackets: the piece, in the frame. */
function Brackets() {
  const { t } = useTheme()
  const c = { borderColor: t.brass }
  return (
    <View pointerEvents="none" style={styles.brackets}>
      <View style={[styles.bracket, styles.tl, c]} />
      <View style={[styles.bracket, styles.tr, c]} />
      <View style={[styles.bracket, styles.bl, c]} />
      <View style={[styles.bracket, styles.br, c]} />
    </View>
  )
}

export default function Store() {
  const { item: itemParam } = useLocalSearchParams<{ item?: string }>()
  const { width } = useWindowDimensions()
  const flash = useFlash()
  const qc = useQueryClient()
  const invalidate = useInvalidateCloset()

  const [stage, setStage] = useState<Stage>(itemParam ? 'reading' : 'viewfinder')
  const [candidate, setCandidate] = useState<string | null>(itemParam ?? null)
  const [preview, setPreview] = useState<string | null>(null)
  const [piece, setPiece] = useState<WardrobeItem | null>(null)
  const [line, setLine] = useState(0)
  const [store, setStore] = useState('')
  const [price, setPrice] = useState('')
  const [nudge, setNudge] = useState(true)
  const [busy, setBusy] = useState(false)
  const [readingSince, setReadingSince] = useState<number | null>(itemParam ? Date.now() : null)

  const verdict = useVerdict(stage === 'reading' || stage === 'verdict' ? candidate : null)

  // The verdict arrives: the piece and its number. Or it never does.
  useEffect(() => {
    if (stage !== 'reading') return
    const v = verdict.data
    if (v?.status === 'ready') {
      setPiece(v.piece)
      setStage('verdict')
      haptics.success()
    } else if (v?.status === 'failed' || verdict.isError || (readingSince != null && Date.now() - readingSince > READ_TIMEOUT_MS)) {
      setStage('failed')
    }
  }, [stage, verdict.data, verdict.isError, readingSince])

  useEffect(() => {
    if (stage !== 'reading') return
    const id = setInterval(() => setLine((n) => (n + 1) % READING_LINES.length), 1500)
    const stop = setTimeout(() => setStage('failed'), READ_TIMEOUT_MS)
    return () => {
      clearInterval(id)
      clearTimeout(stop)
    }
  }, [stage])

  async function shoot(source: 'camera' | 'library') {
    let shot: PickedImage | undefined
    try {
      ;[shot] = await pickImages(source)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not open the camera.')
      return
    }
    if (!shot) return
    setPreview(shot.uri)
    setStage('reading')
    setReadingSince(Date.now())
    try {
      // React Native's FormData takes a { uri, name, type } part; the shared
      // client types it as a File (see src/lib/upload.ts).
      const part = { uri: shot.uri, name: shot.name, type: shot.type } as unknown as File
      const r = await addCandidate(part)
      const first = r.items?.[0] ?? r.item
      if (!first) throw new Error('Nothing was read from that photo.')
      setPiece(first)
      setCandidate(first.id)
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not read that piece.')
      setStage('viewfinder')
    }
  }

  async function keep() {
    if (!piece) return
    setBusy(true)
    try {
      const nudgeAt = nudge ? new Date(Date.now() + 14 * 86_400_000).toISOString() : null
      await updateWardrobeItem(piece.id, { store: store.trim() || null, seenPrice: price ? Number(price) : null, nudgeAt })
      haptics.success()
      invalidate(piece.id)
      setStage('kept')
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not keep that.')
    } finally {
      setBusy(false)
    }
  }

  async function pass(note = 'Passed. Nothing kept.') {
    if (!piece && !candidate) {
      reset()
      return
    }
    setBusy(true)
    try {
      await deleteWardrobeItem(piece?.id ?? candidate ?? '')
      if (note) flash(note)
      invalidate()
    } catch {
      /* the candidate may already be gone */
    } finally {
      setBusy(false)
      reset()
    }
  }

  async function bought() {
    if (!piece) return
    setBusy(true)
    try {
      await updateWardrobeItem(piece.id, { owned: true, store: store.trim() || null, seenPrice: price ? Number(price) : null })
      haptics.success()
      invalidate(piece.id)
      setStage('bought')
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not move it in.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    if (candidate) qc.removeQueries({ queryKey: ck.verdict(candidate) })
    setStage('viewfinder')
    setCandidate(null)
    setPreview(null)
    setPiece(null)
    setStore('')
    setPrice('')
    setReadingSince(null)
  }

  const label = piece ? labelOf(piece) : 'this piece'
  const v = verdict.data?.status === 'ready' ? verdict.data : null
  const frameW = Math.min(width - gutter * 2, 340)
  const frameH = Math.round(frameW / (3 / 4))
  const pad = { paddingBottom: ACTION_BAR_HEIGHT + space.xl }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: 'In the store' }} />

      {stage === 'viewfinder' ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="In the store" title="Hold it" emphasis="up." lead="One clear shot of the piece; the label can wait. Your closet answers in a moment." />
            </Animated.View>
            <Animated.View entering={rise(1)} style={styles.frameWrap}>
              <Arch width={frameW} height={frameH} variant="mirror">
                <Brackets />
                <T role="lede" align="center" style={[styles.frameCaption, { color: alpha('#ECE5D8', 0.7) }]}>
                  the piece, in the frame
                </T>
              </Arch>
            </Animated.View>
            <Animated.View entering={rise(2)} style={styles.steps}>
              {[
                ['One shot.', 'The same reading that catalogues your closet reads the piece: colour, cut, warmth.'],
                ['The closet answers.', 'How many outfits it unlocks, what it goes with, and what each wear would cost.'],
                ['Keep it in mind, pass, or buy.', 'A kept piece waits on your wishlist and nudges you in a fortnight.'],
              ].map(([head, body], i) => (
                <View key={head} style={styles.step}>
                  <T role="h3" tone="brass" style={styles.stepNo}>
                    {i + 1}
                  </T>
                  <T role="bodySm" tone="muted" style={{ flex: 1 }}>
                    <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                      {head}
                    </T>{' '}
                    {body}
                  </T>
                </View>
              ))}
            </Animated.View>
          </ScrollView>
          <ActionBar>
            <Button label="Open the camera" block style={{ flex: 1 }} onPress={() => void shoot('camera')} />
            <Button label="Choose a photo" variant="ghost" onPress={() => void shoot('library')} />
          </ActionBar>
        </>
      ) : null}

      {stage === 'reading' ? (
        <ScrollView contentContainerStyle={[styles.content, pad]}>
          <Animated.View entering={rise(0)}>
            <RoomHeader eyebrow="In the store" title="Reading the piece…" lead={READING_LINES[line]} />
          </Animated.View>
          <Animated.View entering={rise(1)} style={styles.frameWrap}>
            <Arch width={frameW} height={frameH} variant="photo">
              {preview ? <Image source={{ uri: preview }} contentFit="cover" style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} accessible={false} /> : null}
              <Filament width={frameW} height={frameH} />
            </Arch>
          </Animated.View>
          <View style={styles.stack} accessibilityLabel="Reading the label" aria-busy>
            <T role="label" tone="faint">
              reading the label
            </T>
            <SkeletonBlock width="70%" height={28} />
            <SkeletonBlock width="45%" height={16} />
            <SkeletonBlock width="85%" height={16} />
          </View>
        </ScrollView>
      ) : null}

      {stage === 'failed' ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="In the store" title="That one didn’t read." lead="Try a shot with the whole piece in frame, on a plain background if you can." />
            </Animated.View>
          </ScrollView>
          <ActionBar>
            <Button label="Try again" block loading={busy} onPress={() => void pass('')} />
          </ActionBar>
        </>
      ) : null}

      {stage === 'verdict' && v && piece ? (
        <>
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader
                eyebrow={label}
                title={v.verdict.outfits >= 3 ? 'It' : v.verdict.outfits > 0 ? 'It' : 'Not'}
                emphasis={v.verdict.outfits >= 3 ? 'earns its place.' : v.verdict.outfits > 0 ? 'could work.' : 'yet.'}
              />
            </Animated.View>
            <Animated.View entering={rise(1)} style={styles.stack}>
              <View style={styles.count}>
                <CountUp to={v.verdict.outfits} />
                <T role="label" tone="muted" style={{ paddingBottom: 10, flexShrink: 1 }}>
                  outfit{v.verdict.outfits === 1 ? '' : 's'} with what you own
                </T>
              </View>
              <T role="bodySm" tone="muted">
                Pairs with{' '}
                <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                  {v.verdict.pairs} of your {v.verdict.closetSize}
                </T>{' '}
                pieces.{v.verdict.outfits === 0 && v.verdict.closetSize > 0 ? ' The closet needs a bottom or shoes that meet it halfway.' : ''}
              </T>
            </Animated.View>

            {/* The piece and its outfits */}
            <Animated.View entering={rise(2)} style={styles.verdictRow}>
              <GarmentTile imageUrl={piece.imageUrl} width={96} accessibilityLabel={label} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={{ flex: 1 }}>
                {v.outfits.map((o, i) => (
                  <LookBoard key={i} items={[...o.items, piece]} width={200} />
                ))}
                {v.outfits.length === 0 ? (
                  <T role="lede" tone="faint" style={{ alignSelf: 'center' }}>
                    No complete outfit yet.
                  </T>
                ) : null}
              </ScrollView>
            </Animated.View>

            {v.closest ? (
              <Animated.View entering={rise(3)}>
                <Plaque style={styles.plaque}>
                  <T role="label" tone="faint">
                    Worth knowing
                  </T>
                  <T role="bodySm">
                    Closest thing you own: the {labelOf(v.closest.item)}
                    {v.closest.wears > 0 ? `, worn ${v.closest.wears}×` : ', never worn'}.{' '}
                    <T role="bodySm" tone="muted">
                      {v.closest.likeness >= 6 ? 'Close to a duplicate.' : 'Not a duplicate.'}
                    </T>
                  </T>
                </Plaque>
              </Animated.View>
            ) : null}
            {v.unlockLine ? (
              <Animated.View entering={rise(3)}>
                <Plaque style={styles.plaque}>
                  <T role="label" tone="faint">
                    It would unlock more
                  </T>
                  <T role="bodySm">{v.unlockLine}</T>
                </Plaque>
              </Animated.View>
            ) : null}

            {/* Where and how much: optional, one line */}
            <Animated.View entering={rise(4)} style={styles.stack}>
              <View style={styles.fields}>
                <View style={{ flex: 1 }}>
                  <Field value={store} onChangeText={setStore} placeholder="Where you saw it (optional)" autoCapitalize="words" accessibilityLabel="Where you saw it" />
                </View>
                <View style={{ width: 120 }}>
                  <Field value={price} onChangeText={(s) => setPrice(s.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder={`${currencySymbol()} price`} accessibilityLabel="Price" />
                </View>
              </View>
              <View style={styles.chips}>
                <Chip label="Nudge me in two weeks if it’s still on my mind" on={nudge} onPress={() => setNudge((n) => !n)} />
              </View>
              <Button label="I’m buying it" variant="quiet" disabled={busy} onPress={() => void bought()} />
            </Animated.View>
          </KeyboardAwareScrollView>
          <ActionBar>
            <Button label="Keep in mind" block style={{ flex: 1 }} loading={busy} onPress={() => void keep()} />
            <Button label="Pass" variant="ghost" disabled={busy} onPress={() => void pass()} />
          </ActionBar>
        </>
      ) : null}

      {stage === 'kept' && piece ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader
                eyebrow="Wishlist"
                title="Kept"
                emphasis="in mind."
                lead={`The ${label} is in your wishlist with its verdict${price ? `, ${money(Number(price))}` : ''}${store.trim() ? `, seen at ${store.trim()}` : ''}. The stylist reads it too: if the brief is ever one piece short, it says which.`}
              />
            </Animated.View>
          </ScrollView>
          <ActionBar>
            <Button label="Point at another" block style={{ flex: 1 }} onPress={reset} />
            <Button label="See the wishlist" variant="ghost" onPress={() => router.navigate('/closet/wishlist')} />
          </ActionBar>
        </>
      ) : null}

      {stage === 'bought' && piece ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="Closet · Pieces" title="In the" emphasis="closet." lead={`The ${label} is a piece now. Its outfits are in the Outfits room, and tomorrow’s brief already knows it’s there.`} />
            </Animated.View>
            <Animated.View entering={rise(1)}>
              <Button label="Point at another" variant="quiet" onPress={reset} />
            </Animated.View>
          </ScrollView>
          <ActionBar>
            <Button label="Wear it first with…" block style={{ flex: 1 }} onPress={() => router.replace(`/closet/compose?pin=${piece.id}`)} />
            <Button label="Back to the closet" variant="ghost" onPress={() => router.navigate('/closet')} />
          </ActionBar>
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.xl },
  stack: { gap: space.md },
  frameWrap: { alignItems: 'center' },
  frameCaption: { position: 'absolute', left: 0, right: 0, bottom: 24, fontSize: 15 },
  brackets: { position: 'absolute', left: '14%', right: '14%', top: '16%', bottom: '24%' },
  bracket: { position: 'absolute', width: 20, height: 20 },
  tl: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  tr: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  br: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 },
  filament: { position: 'absolute', left: 0, top: 0, width: 2 },
  steps: { gap: 12, borderTopWidth: 1, borderTopColor: 'transparent', paddingTop: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNo: { width: 20 },
  count: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  verdictRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  rail: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  plaque: { padding: 14, paddingLeft: 20, gap: 4 },
  fields: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
