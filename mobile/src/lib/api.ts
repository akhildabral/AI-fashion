import * as SecureStore from 'expo-secure-store'
import { API_BASE_URL } from '../config'
import type { PickedImage } from './types'

const TOKEN_KEY = 'ai-fashion-token'
const API_ROOT = `${API_BASE_URL}/api`

// SecureStore is async; we keep an in-memory copy so hot paths don't await disk.
let cachedToken: string | null = null

export async function getToken(): Promise<string | null> {
  if (cachedToken !== null) return cachedToken
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  } catch {
    // Non-fatal: the in-memory copy still works for this session.
  }
}

export async function clearToken(): Promise<void> {
  cachedToken = null
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Skip attaching the Authorization header even if a token exists. */
  auth?: boolean
}

function extractError(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'error' in data) {
    return String((data as { error: unknown }).error)
  }
  if (typeof data === 'string' && data) return data
  return `Request failed with status ${status}`
}

async function parseBody(res: Response): Promise<unknown> {
  const raw = await res.text()
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Small fetch wrapper:
 * - prefixes the resolved API root (`${API_BASE_URL}/api`)
 * - attaches `Authorization: Bearer <token>` from SecureStore when present
 * - sends/parses JSON
 * - throws an `ApiError` (with the server's `error` message) on non-2xx
 */
export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = await getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(extractError(data, res.status), res.status)
  }
  return data as T
}

/**
 * Multipart upload helper. We deliberately do NOT set a `Content-Type` — React
 * Native fills in the correct `multipart/form-data` boundary itself. Still
 * attaches the Bearer token and throws an `ApiError` on non-2xx.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  { method = 'POST', auth = true }: { method?: string; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}

  if (auth) {
    const token = await getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: formData,
  })

  const data = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(extractError(data, res.status), res.status)
  }
  return data as T
}

/**
 * Build a `FormData` for uploading a picked image under the given field name.
 * React Native's FormData accepts a `{ uri, name, type }` object as a file part.
 */
export function buildImageFormData(field: string, image: PickedImage): FormData {
  const form = new FormData()
  // The RN FormData type doesn't model the file object shape, so cast.
  form.append(field, {
    uri: image.uri,
    name: image.name,
    type: image.type,
  } as unknown as Blob)
  return form
}
