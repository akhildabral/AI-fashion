// Share the day's look: the pieces to your circle, or the card in our frame
// through the phone's share sheet (WhatsApp, Instagram, anything).
//
// Params: date (defaults to today), wearLogId (the day's wear log when
// known), lookId (which of the day's looks, for "Render it on me first").
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { getWeek, shareBrief, todayKey } from '@zauq/shared/brief'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, radius, space } from '@/src/design/tokens'
import { longDay } from '@/src/features/today/copy'
import { stripFrom, tk } from '@/src/features/today/keys'
import { go, paths } from '@/src/features/today/nav'
import { shareCard } from '@/src/features/today/share'
import { SheetShell } from '@/src/features/today/SheetShell'
import { looksOf, useBrief } from '@/src/features/today/useToday'
import { qk } from '@/src/lib/query'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export default function ShareSheet() {
  const { t } = useTheme()
  const params = useLocalSearchParams<{ date?: string; wearLogId?: string; lookId?: string }>()
  const date = typeof params.date === 'string' && DAY_KEY.test(params.date) ? params.date : todayKey()
  const isToday = date === todayKey()
  const flash = useFlash()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<'circle' | 'card' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const brief = useBrief(date, { peek: !isToday, enabled: isToday })
  const weekFrom = isToday ? stripFrom() : date
  const week = useQuery({ queryKey: qk.week(weekFrom), queryFn: () => getWeek(weekFrom), staleTime: 60_000 })
  const day = week.data?.days.find((d) => d.date === date)
  const looks = looksOf(brief.data)
  const look = looks.find((l) => l.id === params.lookId) ?? looks[0]
  const itemIds = look ? (look.wornLook?.items ?? look.items).map((i) => i.id) : (day?.itemIds ?? [])
  const knownLogId = (typeof params.wearLogId === 'string' && params.wearLogId) || day?.wearLogId || null

  async function toCircle() {
    setBusy('circle')
    setError(null)
    try {
      await shareBrief()
      void qc.invalidateQueries({ queryKey: tk.weekAll })
      haptics.success()
      router.back()
      flash("Shared. Your circle can see today's look.")
    } catch {
      haptics.failure()
      setError('Could not share right now.')
    } finally {
      setBusy(null)
    }
  }

  async function theCard() {
    setBusy('card')
    setError(null)
    try {
      let id = knownLogId
      if (!id && isToday) {
        // The card is drawn from the wear log; sharing the brief creates one (and puts the look on the circle, as on the web).
        const r = await shareBrief()
        id = r.wearLogId ?? null
        void qc.invalidateQueries({ queryKey: tk.weekAll })
      }
      if (!id) {
        setError('Log the wear first, then the card is ready.')
        return
      }
      const outcome = await shareCard('look', id, isToday ? 'Today’s look' : `What I wore on ${longDay(date)}`)
      if (outcome === 'shared') {
        haptics.success()
        router.back()
        flash('Shared.')
      }
    } catch {
      haptics.failure()
      setError('Could not prepare the card right now.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <SheetShell
      title={isToday ? 'Share today’s look?' : `Share ${longDay(date)}?`}
      lead={isToday ? 'Your circle sees the pieces. Or send the card anywhere.' : 'The card, in our frame, through anything on your phone.'}
      footer={<Button label="Not now" variant="quiet" onPress={() => router.back()} />}
    >
      <View style={styles.stack}>
        {isToday ? <Button label="Share the pieces" block loading={busy === 'circle'} disabled={busy !== null} onPress={() => void toCircle()} /> : null}
        <Button label={isToday ? 'Share elsewhere' : 'Share the card'} block variant={isToday ? 'ghost' : 'primary'} loading={busy === 'card'} disabled={busy !== null} onPress={() => void theCard()} />
        {itemIds.length > 0 ? <Button label="Render it on me first" block variant="quiet" disabled={busy !== null} onPress={() => go(paths.mirror(itemIds))} /> : null}
      </View>
      {error ? (
        <View style={[styles.alert, { backgroundColor: alpha(t.danger, 0.1), borderRadius: radius }]} accessibilityLiveRegion="polite">
          <T role="bodySm" tone="danger">
            {error}
          </T>
        </View>
      ) : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  alert: { paddingHorizontal: space.lg, paddingVertical: 10 },
})
