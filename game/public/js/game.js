// Game screen. Renders whatever state the server sent; every interaction is a
// message, never a local mutation.

import { CHARACTERS, MONSTERS, EQUIPMENT } from '/js/shared/data.js';
import { ARCS, TILE_LABELS, DAY_TILES, NIGHT_TILES, arcOfTile } from '/js/shared/rules.js';
import { renderHotspots, renderRoulette, tileAngle } from '/js/board.js';
import { renderDungeon, renderDuel } from '/js/combat-ui.js';

const el = {};

// Which finished combat the player has already acknowledged, so its result
// screen doesn't reappear on every subsequent state broadcast.
let dismissed = null;

export function bindGame() {
  el.turn = document.querySelector('#hud-turn');
  el.phase = document.querySelector('#hud-phase');
  el.cardName = document.querySelector('#card-name');
  el.cardText = document.querySelector('#card-text');
  el.board = document.querySelector('#board');
  el.hotspots = document.querySelector('#hotspots');
  el.tokens = document.querySelector('#tokens');
  el.center = document.querySelector('#center');
  el.actionbar = document.querySelector('#actionbar');
  el.rail = document.querySelector('#rail');
  el.log = document.querySelector('#log');
}

const charOf = (p) => CHARACTERS.find((c) => c.id === p.characterId) ?? null;

/** Tiles legal this turn, mirroring engine.availableTiles for display. */
function tilesFor(turn) {
  let tiles = turn.phase === 'day' ? [...DAY_TILES] : [...NIGHT_TILES];
  const { replaceTile, closeTile } = turn.effects ?? {};
  if (replaceTile) tiles = tiles.map((t) => (t === replaceTile.from ? replaceTile.to : t));

  const open = [];
  const blocked = [];
  for (const tile of tiles) {
    const byCard = closeTile === tile;
    const byArc = arcOfTile(tile, turn.phase)?.id === turn.blockedArc;
    (byCard || byArc ? blocked : open).push(tile);
  }
  return { open, blocked };
}

export function renderGame(state, me, send) {
  const turn = state.turn;
  if (!turn) return;

  // Combat takes over the screen: the board is irrelevant while dice are out.
  // A finished combat stays up until dismissed — otherwise the result flashes
  // past before anyone reads whether they won.
  const combatKey = turn.combat ? `${turn.number}:${turn.combat.monsterId}` : null;
  const combat = turn.combat && dismissed !== combatKey ? turn.combat : null;
  const duel = turn.duel;
  document.body.classList.toggle('is-combat', Boolean(combat || duel));

  const isDay = turn.phase === 'day';
  document.body.dataset.phase = turn.phase;

  el.turn.textContent = `Turno ${turn.number}`;
  el.phase.textContent = isDay ? '☀ Día' : '☾ Noche';
  el.cardName.textContent = turn.cardName;
  el.cardText.textContent = turn.cardText;

  const { open, blocked } = tilesFor(turn);
  const revealed = turn.step === 'revealed' || turn.step === 'resolved';

  // Who ended up where — only meaningful once choices are public.
  const votes = {};
  if (revealed || turn.effects?.openChoices) {
    for (const [pid, tile] of Object.entries(turn.choices)) {
      const p = state.players.find((x) => x.id === pid);
      if (!p) continue;
      (votes[tile] ??= []).push({ name: p.name, color: charOf(p)?.color ?? '#888' });
    }
  }

  const canChoose = turn.step === 'choosing' && !turn.locked.includes(me.id);

  renderHotspots(el.hotspots, {
    phase: turn.phase,
    tiles: open,
    blockedTiles: blocked,
    myChoice: turn.choices[me.id],
    votes,
    onPick: canChoose ? (tile) => send({ type: 'chooseTile', tile }) : null,
  });

  renderRoulette(el.board, {
    blockedArc: turn.blockedArc,
    phase: turn.phase,
    spinning: turn.step === 'spin',
  });

  renderCenter(state, turn);

  if (combat) {
    renderDungeon(el.actionbar, {
      combat, me, send,
      onDismiss: () => { dismissed = combatKey; renderGame(state, me, send); },
    });
  } else if (duel) {
    renderDuel(el.actionbar, { duel, me, send, prefix: 'duel' });
  } else {
    renderActionbar(state, turn, me, send);
  }

  renderRail(state, me);
  renderLog(state);
}

// --- centre of the board (coliseum) ---------------------------------------

function renderCenter(state, turn) {
  el.center.replaceChildren();

  if (turn.phase === 'day' && turn.monsterId && !turn.monsterDefeated) {
    const m = MONSTERS.find((x) => x.id === turn.monsterId);
    const wrap = document.createElement('div');
    wrap.className = 'monster';

    const img = document.createElement('img');
    img.className = 'monster__img';
    img.src = m.image;
    img.alt = m.name;

    const name = document.createElement('strong');
    name.className = 'monster__name';
    name.textContent = m.name;

    const hp = document.createElement('span');
    hp.className = 'monster__hp';
    hp.textContent = turn.monsterHp == null ? 'Especial' : `${turn.monsterHp} PV`;

    const tier = document.createElement('span');
    tier.className = `monster__tier tier--${m.tier}`;
    tier.textContent = m.tier;

    wrap.append(img, name, hp, tier);
    el.center.append(wrap);
    return;
  }

  if (turn.phase === 'day' && turn.monsterDefeated) {
    const p = document.createElement('p');
    p.className = 'center__note';
    p.textContent = 'Mazmorra cerrada';
    el.center.append(p);
    return;
  }

  const p = document.createElement('p');
  p.className = 'center__note';
  p.textContent = 'Coliseo';
  el.center.append(p);
}

// --- action bar ------------------------------------------------------------

function renderActionbar(state, turn, me, send) {
  el.actionbar.replaceChildren();

  const add = (node) => el.actionbar.append(node);
  const text = (t, cls = 'actionbar__msg') => {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = t;
    return p;
  };
  const button = (label, onClick, primary = true) => {
    const b = document.createElement('button');
    b.className = primary ? 'btn btn--primary' : 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  const holder = state.players.find((p) => p.id === state.tokenHolderId);

  if (turn.step === 'spin') {
    if (state.tokenHolderId === me.id) {
      add(text('Tienes el token. Gira la ruleta para bloquear un arco.'));
      add(button('Girar ruleta', () => send({ type: 'spinRoulette' })));
    } else {
      add(text(`${holder?.name ?? '—'} está girando la ruleta…`));
    }
    return;
  }

  if (turn.step === 'choosing') {
    const mine = turn.choices[me.id];
    const waiting = state.players.filter(
      (p) => p.connected && !turn.locked.includes(p.id),
    ).length;

    if (mine) {
      add(text(`Elegiste ${TILE_LABELS[mine]}. Faltan ${waiting}.`));
      add(button('Cambiar', () => send({ type: 'unchooseTile' }), false));
    } else {
      add(text('Elige tu casilla en secreto.'));
    }
    return;
  }

  // resolved
  const mine = turn.choices[me.id];
  const lines = turn.resolution.filter((r) => !r.playerId || r.playerId === me.id);
  for (const r of lines) add(text(`${TILE_LABELS[r.tile]}: ${r.text}`, 'actionbar__line'));

  if (mine === 'tienda' && turn.shop.length) {
    add(renderShop(state, turn, me, send));
  }

  // Staged combats must be resolved before the turn can advance.
  if (turn.combatants.length) {
    add(text(`Mazmorra: ${turn.combatants.length} combatiente(s) esperando.`, 'actionbar__msg is-warn'));
    add(button('Entrar a la mazmorra', () => send({ type: 'beginDungeon' })));
    return;
  }
  if (turn.ringFighters.length === 2) {
    add(text('Duelo en el Ring pendiente.', 'actionbar__msg is-warn'));
    const [a, b] = turn.ringFighters;
    add(button('Iniciar duelo', () => send({ type: 'beginDuel', aId: a, bId: b, context: 'ring' })));
    return;
  }
  if (turn.towerChallengers.length === 2) {
    add(text('Duelo por la Torre pendiente.', 'actionbar__msg is-warn'));
    const [a, b] = turn.towerChallengers;
    add(button('Iniciar duelo', () => send({ type: 'beginDuel', aId: a, bId: b, context: 'torre' })));
    return;
  }

  add(button('Siguiente turno', () => send({ type: 'nextTurn' })));
}

function renderShop(state, turn, me, send) {
  const wrap = document.createElement('div');
  wrap.className = 'shop';

  const mult = turn.effects?.shopPriceMultiplier ?? 1;
  const discount = charOf(me)?.id === 'remi' ? 2 : 0;

  for (const id of turn.shop) {
    const item = EQUIPMENT.find((e) => e.id === id);
    const price = Math.max(0, Math.ceil(item.price * mult) - discount);
    const affordable = me.gold >= price && me.equipment.length < me.equipmentSlots;

    const card = document.createElement('button');
    card.className = 'shopitem';
    card.disabled = !affordable;
    card.innerHTML =
      `<strong>${item.name}</strong>` +
      `<span class="shopitem__text">${item.text}</span>` +
      `<span class="shopitem__cost">${price}g · ${item.mana} maná</span>`;
    card.addEventListener('click', () => send({ type: 'buyEquipment', equipmentId: id }));
    wrap.append(card);
  }
  return wrap;
}

// --- player rail -----------------------------------------------------------

function renderRail(state, me) {
  renderRailInto(el.rail, state, me);
}

/** Exported so the tournament screen can reuse the same player rail. */
export function renderRailInto(root, state, me) {
  root.replaceChildren(
    ...state.players.map((p) => {
      const c = charOf(p);
      const li = document.createElement('li');
      li.className = 'railcard';
      li.classList.toggle('is-me', p.id === me.id);
      li.classList.toggle('is-offline', !p.connected);
      li.style.setProperty('--accent', c?.color ?? '#888');

      const head = document.createElement('div');
      head.className = 'railcard__head';

      const img = document.createElement('img');
      img.src = `/assets/tokens/${c?.slug}.webp`;
      img.alt = '';

      const name = document.createElement('span');
      name.className = 'railcard__name';
      name.textContent = p.name;
      if (p.id === state.tokenHolderId) {
        const t = document.createElement('span');
        t.className = 'railcard__token';
        t.title = 'Tiene el token de turno';
        t.textContent = '◆';
        name.append(t);
      }

      head.append(img, name);

      const stats = document.createElement('div');
      stats.className = 'railcard__stats';
      stats.append(
        stat('oro', p.gold),
        stat('maná', `${p.mana}/${p.maxMana}`),
        stat('equipo', `${p.equipment?.length ?? p.equipmentCount ?? 0}/${p.equipmentSlots}`),
      );

      li.append(head, stats);
      return li;
    }),
  );
}

function stat(label, value) {
  const s = document.createElement('span');
  s.className = 'stat';
  s.innerHTML = `<i>${label}</i>${value}`;
  return s;
}

// --- log -------------------------------------------------------------------

function renderLog(state) {
  const entries = (state.log ?? []).slice(-40).reverse();
  el.log.replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement('li');
      li.textContent = e.text;
      return li;
    }),
  );
}
