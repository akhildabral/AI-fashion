# ZAUQ, on the phone

The ZAUQ web app (`frontend/`) rebuilt for iOS and Android: the same
backend, the same brand, every screen designed for a thumb and a camera.
Expo SDK 54, Expo Router 6, React Native 0.81, TypeScript. Read
`CONVENTIONS.md` before touching a screen; the design brief per room is in
the plan (`~/.claude/plans/zesty-tinkering-parnas.md`, sections 3 to 5).

Six rooms behind one door: the fitting (onboarding), Today, Closet,
Mirror, Circle and You, plus the sheets, the reveal, public rooms and the
web links the app claims.

## The workspace

```
ai-fashion/
  frontend/          the web app (Vite)
  mobile/            this app
  packages/shared/   @zauq/shared: types, API modules and pure helpers both apps use
  backend/           its own lockfile, outside the workspace on purpose
```

Install once at the root, never inside `mobile/`:

```bash
pnpm install
```

pnpm keeps an isolated layout (`node_modules/.pnpm`), so Metro is pointed at
the workspace root (`metro.config.js`) and Jest's transform patterns skip the
`.pnpm` segment (`jest.config.js`). `@zauq/shared` is consumed by path
(`@zauq/shared/brief`, `@zauq/shared/types`), straight from its sources.

## Running it

This is a development build with `expo-dev-client`, not Expo Go: the app
uses native modules Expo Go does not ship (Sign in with Apple, Google
Sign-In, Face ID, notifications, Sentry).

```bash
# the backend, on port 3000
cd backend && pnpm dev

# the app, from mobile/
LANG=en_US.UTF-8 npx expo run:ios            # first time: prebuilds ios/ and installs pods
npx expo run:android
npx expo start --dev-client                  # afterwards, Metro only
```

`expo run:ios` needs Xcode with the iOS platform installed and CocoaPods;
`LANG=en_US.UTF-8` is required or `pod install` fails on a non-UTF-8 shell.
The `ios/` and `android/` folders are generated and ignored; delete them
and run again if native config in `app.config.ts` changes.

### Reaching the backend

`src/lib/config.ts` resolves the API origin at runtime:

1. `EXPO_PUBLIC_API_URL`, when set (a tunnel, staging, production).
2. In development, the LAN host behind the Expo dev server on port 3000, so
   a phone on the same Wi-Fi reaches the Mac without any config.
3. `http://localhost:3000` (the iOS Simulator).

Release builds without the variable talk to `https://myzauq.com`. Image
URLs from the API are relative on the local storage driver and are
absolutised by `resolveImageUrl()`.

### Seeded members

```bash
cd backend && DEV_PASSWORD=... npx tsx scripts/seed-dev.ts
```

creates `smoke@test.dev`, `bestie@test.dev`, `walk_client@test.dev` and
`abc@test.dev` (all with the password you pass) with closets, follows, a
shared look and an open verdict, so every room has something in it.

## Checks

```bash
npx tsc --noEmit
npx eslint .
npx jest                     # jest-expo + @testing-library/react-native (v14: render and fireEvent are async)
```

Unit tests live beside the code as `src/**/*.test.ts(x)`: the arch
geometry, the colour tokens, the shared money and units formatters, and the
`Field` and `Button` primitives. CI runs all three on every push
(`.github/workflows/ci.yml`, job `mobile`); it never builds natively.

### Maestro flows

End-to-end flows against the dev build on a simulator or emulator, in
`.maestro/`. Install Maestro (`curl -Ls "https://get.maestro.mobile.dev" | bash`),
build and launch the app once, then:

```bash
cd mobile
maestro test -e DEV_PASSWORD=... .maestro/sign-in.yaml    # the door, as smoke@test.dev
maestro test -e DEV_PASSWORD=... .maestro/closet.yaml     # Closet, first tile, the dossier
maestro test -e DEV_PASSWORD=... .maestro/mirror.yaml     # the Mirror
maestro test -e DEV_PASSWORD=... -e FITTING_EMAIL=new@test.dev .maestro/fitting.yaml
```

The fitting flow needs a member who has not been fitted (no style profile
yet): invite one from the web admin panel, then pass their email. It runs
to the pieces step; the camera and the photo library need a person. The
flows find controls by `testID` (`signin-email`, `signin-password`,
`signin-submit`, `fitting-name`, `fitting-city`, `fitting-continue`,
`closet-first-tile`) and by copy; `Button` and `Field` pass `testID`
through to the pressable and the input.

## EAS: builds, updates, submission

`eas.json` has three build profiles, each on its own `expo-updates` channel:

| Profile | What it is | Channel | API |
| --- | --- | --- | --- |
| `development` | dev client, internal distribution (devices); `development-simulator` for the iOS Simulator | development | LAN / `EXPO_PUBLIC_API_URL` |
| `preview` | internal distribution, release JS, TestFlight-free sideload | preview | `https://myzauq.com` |
| `production` | store build, build number auto-incremented (remote version source) | production | `https://myzauq.com` |

```bash
npm i -g eas-cli && eas login
eas init                                   # once: prints the project id
eas build -p ios -e development-simulator  # a simulator build
eas build -p ios -e preview                # a device build for friends
eas build -p all -e production
eas update --channel preview -m "copy fix" # JS-only fix to preview installs
eas submit -p ios -e production
eas submit -p android -e production
```

`runtimeVersion` follows the app version (`app.config.ts`), so a JS update
only reaches builds of the same version; bump `version` for anything
native.

### Environment variables

The native config reads these at build time (`app.config.ts`); set them as
EAS environment variables per environment (`eas env:create --scope project`)
so a build on EAS sees them, and in a local `.env` for `expo run:*`:

| Variable | Used for |
| --- | --- |
| `EAS_PROJECT_ID` | links the build to the EAS project; enables `expo-updates` and push tokens |
| `GOOGLE_IOS_URL_SCHEME` | the reversed iOS client id, for the Google Sign-In plugin |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google Sign-In at runtime |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | the Sentry plugin and source-map upload |
| `EXPO_PUBLIC_SENTRY_DSN` | crash reporting at runtime (off in `__DEV__`) |
| `EXPO_PUBLIC_API_URL` | the backend origin; pinned per profile in `eas.json` |

Submission placeholders to fill: `ascAppId` and `appleTeamId` in
`eas.json` (or `EXPO_ASC_APP_ID` / `EXPO_APPLE_TEAM_ID` on the command
line), an App Store Connect API key (`EXPO_ASC_API_KEY_PATH`,
`EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`) and the Play service account JSON
at `mobile/google-play-service-account.json` (ignored by git). The whole
list is in `.env.example`.

The backend needs, for the app: `GOOGLE_CLIENT_IDS` (web, iOS and Android
client ids), `APPLE_BUNDLE_IDS` (`com.myzauq.app`), `EXPO_ACCESS_TOKEN`
(optional, for push security) and `MIN_SUPPORTED_CLIENT` (the oldest app
version still served). See `DEPLOY.md` section 13.

## Universal links and app links

The app claims `https://myzauq.com/look/*`, `/vote/*`, `/join/*`, `/u/*`,
`/invite`, `/reset`, `/verify-email`, `/trips/*`, `/closet/*` and
`/mirror` (`LINK_PATHS` in `app.config.ts`), and the `zauq://` scheme.

- The site serves `frontend/public/.well-known/apple-app-site-association`
  and `assetlinks.json` (Caddy sets the AASA content type). Both carry a
  placeholder: the Apple Team ID (`TEAMID`) and the Android signing
  fingerprint. `frontend/public/.well-known/README.md` says where each
  comes from.
- In the app, `app/look/[id].tsx`, `app/vote/[id].tsx`, `app/join/[code].tsx`,
  `app/invite.tsx`, `app/reset.tsx`, `app/verify-email.tsx`,
  `app/trips/[id].tsx`, `app/closet/piece/[id].tsx` and `app/mirror.tsx`
  are thin redirects (`src/features/links/LinkRedirect.tsx`, mapping in
  `src/lib/links.ts`). Door links work signed out. Room links open at once
  for a fitted member and otherwise wait as a pending link
  (`src/lib/pendingLink.ts`) that the shell opens after sign-in and the
  fitting.

Test on the simulator with

```bash
xcrun simctl openurl booted "https://myzauq.com/look/<id>"
xcrun simctl openurl booted "zauq://mirror?items=<id>,<id>"
adb shell am start -a android.intent.action.VIEW -d "https://myzauq.com/vote/<id>" com.myzauq.app
```

## Push

Native push goes through Expo's service (`expo-notifications`). A token
only exists on a build with an `EAS_PROJECT_ID`; local dev builds have none
and the ritual settings render read-only.

- Credentials: `eas credentials -p ios` uploads an APNs key;
  `eas credentials -p android` takes the Firebase service account for FCM
  (a `google-services.json` is not needed for Expo push).
- Taps route on `data.route` from the backend (`/today`,
  `/mirror/render/:id`, `/circle/post/:type/:id`, `/circle/notifications`)
  in `src/lib/push-routing.ts`: the tap that launched the app on cold start
  and every tap while it runs. Foreground pushes show as banners; Android
  has two channels, `ritual` and `events`, both in brass.
- Try one: `POST /api/push/test` with this device's Expo token (the You
  room's Notifications screen has the button).

## Face ID lock

Settings in the You room writes `zauq.lock` in AsyncStorage.
`src/features/lock/LockGate.tsx` (mounted in the root layout around the
rooms) covers the app with a bone screen on cold start and after more than
60 seconds in the background, and asks `expo-local-authentication`
(biometrics with passcode fallback). No hardware or nothing enrolled: the
gate stays open and Settings hides the toggle.

## Store submission checklist

- Sign in with Apple is offered wherever Google is (App Store rule 4.8);
  `usesAppleSignIn` is on and the backend verifies the identity token
  (`APPLE_BUNDLE_IDS`).
- Billing is read-only in the app: the Plan screen shows the current plan
  and points at the website with no purchase link or price (no IAP yet).
- Account deletion is reachable from Profile (rule 5.1.1(v)).
- Privacy strings are set in `app.config.ts`: photos, camera, Face ID
  (`NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`,
  `NSFaceIDUsageDescription`); `ITSAppUsesNonExemptEncryption` is false.
- Privacy policy and terms open from Settings (`/privacy`, `/terms` on the
  site); fill the App Privacy questionnaire (photos, contact info, usage).
- Both stores: screenshots per device class, the brass icon and splash
  (`assets/`), a support URL, the age rating.
- Play: the Data safety form, the `assetlinks.json` fingerprint, the
  service account for `eas submit`.

## Known caveats

- **Simulator, unsigned builds**: an `expo run:ios` build has no keychain
  entitlement, so `expo-secure-store` throws. `src/lib/session.ts` falls
  back to AsyncStorage in `__DEV__` only, so a session survives a relaunch
  in development; release builds never do this.
- **Push on the simulator**: no APNs; a dev build has no project id anyway.
  Use a preview build on a device.
- **Face ID on the simulator**: Features, Face ID, Enrolled, then Matching
  Face when the prompt is up.
- **Universal links** need the AASA deployed and the app installed from a
  signed build; the `zauq://` scheme works everywhere, including the
  simulator.
- **Typed routes** (`.expo/types/router.d.ts`) are generated by the dev
  server and ignored by git; without them (CI) `Href` widens to `string`
  and the same code still typechecks.
