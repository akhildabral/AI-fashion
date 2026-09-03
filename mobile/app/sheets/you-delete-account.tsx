// The way out, with the email typed to be sure.
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { deleteAccount } from '@zauq/shared/fitting'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { T } from '@/src/components/Text'
import { useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { SheetShell } from '@/src/features/you/SheetShell'

export default function DeleteAccountSheet() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const email = user?.email ?? ''
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = typed.trim().toLowerCase() === email.toLowerCase() && email.length > 0

  async function go() {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(typed.trim())
      haptics.thud()
      await signOut()
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not delete the account.')
      setBusy(false)
    }
  }

  return (
    <SheetShell
      title="Delete the account"
      foot={
        <>
          <Button label="Delete everything" variant="danger" disabled={!ok} loading={busy} onPress={() => void go()} />
          <Button label="Keep my account" variant="quiet" disabled={busy} onPress={() => router.back()} />
        </>
      }
    >
      <T role="bodySm" tone="muted">
        This removes your account, your closet, the record, your circle and every photo. There is no way back.
      </T>
      <Field label="Type your email to confirm" value={typed} onChangeText={setTyped} placeholder={email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="off" error={error} returnKeyType="done" onSubmitEditing={() => void go()} />
    </SheetShell>
  )
}
