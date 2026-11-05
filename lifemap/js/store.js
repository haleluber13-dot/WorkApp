// Persistent state (localStorage). Everything lives on the device — no accounts, no servers.
(function () {
  const KEY = "lifemap.v1";
  const today = () => new Date().toISOString().slice(0, 10);

  const defaults = () => ({
    children: [],          // {id, name, age, avatar, created}
    activeChild: null,
    progress: {},          // childId -> progress()
    settings: { tts: true, disabledTopics: [], parentGate: true, bigText: false },
  });
  const progress = () => ({
    done: {},              // cardId -> {count, last}
    favs: [],
    seen: [],              // recently shown card ids (rolling)
    stars: 0,
    streak: { last: null, count: 0, best: 0 },
    daily: null,           // {date, ids:[], done:[]}
    badges: [],            // badge ids
    log: [],               // [{at, cardId, topic, level}] newest first (capped)
  });

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const s = Object.assign(defaults(), JSON.parse(raw));
      s.settings = Object.assign(defaults().settings, s.settings || {});
      return s;
    } catch { return defaults(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

  const uid = () => Math.random().toString(36).slice(2, 9);

  const Store = {
    get state() { return state; },
    save,
    today,
    // ---- children ----
    children() { return state.children; },
    child() { return state.children.find((c) => c.id === state.activeChild) || null; },
    setActive(id) { state.activeChild = id; save(); },
    addChild({ name, age, avatar }) {
      const c = { id: uid(), name: name.trim(), age: +age, avatar: avatar || "🙂", created: Date.now() };
      state.children.push(c);
      state.progress[c.id] = progress();
      state.activeChild = c.id;
      save();
      return c;
    },
    updateChild(id, patch) {
      const c = state.children.find((x) => x.id === id);
      if (c) Object.assign(c, patch, { age: +(patch.age ?? c.age) });
      save();
    },
    removeChild(id) {
      state.children = state.children.filter((c) => c.id !== id);
      delete state.progress[id];
      if (state.activeChild === id) state.activeChild = state.children[0]?.id || null;
      save();
    },
    // ---- progress ----
    prog(id = state.activeChild) {
      if (!id) return progress();
      if (!state.progress[id]) state.progress[id] = progress();
      const p = state.progress[id];
      // forward-compat for fields added later
      for (const [k, v] of Object.entries(progress())) if (p[k] === undefined) p[k] = v;
      return p;
    },
    markSeen(cardId) {
      const p = this.prog();
      p.seen = p.seen.filter((x) => x !== cardId);
      p.seen.push(cardId);
      if (p.seen.length > 400) p.seen = p.seen.slice(-400);
      save();
    },
    markDone(card, stars) {
      const p = this.prog();
      const d = p.done[card.id] || { count: 0, last: null };
      const first = d.count === 0;
      d.count++; d.last = Date.now();
      p.done[card.id] = d;
      p.stars += stars;
      p.log.unshift({ at: Date.now(), cardId: card.id, topic: card.topic, level: card.level, title: card.title });
      if (p.log.length > 500) p.log.length = 500;
      // streak
      const t = today();
      if (p.streak.last !== t) {
        const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        p.streak.count = p.streak.last === y ? p.streak.count + 1 : 1;
        p.streak.last = t;
        p.streak.best = Math.max(p.streak.best, p.streak.count);
      }
      if (p.daily && p.daily.date === t && p.daily.ids.includes(card.id) && !p.daily.done.includes(card.id)) p.daily.done.push(card.id);
      save();
      return first;
    },
    toggleFav(cardId) {
      const p = this.prog();
      const i = p.favs.indexOf(cardId);
      if (i >= 0) p.favs.splice(i, 1); else p.favs.unshift(cardId);
      save();
      return i < 0;
    },
    isFav(cardId) { return this.prog().favs.includes(cardId); },
    setDaily(ids) { const p = this.prog(); p.daily = { date: today(), ids, done: [] }; save(); return p.daily; },
    addBadge(id) { const p = this.prog(); if (p.badges.includes(id)) return false; p.badges.push(id); save(); return true; },
    resetChild(id) { state.progress[id] = progress(); save(); },
    // ---- settings ----
    setting(k, v) { if (v === undefined) return state.settings[k]; state.settings[k] = v; save(); },
    // ---- backup ----
    exportJSON() { return JSON.stringify(state, null, 2); },
    importJSON(text) {
      const s = JSON.parse(text);
      if (!s || !Array.isArray(s.children)) throw new Error("bad file");
      state = Object.assign(defaults(), s);
      save();
    },
    wipe() { state = defaults(); save(); },
  };
  window.Store = Store;
})();
