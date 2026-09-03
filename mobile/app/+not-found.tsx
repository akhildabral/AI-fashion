import { Link, Stack } from 'expo-router'
import { View } from 'react-native'
import { EmptyState } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <Screen edges={['top', 'bottom']} padded>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title="Nothing hangs here."
            line="That link points at a room that does not exist."
            action={
              <Link href="/" asChild>
                <Button label="Back to Today" variant="ghost" />
              </Link>
            }
          />
        </View>
      </Screen>
    </>
  )
}
