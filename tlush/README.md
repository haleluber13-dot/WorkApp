# 💸 תלוש כיס — Pocket Payslip

A single-file Hebrew (RTL) web app for hourly workers: log shifts, get the wage
Israeli law actually owes you, track expenses, and see what's left at the end of
the month. **No install, no account, no server** — open the page, tap
*Share → Add to Home Screen*, and it behaves like a native app. Everything is
stored in `localStorage` on the device and never leaves it.

Live page: **`/tlush/`** on this site.

## What it does

- **Punch clock** — one tap on the way in, one on the way out. Survives a reload
  or the phone locking; punching out writes the shift for you.
- **Wage by the book** — 100% up to 8h, 125% for hours 9–10, 150% from hour 11,
  and Shabbat/holiday shifts at 150% base (so Shabbat overtime lands on the legal
  175% / 200%, since the premiums add). Overtime can be switched off.
- **Per-shift extras** — travel allowance, tips/bonus, break minutes, per-shift
  rate (a raise doesn't rewrite old shifts), free-text note, overnight shifts.
- **Expenses** by category, with month-over-month movement per category.
- **Monthly payslip view** — hours, base, overtime premium, Shabbat premium,
  travel, tips, gross, optional estimated deductions, expenses, and what's left.
- **Month navigation** across every screen; a monthly income goal that reports
  how many hours are still missing.
- **Edit anything** by tapping a row; delete has a 7-second undo.
- **Backup / restore** as a JSON blob you can paste into notes or a chat.
- **Offline** via a service worker; light and dark themes plus a manual toggle.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app — markup, CSS tokens, and logic in one file. |
| `manifest.webmanifest` | Home-screen name, icons, standalone display. |
| `sw.js` | Network-first shell cache so it opens with no signal. |
| `icon.svg`, `icon-*.png` | App icon (payslip on tractor-feed paper). |

## Notes

- Deductions are a flat percentage you enter — a rough estimate, not a tax
  calculation. The gross figures are the ones to compare against a real payslip.
- Shift math lives in `shiftHours()` and `payOf()`; the rate multiplier and the
  overtime premiums are additive, which is what makes Shabbat overtime come out
  right.
