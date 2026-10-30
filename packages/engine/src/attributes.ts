/** Visible attributes are 1–20. Current/Potential Ability are 1–200 and never shown directly. */

export const TECHNICAL = [
  'crossing', 'dribbling', 'finishing', 'firstTouch', 'heading',
  'longShots', 'marking', 'passing', 'setPieces', 'tackling',
] as const;

export const MENTAL = [
  'aggression', 'anticipation', 'bravery', 'composure', 'decisions', 'determination', 'flair',
  'leadership', 'movement', 'positioning', 'teamwork', 'vision', 'workRate',
] as const;

export const PHYSICAL = [
  'acceleration', 'agility', 'balance', 'jumping', 'fitness', 'pace', 'stamina', 'strength',
] as const;

export const GOALKEEPING = ['handling', 'reflexes', 'oneOnOnes', 'commandOfArea', 'distribution'] as const;

export const HIDDEN = [
  'consistency', 'bigMatches', 'injuryProneness', 'versatility', 'adaptability',
  'ambition', 'loyalty', 'professionalism', 'temperament', 'sportsmanship',
] as const;

export type AttributeKey =
  | (typeof TECHNICAL)[number]
  | (typeof MENTAL)[number]
  | (typeof PHYSICAL)[number]
  | (typeof GOALKEEPING)[number];
export type HiddenKey = (typeof HIDDEN)[number];

export type Attributes = Record<AttributeKey, number>;
export type HiddenAttributes = Record<HiddenKey, number>;

export const ALL_ATTRIBUTES: readonly AttributeKey[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...GOALKEEPING];

export const ATTRIBUTE_LABELS: Record<AttributeKey | HiddenKey, string> = {
  crossing: 'Crossing',
  dribbling: 'Dribbling',
  finishing: 'Finishing',
  firstTouch: 'First Touch',
  heading: 'Heading',
  longShots: 'Long Shots',
  marking: 'Marking',
  passing: 'Passing',
  setPieces: 'Set Pieces',
  tackling: 'Tackling',
  aggression: 'Aggression',
  anticipation: 'Anticipation',
  bravery: 'Bravery',
  composure: 'Composure',
  decisions: 'Decisions',
  determination: 'Determination',
  flair: 'Flair',
  leadership: 'Leadership',
  movement: 'Movement',
  positioning: 'Positioning',
  teamwork: 'Teamwork',
  vision: 'Vision',
  workRate: 'Work Rate',
  acceleration: 'Acceleration',
  agility: 'Agility',
  balance: 'Balance',
  jumping: 'Jumping',
  fitness: 'Fitness',
  pace: 'Pace',
  stamina: 'Stamina',
  strength: 'Strength',
  handling: 'Handling',
  reflexes: 'Reflexes',
  oneOnOnes: 'One-on-Ones',
  commandOfArea: 'Command of Area',
  distribution: 'Distribution',
  consistency: 'Consistency',
  bigMatches: 'Big Matches',
  injuryProneness: 'Injury Proneness',
  versatility: 'Versatility',
  adaptability: 'Adaptability',
  ambition: 'Ambition',
  loyalty: 'Loyalty',
  professionalism: 'Professionalism',
  temperament: 'Temperament',
  sportsmanship: 'Sportsmanship',
};

export const POSITIONS = ['GK', 'DL', 'DC', 'DR', 'WBL', 'WBR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST'] as const;
export type Position = (typeof POSITIONS)[number];

/** Broad role groups used for squad building, sorting and display. */
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: 'GK',
  DL: 'DEF', DC: 'DEF', DR: 'DEF', WBL: 'DEF', WBR: 'DEF',
  DM: 'MID', ML: 'MID', MC: 'MID', MR: 'MID',
  AML: 'ATT', AMC: 'ATT', AMR: 'ATT', ST: 'ATT',
};

/**
 * How much each attribute matters for a position (0–1).
 * Used to turn Current Ability into a believable attribute profile.
 */
type Profile = Partial<Record<AttributeKey, number>>;

const GK_PROFILE: Profile = {
  handling: 1, reflexes: 1, oneOnOnes: 0.9, commandOfArea: 0.8, distribution: 0.6,
  positioning: 0.8, decisions: 0.7, composure: 0.6, agility: 0.8, jumping: 0.5, anticipation: 0.6,
  bravery: 0.5, firstTouch: 0.2, passing: 0.3,
};
const CB_PROFILE: Profile = {
  marking: 1, tackling: 1, heading: 0.9, positioning: 1, strength: 0.8, jumping: 0.8,
  bravery: 0.7, anticipation: 0.8, composure: 0.6, decisions: 0.7, passing: 0.4,
  pace: 0.5, aggression: 0.5, teamwork: 0.5,
};
const FB_PROFILE: Profile = {
  tackling: 0.8, marking: 0.8, positioning: 0.7, pace: 0.9, acceleration: 0.8, stamina: 0.9,
  crossing: 0.7, workRate: 0.8, teamwork: 0.6, dribbling: 0.4, passing: 0.5, anticipation: 0.5, agility: 0.5,
};
const WB_PROFILE: Profile = {
  ...FB_PROFILE, crossing: 0.9, dribbling: 0.6, stamina: 1, marking: 0.6,
};
const DM_PROFILE: Profile = {
  tackling: 0.9, positioning: 0.9, passing: 0.8, anticipation: 0.8, teamwork: 0.8, workRate: 0.8,
  decisions: 0.8, stamina: 0.7, strength: 0.6, marking: 0.6, composure: 0.6, firstTouch: 0.5, vision: 0.4,
};
const CM_PROFILE: Profile = {
  passing: 1, vision: 0.8, decisions: 0.9, teamwork: 0.8, stamina: 0.8, workRate: 0.8,
  firstTouch: 0.8, composure: 0.7, anticipation: 0.6, tackling: 0.5, longShots: 0.5, dribbling: 0.5,
  movement: 0.4, positioning: 0.4,
};
const WIDE_PROFILE: Profile = {
  pace: 0.9, acceleration: 0.9, dribbling: 0.9, crossing: 0.9, agility: 0.7, flair: 0.6,
  firstTouch: 0.7, stamina: 0.7, workRate: 0.6, passing: 0.5, movement: 0.5, balance: 0.5,
};
const WIDE_ATT_PROFILE: Profile = {
  ...WIDE_PROFILE, finishing: 0.6, movement: 0.7, flair: 0.8, crossing: 0.7, workRate: 0.4, longShots: 0.4,
};
const AMC_PROFILE: Profile = {
  vision: 1, passing: 0.9, flair: 0.8, dribbling: 0.8, firstTouch: 0.9, composure: 0.7,
  decisions: 0.8, longShots: 0.6, movement: 0.6, finishing: 0.5, agility: 0.6, balance: 0.5,
};
const ST_PROFILE: Profile = {
  finishing: 1, movement: 1, composure: 0.8, firstTouch: 0.8, anticipation: 0.7, pace: 0.7,
  acceleration: 0.7, heading: 0.6, strength: 0.6, dribbling: 0.5, jumping: 0.4, balance: 0.4, bravery: 0.4,
};

export const POSITION_PROFILES: Record<Position, Profile> = {
  GK: GK_PROFILE,
  DC: CB_PROFILE,
  DL: FB_PROFILE,
  DR: FB_PROFILE,
  WBL: WB_PROFILE,
  WBR: WB_PROFILE,
  DM: DM_PROFILE,
  MC: CM_PROFILE,
  ML: WIDE_PROFILE,
  MR: WIDE_PROFILE,
  AML: WIDE_ATT_PROFILE,
  AMR: WIDE_ATT_PROFILE,
  AMC: AMC_PROFILE,
  ST: ST_PROFILE,
};

/**
 * Natural secondary positions: a player whose main position is the key
 * can usually play these to the given familiarity (1–20).
 */
export const RELATED_POSITIONS: Record<Position, Partial<Record<Position, number>>> = {
  GK: {},
  DC: { DM: 9, DL: 7, DR: 7 },
  DL: { WBL: 16, DC: 9, ML: 9 },
  DR: { WBR: 16, DC: 9, MR: 9 },
  WBL: { DL: 16, ML: 13 },
  WBR: { DR: 16, MR: 13 },
  DM: { MC: 15, DC: 10 },
  MC: { DM: 13, AMC: 12, ML: 8, MR: 8 },
  ML: { AML: 16, MC: 10, WBL: 10 },
  MR: { AMR: 16, MC: 10, WBR: 10 },
  AML: { ML: 16, AMR: 10, ST: 9 },
  AMR: { MR: 16, AML: 10, ST: 9 },
  AMC: { MC: 13, ST: 12, AML: 9, AMR: 9 },
  ST: { AMC: 11, AML: 8, AMR: 8 },
};

export function clampAttribute(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value)));
}

/** Colour band for display: 1–5 poor, 6–10 fair, 11–15 good, 16–20 excellent. */
export function attributeBand(value: number): 'poor' | 'fair' | 'good' | 'excellent' {
  if (value >= 16) return 'excellent';
  if (value >= 11) return 'good';
  if (value >= 6) return 'fair';
  return 'poor';
}
