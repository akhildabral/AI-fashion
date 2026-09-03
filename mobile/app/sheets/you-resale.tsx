// Resale: turn a piece that isn't earning its place into a listing.
import { useQuery } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { getResaleDraft } from '@zauq/shared/wardrobe'
import { Arch } from '@/src/components/Arch'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { resolveImageUrl } from '@/src/lib/api'
import { youKeys } from '@/src/features/you/keys'
import { SheetShell } from '@/src/features/you/SheetShell'

export default function ResaleSheet() {
  const { item = '' } = useLocalSearchParams<{ item: string }>()
  const flash = useFlash()
  const [copied, setCopied] = useState(false)
  const q = useQuery({ queryKey: youKeys.resale(item), queryFn: () => getResaleDraft(item), enabled: !!item, staleTime: 10 * 60 * 1000 })
  const result = q.data

  async function copyAll() {
    if (!result) return
    const text = `${result.draft.title}\n\n${result.draft.description}\n\nAsking price: ${result.draft.suggestedPrice}`
    const ok = await Clipboard.setStringAsync(text).catch(() => false)
    if (!ok) return flash('Could not copy that.')
    haptics.success()
    setCopied(true)
    flash('Copied. Paste it into the listing.')
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <SheetShell title="A listing, drafted" foot={result ? <Button label={copied ? 'Copied' : 'Copy the listing'} block onPress={() => void copyAll()} /> : null}>
      {q.isError && !result ? (
        <LoadError message="Could not draft a listing." onRetry={() => void q.refetch()} />
      ) : !result ? (
        <View style={{ gap: space.md }} accessibilityLabel="Writing your listing">
          <T role="lede" tone="faint">
            Writing your listing…
          </T>
          <SkeletonBlock width="70%" height={20} />
          <SkeletonBlock height={80} />
          <SkeletonBlock width="50%" />
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={styles.top}>
            <Arch width={80} aspect={4 / 5}>
              <Image source={{ uri: resolveImageUrl(result.imageUrl) }} contentFit="contain" cachePolicy="disk" style={styles.image} accessible={false} />
            </Arch>
            <View style={{ flex: 1, gap: 4 }}>
              <T role="h3">{result.draft.title}</T>
              <T role="bodySm" tone="brass">
                Ask {result.draft.suggestedPrice}
              </T>
            </View>
          </View>
          <T role="bodySm" tone="muted">
            {result.draft.description}
          </T>
          <View style={{ gap: 4 }}>
            <T role="micro" tone="brass">
              Before you list
            </T>
            {result.draft.conditionChecklist.map((c) => (
              <T key={c} role="bodySm" tone="muted">
                · {c}
              </T>
            ))}
          </View>
        </View>
      )}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  image: { position: 'absolute', left: '8%', right: '8%', top: '9%', bottom: '7%' },
})
