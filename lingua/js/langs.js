/* Language registry: translator + course languages.
   code = Google/MyMemory translate code · name = English name · native = name in the language
   tts = preferred speech-synthesis locale · dir = writing direction · flag = emoji */
export const LANGS = [
  ["af", "Afrikaans", "Afrikaans", "af-ZA", "🇿🇦"], ["sq", "Albanian", "Shqip", "sq-AL", "🇦🇱"], ["am", "Amharic", "አማርኛ", "am-ET", "🇪🇹"],
  ["ar", "Arabic", "العربية", "ar-SA", "🇸🇦", "rtl"], ["hy", "Armenian", "Հայերեն", "hy-AM", "🇦🇲"], ["az", "Azerbaijani", "Azərbaycan", "az-AZ", "🇦🇿"],
  ["eu", "Basque", "Euskara", "eu-ES", "🏴"], ["be", "Belarusian", "Беларуская", "be-BY", "🇧🇾"], ["bn", "Bengali", "বাংলা", "bn-IN", "🇧🇩"],
  ["bs", "Bosnian", "Bosanski", "bs-BA", "🇧🇦"], ["bg", "Bulgarian", "Български", "bg-BG", "🇧🇬"], ["my", "Burmese", "မြန်မာ", "my-MM", "🇲🇲"],
  ["ca", "Catalan", "Català", "ca-ES", "🏴"], ["ceb", "Cebuano", "Cebuano", "fil-PH", "🇵🇭"], ["zh-CN", "Chinese (Simplified)", "简体中文", "zh-CN", "🇨🇳"],
  ["zh-TW", "Chinese (Traditional)", "繁體中文", "zh-TW", "🇹🇼"], ["hr", "Croatian", "Hrvatski", "hr-HR", "🇭🇷"], ["cs", "Czech", "Čeština", "cs-CZ", "🇨🇿"],
  ["da", "Danish", "Dansk", "da-DK", "🇩🇰"], ["nl", "Dutch", "Nederlands", "nl-NL", "🇳🇱"], ["en", "English", "English", "en-US", "🇬🇧"],
  ["eo", "Esperanto", "Esperanto", "eo", "🌍"], ["et", "Estonian", "Eesti", "et-EE", "🇪🇪"], ["fi", "Finnish", "Suomi", "fi-FI", "🇫🇮"],
  ["fr", "French", "Français", "fr-FR", "🇫🇷"], ["gl", "Galician", "Galego", "gl-ES", "🏴"], ["ka", "Georgian", "ქართული", "ka-GE", "🇬🇪"],
  ["de", "German", "Deutsch", "de-DE", "🇩🇪"], ["el", "Greek", "Ελληνικά", "el-GR", "🇬🇷"], ["gu", "Gujarati", "ગુજરાતી", "gu-IN", "🇮🇳"],
  ["ht", "Haitian Creole", "Kreyòl ayisyen", "fr-HT", "🇭🇹"], ["ha", "Hausa", "Hausa", "ha-NG", "🇳🇬"], ["he", "Hebrew", "עברית", "he-IL", "🇮🇱", "rtl"],
  ["hi", "Hindi", "हिन्दी", "hi-IN", "🇮🇳"], ["hu", "Hungarian", "Magyar", "hu-HU", "🇭🇺"], ["is", "Icelandic", "Íslenska", "is-IS", "🇮🇸"],
  ["ig", "Igbo", "Igbo", "ig-NG", "🇳🇬"], ["id", "Indonesian", "Bahasa Indonesia", "id-ID", "🇮🇩"], ["ga", "Irish", "Gaeilge", "ga-IE", "🇮🇪"],
  ["it", "Italian", "Italiano", "it-IT", "🇮🇹"], ["ja", "Japanese", "日本語", "ja-JP", "🇯🇵"], ["jw", "Javanese", "Basa Jawa", "jv-ID", "🇮🇩"],
  ["kn", "Kannada", "ಕನ್ನಡ", "kn-IN", "🇮🇳"], ["kk", "Kazakh", "Қазақ тілі", "kk-KZ", "🇰🇿"], ["km", "Khmer", "ខ្មែរ", "km-KH", "🇰🇭"],
  ["ko", "Korean", "한국어", "ko-KR", "🇰🇷"], ["ku", "Kurdish", "Kurdî", "ku-TR", "🏴"], ["ky", "Kyrgyz", "Кыргызча", "ky-KG", "🇰🇬"],
  ["lo", "Lao", "ລາວ", "lo-LA", "🇱🇦"], ["la", "Latin", "Latina", "la", "🏛️"], ["lv", "Latvian", "Latviešu", "lv-LV", "🇱🇻"],
  ["lt", "Lithuanian", "Lietuvių", "lt-LT", "🇱🇹"], ["lb", "Luxembourgish", "Lëtzebuergesch", "lb-LU", "🇱🇺"], ["mk", "Macedonian", "Македонски", "mk-MK", "🇲🇰"],
  ["mg", "Malagasy", "Malagasy", "mg-MG", "🇲🇬"], ["ms", "Malay", "Bahasa Melayu", "ms-MY", "🇲🇾"], ["ml", "Malayalam", "മലയാളം", "ml-IN", "🇮🇳"],
  ["mt", "Maltese", "Malti", "mt-MT", "🇲🇹"], ["mi", "Maori", "Māori", "mi-NZ", "🇳🇿"], ["mr", "Marathi", "मराठी", "mr-IN", "🇮🇳"],
  ["mn", "Mongolian", "Монгол", "mn-MN", "🇲🇳"], ["ne", "Nepali", "नेपाली", "ne-NP", "🇳🇵"], ["no", "Norwegian", "Norsk", "nb-NO", "🇳🇴"],
  ["fa", "Persian", "فارسی", "fa-IR", "🇮🇷", "rtl"], ["pl", "Polish", "Polski", "pl-PL", "🇵🇱"], ["pt", "Portuguese", "Português", "pt-BR", "🇧🇷"],
  ["pa", "Punjabi", "ਪੰਜਾਬੀ", "pa-IN", "🇮🇳"], ["ro", "Romanian", "Română", "ro-RO", "🇷🇴"], ["ru", "Russian", "Русский", "ru-RU", "🇷🇺"],
  ["sm", "Samoan", "Gagana Samoa", "sm-WS", "🇼🇸"], ["gd", "Scots Gaelic", "Gàidhlig", "gd-GB", "🏴"], ["sr", "Serbian", "Српски", "sr-RS", "🇷🇸"],
  ["sn", "Shona", "chiShona", "sn-ZW", "🇿🇼"], ["sd", "Sindhi", "سنڌي", "sd-PK", "🇵🇰", "rtl"], ["si", "Sinhala", "සිංහල", "si-LK", "🇱🇰"],
  ["sk", "Slovak", "Slovenčina", "sk-SK", "🇸🇰"], ["sl", "Slovenian", "Slovenščina", "sl-SI", "🇸🇮"], ["so", "Somali", "Soomaali", "so-SO", "🇸🇴"],
  ["es", "Spanish", "Español", "es-ES", "🇪🇸"], ["su", "Sundanese", "Basa Sunda", "su-ID", "🇮🇩"], ["sw", "Swahili", "Kiswahili", "sw-KE", "🇰🇪"],
  ["sv", "Swedish", "Svenska", "sv-SE", "🇸🇪"], ["tl", "Tagalog (Filipino)", "Tagalog", "fil-PH", "🇵🇭"], ["tg", "Tajik", "Тоҷикӣ", "tg-TJ", "🇹🇯"],
  ["ta", "Tamil", "தமிழ்", "ta-IN", "🇮🇳"], ["te", "Telugu", "తెలుగు", "te-IN", "🇮🇳"], ["th", "Thai", "ไทย", "th-TH", "🇹🇭"],
  ["tr", "Turkish", "Türkçe", "tr-TR", "🇹🇷"], ["uk", "Ukrainian", "Українська", "uk-UA", "🇺🇦"], ["ur", "Urdu", "اردو", "ur-PK", "🇵🇰", "rtl"],
  ["uz", "Uzbek", "Oʻzbek", "uz-UZ", "🇺🇿"], ["vi", "Vietnamese", "Tiếng Việt", "vi-VN", "🇻🇳"], ["cy", "Welsh", "Cymraeg", "cy-GB", "🏴"],
  ["xh", "Xhosa", "isiXhosa", "xh-ZA", "🇿🇦"], ["yi", "Yiddish", "ייִדיש", "yi", "🕎", "rtl"], ["yo", "Yoruba", "Yorùbá", "yo-NG", "🇳🇬"],
  ["zu", "Zulu", "isiZulu", "zu-ZA", "🇿🇦"],
].map(([code, name, native, tts, flag, dir]) => ({ code, name, native, tts, flag, dir: dir || "ltr" }));

/* Languages with a hand-written course pack (grammar, readings, verbs, pronunciation guide). */
export const PACKS = ["es", "pt", "fr", "it", "de"];
/* Languages the base curriculum itself is written in (course available with no pack and no translation). */
export const BASE = ["en", "he"];
/* Languages whose course content can be learned right away: packs + base languages. Any other language
   builds its course on the fly through the translator ("auto course"). */
export const FEATURED = ["es", "pt", "en", "fr", "it", "de", "he", "ar", "ru", "ja", "zh-CN", "ko"];

const byCode = new Map(LANGS.map((l) => [l.code, l]));
export const lang = (code) => byCode.get(code) || byCode.get((code || "").split("-")[0]) || { code, name: code, native: code, tts: code, flag: "🏳️", dir: "ltr" };
export const isRTL = (code) => lang(code).dir === "rtl";
export const hasPack = (code) => PACKS.includes(code);
export const isBase = (code) => BASE.includes(code);

/* Locale → our code, for speech recognition / voices */
export const ttsLocale = (code) => lang(code).tts;

/* Scripts that do not separate words with spaces (word-order exercises fall back to characters). */
export const NO_SPACES = new Set(["ja", "zh-CN", "zh-TW", "th", "km", "lo", "my"]);
