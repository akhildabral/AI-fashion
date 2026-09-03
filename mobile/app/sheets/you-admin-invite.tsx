// An invite, ready: the link to copy, or the note that Google members are in already.
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, radius, space } from '@/src/design/tokens'
import { SheetShell } from '@/src/features/you/SheetShell'

export default function AdminInviteSheet() {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const p = useLocalSearchParams<{ email?: string; url?: string; google?: string; emailed?: string }>()
  const [copied, setCopied] = useState(false)
  const viaGoogle = p.google === '1'
  const emailed = p.emailed === '1'

  async function copy() {
    if (!p.url) return
    const ok = await Clipboard.setStringAsync(p.url).catch(() => false)
    if (!ok) return flash('Could not copy the link.')
    haptics.success()
    setCopied(true)
    flash('Invite link copied.')
  }

  return (
    <SheetShell
      title={viaGoogle ? 'Approved' : 'Invite ready'}
      foot={viaGoogle || !p.url ? <Button label="Done" variant="ghost" onPress={() => router.back()} /> : <Button label={copied ? 'Copied' : 'Copy invite link'} block onPress={() => void copy()} />}
    >
      {viaGoogle ? (
        <T role="bodySm" tone="muted">
          <T role="bodySm">{p.email}</T> signed up with Google, so they are approved directly. They can sign in with Google right now.
        </T>
      ) : (
        <View style={{ gap: space.md }}>
          <T role="bodySm" tone="muted">
            Invite for <T role="bodySm">{p.email}</T>: {emailed ? 'an invite email is on its way (tell them to check spam). You can also copy the link. Valid 7 days.' : 'the invite email could not be sent, so copy the link and share it yourself. Valid 7 days.'}
          </T>
          {p.url ? (
            <View style={[styles.link, { borderColor: alpha(t.ink, 0.1), backgroundColor: t.bone, borderRadius: radius }]}>
              <T role="caption" tone="muted" selectable>
                {p.url}
              </T>
            </View>
          ) : null}
        </View>
      )}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  link: { borderWidth: 1, padding: space.md },
})
