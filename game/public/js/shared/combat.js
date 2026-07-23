// Combat: co-op dungeon runs and PvP duels.
//
// The server rolls every die. Clients only ever send intent ("use this card",
// "I'm done"), so a modified client cannot invent a 6.
//
// Both combat types share a shape:
//   { kind, step, sides/combatants, target, log }
// and both end by writing rewards back onto the players.

import { MONSTERS, EQUIPMENT } from './data.js';
import { monsterHp, DICE_PER_COMBATANT, RING_WIN_GOLD } from './rules.js';
import { evaluate, isCursed } from './equipment-fx.js';

const monsterById = (id) => MONSTERS.find((m) => m.id === id) ?? null;
const equipmentById = (id) => EQUIPMENT.find((e) => e.id === id) ?? null;

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// --- monster abilities that change how the fight is set up -----------------
//
// Post-combat abilities (rewards, penalties) are resolved by the engine; these
// are only the ones that alter dice or hit points before rolling.

// Monsters whose mechanic isn't a straight "beat this number". They still roll
// normally, but the table declares the outcome instead of the engine guessing.
// Silently comparing against a null HP would auto-win, which is worse than asking.
export const MANUAL_OUTCOME_MONSTERS = {
  16: 'Cada combatiente elige en secreto ayudar a la Polilla o al grupo. ' +
      'Sumad cada bando y declarad el resultado.',
  19: 'Cada jugador debe vencerlo individualmente (15 PV cada uno). ' +
      'Declarad el resultado del grupo.',
  20: 'Cada jugador apuesta oro en orden de turno. Declarad el resultado.',
};

const MONSTER_SETUP = {
  // Grumo: the first combatant rolls a die, added to the monster's HP.
  1: (c, { roll }) => {
    const d = roll();
    c.hp += d;
    c.log.push(`Grumo crece: +${d} de vida (${c.hp}).`);
  },
  // Diablillo: everyone rerolls their highest die once.
  2: (c, { roll }) => {
    for (const f of c.fighters) {
      const i = f.dice.indexOf(Math.max(...f.dice));
      const before = f.dice[i];
      f.dice[i] = roll();
      c.log.push(`${f.name} repite su ${before} → ${f.dice[i]}.`);
    }
  },
  // Mímico: wins outright if the whole table shows up.
  3: (c, { playersAtTable }) => {
    if (c.fighters.length === playersAtTable) {
      c.autoLose = true;
      c.log.push('El Mímico gana automáticamente: fueron todos los jugadores.');
    }
  },
  // Sombra Acechante (reworked): the monster rolls 2 dice per combatant itself.
  7: (c, { roll }) => {
    let extra = 0;
    for (let i = 0; i < c.fighters.length * 2; i++) extra += roll();
    c.hp += extra;
    c.log.push(`La Sombra lanza ${c.fighters.length * 2} dados: +${extra} de vida (${c.hp}).`);
  },
  // Bruja: no equipment allowed, but three dice each.
  8: (c, { roll }) => {
    c.noEquipment = true;
    for (const f of c.fighters) {
      f.dice.push(roll());
      f.total = sum(f.dice);
    }
    c.log.push('La Bruja prohíbe equipamientos, pero todos lanzan 3 dados.');
  },
  // Horda Zombie: +3 HP for every player who stayed away.
  10: (c, { playersAtTable }) => {
    const absent = playersAtTable - c.fighters.length;
    if (absent > 0) {
      c.hp += absent * 3;
      c.log.push(`La Horda gana +${absent * 3} de vida por los ausentes (${c.hp}).`);
    }
  },
  // Gigante de Hielo: everyone starts on 1s; only equipment can move them.
  17: (c) => {
    for (const f of c.fighters) {
      f.dice = f.dice.map(() => 1);
      f.total = sum(f.dice);
    }
    c.log.push('El Gigante congela los dados: todos empiezan en 1.');
  },
};

// --- dungeon ---------------------------------------------------------------

export function startDungeon(state, { roll }) {
  const turn = state.turn;
  const monster = monsterById(turn.monsterId);
  const order = turn.combatants;

  const fighters = order.map((pid) => {
    const p = state.players.find((x) => x.id === pid);
    const dice = Array.from({ length: DICE_PER_COMBATANT }, roll);
    return {
      playerId: pid,
      name: p.name,
      dice,
      total: sum(dice),
      bonus: 0,
      used: [],
      done: false,
    };
  });

  const combat = {
    kind: 'dungeon',
    step: 'active',
    monsterId: monster.id,
    monsterName: monster.name,
    hp: turn.monsterHp ?? monsterHp(monster, state.players.length),
    baseHp: monsterHp(monster, state.players.length),
    legendary: Boolean(turn.effects?.legendaryMonster),
    fighters,
    noEquipment: false,
    autoLose: false,
    activeIdx: 0,
    log: [],
    outcome: null,
  };

  combat.manualOutcome = MANUAL_OUTCOME_MONSTERS[monster.id] ?? null;

  MONSTER_SETUP[monster.id]?.(combat, {
    roll,
    playersAtTable: state.players.length,
  });

  combat.log.unshift(
    `${monster.name} — ${combat.hp} PV · ${fighters.length} combatiente(s).`,
  );

  if (combat.autoLose) finishDungeon(state, combat);
  return combat;
}

export function dungeonTotal(combat) {
  return sum(combat.fighters.map((f) => f.total + f.bonus));
}

/** Snapshot handed to equipment effects. */
function dungeonSnapshot(combat, fighter) {
  const allDice = combat.fighters.flatMap((f) => f.dice);
  return {
    myDice: fighter.dice,
    allDice,
    rivalDice: [],
    usedBefore: fighter.used.length,
    rivalUsed: 0,
    myMana: 0,
    rivalMana: 0,
    myTotal: fighter.total + fighter.bonus,
    rivalTotal: combat.hp,
    monsterBaseHp: combat.baseHp,
    diceSwapped: false,
  };
}

export function useEquipmentInDungeon(state, combat, playerId, equipmentId, manualBonus, roll) {
  if (combat.step !== 'active') throw new Error('el combate terminó');
  if (combat.noEquipment) throw new Error('este monstruo prohíbe equipamientos');

  const fighter = combat.fighters.find((f) => f.playerId === playerId);
  if (!fighter) throw new Error('no estás en este combate');
  if (fighter.used.includes(equipmentId)) throw new Error('ya usaste esa carta');

  const player = state.players.find((p) => p.id === playerId);
  if (!player.equipment.includes(equipmentId)) throw new Error('no tienes esa carta');

  const item = equipmentById(equipmentId);
  if (player.mana < item.mana) throw new Error('no tienes suficiente maná');

  const res = evaluate(equipmentId, dungeonSnapshot(combat, fighter), { isDungeon: true });
  if (res.inert) throw new Error('esa carta no sirve en mazmorra');

  const bonus = res.manual ? Number(manualBonus ?? 0) : res.bonus;

  player.mana -= item.mana;
  fighter.used.push(equipmentId);
  fighter.bonus += bonus;

  if (res.rollsExtraDie) {
    // Comodín and friends: the server rolls, not the client.
    const d = roll();
    fighter.dice.push(d);
    fighter.total = sum(fighter.dice);
    combat.log.push(`${fighter.name} usa ${item.name}: dado extra ${d}.`);
  } else {
    combat.log.push(`${fighter.name} usa ${item.name}: +${bonus}.`);
  }

  return combat;
}

export function passDungeon(state, combat, playerId) {
  const fighter = combat.fighters.find((f) => f.playerId === playerId);
  if (!fighter) throw new Error('no estás en este combate');
  fighter.done = true;

  if (combat.fighters.every((f) => f.done)) finishDungeon(state, combat);
  return combat;
}

/** Used for the monsters whose outcome the table declares. */
export function declareDungeonOutcome(state, combat, outcome) {
  if (combat.step !== 'awaiting-outcome') throw new Error('no hay nada que declarar');
  if (outcome !== 'victory' && outcome !== 'defeat') throw new Error('resultado inválido');
  combat.step = 'done';
  combat.outcome = outcome;
  combat.log.push(outcome === 'victory' ? 'La mesa declara victoria.' : 'La mesa declara derrota.');
  return combat;
}

function finishDungeon(state, combat) {
  const total = dungeonTotal(combat);
  combat.finalTotal = total;

  if (combat.autoLose) {
    combat.step = 'done';
    combat.outcome = 'defeat';
    return combat;
  }

  // Special-mechanic monsters: hand the call to the table rather than compare
  // against an HP that doesn't exist.
  if (combat.manualOutcome) {
    combat.step = 'awaiting-outcome';
    combat.log.push(`Total del grupo: ${total}. ${combat.manualOutcome}`);
    return combat;
  }

  const won = total > combat.hp;
  combat.step = 'done';
  combat.outcome = won ? 'victory' : 'defeat';
  combat.log.push(
    won
      ? `¡Victoria! ${total} supera los ${combat.hp} PV.`
      : `Derrota: ${total} no supera los ${combat.hp} PV.`,
  );
  return combat;
}

// --- duel (PvP) ------------------------------------------------------------

/**
 * `advantageId` wins ties and forces the other player to act first — the token
 * order during the game, the tournament order during the final.
 */
export function startDuel(state, aId, bId, { roll, advantageId, stake = RING_WIN_GOLD, context = 'ring' }) {
  const mk = (pid) => {
    const p = state.players.find((x) => x.id === pid);
    const dice = Array.from({ length: DICE_PER_COMBATANT }, roll);
    return {
      playerId: pid,
      name: p.name,
      dice,
      total: sum(dice),
      bonus: 0,
      used: [],
      passed: false,
    };
  };

  const duel = {
    kind: 'duel',
    step: 'active',
    context,
    stake,
    advantageId: advantageId ?? aId,
    sides: [mk(aId), mk(bId)],
    log: [],
    outcome: null,
  };

  const [a, b] = duel.sides;
  duel.log.push(
    `${a.name} ${a.dice.join('+')} = ${a.total}  ·  ${b.name} ${b.dice.join('+')} = ${b.total}`,
  );
  duel.turnId = losingSide(duel).playerId;
  return duel;
}

const scoreOf = (side) => side.total + side.bonus;

/** Who is currently behind — ties break against the player without advantage. */
function losingSide(duel) {
  const [a, b] = duel.sides;
  if (scoreOf(a) === scoreOf(b)) {
    return a.playerId === duel.advantageId ? b : a;
  }
  return scoreOf(a) < scoreOf(b) ? a : b;
}

function duelSnapshot(duel, me, rival) {
  return {
    myDice: me.dice,
    allDice: [...me.dice, ...rival.dice],
    rivalDice: rival.dice,
    usedBefore: me.used.length,
    rivalUsed: rival.used.length,
    myMana: 0,
    rivalMana: 0,
    myTotal: scoreOf(me),
    rivalTotal: scoreOf(rival),
    monsterBaseHp: 0,
    diceSwapped: false,
  };
}

export function useEquipmentInDuel(state, duel, playerId, equipmentId, manualBonus, roll) {
  if (duel.step !== 'active') throw new Error('el duelo terminó');
  if (duel.turnId !== playerId) throw new Error('no es tu turno');

  const me = duel.sides.find((s) => s.playerId === playerId);
  const rival = duel.sides.find((s) => s.playerId !== playerId);
  if (me.used.includes(equipmentId)) throw new Error('ya usaste esa carta');

  const player = state.players.find((p) => p.id === playerId);
  if (!player.equipment.includes(equipmentId)) throw new Error('no tienes esa carta');

  const item = equipmentById(equipmentId);
  if (player.mana < item.mana) throw new Error('no tienes suficiente maná');

  const res = evaluate(equipmentId, duelSnapshot(duel, me, rival));
  const bonus = res.manual ? Number(manualBonus ?? 0) : res.bonus;

  player.mana -= item.mana;
  me.used.push(equipmentId);
  me.bonus += bonus;

  if (res.rollsExtraDie) {
    const d = roll();
    me.dice.push(d);
    me.total = sum(me.dice);
    duel.log.push(`${me.name} usa ${item.name}: dado extra ${d} (${scoreOf(me)}).`);
  } else {
    duel.log.push(`${me.name} usa ${item.name}: +${bonus} (${scoreOf(me)}).`);
  }

  // Playing a card clears the other side's pass: they may now respond again.
  rival.passed = false;
  duel.turnId = losingSide(duel).playerId;
  return duel;
}

export function passDuel(state, duel, playerId) {
  if (duel.step !== 'active') throw new Error('el duelo terminó');
  if (duel.turnId !== playerId) throw new Error('no es tu turno');

  const me = duel.sides.find((s) => s.playerId === playerId);
  me.passed = true;
  duel.log.push(`${me.name} no responde.`);

  const rival = duel.sides.find((s) => s.playerId !== playerId);
  // The trailing player conceding ends it; otherwise hand over.
  if (me.playerId === losingSide(duel).playerId || rival.passed) {
    return finishDuel(state, duel);
  }
  duel.turnId = rival.playerId;
  return duel;
}

function finishDuel(state, duel) {
  const [a, b] = duel.sides;
  let winner;
  if (scoreOf(a) === scoreOf(b)) {
    winner = duel.sides.find((s) => s.playerId === duel.advantageId);
    duel.log.push('Empate: gana quien tiene la ventaja.');
  } else {
    winner = scoreOf(a) > scoreOf(b) ? a : b;
  }

  duel.step = 'done';
  duel.winnerId = winner.playerId;
  duel.outcome = 'decided';
  duel.log.push(
    `${winner.name} gana ${scoreOf(a)} vs ${scoreOf(b)}.`.replace(
      `${scoreOf(a)} vs ${scoreOf(b)}`,
      winner === a ? `${scoreOf(a)} vs ${scoreOf(b)}` : `${scoreOf(b)} vs ${scoreOf(a)}`,
    ),
  );

  // Plaga sticks to whoever used it, moving to the opponent afterwards.
  for (const side of duel.sides) {
    for (const id of side.used) {
      if (!isCursed(id)) continue;
      const from = state.players.find((p) => p.id === side.playerId);
      const to = state.players.find((p) => p.id !== side.playerId && duel.sides.some((s) => s.playerId === p.id));
      const i = from?.equipment.indexOf(id) ?? -1;
      if (i >= 0 && to) {
        from.equipment.splice(i, 1);
        to.equipment.push(id);
        duel.log.push('La Plaga pasa al rival.');
      }
    }
  }

  return duel;
}

// Note: the roller is threaded through every call rather than held in a module
// variable. Workers share globals across requests in an isolate, so a stashed
// roller would leak one room's RNG into another.
