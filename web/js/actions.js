/**
 * actions.js — One-tap outbound actions: call, WhatsApp, SMS, navigate.
 *
 * Israeli numbers arrive in many shapes (050-123-4567, +972 50 1234567,
 * 0501234567). Everything is normalised to E.164 for WhatsApp, and left as
 * dialled for tel: which the phone handles fine either way.
 */

import { toast, haptic } from './ui.js';
import { settings } from './store.js';

const IL_CC = '972';

/** Digits only, no separators. */
export function digits(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

/** "0501234567" -> "972501234567". Already-international numbers pass through. */
export function toE164(phone) {
  let d = digits(phone);
  if (!d) return '';
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith(IL_CC)) return d;
  if (d.startsWith('0')) return IL_CC + d.slice(1);
  return d;
}

/** Pretty Hebrew-friendly display: 050-123-4567 */
export function formatPhone(phone) {
  const d = digits(phone).replace(/^\+?972/, '0');
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return phone || '';
}

export const hasPhone = (p) => digits(p?.phone).length >= 7;

/**
 * Hand a URL to the OS.
 *
 * Uses a synthesised anchor rather than `location.href`: when the app is
 * running from the Home Screen (display: standalone), assigning location.href
 * for an external https URL — wa.me, waze.com, maps.apple.com — navigates
 * *inside* the standalone window, which has no back button and strands the
 * user. An anchor with target="_blank" hands off to Safari and leaves the app
 * where it was. Custom schemes (tel:, sms:) are handed over the same way.
 */
function go(url) {
  haptic(10);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  if (/^https?:/i.test(url)) a.target = '_blank';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function call(person) {
  if (!hasPhone(person)) return toast('אין מספר טלפון לאיש הקשר הזה');
  go(`tel:${digits(person.phone)}`);
}

export function sms(person, text = '') {
  if (!hasPhone(person)) return toast('אין מספר טלפון לאיש הקשר הזה');
  // iOS wants &body= ; using ?& covers both iOS and Android.
  go(`sms:${digits(person.phone)}${text ? `&body=${encodeURIComponent(text)}` : ''}`);
}

export function whatsapp(person, text = '') {
  if (!hasPhone(person)) return toast('אין מספר טלפון לאיש הקשר הזה');
  const n = toE164(person.phone);
  go(`https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`);
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

/** Preferred maps app, per settings. Waze is the default in Israel. */
export function navigate(location) {
  if (!location) return toast('לא הוגדר מיקום');
  const { lat, lng, address, name } = location;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const q = encodeURIComponent(address || name || '');
  if (!hasCoords && !q) return toast('למיקום הזה אין כתובת');

  const app = settings().navApp || 'waze';
  if (app === 'waze') {
    go(hasCoords ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`);
  } else if (app === 'google') {
    go(hasCoords ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                 : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
  } else {
    // Apple Maps
    go(hasCoords ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `https://maps.apple.com/?daddr=${q}&dirflg=d`);
  }
}

/** Open the location for viewing rather than turn-by-turn. */
export function showOnMap(location) {
  if (!location) return;
  const { lat, lng, address, name } = location;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const q = encodeURIComponent(address || name || '');
  go(hasCoords ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name || 'מיקום')}`
               : `https://maps.apple.com/?q=${q}`);
}

/* ------------------------------------------------------------------ *
 * Sharing
 * ------------------------------------------------------------------ */

export async function shareText(title, text) {
  haptic(10);
  if (navigator.share) {
    try { await navigator.share({ title, text }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('הועתק ללוח');
    return true;
  } catch {
    toast('לא ניתן לשתף במכשיר הזה');
    return false;
  }
}

/** Blast a day summary to the whole crew via WhatsApp (one chat at a time). */
export function whatsappBroadcast(person, text) {
  whatsapp(person, text);
}
