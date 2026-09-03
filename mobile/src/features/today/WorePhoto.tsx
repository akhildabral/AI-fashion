// "This is what I wore." One photo in; every garment found in it comes back
// as a row (yours for sure, probably yours, or new) and nothing is written
// until each row is answered. The web's WorePhotoPanel, for a camera.
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { EventType } from '@zauq/shared/types'
import { confirmWearPhoto, getWearPhoto, type ConfirmWearPhotoResponse, type PhotoRow, type RowDecision, type WearPhotoJob } from '@zauq/shared/wear-photo'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { apiUpload } from '@/src/lib/api'
import { imageForm, PermissionDenied, pickImages, type PickSource } from '@/src/lib/upload'
import { SheetShell } from './SheetShell'

type Decision = RowDecision & { open?: boolean }
type Stage = 'pick' | 'reading' | 'confirm' | 'saving'

const POLL_MS = 2000

function defaultFor(row: PhotoRow): Decision {
  const top = row.matches[0]
  if ((row.band === 'sure' || row.band === 'near') && top) return { index: row.index, action: 'use', itemId: top.itemId }
  return { index: row.index, action: 'add' }
}

function nameOf(it: { subtype: string | null; category: string; primaryColor?: string | null }): string {
  const base = (it.subtype ?? it.category).toLowerCase()
  return it.primaryColor ? `${it.primaryColor.toLowerCase()} ${base}` : base
}

export function WorePhoto({
  date,
  eventType,
  alreadyLogged = false,
  hasSuggestion = false,
  onLogged,
}: {
  date: string
  eventType?: EventType
  /** The day already has a wear log: offer "instead" or "as well". */
  alreadyLogged?: boolean
  /** The stylist had laid something out for the day. */
  hasSuggestion?: boolean
  onLogged: (r: ConfirmWearPhotoResponse) => void
}) {
  const [job, setJob] = useState<WearPhotoJob | null>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [mode, setMode] = useState<'instead' | 'also'>('instead')
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<PickSource | null>(null)

  async function pick(from: PickSource) {
    setError(null)
    setSource(from)
    try {
      const [image] = await pickImages(from)
      if (!image) {
        setSource(null)
        return
      }
      setStage('reading')
      const { job: started } = await apiUpload<{ job: WearPhotoJob }>('/wear/photo', imageForm('photo', image, { date }))
      setJob(started)
    } catch (err) {
      haptics.failure()
      setError(err instanceof PermissionDenied ? err.message : err instanceof Error ? err.message : 'The photo could not be sent.')
      setStage('pick')
    } finally {
      setSource(null)
    }
  }

  // The reading runs in the background; ask every two seconds until it lands.
  useEffect(() => {
    if (!job || job.status !== 'processing') return
    const id = setInterval(() => {
      getWearPhoto(job.id)
        .then(({ job: fresh }) => {
          setJob(fresh)
          if (fresh.status === 'ready') {
            const first: Record<number, Decision> = {}
            for (const r of fresh.rows) first[r.index] = defaultFor(r)
            setDecisions(first)
            setStage('confirm')
            haptics.tap()
          } else if (fresh.status === 'failed') {
            haptics.failure()
            setError(fresh.error ?? 'The photo could not be read.')
            setStage('pick')
          }
        })
        .catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [job])

  async function save() {
    if (!job || stage === 'saving') return
    const rows = Object.values(decisions).map(({ index, action, itemId }) => ({ index, action, itemId }))
    if (!rows.some((r) => r.action !== 'skip')) {
      setError('Keep at least one piece to log the day.')
      return
    }
    setStage('saving')
    setError(null)
    try {
      const r = await confirmWearPhoto(job.id, { rows, mode: alreadyLogged ? mode : 'instead', eventType })
      onLogged(r)
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not log the day.')
      setStage('confirm')
    }
  }

  const reading = stage === 'reading' || (stage === 'pick' && source !== null)

  if (stage === 'pick' || stage === 'reading') {
    return (
      <SheetShell
        title="What you wore"
        lead="A photo of you in it, or of the pieces laid out. The closet reads which are yours; new ones can join it."
        footer={
          <>
            <Button label="Take a photo" loading={source === 'camera' || stage === 'reading'} disabled={reading} onPress={() => void pick('camera')} />
            <Button label="From the library" variant="ghost" loading={source === 'library'} disabled={reading} onPress={() => void pick('library')} />
          </>
        }
      >
        {error ? (
          <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
        {stage === 'reading' ? (
          <Animated.View entering={fadeIn} style={{ gap: space.sm }}>
            <T role="lede" tone="muted">
              Reading the photo…
            </T>
            <T role="caption" tone="faint">
              Half a minute or so. Each piece is cut out and looked for in your closet.
            </T>
          </Animated.View>
        ) : null}
      </SheetShell>
    )
  }

  const rows = job?.rows ?? []
  const kept = Object.values(decisions).filter((d) => d.action !== 'skip').length
  return (
    <SheetShell
      title="What you wore"
      footer={
        <>
          <Button
            label={stage === 'saving' ? 'Logging…' : kept === 0 ? 'Log the day' : `Log the day · ${kept} ${kept === 1 ? 'piece' : 'pieces'}`}
            loading={stage === 'saving'}
            disabled={stage === 'saving' || kept === 0}
            onPress={() => void save()}
          />
          <Button
            label="Another photo"
            variant="quiet"
            disabled={stage === 'saving'}
            onPress={() => {
              setJob(null)
              setDecisions({})
              setStage('pick')
            }}
          />
        </>
      }
    >
      {rows.length === 0 ? (
        <T role="body" tone="muted">
          No clothes could be made out in that photo. Try one in better light, or log the day by its pieces.
        </T>
      ) : (
        <View style={{ gap: space.md }}>
          {rows.map((row) => (
            <RowCard key={row.index} row={row} decision={decisions[row.index]} onChange={(d) => setDecisions((cur) => ({ ...cur, [row.index]: d }))} />
          ))}
        </View>
      )}

      {alreadyLogged && rows.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <T role="label" tone="faint">
            The day was already logged
          </T>
          <View style={styles.chips}>
            <Chip label="This is what I wore instead" on={mode === 'instead'} onPress={() => setMode('instead')} />
            <Chip label="As well as what was logged" on={mode === 'also'} onPress={() => setMode('also')} />
          </View>
        </View>
      ) : null}
      {!alreadyLogged && hasSuggestion && rows.length > 0 ? (
        <T role="caption" tone="faint">
          Logged as the day’s look, in place of what was laid out. The suggestion stays on record.
        </T>
      ) : null}
      {error ? (
        <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
    </SheetShell>
  )
}

function RowCard({ row, decision, onChange }: { row: PhotoRow; decision: Decision | undefined; onChange: (d: Decision) => void }) {
  const { t } = useTheme()
  const d = decision ?? defaultFor(row)
  const chosen = d.action === 'use' ? row.matches.find((m) => m.itemId === d.itemId) : undefined
  const top = row.matches[0]
  const line =
    d.action === 'skip'
      ? 'Left out of the day.'
      : d.action === 'add'
        ? 'New to the closet. It will be catalogued from this photo.'
        : chosen
          ? row.band === 'sure' && chosen === top
            ? `Your ${nameOf(chosen.item)}.`
            : `Your ${nameOf(chosen.item)}?`
          : ''

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
      <View style={styles.cardRow}>
        {/* The crop is a photograph: lit by itself. The piece beside it is a cut-out in its niche. */}
        <GarmentTile imageUrl={row.cropUrl} width={64} aspect={4 / 5} photo accessibilityLabel={row.description} />
        {chosen && d.action === 'use' ? <GarmentTile imageUrl={chosen.item.imageUrl} width={64} aspect={4 / 5} accessibilityLabel={nameOf(chosen.item)} /> : null}
        <View style={{ flex: 1, gap: 6 }}>
          <T role="micro" tone="brass">
            {row.description}
          </T>
          <T role="bodySm">{line}</T>
        </View>
      </View>
      <View style={styles.chips}>
        {d.action === 'use' && row.band === 'near' && chosen ? (
          <>
            <Chip label="Yes, that one" on onPress={() => onChange({ ...d, open: false })} />
            <Chip label="Not mine" on={false} onPress={() => onChange({ index: row.index, action: 'add', open: true })} />
          </>
        ) : null}
        {d.action === 'use' && row.band === 'sure' ? <Chip label={d.open ? 'Keep it' : 'Not that one'} on={false} onPress={() => onChange({ ...d, open: !d.open })} /> : null}
        {d.action !== 'use' ? (
          <>
            <Chip label="Add to the closet" on={d.action === 'add'} onPress={() => onChange({ index: row.index, action: 'add', open: d.open })} />
            <Chip label="Skip" on={d.action === 'skip'} onPress={() => onChange({ index: row.index, action: 'skip', open: d.open })} />
            {row.matches.length > 0 ? <Chip label={d.open ? 'Hide mine' : 'One of mine'} on={false} onPress={() => onChange({ ...d, open: !d.open })} /> : null}
          </>
        ) : null}
      </View>
      {d.open && row.matches.length > 0 ? (
        <Animated.View entering={fadeIn} style={{ gap: space.sm }}>
          {row.matches.map((m) => {
            const on = d.itemId === m.itemId && d.action === 'use'
            return (
              <Pressable
                key={m.itemId}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={nameOf(m.item)}
                pressRetentionOffset={12}
                onPress={() => {
                  haptics.select()
                  onChange({ index: row.index, action: 'use', itemId: m.itemId, open: false })
                }}
                style={[styles.match, { borderColor: on ? t.brass : alpha(t.ink, 0.15), borderRadius: radius }]}
              >
                <GarmentTile imageUrl={m.item.imageUrl} width={40} aspect={4 / 5} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T role="bodySm" style={{ fontFamily: 'Archivo_600SemiBold' }}>
                    {nameOf(m.item)}
                  </T>
                  <T role="caption" tone="muted">
                    {m.reasons.join(', ') || 'the same kind'}
                  </T>
                </View>
              </Pressable>
            )
          })}
          {d.action === 'use' ? (
            <View style={styles.chips}>
              <Chip label="None of these" on={false} onPress={() => onChange({ index: row.index, action: 'add', open: false })} />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: hairline, padding: 12, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: hairline, padding: 6, paddingRight: 12, minHeight: 44 },
})
