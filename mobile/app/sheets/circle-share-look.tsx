// Share a look: your recent wears, put on the circle as the pieces, or with
// a photo of you in it (from the camera roll or a Mirror render).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { clearLookPhoto, getMyRecentLooks, setLookPhotoFromRender, shareLook, unshareLook, type MyLook } from '@zauq/shared/circle'
import { getTryOns } from '@zauq/shared/tryon'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { apiUpload } from '@/src/lib/api'
import { qk } from '@/src/lib/query'
import { imageForm, PermissionDenied, pickImages } from '@/src/lib/upload'
import { GarmentThumb, PhotoArch } from '@/src/features/circle/atoms'
import { invalidateFeeds } from '@/src/features/circle/cache'
import { ck } from '@/src/features/circle/keys'
import { MenuSheet } from '@/src/components/MenuSheet'
import { SheetShell } from '@/src/components/Sheet'

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ShareLookSheet() {
  const { t } = useTheme()
  const flash = useFlash()
  const queryClient = useQueryClient()
  const looks = useQuery({ queryKey: ck.mine, queryFn: getMyRecentLooks })
  const renders = useQuery({ queryKey: qk.tryons, queryFn: getTryOns })
  const ready = (renders.data?.tryOns ?? []).filter((r) => r.status === 'ready' && r.imageUrl)
  const [pickingRender, setPickingRender] = useState<string | null>(null)
  const [photoFor, setPhotoFor] = useState<string | null>(null)

  const patch = (id: string, fn: (l: MyLook) => MyLook) => {
    queryClient.setQueryData<{ looks: MyLook[] }>(ck.mine, (d) => (d ? { looks: d.looks.map((l) => (l.id === id ? fn(l) : l)) } : d))
    invalidateFeeds()
    void queryClient.invalidateQueries({ queryKey: ['user'] })
  }

  const run = useMutation({
    mutationFn: async ({ work }: { id: string; work: () => Promise<void> }) => work(),
    onError: (err) => {
      haptics.failure()
      flash(err instanceof PermissionDenied ? err.message : err instanceof Error ? err.message : 'That did not go through.')
    },
  })
  const busy = run.isPending ? run.variables?.id : null

  const toggleShare = (look: MyLook) =>
    run.mutate({
      id: look.id,
      work: async () => {
        if (look.shared) await unshareLook(look.id)
        else await shareLook(look.id)
        patch(look.id, (l) => ({ ...l, shared: !l.shared }))
        haptics.success()
        flash(look.shared ? 'Taken down.' : 'On the circle.')
      },
    })
  const addPhoto = (id: string, source: 'camera' | 'library') =>
    run.mutate({
      id,
      work: async () => {
        const [image] = await pickImages(source)
        if (!image) return
        const { photoUrl } = await apiUpload<{ photoUrl: string }>(`/looks/${id}/photo`, imageForm('photo', image))
        patch(id, (l) => ({ ...l, photoUrl }))
        haptics.success()
      },
    })
  const pickRender = (id: string, tryOnId: string) =>
    run.mutate({
      id,
      work: async () => {
        const { photoUrl } = await setLookPhotoFromRender(id, tryOnId)
        patch(id, (l) => ({ ...l, photoUrl }))
        setPickingRender(null)
        haptics.success()
      },
    })
  const removePhoto = (id: string) =>
    run.mutate({
      id,
      work: async () => {
        await clearLookPhoto(id)
        patch(id, (l) => ({ ...l, photoUrl: null }))
      },
    })

  const list = looks.data?.looks

  return (
    <SheetShell dense title="Share a look" lead="Your recent wears. Put one on the circle as the pieces, or add a photo of you in it." busy={looks.isPending && !list}>
      {looks.isError && !list ? <LoadError message="Couldn’t load your recent wears." onRetry={() => void looks.refetch()} /> : null}
      {list && list.length === 0 ? (
        <EmptyState
          title="Nothing logged in the last two weeks."
          action={
            <Button
              label="Wear today’s brief"
              onPress={() => {
                router.back()
                router.push('/(tabs)/today')
              }}
            />
          }
        />
      ) : null}
      {list?.map((l, i) => (
        // The web's list: `gap-3`, each after the first `border-t pt-3`
        <View key={l.id} style={[styles.look, i > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1), paddingTop: 12 }]}>
          <View style={styles.row}>
            {l.photoUrl ? (
              <PhotoArch uri={l.photoUrl} width={44} />
            ) : (
              <View style={styles.thumbs}>
                {l.items.slice(0, 3).map((it) => (
                  <GarmentThumb key={it.id} item={it} width={44} />
                ))}
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <T role="bodySm" style={{ fontFamily: fonts.sansSemi }}>
                {dayLabel(l.wornOn)}
              </T>
              <T role="caption" tone="faint">
                {`${l.items.length} piece${l.items.length === 1 ? '' : 's'}${l.eventType ? ` · ${l.eventType}` : ''}${l.shared ? ' · on the circle' : ''}${l.photoUrl ? ' · with photo' : ''}`}
              </T>
            </View>
            <Button label={l.shared ? 'Take down' : 'Share'} variant={l.shared ? 'ghost' : 'primary'} size="sm" loading={busy === l.id} onPress={() => toggleShare(l)} />
          </View>
          <View style={styles.links}>
            {l.photoUrl ? (
              <>
                <Press accessibilityRole="button" accessibilityLabel="Change photo" visual={16} onPress={() => setPhotoFor(l.id)}>
                  <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                    Change photo
                  </T>
                </Press>
                <Press accessibilityRole="button" accessibilityLabel="Remove photo" visual={16} onPress={() => removePhoto(l.id)}>
                  <T role="caption" tone="faint" style={{ fontFamily: fonts.sansSemi }}>
                    Remove photo
                  </T>
                </Press>
              </>
            ) : (
              <>
                <Press accessibilityRole="button" accessibilityLabel="Add a photo" visual={16} onPress={() => setPhotoFor(l.id)}>
                  <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                    Add a photo
                  </T>
                </Press>
                {ready.length > 0 ? (
                  <Press accessibilityRole="button" accessibilityLabel="Use a Mirror render" visual={16} onPress={() => setPickingRender(pickingRender === l.id ? null : l.id)}>
                    <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
                      {pickingRender === l.id ? 'Cancel' : 'Use a Mirror render'}
                    </T>
                  </Press>
                ) : null}
              </>
            )}
          </View>
          {pickingRender === l.id ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.renders}>
              {ready.slice(0, 12).map((r) => (
                <Press key={r.id} accessibilityRole="button" accessibilityLabel="Use this render" onPress={() => pickRender(l.id, r.id)}>
                  <PhotoArch uri={r.imageUrl} width={56} />
                </Press>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ))}
      <MenuSheet
        open={photoFor !== null}
        title="A photo of you in it"
        onClose={() => setPhotoFor(null)}
        items={[
          { label: 'Take a photo', onPress: () => photoFor && addPhoto(photoFor, 'camera') },
          { label: 'Choose from your photos', onPress: () => photoFor && addPhoto(photoFor, 'library') },
        ]}
      />
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  look: { gap: space.sm },
  // The thumbs, the day and the line, the Share: 12 apart; the thumbs 6 apart.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumbs: { flexDirection: 'row', gap: 6 },
  // The quiet links, 12 apart, on a 32 line.
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs, paddingLeft: 2, minHeight: 32, alignItems: 'center' },
  renders: { flexDirection: 'row', gap: space.sm, paddingBottom: space.xs },
})
