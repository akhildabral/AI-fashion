// Recreate a look from your own closet: their pieces matched to yours, the
// pieces you'd still need, then the Mirror or a saved outfit.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { recreateFromCloset } from '@zauq/shared/brief'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { apiFetch } from '@/src/lib/api'
import { qk } from '@/src/lib/query'
import { Dashed, GarmentThumb, Plate } from '@/src/features/circle/atoms'
import { ck } from '@/src/features/circle/keys'
import { SheetFrame } from '@/src/features/circle/SheetFrame'

export default function RecreateSheet() {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const { items = '', who = 'them' } = useLocalSearchParams<{ items?: string; who?: string }>()
  const ids = items.split(',').filter(Boolean)
  const q = useQuery({ queryKey: ck.recreate(items), queryFn: () => recreateFromCloset(ids), enabled: ids.length > 0 })
  const result = q.data
  const matchIds = result?.pairs.map((p) => p.match.id) ?? []

  const save = useMutation({
    mutationFn: () => apiFetch('/outfits', { method: 'POST', body: { itemIds: matchIds, provenance: 'copied', rationale: `Recreated from ${who}’s look` } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.outfits })
      haptics.success()
      flash('Saved to your outfits.')
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not save.')
    },
  })

  return (
    <SheetFrame
      title={`In your closet, ${who}’s look`}
      busy={q.isPending && !result}
      action={
        result && result.pairs.length > 0 ? (
          <>
            <Button
              label="See it on me"
              block
              style={{ flex: 1 }}
              onPress={() => {
                router.back()
                router.push(`/(tabs)/mirror?items=${matchIds.join(',')}` as never)
              }}
            />
            <Button label="Save as outfit" variant="ghost" loading={save.isPending} onPress={() => save.mutate()} />
          </>
        ) : undefined
      }
    >
      {q.isError && !result ? (
        <Dashed>
          <T role="bodySm" tone="muted" align="center">
            {q.error instanceof Error ? q.error.message : 'Could not recreate that look.'}
          </T>
          <Button label="Try again" variant="ghost" size="sm" onPress={() => void q.refetch()} />
        </Dashed>
      ) : null}
      {result ? (
        <>
          {result.pairs.length > 0 ? (
            <View>
              {result.pairs.map((p, i) => (
                <View key={p.source.id} style={[styles.pair, i > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }]}>
                  <GarmentThumb item={{ id: p.source.id, imageUrl: p.source.imageUrl, subtype: p.source.label, category: p.source.label }} width={56} />
                  <T role="bodySm" tone="faint">
                    →
                  </T>
                  <GarmentThumb item={{ id: p.match.id, imageUrl: p.match.imageUrl, subtype: p.match.label, category: p.match.label }} width={56} selected />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T role="bodySm" numberOfLines={1} style={{ fontFamily: fonts.sansSemi, textTransform: 'capitalize' }}>
                      {p.match.label}
                    </T>
                    <T role="caption" tone="faint">
                      {`your ${p.match.label} for their ${p.source.label}`}
                    </T>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Dashed>
              <T role="bodySm" tone="muted" align="center">
                {`Nothing here matches this look yet${result.closetSize === 0 ? '. Your closet’s empty; add some pieces first.' : '.'}`}
              </T>
            </Dashed>
          )}
          {result.missing.length > 0 ? (
            <View style={[styles.missing, { borderColor: alpha(t.brass, 0.25), backgroundColor: alpha(t.brassSoft, 0.5), borderRadius: radius }]}>
              <Plate>To complete the look</Plate>
              {result.missing.map((m) => (
                <T key={m.source.id} role="bodySm" tone="muted">
                  {`· ${m.wanted || m.source.label}, not in your closet yet`}
                </T>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </SheetFrame>
  )
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  missing: { borderWidth: hairline, padding: 14, gap: 6, marginTop: 4 },
})
