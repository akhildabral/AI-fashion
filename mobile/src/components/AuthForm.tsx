import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, spacing } from '../theme'
import { Button, ErrorText, Heading, Label, LinkText, Subtle, TextField } from './ui'

interface AuthFormProps {
  mode: 'login' | 'register'
  onSubmit: (email: string, password: string) => Promise<void>
  onSwitch: () => void
}

const COPY = {
  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to meet your stylist.',
    action: 'Sign in',
    footer: 'New here?',
    footerLink: 'Create an account',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Start building looks tailored to you.',
    action: 'Create account',
    footer: 'Already have an account?',
    footerLink: 'Sign in',
  },
} as const

export function AuthForm({ mode, onSubmit, onSwitch }: AuthFormProps) {
  const copy = COPY[mode]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      await onSubmit(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Heading size={34} style={{ textAlign: 'center' }}>
            {copy.title}
          </Heading>
          <Subtle style={styles.subtitle}>{copy.subtitle}</Subtle>
        </View>

        <View style={styles.card}>
          <View>
            <Label>Email</Label>
            <TextField
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
          </View>

          <View>
            <Label>Password</Label>
            <TextField
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              placeholder="••••••••"
            />
          </View>

          {error && <ErrorText>{error}</ErrorText>}

          <Button
            title={copy.action}
            loading={loading}
            onPress={handleSubmit}
            fullWidth
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{copy.footer} </Text>
          <LinkText onPress={onSwitch}>{copy.footerLink}</LinkText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: colors.inkSoft,
  },
})
