/**
 * Name pools for generated players (demo world now, youth intakes and regens later).
 * Common names only, so generated players read as plausible rather than as real people.
 */
export interface NamePool {
  first: readonly string[];
  last: readonly string[];
  /** Chance a player from this pool is known by a single name (e.g. Brazil). */
  singleNameChance?: number;
}

export const NAME_POOLS: Record<string, NamePool> = {
  english: {
    first: [
      'James', 'Jack', 'Harry', 'Oliver', 'George', 'Charlie', 'Thomas', 'Jacob', 'Alfie', 'Joe',
      'Daniel', 'Samuel', 'Lewis', 'Ryan', 'Callum', 'Ben', 'Luke', 'Adam', 'Kieran', 'Jordan',
      'Connor', 'Reece', 'Tyler', 'Nathan', 'Mason', 'Ethan', 'Josh', 'Liam', 'Max', 'Owen',
      'Marcus', 'Jamal', 'Kyle', 'Aaron', 'Elliot', 'Dominic', 'Theo', 'Archie', 'Freddie', 'Rhys',
    ],
    last: [
      'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright',
      'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood', 'Jackson', 'Clarke',
      'Hughes', 'Edwards', 'Turner', 'Harris', 'Cooper', 'Hill', 'Ward', 'Morris', 'Moore', 'Clark',
      'Lee', 'King', 'Baker', 'Harrison', 'Morgan', 'Allen', 'James', 'Scott', 'Phillips', 'Watson',
      'Davis', 'Parker', 'Price', 'Bennett', 'Young', 'Griffiths', 'Mitchell', 'Kelly', 'Cook', 'Carter',
      'Richardson', 'Bailey', 'Collins', 'Bell', 'Shaw', 'Murphy', 'Miller', 'Cox', 'Richards', 'Khan',
      'Marshall', 'Anderson', 'Simpson', 'Ellis', 'Adams', 'Wilkinson', 'Foster', 'Chapman', 'Mason', 'Gray',
    ],
  },
  scottish: {
    first: [
      'Callum', 'Lewis', 'Ross', 'Jamie', 'Scott', 'Craig', 'Euan', 'Fraser', 'Kyle', 'Ryan',
      'Andrew', 'Stuart', 'Liam', 'Kieran', 'Calum', 'Cameron', 'Grant', 'Greg', 'Aaron', 'Lennon',
    ],
    last: [
      'Campbell', 'Stewart', 'MacDonald', 'Robertson', 'Thomson', 'Anderson', 'Reid', 'Murray', 'Paterson',
      'Ross', 'Fraser', 'McLean', 'Henderson', 'Hamilton', 'Graham', 'Ferguson', 'Kerr', 'McKenzie', 'Shaw',
      'Christie', 'Forrest', 'McGregor', 'Docherty', 'Cameron', 'Gordon', 'Johnston', 'Burns', 'Duncan',
    ],
  },
  spanish: {
    first: [
      'Pablo', 'Javier', 'Sergio', 'Álvaro', 'Daniel', 'Adrián', 'Diego', 'Carlos', 'Iker', 'Marcos',
      'Hugo', 'Mario', 'Rubén', 'Raúl', 'Unai', 'Jorge', 'Alejandro', 'Óscar', 'Víctor', 'Gonzalo',
      'Fran', 'Íñigo', 'Mikel', 'Pedro', 'Rodrigo', 'Nacho', 'Aitor', 'Borja', 'Dani', 'Samu',
    ],
    last: [
      'García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín',
      'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez',
      'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Blanco', 'Molina', 'Morales',
      'Suárez', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Iglesias', 'Medina',
    ],
  },
  italian: {
    first: [
      'Lorenzo', 'Matteo', 'Alessandro', 'Andrea', 'Francesco', 'Federico', 'Riccardo', 'Davide', 'Marco', 'Luca',
      'Giorgio', 'Nicolò', 'Simone', 'Gianluca', 'Stefano', 'Tommaso', 'Edoardo', 'Filippo', 'Pietro', 'Daniele',
      'Manuel', 'Mattia', 'Giacomo', 'Samuele', 'Alessio', 'Michele', 'Emanuele', 'Fabio', 'Leonardo', 'Raffaele',
    ],
    last: [
      'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco',
      'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti',
      'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone',
      'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Serra', 'Coppola', 'De Santis', "D'Angelo", 'Marchetti', 'Parisi',
    ],
  },
  german: {
    first: [
      'Lukas', 'Leon', 'Jonas', 'Felix', 'Maximilian', 'Paul', 'Niklas', 'Tim', 'Jan', 'Florian',
      'Julian', 'Moritz', 'Tobias', 'Philipp', 'Kevin', 'Marcel', 'Sebastian', 'Dennis', 'Fabian', 'Marvin',
      'Jannik', 'Lennart', 'Nico', 'Luca', 'Malte', 'Robin', 'Timo', 'Kai', 'Benedikt', 'Elias',
    ],
    last: [
      'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
      'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann',
      'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier', 'Lehmann',
      'Schmid', 'Schulze', 'Maier', 'Köhler', 'Herrmann', 'König', 'Walter', 'Mayer', 'Huber', 'Kaiser',
    ],
  },
  dutch: {
    first: [
      'Daan', 'Sem', 'Lucas', 'Milan', 'Levi', 'Luuk', 'Thijs', 'Jesse', 'Bram', 'Stijn',
      'Ruben', 'Tim', 'Joey', 'Jurriën', 'Kees', 'Sven', 'Niels', 'Teun', 'Wout', 'Jasper',
    ],
    last: [
      'de Jong', 'Jansen', 'de Vries', 'van den Berg', 'van Dijk', 'Bakker', 'Janssen', 'Visser', 'Smit', 'Meijer',
      'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker', 'Brouwer',
      'de Wit', 'Dijkstra', 'Smits', 'de Graaf', 'van der Meer', 'Kok', 'Jacobs', 'Vermeulen', 'van Beek', 'Koster',
    ],
  },
  portuguese: {
    first: [
      'João', 'Rodrigo', 'Martim', 'Francisco', 'Tiago', 'Diogo', 'Gonçalo', 'Miguel', 'Rafael', 'Pedro',
      'André', 'Rúben', 'Bernardo', 'Nuno', 'Ricardo', 'Fábio', 'Bruno', 'Vitinha', 'Duarte', 'Tomás',
    ],
    last: [
      'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa',
      'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho',
      'Teixeira', 'Moreira', 'Correia', 'Mendes', 'Nunes', 'Soares', 'Vieira', 'Monteiro', 'Cardoso', 'Rocha',
    ],
  },
  czech: {
    first: [
      'Jakub', 'Jan', 'Tomáš', 'Lukáš', 'Matěj', 'Adam', 'Ondřej', 'Martin', 'David', 'Filip',
      'Vojtěch', 'Petr', 'Michal', 'Václav', 'Pavel', 'Josef', 'Marek', 'Daniel', 'Patrik', 'Vladimír',
    ],
    last: [
      'Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec',
      'Marek', 'Pospíšil', 'Pokorný', 'Hájek', 'Král', 'Jelínek', 'Růžička', 'Beneš', 'Fiala', 'Sedláček',
      'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Vaněk', 'Urban', 'Blažek', 'Kříž', 'Kovář',
    ],
  },
  argentine: {
    first: [
      'Santiago', 'Matías', 'Nicolás', 'Lautaro', 'Facundo', 'Joaquín', 'Franco', 'Agustín', 'Tomás', 'Gonzalo',
      'Julián', 'Lucas', 'Emiliano', 'Thiago', 'Ezequiel', 'Leandro', 'Maximiliano', 'Cristian', 'Germán', 'Nahuel',
    ],
    last: [
      'González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'García', 'Sánchez',
      'Romero', 'Sosa', 'Torres', 'Álvarez', 'Ruiz', 'Ramírez', 'Flores', 'Benítez', 'Acosta', 'Medina',
      'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Gutiérrez', 'Pereyra', 'Rojas', 'Molina', 'Castro', 'Ortiz',
    ],
  },
  brazilian: {
    first: [
      'Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Guilherme', 'Rafael', 'Felipe', 'Bruno', 'Thiago', 'Vinícius',
      'Gustavo', 'Leonardo', 'Rodrigo', 'Diego', 'Eduardo', 'Caio', 'João', 'Marcos', 'Igor', 'Douglas',
      'Wesley', 'Everton', 'Renan', 'Danilo', 'Arthur', 'Luan', 'Wellington', 'Fabrício', 'Alex', 'Murilo',
    ],
    last: [
      'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
      'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
      'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
    ],
    singleNameChance: 0.3,
  },
  american: {
    first: [
      'Tyler', 'Brandon', 'Christian', 'Jordan', 'Jack', 'Brenden', 'Miles', 'Josh', 'Matt', 'Chris',
      'Zach', 'Cole', 'Austin', 'Caleb', 'Gianluca', 'Diego', 'Malik', 'Paxton', 'Gio', 'Weston',
    ],
    last: [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Thomas',
      'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker',
      'Reyna', 'Adams', 'Morales', 'Ramirez', 'Turner', 'Carter', 'Hill', 'Green', 'Baker', 'Nelson',
    ],
  },
  french: {
    first: [
      'Lucas', 'Hugo', 'Théo', 'Mathis', 'Nathan', 'Enzo', 'Louis', 'Antoine', 'Maxime', 'Kylian',
      'Clément', 'Romain', 'Julien', 'Bastien', 'Moussa', 'Yanis', 'Ousmane', 'Adrien', 'Florian', 'Quentin',
    ],
    last: [
      'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau',
      'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier',
      'Diallo', 'Traoré', 'Camara', 'Koné', 'Mendy', 'Fofana', 'Bonnet', 'Mercier', 'Girard', 'Blanc',
    ],
  },
};

/** Syllables for made-up town names in the demo world. */
export const TOWN_PREFIXES = [
  'Ash', 'Bram', 'Carn', 'Dun', 'Elm', 'Fal', 'Glen', 'Hart', 'Kel', 'Lang',
  'Mar', 'Oak', 'Pen', 'Red', 'Stan', 'Thorn', 'Wex', 'Whit', 'Yar', 'Brock',
  'Cal', 'Har', 'Lin', 'Stow', 'Wey', 'Kings', 'Ross', 'Mill', 'Bel', 'Cor',
  'Dray', 'Fen', 'Gal', 'Hol', 'Kirk', 'Mor', 'Ral', 'Sel', 'Tam', 'Wynd',
] as const;

export const TOWN_SUFFIXES = [
  'ford', 'ton', 'by', 'bridge', 'field', 'ham', 'wick', 'mouth', 'port', 'stead',
  'borough', 'chester', 'dale', 'well', 'minster', 'bury', 'combe', 'ley', 'worth', 'haven',
] as const;

export const CLUB_SUFFIXES = [
  'United', 'City', 'Town', 'Athletic', 'Rovers', 'Wanderers', 'County', 'Rangers', 'Borough', 'Albion',
] as const;
