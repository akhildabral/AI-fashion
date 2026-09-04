// Dressing a friend, as a flow: who, which day, their public pieces with
// the stylist pairing alongside, a note, send.
import { useMutation, useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { dressSuggest, getNetwork, sendPick, type NetworkEntry } from '@zauq/shared/social'
import { Alert, EmptyState } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { Press } from '@/src/components/Press'
import { SheetShell } from '@/src/components/Sheet'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { invalidateFeeds } from '@/src/features/circle/cache'
import { ck } from '@/src/features/circle/keys'
import { PersonRow } from '@/src/features/circle/PersonRow'
import { SheetLabel } from '@/src/features/circle/SheetLabel'

const MAX = 8

const DAYS: { key: string; label: string }[] = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
  { key: 'work', label: 'A work day' },
  { key: 'occasion', label: 'An occasion' },
]

export default function StyleFriendSheet() {
  const { t } = useTheme()
  const flash = useFlash()
  const { width } = useWindowDimensions()
  const { handle: initialHandle } = useLocalSearchParams<{ handle?: string }>()
  const people = useQuery({ queryKey: ck.network, queryFn: getNetwork })
  const [picked, setPicked] = useState<NetworkEntry | null>(null)
  const [day, setDay] = useState('saturday')
  const [occasion, setOccasion] = useState('')
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')

  const friend: NetworkEntry | null =
    picked ??
    (initialHandle
      ? (people.data?.following.find((p) => p.handle === initialHandle) ?? people.data?.followers.find((p) => p.handle === initialHandle) ?? { handle: initialHandle, name: initialHandle, isFriend: true })
      : null)

  // Their closet, with the stylist's suggestions; re-asked when an anchor is chosen.
  const closet = useQuery({ queryKey: ck.dress(friend?.handle ?? '', anchor), queryFn: () => dressSuggest(friend?.handle ?? '', anchor ?? undefined), enabled: !!friend })
  const pieces = closet.data?.pieces ?? []
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const pairs = new Map((closet.data?.pairs ?? []).map((p) => [p.id, p.score]))
  const chosenItems = selected.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))

  function toggle(id: string) {
    haptics.select()
    const adding = !selected.includes(id)
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]))
    if (adding) setAnchor(id)
  }

  const forDay = day === 'occasion' ? occasion.trim() || 'an occasion' : (DAYS.find((d) => d.key === day)?.label ?? day)

  const send = useMutation({
    mutationFn: () => sendPick(friend?.handle ?? '', { itemIds: selected, note: note.trim() || undefined, forDay }),
    onSuccess: () => {
      invalidateFeeds()
      haptics.success()
      flash(`Sent to ${friend?.name}. They’ll see it on their table.`)
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not send that.')
    },
  })

  const cols = 4
  const cell = Math.floor((width - gutter * 2 - 8 * (cols - 1)) / cols)

  if (!friend) {
    return (
      <SheetShell dense title="Style a friend" lead="Friends you follow each other with, and anyone who came in on your invite." busy={people.isPending && !people.data}>
        {people.data && people.data.following.length === 0 ? <EmptyState title="Follow a few people first; they’ll appear here." /> : null}
        {people.data?.following.map((p, i) => (
          <PersonRow
            key={p.handle}
            handle={p.handle}
            name={p.name}
            sub={p.isFriend ? 'Friends, you follow each other' : 'You follow them'}
            first={i === 0}
            onPress={() => setPicked(p)}
            right={
              <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                Dress →
              </T>
            }
          />
        ))}
      </SheetShell>
    )
  }

  const anchorPiece = anchor ? byId.get(anchor) : undefined

  return (
    <SheetShell dense
      title={`Dress ${friend.name}`}
      footer={
        <>
          <Button label={`Send it to ${friend.name}`} block disabled={selected.length < 2} loading={send.isPending} onPress={() => send.mutate()} style={{ flex: 1 }} />
          {!initialHandle ? (
            <Button
              label="Someone else"
              variant="quiet"
              onPress={() => {
                setPicked(null)
                setSelected([])
                setAnchor(null)
              }}
            />
          ) : null}
        </>
      }
    >
      <SheetLabel>For</SheetLabel>
      <View style={styles.chips}>
        {DAYS.map((d) => (
          <Chip key={d.key} label={d.label} on={day === d.key} onPress={() => setDay(d.key)} />
        ))}
      </View>
      {day === 'occasion' ? <Field label="The occasion" value={occasion} onChangeText={setOccasion} maxLength={40} placeholder="a wedding, a dinner…" compact autoFocus accessibilityLabel="The occasion" /> : null}

      <SheetLabel
        right={
          <T role="caption" tone="faint">
            {`${selected.length}/${MAX} chosen`}
          </T>
        }
      >
        Their public closet
      </SheetLabel>
      {closet.isError ? <Alert>{closet.error instanceof Error ? closet.error.message : 'Could not open their closet.'}</Alert> : null}
      {closet.isPending && !closet.data ? <ArchSkeleton count={8} columns={cols} width={width - gutter * 2} /> : null}
      {closet.data && pieces.length < 2 ? <EmptyState title="They haven’t made enough pieces public yet." /> : null}
      {closet.data && pieces.length >= 2 ? (
        <>
          {anchorPiece ? (
            <T role="caption" tone="muted">
              {`The stylist says the ${anchorPiece.subtype ?? anchorPiece.category} goes with ${closet.data.pairs.length} of their pieces. They’re lit.`}
            </T>
          ) : null}
          <View style={styles.grid}>
            {pieces.map((p) => {
              const idx = selected.indexOf(p.id)
              const lit = anchor !== null && anchor !== p.id && pairs.has(p.id)
              const dimmed = anchor !== null && !lit && idx < 0 && anchor !== p.id
              return (
                <View key={p.id} style={{ width: cell, opacity: dimmed ? 0.5 : 1 }}>
                  <GarmentTile imageUrl={p.imageUrl} width={cell} selected={idx >= 0 || lit} badge={idx >= 0 ? String(idx + 1) : null} label={p.subtype ?? p.category} onPress={() => toggle(p.id)} accessibilityLabel={`${idx >= 0 ? 'Remove' : 'Choose'} ${p.subtype ?? p.category}`} />
                </View>
              )
            })}
          </View>
          {closet.data.outfits.length > 0 ? (
            <>
              <SheetLabel>The stylist suggests</SheetLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
                {closet.data.outfits.map((o, i) => {
                  const items = o.itemIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
                  const same = selected.length === o.itemIds.length && o.itemIds.every((id) => selected.includes(id))
                  return (
                    <Press
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={`Use this outfit of ${items.length} pieces`}
                      accessibilityState={{ selected: same }}
                      onPress={() => {
                        haptics.select()
                        setSelected([...o.itemIds])
                      }}
                    >
                      <View style={{ width: 96, gap: 4 }}>
                        <LookBoard items={items} width={96} aspect={4 / 5} selected={same} />
                        <T role="micro" tone="faint" align="center">
                          {`${items.length} pieces`}
                        </T>
                      </View>
                    </Press>
                  )
                })}
              </ScrollView>
            </>
          ) : null}
        </>
      ) : null}

      {chosenItems.length > 0 ? (
        <View style={[styles.preview, { borderRadius: radius, borderColor: t.brassSoft }]}>
          <LookBoard items={chosenItems} width={80} aspect={4 / 5} />
          <View style={{ flex: 1, gap: 8 }}>
            <T role="caption" tone="muted">
              {'For '}
              <T role="caption" style={{ fontFamily: fonts.sansSemi }}>
                {forDay}
              </T>
              {` · ${chosenItems.map((i) => i.subtype ?? i.category).join(', ')}`}
            </T>
            <Field label="A note" value={note} onChangeText={setNote} maxLength={280} placeholder="Why this works (optional)" compact accessibilityLabel="A note" />
          </View>
        </View>
      ) : null}
      {selected.length < 2 ? (
        <T role="caption" tone="faint">
          Pick at least two pieces to send a look.
        </T>
      ) : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Four across, 8 apart.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // The suggested boards, 12 apart, each 96 wide.
  suggestions: { flexDirection: 'row', gap: space.md, paddingBottom: space.xs },
  // The chosen pieces on an 80 board beside the note.
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
})
