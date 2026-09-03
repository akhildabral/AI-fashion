// Picking and preparing photos: camera or library, downscaled on the phone
// so a 12MB HEIC never travels, then wrapped as multipart for the API.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

export interface PickedImage {
  uri: string
  name: string
  type: string
  width?: number
  height?: number
}

/** The server accepts up to 12MB; we send long edges of 2048px at most. */
const MAX_EDGE = 2048
const JPEG_QUALITY = 0.88

export type PickSource = 'camera' | 'library'

/**
 * Open the camera or the library and return the chosen photos. Permission is
 * asked at this moment (the platform prompt), never on launch. Returns an
 * empty list when the member backs out.
 */
export async function pickImages(source: PickSource, { multiple = false, limit = 12 } = {}): Promise<PickedImage[]> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) throw new PermissionDenied('camera')
    const res = await ImagePicker.launchCameraAsync({ quality: 1, exif: false })
    if (res.canceled) return []
    return Promise.all(res.assets.map(prepare))
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new PermissionDenied('photos')
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? limit : 1,
    quality: 1,
    exif: false,
    orderedSelection: true,
  })
  if (res.canceled) return []
  return Promise.all(res.assets.map(prepare))
}

export class PermissionDenied extends Error {
  readonly what: 'camera' | 'photos'
  constructor(what: 'camera' | 'photos') {
    super(what === 'camera' ? 'ZAUQ needs the camera for this. Allow it in Settings.' : 'ZAUQ needs your photos for this. Allow it in Settings.')
    this.name = 'PermissionDenied'
    this.what = what
  }
}

/** Downscale to the long edge and re-encode as JPEG (HEIC becomes JPEG here). */
export async function prepare(asset: { uri: string; width?: number; height?: number; fileName?: string | null }): Promise<PickedImage> {
  const w = asset.width ?? 0
  const h = asset.height ?? 0
  const long = Math.max(w, h)
  const ctx = ImageManipulator.manipulate(asset.uri)
  if (long > MAX_EDGE) {
    ctx.resize(w >= h ? { width: MAX_EDGE } : { height: MAX_EDGE })
  }
  const rendered = await ctx.renderAsync()
  const out = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG })
  const base = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '')
  return { uri: out.uri, name: `${base}.jpg`, type: 'image/jpeg', width: out.width, height: out.height }
}

/** Multipart body for one photo under the field name the route expects. */
export function imageForm(field: 'image' | 'photo', image: PickedImage, extra: Record<string, string> = {}): FormData {
  const form = new FormData()
  // React Native's FormData takes a { uri, name, type } part; the type does not model it.
  form.append(field, { uri: image.uri, name: image.name, type: image.type } as unknown as Blob)
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  return form
}
