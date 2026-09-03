// Notifications: the morning ritual on this device, the evening nudge, and
// the event pushes. The controls live in RitualSettings so the fitting can
// show the same card after the first reveal.
import { Stack } from 'expo-router'
import { ScrollView, StyleSheet } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { gutter, space } from '@/src/design/tokens'
import { RitualSettings } from '@/src/features/you/RitualSettings'

export default function Notifications() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Notifications' }} />
      <Screen>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <T role="bodySm" tone="muted">
            One nudge a day is the whole idea. Nothing here is on until you say so.
          </T>
          <RitualSettings />
        </ScrollView>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxl, gap: space.lg },
})
