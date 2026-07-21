// Day/night card effects, expressed as flags the engine reads.
//
// Card text is prose meant for humans; this table is the machine-readable half.
// Keys are card ids from data.js (DAY_CARDS / NIGHT_CARDS). Anything absent has
// no mechanical effect beyond flavour.

export const DAY_EFFECTS = {
  1:  {},                              // Día Normal
  2:  { shopCardsPerPlayer: 2 },       // Feria del Gremio
  3:  { noDuels: true },               // Día de Tregua
  4:  { legendaryMonster: true },      // Monstruo Legendario
  5:  { chooseFreeObject: true },      // Día de Suerte
  6:  { closeTile: 'mazmorra', discardMonster: true }, // Mazmorra Cerrada
  7:  { eventCards: 2 },               // Doble Evento
  8:  { shopPriceMultiplier: 0.5 },    // Mercado Negro
  9:  { doubleMonsterReward: true },   // Día de Caza
  10: { noTowerIncome: true },         // Torre en Disputa
  11: { reverseTurnOrder: true },      // Día Caótico
  12: { openChoices: true },           // Día Transparente
  13: { restoreManaAtStart: true },    // Recuperación General
};

export const NIGHT_EFFECTS = {
  1:  {},                              // Noche Normal
  2:  { workGoldMultiplier: 2 },       // Ingresos Extra
  3:  { ringFights: 2 },               // Competencia en el Ring
  4:  { restoreManaAtStart: true },    // Descanso Obligatorio
  5:  { replaceTile: { from: 'trabajo', to: 'tienda' } }, // Mercado Nocturno
  6:  { closeTile: 'ring', noDuels: true },               // Noche Tranquila
  7:  { reverseTurnOrder: true },      // Noche de Caos
  8:  { goldForAll: 5 },               // Bonanza
  9:  { sellAtFullPrice: true },       // Remate Nocturno
  10: { restoreManaAtStart: true },    // Noche Mágica
  11: { revealNextMonster: true },     // El Oráculo
};

export function effectsFor(phase, cardId) {
  const table = phase === 'day' ? DAY_EFFECTS : NIGHT_EFFECTS;
  return table[cardId] ?? {};
}
