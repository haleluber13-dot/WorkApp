/* Data layer. The views only talk to `store`; underneath it is either the
   in-browser demo backend or Supabase (see config.js). Both return the same
   camelCase shapes:

   Request  {id, ownerId, title, description, categories[], audience, region, city,
             lat, lng, urgency, status, displayName, onBehalf, assignedOrg,
             assignedOrgName, createdAt, updatedAt, demo}
   Private  {requestId, fullName, phone, email, pref, notes}   — owner + claiming org only
   Org      {id, name, description, categories[], regions[], audiences[], phone,
             website, email, regNumber, verified, createdAt}
   Message  {id, requestId, senderId, senderName, senderRole, body, createdAt}
   Event    {id, requestId, actorName, kind, note, createdAt}
   Offer    {id, orgId, orgName, title, description, categories[], regions[],
             audiences[], expiresAt, createdAt}                                  */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { seedRequests, seedOffers, seedOrgs } from "./seed.js";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const now = () => new Date().toISOString();

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ───────────────────────── demo backend (localStorage) ───────────────────────── */

const DB_KEY = "katef:db:v1";
const SESSION_KEY = "katef:session";

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked: fall through to a fresh in-memory db */ }
  return {
    users: [], profiles: {}, orgs: seedOrgs(), requests: seedRequests(), private: {},
    messages: [], events: [], offers: seedOffers(), reports: [],
  };
}

class LocalBackend {
  mode = "demo";
  constructor() {
    this.db = loadDb();
    this.listeners = new Set();
    try { this.session = localStorage.getItem(SESSION_KEY); } catch { this.session = null; }
    this.save();
  }
  save() { try { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); } catch { /* ignore */ } }
  emit() { for (const fn of this.listeners) fn(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /* auth */
  async me() {
    if (!this.session) return null;
    const user = this.db.users.find((u) => u.id === this.session);
    if (!user) return null;
    const profile = this.db.profiles[user.id];
    return { user: { id: user.id, email: user.email }, profile, org: this.db.orgs.find((o) => o.id === user.id) || null };
  }
  async signUp({ email, password, role, displayName }) {
    email = email.trim().toLowerCase();
    if (this.db.users.some((u) => u.email === email)) throw new Error("כבר קיים חשבון עם האימייל הזה — אפשר להתחבר");
    const id = uid();
    this.db.users.push({ id, email, hash: await sha256(password) });
    this.db.profiles[id] = { id, role: role === "org" ? "org" : "person", displayName, email, createdAt: now() };
    this.setSession(id);
    this.save(); this.emit();
    return this.me();
  }
  async signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const u = this.db.users.find((x) => x.email === email);
    if (!u || u.hash !== (await sha256(password))) throw new Error("אימייל או סיסמה שגויים");
    this.setSession(u.id); this.emit();
    return this.me();
  }
  /* Demo only: one tap into a ready-made account so people can see both sides. */
  async demoLogin(kind) {
    const email = kind === "org" ? "demo-org@katef.local" : kind === "admin" ? "demo-admin@katef.local" : "demo-person@katef.local";
    let u = this.db.users.find((x) => x.email === email);
    if (!u) {
      const id = kind === "org" ? "demo-org" : uid();
      u = { id, email, hash: await sha256("demo") };
      this.db.users.push(u);
      this.db.profiles[id] = {
        id, role: kind, email, createdAt: now(),
        displayName: kind === "org" ? "עמותת ״יד ביד״ (לדוגמה)" : kind === "admin" ? "מנהל/ת המערכת" : "נועה",
      };
      if (kind === "org" && !this.db.orgs.some((o) => o.id === id)) {
        this.db.orgs.push({
          id, name: "עמותת ״יד ביד״ (לדוגמה)", description: "עמותה לדוגמה במצב הדגמה: סלי מזון, סיוע כלכלי וליווי למשפחות מילואימניקים במרכז ובדרום.",
          categories: ["food", "financial", "family", "social"], regions: ["center", "tlv", "south", "gaza_envelope"],
          audiences: ["reservist", "reservist_family", "evacuee", "general"], phone: "", website: "", email,
          regNumber: "580000000", verified: true, createdAt: now(),
        });
      }
      this.save();
    }
    this.setSession(u.id); this.emit();
    return this.me();
  }
  setSession(id) {
    this.session = id;
    try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
  async signOut() { this.setSession(null); this.emit(); }
  async updateProfile(patch) {
    const me = await this.me(); if (!me) throw new Error("יש להתחבר");
    Object.assign(this.db.profiles[me.user.id], patch); this.save(); this.emit();
  }

  /* requests */
  async listRequests() {
    const me = this.session;
    return this.db.requests.filter((r) => r.status !== "closed" || r.ownerId === me).map((r) => ({ ...r }));
  }
  async getRequest(id) { const r = this.db.requests.find((x) => x.id === id); return r ? { ...r } : null; }
  async createRequest(pub, priv) {
    const me = await this.me(); if (!me) throw new Error("יש להתחבר כדי לפרסם בקשה");
    const r = {
      id: uid(), ownerId: me.user.id, status: "open", assignedOrg: null, assignedOrgName: null,
      createdAt: now(), updatedAt: now(), demo: false, ...pub,
    };
    this.db.requests.unshift(r);
    this.db.private[r.id] = { requestId: r.id, ...priv };
    this.log(r.id, me.profile.displayName, "created", "");
    this.save(); this.emit();
    return { ...r };
  }
  async updateRequest(id, patch, priv) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || r.ownerId !== me.user.id) throw new Error("אין הרשאה");
    const allowed = ["title", "description", "categories", "audience", "region", "city", "lat", "lng", "urgency", "displayName", "onBehalf"];
    for (const k of allowed) if (k in patch) r[k] = patch[k];
    r.updatedAt = now();
    if (priv) this.db.private[id] = { ...(this.db.private[id] || { requestId: id }), ...priv };
    this.log(id, me.profile.displayName, "edited", "");
    this.save(); this.emit();
  }
  async getPrivate(id) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r) return null;
    if (r.ownerId !== me.user.id && r.assignedOrg !== me.user.id) return null;
    if (r.assignedOrg === me.user.id) {
      /* log each organization's access, at most once an hour */
      const recent = this.db.events.some((e) => e.requestId === id && e.kind === "contact_viewed" && Date.now() - Date.parse(e.createdAt) < 3600e3);
      if (!recent) this.log(id, me.org?.name || me.profile.displayName, "contact_viewed", "", true);
    }
    return this.db.private[id] ? { ...this.db.private[id] } : null;
  }
  orgCanAct(me) {
    if (!me || me.profile.role !== "org") throw new Error("רק עמותה מחוברת יכולה לבצע פעולה זו");
    if (!me.org?.verified) throw new Error("החשבון של העמותה עוד ממתין לאימות");
  }
  async takeRequest(id, staleDays) {
    const me = await this.me(); this.orgCanAct(me);
    const r = this.db.requests.find((x) => x.id === id);
    if (!r) throw new Error("הבקשה לא נמצאה");
    const stale = r.assignedOrg && Date.now() - Date.parse(r.updatedAt) > staleDays * 864e5;
    if (r.assignedOrg && r.assignedOrg !== me.user.id && !stale) throw new Error("עמותה אחרת כבר מטפלת בבקשה");
    if (!["open", "in_progress"].includes(r.status)) throw new Error("הבקשה כבר אינה פתוחה");
    r.assignedOrg = me.user.id; r.assignedOrgName = me.org.name; r.status = "in_progress"; r.updatedAt = now();
    this.log(id, me.org.name, "taken", stale ? "הבקשה הועברה אחרי שלא עודכנה זמן רב" : "");
    this.save(); this.emit();
  }
  async releaseRequest(id, note, kind = "released") {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || r.assignedOrg !== me.user.id) throw new Error("אין הרשאה");
    r.assignedOrg = null; r.assignedOrgName = null; r.status = "open"; r.updatedAt = now();
    this.log(id, me.org?.name || me.profile.displayName, kind, note || "");
    this.save(); this.emit();
  }
  async setStatus(id, status, note) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || (r.ownerId !== me.user.id && r.assignedOrg !== me.user.id)) throw new Error("אין הרשאה");
    r.status = status; r.updatedAt = now();
    if (status === "open" && r.ownerId === me.user.id) { r.assignedOrg = null; r.assignedOrgName = null; }
    this.log(id, r.assignedOrg === me.user.id ? me.org?.name : me.profile.displayName, "status:" + status, note || "");
    this.save(); this.emit();
  }
  async touchRequest(id) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || (r.ownerId !== me.user.id && r.assignedOrg !== me.user.id)) throw new Error("אין הרשאה");
    r.updatedAt = now();
    this.log(id, r.ownerId === me.user.id ? me.profile.displayName : me.org?.name, "still_relevant", "");
    this.save(); this.emit();
  }
  async deleteRequest(id) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || r.ownerId !== me.user.id) throw new Error("אין הרשאה");
    this.db.requests = this.db.requests.filter((x) => x.id !== id);
    delete this.db.private[id];
    this.db.messages = this.db.messages.filter((m) => m.requestId !== id);
    this.db.events = this.db.events.filter((e) => e.requestId !== id);
    this.save(); this.emit();
  }
  log(requestId, actorName, kind, note, silent) {
    this.db.events.push({ id: uid(), requestId, actorName, kind, note, createdAt: now() });
    if (silent) this.save();
  }
  async listEvents(id) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    const insider = me && r && (r.ownerId === me.user.id || r.assignedOrg === me.user.id);
    return this.db.events.filter((e) => e.requestId === id && (insider || e.kind !== "contact_viewed"));
  }

  /* messages: between the requester and the organization handling the request */
  async listMessages(id) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || (r.ownerId !== me.user.id && r.assignedOrg !== me.user.id)) return [];
    return this.db.messages.filter((m) => m.requestId === id);
  }
  async sendMessage(id, body) {
    const me = await this.me(); const r = this.db.requests.find((x) => x.id === id);
    if (!me || !r || (r.ownerId !== me.user.id && r.assignedOrg !== me.user.id)) throw new Error("אין הרשאה");
    const isOrg = r.assignedOrg === me.user.id;
    this.db.messages.push({
      id: uid(), requestId: id, senderId: me.user.id, senderRole: isOrg ? "org" : "person",
      senderName: isOrg ? me.org.name : me.profile.displayName, body, createdAt: now(),
    });
    r.updatedAt = now();
    this.save(); this.emit();
  }

  /* organizations registered on the platform */
  async listOrgs() { return this.db.orgs.map((o) => ({ ...o })); }
  async saveOrg(data) {
    const me = await this.me();
    if (!me || me.profile.role !== "org") throw new Error("רק חשבון עמותה יכול לערוך פרופיל עמותה");
    const existing = this.db.orgs.find((o) => o.id === me.user.id);
    if (existing) Object.assign(existing, data, { id: me.user.id, verified: existing.verified });
    /* Demo mode verifies new orgs immediately so you can try the full flow;
       in live mode an admin verifies each organization. */
    else this.db.orgs.push({ ...data, id: me.user.id, verified: true, createdAt: now() });
    this.save(); this.emit();
  }

  /* offers: an organization announcing help it has available */
  async listOffers() { return this.db.offers.filter((o) => !o.expiresAt || Date.parse(o.expiresAt) > Date.now()); }
  async createOffer(o) {
    const me = await this.me(); this.orgCanAct(me);
    this.db.offers.unshift({ ...o, id: uid(), orgId: me.user.id, orgName: me.org.name, createdAt: now() });
    this.save(); this.emit();
  }
  async deleteOffer(id) {
    const me = await this.me();
    this.db.offers = this.db.offers.filter((o) => !(o.id === id && o.orgId === me?.user.id));
    this.save(); this.emit();
  }

  /* reports & admin */
  async report(targetType, targetId, reason) {
    const me = await this.me();
    this.db.reports.push({ id: uid(), targetType, targetId, reason, reporterId: me?.user.id || null, createdAt: now() });
    this.save();
  }
  async isAdmin() { const me = await this.me(); return me?.profile.role === "admin"; }
  async listReports() { return [...this.db.reports].reverse(); }
  async setOrgVerified(id, verified) {
    if (!(await this.isAdmin())) throw new Error("אין הרשאה");
    const o = this.db.orgs.find((x) => x.id === id); if (o) o.verified = verified;
    this.save(); this.emit();
  }
  async adminCloseRequest(id) {
    if (!(await this.isAdmin())) throw new Error("אין הרשאה");
    const r = this.db.requests.find((x) => x.id === id); if (r) { r.status = "closed"; r.updatedAt = now(); }
    this.save(); this.emit();
  }
  async resetDemo() {
    try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    location.reload();
  }
}

/* ───────────────────────── live backend (Supabase) ───────────────────────── */

const toCamel = (row) => {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
};
const toSnake = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())] = v;
  return out;
};
const check = ({ data, error }) => {
  if (error) throw new Error(translateError(error.message));
  return data;
};
function translateError(msg) {
  if (/Invalid login/i.test(msg)) return "אימייל או סיסמה שגויים";
  if (/already registered/i.test(msg)) return "כבר קיים חשבון עם האימייל הזה — אפשר להתחבר";
  if (/Email not confirmed/i.test(msg)) return "יש לאשר את האימייל דרך הקישור שנשלח אליך";
  if (/row-level security|permission denied/i.test(msg)) return "אין הרשאה לפעולה הזו";
  return msg;
}

class SupabaseBackend {
  mode = "live";
  constructor(client) {
    this.sb = client;
    this.listeners = new Set();
    this.cache = null;
    client.auth.onAuthStateChange(() => { this.cache = null; this.emit(); });
  }
  emit() { for (const fn of this.listeners) fn(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async me() {
    if (this.cache) return this.cache;
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const profile = toCamel(check(await this.sb.from("profiles").select("*").eq("id", user.id).maybeSingle()));
    const org = toCamel(check(await this.sb.from("organizations").select("*").eq("id", user.id).maybeSingle()));
    this.cache = { user: { id: user.id, email: user.email }, profile: profile || { id: user.id, role: "person", displayName: user.email }, org };
    return this.cache;
  }
  async signUp({ email, password, role, displayName }) {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: { data: { role, display_name: displayName }, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw new Error(translateError(error.message));
    if (!data.session) return { needsConfirm: true };
    this.cache = null;
    return this.me();
  }
  async signIn({ email, password }) {
    check(await this.sb.auth.signInWithPassword({ email, password }));
    this.cache = null;
    return this.me();
  }
  async demoLogin() { throw new Error("לא זמין במצב חי"); }
  async signOut() { await this.sb.auth.signOut(); this.cache = null; this.emit(); }
  async updateProfile(patch) {
    const me = await this.me();
    check(await this.sb.from("profiles").update(toSnake({ displayName: patch.displayName })).eq("id", me.user.id));
    this.cache = null; this.emit();
  }

  async listRequests() {
    return check(await this.sb.from("requests").select("*").order("created_at", { ascending: false }).limit(2000)).map(toCamel);
  }
  async getRequest(id) { return toCamel(check(await this.sb.from("requests").select("*").eq("id", id).maybeSingle())); }
  async createRequest(pub, priv) {
    const me = await this.me(); if (!me) throw new Error("יש להתחבר כדי לפרסם בקשה");
    const r = toCamel(check(await this.sb.from("requests").insert(toSnake({ ...pub, ownerId: me.user.id })).select().single()));
    check(await this.sb.from("request_private").insert(toSnake({ ...priv, requestId: r.id })));
    this.emit();
    return r;
  }
  async updateRequest(id, patch, priv) {
    const allowed = ["title", "description", "categories", "audience", "region", "city", "lat", "lng", "urgency", "displayName", "onBehalf"];
    const row = {}; for (const k of allowed) if (k in patch) row[k] = patch[k];
    check(await this.sb.from("requests").update(toSnake(row)).eq("id", id));
    if (priv) check(await this.sb.from("request_private").update(toSnake(priv)).eq("request_id", id));
    this.emit();
  }
  async getPrivate(id) {
    const data = check(await this.sb.rpc("get_request_private", { req_id: id }));
    const row = Array.isArray(data) ? data[0] : data;
    return row ? toCamel(row) : null;
  }
  async takeRequest(id) { check(await this.sb.rpc("take_request", { req_id: id })); this.emit(); }
  async releaseRequest(id, note, kind = "released") { check(await this.sb.rpc("release_request", { req_id: id, note: note || "", kind })); this.emit(); }
  async setStatus(id, status, note) { check(await this.sb.rpc("set_request_status", { req_id: id, new_status: status, note: note || "" })); this.emit(); }
  async touchRequest(id) { check(await this.sb.rpc("touch_request", { req_id: id })); this.emit(); }
  async deleteRequest(id) { check(await this.sb.from("requests").delete().eq("id", id)); this.emit(); }
  async listEvents(id) {
    return check(await this.sb.from("request_events").select("*").eq("request_id", id).order("created_at")).map(toCamel);
  }
  async listMessages(id) {
    return check(await this.sb.from("messages").select("*").eq("request_id", id).order("created_at")).map(toCamel);
  }
  async sendMessage(id, body) { check(await this.sb.rpc("send_message", { req_id: id, body })); this.emit(); }

  async listOrgs() { return check(await this.sb.from("organizations").select("*").order("name")).map(toCamel); }
  async saveOrg(data) {
    const me = await this.me();
    const row = toSnake({ ...data, id: me.user.id });
    delete row.verified; delete row.created_at;
    check(await this.sb.from("organizations").upsert(row));
    this.cache = null; this.emit();
  }
  async listOffers() {
    return check(await this.sb.from("offers").select("*").or(`expires_at.is.null,expires_at.gt."${now()}"`).order("created_at", { ascending: false })).map(toCamel);
  }
  async createOffer(o) {
    const me = await this.me();
    check(await this.sb.from("offers").insert(toSnake({ ...o, orgId: me.user.id, orgName: me.org?.name })));
    this.emit();
  }
  async deleteOffer(id) { check(await this.sb.from("offers").delete().eq("id", id)); this.emit(); }

  async report(targetType, targetId, reason) {
    check(await this.sb.from("reports").insert(toSnake({ targetType, targetId: String(targetId), reason })));
  }
  async isAdmin() { const me = await this.me(); return me?.profile.role === "admin"; }
  async listReports() { return check(await this.sb.from("reports").select("*").order("created_at", { ascending: false })).map(toCamel); }
  async setOrgVerified(id, verified) { check(await this.sb.from("organizations").update({ verified }).eq("id", id)); this.emit(); }
  async adminCloseRequest(id) { check(await this.sb.rpc("set_request_status", { req_id: id, new_status: "closed", note: "נסגר ע״י מנהל" })); this.emit(); }
  async resetDemo() {}
}

/* ───────────────────────── pick one ───────────────────────── */

async function create() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
      return new SupabaseBackend(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    } catch (e) {
      console.error("Supabase failed to load, falling back to demo mode", e);
    }
  }
  return new LocalBackend();
}

export const store = await create();
