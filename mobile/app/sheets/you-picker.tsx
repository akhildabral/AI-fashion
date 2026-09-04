// A list to pick one thing from. Currency for now: the pick saves itself
// through the profile and the sheet closes.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { saveFitting } from '@zauq/shared/fitting'
import { CURRENCIES, guessCurrency, setCurrentCurrency } from '@zauq/shared/money'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useProfile } from '@/src/context/ProfileProvider'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk, queryClient } from '@/src/lib/query'
import { CheckGlyph } from '@/src/components/Glyphs'
import { SheetShell } from '@/src/components/Sheet'

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
    <SheetShell dense title={kind === 'currency' ? 'Your currency' : 'Pick one'} lead={kind === 'currency' ? 'Every figure, from the estate to cost per wear, prints in it.' : undefined}>
      <View>
        {options.map((o, i) => {
          const on = o.value === current
          return (
            <Press key={o.value || 'guess'} accessibilityRole="button" accessibilityState={{ selected: on, busy: busy === o.value }} accessibilityLabel={`${o.label}${o.line ? `, ${o.line}` : ''}`} onPress={() => void pick(o.value)}>
              <View style={[styles.row, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: i === 0 ? 0 : hairline }]}>
                <T role="bodySm" style={[{ flex: 1 }, on && { fontFamily: fonts.sansSemi }]}>
                  {o.label}
                </T>
                {o.line ? (
                  <T role="bodySm" tone={on ? 'brass' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
                    {o.line}
                  </T>
                ) : null}
                {on ? <CheckGlyph color={t.brass} /> : null}
              </View>
            </Press>
          )
        })}
      </View>
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  // A 44px row with the hairline between, like every settings list.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: height.action, paddingVertical: space.sm },
})
