// The door: your standing invite link, a code to scan, who came in on it,
// and the link that lets people already inside follow you in a tap.
import { useQuery } from '@tanstack/react-query'
import { Share, StyleSheet, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { getMyInvite } from '@zauq/shared/invites'
import { Hairline } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, light, radius } from '@/src/design/tokens'
import { Dashed } from '@/src/features/circle/atoms'
import { ck } from '@/src/features/circle/keys'
import { copyText } from '@/src/features/circle/share'
import { SheetFrame, SheetLabel } from '@/src/features/circle/SheetFrame'

function LinkRow({ url, label }: { url: string; label: string }) {
  const { t } = useTheme()
  const flash = useFlash()
  return (
    <View style={styles.linkRow}>
      <View style={[styles.linkBox, { borderColor: alpha(t.ink, 0.18), backgroundColor: t.surface, borderRadius: radius }]}>
        <T role="caption" numberOfLines={1} selectable accessibilityLabel={label}>
          {url}
        </T>
      </View>
      <Button
        label="Copy"
        size="sm"
        onPress={() => {
          void copyText(url).then((ok) => {
            if (ok) haptics.tap()
            flash(ok ? 'Copied.' : 'Couldn’t copy. Select the link instead.')
          })
        }}
      />
    </View>
  )
}

export default function InviteSheet() {
  const q = useQuery({ queryKey: ck.invite, queryFn: getMyInvite })
  const invite = q.data
  const used = invite?.used ?? []
  const left = invite ? invite.left : null
  const usedLine =
    used.length === 0
      ? 'No one has come in on it yet.'
      : `Used by ${used
          .slice(0, 4)
          .map((u) => u.name)
          .join(', ')}${used.length > 4 ? ` and ${used.length - 4} more` : ''}.`

  const share = async () => {
    if (!invite) return
    try {
      await Share.share({ title: 'Come dress with me', message: `My invite to the stylist I use. It skips the waitlist. ${invite.url}`, url: invite.url })
    } catch {
      /* dismissed */
    }
  }

  return (
    <SheetFrame
      title="Bring someone in"
      busy={q.isPending && !invite}
      lead={
        invite
          ? left === null
            ? 'Your invites don’t run out. A friend who opens your link skips the waitlist and lands following you.'
            : left > 0
              ? `You hold ${left} invite${left === 1 ? '' : 's'}. A friend who opens your link skips the waitlist and lands following you.`
              : 'You’ve used all your invites. Ask the house for more when you need them.'
          : undefined
      }
      action={invite ? <Button label="Send it by message" block onPress={() => void share()} /> : undefined}
    >
      {q.isError && !invite ? (
        <Dashed>
          <T role="bodySm" tone="muted" align="center">
            {q.error instanceof Error ? q.error.message : 'Could not load your invite.'}
          </T>
          <Button label="Try again" variant="ghost" size="sm" onPress={() => void q.refetch()} />
        </Dashed>
      ) : null}
      {invite ? (
        <>
          <View style={styles.codeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <SheetLabel>Your code</SheetLabel>
              <T role="stat" tone="brass" selectable>
                {invite.code}
              </T>
              <T role="caption" tone="faint">
                {`${left === null ? '' : `${left} of ${left + used.length} left · `}${usedLine}`}
              </T>
            </View>
            {/* Fixed colours, whatever the theme: a code has to scan on either ground. */}
            <View style={[styles.qr, { backgroundColor: light.bone, borderColor: alpha(light.ink, 0.1), borderRadius: radius }]} accessible accessibilityLabel="Invite code to scan">
              <QRCode value={invite.url} size={112} color={light.brassDeeper} backgroundColor={light.bone} ecl="M" />
            </View>
          </View>
          <SheetLabel>Your invite link</SheetLabel>
          <LinkRow url={invite.url} label="Your invite link" />
          {invite.profileUrl ? (
            <>
              <Hairline style={{ marginTop: 8 }} />
              <SheetLabel>Already in?</SheetLabel>
              <T role="bodySm" tone="muted">
                Anyone who’s already a member follows you in a tap from this one.
              </T>
              <LinkRow url={invite.profileUrl} label="Your profile link" />
            </>
          ) : null}
        </>
      ) : null}
    </SheetFrame>
  )
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  qr: { padding: 8, borderWidth: hairline },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkBox: { flex: 1, height: 36, borderWidth: hairline, paddingHorizontal: 12, justifyContent: 'center' },
})
