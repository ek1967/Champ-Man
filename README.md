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

- **Tactics and team selection**: seven formations, seven team instructions, nine substitutes,
  captain and set-piece takers
- **Text match engine** with live commentary, speed control, substitutions, in-match instructions,
  live stats and other scores; every Premier League match uses the same engine
- Fitness, injuries and suspensions
- **Transfers**: windows, budgets, player search, bids and counter-offers, personal terms,
  offers for your players, contract renewals and expiry, free agents, and computer clubs
  trading among themselves
- **Player development**: monthly growth and decline, youth intakes, retirements, coaching
  reports, ability history on player pages
- **Transfer windows open 1 July and 1 January**. Deals can be agreed at any time; players move
  when the window opens. Pre-contracts from January for players whose deals end in June
- **Negotiation**: clubs counter and come down towards your offer (each has a hidden limit),
  players haggle over wages and contract length, and you can name your price for offers for
  your players
- **Loans** in and out (to 31 December or the end of the season), optionally with an **option or
  obligation to buy** at a fee agreed up front; computer clubs loan out prospects
- **Scouting**: players outside your club are seen through estimates (ability marked ≈,
  potential and attributes as ranges) until scouts watch them; scout a player or a whole squad,
  get graded reports, keep a shortlist. **Find players**: brief a scout with a position, what you
  need (first-team ready, squad backup, one for the future) and where to look (your league, England,
  Scotland, everywhere, or abroad in Spain, Italy, Brazil and other countries)
- **Scottish Premiership 2026-27**, playable, with the split after 33 rounds, and the Scottish
  Championship in the background with its play-off against the Premiership's 11th-placed club.
  Real squads come from Wikipedia and Wikidata (`npm run data:scotland`); ratings are estimates

## Real-player data (personal use only)

The real Premier League pack is built locally from Fantasy Premier League and openfootball data
and is not stored in git (see `docs/decisions.md` #006):

```sh
npm run data:england               # build data/packs/england-2026-27.json + review report
npm run data:england -- --refresh  # download fresh data first
```

The review report (`data/reports/england-2026-27-ratings.md`) lists every rating. Corrections go
in `packages/pipeline/src/england/overrides.ts`.

```sh
npm run data:scotland                 # real squads from Wikipedia + Wikidata, estimated ratings, review report
npm run data:scotland -- --refresh    # download fresh squads first
npm run data:scotland -- --generated  # made-up squads, no network needed
```

The real Scottish squads need `en.wikipedia.org` and `query.wikidata.org` to be reachable; the
"Scotland data" GitHub workflow builds them and saves them in `data/scotland/` (copy
`data/scotland/raw/*` to `data/raw/scotland/` to rebuild offline). The
review report (`data/reports/scotland-2026-27-squads.md`) lists every estimated rating;
corrections go in `packages/pipeline/src/scotland/overrides.ts`.

The game plays every pack it finds as one world, so players move between England and Scotland.

## Running it

Needs Node 22.18 or newer.

```sh
npm install
npm run dev        # play in the browser at http://localhost:5173
npm test           # unit tests
npm run calibrate  # simulate 40 seasons and check results look like real football
                   # (add -- --pack data/packs/england-2026-27.json for the real league)
npm run check      # typecheck + tests + calibration (what CI runs)
node packages/harness/src/long-run.ts 10 --demo --check  # ten seasons stay stable
node packages/harness/src/long-run.ts 8 --scotland --league sco-1  # England + Scotland, report on Scotland
npm run build      # production build in apps/web/dist
```

Keys: **Space** = Continue, **Alt+←/→** = back/forward.
