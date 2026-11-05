// Read cards aloud (Web Speech API) — great for toddlers who can't read yet. Silent no-op when unsupported.
(function () {
  const synth = window.speechSynthesis;
  let voice = null;
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    voice = vs.find((v) => /^he/i.test(v.lang) && /google|natural|premium/i.test(v.name)) || vs.find((v) => /^he/i.test(v.lang)) || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }
  window.Speech = {
    get available() { return !!synth; },
    get hasHebrew() { return !!voice; },
    speaking: () => !!synth && synth.speaking,
    stop() { if (synth) synth.cancel(); },
    say(text, { rate = 0.9 } = {}) {
      if (!synth || !text) return false;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "he-IL"; if (voice) u.voice = voice;
      u.rate = rate; u.pitch = 1.05;
      synth.speak(u);
      return true;
    },
  };
})();
