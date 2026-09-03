// The web app's configuration of the shared API client: the token lives in
// localStorage, the base URL is same-origin `/api` (or VITE_API_URL), and
// picked files are pinned into memory before upload. Import this module
// (not `@zauq/shared/api`) from web code so the configuration is always in
// place before the first request.
import { configureApi, onAuthExpired } from '@zauq/shared/api'

export {
  ApiError,
  apiFetch,
  apiFetchBlob,
  apiUpload,
  clearToken,
  getToken,
  onAuthExpired,
  resolveImageUrl,
  setToken,
} from '@zauq/shared/api'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
const TOKEN_KEY = 'ai-fashion-token'

/** Set when a session dies mid-use, read once by the sign-in redirect. */
export function markSessionExpired() {
  try {
    sessionStorage.setItem('auth-expired', '1')
  } catch {
    /* ignore */
  }
}
export function sessionExpiredPending(): boolean {
  try {
    return sessionStorage.getItem('auth-expired') === '1'
  } catch {
    return false
  }
}
export function clearSessionExpired() {
  try {
    sessionStorage.removeItem('auth-expired')
  } catch {
    /* ignore */
  }
}

/**
 * Read a picked file into memory now, while its handle is still good. iOS
 * Safari can drop a picker's file handle after the picker closes (or when
 * the tab is backgrounded), and a multipart body streamed from it then ends
 * early — the server sees "Unexpected end of form". A file pinned into a
 * Blob uploads whole every time. A file with no type is given one from its
 * name so the server's filter can read it.
 */
export async function pinFile(file: File): Promise<File> {
  const buf = await file.arrayBuffer()
  const name = file.name || 'photo.jpg'
  const type = file.type || (/\.hei[cf]$/i.test(name) ? 'image/heic' : /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg')
  return new File([buf], name, { type, lastModified: file.lastModified })
}

/** The same form, with every file pinned into memory. */
async function pinForm(formData: FormData): Promise<FormData> {
  const out = new FormData()
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) out.append(key, await pinFile(value), value.name || 'photo.jpg')
    else out.append(key, value)
  }
  return out
}

configureApi({
  baseUrl: BASE_URL,
  tokens: {
    get: () => localStorage.getItem(TOKEN_KEY),
    set: (token) => localStorage.setItem(TOKEN_KEY, token),
    clear: () => localStorage.removeItem(TOKEN_KEY),
  },
  prepareForm: pinForm,
  // Image URLs from the API are same-origin relative paths on the web.
})

onAuthExpired(markSessionExpired)
