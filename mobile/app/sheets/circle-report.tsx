// Report, from any card or room: a reason, an optional line, one send. The
// person reported never learns who sent it.
import { useMutation } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { REPORT_REASONS, report, type ReportReason, type ReportTarget } from '@zauq/shared/social'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Chip } from '@/src/components/Tabs'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { SheetFrame } from '@/src/features/circle/SheetFrame'

const TARGETS: ReportTarget[] = ['user', 'look', 'verdict', 'pick', 'comment']

export default function ReportSheet() {
  const flash = useFlash()
  const { type = 'user', id = '', label = '' } = useLocalSearchParams<{ type?: string; id?: string; label?: string }>()
  const targetType: ReportTarget = TARGETS.includes(type as ReportTarget) ? (type as ReportTarget) : 'user'
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')

  const send = useMutation({
    mutationFn: () => report({ targetType, targetId: id, reason: reason as ReportReason, detail: detail.trim() || undefined }),
    onSuccess: () => {
      haptics.success()
      flash('Thank you. The house will take a look.')
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not send that.')
    },
  })

  return (
    <SheetFrame
      title={label ? `Report ${label}` : 'Report'}
      lead="Tell the house what’s wrong. They won’t know it came from you."
      action={
        <>
          <Button label="Send report" block disabled={!reason || !id} loading={send.isPending} onPress={() => send.mutate()} style={{ flex: 1 }} />
          <Button label="Cancel" variant="quiet" onPress={() => router.back()} />
        </>
      }
    >
      <View style={styles.chips}>
        {REPORT_REASONS.map((r) => (
          <Chip key={r.key} label={r.label} on={reason === r.key} onPress={() => setReason(r.key)} />
        ))}
      </View>
      <Field value={detail} onChangeText={setDetail} maxLength={500} placeholder="Anything else that helps (optional)" accessibilityLabel="Anything else that helps" />
    </SheetFrame>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
})
