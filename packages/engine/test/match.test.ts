import { describe, expect, it } from 'vitest';
import { completeMatch, createGame, matchContext, startMatch, takeJob } from '../src/game.ts';
import { changeLiveFormation, kickOff, liveLineup, type LiveMatch, playToEnd, stepMatch, substitute, swapLivePositions } from '../src/match.ts';
import { currentSeasonOf, seasonFixtures, squadOf } from '../src/queries.ts';
import { createRng } from '../src/rng.ts';
import { autoTactics, DEFAULT_INSTRUCTIONS, FORMATIONS, type TeamInstructions } from '../src/tactics.ts';
import { DEMO_TOP_DIVISION } from '../src/worldgen.ts';

const state = createGame({ seed: 'match-test', managerName: 'Test' });
const ctx = matchContext(state);
const clubs = currentSeasonOf(state, DEMO_TOP_DIVISION)!.clubIds;
// Two mid-table clubs of similar size.
const sorted = [...clubs].sort((a, b) => state.world.clubs[b]!.reputation - state.world.clubs[a]!.reputation);
const [homeId, awayId] = [sorted[9]!, sorted[10]!];

function play(seed: number, home: Partial<TeamInstructions> = {}, away: Partial<TeamInstructions> = {}): LiveMatch {
  const live = kickOff(ctx, {
    fixtureId: 'test',
    date: state.date,
    home: { clubId: homeId, human: false, tactics: { ...autoTactics(squadOf(state, homeId), state.date), instructions: { ...DEFAULT_INSTRUCTIONS, ...home } } },
    away: { clubId: awayId, human: true, tactics: { ...autoTactics(squadOf(state, awayId), state.date), instructions: { ...DEFAULT_INSTRUCTIONS, ...away } } },
    rng: createRng(seed),
    commentary: false,
  });
  playToEnd(ctx, live);
  return live;
}

describe('match engine', () => {
  it('plays a full match through both halves', () => {
    const live = kickOff(ctx, {
      fixtureId: 'x', date: state.date,
      home: { clubId: homeId, human: false, tactics: autoTactics(squadOf(state, homeId), state.date) },
      away: { clubId: awayId, human: false, tactics: autoTactics(squadOf(state, awayId), state.date) },
      rng: createRng(1), commentary: true,
    });
    const kinds = new Set<string>();
    let guard = 0;
    while (live.period !== 'full' && guard++ < 200) for (const e of stepMatch(ctx, live)) kinds.add(e.kind);
    expect(live.period).toBe('full');
    expect(kinds.has('kickoff') && kinds.has('halftime') && kinds.has('fulltime')).toBe(true);
    expect(live.minute).toBeGreaterThanOrEqual(90);
    expect(live.events.length).toBeGreaterThan(20);
    expect(live.home.stats.possession + live.away.stats.possession).toBe(100);
    expect(live.goals).toHaveLength(live.score[0] + live.score[1]);
  });

  it('is reproducible from the same seed', () => {
    const a = play(42);
    const b = play(42);
    expect(a.score).toEqual(b.score);
    expect(a.home.stats).toEqual(b.home.stats);
  });

  it('limits substitutions to five, and only from the bench', () => {
    const live = kickOff(ctx, {
      fixtureId: 'x', date: state.date,
      home: { clubId: homeId, human: true, tactics: autoTactics(squadOf(state, homeId), state.date) },
      away: { clubId: awayId, human: true, tactics: autoTactics(squadOf(state, awayId), state.date) },
      rng: createRng(2), commentary: false,
    });
    stepMatch(ctx, live);
    let made = 0;
    for (const benchId of [...live.home.bench]) {
      const out = live.home.onPitch.find((x) => x.position !== 'GK');
      if (out && substitute(ctx, live, 'home', out.id, benchId)) made++;
    }
    expect(made).toBe(5);
    expect(live.home.onPitch).toHaveLength(11);
    expect(substitute(ctx, live, 'home', live.home.onPitch[1]!.id, 'not-on-bench')).toBe(false);
  });

  it('lets a manager swap positions and change formation during the match', () => {
    const live = kickOff(ctx, {
      fixtureId: 'x', date: state.date,
      home: { clubId: homeId, human: true, tactics: { ...autoTactics(squadOf(state, homeId), state.date), formation: '4-4-2' } },
      away: { clubId: awayId, human: true, tactics: autoTactics(squadOf(state, awayId), state.date) },
      rng: createRng(3), commentary: true,
    });
    for (let i = 0; i < 20; i++) stepMatch(ctx, live);
    const starters = [...live.home.tactics.lineup];
    const [a, b] = [live.home.onPitch[1]!, live.home.onPitch[5]!];
    const [posA, posB] = [a.position, b.position];
    expect(swapLivePositions(ctx, live, 'home', a.id, b.id)).toBe(true);
    expect([a.position, b.position]).toEqual([posB, posA]);
    expect(swapLivePositions(ctx, live, 'home', a.id, 'not-playing')).toBe(false);

    const keeper = live.home.onPitch.find((x) => x.position === 'GK')!.id;
    expect(changeLiveFormation(ctx, live, 'home', '3-5-2')).toBe(true);
    expect(live.home.tactics.formation).toBe('3-5-2');
    // Every slot of the new shape is filled, the keeper is still in goal, and nobody left the pitch.
    expect(liveLineup(live, 'home').every((id) => id !== null)).toBe(true);
    expect(live.home.onPitch.find((x) => x.id === keeper)?.position).toBe('GK');
    expect(live.home.onPitch).toHaveLength(11);
    expect(live.home.tactics.lineup).toEqual(starters);
    expect(live.events.some((e) => e.kind === 'tactic')).toBe(true);
    playToEnd(ctx, live);
    expect(live.period).toBe('full');
  });

  it('responds to mentality: attacking sides score and concede more', () => {
    let attackingGoals = 0;
    let defensiveGoals = 0;
    const n = 120;
    for (let i = 0; i < n; i++) {
      const a = play(1000 + i, { mentality: 'attacking' }, { mentality: 'attacking' });
      const d = play(1000 + i, { mentality: 'defensive' }, { mentality: 'defensive' });
      attackingGoals += a.score[0] + a.score[1];
      defensiveGoals += d.score[0] + d.score[1];
    }
    expect(attackingGoals).toBeGreaterThan(defensiveGoals * 1.15);
  });

  it('gives no extreme setting a decisive edge over balanced tactics', () => {
    const n = 200;
    const pointsWith = (instructions: Partial<TeamInstructions>) => {
      let points = 0;
      for (let i = 0; i < n; i++) {
        const live = play(5000 + i, instructions, {});
        points += live.score[0] > live.score[1] ? 3 : live.score[0] === live.score[1] ? 1 : 0;
      }
      return points / n;
    };
    const balanced = pointsWith({});
    const extremes: Array<Partial<TeamInstructions>> = [
      { mentality: 'attacking', pressing: 'high', tempo: 'fast', line: 'high', tackling: 'hard', passing: 'direct', width: 'wide' },
      { mentality: 'defensive', pressing: 'low', tempo: 'slow', line: 'deep', width: 'narrow' },
      { mentality: 'ultra-attacking' },
      { mentality: 'ultra-defensive', counter: 'on' },
      { line: 'high', offsideTrap: 'on', pressing: 'high' },
    ];
    for (const extreme of extremes) expect(pointsWith(extreme) - balanced).toBeLessThan(0.2);
  });
});

describe('player instructions', () => {
  it('make a striker told to get forward score more than one told to stay back', () => {
    const tactics = autoTactics(squadOf(state, homeId), state.date);
    const slot = tactics.lineup.findIndex((_, i) => ['ST', 'AMC', 'AML', 'AMR'].includes(String(FORMATIONS[tactics.formation][i]?.position)));
    const striker = tactics.lineup[slot]!;
    const goalsWith = (runs: 'forward' | 'stay') => {
      let goals = 0;
      for (let i = 0; i < 150; i++) {
        const live = kickOff(ctx, {
          fixtureId: 't', date: state.date,
          home: { clubId: homeId, human: true, tactics: { ...tactics, players: { [striker]: { runs, shooting: 'normal', closingDown: 'normal' } } } },
          away: { clubId: awayId, human: false, tactics: autoTactics(squadOf(state, awayId), state.date) },
          rng: createRng(7000 + i), commentary: false,
        });
        playToEnd(ctx, live);
        goals += live.players[striker]?.goals ?? 0;
      }
      return goals;
    };
    expect(goalsWith('forward')).toBeGreaterThan(goalsWith('stay'));
  });
});

describe('completing a match', () => {
  it('records results, apps, fitness and the manager news', () => {
    const game = createGame({ seed: 'complete-test', managerName: 'Test' });
    const clubId = currentSeasonOf(game, DEMO_TOP_DIVISION)!.clubIds[0]!;
    takeJob(game, clubId);
    const fixture = seasonFixtures(game, currentSeasonOf(game, DEMO_TOP_DIVISION)!).find((f) => f.homeId === clubId || f.awayId === clubId)!;
    game.date = fixture.date;
    const live = startMatch(game, fixture, true);
    playToEnd(matchContext(game), live);
    completeMatch(game, fixture, live);
    expect(fixture.result?.stats).toBeDefined();
    expect(fixture.result?.ratings).toBeDefined();
    const starters = fixture.result!.lineups!.home;
    const p = game.world.players[starters[3]!]!;
    expect(p.stats[0]?.apps).toBe(1);
    expect(p.condition).toBeLessThan(100);
    expect(p.form).toHaveLength(1);
    expect(game.news[0]?.category).toBe('result');
  });
});
