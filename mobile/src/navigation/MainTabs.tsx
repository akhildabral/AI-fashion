import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from 'react-native'
import { StylistScreen } from '../screens/StylistScreen'
import { LooksScreen } from '../screens/LooksScreen'
import { WardrobeScreen } from '../screens/WardrobeScreen'
import { TryOnsScreen } from '../screens/TryOnsScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { FriendsScreen } from '../screens/FriendsScreen'
import { UserProfileScreen } from '../screens/UserProfileScreen'
import type { FriendsStackParamList, MainTabsParamList } from './types'
import { colors } from '../theme'

const Tab = createBottomTabNavigator<MainTabsParamList>()
const FriendsNav = createNativeStackNavigator<FriendsStackParamList>()

// Friends is a small stack so search results and network pills can push
// other people's profiles.
function FriendsStack() {
  return (
    <FriendsNav.Navigator screenOptions={{ headerShown: false }}>
      <FriendsNav.Screen name="FriendsHome" component={FriendsScreen} />
      <FriendsNav.Screen name="UserProfile" component={UserProfileScreen} />
    </FriendsNav.Navigator>
  )
}

const ICONS: Record<keyof MainTabsParamList, string> = {
  Stylist: '✦',
  Looks: '♡',
  Wardrobe: '⊞',
  Friends: '⚭',
  TryOns: '◉',
  Profile: '☺',
}

function tabIcon(name: keyof MainTabsParamList) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Text style={{ fontSize: focused ? 22 : 20, color }}>{ICONS[name]}</Text>
  )
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.clay,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.inkLine,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Stylist"
        component={StylistScreen}
        options={{ tabBarIcon: tabIcon('Stylist') }}
      />
      <Tab.Screen
        name="Looks"
        component={LooksScreen}
        options={{ tabBarIcon: tabIcon('Looks') }}
      />
      <Tab.Screen
        name="Wardrobe"
        component={WardrobeScreen}
        options={{ tabBarIcon: tabIcon('Wardrobe') }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsStack}
        options={{ tabBarIcon: tabIcon('Friends') }}
      />
      <Tab.Screen
        name="TryOns"
        component={TryOnsScreen}
        options={{ title: 'Try-Ons', tabBarIcon: tabIcon('TryOns') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon('Profile') }}
      />
    </Tab.Navigator>
  )
}
