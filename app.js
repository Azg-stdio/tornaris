/* app.js — Tornaris Companion App
   All logic wrapped in an IIFE to avoid global pollution.
*/
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
    try {
      localStorage.setItem('tornaris_state', JSON.stringify(state));
    } catch (e) {
      console.warn('localStorage unavailable', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('tornaris_state');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getChar(id) {
    return CHARACTERS.find(c => c.id === id) || null;
  }

  function getMonster(id) {
    return MONSTERS.find(m => m.id === id) || null;
  }

  function computeHP(monster, playerCount, isLegendary) {
    if (monster.hp === null) return 'Especial';
    let base;
    if (typeof monster.hp === 'string' && monster.hp.endsWith('x')) {
      base = parseInt(monster.hp) * playerCount;
    } else {
      base = monster.hp;
    }
    return isLegendary ? base * 2 : base;
  }

  // ─── Hold-to-repeat ───────────────────────────────────────

  function attachHoldButton(el, cb) {
    let timer = null;
    let interval = null;

    function start() {
      cb();
      timer = setTimeout(() => {
        interval = setInterval(cb, 80);
      }, 400);
    }

    function stop() {
      clearTimeout(timer);
      clearInterval(interval);
      timer = null;
      interval = null;
    }

    el.addEventListener('pointerdown', e => { e.preventDefault(); start(); });
    el.addEventListener('pointerup',   stop);
    el.addEventListener('pointerleave', stop);
    el.addEventListener('pointercancel', stop);
  }

  // ─── Deck builders ────────────────────────────────────────

  function buildMonsterDeck() {
    const tiers = ['duende', 'ogro', 'golem', 'dragon'];
    let deck = [];
    for (const tier of tiers) {
      const tierMonsters = MONSTERS.filter(m => m.tier === tier).map(m => m.id);
      const shuffled = shuffle(tierMonsters);
      // Remove 2 (keep 3)
      deck = deck.concat(shuffled.slice(0, 3));
    }
    return deck; // 12 monsters
  }

  function buildEventDeck(events) {
    let deck = [];
    for (const ev of events) {
      for (let i = 0; i < ev.count; i++) {
        deck.push(ev.id);
      }
    }
    return shuffle(deck);
  }

  // ─── State ────────────────────────────────────────────────

  let state = null;

  const DEFAULT_STATE = {
    phase: 'setup',
    previousPhase: 'game',
    options: {
      digitalMonsters: false,
      digitalEvents: false,
      fullTracking: false,
    },
    players: [],
    game: {
      currentDay: 1,
      timeOfDay: 'day',
      monsterDeck: [],
      monsterDeckIndex: 0,
      monsterDefeated: false,
      dayEventDeck: [],
      dayEventIndex: 0,
      nightEventDeck: [],
      nightEventIndex: 0,
      pendingNotifications: [],
    },
    duel: {
      player1Id: null,
      player2Id: null,
      score1: 0,
      score2: 0,
      winnerId: null,
      matchId: null,
    },
    tournament: {
      phase: 'pre',
      seeds: [],
      rounds: [],
      championId: null,
    },
  };

  function initState() {
    const saved = loadState();
    state = saved || JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  // ─── Navigation ───────────────────────────────────────────

  function navigateTo(phase) {
    state.phase = phase;
    saveState();
    renderAll();
  }

  function renderAll() {
    // Sky
    document.body.setAttribute('data-time', state.game.timeOfDay);

    // Show correct screen
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screenMap = {
      setup:      'screen-setup',
      game:       'screen-game',
      duel:       'screen-duel',
      tournament: 'screen-tournament',
      champion:   'screen-tournament', // champion phase shown within tournament screen
    };
    const screenId = screenMap[state.phase] || 'screen-setup';
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');

    // Render the active screen
    switch (state.phase) {
      case 'setup':      renderSetup();      break;
      case 'game':       renderGame();       break;
      case 'duel':       renderDuel();       break;
      case 'tournament': renderTournament(); break;
    }
  }

  // ─── SETUP SCREEN ─────────────────────────────────────────

  function renderSetup() {
    // Sync options checkboxes
    document.getElementById('opt-monsters').checked  = state.options.digitalMonsters;
    document.getElementById('opt-events').checked    = state.options.digitalEvents;
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
        <input
          type="text"
          class="player-name-input"
          placeholder="Nombre"
          maxlength="20"
          value="${escHtml(player.name)}"
          data-idx="${idx}"
        />
        <select class="character-select" data-idx="${idx}">
          <option value="">— Clase —</option>
          ${CHARACTERS.map(c => {
            const taken = usedCharIds.includes(c.id) && c.id !== player.characterId;
            return `<option value="${c.id}" ${c.id === player.characterId ? 'selected' : ''} ${taken ? 'disabled' : ''}>${c.emoji} ${c.name} (${c.class})</option>`;
          }).join('')}
        </select>
        <button class="btn-remove-player" data-idx="${idx}" ${state.players.length <= 3 ? 'disabled' : ''}>✕</button>
      `;

      container.appendChild(div);
    });

    // Add player button
    document.getElementById('btn-add-player').style.display =
      state.players.length >= 6 ? 'none' : 'inline-flex';
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateStartButton() {
    const allValid = state.players.length >= 3 &&
      state.players.every(p => p.name.trim() !== '' && p.characterId !== '');
    const charIds = state.players.map(p => p.characterId);
    const unique = new Set(charIds).size === charIds.length;
    document.getElementById('btn-start').disabled = !(allValid && unique);
  }

  function startGame() {
    const playerCount = state.players.length;

    // Init player stats
    state.players = state.players.map((p, i) => {
      const char = getChar(p.characterId);
      const maxMana = char ? char.maxMana : 4;
      return {
        ...p,
        id: i,
        gold: 0,
        mana: maxMana,
        maxMana,
        equipment: [],
      };
    });

    // Build decks
    state.game = {
      currentDay: 1,
      timeOfDay: 'day',
      monsterDeck: buildMonsterDeck(),
      monsterDeckIndex: 0,
      monsterDefeated: false,
      dayEventDeck: buildEventDeck(DAY_EVENTS),
      dayEventIndex: 0,
      nightEventDeck: buildEventDeck(NIGHT_EVENTS),
      nightEventIndex: 0,
      pendingNotifications: [],
    };

    navigateTo('game');
  }

  // ─── GAME SCREEN ──────────────────────────────────────────

  function renderGame() {
    const g = state.game;
    const isDay = g.timeOfDay === 'day';

    // Header
    const label = isDay
      ? `☀️ Día ${g.currentDay} / 12`
      : `🌙 Noche ${g.currentDay} / 12`;
    document.getElementById('game-day-label').textContent = label;

    // Advance button label
    let advLabel;
    if (isDay) {
      advLabel = 'Noche ▶';
    } else if (g.currentDay >= 12) {
      advLabel = 'Torneo ▶';
    } else {
      advLabel = `Día ${g.currentDay + 1} ▶`;
    }
    document.getElementById('btn-advance').textContent = advLabel;

    // Event card
    renderEventCard();

    // Monster section
    renderMonsterSection();

    // Players
    renderPlayerCards();

    // Flush notifications
    flushNotifications();
  }

  function renderEventCard() {
    const g = state.game;
    const isDay = g.timeOfDay === 'day';
    const eventSection = document.getElementById('event-section');

    if (!state.options.digitalEvents) {
      eventSection.style.display = 'none';
      return;
    }

    const deckEvents  = isDay ? DAY_EVENTS   : NIGHT_EVENTS;
    const deckIds     = isDay ? g.dayEventDeck : g.nightEventDeck;
    const deckIdx     = isDay ? g.dayEventIndex : g.nightEventIndex;

    const currentEventId = deckIds[deckIdx] ?? deckIds[0];
    if (currentEventId == null) { eventSection.style.display = 'none'; return; }

    const ev = deckEvents.find(e => e.id === currentEventId);
    if (!ev) { eventSection.style.display = 'none'; return; }

    document.getElementById('event-badge').textContent = isDay ? 'DÍA' : 'NOCHE';
    document.getElementById('event-name').textContent  = ev.name;
    document.getElementById('event-effect').textContent = ev.effect;

    eventSection.style.display = 'block';
  }

  function currentDayEvent() {
    const g = state.game;
    const id = g.dayEventDeck[g.dayEventIndex];
    return DAY_EVENTS.find(e => e.id === id) || null;
  }

  function renderMonsterSection() {
    const g = state.game;
    const section = document.getElementById('monster-section');

    if (!state.options.digitalMonsters || g.timeOfDay !== 'day') {
      section.style.display = 'none';
      return;
    }

    // Check if mazmorra cerrada
    const ev = currentDayEvent();
    if (ev && ev.name === 'Mazmorra Cerrada') {
      section.style.display = 'none';
      return;
    }

    if (g.monsterDefeated) {
      section.style.display = 'none';
      return;
    }

    const monsterId = g.monsterDeck[g.monsterDeckIndex];
    if (monsterId == null) { section.style.display = 'none'; return; }

    const monster = getMonster(monsterId);
    if (!monster) { section.style.display = 'none'; return; }

    const isLegendary = ev && ev.name === 'Monstruo Legendario';
    const playerCount  = state.players.length;
    const hp = computeHP(monster, playerCount, isLegendary);

    document.getElementById('monster-img').src = monster.image;
    document.getElementById('monster-img').alt = monster.name;
    document.getElementById('monster-name').textContent = monster.name + (isLegendary ? ' ⚡' : '');
    const tierBadge = document.getElementById('monster-tier-badge');
    tierBadge.textContent = monster.tier.charAt(0).toUpperCase() + monster.tier.slice(1);
    tierBadge.className = `tier-badge ${monster.tier}`;
    document.getElementById('monster-hp').textContent     = hp;
    document.getElementById('monster-ability').textContent = monster.ability;
    document.getElementById('monster-reward').textContent  = isLegendary
      ? monster.reward + ' (×2 por legendario)'
      : monster.reward;
    document.getElementById('monster-penalty').textContent = monster.penalty;

    section.style.display = 'block';
  }

  function defeatMonster() {
    const g = state.game;
    const monsterId = g.monsterDeck[g.monsterDeckIndex];
    if (monsterId == null) return;

    const monster = getMonster(monsterId);
    const tierBefore = monster ? monster.tier : null;

    g.monsterDefeated = true;
    g.monsterDeckIndex++;

    // Tier completion check
    if (tierBefore) {
      checkTierCompletion(g.monsterDeck, g.monsterDeckIndex, tierBefore);
    }

    saveState();
    renderGame();
  }

  function checkTierCompletion(deck, currentIdx, tier) {
    // Find all monster IDs of this tier in the deck
    const tierIds = deck.filter(id => {
      const m = getMonster(id);
      return m && m.tier === tier;
    });

    // Find the highest index of a tier monster
    let maxTierIdx = -1;
    for (const id of tierIds) {
      const idx = deck.indexOf(id);
      if (idx > maxTierIdx) maxTierIdx = idx;
    }

    // All defeated if we've passed the last tier monster
    if (currentIdx > maxTierIdx && maxTierIdx >= 0) {
      state.game.pendingNotifications.push(`¡Todos los monstruos ${tier} derrotados! +1 máximo de maná a todos`);
    }
  }

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
        // Gold row
        html += `
          <div class="tracking-row">
            <span class="tracking-label">💰 Oro</span>
            <button class="hold-btn gold-dec" data-pid="${player.id}">−</button>
            <span class="gold-value" id="gold-${player.id}">${player.gold}</span>
            <button class="hold-btn gold-inc" data-pid="${player.id}">+</button>
          </div>
        `;

        // Mana tokens
        html += `
          <div class="tracking-row">
            <span class="tracking-label">🔮 Maná</span>
            <div class="mana-tokens" id="mana-${player.id}">
              ${Array.from({ length: player.maxMana }, (_, i) => `
                <span class="mana-token ${i < player.mana ? 'filled' : ''}" data-pid="${player.id}" data-idx="${i}"></span>
              `).join('')}
            </div>
          </div>
        `;

        // Equipment chips
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

    // Attach hold-to-repeat for gold buttons
    if (state.options.fullTracking) {
      container.querySelectorAll('.gold-inc').forEach(btn => {
        const pid = parseInt(btn.dataset.pid);
        attachHoldButton(btn, () => adjustGold(pid, 1));
      });
      container.querySelectorAll('.gold-dec').forEach(btn => {
        const pid = parseInt(btn.dataset.pid);
        attachHoldButton(btn, () => adjustGold(pid, -1));
      });

      // Mana tokens tap
      container.querySelectorAll('.mana-token').forEach(token => {
        token.addEventListener('click', () => {
          const pid = parseInt(token.dataset.pid);
          const idx = parseInt(token.dataset.idx);
          toggleMana(pid, idx);
        });
      });

      // Equipment remove
      container.querySelectorAll('.equipment-chips button').forEach(btn => {
        btn.addEventListener('click', () => {
          const pid  = parseInt(btn.dataset.pid);
          const eqid = parseInt(btn.dataset.eqid);
          removeEquipment(pid, eqid);
        });
      });

      // Equipment add select
      container.querySelectorAll('.equipment-add-select').forEach(sel => {
        sel.addEventListener('change', () => {
          const pid  = parseInt(sel.dataset.pid);
          const eqid = parseInt(sel.value);
          if (eqid) {
            addEquipment(pid, eqid);
            sel.value = '';
          }
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
    // Toggle: if slot filled, set mana to idx (drain), else fill to idx+1
    if (idx < p.mana) {
      p.mana = idx; // drain back to idx
    } else {
      p.mana = idx + 1; // fill up to idx+1
    }
    saveState();
    // Re-render mana tokens
    const container = document.getElementById(`mana-${pid}`);
    if (container) {
      container.querySelectorAll('.mana-token').forEach((token, i) => {
        token.classList.toggle('filled', i < p.mana);
      });
    }
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

    if (g.timeOfDay === 'day') {
      // Day → Night
      // Check mazmorra cerrada: auto-skip monster
      const ev = currentDayEvent();
      if (ev && ev.name === 'Mazmorra Cerrada' && !g.monsterDefeated) {
        g.monsterDefeated = true;
      }

      g.timeOfDay = 'night';
      // Draw night event
      if (state.options.digitalEvents) {
        g.nightEventIndex = Math.min(g.nightEventIndex, g.nightEventDeck.length - 1);
      }
      g.nightEventIndex = (g.nightEventIndex === 0 && g.timeOfDay === 'night' && g.currentDay > 1)
        ? g.nightEventIndex
        : g.nightEventIndex;
      // Advance day event index for next day
      // (we show the same event all day, advance on night)

    } else {
      // Night → ?
      if (g.currentDay >= 12) {
        // Night 12 → Tournament
        state.tournament = {
          phase: 'pre',
          seeds: state.players.map(p => ({
            playerId: p.id,
            seedRank: null,
          })),
          rounds: [],
          championId: null,
        };
        saveState();
        navigateTo('tournament');
        return;
      } else {
        // Night → new Day
        g.currentDay++;
        g.timeOfDay = 'day';
        g.monsterDefeated = false;
        g.dayEventIndex = Math.min(g.dayEventIndex + 1, g.dayEventDeck.length - 1);
        g.nightEventIndex = Math.min(g.nightEventIndex + 1, g.nightEventDeck.length - 1);
      }
    }

    saveState();
    renderGame();
  }

  // ─── NOTIFICATIONS ────────────────────────────────────────

  function flushNotifications() {
    const queue = state.game.pendingNotifications;
    if (queue.length === 0) return;
    const msg = queue[0];
    showModal('Notificación', msg, [
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

  // ─── DUEL SCREEN ──────────────────────────────────────────

  function openDuel(matchId = null) {
    state.duel = {
      player1Id: state.players[0]?.id ?? null,
      player2Id: state.players[1]?.id ?? null,
      score1: 0,
      score2: 0,
      winnerId: null,
      matchId,
    };
    saveState();
    navigateTo('duel');
  }

  function renderDuel() {
    const d = state.duel;
    const sel1 = document.getElementById('duel-select-1');
    const sel2 = document.getElementById('duel-select-2');

    // Populate selects
    populateDuelSelect(sel1, d.player2Id, d.player1Id);
    populateDuelSelect(sel2, d.player1Id, d.player2Id);

    updateFighterPanel(1);
    updateFighterPanel(2);

    // Reset winner classes
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
      opt.textContent = `${getChar(p.characterId)?.emoji ?? '🎮'} ${p.name}`;
      if (p.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function updateFighterPanel(num) {
    const d = state.duel;
    const pid  = num === 1 ? d.player1Id : d.player2Id;
    const p    = state.players.find(pl => pl.id === pid);
    const char = p ? getChar(p.characterId) : null;
    document.getElementById(`fighter-${num}-name`).textContent = p ? p.name : '—';
    document.getElementById(`fighter-${num}-char`).textContent = char ? `${char.emoji} ${char.class}` : '';
  }

  function duelSelectScore(num) {
    const el = document.getElementById(`score-${num}`);
    const raw = el.textContent.replace(/[^\d-]/g, '');
    return parseInt(raw) || 0;
  }

  function setDuelScore(num, val) {
    const el = document.getElementById(`score-${num}`);
    el.textContent = Math.max(0, val);
    if (num === 1) state.duel.score1 = Math.max(0, val);
    else           state.duel.score2 = Math.max(0, val);
    saveState();
  }

  function declareWinner() {
    const s1 = duelSelectScore(1);
    const s2 = duelSelectScore(2);

    if (s1 === s2) {
      showModal('Empate', 'Las puntuaciones están empatadas. ¡Desempaten en físico!', [
        { label: 'OK', primary: true },
      ]);
      return;
    }

    const winnerNum = s1 > s2 ? 1 : 2;
    const loserNum  = winnerNum === 1 ? 2 : 1;

    document.getElementById(`fighter-${winnerNum}`).classList.add('winner');
    document.getElementById(`fighter-${loserNum}`).classList.remove('winner');

    const winnerId = winnerNum === 1 ? state.duel.player1Id : state.duel.player2Id;
    const loserId  = winnerNum === 1 ? state.duel.player2Id : state.duel.player1Id;
    state.duel.winnerId = winnerId;
    saveState();

    // Nyra gold steal
    const winner = state.players.find(p => p.id === winnerId);
    const loser  = state.players.find(p => p.id === loserId);
    if (state.options.fullTracking && winner?.characterId === 'nyra' && loser) {
      showModal(
        '⚔️ Habilidad de Nyra',
        `¿Nyra roba 7 de oro a ${loser.name}?`,
        [
          { label: 'Sí', primary: true, action: () => {
            const stolen = Math.min(7, loser.gold);
            loser.gold  = Math.max(0, loser.gold  - stolen);
            winner.gold = winner.gold + stolen;
            saveState();
            handlePostDuel(winnerId);
          }},
          { label: 'No', primary: false, action: () => handlePostDuel(winnerId) },
        ]
      );
      return;
    }

    handlePostDuel(winnerId);
  }

  function handlePostDuel(winnerId) {
    const matchId = state.duel.matchId;
    if (matchId) {
      recordMatchResult(matchId, winnerId);
    }
  }

  // ─── TOURNAMENT SCREEN ────────────────────────────────────

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
    // Gold conversion table
    const goldTable = document.getElementById('gold-conversion-table');
    goldTable.style.display = state.options.fullTracking ? 'block' : 'none';

    // Seed rolls list
    const list = document.getElementById('seed-rolls-list');
    list.innerHTML = '';
    const t = state.tournament;

    for (const seed of t.seeds) {
      const p = state.players.find(pl => pl.id === seed.playerId);
      if (!p) continue;
      const char = getChar(p.characterId);
      const item = document.createElement('div');
      item.className = 'seed-roll-item';

      const rankHtml = seed.seedRank != null
        ? `<span class="seed-rank-badge">${seed.seedRank}</span>`
        : `<span class="text-muted">—</span>`;

      item.innerHTML = `
        <span>${char?.emoji ?? '🎮'} ${escHtml(p.name)}</span>
        ${rankHtml}
      `;
      list.appendChild(item);
    }

    document.getElementById('btn-generate-bracket').disabled = !t.seeds.every(s => s.seedRank != null);
  }

  function randomizeSeeds() {
    const t = state.tournament;
    const order = shuffle(t.seeds.map((_, i) => i));
    order.forEach((originalIdx, rank) => {
      t.seeds[originalIdx].seedRank = rank + 1;
    });
    saveState();
    renderTournamentPre();
  }

  function generateBracket() {
    const t = state.tournament;
    const n = state.players.length;

    // Sort seeds by rank asc
    const sorted = t.seeds.slice().sort((a, b) => a.seedRank - b.seedRank);
    const seeds  = sorted.map(s => s.playerId);

    let rounds = [];
    switch (n) {
      case 3: rounds = buildBracket3p(seeds); break;
      case 4: rounds = buildBracket4p(seeds); break;
      case 5: rounds = buildBracket5p(seeds); break;
      case 6: rounds = buildBracket6p(seeds); break;
      default: rounds = buildBracket4p(seeds.slice(0, 4)); break;
    }

    t.rounds    = rounds;
    t.phase     = 'bracket';
    saveState();
    renderTournament();
  }

  function mid(prefix, n) { return `${prefix}${n}`; }

  // 3p: Semi (s2 vs s3) → Final (s1 vs winner)
  function buildBracket3p(seeds) {
    const [s1, s2, s3] = seeds;
    return [
      {
        name: 'Semifinal',
        matches: [{
          id: 'sf1',
          player1Id: s2,
          player2Id: s3,
          advantagePlayerId: s2,
          winnerId: null,
          feedsFrom: [null, null],
        }],
      },
      {
        name: 'Final',
        matches: [{
          id: 'final',
          player1Id: s1,
          player2Id: null,
          advantagePlayerId: s1,
          winnerId: null,
          feedsFrom: [null, { matchId: 'sf1', slot: 2 }],
        }],
      },
    ];
  }

  // 4p: Semi1 (s1 vs s4) + Semi2 (s2 vs s3) → Final
  function buildBracket4p(seeds) {
    const [s1, s2, s3, s4] = seeds;
    return [
      {
        name: 'Semifinal',
        matches: [
          {
            id: 'sf1',
            player1Id: s1,
            player2Id: s4,
            advantagePlayerId: s1,
            winnerId: null,
            feedsFrom: [null, null],
          },
          {
            id: 'sf2',
            player1Id: s2,
            player2Id: s3,
            advantagePlayerId: s2,
            winnerId: null,
            feedsFrom: [null, null],
          },
        ],
      },
      {
        name: 'Final',
        matches: [{
          id: 'final',
          player1Id: null,
          player2Id: null,
          advantagePlayerId: null,
          winnerId: null,
          feedsFrom: [{ matchId: 'sf1', slot: 1 }, { matchId: 'sf2', slot: 1 }],
        }],
      },
    ];
  }

  // 5p: QF (s4 vs s5) → Semi (s2 vs winner, s3 vs s4-bye) → Final (s1 vs semi winner)
  function buildBracket5p(seeds) {
    const [s1, s2, s3, s4, s5] = seeds;
    return [
      {
        name: 'Cuartos',
        matches: [{
          id: 'qf1',
          player1Id: s4,
          player2Id: s5,
          advantagePlayerId: s4,
          winnerId: null,
          feedsFrom: [null, null],
        }],
      },
      {
        name: 'Semifinal',
        matches: [
          {
            id: 'sf1',
            player1Id: s2,
            player2Id: null,
            advantagePlayerId: s2,
            winnerId: null,
            feedsFrom: [null, { matchId: 'qf1', slot: 1 }],
          },
          {
            id: 'sf2',
            player1Id: s3,
            player2Id: null,
            advantagePlayerId: s3,
            winnerId: null,
            feedsFrom: [null, { matchId: 'qf1', slot: 1 }],
          },
        ],
      },
      {
        name: 'Final',
        matches: [{
          id: 'final',
          player1Id: s1,
          player2Id: null,
          advantagePlayerId: s1,
          winnerId: null,
          feedsFrom: [null, { matchId: 'sf1', slot: 1 }],
        }],
      },
    ];
  }

  // 6p: QF1(s1vs2) QF2(s3vs4) QF3(s5vs6) → Semi(QF2w vs QF3w) → Final(QF1w vs semiwinner)
  function buildBracket6p(seeds) {
    const [s1, s2, s3, s4, s5, s6] = seeds;
    return [
      {
        name: 'Cuartos',
        matches: [
          {
            id: 'qf1',
            player1Id: s1,
            player2Id: s2,
            advantagePlayerId: s1,
            winnerId: null,
            feedsFrom: [null, null],
          },
          {
            id: 'qf2',
            player1Id: s3,
            player2Id: s4,
            advantagePlayerId: s3,
            winnerId: null,
            feedsFrom: [null, null],
          },
          {
            id: 'qf3',
            player1Id: s5,
            player2Id: s6,
            advantagePlayerId: s5,
            winnerId: null,
            feedsFrom: [null, null],
          },
        ],
      },
      {
        name: 'Semifinal',
        matches: [{
          id: 'sf1',
          player1Id: null,
          player2Id: null,
          advantagePlayerId: null,
          winnerId: null,
          feedsFrom: [{ matchId: 'qf2', slot: 1 }, { matchId: 'qf3', slot: 1 }],
        }],
      },
      {
        name: 'Final',
        matches: [{
          id: 'final',
          player1Id: null,
          player2Id: null,
          advantagePlayerId: null,
          winnerId: null,
          feedsFrom: [{ matchId: 'qf1', slot: 1 }, { matchId: 'sf1', slot: 1 }],
        }],
      },
    ];
  }

  function findMatch(matchId) {
    for (const round of state.tournament.rounds) {
      for (const match of round.matches) {
        if (match.id === matchId) return match;
      }
    }
    return null;
  }

  function propagateWinner(matchId, winnerId) {
    // Find all matches that have a feedsFrom referencing this matchId
    for (const round of state.tournament.rounds) {
      for (const match of round.matches) {
        for (let slot = 0; slot < 2; slot++) {
          const feed = match.feedsFrom[slot];
          if (feed && feed.matchId === matchId) {
            if (slot === 0) match.player1Id = winnerId;
            else            match.player2Id = winnerId;
          }
        }
      }
    }
  }

  function recordMatchResult(matchId, winnerId) {
    if (matchId === 'final') {
      // Champion!
      state.tournament.championId = winnerId;
      state.tournament.phase = 'champion';
      saveState();
      navigateTo('tournament');
      return;
    }

    const match = findMatch(matchId);
    if (!match) return;
    match.winnerId = winnerId;

    propagateWinner(matchId, winnerId);
    saveState();

    // Return to tournament bracket
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
        const matchEl = document.createElement('div');
        matchEl.className = 'bracket-match';

        const p1 = state.players.find(p => p.id === match.player1Id);
        const p2 = state.players.find(p => p.id === match.player2Id);
        const c1 = p1 ? getChar(p1.characterId) : null;
        const c2 = p2 ? getChar(p2.characterId) : null;

        const advP = state.players.find(p => p.id === match.advantagePlayerId);

        const slot1Html = p1
          ? `<div class="match-player-name">${c1?.emoji ?? ''} ${escHtml(p1.name)}</div>${match.advantagePlayerId === p1.id ? '<div class="match-advantage">⭐ Ventaja</div>' : ''}`
          : `<div class="match-player-tbd">Por determinar</div>`;

        const slot2Html = p2
          ? `<div class="match-player-name">${c2?.emoji ?? ''} ${escHtml(p2.name)}</div>${match.advantagePlayerId === p2.id ? '<div class="match-advantage">⭐ Ventaja</div>' : ''}`
          : `<div class="match-player-tbd">Por determinar</div>`;

        let rightHtml = '';
        if (match.winnerId != null) {
          const winner = state.players.find(p => p.id === match.winnerId);
          rightHtml = `<span class="match-winner-badge">🏆 ${winner ? escHtml(winner.name) : ''}</span>`;
        } else if (p1 && p2) {
          rightHtml = `<button class="btn btn-sm btn-primary match-btn" data-matchid="${match.id}">⚔️ Pelear</button>`;
        }

        matchEl.innerHTML = `
          <div class="match-slot">${slot1Html}</div>
          <span class="match-vs">VS</span>
          <div class="match-slot">${slot2Html}</div>
          ${rightHtml}
        `;

        roundEl.appendChild(matchEl);
      }

      container.appendChild(roundEl);
    }

    // Attach fight buttons
    container.querySelectorAll('.match-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const matchId = btn.dataset.matchid;
        const match   = findMatch(matchId);
        if (!match) return;

        state.duel = {
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          score1: 0,
          score2: 0,
          winnerId: null,
          matchId,
        };
        state.previousPhase = 'tournament';
        saveState();
        navigateTo('duel');
      });
    });
  }

  function renderChampion() {
    const pid    = state.tournament.championId;
    const p      = state.players.find(pl => pl.id === pid);
    const char   = p ? getChar(p.characterId) : null;

    document.getElementById('champion-name').textContent = p ? p.name : '???';
    document.getElementById('champion-char').textContent = char ? `${char.emoji} ${char.class}` : '';

    spawnConfetti();
  }

  function spawnConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';

    const colors = ['#c9a84c','#7b5ea7','#e05252','#4caf84','#87ceeb','#ff9800','#ffffff'];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left     = `${Math.random() * 100}vw`;
      p.style.top      = `-${Math.random() * 20 + 10}px`;
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration  = `${1.5 + Math.random() * 2.5}s`;
      p.style.animationDelay     = `${Math.random() * 2}s`;
      p.style.width  = `${5 + Math.floor(Math.random() * 8)}px`;
      p.style.height = `${5 + Math.floor(Math.random() * 8)}px`;
      container.appendChild(p);
    }
  }

  // ─── EVENT LISTENERS ──────────────────────────────────────

  function attachListeners() {

    // ── Options toggles
    document.getElementById('opt-monsters').addEventListener('change', e => {
      state.options.digitalMonsters = e.target.checked;
      saveState();
    });
    document.getElementById('opt-events').addEventListener('change', e => {
      state.options.digitalEvents = e.target.checked;
      saveState();
    });
    document.getElementById('opt-tracking').addEventListener('change', e => {
      state.options.fullTracking = e.target.checked;
      saveState();
    });

    // ── Add player
    document.getElementById('btn-add-player').addEventListener('click', () => {
      if (state.players.length >= 6) return;
      state.players.push({ id: state.players.length, name: '', characterId: '', gold: 0, mana: 4, maxMana: 4, equipment: [] });
      saveState();
      renderPlayerSlots();
      updateStartButton();
    });

    // ── Player slot events (delegated)
    document.getElementById('player-slots').addEventListener('input', e => {
      if (e.target.classList.contains('player-name-input')) {
        const idx = parseInt(e.target.dataset.idx);
        state.players[idx].name = e.target.value;
        saveState();
        updateStartButton();
      }
    });

    document.getElementById('player-slots').addEventListener('change', e => {
      if (e.target.classList.contains('character-select')) {
        const idx = parseInt(e.target.dataset.idx);
        state.players[idx].characterId = e.target.value;
        saveState();
        renderPlayerSlots(); // re-render to disable taken chars in other selects
        updateStartButton();
      }
    });

    document.getElementById('player-slots').addEventListener('click', e => {
      const btn = e.target.closest('.btn-remove-player');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      if (state.players.length <= 3) return;
      state.players.splice(idx, 1);
      // Re-number IDs
      state.players.forEach((p, i) => p.id = i);
      saveState();
      renderPlayerSlots();
      updateStartButton();
    });

    // ── Start game
    document.getElementById('btn-start').addEventListener('click', () => {
      startGame();
    });

    // ── Advance time
    document.getElementById('btn-advance').addEventListener('click', () => {
      advanceTime();
    });

    // ── Defeat monster
    document.getElementById('btn-defeat-monster').addEventListener('click', () => {
      defeatMonster();
    });

    // ── Floating duel button
    document.getElementById('btn-duel-float').addEventListener('click', () => {
      state.previousPhase = 'game';
      saveState();
      openDuel(null);
    });

    // ── Duel back
    document.getElementById('btn-duel-back').addEventListener('click', () => {
      navigateTo(state.previousPhase || 'game');
    });

    // ── Duel player selects
    document.getElementById('duel-select-1').addEventListener('change', e => {
      state.duel.player1Id = parseInt(e.target.value);
      saveState();
      updateFighterPanel(1);
      populateDuelSelect(
        document.getElementById('duel-select-2'),
        state.duel.player1Id,
        state.duel.player2Id
      );
    });

    document.getElementById('duel-select-2').addEventListener('change', e => {
      state.duel.player2Id = parseInt(e.target.value);
      saveState();
      updateFighterPanel(2);
      populateDuelSelect(
        document.getElementById('duel-select-1'),
        state.duel.player2Id,
        state.duel.player1Id
      );
    });

    // ── Score buttons hold-to-repeat
    document.querySelectorAll('.score-btn').forEach(btn => {
      const fighter = parseInt(btn.dataset.fighter);
      const isInc   = btn.classList.contains('score-inc');
      attachHoldButton(btn, () => {
        const cur = duelSelectScore(fighter);
        setDuelScore(fighter, cur + (isInc ? 1 : -1));
      });
    });

    // ── Score contenteditable sanitize
    [1, 2].forEach(num => {
      const el = document.getElementById(`score-${num}`);
      el.addEventListener('input', () => {
        const raw = el.textContent.replace(/[^\d]/g, '');
        const val = parseInt(raw) || 0;
        if (num === 1) state.duel.score1 = val;
        else           state.duel.score2 = val;
        saveState();
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
    });

    // ── Declare winner
    document.getElementById('btn-declare-winner').addEventListener('click', () => {
      declareWinner();
    });

    // ── Reset duel
    document.getElementById('btn-reset-duel').addEventListener('click', () => {
      state.duel.score1 = 0;
      state.duel.score2 = 0;
      state.duel.winnerId = null;
      saveState();
      document.getElementById('score-1').textContent = '0';
      document.getElementById('score-2').textContent = '0';
      document.getElementById('fighter-1').classList.remove('winner');
      document.getElementById('fighter-2').classList.remove('winner');
    });

    // ── Tournament: randomize seeds
    document.getElementById('btn-randomize-seeds').addEventListener('click', () => {
      randomizeSeeds();
    });

    // ── Tournament: generate bracket
    document.getElementById('btn-generate-bracket').addEventListener('click', () => {
      generateBracket();
    });

    // ── New game
    document.getElementById('btn-new-game').addEventListener('click', () => {
      try { localStorage.removeItem('tornaris_state'); } catch (_) {}
      location.reload();
    });

    // ── Modal overlay click outside = dismiss (for notification modals only)
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) {
        // Only close if there's a single OK button (notifications)
        const actions = document.getElementById('modal-actions');
        if (actions.children.length === 1) {
          closeModal();
          const queue = state.game.pendingNotifications;
          if (queue.length > 0) queue.shift();
          saveState();
        }
      }
    });
  }

  // ─── INIT ─────────────────────────────────────────────────

  function init() {
    initState();

    // Ensure players array has at least 3 slots on setup
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
