// One fact row on the dossier, and its editor when open: chips for a choice,
// a Field for a word or a figure, a taller Field for a note.
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { WardrobeItem } from '@zauq/shared/types'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { labelFor, SOURCE_TAG, SOURCE_WORD, sourceOf, valueOf, type Fact } from './facts'

export function FactRow({
  item,
  fact,
  open,
  first,
  onOpen,
  onSave,
}: {
  item: WardrobeItem
  fact: Fact
  open: boolean
  first: boolean
  onOpen: () => void
  onSave: (value: unknown) => Promise<void>
}) {
  const { t } = useTheme()
  const value = valueOf(item, fact)
  const source = sourceOf(item, fact, value)
  const [draft, setDraft] = useState<string>(value == null || Array.isArray(value) ? '' : String(value))
  const [multi, setMulti] = useState<string[]>(Array.isArray(value) ? (value as string[]) : [])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(value == null || Array.isArray(value) ? '' : String(value))
    setMulti(Array.isArray(value) ? (value as string[]) : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, open])

  async function commit(v: unknown) {
    setBusy(true)
    try {
      await onSave(v)
    } finally {
      setBusy(false)
    }
  }

  const empty = source === 'none'
  const emptyWord = fact.yours ? 'Add it' : fact.kind === 'chips' && fact.options ? 'unsure · which?' : 'unsure'
  const isText = fact.kind === 'text' || fact.kind === 'money' || fact.kind === 'note'

  return (
    <View style={!first && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${fact.label}: ${empty ? 'not set' : labelFor(fact, value)}`}
        accessibilityState={{ expanded: open }}
        pressRetentionOffset={12}
        onPress={onOpen}
        style={styles.head}
      >
        <T role="bodySm" tone="muted" style={styles.label}>
          {fact.label}
        </T>
        {empty ? (
          <T role="lede" tone="brass" style={[styles.value, styles.emptyWord]}>
            {emptyWord}
          </T>
        ) : (
          <T role="bodySm" tone={source === 'guess' ? 'brass' : 'ink'} style={[styles.value, styles.semi]} align="right">
            {labelFor(fact, value)}
            {/* The web's ml-2 text-[9px] tracking-[0.14em] tag, on the same line */}
            <T role="micro" tone="faint" style={styles.tag}>
              {`  ${SOURCE_TAG[source]}`}
            </T>
          </T>
        )}
      </Pressable>

      {open ? (
        <Animated.View entering={fadeIn} style={styles.editor}>
          {!empty ? (
            <T role="caption" tone="faint">
              {SOURCE_WORD[source]}.
            </T>
          ) : null}
          {(fact.kind === 'chips' || fact.kind === 'multi') && fact.options ? (
            <View style={styles.chips}>
              {fact.options.map(([k, l]) => {
                const on = fact.kind === 'multi' ? multi.includes(k) : value === k
                return (
                  <Chip
                    key={k}
                    label={l}
                    on={on}
                    onPress={() => {
                      if (busy) return
                      if (fact.kind === 'multi') {
                        const next = on ? multi.filter((x) => x !== k) : [...multi, k]
                        setMulti(next)
                        void commit(next)
                      } else void commit(on ? null : k)
                    }}
                  />
                )
              })}
            </View>
          ) : null}
          {isText ? (
            <View style={styles.form}>
              <Field
                compact={fact.kind !== 'note'}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                multiline={fact.kind === 'note'}
                numberOfLines={fact.kind === 'note' ? 4 : 1}
                maxLength={fact.key === 'renderNotes' ? 900 : fact.kind === 'note' ? 400 : 80}
                keyboardType={fact.kind === 'money' ? 'decimal-pad' : 'default'}
                returnKeyType={fact.kind === 'note' ? 'default' : 'done'}
                onSubmitEditing={() => {
                  const v = draft.trim()
                  void commit(fact.kind === 'money' ? (v ? Number(v) : null) : v || null)
                }}
                placeholder={
                  fact.kind === 'money'
                    ? 'What it cost'
                    : fact.key === 'renderNotes'
                      ? 'What the Mirror must get right: the exact shade, the fabric, the collar, every logo and where it sits'
                      : fact.kind === 'note'
                        ? 'Sleeves taken up, a gift from, dry clean only'
                        : fact.label
                }
                style={fact.kind === 'note' ? styles.note : undefined}
                accessibilityLabel={fact.label}
              />
              <View style={styles.formActions}>
                <Button
                  label="Save"
                  size="sm"
                  loading={busy}
                  onPress={() => {
                    const v = draft.trim()
                    haptics.tap()
                    void commit(fact.kind === 'money' ? (v ? Number(v) : null) : v || null)
                  }}
                />
                {value != null ? <Button label="Clear" variant="quiet" size="sm" disabled={busy} onPress={() => void commit(null)} /> : null}
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // items-baseline justify-between gap-4 py-3
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.md },
  label: { flexShrink: 0 },
  value: { flex: 1, minWidth: 0 },
  semi: { fontFamily: fonts.sansSemi },
  // font-display text-sm italic
  emptyWord: { fontSize: 14, lineHeight: 20, textAlign: 'right' },
  tag: { letterSpacing: 1.4 },
  // pb-4, the source word mb-2, the form gap-2
  editor: { gap: space.sm, paddingBottom: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  form: { gap: space.sm },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  note: { minHeight: 88, textAlignVertical: 'top', paddingVertical: 10 },
})
