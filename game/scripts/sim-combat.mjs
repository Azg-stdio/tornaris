// Soak test for combat and the tournament: plays full games including dungeon
// runs, ring duels and the final bracket. Run: node scripts/sim-combat.mjs [seed]

import {
  startGame, spinRoulette, chooseTile, nextTurn, turnComplete, availableTiles,
  beginDungeonCombat, dungeonUse, dungeonPass, dungeonDeclare,
  beginDuel, duelUse, duelPass, buyEquipment,
  rollTournamentOrder, convertGold, finishConversion,
  startTournamentMatch, tournamentPass, tournamentUse,
  makeRng,
} from '../public/js/shared/engine.js';
import { CHARACTERS, EQUIPMENT } from '../public/js/shared/data.js';
import { TOTAL_MONSTERS } from '../public/js/shared/rules.js';
import { EQUIPMENT_FX, evaluate } from '../public/js/shared/equipment-fx.js';

const seed = Number(process.argv[2] ?? 4242);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeState(n, gameSeed) {
  return {
    version: 1, phase: 'lobby', hostId: 'p0',
    rng: { seed: gameSeed, cursor: 0 },
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`, name: `J${i}`, characterId: CHARACTERS[i].id,
      connected: true, seat: i,
    })),
  };
}

function playGame(n, gameSeed, { verbose = false } = {}) {
  const rng = makeRng(gameSeed ^ 0xabcdef);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const state = makeState(n, gameSeed);
  startGame(state);

  const stats = { dungeons: 0, wins: 0, duels: 0, manualCards: 0, cardsPlayed: 0, declared: 0 };
  let guard = 0;

  while (state.phase === 'playing') {
    assert(++guard < 400, 'game never ended');
    const turn = state.turn;

    spinRoulette(state, state.tokenHolderId);
    const legal = availableTiles(state);

    // Bias towards the shop early and the dungeon later, so equipment actually
    // gets bought and group runs actually happen. Pure random play sends 1-2
    // players against table-scaled HP and never exercises the interesting paths.
    const groupRun = legal.includes('mazmorra') && rng() < 0.35;
    for (const p of state.players) {
      let tile;
      if (groupRun) tile = 'mazmorra';
      else if (legal.includes('tienda') && p.equipment.length < 3 && rng() < 0.5) tile = 'tienda';
      else tile = pick(legal);
      chooseTile(state, p.id, tile);
    }

    // Buy whatever is affordable, to stock hands for later combats.
    if (turn.step === 'resolved') {
      for (const p of state.players) {
        if (turn.choices[p.id] !== 'tienda') continue;
        for (const eqId of [...turn.shop]) {
          try { buyEquipment(state, p.id, eqId); } catch { /* broke or full */ }
        }
      }
    }

    // --- dungeon
    if (turn.combatants.length) {
      stats.dungeons++;
      const combat = beginDungeonCombat(state);
      if (combat.step === 'active') {
        for (const f of [...combat.fighters]) {
          const p = state.players.find((x) => x.id === f.playerId);
          // Spend whatever is affordable, to exercise the effect table.
          for (const eqId of [...p.equipment]) {
            const item = EQUIPMENT.find((e) => e.id === eqId);
            if (p.mana < item.mana) continue;
            const res = evaluate(eqId, {
              myDice: f.dice, allDice: f.dice, rivalDice: [], usedBefore: f.used.length,
              rivalUsed: 0, myMana: p.mana, rivalMana: 0, myTotal: f.total,
              rivalTotal: combat.hp, monsterBaseHp: combat.baseHp, diceSwapped: false,
            }, { isDungeon: true });
            if (res.inert) continue;
            if (res.manual) stats.manualCards++;
            try { dungeonUse(state, f.playerId, eqId, res.manual ? 2 : undefined); }
            catch { /* mana ran out mid-loop */ }
          }
          dungeonPass(state, f.playerId);
        }
      }
      // Special-mechanic monsters wait for the table to declare a result.
      if (combat.step === 'awaiting-outcome') {
        stats.declared++;
        dungeonDeclare(state, rng() < 0.5 ? 'victory' : 'defeat');
      }
      assert(combat.step === 'done', `dungeon stuck at ${combat.step}`);
      assert(combat.outcome, 'dungeon finished without an outcome');
      if (combat.outcome === 'victory') stats.wins++;
      if (verbose) {
        console.log(`   mazmorra ${combat.monsterName}: ${combat.finalTotal ?? 0}/${combat.hp} -> ${combat.outcome}`);
      }
    }

    // --- ring duel
    if (turn.ringFighters.length === 2) {
      stats.duels++;
      const [a, b] = turn.ringFighters;
      const duel = beginDuel(state, a, b, 'ring');
      let spins = 0;
      while (duel.step === 'active') {
        assert(++spins < 60, 'duel never ended');
        // The trailing player tries a card before conceding.
        const me = duel.sides.find((s) => s.playerId === duel.turnId);
        const p = state.players.find((x) => x.id === duel.turnId);
        const playable = p.equipment.find((id) => {
          const item = EQUIPMENT.find((e) => e.id === id);
          return p.mana >= item.mana && !me.used.includes(id);
        });
        if (playable && rng() < 0.7) {
          const fx = EQUIPMENT_FX[playable];
          stats.cardsPlayed++;
          if (fx.kind === 'manual' || fx.kind === 'deferred') stats.manualCards++;
          try { duelUse(state, duel.turnId, playable, 2); }
          catch { duelPass(state, duel.turnId); }
        } else {
          duelPass(state, duel.turnId);
        }
      }
      assert(duel.winnerId, 'duel produced no winner');
    }

    // Tower duels are staged the same way; resolve them so the turn can close.
    if (turn.towerChallengers.length === 2) {
      const [a, b] = turn.towerChallengers;
      const duel = beginDuel(state, a, b, 'torre');
      let spins = 0;
      while (duel.step === 'active') {
        assert(++spins < 60, 'tower duel never ended');
        duelPass(state, duel.turnId);
      }
    }
    turn.towerChallengers = [];
    turn.ringFighters = [];
    turn.combatants = [];

    assert(turnComplete(state), 'turn not complete');
    nextTurn(state);
  }

  // --- tournament
  assert(state.phase === 'tournament', 'did not reach tournament');
  const t = rollTournamentOrder(state);
  assert(t.seeds.length === n, 'wrong seed count');

  for (const p of state.players) {
    if (p.gold >= 30) convertGold(state, p.id, 'mana');
    else if (p.gold >= 5) convertGold(state, p.id, 'equipment');
  }
  finishConversion(state);

  let matches = 0;
  while (state.tournament.step !== 'done') {
    assert(++matches < 20, 'tournament never ended');
    startTournamentMatch(state);
    const duel = state.tournament.duel;
    let spins = 0;
    while (state.tournament.duel && state.tournament.duel.step === 'active') {
      assert(++spins < 60, 'tournament duel never ended');
      tournamentPass(state, state.tournament.duel.turnId);
    }
  }

  assert(state.tournament.championId, 'no champion crowned');
  return { state, stats, turns: guard, matches };
}

// --- run -------------------------------------------------------------------

console.log(`seed ${seed}\n`);
console.log('4-player game with combat:');
const demo = playGame(4, seed, { verbose: true });
const champ = demo.state.players.find((p) => p.id === demo.state.tournament.championId);
console.log(`\n  ${demo.turns} turnos · ${demo.stats.dungeons} mazmorras ` +
  `(${demo.stats.wins} victorias) · ${demo.stats.duels} duelos`);
console.log(`  campeon: ${champ.name} tras ${demo.matches} combates de torneo\n`);

console.log('soak: 3-6 players x 30 seeds');
let dungeons = 0, wins = 0, duels = 0, manual = 0, cards = 0, declared = 0;
for (let n = 3; n <= 6; n++) {
  for (let s = 0; s < 30; s++) {
    const r = playGame(n, seed + n * 7717 + s * 104729);
    dungeons += r.stats.dungeons; wins += r.stats.wins;
    duels += r.stats.duels; manual += r.stats.manualCards; declared += r.stats.declared;
    cards += r.stats.cardsPlayed;
  }
  process.stdout.write(`  ${n}p ok`);
}
console.log(`\n\n  120 partidas completas, todas con campeon.`);
console.log(`  ${dungeons} mazmorras, ${(100 * wins / dungeons).toFixed(0)}% de victoria`);
console.log(`  ${duels} duelos de ring · ${cards} cartas jugadas (${manual} manuales)`);
console.log(`  ${declared} combates de mecánica especial resueltos por la mesa`);

// --- equipment coverage ----------------------------------------------------

const kinds = {};
for (const id of Object.keys(EQUIPMENT_FX)) {
  const k = EQUIPMENT_FX[id].kind;
  kinds[k] = (kinds[k] ?? 0) + 1;
}
console.log('\nequipamientos por tipo:',
  Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(' · '));

const missing = EQUIPMENT.filter((e) => !EQUIPMENT_FX[e.id]);
console.log('sin efecto definido:', missing.length ? missing.map((e) => e.name).join(', ') : 'ninguno');
