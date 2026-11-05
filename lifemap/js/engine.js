// Card engine: indexes all content, picks age-appropriate random cards, builds daily plans, awards badges.
(function () {
  const TOPICS = window.LIFEMAP_TOPICS, BANDS = window.LIFEMAP_BANDS, LEVELS = window.LIFEMAP_LEVELS;
  const STARS = { easy: 1, medium: 2, hard: 3 };

  // Stable id from topic + title (survives reordering of the content files)
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  const all = [];
  const byId = new Map();
  const byTopic = {};
  for (const t of TOPICS) {
    const list = (window.LIFEMAP_CARDS && window.LIFEMAP_CARDS[t.id]) || [];
    byTopic[t.id] = [];
    list.forEach((raw, i) => {
      const card = Object.assign({}, raw, { topic: t.id, id: `${t.id}-${hash(raw.title)}` });
      card.band = bandForAges(card.ages);
      all.push(card); byTopic[t.id].push(card); byId.set(card.id, card);
    });
  }

  function bandForAges(ages) { return BANDS.find((b) => ages && b.ages[0] === ages[0] && b.ages[1] === ages[1]) || null; }
  function bandForAge(age) { return BANDS.find((b) => age >= b.ages[0] && age <= b.ages[1]) || (age < 2 ? BANDS[0] : BANDS[BANDS.length - 1]); }
  function neighborBands(band) {
    const i = BANDS.indexOf(band);
    return [BANDS[i + 1], BANDS[i - 1]].filter(Boolean);
  }

  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Pool of cards for a topic/age/level. Falls back to neighbouring bands so a tile is never empty.
  function pool(topicId, age, level) {
    const band = bandForAge(age);
    const list = byTopic[topicId] || [];
    let out = list.filter((c) => c.band === band && (!level || c.level === level));
    if (out.length < 3) for (const nb of neighborBands(band)) out = out.concat(list.filter((c) => c.band === nb && (!level || c.level === level)));
    return out;
  }

  // Random pick that prefers cards never done, then not recently seen.
  function pick(topicId, age, level, opts = {}) {
    const prog = window.Store.prog();
    const candidates = pool(topicId, age, level).filter((c) => c.id !== opts.exclude);
    if (!candidates.length) return null;
    const unseen = candidates.filter((c) => !prog.done[c.id] && !prog.seen.includes(c.id));
    const notDone = candidates.filter((c) => !prog.done[c.id]);
    const notRecent = candidates.filter((c) => !prog.seen.slice(-30).includes(c.id));
    const from = unseen.length ? unseen : notDone.length ? notDone : notRecent.length ? notRecent : candidates;
    return from[Math.floor(Math.random() * from.length)];
  }

  function counts(topicId, age) {
    const out = {};
    for (const l of LEVELS) out[l.id] = pool(topicId, age, l.id).length;
    return out;
  }

  // Which topics has this child touched least? Used for daily plan & parent dashboard.
  function topicStats(age) {
    const prog = window.Store.prog();
    return TOPICS.map((t) => {
      const cards = byTopic[t.id];
      const forAge = cards.filter((c) => c.band === bandForAge(age));
      const done = cards.filter((c) => prog.done[c.id]);
      const doneForAge = forAge.filter((c) => prog.done[c.id]);
      const byLevel = {};
      for (const l of LEVELS) byLevel[l.id] = { total: forAge.filter((c) => c.level === l.id).length, done: doneForAge.filter((c) => c.level === l.id).length };
      const stars = done.reduce((s, c) => s + STARS[c.level] * prog.done[c.id].count, 0);
      return { topic: t, total: forAge.length, done: doneForAge.length, doneAll: done.length, byLevel, stars };
    });
  }

  // Daily plan: 5 cards, spread over the least-covered enabled topics, levels mixed (2 easy, 2 medium, 1 hard).
  function dailyPlan(age, n = 5) {
    const prog = window.Store.prog();
    const t = window.Store.today();
    if (prog.daily && prog.daily.date === t && prog.daily.ids.every((id) => byId.has(id))) return prog.daily;
    const disabled = new Set(window.Store.setting("disabledTopics") || []);
    const stats = topicStats(age).filter((s) => !disabled.has(s.topic.id) && s.total > 0);
    // least covered first, ties shuffled
    const ordered = shuffle(stats).sort((a, b) => (a.done / a.total) - (b.done / b.total));
    const levels = ["easy", "medium", "easy", "medium", "hard"];
    const ids = [];
    let i = 0;
    for (const s of ordered) {
      if (ids.length >= n) break;
      const c = pick(s.topic.id, age, levels[i % levels.length]) || pick(s.topic.id, age, null);
      if (c) { ids.push(c.id); i++; }
    }
    return window.Store.setDaily(ids);
  }

  // Badges
  const BADGES = [
    { id: "first",    emoji: "🌱", name: "צעד ראשון",      desc: "סיימתם את הכרטיסייה הראשונה", test: (p) => Object.keys(p.done).length >= 1 },
    { id: "ten",      emoji: "🔟", name: "עשר ביד",        desc: "10 כרטיסיות הושלמו", test: (p) => Object.keys(p.done).length >= 10 },
    { id: "fifty",    emoji: "🏅", name: "חמישים!",        desc: "50 כרטיסיות הושלמו", test: (p) => Object.keys(p.done).length >= 50 },
    { id: "hundred",  emoji: "🏆", name: "מאה כרטיסיות",   desc: "100 כרטיסיות הושלמו", test: (p) => Object.keys(p.done).length >= 100 },
    { id: "explorer", emoji: "🧭", name: "חוקרי עולם",     desc: "ביקרתם בכל 20 הנושאים", test: (p) => new Set(Object.keys(p.done).map((id) => byId.get(id)?.topic)).size >= 20 },
    { id: "brave",    emoji: "🦁", name: "אמיצים",         desc: "5 כרטיסיות מאתגרות (אדום)", test: (p) => Object.keys(p.done).filter((id) => byId.get(id)?.level === "hard").length >= 5 },
    { id: "streak3",  emoji: "🔥", name: "שלושה ימים ברצף", desc: "למדתם 3 ימים ברציפות", test: (p) => p.streak.best >= 3 },
    { id: "streak7",  emoji: "🌟", name: "שבוע שלם",       desc: "למדתם 7 ימים ברציפות", test: (p) => p.streak.best >= 7 },
    { id: "stars50",  emoji: "⭐", name: "50 כוכבים",      desc: "צברתם 50 כוכבים", test: (p) => p.stars >= 50 },
    { id: "stars200", emoji: "💫", name: "200 כוכבים",     desc: "צברתם 200 כוכבים", test: (p) => p.stars >= 200 },
    { id: "daily",    emoji: "📅", name: "יום מושלם",      desc: "סיימתם תוכנית יומית שלמה", test: (p) => p.daily && p.daily.ids.length && p.daily.done.length >= p.daily.ids.length },
  ];
  function newBadges() {
    const p = window.Store.prog();
    return BADGES.filter((b) => !p.badges.includes(b.id) && b.test(p)).filter((b) => window.Store.addBadge(b.id));
  }

  window.Engine = { all, byId, byTopic, pool, pick, counts, topicStats, dailyPlan, bandForAge, STARS, BADGES, newBadges, shuffle,
    topic: (id) => TOPICS.find((t) => t.id === id), card: (id) => byId.get(id) };
})();
