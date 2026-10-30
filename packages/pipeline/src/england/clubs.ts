/**
 * English clubs for the 2026-27 season (membership confirmed by the openfootball fixture lists).
 * Reputation (1–100) is a design judgement of club size, used for board expectations, finances
 * and the strength of generated squads; it is meant to be reviewed and tuned.
 */
export interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
  /** Names used by openfootball and FPL. */
  aliases: string[];
  stadium: string;
  founded: number;
  colours: [primary: string, secondary: string];
  reputation: number;
}

export const PREMIER_LEAGUE_CLUBS: ClubInfo[] = [
  { id: 'arsenal', name: 'Arsenal', shortName: 'Arsenal', aliases: ['Arsenal FC'], stadium: 'Emirates Stadium', founded: 1886, colours: ['#ef0107', '#ffffff'], reputation: 92 },
  { id: 'aston-villa', name: 'Aston Villa', shortName: 'Aston Villa', aliases: ['Aston Villa FC'], stadium: 'Villa Park', founded: 1874, colours: ['#670e36', '#95bfe5'], reputation: 80 },
  { id: 'bournemouth', name: 'AFC Bournemouth', shortName: 'Bournemouth', aliases: ['Bournemouth'], stadium: 'Vitality Stadium', founded: 1899, colours: ['#da291c', '#000000'], reputation: 70 },
  { id: 'brentford', name: 'Brentford', shortName: 'Brentford', aliases: ['Brentford FC'], stadium: 'Gtech Community Stadium', founded: 1889, colours: ['#e30613', '#ffffff'], reputation: 69 },
  { id: 'brighton', name: 'Brighton & Hove Albion', shortName: 'Brighton', aliases: ['Brighton & Hove Albion FC', 'Brighton'], stadium: 'Amex Stadium', founded: 1901, colours: ['#0057b8', '#ffffff'], reputation: 74 },
  { id: 'chelsea', name: 'Chelsea', shortName: 'Chelsea', aliases: ['Chelsea FC'], stadium: 'Stamford Bridge', founded: 1905, colours: ['#034694', '#ffffff'], reputation: 90 },
  { id: 'coventry', name: 'Coventry City', shortName: 'Coventry', aliases: ['Coventry City FC'], stadium: 'Coventry Building Society Arena', founded: 1883, colours: ['#59cbe8', '#ffffff'], reputation: 62 },
  { id: 'crystal-palace', name: 'Crystal Palace', shortName: 'Crystal Palace', aliases: ['Crystal Palace FC'], stadium: 'Selhurst Park', founded: 1905, colours: ['#1b458f', '#c4122e'], reputation: 72 },
  { id: 'everton', name: 'Everton', shortName: 'Everton', aliases: ['Everton FC'], stadium: 'Hill Dickinson Stadium', founded: 1878, colours: ['#003399', '#ffffff'], reputation: 75 },
  { id: 'fulham', name: 'Fulham', shortName: 'Fulham', aliases: ['Fulham FC'], stadium: 'Craven Cottage', founded: 1879, colours: ['#ffffff', '#000000'], reputation: 70 },
  { id: 'hull', name: 'Hull City', shortName: 'Hull', aliases: ['Hull City AFC'], stadium: 'MKM Stadium', founded: 1904, colours: ['#f5a12d', '#000000'], reputation: 60 },
  { id: 'ipswich', name: 'Ipswich Town', shortName: 'Ipswich', aliases: ['Ipswich Town FC'], stadium: 'Portman Road', founded: 1878, colours: ['#0044a9', '#ffffff'], reputation: 63 },
  { id: 'leeds', name: 'Leeds United', shortName: 'Leeds', aliases: ['Leeds United FC', 'Leeds'], stadium: 'Elland Road', founded: 1919, colours: ['#ffffff', '#1d428a'], reputation: 72 },
  { id: 'liverpool', name: 'Liverpool', shortName: 'Liverpool', aliases: ['Liverpool FC'], stadium: 'Anfield', founded: 1892, colours: ['#c8102e', '#00b2a9'], reputation: 94 },
  { id: 'man-city', name: 'Manchester City', shortName: 'Man City', aliases: ['Manchester City FC'], stadium: 'Etihad Stadium', founded: 1880, colours: ['#6cabdd', '#1c2c5b'], reputation: 94 },
  { id: 'man-utd', name: 'Manchester United', shortName: 'Man Utd', aliases: ['Manchester United FC'], stadium: 'Old Trafford', founded: 1878, colours: ['#da291c', '#000000'], reputation: 90 },
  { id: 'newcastle', name: 'Newcastle United', shortName: 'Newcastle', aliases: ['Newcastle United FC'], stadium: "St James' Park", founded: 1892, colours: ['#241f20', '#ffffff'], reputation: 84 },
  { id: 'nottm-forest', name: 'Nottingham Forest', shortName: "Nott'm Forest", aliases: ['Nottingham Forest FC'], stadium: 'City Ground', founded: 1865, colours: ['#dd0000', '#ffffff'], reputation: 72 },
  { id: 'sunderland', name: 'Sunderland', shortName: 'Sunderland', aliases: ['Sunderland AFC'], stadium: 'Stadium of Light', founded: 1879, colours: ['#eb172b', '#ffffff'], reputation: 70 },
  { id: 'tottenham', name: 'Tottenham Hotspur', shortName: 'Tottenham', aliases: ['Tottenham Hotspur FC', 'Spurs'], stadium: 'Tottenham Hotspur Stadium', founded: 1882, colours: ['#ffffff', '#132257'], reputation: 85 },
];

export const CHAMPIONSHIP_CLUBS: ClubInfo[] = [
  { id: 'birmingham', name: 'Birmingham City', shortName: 'Birmingham', aliases: ['Birmingham City FC'], stadium: "St Andrew's", founded: 1875, colours: ['#0000ff', '#ffffff'], reputation: 60 },
  { id: 'blackburn', name: 'Blackburn Rovers', shortName: 'Blackburn', aliases: ['Blackburn Rovers FC'], stadium: 'Ewood Park', founded: 1875, colours: ['#009ee0', '#ffffff'], reputation: 56 },
  { id: 'bolton', name: 'Bolton Wanderers', shortName: 'Bolton', aliases: ['Bolton Wanderers FC'], stadium: 'Toughsheet Community Stadium', founded: 1874, colours: ['#ffffff', '#1a2a5a'], reputation: 52 },
  { id: 'bristol-city', name: 'Bristol City', shortName: 'Bristol City', aliases: ['Bristol City FC'], stadium: 'Ashton Gate', founded: 1894, colours: ['#e21c38', '#ffffff'], reputation: 54 },
  { id: 'burnley', name: 'Burnley', shortName: 'Burnley', aliases: ['Burnley FC'], stadium: 'Turf Moor', founded: 1882, colours: ['#6c1d45', '#99d6ea'], reputation: 65 },
  { id: 'cardiff', name: 'Cardiff City', shortName: 'Cardiff', aliases: ['Cardiff City FC'], stadium: 'Cardiff City Stadium', founded: 1899, colours: ['#0070b5', '#ffffff'], reputation: 55 },
  { id: 'charlton', name: 'Charlton Athletic', shortName: 'Charlton', aliases: ['Charlton Athletic FC'], stadium: 'The Valley', founded: 1905, colours: ['#d4021d', '#ffffff'], reputation: 50 },
  { id: 'derby', name: 'Derby County', shortName: 'Derby', aliases: ['Derby County FC'], stadium: 'Pride Park', founded: 1884, colours: ['#ffffff', '#000000'], reputation: 58 },
  { id: 'lincoln', name: 'Lincoln City', shortName: 'Lincoln', aliases: ['Lincoln City FC'], stadium: 'Sincil Bank', founded: 1884, colours: ['#e30613', '#ffffff'], reputation: 45 },
  { id: 'middlesbrough', name: 'Middlesbrough', shortName: 'Middlesbrough', aliases: ['Middlesbrough FC'], stadium: 'Riverside Stadium', founded: 1876, colours: ['#e11b22', '#ffffff'], reputation: 60 },
  { id: 'millwall', name: 'Millwall', shortName: 'Millwall', aliases: ['Millwall FC'], stadium: 'The Den', founded: 1885, colours: ['#001d5e', '#ffffff'], reputation: 52 },
  { id: 'norwich', name: 'Norwich City', shortName: 'Norwich', aliases: ['Norwich City FC'], stadium: 'Carrow Road', founded: 1902, colours: ['#fff200', '#00a650'], reputation: 60 },
  { id: 'portsmouth', name: 'Portsmouth', shortName: 'Portsmouth', aliases: ['Portsmouth FC'], stadium: 'Fratton Park', founded: 1898, colours: ['#001489', '#ffffff'], reputation: 54 },
  { id: 'preston', name: 'Preston North End', shortName: 'Preston', aliases: ['Preston North End FC'], stadium: 'Deepdale', founded: 1880, colours: ['#ffffff', '#1a2a5a'], reputation: 52 },
  { id: 'qpr', name: 'Queens Park Rangers', shortName: 'QPR', aliases: ['Queens Park Rangers FC'], stadium: 'Loftus Road', founded: 1882, colours: ['#1d5ba4', '#ffffff'], reputation: 53 },
  { id: 'sheffield-utd', name: 'Sheffield United', shortName: 'Sheffield Utd', aliases: ['Sheffield United FC'], stadium: 'Bramall Lane', founded: 1889, colours: ['#ee2737', '#ffffff'], reputation: 63 },
  { id: 'southampton', name: 'Southampton', shortName: 'Southampton', aliases: ['Southampton FC'], stadium: "St Mary's Stadium", founded: 1885, colours: ['#d71920', '#ffffff'], reputation: 66 },
  { id: 'stoke', name: 'Stoke City', shortName: 'Stoke', aliases: ['Stoke City FC'], stadium: 'bet365 Stadium', founded: 1863, colours: ['#e03a3e', '#ffffff'], reputation: 57 },
  { id: 'swansea', name: 'Swansea City', shortName: 'Swansea', aliases: ['Swansea City AFC'], stadium: 'Swansea.com Stadium', founded: 1912, colours: ['#ffffff', '#000000'], reputation: 55 },
  { id: 'watford', name: 'Watford', shortName: 'Watford', aliases: ['Watford FC'], stadium: 'Vicarage Road', founded: 1881, colours: ['#fbee23', '#000000'], reputation: 58 },
  { id: 'west-brom', name: 'West Bromwich Albion', shortName: 'West Brom', aliases: ['West Bromwich Albion FC'], stadium: 'The Hawthorns', founded: 1878, colours: ['#122f67', '#ffffff'], reputation: 60 },
  { id: 'west-ham', name: 'West Ham United', shortName: 'West Ham', aliases: ['West Ham United FC', 'West Ham'], stadium: 'London Stadium', founded: 1895, colours: ['#7a263a', '#1bb1e7'], reputation: 76 },
  { id: 'wolves', name: 'Wolverhampton Wanderers', shortName: 'Wolves', aliases: ['Wolverhampton Wanderers FC', 'Wolves'], stadium: 'Molineux', founded: 1877, colours: ['#fdb913', '#231f20'], reputation: 72 },
  { id: 'wrexham', name: 'Wrexham', shortName: 'Wrexham', aliases: ['Wrexham AFC'], stadium: 'Racecourse Ground', founded: 1864, colours: ['#e4002b', '#ffffff'], reputation: 55 },
];

export function findClub(clubs: readonly ClubInfo[], name: string): ClubInfo | undefined {
  return clubs.find((c) => c.name === name || c.shortName === name || c.aliases.includes(name));
}
