/**
 * views/days.js — The shoot calendar: every day, past and upcoming.
 */

import { h, icon } from '../ui.js';
import { formatDateShort, todayISO, HE_DAYS, parseISO } from '../model.js';
import * as store from '../store.js';
import { dayEditor } from '../editors.js';

export function renderDays({ navigate: goto }) {
  const all = store.days();
  const today = todayISO();
  const rerender = () => goto('days');

  if (!all.length) {
    return h('div.empty',
      icon('calendar', 46),
      h('h3', 'לוח הצילומים ריק'),
      h('p', 'כל יום צילום מרכז את הצוות, השעות והלוקיישן שלו — בדיוק כמו שורה בגיליון, רק שאפשר להתקשר ממנה.'),
      h('button.btn.primary', { onclick: () => dayEditor({}, (d) => d && goto('today', { dayId: d.id })) },
        icon('plus', 19), 'יום צילום חדש'));
  }

  const upcoming = all.filter((d) => d.date >= today);
  const past = all.filter((d) => d.date < today).reverse();

  const section = (title, list) => list.length ? h('div.section',
    h('div.section-title', h('span', title), h('span', String(list.length))),
    h('div.card', ...list.map((d) => dayRow(d, today, goto)))) : null;

  return h('div',
    section('קרובים', upcoming),
    section('עברו', past),
    h('div', { style: { padding: '22px 16px 0' } },
      h('button.btn.block', { onclick: () => dayEditor({}, (d) => d && goto('today', { dayId: d.id })) },
        icon('plus', 19), 'יום צילום חדש')),
    h('div.spacer'));
}

function dayRow(day, today, goto) {
  const loc = store.locationById(day.locationId);
  const roster = store.rosterFor(day);
  const isToday = day.date === today;
  const d = parseISO(day.date);

  return h('button.row', { onclick: () => goto('today', { dayId: day.id }) },
    h('div', {
      style: {
        width: '46px', flex: 'none', textAlign: 'center',
        color: isToday ? 'var(--tint)' : 'var(--label)',
      },
    },
      h('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--label-2)' } }, HE_DAYS[d.getDay()]),
      h('div.num', { style: { fontSize: '20px', fontWeight: '800', lineHeight: '1.1' } }, formatDateShort(day.date))),
    h('div.row-main',
      h('div.row-title', day.title || 'יום צילום'),
      h('div.row-sub',
        [loc?.name, `${roster.length} אנשי צוות`, day.generalCall ? `קריאה ${day.generalCall}` : null]
          .filter(Boolean).join(' · '))),
    isToday ? h('span.badge.solid', { style: { background: 'var(--tint)', color: 'var(--tint-ink)' } }, 'היום') : null,
    h('span.chev', icon('back', 18)));
}
