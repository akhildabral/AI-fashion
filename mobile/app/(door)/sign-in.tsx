import { Link } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated from 'react-native-reanimated'
import { Hairline } from '@/src/components/Bits'
import { ArchMark, Wordmark } from '@/src/components/Brand'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { ApiError } from '@/src/lib/api'
import { appleAvailable, appleCredential, googleAvailable, googleIdToken } from '@/src/lib/sso'

type Where = 'email' | 'password' | 'form'

/** Map the server's line to the field it is about, as the web's LoginPage does. */
function placeError(message: string): Where {
  const m = message.toLowerCase()
  if (m.includes('verify') || m.includes('email')) return 'email'
  if (m.includes('password')) return 'password'
  return 'form'
}

export default function SignIn() {
  const { signIn, signInWithGoogle, signInWithApple } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'email' | 'google' | 'apple' | null>(null)
  const [error, setError] = useState<{ where: Where; message: string } | null>(null)
  const [apple, setApple] = useState(false)
  const passwordRef = useRef<TextInput>(null)

  useEffect(() => {
    appleAvailable().then(setApple)
  }, [])

  async function run(kind: 'email' | 'google' | 'apple', work: () => Promise<void>) {
    setError(null)
    setBusy(kind)
    try {
      await work()
      haptics.success()
    } catch (err) {
      haptics.failure()
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError({ where: err instanceof ApiError && kind === 'email' ? placeError(message) : 'form', message })
    } finally {
      setBusy(null)
    }
  }

  const submit = () => {
    if (!email.trim()) return setError({ where: 'email', message: 'Your email, to find your room.' })
    if (!password) return setError({ where: 'password', message: 'Your password.' })
    void run('email', () => signIn(email.trim(), password))
  }

  return (
    <Screen edges={['top', 'bottom']} padded>
      <KeyboardAwareScrollView bottomOffset={40} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Animated.View entering={rise(0)} style={styles.brand}>
          <ArchMark size={44} />
          <Wordmark />
        </Animated.View>

        <Animated.View entering={rise(1)} style={styles.head}>
          <T role="h1">Welcome back.</T>
          <T role="body" tone="muted">
            Your closet is where you left it.
          </T>
        </Animated.View>

        <Animated.View entering={rise(2)} style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={error?.where === 'email' ? error.message : null}
          />
          <Field
            ref={passwordRef}
            label="Password"
            password
            value={password}
            onChangeText={setPassword}
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error?.where === 'password' ? error.message : null}
          />
          {error?.where === 'form' ? (
            <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
              {error.message}
            </T>
          ) : null}
          <Button label="Sign in" block loading={busy === 'email'} disabled={busy !== null} onPress={submit} />
          <Link href="/(door)/forgot" asChild>
            <Button label="Forgot your password?" variant="quiet" size="sm" style={styles.center} />
          </Link>
        </Animated.View>

        {(googleAvailable() || apple) && (
          <Animated.View entering={rise(3)} style={styles.sso}>
            <View style={styles.or}>
              <Hairline style={styles.orLine} />
              <T role="micro" tone="faint">
                or
              </T>
              <Hairline style={styles.orLine} />
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
                    if (c) await signInWithApple(c.identityToken, c.fullName)
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
                    if (idToken) await signInWithGoogle(idToken)
                  })
                }
              />
            ) : null}
          </Animated.View>
        )}

        <Animated.View entering={rise(4)} style={styles.foot}>
          <T role="bodySm" tone="muted" align="center">
            ZAUQ is by invitation.
          </T>
          <Link href="/(door)/join" asChild>
            <Button label="I have an invite code" variant="quiet" size="sm" style={styles.center} />
          </Link>
        </Animated.View>
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, paddingVertical: space.xxl, gap: space.xxl },
  brand: { alignItems: 'center', gap: space.md, paddingTop: space.lg },
  head: { gap: space.sm },
  form: { gap: space.lg },
  center: { alignSelf: 'center' },
  sso: { gap: space.md },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orLine: { flex: 1 },
  foot: { marginTop: 'auto', gap: space.xs, alignItems: 'center' },
})
