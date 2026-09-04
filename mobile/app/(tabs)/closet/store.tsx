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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { currencySymbol, money } from '@zauq/shared/money'
import type { WardrobeItem } from '@zauq/shared/types'
import { addCandidate, deleteWardrobeItem, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { Arch } from '@/src/components/Arch'
import { Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Check } from '@/src/components/Check'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { ActionRow, RoomHeader, useBottomReserve } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { EASE_IN_OUT, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, dark, gutter, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { pickImages, type PickedImage } from '@/src/lib/upload'
import { CountUp } from '@/src/features/closet/CountUp'
import { labelOf, useInvalidateCloset, useVerdict } from '@/src/features/closet/data'
import { ck } from '@/src/features/closet/keys'

type Stage = 'viewfinder' | 'reading' | 'verdict' | 'kept' | 'bought' | 'failed'
const READING_LINES = ['Cutting it out…', 'Reading the colour and cut…', 'Checking it against your closet…']
const READ_TIMEOUT_MS = 100_000

/** The frames: the viewfinder at most 240 wide, the reading arch at most 320, both a picture's 3/4. */
const VIEWFINDER_MAX = 240
const READING_MAX = 320
const FRAME_ASPECT = 3 / 4
/** The piece and its outfits: the piece 96 wide, the boards 220. */
const PIECE_W = 96
const BOARD_W = 220

/** The brass filament down the middle of the frame while the piece is read: a slow 5.5s pulse. */
function Filament({ width, height }: { width: number; height: number }) {
  const { t } = useTheme()
  const opacity = useSharedValue(0.25)
  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.5, { duration: 2750, easing: EASE_IN_OUT, reduceMotion: ReduceMotion.System }), -1, true))
  }, [opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return (
    <Animated.View pointerEvents="none" style={[styles.filament, { left: Math.round(width / 2), height }, style]}>
      <Svg width={1} height={height}>
        <Defs>
          <LinearGradient id="filament" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.brass} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.brass} stopOpacity={0.7} />
            <Stop offset="1" stopColor={t.brass} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={1} height={height} fill="url(#filament)" />
      </Svg>
    </Animated.View>
  )
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
  const { t } = useTheme()
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
  const viewfinderW = Math.min(width - gutter * 2, VIEWFINDER_MAX)
  const readingW = Math.min(width - gutter * 2, READING_MAX)
  const pad = { paddingBottom: useBottomReserve() }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: 'In the store' }} />

      {stage === 'viewfinder' ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="In the store" title="Hold it" emphasis="up." />
              <T role="lede" tone="muted" style={styles.lead}>
                One clear shot of the piece; the label can wait. Your closet answers in a moment.
              </T>
            </Animated.View>
            <Animated.View entering={rise(1)} style={styles.frame}>
              <Arch width={viewfinderW} height={Math.round(viewfinderW / FRAME_ASPECT)} variant="mirror">
                <Brackets />
                <T role="lede" align="center" style={[styles.frameCaption, { color: alpha(dark.ink, 0.7) }]}>
                  the piece, in the frame
                </T>
              </Arch>
              <ActionRow style={styles.frameRow}>
                <Button label="Open the camera" block style={styles.grow} onPress={() => void shoot('camera')} />
                <Button label="Choose a photo" variant="ghost" onPress={() => void shoot('library')} />
              </ActionRow>
            </Animated.View>
            <Animated.View entering={rise(2)} style={[styles.steps, { borderTopColor: alpha(t.ink, 0.1) }]}>
              {[
                ['One shot.', 'The same reading that catalogues your closet reads the piece: colour, cut, warmth.'],
                ['The closet answers.', 'How many outfits it unlocks, what it goes with, and what each wear would cost.'],
                ['Keep it in mind, pass, or buy.', 'A kept piece waits on your wishlist and nudges you in a fortnight.'],
              ].map(([head, body], i) => (
                <View key={head} style={styles.step}>
                  <T role="h3" tone="brass" style={styles.stepNo}>
                    {i + 1}
                  </T>
                  <T role="bodySm" tone="muted" style={styles.grow}>
                    <T role="bodySm" style={styles.semi}>
                      {head}
                    </T>{' '}
                    {body}
                  </T>
                </View>
              ))}
            </Animated.View>
          </ScrollView>
        </>
      ) : null}

      {stage === 'reading' ? (
        <ScrollView contentContainerStyle={[styles.content, pad]}>
          <Animated.View entering={rise(0)}>
            <RoomHeader eyebrow="In the store" title="Reading the piece…" />
            <T role="lede" tone="muted" style={styles.lead} accessibilityLiveRegion="polite">
              {READING_LINES[line]}
            </T>
          </Animated.View>
          <Animated.View entering={rise(1)} style={styles.frame}>
            <Arch width={readingW} height={Math.round(readingW / FRAME_ASPECT)} variant="photo">
              {preview ? <Image source={{ uri: preview }} contentFit="cover" blurRadius={1} style={[StyleSheet.absoluteFill, styles.preview]} accessible={false} /> : null}
              <Filament width={readingW} height={Math.round(readingW / FRAME_ASPECT)} />
            </Arch>
          </Animated.View>
        </ScrollView>
      ) : null}

      {stage === 'failed' ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="In the store" title="That one didn’t read." />
              <T role="lede" tone="muted" style={styles.lead}>
                Try a shot with the whole piece in frame, on a plain background if you can.
              </T>
              <ActionRow>
                <Button label="Try again" block loading={busy} onPress={() => void pass('')} />
              </ActionRow>
            </Animated.View>
          </ScrollView>
        </>
      ) : null}

      {stage === 'verdict' && v && piece ? (
        <>
          <KeyboardAwareScrollView bottomOffset={space.xl} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader
                eyebrow={label}
                title={v.verdict.outfits >= 3 ? 'It' : v.verdict.outfits > 0 ? 'It' : 'Not'}
                emphasis={v.verdict.outfits >= 3 ? 'earns its place.' : v.verdict.outfits > 0 ? 'could work.' : 'yet.'}
              />
            </Animated.View>
            <Animated.View entering={rise(1)} style={styles.verdict}>
              <View style={styles.count}>
                <CountUp to={v.verdict.outfits} />
                <T role="label" tone="faint" style={styles.countLabel}>
                  outfit{v.verdict.outfits === 1 ? '' : 's'} with what you own
                </T>
              </View>
              <T role="bodySm" tone="muted">
                Pairs with{' '}
                <T role="bodySm" style={styles.semi}>
                  {v.verdict.pairs} of your {v.verdict.closetSize}
                </T>{' '}
                pieces.{v.verdict.outfits === 0 && v.verdict.closetSize > 0 ? ' The closet needs a bottom or shoes that meet it halfway.' : ''}
              </T>
            </Animated.View>

            {/* The piece and its outfits */}
            <Animated.View entering={rise(2)} style={styles.verdictRow}>
              <GarmentTile imageUrl={piece.imageUrl} width={PIECE_W} accessibilityLabel={label} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.grow}>
                {v.outfits.map((o, i) => (
                  <LookBoard key={i} items={[...o.items, piece]} width={BOARD_W} />
                ))}
                {v.outfits.length === 0 ? (
                  <T role="lede" tone="faint" style={styles.centred}>
                    No complete outfit yet.
                  </T>
                ) : null}
              </ScrollView>
            </Animated.View>

            <Animated.View entering={rise(3)} style={styles.plaques}>
              {v.closest ? (
                <Plaque label="Worth knowing" style={styles.plaque}>
                  <T role="bodySm">
                    Closest thing you own: the {labelOf(v.closest.item)}
                    {v.closest.wears > 0 ? `, worn ${v.closest.wears}×` : ', never worn'}.{' '}
                    <T role="bodySm" tone="muted">
                      {v.closest.likeness >= 6 ? 'Close to a duplicate.' : 'Not a duplicate.'}
                    </T>
                  </T>
                </Plaque>
              ) : null}
              {v.unlockLine ? (
                <Plaque label="It would unlock more" style={styles.plaque}>
                  <T role="bodySm">{v.unlockLine}</T>
                </Plaque>
              ) : null}
            </Animated.View>

            {/* Where and how much: optional, one line */}
            <Animated.View entering={rise(4)} style={styles.form}>
              <View style={styles.fields}>
                <View style={styles.grow}>
                  <Field value={store} onChangeText={setStore} placeholder="Where you saw it (optional)" autoCapitalize="words" accessibilityLabel="Where you saw it" />
                </View>
                <View style={styles.priceField}>
                  <Field value={price} onChangeText={(s) => setPrice(s.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder={`${currencySymbol()} price`} accessibilityLabel="Price" />
                </View>
              </View>
              <Button label="I’m buying it" variant="quiet" disabled={busy} onPress={() => void bought()} />
              <Check checked={nudge} onChange={setNudge} label="Nudge me in two weeks if it’s still on my mind" />
              <ActionRow top={space.lg}>
                <Button label="Keep in mind" block style={styles.grow} loading={busy} onPress={() => void keep()} />
                <Button label="Pass" variant="ghost" disabled={busy} onPress={() => void pass()} />
              </ActionRow>
            </Animated.View>
          </KeyboardAwareScrollView>
        </>
      ) : null}

      {stage === 'kept' && piece ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="Wishlist" title="Kept" emphasis="in mind." />
              <T role="lede" tone="muted" style={styles.lead}>
                The {label} is in your wishlist with its verdict{price ? `, ${money(Number(price))}` : ''}
                {store.trim() ? `, seen at ${store.trim()}` : ''}. The stylist reads it too: if the brief is ever one piece short, it says which.
              </T>
              <ActionRow>
                <Button label="Point at another" block style={styles.grow} onPress={reset} />
                <Button label="See the wishlist" variant="ghost" onPress={() => router.navigate('/closet/wishlist')} />
              </ActionRow>
            </Animated.View>
          </ScrollView>
        </>
      ) : null}

      {stage === 'bought' && piece ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, pad]}>
            <Animated.View entering={rise(0)}>
              <RoomHeader eyebrow="Closet · Pieces" title="In the" emphasis="closet." />
              <T role="lede" tone="muted" style={styles.lead}>
                The {label} is a piece now. Its outfits are in the Outfits room, and tomorrow’s brief already knows it’s there.
              </T>
              <ActionRow>
                <Button label="Wear it first with…" block style={styles.grow} onPress={() => router.replace(`/closet/compose?pin=${piece.id}`)} />
                <Button label="Back to the closet" variant="ghost" onPress={() => router.navigate('/closet')} />
                <Button label="Point at another" variant="quiet" onPress={reset} />
              </ActionRow>
            </Animated.View>
          </ScrollView>
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter },
  grow: { flex: 1 },
  centred: { alignSelf: 'center' },
  semi: { fontFamily: fonts.sansSemi },
  lead: { maxWidth: 448 },
  // The frame a block under the head, on the gutter; its row spans the gutter.
  frame: { paddingTop: space.xxl, alignItems: 'flex-start' },
  frameRow: { alignSelf: 'stretch' },
  // The caption on the dark glass, in the night palette's ink.
  frameCaption: { position: 'absolute', left: 0, right: 0, bottom: space.xl },
  preview: { opacity: 0.6 },
  brackets: { position: 'absolute', left: '14%', right: '14%', top: '16%', bottom: '24%' },
  bracket: { position: 'absolute', width: 20, height: 20 },
  tl: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  tr: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  br: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 },
  // A block, a hairline, then 16; the steps 16 apart.
  steps: { marginTop: space.xxl, paddingTop: space.lg, borderTopWidth: hairline, gap: space.lg, maxWidth: 448 },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNo: { width: 20 },
  filament: { position: 'absolute', top: 0, width: 1 },
  // The figure and its line, 8 apart; the label sits on the figure's baseline.
  verdict: { gap: space.sm },
  count: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  countLabel: { paddingBottom: space.sm, flexShrink: 1 },
  // Blocks 32 apart; the boards 12 apart in the rail.
  verdictRow: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start', marginTop: space.xxl },
  rail: { flexDirection: 'row', gap: space.md, paddingBottom: space.xs },
  plaques: { marginTop: space.xxl, gap: space.lg },
  plaque: { gap: space.sm },
  // The form a block beneath, its parts 16 apart.
  form: { marginTop: space.xxl, gap: space.lg },
  fields: { flexDirection: 'row', gap: space.sm },
  priceField: { width: 120 },
})
