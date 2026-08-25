/**
 * views/today.js — The screen that replaces the daily spreadsheet row.
 *
 * Everything needed on set within one thumb-reach: the day's times, the
 * location with one-tap navigation, the quick-dial contact bar, and the full
 * roster with per-person call times.
 */

import { h, icon, avatar, toast, haptic, sheet, inkOn } from '../ui.js';
import { DEPTS, STATUS, slotDef, formatDateHe, relativeToNow, CREW_SLOTS } from '../model.js';
import * as store from '../store.js';
import * as act from '../actions.js';
import { dayEditor, callEditor, personPicker, callMessage } from '../editors.js';

export function renderToday({ dayId, navigate: goto }) {
  const day = (dayId && store.dayById(dayId)) || store.currentDay();

  if (!day) return emptyState(goto);

  const roster = store.rosterFor(day);
  const loc = store.locationById(day.locationId);
  const rerender = () => goto('today', { dayId: day.id });

  return h('div',
    hero(day, loc, roster, rerender),
    contactBar(day, roster, rerender),
    rosterSection(day, roster, rerender),
    day.notes ? h('div.section',
      h('div.section-title', 'הערות הפקה'),
      h('div.card', h('div.row', h('div.row-main', h('div', { style: { fontSize: '15px', whiteSpace: 'pre-wrap', lineHeight: '1.45' } }, day.notes))))) : null,
    h('div.spacer'));
}

/* ------------------------------------------------------------------ */

function hero(day, loc, roster, rerender) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const isToday = day.date === new Date().toISOString().slice(0, 10) ||
                  day.date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Which of the three milestones is the "current" one — highlighted like a live badge.
  const marks = [
    { key: 'generalCall', label: 'קריאה כללית', v: day.generalCall },
    { key: 'shootingCall', label: 'תחילת צילום', v: day.shootingCall },
    { key: 'wrap', label: 'סיום', v: day.wrap },
  ];
  let activeKey = null;
  if (isToday) {
    const upcoming = marks.filter((m) => toMin(m.v) != null && toMin(m.v) >= nowMin);
    activeKey = upcoming.length ? upcoming[0].key : null;
  }

  const rel = isToday && activeKey ? relativeToNow(day.date, marks.find((m) => m.key === activeKey).v) : null;
  const relText = rel == null ? null
    : rel > 90 ? `בעוד ${Math.round(rel / 60)} שעות`
    : rel > 0 ? `בעוד ${rel} דקות`
    : 'עכשיו';

  const confirmed = roster.filter((r) => r.call.status === 'confirmed' || r.call.status === 'onset').length;

  return h('div.hero',
    h('div.hero-date', formatDateHe(day.date) + (isToday ? ' · היום' : '')),
    h('div.hero-title', day.title || 'יום צילום'),
    loc
      ? h('button.hero-loc', { style: { background: 'none', color: 'inherit' }, onclick: () => act.navigate(loc) },
          icon('pin', 15), h('span', loc.address ? `${loc.name} — ${loc.address}` : loc.name))
      : h('div.hero-loc', icon('pin', 15), h('span', { style: { opacity: .7 } }, 'לא נבחר מיקום')),
    h('div.hero-times',
      ...marks.map((m) => h('div.hero-time' + (m.key === activeKey ? '.now' : ''),
        h('div.ht-label', m.label),
        h('div.ht-value.time', m.v || '—')))),
    relText ? h('div.hero-countdown', icon('clock', 15), h('span', `${marks.find((m) => m.key === activeKey).label} ${relText}`)) : null,
    h('div.hero-countdown', icon('people', 15),
      h('span', `${roster.length} אנשי צוות · ${confirmed} אישרו`)),
    h('div.hero-actions',
      loc ? h('button.btn.primary', { onclick: () => act.navigate(loc) }, icon('nav', 17), 'ניווט') : null,
      h('button.btn', { onclick: () => dayEditor(day, rerender) }, icon('edit', 17), 'עריכה'),
      h('button.btn', { onclick: () => shareDay(day) }, icon('chat', 17), 'שיתוף')));
}

/* ------------------------------------------------------------------ *
 * The contact bar — horizontal quick-dial across the day's crew.
 * ------------------------------------------------------------------ */

function contactBar(day, roster, rerender) {
  const chips = roster.map((entry) => {
    const { person, slots, call } = entry;
    const roleShort = slots.length ? slotDef(slots[0])?.short : (entry.vehicles?.length ? 'נהג' : '');
    return h('button.contact-chip', {
      onclick: () => quickActions(day, entry, rerender),
      'aria-label': `${person.name}, ${roleShort || ''}`,
    },
      avatar(person.name, 54, DEPTS[person.dept]?.color),
      h('span.cc-status', { style: { background: STATUS[call.status]?.color || 'var(--label-3)' } }),
      h('span.cc-name', person.name),
      roleShort ? h('span.cc-role', roleShort) : null);
  });

  chips.push(h('button.contact-chip.add', {
    onclick: () => personPicker({
      title: 'הוספה ליום',
      onPick: (id) => {
        if (!id) return;
        const p = store.personById(id);
        const free = CREW_SLOTS.find((s) => !day.slots[s.slot] && (p.defaultSlot === s.slot))
                  || CREW_SLOTS.find((s) => !day.slots[s.slot] && s.dept === p.dept)
                  || CREW_SLOTS.find((s) => !day.slots[s.slot]);
        if (!free) return toast('כל התפקידים בגיליון ההפקה תפוסים', 'error');
        store.assignSlot(day.id, free.slot, id);
        toast(`${p.name} שובץ כ${slotDef(free.slot)?.short}`, 'ok');
        rerender();
      },
      allowNone: false,
    }),
    'aria-label': 'הוספת איש צוות ליום',
  },
    h('div.avatar', { style: { width: '54px', height: '54px' } }, '+'),
    h('span.cc-name', 'הוספה')));

  return h('div.section',
    h('div.section-title', h('span', 'אנשי קשר ליום הזה'), h('span.badge', String(roster.length))),
    h('div.contactbar', chips));
}

/** The action sheet behind every contact chip — call, WhatsApp, navigate, edit call. */
function quickActions(day, entry, rerender) {
  const { person, slots, call } = entry;
  const loc = store.locationById(call.locationId);
  const roles = slots.map((s) => slotDef(s)?.short).filter(Boolean);
  if (entry.vehicles?.length) roles.push('נהג');

  const s = sheet({
    title: person.name,
    body: h('div',
      h('div.card', { style: { marginTop: '8px' } },
        h('div.row',
          avatar(person.name, 46, DEPTS[person.dept]?.color),
          h('div.row-main',
            h('div.row-title', person.name),
            h('div.row-sub', [DEPTS[person.dept]?.he, roles.join(' · ')].filter(Boolean).join(' — '))),
          h('span.badge.solid', {
            style: {
              background: STATUS[call.status]?.color,
              color: inkOn(STATUS[call.status]?.color),
            },
          }, STATUS[call.status]?.he)),
        h('button.row', { onclick: () => { s.close(); callEditor(day, person, rerender); } },
          h('div.row-main', h('div.row-title', 'שעת קריאה'), call.note ? h('div.row-sub', call.note) : null),
          h('span.row-trail.time', call.time || '—'),
          h('span.chev', icon('back', 18))),
        person.homeBase ? h('div.row',
          h('div.row-main', h('div.row-title', 'יוצא מ־')),
          h('span.row-trail', person.homeBase)) : null,
        loc ? h('button.row', { onclick: () => act.navigate(loc) },
          h('div.row-main', h('div.row-title', 'מיקום'), h('div.row-sub', loc.address || '')),
          h('span.row-trail', loc.name),
          h('span.chev', icon('nav', 18))) : null),
      h('div.spacer')),
    actions: [
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button.btn.primary', { style: { flex: '1' }, onclick: () => act.call(person) }, icon('phone', 18), 'חיוג'),
        h('button.btn', { style: { flex: '1' }, onclick: () => act.whatsapp(person, callMessage(day, person, call)) }, icon('chat', 18), 'וואטסאפ')),
      h('div', { style: { display: 'flex', gap: '8px' } },
        loc ? h('button.btn', { style: { flex: '1' }, onclick: () => act.navigate(loc) }, icon('nav', 18), 'ניווט') : null,
        h('button.btn', { style: { flex: '1' }, onclick: () => { s.close(); callEditor(day, person, rerender); } }, icon('clock', 18), 'שעה וסטטוס')),
      h('button.btn.block.plain', {
        onclick: () => {
          slots.forEach((sl) => store.assignSlot(day.id, sl, ''));
          if (entry.vehicles?.length) {
            const vehicles = { ...day.vehicles };
            entry.vehicles.forEach((v) => (vehicles[v] = { ...vehicles[v], driverId: '' }));
            store.patchDay(day.id, { vehicles });
          }
          s.close(); haptic(12); toast('הוסר מהיום'); rerender();
        },
      }, 'הסרה מהיום הזה'),
    ],
  });
}

/* ------------------------------------------------------------------ */

function rosterSection(day, roster, rerender) {
  if (!roster.length) {
    return h('div.section',
      h('div.card',
        h('div.empty',
          icon('people', 40),
          h('h3', 'אין עדיין צוות ליום הזה'),
          h('p', 'שבצו אנשי צוות מגיליון ההפקה, או הוסיפו ישירות מהסרגל למעלה.'))));
  }

  // Group by call time so the coordinator sees the waves of arrival.
  const groups = new Map();
  roster.forEach((r) => {
    const t = r.call.time || '—';
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(r);
  });

  return h('div.section',
    h('div.section-title', 'לוח קריאות'),
    ...[...groups.entries()].map(([time, list]) =>
      h('div', { style: { marginBottom: '14px' } },
        h('div.section-title', { style: { paddingTop: '6px' } },
          h('span.time', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--label)' } }, time),
          h('span', `${list.length} אנשים`)),
        h('div.card', ...list.map((entry) => rosterRow(day, entry, rerender))))));
}

function rosterRow(day, entry, rerender) {
  const { person, slots, call } = entry;
  const roles = slots.map((s) => slotDef(s)?.short).filter(Boolean);
  if (entry.vehicles?.length) roles.push('נהג');

  return h('div.row',
    avatar(person.name, 40, DEPTS[person.dept]?.color),
    h('button', {
      class: 'row-main',
      style: { background: 'none', textAlign: 'start' },
      onclick: () => quickActions(day, entry, rerender),
    },
      h('div.row-title', person.name),
      h('div.row-sub', roles.join(' · ') || DEPTS[person.dept]?.he)),
    h('span.dot', { style: { background: STATUS[call.status]?.color }, title: STATUS[call.status]?.he }),
    act.hasPhone(person)
      ? h('button.icon-btn', { onclick: () => act.call(person), 'aria-label': `חיוג ל${person.name}` }, icon('phone', 20))
      : null,
    act.hasPhone(person)
      ? h('button.icon-btn', { onclick: () => act.whatsapp(person, callMessage(day, person, call)), 'aria-label': `וואטסאפ ל${person.name}` }, icon('chat', 20))
      : null);
}

/* ------------------------------------------------------------------ */

function emptyState(goto) {
  return h('div.empty',
    icon('today', 46),
    h('h3', 'אין עדיין ימי צילום'),
    h('p', 'צרו את יום הצילום הראשון — ומשם תוכלו לשבץ צוות, לקבוע שעות קריאה ולנווט ללוקיישן בלחיצה אחת.'),
    h('button.btn.primary', { onclick: () => dayEditor({}, (d) => d && goto('today', { dayId: d.id })) },
      icon('plus', 19), 'יום צילום חדש'));
}

/** A full day sheet as WhatsApp-ready text. */
export function shareDay(day) {
  const loc = store.locationById(day.locationId);
  const roster = store.rosterFor(day);
  const lines = [
    `📋 ${formatDateHe(day.date)}`,
    day.title ? day.title : null,
    '',
    `קריאה כללית: ${day.generalCall || '—'}`,
    `תחילת צילום: ${day.shootingCall || '—'}`,
    `סיום משוער: ${day.wrap || '—'}`,
  ];
  if (loc) {
    lines.push('', `📍 ${loc.name}${loc.address ? ` — ${loc.address}` : ''}`);
    if (loc.parking) lines.push(`חניה: ${loc.parking}`);
  }
  if (roster.length) {
    lines.push('', '👥 צוות:');
    roster.forEach((r) => {
      const roles = r.slots.map((s) => slotDef(s)?.short).filter(Boolean).join('/');
      lines.push(`${r.call.time || day.generalCall} — ${r.person.name}${roles ? ` (${roles})` : ''}`);
    });
  }
  if (day.notes) lines.push('', `הערות: ${day.notes}`);
  act.shareText(`יומן הפקה — ${day.date}`, lines.filter((l) => l !== null).join('\n'));
}
