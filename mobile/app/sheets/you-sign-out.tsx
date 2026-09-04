// Sign out of this device. The web, and any other phone, stays signed in.
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Button } from '@/src/components/Button'
import { useAuth } from '@/src/context/AuthProvider'
import * as haptics from '@/src/design/haptics'
import { SheetShell } from '@/src/components/Sheet'

export default function SignOutSheet() {
  const router = useRouter()
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <SheetShell dense
      title="Sign out of this device?"
      lead="Your closet, the record and your circle stay where they are. The web stays signed in."
      footer={
        <>
          <Button
            label="Sign out"
            variant="danger"
            loading={busy}
            onPress={() => {
              setBusy(true)
              haptics.thud()
              void signOut()
            }}
          />
          <Button label="Stay" variant="quiet" disabled={busy} onPress={() => router.back()} />
        </>
      }
    />
  )
}
