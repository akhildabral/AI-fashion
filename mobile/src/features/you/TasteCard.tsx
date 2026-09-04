// Your taste: what the record has taught the stylist, said back in plain
// sentences the member can strike. Ten mornings in it starts to speak; until
// then the fitting does. The web's TasteCard: a section head, the facts as
// hairline rows each with a quiet "Not quite", and a row of three stats.
import { useMutation, useQuery } from '@tanstack/react-query'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { dismissTasteFact, formalityLean, getTaste } from '@zauq/shared/taste'
import type { TasteFact, TasteResponse } from '@zauq/shared/types'
import { EmptyState, SectionHead, Stat } from '@/src/components/Bits'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { Card, TextLink } from '@/src/features/you/Furniture'

const COLD_LINE = 'Ten mornings in, I’ll know your taste. For now I go by your fitting.'

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function TasteCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const flash = useFlash()
  const { data, isError, isPending } = useQuery({ queryKey: qk.taste, queryFn: getTaste })
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissTasteFact(id),
    onSuccess: (next: TasteResponse) => {
      queryClient.setQueryData(qk.taste, next)
      flash('Noted. I won’t say that again.')
    },
    onError: (err: unknown) => flash(err instanceof Error ? err.message : 'Could not note that just now.'),
  })

  const profile = data?.profile
  const lean = formalityLean(profile?.formalityOffset)
  const favourite = profile?.colourAffinity.favourite ?? null

  return (
    <View style={style}>
      <SectionHead label="What I’ve learned" title="Your taste" />
      <Card padding="form" style={styles.card}>
        {isPending && !data ? (
          <View accessibilityLabel="Reading the record" style={styles.skeleton}>
            <SkeletonBlock width="75%" />
            <SkeletonBlock width="66%" />
            <SkeletonBlock width="50%" />
          </View>
        ) : null}
        {isError && !data ? (
          <T role="lede" italic tone="muted">
            The record is out of reach for a moment. Try again in a few seconds.
          </T>
        ) : null}
        {data?.coldStart ? (
          <>
            <T role="lede" italic tone="muted">
              {COLD_LINE}
            </T>
            {data.signals.length > 0 ? (
              <T role="bodySm" tone="muted" style={styles.mt4}>
                From the fitting: {data.signals.join(', ')}.
              </T>
            ) : null}
          </>
        ) : null}
        {data && !data.coldStart && profile ? (
          <>
            {profile.facts.length === 0 ? (
              <EmptyState title="Nothing worth saying yet." line="A few more mornings and the record will speak." style={styles.empty} />
            ) : (
              <View>
                {profile.facts.map((f, i) => (
                  <FactRow key={f.id} fact={f} first={i === 0} busy={dismiss.isPending && dismiss.variables === f.id} onNotQuite={() => dismiss.mutate(f.id)} />
                ))}
              </View>
            )}
            <StatsRow wears={profile.sampleSize} favourite={favourite} lean={lean} />
          </>
        ) : null}
      </Card>
    </View>
  )
}

/** A fact on its own hairline row, the quiet "Not quite" at its right. */
function FactRow({ fact, first, busy, onNotQuite }: { fact: TasteFact; first: boolean; busy: boolean; onNotQuite: () => void }) {
  const { t } = useTheme()
  return (
    <View style={[styles.row, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: first ? 0 : hairline }]}>
      <T role="body" style={styles.rowText}>
        {fact.text}
      </T>
      <TextLink label={busy ? '…' : 'Not quite'} tone="muted" disabled={busy} onPress={onNotQuite} />
    </View>
  )
}

function StatsRow({ wears, favourite, lean }: { wears: number; favourite: string | null; lean: string | null }) {
  const { t } = useTheme()
  return (
    <View style={[styles.stats, { borderTopColor: alpha(t.ink, 0.1) }]}>
      <Stat small value={wears} label="wears learned from" />
      <Stat small value={favourite ? capitalise(favourite) : 'None yet'} label="favourite colour" />
      <Stat small value={lean ?? 'As laid out'} label="formality lean" />
    </View>
  )
}

const styles = StyleSheet.create({
  // The head, its card 16 beneath (the web's SectionHead mb-4).
  card: { marginTop: space.lg },
  skeleton: { gap: space.lg },
  mt4: { marginTop: space.lg },
  empty: { paddingVertical: space.lg },
  // A row is at least 44 tall, 12 of padding, the text and the action 16 apart.
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.lg, minHeight: 44, paddingVertical: space.md },
  rowText: { flex: 1 },
  // The stats a block (32) below the facts, on their own hairline, 40 apart.
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxxl, marginTop: space.xxl, paddingTop: space.lg, borderTopWidth: hairline },
})
