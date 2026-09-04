// Let it go: an idle piece gets a decision, not a shelf. Lend it, retire it,
// or draft the listing that sells it. Params: id.
import * as Clipboard from 'expo-clipboard'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { money } from '@zauq/shared/money'
import { getResaleDraft, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { Card, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Press } from '@/src/components/Press'
import { SheetShell } from '@/src/components/Sheet'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { nameOf, useInvalidateCloset, usePiece } from '@/src/features/closet/data'

type Choice = 'lent-out' | 'retired' | 'listing'
interface Draft {
  title: string
  body: string
  price?: string
}

/** A way out: a card that is wholly a button, a Bodoni line over a quiet one. */
function Way({ title, line, busy, disabled, onPress }: { title: string; line: string; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      haptic="select"
      onPress={onPress}
      style={disabled && !busy ? styles.dimmed : undefined}
    >
      <Card style={styles.way}>
        <T role="h3">{busy ? 'Drafting…' : title}</T>
        <T role="caption" tone="muted">
          {line}
        </T>
      </Card>
    </Press>
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
    <SheetShell title={item ? `Let the ${nameOf(item)} go?` : 'Let it go'} lead={item && !draft ? 'It has been sitting. Three ways out, none of them final.' : undefined}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      {piece.isError && !item ? <LoadError message="Could not open the piece." onRetry={() => void piece.refetch()} /> : null}
      {piece.isPending ? (
        <View style={styles.ways} accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
          <SkeletonBlock height={74} />
          <SkeletonBlock height={74} />
          <SkeletonBlock height={74} />
        </View>
      ) : null}

      {item && !draft ? (
        <View style={styles.ways}>
          <Way title="Lend it out" line="Goes to the basket as lent out; one tap brings it back." disabled={busy !== null} onPress={() => void setState('lent-out')} />
          <Way title="Draft a listing" line="The stylist writes the resale post from the photo and the tags." busy={busy === 'listing'} disabled={busy !== null} onPress={() => void listing()} />
          <Way title="Retire it" line="Out of the rotation, kept in the ledger." disabled={busy !== null} onPress={() => void setState('retired')} />
        </View>
      ) : null}

      {draft ? (
        <Animated.View entering={fadeIn} style={styles.draft}>
          <View style={styles.draftHead}>
            <T role="label" tone="faint">
              Listing draft
            </T>
            <T role="h3">{draft.title}</T>
            {draft.price ? (
              <T role="bodySm" style={styles.semi}>
                Ask {money(Number(draft.price) || 0)}
              </T>
            ) : null}
          </View>
          <T role="bodySm" tone="muted" selectable>
            {draft.body}
          </T>
          <View style={styles.actions}>
            <Button label="Copy the listing" size="sm" onPress={() => void copy()} />
            <Button label="Back" variant="ghost" size="sm" onPress={() => setDraft(null)} />
          </View>
        </Animated.View>
      ) : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  // The ways 8 apart; a line 4 under its title.
  ways: { gap: space.sm },
  way: { gap: space.xs },
  dimmed: { opacity: 0.5 },
  // The draft: the head, the body 16 beneath, the actions 16 beneath.
  draft: { gap: space.lg },
  draftHead: { gap: space.sm },
  semi: { fontFamily: fonts.sansSemi },
  actions: { flexDirection: 'row', columnGap: space.lg, rowGap: space.sm, flexWrap: 'wrap' },
})
