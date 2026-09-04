import { Link, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/src/components/Button'
import { DoorShell } from '@/src/components/DoorShell'
import { Field } from '@/src/components/Field'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { clientFields, useAuth, type SessionResponse } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { apiFetch } from '@/src/lib/api'

// The emailed invite: set a password, claim your name, step inside.
export default function Invite() {
  const { token = '' } = useLocalSearchParams<{ token?: string }>()
  const { adoptSession } = useAuth()
  const [state, setState] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return setState('invalid')
    apiFetch<{ email: string; firstName: string | null }>(`/auth/invite?token=${encodeURIComponent(token)}`, { auth: false })
      .then((r) => {
        setEmail(r.email)
        if (r.firstName) setFirstName(r.firstName)
        setState('ready')
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function accept() {
    if (!firstName.trim()) return setError('Your first name.')
    if (password.length < 8) return setError('A password of at least 8 characters.')
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch<SessionResponse>('/auth/invite/accept', {
        method: 'POST',
        body: { token, password, firstName: firstName.trim(), lastName: lastName.trim() || null, ...clientFields() },
        auth: false,
      })
      haptics.success()
      adoptSession(res)
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not activate your account.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') {
    // The shape of the form arriving: two fields and their button.
    return (
      <DoorShell eyebrow="One moment" title="Checking" emphasis="the invite.">
        <SkeletonBlock height={44} />
        <SkeletonBlock height={44} />
        <SkeletonBlock height={44} width="60%" />
      </DoorShell>
    )
  }
  if (state === 'invalid') {
    return (
      <DoorShell
        eyebrow="The door"
        title="This invite"
        emphasis="isn’t valid."
        lead="The link may have expired. Invites last 7 days. Ask for a fresh one."
        foot={
          <Link href="/(door)/sign-in" asChild>
            <Button label="Back to sign in" variant="quiet" size="sm" />
          </Link>
        }
      />
    )
  }
  return (
    <DoorShell eyebrow="You’re invited" title="Claim" emphasis="your account." lead={`Welcome, ${email}.`}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="First name" value={firstName} onChangeText={setFirstName} textContentType="givenName" autoComplete="given-name" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last name" placeholder="optional" value={lastName} onChangeText={setLastName} textContentType="familyName" autoComplete="family-name" />
        </View>
      </View>
      <Field
        label="Choose a password"
        password
        placeholder="at least 8 characters"
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={() => void accept()}
        error={error}
      />
      <Button label="Activate my account" block loading={busy} onPress={() => void accept()} />
    </DoorShell>
  )
}
