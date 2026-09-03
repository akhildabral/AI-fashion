// The dossier: one garment in its niche, every fact in order with its
// source, its story and what it goes with beneath. Tap a fact to change it.
import { useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated from 'react-native-reanimated'
import { money } from '@zauq/shared/money'
import type { WardrobeItem, WardrobeItemEdit, WardrobeItemResponse } from '@zauq/shared/types'
import { recatalogWardrobeItem, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { LoadError, Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { MoreGlyph } from '@/src/components/Glyphs'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionBar, ACTION_BAR_HEIGHT } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk } from '@/src/lib/query'
import { formatDay, nameOf, title, useInvalidateCloset, usePiece, useStory } from '@/src/features/closet/data'
import { FactRow } from '@/src/features/closet/FactRow'
import { CUT_FOR, factsFor, GROUPS, STATES, valueOf, type Fact } from '@/src/features/closet/facts'
import { GoesWith } from '@/src/features/closet/GoesWith'
import { Menu, type MenuItem } from '@/src/features/closet/Menu'
import { PieceStory } from '@/src/features/closet/PieceStory'
import { shareCard } from '@/src/features/closet/share'
import { TwinBanner } from '@/src/features/closet/TwinBanner'

type Tab = 'facts' | 'story' | 'goes'

/** The web's hero: `max-w-[260px]`, centred, at 4/5. */
const HERO_MAX = 260

export default function Piece() {
  const { id = '', fact: openFrom } = useLocalSearchParams<{ id: string; fact?: string }>()
  const { t } = useTheme()
  const { width } = useWindowDimensions()
  const flash = useFlash()
  const qc = useQueryClient()
  const invalidate = useInvalidateCloset()
  const piece = usePiece(id)
  const story = useStory(id)

  const [tab, setTab] = useState<Tab>('facts')
  const [openFact, setOpenFact] = useState<string | null>(openFrom ?? null)
  const [original, setOriginal] = useState(false)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const item = piece.data

  function put(updated: WardrobeItem) {
    qc.setQueryData<WardrobeItemResponse>(qk.piece(updated.id), (prev) => ({ ...prev, item: updated }))
  }

  async function save(patch: WardrobeItemEdit, note = 'Saved.') {
    if (!item) return
    try {
      const { item: updated } = await updateWardrobeItem(item.id, patch)
      put(updated)
      invalidate()
      flash(note)
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not save that.')
    }
  }

  async function saveFact(fact: Fact, value: unknown) {
    if (!item) return
    if (fact.detail) {
      const details = { ...(item.details ?? {}) }
      if (value == null || value === '') delete details[fact.key]
      else details[fact.key] = String(value)
      await save({ details })
    } else await save({ [fact.key]: value } as WardrobeItemEdit)
    if (fact.kind !== 'multi') setOpenFact(null)
  }

  async function reread() {
    if (!item) return
    setBusy('reread')
    try {
      const { item: updated } = await recatalogWardrobeItem(item.id)
      put(updated)
      flash('Reading the photo again. Facts you set stay yours.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read it again.')
    } finally {
      setBusy(null)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([piece.refetch(), story.refetch()]).catch(() => undefined)
    setRefreshing(false)
  }

  const heroW = Math.min(width - gutter * 2, HERO_MAX)
  const name = item ? title(nameOf(item)) : 'A piece'

  if (piece.isError && !item) {
    return (
      <Screen edges={[]} padded>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <LoadError message="Could not open the piece." onRetry={() => void piece.refetch()} />
        <Button label="The closet" variant="ghost" onPress={() => router.navigate('/closet')} style={{ alignSelf: 'center' }} />
      </Screen>
    )
  }

  if (!item) {
    return (
      <Screen edges={[]} padded>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.skeleton} accessibilityLabel="Loading the piece" aria-busy>
          <View style={styles.hero}>
            <ArchSkeleton count={1} width={heroW} columns={1} />
          </View>
          <View style={styles.skeletonText}>
            <SkeletonBlock width={96} height={16} />
            <SkeletonBlock width="75%" height={48} />
            <SkeletonBlock width={160} height={36} />
            <View style={[styles.skeletonRows, { borderTopColor: alpha(t.ink, 0.1) }]}>
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonBlock key={i} height={16} />
              ))}
            </View>
          </View>
        </View>
      </Screen>
    )
  }

  const hasOriginal = Boolean(item.originalUrl && item.originalUrl !== item.imageUrl)
  const cut = CUT_FOR.find(([k]) => k === item.cutFor)?.[1]
  const cutGuess = (item.attrConfidence?.cutFor ?? 1) < 0.5
  const facts = factsFor(item)
  const unsure = facts.filter((f) => !f.yours && !f.detail && valueOf(item, f) == null).length
  const s = story.data
  const dark = item.state === 'in-wash' || item.state === 'lent-out'

  const menuItems: MenuItem[] = [
    { label: 'Read the photo again', disabled: busy === 'reread' || item.status === 'processing', onPress: () => void reread() },
    { label: item.state === 'in-wash' ? 'Back from the wash' : 'Into the wash', onPress: () => void save({ state: item.state === 'in-wash' ? 'clean' : 'in-wash' }, item.state === 'in-wash' ? 'Back in rotation.' : 'In the basket.') },
    { label: item.state === 'lent-out' ? 'It’s back' : 'Lend it out', onPress: () => void save({ state: item.state === 'lent-out' ? 'clean' : 'lent-out' }, item.state === 'lent-out' ? 'Back in rotation.' : 'Marked lent out.') },
    { label: item.visibility === 'public' ? 'Make it private' : 'Show it in your room', onPress: () => void save({ visibility: item.visibility === 'public' ? 'private' : 'public' }) },
    { label: item.suppressed ? 'Suggest it again' : 'Don’t suggest it', onPress: () => void save({ suppressed: !item.suppressed }) },
    {
      label: 'Share',
      section: true,
      onPress: () => {
        shareCard('piece', item.id, `${name} from my closet`).catch((err) => flash(err instanceof Error ? err.message : 'Could not prepare the card.'))
      },
    },
    { label: 'Let it go', onPress: () => router.push(`/sheets/closet-let-go?id=${item.id}`) },
    { label: 'Remove from the closet', danger: true, onPress: () => router.push(`/sheets/closet-remove?id=${item.id}`) },
  ]

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: name,
          headerRight: () => (
            <Button
              variant="icon"
              accessibilityLabel="More"
              icon={<MoreGlyph />}
              onPress={() => setMenu(true)}
            />
          ),
        }}
      />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.brass} />}
        contentContainerStyle={[styles.content, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]}
      >
        {/* the piece, in its niche */}
        <Animated.View entering={rise(0)} style={styles.hero}>
          <GarmentTile
            imageUrl={original && item.originalUrl ? item.originalUrl : item.imageUrl}
            width={heroW}
            aspect={4 / 5}
            photo={original}
            processing={item.status === 'processing'}
            sweep
            accessibilityLabel={name}
          />
          {hasOriginal ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOriginal((v) => !v)} style={styles.original}>
              <T role="caption" tone="brass" align="center" style={styles.semi}>
                {original ? 'The cut-out' : 'The original photo'}
              </T>
            </Pressable>
          ) : null}
        </Animated.View>

        <Animated.View entering={rise(1)} style={styles.dossier}>
          <View style={styles.chips}>
            <Chip label={title(item.category)} on={false} onPress={() => { setTab('facts'); setOpenFact('category') }} />
            {cut ? (
              <Chip
                label={`Cut for ${cut.toLowerCase()}${cutGuess ? ' ?' : ''}`}
                on={!cutGuess}
                onPress={() => {
                  setTab('facts')
                  setOpenFact('cutFor')
                }}
              />
            ) : null}
            <Chip label={STATES[item.state] ?? title(item.state)} on={false} onPress={() => setMenu(true)} />
            <Chip label={item.visibility === 'public' ? 'Public' : 'Private'} on={false} onPress={() => void save({ visibility: item.visibility === 'public' ? 'private' : 'public' })} />
            {item.suppressed ? <Chip label="Not suggested" on={false} onPress={() => void save({ suppressed: false })} /> : null}
          </View>
          <T role="h1" accessibilityRole="header" style={styles.title}>
            {item.primaryColor ? `${title(item.primaryColor)} ` : ''}
            <T role="h1" tone="brass" italic>
              {`${name.toLowerCase()}.`}
            </T>
          </T>
          {item.description ? (
            <T role="lede" tone="muted" style={styles.description}>
              {item.description}
            </T>
          ) : null}
          {dark ? (
            <T role="caption" tone="faint" style={styles.description}>
              Out of rotation: the stylist works around it until it’s back.
            </T>
          ) : null}
        </Animated.View>

        {item.twinOfId ? (
          <Animated.View entering={rise(2)} style={styles.section}>
            <TwinBanner
              item={item}
              onNote={flash}
              onResolved={(kept) => {
                if (kept) router.replace(`/closet/piece/${kept.id}`)
                else void piece.refetch()
              }}
            />
          </Animated.View>
        ) : null}

        {/* The record, in three figures */}
        <Animated.View entering={rise(2)} style={styles.section}>
          <Plaque style={styles.record}>
            <View style={styles.recordCol} accessible accessibilityLabel={`${s ? s.wearCount : 'unknown'} wears`}>
              <T role="statSm">{s ? String(s.wearCount) : '–'}</T>
              <T role="micro" tone="faint" style={styles.recordLabel}>
                wears
              </T>
            </View>
            <View style={styles.recordCol} accessible accessibilityLabel={`last worn ${s?.lastWorn ? formatDay(s.lastWorn) : 'never'}`}>
              <T role="statSm" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {s ? (s.lastWorn ? formatDay(s.lastWorn) : 'never') : '–'}
              </T>
              <T role="micro" tone="faint" style={styles.recordLabel}>
                last worn
              </T>
            </View>
            <View style={styles.recordCol}>
              {s?.costPerWear != null ? (
                <T role="statSm" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {money(s.costPerWear)}
                </T>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setTab('facts')
                    setOpenFact('price')
                  }}
                >
                  <T role="lede" tone="brass" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    Add what it cost
                  </T>
                </Pressable>
              )}
              <T role="micro" tone="faint" style={styles.recordLabel}>
                a wear
              </T>
            </View>
          </Plaque>
        </Animated.View>

        <Animated.View entering={rise(3)} style={styles.tabs}>
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'facts', label: 'The facts', count: unsure || undefined },
              { key: 'story', label: 'The story' },
              { key: 'goes', label: 'Goes with' },
            ]}
          />
        </Animated.View>

        {tab === 'facts' ? (
          <Animated.View key="facts" entering={fadeIn} style={styles.panel}>
            {unsure > 0 ? (
              <T role="caption" tone="faint" style={styles.unsure}>
                {unsure} {unsure === 1 ? 'fact' : 'facts'} the photo couldn’t settle. Tap one to answer it; the stylist works either way.
              </T>
            ) : null}
            <View style={styles.groups}>
              {GROUPS.map((g) => {
                const rows = facts.filter((f) => f.group === g)
                if (rows.length === 0) return null
                return (
                  <View key={g}>
                    <T role="micro" tone="brass" style={styles.groupLabel}>
                      {g}
                    </T>
                    <View style={[styles.card, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
                      {rows.map((f, i) => (
                        <FactRow key={f.key} item={item} fact={f} first={i === 0} open={openFact === f.key} onOpen={() => setOpenFact((cur) => (cur === f.key ? null : f.key))} onSave={(v) => saveFact(f, v)} />
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
          </Animated.View>
        ) : null}

        {tab === 'story' ? (
          <Animated.View key="story" entering={fadeIn} style={styles.panel}>
            <PieceStory itemId={item.id} />
          </Animated.View>
        ) : null}

        {tab === 'goes' ? (
          <Animated.View key="goes" entering={fadeIn} style={styles.goes}>
            <GoesWith itemId={item.id} />
            <T role="caption" tone="faint" style={styles.goesNote}>
              Only pieces on the same side of the line: {cut ? `cut for ${cut.toLowerCase()}` : 'yours'}, or for anyone.
            </T>
          </Animated.View>
        ) : null}
      </KeyboardAwareScrollView>

      <ActionBar>
        <Button label="Try it on" block style={{ flex: 1 }} onPress={() => router.push(`/(tabs)/mirror?items=${item.id}`)} />
        <Button label="Style it" variant="ghost" onPress={() => router.push(`/closet/compose?pin=${item.id}`)} />
      </ActionBar>

      <Menu open={menu} title={name} items={menuItems} onClose={() => setMenu(false)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.lg },
  skeleton: { paddingTop: space.lg },
  skeletonText: { marginTop: space.xxl, gap: space.lg },
  // mt-4 border-t pt-5 gap-3
  skeletonRows: { marginTop: space.lg, paddingTop: 20, borderTopWidth: hairline, gap: space.md },
  // The web's ··· trigger: text-lg leading-none tracking-tight.
  dots: { letterSpacing: -1 },
  semi: { fontFamily: fonts.sansSemi },
  hero: { alignItems: 'center' },
  original: { marginTop: space.sm },
  // The grid's gap-8 under the hero
  dossier: { paddingTop: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { marginTop: space.md },
  description: { marginTop: space.md },
  // mt-6 for the twin banner and the record
  section: { paddingTop: space.xl },
  // plaque grid-cols-3 gap-3 p-4 pl-5
  record: { flexDirection: 'row', gap: space.md, padding: space.lg, paddingLeft: 20 },
  recordCol: { flex: 1, minWidth: 0 },
  recordLabel: { marginTop: 2 },
  // mt-8 for the tabs, mt-4 for what they show
  tabs: { paddingTop: space.xxl },
  panel: { paddingTop: space.lg },
  unsure: { marginBottom: space.md },
  // each group mb-6
  groups: { gap: space.xl },
  // mb-1 text-[10px] tracking-[0.2em]
  groupLabel: { letterSpacing: 2, marginBottom: space.xs },
  card: { paddingHorizontal: space.lg, borderWidth: hairline },
  // mt-2, then GoesWith's own mt-5 and the note mt-3
  goes: { paddingTop: space.sm },
  goesNote: { marginTop: space.md },
})
