# Champ-Man — Project Plan

A fast, text-first football management game in the spirit of the classic
Championship Manager era (CM2 → CM 01/02), set in the **2026-27 season** with
real players across multiple leagues. Runs in the browser and as a downloadable
desktop app.

> Status: **planning only**. Nothing here is built yet.

---

## 1. What made the classic games great (research summary)

Championship Manager was created by brothers Paul and Oliver Collyer. Their
studio, Sports Interactive, was founded in 1994. CM2 (1995) and its 96/97 and
97/98 updates set the template. CM 01/02 was the last game on the CM3 engine and
is the version most people remember. Eidos released it as freeware, and a
community still plays it today, keeping it alive with patches and fan-researched
data updates (champman0102.net / champman0102.co.uk). When SI and Eidos split in
2003, Eidos kept the *name and interface* and SI kept the *database and match
engine*. Those two halves went on to become Football Manager.

These qualities are what we want to keep:

| Quality | What it meant in practice |
|---|---|
| **Speed** | Turn-based days. You do what you need, press **Continue**, and time moves on. Seasons fly by. No waiting on 3D. |
| **Text over graphics** | No match visuals. Text commentary plus a ticking clock made you *imagine* the match, and reviewers called this a strength. |
| **Hyperlinked world** | Every player, club, competition and nation name opens its page. You explore by clicking, Wikipedia-style. |
| **Dense, legible screens** | Tables and lists with no wasted chrome. One screen = one job (squad, tactics, table, fixtures, finances). |
| **Inbox-driven loop** | News items tell you what happened and link straight to the screen where you act on it. |
| **Understandable model** | 1–20 attributes you can reason about. Good players are visibly good. Tactics are a handful of clear levers. |
| **Discovery** | Searching for unknown wonderkids, scouting cheap gems and building a dynasty. Hidden potential made every save different. |
| **Scope discipline** | No press conferences, body language, 3D, or training micromanagement. The game stayed small enough to be quick. |

Sources: [Wikipedia: Championship Manager](https://en.wikipedia.org/wiki/Championship_Manager),
[Wikipedia: CM2](https://en.wikipedia.org/wiki/Championship_Manager_2),
[Wikipedia: CM 97/98](https://en.wikipedia.org/wiki/Championship_Manager:_Season_97/98),
[PC Gamer: history of CM/FM](https://www.pcgamer.com/uk/the-history-of-championship-manager-and-football-manager/),
[TechRadar: why people still play CM 01/02](https://www.techradar.com/features/championship-manager-season-01-02),
[StrategyWiki: CM 01/02](https://strategywiki.org/wiki/Championship_Manager:_Season_01/02),
[MobyGames: CM 01/02](https://www.mobygames.com/game/5179),
[Force for Good: CM 00-01 review](https://forceforgood.co.uk/sport/championship-manager-00-01/).

### Staying original

We capture the *feel and design principles* of that era: text-first, fast,
Continue-driven, hyperlinked, and 1–20 attributes. These are genre conventions
shared by many management games. We do **not** recreate any specific game's
screens, artwork, name, data or formulas.

- Our own name and branding. "Championship Manager" is a trademark of its
  current owner, so it can't be used.
- Our own visual design and layout, built from first principles around the pillars above.
- Our own attribute list, formulas and match engine.
- Our own player ratings. We never import data from CM, FM or the community CM 01/02 databases.

---

## 2. Design pillars (the rules every feature is judged against)

1. **Continue is king.** From any screen, one click or key (`Space`/`Enter`)
   advances the game. Target: < 300 ms per non-match day.
2. **Three clicks to anything.** Every entity name is a link. Global search is
   always one keystroke (`/`) away. Back/forward history works like a browser.
3. **Text match, real tension.** Live text commentary with adjustable speed,
   a live scores ticker, and instant result whenever you want it.
4. **Numbers you can trust.** Attributes are 1–20, and a player's "true" quality
   is consistent with what you see (after scouting).
5. **Small on purpose.** Each feature must make the loop *more fun per minute*.
   The "not doing" list (§12) is part of the plan.
6. **Data is a separate, swappable pack.** The engine ships independently of the
   real-player database (see §5 for why).

---

## 3. Scope

### MVP ("one season, one league, playable end-to-end")
- Premier League 2026-27, 20 clubs, real squads.
- Calendar, fixtures, league table, results for all clubs.
- Text match engine with commentary, subs and tactic changes.
- Squad, player profile, team selection, basic tactics.
- Inbox/news, Continue loop, save/load.
- Simple transfers (bids, accept/reject, fee only) and contracts (wage + years).
- End-of-season: table final, awards, aging/retirement, new season fixtures.

### v1.0 ("the classic experience")
Adds, on top of the MVP:
- **Leagues (top two tiers where noted):** England (PL → National League),
  Spain (LaLiga, LaLiga 2), Italy (Serie A, B), Germany (Bundesliga, 2.
  Bundesliga), France (Ligue 1, Ligue 2), Netherlands, Portugal, Scotland,
  Belgium, Turkey. Players choose which nations to "load" at game start.
- Domestic cups (FA Cup, EFL Cup, Copa del Rey, DFB-Pokal, Coppa Italia,
  Coupe de France, and others).
- UEFA Champions League / Europa League / Conference League in the current
  league-phase format (36 teams; knockout play-off for 9th–24th).
- Full transfer market with AI clubs buying and selling, loans, free transfers
  and Bosmans, transfer windows, and work-permit / non-EU rules (simplified).
- Scouting, attribute masking (unscouted players show ranges), and a player
  search with filters (the wonderkid hunt).
- Finances, board confidence, sacking, job offers, and moving clubs.
- Youth intake and regens, player development and decline.
- International management (national team jobs, international breaks and
  qualifiers).
- "Go on holiday" until a given date.

### Later / optional
- Other calendars (MLS, Brazil, Argentina, Japan): calendar-year seasons need a
  scheduler that handles them.
- A mod/editor tool for the community to maintain data.
- Online leagues or hot-seat multiplayer (the classic games supported multiple
  human managers on one PC; hot-seat is cheap to add).

---

## 4. Season & start point

The current date is late October 2026, so the 2026-27 season is already under way.

**Recommended:** start on **1 July 2026** with squads as they stood **after the
summer window closed** (1 Sep 2026). You get the real post-window squads and a
full season to play. This is a deliberate fiction, the same one the classic data
updates used.

**Optional later mode:** "Start today", which loads real results and tables up to
a cut-off date and takes over mid-season.

---

## 5. Real players: data & legal strategy

This is the biggest risk in the project, so it gets its own section.

### 5.1 The legal landscape (not legal advice)
- **Player names and image rights:** commercial games license these, mainly
  through FIFPRO, which aggregates rights from player unions in around 60
  countries, plus deals with leagues and clubs. This is contested in places.
  Brazil's courts ruled that FIFPRO couldn't assign Brazilian players' rights,
  Ibrahimović publicly challenged EA/FIFPRO, and the Spanish players' union has
  reportedly left FIFPRO.
- **Club and league names, crests and kits** are trademarks. Even Football
  Manager 26 ships with fake names for unlicensed clubs and competitions, and
  fans apply a "real names fix".
- **Performance data** is the subject of a UK claim by 400+ players against
  gaming, betting and data companies.
- **Data providers' terms** usually forbid redistributing their raw data.
  Transfermarkt has no public API, and scraping it likely breaches its terms.

Sources: [Lewis Silkin on image rights](https://sportsinsights.lewissilkin.com/post/102gl2f/image-rights-in-the-spotlight-again-as-zlatan-fires-shot-at-ea-sports-and-fifpro),
[Fordham IPLJ on FIFA licensing](https://fordhamiplj.org/2021/11/11/fifa-how-does-the-most-successful-sports-video-game-obtain-player-i-rights/),
[Freshfields on digital likeness](https://technologyquotient.freshfields.com/post/102gpgj/foul-play-ibrahimovic-and-the-role-of-digital-likeness-in-sports-video-games),
[SoccerGaming on AFE leaving FIFPRO](https://soccergaming.com/could-spanish-players-be-removed-from-ea-sports-fc-efootball-and-other-football-games/),
[Destructoid: FM26 real-names fix](https://www.destructoid.com/how-to-get-real-club-and-tournament-names-in-football-manager-26/).

### 5.2 Recommended approach: engine and data pack separated
1. **Engine + fictional "demo world"** (generated names and clubs). This is
   always safe to distribute publicly.
2. **Real-world data pack** (2026-27). A separate file in an open, documented
   format (JSON or SQLite), loaded by the game at startup. For personal or
   private use, build it yourself with the pipeline in §6. Get advice before
   distributing it publicly.
3. **No crests, kits or photos.** Use text names and generated colour swatches,
   which suits the text-first aesthetic anyway.
4. **Plain-text competition names** with an alias layer, so names can be
   swapped without touching saves.

### 5.3 Distribution tiers (decide early, see open questions)
| Tier | Real names in shipped build? | Risk |
|---|---|---|
| Personal/private use | Yes, via local data pack | Low |
| Free public release | Engine + fictional world; data pack separate or community-made | Medium |
| Commercial release | Needs licensing (FIFPRO, leagues) or fictional data | High without licences |

---

## 6. Data pipeline (building the 2026-27 database)

Football Manager's real advantage is its network of human researchers. We
replace that with **algorithmic ratings plus a focused human curation pass**.

### 6.1 Sources (verify current terms and 2026-27 coverage before committing)
| Need | Candidate sources | Notes |
|---|---|---|
| Identity (name, DOB, nationality, position, club) | **Wikidata** (CC0) | Licence-clean backbone. Coverage is good for top leagues and patchier lower down. |
| Squads, fixtures, results, basic stats | **API-Football**, **Sportmonks**, **football-data.org** | Paid tiers. Free tiers are rate-limited (e.g. API-Football 100 req/day). Check that redistribution and derived-data clauses allow this use. |
| Team strength | **ClubElo** (free CSV API) | Calibrates league and club strength. |
| Market values / transfer history | transfermarkt-datasets (GitHub, scraped) | **Avoid for anything distributed.** Transfermarkt's terms are restrictive. |
| Competition rules | Official league / UEFA regulations | Encoded by hand as data (§7.4). |

Sources: [football-data.org overview](https://getbruin.com/docs/ingestr/supported-sources/football-data-org.html),
[API-Football notes](https://getbruin.com/docs/ingestr/soccer-sources/api-football.html),
[Sportmonks squads endpoint](https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/team-squads),
[transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets).

### 6.2 Rating generation (the hardest and most important part)
1. **Estimate Current Ability (CA, 1–200)** for each player from:
   - Club strength (Elo) × league strength coefficient
   - Share of minutes played last season and this season
   - International caps and level of national team
   - Age (a teenager starting at a top club scores higher than an old squad player)
2. **Distribute CA into 1–20 attributes** using position archetype templates
   (e.g. "ball-playing CB", "inverted winger", "target forward"), adjusted by
   per-90 stats where available (goals → finishing, aerials → heading, and so on).
3. **Estimate Potential Ability (PA)** from CA, an age curve and youth-level
   signals. Store PA as a *range* for younger players, rolled at the start of
   each new game, so each save produces different wonderkids.
4. **Hidden attributes** (consistency, big-match temperament, injury proneness,
   professionalism, and others) start at neutral values with small random
   variance, overridden manually for well-known cases.
5. **Human curation pass** on roughly the top 1,500 players: stars must *feel*
   right. Build a simple internal editor for this (§10, Phase 9).
6. **Validation:** the average squad rating rank of each league should correlate
   strongly with real standings and Elo. Flag outliers for review.

### 6.3 Pipeline mechanics
- Scripts written in TypeScript (or Python), output a versioned
  `world-2026-27.sqlite`.
- Reproducible: raw source snapshots → normalised tables → ratings → pack.
- Diff reports between versions (who moved, who changed rating) to support
  January-window updates.

---

## 7. Game design details

### 7.1 Player attributes (1–20 visible, 1–200 CA/PA hidden)
Our own list, about 32 visible, sized to the classic era rather than modern FM:

- **Technical:** Crossing, Dribbling, Finishing, First Touch, Heading,
  Long Shots, Marking, Passing, Set Pieces, Tackling
- **Mental:** Aggression, Anticipation, Bravery, Composure, Decisions,
  Determination, Flair, Leadership, Movement (off the ball), Positioning,
  Teamwork, Vision, Work Rate
- **Physical:** Acceleration, Agility, Balance, Jumping, Fitness, Pace,
  Stamina, Strength
- **Goalkeeping (GK only):** Handling, Reflexes, One-on-Ones, Command of Area,
  Distribution
- **Hidden:** Consistency, Big Matches, Injury Proneness, Versatility,
  Adaptability, Ambition, Loyalty, Professionalism, Temperament, Sportsmanship
- **Other:** Preferred foot (L/R/Both), Positions (rating per position:
  GK, D L/C/R, WB, DM, M L/C/R, AM L/C/R, ST)

Attribute masking: unscouted players show ranges ("11–15"). Better scouts or
more scouting time narrows the range.

### 7.2 Match engine (text-first)
**Approach:** an event-based probabilistic simulation, with no physics and no
2D pitch.

- The match is ~90 "phases" (plus stoppage time). In each phase:
  1. Decide possession from midfield control (passing, vision, teamwork,
     work rate, tactics) with a home advantage modifier.
  2. Move the ball through zones (defence → midfield → final third), with
     duels resolved by attribute matchups of the selected players
     (dribbler vs tackler, passer vs positioning).
  3. If it reaches the final third, create a chance with a quality value
     (an xG-like 0–1), based on the creator, the finisher and the defensive
     organisation.
  4. Resolve the shot: finisher vs goalkeeper vs chance quality → goal, save,
     miss, block or corner.
  5. Side events: fouls, cards, injuries, set pieces, offsides.
- **Modifiers:** morale, fitness/fatigue (stamina decays per phase; tempo and
  pressing speed it up), consistency roll per player per match, big-match
  rolls in finals and derbies, weather (light).
- **Commentary:** template-driven text with variable phrasing per event
  ("…cuts inside onto his left, shoots… just wide!"), with player names linked.
- **Two speeds of the same engine:** "Full" (generates commentary events) for
  the human's matches, "Quick" (same maths, no text) for every other match.
  A Quick match should take < 2 ms.
- **Seeded RNG**, so any match can be replayed exactly (useful for bug reports
  and tests).

**Calibration targets** (tuned with a headless harness that simulates
thousands of seasons):
- Goals per game ≈ 2.6–2.9; home win / draw / away win ≈ 45 / 25 / 30 %
- 0-0 frequency ≈ 7–8 %; red cards ≈ 0.1–0.15 per game
- Shots ≈ 11–14 per team; conversion ≈ 10–12 %
- Title winners, relegation candidates and points spreads that look like real
  seasons (champions on ~85–95 pts, about 1 surprise team per season)
- **Exploit tests:** a set of "silly" tactics (all-out attack, 2-3-5, extreme
  offside trap) must not reliably beat sensible ones. Some classic-era games
  had famous exploits that the community still talks about.

### 7.3 Tactics (keep it to a handful of clear levers)
- Formation (preset plus drag players to slots)
- Team settings: Mentality (Defensive ↔ Attacking), Passing (Short / Mixed /
  Direct), Tempo, Width, Pressing, Tackling (Easy / Normal / Hard),
  Defensive line (Deep / Normal / High), Offside trap (on/off), Counter (on/off)
- Per-player: role (e.g. Playmaker, Target Man, Ball-Winner), plus forward runs
  and hold position toggles
- Set-piece takers, captain
- In-match: subs, change settings, 3–5 quick "shouts"

### 7.4 Competitions as data
Every competition is defined in a rules file, not in code:
- Format: league / cup / group + knockout / league phase (Swiss-style) +
  knockout
- Teams, rounds, legs, extra time / penalties, replays (e.g. FA Cup rules for
  2026-27)
- Tie-breakers (PL: goal difference first; LaLiga/Serie A: head-to-head first)
- Promotion/relegation, play-offs, splits (Scotland), and qualification slots
  into Europe
- Squad rules: registration limits, homegrown quotas, UEFA A/B lists, non-EU
  limits
- Transfer window dates per nation

*Verify each league's 2026-27 regulations when encoding them. Formats change
(e.g. Belgium, the Scottish split, UEFA access list).*

### 7.5 World simulation
- **Transfers:** AI clubs maintain squad needs by position, budget and wage
  structure, and they bid, sell and loan. Fees are valued from CA, PA, age,
  contract length and reputation. Asking fees respond to interest.
- **Contracts:** wage, length, simple clauses (release clause, sell-on %).
  Players have wage expectations and willingness based on club reputation.
- **Finances:** gate receipts, TV and prize money (rough per-league values),
  wages, transfers, and a simple balance sheet. Board sets budgets.
- **Board & job security:** expectations set at season start (title / Europe /
  mid-table / survival), confidence meter, sacking, job offers.
- **Development:** monthly growth/decline toward PA, driven by age, minutes,
  training facilities and professionalism. Peak around 25–30, decline after,
  later for goalkeepers.
- **Youth & regens:** annual intake per club based on youth facilities and
  nation. Retired players are replaced by generated youngsters.
- **Injuries:** frequency by injury proneness and fatigue; duration buckets.
- **Reputation:** clubs, players and manager, which drives transfers and job offers.
- **News generation:** templated news items for results, transfers, injuries,
  board, awards and milestones.

### 7.6 Performance model
- Players choose nations to load at game start. "Loaded" leagues get full
  simulation, while players in unloaded nations exist only as a light pool
  (for transfers) with results simulated at league level only.
- Budgets (mid-range laptop / phone):
  - Non-match day: < 300 ms
  - Match day across all loaded leagues (~150 matches): < 1.5 s
  - Season (holiday mode): < 60 s
  - Save file: < 25 MB compressed

---

## 8. UX / UI plan

### 8.1 Layout (desktop)
```
┌──────────────────────────────────────────────────────────────┐
│ [Club ▼] Sat 15 Aug 2026  ·  League: 3rd  ·  Next: v ARS (H) │ [CONTINUE ▶]
├────────────┬─────────────────────────────────────────────────┤
│ Inbox (3)  │                                                 │
│ Squad      │            Current screen                       │
│ Tactics    │      (dense table / profile / match)            │
│ Fixtures   │                                                 │
│ Competitions│                                                │
│ Transfers  │                                                 │
│ Scouting   │                                                 │
│ Finances   │                                                 │
│ Club       │                                                 │
│ Manager    │                                                 │
│ Search  /  │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```
- Persistent Continue button in the top bar. `Space` triggers it from any
  screen (unless an input is focused).
- Back/forward (`Alt+←/→`) with breadcrumb history.
- Every entity is a link, and right-click / long-press gives quick actions
  (shortlist, bid, scout).
- Tables: sortable columns, column chooser, compact row height, numeric
  attributes colour-banded (1–20).
- Light and dark themes, plus an optional "retro" theme (blocky colours,
  monospace) as an homage to the era without copying any specific game's look.

### 8.2 Key screens
1. **Start:** new game (choose nations to load, choose club or unemployed),
   load game, settings.
2. **Inbox:** list plus detail, with action buttons inside news items ("View
   bid", "Respond").
3. **Squad:** list with position, age, condition, morale, value and key
   attributes. Toggle views (General / Attributes / Contracts / Stats).
4. **Player profile:** attributes (masked if unscouted), positions, history,
   contract, stats, actions.
5. **Tactics & team selection:** formation pitch view (simple, not animated),
   bench, team settings, set pieces.
6. **Match day:** pre-match (line-ups, odds), live text commentary with speed
   control (Fast / Normal / Key events only / Instant), live scores ticker,
   stats tab, subs/tactics panel, half-time and full-time summaries.
7. **Competition:** table (with form, home/away splits), fixtures/results,
   stats leaders.
8. **Transfers:** player search (filters: age, position, attribute
   thresholds, value, nationality, contract expiry), shortlist, bids in
   progress, transfer history.
9. **Club:** info, finances, board expectations, staff.
10. **Manager:** profile, history, job offers, "Go on holiday".

### 8.3 Mobile / small screens
Collapsible nav drawer, Continue as a floating button, and tables that drop
low-priority columns. The game must be fully playable on a phone.

---

## 9. Technical architecture

### 9.1 Stack (recommended)
| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language for engine, UI, data pipeline |
| UI | **React** (or Svelte) + Vite | Mature, fast iteration, great table libraries |
| Tables | TanStack Table + virtualisation | Thousands of rows, instant sorting |
| Engine | Pure TS module, no UI dependencies, runs in a **Web Worker** | Keeps the UI at 60 fps during Continue; easy headless tests |
| Storage | **SQLite in WASM** (wa-sqlite / sql.js) persisted via OPFS, or IndexedDB (Dexie) | Relational world data, fast queries, single-file saves |
| Desktop | **Tauri** wrapping the same web build | Small download (~10 MB), native file saves |
| Offline | PWA (service worker) | Installable web app that works offline |
| Tests | Vitest (unit), Playwright (UI), custom headless sim harness | Calibration and regression |

### 9.2 Module layout (proposed)
```
/packages
  /engine        # pure simulation: calendar, match, transfers, finance, dev
  /data-schema   # types + SQLite schema + migrations for world & saves
  /rules         # competition rule files (JSON/YAML) + validators
  /ui            # React app (screens, components, routing)
  /pipeline      # data ingestion + rating generation → world pack
  /harness       # headless season simulator + calibration reports
/apps
  /web           # PWA build
  /desktop       # Tauri shell
```

### 9.3 Core data model (abridged)
`Nation`, `Competition`, `CompetitionRules`, `Season`, `Stage`, `Club`,
`Stadium`, `Person` → `Player` / `Staff` / `Manager`, `Attributes`,
`HiddenAttributes`, `Contract`, `Transfer`, `Loan`, `Fixture`, `MatchResult`,
`MatchEvent`, `PlayerSeasonStats`, `Injury`, `NewsItem`, `Shortlist`,
`ScoutReport`, `FinanceLedger`, `BoardExpectation`, `SaveMeta`.

### 9.4 Engine principles
- **Deterministic:** all randomness comes from a seeded PRNG stored in the save.
- **Day-tick architecture:** `advanceDay()` runs ordered systems (fixtures →
  injuries → training/dev (weekly) → transfers/AI → finances (monthly) →
  news). Each system is independently testable.
- **Interrupts:** Continue stops when the human must act (bid received, match
  day, contract expiring, job offer). This is what makes the game feel quick:
  stop only when it matters.

---

## 10. Roadmap

Sizes are relative (S ≈ 1–2 weeks, M ≈ 3–4 weeks, L ≈ 6–8 weeks for one
focused developer). Each phase ends with something playable or measurable.

| # | Phase | Size | Exit criteria |
|---|---|---|---|
| 0 | **Decisions & setup:** name, distribution tier, stack, repo scaffold, CI | S | Monorepo builds, lint/test in CI, decisions recorded in `/docs/decisions` |
| 1 | **Schema + fictional world generator** | S | Generates a 20-club league with fake players, saved to SQLite |
| 2 | **Calendar, fixtures, tables, Quick sim** | M | Headless: simulate a full league season, correct table and tie-breakers |
| 3 | **UI shell:** nav, Continue loop, inbox, squad, player, competition screens | M | Play through a season by pressing Continue, browsing everything by links |
| 4 | **Match engine v1 + match day screen** | L | Text commentary, subs, instant result; calibration harness hits §7.2 targets |
| 5 | **Tactics & team selection** | M | Tactics measurably change outcomes; exploit tests pass |
| 6 | **Real data v0 (Premier League)** | M | Pipeline produces a PL 2026-27 pack; ratings pass the sanity checks in §6.2 |
| — | **🎯 MVP milestone** | — | One full PL season playable end-to-end with real squads |
| 7 | **Transfers, contracts, finances, board** | L | AI clubs trade sensibly; you can be sacked; budgets matter |
| 8 | **Development, youth, regens, season rollover** | M | 10-season headless run stays stable (no rating inflation, squads stay full) |
| 9 | **Data pipeline v1 + curation editor**, all v1 leagues | L | All v1 leagues loaded; top 1,500 players hand-checked |
| 10 | **Cups + UEFA competitions + promotion/relegation across tiers** | M | Correct formats; European qualification flows from league finishes |
| 11 | **Scouting, attribute masking, player search** | M | The wonderkid hunt works; masked ranges narrow with scouting |
| 12 | **International management** | S–M | National team selection and international breaks |
| 13 | **Polish:** performance budgets, keyboard shortcuts, mobile layout, themes, holiday mode | M | All §7.6 budgets met on a mid-range laptop and phone |
| 14 | **Packaging:** PWA + Tauri desktop builds, save import/export | S | Installable on web, Windows, macOS, Linux |
| 15 | **January 2027 data update** (process test) | S | New pack generated and diffed; old saves unaffected |

Rough total: about 9–12 months part-time for one developer, shorter with help
or AI-assisted coding. The MVP (phases 0–6) is about 3–4 months part-time.

---

## 11. Testing & quality

- **Unit tests:** tie-breakers, fixture generation (no clashes, balanced
  home/away), contract maths, transfer validation, rules files.
- **Headless harness:** simulate N seasons and output a calibration report
  (goal distributions, home advantage, points spreads, upset rate, rating
  drift, financial health). Run it in CI on every engine change, with
  thresholds.
- **Golden saves:** fixed seed and fixed world → the expected season outcome
  hash. Any change to it must be intentional.
- **Playtests:** a short checklist per milestone ("Did a season take under 2
  hours? Did any screen need more than 3 clicks?").

---

## 12. Deliberately NOT doing (protects the "quick and simple" feel)
- 2D/3D match visualisation
- Press conferences, player interactions, body language, social media feeds
- Detailed training schedules (only a simple focus setting per player, if any)
- Agents as negotiating characters
- Dynamics/hierarchy systems
- Crests, kits and player photos

Any of these can be reconsidered after v1.0, but only if it passes pillar #5.

---

## 13. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Data/image rights | Can't distribute real data | Engine/data-pack split (§5.2); decide distribution tier early |
| Rating quality ("Why is X rated 12?") | Breaks immersion | Algorithmic baseline + curation pass + validation against Elo/standings |
| Match engine feels random or exploitable | Core fun | Calibration harness, exploit tests, tune before adding features |
| Scope creep toward modern FM | Loses speed and charm | Pillars + "not doing" list; performance budgets in CI |
| Data provider terms or costs change | Pipeline breaks | Wikidata backbone; providers behind adapters; cache raw snapshots |
| Data goes stale mid-season | Less real | Repeatable pipeline; January update process (Phase 15) |
| Browser storage limits / data loss | Lost saves | OPFS + export/import saves; desktop build writes to disk |

---

## 14. Open questions (need your input)

1. **Name** for the game (it can't be "Championship Manager").
2. **Distribution:** personal use only, free public release, or commercial?
   This decides how real data is handled.
3. **Leagues for v1:** is the list in §3 right? Any must-haves (e.g. MLS,
   Brazil) or cuts?
4. **Start point:** 1 July 2026 with post-window squads (recommended), or
   "start today" mid-season?
5. **Platform priority:** web first and desktop second (recommended), or the reverse?
6. **Budget for data APIs:** willing to pay for a provider tier (~€20–50/month)
   during the pipeline build?
