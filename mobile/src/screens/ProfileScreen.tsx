import { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { apiFetch } from '../lib/api'
import type { ProfileResponse, StyleProfile } from '../lib/types'
import { titleCase } from '../lib/outfit'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { PhotoManager } from '../components/PhotoManager'
import { MorningReminder } from '../components/MorningReminder'
import { StyleQuizCard } from '../components/StyleQuiz'
import {
  Button,
  CenteredSpinner,
  Chip,
  ErrorText,
  Eyebrow,
  Heading,
  Label,
  LinkText,
  Select,
  Subtle,
  TextField,
} from '../components/ui'
import type { MainTabsParamList } from '../navigation/types'
import { colors, radius, shadow, spacing } from '../theme'

const BODY_TYPES = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const
const SKIN_TONES = ['fair', 'light', 'medium', 'tan', 'deep'] as const
const STYLE_VIBES = [
  'minimal',
  'classic',
  'streetwear',
  'bohemian',
  'formal',
  'sporty',
  'edgy',
] as const
const BUDGET_BANDS = ['budget', 'mid', 'premium', 'luxury'] as const

interface FormState {
  bodyType: string
  heightCm: string
  sizeTop: string
  sizeBottom: string
  sizeShoe: string
  skinTone: string
  styleVibe: string
  budgetBand: string
  avoidColors: string[]
}

const EMPTY_FORM: FormState = {
  bodyType: '',
  heightCm: '',
  sizeTop: '',
  sizeBottom: '',
  sizeShoe: '',
  skinTone: '',
  styleVibe: '',
  budgetBand: '',
  avoidColors: [],
}

function toFormState(profile: StyleProfile): FormState {
  return {
    bodyType: profile.bodyType ?? '',
    heightCm:
      typeof profile.heightCm === 'number' && !Number.isNaN(profile.heightCm)
        ? String(profile.heightCm)
        : '',
    sizeTop: profile.sizes?.top ?? '',
    sizeBottom: profile.sizes?.bottom ?? '',
    sizeShoe: profile.sizes?.shoe ?? '',
    skinTone: profile.skinTone ?? '',
    styleVibe: profile.styleVibe ?? '',
    budgetBand: profile.budgetBand ?? '',
    avoidColors: Array.isArray(profile.avoidColors) ? profile.avoidColors : [],
  }
}

export function ProfileScreen() {
  const route = useRoute<RouteProp<MainTabsParamList, 'Profile'>>()
  const focusPhoto = route.params?.focusPhoto ?? false
  const { logout } = useAuth()
  const { profile, loading: profileLoading, setProfile } = useProfile()

  const isOnboarding = !profileLoading && !profile

  const scrollRef = useRef<ScrollView>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [hydrated, setHydrated] = useState(false)
  const [colorDraft, setColorDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill from the cached profile once it settles; fall back to a fetch.
  useEffect(() => {
    if (hydrated || profileLoading) return
    if (profile) {
      setForm(toFormState(profile))
      setHydrated(true)
      return
    }
    let cancelled = false
    apiFetch<ProfileResponse>('/profile')
      .then(({ profile: p }) => {
        if (cancelled) return
        if (p) setForm(toFormState(p))
      })
      .catch(() => {
        /* first-time users have no profile — start blank */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [profile, profileLoading, hydrated])

  // When navigated here to add a photo, scroll to the photo section.
  useEffect(() => {
    if (focusPhoto && hydrated) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)
      return () => clearTimeout(t)
    }
  }, [focusPhoto, hydrated])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  function addColor(raw: string) {
    const value = raw.trim()
    if (!value) return
    setForm((f) =>
      f.avoidColors.some((c) => c.toLowerCase() === value.toLowerCase())
        ? f
        : { ...f, avoidColors: [...f.avoidColors, value] },
    )
    setColorDraft('')
  }

  function removeColor(color: string) {
    setForm((f) => ({
      ...f,
      avoidColors: f.avoidColors.filter((c) => c !== color),
    }))
  }

  async function handleSubmit() {
    if (saving) return
    setError(null)
    setSaving(true)

    const pending = colorDraft.trim()
    const avoidColors =
      pending &&
      !form.avoidColors.some((c) => c.toLowerCase() === pending.toLowerCase())
        ? [...form.avoidColors, pending]
        : form.avoidColors

    const heightNum = Number(form.heightCm)
    const body: Partial<StyleProfile> = {
      bodyType: form.bodyType || undefined,
      heightCm: form.heightCm && !Number.isNaN(heightNum) ? heightNum : undefined,
      sizes: {
        top: form.sizeTop || undefined,
        bottom: form.sizeBottom || undefined,
        shoe: form.sizeShoe || undefined,
      },
      skinTone: form.skinTone || undefined,
      styleVibe: form.styleVibe || undefined,
      budgetBand: form.budgetBand || undefined,
      avoidColors,
    }

    try {
      const { profile: savedProfile } = await apiFetch<{ profile: StyleProfile }>(
        '/profile',
        { method: 'PUT', body },
      )
      setProfile(savedProfile)
      setColorDraft('')
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  if (profileLoading || !hydrated) {
    return (
      <SafeAreaView style={styles.safe}>
        <CenteredSpinner />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <View style={styles.headerBlock}>
            {isOnboarding && <Eyebrow>Welcome</Eyebrow>}
            <Heading size={32}>
              {isOnboarding ? "Let's set up your style profile" : 'Your style profile'}
            </Heading>
            <Subtle style={{ marginTop: spacing.sm }}>
              {isOnboarding
                ? 'A few details help your stylist compose looks that actually fit you. You can change these anytime.'
                : 'Update your measurements and taste so every look stays tailored to you.'}
            </Subtle>
          </View>

          <View style={styles.card}>
            <Heading size={20}>Fit</Heading>

            <View>
              <Label>Body type</Label>
              <Select
                value={form.bodyType}
                options={BODY_TYPES}
                onChange={(v) => update('bodyType', v)}
                formatOption={titleCase}
              />
            </View>

            <View>
              <Label>Height (cm)</Label>
              <TextField
                value={form.heightCm}
                onChangeText={(v) => update('heightCm', v)}
                keyboardType="number-pad"
                placeholder="e.g. 170"
              />
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Label>Top size</Label>
                <TextField
                  value={form.sizeTop}
                  onChangeText={(v) => update('sizeTop', v)}
                  placeholder="M"
                />
              </View>
              <View style={styles.rowItem}>
                <Label>Bottom size</Label>
                <TextField
                  value={form.sizeBottom}
                  onChangeText={(v) => update('sizeBottom', v)}
                  placeholder="32"
                />
              </View>
              <View style={styles.rowItem}>
                <Label>Shoe size</Label>
                <TextField
                  value={form.sizeShoe}
                  onChangeText={(v) => update('sizeShoe', v)}
                  placeholder="9"
                />
              </View>
            </View>

            <View style={styles.divider} />
            <Heading size={20}>Taste</Heading>

            <View>
              <Label>Skin tone</Label>
              <Select
                value={form.skinTone}
                options={SKIN_TONES}
                onChange={(v) => update('skinTone', v)}
                formatOption={titleCase}
              />
            </View>

            <View>
              <Label>Style vibe</Label>
              <Select
                value={form.styleVibe}
                options={STYLE_VIBES}
                onChange={(v) => update('styleVibe', v)}
                formatOption={titleCase}
              />
            </View>

            <View>
              <Label>Budget</Label>
              <Select
                value={form.budgetBand}
                options={BUDGET_BANDS}
                onChange={(v) => update('budgetBand', v)}
                formatOption={titleCase}
              />
            </View>

            <View>
              <Label>Colors to avoid</Label>
              {form.avoidColors.length > 0 && (
                <View style={styles.colorChips}>
                  {form.avoidColors.map((color) => (
                    <Pressable key={color} onPress={() => removeColor(color)}>
                      <View style={styles.colorChip}>
                        <Chip>{color}</Chip>
                        <Text style={styles.colorChipX}>×</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.colorInputRow}>
                <TextField
                  value={colorDraft}
                  onChangeText={setColorDraft}
                  onSubmitEditing={() => addColor(colorDraft)}
                  returnKeyType="done"
                  autoCapitalize="none"
                  placeholder="e.g. neon green"
                  style={{ flex: 1 }}
                />
                <Button
                  title="Add"
                  variant="ghost"
                  onPress={() => addColor(colorDraft)}
                />
              </View>
              <Text style={styles.hint}>Tap a color to remove it.</Text>
            </View>

            {error && <ErrorText>{error}</ErrorText>}
            {saved && !error && (
              <Text style={styles.savedText}>Profile saved.</Text>
            )}

            <Button
              title={isOnboarding ? 'Save & start styling' : 'Save profile'}
              loadingTitle="Saving…"
              loading={saving}
              onPress={handleSubmit}
              fullWidth
            />
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <PhotoManager />
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <StyleQuizCard />
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <MorningReminder />
          </View>

          <View style={styles.logoutRow}>
            <LinkText onPress={() => void logout()}>Log out</LinkText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bone,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  headerBlock: {
    marginBottom: spacing.xl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.inkLine,
    marginVertical: spacing.sm,
  },
  colorChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  colorChipX: {
    fontSize: 16,
    color: colors.inkFaint,
  },
  colorInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.inkFaint,
  },
  savedText: {
    fontSize: 14,
    color: colors.sage,
    fontWeight: '600',
  },
  logoutRow: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
})
