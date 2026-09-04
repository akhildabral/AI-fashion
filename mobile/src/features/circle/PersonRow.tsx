// A person as a row: initials, name, a line beneath, and the follow control.
// Rows, not badges, so a list scales to hundreds.
import { router } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/src/components/Button'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { Initials } from './atoms'
import { userHref } from './notifications'

export function PersonRow({
  handle,
  name,
  sub,
  following,
  onToggle,
  right,
  dim,
  first,
  onPress,
}: {
  handle: string | null
  name: string
  sub?: string
  /** null hides the control. */
  following?: boolean | null
  onToggle?: () => Promise<void>
  /** Something other than a follow control on the right. */
  right?: ReactNode
  dim?: boolean
  first?: boolean
  onPress?: () => void
}) {
  const { t } = useTheme()
  const [busy, setBusy] = useState(false)
  const open = onPress ?? (handle ? () => router.push(userHref(handle)) : undefined)
  return (
    <View style={[styles.row, !first && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }]}>
      <Press accessibilityRole="button" accessibilityLabel={name} onPress={open} disabled={!open} wrapStyle={styles.person}>
        <View style={styles.personInner}>
          <Initials handle={handle} name={name} dim={dim} />
          <View style={styles.text}>
            <T role="bodySm" numberOfLines={1} style={{ fontFamily: fonts.sansSemi }}>
              {name}
            </T>
            {sub ? (
              <T role="caption" tone="faint" numberOfLines={1}>
                {sub}
              </T>
            ) : null}
          </View>
        </View>
      </Press>
      {right}
      {onToggle && typeof following === 'boolean' ? (
        <Button
          label={following ? 'Following' : 'Follow'}
          variant={following ? 'quiet' : 'ghost'}
          size="sm"
          loading={busy}
          accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`}
          onPress={() => {
            setBusy(true)
            void onToggle().finally(() => setBusy(false))
          }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // The web's `flex items-center gap-3 border-t py-3`
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  person: { flex: 1 },
  personInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
})
