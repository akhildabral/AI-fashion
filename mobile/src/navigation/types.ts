import type { NavigatorScreenParams } from '@react-navigation/native'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

export type MainTabsParamList = {
  Stylist: undefined
  Looks: undefined
  Wardrobe: undefined
  TryOns: undefined
  Profile: { focusPhoto?: boolean } | undefined
}

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Main: NavigatorScreenParams<MainTabsParamList>
  Onboarding: undefined
}
