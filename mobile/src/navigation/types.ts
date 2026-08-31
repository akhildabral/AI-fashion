import type { NavigatorScreenParams } from '@react-navigation/native'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

export type FriendsStackParamList = {
  FriendsHome: undefined
  UserProfile: { handle: string }
}

export type MainTabsParamList = {
  Stylist: undefined
  Looks: undefined
  Wardrobe: undefined
  Friends: NavigatorScreenParams<FriendsStackParamList> | undefined
  TryOns: undefined
  Profile: { focusPhoto?: boolean } | undefined
}

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Main: NavigatorScreenParams<MainTabsParamList>
  Onboarding: undefined
}
