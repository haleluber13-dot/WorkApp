# InkForm 3D — Android app

Android app (APK) for the tattoo designer in [`../tattoo`](../tattoo). The web
app is bundled inside the APK and runs full screen in a WebView, so it works
offline. A small native bridge adds what a WebView lacks:

- **Save image / export** → saved to the phone (Pictures/InkForm, Downloads/InkForm)
- **AI assistant microphone** → uses the phone's own speech recognition
- **Import / photo → stencil** → the normal Android file and photo picker
- **Back button** → closes the open panel, then exits

## Install

Download [`release/InkForm3D.apk`](release/InkForm3D.apk) on your phone, open
it, and allow "Install unknown apps" for your browser or file manager when
Android asks. Requires Android 8.0 or newer with an up-to-date Android System
WebView (Chrome 89+).

## Build

```bash
export ANDROID_HOME=/path/to/android-sdk   # platforms;android-35, build-tools;35.0.0
gradle assembleRelease                      # copies ../tattoo into the APK assets
```

Set `INKFORM_KEYSTORE` and `INKFORM_KEYSTORE_PASSWORD` (key alias `inkform`)
to sign with your own key; without them the build is signed with the debug key.
