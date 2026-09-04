// Build a trip look by hand: tap the pieces for it, from what you packed.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { getTrip, setTripLookItems } from '@zauq/shared/brief'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { gutter } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { PieceGrid } from '@/src/features/you/Pieces'
import { SheetShell } from '@/src/components/Sheet'

export default function TripPickSheet() {
  const router = useRouter()
  const flash = useFlash()
  const { width } = useWindowDimensions()
  const params = useLocalSearchParams<{ id: string; index: string; look: string; selected?: string }>()
  const id = params.id ?? ''
  const index = Number(params.index ?? 0)
  const lookId = params.look ?? ''
  const [selected, setSelected] = useState<string[]>(() => (params.selected ? params.selected.split(',').filter(Boolean) : []))
  const q = useQuery({ queryKey: qk.trip(id), queryFn: () => getTrip(id), enabled: !!id })
  const capsule = q.data?.capsule ?? null

  const save = useMutation({
    mutationFn: () => setTripLookItems(id, index, lookId, selected),
    onSuccess: () => {
      haptics.success()
      void queryClient.invalidateQueries({ queryKey: qk.trip(id) })
      flash('Look built.')
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not save that look.')
    },
  })

  return (
    <SheetShell dense
      title="Build this look"
      lead="Tap the pieces for this look, from what you packed."
      footer={<Button label={`Use ${selected.length} piece${selected.length === 1 ? '' : 's'}`} block disabled={selected.length === 0} loading={save.isPending} onPress={() => save.mutate()} />}
    >
      {q.isError && !capsule ? (
        <LoadError message="Could not open the capsule." onRetry={() => void q.refetch()} />
      ) : !capsule ? (
        <ArchSkeleton count={6} columns={3} width={width - gutter * 2} />
      ) : (
        <PieceGrid items={capsule} selected={selected} onToggle={(pid) => setSelected((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]))} />
      )}
    </SheetShell>
  )
}
