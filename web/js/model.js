/**
 * model.js — Domain model derived 1:1 from the production workbook.
 *
 * The workbook has five sheets: הפקה / קיטריינג / רכבים / ניקיון / שמירה.
 * Every column in those sheets maps to a role or field defined here, so the
 * app is a faithful superset of the spreadsheet rather than a reinvention.
 */

export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------------ *
 * Departments
 * ------------------------------------------------------------------ */

export const DEPTS = {
  production: { he: 'הפקה', color: '#F5A524', icon: 'clipboard' },
  camera:     { he: 'מצלמה', color: '#0072E5', icon: 'camera' },
  sound:      { he: 'סאונד', color: '#B034EF', icon: 'mic' },
  lighting:   { he: 'תאורה', color: '#FFD60A', icon: 'bulb' },
  catering:   { he: 'קיטרינג', color: '#30D158', icon: 'fork' },
  vehicles:   { he: 'רכבים', color: '#5E5CE6', icon: 'truck' },
  cleaning:   { he: 'ניקיון', color: '#64D2FF', icon: 'broom' },
  security:   { he: 'שמירה', color: '#EC0D00', icon: 'shield' },
  cast:       { he: 'שחקנים', color: '#E9002F', icon: 'star' },
};

/* ------------------------------------------------------------------ *
 * Sheet "הפקה" — one slot per column of the crew table.
 * `slot` is the stable key; `he` is the exact spreadsheet column header.
 * ------------------------------------------------------------------ */

export const CREW_SLOTS = [
  { slot: 'pa_snr_1',  he: 'ע הפקה ג',  dept: 'production', short: 'ע.הפקה ג' },
  { slot: 'pa_snr_2',  he: 'ע הפקה ג',  dept: 'production', short: 'ע.הפקה ג' },
  { slot: 'pa_1',      he: 'ע הפקה',    dept: 'production', short: 'ע.הפקה' },
  { slot: 'pa_2',      he: 'ע הפקה',    dept: 'production', short: 'ע.הפקה' },
  { slot: 'water',     he: 'נערת מים',  dept: 'production', short: 'מים' },
  { slot: 'cam_1',     he: 'צלם 1',     dept: 'camera',     short: 'צלם 1' },
  { slot: 'cam_2',     he: 'צלם 2',     dept: 'camera',     short: 'צלם 2' },
  { slot: 'cam_3',     he: 'צלם 3',     dept: 'camera',     short: 'צלם 3' },
  { slot: 'cam_ac_1',  he: 'ע צלם',     dept: 'camera',     short: 'ע.צלם' },
  { slot: 'cam_ac_2',  he: 'ע צלם 2',   dept: 'camera',     short: 'ע.צלם 2' },
  { slot: 'sound',     he: 'מקליט',     dept: 'sound',      short: 'מקליט' },
  { slot: 'boom',      he: 'בום',       dept: 'sound',      short: 'בום' },
  { slot: 'gaffer',    he: 'תאורן',     dept: 'lighting',   short: 'תאורן' },
  { slot: 'gaffer_ac', he: 'ע תאורן',   dept: 'lighting',   short: 'ע.תאורן' },
  { slot: 'grip',      he: 'גריפ',      dept: 'lighting',   short: 'גריפ' },
];

/* Sheet "ניקיון" — מנקה ×2 */
export const CLEANING_SLOTS = [
  { slot: 'cleaner_1', he: 'מנקה', dept: 'cleaning', short: 'מנקה 1' },
  { slot: 'cleaner_2', he: 'מנקה', dept: 'cleaning', short: 'מנקה 2' },
];

/* Sheet "שמירה" — empty in the workbook; built out here. */
export const SECURITY_SLOTS = [
  { slot: 'guard_1', he: 'שומר', dept: 'security', short: 'שומר 1' },
  { slot: 'guard_2', he: 'שומר', dept: 'security', short: 'שומר 2' },
];

/** Every slot that can hold a person, across all sheets. */
export const ALL_SLOTS = [...CREW_SLOTS, ...CLEANING_SLOTS, ...SECURITY_SLOTS];

export const slotDef = (slot) => ALL_SLOTS.find((s) => s.slot === slot);

/* ------------------------------------------------------------------ *
 * Sheet "רכבים"
 * ------------------------------------------------------------------ */

export const VEHICLE_SLOTS = [
  { slot: 'truck',        he: 'משאית' },
  { slot: 'art',          he: 'ארט' },
  { slot: 'prod_camera',  he: 'הפקה - מצלמה' },
  { slot: 'lighting_grip',he: 'תאורה גריפ' },
  { slot: 'camp',         he: 'מחנה' },
  { slot: 'production',   he: 'הפקה' },
  { slot: 'props',        he: 'פרופס' },
  { slot: 'scouter',      he: 'סקאוטר' },
];

/* ------------------------------------------------------------------ *
 * Sheet "קיטריינג"
 * ------------------------------------------------------------------ */

export const CATERING_FIELDS = [
  { key: 'crew',            he: 'צוות',           kind: 'count' },
  { key: 'actors',          he: 'שחקנים',         kind: 'count' },
  { key: 'extras',          he: 'ניצבים/ביטים',   kind: 'count' },
  { key: 'orderedBreakfast',he: 'הוזמן בוקר',     kind: 'count' },
  { key: 'orderedLunch',    he: 'הוזמן צהריים',   kind: 'count' },
  { key: 'ateBreakfast',    he: 'אכלו בוקר',      kind: 'count' },
  { key: 'ateLunch',        he: 'אכלו צהריים',    kind: 'count' },
];

/* ------------------------------------------------------------------ *
 * Call status
 * ------------------------------------------------------------------ */

export const STATUS = {
  pending:   { he: 'ממתין',  color: '#FF9F0A' },
  confirmed: { he: 'אושר',   color: '#30D158' },
  onset:     { he: 'בסט',    color: '#0A84FF' },
  out:       { he: 'לא מגיע', color: '#FF453A' },
};

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export function newPerson(partial = {}) {
  return {
    id: uid('per'),
    name: '',
    phone: '',
    email: '',
    dept: 'production',
    defaultSlot: '',
    homeBase: '',        // where they travel from — drives pickup planning
    notes: '',
    updatedAt: Date.now(),
    ...partial,
  };
}

export function newLocation(partial = {}) {
  return {
    id: uid('loc'),
    name: '',
    address: '',
    lat: null,
    lng: null,
    parking: '',
    notes: '',
    updatedAt: Date.now(),
    ...partial,
  };
}

/**
 * A shoot day. `calls` holds per-person overrides (time / status / location),
 * `slots` maps a sheet column -> personId.
 */
export function newDay(partial = {}) {
  return {
    id: uid('day'),
    date: todayISO(),
    title: '',
    locationId: '',
    generalCall: '07:00',   // קריאה כללית
    shootingCall: '08:00',  // תחילת צילום
    wrap: '19:00',          // סיום
    slots: {},              // { slotKey: personId }
    calls: {},              // { personId: { time, status, locationId, note } }
    catering: CATERING_FIELDS.reduce((a, f) => ((a[f.key] = null), a), {}),
    vehicles: VEHICLE_SLOTS.reduce((a, v) => ((a[v.slot] = { driverId: '', plate: '', note: '' }), a), {}),
    notes: '',
    updatedAt: Date.now(),
    ...partial,
  };
}

/* ------------------------------------------------------------------ *
 * Date / time helpers (Hebrew locale, Israel week starts Sunday)
 * ------------------------------------------------------------------ */

export const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateHe(iso) {
  const d = parseISO(iso);
  return `יום ${HE_DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function formatDateShort(iso) {
  const d = parseISO(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/** Minutes between two "HH:MM" strings, tolerant of empties. */
export function minutesBetween(a, b) {
  const toMin = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    return m ? +m[1] * 60 + +m[2] : null;
  };
  const x = toMin(a), y = toMin(b);
  if (x == null || y == null) return null;
  return y - x;
}

/** "in 40 min" / "started 20 min ago" relative to now, for the live header. */
export function relativeToNow(iso, time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m) return null;
  const target = parseISO(iso);
  target.setHours(+m[1], +m[2], 0, 0);
  return Math.round((target - Date.now()) / 60000);
}
