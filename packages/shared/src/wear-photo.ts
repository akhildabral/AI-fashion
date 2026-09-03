import { apiFetch, apiUpload } from './api'
import type { EventType, WardrobeItem, WearLogEntry } from './types'

// "This is what I wore": a photo of the day, read into pieces.

export type PhotoBand = 'sure' | 'near' | 'new'

export interface PhotoMatch {
  itemId: string
  score: number
  reasons: string[]
  item: WardrobeItem
}

export interface PhotoRow {
  index: number
  cropUrl: string
  description: string
  category: string
  subtype: string | null
  color: string | null
  band: PhotoBand
  matches: PhotoMatch[]
}

export interface WearPhotoJob {
  id: string
  date: string
  photoUrl: string
  status: 'processing' | 'ready' | 'confirmed' | 'failed'
  error: string | null
  confirmedLogId: string | null
  rows: PhotoRow[]
}

export interface RowDecision {
  index: number
  action: 'use' | 'add' | 'skip'
  itemId?: string
}

export interface ConfirmWearPhotoResponse {
  log: WearLogEntry
  /** Ids of the pieces added to the closet from the photo (still cataloguing). */
  added: string[]
  woreInstead: boolean
}

export function readWearPhoto(file: File, date: string) {
  const fd = new FormData()
  fd.append('date', date)
  fd.append('photo', file)
  return apiUpload<{ job: WearPhotoJob }>('/wear/photo', fd)
}

export function getWearPhoto(id: string) {
  return apiFetch<{ job: WearPhotoJob }>(`/wear/photo/${id}`)
}

export function confirmWearPhoto(id: string, body: { rows: RowDecision[]; mode?: 'instead' | 'also'; eventType?: EventType }) {
  return apiFetch<ConfirmWearPhotoResponse>(`/wear/photo/${id}/confirm`, { method: 'POST', body })
}
