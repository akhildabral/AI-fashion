// One query client for the app, persisted to disk so a cold start shows the
// last brief and closet at once and revalidates behind it.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@zauq/shared/api'
import { APP_VERSION } from './config'

const DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 7 * DAY,
      retry: (count, err) => {
        // A 4xx is an answer, not a blip.
        if (err instanceof ApiError && err.status < 500) return false
        return count < 2
      },
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'zauq.query',
  throttleTime: 1000,
})

/** Persisted caches from another app version are dropped. */
export const persistOptions = {
  persister: queryPersister,
  maxAge: 7 * DAY,
  buster: APP_VERSION,
}

/** Query keys, in one place so invalidation is exact. */
export const qk = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  bootstrap: ['bootstrap'] as const,
  brief: (date: string) => ['brief', date] as const,
  week: (from: string) => ['week', from] as const,
  wardrobe: ['wardrobe'] as const,
  piece: (id: string) => ['wardrobe', id] as const,
  basket: ['basket'] as const,
  wishlist: ['wishlist'] as const,
  outfits: ['outfits'] as const,
  tryons: ['tryons'] as const,
  tryon: (id: string) => ['tryons', id] as const,
  reflections: ['reflections'] as const,
  feed: (lens: string, extra?: string) => ['feed', lens, extra ?? ''] as const,
  post: (type: string, id: string) => ['post', type, id] as const,
  notifications: ['notifications'] as const,
  unread: ['unread'] as const,
  trips: ['trips'] as const,
  trip: (id: string) => ['trips', id] as const,
  journal: (month: string) => ['journal', month] as const,
  insights: ['insights'] as const,
  ritual: ['ritual'] as const,
  gaps: ['gaps'] as const,
  usage: ['usage'] as const,
  billing: ['billing'] as const,
  push: ['push'] as const,
  social: ['social'] as const,
  user: (handle: string) => ['user', handle] as const,
  lookbooks: ['lookbooks'] as const,
  taste: ['taste'] as const,
}
