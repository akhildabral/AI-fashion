// Ask the circle: two or three of anything, of everyone, a few friends, or
// just a link, for a day, until tonight, or three.
import { useMutation, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { getMyRecentLooks } from '@zauq/shared/circle'
import { getOutfits } from '@zauq/shared/outfits'
import { createPoll, type PollAudience, type PollOptionInput } from '@zauq/shared/polls'
import { getNetwork } from '@zauq/shared/social'
import { getTryOns } from '@zauq/shared/tryon'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { Alert, EmptyState } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { LookBoard, type FlatLayItem } from '@/src/components/LookBoard'
import { Press } from '@/src/components/Press'
import { SheetShell } from '@/src/components/Sheet'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { PhotoArch } from '@/src/features/circle/atoms'
import { invalidateFeeds } from '@/src/features/circle/cache'
import { ck } from '@/src/features/circle/keys'
import { SheetLabel } from '@/src/features/circle/SheetLabel'

type Source = 'outfits' | 'looks' | 'renders' | 'pieces'

/** Something you can ask with: a picture, or a set of pieces the server lays out on a board. */
interface Candidate {
  key: string
  label: string
  imageUrl?: string
  items?: FlatLayItem[]
  /** A photo of a garment reads better contained; a person, covered. */
  contain?: boolean
}

const SOURCES: { key: Source; label: string }[] = [
  { key: 'outfits', label: 'Outfits' },
  { key: 'looks', label: 'Recent looks' },
  { key: 'renders', label: 'Renders' },
  { key: 'pieces', label: 'Pieces' },
]

const EXPIRIES: { key: string; label: string; minutes: () => number }[] = [
  { key: 'day', label: '24 hours', minutes: () => 24 * 60 },
  {
    key: 'tonight',
    label: 'Until tonight',
    minutes: () => {
      const t = new Date()
      t.setHours(20, 0, 0, 0)
      if (t.getTime() < Date.now() + 5 * 60_000) t.setDate(t.getDate() + 1)
      return Math.max(5, Math.round((t.getTime() - Date.now()) / 60_000))
    },
  },
  { key: 'three', label: '3 days', minutes: () => 3 * 24 * 60 },
]

const AUDIENCES: [PollAudience, string][] = [
  ['circle', 'Everyone'],
  ['friends', 'A few friends'],
  ['link', 'Just a link'],
]

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function AskSheet() {
  const { t } = useTheme()
  const flash = useFlash()
  const { width } = useWindowDimensions()
  const [source, setSource] = useState<Source>('outfits')
  const [chosen, setChosen] = useState<Candidate[]>([])
  const [question, setQuestion] = useState('')
  const [audience, setAudience] = useState<PollAudience>('circle')
  const [friends, setFriends] = useState<string[]>([])
  const [expiry, setExpiry] = useState('day')
  const [error, setError] = useState<string | null>(null)

  const outfits = useQuery({ queryKey: qk.outfits, queryFn: getOutfits })
  const looks = useQuery({ queryKey: ck.mine, queryFn: getMyRecentLooks })
  const renders = useQuery({ queryKey: qk.tryons, queryFn: getTryOns })
  const closet = useQuery({ queryKey: qk.wardrobe, queryFn: getWardrobe })
  const people = useQuery({ queryKey: ck.network, queryFn: getNetwork, enabled: audience === 'friends' })

  const pool: Candidate[] =
    source === 'outfits'
      ? (outfits.data?.outfits ?? []).map((o) => ({ key: `o-${o.id}`, label: o.rationale?.slice(0, 40) || o.eventType, items: o.items }))
      : source === 'looks'
        ? (looks.data?.looks ?? []).map((l) => ({ key: `l-${l.id}`, label: dayLabel(l.wornOn), items: l.items, imageUrl: l.photoUrl ?? undefined }))
        : source === 'renders'
          ? (renders.data?.tryOns ?? []).filter((r) => r.status === 'ready' && r.imageUrl).map((r) => ({ key: `r-${r.id}`, label: 'Render', imageUrl: r.imageUrl }))
          : (closet.data?.items ?? []).filter((i) => i.status === 'ready').map((i) => ({ key: `p-${i.id}`, label: i.subtype ?? i.category, imageUrl: i.imageUrl, contain: true }))

  const loading = source === 'outfits' ? outfits.isPending : source === 'looks' ? looks.isPending : source === 'renders' ? renders.isPending : closet.isPending

  const empty: Record<Source, string> = {
    outfits: 'Save a couple of outfits first, from the Closet.',
    looks: 'Wear a few days and they gather here.',
    renders: 'You need two renders to compare. Try a look in the Mirror.',
    pieces: 'Add a few pieces to your closet first.',
  }

  function pick(c: Candidate) {
    haptics.select()
    setChosen((cs) => (cs.some((x) => x.key === c.key) ? cs.filter((x) => x.key !== c.key) : cs.length >= 3 ? cs : [...cs, c]))
  }

  const ask = useMutation({
    mutationFn: async () => {
      const options: PollOptionInput[] = chosen.map((c) =>
        // A look with a photo asks with the photo; otherwise its pieces become a board.
        c.imageUrl && (!c.items || c.key.startsWith('l-')) ? { imageUrl: c.imageUrl, label: c.label } : { itemIds: (c.items ?? []).map((i) => i.id), label: c.label },
      )
      return createPoll({
        options,
        question: question.trim() || undefined,
        audience,
        friendHandles: audience === 'friends' ? friends : undefined,
        expiresInMinutes: EXPIRIES.find((e) => e.key === expiry)?.minutes() ?? 24 * 60,
      })
    },
    onSuccess: () => {
      invalidateFeeds()
      haptics.success()
      flash('Asked. Your circle will weigh in.')
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not start the verdict.')
    },
  })

  const submit = () => {
    if (chosen.length < 2 || ask.isPending) return
    if (audience === 'friends' && friends.length === 0) {
      setError('Pick at least one friend to ask.')
      return
    }
    setError(null)
    ask.mutate()
  }

  // The web's `grid-cols-3 gap-3`.
  const cols = 3
  const cell = Math.floor((width - gutter * 2 - GRID_GAP * (cols - 1)) / cols)

  return (
    <SheetShell dense
      title="Ask the circle"
      lead="Two or three of anything. Ask everyone, a few friends, or just a link."
      footer={
        <>
          <Button label={`Ask (${chosen.length}/3)`} block disabled={chosen.length < 2} loading={ask.isPending} onPress={submit} style={{ flex: 1 }} />
          <Button label="Cancel" variant="quiet" onPress={() => router.back()} />
        </>
      }
    >
      <SheetLabel>Ask with</SheetLabel>
      <Tabs items={SOURCES} value={source} onChange={setSource} />
      {loading ? (
        <ArchSkeleton count={6} columns={cols} width={width - gutter * 2} />
      ) : pool.length === 0 ? (
        <EmptyState title={empty[source]} />
      ) : (
        <View style={styles.grid}>
          {pool.map((c) => {
            const idx = chosen.findIndex((x) => x.key === c.key)
            const asBoard = c.items && !(c.imageUrl && c.key.startsWith('l-'))
            return (
              <Press key={c.key} accessibilityRole="button" accessibilityLabel={idx >= 0 ? `Remove ${c.label}` : `Choose ${c.label}`} accessibilityState={{ selected: idx >= 0 }} onPress={() => pick(c)}>
                <View style={{ width: cell, gap: 4 }}>
                  {asBoard ? <LookBoard items={c.items ?? []} width={cell} aspect={4 / 5} selected={idx >= 0} /> : <PhotoArch uri={c.imageUrl ?? ''} width={cell} aspect={4 / 5} selected={idx >= 0} cover={!c.contain} />}
                  {idx >= 0 ? (
                    // `right-1.5 top-1.5 h-6 w-6 text-[11px] font-bold`
                    <View style={[styles.letter, { backgroundColor: t.brass, borderRadius: radius }]}>
                      <T role="label" style={{ fontFamily: fonts.sansSemi, color: t.onBrass, letterSpacing: 0 }} maxFontSizeMultiplier={1}>
                        {'ABC'[idx]}
                      </T>
                    </View>
                  ) : null}
                  <T role="micro" tone="faint" numberOfLines={1} align="center">
                    {c.label}
                  </T>
                </View>
              </Press>
            )
          })}
        </View>
      )}

      <Field label="The question" value={question} onChangeText={setQuestion} maxLength={140} placeholder="Which one should I wear? (optional)" accessibilityLabel="The question" />

      <SheetLabel>Ask</SheetLabel>
      <View style={styles.chips}>
        {AUDIENCES.map(([k, l]) => (
          <Chip key={k} label={l} on={audience === k} onPress={() => setAudience(k)} />
        ))}
      </View>
      {audience === 'friends' ? (
        <View style={{ gap: 8 }}>
          {people.data && people.data.following.length === 0 ? (
            <T role="caption" tone="faint">
              Follow a few people first; they’ll appear here.
            </T>
          ) : null}
          <View style={styles.chips}>
            {(people.data?.following ?? []).slice(0, 24).map((p) => (
              <Chip key={p.handle} label={p.name} on={friends.includes(p.handle)} onPress={() => setFriends((f) => (f.includes(p.handle) ? f.filter((x) => x !== p.handle) : f.length >= 8 ? f : [...f, p.handle]))} />
            ))}
          </View>
          <T role="caption" tone="faint">
            They’re told; the rest of the circle isn’t.
          </T>
        </View>
      ) : null}
      {audience === 'link' ? (
        <T role="caption" tone="faint">
          Only people with the link see it. You still see who voted, if they’re members.
        </T>
      ) : null}

      <SheetLabel>For</SheetLabel>
      <View style={styles.chips}>
        {EXPIRIES.map((e) => (
          <Chip key={e.key} label={e.label} on={expiry === e.key} onPress={() => setExpiry(e.key)} />
        ))}
      </View>
      {error ? <Alert>{error}</Alert> : null}
    </SheetShell>
  )
}

const GRID_GAP = 12

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  letter: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
