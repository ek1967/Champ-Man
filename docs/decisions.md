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
and a weekly round-up of other deals. Sell-on clauses are not modelled yet (loans: see #011).

## 010 — Development, youth intake, imports from abroad
*Phase 8.* Development runs on the 1st of each month. Players up to 27 close a share of the gap
to their Potential Ability (about 3% a month at 17, falling to almost nothing at 27), scaled by
attitude (professionalism and determination), playing time and club size. From 30 (33 for
keepers) players lose ability, faster with age and slower for the naturally fit. Changes in
ability are spread over attributes: growth follows the position profile, decline hits pace,
acceleration, agility and stamina first.

Each club takes on one to four 16 and 17-year-olds on 20 March; academy quality (1–20) comes from
club size. Players retire from 33 (keepers two years later). Free agents nobody signs by the end
of a window leave the game unless they're good enough to be wanted later.

Because only the English leagues are simulated, the world would slowly run out of talent and
goalkeepers. So about 45% of computer-club signings come from abroad (created when signed, at
the level of the club's best XI), every computer club keeps two keepers, and clubs can't sell
or release below that. `packages/harness/src/long-run.ts --check` simulates ten seasons and
fails if overall quality, the top 20 players, ages, squad sizes or goals per game keep drifting.

## 011 — Windows open 1 July; agreed deals wait for the window; loans
The summer window runs 1 July – 1 September, January 1 January – 2 February. Offers can be made
at any time. A deal agreed while the window is shut is marked *agreed* and goes through when it
opens (1 July or 1 January); its fee and wages count against the buyer's budgets meanwhile, and
the player can't be sold to anyone else. From 1 January, players whose contracts end on 30 June
can sign a pre-contract and join on a free on 1 July. Fees agreed without terms lapse after two
weeks. Loans last until 31 December or the end of the season; the borrowing club pays the wages;
loanees can't be sold, bid for, released or trimmed, and return automatically.

## 012 — Scouting: estimates, not hidden numbers
Players at other clubs are shown through what the manager's staff know (0–100%): their own
players are fully known, players in the same league are partly known from watching them each
week, others barely. Ability shows as an estimate (marked ≈), potential and attributes as ranges
that narrow as knowledge grows. Scouts (more and better at bigger clubs) can watch a player
(3 days in the same league, 6 elsewhere) or a whole squad, and report with a grade A–D measured
against the manager's current starter in that position. The coaches' view of the manager's own
players' potential is also slightly uncertain.

## 013 — Scotland: real clubs, generated players, split and cross-league play-off
No open source of Scottish squads (or the 2026-27 fixture list) is reachable from the build, so
the Scotland pack has the real 2026-27 clubs (St Johnstone up, Livingston down) with generated
squads pitched by a judgement of each club's level (`packages/pipeline/src/scotland/clubs.ts`),
and a generated fixture list. Real squads can replace them when a source is available.

Rules in data: the Premiership plays 33 rounds, then splits into top and bottom six for five more
(clubs can't leave their half; home games to whoever has had fewer). 12th is relegated; the
Championship winner goes up; 2nd–4th play off (3rd v 4th, then 2nd, two legs each) and the winner
meets the Premiership's 11th-placed club over two legs. Play-off ties are settled by strength.

All packs found are merged into one world. Nations have a *wealth* (Scotland 0.3) that scales
budgets, and clubs in poorer nations can't attract players far above the level their size
supports (free agents, keepers, signings, imports and loanees); without that, players released
by English clubs flooded Scotland and its level climbed ten points or more in a few seasons.
English clubs are unaffected, since their second tier relies on players released from the top
flight. Computer transfer activity scales with the number of clubs. Eight seasons of England +
Scotland stay stable in the long-run harness (Scottish best XIs settle about 6 points higher).

The demo world's biggest clubs now have a few real stars (bigger spread for starters, a bonus
for the very biggest clubs), so the long-run check starts near equilibrium; before, the world's
top 20 kept rising and the CI stability step failed.

## 014 — Loan-to-buy, and buying from abroad
*Loans with an option or obligation to buy.* The fee is agreed when the loan is arranged. The
lending club judges it like a bid: it wants about 110% of its asking price for an option and
90% for an obligation (certain money), and with a fee agreed it will lend first-team players it
otherwise wouldn't. An option can be taken up at any time during the loan; the player stays and
gets a new contract. An obligation completes automatically when the loan ends, and its fee is
set aside from the borrower's budget meanwhile. The manager is reminded two weeks before a loan
with an option ends. When the manager loans a player out with an option, only clubs that could
afford it take the player, and they buy at the end if the player has become a regular.

*Buying from abroad.* Only England and Scotland are simulated, while computer clubs already sign
about 45% of their players from abroad (#010). To give the manager the same market, a scout can
spend two weeks in one of eleven countries (the others planned for the game, plus France and
Belgium) and come back with five players at the manager's level: options for the three weakest
positions in the best XI, a cheaper squad player and a teenage prospect. They are created when
found, like the computer clubs' imports, and can be bought for about four months at a price fixed
when found; after that the trail goes cold. They are never free agents and computer clubs can't
sign them. Deals follow the usual windows. When those countries' leagues are added (as background
leagues first), real clubs will replace this.

## 015 — Real Scottish squads from Wikipedia and Wikidata, with estimated ratings
`npm run data:scotland` now reads each club's current squad from its English Wikipedia article
(the {{Fs player}} rows under the first-team heading: name, number, broad position, country),
and looks each linked player up on Wikidata for date of birth, detailed positions and whether
they have played for a senior national team. Players out on loan elsewhere are left out; players
on loan in count for the club they play at. Both sources are openly licensed (CC BY-SA, CC0), so
unlike the FPL data this pack is not personal-use only.

There are no open match statistics for Scotland, so ability is estimated: relative to a typical
first-team player at the club, adjusted for age (young players lower), squad number (1–11 up,
40+ down; a keeper wearing 1 up), senior caps (up) and a small fixed random spread, then shifted
so each club's best eleven matches its level in `scotland/clubs.ts`. Attributes and secondary
positions are generated to fit. Every rating is in the review report, and hand corrections go in
`scotland/overrides.ts`. Squads under 22 (Premiership) or 20 (Championship) are topped up with
generated reserves, and every club keeps two keepers. `--generated` keeps the old made-up squads.
