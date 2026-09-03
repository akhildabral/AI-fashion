// Share cards: the server renders `/share/<kind>/<id>.png` behind auth, so
// the bytes come through the API client, land in the cache directory, and go
// out through the platform share sheet.
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { apiFetchBlob } from '@/src/lib/api'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the card.'))
    reader.onloadend = () => {
      const url = String(reader.result ?? '')
      const at = url.indexOf(',')
      resolve(at >= 0 ? url.slice(at + 1) : url)
    }
    reader.readAsDataURL(blob)
  })
}

/** Fetch a share card and hand it to the share sheet. Resolves once the sheet closes. */
export async function shareCard(kind: 'piece' | 'outfit', id: string, name: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.')
  const blob = await apiFetchBlob(`/share/${kind}/${id}.png`)
  const base64 = await blobToBase64(blob)
  const file = new File(Paths.cache, `zauq-${kind}-${id}.png`)
  if (file.exists) file.delete()
  file.write(base64, { encoding: 'base64' })
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: name })
}
