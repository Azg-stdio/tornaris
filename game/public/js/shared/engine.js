// Game engine. Pure functions over a state object — no I/O, no timers.
// The Durable Object calls these; the client imports the same module to know
// which moves are legal before sending them.
//
// The server is the only authority on randomness. Every shuffle and every die
// runs through the seeded generator stored in state.rng, so a game is fully
// reproducible from its seed — which makes bug reports replayable.

import {
  CHARACTERS, MONSTERS, EQUIPMENT, OBJECTS,
  DAY_CARDS, NIGHT_CARDS, DAY_EVENTS, NIGHT_EVENTS,
  MIN_PLAYERS, MAX_PLAYERS,
} from './data.js';

import {
  ARCS, DAY_TILES, NIGHT_TILES, arcOfTile,
  STARTING_GOLD, TRABAJO_GOLD, TOWER_INCOME, TOWER_LOCK_TURNS,
  MONSTER_DECK_COMPOSITION, TOTAL_MONSTERS,
  MANA_GAIN_PER_TIER_TRANSITION, monsterHp,
} from './rules.js';

import { effectsFor } from './effects.js';

const TIER_ORDER = ['duende', 'ogro', 'golem', 'dragon'];

// --- randomness ------------------------------------------------------------

/** mulberry32: small, fast, good enough for a board game, and seedable. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Counter-based draw: state holds only {seed, cursor}, so randomness survives
 * being serialised to storage and back. Each call re-derives a generator from
 * seed + cursor*golden-ratio, which decorrelates consecutive seeds.
 */
function rngFor(state) {
  return () => {
    state.rng.cursor++;
    return makeRng(state.rng.seed + state.rng.cursor * 0x9e3779b9)();
  };
}

function shuffle(state, arr) {
  const next = rngFor(state);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rollDie(state) {
  return Math.floor(rngFor(state)() * 6) + 1;
}

/** Expands a {copies} list into a flat deck of ids. */
function expand(cards) {
  return cards.flatMap((c) => Array.from({ length: c.copies ?? 1 }, () => c.id));
}

// --- lookups ---------------------------------------------------------------

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) ?? null;
export const monsterById = (id) => MONSTERS.find((m) => m.id === id) ?? null;
export const equipmentById = (id) => EQUIPMENT.find((e) => e.id === id) ?? null;
export const objectByName = (name) => OBJECTS.find((o) => o.name === name) ?? null;

const phaseCardById = (phase, id) =>
  (phase === 'day' ? DAY_CARDS : NIGHT_CARDS).find((c) => c.id === id) ?? null;

const eventById = (phase, id) =>
  (phase === 'day' ? DAY_EVENTS : NIGHT_EVENTS).find((e) => e.id === id) ?? null;

// --- setup -----------------------------------------------------------------

/**
 * 10 monsters: 2 duende, 2 ogro, 3 golem, 3 dragon, revealed easiest first.
 * Tier order is fixed; only which cards inside each tier is random.
 */
function buildMonsterDeck(state) {
  const deck = [];
  for (const { tier, count } of MONSTER_DECK_COMPOSITION) {
    const pool = MONSTERS.filter((m) => m.tier === tier).map((m) => m.id);
    deck.push(...shuffle(state, pool).slice(0, count));
  }
  return deck;
}

export function startGame(state) {
  if (state.phase !== 'lobby') throw new Error('la partida ya empezó');
  if (state.players.length < MIN_PLAYERS) {
    throw new Error(`se necesitan al menos ${MIN_PLAYERS} jugadores`);
  }
  if (state.players.length > MAX_PLAYERS) throw new Error('demasiados jugadores');
  if (state.players.some((p) => !p.characterId)) {
    throw new Error('todos deben elegir personaje');
  }

  state.phase = 'playing';
  state.rng = { seed: state.rng?.seed ?? (Date.now() >>> 0), cursor: 0 };

  for (const p of state.players) {
    const c = characterById(p.characterId);
    p.gold = STARTING_GOLD;
    p.maxMana = c.maxMana;
    p.mana = c.maxMana;
    p.equipmentSlots = c.equipmentSlots;
    p.equipment = [];
    p.objects = Array.from({ length: c.startItemQty }, () => c.startItem);
    p.pendingEvents = [];
    p.mustRestNextNight = false;
  }

  // Seat order is turn order; the token starts on seat 0.
  state.tokenHolderId = state.players[0].id;

  state.decks = {
    // The 50-card day/night deck is shuffled as one pile, so days and nights
    // arrive in whatever order they come out — they do not alternate.
    phase: shuffle(state, [
      ...expand(DAY_CARDS).map((id) => ({ phase: 'day', id })),
      ...expand(NIGHT_CARDS).map((id) => ({ phase: 'night', id })),
    ]),
    phaseIdx: 0,
    monsters: buildMonsterDeck(state),
    monsterIdx: -1,
    dayEvents: shuffle(state, expand(DAY_EVENTS)),
    dayEventIdx: 0,
    nightEvents: shuffle(state, expand(NIGHT_EVENTS)),
    nightEventIdx: 0,
    equipment: shuffle(state, expand(EQUIPMENT)),
    equipmentIdx: 0,
    equipmentDiscard: [],
  };

  state.tower = { ownerId: null, lockedUntilTurn: 0 };
  state.turnNumber = 0;
  state.daysElapsed = 0;
  state.log = [];
  state.turn = null;

  beginTurn(state);
  return state;
}

// --- turn lifecycle --------------------------------------------------------

function drawPhaseCard(state) {
  const d = state.decks;
  if (d.phaseIdx >= d.phase.length) {
    // 50 cards is more than a game needs, but reshuffle rather than crash.
    d.phase = shuffle(state, d.phase);
    d.phaseIdx = 0;
  }
  return d.phase[d.phaseIdx++];
}

function drawEquipment(state) {
  const d = state.decks;
  if (d.equipmentIdx >= d.equipment.length) {
    if (d.equipmentDiscard.length === 0) return null;
    d.equipment = shuffle(state, d.equipmentDiscard);
    d.equipmentDiscard = [];
    d.equipmentIdx = 0;
  }
  return d.equipment[d.equipmentIdx++];
}

function drawEvent(state, phase) {
  const d = state.decks;
  const key = phase === 'day' ? 'dayEvents' : 'nightEvents';
  const idxKey = phase === 'day' ? 'dayEventIdx' : 'nightEventIdx';
  if (d[idxKey] >= d[key].length) {
    d[key] = shuffle(state, d[key]);
    d[idxKey] = 0;
  }
  return d[key][d[idxKey]++];
}

export function beginTurn(state) {
  const drawn = drawPhaseCard(state);
  const { phase, id } = drawn;
  const card = phaseCardById(phase, id);
  const fx = effectsFor(phase, id);

  state.turnNumber++;

  const turn = {
    number: state.turnNumber,
    phase,
    cardId: id,
    cardName: card.name,
    cardText: card.text,
    effects: fx,
    step: 'spin',
    blockedArc: null,
    choices: {},           // playerId -> tile (redacted until reveal)
    locked: [],            // playerIds who have committed
    resolution: [],        // ordered log entries produced at reveal
    shop: [],
    monsterId: null,
    monsterHp: null,
    monsterDefeated: false,
    combatants: [],
    ringFighters: [],
    towerChallengers: [],
  };

  state.turn = turn;

  if (phase === 'day') {
    state.daysElapsed++;
    // Every day card brings a fresh monster.
    advanceMonster(state, turn);
    // One shop card per player, or two under Feria del Gremio.
    const per = fx.shopCardsPerPlayer ?? 1;
    for (let i = 0; i < state.players.length * per; i++) {
      const eq = drawEquipment(state);
      if (eq != null) turn.shop.push(eq);
    }
  }

  // Start-of-phase blanket effects.
  if (fx.restoreManaAtStart) {
    for (const p of state.players) p.mana = p.maxMana;
  }
  if (fx.goldForAll) {
    for (const p of state.players) p.gold += fx.goldForAll;
  }

  // Tower income, unless the card suspends it.
  if (state.tower.ownerId && !fx.noTowerIncome) {
    const owner = state.players.find((p) => p.id === state.tower.ownerId);
    if (owner) {
      owner.gold += TOWER_INCOME;
      log(state, `${owner.name} cobra ${TOWER_INCOME} de oro de su torre.`);
    }
  }

  if (fx.revealNextMonster) {
    const next = state.decks.monsters[state.decks.monsterIdx + 1];
    if (next != null) turn.oracleMonsterId = next;
  }

  log(state, `Turno ${turn.number} — ${phase === 'day' ? 'Día' : 'Noche'}: ${card.name}`);
  return turn;
}

function advanceMonster(state, turn) {
  const d = state.decks;
  const previous = d.monsterIdx >= 0 ? monsterById(d.monsters[d.monsterIdx]) : null;
  d.monsterIdx++;

  const id = d.monsters[d.monsterIdx];
  if (id == null) return; // deck spent; the game ends after this turn resolves

  const monster = monsterById(id);
  turn.monsterId = id;
  turn.monsterHp = monsterHp(monster, state.players.length, {
    legendary: Boolean(turn.effects.legendaryMonster),
  });

  // Crossing into a harder tier grants everyone permanent max mana.
  if (previous && TIER_ORDER.indexOf(monster.tier) > TIER_ORDER.indexOf(previous.tier)) {
    for (const p of state.players) {
      p.maxMana += MANA_GAIN_PER_TIER_TRANSITION;
      p.mana = Math.min(p.mana + MANA_GAIN_PER_TIER_TRANSITION, p.maxMana);
    }
    log(state, `Nueva categoría: ${monster.tier}. Todos ganan +1 de maná máximo.`);
  }

  // "Mazmorra Cerrada" burns the card without anyone fighting it.
  if (turn.effects.discardMonster) {
    turn.monsterDefeated = true;
    log(state, `La mazmorra está cerrada: ${monster.name} se descarta.`);
  }
}

// --- roulette --------------------------------------------------------------

/**
 * Blocks one whole arc — its day tile and its night tile — for this turn.
 * `arcId` is only honoured in the "token holder chooses" variant.
 */
export function spinRoulette(state, playerId, arcId = null) {
  const turn = requireTurn(state);
  if (turn.step !== 'spin') throw new Error('la ruleta ya se giró');
  if (playerId !== state.tokenHolderId) throw new Error('solo el dueño del token gira');

  let arc;
  if (state.options?.tokenHolderPicksBlock && arcId) {
    arc = ARCS.find((a) => a.id === arcId);
    if (!arc) throw new Error('arco desconocido');
  } else {
    arc = ARCS[Math.floor(rngFor(state)() * ARCS.length)];
  }

  turn.blockedArc = arc.id;
  turn.step = 'choosing';

  const tile = turn.phase === 'day' ? arc.day : arc.night;
  log(state, `La ruleta bloquea: ${tile}.`);

  // If the roulette closes the dungeon, the monster is discarded exactly as if
  // "Mazmorra Cerrada" had come up. The game still runs 10 monsters.
  if (turn.phase === 'day' && tile === 'mazmorra' && !turn.monsterDefeated) {
    turn.monsterDefeated = true;
    log(state, 'La mazmorra queda bloqueada: la carta de monstruo se descarta.');
  }

  return turn;
}

// --- tile selection --------------------------------------------------------

/** Tiles a player may pick this turn, after roulette and card effects. */
export function availableTiles(state) {
  const turn = requireTurn(state);
  let tiles = turn.phase === 'day' ? [...DAY_TILES] : [...NIGHT_TILES];

  const { replaceTile, closeTile } = turn.effects;
  if (replaceTile) {
    tiles = tiles.map((t) => (t === replaceTile.from ? replaceTile.to : t));
  }

  return tiles.filter((tile) => {
    if (closeTile && tile === closeTile) return false;
    const arc = arcOfTile(tile, turn.phase);
    return arc?.id !== turn.blockedArc;
  });
}

export function chooseTile(state, playerId, tile) {
  const turn = requireTurn(state);
  if (turn.step !== 'choosing') throw new Error('no es momento de elegir');
  const player = requirePlayer(state, playerId);

  if (!availableTiles(state).includes(tile)) {
    throw new Error('esa casilla no está disponible');
  }

  turn.choices[playerId] = tile;
  if (!turn.locked.includes(playerId)) turn.locked.push(playerId);

  // Everyone in — reveal automatically. Disconnected players don't stall the
  // table; they're skipped and resolve as no-ops.
  const active = state.players.filter((p) => p.connected).map((p) => p.id);
  const pending = active.filter((id) => !turn.locked.includes(id));
  if (pending.length === 0) reveal(state);

  return turn;
}

export function unchooseTile(state, playerId) {
  const turn = requireTurn(state);
  if (turn.step !== 'choosing') throw new Error('ya no puedes cambiar');
  delete turn.choices[playerId];
  turn.locked = turn.locked.filter((id) => id !== playerId);
  return turn;
}

// --- reveal & resolution ---------------------------------------------------

/** Turn order for this turn, starting at the token holder, honouring reversals. */
export function turnOrder(state) {
  const turn = state.turn;
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const start = players.findIndex((p) => p.id === state.tokenHolderId);
  const rotated = [...players.slice(start), ...players.slice(0, start)];
  return turn?.effects?.reverseTurnOrder
    ? [rotated[0], ...rotated.slice(1).reverse()]
    : rotated;
}

export function reveal(state) {
  const turn = requireTurn(state);
  if (turn.step !== 'choosing') return turn;
  turn.step = 'revealed';
  resolve(state);
  return turn;
}

/**
 * Applies every tile in turn order, dungeons last.
 * Tiles needing player interaction (shop purchases, duels, dungeon combat) are
 * staged here and completed by their own actions before the turn advances.
 */
function resolve(state) {
  const turn = state.turn;
  const order = turnOrder(state);
  const fx = turn.effects;

  const at = (tile) => order.filter((p) => turn.choices[p.id] === tile);

  // --- descanso: full mana
  for (const p of at('descanso')) {
    p.mana = p.maxMana;
    p.mustRestNextNight = false;
    turn.resolution.push({ playerId: p.id, tile: 'descanso', text: 'Recupera todo su maná.' });
  }

  // --- trabajo: flat gold, doubled by Ingresos Extra
  const workGold = TRABAJO_GOLD * (fx.workGoldMultiplier ?? 1);
  for (const p of at('trabajo')) {
    p.gold += workGold;
    turn.resolution.push({ playerId: p.id, tile: 'trabajo', text: `Gana ${workGold} de oro.` });
  }

  // --- evento: draw, hold for the player to apply
  const eventCount = fx.eventCards ?? 1;
  for (const p of at('evento')) {
    const drawn = [];
    for (let i = 0; i < eventCount; i++) {
      const id = drawEvent(state, turn.phase);
      const ev = eventById(turn.phase, id);
      if (ev) drawn.push({ id: ev.id, name: ev.name, text: ev.text, phase: turn.phase });
    }
    p.pendingEvents.push(...drawn);
    turn.resolution.push({
      playerId: p.id, tile: 'evento',
      text: drawn.map((e) => e.name).join(' · '),
      events: drawn,
    });
  }

  // --- tienda: staged; players buy via buyEquipment before advancing
  for (const p of at('tienda')) {
    turn.resolution.push({ playerId: p.id, tile: 'tienda', text: 'Puede comprar.', pending: true });
  }

  // --- torre: unclaimed and alone -> take it; otherwise the first two duel
  const towerVisitors = at('torre');
  if (towerVisitors.length) {
    const locked = turn.number < state.tower.lockedUntilTurn;
    if (locked) {
      for (const p of towerVisitors) {
        turn.resolution.push({ playerId: p.id, tile: 'torre', text: 'La torre está bloqueada.' });
      }
    } else if (towerVisitors.length === 1 && !state.tower.ownerId) {
      const p = towerVisitors[0];
      state.tower.ownerId = p.id;
      state.tower.lockedUntilTurn = turn.number + TOWER_LOCK_TURNS;
      turn.resolution.push({ playerId: p.id, tile: 'torre', text: 'Conquista la torre.' });
    } else {
      // Two or more, or a defended tower: first two in turn order fight.
      turn.towerChallengers = towerVisitors.slice(0, 2).map((p) => p.id);
      for (const p of towerVisitors.slice(2)) {
        const id = drawEvent(state, turn.phase);
        const ev = eventById(turn.phase, id);
        if (ev) p.pendingEvents.push({ ...ev, phase: turn.phase });
        turn.resolution.push({ playerId: p.id, tile: 'torre', text: `No participa: ${ev?.name}` });
      }
    }
  }

  // --- ring: first two duel, a lone visitor gets a consolation
  const ringVisitors = at('ring');
  if (ringVisitors.length === 1) {
    const p = ringVisitors[0];
    p.gold += 3;
    turn.resolution.push({ playerId: p.id, tile: 'ring', text: 'Nadie aparece. Gana 3 de oro.' });
  } else if (ringVisitors.length >= 2) {
    turn.ringFighters = ringVisitors.slice(0, 2).map((p) => p.id);
    for (const p of ringVisitors.slice(2)) {
      const id = drawEvent(state, turn.phase);
      const ev = eventById(turn.phase, id);
      if (ev) p.pendingEvents.push({ ...ev, phase: turn.phase });
      turn.resolution.push({ playerId: p.id, tile: 'ring', text: `No pelea: ${ev?.name}` });
    }
  }

  // --- mazmorra: always last
  const delvers = at('mazmorra');
  if (delvers.length && !turn.monsterDefeated) {
    turn.combatants = delvers.map((p) => p.id);
    turn.resolution.push({
      tile: 'mazmorra',
      text: `${delvers.length} al combate.`,
      pending: true,
    });
  } else if (delvers.length) {
    for (const p of delvers) {
      turn.resolution.push({ playerId: p.id, tile: 'mazmorra', text: 'La mazmorra está cerrada.' });
    }
  }

  turn.step = 'resolved';
}

// --- shop ------------------------------------------------------------------

export function buyEquipment(state, playerId, equipmentId) {
  const turn = requireTurn(state);
  const player = requirePlayer(state, playerId);

  if (turn.choices[playerId] !== 'tienda') throw new Error('no estás en la tienda');
  if (turn.step !== 'resolved') throw new Error('todavía no');

  const idx = turn.shop.indexOf(equipmentId);
  if (idx === -1) throw new Error('ese equipamiento no está en la tienda');

  const item = equipmentById(equipmentId);
  const character = characterById(player.characterId);

  let price = item.price * (turn.effects.shopPriceMultiplier ?? 1);
  if (character.id === 'remi') price -= 2;           // Hombre Topo discount
  price = Math.max(0, Math.ceil(price));

  if (player.gold < price) throw new Error('no tienes suficiente oro');
  if (player.equipment.length >= player.equipmentSlots) {
    throw new Error('no te quedan espacios de equipamiento');
  }

  player.gold -= price;
  player.equipment.push(equipmentId);
  turn.shop.splice(idx, 1);
  log(state, `${player.name} compra ${item.name} por ${price} de oro.`);
  return state;
}

export function sellEquipment(state, playerId, equipmentId) {
  const player = requirePlayer(state, playerId);
  const idx = player.equipment.indexOf(equipmentId);
  if (idx === -1) throw new Error('no tienes ese equipamiento');

  const item = equipmentById(equipmentId);
  if (item.name === 'Plaga') throw new Error('la Plaga no puede venderse');

  const full = state.turn?.effects?.sellAtFullPrice;
  const value = full ? item.price : Math.floor(item.price / 2);

  player.equipment.splice(idx, 1);
  state.decks.equipmentDiscard.push(equipmentId);
  player.gold += value;
  log(state, `${player.name} vende ${item.name} por ${value} de oro.`);
  return state;
}

// --- advancing -------------------------------------------------------------

/** True when nothing is left for players to act on this turn. */
export function turnComplete(state) {
  const turn = state.turn;
  if (!turn || turn.step !== 'resolved') return false;
  return (
    turn.combatants.length === 0 &&
    turn.ringFighters.length === 0 &&
    turn.towerChallengers.length === 0
  );
}

export function nextTurn(state) {
  const turn = requireTurn(state);
  if (turn.step !== 'resolved') throw new Error('el turno no ha terminado');

  // Skull regenerates mana overnight without visiting Descanso.
  if (turn.phase === 'night') {
    for (const p of state.players) {
      const c = characterById(p.characterId);
      if (c?.nightManaRegen) {
        p.mana = Math.min(p.maxMana, p.mana + c.nightManaRegen);
      }
    }
  }

  // Token passes to the right.
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const i = players.findIndex((p) => p.id === state.tokenHolderId);
  state.tokenHolderId = players[(i + 1) % players.length].id;

  // Ten monsters is the whole game.
  if (state.daysElapsed >= TOTAL_MONSTERS) {
    state.phase = 'tournament';
    state.turn = null;
    log(state, 'Se agotaron los monstruos. ¡Comienza el Torneo Final!');
    return state;
  }

  beginTurn(state);
  return state;
}

// --- helpers ---------------------------------------------------------------

function requireTurn(state) {
  if (state.phase !== 'playing' || !state.turn) throw new Error('la partida no está en curso');
  return state.turn;
}

function requirePlayer(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error('no estás en la partida');
  return p;
}

function log(state, text) {
  state.log ??= [];
  state.log.push({ turn: state.turnNumber, text });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

// --- redaction -------------------------------------------------------------

/**
 * Per-player view. Tile choices are secret until the reveal, so each player
 * sees only their own pick plus who has locked in — the server never ships
 * another player's choice early, which no amount of client code could undo.
 */
export function viewFor(state, playerId) {
  const view = structuredClone(state);

  if (view.turn && view.turn.step === 'choosing' && !view.turn.effects.openChoices) {
    const mine = view.turn.choices[playerId];
    view.turn.choices = mine ? { [playerId]: mine } : {};
  }

  // Other players' hands stay hidden; only counts are public.
  for (const p of view.players) {
    if (p.id !== playerId) {
      p.equipmentCount = p.equipment?.length ?? 0;
      p.objectCount = p.objects?.length ?? 0;
      delete p.equipment;
      delete p.objects;
      delete p.pendingEvents;
    }
  }

  // The upcoming monster order is not public knowledge.
  if (view.decks) {
    delete view.decks.monsters;
    delete view.decks.phase;
    delete view.decks.dayEvents;
    delete view.decks.nightEvents;
    delete view.decks.equipment;
  }
  delete view.rng;

  return view;
}
