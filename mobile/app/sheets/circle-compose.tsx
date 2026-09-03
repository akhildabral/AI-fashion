// One door for posting: share a look, ask the circle, style a friend.
import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { Press, type IconName } from '@/src/features/circle/atoms'
import { SheetFrame } from '@/src/features/circle/SheetFrame'

const ROWS: { icon: IconName; title: string; line: string; to: '/sheets/circle-share-look' | '/sheets/circle-ask' | '/sheets/circle-style-friend' }[] = [
  { icon: 'checkroom', title: 'Share a look', line: 'A recent wear, as the pieces or a photo of you in it.', to: '/sheets/circle-share-look' },
  { icon: 'how-to-vote', title: 'Ask the circle', line: 'Two or three of anything. They pick the one you should wear.', to: '/sheets/circle-ask' },
  { icon: 'auto-awesome', title: 'Style a friend', line: 'Dress someone from their public closet, with the stylist alongside.', to: '/sheets/circle-style-friend' },
]

export default function ComposeSheet() {
  const { t } = useTheme()
  return (
    <SheetFrame title="Post to your circle">
      <View style={styles.list}>
        {ROWS.map((r, i) => (
          <Press key={r.to} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => router.replace(r.to)}>
            <View style={[styles.row, i > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }]}>
              <View style={[styles.icon, { borderColor: alpha(t.brass, 0.5), borderRadius: radius }]}>
                <MaterialIcons name={r.icon} size={20} color={t.brass} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T role="body" style={{ fontFamily: fonts.sansSemi }}>
                  {r.title}
                </T>
                <T role="caption" tone="muted">
                  {r.line}
                </T>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={alpha(t.ink, 0.35)} />
            </View>
          </Press>
        ))}
      </View>
    </SheetFrame>
  )
}

const styles = StyleSheet.create({
  list: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, minHeight: 72 },
  icon: { width: 40, height: 40, borderWidth: hairline, alignItems: 'center', justifyContent: 'center' },
})
