/* Android app bridge. When InkForm runs inside the Android app, the native
   shell exposes window.InkAndroid. This module:
   - provides SpeechRecognition (Android WebView has none) backed by the
     phone's own speech recognizer, so the AI assistant's mic works;
   - lets app.js save files straight to the phone's Gallery / Downloads.
   In a normal browser it does nothing. */

const bridge = window.InkAndroid;
export const isAndroidApp = !!bridge;

// WebView may expose webkitSpeechRecognition without a working service, so always use the phone's recognizer
if (bridge?.startListening) {
  let active = null;
  window.__inkSpeech = (ev) => {
    const r = active;
    if (!r) return;
    if (ev.type === "start") r.onstart?.();
    else if (ev.type === "result" || ev.type === "partial") {
      const res = [{ transcript: ev.text || "", confidence: 1 }];
      res.isFinal = ev.type === "result";
      r.onresult?.({ resultIndex: 0, results: [res] });
    } else if (ev.type === "error") r.onerror?.({ error: ev.error || "error" });
    else if (ev.type === "end") { active = null; r.onend?.(); }
  };
  class AndroidSpeechRecognition {
    constructor() { this.lang = navigator.language || "en-US"; this.interimResults = true; this.maxAlternatives = 1; this.continuous = false; }
    start() { active = this; bridge.startListening(this.lang || "", !!this.interimResults); }
    stop() { bridge.stopListening(); }
    abort() { bridge.stopListening(); }
  }
  window.SpeechRecognition = AndroidSpeechRecognition;
  window.webkitSpeechRecognition = AndroidSpeechRecognition;
}

/* Save a data: or blob: URL as a file on the phone. Resolves true when saved. */
export async function saveToPhone(name, href) {
  if (!bridge?.saveFile) return false;
  let mime = "application/octet-stream", b64 = "";
  if (href.startsWith("data:")) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(href);
    if (!m) return false;
    mime = m[1];
    b64 = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
  } else {
    const blob = await (await fetch(href)).blob();
    mime = blob.type || mime;
    b64 = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1] || "");
      fr.readAsDataURL(blob);
    });
  }
  return !!bridge.saveFile(name, b64, mime);
}
