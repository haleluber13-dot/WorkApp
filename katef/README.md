# 🤝 כתף — מחברים את מי שצריך עזרה לעמותה שיכולה לעזור

**Katef** connects soldiers, reservists and their families, lone soldiers, the
wounded, bereaved families, evacuees and any civilian who needs help with the
nonprofits (עמותות) that can help them, by kind of help and by region.

Open it at `/katef/`. It's a Hebrew, right‑to‑left, phone‑first web app that
installs like a regular app (PWA) and needs no build step.

## מה יש בפלטפורמה

**למי שצריך עזרה**
- **שאלון ״מצאו עזרה״** בלי הרשמה. שואל מי אתם, מה אתם צריכים ובאיזה אזור, ומחזיר עמותות וקווי סיוע מתאימים לפי ציון התאמה, הצעות עזרה פעילות, וזכויות לבדוק בכל זכות ובמנוע הזכויות הלאומי. התשובות נשמרות רק בכתובת ה‑URL.
- **פרסום בקשה** בחמישה צעדים קצרים. ליד כל שדה כתוב אם הוא גלוי לכולם או פרטי. יש אזהרה אוטומטית כשנראה שכתבתם טלפון, ת״ז או אימייל בטקסט הגלוי. אפשר לפרסם בשם מישהו אחר, בהסכמתו.
- **מעקב:** סטטוס, ציר זמן של כל מה שקרה, הודעות ישירות עם העמותה המטפלת, עריכה, סגירה, פתיחה מחדש ומחיקה.
- **טריאז׳ חירום:** מי שבוחר ״תמיכה נפשית״ או ״חירום״ רואה מיד את ער״ן, נט״ל ו‑101. בכל עמוד יש פס SOS, ויש עמוד קווי סיוע.

**לעמותות**
- **לוח בקשות** ברשימה ובמפה. אפשר לסנן לפי אזור, סוג עזרה, מי מבקש, דחיפות וסטטוס, למיין לפי ״הכי קרוב אליי״, ולבחור ״רק מה שמתאים לעמותה שלי״. הסינון נשמר בכתובת, כך שאפשר לשתף קישור.
- **נעילת טיפול:** עמותה אחת לוקחת בקשה, ועמותות אחרות רואות שהיא בטיפול. רק אז נחשפים פרטי הקשר, וכל צפייה בהם נרשמת. אם העמותה לא יכולה לעזור, היא משחררת את הבקשה או **מפנה** אותה לגורם אחר עם המלצה.
- **בקשה שלא עודכנה 7 ימים** מסומנת ״תקועה״, ועמותה אחרת יכולה לקחת אותה. בקשה פתוחה מעל 30 יום שואלת את בעליה אם היא עדיין רלוונטית.
- **דשבורד** עם בקשות חדשות שמתאימות לתחומים ולאזורים של העמותה, הבקשות שבטיפולה ואזהרה על בקשות שעומדות להיתקע.
- **הצעות עזרה**, למשל ״80 סלי מזון בדרום״. אנשים רואים אותן בשאלון ויכולים להגיב בלחיצה.

**מאגר עמותות:** 101 עמותות, קווי סיוע וגופים ממשלתיים, עם חיפוש וסינון, שמירה במועדפים, חיוג או וואטסאפ בלחיצה, ודיווח על מידע שגוי. לכל רשומה יש קישור למקור שממנו נלקחו הפרטים (`katef/data/orgs.json`).

**ניהול:** אימות עמותות (מספר עמותה עם קישור לגיידסטאר), דיווחים, בקשות שמחכות יותר מ‑48 שעות, ומפת חום של בקשות פתוחות לפי תחום ואזור שמראה איפה חסרה עזרה.

**נגישות:** מצב כהה, ניגודיות גבוהה, טקסט גדול, ניווט מקלדת, כפתורים גדולים ותמיכה מלאה ב‑RTL.

## פרטיות

- **מה גלוי לכולם:** כותרת, תיאור, תחום, עיר, דחיפות ושם תצוגה. נקודות במפה מוזזות בתוך העיר ואף פעם לא מסמנות בית.
- **מה פרטי:** שם מלא, טלפון, אימייל והערות נמצאים בטבלה נפרדת (`request_private`). רק בעל הבקשה והעמותה המאומתת שלקחה אותה יכולים לקרוא אותם. האכיפה נעשית ב‑Row Level Security במסד הנתונים, לא רק בממשק.
- **אימות עמותות:** עמותה לא יכולה לסמן את עצמה כמאומתת או להפוך את עצמה למנהלת. רק מנהל מאמת.
- **מחיקת נתונים ישנים:** פרטי קשר נמחקים 90 יום אחרי שבקשה נסגרה (`purge_old_private()`).

## שני מצבים

| מצב | מתי | איפה הנתונים |
|---|---|---|
| **הדגמה** (ברירת מחדל) | `config.js` ריק | רק בדפדפן הנוכחי. יש בקשות לדוגמה וכניסה בלחיצה כמבקש, כעמותה או כמנהל, כדי לראות את כל הצדדים |
| **חי** | אחרי חיבור ל‑Supabase | משותפים לכל המשתמשים, עם אימות במייל ו‑RLS |

### הפעלת מצב חי (כ‑10 דקות, חינם)

1. פותחים פרויקט ב‑[supabase.com](https://supabase.com).
2. ב‑**SQL Editor** מדביקים ומריצים את `katef/supabase/schema.sql`. אפשר להריץ אותו שוב בבטחה.
3. ב‑**Authentication → URL Configuration** מגדירים את כתובת האתר, למשל `https://<user>.github.io/WorkApp/katef/`.
4. ב‑**Project Settings → API** מעתיקים את `Project URL` ואת המפתח `anon public` לקובץ `katef/js/config.js`. המפתח הזה נועד להיות ציבורי, והאבטחה מגיעה מכללי ה‑RLS.
5. נרשמים באתר ואז הופכים את עצמכם למנהלים ב‑SQL Editor:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
6. אופציונלי: מתזמנים את מחיקת הנתונים הישנים עם pg_cron:
   `select cron.schedule('katef-purge', '0 3 * * *', 'select public.purge_old_private()');`

## עדכון המאגר

כל עמותה היא רשומה ב‑`data/orgs.json`:

```json
{ "id": "slug", "name": "שם", "nameEn": "", "desc": "תיאור קצר",
  "categories": ["food", "financial"], "audiences": ["reservist"], "regions": ["all"],
  "phone": "", "whatsapp": "", "website": "https://…", "email": "", "hours": "",
  "type": "nonprofit | government | hotline", "source": "https://… (מאיפה המידע)" }
```

המפתחות של `categories`, `audiences` ו‑`regions` מוגדרים ב‑`js/taxonomy.js`. כשאין מקור רשמי לטלפון, משאירים את השדה ריק ולא מנחשים. כשמשנים קבצים, צריך להעלות את `CACHE` ב‑`sw.js`.

## מבנה

```
katef/
  index.html, styles.css, sw.js, manifest.webmanifest
  js/app.js          router + shell
  js/store.js        data layer: demo (localStorage) or Supabase — same API
  js/taxonomy.js     categories, audiences, regions, ~90 cities
  js/directory.js    directory + matching score + rights links
  js/map.js          Leaflet map (vendored, tiles from OpenStreetMap)
  js/views/*.js      home, find (wizard), board, request, form, orgs, offers, me, auth, admin, about
  data/orgs.json     the directory
  supabase/schema.sql
```
