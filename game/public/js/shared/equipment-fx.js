// Mechanical behaviour for the 42 equipment designs.
//
// Card text is written for humans and a lot of it needs a decision ("choose one
// of your dice", "steal a card from the rival"). Rather than pretend to automate
// all of it, each card declares a `kind`:
//
//   flat      fixed bonus, applied instantly
//   auto      computable from the current combat snapshot
//   manual    needs a player decision -> the client asks, the player states the
//             resulting bonus, exactly as they would at the table
//
// `dungeon` is the alternative bonus for cards whose text has a "Mazmorra:" clause.
//
// The snapshot passed to compute() looks like:
//   { myDice:[..], allDice:[..], rivalDice:[..], usedBefore, rivalUsed,
//     myMana, rivalMana, myTotal, rivalTotal, monsterBaseHp, diceSwapped }

const odd = (d) => d % 2 === 1;
const count = (arr, fn) => arr.filter(fn).length;

export const EQUIPMENT_FX = {
  1:  { kind: 'manual', prompt: 'Elige el dado de otro jugador que copias.' },
  2:  { kind: 'auto', compute: (s) => count(s.allDice, odd) * 3 + count(s.allDice, (d) => !odd(d)) },
  3:  { kind: 'auto', rollsExtraDie: true, compute: () => 0 },
  4:  { kind: 'auto', compute: (s) => Math.max(0, ...s.myDice) },
  5:  { kind: 'manual', prompt: 'Elige quién repite su tirada.' },
  6:  { kind: 'auto', dungeon: 3,
        compute: (s) => (s.rivalTotal > s.myTotal ? s.rivalTotal + 1 - s.myTotal : 0) },
  7:  { kind: 'manual', dungeon: 1, prompt: 'Anula la próxima carta del rival.' },
  8:  { kind: 'auto', compute: (s) => count(s.myDice, odd) * 2 },
  9:  { kind: 'auto', compute: (s) => (new Set(s.myDice).size < s.myDice.length ? 6 : 0) },
  10: { kind: 'auto', compute: (s) => (s.myDice.includes(6) ? 6 : 0) },
  11: { kind: 'manual', prompt: 'Intercambia uno de tus dados por otro en juego.' },
  12: { kind: 'auto', compute: (s) => {
          if (s.myDice.length < 2) return 0;
          const [lo, hi] = [Math.min(...s.myDice), Math.max(...s.myDice)];
          return hi - lo; // set the low die to the high one
        } },
  13: { kind: 'manual', prompt: 'Repite hasta 2 de tus dados.' },
  14: { kind: 'auto', compute: (s) => {
          if (!s.myDice.length) return 0;
          const lo = Math.min(...s.myDice);
          return Math.min(6, lo + 3) - lo;
        } },
  15: { kind: 'manual', prompt: 'Roba un equipamiento al azar y úsalo.' },
  16: { kind: 'auto', dungeon: 3, compute: (s) => (s.rivalMana > s.myMana ? 3 : 0) },
  17: { kind: 'manual', prompt: 'Copia el efecto de otro equipamiento en juego.' },
  18: { kind: 'auto', dungeon: 1, compute: (s) => s.allDice.length - s.myDice.length },
  19: { kind: 'auto', dungeon: 3, compute: (s) => count(s.allDice, odd) },
  20: { kind: 'flat', bonus: 5 },
  21: { kind: 'manual', prompt: 'Repite todos los dados en juego.' },
  22: { kind: 'flat', bonus: 2 },
  23: { kind: 'manual', prompt: 'Elige un dado tuyo y uno de otro: ambos pasan a 3.' },
  24: { kind: 'manual', prompt: 'Repite 1 dado hasta 2 veces.' },
  25: { kind: 'flat', bonus: 2 },
  26: { kind: 'auto', compute: (s) => s.usedBefore },
  27: { kind: 'manual', dungeon: 3, prompt: 'Toma un equipamiento de la mano del rival.' },
  28: { kind: 'auto', dungeon: 1, compute: (s) => s.rivalUsed },
  29: { kind: 'manual', dungeon: 1, prompt: 'Anula 1 equipamiento del rival.' },
  30: { kind: 'flat', bonus: 1 },
  31: { kind: 'flat', bonus: -2, cursed: true },  // Plaga: passes to the rival after combat
  32: { kind: 'manual', dungeon: 3, prompt: 'Anula todos los equipamientos en juego.' },
  33: { kind: 'flat', bonus: 1 },
  34: { kind: 'auto', compute: (s) => s.usedBefore },
  35: { kind: 'auto', compute: (s) => (s.diceSwapped ? 3 : 0) },
  36: { kind: 'deferred', dungeon: 3,
        prompt: '+1 por cada equipamiento que el rival juegue después.' },
  37: { kind: 'auto', compute: (s) => (s.myDice.every((d) => !odd(d)) ? 3 : 0) },
  38: { kind: 'auto',
        dungeonCompute: (s) => Math.floor((s.monsterBaseHp ?? 0) / 10),
        compute: (s) => (s.rivalDice.includes(6) ? 3 : 0) },
  39: { kind: 'auto', compute: (s) => (new Set(s.myDice).size === 1 ? 4 : 0) },
  40: { kind: 'manual', dungeon: 2, prompt: 'Mira la mano del rival y bloquea 1 carta.' },
  41: { kind: 'manual', dungeon: 1, prompt: 'Bloquea al azar 1 carta del rival.' },
  42: { kind: 'auto', bonus: 4, locksFurtherCards: true, compute: () => 4 },
};

/**
 * Bonus this card grants right now.
 * Returns { bonus, manual, prompt, rollsExtraDie, locksFurtherCards }.
 */
export function evaluate(equipmentId, snapshot, { isDungeon = false } = {}) {
  const fx = EQUIPMENT_FX[equipmentId];
  if (!fx) return { bonus: 0, manual: false };

  // A "Mazmorra:" clause replaces the normal effect entirely.
  if (isDungeon) {
    if (typeof fx.dungeonCompute === 'function') {
      return { bonus: fx.dungeonCompute(snapshot), manual: false };
    }
    if (typeof fx.dungeon === 'number') {
      return { bonus: fx.dungeon, manual: false };
    }
    // No dungeon clause: manual cards are PvP-only and do nothing here.
    if (fx.kind === 'manual' || fx.kind === 'deferred') {
      return { bonus: 0, manual: false, inert: true };
    }
  }

  switch (fx.kind) {
    case 'flat':
      return { bonus: fx.bonus, manual: false, cursed: fx.cursed };
    case 'auto':
      return {
        bonus: fx.compute(snapshot),
        manual: false,
        rollsExtraDie: fx.rollsExtraDie,
        locksFurtherCards: fx.locksFurtherCards,
      };
    case 'manual':
    case 'deferred':
      return { bonus: 0, manual: true, prompt: fx.prompt };
    default:
      return { bonus: 0, manual: false };
  }
}

export const isCursed = (id) => Boolean(EQUIPMENT_FX[id]?.cursed);
