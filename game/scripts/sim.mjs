// Headless simulation: plays a full game with random-but-legal choices and
// asserts the invariants that matter. Run: node scripts/sim.mjs [seed]
//
// This is not a unit test suite; it's a soak test that catches the failures
// that actually happen in a turn engine — decks running dry, the game never
// ending, mana or gold going negative, blocked tiles being chosen.

import {
  startGame, spinRoulette, chooseTile, nextTurn, turnComplete,
  availableTiles, viewFor, makeRng,
} from '../public/js/shared/engine.js';
import { TOTAL_MONSTERS, ARCS } from '../public/js/shared/rules.js';
import { CHARACTERS } from '../public/js/shared/data.js';

const seed = Number(process.argv[2] ?? 12345);
const rng = makeRng(seed);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

function makeState(playerCount, gameSeed = seed) {
  return {
    version: 1,
    phase: 'lobby',
    hostId: 'p0',
    // Each game needs its own deck seed, otherwise the soak below replays one
    // shuffle over and over and proves nothing about deck variance.
    rng: { seed: gameSeed, cursor: 0 },
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i}`,
      name: `Jugador${i}`,
      characterId: CHARACTERS[i].id,
      connected: true,
      seat: i,
    })),
  };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\n  FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function playGame(playerCount, { verbose = false, gameSeed = seed } = {}) {
  const state = makeState(playerCount, gameSeed);
  startGame(state);

  let guard = 0;
  const tilesSeen = new Set();
  const monstersSeen = [];

  while (state.phase === 'playing') {
    if (++guard > 500) throw new Error('game never ended');
    const turn = state.turn;

    // 1. token holder spins
    spinRoulette(state, state.tokenHolderId);
    assert(turn.blockedArc, 'roulette produced no blocked arc');

    const legal = availableTiles(state);
    assert(legal.length >= 2, `only ${legal.length} legal tiles on turn ${turn.number}`);

    const blocked = ARCS.find((a) => a.id === turn.blockedArc);
    const blockedTile = turn.phase === 'day' ? blocked.day : blocked.night;
    assert(!legal.includes(blockedTile), `blocked tile ${blockedTile} still selectable`);

    if (turn.phase === 'day' && turn.monsterId) monstersSeen.push(turn.monsterId);

    // 2. everyone picks something legal
    for (const p of state.players) {
      const tile = pick(legal);
      tilesSeen.add(tile);
      chooseTile(state, p.id, tile);
    }

    assert(turn.step === 'resolved', `turn ${turn.number} did not resolve`);

    // Combat is not wired yet, so clear the staged interactions.
    turn.combatants = [];
    turn.ringFighters = [];
    turn.towerChallengers = [];
    assert(turnComplete(state), 'turn should be complete once combats are cleared');

    if (verbose) {
      console.log(
        `  t${String(turn.number).padStart(2)} ${turn.phase === 'day' ? '☀' : '☾'} ` +
        `${turn.cardName.padEnd(22)} bloquea:${blockedTile.padEnd(9)} ` +
        `legales:${legal.length}`,
      );
    }

    nextTurn(state);
  }

  // --- invariants
  assert(state.phase === 'tournament', `ended in phase ${state.phase}`);
  assert(state.daysElapsed === TOTAL_MONSTERS,
    `expected ${TOTAL_MONSTERS} days, got ${state.daysElapsed}`);
  assert(monstersSeen.length === TOTAL_MONSTERS,
    `expected ${TOTAL_MONSTERS} monsters, saw ${monstersSeen.length}`);
  assert(new Set(monstersSeen).size === TOTAL_MONSTERS, 'a monster repeated');

  for (const p of state.players) {
    assert(p.gold >= 0, `${p.name} has negative gold (${p.gold})`);
    assert(p.mana >= 0 && p.mana <= p.maxMana, `${p.name} mana out of range`);
    assert(p.equipment.length <= p.equipmentSlots, `${p.name} over equipment limit`);
  }

  // Everyone should have gained +1 max mana per tier transition (3 of them).
  for (const p of state.players) {
    const base = CHARACTERS.find((c) => c.id === p.characterId).maxMana;
    assert(p.maxMana === base + 3,
      `${p.name} maxMana ${p.maxMana}, expected ${base + 3}`);
  }

  return { state, turns: guard, tilesSeen, monstersSeen };
}

// --- run -------------------------------------------------------------------

console.log(`seed ${seed}\n`);

console.log('4-player game, turn by turn:');
const demo = playGame(4, { verbose: true });
console.log(
  `\n  -> ${demo.turns} turns, ${demo.state.daysElapsed} days, ` +
  `tournament reached. tiles exercised: ${[...demo.tilesSeen].sort().join(', ')}\n`,
);

console.log('soak: 3-6 players x 40 seeds');
const turnCounts = [];
for (let n = 3; n <= 6; n++) {
  for (let s = 0; s < 40; s++) {
    const r = playGame(n, { gameSeed: seed + n * 104729 + s * 7919 });
    turnCounts.push(r.turns);
  }
  process.stdout.write(`  ${n}p ok`);
}
const avg = turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length;
console.log(
  `\n\n  160 games, all reached the tournament.` +
  `\n  turns per game: min ${Math.min(...turnCounts)}, ` +
  `avg ${avg.toFixed(1)}, max ${Math.max(...turnCounts)}`,
);

// --- redaction check -------------------------------------------------------

const s = makeState(4);
startGame(s);
spinRoulette(s, s.tokenHolderId);
chooseTile(s, 'p0', availableTiles(s)[0]);
chooseTile(s, 'p1', availableTiles(s)[1]);

const asP0 = viewFor(s, 'p0');
console.log('\nredaction while choosing:');
console.log('  p0 sees choices:', JSON.stringify(asP0.turn.choices));
assert(Object.keys(asP0.turn.choices).length === 1, 'p0 saw another player\'s choice');
assert(asP0.players.find((p) => p.id === 'p1').equipment === undefined,
  'p1 hand leaked to p0');
assert(asP0.decks.monsters === undefined, 'upcoming monster order leaked');
assert(asP0.rng === undefined, 'rng seed leaked');
console.log('  hidden: other hands, upcoming monsters, rng seed  ✓');
