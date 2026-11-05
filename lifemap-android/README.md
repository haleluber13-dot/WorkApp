# LifeMap for Android (APK)

Native Android wrapper for [`../lifemap`](../lifemap/) — the "מפת החיים הגדולה" homeschool app.
The whole web app is bundled **inside the APK** (copied from `../lifemap` at build time), so it
runs with no website, no internet and no account. Progress is stored on the device.

## Get the APK

- **Releases:** every push to `main` that touches `lifemap/` or `lifemap-android/` runs
  `.github/workflows/lifemap-android.yml`, which builds `LifeMap.apk` and attaches it to a new
  GitHub Release. Open the repo's **Releases** page on the phone, download `LifeMap.apk`, tap it,
  allow installing from this source, and it installs like any app.
- **Build locally:**
  ```
  cd lifemap-android
  ./gradlew assembleRelease
  # → app/build/outputs/apk/release/app-release.apk
  ```
  Needs JDK 17+ and an Android SDK with platform 34 and build-tools 34.0.0
  (`local.properties` → `sdk.dir=...`).

## How it works

- `MainActivity.java` opens a full-screen `WebView` and serves `assets/www/` through
  `WebViewAssetLoader` on an `https://appassets.androidplatform.net` origin, so `localStorage`,
  fonts and relative URLs behave exactly as on the website.
- The Android back button closes the open card/sheet first (`window.App.handleBack()`), then exits.
- `app/build.gradle.kts` has a `syncWww` task that copies `../lifemap` into the build's assets, so
  the web app stays the single source of truth. Bump `versionCode`/`versionName` when releasing.

## Signing

`keystore/lifemap.jks` is checked in on purpose: the app has no backend, no secrets and no
permissions, so the key only guarantees that a new build installs **over** the previous one
instead of asking to uninstall. If you ever publish to Google Play, generate your own key and
point `signingConfigs.release` at it.
