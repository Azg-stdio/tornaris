// Tournament screen: seeding roll, gold conversion, bracket, and the final duel.

import { CHARACTERS } from '/js/shared/data.js';
import { GOLD_CONVERSIONS } from '/js/shared/rules.js';
import { renderDuel } from '/js/combat-ui.js';

const charOf = (p) => CHARACTERS.find((c) => c.id === p.characterId) ?? null;

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function renderTournament(root, { state, me, send }) {
  root.replaceChildren();
  const t = state.tournament;
  const isHost = state.hostId === me.id;

  root.append(h('h2', 'trn__title', 'Torneo Final'));

  // --- before the seeding roll
  if (!t) {
    root.append(h('p', 'trn__lead',
      'Se agotaron los monstruos. Lanzad un dado para definir el orden del torneo.'));
    if (isHost) {
      const b = h('button', 'btn btn--primary', 'Lanzar dados');
      b.addEventListener('click', () => send({ type: 'rollTournamentOrder' }));
      root.append(b);
    } else {
      root.append(h('p', 'trn__wait', 'Esperando al anfitrión…'));
    }
    return;
  }

  // --- seeding results, always visible once rolled
  const seeds = h('ol', 'seeds');
  t.seeds.forEach((pid, i) => {
    const p = state.players.find((x) => x.id === pid);
    const c = charOf(p);
    const li = h('li', 'seed');
    li.style.setProperty('--accent', c?.color ?? '#888');
    li.classList.toggle('is-first', i === 0);

    const img = h('img', 'seed__token');
    img.src = `/assets/tokens/${c?.slug}.webp`;
    img.alt = '';
    li.append(img);
    li.append(h('span', 'seed__name', p.name));

    const roll = t.rolls.find((r) => r.playerId === pid);
    li.append(h('span', 'seed__roll', `dado ${roll?.roll ?? '—'}`));
    if (i === 0) li.append(h('em', 'seed__badge', 'ventaja de bracket'));
    seeds.append(li);
  });
  root.append(seeds);

  // --- gold conversion
  if (t.step === 'conversion') {
    root.append(h('p', 'trn__lead', 'Convierte tu oro sobrante antes de empezar.'));

    const opts = h('div', 'convert');
    for (const o of GOLD_CONVERSIONS) {
      const b = h('button', 'convert__opt');
      b.disabled = me.gold < o.gold;
      b.append(h('strong', null, `${o.gold} oro`));
      b.append(h('span', null, o.label));
      b.addEventListener('click', () => send({ type: 'convertGold', effect: o.effect }));
      opts.append(b);
    }
    root.append(opts);
    root.append(h('p', 'trn__wait', `Tienes ${me.gold} de oro.`));

    if (isHost) {
      const go = h('button', 'btn btn--primary', 'Empezar el torneo');
      go.addEventListener('click', () => send({ type: 'finishConversion' }));
      root.append(go);
    }
    return;
  }

  // --- bracket
  root.append(renderBracket(state, t));

  if (t.step === 'done') {
    const champ = state.players.find((p) => p.id === t.championId);
    root.append(h('p', 'trn__champion', `¡${champ?.name} es Campeón de Tornaris!`));
    return;
  }

  if (t.duel) {
    const box = h('div', 'trn__duel');
    renderDuel(box, { duel: t.duel, me, send, prefix: 'tournament' });
    root.append(box);
    return;
  }

  if (t.currentMatch) {
    const match = findMatch(t, t.currentMatch);
    const a = state.players.find((p) => p.id === match.aId);
    const b = state.players.find((p) => p.id === match.bId);
    root.append(h('p', 'trn__lead', `Siguiente: ${a?.name} vs ${b?.name}`));

    // Either fighter can start their own match; no need to wait for the host.
    if (me.id === match.aId || me.id === match.bId || isHost) {
      const go = h('button', 'btn btn--primary', 'Comenzar combate');
      go.addEventListener('click', () => send({ type: 'startMatch' }));
      root.append(go);
    } else {
      root.append(h('p', 'trn__wait', 'Esperando a los combatientes…'));
    }
  }
}

function renderBracket(state, t) {
  const wrap = h('div', 'bracket');
  const nameOf = (pid) => state.players.find((p) => p.id === pid)?.name ?? '—';

  for (const round of t.rounds) {
    const col = h('div', 'bracket__round');
    col.append(h('span', 'bracket__label', round.name));

    for (const m of round.matches) {
      const box = h('div', 'match');
      box.classList.toggle('is-current', t.currentMatch === m.id);
      box.classList.toggle('is-done', Boolean(m.winnerId));

      for (const pid of [m.aId, m.bId]) {
        const row = h('span', 'match__slot', pid ? nameOf(pid) : '—');
        row.classList.toggle('is-winner', Boolean(m.winnerId) && pid === m.winnerId);
        row.classList.toggle('is-loser', Boolean(m.winnerId) && pid !== m.winnerId);
        box.append(row);
      }
      col.append(box);
    }
    wrap.append(col);
  }
  return wrap;
}

function findMatch(t, id) {
  for (const round of t.rounds) {
    const m = round.matches.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}
