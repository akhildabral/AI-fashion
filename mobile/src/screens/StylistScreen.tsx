import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { apiFetch } from '../lib/api'
import type { GenerateResponse, Look } from '../lib/types'
import { Screen } from '../components/Screen'
import { LookCard } from '../components/LookCard'
import { Button, Card, EmptyState, ErrorText, Label, Select, Subtle, TextField } from '../components/ui'
import { colors, spacing } from '../theme'

const GENDERS = ['female', 'male', 'unisex'] as const
const GENDER_LABELS: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  unisex: 'Unisex',
}

export function StylistScreen() {
  const [occasion, setOccasion] = useState('')
  const [gender, setGender] = useState<string>('female')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [looks, setLooks] = useState<Look[] | null>(null)

  async function handleSubmit() {
    if (!occasion.trim() || loading) return
    setError(null)
    setLoading(true)
    setLooks(null)
    try {
      const res = await apiFetch<GenerateResponse>('/generate', {
        method: 'POST',
        body: { occasion: occasion.trim(), gender },
      })
      setLooks(res.looks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a look.')
    } finally {
      setLoading(false)
    }
  }

  function handleFavoriteChange(updated: Look) {
    setLooks((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)) : prev,
    )
  }

  return (
    <Screen
      title="What are you dressing for?"
      subtitle="Tell your stylist the occasion, and we'll compose a look — head to toe."
    >
      <Card style={styles.form}>
        <View>
          <Label>Occasion</Label>
          <TextField
            value={occasion}
            onChangeText={setOccasion}
            placeholder="e.g. beach wedding in Tuscany"
          />
        </View>
        <View>
          <Label>Style for</Label>
          <Select
            value={gender}
            options={GENDERS}
            onChange={setGender}
            allowEmpty={false}
            formatOption={(v) => GENDER_LABELS[v] ?? v}
          />
        </View>
        <Button
          title="Generate look"
          loadingTitle="Styling…"
          loading={loading}
          onPress={handleSubmit}
        />
        {error && <ErrorText>{error}</ErrorText>}
      </Card>

      {loading && (
        <Card padded={false} style={styles.loadingCard}>
          <View style={styles.loadingInner}>
            <Subtle>Composing your looks — this can take up to a minute.</Subtle>
          </View>
        </Card>
      )}

      {!loading && looks && looks.length > 0 && (
        <View style={styles.results}>
          {looks.map((look, i) => (
            <LookCard
              key={look.id ?? i}
              look={look}
              onFavoriteChange={handleFavoriteChange}
            />
          ))}
        </View>
      )}

      {!loading && looks && looks.length === 0 && !error && (
        <EmptyState>
          <Subtle>No looks came back — try a different occasion.</Subtle>
        </EmptyState>
      )}

      {!loading && !looks && !error && (
        <EmptyState>
          <Subtle>Your generated looks will appear here.</Subtle>
        </EmptyState>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  results: {
    gap: spacing.xl,
  },
  loadingCard: {
    marginBottom: spacing.xl,
  },
  loadingInner: {
    padding: spacing.xxl,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
  },
})
