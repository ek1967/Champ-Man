/**
 * Scottish clubs for the 2026-27 season: the Premiership (St Johnstone up, Livingston down from
 * 2025-26) and the Championship. Membership was checked against the SPFL's 2026-27 fixture news.
 *
 * No open source of Scottish squads is reachable from the build, so players are generated.
 * `xi` is the target Current Ability of each club's best eleven (Premier League sides are about
 * 125–170, Championship sides 100–125), and `reputation` drives budgets and expectations as for
 * English clubs. Both are design judgements, meant to be reviewed.
 */
export interface ScottishClub {
  id: string;
  name: string;
  shortName: string;
  stadium: string;
  founded: number;
  colours: [primary: string, secondary: string];
  reputation: number;
  xi: number;
}

export const PREMIERSHIP_CLUBS: ScottishClub[] = [
  { id: 'celtic', name: 'Celtic', shortName: 'Celtic', stadium: 'Celtic Park', founded: 1887, colours: ['#018749', '#ffffff'], reputation: 74, xi: 126 },
  { id: 'rangers', name: 'Rangers', shortName: 'Rangers', stadium: 'Ibrox Stadium', founded: 1872, colours: ['#1b458f', '#ffffff'], reputation: 72, xi: 122 },
  { id: 'hearts', name: 'Heart of Midlothian', shortName: 'Hearts', stadium: 'Tynecastle Park', founded: 1874, colours: ['#8e1f2f', '#ffffff'], reputation: 56, xi: 111 },
  { id: 'aberdeen', name: 'Aberdeen', shortName: 'Aberdeen', stadium: 'Pittodrie Stadium', founded: 1903, colours: ['#c8102e', '#ffffff'], reputation: 55, xi: 106 },
  { id: 'hibernian', name: 'Hibernian', shortName: 'Hibs', stadium: 'Easter Road', founded: 1875, colours: ['#006633', '#ffffff'], reputation: 54, xi: 106 },
  { id: 'dundee-united', name: 'Dundee United', shortName: 'Dundee Utd', stadium: 'Tannadice Park', founded: 1909, colours: ['#f47920', '#000000'], reputation: 45, xi: 101 },
  { id: 'motherwell', name: 'Motherwell', shortName: 'Motherwell', stadium: 'Fir Park', founded: 1886, colours: ['#ffb81c', '#7a2531'], reputation: 44, xi: 101 },
  { id: 'kilmarnock', name: 'Kilmarnock', shortName: 'Kilmarnock', stadium: 'Rugby Park', founded: 1869, colours: ['#0057b8', '#ffffff'], reputation: 43, xi: 99 },
  { id: 'st-mirren', name: 'St Mirren', shortName: 'St Mirren', stadium: 'St Mirren Park', founded: 1877, colours: ['#000000', '#ffffff'], reputation: 42, xi: 99 },
  { id: 'dundee', name: 'Dundee', shortName: 'Dundee', stadium: 'Dens Park', founded: 1893, colours: ['#1c2c5b', '#ffffff'], reputation: 41, xi: 98 },
  { id: 'falkirk', name: 'Falkirk', shortName: 'Falkirk', stadium: 'Falkirk Stadium', founded: 1876, colours: ['#002f6c', '#ffffff'], reputation: 40, xi: 98 },
  { id: 'st-johnstone', name: 'St Johnstone', shortName: 'St Johnstone', stadium: 'McDiarmid Park', founded: 1884, colours: ['#0055a5', '#ffffff'], reputation: 41, xi: 97 },
];

export const SCOTTISH_CHAMPIONSHIP_CLUBS: ScottishClub[] = [
  { id: 'livingston', name: 'Livingston', shortName: 'Livingston', stadium: 'Almondvale Stadium', founded: 1943, colours: ['#ffcc00', '#000000'], reputation: 38, xi: 92 },
  { id: 'partick-thistle', name: 'Partick Thistle', shortName: 'Partick', stadium: 'Firhill Stadium', founded: 1876, colours: ['#e2001a', '#ffcc00'], reputation: 36, xi: 88 },
  { id: 'dunfermline', name: 'Dunfermline Athletic', shortName: 'Dunfermline', stadium: 'East End Park', founded: 1885, colours: ['#000000', '#ffffff'], reputation: 35, xi: 88 },
  { id: 'inverness-ct', name: 'Inverness Caledonian Thistle', shortName: 'Inverness CT', stadium: 'Caledonian Stadium', founded: 1994, colours: ['#0033a0', '#e2001a'], reputation: 33, xi: 85 },
  { id: 'ayr-united', name: 'Ayr United', shortName: 'Ayr', stadium: 'Somerset Park', founded: 1910, colours: ['#ffffff', '#000000'], reputation: 32, xi: 85 },
  { id: 'raith-rovers', name: 'Raith Rovers', shortName: 'Raith', stadium: "Stark's Park", founded: 1883, colours: ['#003399', '#ffffff'], reputation: 31, xi: 85 },
  { id: 'greenock-morton', name: 'Greenock Morton', shortName: 'Morton', stadium: 'Cappielow Park', founded: 1874, colours: ['#0055a5', '#ffffff'], reputation: 31, xi: 84 },
  { id: 'queens-park', name: "Queen's Park", shortName: "Queen's Park", stadium: 'Lesser Hampden', founded: 1867, colours: ['#000000', '#ffffff'], reputation: 30, xi: 83 },
  { id: 'arbroath', name: 'Arbroath', shortName: 'Arbroath', stadium: 'Gayfield Park', founded: 1878, colours: ['#800000', '#ffffff'], reputation: 25, xi: 80 },
  { id: 'stenhousemuir', name: 'Stenhousemuir', shortName: 'Stenhousemuir', stadium: 'Ochilview Park', founded: 1884, colours: ['#7a2531', '#ffffff'], reputation: 22, xi: 78 },
];
