// One door for posting: share a look, ask the circle, style a friend. Three
// rows on hairlines, each a word and a line, a chevron at the end: no icons.
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { ChevronGlyph } from '@/src/components/Glyphs'
import { SheetShell } from '@/src/components/Sheet'

const ROWS: { title: string; line: string; to: '/sheets/circle-share-look' | '/sheets/circle-ask' | '/sheets/circle-style-friend' }[] = [
  { title: 'Share a look', line: 'A recent wear, as the pieces or a photo of you in it.', to: '/sheets/circle-share-look' },
  { title: 'Ask the circle', line: 'Two or three of anything. They pick the one you should wear.', to: '/sheets/circle-ask' },
  { title: 'Style a friend', line: 'Dress someone from their public closet, with the stylist alongside.', to: '/sheets/circle-style-friend' },
]

export default function ComposeSheet() {
  const { t } = useTheme()
  return (
    <SheetShell dense title="Post to your circle">
      <View style={styles.list}>
        {ROWS.map((r, i) => (
          <Press key={r.to} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => router.replace(r.to)}>
            <View style={[styles.row, i > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }]}>
              <View style={styles.text}>
                <T role="h3">{r.title}</T>
                <T role="bodySm" tone="muted">
                  {r.line}
                </T>
              </View>
              <ChevronGlyph color={alpha(t.ink, 0.35)} />
            </View>
          </Press>
        ))}
      </View>
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  list: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, minHeight: 72 },
  text: { flex: 1, gap: space.xs },
})
