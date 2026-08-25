# AI Fashion — Mobile

A cross-platform (iOS + Android) app for the **AI Fashion** personal AI stylist,
built with **Expo (managed workflow) + TypeScript**. It talks to the existing
AI Fashion backend — it does not modify or replace it.

## Features

- **Auth** — register / login, JWT stored in `expo-secure-store`, auto-hydrate
  from `/auth/me`.
- **Onboarding gate** — first-time users are routed to the style-profile setup
  before the main app.
- **Stylist** — enter an occasion + gender, generate head-to-toe looks with
  image, item breakdown, palette, rationale, favorite toggle, and try-on.
- **Looks** — history of generated looks; favorite / unfavorite, delete, try-on,
  favorites-only filter, pull-to-refresh.
- **Wardrobe** — grid of owned garments with auto-generated tag chips; add items
  from camera or library (with an "Analyzing…" state), edit tags, delete; plus
  "Outfit ideas" — Mix & match (occasion) and What to wear today (city +
  weather) with per-outfit try-on.
- **Try-Ons** — gallery of rendered try-on images.
- **Profile** — style-profile form (selects + colors-to-avoid), a consent-gated
  body-photo manager (upload / replace / remove), and logout.
- A shared **try-on runner** modal used by both look and wardrobe-outfit try-ons:
  checks for a photo (prompts to add one on Profile if missing), shows a
  "Rendering you in this look…" spinner (~30–40s), then the result.

## Prerequisites

- Node 20.19.4+ (or 22.13+ / 24.3+), npm.
- The **AI Fashion backend** running on your Mac (port **3000**, base path `/api`):

  ```bash
  cd ../backend
  pnpm dev
  ```

- **Expo Go** on your phone (iOS/Android), or an iOS Simulator / Android
  Emulator.

## Run

```bash
cd mobile
npm install          # install dependencies
npx expo start       # start the Metro dev server
```

Then:

- **Physical phone:** scan the QR code with Expo Go. Your phone **must be on the
  same Wi-Fi/LAN as the Mac** — the app auto-derives the backend host from the
  Expo dev server's IP and talks to `http://<that-ip>:3000`.
- **iOS Simulator:** press `i` (uses the `http://localhost:3000` fallback).
- **Android Emulator:** press `a`.

### API base URL

The backend URL is resolved at runtime in `src/config.ts`:

1. `EXPO_PUBLIC_API_URL` env var, if set (see `.env.example`).
2. Otherwise the LAN IP behind the Expo dev server, with port **3000**.
3. Otherwise `http://localhost:3000`.

If your phone can't reach the derived IP (e.g. VPN, isolated Wi-Fi), set an
explicit override before starting Expo:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.5:3000 npx expo start
```

Image URLs from the API (often relative like `/api/uploads/x.png`) are resolved
against this base by `resolveImageUrl()`.

## Verify

```bash
npx tsc --noEmit                 # type check — should report no errors
npx expo export --platform ios   # confirm the app bundles (remove ./dist after)
```

## Project structure

```
mobile/
  App.tsx                    # providers + NavigationContainer
  app.json                   # Expo config (name, plugins, permissions)
  src/
    config.ts                # API_BASE_URL resolution + resolveImageUrl()
    theme.ts                 # colors / spacing / radius / fonts tokens
    lib/
      api.ts                 # apiFetch / apiUpload / ApiError + SecureStore token
      types.ts               # shared API types
      tryon.ts               # photo + look try-on + try-ons endpoints
      wardrobe.ts            # wardrobe + outfit + wardrobe try-on endpoints
      outfit.ts              # defensive outfit-normalization helpers
      imagePicker.ts         # camera/library picker → { uri, name, type }
    context/
      AuthContext.tsx        # token + user, login/register/logout
      ProfileContext.tsx     # loads/caches the style profile (onboarding gate)
    components/
      ui.tsx                 # Button, TextField, Select, Chip, Card, ... primitives
      Screen.tsx             # standard scrollable screen shell
      AuthForm.tsx
      LookCard.tsx
      WardrobeCard.tsx
      OutfitSuggestions.tsx
      PhotoManager.tsx
      TryOnModal.tsx
    navigation/
      types.ts               # param lists
      AuthStack.tsx          # native-stack (Login/Register)
      MainTabs.tsx           # bottom-tabs (Stylist/Looks/Wardrobe/TryOns/Profile)
      RootNavigator.tsx      # auth + onboarding routing
    screens/
      LoginScreen.tsx  RegisterScreen.tsx
      StylistScreen.tsx  LooksScreen.tsx  WardrobeScreen.tsx
      TryOnsScreen.tsx  ProfileScreen.tsx
```

## Notes

- Managed workflow, no web-only APIs; screens use `SafeAreaView` and work on
  both iOS and Android.
- Slow (~20–40s) AI calls (generate, wardrobe upload, try-on) show disabled
  buttons + spinners + clear copy throughout.
- The `Select` control is a custom modal sheet (no native picker dependency).
