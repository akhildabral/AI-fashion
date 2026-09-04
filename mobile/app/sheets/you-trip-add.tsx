// Add pieces from the closet to a trip's capsule.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { getTrip, updateTrip } from '@zauq/shared/brief'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { gutter, space } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { PieceGrid } from '@/src/features/you/Pieces'
import { SheetShell } from '@/src/components/Sheet'

export default function TripAddSheet() {
  const router = useRouter()
  const flash = useFlash()
  const { width } = useWindowDimensions()
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const [picked, setPicked] = useState<string[]>([])
  const tripQ = useQuery({ queryKey: qk.trip(id), queryFn: () => getTrip(id), enabled: !!id })
  const wardrobeQ = useQuery({ queryKey: qk.wardrobe, queryFn: getWardrobe })
  const packed = new Set(tripQ.data?.trip.packedItemIds ?? [])
  const pieces = tripQ.data && wardrobeQ.data ? wardrobeQ.data.items.filter((i) => i.status === 'ready' && !packed.has(i.id)) : null

  const add = useMutation({
    mutationFn: () => updateTrip(id, { packedItemIds: [...(tripQ.data?.trip.packedItemIds ?? []), ...picked] }),
    onSuccess: () => {
      haptics.success()
      void queryClient.invalidateQueries({ queryKey: qk.trip(id) })
      void queryClient.invalidateQueries({ queryKey: qk.trips })
      flash(`${picked.length} more packed.`)
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not pack that.')
    },
  })

  const failed = (tripQ.isError || wardrobeQ.isError) && !pieces
  return (
    <SheetShell dense title="Add from the closet" footer={pieces && pieces.length > 0 ? <Button label={picked.length ? `Pack ${picked.length} more` : 'Pack'} block disabled={picked.length === 0} loading={add.isPending} onPress={() => add.mutate()} /> : null}>
      {failed ? (
        <LoadError message="Could not open the closet." onRetry={() => { void tripQ.refetch(); void wardrobeQ.refetch() }} />
      ) : !pieces ? (
        // The shape of the closet arriving: eight arches, four across.
        <ArchSkeleton count={8} columns={4} width={width - gutter * 2} />
      ) : pieces.length === 0 ? (
        <EmptyState title="Everything you own is already packed." />
      ) : (
        <PieceGrid items={pieces} selected={picked} columns={4} gap={space.sm} onToggle={(pid) => setPicked((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]))} />
      )}
    </SheetShell>
  )
}
