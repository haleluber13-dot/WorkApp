# 🌊 Ombak — Work, Time & Money

*Ombak* is Indonesian for **wave**. It is a small, offline-first app for people who are
**paid by the day, not by the hour** — and who need to know, at a glance, what a month
of work is actually worth.

Built around a real film-and-drama day-rate agreement: the day rate buys a fixed number
of hours, and everything past that climbs a ladder of multipliers, with separate premiums
for night work, short rest between days, travel and late meals.

---

## What it does

**Time**
- A big **Start work / Stop** button with a live timer and the money climbing as you go.
- Log a day with a start and an end. Shifts that run past midnight are handled properly.
- Step to **any date** from inside the day editor to fill in a day you missed.
- A 24-hour **timeline** of every day in the month — bars across the clock, night hours
  shaded, overtime in coral.
- Calendar heat grid, a plain day-by-day list, and a **Months** view of every month you have worked.
- Tap any month header to open a **year at a glance** and jump straight to a month.
- **Clock in / clock out** with a live timer and earnings ticking up.

**Money in**
- Three day rates per job; pick which one applies each day.
- Overtime, night premium, weekly-quota overage, short turnaround, weekend rest,
  travel rings, meal penalties and free-form adjustments — all calculated.
- Rest days pay a multiple; the rest-day eve is a shorter paid day with its own rules.
- Monthly goal with progress, six-month and full-year trends.

**Money out**
- Expenses by category, marked billable or personal.
- Burn rate, tax set-aside, and what you actually **keep**.

**Jobs**
- Unlimited jobs, each with its own rates, colour, role, company and run of dates.
- **Book days ahead** in blocks — a pipeline figure for work not yet done.
- Booked days that pass without being logged get flagged, so you never forget to bill one.

**Getting paid**
- A printable invoice per month, with VAT.
- Track what is expected, invoiced and paid, and what is still owed.
- CSV export per month, expenses CSV, and a full JSON backup.

---

## The pay rules

Everything is derived from the day rate. Your hourly figure is `day rate ÷ day quota`.

| Band | Pays |
|---|---|
| Up to the day quota (10h30, or 9h on a rest-day eve) | the day rate |
| Quota → hour 12 | 1.5× hourly |
| Hour 12 → 13 | 2× hourly |
| Past hour 13 | 2.5× for the 14th hour, **+0.5× for every hour after** |

On top of that:

- **Night hours** (22:00–05:00) add 20% of the hourly rate per hour.
- **Short turnaround** — less than 11h rest between two work days — is charged on a
  rising scale (`1× · 1.25× · 1.5× · 2.5× · 5×` per hour of shortfall).
- **Weekend rest** below 48h (or 55h after a long weekend) is charged at 2× hourly.
- **Over 60h in a week** adds an overage charge that steepens in 5-hour steps.
- **Rest days** pay 2× the day rate; a rest-day eve pays 1.2× if you worked the whole
  week before it.
- **Travel rings** pay a per-leg fee and buy extra rest before the turnaround clock starts.
- **Meals**: skipped breakfast is a quarter hour; late meals count as worked time;
  meals cut short count double.

Every threshold and multiplier above is editable in **Settings** — nothing is baked in.
Your **day rate sits at the top of Settings**, as a single big number with quick presets,
showing live what it works out to per hour, per overtime hour and per rest day.

### Verified against two real months

`tests/pay.test.ts` reproduces two independently filled months of real timesheet
data, day by day:

- **at a ₪900 day rate** — 16 days, ₪14,400 in day rates, ₪9,492.86 of overtime,
  ₪3,203.57 of premiums, **₪27,096.43** before VAT;
- **at a ₪950 day rate** — 17 days, every overtime figure matching, **₪6,288.10**
  of overtime.

Two different rates, same engine, no hard-coded numbers. Run them with:

```bash
npm test
```

---

## On Android

The project is wrapped with [Capacitor](https://capacitorjs.com), so the same
code ships as a native Android app.

```bash
npm run build          # build the web app
npx cap sync android   # copy it into the Android project
npm run apk            # assemble a debug APK
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to
a phone and open it — Android will ask you to allow installing from this source.
Launcher and splash artwork are generated from `public/icon.svg`:

```bash
npm run icons          # re-render assets/ from the SVG
npx capacitor-assets generate --android --assetPath assets
```

## Running it

```bash
npm install
npm run dev      # development server
npm run build    # production build into dist/
npm run preview  # serve the production build
npm test         # pay-engine tests
```

The build is fully static and uses relative paths, so `dist/` can be dropped on
GitHub Pages, Netlify, or any static host.

## On your phone

Open the deployed URL and use **Add to Home Screen**. It installs as a standalone app,
works with no signal, and keeps everything on the device.

## Where your data lives

In this browser's `localStorage`. Nothing is uploaded anywhere, there is no account and
no server. **Back up from Settings** before clearing browser data or switching phones —
the backup is a single JSON file you can restore from the same screen.

## Built with

React 19, TypeScript and Vite. No UI framework, no chart library, no icon package —
the design system, the SVG icons and every chart are hand-rolled, so the whole bundle
is about 86 kB gzipped.
