/**
 * demo.js — Sample production, offered on first run.
 *
 * Real-shaped data: a full shooting day with crew across every department,
 * two locations, vehicles and catering counts, so the app can be understood
 * at a glance before anyone types anything. Cleared in one tap from settings.
 */

import { newPerson, newLocation, newDay, todayISO } from './model.js';
import { getState, replaceState } from './store.js';

const iso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return todayISO(d);
};

export function loadDemoData() {
  const P = (name, phone, dept, defaultSlot, homeBase) =>
    newPerson({ name, phone, dept, defaultSlot, homeBase });

  const people = [
    P('דנה אבירם',   '0501112233', 'production', 'pa_snr_1',  'תל אביב'),
    P('יונתן ברק',   '0502223344', 'production', 'pa_1',      'ראשון לציון'),
    P('שירה נחום',   '0503334455', 'production', 'water',     'בת ים'),
    P('אורי גלעד',   '0504445566', 'camera',     'cam_1',     'תל אביב'),
    P('מאיה רון',    '0505556677', 'camera',     'cam_2',     'הרצליה'),
    P('עידו שרון',   '0506667788', 'camera',     'cam_ac_1',  'רמת גן'),
    P('נועם קפלן',   '0507778899', 'sound',      'sound',     'ירושלים'),
    P('תמר אלון',    '0508889900', 'sound',      'boom',      'מודיעין'),
    P('רועי מזרחי',  '0509990011', 'lighting',   'gaffer',    'נתניה'),
    P('ליאור בן דוד','0521112233', 'lighting',   'grip',      'אשדוד'),
    P('אבי כהן',     '0522223344', 'vehicles',   '',          'לוד'),
    P('סיגלית פרץ',  '0523334455', 'cleaning',   'cleaner_1', 'רמלה'),
    P('משה לוי',     '0524445566', 'security',   'guard_1',   'חולון'),
  ];

  const locations = [
    newLocation({
      name: 'סטודיו הרצליה', address: 'הצורן 12, הרצליה',
      parking: 'חניון עירוני ממול, חינם עד 18:00',
      lat: 32.1624, lng: 34.8447,
      notes: 'הכניסה מהחניה האחורית. קוד שער 1408.',
    }),
    newLocation({
      name: 'חוף פולג', address: 'חוף פולג, נתניה',
      parking: 'חניית החוף — להגיע לפני 07:00',
      lat: 32.2789, lng: 34.8391,
      notes: 'אין חשמל בשטח. גנרטור מגיע עם המשאית.',
    }),
  ];

  const byName = (n) => people.find((p) => p.name === n).id;

  const today = newDay({
    date: iso(0),
    title: 'יום 4 — סצנות 12-18',
    locationId: locations[0].id,
    generalCall: '06:30', shootingCall: '08:00', wrap: '19:00',
    slots: {
      pa_snr_1: byName('דנה אבירם'),
      pa_1:     byName('יונתן ברק'),
      water:    byName('שירה נחום'),
      cam_1:    byName('אורי גלעד'),
      cam_2:    byName('מאיה רון'),
      cam_ac_1: byName('עידו שרון'),
      sound:    byName('נועם קפלן'),
      boom:     byName('תמר אלון'),
      gaffer:   byName('רועי מזרחי'),
      grip:     byName('ליאור בן דוד'),
      cleaner_1:byName('סיגלית פרץ'),
      guard_1:  byName('משה לוי'),
    },
    calls: {
      [byName('אורי גלעד')]:   { time: '05:45', status: 'confirmed', locationId: '', note: 'איסוף מהבית' },
      [byName('רועי מזרחי')]:  { time: '06:00', status: 'confirmed', locationId: '', note: 'פריקת תאורה' },
      [byName('דנה אבירם')]:   { time: '06:00', status: 'onset',     locationId: '', note: '' },
      [byName('מאיה רון')]:    { time: '',      status: 'confirmed', locationId: '', note: '' },
      [byName('תמר אלון')]:    { time: '',      status: 'out',       locationId: '', note: 'מחלה — מחפשים מחליף' },
    },
    catering: { crew: 24, actors: 6, extras: 30, orderedBreakfast: 40, orderedLunch: 62, ateBreakfast: 38, ateLunch: 58 },
    vehicles: {
      truck:         { driverId: byName('אבי כהן'), plate: '12-345-67', note: 'תאורה + גריפ' },
      prod_camera:   { driverId: byName('עידו שרון'), plate: '88-221-04', note: 'ציוד מצלמה' },
      camp:          { driverId: '', plate: '', note: '' },
    },
    notes: 'מזג אוויר: 31° בהיר. לוודא מים קרים לכל הצוות לאורך היום.',
  });

  const upcoming = newDay({
    date: iso(2),
    title: 'יום 5 — חוץ, זריחה',
    locationId: locations[1].id,
    generalCall: '05:00', shootingCall: '06:15', wrap: '17:00',
    slots: {
      pa_snr_1: byName('דנה אבירם'),
      cam_1:    byName('אורי גלעד'),
      sound:    byName('נועם קפלן'),
      gaffer:   byName('רועי מזרחי'),
    },
    notes: 'זריחה ב־06:12. אין מרווח לאיחור.',
  });

  const state = getState();
  replaceState({
    ...state,
    people, locations,
    days: [today, upcoming],
    settings: { ...state.settings, productionName: 'סדרת דרמה — עונה 2' },
  });
}
