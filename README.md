# Manager of Champions

A fast, text-first football management game in the spirit of the classic
late-90s/early-2000s management sims, set in the 2026-27 season.

See [`PLAN.md`](PLAN.md) for the full plan and [`docs/decisions.md`](docs/decisions.md)
for technical decisions.

## Status

Phases 0–2 are done, plus a first version of the Phase 3 screens:

- A made-up demo world (Albion): a playable Premier Division and a background First Division
- Full seasons with fixtures, league tables, results, scorers and promotion/relegation
- Continue loop, inbox, squad, player, club, fixtures and league screens
- Autosave in the browser, plus downloadable save files

Matches are decided by a quick strength-based simulation for now. The text match engine
with commentary comes in Phase 4, and real 2026-27 players in Phase 6.

## Running it

Needs Node 22.18 or newer.

```sh
npm install
npm run dev        # play in the browser at http://localhost:5173
npm test           # unit tests
npm run calibrate  # simulate 40 seasons and check results look like real football
npm run check      # typecheck + tests + calibration (what CI runs)
npm run build      # production build in apps/web/dist
```

Keys: **Space** = Continue, **Alt+←/→** = back/forward.
