import type { StyleProfile } from '@zauq/shared/types'

/**
 * Whether the member has been through the fitting. Mirrors the web's
 * RequireProfile gate: a profile row exists once the fitting's first save
 * lands, and the phone's fitting is short enough to finish in one sitting.
 */
export function fittingComplete(profile: StyleProfile | null | undefined): boolean {
  return !!profile
}
