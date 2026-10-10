/* Small DOM helpers shared by the views. */
import { CAT, URG, STAT, regionLabel, AUD } from "./taxonomy.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Only http(s) links are ever rendered as hrefs. */
export const safeUrl = (u) => {
  if (!u) return "";
  const s = /^https?:\/\//i.test(u) ? u : "https://" + u;
  try { const p = new URL(s); return p.protocol === "https:" || p.protocol === "http:" ? p.href : ""; } catch { return ""; }
};

export function telHref(phone) {
  const digits = String(phone).replace(/[^\d*+#]/g, "");
  return digits ? "tel:" + digits : "";
}
/* Israeli numbers → wa.me international form. */
export function waHref(phone, text = "") {
  let d = String(phone).replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return "https://wa.me/" + d + (text ? "?text=" + encodeURIComponent(text) : "");
}

export function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) { const h = Math.floor(s / 3600); return h === 1 ? "לפני שעה" : `לפני ${h} שעות`; }
  const d = Math.floor(s / 86400);
  if (d === 1) return "אתמול";
  if (d < 30) return `לפני ${d} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

export const catChips = (keys = []) =>
  keys.map((k) => `<span class="chip">${CAT[k] ? CAT[k].icon + " " + esc(CAT[k].label) : esc(k)}</span>`).join("");

export const urgencyBadge = (k) => `<span class="badge urg-${esc(k)}">${esc(URG[k]?.label || k)}</span>`;
export const statusBadge = (k) => `<span class="badge st-${esc(k)}">${esc(STAT[k]?.label || k)}</span>`;
export const regionText = (keys = []) => keys.map(regionLabel).join(" · ");
export const audText = (k) => (AUD[k] ? `${AUD[k].icon} ${esc(AUD[k].label)}` : "");

export function toast(msg, kind = "") {
  let box = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.setAttribute("role", "status");
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 3200);
  setTimeout(() => t.remove(), 3700);
}

/* Promise-based modal. `body` is HTML; resolves with the form's data, or null if dismissed. */
export function modal({ title, body, ok = "אישור", cancel = "ביטול", danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        <div class="modal-body">${body || ""}</div>
        <div class="row end">
          ${cancel ? `<button type="button" class="btn ghost" data-x>${esc(cancel)}</button>` : ""}
          <button class="btn ${danger ? "danger" : "primary"}">${esc(ok)}</button>
        </div>
      </form>`;
    document.body.appendChild(wrap);
    const form = $("form", wrap);
    const done = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-x]")) done(null); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      done(Object.fromEntries(new FormData(form)));
    });
    (form.querySelector("input,textarea,select") || form.querySelector(".btn.primary,.btn.danger"))?.focus();
  });
}

export const confirmBox = (title, text, ok = "כן", danger = false) =>
  modal({ title, body: `<p>${esc(text)}</p>`, ok, danger }).then((v) => v !== null);

/* Multi-select chip picker. Returns HTML; read with pickedValues(name, root). */
export function chipPicker(name, options, selected = [], { single = false } = {}) {
  return `<div class="picker" role="group">${options
    .map((o) => `<label class="pick"><input type="${single ? "radio" : "checkbox"}" name="${esc(name)}" value="${esc(o.key)}" ${selected.includes(o.key) ? "checked" : ""}><span>${o.icon ? o.icon + " " : ""}${esc(o.label)}</span></label>`)
    .join("")}</div>`;
}
export const pickedValues = (name, root = document) => $$(`input[name="${name}"]:checked`, root).map((i) => i.value);

/* Warn when free text that will be public looks like it holds a phone number, ID or email. */
export function piiWarning(text) {
  const t = String(text);
  if (/(?:\+?972|0)[\s-]?(?:[23489]|5\d|7\d)[\s-]?\d{3}[\s-]?\d{4}/.test(t)) return "נראה שכתבת מספר טלפון. הטקסט הזה גלוי לכולם — את פרטי הקשר כתבו בשדות הפרטיים למטה.";
  if (/\b\d{9}\b/.test(t)) return "נראה שכתבת מספר תעודת זהות או מספר אישי. אל תפרסמו אותו בטקסט הגלוי.";
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return "נראה שכתבת כתובת אימייל. היא תהיה גלויה לכולם — עדיף בשדה הפרטי.";
  return "";
}

export function emptyState(icon, title, text = "", action = "") {
  return `<div class="empty"><div class="empty-ico">${icon}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${action}</div>`;
}
