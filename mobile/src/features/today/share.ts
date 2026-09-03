// Share as a verb, on the phone: the card is fetched with the session, kept
// in the cache directory, and handed to the OS share sheet (the web's
// `shareCard` without the desktop fallbacks).
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { apiFetchBlob } from '@/src/lib/api'

export type ShareKind = 'outfit' | 'look' | 'piece' | 'render'
export type ShareOutcome = 'shared' | 'failed'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the card.'))
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const comma = url.indexOf(',')
      resolve(comma >= 0 ? url.slice(comma + 1) : url)
    }
    reader.readAsDataURL(blob)
  })
}

/** Fetch `/share/<kind>/<id>.png` into the cache and return the file. */
export async function fetchShareCard(kind: ShareKind, id: string): Promise<File> {
  const blob = await apiFetchBlob(`/share/${kind}/${id}.png`)
  const base64 = await blobToBase64(blob)
  const file = new File(Paths.cache, `zauq-${kind}-${id}.png`)
  if (file.exists) file.delete()
  file.write(base64, { encoding: 'base64' })
  return file
}

/** The card through the OS sheet. `failed` covers "no sheet here" and a backed-out sheet alike. */
export async function shareCard(kind: ShareKind, id: string, dialogTitle = 'Share'): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'failed'
  const file = await fetchShareCard(kind, id)
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle })
    return 'shared'
  } catch {
    return 'failed'
  }
}
