import type { Position } from './attributes.ts';
import type { Lineup } from './selection.ts';
import { chance, normal, poisson, type Rng, randInt, weightedPick } from './rng.ts';
import type { GoalEvent, Id, MatchResult, Player } from './types.ts';

/**
 * Quick simulation: a result from team strength alone, with no commentary.
 * Used for shadow leagues now and for every non-human match once the full
 * match engine exists (PLAN §7.2). Tuned by the calibration harness.
 */
export const QUICK_SIM = {
  /** Expected goals for two equal teams. */
  homeGoals: 1.46,
  awayGoals: 1.13,
  /** How strongly a strength gap changes expected goals (per 10 points of strength). */
  sensitivity: 0.16,
  /** Match-to-match form swing, as a fraction of strength. */
  formSd: 0.035,
} as const;

export function expectedGoals(homeStrength: number, awayStrength: number): [home: number, away: number] {
  const gap = (homeStrength - awayStrength) / 10;
  return [
    QUICK_SIM.homeGoals * Math.exp(QUICK_SIM.sensitivity * gap),
    QUICK_SIM.awayGoals * Math.exp(-QUICK_SIM.sensitivity * gap),
  ];
}

export function simulateScore(rng: Rng, homeStrength: number, awayStrength: number): [home: number, away: number] {
  const home = homeStrength * (1 + normal(rng, 0, QUICK_SIM.formSd));
  const away = awayStrength * (1 + normal(rng, 0, QUICK_SIM.formSd));
  const [lh, la] = expectedGoals(home, away);
  return [poisson(rng, lh), poisson(rng, la)];
}

const SCORING_WEIGHT: Record<Position, number> = {
  GK: 0.01, DC: 0.7, DL: 0.5, DR: 0.5, WBL: 0.6, WBR: 0.6, DM: 0.8,
  MC: 1.6, ML: 2.2, MR: 2.2, AML: 3.5, AMR: 3.5, AMC: 3.5, ST: 5,
};

const ASSIST_WEIGHT: Record<Position, number> = {
  GK: 0.05, DC: 0.4, DL: 1.5, DR: 1.5, WBL: 1.8, WBR: 1.8, DM: 1,
  MC: 2, ML: 2.5, MR: 2.5, AML: 3, AMR: 3, AMC: 3, ST: 1.8,
};

function pickScorer(rng: Rng, lineup: Lineup, players: Record<Id, Player>): Id | null {
  const slots = lineup.playerIds.map((id, i) => ({ id, position: lineup.positions[i] as Position }));
  const slot = weightedPick(rng, slots, ({ id, position }) => {
    const p = players[id];
    if (!p) return 0;
    return SCORING_WEIGHT[position] * ((p.attributes.finishing + p.attributes.movement) / 20) ** 2;
  });
  return slot.id || null;
}

function pickAssist(rng: Rng, lineup: Lineup, players: Record<Id, Player>, scorerId: Id): Id | null {
  const slots = lineup.playerIds
    .map((id, i) => ({ id, position: lineup.positions[i] as Position }))
    .filter((s) => s.id !== scorerId);
  const slot = weightedPick(rng, slots, ({ id, position }) => {
    const p = players[id];
    if (!p) return 0;
    const a = p.attributes;
    return ASSIST_WEIGHT[position] * ((a.passing + a.vision + a.crossing) / 30) ** 2;
  });
  return slot.id || null;
}

function goalEvents(
  rng: Rng,
  count: number,
  clubId: Id,
  lineup: Lineup,
  players: Record<Id, Player>,
): GoalEvent[] {
  const events: GoalEvent[] = [];
  for (let i = 0; i < count; i++) {
    const minute = chance(rng, 0.06) ? 90 + randInt(rng, 1, 5) : randInt(rng, 1, 90);
    if (chance(rng, 0.03)) {
      events.push({ minute, clubId, scorerId: null, assistId: null });
      continue;
    }
    const scorerId = pickScorer(rng, lineup, players);
    const assistId = scorerId && chance(rng, 0.72) ? pickAssist(rng, lineup, players, scorerId) : null;
    events.push({ minute, clubId, scorerId, assistId });
  }
  return events;
}

/** Full quick result with scorers, for competitions where player stats are tracked. */
export function simulateMatch(
  rng: Rng,
  home: { clubId: Id; lineup: Lineup },
  away: { clubId: Id; lineup: Lineup },
  players: Record<Id, Player>,
): MatchResult {
  const [homeGoals, awayGoals] = simulateScore(rng, home.lineup.strength, away.lineup.strength);
  const goals = [
    ...goalEvents(rng, homeGoals, home.clubId, home.lineup, players),
    ...goalEvents(rng, awayGoals, away.clubId, away.lineup, players),
  ].sort((a, b) => a.minute - b.minute);
  return {
    homeGoals,
    awayGoals,
    goals,
    lineups: { home: [...home.lineup.playerIds], away: [...away.lineup.playerIds] },
  };
}
