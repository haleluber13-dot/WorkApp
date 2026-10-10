/* The shared vocabulary of Katef: kinds of help, who is asking, and where.
   Keys are stored in the database; labels are what people see. */

export const CATEGORIES = [
  { key: "financial", label: "סיוע כלכלי", icon: "💰" },
  { key: "food", label: "מזון וסלי מזון", icon: "🍲" },
  { key: "mental", label: "תמיכה נפשית", icon: "🧠" },
  { key: "legal", label: "זכויות וייעוץ משפטי", icon: "⚖️" },
  { key: "employment", label: "תעסוקה", icon: "💼" },
  { key: "housing", label: "דיור ולינה", icon: "🏠" },
  { key: "equipment", label: "ציוד", icon: "🎒" },
  { key: "transport", label: "הסעות", icon: "🚗" },
  { key: "family", label: "משפחה וילדים", icon: "👨‍👩‍👧" },
  { key: "medical", label: "רפואה ושיקום", icon: "🩺" },
  { key: "education", label: "לימודים ומלגות", icon: "🎓" },
  { key: "business", label: "סיוע לעסקים", icon: "🏪" },
  { key: "social", label: "ליווי וחברה", icon: "🤝" },
  { key: "home", label: "תיקונים ועזרה בבית", icon: "🔧" },
  { key: "emergency", label: "חירום", icon: "🚨" },
  { key: "elderly", label: "קשישים", icon: "👵" },
  { key: "pets", label: "בעלי חיים", icon: "🐾" },
  { key: "volunteers", label: "מתנדבים", icon: "🙋" },
];

export const AUDIENCES = [
  { key: "soldier", label: "חייל/ת בשירות סדיר", icon: "🪖" },
  { key: "reservist", label: "משרת/ת מילואים", icon: "🎖️" },
  { key: "reservist_family", label: "בן/בת זוג או משפחה של מילואימניק", icon: "💞" },
  { key: "lone_soldier", label: "חייל/ת בודד/ה", icon: "🧳" },
  { key: "wounded", label: "פצוע/ה או נפגע/ת (גוף או נפש)", icon: "❤️‍🩹" },
  { key: "bereaved", label: "משפחה שכולה", icon: "🕯️" },
  { key: "veteran", label: "נכה צה״ל / ותיק/ה", icon: "🏅" },
  { key: "released", label: "משוחרר/ת טרי/ה", icon: "🎓" },
  { key: "evacuee", label: "מפונה / תושב/ת קו עימות", icon: "🏘️" },
  { key: "general", label: "אזרח/ית שצריך/ה עזרה", icon: "🙂" },
];

export const REGIONS = [
  { key: "north", label: "צפון", center: [32.95, 35.4] },
  { key: "golan", label: "רמת הגולן", center: [33.0, 35.75] },
  { key: "haifa", label: "חיפה והקריות", center: [32.79, 35.03] },
  { key: "center", label: "מרכז והשרון", center: [32.2, 34.9] },
  { key: "tlv", label: "תל אביב וגוש דן", center: [32.06, 34.8] },
  { key: "shfela", label: "שפלה", center: [31.85, 34.8] },
  { key: "jerusalem", label: "ירושלים והסביבה", center: [31.77, 35.18] },
  { key: "judea_samaria", label: "יהודה ושומרון", center: [31.95, 35.2] },
  { key: "south", label: "דרום", center: [31.2, 34.8] },
  { key: "gaza_envelope", label: "עוטף עזה", center: [31.42, 34.5] },
];

export const URGENCY = [
  { key: "low", label: "יכול לחכות", color: "var(--u-low)" },
  { key: "normal", label: "רגיל", color: "var(--u-normal)" },
  { key: "high", label: "דחוף", color: "var(--u-high)" },
  { key: "critical", label: "דחוף מאוד", color: "var(--u-critical)" },
];

export const STATUS = [
  { key: "open", label: "מחכה לעזרה" },
  { key: "in_progress", label: "עמותה מטפלת" },
  { key: "resolved", label: "טופל ✓" },
  { key: "closed", label: "סגור" },
];

export const CONTACT_PREFS = [
  { key: "phone", label: "שיחת טלפון" },
  { key: "whatsapp", label: "וואטסאפ" },
  { key: "email", label: "אימייל" },
  { key: "in_app", label: "רק דרך הודעות באתר" },
];

/* [name, region, lat, lng] — places are shown on the map only at city level, never an address. */
export const CITIES = [
  ["נהריה", "north", 33.005, 35.098], ["עכו", "north", 32.927, 35.084], ["כרמיאל", "north", 32.919, 35.296],
  ["צפת", "north", 32.965, 35.496], ["קריית שמונה", "north", 33.207, 35.571], ["מטולה", "north", 33.279, 35.579],
  ["שלומי", "north", 33.075, 35.145], ["מעלות־תרשיחא", "north", 33.016, 35.272], ["טבריה", "north", 32.795, 35.531],
  ["נצרת", "north", 32.700, 35.300], ["נוף הגליל", "north", 32.710, 35.325], ["עפולה", "north", 32.607, 35.289],
  ["בית שאן", "north", 32.497, 35.497], ["יקנעם", "north", 32.659, 35.105], ["מגדל העמק", "north", 32.676, 35.240],
  ["סח׳נין", "north", 32.864, 35.297], ["ראש פינה", "north", 32.969, 35.543], ["חצור הגלילית", "north", 32.981, 35.546],
  ["קצרין", "golan", 32.990, 35.690], ["מג׳דל שמס", "golan", 33.270, 35.770],
  ["חיפה", "haifa", 32.794, 34.989], ["קריית אתא", "haifa", 32.810, 35.110], ["קריית ביאליק", "haifa", 32.830, 35.085],
  ["קריית מוצקין", "haifa", 32.840, 35.080], ["קריית ים", "haifa", 32.850, 35.070], ["נשר", "haifa", 32.766, 35.040],
  ["טירת כרמל", "haifa", 32.760, 34.970], ["זכרון יעקב", "haifa", 32.570, 34.950], ["חדרה", "haifa", 32.434, 34.919],
  ["אום אל־פחם", "haifa", 32.520, 35.150], ["פרדס חנה־כרכור", "haifa", 32.475, 34.970],
  ["נתניה", "center", 32.330, 34.860], ["כפר סבא", "center", 32.175, 34.907], ["רעננה", "center", 32.184, 34.871],
  ["הרצליה", "center", 32.166, 34.843], ["הוד השרון", "center", 32.150, 34.890], ["פתח תקווה", "center", 32.087, 34.887],
  ["ראש העין", "center", 32.096, 34.957], ["אלעד", "center", 32.050, 34.950], ["מודיעין", "center", 31.898, 35.010],
  ["שוהם", "center", 31.999, 34.946], ["לוד", "center", 31.951, 34.889], ["רמלה", "center", 31.929, 34.866],
  ["טייבה", "center", 32.266, 35.009], ["כפר יונה", "center", 32.317, 34.935],
  ["תל אביב־יפו", "tlv", 32.085, 34.781], ["רמת גן", "tlv", 32.068, 34.824], ["גבעתיים", "tlv", 32.072, 34.810],
  ["בני ברק", "tlv", 32.084, 34.834], ["חולון", "tlv", 32.011, 34.773], ["בת ים", "tlv", 32.017, 34.750],
  ["ראשון לציון", "tlv", 31.973, 34.789], ["אור יהודה", "tlv", 32.030, 34.850], ["רמת השרון", "tlv", 32.146, 34.839],
  ["רחובות", "shfela", 31.894, 34.811], ["נס ציונה", "shfela", 31.930, 34.800], ["יבנה", "shfela", 31.877, 34.739],
  ["גדרה", "shfela", 31.810, 34.780], ["קריית מלאכי", "shfela", 31.730, 34.745], ["מזכרת בתיה", "shfela", 31.853, 34.846],
  ["ירושלים", "jerusalem", 31.778, 35.235], ["בית שמש", "jerusalem", 31.747, 34.988], ["מבשרת ציון", "jerusalem", 31.800, 35.150],
  ["אבו גוש", "jerusalem", 31.806, 35.110],
  ["אריאל", "judea_samaria", 32.105, 35.170], ["מעלה אדומים", "judea_samaria", 31.777, 35.300],
  ["ביתר עילית", "judea_samaria", 31.700, 35.120], ["מודיעין עילית", "judea_samaria", 31.930, 35.040],
  ["אפרת", "judea_samaria", 31.650, 35.150], ["קריית ארבע", "judea_samaria", 31.530, 35.120],
  ["קדומים", "judea_samaria", 32.210, 35.160], ["קרני שומרון", "judea_samaria", 32.170, 35.090],
  ["באר שבע", "south", 31.252, 34.791], ["אשקלון", "south", 31.668, 34.571], ["אשדוד", "south", 31.804, 34.655],
  ["קריית גת", "south", 31.610, 34.770], ["דימונה", "south", 31.070, 35.030], ["ערד", "south", 31.260, 35.210],
  ["אילת", "south", 29.558, 34.952], ["אופקים", "south", 31.310, 34.620], ["ירוחם", "south", 30.990, 34.930],
  ["מצפה רמון", "south", 30.610, 34.800], ["רהט", "south", 31.390, 34.750],
  ["שדרות", "gaza_envelope", 31.525, 34.596], ["נתיבות", "gaza_envelope", 31.420, 34.590],
  ["מועצה אזורית אשכול", "gaza_envelope", 31.300, 34.400], ["מועצה אזורית שער הנגב", "gaza_envelope", 31.480, 34.550],
  ["מועצה אזורית חוף אשקלון", "gaza_envelope", 31.620, 34.550], ["מועצה אזורית שדות נגב", "gaza_envelope", 31.400, 34.600],
];

const byKey = (list) => Object.fromEntries(list.map((x) => [x.key, x]));
export const CAT = byKey(CATEGORIES);
export const AUD = byKey(AUDIENCES);
export const REG = byKey(REGIONS);
export const URG = byKey(URGENCY);
export const STAT = byKey(STATUS);

export const cityInfo = (name) => {
  const c = CITIES.find((x) => x[0] === name);
  return c ? { name: c[0], region: c[1], lat: c[2], lng: c[3] } : null;
};

export const regionLabel = (k) => (k === "all" ? "כל הארץ" : REG[k]?.label || k);
export const catLabel = (k) => (CAT[k] ? `${CAT[k].icon} ${CAT[k].label}` : k);
export const audLabel = (k) => AUD[k]?.label || k;

/* Rough distance in km between two lat/lng points. */
export function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestRegion(lat, lng) {
  let best = null, bestD = Infinity;
  for (const c of CITIES) {
    const d = km([lat, lng], [c[2], c[3]]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { city: best[0], region: best[1], km: bestD } : null;
}
