# PhoneGuard v2 architecture

Target phone: Samsung Galaxy Note 20 Ultra (Android 10–13, One UI 2.5–5.1). minSdk 29, targetSdk 35.
Goal: the user stays online normally while being protected.

## Protection modes (`Rules.mode`)

- **FULL (default)**: VPN captures *all* apps (`addDisallowedApplication(packageName)` excludes
  only PhoneGuard itself, so our own sockets go straight to the real network). Routes `0.0.0.0/0`
  and `::/0`. VPN DNS server = virtual `10.215.173.53`. A userspace engine (`net/`) terminates
  every TCP/UDP flow and relays it over a real socket, which lets us:
  - drop flows of firewall-blocked apps (`FirewallPolicy`), replying RST/ICMP-free fast failure,
  - answer DNS through the Web Shield (`DnsHandler` → `shield/DnsService`),
  - count bytes per app, screen-on vs screen-off (`TrafficStore`), and log connections with
    domain names (`DomainMap`).
- **BASIC**: the v1 design (only blocked apps routed into the VPN, packets dropped). No Web Shield.
  Fallback if FULL misbehaves.

## Packages and ownership

| Path | Owner | Notes |
|---|---|---|
| `core/Contracts.kt`, `core/TrafficStore.kt` | shared (frozen) | Do not change signatures. Additive changes only, coordinate. |
| `net/*` + `FirewallService.kt` + engine unit tests | Engine | Pure JVM engine core (no android.* in packet/TCP/UDP logic) so it is unit-testable. |
| `shield/*`, `assets/blocklists/*`, `tools/update_blocklists.py`, shield unit tests | Web Shield | DNS parse/build, blocklists, DoH, cache, updates. |
| `Scanner.kt`, `DeviceHealth.kt`, `NewAppGuard.kt` | Scanner | Samsung-aware checks, Wi-Fi safety, battery exemption. |
| `MainActivity.kt`, `Ui.kt`, `ui/*` | UI | Screens: Home, Firewall (apps), Activity (traffic), Scan, Settings. |
| `Rules.kt`, `AndroidManifest.xml`, `build.gradle.kts` | integrator | Ask in your final report if you need a change; don't edit. |

Public signatures in the stub files (`shield/Shield.kt`, `shield/DnsService.kt`, `DeviceHealth.kt`)
are contracts other agents code against: keep them, add to them if needed (report additions).

## Engine (net/) requirements

- Tun reader thread (Os.poll + Os.read, non-blocking fd) → queue → single event-loop thread
  (java.nio Selector) owning all flow state. Tun writes happen on the loop thread; handle EAGAIN.
- IPv4 and IPv6; TCP and UDP. ICMP is dropped.
- TCP: terminate locally. On SYN: resolve uid (`getConnectionOwnerUid`), ask `FirewallPolicy`;
  blocked → RST + `ConnEvent(blocked=true)`. Allowed → non-blocking `SocketChannel.connect`; on
  success SYN-ACK (MSS option; RFC 7323 window scaling only when the app's SYN offered it;
  no SACK/timestamps), then relay with seq/ack
  tracking, respect the app's advertised window, back-pressure both ways, retransmit unacked
  data after a timeout, FIN/RST handling, connect timeout, idle cleanup.
- UDP: per-flow `DatagramChannel`, idle timeout (60 s; 15 s for port 53 not-to-virtual-DNS).
- DNS: UDP to the virtual DNS IP port 53 → `DnsHandler.handle` on a small executor → response
  written back as a UDP packet from the virtual DNS IP. TCP port 53 / 853 to the virtual IP → RST.
- Buffers grow per busy connection (up to 1 MB down / 512 KB up, 32 MB total budget). Relay
  sockets are opened and protected on the lookup pool, never on the loop thread. While no app
  is blocked, the server handshake overlaps the owner lookup; the SYN-ACK still waits for the
  policy. FULL mode uses MTU 9000 (fewer packets through the tun).
- Unknown owner (uid -1, socket already gone) fails closed while any app is blocked, except
  UDP to broadcast/multicast/LAN (not port 53/853), which can't reach the internet.
- Byte accounting → `TrafficStore.onBytes` (batched, e.g. once per second per uid).
- Must never wedge the phone's internet: exceptions in a flow close that flow only; the
  service falls back to BASIC mode and notifies if the engine thread dies.

## Web Shield (shield/) requirements

- Categories: MALWARE, PHISHING, STALKERWARE, TRACKERS. Bundled lists in assets, compact
  in-memory form (sorted 64-bit hashes, binary search; check the domain and each parent).
- Sources (license): StevenBlack hosts (MIT) → TRACKERS; URLhaus hostfile (CC0) → MALWARE;
  malware-filter phishing-filter-hosts → PHISHING; Echap stalkerware `generated/hosts`
  (CC-BY 4.0) → STALKERWARE. Weekly updates via JobScheduler on unmetered networks.
- Blocked → answer A `0.0.0.0` / AAAA `::` with short TTL (not NXDOMAIN), event in TrafficStore.
- Upstream: DoH (RFC 8484 POST) to `DnsSettings.provider`; on failure fall back to the network's
  DNS servers over UDP so the internet keeps working; expose state in `DnsStatus`.
  Cache by (name,type) honouring TTL. Fill `DomainMap` from A/AAAA answers.

## Building

```bash
cd phoneguard
echo "sdk.dir=/root/android-sdk" > local.properties   # gitignored, create in every worktree
gradle -I /tmp/claude-0/-home-user-WorkApp/44d5674a-4860-5156-96e3-af8bdb37cbc3/scratchpad/mirror.gradle assembleDebug testDebugUnitTest
```
The init script adds a Maven Central mirror (Central rate-limits this machine). Use the
system `gradle` (8.14.3), not `./gradlew`.
