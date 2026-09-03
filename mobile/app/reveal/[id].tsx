// The reveal: one render, full screen, in the tall mirror frame. Opened from
// a render in the grid, the tray's "ready" card, or a push, sometimes before
// the job has landed: then the glass shows the filament while it polls, and
// the mirror-reveal (a crossfade from a still, blurred copy; scale 1.04 to 1)
// runs the moment the picture is in. Under the glass, the decisions.
import { useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { planDay, shiftKey, todayKey } from '@zauq/shared/brief'
import { setLookPhotoFromRender } from '@zauq/shared/circle'
import { saveOutfit } from '@zauq/shared/outfits'
import { deleteTryOn, reportTryOn, retryTryOn } from '@zauq/shared/tryon'
import type { TryOn, TryOnResponse } from '@zauq/shared/types'
import { tryOnWardrobeOutfit } from '@zauq/shared/wardrobe'
import { logWear } from '@zauq/shared/wearlog'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import * as haptics from '@/src/design/haptics'
import { duration, EASE_OUT, fadeIn, fadeOut, rise, spring } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, dark, gutter, hairline, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { DRESSING_LINES, isLive, isReady, renderLabel, useInvalidateMirror, useReflections, useTryOnQuery } from '@/src/features/mirror/data'
import { Filament } from '@/src/features/mirror/Filament'
import { shareRender } from '@/src/features/mirror/share'
import { Sheetlet } from '@/src/features/mirror/Sheetlet'
import { resolveImageUrl } from '@/src/lib/api'
import { qk } from '@/src/lib/query'

const GLASS_INK = dark.ink
/** What shows of the panel before it is pulled up: handle, the primary, one row. */
const PEEK = 150

export default function RevealScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>()
  const id = String(rawId ?? '')
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const { width: sw, height: sh } = useWindowDimensions()
  const flash = useFlash()
  const qc = useQueryClient()
  const invalidate = useInvalidateMirror()
  const { activeRenders, trackRender, readyRender, clearReadyRender } = useJobs()

  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )

  const placeholder = activeRenders.find((r) => r.id === id) ?? (readyRender?.id === id ? readyRender : undefined)
  const q = useTryOnQuery(id, focused, placeholder)
  const tryOn = q.data?.tryOn
  const reflQ = useReflections()
  const live = isLive(tryOn)
  const ready = isReady(tryOn)
  const failed = tryOn?.status === 'failed'

  // The tray's "ready" card is for this render: it is on screen already.
  useEffect(() => {
    if (readyRender?.id === id) clearReadyRender()
  }, [readyRender, id, clearReadyRender])

  // The job landed while this screen watched: refresh the grid and the meter.
  const prevStatus = useRef(tryOn?.status)
  useEffect(() => {
    const was = prevStatus.current
    const now = tryOn?.status
    if (was !== now) {
      prevStatus.current = now
      if ((was === 'queued' || was === 'rendering') && (now === 'ready' || now === 'failed')) {
        invalidate()
        if (now === 'failed') haptics.failure()
      }
    }
  }, [tryOn?.status, invalidate])

  // ---- the atelier's lines ----
  const [line, setLine] = useState(0)
  useEffect(() => {
    if (!live) return
    setLine(0)
    const h = setInterval(() => setLine((n) => (n + 1) % DRESSING_LINES.length), 3200)
    return () => clearInterval(h)
  }, [live])

  // ---- mirror-reveal ----
  const op = useSharedValue(0)
  const sc = useSharedValue(1.04)
  const revealed = useRef(false)
  const onRevealLoad = () => {
    if (revealed.current) return
    revealed.current = true
    const cfg = { duration: duration.reveal, easing: EASE_OUT, reduceMotion: ReduceMotion.System }
    op.set(withTiming(1, cfg))
    sc.set(withTiming(1, cfg))
    haptics.success()
  }

  // ---- pinch to zoom, two fingers to pan, spring back ----
  const zoom = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      zoom.set(Math.min(4, Math.max(1, e.scale)))
    })
    .onEnd(() => {
      zoom.set(withSpring(1, spring.snap))
    })
  const pan = Gesture.Pan()
    .minPointers(2)
    .averageTouches(true)
    .onUpdate((e) => {
      tx.set(e.translationX)
      ty.set(e.translationY)
    })
    .onEnd((e) => {
      tx.set(withSpring(0, { ...spring.snap, velocity: e.velocityX }))
      ty.set(withSpring(0, { ...spring.snap, velocity: e.velocityY }))
    })
  const zoomGesture = Gesture.Simultaneous(pinch, pan)
  const revealStyle = useAnimatedStyle(() => ({
    opacity: op.get(),
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: sc.get() * zoom.get() }],
  }))

  // ---- geometry: the frame takes what the top row and the panel's peek leave ----
  const peek = PEEK + Math.max(insets.bottom, 12)
  const frameH = Math.min(Math.round(((sw - 32) * 4) / 3), sh - insets.top - 72 - peek - 20)
  const frameW = Math.round((frameH * 3) / 4)

  // ---- decisions ----
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ids = tryOn?.itemIds ?? []

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }

  const openNext = (next: TryOn) => {
    if (next.id === id) {
      qc.setQueryData<TryOnResponse>(qk.tryon(id), { tryOn: next })
      return
    }
    if (isLive(next)) trackRender(next)
    qc.setQueryData<TryOnResponse>(qk.tryon(next.id), { tryOn: next })
    router.replace(`/reveal/${next.id}`)
  }

  const wearIt = () =>
    run('wear', async () => {
      const { log } = await logWear({ itemIds: ids })
      await setLookPhotoFromRender(log.id, id).catch(() => undefined)
      haptics.success()
      setDone((d) => ({ ...d, wear: 'Logged for today' }))
      flash('Logged. It’s on today’s page.')
      const today = todayKey()
      invalidate(qk.brief(today), qk.journal(today.slice(0, 7)), qk.insights, qk.ritual)
    })
  const keepOutfit = () =>
    run('keep', async () => {
      await saveOutfit({ itemIds: ids, provenance: 'ai', rationale: 'Kept from the Mirror.' })
      haptics.tap()
      setDone((d) => ({ ...d, keep: 'Kept · in Outfits' }))
      invalidate(qk.outfits)
    })
  const tomorrow = () =>
    run('tomorrow', async () => {
      const date = shiftKey(todayKey(), 1)
      await planDay({ date, itemIds: ids, title: 'Laid out from the Mirror' })
      haptics.tap()
      setDone((d) => ({ ...d, tomorrow: 'Laid out for tomorrow' }))
      invalidate(qk.brief(date))
    })
  const tryAgain = () =>
    run('retry', async () => {
      const { tryOn: next } = await retryTryOn(id)
      invalidate()
      revealed.current = false
      openNext(next)
    })
  const renderFresh = () =>
    run('fresh', async () => {
      const r = await tryOnWardrobeOutfit(ids, true)
      invalidate()
      revealed.current = false
      openNext(r.tryOn)
    })
  const notMine = () =>
    run('report', async () => {
      const r = await reportTryOn(id)
      qc.setQueryData<TryOnResponse>(qk.tryon(id), (d) => (d ? { tryOn: { ...d.tryOn, reportedAt: new Date().toISOString(), refunded: d.tryOn.refunded || r.refunded } } : d))
      invalidate()
      flash('Noted. That render’s back on the house.')
    })
  const share = () =>
    run('share', async () => {
      const o = await shareRender(id)
      if (o === 'shared') flash('Shared.')
      else if (o === 'unavailable') flash('Sharing isn’t available on this device.')
      else flash('Could not prepare the card.')
    })
  const remove = () =>
    run('delete', async () => {
      await deleteTryOn(id)
      haptics.thud()
      qc.removeQueries({ queryKey: qk.tryon(id) })
      invalidate()
      flash('Gone.')
      close()
    })

  function close() {
    if (router.canGoBack()) router.back()
    else router.navigate('/mirror')
  }

  const blurUri = ready && tryOn?.imageUrl ? resolveImageUrl(tryOn.imageUrl) : reflQ.data?.photoUrl ? resolveImageUrl(reflQ.data.photoUrl) : null
  const eyebrow = failed ? 'Nothing was charged' : live ? 'Dressing you' : tryOn?.lookId ? 'An inspiration look, on you' : 'Fresh from the stylist'
  const pieces = tryOn && (tryOn.items?.length ?? 0) > 0 ? renderLabel(tryOn) : null

  return (
    <Screen plain edges={['top']}>
      <View style={styles.top}>
        <Button variant="icon" accessibilityLabel="Close" onPress={close} icon={<T role="h3">×</T>} />
        <View style={styles.titles}>
          <T role="label" tone="faint" numberOfLines={1}>
            {eyebrow}
          </T>
          <T role="h3" numberOfLines={1}>
            {failed ? 'That one didn’t take.' : live ? 'A moment.' : 'There '}
            {!failed && !live ? (
              <T role="h3" tone="brass" italic>
                you are.
              </T>
            ) : null}
          </T>
        </View>
      </View>

      <View style={styles.stage}>
        <Animated.View entering={rise(0)}>
          <Arch width={frameW} height={frameH} variant="mirror">
            {blurUri ? <Image source={{ uri: blurUri }} blurRadius={ready ? 18 : 3} style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0.3 }]} contentFit="cover" cachePolicy="disk" accessible={false} /> : null}

            {ready && tryOn?.imageUrl ? (
              <GestureDetector gesture={zoomGesture}>
                <Animated.View style={[StyleSheet.absoluteFill, revealStyle]}>
                  <Image
                    source={{ uri: resolveImageUrl(tryOn.imageUrl) }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="disk"
                    onLoad={onRevealLoad}
                    accessibilityLabel="You, in the render. Pinch to look closer."
                  />
                </Animated.View>
              </GestureDetector>
            ) : null}

            {live || (!tryOn && q.isPending) ? (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <Filament height={frameH} />
                {live ? (
                  <>
                    <Animated.View key={line} entering={fadeIn} exiting={fadeOut}>
                      <T role="lede" align="center" style={{ color: alpha(GLASS_INK, 0.85), fontFamily: fonts.serifItalic }}>
                        {DRESSING_LINES[line]}
                      </T>
                    </Animated.View>
                    <T role="label" align="center" style={{ color: alpha(GLASS_INK, 0.5) }}>
                      Leave if you like; you’ll hear when it’s ready
                    </T>
                  </>
                ) : null}
              </View>
            ) : null}

            {failed ? (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <T role="h3" align="center" style={{ color: GLASS_INK }}>
                  That one didn’t take.
                </T>
                <T role="bodySm" align="center" style={{ color: alpha(GLASS_INK, 0.6), maxWidth: 240 }}>
                  {tryOn?.error ?? 'Nothing was charged. Try again, or change a piece on the rail.'}
                </T>
              </View>
            ) : null}

            {q.isError && !tryOn ? (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <T role="bodySm" align="center" style={{ color: alpha(GLASS_INK, 0.7) }}>
                  The stylist is out for a moment.
                </T>
                <Button label="Try again" variant="ghost" size="sm" onPress={() => void q.refetch()} style={{ borderColor: alpha(GLASS_INK, 0.4) }} />
              </View>
            ) : null}
          </Arch>
        </Animated.View>
        {pieces ? (
          <T role="caption" tone="faint" align="center" numberOfLines={2} style={styles.pieces}>
            {pieces}
          </T>
        ) : null}
      </View>

      {ready && tryOn ? (
        <Sheetlet peek={peek}>
          {done.wear ? (
            <View style={[styles.logged, { borderColor: alpha(t.brass, 0.4), backgroundColor: t.brassSoft, borderRadius: radius }]}>
              <T role="bodySm" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                {done.wear}
              </T>
            </View>
          ) : (
            <Button label={busy === 'wear' ? 'Logging…' : 'Wearing it'} block loading={busy === 'wear'} disabled={busy !== null || ids.length === 0} onPress={() => void wearIt()} />
          )}
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button label={done.keep ?? 'Keep the outfit'} variant="ghost" size="sm" block loading={busy === 'keep'} disabled={busy !== null || !!done.keep || ids.length === 0} onPress={() => void keepOutfit()} />
            </View>
            <View style={styles.grow}>
              <Button label={done.tomorrow ?? 'Wear tomorrow'} variant="ghost" size="sm" block loading={busy === 'tomorrow'} disabled={busy !== null || !!done.tomorrow || ids.length === 0} onPress={() => void tomorrow()} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button label={busy === 'share' ? 'Preparing…' : 'Share'} variant="ghost" size="sm" block loading={busy === 'share'} disabled={busy !== null} onPress={() => void share()} />
            </View>
            <View style={styles.grow}>
              <Button label="Add to lookbook" variant="ghost" size="sm" block disabled={busy !== null} onPress={() => router.push(`/sheets/mirror-lookbook?tryOnId=${id}`)} />
            </View>
          </View>
          <View style={[styles.rule, { backgroundColor: alpha(t.ink, 0.12) }]} />
          {confirmDelete ? (
            <View style={styles.confirm}>
              <T role="bodySm" tone="muted">
                Delete this render? It’s gone for good.
              </T>
              <View style={styles.row}>
                <Button label="Keep it" variant="quiet" size="sm" onPress={() => setConfirmDelete(false)} />
                <Button label="Delete" variant="danger" size="sm" loading={busy === 'delete'} disabled={busy !== null} onPress={() => void remove()} />
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              {!tryOn.retryOf ? (
                <Button label="Try again, free once" variant="quiet" size="sm" loading={busy === 'retry'} disabled={busy !== null} onPress={() => void tryAgain()} />
              ) : (
                <Button label="Render fresh, 1 render" variant="quiet" size="sm" loading={busy === 'fresh'} disabled={busy !== null || ids.length === 0} onPress={() => void renderFresh()} />
              )}
              {!tryOn.reportedAt ? <Button label="Not my clothes" variant="quiet" size="sm" loading={busy === 'report'} disabled={busy !== null} onPress={() => void notMine()} /> : null}
              <Button label="Delete" variant="quiet" size="sm" disabled={busy !== null} onPress={() => setConfirmDelete(true)} />
            </View>
          )}
        </Sheetlet>
      ) : null}

      {failed ? (
        <View style={[styles.panel, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button label="Try again" block loading={busy === 'retry'} disabled={busy !== null} onPress={() => void tryAgain()} />
          <View style={styles.row}>
            <Button label="Back to the Mirror" variant="quiet" size="sm" onPress={close} />
            <Button label="Delete" variant="quiet" size="sm" loading={busy === 'delete'} disabled={busy !== null} onPress={() => void remove()} />
          </View>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: gutter, paddingVertical: 12, minHeight: 72 },
  titles: { flex: 1, gap: 2 },
  stage: { flex: 1, alignItems: 'center', gap: 10 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  pieces: { paddingHorizontal: gutter },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1 },
  rule: { height: hairline, marginVertical: 2 },
  confirm: { gap: 8 },
  logged: { height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: hairline },
  panel: { paddingHorizontal: gutter, paddingTop: 16, gap: 12, borderTopWidth: hairline },
})
