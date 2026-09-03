// A list to pick one thing from. Currency for now: the pick saves itself
// through the profile and the sheet closes.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { saveFitting } from '@zauq/shared/fitting'
import { CURRENCIES, guessCurrency, setCurrentCurrency } from '@zauq/shared/money'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useProfile } from '@/src/context/ProfileProvider'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk, queryClient } from '@/src/lib/query'
import { SheetShell } from '@/src/features/you/SheetShell'

export default function PickerSheet() {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const { kind = 'currency' } = useLocalSearchParams<{ kind?: string }>()
  const { profile, setProfile } = useProfile()
  const [busy, setBusy] = useState<string | null>(null)
  const current = profile?.currency ?? ''

  const options: { value: string; label: string; line?: string }[] = kind === 'currency' ? [{ value: '', label: 'Guess from my location', line: guessCurrency() }, ...CURRENCIES.map((c) => ({ value: c.code, label: c.name, line: c.code }))] : []

  async function pick(value: string) {
    if (busy) return
    haptics.select()
    setBusy(value)
    try {
      const { profile: saved } = await saveFitting({ currency: value || null })
      setProfile(saved)
      setCurrentCurrency(saved.currency)
      queryClient.setQueryData(qk.profile, { profile: saved })
      router.back()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save that.')
      setBusy(null)
    }
  }

  return (
    <SheetShell title={kind === 'currency' ? 'Your currency' : 'Pick one'} line={kind === 'currency' ? 'Every figure, from the estate to cost per wear, prints in it.' : undefined}>
      <View>
        {options.map((o, i) => {
          const on = o.value === current
          return (
            <Pressable
              key={o.value || 'guess'}
              accessibilityRole="button"
              accessibilityState={{ selected: on, busy: busy === o.value }}
              accessibilityLabel={`${o.label}${o.line ? `, ${o.line}` : ''}`}
              onPress={() => void pick(o.value)}
              pressRetentionOffset={12}
              style={({ pressed }) => [styles.row, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: i === 0 ? 0 : hairline, opacity: pressed ? 0.6 : 1 }]}
            >
              <T role="body" style={[{ flex: 1 }, on && { fontFamily: fonts.sansSemi }]}>
                {o.label}
              </T>
              {o.line ? (
                <T role="bodySm" tone={on ? 'brass' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
                  {o.line}
                </T>
              ) : null}
              {on ? (
                <T role="bodySm" tone="brass" accessible={false}>
                  ✓
                </T>
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.sm },
})
