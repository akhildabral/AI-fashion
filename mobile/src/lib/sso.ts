// Native sign-in: Google through the platform SDK, Apple through the system
// sheet. Each resolves to the identity token the backend verifies.
import * as AppleAuthentication from 'expo-apple-authentication'
import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin'
import { Platform } from 'react-native'

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

let googleConfigured = false

/** Google is offered only once its client IDs are configured. */
export function googleAvailable(): boolean {
  return !!webClientId
}

function configureGoogle() {
  if (googleConfigured || !webClientId) return
  GoogleSignin.configure({ webClientId, iosClientId })
  googleConfigured = true
}

/** The Google id token, or null when the member backed out of the sheet. */
export async function googleIdToken(): Promise<string | null> {
  configureGoogle()
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  try {
    const res = await GoogleSignin.signIn()
    if (!isSuccessResponse(res)) return null
    return res.data.idToken
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === statusCodes.SIGN_IN_CANCELLED) return null
    throw err
  }
}

export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  try {
    return await AppleAuthentication.isAvailableAsync()
  } catch {
    return false
  }
}

export interface AppleCredential {
  identityToken: string
  fullName?: { givenName?: string | null; familyName?: string | null }
}

/** Apple's identity token (and the name, which Apple sends once), or null on cancel. */
export async function appleCredential(): Promise<AppleCredential | null> {
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    })
    if (!c.identityToken) return null
    return {
      identityToken: c.identityToken,
      fullName: c.fullName ? { givenName: c.fullName.givenName, familyName: c.fullName.familyName } : undefined,
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null
    throw err
  }
}
