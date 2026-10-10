/* Sample content for demo mode only, so the board and map are not empty the
   first time someone opens the app. Everything here is marked demo: true and
   shown with a "דוגמה" badge; none of it is a real person. */
import { cityInfo } from "./taxonomy.js";

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const DEMO_ORG = "demo-org";
const DEMO_ORG_NAME = "עמותת ״יד ביד״ (לדוגמה)";

/* Shift the pin up to ~1.5 km so two requests from one city don't stack and no pin is a real point. */
const jitter = (v, seed) => v + (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.028;

const RAW = [
  ["מילואימניק 200+ ימים, העסק קורס", "אני עצמאי (מוסך קטן), חזרתי אחרי סבב ארוך והלקוחות עזבו. צריך ייעוץ עסקי ועזרה לעבור את החודשיים הקרובים.", ["business", "financial"], "reservist", "באר שבע", "high", "אבי", 5],
  ["בן זוגי במילואים — צריכה עזרה עם הילדים", "שלושה ילדים קטנים, אני עובדת במשמרות. מחפשת בייביסיטר מתנדבת אחר הצהריים פעמיים בשבוע.", ["family", "volunteers"], "reservist_family", "מודיעין", "normal", "מיכל", 20],
  ["חייל בודד — צריך מקרר ומכונת כביסה", "עברתי לדירה חדשה עם עוד שני חיילים בודדים. אין לנו מקרר ומכונת כביסה.", ["equipment", "housing"], "lone_soldier", "תל אביב־יפו", "normal", "דניאל", 30],
  ["קשה לי לישון מאז שחזרתי", "חזרתי מעזה לפני חודש. סיוטים, עצבנות, קשה לחזור לעבודה. רוצה לדבר עם מישהו שמבין.", ["mental"], "reservist", "חיפה", "high", "אנונימי", 3],
  ["מפונים מקריית שמונה — סל מזון", "משפחה של 6, עדיין לא חזרנו הביתה במלואו. נשמח לסלי מזון לחגים.", ["food"], "evacuee", "קריית שמונה", "normal", "משפחת כ.", 50],
  ["הסעה לטיפולי פיזיותרפיה", "נפצעתי ברגל, לא יכול לנהוג. צריך הסעה פעמיים בשבוע לבית החולים סורוקה.", ["transport", "medical"], "wounded", "אופקים", "high", "יוסי", 12],
  ["תיקון נזק מרסיס בגג", "נפל רסיס על המחסן, יש חור בגג וזה לפני החורף. מחפשים בעל מקצוע מתנדב.", ["home"], "general", "נהריה", "high", "רותי", 8],
  ["מלגה ללימודי הנדסאות", "השתחררתי לפני 3 חודשים, רוצה ללמוד הנדסאי חשמל. מחפש מלגה או סיוע בשכר הלימוד.", ["education"], "released", "אשדוד", "low", "עומר", 80],
  ["אמא קשישה לבד בזמן שאני במילואים", "אמי בת 84 גרה לבד בירושלים. צריך מישהו שיבקר פעם ביום ויעזור בקניות.", ["elderly", "social"], "reservist", "ירושלים", "high", "אליה", 15],
  ["ייעוץ משפטי — פוטרתי בזמן המילואים", "המעסיק הודיע לי על פיטורים כשהייתי בצו 8. צריך עורך דין לזכויות עובדים.", ["legal", "employment"], "reservist", "פתח תקווה", "critical", "רון", 2],
  ["כלב שצריך משפחה אומנת זמנית", "אני נקראת לסבב מילואים של חודשיים ואין מי שישמור על הכלב שלי.", ["pets"], "reservist", "רחובות", "normal", "שירה", 40],
  ["משפחה שכולה — ליווי בבירוקרטיה", "אנחנו מוצפים בטפסים מול משרד הביטחון וביטוח לאומי. מחפשים מלווה שמכיר את התהליך.", ["legal", "social"], "bereaved", "אשקלון", "normal", "משפחת ל.", 26],
  ["ציוד חורף ליחידה", "צוות של 12 לוחמים במוצב בצפון, צריכים מעילים תרמיים וכפפות.", ["equipment"], "soldier", "מטולה", "high", "סמ״ר ט.", 6],
  ["עזרה בחיפוש עבודה אחרי שחרור", "סיימתי שירות קרבי, רוצה עבודה בתחום הלוגיסטיקה. אשמח לעזרה בקורות חיים והכוונה.", ["employment"], "released", "שדרות", "low", "מאור", 100],
  ["שכר דירה — פיגור של חודשיים", "בעלי בסבב רביעי, ההכנסה ירדה. אנחנו בפיגור בשכר הדירה.", ["financial", "housing"], "reservist_family", "קריית אתא", "critical", "ענבל", 9],
  ["חוג לילדים מפונים", "ילדים בגילאי 8–12 בקיבוץ שחזרנו אליו, אין להם פעילות אחר הצהריים.", ["family", "social"], "evacuee", "מועצה אזורית אשכול", "low", "רכזת הקהילה", 70],
];

export function seedRequests() {
  return RAW.map(([title, description, categories, audience, cityName, urgency, displayName, hours], i) => {
    const c = cityInfo(cityName);
    const handled = i === 4 || i === 7 || i === 13;
    const resolved = i === 15;
    return {
      id: "demo-req-" + (i + 1), ownerId: "demo-seed", title, description, categories, audience,
      region: c.region, city: c.name, lat: jitter(c.lat, i + 1), lng: jitter(c.lng, i + 7),
      urgency, status: resolved ? "resolved" : handled ? "in_progress" : "open", displayName, onBehalf: false,
      assignedOrg: handled || resolved ? DEMO_ORG : null, assignedOrgName: handled || resolved ? DEMO_ORG_NAME : null,
      createdAt: ago(hours), updatedAt: ago(Math.max(1, hours - 2)), demo: true,
    };
  });
}

export function seedOrgs() {
  return [{
    id: DEMO_ORG, name: DEMO_ORG_NAME,
    description: "עמותה לדוגמה במצב הדגמה: סלי מזון, סיוע כלכלי וליווי למשפחות מילואימניקים במרכז ובדרום.",
    categories: ["food", "financial", "family", "social"], regions: ["center", "tlv", "south", "gaza_envelope"],
    audiences: ["reservist", "reservist_family", "evacuee", "general"], phone: "", website: "", email: "demo-org@katef.local",
    regNumber: "580000000", verified: true, createdAt: ago(500), demo: true,
  }];
}

export function seedOffers() {
  return [
    {
      id: "demo-offer-1", orgId: DEMO_ORG, orgName: DEMO_ORG_NAME, title: "80 סלי מזון לחגים",
      description: "סלי מזון מלאים למשפחות מילואימניקים ומפונים בדרום. איסוף או משלוח עד הבית.",
      categories: ["food"], regions: ["south", "gaza_envelope"], audiences: ["reservist_family", "evacuee"],
      expiresAt: new Date(Date.now() + 20 * 864e5).toISOString(), createdAt: ago(30),
    },
    {
      id: "demo-offer-2", orgId: DEMO_ORG, orgName: DEMO_ORG_NAME, title: "שעות ייעוץ עסקי חינם לעצמאים במילואים",
      description: "יועצים עסקיים מתנדבים — פגישה אחת או ליווי של שלושה חודשים.",
      categories: ["business"], regions: ["all"], audiences: ["reservist"],
      expiresAt: null, createdAt: ago(60),
    },
  ];
}
