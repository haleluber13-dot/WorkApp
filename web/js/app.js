/**
 * app.js — Shell, routing, and first-run.
 *
 * Routing is hash-based so the iOS back-swipe and the Home Screen shortcut
 * both behave. Each render is a full rebuild of the screen body: the data set
 * is small (a production is tens of people and days), and rebuilding removes a
 * whole class of stale-DOM bugs.
 */

import { h, icon, clear, toast, haptic } from './ui.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { renderToday } from './views/today.js';
import { renderCrew } from './views/crew.js';
import { renderDays } from './views/days.js';
import { renderSheets } from './views/sheets.js';
import { renderSettings, applyTheme } from './views/settings.js';
import { dayEditor, personEditor } from './editors.js';
import { formatDateHe } from './model.js';

const TABS = [
  { key: 'today',    he: 'היום',      icon: 'today' },
  { key: 'crew',     he: 'אנשי קשר',  icon: 'people' },
  { key: 'days',     he: 'ימים',      icon: 'calendar' },
  { key: 'sheets',   he: 'גיליונות',  icon: 'sheets' },
  { key: 'settings', he: 'הגדרות',    icon: 'gear' },
];

const VIEWS = {
  today: renderToday,
  crew: renderCrew,
  days: renderDays,
  sheets: renderSheets,
  settings: renderSettings,
};

let route = { tab: 'today', params: {} };

const el = {};

/** Navigate. Pushes history so the phone's back gesture works. */
function navigate(tab, params = {}, { replace = false } = {}) {
  route = { tab, params };
  const hash = `#/${tab}${params.dayId ? `?day=${encodeURIComponent(params.dayId)}` : ''}`;
  if (replace || location.hash === hash) history.replaceState(route, '', hash);
  else history.pushState(route, '', hash);
  render();
}

function readHash() {
  const m = /^#\/([a-z]+)(?:\?day=([^&]+))?/.exec(location.hash || '');
  if (!m || !VIEWS[m[1]]) return { tab: 'today', params: {} };
  return { tab: m[1], params: m[2] ? { dayId: decodeURIComponent(m[2]) } : {} };
}

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

function titleFor(tab) {
  if (tab === 'today') {
    const day = (route.params.dayId && store.dayById(route.params.dayId)) || store.currentDay();
    return { title: 'היום', sub: day ? formatDateHe(day.date) : null };
  }
  const t = TABS.find((x) => x.key === tab);
  const subs = {
    crew: `${store.people().length} אנשי קשר`,
    days: `${store.days().length} ימי צילום`,
    sheets: 'הפקה · קיטריינג · רכבים · ניקיון · שמירה',
    settings: store.settings().productionName || null,
  };
  return { title: t?.he || '', sub: subs[tab] };
}

/** The + button in the nav bar does the most useful thing for the current tab. */
function primaryAction(tab) {
  if (tab === 'crew') return () => personEditor({}, () => render());
  if (tab === 'days' || tab === 'today') return () => dayEditor({}, (d) => d && navigate('today', { dayId: d.id }));
  return null;
}

function buildChrome() {
  el.navTitleSm = h('div.navbar-title-sm');
  el.navLarge = h('h1.large-title');
  el.navSub = h('div.navbar-sub');
  el.navAction = h('div', { style: { width: '44px', flex: 'none' } });

  el.navbar = h('header.navbar',
    h('div.navbar-row', el.navAction, el.navTitleSm, h('div', { style: { width: '44px', flex: 'none' } })),
    el.navLarge,
    el.navSub);

  el.screen = h('main.screen', { role: 'main' });

  el.tabbar = h('nav.tabbar', { role: 'tablist', 'aria-label': 'ניווט ראשי' },
    ...TABS.map((t) => h('button.tab', {
      role: 'tab',
      'data-tab': t.key,
      onclick: () => { haptic(); navigate(t.key); },
    }, icon(t.icon), h('span', t.he))));

  document.getElementById('app').replaceChildren(el.navbar, el.screen, el.tabbar);

  // Collapse the large title on scroll, the way a native nav bar does.
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      el.navbar.classList.toggle('scrolled', window.scrollY > 24);
      ticking = false;
    });
  }, { passive: true });
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function render() {
  const { tab, params } = route;
  const { title, sub } = titleFor(tab);

  el.navTitleSm.textContent = title;
  el.navLarge.textContent = title;
  el.navSub.textContent = sub || '';
  el.navSub.style.display = sub ? '' : 'none';

  const action = primaryAction(tab);
  el.navAction.replaceChildren(
    action ? h('button.icon-btn', { onclick: action, 'aria-label': 'הוספה' }, icon('plus', 24)) : h('span'));

  el.tabbar.querySelectorAll('.tab').forEach((b) =>
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));

  const view = VIEWS[tab] || renderToday;
  clear(el.screen).appendChild(view({ ...params, navigate }));

  document.title = `${title} · יומן הפקה`;
}

/* ------------------------------------------------------------------ *
 * First run
 * ------------------------------------------------------------------ */

function maybeWelcome() {
  const s = store.getState();
  if (s.people.length || s.days.length || localStorage.getItem('workapp.welcomed')) return;
  localStorage.setItem('workapp.welcomed', '1');

  import('./ui.js').then(({ sheet }) => {
    const w = sheet({
      title: 'ברוכים הבאים ליומן ההפקה',
      body: h('div',
        h('p.hint', { style: { fontSize: '15px', lineHeight: '1.5' } },
          'האפליקציה בנויה בדיוק לפי הגיליון שלכם — הפקה, קיטריינג, רכבים, ניקיון ושמירה — רק שאפשר להתקשר מתוכה, לנווט ללוקיישן ולראות מי מגיע ומתי.'),
        h('div.card', { style: { marginTop: '16px' } },
          step('1', 'מוסיפים את הצוות פעם אחת', 'לשונית אנשי קשר — שם, טלפון ותפקיד קבוע.'),
          step('2', 'פותחים יום צילום', 'תאריך, לוקיישן ושעת קריאה כללית.'),
          step('3', 'משבצים בגיליונות', 'כל עמודה מהאקסל הופכת לשורה שאפשר ללחוץ עליה.')),
        h('div.spacer')),
      actions: [
        h('button.btn.block.primary', {
          onclick: () => { w.close(); dayEditor({}, (d) => d && navigate('today', { dayId: d.id })); },
        }, 'יוצרים יום צילום ראשון'),
        h('button.btn.block', {
          onclick: async () => {
            const { loadDemoData } = await import('./demo.js');
            loadDemoData();
            w.close();
            navigate('today');
          },
        }, 'מילוי נתוני דוגמה — להתרשם קודם'),
        h('button.btn.block.plain', { onclick: () => w.close() }, 'אחר כך'),
      ],
    });
  });
}

const step = (n, title, body) => h('div.row',
  h('div.avatar', { style: { width: '30px', height: '30px', background: 'var(--tint)', color: 'var(--tint-ink)', fontSize: '14px' } }, n),
  h('div.row-main',
    h('div.row-title', { style: { fontSize: '15px' } }, title),
    h('div.row-sub', { style: { whiteSpace: 'normal' } }, body)));

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot() {
  applyTheme(store.settings().theme || 'auto');
  buildChrome();
  route = readHash();
  history.replaceState(route, '', location.hash || '#/today');
  render();

  window.addEventListener('popstate', () => { route = readHash(); render(); });

  // Only repaint for changes that arrive from outside the UI (a sync pull or a
  // restored backup). Local edits repaint themselves at the call site, so that
  // typing into a field is never interrupted by a rebuild.
  store.subscribeExternal(() => render());

  sync.startAutoSync();
  maybeWelcome();

  // Offline caching is for the installed app. A preview embedded in another
  // page has no service worker to register and shouldn't claim the host origin.
  const framed = (() => {
    try { return window.top !== window.self; } catch { return true; }
  })();
  if ('serviceWorker' in navigator && !framed) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Re-theme when the system flips and the user is on "auto".
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((store.settings().theme || 'auto') === 'auto') applyTheme('auto');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
