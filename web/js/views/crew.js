/**
 * views/crew.js — The contact book.
 *
 * Sorted and grouped by department, searchable, with call / WhatsApp on every
 * row so reaching anyone is a single tap from anywhere in the app.
 *
 * The search field and the filter chips are built once and the *list* is
 * repainted as you type. Rebuilding the whole view per keystroke would drop
 * focus and the on-screen keyboard along with it.
 */

import { h, icon, avatar, haptic, inkOn } from '../ui.js';
import { DEPTS, slotDef } from '../model.js';
import * as store from '../store.js';
import * as act from '../actions.js';
import { personEditor } from '../editors.js';

// Kept across navigations so returning to the tab restores what you were doing.
let query = '';
let deptFilter = '';

export function renderCrew({ navigate: goto }) {
  const rerender = () => goto('crew');
  const all = store.people();

  if (!all.length) {
    return h('div.empty',
      icon('people', 46),
      h('h3', 'אין עדיין אנשי קשר'),
      h('p', 'הוסיפו את הצוות פעם אחת — ומשם כל שיבוץ ליום צילום הוא בחירה מרשימה, לא הקלדה מחדש.'),
      h('button.btn.primary', { onclick: () => personEditor({}, rerender) }, icon('plus', 19), 'איש קשר ראשון'));
  }

  const listEl = h('div');
  const chipsEl = h('div.contactbar', { style: { paddingBottom: '6px' } });

  const searchInput = h('input', {
    type: 'search', placeholder: 'חיפוש לפי שם, תפקיד או טלפון',
    'aria-label': 'חיפוש אנשי קשר', value: query,
    oninput: (e) => { query = e.target.value; paintList(); },
  });

  /* ---------------- filter chips ---------------- */

  const usedDepts = [...new Set(all.map((p) => p.dept))]
    .sort((a, b) => Object.keys(DEPTS).indexOf(a) - Object.keys(DEPTS).indexOf(b));

  const paintChips = () => {
    chipsEl.replaceChildren(
      h('button.badge', {
        style: deptFilter === '' ? { background: 'var(--tint)', color: 'var(--tint-ink)' } : {},
        onclick: () => { deptFilter = ''; haptic(); paintChips(); paintList(); },
      }, `הכל · ${all.length}`),
      ...usedDepts.map((d) => h('button.badge', {
        style: deptFilter === d ? { background: DEPTS[d].color, color: inkOn(DEPTS[d].color) } : {},
        onclick: () => { deptFilter = deptFilter === d ? '' : d; haptic(); paintChips(); paintList(); },
      }, `${DEPTS[d].he} · ${all.filter((p) => p.dept === d).length}`)));
  };

  /* ---------------- list ---------------- */

  const paintList = () => {
    const q = query.trim().toLowerCase();
    const list = store.people()
      .filter((p) => {
        if (deptFilter && p.dept !== deptFilter) return false;
        if (!q) return true;
        return `${p.name} ${p.phone} ${p.homeBase} ${DEPTS[p.dept]?.he || ''} ${slotDef(p.defaultSlot)?.short || ''}`
          .toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));

    if (!list.length) {
      listEl.replaceChildren(h('div.empty', h('p', 'לא נמצאו תוצאות')));
      return;
    }

    const groups = new Map();
    list.forEach((p) => {
      if (!groups.has(p.dept)) groups.set(p.dept, []);
      groups.get(p.dept).push(p);
    });

    listEl.replaceChildren(...[...groups.entries()].map(([dept, ppl]) =>
      h('div.section',
        h('div.section-title',
          h('span', { style: { display: 'flex', alignItems: 'center', gap: '7px' } },
            h('span.dot', { style: { background: DEPTS[dept]?.color } }),
            h('span', { style: { fontWeight: '700', color: 'var(--label)' } }, DEPTS[dept]?.he || dept)),
          h('span', String(ppl.length))),
        h('div.card', ...ppl.map((p) => personRow(p, rerender))))));
  };

  paintChips();
  paintList();

  return h('div',
    h('div.searchbar', h('div.searchbar-inner', icon('search', 17), searchInput)),
    usedDepts.length > 1 ? chipsEl : null,
    listEl,
    h('div', { style: { padding: '22px 16px 0' } },
      h('button.btn.block', { onclick: () => personEditor({}, rerender) }, icon('plus', 19), 'איש קשר חדש')),
    h('div.spacer'));
}

function personRow(p, rerender) {
  const role = p.defaultSlot ? slotDef(p.defaultSlot)?.short : null;
  // Phone gets its own line: on one line the RTL ellipsis eats the leading
  // digits, which makes the number worse than useless.
  const meta = [role, p.homeBase].filter(Boolean).join(' · ');

  return h('div.row',
    avatar(p.name, 42, DEPTS[p.dept]?.color),
    h('button', {
      class: 'row-main',
      style: { background: 'none', textAlign: 'start' },
      onclick: () => personEditor(p, rerender),
    },
      h('div.row-title', p.name),
      meta ? h('div.row-sub', meta) : null,
      // direction:ltr keeps the digits in dialling order; text-align:right
      // keeps the line flush with the Hebrew above it.
      p.phone ? h('div.row-sub.tel', { style: { direction: 'ltr', textAlign: 'right' } },
        act.formatPhone(p.phone)) : null),
    act.hasPhone(p) ? h('button.icon-btn', {
      onclick: () => act.call(p), 'aria-label': `חיוג ל${p.name}`,
    }, icon('phone', 20)) : null,
    act.hasPhone(p) ? h('button.icon-btn', {
      onclick: () => act.whatsapp(p), 'aria-label': `וואטסאפ ל${p.name}`,
    }, icon('chat', 20)) : null,
    h('button.icon-btn.plain', {
      onclick: () => personEditor(p, rerender), 'aria-label': `עריכת ${p.name}`,
    }, icon('back', 18)));
}

export function resetCrewFilters() { query = ''; deptFilter = ''; }
