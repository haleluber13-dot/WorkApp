# 🛡 PhoneGuard 2 — web shield, firewall and spyware scanner for Android

A native Android app (Kotlin, no third-party libraries) that keeps you safe while you
use your phone normally. It is made for, and tested against, the **Samsung Galaxy
Note 20 Ultra** (Android 10 to 13), and works on any phone with **Android 10 or newer**.

## What Full protection does

Full protection is the default mode. All apps' internet traffic passes through
PhoneGuard **on your phone** (a local VPN; there is no VPN server), which gives you:

1. **Web Shield** — blocks dangerous and spying websites for every app: malware,
   phishing and scam sites, stalkerware servers, and (optional) ads and trackers.
   Site lookups (DNS) are sent **encrypted** to the provider you choose: Quad9
   (default), Cloudflare Security or Google. Blocklists update by themselves about
   once a week, on Wi-Fi. You can always allow or block any site yourself.
2. **Firewall** — choose, per app, whether it may use **Wi-Fi** and/or **mobile data**.
   Blocked apps are cut off; a log shows what they tried to reach.
3. **Traffic monitor** — how much each app sends and receives, which sites it talks
   to, and which apps **upload a lot while the screen is off** (something spy apps do).
4. **Spyware scan** — looks for things someone could have put on your phone to watch you:
   - **Known stalkerware**: 611 package names and 470 signing-certificate fingerprints
     from the Echap stalkerware-indicators database, so renamed copies are caught too.
   - **Hidden apps**: apps with no icon in your app drawer that still have access to
     sensitive things.
   - **Apps with spying powers**: Accessibility (can read and tap your screen), device
     administrator, notification access (reads your chats), usage access, draw over
     other apps, install other apps.
   - **Apps not from an app store** (including apps that only pretend to come from
     Google Play), recently installed apps, and what each can reach (location all the
     time, microphone, camera, texts, call history…).
   - **Phone settings** used to snoop or get in: user-installed certificates, a hidden
     proxy, another VPN, Private DNS that skips the Web Shield, USB or wireless
     debugging, no screen lock, rooting, old security updates.

   Every result explains in plain words what it means, with buttons that open the
   right Settings screen or uninstall the app. If you tap **I trust this**, the item is
   hidden, but it comes back if the app later gets new powers. Known spy apps can't be
   hidden.
5. **Lock new apps** — newly installed apps get no internet until you allow them, and
   you get an alert listing what they can access. Known stalkerware is always blocked.
6. **Open Wi-Fi alerts** — a warning when you join Wi-Fi without a password (or with
   old, weak security), so you know to avoid banking there.

**Basic mode** is a lighter fallback: only the apps you block go into the VPN, and
nothing else is checked (no Web Shield, no traffic monitor). If Full protection ever
has a problem, PhoneGuard switches to Basic mode by itself to keep you online, and
shows a **Try Full protection again** button.

## Your privacy

- PhoneGuard has the internet permission and uses it **only** to:
  - pass your apps' own traffic through to where they were going (Full mode),
  - send your site lookups, encrypted, to the DNS provider you choose (Quad9,
    Cloudflare or Google). If that provider can't be reached, lookups go to your
    Wi-Fi or mobile network's own DNS, unencrypted, so the internet keeps working;
    the app tells you when this happens,
  - download blocklist updates from the public sources named below.
- It **never uploads information about you**. There are no accounts, ads or analytics.
- Everything it records (rules, scan results, traffic counts, the connection log)
  **stays on this phone**. The traffic counts and log are kept in memory only and
  reset when the phone restarts.
- PhoneGuard can't see inside encrypted traffic (https), only which app talks to
  which site and how much.

## Install on a Galaxy Note 20 Ultra

1. On the phone, open the `/phoneguard/` page of the GitHub Pages site (or
   **https://github.com/haleluber13-dot/WorkApp/raw/main/phoneguard/PhoneGuard.apk**)
   and download the app.
2. Tap the downloaded file. If asked, allow your browser to **Install unknown apps**,
   then tap **Install**. If Play Protect says it doesn't recognise the app, choose
   **Install anyway** (it isn't from the Play Store). Afterwards, turn "Install unknown
   apps" back off for your browser.
   - If you had the first version of PhoneGuard and Android says **App not installed**,
     uninstall the old version first, then install again. Your firewall choices will
     need to be set again.
3. Open PhoneGuard → **Turn on protection** → accept the VPN request.
4. **Allow alerts** when asked (Android 13), so PhoneGuard can warn you.
5. **Scan** tab → **Scan my phone**.

### Setup so protection stays on

- **Always-on VPN: ON.** Settings → Connections → More connection settings → VPN →
  ⚙ next to PhoneGuard → turn on **Always-on VPN**. This restarts protection after a
  restart or an update.
- **Block connections without VPN: OFF.** Leave this switch off. If it is on and
  PhoneGuard ever stops, every app loses internet.
- **Samsung battery: Never sleeping apps.** Settings → Battery and device care →
  Battery → Background usage limits → **Never sleeping apps** → add PhoneGuard.
  (Android 10 / One UI 2.5: Settings → Device care → Battery → App power management →
  Apps that won't be put to sleep.) Also tap **Allow** when PhoneGuard asks to run in
  the background.
- **Private DNS: Automatic or Off.** Settings → Connections → More connection
  settings → Private DNS. If it is set to a provider name, the Web Shield can't check
  your lookups.

## Limits

- **One VPN at a time.** Android allows only one VPN app, so you can't use another VPN
  while PhoneGuard is on.
- **Private DNS in strict mode** (a provider name in Settings), and apps that use their
  own encrypted DNS or fixed addresses, skip the Web Shield. The firewall still decides
  whether those apps may go online.
- **"Ping" doesn't work in Full mode.** PhoneGuard only passes normal app traffic (TCP
  and UDP), so ping tests fail even though apps and websites work.
- **No app catches all spyware.** Spyware sold to governments (Pegasus and the like),
  or anything on a rooted phone, can hide from every app. New bad sites may not be on
  the blocklists yet.
- **Security updates.** Samsung has ended regular security updates for the Galaxy
  Note 20 series, so this phone may no longer get fixes for holes spyware uses. That
  makes the Web Shield, the firewall and careful app installs matter more. Install any
  update that still arrives.

If you think someone is spying on you and you feel unsafe, contact a local
domestic-violence helpline before removing anything: the person may notice.

## Lists and data used (attributions)

| Used for | Source | Licence |
|---|---|---|
| Known spy apps (scan) and stalkerware servers (Web Shield) | [Echap stalkerware-indicators](https://github.com/AssoEchap/stalkerware-indicators) | CC BY 4.0 |
| Ads & trackers | [StevenBlack/hosts](https://github.com/StevenBlack/hosts) | MIT |
| Malware sites | [URLhaus](https://urlhaus.abuse.ch/) by abuse.ch | CC0 1.0 |
| Phishing & scam sites | [malware-filter phishing-filter](https://gitlab.com/malware-filter/phishing-filter) by curbengh (sources: OpenPhish, PhishTank, IPThreat) | CC BY-SA 4.0 |

The bundled copies and their exact source URLs and licences are recorded in
`app/src/main/assets/blocklists/meta.json`. `tools/update_blocklists.py` refreshes them.
Thank you to the people who maintain these lists.

## Build it yourself

Needs JDK 17 and the Android SDK (platform 35, build-tools 35.0.0).

```bash
cd phoneguard
echo "sdk.dir=/path/to/android-sdk" > local.properties
gradle assembleDebug testDebugUnitTest     # or ./gradlew …
gradle assembleRelease
# -> app/build/outputs/apk/release/app-release.apk  (a few MB)
```

Release signing: pass your own keystore with `-PpgStoreFile=… -PpgStorePassword=…
-PpgKeyAlias=… -PpgKeyPassword=…` (or the `PG_*` environment variables). Without one,
the build is signed with the debug key. Keep the same key for every build, or Android
will refuse to install the new version over the old one.

## Code map

All code is under `app/src/main/java/com/workapp/phoneguard/`. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the design.

| Path | What it does |
|---|---|
| `FirewallService.kt` | The VPN service: Full or Basic mode, firewall rules per network, falls back to Basic if Full mode fails, watches network changes, new installs and the screen |
| `net/` | The Full-mode packet engine: reads the VPN, ends each TCP/UDP connection on the phone and relays it over a real socket, applies the firewall, counts bytes per app (`Engine`, `TcpFlow`, `UdpFlow`, `Packets`) |
| `shield/` | The Web Shield: blocklists (`Blocklist`, `Shield`), DNS answers and blocking (`DnsCore`, `DnsMessage`, `DnsCache`), encrypted DNS over HTTPS (`Upstream`, `Http2`), weekly list updates (`ListUpdateJob`), DNS provider choice and status (`DnsService`) |
| `core/` | Shared contracts (`Contracts.kt`: connection events, IP → site names) and in-memory traffic counts (`TrafficStore.kt`) |
| `ui/` | The screens: Home, Firewall (apps), Activity (traffic), Scan and Settings, plus shared dialogs, status logic and text helpers |
| `Scanner.kt` | All scan checks and their plain-language explanations |
| `DeviceHealth.kt` | Samsung-aware setup advice, battery exemption, open Wi-Fi alerts |
| `NewAppGuard.kt` | Locks and alerts on newly installed apps |
| `Rules.kt` | Per-app rules and settings (stored on the phone) |
| `BootReceiver.kt` | Turns protection back on after a restart or an app update |
| `MainActivity.kt`, `Ui.kt` | Tabs and the small view helpers the screens are built from |
| `assets/stalkerware.tsv` | Stalkerware package names and certificate SHA-1s (from Echap's `ioc.yaml`) |
| `assets/blocklists/` | Bundled Web Shield lists (`*.txt.gz`) and `meta.json` |
