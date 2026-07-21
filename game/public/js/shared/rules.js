// Hand-maintained rule constants. Card content lives in the generated data.js;
// this is the numbers-and-structure layer that the engine reads.
// Reference: docs/REGLAS_v3.md

export const STARTING_GOLD = 8;
export const BASE_MAX_MANA = 4;
export const BASE_EQUIPMENT_SLOTS = 6;
export const DICE_PER_COMBATANT = 2;

// The board is 8 tiles grouped into 4 arcs. Each arc holds one day tile and one
// night tile, and the roulette blocks a whole arc -- so a single spin closes one
// day option and one night option. This pairing is baked into the printed board.
export const ARCS = [
  { id: 'norte',  day: 'mazmorra', night: 'descanso' },
  { id: 'este',   day: 'tienda',   night: 'trabajo'  },
  { id: 'sur',    day: 'evento',   night: 'evento'   },
  { id: 'oeste',  day: 'torre',    night: 'ring'     },
];

export const DAY_TILES = ARCS.map((a) => a.day);
export const NIGHT_TILES = ARCS.map((a) => a.night);

export const TILE_LABELS = {
  mazmorra: 'Mazmorra',
  tienda: 'Tienda',
  torre: 'Torre',
  evento: 'Evento',
  descanso: 'Descanso',
  trabajo: 'Trabajo',
  // El arte del tablero dice "Apuestas", pero la casilla es un ring de peleas.
  ring: 'Ring',
};

export function arcOfTile(tile, phase) {
  return ARCS.find((a) => (phase === 'day' ? a.day : a.night) === tile) ?? null;
}

// --- economy ---------------------------------------------------------------

export const TRABAJO_GOLD = 5;
export const RING_WIN_GOLD = 12;  // playtest buff: was 10, nobody picked it
export const RING_ALONE_GOLD = 3;
export const TOWER_INCOME = 4;
export const TOWER_LOCK_TURNS = 2;

// --- monsters --------------------------------------------------------------

// 10 monsters drawn from the pool of 20, revealed easiest tier first.
export const MONSTER_DECK_COMPOSITION = [
  { tier: 'duende', count: 2 },
  { tier: 'ogro',   count: 2 },
  { tier: 'golem',  count: 3 },
  { tier: 'dragon', count: 3 },
];

export const TOTAL_MONSTERS = MONSTER_DECK_COMPOSITION.reduce((n, t) => n + t.count, 0);

// Everyone gains +1 permanent max mana on each tier transition (3 over a game).
export const MANA_GAIN_PER_TIER_TRANSITION = 1;

/** Monster HP. `perPlayer` scales with everyone at the table, not just combatants. */
export function monsterHp(monster, playersAtTable, { legendary = false } = {}) {
  const { hp } = monster;
  if (hp.kind === 'special') return null;
  const base = hp.kind === 'perPlayer' ? hp.value * playersAtTable : hp.value;
  return legendary ? base * 2 : base;
}

// --- tournament ------------------------------------------------------------

export const GOLD_CONVERSIONS = [
  { gold: 5,  label: '1 equipamiento aleatorio', effect: 'equipment' },
  { gold: 15, label: '1 espacio de equipamiento', effect: 'slot' },
  { gold: 30, label: '1 maná adicional', effect: 'mana' },
];

// Seeds are 0-indexed by tournament order; seed 0 is the "primer puesto" and
// always gets the lighter path.
export const BRACKETS = {
  3: [
    { round: 'Semifinal', matches: [['seed:1', 'seed:2']] },
    { round: 'Final',     matches: [['seed:0', 'win:0.0']] },
  ],
  4: [
    { round: 'Semifinal', matches: [['seed:0', 'seed:1'], ['seed:2', 'seed:3']] },
    { round: 'Final',     matches: [['win:0.0', 'win:0.1']] },
  ],
  5: [
    { round: 'Cuartos',   matches: [['seed:1', 'seed:2'], ['seed:3', 'seed:4']] },
    { round: 'Semifinal', matches: [['win:0.0', 'win:0.1']] },
    { round: 'Final',     matches: [['seed:0', 'win:1.0']] },
  ],
  6: [
    { round: 'Cuartos',   matches: [['seed:0', 'seed:1'], ['seed:2', 'seed:3'], ['seed:4', 'seed:5']] },
    { round: 'Semifinal', matches: [['win:0.1', 'win:0.2']] },
    { round: 'Final',     matches: [['win:0.0', 'win:1.0']] },
  ],
};
