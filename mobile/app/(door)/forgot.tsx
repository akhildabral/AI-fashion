import { Link, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Button } from '@/src/components/Button'
import { DoorShell } from '@/src/components/DoorShell'
import { Field } from '@/src/components/Field'
import { T } from '@/src/components/Text'
import { apiFetch } from '@/src/lib/api'

// Forgot your password: one field, one button, then "check your inbox".
export default function Forgot() {
  const params = useLocalSearchParams<{ email?: string }>()
  const [email, setEmail] = useState(params.email ?? '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [again, setAgain] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!email.trim()) return setError('Your email, so we know where to send it.')
    setBusy(true)
    setError(null)
    try {
      const r = await apiFetch<{ message: string }>('/auth/forgot', { method: 'POST', body: { email: email.trim() }, auth: false })
      if (sent) setAgain(true)
      setSent(r.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setBusy(false)
    }
  }

  const signIn = (
    <Link href="/(door)/sign-in" asChild>
      <Button label="Back to sign in" variant="quiet" size="sm" />
    </Link>
  )

  if (sent) {
    return (
      <DoorShell eyebrow="Check your inbox" title="The link is" emphasis="on its way." lead={sent} foot={signIn}>
        <T role="bodySm" tone="muted">
          Nothing there after a minute? Look in spam{again ? '. Sent again.' : ', or send it again.'}
        </T>
        {!again ? <Button label="Send it again" variant="ghost" size="sm" loading={busy} onPress={() => void send()} /> : null}
      </DoorShell>
    )
  }

  return (
    <DoorShell eyebrow="Forgot your password" title="We’ll send you" emphasis="a way in." lead="A link that lets you choose a new one. It lasts an hour." foot={signIn}>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        autoFocus
        returnKeyType="send"
        onSubmitEditing={() => void send()}
        error={error}
      />
      <Button label="Send me a link" block loading={busy} onPress={() => void send()} />
    </DoorShell>
  )
}
