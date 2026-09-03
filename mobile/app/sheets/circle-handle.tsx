// Your handle: the address friends find you at and @mention you by.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { setHandle } from '@zauq/shared/social'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { useFlash } from '@/src/components/Toast'
import { useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { qk } from '@/src/lib/query'
import { SheetFrame } from '@/src/features/circle/SheetFrame'

const VALID = /^[a-z0-9_]{3,20}$/

export default function HandleSheet() {
  const flash = useFlash()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuth()
  const [value, setValue] = useState(user?.handle ?? '')
  const [error, setError] = useState<string | null>(null)
  const handle = value.trim().toLowerCase().replace(/^@/, '')

  const save = useMutation({
    mutationFn: () => setHandle(handle),
    onSuccess: ({ user: u }) => {
      if (user) setUser({ ...user, handle: u.handle })
      void queryClient.invalidateQueries({ queryKey: qk.social })
      void queryClient.invalidateQueries({ queryKey: qk.me })
      haptics.success()
      flash(`You’re @${u.handle}.`)
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'That handle didn’t take. Try another.')
    },
  })

  const submit = () => {
    if (!VALID.test(handle)) {
      setError('Three to twenty letters, numbers or underscores.')
      return
    }
    setError(null)
    save.mutate()
  }

  return (
    <SheetFrame
      title="Pick a handle"
      lead="Friends find you and @mention you by it. Lowercase letters, numbers and underscores."
      action={<Button label="Save handle" block disabled={handle.length < 3} loading={save.isPending} onPress={submit} />}
    >
      <Field label="Handle" value={value} onChangeText={setValue} error={error} autoCapitalize="none" autoCorrect={false} autoFocus maxLength={21} placeholder="yourname" returnKeyType="done" onSubmitEditing={submit} />
    </SheetFrame>
  )
}
