/* app.js — Tornaris Companion App */
(function () {
  'use strict';

  // ─── Helpers ──────────────────────────────────────────────

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function saveState() {
    try { localStorage.setItem('tornaris_state', JSON.stringify(state)); }
    catch (e) { console.warn('localStorage unavailable', e); }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('tornaris_state');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function getChar(id) { return CHARACTERS.find(c => c.id === id) || null; }
  function getMonster(id) { return MONSTERS.find(m => m.id === id) || null; }

  function computeHP(monster, playerCount, isLegendary) {
    if (monster.hp === null) return null;
    let base;
    if (typeof monster.hp === 'string' && monster.hp.endsWith('x')) {
      base = parseInt(monster.hp) * playerCount;
    } else {
      base = Number(monster.hp);
    }
    return isLegendary ? base * 2 : base;
  }

  function computeHPDisplay(monster, playerCount, isLegendary) {
    const hp = computeHP(monster, playerCount, isLegendary);
    return hp === null ? 'Especial' : hp;
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Hold-to-repeat ───────────────────────────────────────

  function attachHoldButton(el, cb) {
    let timer = null, interval = null;
    function start() {
      cb();
      timer = setTimeout(() => { interval = setInterval(cb, 80); }, 400);
    }
    function stop() {
      clearTimeout(timer); clearInterval(interval);
      timer = null; interval = null;
    }
    el.addEventListener('pointerdown', e => { e.preventDefault(); start(); });
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointerleave', stop);
    el.addEventListener('pointercancel', stop);
  }

  // ─── Deck builders ────────────────────────────────────────

  function buildMonsterDeck() {
    const tiers = ['duende', 'ogro', 'golem', 'dragon'];
    let deck = [];
    for (const tier of tiers) {
      const ids = MONSTERS.filter(m => m.tier === tier).map(m => m.id);
      deck = deck.concat(shuffle(ids).slice(0, 3));
    }
    return deck;
  }

  /**
   * Build a single combined event deck from day + night events.
   * Each entry: { type: 'day' | 'night', eventId: number }
   * Expanded by count, then shuffled together.
   */
  function buildCombinedEventDeck() {
    let deck = [];
    for (const ev of DAY_EVENTS) {
      for (let i = 0; i < ev.count; i++) {
        deck.push({ type: 'day', eventId: ev.id });
      }
    }
    for (const ev of NIGHT_EVENTS) {
      for (let i = 0; i < ev.count; i++) {
        deck.push({ type: 'night', eventId: ev.id });
      }
    }
    deck = shuffle(deck);

    // First card is always "Día Normal" (id 1) so game starts smooth
    const normalIdx = deck.findIndex(c => c.type === 'day' && c.eventId === 1);
    if (normalIdx > 0) {
      const card = deck.splice(normalIdx, 1)[0];
      deck.unshift(card);
    } else if (normalIdx === -1) {
      // Fallback: force a Día Normal at front
      deck.unshift({ type: 'day', eventId: 1 });
    }

    return deck;
  }

  // ─── State ────────────────────────────────────────────────

  let state = null;

  function defaultState() {
    return {
      phase: 'setup',
      previousPhase: 'game',
      options: { digitalMonsters: false, digitalEvents: false, fullTracking: false },
      players: [],
      game: {
        // Combined event deck: [{type:'day'|'night', eventId:number}, ...]
        eventDeck: [],
        eventIndex: 0,         // current position in the deck
        currentDay: 0,         // number of day events seen so far (1-12)
        timeOfDay: 'day',      // derived from current event type
        monsterDeck: [],
        monsterDeckIndex: 0,
        monsterDefeated: false,
        pendingNotifications: [],
      },
      duel: {
        player1Id: null, player2Id: null,
        score1: 0, score2: 0,
        winnerId: null, matchId: null,
      },
      monsterCombat: {
        monsterId: null,
        maxHP: 0, currentHP: 0,
        combatantIds: [],
        combatantScores: {},
        isLegendary: false,
      },
      tournament: {
        phase: 'pre',
        seeds: [], rounds: [],
        championId: null,
      },
    };
  }

  function initState() {
    const saved = loadState();
    state = saved || defaultState();
    if (!state.monsterCombat) state.monsterCombat = defaultState().monsterCombat;
    // Migrate old saves that used separate day/night decks
    if (!state.game.eventDeck) {
      state.game.eventDeck = [];
      state.game.eventIndex = 0;
    }
  }

  // ─── Navigation ───────────────────────────────────────────

  function navigateTo(phase) {
    state.phase = phase;
    saveState();
    renderAll();
  }

  function renderAll() {
    document.body.setAttribute('data-time', state.game.timeOfDay);

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const map = {
      setup:          'screen-setup',
      game:           'screen-game',
      duel:           'screen-duel',
      monsterCombat:  'screen-monster-combat',
      tournament:     'screen-tournament',
      champion:       'screen-tournament',
    };
    const id = map[state.phase] || 'screen-setup';
    const el = document.getElementById(id);
    if (el) el.classList.add('active');

    switch (state.phase) {
      case 'setup':         renderSetup(); break;
      case 'game':          renderGame(); break;
      case 'duel':          renderDuel(); break;
      case 'monsterCombat': renderMonsterCombat(); break;
      case 'tournament':    renderTournament(); break;
    }
  }

  // ─── SETUP ────────────────────────────────────────────────

  function renderSetup() {
    document.getElementById('opt-monsters').checked = state.options.digitalMonsters;
    document.getElementById('opt-events').checked   = state.options.digitalEvents;
    document.getElementById('opt-tracking').checked  = state.options.fullTracking;
    renderPlayerSlots();
    updateStartButton();
  }

  function renderPlayerSlots() {
    const container = document.getElementById('player-slots');
    container.innerHTML = '';
    const usedCharIds = state.players.map(p => p.characterId);

    state.players.forEach((player, idx) => {
      const div = document.createElement('div');
      div.className = 'player-slot';
      div.innerHTML = `
        <span class="player-slot-num">${idx + 1}</span>
        <input type="text" class="player-name-input" placeholder="Nombre" maxlength="20"
          value="${escHtml(player.name)}" data-idx="${idx}" />
        <select class="character-select" data-idx="${idx}">
          <option value="">— Clase —</option>
          ${CHARACTERS.map(c => {
            const taken = usedCharIds.includes(c.id) && c.id !== player.characterId;
            return `<option value="${c.id}" ${c.id === player.characterId ? 'selected' : ''} ${taken ? 'disabled' : ''}>${c.emoji} ${c.name}</option>`;
          }).join('')}
        </select>
        <button class="btn-remove-player" data-idx="${idx}" ${state.players.length <= 3 ? 'disabled' : ''}>✕</button>
      `;
      container.appendChild(div);
    });

    document.getElementById('btn-add-player').style.display =
      state.players.length >= 6 ? 'none' : 'inline-flex';
  }

  function updateStartButton() {
    const valid = state.players.length >= 3 &&
      state.players.every(p => p.name.trim() !== '' && p.characterId !== '');
    const charIds = state.players.map(p => p.characterId);
    const unique = new Set(charIds).size === charIds.length;
    document.getElementById('btn-start').disabled = !(valid && unique);
  }

  function startGame() {
    state.players = state.players.map((p, i) => {
      const char = getChar(p.characterId);
      const maxMana = char ? char.maxMana : 4;
      return { ...p, id: i, gold: 0, mana: maxMana, maxMana, equipment: [] };
    });

    // Build the combined event deck and draw the first card
    const eventDeck = buildCombinedEventDeck();
    const firstEvent = eventDeck[0];
    const isDay = firstEvent && firstEvent.type === 'day';

    state.game = {
      eventDeck,
      eventIndex: 0,
      currentDay: isDay ? 1 : 0,
      timeOfDay: firstEvent ? firstEvent.type : 'day',
      monsterDeck: buildMonsterDeck(),
      monsterDeckIndex: 0,
      monsterDefeated: false,
      pendingNotifications: [],
    };

    navigateTo('game');
  }

  // ─── GAME SCREEN ──────────────────────────────────────────

  /** Get current event from the combined deck */
  function currentEvent() {
    const g = state.game;
    const entry = g.eventDeck[g.eventIndex];
    if (!entry) return null;
    const events = entry.type === 'day' ? DAY_EVENTS : NIGHT_EVENTS;
    const ev = events.find(e => e.id === entry.eventId);
    return ev ? { ...ev, type: entry.type } : null;
  }

  function renderGame() {
    const g = state.game;
    const isDay = g.timeOfDay === 'day';
    const ev = currentEvent();

    // Header
    const label = isDay
      ? `☀️ Día ${g.currentDay} / 12`
      : `🌙 Noche`;
    document.getElementById('game-day-label').textContent = label;
    document.getElementById('btn-advance').textContent = 'Avanzar';

    // Event card — always show if digitalEvents is on
    renderEventCard(ev);

    // Monster section — only on day + digitalMonsters
    renderMonsterSection(ev);

    // Players
    renderPlayerCards();

    // Flush notifications
    flushNotifications();
  }

  function renderEventCard(ev) {
    const section = document.getElementById('event-section');

    if (!ev) {
      section.style.display = 'none';
      return;
    }

    document.getElementById('event-badge').textContent = ev.type === 'day' ? 'DÍA' : 'NOCHE';
    document.getElementById('event-name').textContent  = ev.name;
    document.getElementById('event-effect').textContent = ev.effect;
    section.style.display = 'block';
  }

  function renderMonsterSection(ev) {
    const g = state.game;
    const section = document.getElementById('monster-section');

    // Only show during day + digital monsters
    if (!state.options.digitalMonsters || g.timeOfDay !== 'day') {
      section.style.display = 'none'; return;
    }

    // Mazmorra Cerrada — hide monster
    if (ev && ev.name === 'Mazmorra Cerrada') {
      section.style.display = 'none'; return;
    }

    // Already dealt with this day's monster
    if (g.monsterDefeated) {
      section.style.display = 'none'; return;
    }

    const monsterId = g.monsterDeck[g.monsterDeckIndex];
    if (monsterId == null) { section.style.display = 'none'; return; }

    const monster = getMonster(monsterId);
    if (!monster) { section.style.display = 'none'; return; }

    const isLegendary = ev && ev.name === 'Monstruo Legendario';
    const hp = computeHPDisplay(monster, state.players.length, isLegendary);

    document.getElementById('monster-img').src = monster.image;
    document.getElementById('monster-img').alt = monster.name;
    document.getElementById('monster-name').textContent = monster.name + (isLegendary ? ' ⚡' : '');
    const badge = document.getElementById('monster-tier-badge');
    badge.textContent = monster.tier.charAt(0).toUpperCase() + monster.tier.slice(1);
    badge.className = `tier-badge ${monster.tier}`;
    document.getElementById('monster-hp').textContent     = hp;
    document.getElementById('monster-ability').textContent = monster.ability;
    document.getElementById('monster-reward').textContent  = isLegendary ? monster.reward + ' (x2)' : monster.reward;
    document.getElementById('monster-penalty').textContent = monster.penalty;

    section.style.display = 'block';
  }

  // ─── MONSTER COMBAT ───────────────────────────────────────

  function openMonsterCombat() {
    const g = state.game;
    const monsterId = g.monsterDeck[g.monsterDeckIndex];
    if (monsterId == null) return;

    const monster = getMonster(monsterId);
    if (!monster) return;

    const ev = currentEvent();
    const isLegendary = ev && ev.name === 'Monstruo Legendario';
    const maxHP = computeHP(monster, state.players.length, isLegendary);

    state.monsterCombat = {
      monsterId,
      maxHP: maxHP || 0,
      currentHP: maxHP || 0,
      combatantIds: [],
      combatantScores: {},
      isLegendary,
    };

    saveState();
    navigateTo('monsterCombat');
  }

  function renderMonsterCombat() {
    const mc = state.monsterCombat;
    const monster = getMonster(mc.monsterId);
    if (!monster) return;

    document.getElementById('mc-monster-img').src = monster.image;
    document.getElementById('mc-monster-name').textContent = monster.name + (mc.isLegendary ? ' ⚡' : '');
    const badge = document.getElementById('mc-tier-badge');
    badge.textContent = monster.tier.charAt(0).toUpperCase() + monster.tier.slice(1);
    badge.className = `tier-badge ${monster.tier}`;

    // HP bar
    const pct = mc.maxHP > 0 ? Math.max(0, mc.currentHP / mc.maxHP * 100) : 0;
    document.getElementById('mc-hp-current').textContent = Math.max(0, mc.currentHP);
    document.getElementById('mc-hp-max').textContent     = mc.maxHP || 'Especial';
    const bar = document.getElementById('mc-hp-bar');
    bar.style.width = pct + '%';
    bar.classList.toggle('low', pct < 30);

    // Combatant toggles
    const toggleDiv = document.getElementById('mc-combatant-toggle');
    toggleDiv.innerHTML = '';
    for (const p of state.players) {
      const char = getChar(p.characterId);
      const checked = mc.combatantIds.includes(p.id);
      const label = document.createElement('label');
      label.className = checked ? 'selected' : '';
      label.innerHTML = `
        <input type="checkbox" data-pid="${p.id}" ${checked ? 'checked' : ''} />
        ${char?.emoji ?? ''} ${escHtml(p.name)}
      `;
      toggleDiv.appendChild(label);
    }

    // Combatant score rows
    const listDiv = document.getElementById('mc-combatant-list');
    listDiv.innerHTML = '';
    for (const pid of mc.combatantIds) {
      const p = state.players.find(pl => pl.id === pid);
      if (!p) continue;
      const char = getChar(p.characterId);
      const score = mc.combatantScores[pid] || 0;
      const row = document.createElement('div');
      row.className = 'combatant-row';
      row.innerHTML = `
        <span class="combatant-name">${char?.emoji ?? ''} ${escHtml(p.name)}</span>
        <div class="combatant-score">
          <button class="hold-btn mc-dec" data-pid="${pid}">−</button>
          <span class="combatant-value" id="mc-score-${pid}">${score}</span>
          <button class="hold-btn mc-inc" data-pid="${pid}">+</button>
        </div>
      `;
      listDiv.appendChild(row);
    }

    // Attach listeners
    listDiv.querySelectorAll('.mc-inc').forEach(btn => {
      attachHoldButton(btn, () => adjustCombatantScore(parseInt(btn.dataset.pid), 1));
    });
    listDiv.querySelectorAll('.mc-dec').forEach(btn => {
      attachHoldButton(btn, () => adjustCombatantScore(parseInt(btn.dataset.pid), -1));
    });

    toggleDiv.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', () => {
        const pid = parseInt(cb.dataset.pid);
        if (cb.checked) {
          if (!mc.combatantIds.includes(pid)) mc.combatantIds.push(pid);
          if (!mc.combatantScores[pid]) mc.combatantScores[pid] = 0;
        } else {
          mc.combatantIds = mc.combatantIds.filter(id => id !== pid);
          delete mc.combatantScores[pid];
        }
        saveState();
        recalcMonsterHP();
        renderMonsterCombat();
      });
    });
  }

  function adjustCombatantScore(pid, delta) {
    const mc = state.monsterCombat;
    mc.combatantScores[pid] = Math.max(0, (mc.combatantScores[pid] || 0) + delta);
    recalcMonsterHP();
    saveState();

    const el = document.getElementById(`mc-score-${pid}`);
    if (el) el.textContent = mc.combatantScores[pid];

    const pct = mc.maxHP > 0 ? Math.max(0, mc.currentHP / mc.maxHP * 100) : 0;
    document.getElementById('mc-hp-current').textContent = Math.max(0, mc.currentHP);
    const bar = document.getElementById('mc-hp-bar');
    bar.style.width = pct + '%';
    bar.classList.toggle('low', pct < 30);
  }

  function recalcMonsterHP() {
    const mc = state.monsterCombat;
    let totalDmg = 0;
    for (const pid of mc.combatantIds) totalDmg += (mc.combatantScores[pid] || 0);
    mc.currentHP = mc.maxHP - totalDmg;
  }

  function endMonsterCombat() {
    const mc = state.monsterCombat;
    const g = state.game;
    const defeated = mc.currentHP <= 0;

    if (defeated) {
      const monster = getMonster(mc.monsterId);
      const tier = monster ? monster.tier : null;

      g.monsterDefeated = true;
      g.monsterDeckIndex++;

      if (tier) checkTierCompletion(g.monsterDeck, g.monsterDeckIndex, tier);

      showModal('Monstruo Derrotado', 'El monstruo ha sido vencido.', [
        { label: 'OK', primary: true, action: () => navigateTo('game') },
      ]);
    } else {
      showModal('Combate Fallido', 'El grupo no logró derrotar al monstruo. Se aplica la penitencia.', [
        { label: 'OK', primary: true, action: () => navigateTo('game') },
      ]);
    }
    saveState();
  }

  function skipMonster() {
    state.game.monsterDefeated = true;
    saveState();
    renderGame();
  }

  function checkTierCompletion(deck, currentIdx, tier) {
    const tierIndices = [];
    for (let i = 0; i < deck.length; i++) {
      const m = getMonster(deck[i]);
      if (m && m.tier === tier) tierIndices.push(i);
    }
    const maxTierIdx = Math.max(...tierIndices);
    if (currentIdx > maxTierIdx && maxTierIdx >= 0) {
      state.game.pendingNotifications.push(`¡Tier ${tier} completado! +1 maná máximo a todos`);
      for (const p of state.players) {
        p.maxMana++;
        p.mana = Math.min(p.mana + 1, p.maxMana);
      }
    }
  }

  // ─── PLAYER CARDS ─────────────────────────────────────────

  function renderPlayerCards() {
    const container = document.getElementById('players-scroll');
    container.innerHTML = '';

    for (const player of state.players) {
      const char = getChar(player.characterId);
      const card = document.createElement('div');
      card.className = 'player-card slide-up';

      let html = `
        <span class="player-card-emoji">${char ? char.emoji : '🎮'}</span>
        <div class="player-card-name">${escHtml(player.name)}</div>
        <div class="player-card-class">${char ? char.class : ''}</div>
      `;

      if (state.options.fullTracking) {
        html += `
          <div class="tracking-row">
            <span class="tracking-label">Oro</span>
            <button class="hold-btn gold-dec" data-pid="${player.id}">−</button>
            <span class="gold-value" id="gold-${player.id}">${player.gold}</span>
            <button class="hold-btn gold-inc" data-pid="${player.id}">+</button>
          </div>
        `;

        html += `
          <div class="mana-row">
            <span class="tracking-label">Maná</span>
            <div class="mana-tokens" id="mana-${player.id}">
              ${Array.from({ length: player.maxMana }, (_, i) =>
                `<span class="mana-token ${i < player.mana ? 'filled' : ''}" data-pid="${player.id}" data-idx="${i}"></span>`
              ).join('')}
            </div>
            <div class="mana-max-controls">
              <button class="hold-btn mana-max-dec" data-pid="${player.id}">−</button>
              <span class="mana-max-label">${player.maxMana}</span>
              <button class="hold-btn mana-max-inc" data-pid="${player.id}">+</button>
            </div>
          </div>
        `;

        html += `
          <div class="equipment-chips" id="equip-${player.id}">
            ${player.equipment.map(eqId => {
              const eq = EQUIPMENT.find(e => e.id === eqId);
              return eq ? `<span class="equipment-chip">${eq.name}<button data-pid="${player.id}" data-eqid="${eqId}">✕</button></span>` : '';
            }).join('')}
          </div>
          <div class="equipment-add-row">
            <select class="equipment-add-select" data-pid="${player.id}">
              <option value="">+ Equipamiento</option>
              ${EQUIPMENT.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
          </div>
        `;
      }

      card.innerHTML = html;
      container.appendChild(card);
    }

    if (state.options.fullTracking) {
      container.querySelectorAll('.gold-inc').forEach(btn => {
        attachHoldButton(btn, () => adjustGold(parseInt(btn.dataset.pid), 1));
      });
      container.querySelectorAll('.gold-dec').forEach(btn => {
        attachHoldButton(btn, () => adjustGold(parseInt(btn.dataset.pid), -1));
      });
      container.querySelectorAll('.mana-token').forEach(token => {
        token.addEventListener('click', () => {
          toggleMana(parseInt(token.dataset.pid), parseInt(token.dataset.idx));
        });
      });
      container.querySelectorAll('.mana-max-inc').forEach(btn => {
        btn.addEventListener('click', () => adjustMaxMana(parseInt(btn.dataset.pid), 1));
      });
      container.querySelectorAll('.mana-max-dec').forEach(btn => {
        btn.addEventListener('click', () => adjustMaxMana(parseInt(btn.dataset.pid), -1));
      });
      container.querySelectorAll('.equipment-chips button').forEach(btn => {
        btn.addEventListener('click', () => {
          removeEquipment(parseInt(btn.dataset.pid), parseInt(btn.dataset.eqid));
        });
      });
      container.querySelectorAll('.equipment-add-select').forEach(sel => {
        sel.addEventListener('change', () => {
          const eqid = parseInt(sel.value);
          if (eqid) { addEquipment(parseInt(sel.dataset.pid), eqid); sel.value = ''; }
        });
      });
    }
  }

  function adjustGold(pid, delta) {
    const p = state.players.find(p => p.id === pid);
    if (!p) return;
    p.gold = Math.max(0, p.gold + delta);
    saveState();
    const el = document.getElementById(`gold-${pid}`);
    if (el) el.textContent = p.gold;
  }

  function toggleMana(pid, idx) {
    const p = state.players.find(p => p.id === pid);
    if (!p) return;
    p.mana = idx < p.mana ? idx : idx + 1;
    saveState();
    const container = document.getElementById(`mana-${pid}`);
    if (container) {
      container.querySelectorAll('.mana-token').forEach((t, i) => {
        t.classList.toggle('filled', i < p.mana);
      });
    }
  }

  function adjustMaxMana(pid, delta) {
    const p = state.players.find(p => p.id === pid);
    if (!p) return;
    p.maxMana = Math.max(1, p.maxMana + delta);
    p.mana = Math.min(p.mana, p.maxMana);
    saveState();
    renderPlayerCards();
  }

  function addEquipment(pid, eqId) {
    const p = state.players.find(p => p.id === pid);
    if (!p) return;
    p.equipment.push(eqId);
    saveState();
    renderPlayerCards();
  }

  function removeEquipment(pid, eqId) {
    const p = state.players.find(p => p.id === pid);
    if (!p) return;
    const i = p.equipment.indexOf(eqId);
    if (i >= 0) p.equipment.splice(i, 1);
    saveState();
    renderPlayerCards();
  }

  // ─── TIME ADVANCE ─────────────────────────────────────────

  function advanceTime() {
    const g = state.game;

    // If current event is day + Mazmorra Cerrada, auto-skip monster
    const ev = currentEvent();
    if (ev && ev.type === 'day' && ev.name === 'Mazmorra Cerrada' && !g.monsterDefeated) {
      g.monsterDefeated = true;
      g.monsterDeckIndex++;
    }

    // Check if 12 days have been reached and we're advancing past
    if (g.currentDay >= 12 && g.timeOfDay === 'day') {
      // Move to tournament after the 12th day
      state.tournament = {
        phase: 'pre',
        seeds: state.players.map(p => ({ playerId: p.id, seedRank: null })),
        rounds: [],
        championId: null,
      };
      saveState();
      navigateTo('tournament');
      return;
    }

    // Draw next event from the combined deck
    g.eventIndex++;
    if (g.eventIndex >= g.eventDeck.length) {
      // Deck exhausted — go to tournament
      state.tournament = {
        phase: 'pre',
        seeds: state.players.map(p => ({ playerId: p.id, seedRank: null })),
        rounds: [],
        championId: null,
      };
      saveState();
      navigateTo('tournament');
      return;
    }

    const nextEntry = g.eventDeck[g.eventIndex];
    g.timeOfDay = nextEntry.type;

    if (nextEntry.type === 'day') {
      g.currentDay++;
      g.monsterDefeated = false;

      // If day count hits 12, this is the last day — still show it
      // Tournament transition happens on next "Avanzar" click (handled above)
    }

    saveState();
    renderAll();
  }

  // ─── NOTIFICATIONS ────────────────────────────────────────

  function flushNotifications() {
    const queue = state.game.pendingNotifications;
    if (!queue || queue.length === 0) return;
    showModal('Notificación', queue[0], [
      { label: 'OK', primary: true, action: () => {
        state.game.pendingNotifications.shift();
        saveState();
        flushNotifications();
      }},
    ]);
  }

  // ─── MODAL ────────────────────────────────────────────────

  function showModal(title, body, buttons) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent  = body;

    const actionsEl = document.getElementById('modal-actions');
    actionsEl.innerHTML = '';
    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = `btn btn-sm ${btn.primary ? 'btn-primary' : 'btn-secondary'}`;
      el.textContent = btn.label;
      el.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (btn.action) btn.action();
      });
      actionsEl.appendChild(el);
    }
    overlay.style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  }

  // ─── DUEL ─────────────────────────────────────────────────

  function openDuel(matchId) {
    state.duel = {
      player1Id: state.players[0]?.id ?? null,
      player2Id: state.players[1]?.id ?? null,
      score1: 0, score2: 0,
      winnerId: null, matchId: matchId || null,
    };
    saveState();
    navigateTo('duel');
  }

  function renderDuel() {
    const d = state.duel;
    populateDuelSelect(document.getElementById('duel-select-1'), d.player2Id, d.player1Id);
    populateDuelSelect(document.getElementById('duel-select-2'), d.player1Id, d.player2Id);
    updateFighterPanel(1);
    updateFighterPanel(2);
    document.getElementById('fighter-1').classList.remove('winner');
    document.getElementById('fighter-2').classList.remove('winner');
    document.getElementById('score-1').textContent = d.score1;
    document.getElementById('score-2').textContent = d.score2;
  }

  function populateDuelSelect(sel, excludeId, selectedId) {
    sel.innerHTML = '';
    for (const p of state.players) {
      if (p.id === excludeId) continue;
      const opt = document.createElement('option');
      opt.value = p.id;
      const char = getChar(p.characterId);
      opt.textContent = `${char?.emoji ?? ''} ${p.name}`;
      if (p.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function updateFighterPanel(num) {
    const d = state.duel;
    const pid = num === 1 ? d.player1Id : d.player2Id;
    const p = state.players.find(pl => pl.id === pid);
    const char = p ? getChar(p.characterId) : null;
    document.getElementById(`fighter-${num}-name`).textContent = p ? p.name : '—';
    document.getElementById(`fighter-${num}-char`).textContent = char ? `${char.emoji} ${char.class}` : '';
  }

  function getDuelScore(num) {
    return parseInt(document.getElementById(`score-${num}`).textContent.replace(/[^\d]/g, '')) || 0;
  }

  function setDuelScore(num, val) {
    val = Math.max(0, val);
    document.getElementById(`score-${num}`).textContent = val;
    if (num === 1) state.duel.score1 = val; else state.duel.score2 = val;
    saveState();
  }

  function declareWinner() {
    const s1 = getDuelScore(1), s2 = getDuelScore(2);
    if (s1 === s2) {
      showModal('Empate', 'Las puntuaciones están empatadas.', [{ label: 'OK', primary: true }]);
      return;
    }

    const winNum = s1 > s2 ? 1 : 2;
    const loseNum = winNum === 1 ? 2 : 1;
    document.getElementById(`fighter-${winNum}`).classList.add('winner');
    document.getElementById(`fighter-${loseNum}`).classList.remove('winner');

    const winnerId = winNum === 1 ? state.duel.player1Id : state.duel.player2Id;
    const loserId  = winNum === 1 ? state.duel.player2Id : state.duel.player1Id;
    state.duel.winnerId = winnerId;
    saveState();

    const winner = state.players.find(p => p.id === winnerId);
    const loser  = state.players.find(p => p.id === loserId);
    if (state.options.fullTracking && winner?.characterId === 'nyra' && loser) {
      showModal('Habilidad de Nyra', `¿Nyra roba 7 de oro a ${loser.name}?`, [
        { label: 'Sí', primary: true, action: () => {
          const stolen = Math.min(7, loser.gold);
          loser.gold -= stolen; winner.gold += stolen;
          saveState(); handlePostDuel(winnerId);
        }},
        { label: 'No', primary: false, action: () => handlePostDuel(winnerId) },
      ]);
      return;
    }
    handlePostDuel(winnerId);
  }

  function handlePostDuel(winnerId) {
    if (state.duel.matchId) recordMatchResult(state.duel.matchId, winnerId);
  }

  // ─── TOURNAMENT ───────────────────────────────────────────

  function renderTournament() {
    const t = state.tournament;
    document.getElementById('tournament-pre').style.display      = t.phase === 'pre'      ? 'block' : 'none';
    document.getElementById('tournament-bracket').style.display  = t.phase === 'bracket'  ? 'block' : 'none';
    document.getElementById('tournament-champion').style.display = t.phase === 'champion' ? 'block' : 'none';

    if (t.phase === 'pre')      renderTournamentPre();
    if (t.phase === 'bracket')  renderBracket();
    if (t.phase === 'champion') renderChampion();
  }

  function renderTournamentPre() {
    document.getElementById('gold-conversion-table').style.display =
      state.options.fullTracking ? 'block' : 'none';

    const list = document.getElementById('seed-rolls-list');
    list.innerHTML = '';
    for (const seed of state.tournament.seeds) {
      const p = state.players.find(pl => pl.id === seed.playerId);
      if (!p) continue;
      const char = getChar(p.characterId);
      const item = document.createElement('div');
      item.className = 'seed-roll-item';
      item.innerHTML = `<span>${char?.emoji ?? ''} ${escHtml(p.name)}</span>`;
      list.appendChild(item);
    }
  }

  function startTournament() {
    const t = state.tournament;
    const order = shuffle(t.seeds.map((_, i) => i));
    order.forEach((origIdx, rank) => { t.seeds[origIdx].seedRank = rank + 1; });

    const sorted = t.seeds.slice().sort((a, b) => a.seedRank - b.seedRank);
    const seeds = sorted.map(s => s.playerId);
    const n = state.players.length;

    switch (n) {
      case 3: t.rounds = buildBracket3p(seeds); break;
      case 4: t.rounds = buildBracket4p(seeds); break;
      case 5: t.rounds = buildBracket5p(seeds); break;
      case 6: t.rounds = buildBracket6p(seeds); break;
      default: t.rounds = buildBracket4p(seeds.slice(0, 4)); break;
    }

    t.phase = 'bracket';
    saveState();
    renderTournament();
  }

  function buildBracket3p(s) {
    return [
      { name: 'Semifinal', matches: [
        { id: 'sf1', player1Id: s[1], player2Id: s[2], advantagePlayerId: s[1], winnerId: null, feedsFrom: [null, null] },
      ]},
      { name: 'Final', matches: [
        { id: 'final', player1Id: s[0], player2Id: null, advantagePlayerId: s[0], winnerId: null, feedsFrom: [null, { matchId: 'sf1', slot: 2 }] },
      ]},
    ];
  }

  function buildBracket4p(s) {
    return [
      { name: 'Semifinal', matches: [
        { id: 'sf1', player1Id: s[0], player2Id: s[3], advantagePlayerId: s[0], winnerId: null, feedsFrom: [null, null] },
        { id: 'sf2', player1Id: s[1], player2Id: s[2], advantagePlayerId: s[1], winnerId: null, feedsFrom: [null, null] },
      ]},
      { name: 'Final', matches: [
        { id: 'final', player1Id: null, player2Id: null, advantagePlayerId: null, winnerId: null, feedsFrom: [{ matchId: 'sf1', slot: 1 }, { matchId: 'sf2', slot: 1 }] },
      ]},
    ];
  }

  function buildBracket5p(s) {
    return [
      { name: 'Cuartos', matches: [
        { id: 'qf1', player1Id: s[3], player2Id: s[4], advantagePlayerId: s[3], winnerId: null, feedsFrom: [null, null] },
      ]},
      { name: 'Semifinal', matches: [
        { id: 'sf1', player1Id: s[1], player2Id: null, advantagePlayerId: s[1], winnerId: null, feedsFrom: [null, { matchId: 'qf1', slot: 1 }] },
        { id: 'sf2', player1Id: s[2], player2Id: null, advantagePlayerId: s[2], winnerId: null, feedsFrom: [null, { matchId: 'qf1', slot: 1 }] },
      ]},
      { name: 'Final', matches: [
        { id: 'final', player1Id: s[0], player2Id: null, advantagePlayerId: s[0], winnerId: null, feedsFrom: [null, { matchId: 'sf1', slot: 1 }] },
      ]},
    ];
  }

  function buildBracket6p(s) {
    return [
      { name: 'Cuartos', matches: [
        { id: 'qf1', player1Id: s[0], player2Id: s[1], advantagePlayerId: s[0], winnerId: null, feedsFrom: [null, null] },
        { id: 'qf2', player1Id: s[2], player2Id: s[3], advantagePlayerId: s[2], winnerId: null, feedsFrom: [null, null] },
        { id: 'qf3', player1Id: s[4], player2Id: s[5], advantagePlayerId: s[4], winnerId: null, feedsFrom: [null, null] },
      ]},
      { name: 'Semifinal', matches: [
        { id: 'sf1', player1Id: null, player2Id: null, advantagePlayerId: null, winnerId: null, feedsFrom: [{ matchId: 'qf2', slot: 1 }, { matchId: 'qf3', slot: 1 }] },
      ]},
      { name: 'Final', matches: [
        { id: 'final', player1Id: null, player2Id: null, advantagePlayerId: null, winnerId: null, feedsFrom: [{ matchId: 'qf1', slot: 1 }, { matchId: 'sf1', slot: 1 }] },
      ]},
    ];
  }

  function findMatch(matchId) {
    for (const r of state.tournament.rounds) {
      for (const m of r.matches) { if (m.id === matchId) return m; }
    }
    return null;
  }

  function propagateWinner(matchId, winnerId) {
    for (const r of state.tournament.rounds) {
      for (const m of r.matches) {
        for (let slot = 0; slot < 2; slot++) {
          const f = m.feedsFrom[slot];
          if (f && f.matchId === matchId) {
            if (slot === 0) m.player1Id = winnerId;
            else            m.player2Id = winnerId;
          }
        }
      }
    }
  }

  function recordMatchResult(matchId, winnerId) {
    const match = findMatch(matchId);
    if (match) match.winnerId = winnerId;

    if (matchId === 'final') {
      state.tournament.championId = winnerId;
      state.tournament.phase = 'champion';
      saveState();
      navigateTo('tournament');
      return;
    }

    propagateWinner(matchId, winnerId);
    saveState();
    navigateTo('tournament');
  }

  function renderBracket() {
    const container = document.getElementById('bracket-rounds');
    container.innerHTML = '';

    for (const round of state.tournament.rounds) {
      const roundEl = document.createElement('div');
      roundEl.className = 'bracket-round';
      roundEl.innerHTML = `<div class="bracket-round-name">${round.name}</div>`;

      for (const match of round.matches) {
        const el = document.createElement('div');
        el.className = 'bracket-match';

        const p1 = state.players.find(p => p.id === match.player1Id);
        const p2 = state.players.find(p => p.id === match.player2Id);
        const c1 = p1 ? getChar(p1.characterId) : null;
        const c2 = p2 ? getChar(p2.characterId) : null;

        const s1 = p1
          ? `<div class="match-player-name">${c1?.emoji ?? ''} ${escHtml(p1.name)}</div>${match.advantagePlayerId === p1.id ? '<div class="match-advantage">Ventaja</div>' : ''}`
          : `<div class="match-player-tbd">Por determinar</div>`;
        const s2 = p2
          ? `<div class="match-player-name">${c2?.emoji ?? ''} ${escHtml(p2.name)}</div>${match.advantagePlayerId === p2.id ? '<div class="match-advantage">Ventaja</div>' : ''}`
          : `<div class="match-player-tbd">Por determinar</div>`;

        let right = '';
        if (match.winnerId != null) {
          const w = state.players.find(p => p.id === match.winnerId);
          right = `<span class="match-winner-badge">🏆 ${w ? escHtml(w.name) : ''}</span>`;
        } else if (p1 && p2) {
          right = `<button class="btn btn-sm btn-primary match-btn" data-matchid="${match.id}">Pelear</button>`;
        }

        el.innerHTML = `
          <div class="match-slot">${s1}</div>
          <span class="match-vs">VS</span>
          <div class="match-slot">${s2}</div>
          ${right}
        `;
        roundEl.appendChild(el);
      }
      container.appendChild(roundEl);
    }

    container.querySelectorAll('.match-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const match = findMatch(btn.dataset.matchid);
        if (!match) return;
        state.duel = {
          player1Id: match.player1Id, player2Id: match.player2Id,
          score1: 0, score2: 0, winnerId: null, matchId: match.id,
        };
        state.previousPhase = 'tournament';
        saveState();
        navigateTo('duel');
      });
    });
  }

  function renderChampion() {
    const p = state.players.find(pl => pl.id === state.tournament.championId);
    const char = p ? getChar(p.characterId) : null;
    document.getElementById('champion-name').textContent = p ? p.name : '???';
    document.getElementById('champion-char').textContent = char ? `${char.emoji} ${char.class}` : '';
    spawnConfetti();
  }

  function spawnConfetti() {
    const c = document.getElementById('confetti-container');
    c.innerHTML = '';
    const colors = ['#c9a84c','#7b5ea7','#e05252','#4caf84','#87ceeb','#ff9800','#fff'];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left = `${Math.random() * 100}vw`;
      p.style.top = `-${Math.random() * 20 + 10}px`;
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = `${1.5 + Math.random() * 2.5}s`;
      p.style.animationDelay = `${Math.random() * 2}s`;
      p.style.width = `${5 + Math.floor(Math.random() * 8)}px`;
      p.style.height = `${5 + Math.floor(Math.random() * 8)}px`;
      c.appendChild(p);
    }
  }

  // ─── EVENT LISTENERS ──────────────────────────────────────

  function attachListeners() {
    document.getElementById('opt-monsters').addEventListener('change', e => {
      state.options.digitalMonsters = e.target.checked; saveState();
    });
    document.getElementById('opt-events').addEventListener('change', e => {
      state.options.digitalEvents = e.target.checked; saveState();
    });
    document.getElementById('opt-tracking').addEventListener('change', e => {
      state.options.fullTracking = e.target.checked; saveState();
    });

    document.getElementById('btn-add-player').addEventListener('click', () => {
      if (state.players.length >= 6) return;
      state.players.push({ id: state.players.length, name: '', characterId: '', gold: 0, mana: 4, maxMana: 4, equipment: [] });
      saveState(); renderPlayerSlots(); updateStartButton();
    });

    document.getElementById('player-slots').addEventListener('input', e => {
      if (e.target.classList.contains('player-name-input')) {
        state.players[parseInt(e.target.dataset.idx)].name = e.target.value;
        saveState(); updateStartButton();
      }
    });
    document.getElementById('player-slots').addEventListener('change', e => {
      if (e.target.classList.contains('character-select')) {
        state.players[parseInt(e.target.dataset.idx)].characterId = e.target.value;
        saveState(); renderPlayerSlots(); updateStartButton();
      }
    });
    document.getElementById('player-slots').addEventListener('click', e => {
      const btn = e.target.closest('.btn-remove-player');
      if (!btn || state.players.length <= 3) return;
      state.players.splice(parseInt(btn.dataset.idx), 1);
      state.players.forEach((p, i) => p.id = i);
      saveState(); renderPlayerSlots(); updateStartButton();
    });

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-advance').addEventListener('click', advanceTime);
    document.getElementById('btn-fight-monster').addEventListener('click', openMonsterCombat);
    document.getElementById('btn-skip-monster').addEventListener('click', skipMonster);
    document.getElementById('btn-monster-combat-back').addEventListener('click', () => navigateTo('game'));
    document.getElementById('btn-end-combat').addEventListener('click', endMonsterCombat);

    document.getElementById('btn-duel-float').addEventListener('click', () => {
      state.previousPhase = 'game'; saveState(); openDuel(null);
    });
    document.getElementById('btn-duel-back').addEventListener('click', () => {
      navigateTo(state.previousPhase || 'game');
    });

    document.getElementById('duel-select-1').addEventListener('change', e => {
      state.duel.player1Id = parseInt(e.target.value); saveState();
      updateFighterPanel(1);
      populateDuelSelect(document.getElementById('duel-select-2'), state.duel.player1Id, state.duel.player2Id);
    });
    document.getElementById('duel-select-2').addEventListener('change', e => {
      state.duel.player2Id = parseInt(e.target.value); saveState();
      updateFighterPanel(2);
      populateDuelSelect(document.getElementById('duel-select-1'), state.duel.player2Id, state.duel.player1Id);
    });

    document.querySelectorAll('.score-btn').forEach(btn => {
      const f = parseInt(btn.dataset.fighter);
      const inc = btn.classList.contains('score-inc');
      attachHoldButton(btn, () => setDuelScore(f, getDuelScore(f) + (inc ? 1 : -1)));
    });

    [1, 2].forEach(num => {
      const el = document.getElementById(`score-${num}`);
      el.addEventListener('input', () => {
        const val = parseInt(el.textContent.replace(/[^\d]/g, '')) || 0;
        if (num === 1) state.duel.score1 = val; else state.duel.score2 = val;
        saveState();
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });

    document.getElementById('btn-declare-winner').addEventListener('click', declareWinner);
    document.getElementById('btn-reset-duel').addEventListener('click', () => {
      state.duel.score1 = 0; state.duel.score2 = 0; state.duel.winnerId = null; saveState();
      document.getElementById('score-1').textContent = '0';
      document.getElementById('score-2').textContent = '0';
      document.getElementById('fighter-1').classList.remove('winner');
      document.getElementById('fighter-2').classList.remove('winner');
    });

    document.getElementById('btn-start-tournament').addEventListener('click', startTournament);

    document.getElementById('btn-new-game').addEventListener('click', () => {
      try { localStorage.removeItem('tornaris_state'); } catch (_) {}
      location.reload();
    });

    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) {
        const actions = document.getElementById('modal-actions');
        if (actions.children.length === 1) {
          closeModal();
          const queue = state.game.pendingNotifications;
          if (queue && queue.length > 0) queue.shift();
          saveState();
        }
      }
    });
  }

  // ─── INIT ─────────────────────────────────────────────────

  function init() {
    initState();

    if (state.phase === 'setup' && state.players.length < 3) {
      state.players = [];
      for (let i = 0; i < 3; i++) {
        state.players.push({ id: i, name: '', characterId: '', gold: 0, mana: 4, maxMana: 4, equipment: [] });
      }
    }

    attachListeners();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
