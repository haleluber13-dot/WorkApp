# OlaKai for iOS

The native iOS build: same catalog, same scoring, same fare model as the Android
app, sharing the very same JSON assets from `../app/src/main/assets`.

## Honest status

**This source has not been compiled.** iOS builds require macOS and Xcode, and
it was written on Linux, so treat the first build as a shakedown — expect to fix
a few compile errors rather than none.

## Build it

```bash
brew install xcodegen      # generates the .xcodeproj from project.yml
cd ios
xcodegen generate
open OlaKai.xcodeproj
```

Then pick your iPhone as the run destination and hit run. With a free Apple ID
the app is signed for 7 days and needs re-installing after that; a paid Apple
Developer account ($99/yr) signs it for a year and unlocks TestFlight.

`project.yml` exists instead of a checked-in `project.pbxproj` because a
hand-written pbxproj cannot be reviewed or diffed sensibly.

## Layout

```
OlaKai/
  OlaKaiApp.swift            @main
  Data/
    Models.swift             Spot, Cam, Conditions, Airport — mirrors the JSON
    Catalog.swift            reads the shared assets out of the bundle
    MarineService.swift      Open-Meteo, batched: two calls for the whole wall
    LiveStreamResolver.swift channel -> the video it is broadcasting now
    PlayerPage.swift         the host page the IFrame player runs in
    FlightEstimator.swift    cheapest / fastest / best value
    AppStore.swift           the observable object everything reads
  UI/
    RootView.swift           tabs, the wall, the spot list
    FocusView.swift          one spot, full screen
    TripView.swift           the travel board
    AtlasView.swift          Canvas world map
    YouTubePlayerView.swift  WKWebView around the IFrame player
```

## The one thing not to "simplify"

`PlayerPage` serves the player from `https://app.olakai.ios`, the app's own
pseudo-domain, and passes the same value as `origin`. This is not arbitrary. The
embed gates on the Referer, and measured against real streams:

```
no referring page (loading the embed URL directly) -> "Video player configuration error"
https://www.youtube.com/                           -> "This video is unavailable"
https://app.olakai.ios                             -> plays
```

`WKWebViewConfiguration` also needs `allowsInlineMediaPlayback = true` and
`mediaTypesRequiringUserActionForPlayback = []`, or iOS plays fullscreen and only
after a tap. And `mute=1` is required for autoplay at all.

## Prefer something you can install today?

`../docs` is the web build. It runs on iPhone with no Mac, no Xcode and no Apple
account: open it in Safari and use Share → Add to Home Screen.
