// Report, from any card or room: a reason, an optional line, one send. The
// person reported never learns who sent it.
import { useMutation } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { REPORT_REASONS, report, type ReportReason, type ReportTarget } from '@zauq/shared/social'
import { Button } from '@/src/components/Button'
import { Chip } from '@/src/components/Tabs'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { SheetFrame } from '@/src/features/circle/SheetFrame'

const TARGETS: ReportTarget[] = ['user', 'look', 'verdict', 'pick', 'comment']

export default function ReportSheet() {
  const { t } = useTheme()
  const flash = useFlash()
  const { type = 'user', id = '', label = '' } = useLocalSearchParams<{ type?: string; id?: string; label?: string }>()
  const targetType: ReportTarget = TARGETS.includes(type as ReportTarget) ? (type as ReportTarget) : 'user'
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [focused, setFocused] = useState(false)

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
      {/* `mt-4 flex flex-wrap gap-2` */}
      <View style={styles.chips}>
        {REPORT_REASONS.map((r) => (
          <Chip key={r.key} label={r.label} on={reason === r.key} onPress={() => setReason(r.key)} />
        ))}
      </View>
      {/* The web's three-row textarea (`field mt-4 !h-auto`), on the field's own chrome. */}
      <View style={[styles.detail, { borderColor: focused ? t.brass : alpha(t.ink, 0.18), backgroundColor: t.surface, borderRadius: radius }]}>
        <TextInput
          value={detail}
          onChangeText={setDetail}
          maxLength={500}
          multiline
          textAlignVertical="top"
          placeholder="Anything else that helps (optional)"
          placeholderTextColor={alpha(t.ink, 0.4)}
          selectionColor={t.brass}
          accessibilityLabel="Anything else that helps"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.detailInput, { color: t.ink, fontFamily: fonts.sans }]}
        />
      </View>
    </SheetFrame>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  detail: { borderWidth: hairline, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  // 16px so iOS never zooms the field; three lines at `text-base`.
  detailInput: { fontSize: 16, lineHeight: 24, minHeight: 72, paddingVertical: 0 },
})
