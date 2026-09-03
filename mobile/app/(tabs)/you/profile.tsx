// You: the fitting's answers, editable with the fitting's own controls and
// saved as you change them; the practical facts; and the account beside them.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { checkHandle, updateName } from '@zauq/shared/fitting'
import { CURRENCIES, guessCurrency, setCurrentCurrency } from '@zauq/shared/money'
import { setHandle } from '@zauq/shared/social'
import { setCurrentUnits } from '@zauq/shared/units'
import { Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Screen } from '@/src/components/Screen'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useAuth } from '@/src/context/AuthProvider'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, space } from '@/src/design/tokens'
import { apiFetch } from '@/src/lib/api'
import { Card, NavRow, RowLabel, Stepper, Swatch, TextLink, Wrap } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { BOTTOM_SIZES, BUDGETS, BUILDS, COLOURS, DAYS, HEIGHT_MAX, HEIGHT_MIN, heightLabel, INTENTS, planLabel, SHOE_SIZES, title, TONES, TOP_SIZES, VIBES, WHO } from '@/src/features/you/options'
import { useProfileSave } from '@/src/features/you/useProfileSave'

type Section = 'fit' | 'taste' | 'practical' | 'account'
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'fit', label: 'Fit' },
  { key: 'taste', label: 'Taste' },
  { key: 'practical', label: 'Practical' },
  { key: 'account', label: 'Account' },
]

export default function Profile() {
  const params = useLocalSearchParams<{ section?: string }>()
  const initial = SECTIONS.some((s) => s.key === params.section) ? (params.section as Section) : 'fit'
  const [section, setSection] = useState<Section>(initial)
  const { profile, save, whisper } = useProfileSave()

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Profile',
          headerRight: () =>
            whisper ? (
              <T role="lede" tone="faint" style={{ fontSize: 14 }} accessibilityLiveRegion="polite">
                {whisper}
              </T>
            ) : null,
        }}
      />
      <Screen>
        <KeyboardAwareScrollView bottomOffset={40} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <T role="h1" accessibilityRole="header">
              The facts you’re <T role="h1" tone="brass" italic>{`dressed by.`}</T>
            </T>
            <T role="bodySm" tone="muted">
              What the fitting learned, editable here. Every change saves itself.
            </T>
          </View>
          <Tabs items={SECTIONS} value={section} onChange={setSection} />
          {!profile ? (
            <Card>
              <T role="h3">Your stylist hasn’t met you yet.</T>
              <T role="bodySm" tone="muted" style={{ marginTop: 4 }}>
                The fitting takes a few minutes: who you dress for, your measure, your taste.
              </T>
            </Card>
          ) : section === 'fit' ? (
            <FitSection profile={profile} save={save} />
          ) : section === 'taste' ? (
            <TasteSection profile={profile} save={save} />
          ) : section === 'practical' ? (
            <PracticalSection profile={profile} save={save} />
          ) : (
            <AccountSection profile={profile} />
          )}
        </KeyboardAwareScrollView>
      </Screen>
    </>
  )
}

type SaveFn = ReturnType<typeof useProfileSave>['save']
type Prof = NonNullable<ReturnType<typeof useProfileSave>['profile']>

function SizeRow({ label, options, value, onPick, upper }: { label: string; options: string[]; value: string; onPick: (v: string) => void; upper?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <View>
      <View style={styles.sizeHead}>
        <RowLabel first>{label}</RowLabel>
        <View style={{ width: 96 }}>
          <Field compact value={draft} onChangeText={setDraft} onBlur={() => onPick(draft.trim())} placeholder="or type" accessibilityLabel={`${label} size`} autoCapitalize="characters" style={{ textAlign: 'center' }} />
        </View>
      </View>
      <Wrap style={{ marginTop: space.sm }}>
        {options.map((s) => (
          <Chip key={s} label={s} on={(upper ? value.toUpperCase() : value) === s} onPress={() => onPick(s)} />
        ))}
      </Wrap>
    </View>
  )
}

function FitSection({ profile, save }: { profile: Prof; save: SaveFn }) {
  const units = profile.units ?? 'metric'
  const sizes = profile.sizes ?? {}
  const [height, setHeight] = useState(profile.heightCm || 170)
  useEffect(() => setHeight(profile.heightCm || 170), [profile.heightCm])
  const setSize = (kind: 'top' | 'bottom' | 'shoe', value: string) => save({ sizes: { ...sizes, [kind]: value || undefined } }, `size-${kind}`)
  return (
    <Card style={styles.section}>
      <RowLabel first>How tall</RowLabel>
      <View style={{ marginTop: space.sm }}>
        <Stepper
          value={height}
          min={HEIGHT_MIN}
          max={HEIGHT_MAX}
          label={heightLabel(height, units)}
          accessibilityLabel="height"
          onChange={(v) => {
            setHeight(v)
            save({ heightCm: v }, 'height', 500)
          }}
        />
      </View>
      <RowLabel>Build</RowLabel>
      <Wrap style={{ marginTop: space.sm }}>
        {BUILDS.map((b) => (
          <Chip key={b} label={title(b)} on={profile.bodyType === b} onPress={() => save({ bodyType: b })} />
        ))}
      </Wrap>
      <View style={{ marginTop: space.xl, gap: space.xl }}>
        <SizeRow label="What you reach for · tops" options={TOP_SIZES} value={sizes.top ?? ''} onPick={(v) => setSize('top', v)} upper />
        <SizeRow label="Bottoms" options={BOTTOM_SIZES} value={sizes.bottom ?? ''} onPick={(v) => setSize('bottom', v)} />
        <SizeRow label="Shoes" options={SHOE_SIZES} value={sizes.shoe ?? ''} onPick={(v) => setSize('shoe', v)} />
      </View>
      <RowLabel>Who we dress</RowLabel>
      <Wrap style={{ marginTop: space.sm }}>
        {WHO.map(([k, l]) => (
          <Chip key={k} label={l} on={profile.styleFor === k} onPress={() => save({ styleFor: k })} />
        ))}
      </Wrap>
      <Plaque style={{ marginTop: space.xl }}>
        <T role="micro" tone="faint">
          Nothing here is shown to anyone
        </T>
        <T role="bodySm" tone="muted" style={{ marginTop: 4 }}>
          Your measure and your photo stay between you and the stylist. Friends see your name, your room and the pieces you make public.
        </T>
      </Plaque>
    </Card>
  )
}

function TasteSection({ profile, save }: { profile: Prof; save: SaveFn }) {
  const list = profile.avoidColors ?? []
  const avoid = new Set(list.map((c) => c.toLowerCase()))
  const custom = list.filter((c) => !COLOURS.some(([k]) => k === c.toLowerCase()))
  const toggleAvoid = (colour: string) => save({ avoidColors: avoid.has(colour) ? list.filter((c) => c.toLowerCase() !== colour) : [...list, colour] })
  const toggleDay = (k: string) => {
    const days = profile.occasions ?? []
    save({ occasions: days.includes(k) ? days.filter((x) => x !== k) : [...days, k] })
  }
  return (
    <Card style={styles.section}>
      <RowLabel first>Your tone</RowLabel>
      <Wrap style={{ marginTop: space.sm, gap: 10 }}>
        {TONES.map(([k, c]) => (
          <Swatch key={k} colour={c} label={k} on={profile.skinTone === k} onPress={() => save({ skinTone: k })} />
        ))}
      </Wrap>
      <RowLabel>Never on me</RowLabel>
      <Wrap style={{ marginTop: space.sm, gap: 10 }}>
        {COLOURS.map(([k, c]) => (
          <Swatch key={k} colour={c} label={`Avoid ${k}`} on={avoid.has(k)} struck={avoid.has(k)} onPress={() => toggleAvoid(k)} />
        ))}
      </Wrap>
      {custom.length > 0 ? (
        <Wrap style={{ marginTop: space.sm }}>
          {custom.map((c) => (
            <Chip key={c} label={`${c} ×`} on onPress={() => toggleAvoid(c.toLowerCase())} />
          ))}
        </Wrap>
      ) : null}
      <RowLabel>What matters most</RowLabel>
      <Wrap style={{ marginTop: space.sm }}>
        {INTENTS.map(([k, l]) => (
          <Chip key={k} label={l} on={(profile.intents ?? [])[0] === k} onPress={() => save({ intents: [k] })} />
        ))}
      </Wrap>
      <RowLabel>The days you dress for</RowLabel>
      <Wrap style={{ marginTop: space.sm }}>
        {DAYS.map(([k, l]) => (
          <Chip key={k} label={l} on={(profile.occasions ?? []).includes(k)} onPress={() => toggleDay(k)} />
        ))}
      </Wrap>
      <RowLabel>Your vibe</RowLabel>
      <Wrap style={{ marginTop: space.sm }}>
        {VIBES.map((v) => (
          <Chip key={v} label={title(v)} on={profile.styleVibe === v} onPress={() => save({ styleVibe: v })} />
        ))}
      </Wrap>
      <RowLabel>How you shop</RowLabel>
      <Wrap style={{ marginTop: space.sm }}>
        {BUDGETS.map(([k, l]) => (
          <Chip key={k} label={l} on={profile.budgetBand === k} onPress={() => save({ budgetBand: k })} />
        ))}
      </Wrap>
      <Plaque style={{ marginTop: space.xl }}>
        <T role="micro" tone="faint">
          How this is used
        </T>
        <T role="bodySm" tone="muted" style={{ marginTop: 4 }}>
          Struck colours never come back in a brief. Your tone steers the shades. The days you dress for decide what the week is composed around.
        </T>
      </Plaque>
    </Card>
  )
}

function PracticalSection({ profile, save }: { profile: Prof; save: SaveFn }) {
  const router = useRouter()
  const units = profile.units ?? 'metric'
  const [city, setCity] = useState(profile.city ?? '')
  useEffect(() => setCity(profile.city ?? ''), [profile.city])
  const currency = CURRENCIES.find((c) => c.code === profile.currency)
  return (
    <View style={{ gap: space.lg }}>
      <Card style={styles.section}>
        <RowLabel first>Home city · for the weather in your brief</RowLabel>
        <View style={{ marginTop: space.sm }}>
          <Field value={city} onChangeText={setCity} placeholder="e.g. Dubai" accessibilityLabel="Home city" autoCapitalize="words" returnKeyType="done" onBlur={() => (city.trim() || null) !== (profile.city ?? null) && save({ city: city.trim() || null }, 'city', 0)} />
        </View>
        <RowLabel>Units</RowLabel>
        <Wrap style={{ marginTop: space.sm }}>
          <Chip
            label="°C · cm"
            on={units === 'metric'}
            onPress={() => {
              setCurrentUnits('metric')
              save({ units: 'metric' })
            }}
          />
          <Chip
            label="°F · ft"
            on={units === 'imperial'}
            onPress={() => {
              setCurrentUnits('imperial')
              save({ units: 'imperial' })
            }}
          />
        </Wrap>
        <RowLabel>Currency</RowLabel>
        <View style={{ marginTop: space.xs }}>
          <NavRow first label="Your books are kept in" value={currency ? `${currency.code} · ${currency.name}` : `Guessed: ${guessCurrency()}`} onPress={() => router.push(routes.picker('currency'))} />
        </View>
      </Card>
      <Plaque>
        <T role="micro" tone="faint">
          Your reflection
        </T>
        <T role="h3" style={{ marginTop: 4 }}>
          The photo the Mirror dresses.
        </T>
        <T role="bodySm" tone="muted" style={{ marginTop: 4 }}>
          Add, swap or remove it in the Mirror. It never leaves your account.
        </T>
        <View style={{ marginTop: space.md, alignSelf: 'flex-start' }}>
          <Button label="Manage in the Mirror" variant="ghost" size="sm" onPress={() => router.push(routes.mirror)} />
        </View>
      </Plaque>
    </View>
  )
}

function AccountSection({ profile }: { profile: Prof }) {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const { user, setUser } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [first, setFirst] = useState(user?.firstName ?? '')
  const [last, setLast] = useState(user?.lastName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  async function saveName() {
    if (!first.trim() || savingName) return
    setSavingName(true)
    try {
      const { user: u } = await updateName(first.trim(), last.trim() || null)
      if (user) setUser({ ...user, ...u })
      setEditingName(false)
      flash('Saved.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not change your name.')
    } finally {
      setSavingName(false)
    }
  }
  async function sendLink() {
    if (!user?.email || linkSent) return
    try {
      await apiFetch('/auth/forgot', { method: 'POST', body: { email: user.email } })
      setLinkSent(true)
      flash('A link to set a new password is on its way. It lasts an hour.')
    } catch {
      flash('Couldn’t send the link. Try again in a moment.')
    }
  }

  const name = user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  return (
    <View style={{ gap: space.lg }}>
      <Card>
        {editingName ? (
          <View style={styles.nameForm}>
            <Field label="First name" value={first} onChangeText={setFirst} autoFocus autoCapitalize="words" />
            <Field label="Last name" value={last} onChangeText={setLast} autoCapitalize="words" />
            <View style={styles.actions}>
              <Button label="Save" size="sm" loading={savingName} disabled={!first.trim()} onPress={() => void saveName()} />
              <Button label="Cancel" variant="quiet" size="sm" onPress={() => setEditingName(false)} />
            </View>
          </View>
        ) : (
          <NavRow first label="Name" value={name || '—'} right={<TextLink label="Change" onPress={() => setEditingName(true)} />} />
        )}
        <NavRow label="Email" value={user?.email} right={<T role="micro" tone={user?.emailVerified ? 'brass' : 'faint'}>{user?.emailVerified ? 'verified' : 'unverified'}</T>} />
        <NavRow label="Password" value={user?.hasPassword ? '········' : user?.hasGoogle ? 'Google sign-in' : '—'} right={<TextLink label={linkSent ? 'Link sent' : user?.hasPassword ? 'Send a change link' : 'Set a password'} disabled={linkSent} onPress={() => void sendLink()} />} />
        <NavRow label="Membership" value={planLabel(user?.plan)} onPress={() => router.push(routes.plan)} />
        <NavRow label="The fitting" value={profile.fittingCompletedAt ? `Done ${new Date(profile.fittingCompletedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Not finished'} />
        <NavRow label="Member since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'} />
      </Card>

      <AddressCard current={user?.handle ?? null} onChanged={(h) => { if (user) setUser({ ...user, handle: h }); flash(`Your address is now /u/${h}.`) }} />

      <Card>
        <NavRow first label="Sign out" value="This device only" onPress={() => router.push(routes.signOut)} />
        <View style={[styles.deleteRow, { borderTopColor: alpha(t.ink, 0.1) }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <T role="body" tone="danger">
              Delete the account
            </T>
            <T role="caption" tone="faint">
              Everything goes: the closet, the record, every photo.
            </T>
          </View>
          <TextLink label="Delete…" tone="danger" onPress={() => router.push(routes.deleteAccount)} />
        </View>
      </Card>
    </View>
  )
}

/** Your address on the circle: given automatically, changeable here, never asked for. */
function AddressCard({ current, onChanged }: { current: string | null; onChanged: (handle: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current ?? '')
  const [state, setState] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) return
    const h = value.trim()
    if (h === current) {
      setState({ ok: false, msg: 'That’s your address now.' })
      return
    }
    if (!/^[a-z0-9_]{3,20}$/.test(h)) {
      setState({ ok: false, msg: '3 to 20 characters: a to z, 0 to 9, underscore.' })
      return
    }
    const timer = setTimeout(() => {
      checkHandle(h)
        .then((r) => setState(r.available ? { ok: true, msg: 'Free.' } : { ok: false, msg: 'Taken. Try another.' }))
        .catch(() => setState({ ok: false, msg: 'Could not check that just now.' }))
    }, 250)
    return () => clearTimeout(timer)
  }, [value, editing, current])

  async function save() {
    if (!state.ok || saving) return
    setSaving(true)
    try {
      const { user } = await setHandle(value.trim())
      setEditing(false)
      onChanged(user.handle)
    } catch (err) {
      setState({ ok: false, msg: err instanceof Error ? err.message : 'Could not change that.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={styles.section}>
      <T role="h3">Your address</T>
      <T role="bodySm" tone="muted" style={{ marginTop: 2 }}>
        Friends see your name. This is the link to your room.
      </T>
      {!editing ? (
        <View style={[styles.actions, { marginTop: space.md }]}>
          <T role="body" style={{ fontVariant: ['tabular-nums'] }}>
            /u/{current ?? '…'}
          </T>
          <TextLink label={current ? 'Change' : 'Claim one'} onPress={() => setEditing(true)} />
        </View>
      ) : (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Field value={value} onChangeText={(v) => setValue(v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))} autoCapitalize="none" autoCorrect={false} autoFocus accessibilityLabel="Your address" helper={state.msg} returnKeyType="done" onSubmitEditing={() => void save()} />
          <View style={styles.actions}>
            <Button label="Save" size="sm" loading={saving} disabled={!state.ok} onPress={() => void save()} />
            <Button label="Cancel" variant="quiet" size="sm" onPress={() => setEditing(false)} />
          </View>
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxl, gap: space.lg },
  head: { gap: space.sm },
  section: { paddingVertical: space.lg },
  sizeHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  nameForm: { gap: space.md, paddingVertical: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: 1 },
})

// setCurrentCurrency is applied by the picker sheet; imported here so the
// practical section can re-apply the profile's code after a save elsewhere.
void setCurrentCurrency
