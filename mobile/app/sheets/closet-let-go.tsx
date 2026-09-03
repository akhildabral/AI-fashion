// Let it go: an idle piece gets a decision, not a shelf. Lend it, retire it,
// or draft the listing that sells it. Params: id.
import * as Clipboard from 'expo-clipboard'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { money } from '@zauq/shared/money'
import { getResaleDraft, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { nameOf, useInvalidateCloset, usePiece } from '@/src/features/closet/data'

type Choice = 'lent-out' | 'retired' | 'listing'
interface Draft {
  title: string
  body: string
  price?: string
}

/** A way out: the web's `card card-hover p-4`, a Bodoni line over a quiet one. */
function Way({ title, line, busy, disabled, onPress }: { title: string; line: string; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      pressRetentionOffset={12}
      onPress={onPress}
      style={({ pressed }) => [styles.way, { backgroundColor: t.surface, borderColor: pressed ? alpha(t.brass, 0.5) : alpha(t.ink, 0.1), borderRadius: radius, opacity: disabled && !busy ? 0.5 : 1 }]}
    >
      <T role="h3">{busy ? 'Drafting…' : title}</T>
      <T role="caption" tone="muted">
        {line}
      </T>
    </Pressable>
  )
}

export default function LetGoSheet() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const flash = useFlash()
  const invalidate = useInvalidateCloset()
  const piece = usePiece(id)
  const [busy, setBusy] = useState<Choice | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const item = piece.data

  async function setState(state: 'lent-out' | 'retired') {
    if (!item) return
    setBusy(state)
    try {
      await updateWardrobeItem(item.id, { state })
      haptics.success()
      invalidate(item.id)
      flash(state === 'lent-out' ? 'Marked lent out. It comes back from the basket.' : 'Retired. It stays in the ledger, out of the rotation.')
      router.back()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  async function listing() {
    if (!item) return
    setBusy('listing')
    try {
      const { draft: d } = await getResaleDraft(item.id)
      setDraft({ title: d.title, body: d.description, price: d.suggestedPrice || undefined })
    } catch {
      haptics.failure()
      flash('Could not draft a listing right now.')
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    if (!draft) return
    const text = `${draft.title}\n\n${draft.body}${draft.price ? `\n\n${money(Number(draft.price) || 0)}` : ''}`
    const ok = await Clipboard.setStringAsync(text).catch(() => false)
    if (ok) haptics.success()
    flash(ok ? 'Listing copied. Paste it where you sell.' : 'Could not copy.')
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <ScrollView contentContainerStyle={styles.content}>
        <T role="h2" accessibilityRole="header">
          {item ? `Let the ${nameOf(item)} go?` : 'Let it go'}
        </T>
        {piece.isError && !item ? <LoadError message="Could not open the piece." onRetry={() => void piece.refetch()} /> : null}
        {piece.isPending ? (
          <View style={styles.ways} accessibilityLabel="Loading" aria-busy>
            <SkeletonBlock height={74} />
            <SkeletonBlock height={74} />
            <SkeletonBlock height={74} />
          </View>
        ) : null}

        {item && !draft ? (
          <View style={styles.ways}>
            <T role="bodySm" tone="muted">
              It has been sitting. Three ways out, none of them final.
            </T>
            <Way title="Lend it out" line="Goes to the basket as lent out; one tap brings it back." disabled={busy !== null} onPress={() => void setState('lent-out')} />
            <Way title="Draft a listing" line="The stylist writes the resale post from the photo and the tags." busy={busy === 'listing'} disabled={busy !== null} onPress={() => void listing()} />
            <Way title="Retire it" line="Out of the rotation, kept in the ledger." disabled={busy !== null} onPress={() => void setState('retired')} />
          </View>
        ) : null}

        {draft ? (
          <Animated.View entering={fadeIn} style={styles.draft}>
            <T role="micro" tone="faint" style={styles.eyebrow}>
              Listing draft
            </T>
            <T role="h3" style={styles.line}>
              {draft.title}
            </T>
            {draft.price ? (
              <T role="bodySm" tone="brass" style={styles.line}>
                Ask {money(Number(draft.price) || 0)}
              </T>
            ) : null}
            <T role="bodySm" tone="muted" style={styles.body} selectable>
              {draft.body}
            </T>
            <View style={styles.actions}>
              <Button label="Copy the listing" size="sm" onPress={() => void copy()} />
              <Button label="Back" variant="ghost" size="sm" onPress={() => setDraft(null)} />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xxl },
  // The modal's p-5 under its title; the ways at gap-3
  ways: { gap: space.md, marginTop: 20 },
  way: { padding: space.lg, gap: space.xs, borderWidth: hairline },
  draft: { marginTop: 20 },
  // text-[10px] tracking-[0.2em]
  eyebrow: { letterSpacing: 2 },
  line: { marginTop: space.xs },
  body: { marginTop: space.sm },
  // mt-4 flex gap-2
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
})
