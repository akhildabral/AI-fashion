import { useState, type ReactNode } from 'react'
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ImageStyle,
  type ViewStyle,
} from 'react-native'
import { spacing } from '../theme'

/**
 * Fullscreen zoomable image preview. Pinch to zoom (native ScrollView zoom on
 * iOS), scroll to pan, × or backdrop tap to close.
 */
export function ImageViewer({
  uri,
  visible,
  onClose,
}: {
  uri: string
  visible: boolean
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          minimumZoomScale={1}
          maximumZoomScale={5}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onClose}>
            <Image
              source={{ uri }}
              style={{ width, height: height * 0.86 }}
              resizeMode="contain"
            />
          </Pressable>
        </ScrollView>
        <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close preview">
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Text style={styles.hint}>Pinch to zoom · tap to close</Text>
      </View>
    </Modal>
  )
}

/**
 * Wraps a thumbnail Image; tapping opens the fullscreen zoomable preview.
 * The passed style sizes the touchable container; the image fills it.
 */
export function ZoomableImage({
  uri,
  style,
  children,
}: {
  uri: string | undefined
  style?: StyleProp<ImageStyle>
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (!uri) return null
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Open image preview"
        style={[style as StyleProp<ViewStyle>, { overflow: 'hidden' }]}
      >
        <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
        {children}
      </Pressable>
      <ImageViewer uri={uri} visible={open} onClose={() => setOpen(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,15,15,0.96)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    top: 54,
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 26,
  },
  hint: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
})
