/**
 * views/settings.js — Locations, team sync, appearance, data.
 */

import { h, icon, toast, haptic, sheet, confirmSheet } from '../ui.js';
import * as store from '../store.js';
import * as act from '../actions.js';
import * as sync from '../sync.js';
import { locationEditor } from '../editors.js';

export function renderSettings({ navigate: goto }) {
  const rerender = () => goto('settings');
  const s = store.settings();
  const locs = store.locations();

  return h('div',
    /* ---------------- locations ---------------- */
    h('div.section',
      h('div.section-title',
        h('span', 'מיקומים'),
        h('button', { onclick: () => locationEditor({}, rerender) }, 'חדש')),
      locs.length
        ? h('div.card', ...locs.map((l) => h('div.row',
            h('div', { style: { width: '38px', display: 'grid', placeItems: 'center', color: 'var(--tint)', flex: 'none' } }, icon('pin', 22)),
            h('button', {
              class: 'row-main', style: { background: 'none', textAlign: 'start' },
              onclick: () => locationEditor(l, rerender),
            },
              h('div.row-title', l.name),
              h('div.row-sub', [l.address, l.parking && `חניה: ${l.parking}`].filter(Boolean).join(' · ') || 'ללא כתובת')),
            h('button.icon-btn', { onclick: () => act.navigate(l), 'aria-label': `ניווט אל ${l.name}` }, icon('nav', 20)),
            h('span.chev', icon('back', 18)))))
        : h('div.card', h('div.empty', { style: { padding: '30px 20px' } },
            h('p', 'עוד לא הוגדרו מיקומים. מיקום שמור נותן ניווט בלחיצה אחת מכל מסך באפליקציה.'),
            h('button.btn.primary', { onclick: () => locationEditor({}, rerender) }, icon('plus', 19), 'מיקום ראשון')))),

    /* ---------------- navigation app ---------------- */
    h('div.section',
      h('div.section-title', 'אפליקציית ניווט'),
      h('div.segmented',
        ...[['waze', 'ווייז'], ['apple', 'מפות אפל'], ['google', 'גוגל מפות']].map(([k, label]) =>
          h('button', {
            'aria-pressed': (s.navApp || 'waze') === k,
            onclick: () => { store.setSettings({ navApp: k }); haptic(); rerender(); },
          }, label))),
      h('p.hint', 'כפתורי הניווט באפליקציה ייפתחו באפליקציה שבחרתם.')),

    /* ---------------- appearance ---------------- */
    h('div.section',
      h('div.section-title', 'מראה'),
      h('div.segmented',
        ...[['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([k, label]) =>
          h('button', {
            'aria-pressed': (s.theme || 'auto') === k,
            onclick: () => { store.setSettings({ theme: k }); applyTheme(k); haptic(); rerender(); },
          }, label)))),

    /* ---------------- production name ---------------- */
    h('div.section',
      h('div.section-title', 'ההפקה'),
      h('div.card',
        h('div.field',
          h('label', { for: 'set_prod' }, 'שם ההפקה'),
          h('input', {
            id: 'set_prod', value: s.productionName || '',
            onchange: (e) => { store.setSettings({ productionName: e.target.value }); rerender(); },
          })))),

    /* ---------------- team sync ---------------- */
    syncSection(s, rerender),

    /* ---------------- data ---------------- */
    h('div.section',
      h('div.section-title', 'נתונים'),
      h('div.card',
        h('button.row', { onclick: exportBackup },
          h('div.row-main', h('div.row-title', 'גיבוי הנתונים'), h('div.row-sub', 'שמירת קובץ עם כל אנשי הקשר, הימים והגיליונות')),
          h('span.chev', icon('back', 18))),
        h('button.row', { onclick: () => importBackup(rerender) },
          h('div.row-main', h('div.row-title', 'שחזור מגיבוי'), h('div.row-sub', 'טעינת קובץ גיבוי')),
          h('span.chev', icon('back', 18))),
        h('button.row', {
          onclick: async () => {
            if (await confirmSheet('פעולה זו תחליף את כל הנתונים הקיימים בנתוני דוגמה. להמשיך?',
                                   { danger: false, confirmLabel: 'טען דוגמה' })) {
              const { loadDemoData } = await import('../demo.js');
              loadDemoData();
              toast('נתוני הדוגמה נטענו', 'ok');
              rerender();
            }
          },
        },
          h('div.row-main', h('div.row-title', 'טעינת נתוני דוגמה'), h('div.row-sub', 'הפקה לדוגמה כדי להתרשם מהאפליקציה')),
          h('span.chev', icon('back', 18))),
        h('button.row', {
          onclick: async () => {
            if (await confirmSheet('למחוק את כל הנתונים מהמכשיר הזה? הפעולה אינה הפיכה.', { confirmLabel: 'מחק הכל' })) {
              localStorage.removeItem('workapp.state.v1');
              location.reload();
            }
          },
        },
          h('div.row-main', h('div.row-title', { style: { color: 'var(--red)' } }, 'מחיקת כל הנתונים')))),
      h('p.hint', 'הנתונים נשמרים על המכשיר ועובדים גם בלי קליטה. סנכרון צוות, אם הופעל, מוסיף עותק משותף בענן.')),

    h('div', { style: { padding: '26px 20px', textAlign: 'center', color: 'var(--label-3)', fontSize: '13px' } },
      h('div', 'יומן הפקה'), h('div', 'גרסה 1.0')),
    h('div.spacer'));
}

/* ------------------------------------------------------------------ */

function syncSection(s, rerender) {
  const cfg = s.sync || {};
  const statusEl = h('span.sync-pill');
  sync.onSyncStatus(({ state, detail }) => {
    const map = {
      ok: ['var(--green)', detail ? `מסונכרן ${detail}` : 'מסונכרן'],
      syncing: ['var(--orange)', 'מסנכרן…'],
      offline: ['var(--label-3)', 'לא מקוון'],
      error: ['var(--red)', 'שגיאת סנכרון'],
      off: ['var(--label-3)', 'כבוי'],
    };
    const [color, text] = map[state] || map.off;
    statusEl.replaceChildren(h('span.dot', { style: { background: color } }), h('span', text));
  });

  return h('div.section',
    h('div.section-title', h('span', 'סנכרון צוות'), statusEl),
    h('div.card',
      h('button.row', { onclick: () => syncSetup(rerender) },
        h('div', { style: { width: '38px', display: 'grid', placeItems: 'center', color: cfg.enabled ? 'var(--green)' : 'var(--label-3)', flex: 'none' } }, icon('cloud', 22)),
        h('div.row-main',
          h('div.row-title', cfg.enabled ? 'סנכרון פעיל' : 'הפעלת סנכרון'),
          h('div.row-sub', cfg.enabled ? `פרויקט: ${cfg.projectId || 'default'}` : 'שיתוף הנתונים עם הצוות בין מכשירים')),
        h('span.chev', icon('back', 18))),
      cfg.enabled ? h('button.row', {
        onclick: async () => { toast('מסנכרן…'); await sync.pull(); await sync.flush(); toast('הסנכרון הושלם', 'ok'); rerender(); },
      },
        h('div.row-main', h('div.row-title', 'סנכרון עכשיו'))) : null),
    h('p.hint', 'בלי סנכרון האפליקציה עובדת במלואה על המכשיר. עם סנכרון, כל מי שמזין את אותם פרטי חיבור רואה את אותם ימים, אנשי קשר ומיקומים.'));
}

function syncSetup(rerender) {
  const cfg = { url: '', anonKey: '', projectId: 'default', enabled: false, ...store.settings().sync };
  const draft = { ...cfg };
  const statusLine = h('p.hint');

  const field = (label, key, ph, type = 'text') => h('div.field',
    h('label', { for: `sy_${key}` }, label),
    h('input', {
      id: `sy_${key}`, type, placeholder: ph, value: draft[key] || '',
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      style: { direction: 'ltr', textAlign: 'left' },
      oninput: (e) => (draft[key] = e.target.value.trim()),
    }));

  const s = sheet({
    title: 'סנכרון צוות',
    body: h('div',
      h('p.hint', 'הסנכרון עובד מול פרויקט Supabase חינמי משלכם. צרו פרויקט, הריצו את הקובץ supabase/schema.sql שמצורף לאפליקציה, והדביקו כאן את הכתובת והמפתח הציבורי.'),
      h('div.card', { style: { marginTop: '10px' } },
        field('כתובת', 'url', 'https://xxxx.supabase.co', 'url'),
        field('מפתח anon', 'anonKey', 'eyJhbGciOi…'),
        field('מזהה פרויקט', 'projectId', 'default')),
      h('p.hint', 'מזהה הפרויקט מפריד בין הפקות שונות על אותו שרת. כל מי שמזין את אותו מזהה רואה את אותם נתונים.'),
      statusLine,
      h('div', { style: { padding: '12px 16px 0' } },
        h('button.btn.block', {
          onclick: async () => {
            statusLine.textContent = 'בודק חיבור…';
            const r = await sync.testConnection(draft);
            statusLine.textContent = r.ok ? '✅ החיבור תקין' : `❌ ${r.error}`;
            statusLine.style.color = r.ok ? 'var(--green)' : 'var(--red)';
          },
        }, 'בדיקת חיבור')),
      cfg.enabled ? h('div', { style: { padding: '10px 16px 0' } },
        h('button.btn.block.danger', {
          onclick: () => {
            store.setSettings({ sync: { ...draft, enabled: false } });
            s.close(); toast('הסנכרון כובה'); rerender();
          },
        }, 'כיבוי סנכרון')) : null,
      h('div.spacer')),
    actions: [
      h('button.btn.block.primary', {
        onclick: async () => {
          if (!draft.url || !draft.anonKey) return toast('צריך כתובת ומפתח', 'error');
          const r = await sync.testConnection(draft);
          if (!r.ok) return toast(r.error, 'error');
          store.setSettings({ sync: { ...draft, projectId: draft.projectId || 'default', enabled: true } });
          haptic(12);
          toast('מסנכרן…');
          await sync.pull();
          await sync.flush();
          s.close(); toast('הסנכרון פעיל', 'ok'); rerender();
        },
      }, 'הפעלה ושמירה'),
    ],
  });
}

/* ------------------------------------------------------------------ */

async function exportBackup() {
  const data = JSON.stringify(store.getState(), null, 2);

  // A framed preview can't start a download — the browser blocks it and the
  // user is left thinking the backup worked. Put it on the clipboard instead
  // and say what happened.
  if (act.isFramed) {
    try {
      await navigator.clipboard.writeText(data);
      toast('הגיבוי הועתק ללוח — הדביקו בקובץ ושמרו', 'ok');
    } catch {
      toast('הורדת גיבוי זמינה באפליקציה המותקנת', 'error');
    }
    return;
  }

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('הגיבוי ירד למכשיר', 'ok');
}

function importBackup(rerender) {
  if (act.isFramed) {
    return toast('שחזור מגיבוי זמין באפליקציה המותקנת');
  }
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.people) || !Array.isArray(parsed.days)) {
        return toast('הקובץ אינו גיבוי תקין', 'error');
      }
      if (!(await confirmSheet('השחזור יחליף את כל הנתונים שעל המכשיר. להמשיך?', { danger: false, confirmLabel: 'שחזר' }))) return;
      store.replaceState(parsed);
      toast('שוחזר בהצלחה', 'ok');
      rerender();
    } catch {
      toast('לא הצלחנו לקרוא את הקובץ', 'error');
    } finally {
      input.remove();
    }
  });
  document.body.appendChild(input);
  input.click();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  // Keep the iOS status bar tinted to match the app chrome.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#000000' : '#F2F2F7');
  }
}
