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
