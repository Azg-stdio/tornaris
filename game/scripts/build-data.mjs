// Generates src/shared/data.js from the CSVs in ../docs.
// The CSVs stay the design source of truth; re-run `npm run data` after editing them.
//
// Rule corrections agreed during the playtest review are applied here rather
// than edited into the CSVs, so the CSVs keep matching the printed cards.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = join(here, '..', '..', 'docs');
// Lives under public/ so the browser can import it directly; the Worker imports
// the same file by relative path, so there is only ever one copy.
const OUT = join(here, '..', 'public', 'js', 'shared', 'data.js');

function parseCsv(text) {
  // Strip BOM; the sheets were exported from Google Sheets.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const read = (name) => parseCsv(readFileSync(join(DOCS, name), 'utf8'));

// --- characters ------------------------------------------------------------

// Identity colour, asset slug and mechanical fields the CSV doesn't carry.
const CHAR_META = {
  Celeste:  { id: 'celeste',  slug: 'druida',      color: '#c55619', maxMana: 5 },
  Skull:    { id: 'skull',    slug: 'nigromante',  color: '#101010', maxMana: 4, nightManaRegen: 2 },
  Remi:     { id: 'remi',     slug: 'hombre-topo', color: '#a8bf2a', maxMana: 4 },
  Baltazar: { id: 'baltazar', slug: 'mago',        color: '#1b6b89', maxMana: 4 },
  Braulia:  { id: 'braulia',  slug: 'escudera',    color: '#464646', maxMana: 4, equipmentSlots: 8 },
  Nyra:     { id: 'nyra',     slug: 'cazadora',    color: '#1f5423', maxMana: 4 },
};

const characters = read('Juego de Mesa 2025 - Personajes 2025.csv').map((r) => {
  const meta = CHAR_META[r.Personaje];
  if (!meta) throw new Error(`character without metadata: ${r.Personaje}`);
  const [qty, ...itemWords] = r['Objetos Iniciales'].split(' ');
  return {
    id: meta.id,
    name: r.Personaje,
    className: r.Clase,
    passive: r.Pasiva,
    startItem: itemWords.join(' '),
    startItemQty: Number(qty.replace('x', '')),
    maxMana: meta.maxMana,
    equipmentSlots: meta.equipmentSlots ?? 6,
    nightManaRegen: meta.nightManaRegen ?? 0,
    color: meta.color,
    slug: meta.slug,
  };
});

// --- monsters --------------------------------------------------------------

const TIERS = { Duende: 'duende', Ogro: 'ogro', 'Gólem': 'golem', 'Dragón': 'dragon' };

// Playtest fix: nobody plays for the monster any more, it just rolls itself.
const SOMBRA_ACECHANTE =
  'El monstruo lanza automáticamente 2 dados por cada combatiente y ese total ' +
  'se suma a su vida. Ningún jugador lo controla; recompensa y penitencia normales.';

function parseHp(raw) {
  if (raw === '-') return { kind: 'special' };
  if (raw.endsWith('x')) return { kind: 'perPlayer', value: Number(raw.slice(0, -1)) };
  return { kind: 'fixed', value: Number(raw) };
}

const monsters = read('Juego de Mesa 2025 - Enemigos (Final).csv').map((r) => {
  const id = Number(r.ID);
  return {
    id,
    name: r.Monstruo,
    tier: TIERS[r['Categoría']],
    hp: parseHp(r.Vida),
    minPlayers: Number(r['Jugadores mínimos']),
    reward: r['Recompensa (combatientes)'],
    ability: id === 7 ? SOMBRA_ACECHANTE : r.Habilidad,
    // "pierde rese resultado" -> typo in the sheet
    penalty: r['Penitencia (combatientes)'].replace('rese resultado', 'ese resultado'),
    image: `/assets/monsters/monster_${id}.webp`,
  };
});

// --- equipment, objects ----------------------------------------------------

const equipment = read('Juego de Mesa 2025 - Equipamientos(1).csv').map((r) => ({
  id: Number(r.ID),
  name: r.Equipamiento,
  text: r.Texto,
  copies: Number(r.Repeticiones),
  price: Number(r.Precio),
  mana: Number(r['Maná']),
}));

const objects = read('Juego de Mesa 2025 - Objetos.csv').map((r) => ({
  id: Number(r.ID),
  name: r.Objeto,
  text: r.Efecto,
}));

// --- day/night cards -------------------------------------------------------

const readPhaseCards = (file) =>
  read(file).map((r) => ({
    id: Number(r.ID),
    name: r.Nombre,
    text: r.Efecto,
    copies: Number(r.Repeticiones),
  }));

const dayCards = readPhaseCards('Juego de Mesa 2025 - Día.csv');
const nightCards = readPhaseCards('Juego de Mesa 2025 - Noche.csv');

// --- events ----------------------------------------------------------------

// Target composition: 30 day / 24 night. Every design appears once; three day
// designs are doubled to reach 30 without inventing or deleting cards.
const DOUBLED_DAY_EVENTS = new Set([19, 20, 23]);

function readEvents(file, doubled) {
  return read(file).map((r) => {
    const id = Number(r.ID);
    return {
      id,
      // Sheet duplicates the name "Portal de Bolsillo"; #27 hands out a Cuervo.
      name: file.includes('Día') && id === 27 ? 'Cuervo Mensajero' : r.Nombre,
      text: r.Texto,
      copies: doubled?.has(id) ? 2 : 1,
    };
  });
}

const dayEvents = readEvents('Juego de Mesa 2025 - Eventos (Día).csv', DOUBLED_DAY_EVENTS);
const nightEvents = readEvents('Juego de Mesa 2025 - Eventos (Noche).csv', null);

// --- emit ------------------------------------------------------------------

const total = (list) => list.reduce((n, c) => n + c.copies, 0);

const banner = `// GENERATED by scripts/build-data.mjs -- do not edit by hand.
// Source: docs/*.csv. Run \`npm run data\` to regenerate.
`;

const body = [
  banner,
  `export const MIN_PLAYERS = 3;`,
  `export const MAX_PLAYERS = 6;`,
  ``,
  `export const CHARACTERS = ${JSON.stringify(characters, null, 2)};`,
  ``,
  `export const MONSTERS = ${JSON.stringify(monsters, null, 2)};`,
  ``,
  `export const EQUIPMENT = ${JSON.stringify(equipment, null, 2)};`,
  ``,
  `export const OBJECTS = ${JSON.stringify(objects, null, 2)};`,
  ``,
  `export const DAY_CARDS = ${JSON.stringify(dayCards, null, 2)};`,
  ``,
  `export const NIGHT_CARDS = ${JSON.stringify(nightCards, null, 2)};`,
  ``,
  `export const DAY_EVENTS = ${JSON.stringify(dayEvents, null, 2)};`,
  ``,
  `export const NIGHT_EVENTS = ${JSON.stringify(nightEvents, null, 2)};`,
  ``,
].join('\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body, 'utf8');

console.log(`wrote ${OUT}`);
console.log(`  characters   ${characters.length}`);
console.log(`  monsters     ${monsters.length}`);
console.log(`  equipment    ${equipment.length} designs / ${total(equipment)} cards`);
console.log(`  objects      ${objects.length}`);
console.log(`  day cards    ${dayCards.length} designs / ${total(dayCards)} cards`);
console.log(`  night cards  ${nightCards.length} designs / ${total(nightCards)} cards`);
console.log(`  day events   ${dayEvents.length} designs / ${total(dayEvents)} cards`);
console.log(`  night events ${nightEvents.length} designs / ${total(nightEvents)} cards`);
