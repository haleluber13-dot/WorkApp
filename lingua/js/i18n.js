/* UI strings. The interface speaks the learner's own language (English or Hebrew). */
const S = {
  appName: ["LinguaPath", "LinguaPath"],
  tagline: ["Learn any language from zero to fluent — speaking, listening, reading and writing.", "ללמוד כל שפה מאפס ועד שליטה מלאה — דיבור, הבנה, קריאה וכתיבה."],
  nav_learn: ["Learn", "לימוד"], nav_practice: ["Practice", "תרגול"], nav_translate: ["Translate", "תרגום"], nav_review: ["Review", "חזרה"], nav_me: ["Progress", "התקדמות"],
  back: ["Back", "חזרה"], close: ["Close", "סגירה"], next: ["Next", "הבא"], check: ["Check", "בדיקה"], continue_: ["Continue", "המשך"], skip: ["Skip", "דילוג"],
  done: ["Done", "סיום"], start: ["Start", "התחלה"], cancel: ["Cancel", "ביטול"], save: ["Save", "שמירה"], delete_: ["Delete", "מחיקה"], yes: ["Yes", "כן"], no: ["No", "לא"],
  loading: ["Loading…", "טוען…"], offline: ["You are offline", "אין חיבור לאינטרנט"], retry: ["Retry", "נסה שוב"], show: ["Show", "הצג"], hide: ["Hide", "הסתר"],
  listen: ["Listen", "השמעה"], slow: ["Slow", "לאט"], speak: ["Speak", "דיבור"], copy: ["Copy", "העתקה"], copied: ["Copied", "הועתק"], play: ["Play", "נגן"], stop: ["Stop", "עצור"],
  /* onboarding */
  welcome: ["Welcome!", "ברוכים הבאים!"],
  ob_intro: ["A complete course for every language: lessons from A1 to C2, speaking practice with your microphone, listening, reading, writing, spaced-repetition review and a voice translator. Everything is saved on this device.", "קורס מלא לכל שפה: שיעורים מרמת A1 עד C2, תרגול דיבור עם המיקרופון, הבנת הנשמע, קריאה, כתיבה, חזרה חכמה ומתרגם קולי. הכול נשמר במכשיר הזה."],
  ob_ui: ["App language", "שפת הממשק"], ob_know: ["I already speak", "אני כבר יודע/ת"], ob_learn: ["I want to learn", "אני רוצה ללמוד"],
  ob_level: ["My level in this language", "הרמה שלי בשפה הזו"],
  lvl_new: ["Complete beginner", "מתחיל/ה לגמרי"], lvl_some: ["I know a few words (A2)", "יודע/ת כמה מילים (A2)"], lvl_mid: ["Intermediate (B1)", "בינוני (B1)"], lvl_adv: ["Advanced (B2+)", "מתקדם/ת (B2+)"],
  ob_goal: ["Daily goal", "יעד יומי"], min: ["min", "דק׳"], minutes: ["minutes", "דקות"],
  ob_go: ["Start learning", "להתחיל ללמוד"],
  featured: ["Full courses", "קורסים מלאים"], all_langs: ["All languages", "כל השפות"],
  pack_full: ["Full course: grammar, readings, verb tables, pronunciation guide", "קורס מלא: דקדוק, קריאה, טבלאות פעלים, מדריך הגייה"],
  pack_auto: ["Auto course: lessons are built live from the curriculum with machine translation (needs internet the first time)", "קורס אוטומטי: השיעורים נבנים מהתוכנית בתרגום מכונה (דורש אינטרנט בפעם הראשונה)"],
  pack_base: ["Full course (native content)", "קורס מלא (תוכן מקורי)"],
  /* home */
  today: ["Today", "היום"], today_plan: ["Today's plan", "התוכנית להיום"], streak: ["day streak", "ימים ברצף"], xp: ["XP", "נק׳"],
  continue_lesson: ["Continue lesson", "המשך שיעור"], start_lesson: ["Start lesson", "התחל שיעור"], review_due: ["Review {n} words", "חזרה על {n} מילים"], review_none: ["Nothing to review yet", "אין עדיין מה לחזור עליו"],
  speak_5: ["Speaking practice", "תרגול דיבור"], read_today: ["Read something", "לקרוא משהו"], write_today: ["Write something", "לכתוב משהו"],
  course_map: ["Course", "הקורס"], change_lang: ["Change language", "שינוי שפה"], my_langs: ["My languages", "השפות שלי"], add_lang: ["Add a language", "הוספת שפה"],
  level_: ["Level", "רמה"], unit: ["Unit", "יחידה"], units_done: ["{d}/{n} units", "{d}/{n} יחידות"], words_: ["words", "מילים"], locked: ["Finish the previous unit first", "קודם סיימו את היחידה הקודמת"],
  unlock_anyway: ["Open anyway", "פתח בכל זאת"],
  /* unit */
  tab_learn: ["Words", "מילים"], tab_practice: ["Practice", "תרגול"], tab_dialogue: ["Dialogue", "דיאלוג"], tab_grammar: ["Grammar", "דקדוק"], tab_speak: ["Speak", "דיבור"], tab_write: ["Write", "כתיבה"], tab_read: ["Read", "קריאה"],
  goals: ["In this unit you will learn to", "ביחידה הזו תלמדו"], grammar_focus: ["Grammar focus", "מוקד דקדוקי"],
  unit_progress: ["Unit progress", "התקדמות ביחידה"], complete_unit: ["Complete unit", "סיום היחידה"], unit_done: ["Unit completed!", "היחידה הושלמה!"],
  learn_words: ["Learn the words", "ללמוד את המילים"], flip: ["Tap to flip", "הקש/י להפוך"], know_it: ["I know it", "אני יודע/ת"], learn_it: ["Still learning", "עוד לומד/ת"],
  practice_intro: ["{n} exercises mixing listening, reading, writing and speaking", "{n} תרגילים שמשלבים הבנה, קריאה, כתיבה ודיבור"],
  practice_start: ["Start practice", "התחל תרגול"], practice_again: ["Practice again", "תרגל שוב"],
  dialogue_listen: ["Listen to the dialogue", "האזינו לדיאלוג"], dialogue_role: ["Role play — you are {who}", "משחק תפקידים — את/ה {who}"], your_turn: ["Your turn — say the line", "תורך — אמרו את המשפט"],
  show_translation: ["Show translation", "הצג תרגום"], hide_translation: ["Hide translation", "הסתר תרגום"],
  examples: ["Examples", "דוגמאות"], verbs: ["Verb tables", "טבלאות פעלים"], alphabet: ["Sounds & letters", "אותיות וצלילים"], tips: ["Pronunciation tips", "טיפים להגייה"],
  speak_prompt: ["Speaking task", "משימת דיבור"], speak_tip: ["Say it in {lang}. Tap the microphone, speak, then compare with the model answer.", "אמרו זאת ב{lang}. הקישו על המיקרופון, דברו, ואז השוו לתשובה לדוגמה."],
  model_answer: ["Model answer", "תשובה לדוגמה"], your_speech: ["What we heard", "מה שמענו"], pron_score: ["Pronunciation match", "דיוק הגייה"],
  write_prompt: ["Writing task", "משימת כתיבה"], write_tip: ["Write in {lang}. Then check: your text is translated back so you can see if it says what you meant.", "כתבו ב{lang}. אחר כך בדקו: הטקסט מתורגם בחזרה כדי שתראו אם אמרתם מה שרציתם."],
  write_check: ["Check my writing", "בדוק את הכתיבה שלי"], back_translation: ["Your text means", "הטקסט שלכם אומר"], words_count: ["{n} words", "{n} מילים"],
  reading: ["Reading", "קריאה"], tap_word: ["Tap any word to translate it", "הקישו על מילה כדי לתרגם"], questions: ["Questions", "שאלות"], read_score: ["{c}/{n} correct", "{c}/{n} נכונות"],
  /* exercises */
  ex_pick_t: ["Choose the translation", "בחרו את התרגום"], ex_pick_b: ["What does this mean?", "מה המשמעות?"], ex_listen: ["What do you hear?", "מה שמעתם?"],
  ex_dictation: ["Type what you hear", "כתבו מה ששמעתם"], ex_type: ["Translate into {lang}", "תרגמו ל{lang}"], ex_order: ["Put the words in order", "סדרו את המילים"],
  ex_match: ["Match the pairs", "התאימו זוגות"], ex_gap: ["Fill in the gap", "השלימו את החסר"], ex_speak: ["Say it out loud", "אמרו בקול"], ex_translate_sent: ["Translate the sentence", "תרגמו את המשפט"],
  type_here: ["Type here…", "כתבו כאן…"], correct: ["Correct!", "נכון!"], wrong: ["Not quite", "לא בדיוק"], almost: ["Almost! Watch the accents/spelling", "כמעט! שימו לב לסימנים/לאיות"],
  answer_was: ["Correct answer", "התשובה הנכונה"], dont_know: ["I don't know", "לא יודע/ת"], tap_mic: ["Tap the microphone and speak", "הקישו על המיקרופון ודברו"], listening: ["Listening…", "מקשיב…"],
  mic_unsupported: ["Speech recognition isn't available in this browser. Try Chrome, Edge or Safari.", "זיהוי דיבור לא זמין בדפדפן הזה. נסו Chrome, Edge או Safari."],
  mic_denied: ["Microphone access was blocked. Allow it in the browser settings.", "הגישה למיקרופון נחסמה. אפשרו אותה בהגדרות הדפדפן."],
  heard: ["We heard", "שמענו"], try_again: ["Try again", "נסו שוב"], good_pron: ["Great pronunciation!", "הגייה מצוינת!"], ok_pron: ["Good — a few sounds to work on", "טוב — כמה צלילים לשפר"], bad_pron: ["Keep practicing — listen again and repeat", "המשיכו להתאמן — האזינו שוב וחזרו"],
  session_done: ["Session complete", "הסשן הושלם"], score: ["Score", "ציון"], mistakes: ["Mistakes", "שגיאות"], xp_earned: ["+{n} XP", "+{n} נק׳"],
  /* review */
  review_title: ["Smart review", "חזרה חכמה"], review_intro: ["Words come back right before you would forget them (spaced repetition).", "המילים חוזרות בדיוק לפני שתשכחו אותן (חזרה מרווחת)."],
  due_now: ["Due now", "לחזרה עכשיו"], learned: ["Learned", "נלמדו"], mastered: ["Mastered", "בשליטה"], again: ["Again", "שוב"], hard: ["Hard", "קשה"], good: ["Good", "טוב"], easy: ["Easy", "קל"],
  review_empty: ["All caught up! Learn new words in a lesson or add phrases from the translator.", "הכול מעודכן! למדו מילים חדשות בשיעור או הוסיפו ביטויים מהמתרגם."],
  start_review: ["Start review", "התחל חזרה"], phrasebook: ["Phrasebook", "ביטויים שמורים"],
  /* practice hub */
  practice_hub: ["Practice", "תרגול"], ph_speak: ["Speaking", "דיבור"], ph_speak_d: ["Pronunciation drills and free conversation", "תרגילי הגייה ושיחה חופשית"],
  ph_listen: ["Listening", "הבנת הנשמע"], ph_listen_d: ["Dictation from words you know", "הכתבה ממילים שלמדתם"], ph_read: ["Reading", "קריאה"], ph_read_d: ["Graded texts with tap-to-translate", "טקסטים מדורגים עם תרגום בלחיצה"],
  ph_write: ["Writing", "כתיבה"], ph_write_d: ["Guided writing with feedback", "כתיבה מודרכת עם משוב"], ph_grammar: ["Grammar & verbs", "דקדוק ופעלים"], ph_grammar_d: ["All grammar notes and verb tables", "כל ההערות הדקדוקיות וטבלאות הפעלים"],
  ph_sounds: ["Sounds & alphabet", "אותיות וצלילים"], ph_sounds_d: ["How every letter is pronounced", "איך מבטאים כל אות"], ph_conv: ["Conversation", "שיחה"], ph_conv_d: ["Role-play the dialogues with your voice", "משחק תפקידים בדיאלוגים עם הקול שלכם"],
  ph_tutor: ["AI tutor", "מורה AI"], ph_tutor_d: ["Free chat and corrections (needs an API key in settings)", "שיחה חופשית ותיקונים (דורש מפתח API בהגדרות)"],
  pick_text: ["Choose a text", "בחרו טקסט"], pick_unit: ["Choose a unit", "בחרו יחידה"], shadowing: ["Shadowing: listen, then repeat each sentence", "חיקוי: האזינו, ואז חזרו על כל משפט"],
  /* translator */
  tr_title: ["Translator", "מתרגם"], tr_from: ["From", "מ"], tr_to: ["To", "ל"], tr_detect: ["Detect language", "זיהוי שפה"], tr_swap: ["Swap languages", "החלפת שפות"],
  tr_placeholder: ["Type, paste or tap the mic…", "כתבו, הדביקו או הקישו על המיקרופון…"], tr_go: ["Translate", "תרגם"], tr_clear: ["Clear", "נקה"],
  tr_save: ["Save to phrasebook", "שמור לביטויים"], tr_saved: ["Saved — it will appear in your reviews", "נשמר — יופיע בחזרות שלכם"], tr_history: ["History", "היסטוריה"],
  tr_conv: ["Conversation mode", "מצב שיחה"], tr_conv_tip: ["Each person taps their own microphone. Speech is translated and read aloud to the other.", "כל אחד מקיש על המיקרופון שלו. הדיבור מתורגם ונקרא בקול לצד השני."],
  tr_detected: ["Detected: {lang}", "זוהה: {lang}"], tr_error: ["Translation failed. Check your connection or try another provider in settings.", "התרגום נכשל. בדקו את החיבור או נסו ספק אחר בהגדרות."],
  tr_offline_dict: ["Offline: showing matches from the course dictionary", "לא מקוון: מציג התאמות מהמילון של הקורס"], tr_provider: ["via {p}", "דרך {p}"], tr_alt: ["Alternatives", "חלופות"],
  tr_autoplay: ["Read translations aloud", "קרא תרגומים בקול"],
  /* progress / settings */
  progress: ["Progress", "התקדמות"], words_learned: ["Words learned", "מילים שנלמדו"], time_total: ["Total time", "זמן כולל"], h: ["h", "ש׳"], best_streak: ["Best streak", "רצף שיא"],
  last_days: ["Last 14 days", "14 הימים האחרונים"], badges: ["Achievements", "הישגים"], level_est: ["Estimated level", "רמה משוערת"],
  settings: ["Settings", "הגדרות"], s_ui: ["Interface language", "שפת הממשק"], s_theme: ["Theme", "ערכת נושא"], th_auto: ["Auto", "אוטומטי"], th_dark: ["Dark", "כהה"], th_light: ["Light", "בהיר"],
  s_rate: ["Speech speed", "מהירות דיבור"], s_voice: ["Voice", "קול"], s_auto_audio: ["Auto-play audio in exercises", "השמעה אוטומטית בתרגילים"], s_sounds: ["Sound effects", "אפקטי קול"],
  s_goal: ["Daily goal", "יעד יומי"], s_typing: ["Include typing exercises", "לכלול תרגילי הקלדה"], s_speaking: ["Include speaking exercises", "לכלול תרגילי דיבור"],
  s_provider: ["Translation provider", "ספק תרגום"], s_provider_auto: ["Automatic (free, no key)", "אוטומטי (חינם, בלי מפתח)"], s_libre: ["LibreTranslate server URL (optional)", "כתובת שרת LibreTranslate (אופציונלי)"], s_libre_key: ["LibreTranslate API key (optional)", "מפתח API ל-LibreTranslate (אופציונלי)"],
  s_deepl: ["DeepL API key (optional, best quality for European languages)", "מפתח DeepL (אופציונלי, איכות מצוינת לשפות אירופיות)"],
  s_ai: ["AI tutor", "מורה AI"], s_ai_key: ["Anthropic API key (optional). Enables free conversation and writing correction. Stored only on this device.", "מפתח Anthropic API (אופציונלי). מאפשר שיחה חופשית ותיקון כתיבה. נשמר רק במכשיר הזה."],
  s_data: ["Your data", "הנתונים שלכם"], export_: ["Export backup", "ייצוא גיבוי"], import_: ["Import backup", "ייבוא גיבוי"], reset: ["Reset everything", "איפוס מלא"], reset_confirm: ["Delete all progress on this device?", "למחוק את כל ההתקדמות במכשיר הזה?"],
  install: ["Install app", "התקנת האפליקציה"], voices_none: ["No {lang} voice is installed on this device. On Android install Google Text-to-speech voices; on iOS add the voice in Settings → Accessibility → Spoken Content.", "לא מותקן קול ל{lang} במכשיר הזה. באנדרואיד התקינו קולות Google Text-to-speech; באייפון הוסיפו קול ב-Settings → Accessibility → Spoken Content."],
  /* tutor */
  tutor_title: ["AI tutor", "מורה AI"], tutor_intro: ["Chat freely in {lang}. The tutor replies at your level and gently corrects mistakes.", "שוחחו חופשי ב{lang}. המורה עונה ברמה שלכם ומתקן בעדינות שגיאות."],
  tutor_need_key: ["Add an Anthropic API key in Settings to use the tutor.", "הוסיפו מפתח Anthropic API בהגדרות כדי להשתמש במורה."], tutor_send: ["Send", "שלח"], tutor_correct: ["Correct my writing", "תקן את הכתיבה שלי"],
  tutor_topics: ["Suggested topics", "נושאים מוצעים"],
  /* misc */
  level_names: ["Beginner|Elementary|Intermediate|Upper-intermediate|Advanced|Mastery", "מתחילים|בסיסי|בינוני|בינוני-מתקדם|מתקדם|שליטה"],
  auto_building: ["Building this lesson in {lang}…", "בונה את השיעור ב{lang}…"], auto_fail: ["Could not build the lesson — the translator is unreachable. Connect to the internet and try again.", "לא ניתן לבנות את השיעור — המתרגם לא זמין. התחברו לאינטרנט ונסו שוב."],
  mt_note: ["Machine-translated content. Check tricky items with the translator.", "תוכן מתורגם אוטומטית. בדקו פריטים מסובכים במתרגם."],
  not_available: ["Not available for this language yet — full courses (★) include verb tables and a pronunciation guide.", "עדיין לא זמין לשפה הזו — קורסים מלאים (★) כוללים טבלאות פעלים ומדריך הגייה."],
  new_: ["New", "חדש"], learning: ["Learning", "בלמידה"], strong: ["Strong", "חזק"], of: ["of", "מתוך"],
  goal_reached: ["Daily goal reached! 🎉", "היעד היומי הושג! 🎉"], keep_going: ["{n} more minutes to reach today's goal", "עוד {n} דקות ליעד של היום"],
  weekday: ["S|M|T|W|T|F|S", "א|ב|ג|ד|ה|ו|ש"],
};

let uiLang = "en";
export function setUILang(l) { uiLang = l === "he" ? "he" : "en"; document.documentElement.lang = uiLang; document.documentElement.dir = uiLang === "he" ? "rtl" : "ltr"; }
export const getUILang = () => uiLang;
export function t(key, params) {
  const row = S[key];
  let s = row ? row[uiLang === "he" ? 1 : 0] : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
/* pick en/he from a bilingual object */
export const bi = (obj) => (obj ? (obj[uiLang] ?? obj.en ?? obj.he ?? "") : "");
export const levelName = (i) => t("level_names").split("|")[i] || "";
