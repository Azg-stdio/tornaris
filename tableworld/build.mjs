// Builds the Table World game document for Tornaris from the shared card data.
//
//   node tableworld/build.mjs   ->  tableworld/tornaris.json   (one table, 6 seats, 3-6 players)
//
// Card content comes from game/public/js/shared/data.js (generated from docs/*.csv),
// rules from docs/REGLAS_v3.md. The turn skeleton, card movement and checks are
// declarative rules; arithmetic and monster abilities live in tornaris.lua.
//
// Players sit with the + over a seat and press Start: only those seats play (Table World seat occupancy).
// Empty seats get no actions, are skipped by the token and do not count as players (monster life, shop size,
// tournament bracket).
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../game/public/js/shared/data.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_ID = 'tornaris';
const ASSET_DIR = 'assets';
const r3 = (v) => Math.round(v * 1000) / 1000;

// --- seats -----------------------------------------------------------------
// The table is 2.4 x 1.7 m. Six seats, seat_1 south-right then clockwise seen from above. Between each hand and the
// board lies the seat's player mat (tools/mat.py): character, coins, mana, spent mana, combat total and dice.
// `rot` is the hand's yaw; `arena` the direction (degrees, 0 = east, 90 = north) of the seat's side of the Coliseo.
const TABLE = [2.4, 1.7];
const SEAT_GEO = [
  { n: 1, hand: [0.45, -0.77], rot: 0, arena: -60 },
  { n: 2, hand: [-0.45, -0.77], rot: 0, arena: -120 },
  { n: 3, hand: [-1.12, 0], rot: 90, arena: 180 },
  { n: 4, hand: [-0.45, 0.77], rot: 180, arena: 120 },
  { n: 5, hand: [0.45, 0.77], rot: 180, arena: 60 },
  { n: 6, hand: [1.12, 0], rot: 270, arena: 0 },
];
const COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];
const SEAT_RGB = { red: [0.85, 0.2, 0.2], blue: [0.2, 0.4, 0.9], green: [0.2, 0.7, 0.3], yellow: [0.95, 0.8, 0.2], orange: [0.95, 0.5, 0.15], purple: [0.6, 0.3, 0.8] };
// Mat coordinates: x to the player's right, z towards the board, metres from the mat's centre (matches tools/mat.py).
const MAT = {
  size: [0.62, 0.22], inward: 0.18,
  pj: [-0.2475, 0.02], ficha: [-0.2475, -0.065], token: [-0.36, 0], // the turn token waits beside the mat
  oro: { c: [-0.105, 0.02], s: [0.15, 0.16] }, mana: { c: [0.035, 0.02], s: [0.11, 0.16] }, gastado: { c: [0.145, 0.02], s: [0.09, 0.16] },
  total: [0.2525, 0.02], dados: [[0.224, -0.068], [0.2525, -0.068], [0.281, -0.068]],
};
const seatDirs = (rot) => {
  const r = (rot * Math.PI) / 180;
  return { right: [r3(Math.cos(r)), r3(-Math.sin(r))], inn: [r3(Math.sin(r)), r3(Math.cos(r))] };
};
const seats = SEAT_GEO.map((g, i) => {
  const { right, inn } = seatDirs(g.rot);
  const mat = [r3(g.hand[0] + MAT.inward * inn[0]), r3(g.hand[1] + MAT.inward * inn[1])];
  return { ...g, id: `seat_${g.n}`, handZone: `hand_${g.n}`, color: COLORS[i], name: `Asiento ${g.n}`, right, inn, mat, face: (g.rot + 180) % 360 };
});
// A point on a seat's mat, in table metres; on3 makes it a position on the table top.
const onMat = (s, [lx, lz]) => [r3(s.mat[0] + lx * s.right[0] + lz * s.inn[0]), r3(s.mat[1] + lx * s.right[1] + lz * s.inn[1])];
const on3 = ([x, z], y = 0) => [x, y, z];
// The token passes "a la derecha": counterclockwise seen from above, i.e. 1, 6, 5, 4, 3, 2.
const TURN_ORDER = [1, 6, 5, 4, 3, 2].map((n) => `seat_${n}`);

// --- content ---------------------------------------------------------------
const PJ = {
  celeste: { slug: 'druida', obj: 'pocion' },
  skull: { slug: 'nigromante', obj: 'portal' },
  remi: { slug: 'hombre-topo', obj: 'cuervo' },
  baltazar: { slug: 'mago', obj: 'cristal' },
  braulia: { slug: 'escudera', obj: 'familiar' },
  nyra: { slug: 'cazadora', obj: 'guante' },
};
const OBJ_SLUG = { 1: 'familiar', 2: 'portal', 3: 'cuervo', 4: 'cristal', 5: 'guante', 6: 'pocion' };
const DAY_SLUG = {
  1: 'dia_normal', 2: 'feria', 3: 'tregua', 4: 'legendario', 5: 'suerte', 6: 'cerrada', 7: 'doble_evento',
  8: 'mercado_negro', 9: 'caza', 10: 'torre_disputa', 11: 'caotico', 12: 'transparente', 13: 'recuperacion',
};
const NIGHT_SLUG = {
  1: 'noche_normal', 2: 'ingresos_extra', 3: 'competencia', 4: 'descanso_obligatorio', 5: 'mercado_nocturno',
  6: 'noche_tranquila', 7: 'noche_caos', 8: 'bonanza', 9: 'remate', 10: 'noche_magica', 11: 'oraculo',
};
// Structured rewards/penalties; the card text stays the source of truth for players.
const MON_REWARD = {
  1: { oro: 5 }, 2: { eq: 1 }, 3: { oro: 10 }, 4: { eq: 1 }, 5: { eq: 1 }, 6: { eq: 1, oro: 5 }, 7: { eq: 1, oro: 3 },
  8: { eq: 1 }, 9: { eq: 1 }, 10: { eq: 2, oro: 8 }, 11: { eq: 2, oro: 8 }, 12: { eq: 2, oro: 10 }, 13: { eq: 2, oro: 10 },
  14: { eq: 2, oro: 12 }, 15: { eq: 2, oro: 12 }, 16: { eq: 2, oro: 14 }, 17: { eq: 3, oro: 15 }, 18: { mana: 1 },
  19: { mana: 1, oro: 10 }, 20: {},
};
const MON_PENALTY = { 1: 2, 2: 3, 3: 4, 4: 3, 5: 2, 6: 4, 7: 4, 8: 4, 9: 0, 10: 5, 11: 4, 12: 5, 13: 6, 14: 6, 15: 0, 16: 10, 17: 6, 18: 10, 19: 10, 20: 0 };
const TIERS = ['duende', 'ogro', 'golem', 'dragon'];
const TIER_PICK = { duende: 2, ogro: 2, golem: 3, dragon: 3 };
const TIER_LABEL = { duende: 'Duende', ogro: 'Ogro', golem: 'Gólem', dragon: 'Dragón' };

const rgb = (hex) => [1, 3, 5].map((i) => r3(parseInt(hex.slice(i, i + 2), 16) / 255));
const STYLE = {
  equipo: { paper: rgb('#f3e7cc'), ink: rgb('#2b1d0e'), accent: rgb('#9a5b16'), backPaper: rgb('#4a2c12'), backInk: rgb('#f0c66e'), backLabel: 'EQUIPAMIENTO' },
  dia: { paper: rgb('#fff4cf'), ink: rgb('#3a2a05'), accent: rgb('#d99a0b'), backPaper: rgb('#1f2440'), backInk: rgb('#f3d27a'), backLabel: 'DÍA / NOCHE' },
  noche: { paper: rgb('#1d2340'), ink: rgb('#e6e9ff'), accent: rgb('#8fa2ff') },
  evDia: { paper: rgb('#fdf1d8'), ink: rgb('#3a2a05'), accent: rgb('#c77d12'), backPaper: rgb('#c77d12'), backInk: rgb('#fff4cf'), backLabel: 'EVENTO DE DÍA' },
  evNoche: { paper: rgb('#20263f'), ink: rgb('#e6e9ff'), accent: rgb('#8fa2ff'), backPaper: rgb('#121733'), backInk: rgb('#b9c4ff'), backLabel: 'EVENTO DE NOCHE' },
  objeto: { paper: rgb('#e7f2ec'), ink: rgb('#10261b'), accent: rgb('#2f7d55'), backPaper: rgb('#1f4d36'), backInk: rgb('#d8f5e4'), backLabel: 'OBJETO' },
};

function copies(prefix, n, make) {
  return Array.from({ length: n }, (_, k) => ({ ...make(), id: `${prefix}_${k + 1}` }));
}

const equipmentCards = D.EQUIPMENT.flatMap((e) =>
  copies(`eq_${e.id}`, e.copies, () => ({
    name: e.name, description: e.text, tags: ['equipo'],
    meta: { precio: e.price, mana: e.mana },
    text: { title: e.name, kind: `Equipamiento · ${e.mana} de maná`, body: e.text, footer: `Precio ${e.price} · Venta ${Math.floor(e.price / 2)}`, corner: String(e.price) },
  })));

const dayNightCards = [
  ...D.DAY_CARDS.flatMap((c) => copies(`dn_${DAY_SLUG[c.id]}`, c.copies, () => ({
    name: c.name, description: c.text, meta: { fase: 'dia', carta: DAY_SLUG[c.id] },
    text: { title: c.name, kind: 'Día', body: c.text, corner: '☀' },
  }))),
  ...D.NIGHT_CARDS.flatMap((c) => copies(`dn_${NIGHT_SLUG[c.id]}`, c.copies, () => ({
    name: c.name, description: c.text, meta: { fase: 'noche', carta: NIGHT_SLUG[c.id] },
    text: { title: c.name, kind: 'Noche', body: c.text, corner: '☾' }, style: STYLE.noche,
  }))),
];

// Rulebook §16: day events at 1x, three of them at 2x; event #27 renamed to Cuervo Mensajero.
const DOUBLE_DAY_EVENTS = ['Capitán Mercenario', 'Duelo al Amanecer', 'Sincronía'];
const eventCards = (list, prefix, kind) => list.flatMap((e) => {
  const n = prefix === 'evd' && DOUBLE_DAY_EVENTS.includes(e.name) ? 2 : 1;
  return copies(`${prefix}_${e.id}`, n, () => ({
    name: e.name, description: e.text, tags: [prefix === 'evd' ? 'evento_dia' : 'evento_noche'],
    text: { title: e.name, kind, body: e.text },
  }));
});
const dayEventCards = eventCards(D.DAY_EVENTS, 'evd', 'Evento de día');
const nightEventCards = eventCards(D.NIGHT_EVENTS, 'evn', 'Evento de noche');

const objectCards = D.OBJECTS.flatMap((o) => copies(`ob_${OBJ_SLUG[o.id]}`, 4, () => ({
  name: o.name, description: o.text, tags: ['objeto'], meta: { objeto: OBJ_SLUG[o.id] },
  text: { title: o.name, kind: 'Objeto · un solo uso', body: o.text },
})));

const vidaTxt = (m) => (m.hp.kind === 'perPlayer' ? `${m.hp.value}× jugadores` : m.hp.kind === 'fixed' ? String(m.hp.value) : 'especial');
const monsterCards = (tier) => D.MONSTERS.filter((m) => m.tier === tier).map((m) => ({
  id: `m_${m.id}`, faceIndex: m.id - 1, name: m.name,
  description: `${TIER_LABEL[m.tier]} · Vida ${vidaTxt(m)}\n${m.ability}\nRecompensa: ${m.reward}\nPenitencia: ${m.penalty}`,
  meta: { tier: m.tier },
}));

const CHAR_ORDER = ['celeste', 'skull', 'remi', 'baltazar', 'braulia', 'nyra'];
const characterCards = CHAR_ORDER.map((id, i) => {
  const c = D.CHARACTERS.find((x) => x.id === id);
  return { id: `pj_${id}`, faceIndex: i, name: `${c.name} (${c.className})`, description: c.passive, meta: { pj: id } };
});

// --- table layout (metres; the table is 2.4 x 1.7, south edge at z = -0.85) ----
// The Coliseo in the board's centre holds the combats: its sand is 43.5 % of the board, about 0.35 m across.
const BOARD = 0.8;
// Tile centres measured on board.png, as fractions of the board from its centre (+z = top of the art).
const TILE_FRAC = {
  mazmorra: [-0.143, 0.343], descanso: [0.157, 0.329], tienda: [0.357, 0.186], trabajo: [0.357, -0.114],
  evento_dia: [-0.171, -0.371], evento_noche: [0.171, -0.371], torre: [-0.343, -0.071], ring: [-0.343, 0.186],
};
const TILES = Object.fromEntries(Object.entries(TILE_FRAC).map(([k, [x, z]]) => [k, [r3(x * BOARD), r3(z * BOARD)]]));
const DAY_TILES = ['mazmorra', 'tienda', 'torre', 'evento_dia'];
const NIGHT_TILES = ['descanso', 'trabajo', 'ring', 'evento_noche'];
const TILE_LABEL = { mazmorra: 'Mazmorra', tienda: 'Tienda', torre: 'Torre', evento_dia: 'Evento de día', descanso: 'Descanso', trabajo: 'Trabajo', ring: 'Ring', evento_noche: 'Evento de noche' };
const TILE_CODE = Object.fromEntries([...DAY_TILES, ...NIGHT_TILES].map((t, i) => [t, i + 1]));

// Left of the board: today's card row, then the four decks with their discards. Right, beside the Tienda space: the
// shop, one column of cards. The monster in play stands big in the middle of the Coliseo.
// Text cards (equipment, objects, events, day/night) are 1.4 times a standard card: their text fits the card, so
// a bigger card is bigger text.
const TEXT_CARD = [0.089, 0.124];
const LEFT = { x: [-0.70, -0.60, -0.50], top: 0.29 };
const DECKS = { x: [-0.66, -0.555], z: [0.14, -0.02, -0.18, -0.34] };
const SHOP = { x: 0.47, z: 0.075, size: [0.10, 0.65] };
const MONSTER_AT = [0, 0];
// The monster in play is shown this much bigger than the cards in its deck.
const MONSTER_SCALE = 1.5;
const CORNER = { monstruos: [0.70, 0.38], derrotados: [0.785, 0.38], ruleta: [-0.70, 0.40], caja: [0, 0.465] };
// Endless banks in the four corners: gold coins (1), silver coins (5) and mana gems.
const BANK_CORNERS = { so: [-1.0, -0.62], se: [1.0, -0.62], no: [-1.0, 0.62], ne: [1.0, 0.62] };
const BANKS = [
  { kind: 'oro', name: 'Monedas de oro (1)', piece: 'coin', tint: [0.95, 0.75, 0.2], tag: 'moneda1', dx: -0.08 },
  { kind: 'plata', name: 'Monedas de plata (5)', piece: 'coin', tint: [0.8, 0.82, 0.85], tag: 'moneda5', dx: 0, scale: 1.25 },
  { kind: 'mana', name: 'Gemas de maná', piece: 'gem', tint: [0.25, 0.5, 1.0], tag: 'gema', dx: 0.08 },
];
const piece = (id, name, kind, tint, tags, [x, z], scale, extra = {}) => ({
  id, type: 'Model', name, asset: `piece_${kind}`, tint, tags,
  kind: kind === 'coin' ? 'coin' : kind === 'checker' ? 'chip' : 'generic',
  material: kind === 'coin' ? 'metal' : kind === 'gem' ? 'glass' : 'plastic',
  transform: { position: [x, 0, z], ...(scale ? { scale: [scale, scale, scale] } : {}) }, ...extra,
});
// Where the Tower banner waits while the Tower has no owner: the board's empty south-west corner.
const BANNER_REST = [-0.37, -0.37];

const at = (x, z, faceDown = true) => ({ position: [x, 0, z], rotation: [0, 180, faceDown ? 180 : 0] });
const deck = (id, name, x, z, cards, extra = {}) => ({ id, type: 'Deck', name, transform: at(x, z, !extra.faceUp), cards, ...extra, faceUp: undefined });
const textDeck = (id, name, x, z, cards, style, faceUp = false) =>
  deck(id, name, x, z, cards, { faceAsset: '', backAsset: '', style, faceUp, size: TEXT_CARD });
const MONSTER_SIZE = [0.07, 0.105];

const objects = [
  // Image pieces read upright from the north at yaw 0 (as in TTS), so the board turns 180° to face the south
  // seat with Mazmorra at the top (+z), where TILES expects it.
  { id: 'tablero', type: 'Board', name: 'Tablero de Tornaris', asset: 'board', size: [BOARD, BOARD], locked: true, transform: { position: [0, 0, 0], rotation: [0, 180, 0] } },

  textDeck('dianoche', 'Mazo de día y noche', LEFT.x[0], LEFT.top, dayNightCards, STYLE.dia),
  textDeck('dianoche_descarte', 'Días y noches pasados', LEFT.x[2], LEFT.top, [], STYLE.dia, true),
  deck('monstruos', 'Mazo de monstruos', ...CORNER.monstruos, [], { faceAsset: 'monsters', backAsset: 'monster_back', size: MONSTER_SIZE }),
  deck('monstruos_descarte', 'Monstruos derrotados', ...CORNER.derrotados, [], { faceAsset: 'monsters', backAsset: 'monster_back', size: MONSTER_SIZE, faceUp: true }),
  { id: 'ruleta', type: 'Die', name: 'Ruleta', description: 'Bloquea un arco completo: su casilla de día y la de noche.', faces: 4,
    labels: ['Mazmorra y Descanso', 'Tienda y Trabajo', 'Eventos', 'Torre y Ring'], transform: { position: [CORNER.ruleta[0], 0, CORNER.ruleta[1]] } },

  textDeck('equipo', 'Mazo de equipamientos', DECKS.x[0], DECKS.z[0], equipmentCards, STYLE.equipo),
  textDeck('equipo_descarte', 'Equipamientos descartados', DECKS.x[1], DECKS.z[0], [], STYLE.equipo, true),
  textDeck('objetos', 'Mazo de objetos', DECKS.x[0], DECKS.z[1], objectCards, STYLE.objeto),
  textDeck('objetos_descarte', 'Objetos usados', DECKS.x[1], DECKS.z[1], [], STYLE.objeto, true),
  textDeck('eventos_dia', 'Eventos de día', DECKS.x[0], DECKS.z[2], dayEventCards, STYLE.evDia),
  textDeck('eventos_dia_descarte', 'Eventos de día jugados', DECKS.x[1], DECKS.z[2], [], STYLE.evDia, true),
  textDeck('eventos_noche', 'Eventos de noche', DECKS.x[0], DECKS.z[3], nightEventCards, STYLE.evNoche),
  textDeck('eventos_noche_descarte', 'Eventos de noche jugados', DECKS.x[1], DECKS.z[3], [], STYLE.evNoche, true),

  // Out of sight in the hidden box: the characters (dealt when the game starts) and the four tier pools
  // the game builds the 10-card monster deck from.
  deck('personajes', 'Personajes', ...CORNER.caja, characterCards, { faceAsset: 'characters', backAsset: 'characters', size: [0.105, 0.07] }),
  ...TIERS.map((tier) => deck(`pool_${tier}`, `Monstruos: ${TIER_LABEL[tier]}`, ...CORNER.caja,
    monsterCards(tier), { faceAsset: 'monsters', backAsset: 'monster_back', size: MONSTER_SIZE })),

  ...CHAR_ORDER.map((id, i) => ({
    id: `ficha_${id}`, type: 'Token', name: `Ficha de ${D.CHARACTERS.find((c) => c.id === id).name}`,
    asset: `token_${PJ[id].slug}`, shape: 'round', thickness: 0.006,
    transform: { position: [CORNER.caja[0] + (i - 2.5) * 0.004, 0, CORNER.caja[1]], rotation: [0, 180, 0], scale: [1.8, 1, 1.8] },
  })),

  // Each seat: its mat, a counter for the combat total and three dice in the seat's colour.
  ...seats.flatMap((s) => [
    { id: `tapete_${s.n}`, type: 'Board', name: 'Tapete de jugador', asset: 'mat', size: MAT.size, locked: true,
      transform: { position: [s.mat[0], 0, s.mat[1]], rotation: [0, s.face, 0] } },
    // A counter's digits read from the side its yaw faces, so it turns with the hand, not like an image.
    { id: `total_${s.n}`, type: 'Counter', name: 'Total en combate', value: 0,
      transform: { position: on3(onMat(s, MAT.total)), rotation: [0, s.rot, 0] } },
    ...MAT.dados.map((p, k) => ({ id: `dado_${s.n}_${k + 1}`, type: 'Die', name: 'Dado', faces: 6, tint: SEAT_RGB[s.color],
      tags: ['dado', `owner:${s.id}`], transform: { position: on3(onMat(s, p)) } })),
  ]),

  // The banks never run out: players drag pieces out of them, the rules take and return them too.
  ...Object.entries(BANK_CORNERS).flatMap(([c, [x, z]]) => BANKS.flatMap((b) => [
    { id: `banco_${b.kind}_${c}`, type: 'InfiniteBag', name: b.name, tint: b.tint, transform: { position: [r3(x + b.dx), 0, z] } },
    piece(`banco_${b.kind}_${c}_pieza`, b.name.replace(/^Monedas/, 'Moneda').replace(/^Gemas/, 'Gema'), b.piece, b.tint, [b.tag],
      [r3(x + b.dx), z], b.scale, { container: `banco_${b.kind}_${c}` }),
  ])),

  piece('estandarte', 'Estandarte de la Torre', 'pawn', [0.92, 0.92, 0.92], ['estandarte'], BANNER_REST, 1.3),
  piece('token_turno', 'Token de turno', 'checker', [0.95, 0.75, 0.2], ['token_turno'], [0, -0.42], 1.4),
];
for (const o of objects) for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];

const lua = (call, args = {}) => ({ lua: { call, args } });
const refresh = lua('refrescar');
const zone = (id, name, x, z, sx, sz, extra = {}) => ({ id, type: 'ScriptingZone', name, transform: { position: [x, 0.05, z], ...(extra.rot ? { rotation: [0, extra.rot, 0] } : {}) }, size: [sx, 0.1, sz], ...(extra.tags ? { tags: extra.tags } : {}) });
// Each player's side of the arena, six slots around the monster: the equipment they play in a combat lies there.
const arenaAt = (s, radius) => {
  const a = (s.arena * Math.PI) / 180;
  return [r3(Math.cos(a) * radius), r3(Math.sin(a) * radius)];
};
// Each side sits around the big monster in the middle, deep enough for one row of text cards. The side seats (east,
// west) face the monster's narrow side, so they come closer and their dice stay off the Torre and Tienda spaces.
const slotRadius = (s) => (s.arena === 0 || s.arena === 180 ? 0.13 : 0.17);
const arenaXZ = (s) => arenaAt(s, slotRadius(s));
const arenaSlot = (s) => on3(arenaXZ(s), 0.05);
// A seat's dice land in a row just behind its played cards (towards the player), still inside the arena zone.
const arenaDice = (s) => [-1, 0, 1].map((k) => {
  const [x, z] = arenaXZ(s);
  return [r3(x - 0.085 * s.inn[0] + k * 0.026 * s.right[0]), r3(z - 0.085 * s.inn[1] + k * 0.026 * s.right[1])];
});
const ARENA_HALF = 0.27;
// Layout zones lay out the cards moved into them in a grid, turned to read from the zone's front.
const layout = (id, name, [x, y, z], rot, [sx, sz], extra = {}) => ({ id, type: 'LayoutZone', name,
  transform: { position: [x, y, z], ...(rot ? { rotation: [0, rot, 0] } : {}) }, size: [sx, 0.1, sz],
  direction: 'rightThenDown', facing: 'faceUp', spacing: 0.006, ...extra });
const zones = [
  ...seats.map((s) => ({ id: s.handZone, type: 'HandZone', name: 'Mano', owner: s.id,
    transform: { position: [s.hand[0], 0.05, s.hand[1]], ...(s.rot ? { rotation: [0, s.rot, 0] } : {}) }, size: [0.5, 0.1, 0.12] })),
  ...seats.map((s) => zone(`pj_${s.id}`, 'Personaje', ...onMat(s, MAT.pj), 0.11, 0.08, { tags: [`pj:${s.id}`], rot: s.rot })),
  // The pieces on the mat are the player's gold and mana; moving one by hand updates the panels.
  ...seats.flatMap((s) => [['oro', 'Oro'], ['mana', 'Maná'], ['gastado', 'Maná gastado']].map(([k, name]) => ({
    ...zone(`${k}_${s.n}`, name, ...onMat(s, MAT[k].c), ...MAT[k].s, { tags: [`${k}:${s.id}`], rot: s.rot }),
    onEnter: [refresh], onLeave: [refresh],
  }))),
  // A character token dropped on a space chooses it (in secret while the blind round lasts).
  ...Object.keys(TILES).map((t) => ({ ...zone(`casilla_${t}`, TILE_LABEL[t], ...TILES[t], 0.14, 0.14),
    onEnter: [lua('colocar', { casilla: t })] })),
  // One row: more cards than fit close up sideways and overlap, so they stay on the player's own side.
  ...seats.map((s) => layout(`arena_${s.id}`, 'Mi lado de la arena', arenaSlot(s), s.rot, [0.09, 0.12], { tags: [`arena:${s.id}`], maxPerRow: 8 })),
  { id: 'caja', type: 'HiddenZone', name: 'Caja del juego', visibleTo: [], transform: { position: [CORNER.caja[0], 0.05, CORNER.caja[1]] }, size: [0.06, 0.1, 0.04] },
  zone('carta_hoy', 'Carta de hoy', LEFT.x[1], LEFT.top, 0.07, 0.1),
  // The monster in play, in the middle of the Coliseo (a zone drawn on a board never counts the board).
  zone('monstruo_activo', 'Monstruo de la mazmorra', ...MONSTER_AT, MONSTER_SIZE[0] * MONSTER_SCALE, MONSTER_SIZE[1] * MONSTER_SCALE),
  // Dice thrown here show their total, and each player's share in their colour.
  { ...zone('arena', 'Arena del Coliseo', 0, 0, ARENA_HALF * 2, ARENA_HALF * 2), diceTotal: true },
  // One card per player (two on Feria del Gremio), top to bottom; more than fit close up and overlap.
  layout('tienda', 'Tienda', [SHOP.x, 0.05, SHOP.z], 0, SHOP.size, { direction: 'downThenRight', maxPerRow: 12 }),
];

// --- rules -----------------------------------------------------------------
const ifc = (condition, then, els) => ({ if: { condition, then, ...(els ? { else: els } : {}) } });
const varIs = (name, value, op = '==') => ({ variable: { name, op, value } });
const count = (zone, op, value) => ({ zoneCount: { zone, op, value } });
const move = (from, to, extra = {}) => ({ move: { from, to, ...extra } });
const resIs = (resource, op, value, player = '$it') => ({ resource: { player, resource, op, value } });
const actorRes = (resource, value, op = '==') => ({ resource: { player: '$actor', resource, op, value } });

// Draw one card from `src` into `to`, reshuffling `discard` back in when the pile runs out.
const drawOne = (src, discard, to, faceUp = true) => [
  ifc(count(src, '==', 0), [move(discard, src, { take: 'all' }), { shuffle: { object: src } }]),
  ifc(count(src, '>', 0), [move(src, to, { faceUp })]),
];
// forEach players walks only the seats in the game.
const forPlayers = (doEffects) => ({ forEach: { players: true, do: doEffects } });


// What the table does by itself (the designer's call, 2026-10-26): deal at the start; «Siguiente turno» cleans up,
// passes the turn token, flips the day/night card (the light follows it), and by day reveals the monster and fills
// the shop; the choice of space (token in a blind round, or the secret button) and its reveal; buying; battles with
// their mana, rewards and penalties. Everything else — what each space gives, events, card effects, the roulette —
// players do by hand, reading the cards out loud.
const variables = {
  jugadores: 0, elegidos: 0, a_ciegas: 0, elec_txt: '', batalla_txt: '',
  fase: 'dia', fase_txt: '', carta: '', carta_txt: '', carta_efecto: '',
  ...Object.fromEntries([...DAY_TILES, ...NIGHT_TILES].map((t) => [`ok_${t}`, 0])),
  monstruos_revelados: 0, monstruo: '-', vida: 0, m_hab: '', m_rec: '', m_pen: '', m_tier: '',
  esqueleto: 0, combate: 0, combate_total: 0, combate_txt: '-',
  duelo_txt: '-', torre_txt: 'Sin dueño', torre_dueno: '', torre_bloqueo: 0, forzado: '',
  torneo: 0, torneo_txt: '', orden_txt: '', ronda: 0,
  // Lua-only state (tables).
  st: {},
};

const resources = [
  // Set at the start for the seats in the game, for the Lua (Game.getSeats returns an empty list in this engine build).
  { id: 'en_juego', name: 'En la partida', initial: 0, min: 0, max: 1 },
  // Gold, mana and the combat total live in pieces (coins, gems, the mat counter); these mirror them.
  { id: 'oro', name: 'Oro', initial: 0, min: 0 },
  { id: 'mana', name: 'Maná actual', initial: 0, min: 0 },
  { id: 'mana_max', name: 'Maná máximo', initial: 0, min: 0 },
  { id: 'espacios', name: 'Espacios de equipamiento', initial: 6, min: 0 },
  { id: 'total', name: 'Total en combate', initial: 0 },
  { id: 'pos', name: 'Casilla', initial: 0 },
  { id: 'premio_eq', name: 'Equipamientos ganados', initial: 0, min: 0 },
  { id: 'vivo', name: 'Sigue en el torneo', initial: 1, min: 0, max: 1 },
  // Set by the Lua so the action list only offers what applies right now.
  { id: 'lucha', name: 'En combate', initial: 0, min: 0, max: 1 },
];

// The game starts with the seats people sat in: characters at random, each with 2 of their starting object.
const onGameStart = [
  ...['equipo', 'objetos', 'eventos_dia', 'eventos_noche', 'dianoche', 'personajes', ...TIERS.map((t) => `pool_${t}`)]
    .map((d) => ({ shuffle: { object: d } })),
  // The first turn is always a plain day: a Día Normal goes on top of the shuffled day/night deck.
  { move: { object: 'dn_dia_normal_1', to: 'dianoche', at: 'top', faceUp: false } },
  // Rulebook §3.4: 2 duendes, 2 ogros, 3 gólems, 3 dragones, revealed easiest first.
  ...[...TIERS].reverse().map((t) => move(`pool_${t}`, 'monstruos', { count: TIER_PICK[t], at: 'top', faceUp: false })),
  forPlayers([move('personajes', '$it.pj', { faceUp: true }), { setResource: { player: '$it', resource: 'en_juego', value: 1 } }]),
  forPlayers(CHAR_ORDER.map((id) => ifc({ compare: { left: '$it.pj.top.id', op: '==', right: `pj_${id}` } },
    [1, 2].map((k) => ({ move: { object: `ob_${PJ[id].obj}_${k}`, to: '$it.hand', faceUp: true } }))))),
  lua('preparar'),
  refresh,
];

const phases = [
  // A turn starts here; once the tenth monster's day is over, the tournament.
  { id: 'comienzo', name: 'Comienzo del turno', advanceWhen: { immediate: true }, onEnter: [
    ifc(varIs('monstruos_revelados', 10, '>='), [{ gotoPhase: { phase: 'torneo' } }]),
  ] },
  // The new day/night card; by day the shop and the monster.
  { id: 'amanecer', name: 'Carta de día o noche', advanceWhen: { immediate: true }, onEnter: [
    ifc(count('carta_hoy', '>', 0), [move('carta_hoy', 'dianoche_descarte', { take: 'all' })]),
    ...drawOne('dianoche', 'dianoche_descarte', 'carta_hoy'),
    { setVariable: { name: 'fase', value: '$obj.carta_hoy.top.meta.fase' } },
    { setVariable: { name: 'carta', value: '$obj.carta_hoy.top.meta.carta' } },
    lua('amanecer'),
    // Shop: one card per player by day (two on Feria del Gremio), and at night with Mercado Nocturno.
    ifc({ or: [varIs('fase', 'dia'), varIs('carta', 'mercado_nocturno')] }, [
      forPlayers(drawOne('equipo', 'equipo_descarte', 'tienda')),
      ifc(varIs('carta', 'feria'), [forPlayers(drawOne('equipo', 'equipo_descarte', 'tienda'))]),
      lua('ordenar', { zona: 'tienda' }),
    ]),
    // A new monster every day, unless the Esqueleto Guerrero came back. It appears in the Coliseo.
    ifc({ and: [varIs('fase', 'dia'), varIs('esqueleto', 0)] }, [
      ifc(count('monstruo_activo', '>', 0), [move('monstruo_activo', 'monstruos_descarte', { take: 'all' })]),
      ifc(count('monstruos', '>', 0), [move('monstruos', 'monstruo_activo', { faceUp: true }), { setVariable: { name: 'monstruos_revelados', delta: 1 } }]),
    ]),
    ifc(varIs('fase', 'dia'), [lua('revelar_monstruo')]),
    refresh,
  ] },
  // Two ways to choose: drop your character token on a space during a blind round (nobody sees it until the token
  // holder presses «Revelar casillas»), or the secret button, which reveals by itself once everyone has used it.
  // On Día Transparente players choose in the open instead (elegir_visible).
  { id: 'elegir', name: 'Elegir casilla', actions: ['elegir', 'elegir_visible', 'revelar_casillas'],
    onEnter: [ifc({ variable: { name: 'carta', op: '!=', value: 'transparente' } }, [
      { blindRound: { on: true } }, { setVariable: { name: 'a_ciegas', value: 1 } }])],
    advanceWhen: { condition: { or: [
      { compare: { left: '$secrets.elegir', op: '>=', right: '$var.jugadores' } },
      { compare: { left: '$var.elegidos', op: '>=', right: '$var.jugadores' } }] } },
    onExit: [
      // Ending the blind round runs the held token drops (colocar), then the button choices are revealed.
      { blindRound: { on: false } },
      { setVariable: { name: 'a_ciegas', value: 0 } },
      { reveal: { action: 'elegir' } },
      lua('revelar'),
      refresh,
    ] },
  // Each player, in turn order, does what their space says by hand; the table only buys and fights.
  { id: 'resolver', name: 'Turno de los jugadores', actions: [
    'comprar', 'combatir', 'usar_equipo', 'repetir_dado', 'resolver_mazmorra', 'duelo', 'resolver_duelo', 'siguiente_turno',
  ] },
  { id: 'torneo', name: 'Torneo Final', actions: ['convertir_oro', 'duelo', 'usar_equipo', 'repetir_dado', 'resolver_duelo'],
    onEnter: [lua('inicio_torneo'), refresh] },
];

const motivoIs = (m) => ({ compare: { left: '$param.motivo', op: '==', right: m } });
const handCard = (tag) => ({ name: 'carta', type: 'object', filter: { inZone: '$actor.hand', type: 'Card', ...(tag ? { hasTag: tag } : {}) } });
// Options are the ids the rules and Lua use; labels are what players read on buttons, in the picker and the log.
const choice = (name, labels) => ({ name, type: 'choice', options: Object.keys(labels), labels });
const tileChoice = choice('casilla', TILE_LABEL);
// The spaces of today's half of the board (the roulette is rolled and respected by hand).
const tileAllowed = { or: [...DAY_TILES, ...NIGHT_TILES].map((t) => ({ and: [
  { compare: { left: '$param.casilla', op: '==', right: t } }, varIs(`ok_${t}`, 1),
] })) };
const giveEquipment = forPlayers([1, 2, 3, 4, 5, 6].map((k) => ifc(resIs('premio_eq', '>=', k), drawOne('equipo', 'equipo_descarte', '$it.hand'))));
// Played equipment goes back to its owner's hand when the combat ends (it recharges for the next one).
const returnArenaCards = forPlayers([move('$it.arena', '$it.hand', { take: 'all', faceUp: true })]);
const MOTIVO = { ring: 'Ring', torre: 'Torre', guante: 'Guante del Duelo', evento: 'Evento', torneo: 'Torneo' };
const RESULTADO = { auto: 'Según los dados', victoria: 'Victoria', derrota: 'Derrota' };
const CONVERTIR = { equipo_5: '5 de oro: 1 equipamiento', espacio_15: '15 de oro: 1 espacio', mana_30: '30 de oro: 1 de maná' };

const actions = [
  // Recorded in secret; the reveal at the end of the phase runs its effects for everyone at once.
  { id: 'elegir', name: 'Elegir casilla', actor: 'any', secret: true, params: [tileChoice],
    preconditions: [{ variable: { name: 'carta', op: '!=', value: 'transparente' } }, tileAllowed],
    effects: [lua('elegir'), refresh] },
  { id: 'elegir_visible', name: 'Elegir casilla (a la vista)', actor: 'any', limitPerPhase: 1, params: [tileChoice],
    preconditions: [varIs('carta', 'transparente'), tileAllowed],
    effects: [lua('elegir'), refresh] },
  // The token holder reveals once everyone has dropped their token or pressed the button.
  { id: 'revelar_casillas', name: 'Revelar casillas', actor: 'current', preconditions: [varIs('a_ciegas', 1)],
    effects: [{ endPhase: {} }] },

  { id: 'comprar', name: 'Comprar equipamiento', actor: 'any',
    params: [{ name: 'carta', type: 'object', filter: { inZone: 'tienda', type: 'Card', hasTag: 'equipo' } }],
    effects: [lua('comprar'), { move: { object: '$param.carta', to: '$actor.hand', faceUp: true } }, lua('ordenar', { zona: 'tienda' }), refresh] },

  // Battles in the Coliseo: the table rolls (or reads the dice thrown in the arena), spends mana and pays out.
  { id: 'combatir', name: 'Combatir en la arena', actor: 'any',
    preconditions: [actorRes('pos', TILE_CODE.mazmorra), varIs('combate', 0), count('monstruo_activo', '>', 0)],
    effects: [lua('iniciar_mazmorra'), refresh] },
  // Playing equipment spends its mana and puts the card on your side of the arena.
  { id: 'usar_equipo', name: 'Jugar equipamiento', actor: 'any', params: [handCard('equipo')], preconditions: [actorRes('lucha', 1)],
    effects: [lua('usar_equipo'), { move: { object: '$param.carta', to: '$actor.arena', faceUp: true } }, lua('ordenar'), refresh] },
  // Baltazar's passive, Resorte, Caja Sorpresa, Sello Maligno.
  { id: 'repetir_dado', name: 'Repetir uno de mis dados', actor: 'any',
    params: [choice('dado', { 1: 'Dado 1', 2: 'Dado 2', 3: 'Dado 3' })], preconditions: [actorRes('lucha', 1)], effects: [lua('repetir_dado'), refresh] },
  { id: 'resolver_mazmorra', name: 'Resolver el combate', actor: 'any', params: [choice('resultado', RESULTADO)],
    preconditions: [varIs('combate', 1)],
    effects: [lua('resolver_mazmorra'), giveEquipment,
      ifc(varIs('combate', 0), [returnArenaCards, ifc(varIs('esqueleto', 0), [move('monstruo_activo', 'monstruos_descarte', { take: 'all' })])]),
      refresh] },
  { id: 'duelo', name: 'Retar a duelo', actor: 'any',
    params: [{ name: 'rival', type: 'seat' }, choice('motivo', MOTIVO)],
    preconditions: [{ compare: { left: '$param.rival', op: '!=', right: '$actor.id' } }, varIs('duelo_txt', '-'),
      { or: [
        { and: [varIs('torneo', 1), motivoIs('torneo'), actorRes('vivo', 1)] },
        { and: [varIs('torneo', 0), { not: motivoIs('torneo') }] },
      ] }],
    effects: [lua('duelo'), refresh] },
  { id: 'resolver_duelo', name: 'Resolver el duelo', actor: 'any',
    preconditions: [{ variable: { name: 'duelo_txt', op: '!=', value: '-' } }],
    effects: [lua('resolver_duelo'), returnArenaCards, refresh] },

  // The token holder ends the turn: tokens home, shop leftovers and an unfought monster discarded, token passed.
  // The next turn opens with the new day/night card.
  { id: 'siguiente_turno', name: 'Siguiente turno', actor: 'current',
    preconditions: [varIs('combate', 0), varIs('duelo_txt', '-')],
    effects: [
      { move: { from: 'tienda', take: 'all', to: 'equipo_descarte', faceUp: true } },
      ifc({ and: [count('monstruo_activo', '>', 0), varIs('esqueleto', 0)] }, [move('monstruo_activo', 'monstruos_descarte', { take: 'all' })]),
      lua('fin_turno'), refresh, { endTurn: {} }] },
  { id: 'convertir_oro', name: 'Convertir oro sobrante', actor: 'any',
    params: [choice('opcion', CONVERTIR)], preconditions: [varIs('torneo', 1)],
    effects: [lua('convertir_oro'), ifc({ compare: { left: '$param.opcion', op: '==', right: 'equipo_5' } }, drawOne('equipo', 'equipo_descarte', '$actor.hand')), refresh] },
];

const label = (text) => ({ type: 'label', text });
// One panel: today's card, and lines that only have text while they matter (choosing, a battle). The second is
// each player's own pick, seen by them alone.
const ui = { panels: [
  { id: 'estado', title: 'Tornaris', anchor: 'topLeft', elements: [
    label('{$var.fase_txt} · {$var.carta_txt}'),
    label('{$var.carta_efecto}'),
    label('{$var.elec_txt}'),
    label('{$var.batalla_txt}'),
  ] },
  { id: 'eleccion', title: 'Tu casilla', anchor: 'right', elements: [
    label('{$viewer.chose.elegir}'),
    label('Con botón: {$secrets.elegir} de {$var.jugadores}'),
  ] },
] };

// --- Lua -------------------------------------------------------------------
const toLua = (v) => {
  if (v === null || v === undefined) return 'nil';
  if (Array.isArray(v)) return `{${v.map(toLua).join(',')}}`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `[${/^\d+$/.test(k) ? k : JSON.stringify(k)}]=${toLua(x)}`).join(',')}}`;
  return JSON.stringify(v);
};
const luaData = {
  SEATS: TURN_ORDER,
  SEAT_N: Object.fromEntries(seats.map((s) => [s.id, s.n])),
  HAND: Object.fromEntries(seats.map((s) => [s.id, s.handZone])),
  PJZONE: Object.fromEntries(seats.map((s) => [s.id, `pj_${s.id}`])),
  // Mat geometry per seat: directions, where things rest, and the coin and mana zones (centre, size).
  MAT: Object.fromEntries(seats.map((s) => [s.id, {
    n: s.n, right: s.right, inn: s.inn, face: s.face, color: SEAT_RGB[s.color],
    ficha: onMat(s, MAT.ficha), token: onMat(s, MAT.token), dados: MAT.dados.map((p) => onMat(s, p)),
    ...Object.fromEntries(['oro', 'mana', 'gastado'].map((k) => [k, { zona: `${k}_${s.n}`, c: onMat(s, MAT[k].c), s: MAT[k].s }])),
    arena_dados: arenaDice(s),
  }])),
  BANCO: { oro: 'banco_oro_so', plata: 'banco_plata_so', mana: 'banco_mana_so' },
  BANNER_REST, MONSTER_SCALE,
  ARENA_ZONE: Object.fromEntries(seats.map((s) => [s.id, `arena_${s.id}`])),
  TILES, TILE_CODE, TILE_LABEL, MOTIVO,
  ARCS: [['mazmorra', 'descanso'], ['tienda', 'trabajo'], ['evento_dia', 'evento_noche'], ['torre', 'ring']],
  DAY_TILES, NIGHT_TILES,
  PJ: Object.fromEntries(D.CHARACTERS.map((c) => [c.id, { nombre: c.name, clase: c.className, mana: c.maxMana, espacios: c.equipmentSlots, pasiva: c.passive }])),
  EQ: Object.fromEntries(D.EQUIPMENT.map((e) => [e.id, { nombre: e.name, precio: e.price, mana: e.mana, texto: e.text }])),
  OBJ: Object.fromEntries(D.OBJECTS.map((o) => [OBJ_SLUG[o.id], { nombre: o.name, texto: o.text }])),
  MON: Object.fromEntries(D.MONSTERS.map((m) => [m.id, {
    nombre: m.name, tier: m.tier, hp: m.hp.kind, hpv: m.hp.value ?? 0, hab: m.ability, rec: m.reward, pen: m.penalty,
    oro: MON_REWARD[m.id].oro ?? 0, eq: MON_REWARD[m.id].eq ?? 0, mana: MON_REWARD[m.id].mana ?? 0, castigo: MON_PENALTY[m.id],
  }])),
  CARTAS: Object.fromEntries([
    ...D.DAY_CARDS.map((c) => [DAY_SLUG[c.id], { nombre: c.name, texto: c.text }]),
    ...D.NIGHT_CARDS.map((c) => [NIGHT_SLUG[c.id], { nombre: c.name, texto: c.text }]),
  ]),
  TIER_LABEL,
};
const luaSrc = `-- Tornaris for Table World. Generated by tableworld/build.mjs: edit tornaris.lua, not this.\n${
  Object.entries(luaData).map(([k, v]) => `${k} = ${toLua(v)}`).join('\n')}\n\n${readFileSync(join(HERE, 'tornaris.lua'), 'utf8')}`;

// --- document --------------------------------------------------------------
const doc = {
  schemaVersion: '0.1',
  game: {
    id: GAME_ID, name: 'Tornaris', minPlayers: 3, maxPlayers: 6,
    description: 'Explora el reino de Tornaris durante 10 monstruos: cada turno se revela una carta de día o noche, la ruleta bloquea un arco del tablero y todos eligen casilla en secreto. Derrota monstruos en la mazmorra, compra equipamiento, conquista la torre y pelea en el Ring. Al agotarse los monstruos, el Torneo Final en el Coliseo decide al Campeón de Tornaris. De 3 a 6 jugadores: cada uno se sienta con el + sobre un asiento y, con 3 o más, se pulsa Empezar. Reglas: docs/REGLAS_v3.md.',
    // The engine's own log lines, in Spanish.
    messages: {
      win: '{seat} gana la partida.',
      choseInSecret: '{seat} ya eligió en secreto.',
      chose: '{seat} → {option}.',
      blindRound: 'Ronda a ciegas.',
      reveal: 'Se revelan las casillas.',
      shows: 'Se muestra {card}.',
    },
  },
  environment: { table: { size: TABLE, feltColor: [0.12, 0.2, 0.16] } },
  assets: [
    { id: 'mat', type: 'image', path: `${ASSET_DIR}/mat.png` },
    ...['coin', 'gem', 'pawn', 'checker'].map((p) => ({ id: `piece_${p}`, type: 'model', path: `builtin:${p}` })),
    { id: 'board', type: 'image', path: `${ASSET_DIR}/board.png` },
    { id: 'monsters', type: 'image', path: `${ASSET_DIR}/monsters.jpg`, columns: 5, rows: 4 },
    { id: 'monster_back', type: 'image', path: `${ASSET_DIR}/monster_back.jpg` },
    { id: 'characters', type: 'image', path: `${ASSET_DIR}/characters.jpg`, columns: 3, rows: 2 },
    ...Object.values(PJ).map((p) => ({ id: `token_${p.slug}`, type: 'image', path: `${ASSET_DIR}/token_${p.slug}.png` })),
  ],
  objects, zones,
  players: { seats: seats.map((s) => ({ id: s.id, color: s.color, handZone: s.handZone, name: s.name })) },
  resources, variables,
  // The tournament is entered with gotoPhase, so it is a phase but not part of the turn. "El jugador más joven
  // recibe el token": the table cannot know ages, so it draws one.
  turn: { order: 'counterclockwise', startingPlayer: 'random', phases: ['comienzo', 'amanecer', 'elegir', 'resolver'] },
  phases, actions,
  events: { onGameStart },
  ui,
  scripts: { global: luaSrc },
};
const out = join(HERE, `${GAME_ID}.json`);
writeFileSync(out, JSON.stringify(doc, null, 1));
console.log(`wrote ${out}: ${equipmentCards.length} equip, ${dayNightCards.length} day/night, ${dayEventCards.length}+${nightEventCards.length} events, ${objectCards.length} objects`);

// --install: copy the game into Table World's own games folder (the window's game list) as Tornaris/table.json
// plus its images.
if (process.argv.includes('--install')) {
  const dest = join(process.env.USERPROFILE, 'AppData', 'LocalLow', 'DefaultCompany', 'Table World', 'Games', 'Tornaris');
  mkdirSync(join(dest, ASSET_DIR), { recursive: true });
  copyFileSync(out, join(dest, 'table.json'));
  cpSync(join(HERE, ASSET_DIR), join(dest, ASSET_DIR), { recursive: true });
  console.log(`installed in ${dest}`);
}
