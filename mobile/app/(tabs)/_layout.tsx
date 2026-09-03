// The five rooms on the platform's own tab bar. Tabs are peers, so nothing
// slides between them.
import { MaterialIcons } from '@expo/vector-icons'
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs'
import { useTheme } from '@/src/design/theme'
import { alpha } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'

const ROOMS = [
  { name: 'today', label: 'Today', sf: 'sun.max', sfOn: 'sun.max.fill', md: 'wb-sunny' },
  { name: 'closet', label: 'Closet', sf: 'hanger', sfOn: 'hanger', md: 'checkroom' },
  { name: 'mirror', label: 'Mirror', sf: 'sparkles', sfOn: 'sparkles', md: 'auto-awesome' },
  { name: 'circle', label: 'Circle', sf: 'person.2', sfOn: 'person.2.fill', md: 'group' },
  { name: 'you', label: 'You', sf: 'person.crop.circle', sfOn: 'person.crop.circle.fill', md: 'account-circle' },
] as const

export default function TabsLayout() {
  const { t } = useTheme()
  return (
    <NativeTabs
      tintColor={t.brass}
      iconColor={alpha(t.ink, 0.55)}
      backgroundColor={t.surface}
      labelStyle={{ fontFamily: fonts.sansMedium, fontSize: 10, color: alpha(t.ink, 0.55) }}
      indicatorColor={t.brassSoft}
      minimizeBehavior="onScrollDown"
    >
      {ROOMS.map((room) => (
        <NativeTabs.Trigger key={room.name} name={room.name}>
          <Icon sf={{ default: room.sf, selected: room.sfOn }} androidSrc={<VectorIcon family={MaterialIcons} name={room.md} />} />
          <Label>{room.label}</Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  )
}
