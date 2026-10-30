import { pick, type Rng } from './rng.ts';

/**
 * Commentary lines. {p} = player, {q} = second player, {t} = team, {o} = opponent, {k} = keeper.
 * Lines avoid gendered pronouns.
 */
const LINES = {
  kickoff: ['{t} get us under way.', 'And we are off at {s}.', 'The referee blows and {t} kick off.'],
  secondHalf: ['The second half is under way.', 'We go again for the second half.'],
  build: [
    '{p} picks the ball up in midfield.',
    '{p} drives forward with purpose.',
    '{p} switches the play out to {q}.',
    '{t} work it patiently across the back.',
    '{p} looks for {q} with a clever pass.',
    '{t} are probing for an opening.',
    '{p} skips past a challenge.',
  ],
  breakdown: [
    '{p} reads it well and cuts the pass out.',
    '{p} steps in with a timely tackle.',
    'Good defending from {p}.',
    'The move breaks down on the edge of the box.',
    '{o} stand firm.',
  ],
  chance: [
    '{q} slips the ball through to {p}…',
    '{p} finds a yard of space in the box…',
    '{q} picks out {p} with a fine pass…',
    '{p} cuts inside…',
    '{p} is in on goal…',
  ],
  crossChance: ['{q} whips in a cross… {p} rises…', 'A dangerous ball in from {q}… {p} gets on the end of it…'],
  longShot: ['{p} tries one from distance…', '{p} lets fly from 25 yards…'],
  goal: [
    'GOAL! {p} finishes it off!',
    'GOAL! {p} slots it into the bottom corner!',
    'GOAL! {p} makes no mistake!',
    'GOAL! What a strike from {p}!',
  ],
  headerGoal: ['GOAL! {p} powers the header home!', 'GOAL! {p} nods it in!'],
  penaltyAwarded: ['PENALTY to {t}! {q} is brought down in the box.', 'The referee points to the spot! Penalty to {t}.'],
  penaltyGoal: ['GOAL! {p} sends the keeper the wrong way.', 'GOAL! {p} buries the penalty.'],
  penaltyMiss: ['{k} saves the penalty from {p}!', '{p} hits the post from the spot!'],
  save: ['…but {k} saves well.', '…{k} gets down to push it away.', '…straight at {k}.', '…tipped over by {k}!'],
  miss: ['…but it flies wide.', '…just over the bar.', '…dragged wide of the post.', '…it clips the outside of the post!'],
  blocked: ['…blocked by {q}.', '…{q} throws a body in the way.'],
  corner: ['Corner to {t}.', '{t} win a corner.'],
  freeKick: ['Free kick to {t}. {q} brings down {p}.', '{q} catches {p}, and it is a free kick.'],
  freeKickShot: ['{p} steps up to take the free kick…', '{p} curls the free kick…'],
  offside: ['The flag is up: {p} was offside.', '{p} is caught offside.'],
  yellow: ['{p} is booked.', 'Yellow card for {p}.'],
  secondYellow: ['A second yellow for {p}, and that is a red card!'],
  red: ['RED CARD! {p} is sent off!'],
  injury: ['{p} is down injured and needs treatment.', '{p} pulls up and looks in real discomfort.'],
  sub: ['Substitution for {t}: {p} comes on for {q}.'],
  halftime: ['Half-time: {s}.'],
  fulltime: ['Full-time: {s}.'],
} as const;

export type LineKey = keyof typeof LINES;

export function say(rng: Rng, key: LineKey, vars: Record<string, string>): string {
  return pick(rng, LINES[key]).replace(/\{(\w)\}/g, (_m, k: string) => vars[k] ?? '');
}
