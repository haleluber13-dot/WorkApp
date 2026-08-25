/**
 * editors.js — Bottom-sheet editors shared by every screen.
 * Each one commits on save and closes; nothing here holds long-lived state.
 */

import { h, sheet, icon, toast, haptic, avatar, confirmSheet } from './ui.js';
import {
  DEPTS, ALL_SLOTS, slotDef, STATUS, VEHICLE_SLOTS,
  formatDateHe, todayISO,
} from './model.js';
import * as store from './store.js';
import * as act from './actions.js';

/* ------------------------------------------------------------------ *
 * Person
 * ------------------------------------------------------------------ */

export function personEditor(person, onDone) {
  const isNew = !person?.id;
  const draft = { dept: 'production', ...(person || {}) };

  const field = (label, key, opts = {}) =>
    h('div.field',
      h('label', { for: `f_${key}` }, label),
      h('input', {
        id: `f_${key}`,
        type: opts.type || 'text',
        inputmode: opts.inputmode,
        placeholder: opts.placeholder || '',
        value: draft[key] || '',
        oninput: (e) => (draft[key] = e.target.value),
      }));

  const deptSelect = h('div.field',
    h('label', { for: 'f_dept' }, 'מחלקה'),
    h('select', { id: 'f_dept', onchange: (e) => (draft.dept = e.target.value) },
      ...Object.entries(DEPTS).map(([k, d]) =>
        h('option', { value: k, selected: draft.dept === k }, d.he))));

  const roleSelect = h('div.field',
    h('label', { for: 'f_slot' }, 'תפקיד קבוע'),
    h('select', { id: 'f_slot', onchange: (e) => (draft.defaultSlot = e.target.value) },
      h('option', { value: '', selected: !draft.defaultSlot }, 'ללא'),
      ...ALL_SLOTS.map((s) =>
        h('option', { value: s.slot, selected: draft.defaultSlot === s.slot }, s.short))));

  const s = sheet({
    title: isNew ? 'איש קשר חדש' : 'עריכת איש קשר',
    body: h('div',
      h('div.card', { style: { marginTop: '8px' } },
        field('שם', 'name', { placeholder: 'שם מלא' }),
        field('טלפון', 'phone', { type: 'tel', inputmode: 'tel', placeholder: '050-000-0000' }),
        deptSelect,
        roleSelect),
      h('div.card', { style: { marginTop: '18px' } },
        field('אימייל', 'email', { type: 'email', placeholder: 'לא חובה' }),
        field('יוצא מ־', 'homeBase', { placeholder: 'עיר / אזור — לתכנון איסופים' })),
      h('div.card', { style: { marginTop: '18px' } },
        h('div.field.stack',
          h('label', { for: 'f_notes' }, 'הערות'),
          h('textarea', {
            id: 'f_notes', placeholder: 'ציוד, העדפות, מגבלות…',
            value: draft.notes || '',
            oninput: (e) => (draft.notes = e.target.value),
          }))),
      !isNew ? h('div', { style: { padding: '18px 16px 0' } },
        h('button.btn.block.danger', {
          onclick: async () => {
            if (await confirmSheet(`למחוק את ${draft.name || 'איש הקשר'}? הוא יוסר מכל ימי הצילום.`)) {
              store.deletePerson(draft.id);
              s.close();
              toast('נמחק');
              onDone?.(null);
            }
          },
        }, 'מחיקת איש קשר')) : null,
      h('div.spacer')),
    actions: [
      h('button.btn.block.primary', {
        onclick: () => {
          if (!String(draft.name || '').trim()) return toast('צריך שם', 'error');
          const r = store.upsertPerson(draft);
          haptic(12);
          s.close();
          toast(isNew ? 'נוסף לאנשי הקשר' : 'נשמר', 'ok');
          onDone?.(r.rows[0]);
        },
      }, 'שמירה'),
    ],
  });
  return s;
}

/* ------------------------------------------------------------------ *
 * Location
 * ------------------------------------------------------------------ */

export function locationEditor(location, onDone) {
  const isNew = !location?.id;
  const draft = { ...(location || {}) };

  const field = (label, key, opts = {}) =>
    h('div.field',
      h('label', { for: `l_${key}` }, label),
      h('input', {
        id: `l_${key}`, type: opts.type || 'text', inputmode: opts.inputmode,
        placeholder: opts.placeholder || '',
        value: draft[key] ?? '',
        oninput: (e) => {
          const v = e.target.value;
          draft[key] = opts.numeric ? (v === '' ? null : Number(v)) : v;
        },
      }));

  const s = sheet({
    title: isNew ? 'מיקום חדש' : 'עריכת מיקום',
    body: h('div',
      h('div.card', { style: { marginTop: '8px' } },
        field('שם', 'name', { placeholder: 'לוקיישן / סט' }),
        field('כתובת', 'address', { placeholder: 'רחוב, עיר' }),
        field('חניה', 'parking', { placeholder: 'איפה חונים' })),
      h('p.hint', 'קואורדינטות הן לא חובה — בלעדיהן הניווט יחפש לפי הכתובת. עם קואורדינטות הניווט מדויק גם בשטח פתוח בלי כתובת.'),
      h('div.card', { style: { marginTop: '8px' } },
        field('קו רוחב', 'lat', { inputmode: 'decimal', numeric: true, placeholder: '32.0853' }),
        field('קו אורך', 'lng', { inputmode: 'decimal', numeric: true, placeholder: '34.7818' })),
      h('div', { style: { padding: '14px 16px 0' } },
        h('button.btn.block', {
          onclick: () => {
            if (!navigator.geolocation) return toast('אין גישה למיקום במכשיר הזה', 'error');
            toast('מאתר מיקום…');
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                draft.lat = +pos.coords.latitude.toFixed(6);
                draft.lng = +pos.coords.longitude.toFixed(6);
                s.panel.querySelector('#l_lat').value = draft.lat;
                s.panel.querySelector('#l_lng').value = draft.lng;
                haptic(14);
                toast('המיקום הנוכחי נקלט', 'ok');
              },
              () => toast('לא הצלחנו לקבל מיקום', 'error'),
              { enableHighAccuracy: true, timeout: 10000 });
          },
        }, icon('pin', 19), 'השתמש במיקום הנוכחי שלי')),
      h('div.card', { style: { marginTop: '18px' } },
        h('div.field.stack',
          h('label', { for: 'l_notes' }, 'הערות'),
          h('textarea', {
            id: 'l_notes', placeholder: 'גישה, מפתחות, איש קשר בשטח…',
            value: draft.notes || '',
            oninput: (e) => (draft.notes = e.target.value),
          }))),
      !isNew ? h('div', { style: { padding: '18px 16px 0' } },
        h('button.btn.block.danger', {
          onclick: async () => {
            if (await confirmSheet(`למחוק את המיקום "${draft.name || ''}"?`)) {
              store.deleteLocation(draft.id);
              s.close(); toast('נמחק'); onDone?.(null);
            }
          },
        }, 'מחיקת מיקום')) : null,
      h('div.spacer')),
    actions: [
      h('button.btn.block.primary', {
        onclick: () => {
          if (!String(draft.name || '').trim()) return toast('צריך שם למיקום', 'error');
          const r = store.upsertLocation(draft);
          haptic(12); s.close(); toast('נשמר', 'ok'); onDone?.(r.rows[0]);
        },
      }, 'שמירה'),
    ],
  });
  return s;
}

/* ------------------------------------------------------------------ *
 * Person picker — used to fill a sheet slot or pick a driver.
 * ------------------------------------------------------------------ */

export function personPicker({ title, selectedId, slot, onPick, allowNone = true }) {
  let query = '';
  const listEl = h('div.card', { style: { marginTop: '8px' } });

  const render = () => {
    listEl.replaceChildren();
    const q = query.trim().toLowerCase();
    const def = slot ? slotDef(slot) : null;
    let list = store.people();
    if (q) list = list.filter((p) => `${p.name} ${p.phone} ${DEPTS[p.dept]?.he || ''}`.toLowerCase().includes(q));

    // People whose default role matches this slot float to the top.
    list = [...list].sort((a, b) => {
      const am = a.defaultSlot === slot ? 0 : (def && a.dept === def.dept ? 1 : 2);
      const bm = b.defaultSlot === slot ? 0 : (def && b.dept === def.dept ? 1 : 2);
      return am - bm || a.name.localeCompare(b.name, 'he');
    });

    if (allowNone) {
      listEl.appendChild(h('button.row', {
        onclick: () => { haptic(); onPick?.(''); s.close(); },
      },
        h('div.avatar', { style: { width: '38px', height: '38px', background: 'var(--fill-2)', color: 'var(--label-2)' } }, '—'),
        h('div.row-main', h('div.row-title', 'להשאיר ריק')),
        !selectedId ? h('span.chev', icon('check', 20)) : null));
    }

    if (!list.length) {
      listEl.appendChild(h('div.empty', h('p', q ? 'לא נמצאו אנשי קשר' : 'עדיין אין אנשי קשר')));
    }

    list.forEach((p) => {
      const isDefault = p.defaultSlot === slot;
      listEl.appendChild(h('button.row', {
        onclick: () => { haptic(); onPick?.(p.id); s.close(); },
      },
        avatar(p.name, 38, DEPTS[p.dept]?.color),
        h('div.row-main',
          h('div.row-title', p.name),
          h('div.row-sub',
            [DEPTS[p.dept]?.he, p.defaultSlot ? slotDef(p.defaultSlot)?.short : null]
              .filter(Boolean).join(' · '))),
        isDefault ? h('span.badge', 'ברירת מחדל') : null,
        selectedId === p.id ? h('span.chev', { style: { color: 'var(--tint)' } }, icon('check', 20)) : null));
    });
  };

  const s = sheet({
    title: title || 'בחירת איש צוות',
    body: h('div',
      h('div.searchbar', h('div.searchbar-inner',
        icon('search', 17),
        h('input', {
          type: 'search', placeholder: 'חיפוש', 'aria-label': 'חיפוש איש צוות',
          oninput: (e) => { query = e.target.value; render(); },
        }))),
      listEl,
      h('div', { style: { padding: '18px 16px 0' } },
        h('button.btn.block', {
          onclick: () => {
            s.close();
            personEditor({ dept: slot ? slotDef(slot)?.dept : 'production', defaultSlot: slot || '' },
              (p) => p && onPick?.(p.id));
          },
        }, icon('plus', 19), 'איש קשר חדש')),
      h('div.spacer')),
  });
  render();
  return s;
}

/* ------------------------------------------------------------------ *
 * Per-person call time + status on a day
 * ------------------------------------------------------------------ */

export function callEditor(day, person, onDone) {
  const existing = day.calls[person.id] || {};
  const draft = {
    time: existing.time || '',
    status: existing.status || 'pending',
    locationId: existing.locationId || '',
    note: existing.note || '',
  };

  const statusRow = h('div.segmented',
    ...Object.entries(STATUS).map(([k, v]) =>
      h('button', {
        'aria-pressed': draft.status === k,
        onclick: (e) => {
          draft.status = k;
          haptic();
          [...e.currentTarget.parentElement.children].forEach((b, i) =>
            b.setAttribute('aria-pressed', Object.keys(STATUS)[i] === k));
        },
      }, v.he)));

  const s = sheet({
    title: person.name,
    body: h('div',
      h('p.hint', `קריאה כללית ליום זה: ${day.generalCall || '—'}. השאירו ריק כדי להשתמש בה.`),
      h('div.card', { style: { marginTop: '8px' } },
        h('div.field',
          h('label', { for: 'c_time' }, 'שעת קריאה'),
          h('input', {
            id: 'c_time', type: 'time', value: draft.time,
            oninput: (e) => (draft.time = e.target.value),
          })),
        h('div.field',
          h('label', { for: 'c_loc' }, 'מיקום'),
          h('select', { id: 'c_loc', onchange: (e) => (draft.locationId = e.target.value) },
            h('option', { value: '', selected: !draft.locationId }, 'כמו היום'),
            ...store.locations().map((l) =>
              h('option', { value: l.id, selected: draft.locationId === l.id }, l.name))))),
      h('div.section-title', { style: { marginTop: '18px' } }, 'סטטוס'),
      statusRow,
      h('div.card', { style: { marginTop: '18px' } },
        h('div.field.stack',
          h('label', { for: 'c_note' }, 'הערה'),
          h('textarea', {
            id: 'c_note', placeholder: 'איסוף, ציוד מיוחד…', value: draft.note,
            oninput: (e) => (draft.note = e.target.value),
          }))),
      h('div', { style: { padding: '18px 16px 0', display: 'flex', gap: '8px' } },
        h('button.btn', { style: { flex: '1' }, onclick: () => act.call(person) }, icon('phone', 18), 'חיוג'),
        h('button.btn', { style: { flex: '1' }, onclick: () => act.whatsapp(person, callMessage(day, person, draft)) },
          icon('chat', 18), 'וואטסאפ')),
      h('div.spacer')),
    actions: [
      h('button.btn.block.primary', {
        onclick: () => {
          store.setCall(day.id, person.id, draft);
          haptic(12); s.close(); onDone?.();
        },
      }, 'שמירה'),
    ],
  });
  return s;
}

/** The WhatsApp text sent to one crew member about their call. */
export function callMessage(day, person, call) {
  const loc = store.locationById(call.locationId || day.locationId);
  const lines = [
    `היי ${person.name},`,
    `${formatDateHe(day.date)}${day.title ? ` — ${day.title}` : ''}`,
    `שעת קריאה: ${call.time || day.generalCall || '—'}`,
  ];
  if (loc) {
    lines.push(`מיקום: ${loc.name}${loc.address ? ` — ${loc.address}` : ''}`);
    if (loc.parking) lines.push(`חניה: ${loc.parking}`);
  }
  if (call.note) lines.push(`הערה: ${call.note}`);
  lines.push('', 'נא לאשר קבלה 🙏');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Day settings (date, location, the three times)
 * ------------------------------------------------------------------ */

export function dayEditor(day, onDone) {
  const isNew = !day?.id;
  const draft = { date: todayISO(), generalCall: '07:00', shootingCall: '08:00', wrap: '19:00', ...(day || {}) };

  const timeField = (label, key) =>
    h('div.field',
      h('label', { for: `d_${key}` }, label),
      h('input', { id: `d_${key}`, type: 'time', value: draft[key] || '', oninput: (e) => (draft[key] = e.target.value) }));

  const s = sheet({
    title: isNew ? 'יום צילום חדש' : 'הגדרות היום',
    body: h('div',
      h('div.card', { style: { marginTop: '8px' } },
        h('div.field',
          h('label', { for: 'd_date' }, 'תאריך'),
          h('input', { id: 'd_date', type: 'date', value: draft.date, oninput: (e) => (draft.date = e.target.value) })),
        h('div.field',
          h('label', { for: 'd_title' }, 'כותרת'),
          h('input', { id: 'd_title', placeholder: 'יום 4 — סצנות 12-18', value: draft.title || '', oninput: (e) => (draft.title = e.target.value) })),
        h('div.field',
          h('label', { for: 'd_loc' }, 'מיקום'),
          h('select', { id: 'd_loc', onchange: (e) => (draft.locationId = e.target.value) },
            h('option', { value: '', selected: !draft.locationId }, 'לא נבחר'),
            ...store.locations().map((l) => h('option', { value: l.id, selected: draft.locationId === l.id }, l.name))))),
      h('div', { style: { padding: '10px 16px 0' } },
        h('button.btn.block.sm', {
          onclick: () => { s.close(); locationEditor({}, (l) => { if (l) { draft.locationId = l.id; store.upsertDay(draft); onDone?.(); } }); },
        }, icon('plus', 17), 'מיקום חדש')),
      h('div.section-title', { style: { marginTop: '18px' } }, 'שעות'),
      h('div.card',
        timeField('קריאה כללית', 'generalCall'),
        timeField('תחילת צילום', 'shootingCall'),
        timeField('סיום משוער', 'wrap')),
      h('div.card', { style: { marginTop: '18px' } },
        h('div.field.stack',
          h('label', { for: 'd_notes' }, 'הערות הפקה'),
          h('textarea', {
            id: 'd_notes', placeholder: 'מזג אוויר, ציוד מיוחד, שינויים…',
            value: draft.notes || '', oninput: (e) => (draft.notes = e.target.value),
          }))),
      !isNew ? h('div', { style: { padding: '18px 16px 0' } },
        h('button.btn.block.danger', {
          onclick: async () => {
            if (await confirmSheet('למחוק את יום הצילום הזה על כל הנתונים שבו?')) {
              store.deleteDay(draft.id); s.close(); toast('נמחק'); onDone?.(null);
            }
          },
        }, 'מחיקת יום')) : null,
      h('div.spacer')),
    actions: [
      h('button.btn.block.primary', {
        onclick: () => {
          const r = store.upsertDay(draft);
          haptic(12); s.close(); toast('נשמר', 'ok'); onDone?.(r.rows[0]);
        },
      }, 'שמירה'),
    ],
  });
  return s;
}

/* ------------------------------------------------------------------ *
 * Vehicle assignment (sheet "רכבים")
 * ------------------------------------------------------------------ */

export function vehicleEditor(day, vslot, onDone) {
  const def = VEHICLE_SLOTS.find((v) => v.slot === vslot);
  const draft = { driverId: '', plate: '', note: '', ...(day.vehicles?.[vslot] || {}) };
  const driverRow = h('button.row', { onclick: () => pickDriver() });

  const paint = () => {
    driverRow.replaceChildren();
    const p = store.personById(draft.driverId);
    driverRow.append(
      p ? avatar(p.name, 36, DEPTS[p.dept]?.color)
        : h('div.avatar', { style: { width: '36px', height: '36px', background: 'var(--fill-2)', color: 'var(--label-2)' } }, '+'),
      h('div.row-main',
        h('div.row-title', p ? p.name : 'שיוך נהג'),
        p?.phone ? h('div.row-sub.tel', act.formatPhone(p.phone)) : null),
      h('span.chev', icon('back', 18)));
  };
  const pickDriver = () => personPicker({
    title: `נהג — ${def?.he || ''}`, selectedId: draft.driverId,
    onPick: (id) => { draft.driverId = id; paint(); },
  });
  paint();

  const s = sheet({
    title: def?.he || 'רכב',
    body: h('div',
      h('div.card', { style: { marginTop: '8px' } }, driverRow),
      h('div.card', { style: { marginTop: '18px' } },
        h('div.field',
          h('label', { for: 'v_plate' }, 'מספר רכב'),
          h('input', { id: 'v_plate', inputmode: 'numeric', placeholder: '00-000-00', value: draft.plate, oninput: (e) => (draft.plate = e.target.value) })),
        h('div.field.stack',
          h('label', { for: 'v_note' }, 'הערה'),
          h('textarea', { id: 'v_note', placeholder: 'מה נוסע ברכב הזה…', value: draft.note, oninput: (e) => (draft.note = e.target.value) }))),
      h('div.spacer')),
    actions: [
      h('button.btn.block.primary', {
        onclick: () => {
          const vehicles = { ...(day.vehicles || {}), [vslot]: draft };
          store.patchDay(day.id, { vehicles });
          haptic(12); s.close(); onDone?.();
        },
      }, 'שמירה'),
    ],
  });
  return s;
}
