/**
 * views/sheets.js — The five workbook sheets, one segmented tab each:
 *   הפקה · קיטריינג · רכבים · ניקיון · שמירה
 *
 * Two modes per sheet:
 *   "היום"  — fill in the current day, tap-to-assign, phone-shaped.
 *   "טבלה"  — the familiar grid across all days, horizontally scrollable,
 *             exactly the column order of the original spreadsheet.
 */

import { h, icon, avatar, toast, haptic } from '../ui.js';
import {
  CREW_SLOTS, CLEANING_SLOTS, SECURITY_SLOTS, VEHICLE_SLOTS,
  CATERING_FIELDS, DEPTS, slotDef, formatDateShort, formatDateHe,
} from '../model.js';
import * as store from '../store.js';
import * as act from '../actions.js';
import { personPicker, vehicleEditor, dayEditor } from '../editors.js';

const TABS = [
  { key: 'production', he: 'הפקה' },
  { key: 'catering',   he: 'קיטריינג' },
  { key: 'vehicles',   he: 'רכבים' },
  { key: 'cleaning',   he: 'ניקיון' },
  { key: 'security',   he: 'שמירה' },
];

let activeTab = 'production';
let mode = 'day'; // 'day' | 'grid'

export function renderSheets({ dayId, navigate: goto }) {
  const day = (dayId && store.dayById(dayId)) || store.currentDay();
  const rerender = () => goto('sheets', { dayId: day?.id });

  if (!day) {
    return h('div.empty',
      icon('sheets', 46),
      h('h3', 'אין יום צילום פעיל'),
      h('p', 'הגיליונות ממלאים את עצמם לפי יום — צרו יום צילום כדי להתחיל.'),
      h('button.btn.primary', { onclick: () => dayEditor({}, (d) => d && goto('sheets', { dayId: d.id })) },
        icon('plus', 19), 'יום צילום חדש'));
  }

  const tabBar = h('div.contactbar', { style: { paddingBottom: '8px' } },
    ...TABS.map((t) => h('button.badge', {
      style: activeTab === t.key ? { background: 'var(--tint)', color: 'var(--tint-ink)' } : {},
      onclick: () => { activeTab = t.key; haptic(); rerender(); },
    }, t.he)));

  const modeBar = h('div.segmented',
    h('button', { 'aria-pressed': mode === 'day', onclick: () => { mode = 'day'; haptic(); rerender(); } }, 'היום'),
    h('button', { 'aria-pressed': mode === 'grid', onclick: () => { mode = 'grid'; haptic(); rerender(); } }, 'טבלה מלאה'));

  const body = mode === 'grid' ? gridFor(activeTab) : dayFor(activeTab, day, rerender);

  return h('div',
    tabBar,
    modeBar,
    mode === 'day'
      ? h('div.section-title', { style: { marginTop: '16px' } },
          h('span', formatDateHe(day.date)),
          h('button', { onclick: () => dayEditor(day, rerender) }, 'שינוי יום'))
      : h('p.hint', 'תצוגת הטבלה מציגה את כל ימי הצילום, בסדר העמודות של הגיליון המקורי. גללו לצדדים.'),
    body,
    h('div.spacer'));
}

/* ================================================================== *
 * DAY MODE
 * ================================================================== */

function dayFor(tab, day, rerender) {
  if (tab === 'production') return slotList(day, CREW_SLOTS, rerender);
  if (tab === 'cleaning')   return slotList(day, CLEANING_SLOTS, rerender);
  if (tab === 'security')   return slotList(day, SECURITY_SLOTS, rerender);
  if (tab === 'vehicles')   return vehicleList(day, rerender);
  if (tab === 'catering')   return cateringForm(day, rerender);
  return null;
}

/** A tappable row per spreadsheet column; tapping opens the person picker. */
function slotList(day, slots, rerender) {
  // Slots sharing a Hebrew header (ע הפקה ג ×2) get numbered for clarity.
  const counts = {};
  slots.forEach((s) => (counts[s.he] = (counts[s.he] || 0) + 1));
  const seen = {};

  return h('div.card', { style: { marginTop: '8px' } },
    ...slots.map((s) => {
      seen[s.he] = (seen[s.he] || 0) + 1;
      const label = counts[s.he] > 1 ? `${s.he} ${seen[s.he]}` : s.he;
      const personId = day.slots[s.slot];
      const p = personId ? store.personById(personId) : null;
      const call = p ? (day.calls[p.id] || {}) : {};

      return h('div.row',
        p ? avatar(p.name, 38, DEPTS[p.dept]?.color)
          : h('div.avatar', { style: { width: '38px', height: '38px', background: 'var(--fill)', color: 'var(--label-3)' } }, '+'),
        h('button', {
          class: 'row-main', style: { background: 'none', textAlign: 'start' },
          onclick: () => personPicker({
            title: label, slot: s.slot, selectedId: personId,
            onPick: (id) => { store.assignSlot(day.id, s.slot, id); haptic(12); rerender(); },
          }),
        },
          h('div.row-title', { style: p ? {} : { color: 'var(--label-3)' } }, p ? p.name : 'לא שובץ'),
          h('div.row-sub', label)),
        p && call.time ? h('span.row-trail.time', call.time) : null,
        p && act.hasPhone(p)
          ? h('button.icon-btn', { onclick: () => act.call(p), 'aria-label': `חיוג ל${p.name}` }, icon('phone', 20))
          : null);
    }));
}

/** Vehicles sheet — a driver + plate per vehicle column. */
function vehicleList(day, rerender) {
  return h('div.card', { style: { marginTop: '8px' } },
    ...VEHICLE_SLOTS.map((v) => {
      const rec = day.vehicles?.[v.slot] || {};
      const p = rec.driverId ? store.personById(rec.driverId) : null;
      return h('div.row',
        h('div', { style: { width: '38px', display: 'grid', placeItems: 'center', color: p ? 'var(--tint)' : 'var(--label-3)', flex: 'none' } },
          icon('truck', 22)),
        h('button', {
          class: 'row-main', style: { background: 'none', textAlign: 'start' },
          onclick: () => vehicleEditor(day, v.slot, rerender),
        },
          h('div.row-title', v.he),
          h('div.row-sub', [p?.name || 'ללא נהג', rec.plate, rec.note].filter(Boolean).join(' · '))),
        p && act.hasPhone(p)
          ? h('button.icon-btn', { onclick: () => act.call(p), 'aria-label': `חיוג ל${p.name}` }, icon('phone', 20))
          : null,
        h('span.chev', icon('back', 18)));
    }));
}

/**
 * Catering sheet — the seven headcount fields, plus the totals they imply.
 *
 * The stat tiles update in place rather than through a re-render: rebuilding
 * the form while someone is tabbing between number fields would destroy the
 * input under their finger and drop the value they just typed.
 */
function cateringForm(day, rerender) {
  const num = (v) => (v == null || v === '' ? null : Number(v));
  // Live working copy, re-read from the store on every commit so a sync pull
  // that lands mid-edit can't be clobbered by a stale snapshot.
  const readCatering = () => ({ ...(store.dayById(day.id)?.catering || {}) });

  const tiles = {
    total: h('div.s-val.num'),
    ordered: h('div.s-val.num'),
    ate: h('div.s-val.num'),
  };

  const paintTiles = () => {
    const c = readCatering();
    const total = ['crew', 'actors', 'extras'].reduce((a, k) => a + (num(c[k]) || 0), 0);
    tiles.total.textContent = String(total || '—');
    tiles.ordered.textContent = String(num(c.orderedLunch) ?? '—');
    tiles.ate.textContent = String(num(c.ateLunch) ?? '—');
  };

  const commit = (key, raw) => {
    const catering = readCatering();
    // Drop the key rather than storing null: the record travels to the native
    // client through the same Supabase row, and an absent field decodes
    // cleanly where a null would not.
    if (raw === '') delete catering[key]; else catering[key] = Number(raw);
    store.patchDay(day.id, { catering });
    paintTiles();
  };

  const field = (f) => {
    const c = readCatering();
    return h('div.field',
      h('label', { for: `cat_${f.key}` }, f.he),
      h('input', {
        id: `cat_${f.key}`, type: 'number', inputmode: 'numeric', min: '0',
        placeholder: '—', value: c[f.key] ?? '',
        // Commit on every keystroke so nothing is lost if the app is
        // backgrounded mid-entry; `change` alone would only fire on blur.
        oninput: (e) => commit(f.key, e.target.value),
      }));
  };

  const group = (title, keys) => [
    h('div.section-title', { style: { marginTop: '18px' } }, title),
    h('div.card', ...CATERING_FIELDS.filter((f) => keys(f)).map(field)),
  ];

  const node = h('div',
    h('div.stat-row', { style: { marginTop: '12px' } },
      h('div.stat', tiles.total, h('div.s-lab', 'סה״כ נפשות')),
      h('div.stat', tiles.ordered, h('div.s-lab', 'הוזמן צהריים')),
      h('div.stat', tiles.ate, h('div.s-lab', 'אכלו צהריים'))),
    ...group('ספירת נפשות', (f) => ['crew', 'actors', 'extras'].includes(f.key)),
    ...group('הוזמן', (f) => f.key.startsWith('ordered')),
    ...group('אכלו בפועל', (f) => f.key.startsWith('ate')));

  paintTiles();
  return node;
}

/* ================================================================== *
 * GRID MODE — the original spreadsheet layout, all days at once.
 * ================================================================== */

function gridFor(tab) {
  const days = store.days();
  if (!days.length) return h('div.empty', h('p', 'אין ימים להצגה'));

  const nameOf = (id) => (id ? (store.personById(id)?.name || '—') : '');

  if (tab === 'catering') {
    return grid(
      ['תאריך', ...CATERING_FIELDS.map((f) => f.he)],
      days.map((d) => [formatDateShort(d.date), ...CATERING_FIELDS.map((f) => d.catering?.[f.key] ?? '')]));
  }

  if (tab === 'vehicles') {
    return grid(
      ['תאריך', ...VEHICLE_SLOTS.map((v) => v.he)],
      days.map((d) => [formatDateShort(d.date),
        ...VEHICLE_SLOTS.map((v) => {
          const r = d.vehicles?.[v.slot];
          return [nameOf(r?.driverId), r?.plate].filter(Boolean).join(' · ');
        })]));
  }

  const slots = tab === 'production' ? CREW_SLOTS : tab === 'cleaning' ? CLEANING_SLOTS : SECURITY_SLOTS;
  const counts = {};
  slots.forEach((s) => (counts[s.he] = (counts[s.he] || 0) + 1));
  const seen = {};
  const headers = slots.map((s) => {
    seen[s.he] = (seen[s.he] || 0) + 1;
    return counts[s.he] > 1 ? `${s.he} ${seen[s.he]}` : s.he;
  });

  return grid(
    ['תאריך', ...headers],
    days.map((d) => [formatDateShort(d.date), ...slots.map((s) => nameOf(d.slots[s.slot]))]));
}

function grid(headers, rows) {
  return h('div.tablewrap', { style: { marginTop: '12px' } },
    h('table.grid',
      h('thead', h('tr', ...headers.map((x) => h('th', x)))),
      h('tbody', ...rows.map((r) =>
        h('tr', ...r.map((cell, i) =>
          h('td', { class: cell === '' || cell == null ? 'empty-cell' : (i === 0 ? 'num' : '') },
            cell === '' || cell == null ? '—' : String(cell))))))));
}

export function resetSheetsState() { activeTab = 'production'; mode = 'day'; }
