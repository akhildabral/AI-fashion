import { Link, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import type { User } from '@zauq/shared/types'
import { Button } from '@/src/components/Button'
import { DoorShell } from '@/src/components/DoorShell'
import { Field } from '@/src/components/Field'
import { clientFields, useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { apiFetch } from '@/src/lib/api'

// From the emailed link: choose a new password, then straight in.
export default function Reset() {
  const { token = '' } = useLocalSearchParams<{ token?: string }>()
  const { adoptSession } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState<string | null>(null)

  async function save() {
    if (password.length < 8) return setError('At least eight characters.')
    setBusy(true)
    setError(null)
    try {
      const r = await apiFetch<{ token: string | null; refreshToken?: string; user: User | null; message?: string }>('/auth/reset', {
        method: 'POST',
        body: { token, password, ...clientFields() },
        auth: false,
      })
      haptics.success()
      if (r.token && r.user) adoptSession({ token: r.token, refreshToken: r.refreshToken, user: r.user })
      else setClosed(r.message ?? 'Your password is set.')
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  const signIn = (
    <Link href="/(door)/sign-in" asChild>
      <Button label="Back to sign in" variant="quiet" size="sm" />
    </Link>
  )

  if (!token) {
    return (
      <DoorShell
        eyebrow="New password"
        title="This link is"
        emphasis="missing its key."
        lead="Open the link from the email, or ask for a fresh one."
        foot={
          <Link href="/(door)/forgot" asChild>
            <Button label="Send me a new link" variant="quiet" size="sm" />
          </Link>
        }
      />
    )
  }
  if (closed) return <DoorShell eyebrow="New password" title="Set, and" emphasis="waiting." lead={closed} foot={signIn} />

  return (
    <DoorShell eyebrow="New password" title="Choose" emphasis="a new one." lead="At least eight characters. You’ll be signed in straight after." foot={signIn}>
      <Field
        label="New password"
        password
        placeholder="at least 8 characters"
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
        autoComplete="new-password"
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => void save()}
        error={error}
      />
      <Button label="Save and sign in" block loading={busy} onPress={() => void save()} />
    </DoorShell>
  )
}
