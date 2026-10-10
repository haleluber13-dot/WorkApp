# 🛡 PhoneGuard — firewall + spyware scanner for Android

A native Android app (Kotlin, no third-party libraries) that:

1. **Firewall** — choose, per app, whether it may use **Wi-Fi** and/or **mobile data
   (4G/5G)**. Blocked apps are cut off completely; a log shows every connection
   they tried to make and where to.
2. **Spyware scan** — looks for things someone could have put on your phone to watch you:
   - **Known stalkerware**: 611 package names and 470 signing-certificate fingerprints
     from the [Echap stalkerware-indicators](https://github.com/AssoEchap/stalkerware-indicators)
     database (CC-BY 4.0), so renamed copies are caught too.
   - **Hidden apps**: apps with no icon in your app drawer that still have access to
     sensitive things.
   - **Apps with spying powers**: Accessibility (can read/tap your screen), device
     administrator, notification access (reads your chats), usage access, draw over
     other apps, install other apps.
   - **Apps not from an app store**, recently installed apps, and what each can
     reach (location all the time, microphone, camera, texts, call history…).
   - **Phone settings** used to snoop on traffic or get in: user-installed CA
     certificates (lets someone read encrypted Wi-Fi/4G/5G traffic), a hidden proxy,
     an unknown VPN, USB/wireless debugging, no screen lock, rooting, old security
     patches.
   Every result explains in plain words what it means and has buttons that open
   the exact Settings screen to fix it, or uninstall the app.
3. **Lock new apps** — while the firewall is on, newly installed apps get no internet
   until you allow them, and you get an alert listing what they can access.

PhoneGuard itself has **no internet permission**: it cannot send anything off your
phone. Rules, scan results and logs stay on the device.

## Install on your phone

1. On your Android phone, open
   **https://github.com/haleluber13-dot/WorkApp/raw/main/phoneguard/PhoneGuard.apk**
   (or the `/phoneguard/` page of the GitHub Pages site once this is merged).
2. Tap the downloaded file. If Android asks, allow your browser to
   **Install unknown apps**, then tap **Install**. Play Protect may warn that it
   doesn't know the app — that's because it isn't from the Play Store; choose
   **Install anyway**. (You can turn "Install unknown apps" back off afterwards.)
3. Open PhoneGuard → **Turn on** the firewall → accept the VPN request.
4. **Scan** tab → **Scan my phone**.
5. To keep the firewall on after a restart: Settings → Network → VPN → ⚙ next to
   PhoneGuard → **Always-on VPN** ON. Leave **Block connections without VPN** OFF.

Requires Android 8.0 or newer. The blocked-connection log needs Android 10+.

## How the firewall works

Android only lets an app filter other apps' traffic by acting as a VPN. PhoneGuard
creates a **local** VPN that never connects to any server. Only the apps you block
are routed into it, and their packets are dropped. Apps you allow skip it entirely,
so their traffic is untouched and nothing slows down. When you move between Wi-Fi
and mobile data, the VPN is rebuilt with the rules for that network.

Limits (true of every Android firewall app): only one VPN can run at a time, so
PhoneGuard can't run alongside another VPN app; and system-level traffic (e.g. the
phone's own DNS resolver) isn't covered.

## What no app can do

No app can find every kind of spyware. Spyware sold to governments (Pegasus etc.),
or anything on a rooted phone, can hide from all apps. If you strongly suspect that:
back up your photos, do a factory reset, then change your Google/Samsung password
from a different device and turn on 2-step verification. If someone you know is
spying on you and you feel unsafe, contact a domestic-violence helpline before
removing anything — the person may notice.

## Build it yourself

```bash
cd phoneguard
./gradlew assembleRelease     # needs the Android SDK (platform 35, build-tools 35.0.0)
# -> app/build/outputs/apk/release/app-release.apk
```

Release signing: pass your own keystore with `-PpgStoreFile=… -PpgStorePassword=…
-PpgKeyAlias=… -PpgKeyPassword=…` (or the `PG_*` environment variables). Without one,
the build is signed with the debug key. Keep the same key for every build, or
Android will refuse to install the new version over the old one.

## Code map

| File | What it does |
|---|---|
| `FirewallService.kt` | The local VPN: builds per-network block lists, watches Wi-Fi/mobile changes and new installs, logs dropped connections |
| `Scanner.kt` | All scan checks and the plain-language explanations |
| `NewAppGuard.kt` | Locks and alerts on newly installed apps |
| `Rules.kt` | Per-app rules and settings (SharedPreferences) |
| `MainActivity.kt` | Home, Firewall and Scan screens |
| `assets/stalkerware.tsv` | Stalkerware package names + certificate SHA-1s (generated from Echap's `ioc.yaml`) |
