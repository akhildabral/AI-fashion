import { Link, router } from 'expo-router'
import { useState } from 'react'
import { Button } from '@/src/components/Button'
import { DoorShell } from '@/src/components/DoorShell'
import { Field } from '@/src/components/Field'

// Typed in by hand (a friend read it out); the link form lands on join/[code] directly.
export default function JoinCode() {
  const [code, setCode] = useState('')
  const clean = code.trim().replace(/^.*\/join\//, '')

  return (
    <DoorShell
      eyebrow="A friend's door"
      title="Come in with"
      emphasis="their code."
      lead="A member's invite code, or the link they sent you."
      foot={
        <Link href="/(door)/sign-in" asChild>
          <Button label="Already a member? Sign in" variant="quiet" size="sm" />
        </Link>
      }
    >
      <Field
        label="Invite code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => clean && router.push(`/(door)/join/${encodeURIComponent(clean)}`)}
      />
      <Button label="Open the door" block disabled={!clean} onPress={() => router.push(`/(door)/join/${encodeURIComponent(clean)}`)} />
    </DoorShell>
  )
}
