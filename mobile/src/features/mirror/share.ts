// Share a render as the card in our frame: the PNG is fetched with the
// session, written to the cache, and handed to the OS share sheet.
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { apiFetchBlob } from '@/src/lib/api'

export type ShareOutcome = 'shared' | 'unavailable' | 'failed'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the card.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

export async function shareRender(id: string, title = 'Me, in the Mirror'): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable'
  try {
    const blob = await apiFetchBlob(`/share/render/${id}.png`)
    const base64 = await blobToBase64(blob)
    const file = new File(Paths.cache, `zauq-render-${id}.png`)
    if (file.exists) file.delete()
    file.create()
    file.write(base64, { encoding: 'base64' })
    await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title })
    return 'shared'
  } catch {
    return 'failed'
  }
}
