# Decisions log

Short records of technical choices, newest last. Product decisions are in `PLAN.md` §0.

## 001 — Monorepo with npm workspaces, TypeScript source packages
*Phase 0.* `packages/engine` (pure simulation, no DOM or Node APIs), `packages/harness`
(headless calibration), `apps/web` (React + Vite). Packages export their TypeScript source
directly, so there is no build step between them: Vite compiles it for the browser, and
Node 22.18+ runs the harness directly (type stripping). That's why the code uses only
"erasable" TypeScript (no enums, no parameter properties) and `.ts` import extensions.

The plan listed separate `data-schema`, `rules`, `ui` and `pipeline` packages. They are
folded into `engine` and `web` for now and will be split out when they earn it (the data
pipeline in Phase 6 will be its own package).

## 002 — Game state in memory, saves as JSON in IndexedDB (not SQLite)
*Phase 1.* The plan suggested SQLite compiled to WebAssembly. The whole world fits easily in
memory (the demo world is ~900 players; the real 11-country world will be roughly 15,000), and
plain objects are simpler and faster to simulate than SQL queries. Saves are the state
serialised as JSON (~1.3 MB for the demo after a season) and stored in IndexedDB, with a
"Download save" button for backups.

Revisit if save size or load time becomes a problem with the real database: options are
compressing saves, pruning old match detail, or moving to SQLite.

## 003 — Engine runs on the main thread for now
*Phase 3.* A Continue press takes about 10–50 ms in the demo world, so a Web Worker isn't
needed yet. The engine has no DOM dependencies, so it can move into a worker later without
changes (expected when the full match engine and the real database arrive).

## 004 — Quick simulation is calibrated, not hand-tuned by feel
*Phase 2.* Results come from team strength via a Poisson goal model. Its four constants
(`QUICK_SIM` in `packages/engine/src/quicksim.ts`) were tuned with the calibration harness
until all real-football metrics fell in range (goals per game, home/draw/away split, 0-0s,
champions' points, top scorer goals and so on). CI runs the harness with `--check`, so a change
that drifts out of range fails the build.

## 005 — Demo world: "Albion"
*Phase 1.* A made-up country with a 20-club playable Premier Division and a 20-club shadow
First Division (PLAN §3.1). Clubs and players are generated from a seed. Players have real
nationalities and name pools so the same generator can create youth intakes later.

## 006 — Real Premier League data from FPL, kept out of git
*Phase 6, brought forward.* This cloud environment blocks Wikidata and Wikipedia, so squads
come from Fantasy Premier League data (via the `vaastav/Fantasy-Premier-League` GitHub mirror)
and fixtures from openfootball (public domain). FPL data is the Premier League's and its terms
allow personal use only, so:

- raw downloads (`data/raw`), the built pack (`data/packs`, `apps/web/public/packs`) and the
  review report (`data/reports`) are git-ignored, and are rebuilt with `npm run data:england`;
- only the pipeline code, club details and our own rating model are committed;
- before any public release, names and ages move to Wikidata and FPL is used only to check.

Ratings: each player is ranked within their role on FPL price, share of minutes (weighted by
club strength) and bonus points per 90 minutes, then given CA = 88 + 92 × score plus a small
position offset. Per-90 stats nudge individual attributes. Hand corrections go in
`packages/pipeline/src/england/overrides.ts`.

Known gaps: FPL has no left/right for full-backs and wingers (sides are assigned at random),
no contracts (estimated from age), and no Championship squads, so 21 Championship clubs have
generated players. The relegated clubs (Burnley, West Ham, Wolves) use last season's FPL squads.

## 007 — Computer picks the best of three formations
*Phase 6.* Until tactics arrive (Phase 5), each club's XI is the strongest of 4-4-2, 4-3-3 and
4-2-3-1. A fixed 4-4-2 left squads built around attacking midfielders playing out of position.

## 008 — Match engine: minute by minute, calibrated, one engine for every match
*Phases 4–5.* Each minute: possession from the sides' midfield control, an attack (sometimes),
then chance creation from attack against defence and the shot from shooter against keeper, all
from attributes, position fit, fitness, form and tactics. Fouls, cards, penalties, corners, free
kicks, injuries and substitutions are events in the same loop. The manager's match runs with
commentary; every other Premier League match runs the same code silently, so results and player
stats are consistent. Shadow leagues still use the quick strength model.

Constants live in `MATCH` (`packages/engine/src/match.ts`) and were tuned against real Premier
League averages with `npm run calibrate -- --pack …` and `packages/harness/src/tune.ts`. Tests
check that tactics change outcomes (attacking football means more goals at both ends) and that
no extreme setting gives a decisive edge over balanced play.

Fitness (`condition`) drops during matches and recovers daily; injuries and bans (a red card, or
every fifth booking) make players unavailable. The manager's tactics are saved with the game and
"readied" before each match, replacing anyone who has since become unavailable.

## 009 — Transfer market
*Phase 7.* Windows run 15 June–1 September and 1 January–2 February. Clubs start with a
transfer budget from their size (the biggest around €200M) and a wage budget just above their
wage bill. A selling club's asking price starts from the player's value and goes up for long
contracts and key players, down for listed players and short contracts. Clubs won't sell
players signed in the last ten months, or one of their five best players to a smaller club
unless the fee is at least 60% over the asking price. Players won't drop a division (unless
modest), or move to a club much smaller than their own, depending on their ambition.

Computer clubs make about one signing a day in summer and one every other day in January,
each time strengthening the weakest position in their best XI with a player who is clearly
better and affordable. Contracts end on 30 June; computer clubs renew most of their top 20
players and release the rest, and thin squads are topped up from free agents. The manager gets
offers for their players (more for listed ones), answers to their own bids in a day or two,
and a weekly round-up of other deals. Loans and sell-on clauses are not modelled yet.
