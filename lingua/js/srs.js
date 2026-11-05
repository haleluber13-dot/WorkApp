/* Spaced repetition (SM-2 variant with four grades). Cards: { due, iv (days), ef, n, lapses } */
const DAY = 86400000;
export const GRADE = { again: 0, hard: 1, good: 2, easy: 3 };

export function newCard(extra = {}) { return { due: Date.now(), iv: 0, ef: 2.5, n: 0, lapses: 0, ...extra }; }

export function schedule(card, grade, now = Date.now()) {
  const c = { ...card };
  if (grade === GRADE.again) {
    c.n = 0; c.lapses = (c.lapses || 0) + 1; c.iv = 0;
    c.ef = Math.max(1.3, c.ef - 0.2);
    c.due = now + 10 * 60000;                       // see it again in ten minutes
    return c;
  }
  if (c.n === 0) c.iv = grade === GRADE.easy ? 4 : grade === GRADE.good ? 1 : 0.5;
  else if (c.n === 1) c.iv = grade === GRADE.easy ? 7 : grade === GRADE.good ? 3 : 1.5;
  else c.iv = Math.max(c.iv + 0.5, c.iv * (grade === GRADE.hard ? 1.2 : grade === GRADE.good ? c.ef : c.ef * 1.3));
  c.ef = Math.max(1.3, Math.min(3, c.ef + (grade === GRADE.easy ? 0.15 : grade === GRADE.good ? 0 : -0.15)));
  c.n += 1;
  c.iv = Math.min(c.iv, 365);
  c.due = now + c.iv * DAY;
  return c;
}

export const isDue = (card, now = Date.now()) => card.due <= now;
/* strength 0..1 — how well the card is known (for progress displays) */
export const strength = (card) => (card.n === 0 ? 0 : Math.min(1, Math.log2(1 + card.iv) / Math.log2(1 + 60)));
export const isMastered = (card) => card.iv >= 21;
