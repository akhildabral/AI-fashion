// Force a member's password: the admin sets a new one to hand over.
import { useMutation } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { apiFetch } from '@/src/lib/api'
import { queryClient } from '@/src/lib/query'
import { youKeys } from '@/src/features/you/keys'
import { SheetShell } from '@/src/components/Sheet'

export default function AdminResetSheet() {
  const router = useRouter()
  const flash = useFlash()
  const { id = '', email = '' } = useLocalSearchParams<{ id: string; email: string }>()
  const [password, setPassword] = useState('')
  const ok = password.length >= 8

  const reset = useMutation({
    mutationFn: () => apiFetch(`/admin/users/${id}/reset-password`, { method: 'POST', body: { password } }),
    onSuccess: () => {
      haptics.success()
      void queryClient.invalidateQueries({ queryKey: youKeys.adminUsers })
      flash(`Password updated for ${email}.`)
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not reset the password.')
    },
  })

  return (
    <SheetShell dense
      title="Reset a password"
      footer={
        <>
          <Button label="Set the password" disabled={!ok} loading={reset.isPending} onPress={() => reset.mutate()} />
          <Button label="Cancel" variant="quiet" disabled={reset.isPending} onPress={() => router.back()} />
        </>
      }
    >
      <T role="bodySm" tone="muted">
        A new password for <T role="bodySm">{email}</T>. Hand it over yourself; they can change it from their account after.
      </T>
      <Field label="New password" value={password} onChangeText={setPassword} password helper="At least 8 characters." autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => ok && reset.mutate()} />
    </SheetShell>
  )
}
