# Manager of Champions

A fast, text-first football management game in the spirit of the classic
late-90s/early-2000s management sims, set in the 2026-27 season.

See [`PLAN.md`](PLAN.md) for the full plan and [`docs/decisions.md`](docs/decisions.md)
for technical decisions.

## Status

Phases 0–2 are done, the Phase 3 screens have a first version, and the real Premier League
(Phase 6) has been brought forward:

- **Premier League 2026-27** with real squads and the real fixture list, plus the Championship
  running in the background for promotion, relegation and play-offs
- A made-up demo world (Albion) for testing
- Continue loop, inbox, squad, player, club, fixtures and league screens
- Autosave in the browser, plus downloadable save files

Matches are decided by a quick strength-based simulation for now. The text match engine
with commentary comes next.

## Real-player data (personal use only)

The real Premier League pack is built locally from Fantasy Premier League and openfootball data
and is not stored in git (see `docs/decisions.md` #006):

```sh
npm run data:england               # build data/packs/england-2026-27.json + review report
npm run data:england -- --refresh  # download fresh data first
```

The review report (`data/reports/england-2026-27-ratings.md`) lists every rating. Corrections go
in `packages/pipeline/src/england/overrides.ts`.

## Running it

Needs Node 22.18 or newer.

```sh
npm install
npm run dev        # play in the browser at http://localhost:5173
npm test           # unit tests
npm run calibrate  # simulate 40 seasons and check results look like real football
                   # (add -- --pack data/packs/england-2026-27.json for the real league)
npm run check      # typecheck + tests + calibration (what CI runs)
npm run build      # production build in apps/web/dist
```

Keys: **Space** = Continue, **Alt+←/→** = back/forward.
