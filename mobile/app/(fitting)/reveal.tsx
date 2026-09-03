import { useQuery } from '@tanstack/react-query'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { getBrief, todayKey } from '@zauq/shared/brief'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { LookBoard, type FlatLayItem } from '@/src/components/LookBoard'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { duration, EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { gutter } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { Frame } from '@/src/features/fitting/Frame'
import { fk } from '@/src/features/fitting/keys'
import { hrefOf, PIECES_WANTED } from '@/src/features/fitting/steps'
import { usePieces } from '@/src/features/fitting/usePieces'

const BOARD_ASPECT = 5 / 4
/** The stylist's lines while the look is laid out (FittingPage.tsx). */
const DRESSING_LINES = ['Taking your measure…', 'Cutting the pieces…', 'Setting the light…']
/** How many times the brief may come back without a look before we stop asking. */
const BRIEF_TRIES = 3
const BRIEF_RETRY_MS = 4000

/** Step 5, the reveal: the first look, laid out live from the pieces just added. */
export default function Reveal() {
  const router = useRouter()
  const { width: screenW } = useWindowDimensions()
  const boardW = screenW - gutter * 2
  const [focused, setFocused] = useState(true)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )

  // First the pieces must finish developing; then the stylist composes.
  const { readyCount, processing } = usePieces(focused)
  const piecesSettled = !processing
  const canCompose = piecesSettled && readyCount >= PIECES_WANTED

  const brief = useQuery({
    queryKey: fk.firstBrief,
    queryFn: () => getBrief(),
    enabled: canCompose,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (q) => (q.state.data?.mode === 'brief' || q.state.dataUpdateCount >= BRIEF_TRIES ? false : BRIEF_RETRY_MS),
  })

  const look = brief.data?.mode === 'brief' && brief.data.brief && brief.data.brief.items.length > 0 ? brief.data.brief : null

  // How many answers have come back without a look.
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (brief.dataUpdatedAt > 0 && !look) setTries((n) => n + 1)
  }, [brief.dataUpdatedAt, look])
  const gaveUp = piecesSettled && (readyCount < PIECES_WANTED || brief.isError || (!look && tries >= BRIEF_TRIES))
  const composing = !look && !gaveUp

  const items = useMemo<FlatLayItem[]>(
    () => (look?.items ?? []).map((it) => ({ id: it.id, imageUrl: it.imageUrl, category: it.category, subtype: it.subtype })),
    [look],
  )

  // The mirror-reveal: opacity and scale 1.04 to 1 over 850ms, a success haptic on the frame it lands.
  const revealOpacity = useSharedValue(0)
  const revealScale = useSharedValue(1.04)
  useEffect(() => {
    if (!look) return
    haptics.success()
    revealOpacity.set(withTiming(1, { duration: duration.reveal, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    revealScale.set(withTiming(1, { duration: duration.reveal, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
    void queryClient.invalidateQueries({ queryKey: qk.brief(todayKey()) })
  }, [look, revealOpacity, revealScale])
  const reveal = useAnimatedStyle(() => ({ opacity: revealOpacity.get(), transform: [{ scale: revealScale.get() }] }))

  // The rotating line while composing.
  const [line, setLine] = useState(0)
  useEffect(() => {
    if (!composing) return
    const id = setInterval(() => setLine((n) => (n + 1) % DRESSING_LINES.length), 1400)
    return () => clearInterval(id)
  }, [composing])

  const comeIn = () => router.push(hrefOf('push'))

  // FittingPage.tsx's reveal: the headline and the lead by state.
  const ask = look ? (
    <>
      Tomorrow, <T role="h1" tone="brass" italic>wear this.</T>
    </>
  ) : gaveUp ? (
    <>
      Almost <T role="h1" tone="brass" italic>there.</T>
    </>
  ) : (
    <>
      Composing <T role="h1" tone="brass" italic>your first look.</T>
    </>
  )
  const lead = look
    ? look.rationale
    : gaveUp
      ? readyCount < PIECES_WANTED
        ? 'Your stylist has your measure. Four pieces in the closet, and the first look hangs here.'
        : 'The stylist could not settle a look from these yet. Come in; it will be waiting on Today.'
      : processing
        ? 'Developing your pieces…'
        : DRESSING_LINES[line]

  return (
    <Frame
      step="reveal"
      who="Composed"
      ask={ask}
      lead={lead}
      actions={
        look ? (
          <Button label="Come in" block onPress={comeIn} />
        ) : gaveUp ? (
          <>
            {readyCount < PIECES_WANTED ? <Button label="Add the missing pieces" block onPress={() => router.back()} /> : <Button label="Come in" block onPress={comeIn} />}
            {readyCount < PIECES_WANTED ? <Button label="Come in anyway" variant="quiet" size="sm" style={styles.center} onPress={comeIn} /> : null}
          </>
        ) : null
      }
    >
      <View style={styles.board}>
        {look ? (
          <Animated.View style={reveal} accessible accessibilityLabel={`Your first look: ${look.title}`}>
            <LookBoard items={items} width={boardW} aspect={BOARD_ASPECT} sweep />
          </Animated.View>
        ) : (
          <Arch width={boardW} aspect={BOARD_ASPECT}>
            {composing ? <Filament /> : null}
          </Arch>
        )}
      </View>
    </Frame>
  )
}

/** The idle filament while the figure is being dressed: a brass thread breathing at the centre. */
function Filament() {
  const { t } = useTheme()
  const glow = useSharedValue(0.25)
  useEffect(() => {
    glow.set(withRepeat(withTiming(0.5, { duration: 2750, reduceMotion: ReduceMotion.System }), -1, true))
  }, [glow])
  const style = useAnimatedStyle(() => ({ opacity: glow.get() }))
  return <Animated.View pointerEvents="none" style={[styles.filament, { backgroundColor: t.brass }, style]} />
}

const styles = StyleSheet.create({
  board: { alignItems: 'center' },
  filament: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1 },
  center: { alignSelf: 'center' },
})
