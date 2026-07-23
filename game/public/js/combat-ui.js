// Combat overlay: dungeon runs and duels, staged in the coliseum.

import { EQUIPMENT, MONSTERS } from '/js/shared/data.js';
import { EQUIPMENT_FX } from '/js/shared/equipment-fx.js';

const equipmentById = (id) => EQUIPMENT.find((e) => e.id === id);

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function dieFace(value) {
  const d = h('span', 'die', String(value));
  return d;
}

/**
 * Card buttons for whatever the player can still play.
 * Manual cards prompt for the resulting bonus, matching what happens at a table.
 */
function handRow(me, used, isDungeon, onUse) {
  const row = h('div', 'hand');

  const playable = (me.equipment ?? []).filter((id) => !used.includes(id));
  if (!playable.length) {
    row.append(h('p', 'hand__empty', 'Sin equipamiento disponible.'));
    return row;
  }

  for (const id of playable) {
    const item = equipmentById(id);
    const fx = EQUIPMENT_FX[id] ?? {};
    const affordable = me.mana >= item.mana;
    const inert = isDungeon && (fx.kind === 'manual' || fx.kind === 'deferred') && fx.dungeon == null;

    const btn = h('button', 'card');
    btn.disabled = !affordable || inert;
    btn.append(h('strong', 'card__name', item.name));
    btn.append(h('span', 'card__text', item.text));

    const cost = h('span', 'card__cost');
    cost.append(h('i', null, `${item.mana} maná`));
    if (inert) cost.append(h('em', 'card__tag', 'no aplica'));
    else if (fx.kind === 'manual' || fx.kind === 'deferred') cost.append(h('em', 'card__tag', 'manual'));
    btn.append(cost);

    btn.addEventListener('click', () => {
      if (fx.kind === 'manual' || fx.kind === 'deferred') {
        // The player resolves the card at the table and tells us the number.
        const raw = window.prompt(`${item.name}\n${fx.prompt ?? item.text}\n\n¿Cuánto ataque suma?`, '0');
        if (raw === null) return;
        onUse(id, Number(raw) || 0);
      } else {
        onUse(id);
      }
    });
    row.append(btn);
  }
  return row;
}

// --- dungeon ---------------------------------------------------------------

export function renderDungeon(root, { combat, me, send, onDismiss }) {
  root.replaceChildren();
  const monster = MONSTERS.find((m) => m.id === combat.monsterId);

  const head = h('div', 'combat__head');
  const img = h('img', 'combat__monster');
  img.src = monster.image;
  img.alt = monster.name;
  head.append(img);

  const info = h('div', 'combat__info');
  info.append(h('strong', 'combat__title', monster.name));
  info.append(h('p', 'combat__ability', monster.ability));
  head.append(info);
  root.append(head);

  const total = combat.fighters.reduce((n, f) => n + f.total + f.bonus, 0);
  const score = h('div', 'combat__score');
  score.append(h('span', 'combat__total', String(total)));
  score.append(h('span', 'combat__vs', combat.hp == null ? 'especial' : `de ${combat.hp}`));
  root.append(score);

  if (combat.hp != null) {
    const bar = h('div', 'hpbar');
    const fill = h('span', 'hpbar__fill');
    fill.style.width = `${Math.min(100, (total / combat.hp) * 100)}%`;
    fill.classList.toggle('is-enough', total > combat.hp);
    bar.append(fill);
    root.append(bar);
  }

  const list = h('ul', 'fighters');
  for (const f of combat.fighters) {
    const li = h('li', 'fighter');
    li.classList.toggle('is-me', f.playerId === me.id);
    li.classList.toggle('is-done', f.done);
    li.append(h('span', 'fighter__name', f.name));
    const dice = h('span', 'fighter__dice');
    for (const d of f.dice) dice.append(dieFace(d));
    li.append(dice);
    li.append(h('span', 'fighter__sum', `${f.total + f.bonus}`));
    list.append(li);
  }
  root.append(list);

  for (const line of combat.log) root.append(h('p', 'combat__log', line));

  const mine = combat.fighters.find((f) => f.playerId === me.id);

  if (combat.step === 'awaiting-outcome') {
    root.append(h('p', 'combat__prompt', combat.manualOutcome));
    const row = h('div', 'combat__actions');
    const win = h('button', 'btn btn--primary', 'Victoria');
    win.addEventListener('click', () => send({ type: 'dungeonDeclare', outcome: 'victory' }));
    const lose = h('button', 'btn', 'Derrota');
    lose.addEventListener('click', () => send({ type: 'dungeonDeclare', outcome: 'defeat' }));
    row.append(win, lose);
    root.append(row);
    return;
  }

  if (combat.step === 'done') {
    root.append(h('p', `combat__result is-${combat.outcome}`,
      combat.outcome === 'victory' ? '¡Victoria!' : 'Derrota'));
    if (combat.manualNote) root.append(h('p', 'combat__prompt', combat.manualNote));
    if (onDismiss) {
      const ok = h('button', 'btn btn--primary', 'Continuar');
      ok.addEventListener('click', onDismiss);
      root.append(ok);
    }
    return;
  }

  if (!mine) {
    root.append(h('p', 'combat__prompt', 'No participas en este combate.'));
    return;
  }

  if (mine.done) {
    root.append(h('p', 'combat__prompt', 'Esperando a los demás combatientes…'));
    return;
  }

  if (!combat.noEquipment) {
    root.append(handRow(me, mine.used, true,
      (id, bonus) => send({ type: 'dungeonUse', equipmentId: id, manualBonus: bonus })));
  }

  const done = h('button', 'btn btn--primary', 'Listo');
  done.addEventListener('click', () => send({ type: 'dungeonPass' }));
  root.append(done);
}

// --- duel ------------------------------------------------------------------

export function renderDuel(root, { duel, me, send, prefix = 'duel' }) {
  root.replaceChildren();
  root.append(h('strong', 'combat__title',
    duel.context === 'torneo' ? 'Torneo' : duel.context === 'torre' ? 'Duelo por la Torre' : 'Ring'));

  const board = h('div', 'duel');
  for (const side of duel.sides) {
    const col = h('div', 'duel__side');
    col.classList.toggle('is-me', side.playerId === me.id);
    col.classList.toggle('is-turn', duel.turnId === side.playerId && duel.step === 'active');
    col.append(h('span', 'duel__name', side.name));

    const dice = h('span', 'fighter__dice');
    for (const d of side.dice) dice.append(dieFace(d));
    col.append(dice);

    col.append(h('span', 'duel__score', String(side.total + side.bonus)));
    if (side.playerId === duel.advantageId) col.append(h('em', 'duel__adv', 'ventaja'));
    board.append(col);
  }
  root.append(board);

  for (const line of duel.log) root.append(h('p', 'combat__log', line));

  if (duel.step === 'done') {
    const winner = duel.sides.find((s) => s.playerId === duel.winnerId);
    root.append(h('p', 'combat__result is-victory', `Gana ${winner.name}`));
    return;
  }

  if (duel.turnId !== me.id) {
    const waiting = duel.sides.find((s) => s.playerId === duel.turnId);
    root.append(h('p', 'combat__prompt', `Turno de ${waiting?.name ?? '—'}…`));
    return;
  }

  const mine = duel.sides.find((s) => s.playerId === me.id);
  root.append(h('p', 'combat__prompt', 'Vas perdiendo. Juega equipamiento o pasa.'));
  root.append(handRow(me, mine.used, false,
    (id, bonus) => send({ type: `${prefix}Use`, equipmentId: id, manualBonus: bonus })));

  const pass = h('button', 'btn btn--primary', 'No responder');
  pass.addEventListener('click', () => send({ type: `${prefix}Pass` }));
  root.append(pass);
}
