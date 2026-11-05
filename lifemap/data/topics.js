// מפת החיים הגדולה — 20 הנושאים (סדר קריאה מימין לשמאל, שורה אחר שורה)
// Each topic: id, name, emoji, color key, short blurb (for parents), and what kids learn.
window.LIFEMAP_TOPICS = [
  // שורה 1
  { id: "nature",    name: "טבע והסביבה",                 emoji: "🌳", color: "lime",   blurb: "עונות, מזג אוויר, צמחים, מים, מיחזור ושמירה על כדור הארץ." },
  { id: "animals",   name: "בעלי חיים וצמחים",            emoji: "🦒", color: "green",  blurb: "חיות בית וחיות בר, בתי גידול, גידול צמחים, חרקים וציפורים." },
  { id: "body",      name: "גוף ובריאות",                 emoji: "🫀", color: "blue",   blurb: "איברי הגוף, חמשת החושים, היגיינה, שינה, תנועה ותזונה." },
  { id: "feelings",  name: "רגשות והכרת העצמי",           emoji: "🧠", color: "purple", blurb: "זיהוי רגשות, הרגעה עצמית, חוזקות, גבולות ודימוי עצמי." },
  { id: "family",    name: "יחסים ומשפחה",                emoji: "🏡", color: "orange", blurb: "בני משפחה, חברות, שיתוף, הקשבה, פתרון ריבים ועזרה הדדית." },
  // שורה 2
  { id: "food",      name: "אוכל ובישול",                 emoji: "🍲", color: "lime",   blurb: "מצרכים, מדידה, בישול בטוח, טעמים, מאיפה האוכל מגיע ותזונה." },
  { id: "build",     name: "בנייה, יצירה ותיקון",         emoji: "🔨", color: "orange", blurb: "קוביות, מבנים יציבים, תיקון דברים בבית, מדידה וכלי עבודה." },
  { id: "tools",     name: "כלים, מכונות וטכנולוגיה",     emoji: "⚙️", color: "green",  blurb: "איך דברים עובדים, גלגלים, מנופים, מכונות פשוטות, מחשבים ואינטרנט." },
  { id: "art",       name: "אמנות ודמיון",                emoji: "🎨", color: "purple", blurb: "ציור, צבעים, פיסול, תיאטרון, המצאות ודמיון חופשי." },
  { id: "music",     name: "מוזיקה, צליל וקצב",           emoji: "🎵", color: "blue",   blurb: "קצב, מקצב, כלי נגינה, שירה, האזנה והבחנה בין צלילים." },
  // שורה 3
  { id: "language",  name: "שפה, סיפורים וקריאה",         emoji: "📖", color: "lime",   blurb: "אותיות, מילים, חרוזים, סיפור, הבנת הנקרא וכתיבה יצירתית." },
  { id: "numbers",   name: "מספרים, דפוסים ולוגיקה",      emoji: "🔢", color: "orange", blurb: "ספירה, צורות, דפוסים, חיבור וחיסור, מדידה, חידות היגיון." },
  { id: "science",   name: "מדע וניסויים",                emoji: "🧪", color: "blue",   blurb: "ניסויים ביתיים בטוחים, השערות, תצפיות, מגנטים, מים ואוויר." },
  { id: "cultures",  name: "אנשים, מקומות ותרבויות",      emoji: "🌍", color: "green",  blurb: "מדינות, שפות, מאכלי עולם, חגים, מפות ושונות בין אנשים." },
  { id: "history",   name: "היסטוריה, זמן וציוויליזציות", emoji: "📜", color: "purple", blurb: "פעם והיום, שעון ולוח שנה, סבא וסבתא, ממלכות עתיקות והמצאות." },
  // שורה 4
  { id: "safety",    name: "בטיחות ועצמאות",              emoji: "🛡️", color: "red",    blurb: "חציית כביש, זרים, חירום, בטיחות בבית, להתלבש ולהתארגן לבד." },
  { id: "community", name: "קהילה, ערכים וחברה",          emoji: "🤝", color: "green",  blurb: "נימוס, כבוד, עזרה לזולת, חוקים, שכנים, התנדבות ואחריות." },
  { id: "money",     name: "כסף, עבודה ומשאבים",          emoji: "💰", color: "purple", blurb: "מטבעות, חיסכון, קנייה, מקצועות, עבודה ושימוש חכם במשאבים." },
  { id: "outdoors",  name: "הרפתקאות ופעילויות בחוץ",     emoji: "⛰️", color: "orange", blurb: "טיולים, ניווט, חצר, מסלולי מכשולים, תצפיות ומשחקי שטח." },
  { id: "thinking",  name: "חשיבה ביקורתית ופתרון בעיות", emoji: "💡", color: "lime",   blurb: "חידות, מיון, השוואה, שאלות 'למה', תכנון, ניסוי וטעייה." },
];

// Age bands — difficulty is RELATIVE to the band. "easy" for a 9-year-old is not "easy" for a 3-year-old.
window.LIFEMAP_BANDS = [
  { id: "toddler",   name: "פעוטות",     ages: [2, 3],  label: "2–3" },
  { id: "preschool", name: "גן",         ages: [4, 5],  label: "4–5" },
  { id: "early",     name: "כיתות א׳–ג׳", ages: [6, 8],  label: "6–8" },
  { id: "older",     name: "כיתות ד׳–ו׳", ages: [9, 12], label: "9–12" },
];

window.LIFEMAP_LEVELS = [
  { id: "easy",   name: "קל",    color: "#3fbf5a" },
  { id: "medium", name: "בינוני", color: "#f2c230" },
  { id: "hard",   name: "מאתגר", color: "#e4473f" },
];

window.LIFEMAP_TYPES = {
  question:   { name: "שאלה",    emoji: "❓" },
  task:       { name: "משימה",   emoji: "✅" },
  fact:       { name: "עובדה",   emoji: "💡" },
  game:       { name: "משחק",    emoji: "🎲" },
  experiment: { name: "ניסוי",   emoji: "🧪" },
  story:      { name: "סיפור",   emoji: "📚" },
  talk:       { name: "שיחה",    emoji: "💬" },
};

window.LIFEMAP_CARDS = window.LIFEMAP_CARDS || {};
