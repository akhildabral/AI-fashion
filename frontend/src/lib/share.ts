import { apiFetchBlob } from './api'
import { copyText } from './clipboard'

// Share as a verb: anything in the app can leave it as a card in our frame,
// through the OS share sheet (WhatsApp, Instagram, anything), with a link
// when there is a public page and the card alone when there isn't.

export type ShareKind = 'outfit' | 'look' | 'piece' | 'render'

export interface ShareTarget {
  kind: ShareKind
  id: string
  title: string
  text?: string
  /** A public page, when one exists (looks you shared have one). */
  url?: string
}

export type ShareOutcome = 'shared' | 'copied' | 'opened' | 'failed'

export async function shareCard(t: ShareTarget): Promise<ShareOutcome> {
  let file: File | null = null
  try {
    const blob = await apiFetchBlob(`/share/${t.kind}/${t.id}.png`)
    file = new File([blob], `zauq-${t.kind}.png`, { type: 'image/png' })
  } catch {
    file = null
  }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const data: ShareData = { title: t.title, text: t.text ?? t.title, ...(t.url ? { url: t.url } : {}) }
  if (file && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ ...data, files: [file] })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'failed'
    }
  }
  if (typeof nav.share === 'function' && t.url) {
    try {
      await nav.share(data)
      return 'shared'
    } catch {
      /* fall through */
    }
  }
  // Desktop without a share sheet: open the card in a new tab to save, and copy the link.
  if (file) {
    const u = URL.createObjectURL(file)
    window.open(u, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(u), 60_000)
    if (t.url) await copyText(t.url)
    return 'opened'
  }
  if (t.url && (await copyText(t.url))) return 'copied'
  return 'failed'
}

export function outcomeLine(o: ShareOutcome): string | null {
  switch (o) {
    case 'shared':
      return 'Shared.'
    case 'opened':
      return 'The card is open in a new tab — save it or drag it anywhere.'
    case 'copied':
      return 'Link copied — paste it anywhere.'
    default:
      return null
  }
}
