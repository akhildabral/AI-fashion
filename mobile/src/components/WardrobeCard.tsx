import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { deleteWardrobeItem, updateWardrobeItem } from '../lib/wardrobe'
import type { WardrobeItem, WardrobeItemEdit } from '../lib/types'
import { resolveImageUrl } from '../config'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { Button, Chip, ErrorText, Label, Select, TextField, TogglePill } from './ui'

const CATEGORIES = [
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
  'dress',
  'other',
] as const

const FORMALITIES = ['casual', 'smart-casual', 'business', 'formal', 'athletic'] as const

const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const

interface WardrobeCardProps {
  item: WardrobeItem
  onUpdated?: (item: WardrobeItem) => void
  onDeleted?: (id: string) => void
}

export function WardrobeCard({ item, onUpdated, onDeleted }: WardrobeCardProps) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imageUri = resolveImageUrl(item.imageUrl)
  const title = item.subtype?.trim() || item.category

  function confirmDelete() {
    if (deleting) return
    Alert.alert('Remove item', 'Remove this item from your wardrobe?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void handleDelete() },
    ])
  }

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    try {
      await deleteWardrobeItem(item.id)
      onDeleted?.(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this item.')
      setDeleting(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>No image</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View>
          <Text style={styles.category}>{item.category}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        {editing ? (
          <WardrobeEditForm
            item={item}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              onUpdated?.(updated)
              setEditing(false)
            }}
          />
        ) : (
          <>
            <View style={styles.chips}>
              {item.primaryColor ? <Chip>{item.primaryColor}</Chip> : null}
              {item.pattern ? <Chip>{item.pattern}</Chip> : null}
              {item.formality ? <Chip>{item.formality}</Chip> : null}
              {item.material ? <Chip>{item.material}</Chip> : null}
              {item.season.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </View>

            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}

            {error && <ErrorText>{error}</ErrorText>}

            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  setError(null)
                  setEditing(true)
                }}
              >
                <Text style={styles.editLink}>Edit tags</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                style={styles.removeBtn}
              >
                {deleting && <ActivityIndicator size="small" color={colors.inkFaint} />}
                <Text style={styles.removeText}>
                  {deleting ? 'Removing…' : 'Remove'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  )
}

interface WardrobeEditFormProps {
  item: WardrobeItem
  onCancel: () => void
  onSaved: (item: WardrobeItem) => void
}

function WardrobeEditForm({ item, onCancel, onSaved }: WardrobeEditFormProps) {
  const [category, setCategory] = useState(item.category)
  const [subtype, setSubtype] = useState(item.subtype ?? '')
  const [primaryColor, setPrimaryColor] = useState(item.primaryColor ?? '')
  const [pattern, setPattern] = useState(item.pattern ?? '')
  const [formality, setFormality] = useState(item.formality ?? '')
  const [material, setMaterial] = useState(item.material ?? '')
  const [description, setDescription] = useState(item.description ?? '')
  const [season, setSeason] = useState<string[]>(item.season)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSeason(value: string) {
    setSeason((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    )
  }

  async function handleSubmit() {
    setError(null)
    setSaving(true)
    const edits: WardrobeItemEdit = {
      category,
      subtype: subtype.trim(),
      primaryColor: primaryColor.trim(),
      pattern: pattern.trim(),
      formality,
      material: material.trim(),
      description: description.trim(),
      season,
    }
    try {
      const { item: updated } = await updateWardrobeItem(item.id, edits)
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.')
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View>
        <Label>Category</Label>
        <Select value={category} options={CATEGORIES} onChange={setCategory} allowEmpty={false} />
      </View>
      <View>
        <Label>Formality</Label>
        <Select
          value={formality}
          options={FORMALITIES}
          onChange={setFormality}
          placeholder="—"
        />
      </View>
      <View>
        <Label>Subtype</Label>
        <TextField
          value={subtype}
          onChangeText={setSubtype}
          placeholder="e.g. oxford shirt"
        />
      </View>
      <View>
        <Label>Color</Label>
        <TextField value={primaryColor} onChangeText={setPrimaryColor} placeholder="e.g. navy" />
      </View>
      <View>
        <Label>Pattern</Label>
        <TextField value={pattern} onChangeText={setPattern} placeholder="e.g. striped" />
      </View>
      <View>
        <Label>Material</Label>
        <TextField value={material} onChangeText={setMaterial} placeholder="e.g. cotton" />
      </View>
      <View>
        <Label>Season</Label>
        <View style={styles.seasonRow}>
          {SEASONS.map((s) => (
            <TogglePill
              key={s}
              label={s}
              active={season.includes(s)}
              onPress={() => toggleSeason(s)}
            />
          ))}
        </View>
      </View>
      <View>
        <Label>Description</Label>
        <TextField
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={2}
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
      </View>

      {error && <ErrorText>{error}</ErrorText>}

      <View style={styles.editActions}>
        <Button
          title="Save"
          loadingTitle="Saving…"
          loading={saving}
          onPress={handleSubmit}
        />
        <Button title="Cancel" variant="ghost" disabled={saving} onPress={onCancel} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.inkLine,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.boneSoft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.inkFaint,
    fontSize: 12,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  category: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.clay,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  editLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.clay,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.inkFaint,
  },
  seasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
})
