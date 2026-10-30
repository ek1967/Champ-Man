# Manager of Champions — Project Plan

A fast, text-first football management game in the spirit of the classic
Championship Manager era (CM2 → CM 01/02), set in the **2026-27 season** with
real players across 11 countries. Web first; downloadable desktop app later.

> Status: **planning only**. Nothing here is built yet.

---

## 0. Decisions so far

| Topic | Decision |
|---|---|
| Name | **Manager of Champions** (run a trademark search before going paid, see §5.3) |
| Distribution path | **Personal → free public release → paid** if it succeeds |
| Data budget | **No paid data for now.** Free and open sources only (§6.1) |
| Countries | England, Scotland, Spain, Italy, Germany, Netherlands, Portugal, Czech Republic, Argentina, Brazil, USA |
| Platform | **Web first** (installable PWA); desktop wrapper later |
| Start date | **15 June 2026** |
| Squads | **Current real squads** (after the 2026 summer window) |
| World Cup 2026 | **Runs in the background with real results** |
| League depth | **Top tier only is playable.** Second tiers run as background "shadow leagues" for promotion and relegation (§3.1) |
| Who codes | **Claude writes the code**; you playtest, review and make design calls |

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
- **Leagues.** Players choose which nations to "load" at game start.
  *Verify every format against the 2026-27 (or 2026) regulations when encoding it.*

  | Country | Playable league | Shadow league (background) | Season calendar | Format notes |
  |---|---|---|---|---|
  | England | Premier League | Championship | Aug–May | 3 down; 2 up + play-off winner |
  | Scotland | Premiership | Championship | Aug–May | Top/bottom-six split; relegation play-off against shadow clubs |
  | Spain | LaLiga | LaLiga 2 | Aug–May | Head-to-head tie-breaks |
  | Italy | Serie A | Serie B | Aug–May | Head-to-head tie-breaks |
  | Germany | Bundesliga | 2. Bundesliga | Aug–May | Relegation play-off against a shadow club |
  | Netherlands | Eredivisie | Eerste Divisie | Aug–May | European play-offs; promotion/relegation play-offs |
  | Portugal | Liga Portugal | Liga Portugal 2 | Aug–May | Relegation play-off against a shadow club |
  | Czech Republic | Czech First League | Czech National League | Jul–May | Splits into groups after the regular season |
  | Argentina | Liga Profesional | Primera Nacional | **Calendar year** | Apertura + Clausura (zones + knockout play-offs); relegation by points average over seasons |
  | Brazil | Série A | Série B | **Calendar year** | Straight double round-robin; 4 up / 4 down |
  | USA | MLS | None needed | **Calendar year** (MLS has announced a move to an Aug–May calendar from 2027-28, verify) | Two conferences, MLS Cup play-offs, no promotion/relegation, salary cap + Designated Players (simplified) |

- **Domestic cups:** FA Cup, EFL Cup, Scottish Cup, Scottish League Cup,
  Copa del Rey, Coppa Italia, DFB-Pokal, KNVB Cup, Taça de Portugal,
  Czech Cup, Copa Argentina, Copa do Brasil, US Open Cup.
  Brazil's state championships (Paulistão and others) are skipped in v1.
- **Continental:** UEFA Champions League / Europa League / Conference League
  (current league-phase format), CONMEBOL Libertadores and Sudamericana,
  CONCACAF Champions Cup.
- **Players from countries not in the list** (e.g. France, Belgium, Saudi
  Arabia) are left out of v1. A "background pool" of transferable players from
  other countries is a later option.

### 3.1 Shadow leagues (promotion and relegation without a playable second tier)
A shadow league is a real second division that runs in the background. You
can't manage in it, and its matches have no commentary, but it produces real
promotion and relegation.

- **Clubs:** real second-tier clubs, each with a **team strength** number
  (from last season's finish and, in Europe, ClubElo).
- **Thin squads:** each shadow club has a squad of about 22, with real names
  where Wikidata has them, topped up with generated players. Ratings are
  estimated from team strength, with no hand-checking. This means a shadow club
  can always play a real match when needed.
- **League results:** simulated from team strength alone, which costs almost
  nothing. Tables, play-offs and champions are produced as normal, and news
  reports who went up.
- **Play-offs and cup ties against playable clubs** (e.g. the Bundesliga
  relegation play-off, or a cup tie against a second-tier club) use the full
  match engine with the thin squad.
- **On promotion:** the club joins the top tier with its squad, and its players
  start developing properly from then on. **On relegation:** the club drops into
  the shadow league, its strength is recalculated from its squad, and its
  players stay available to buy.
- **Domestic cups** start at the round where top-tier clubs enter. The other
  entrants are drawn from the shadow league plus a list of lower-league club
  names with generated squads.
- Any shadow league can be upgraded to a playable league later without
  changing saves.
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
- More countries (France, Belgium, Turkey, Mexico, Japan, and others).
- A mod/editor tool for the community to maintain data.
- Online leagues or hot-seat multiplayer (the classic games supported multiple
  human managers on one PC; hot-seat is cheap to add).

---

## 4. Season & start point

**The game starts on 15 June 2026.** Because the chosen countries run on two
different calendars, that date means different things in different places:

| Countries | Where they are on 15 June 2026 | How the game handles it |
|---|---|---|
| European leagues + Czech Republic | Off-season; the 2026-27 season starts in July/August | Pre-season. You get the whole summer window and a full season |
| Argentina | Between the Apertura and the Clausura | Clausura 2026 starts fresh, which fits neatly. Apertura results are loaded only for the relegation averages |
| Brazil, MLS | Mid-season, paused for the World Cup | Load a **standings snapshot** at the World Cup break (points, played, goal difference) and generate the remaining fixtures |

**The 2026 World Cup (11 June – 19 July) is in progress on day one.** It runs in
the background using the real results (entered as data). Players at the
tournament return late, tired, and with reputation or morale changes. Simulating
it live is a later option.

**Squads:** the *current* real squads (after the 2026 summer window) are used,
even though the game date is 15 June. The world matches the real 2026-27 season,
and the summer window is yours to shape.

**What a "season" means:** there is no single global season. Each competition
has its own cycle. The game calendar simply runs continuously, and "end of
season" events (promotion, awards, contracts expiring) fire per competition.

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

### 5.3 Distribution path: personal → free → paid
| Stage | Real names in shipped build? | Risk | What must be true |
|---|---|---|---|
| 1. Personal | Yes, via local data pack | Low | Nothing extra |
| 2. Free public release | Engine + fictional world ship publicly; real-name pack separate (community-maintained, editable) | Medium | Take advice on the data pack. No crests, kits or photos |
| 3. Paid release | Fictional names by default, with an in-game name editor (the FM approach), or licences (FIFPRO, leagues) | High without licences | Legal review; trademark search; licences if real names ship |

**Keep it "commercial-clean" from day one**, so moving to stage 3 doesn't mean
rebuilding everything:
- Use only sources whose terms allow commercial reuse in anything that ends up
  in a shipped pack (Wikidata is CC0). Sources with non-commercial or
  no-redistribution terms may be used to *check* our data, never copied into it.
- Record the **source of every field** in the pipeline, so a clean pack can be
  rebuilt automatically if a source becomes unusable.
- Player ratings are our own work (§6.2), so they are ours to sell.
- **Name check:** "Manager of Champions" is fine for personal use. Before
  selling, have it checked against existing trademarks. "Championship Manager"
  and UEFA's "Champions League" are both protected marks in the same space.

---

## 6. Data pipeline (building the 2026-27 database)

Football Manager's real advantage is its network of human researchers. We
replace that with **algorithmic ratings plus a focused human curation pass**.

### 6.1 Sources: free only (verify current terms and 2026-27 coverage before relying on any)
| Need | Free source | Role | Notes |
|---|---|---|---|
| Identity (name, DOB, nationality, position, current club) | **Wikidata** (CC0) | **Backbone**, safe to ship | Good for top leagues. Patchier for Czech, Argentine and lower-tier squads |
| Squads, fixtures, results | **football-data.org free tier** | Cross-check | Free tier covers a fixed set of top competitions (including several of ours and Brazil's Série A) but not all. Check its terms on commercial use |
| Squads, fixtures, results | **API-Football free tier** (100 requests/day) | Cross-check | The free tier may not include the current season; verify before relying on it |
| Fixture lists | **openfootball** (public domain) | Fixtures | Coverage varies by league |
| Team strength (Europe) | **ClubElo** | Calibration only | Not shipped. Doesn't cover Argentina, Brazil or MLS |
| Team strength (Americas) | Hand-set league strength + last season's table | Calibration | Small, one-off manual job |
| Competition rules | Official league / UEFA / CONMEBOL / MLS regulations | Hand-encoded | §7.4 |
| Gaps | **Manual entry + an in-game editor** | Fill-in | Expect manual work for missing squad members, especially in Czech, Argentina and lower tiers |
| Market values / transfer history | transfermarkt-datasets (scraped) | **Don't use** | Transfermarkt's terms are restrictive |

**What "free only" costs us:** more manual squad checking and slower updates.
Paying for a data API remains an option later, if the free sources prove too
thin. The pipeline puts each source behind an adapter, so adding one later is
easy.

Sources: [football-data.org overview](https://getbruin.com/docs/ingestr/supported-sources/football-data-org.html),
[API-Football notes](https://getbruin.com/docs/ingestr/soccer-sources/api-football.html),
[Sportmonks squads endpoint](https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/team-squads),
[transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets).

### 6.2 Rating generation (the hardest and most important part)
1. **Estimate Current Ability (CA, 1–200)** for each player from:
   - Club strength (Elo in Europe; league strength + table position in the Americas)
     × league strength coefficient
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
- Calendar: its own season cycle (Aug–May, Jul–May or calendar year) and
  window dates. There is no global season
- Format: league / cup / group + knockout / league phase (Swiss-style) +
  knockout / split-season (Apertura + Clausura) / conference + play-offs (MLS)
- Relegation methods: by table, by play-off, or by points average over
  several seasons (Argentina)
- Teams, rounds, legs, extra time / penalties, replays (e.g. FA Cup rules for
  2026-27)
- Tie-breakers (PL: goal difference first; LaLiga/Serie A: head-to-head first)
- Promotion/relegation, play-offs, splits (Scotland), and qualification slots
  into Europe
- Squad rules: registration limits, homegrown quotas, UEFA A/B lists, non-EU
  limits, foreign-player limits (Brazil, Argentina), MLS salary cap and
  Designated Player slots (simplified; no draft or allocation money)
- Transfer window dates per nation (European and South American windows
  differ, and players can move between them)

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
| Storage | In-memory game state, saved as JSON in **IndexedDB** (see `docs/decisions.md` #002) | Simple and fast; SQLite in WASM stays an option if saves get too big |
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

**How to read the sizes:** S, M and L show how big each phase is relative to the
others, measured as if one person coded it part-time (roughly 10–15 hours a
week): S ≈ 1–2 weeks, M ≈ 3–4 weeks, L ≈ 6–8 weeks.

**Claude writes the code**, so actual calendar time depends mostly on review and
playtesting, not typing. Each phase ends with something you can open, play or
check, and the next phase starts once you're happy with it. Expect the slowest
parts to be the ones that need human judgement: tuning the match engine until it
*feels* right (Phases 4–5) and checking star players' ratings (Phase 9).

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
| 9 | **Data pipeline v1 + curation editor**, European top tiers | L | All European top tiers loaded; top 1,500 players hand-checked |
| 10 | **Shadow leagues (§3.1), cups, UEFA competitions** | M | Clubs go up and down correctly over 10 simulated seasons; European qualification flows from league finishes |
| 11 | **Americas:** calendar-year seasons, Apertura/Clausura, relegation averages, MLS conferences and play-offs, mid-season standings snapshot, Libertadores / Sudamericana / CONCACAF Champions Cup, Argentina/Brazil/MLS data | L | Brazil, Argentina and MLS seasons run correctly alongside Europe; players move between continents |
| 12 | **World Cup 2026 background results + scouting, attribute masking, player search** | M | World Cup players return late; the wonderkid hunt works; masked ranges narrow with scouting |
| 13 | **International management** | S–M | National team selection and international breaks |
| 14 | **Polish:** performance budgets, keyboard shortcuts, mobile layout, themes, holiday mode | M | All §7.6 budgets met on a mid-range laptop and phone |
| 15 | **Release as a web app (PWA)**, save import/export | S | Installable from the browser and works offline |
| 16 | **January 2027 data update** (process test) | S | New pack generated and diffed; old saves unaffected |
| 17 | **Desktop build (Tauri)**, if wanted | S | Installable on Windows, macOS and Linux |

For comparison, one person coding this alone part-time would need roughly 10–14
months, with the MVP (Phases 0–6) at 3–4 months. With Claude coding, these
shrink considerably, but how much depends on how quickly each phase gets
playtested and approved.

**Your role in each phase:** play the build, say what feels wrong, and answer
design questions. The ratings check in Phase 9 is the biggest chunk of your
time: skimming star players' attributes and flagging the ones that look off.

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
| Free data has gaps (Czech, Argentina, lower tiers) | Incomplete squads | In-game editor + manual fill-in; paying for data stays an option |
| Two calendars (Europe vs Americas) | Complex scheduling bugs | Per-competition seasons from day one (§4); harness runs multi-year worlds |
| Data goes stale mid-season | Less real | Repeatable pipeline; January update process (Phase 15) |
| Browser storage limits / data loss | Lost saves | OPFS + export/import saves; desktop build writes to disk |

---

## 14. Open questions (need your input)

All earlier questions are answered in §0. Nothing is blocking Phase 0.

Decisions that can wait until their phase:
- **Look and feel** (Phase 3): plain modern, retro-inspired theme, or both?
- **Match speed defaults** (Phase 4): how fast commentary runs by default.
- **Which star players to hand-check first** (Phase 9).
