// You: the fitting's answers, editable with the fitting's own controls and
// saved as you change them; the practical facts; and the account beside them.
// The web's ProfilePage: header, the tabs 24 below, the section 24 below
// that as a `card p-5`, and the aside 32 under it with its panels 20 apart.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { checkHandle, updateName } from '@zauq/shared/fitting'
import { CURRENCIES, guessCurrency } from '@zauq/shared/money'
import { setHandle } from '@zauq/shared/social'
import type { StyleProfile } from '@zauq/shared/types'
import { setCurrentUnits } from '@zauq/shared/units'
import { Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useAuth } from '@/src/context/AuthProvider'
import { useProfile } from '@/src/context/ProfileProvider'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
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
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ section?: string }>()
  const initial = SECTIONS.some((s) => s.key === params.section) ? (params.section as Section) : 'fit'
  const [section, setSection] = useState<Section>(initial)
  const { profile, save, whisper } = useProfileSave()
  const handle = user?.handle

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Profile',
          headerRight: () =>
            whisper ? (
              <T role="bodySm" tone="faint" style={styles.whisper} accessibilityLiveRegion="polite">
                {whisper}
              </T>
            ) : null,
        }}
      />
      <Screen>
        <KeyboardAwareScrollView bottomOffset={40} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <RoomHeader
            eyebrow="You"
            title="The facts you’re"
            emphasis="dressed by."
            lead="What the fitting learned, editable here. Every change saves itself."
            right={handle ? <Button label="Your room" variant="ghost" size="sm" onPress={() => router.push(routes.room(handle))} /> : undefined}
            style={styles.header}
          />
          {!profile ? (
            <Card padding={24} style={[styles.mt8, styles.centered]}>
              <T role="h2" align="center">
                Your stylist hasn’t met you yet.
              </T>
              <T role="bodySm" tone="muted" align="center" style={[styles.mt2, styles.narrow]}>
                The fitting takes a few minutes: who you dress for, your measure, your taste.
              </T>
              <Button label="Start the fitting" style={styles.mt5} onPress={() => router.push(routes.fitting)} />
            </Card>
          ) : (
            <>
              <View style={styles.mt6}>
                <Tabs items={SECTIONS} value={section} onChange={setSection} />
              </View>
              <View style={styles.mt6}>
                {section === 'fit' ? <FitSection profile={profile} save={save} /> : section === 'taste' ? <TasteSection profile={profile} save={save} /> : section === 'practical' ? <PracticalSection profile={profile} save={save} /> : <AccountSection profile={profile} />}
              </View>
            </>
          )}
        </KeyboardAwareScrollView>
      </Screen>
    </>
  )
}

type SaveFn = ReturnType<typeof useProfileSave>['save']
type Prof = NonNullable<ReturnType<typeof useProfileSave>['profile']>

/** A size: its label and a short field to type one, the chips 8 beneath. */
function SizeRow({ label, options, value, onPick, upper }: { label: string; options: string[]; value: string; onPick: (v: string) => void; upper?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <View style={styles.mt7}>
      <View style={styles.sizeHead}>
        <RowLabel first>{label}</RowLabel>
        <View style={styles.sizeField}>
          <Field compact value={draft} onChangeText={setDraft} onBlur={() => onPick(draft.trim())} placeholder="or type" accessibilityLabel={`${label} size`} autoCapitalize="characters" style={styles.centerText} />
        </View>
      </View>
      <Wrap style={styles.mt2}>
        {options.map((s) => (
          <Chip key={s} label={s} on={(upper ? value.toUpperCase() : value) === s} onPress={() => onPick(s)} />
        ))}
      </Wrap>
    </View>
  )
}

function FitSection({ profile, save }: { profile: Prof; save: SaveFn }) {
  const router = useRouter()
  const units = profile.units ?? 'metric'
  const sizes = profile.sizes ?? {}
  const [height, setHeight] = useState(profile.heightCm || 170)
  useEffect(() => setHeight(profile.heightCm || 170), [profile.heightCm])
  const setSize = (kind: 'top' | 'bottom' | 'shoe', value: string) => save({ sizes: { ...sizes, [kind]: value || undefined } }, `size-${kind}`)
  return (
    <>
      <Card padding="form">
        <RowLabel first>How tall</RowLabel>
        <View style={styles.mt2}>
          <Stepper
            value={height}
            min={HEIGHT_MIN}
            max={HEIGHT_MAX}
            label={heightLabel(height, units)}
            ticks={[heightLabel(HEIGHT_MIN, units), heightLabel(175, units), heightLabel(HEIGHT_MAX, units)]}
            accessibilityLabel="height"
            onChange={(v) => {
              setHeight(v)
              save({ heightCm: v }, 'height', 500)
            }}
          />
        </View>
        <RowLabel>Build</RowLabel>
        <Wrap style={styles.mt3}>
          {BUILDS.map((b) => (
            <Chip key={b} label={title(b)} on={profile.bodyType === b} onPress={() => save({ bodyType: b })} />
          ))}
        </Wrap>
        <SizeRow label="What you reach for · tops" options={TOP_SIZES} value={sizes.top ?? ''} onPick={(v) => setSize('top', v)} upper />
        <SizeRow label="Bottoms" options={BOTTOM_SIZES} value={sizes.bottom ?? ''} onPick={(v) => setSize('bottom', v)} />
        <SizeRow label="Shoes" options={SHOE_SIZES} value={sizes.shoe ?? ''} onPick={(v) => setSize('shoe', v)} />
        <RowLabel>Who we dress</RowLabel>
        <Wrap style={styles.mt3}>
          {WHO.map(([k, l]) => (
            <Chip key={k} label={l} on={profile.styleFor === k} onPress={() => save({ styleFor: k })} />
          ))}
        </Wrap>
      </Card>
      <View style={styles.aside}>
        {/* Where the web keeps its PhotoManager: the reflection lives in the Mirror on the phone. */}
        <Plaque>
          <T role="micro" tone="faint">
            Your reflection
          </T>
          <T role="h3" style={styles.mt1}>
            The photo the Mirror dresses.
          </T>
          <T role="bodySm" tone="muted" style={styles.mt1}>
            Add, swap or remove it in the Mirror. It never leaves your account.
          </T>
          <View style={[styles.mt3, styles.start]}>
            <Button label="Manage in the Mirror" variant="ghost" size="sm" onPress={() => router.push(routes.mirror)} />
          </View>
        </Plaque>
        <Plaque>
          <T role="micro" tone="faint">
            Nothing here is shown to anyone
          </T>
          <T role="bodySm" tone="muted" style={styles.mt1}>
            Your measure and your photo stay between you and the stylist. Friends see your name, your room and the pieces you make public.
          </T>
        </Plaque>
      </View>
    </>
  )
}

function TasteSection({ profile, save }: { profile: Prof; save: SaveFn }) {
  const router = useRouter()
  const list = profile.avoidColors ?? []
  const avoid = new Set(list.map((c) => c.toLowerCase()))
  const custom = list.filter((c) => !COLOURS.some(([k]) => k === c.toLowerCase()))
  const toggleAvoid = (colour: string) => save({ avoidColors: avoid.has(colour) ? list.filter((c) => c.toLowerCase() !== colour) : [...list, colour] })
  const toggleDay = (k: string) => {
    const days = profile.occasions ?? []
    save({ occasions: days.includes(k) ? days.filter((x) => x !== k) : [...days, k] })
  }
  return (
    <>
      <Card padding="form">
        <RowLabel first>Your tone</RowLabel>
        <Wrap style={[styles.mt3, styles.swatches]}>
          {TONES.map(([k, c]) => (
            <Swatch key={k} colour={c} label={k} on={profile.skinTone === k} onPress={() => save({ skinTone: k })} />
          ))}
        </Wrap>
        <RowLabel>Never on me</RowLabel>
        <Wrap style={[styles.mt3, styles.swatches]}>
          {COLOURS.map(([k, c]) => (
            <Swatch key={k} colour={c} label={`Avoid ${k}`} on={avoid.has(k)} struck={avoid.has(k)} onPress={() => toggleAvoid(k)} />
          ))}
        </Wrap>
        {custom.length > 0 ? (
          <Wrap style={styles.mt3}>
            {custom.map((c) => (
              <Chip key={c} label={`${c} ×`} on onPress={() => toggleAvoid(c.toLowerCase())} />
            ))}
          </Wrap>
        ) : null}
        <RowLabel>What matters most</RowLabel>
        <Wrap style={styles.mt3}>
          {INTENTS.map(([k, l]) => (
            <Chip key={k} label={l} on={(profile.intents ?? [])[0] === k} onPress={() => save({ intents: [k] })} />
          ))}
        </Wrap>
        <RowLabel>The days you dress for</RowLabel>
        <Wrap style={styles.mt3}>
          {DAYS.map(([k, l]) => (
            <Chip key={k} label={l} on={(profile.occasions ?? []).includes(k)} onPress={() => toggleDay(k)} />
          ))}
        </Wrap>
        <RowLabel>Your vibe</RowLabel>
        <Wrap style={styles.mt3}>
          {VIBES.map((v) => (
            <Chip key={v} label={title(v)} on={profile.styleVibe === v} onPress={() => save({ styleVibe: v })} />
          ))}
        </Wrap>
        <RowLabel>How you shop</RowLabel>
        <Wrap style={styles.mt3}>
          {BUDGETS.map(([k, l]) => (
            <Chip key={k} label={l} on={profile.budgetBand === k} onPress={() => save({ budgetBand: k })} />
          ))}
        </Wrap>
      </Card>
      <View style={styles.aside}>
        <Plaque>
          <T role="micro" tone="faint">
            How this is used
          </T>
          <T role="bodySm" tone="muted" style={styles.mt1}>
            Struck colours never come back in a brief. Your tone steers the shades. The days you dress for decide what the week is composed around.
          </T>
          <View style={styles.mt3}>
            <TextLink label="The record, where the numbers live →" onPress={() => router.push(routes.journal())} />
          </View>
        </Plaque>
      </View>
    </>
  )
}

function PracticalSection({ profile, save }: { profile: Prof; save: SaveFn }) {
  const router = useRouter()
  const units = profile.units ?? 'metric'
  const [city, setCity] = useState(profile.city ?? '')
  useEffect(() => setCity(profile.city ?? ''), [profile.city])
  const currency = CURRENCIES.find((c) => c.code === profile.currency)
  const currencyLine = currency ? `${currency.code} · ${currency.name}` : `Guess from my location (${guessCurrency()})`
  return (
    <Card padding="form">
      <RowLabel first>Home city · for the weather in your brief</RowLabel>
      <View style={styles.mt3}>
        <Field value={city} onChangeText={setCity} placeholder="e.g. Dubai" accessibilityLabel="Home city" autoCapitalize="words" returnKeyType="done" onBlur={() => (city.trim() || null) !== (profile.city ?? null) && save({ city: city.trim() || null }, 'city', 0)} />
      </View>
      <RowLabel>Units</RowLabel>
      <Wrap style={styles.mt3}>
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
      <View style={styles.mt1}>
        <NavRow first label={currencyLine} accessibilityLabel={`Currency, ${currencyLine}`} onPress={() => router.push(routes.picker('currency'))} />
      </View>
    </Card>
  )
}

function AccountSection({ profile }: { profile: Prof }) {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const { user, setUser } = useAuth()
  const { setProfile } = useProfile()
  const [editingName, setEditingName] = useState(false)
  const [first, setFirst] = useState(user?.firstName ?? '')
  const [last, setLast] = useState(user?.lastName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [redoing, setRedoing] = useState(false)

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
  // The web's redo: the fitting starts over from its first step.
  async function redoFitting() {
    if (redoing) return
    setRedoing(true)
    try {
      const { profile: saved } = await apiFetch<{ profile: StyleProfile }>('/profile', { method: 'PUT', body: { fittingStep: 0, fittingDone: false } })
      setProfile(saved)
      router.push(routes.fitting)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not restart the fitting.')
    } finally {
      setRedoing(false)
    }
  }

  const name = user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  const fitted = profile.fittingCompletedAt ? `Done ${new Date(profile.fittingCompletedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Not finished'
  const since = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Not set'
  return (
    <>
      <Card>
        {editingName ? (
          <View style={styles.nameForm}>
            <View style={styles.nameFields}>
              <View style={styles.grow}>
                <Field compact value={first} onChangeText={setFirst} placeholder="First" accessibilityLabel="First name" autoFocus autoCapitalize="words" />
              </View>
              <View style={styles.grow}>
                <Field compact value={last} onChangeText={setLast} placeholder="Last" accessibilityLabel="Last name" autoCapitalize="words" />
              </View>
            </View>
            <View style={styles.actions}>
              <Button label="Save" size="sm" loading={savingName} disabled={!first.trim()} onPress={() => void saveName()} />
              <Button label="Cancel" variant="quiet" size="sm" onPress={() => setEditingName(false)} />
            </View>
          </View>
        ) : (
          <NavRow first strong label="Name" value={name || 'Not set'} right={<TextLink label="Change" onPress={() => setEditingName(true)} />} />
        )}
        <NavRow strong label="Email" value={user?.email} right={<T role="micro" tone={user?.emailVerified ? 'brass' : 'faint'}>{user?.emailVerified ? 'verified' : 'unverified'}</T>} />
        <NavRow strong label="Password" value={user?.hasPassword ? '········' : user?.hasGoogle ? 'Google sign-in' : 'Not set'} right={<TextLink label={linkSent ? 'Link sent' : user?.hasPassword ? 'Send a change link' : 'Set a password'} disabled={linkSent} onPress={() => void sendLink()} />} />
        <NavRow strong label="Membership" value={planLabel(user?.plan)} right={<TextLink label="Plan & usage" onPress={() => router.push(routes.plan)} />} />
        <NavRow strong label="The fitting" value={fitted} right={<TextLink label={redoing ? 'One moment…' : 'Redo it'} disabled={redoing} onPress={() => void redoFitting()} />} />
        <NavRow strong label="Member since" value={since} />
        <NavRow strong label="Sign out" right={<TextLink label="Sign out of this device" tone="muted" onPress={() => router.push(routes.signOut)} />} />
        <View style={[styles.deleteRow, { borderTopColor: alpha(t.ink, 0.1) }]}>
          <View style={styles.grow}>
            <T role="bodySm" tone="muted">
              Delete the account
            </T>
            <T role="caption" tone="faint">
              Everything goes: the closet, the record, every photo.
            </T>
          </View>
          <TextLink label="Delete…" tone="danger" onPress={() => router.push(routes.deleteAccount)} />
        </View>
      </Card>
      <View style={styles.aside}>
        <AddressCard
          current={user?.handle ?? null}
          onChanged={(h) => {
            if (user) setUser({ ...user, handle: h })
            flash(`Your address is now /u/${h}.`)
          }}
        />
      </View>
    </>
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
    <Card padding="form">
      <T role="h3">Your address</T>
      <T role="bodySm" tone="muted" style={styles.mt1}>
        Friends see your name. This is the link to your room.
      </T>
      {!editing ? (
        <View style={[styles.actions, styles.mt3]}>
          <T role="bodySm" style={styles.code}>
            /u/{current ?? '…'}
          </T>
          <TextLink label={current ? 'Change' : 'Claim one'} onPress={() => setEditing(true)} />
        </View>
      ) : (
        <View style={styles.mt3}>
          <View style={styles.nameFields}>
            <View style={styles.grow}>
              <Field compact value={value} onChangeText={(v) => setValue(v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))} autoCapitalize="none" autoCorrect={false} autoFocus accessibilityLabel="Your address" returnKeyType="done" onSubmitEditing={() => void save()} />
            </View>
            <Button label="Save" size="sm" loading={saving} disabled={!state.ok} onPress={() => void save()} />
            <Button label="Cancel" variant="quiet" size="sm" onPress={() => setEditing(false)} />
          </View>
          <T role="caption" tone={state.ok ? 'brass' : 'muted'} style={styles.addressNote} accessibilityLiveRegion="polite">
            {state.msg}
          </T>
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxl },
  header: { paddingBottom: 0 },
  // The web's `font-display text-sm italic`: Bodoni italic at 14 on a 20 line.
  whisper: { fontFamily: fonts.serifItalic },
  // The web's `mt-*`, literally.
  mt1: { marginTop: space.xs },
  mt2: { marginTop: space.sm },
  mt3: { marginTop: space.md },
  mt5: { marginTop: 20 },
  mt6: { marginTop: space.xl },
  mt7: { marginTop: space.xl + space.xs },
  mt8: { marginTop: space.xxl },
  centered: { alignItems: 'center' },
  narrow: { maxWidth: 384 },
  start: { alignSelf: 'flex-start' },
  grow: { flex: 1 },
  // The web's aside: `mt-8 flex-col gap-5`.
  aside: { marginTop: space.xxl, gap: 20 },
  swatches: { gap: 10 },
  sizeHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  sizeField: { width: 80 },
  centerText: { textAlign: 'center' },
  nameForm: { gap: space.sm, paddingVertical: space.sm },
  nameFields: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingVertical: space.sm, borderTopWidth: hairline },
  code: { fontVariant: ['tabular-nums'] },
  addressNote: { marginTop: 6 },
})
