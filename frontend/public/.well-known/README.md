# Universal links and app links

These two files let the phone app claim `https://myzauq.com/...` links. Vite
copies this folder into `dist/` as is, and Caddy serves it from `/srv/www`
(`deploy/Caddyfile` sets the JSON content type for the extensionless AASA).
Both files carry a placeholder that must be filled before the first store
build, or the links open the website instead of the app.

## `apple-app-site-association` (iOS)

Replace `TEAMID` in both `appIDs` and `webcredentials.apps` with the Apple
Team ID of the developer account that signs the app. It is the 10-character
code shown at https://developer.apple.com/account under Membership details
(also printed by `eas credentials` for iOS, and in Xcode under Signing &
Capabilities). The result reads `ABCDE12345.com.myzauq.app`.

Apple caches the file through its CDN: after a deploy, a fresh install of
the app fetches it within a day. Check with

```
curl -sI https://myzauq.com/.well-known/apple-app-site-association | grep -i content-type
curl -s https://app-site-association.cdn-apple.com/a/v1/myzauq.com
```

The `associatedDomains` entitlement (`applinks:myzauq.com`) is already set
in `mobile/app.config.ts`.

## `assetlinks.json` (Android)

Replace the placeholder fingerprint with the SHA-256 of the certificate the
Play build is signed with. With EAS managing the keystore:

```
cd mobile && eas credentials -p android
```

pick the production profile and read "SHA256 Fingerprint" from the keystore
summary. If Play App Signing re-signs the app, use the fingerprint from the
Play Console (Setup, App signing, App signing key certificate) instead, or
list both. Colon-separated uppercase hex, for example
`14:6D:E9:83:...`.

Verify after deploy with

```
curl -s https://myzauq.com/.well-known/assetlinks.json
adb shell pm get-app-links com.myzauq.app
```

The `intentFilters` with `autoVerify` are already set in
`mobile/app.config.ts`.
