import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import type { PickedImage } from './types'

/** Derive a filename + mime type from a local image URI. */
function toPickedImage(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const uri = asset.uri
  const extFromUri = uri.split('.').pop()?.split('?')[0]?.toLowerCase()
  const ext = extFromUri && /^(jpe?g|png|webp)$/.test(extFromUri) ? extFromUri : 'jpg'
  const normalizedExt = ext === 'jpeg' ? 'jpg' : ext
  const mime =
    asset.mimeType ??
    (normalizedExt === 'png'
      ? 'image/png'
      : normalizedExt === 'webp'
        ? 'image/webp'
        : 'image/jpeg')
  const name = asset.fileName ?? `upload.${normalizedExt}`
  return { uri, name, type: mime }
}

async function ensureLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') {
    Alert.alert(
      'Permission needed',
      'Please allow photo library access to choose an image.',
    )
    return false
  }
  return true
}

async function ensureCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Please allow camera access to take a photo.')
    return false
  }
  return true
}

/** Launch the photo library and return a picked image (or null if cancelled). */
export async function pickFromLibrary(): Promise<PickedImage | null> {
  if (!(await ensureLibraryPermission())) return null
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  })
  if (result.canceled || !result.assets?.length) return null
  return toPickedImage(result.assets[0])
}

/** Launch the camera and return a captured image (or null if cancelled). */
export async function takePhoto(): Promise<PickedImage | null> {
  if (!(await ensureCameraPermission())) return null
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  })
  if (result.canceled || !result.assets?.length) return null
  return toPickedImage(result.assets[0])
}

/**
 * Prompt the user to choose between camera and library, then return the picked
 * image. Resolves to null if the user backs out at any step.
 */
export function chooseImage(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', 'Choose a source', [
      {
        text: 'Take photo',
        onPress: () => {
          void takePhoto().then(resolve)
        },
      },
      {
        text: 'Choose from library',
        onPress: () => {
          void pickFromLibrary().then(resolve)
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ])
  })
}
