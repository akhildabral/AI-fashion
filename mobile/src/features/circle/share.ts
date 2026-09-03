// Public pages stay on the web: a look or a vote leaves the app as a link,
// through the platform share sheet or the clipboard.
import * as Clipboard from 'expo-clipboard'
import { Platform, Share } from 'react-native'
import { WEB_ORIGIN } from '@/src/lib/config'

export function webLink(path: string): string {
  return `${WEB_ORIGIN}${path}`
}

/** The share sheet for a public page. Resolves to a notice, or null when dismissed. */
export async function sharePage(path: string, title: string): Promise<string | null> {
  const url = webLink(path)
  try {
    const res = await Share.share(Platform.OS === 'ios' ? { title, url } : { title, message: `${title} ${url}` })
    if (res.action === Share.dismissedAction) return null
    return 'Shared.'
  } catch {
    return (await copyLink(path)) ?? null
  }
}

export async function copyLink(path: string): Promise<string> {
  try {
    await Clipboard.setStringAsync(webLink(path))
    return 'Link copied. Paste it anywhere.'
  } catch {
    return 'Couldn’t copy. Try the share sheet instead.'
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text)
    return true
  } catch {
    return false
  }
}
