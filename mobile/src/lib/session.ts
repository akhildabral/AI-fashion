// The session on disk: the access token and the device's refresh token, in
// the Keychain / Keystore. A memory copy keeps the API client synchronous;
// `hydrateSession()` fills it once at boot before anything can request.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import type { TokenStore } from '@zauq/shared/api'

const TOKEN_KEY = 'zauq.token'
const REFRESH_KEY = 'zauq.refresh'

let token: string | null = null
let refreshToken: string | null = null
let hydrated = false

// Development builds compiled without code signing (a simulator run) have
// no keychain entitlement, so SecureStore throws. Only there, fall back to
// plain storage so a session survives a relaunch. Never in a release build.
const devFallback = __DEV__

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    if (!devFallback) return null
    try {
      return await AsyncStorage.getItem(key)
    } catch {
      return null
    }
  }
}

async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key)
    else await SecureStore.setItemAsync(key, value)
  } catch {
    if (!devFallback) return
    try {
      if (value === null) await AsyncStorage.removeItem(key)
      else await AsyncStorage.setItem(key, value)
    } catch {
      // The memory copy still carries this run.
    }
  }
}

/** Load both tokens from secure storage. Safe to call more than once. */
export async function hydrateSession(): Promise<{ token: string | null; refreshToken: string | null }> {
  if (!hydrated) {
    ;[token, refreshToken] = await Promise.all([read(TOKEN_KEY), read(REFRESH_KEY)])
    hydrated = true
  }
  return { token, refreshToken }
}

export const tokens: TokenStore = {
  get: () => token,
  set: (next) => {
    token = next
    void write(TOKEN_KEY, next)
  },
  clear: () => {
    token = null
    refreshToken = null
    void write(TOKEN_KEY, null)
    void write(REFRESH_KEY, null)
  },
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function setRefreshToken(next: string | null): void {
  refreshToken = next
  void write(REFRESH_KEY, next)
}

/** Store a freshly issued pair. */
export function adoptTokens(pair: { token: string; refreshToken?: string | null }): void {
  tokens.set(pair.token)
  if (pair.refreshToken !== undefined) setRefreshToken(pair.refreshToken)
}
