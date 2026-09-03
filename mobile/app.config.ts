import type { ConfigContext, ExpoConfig } from 'expo/config'

// Values that only exist once the outside accounts are set up (Google Cloud,
// Sentry, EAS) come from the environment so a fresh checkout still prebuilds.
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME
const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT
const easProjectId = process.env.EAS_PROJECT_ID

const BONE_DARK = '#0E0D0B'
const BRASS = '#C8A45E'
const HOST = 'myzauq.com'

// Web paths the app claims as universal links (iOS) / app links (Android).
const LINK_PATHS = ['/look', '/vote', '/join', '/u', '/invite', '/reset', '/verify-email', '/trips', '/closet', '/mirror']

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ZAUQ',
  slug: 'zauq',
  version: '1.0.0',
  scheme: 'zauq',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  runtimeVersion: { policy: 'appVersion' },
  ...(easProjectId ? { updates: { url: `https://u.expo.dev/${easProjectId}` } } : {}),
  ios: {
    bundleIdentifier: 'com.myzauq.app',
    supportsTablet: false,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${HOST}`],
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        'ZAUQ needs access to your photos so you can add garments to your closet and upload a photo for the Mirror.',
      NSCameraUsageDescription:
        'ZAUQ needs access to your camera so you can photograph garments and yourself for the Mirror.',
      NSFaceIDUsageDescription: 'ZAUQ can lock the app behind Face ID.',
      // Lets animations run at 120fps on ProMotion displays.
      CADisableMinimumFrameDurationOnPhone: true,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.myzauq.app',
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: BONE_DARK,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host: HOST, pathPrefix })),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-localization',
    'expo-web-browser',
    'expo-apple-authentication',
    'expo-local-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: 'ZAUQ needs access to your photos so you can add garments and upload a Mirror photo.',
        cameraPermission: 'ZAUQ needs access to your camera so you can photograph garments and yourself.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: BONE_DARK,
        image: './assets/splash-icon.png',
        imageWidth: 160,
      },
    ],
    [
      'expo-notifications',
      {
        color: BRASS,
        defaultChannel: 'ritual',
      },
    ],
    ...(googleIosUrlScheme
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [string, object]]
      : []),
    ...(sentryOrg && sentryProject
      ? [['@sentry/react-native/expo', { organization: sentryOrg, project: sentryProject }] as [string, object]]
      : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
})
