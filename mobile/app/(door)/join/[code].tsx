import { Link, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { getJoinInfo, type JoinInfo } from '@zauq/shared/invites'
import { Hairline } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { DoorShell } from '@/src/components/DoorShell'
import { Field } from '@/src/components/Field'
import { T } from '@/src/components/Text'
import { clientFields, useAuth, type SessionResponse } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { apiFetch } from '@/src/lib/api'
import { appleAvailable, appleCredential, googleAvailable, googleIdToken } from '@/src/lib/sso'

// A friend's door. Their link brought you here: no waitlist, and you land
// following each other.
export default function Join() {
  const { code = '' } = useLocalSearchParams<{ code: string }>()
  const { adoptSession, signInWithGoogle, signInWithApple } = useAuth()
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'closed' | 'invalid'>('checking')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'form' | 'google' | 'apple' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apple, setApple] = useState(false)

  useEffect(() => {
    appleAvailable().then(setApple)
  }, [])

  useEffect(() => {
    if (!code) return setState('invalid')
    getJoinInfo(code)
      .then((r) => {
        setInfo(r)
        setState(r.open ? 'ready' : 'closed')
      })
      .catch(() => setState('invalid'))
  }, [code])

  const who = info?.inviter.name ?? 'A friend'

  async function run(kind: 'form' | 'google' | 'apple', work: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    try {
      await work()
      haptics.success()
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'Could not open the door.')
    } finally {
      setBusy(null)
    }
  }

  const join = () => {
    if (!firstName.trim()) return setError('Your first name, for the door.')
    if (!email.trim()) return setError('Your email.')
    if (password.length < 8) return setError('A password of at least 8 characters.')
    void run('form', async () => {
      const res = await apiFetch<SessionResponse>(`/auth/join/${encodeURIComponent(code)}`, {
        method: 'POST',
        body: { email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() || null, ...clientFields() },
        auth: false,
      })
      adoptSession(res)
    })
  }

  const signIn = (
    <Link href="/(door)/sign-in" asChild>
      <Button label="Already a member? Sign in" variant="quiet" size="sm" />
    </Link>
  )

  if (state === 'checking') {
    return (
      <DoorShell eyebrow="One moment" title="Checking" emphasis="the door.">
        <ActivityIndicator />
      </DoorShell>
    )
  }
  if (state === 'closed') {
    return <DoorShell eyebrow="The door" title={`${who}’s invites are`} emphasis="used up." lead="Ask them for a fresh one when they have more." foot={signIn} />
  }
  if (state === 'invalid') {
    return <DoorShell eyebrow="The door" title="This link isn’t" emphasis="one of ours." lead="Check it with whoever sent it." foot={signIn} />
  }

  return (
    <DoorShell
      eyebrow={`${who} invited you`}
      title="Come in,"
      emphasis="no waiting."
      lead="A personal stylist for the clothes you already own. You’ll start following each other."
      foot={signIn}
    >
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="First name" value={firstName} onChangeText={setFirstName} textContentType="givenName" autoComplete="given-name" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last name" placeholder="optional" value={lastName} onChangeText={setLastName} textContentType="familyName" autoComplete="family-name" />
        </View>
      </View>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <Field
        label="Choose a password"
        password
        placeholder="at least 8 characters"
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={join}
        error={error}
      />
      <Button label="Come in" block loading={busy === 'form'} disabled={busy !== null} onPress={join} />
      {(googleAvailable() || apple) && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Hairline style={{ flex: 1 }} />
            <T role="micro" tone="faint">
              or
            </T>
            <Hairline style={{ flex: 1 }} />
          </View>
          {apple ? (
            <Button
              label="Continue with Apple"
              variant="ghost"
              block
              loading={busy === 'apple'}
              disabled={busy !== null}
              onPress={() =>
                run('apple', async () => {
                  const c = await appleCredential()
                  if (c) await signInWithApple(c.identityToken, c.fullName, code)
                })
              }
            />
          ) : null}
          {googleAvailable() ? (
            <Button
              label="Continue with Google"
              variant="ghost"
              block
              loading={busy === 'google'}
              disabled={busy !== null}
              onPress={() =>
                run('google', async () => {
                  const idToken = await googleIdToken()
                  if (idToken) await signInWithGoogle(idToken, code)
                })
              }
            />
          ) : null}
        </>
      )}
    </DoorShell>
  )
}
