// Query keys owned by the You room, beside the app-wide ones in
// `@/src/lib/query`. Kept here so invalidation stays exact without touching
// the shared file.
export const youKeys = {
  adminUsers: ['admin', 'users'] as const,
  adminReports: ['admin', 'reports'] as const,
  resale: (itemId: string) => ['resale', itemId] as const,
  /** Whether the app asks for Face ID before opening (AsyncStorage flag). */
  lock: ['settings', 'lock'] as const,
}

/** The AsyncStorage key the shell reads to decide whether to gate on Face ID. */
export const LOCK_STORAGE_KEY = 'zauq.lock'
