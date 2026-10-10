/* Otiyot — the narrator.
 *
 * Reads the text aloud over the music, using the speech voices already on the
 * device. Those come from the operating system, so what is available depends
 * on the phone or computer, not on this app: a Mac or an iPhone usually has
 * dozens including Hebrew, Android has whatever Google Speech Services has
 * downloaded, and a bare Linux browser may have none at all.
 *
 * Nothing is sent anywhere. The speaking happens on the device.
 */

export class Narrator {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this._voices = [];
    this.onVoices = null;
    this.speaking = false;
    this.current = null;        // the utterance in flight
    this._keepAlive = null;
  }

  static get supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Voices arrive asynchronously in most browsers, so this waits for them. */
  async load(timeout = 3000) {
    if (!this.synth) return [];
    const grab = () => this.synth.getVoices() || [];
    this._voices = grab();
    if (this._voices.length) return this._voices;

    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.synth.addEventListener('voiceschanged', finish, { once: true });
      // Some browsers never fire the event; poll as well.
      const started = Date.now();
      const tick = setInterval(() => {
        if (grab().length || Date.now() - started > timeout) {
          clearInterval(tick);
          finish();
        }
      }, 150);
    });
    this._voices = grab();
    if (this.onVoices) this.onVoices(this._voices);
    return this._voices;
  }

  get voices() { return this._voices; }

  /** Every language the device can actually speak, with how many voices each. */
  languages() {
    const map = new Map();
    for (const v of this._voices) {
      const code = (v.lang || '').replace('_', '-');
      if (!code) continue;
      const base = code.split('-')[0];
      if (!map.has(base)) map.set(base, { code: base, name: languageName(base), voices: [] });
      map.get(base).voices.push(v);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The voices for one language code, best guesses first. */
  forLanguage(base) {
    return this._voices
      .filter(v => (v.lang || '').toLowerCase().startsWith(base.toLowerCase()))
      .sort((a, b) => Number(b.localService) - Number(a.localService)
                   || a.name.localeCompare(b.name));
  }

  byName(name) { return this._voices.find(v => v.name === name) || null; }

  /**
   * Say something.
   * @param {string} text
   * @param {object} o {voiceName, lang, rate, pitch, volume, onend, onstart}
   */
  speak(text, o = {}) {
    if (!this.synth || !text) return false;
    const u = new SpeechSynthesisUtterance(text);
    const voice = o.voiceName ? this.byName(o.voiceName) : null;
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    else if (o.lang) u.lang = o.lang;
    u.rate = clamp(o.rate ?? 1, 0.1, 10);
    u.pitch = clamp(o.pitch ?? 1, 0, 2);
    u.volume = clamp(o.volume ?? 1, 0, 1);

    u.onstart = () => { this.speaking = true; o.onstart?.(); };
    const done = () => {
      this.speaking = false;
      this.current = null;
      this._stopKeepAlive();
      o.onend?.();
    };
    u.onend = done;
    u.onerror = e => {
      // 'interrupted' and 'canceled' are what cancel() produces; not failures.
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
        o.onerror?.(e.error);
      }
      done();
    };

    this.cancel();
    this.current = u;
    this.synth.speak(u);
    this._startKeepAlive();
    return true;
  }

  /* Chrome stops speaking after about fifteen seconds unless it is nudged.
   * Pausing and immediately resuming keeps a long verse going. */
  _startKeepAlive() {
    this._stopKeepAlive();
    this._keepAlive = setInterval(() => {
      if (!this.synth?.speaking) return this._stopKeepAlive();
      this.synth.pause();
      this.synth.resume();
    }, 9000);
  }

  _stopKeepAlive() {
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
  }

  cancel() {
    this._stopKeepAlive();
    this.speaking = false;
    this.current = null;
    try { this.synth?.cancel(); } catch (_) { /* nothing queued */ }
  }
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* ------------------------------------------------------------- language */

/* Enough names to label the picker without shipping a locale database.
 * Anything not listed falls back to the code the voice reports. */
const LANG_NAMES = {
  af: 'Afrikaans', am: 'Amharic', ar: 'Arabic', az: 'Azerbaijani', bg: 'Bulgarian',
  bn: 'Bengali', bs: 'Bosnian', ca: 'Catalan', cs: 'Czech', cy: 'Welsh',
  da: 'Danish', de: 'German', el: 'Greek', en: 'English', eo: 'Esperanto',
  es: 'Spanish', et: 'Estonian', eu: 'Basque', fa: 'Persian', fi: 'Finnish',
  fil: 'Filipino', fr: 'French', ga: 'Irish', gl: 'Galician', gu: 'Gujarati',
  he: 'Hebrew', hi: 'Hindi', hr: 'Croatian', hu: 'Hungarian', hy: 'Armenian',
  id: 'Indonesian', is: 'Icelandic', it: 'Italian', ja: 'Japanese', jv: 'Javanese',
  ka: 'Georgian', kk: 'Kazakh', km: 'Khmer', kn: 'Kannada', ko: 'Korean',
  lo: 'Lao', lt: 'Lithuanian', lv: 'Latvian', mk: 'Macedonian', ml: 'Malayalam',
  mn: 'Mongolian', mr: 'Marathi', ms: 'Malay', my: 'Burmese', nb: 'Norwegian',
  ne: 'Nepali', nl: 'Dutch', no: 'Norwegian', pa: 'Punjabi', pl: 'Polish',
  pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', si: 'Sinhala', sk: 'Slovak',
  sl: 'Slovenian', sq: 'Albanian', sr: 'Serbian', su: 'Sundanese', sv: 'Swedish',
  sw: 'Swahili', ta: 'Tamil', te: 'Telugu', th: 'Thai', tr: 'Turkish',
  uk: 'Ukrainian', ur: 'Urdu', uz: 'Uzbek', vi: 'Vietnamese', yi: 'Yiddish',
  zh: 'Chinese', zu: 'Zulu',
};

export function languageName(code) {
  const base = (code || '').split('-')[0].toLowerCase();
  if (LANG_NAMES[base]) return LANG_NAMES[base];
  try {
    const dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
    return dn.of(base) || base;
  } catch (_) {
    return base || 'unknown';
  }
}

/* --------------------------------------------------------------- shaping */

/* Starting points for a narrator's character. These shape the device's own
 * voice with speed and pitch — they do not imitate any particular person. */
export const CHARACTERS = {
  plain:   { name: 'Plain',      rate: 1,    pitch: 1,    blurb: 'The voice as the device made it.' },
  reader:  { name: 'Storyteller', rate: 0.88, pitch: 0.95, blurb: 'Unhurried, a shade low. For listening with eyes closed.' },
  herald:  { name: 'Herald',     rate: 0.78, pitch: 0.8,  blurb: 'Slow and deep — announcements from a long way off.' },
  scholar: { name: 'Scholar',    rate: 1.05, pitch: 1.05, blurb: 'Brisk and precise, like reading a footnote aloud.' },
  child:   { name: 'Light',      rate: 1.12, pitch: 1.5,  blurb: 'High and quick.' },
  whisper: { name: 'Close',      rate: 0.82, pitch: 1.15, blurb: 'Quiet and near, just above the music.' },
  rush:    { name: 'Rush',       rate: 1.6,  pitch: 1.1,  blurb: 'Fast enough to keep up with the quick styles.' },
  dream:   { name: 'Dream',      rate: 0.6,  pitch: 0.7,  blurb: 'Very slow, very low. Barely awake.' },
};
