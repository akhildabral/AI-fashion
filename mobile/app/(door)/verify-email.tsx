import { Link, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { Button } from '@/src/components/Button'
import { DoorShell } from '@/src/components/DoorShell'
import { apiFetch } from '@/src/lib/api'

// The emailed verification link, opened on the phone.
export default function VerifyEmail() {
  const { token = '' } = useLocalSearchParams<{ token?: string }>()
  const [state, setState] = useState<'checking' | 'done' | 'failed'>('checking')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState('failed')
      return
    }
    apiFetch<{ message?: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false })
      .then((r) => {
        setMessage(r.message ?? null)
        setState('done')
      })
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : null)
        setState('failed')
      })
  }, [token])

  const signIn = (
    <Link href="/(door)/sign-in" asChild>
      <Button label="Sign in" variant="primary" />
    </Link>
  )

  if (state === 'checking') {
    return (
      <DoorShell eyebrow="One moment" title="Checking" emphasis="your email.">
        <ActivityIndicator />
      </DoorShell>
    )
  }
  if (state === 'done') {
    return <DoorShell eyebrow="Verified" title="Your email is" emphasis="confirmed." lead={message ?? 'Sign in whenever you are ready.'} foot={signIn} />
  }
  return <DoorShell eyebrow="The door" title="That link" emphasis="didn’t take." lead={message ?? 'It may have expired. Sign in and ask for a new one.'} foot={signIn} />
}
