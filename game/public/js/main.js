// Client entry: landing screen, room connection, lobby rendering.
// The server is authoritative — we render whatever state it sends and never
// mutate a local copy.

import { CHARACTERS } from '/js/shared/data.js';
import { RoomConnection, playerId } from '/js/net.js';

const NAME_KEY = 'tornaris_name';

const $ = (sel) => document.querySelector(sel);

const el = {
  screens: document.querySelectorAll('.screen'),
  name: $('#input-name'),
  code: $('#input-code'),
  create: $('#btn-create'),
  joinForm: $('#form-join'),
  share: $('#btn-share'),
  roomCode: $('#room-code'),
  charGrid: $('#character-grid'),
  playerList: $('#player-list'),
  playerCount: $('#player-count'),
  hint: $('#lobby-hint'),
  toast: $('#toast'),
};

let conn = null;
let state = null;

// --- ui helpers ------------------------------------------------------------

function showScreen(id) {
  for (const s of el.screens) s.classList.toggle('is-active', s.id === id);
}

let toastTimer;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('is-error', isError);
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

// --- lobby rendering -------------------------------------------------------

function me() {
  return state?.players.find((p) => p.id === playerId()) ?? null;
}

function renderCharacters() {
  const mine = me();
  el.charGrid.replaceChildren(
    ...CHARACTERS.map((c) => {
      const owner = state.players.find((p) => p.characterId === c.id);
      const isMine = owner?.id === playerId();
      const isTaken = owner && !isMine;

      const btn = document.createElement('button');
      btn.className = 'charcard';
      btn.classList.toggle('is-mine', isMine);
      btn.classList.toggle('is-taken', Boolean(isTaken));
      btn.disabled = Boolean(isTaken);
      btn.type = 'button';

      const img = document.createElement('img');
      img.src = `/assets/tokens/${c.slug}.webp`;
      img.alt = '';
      img.loading = 'lazy';

      const name = document.createElement('span');
      name.className = 'charcard__name';
      name.textContent = c.name;

      const klass = document.createElement('span');
      klass.className = 'charcard__class';
      klass.textContent = c.className;

      btn.append(img, name, klass);

      if (owner) {
        const pip = document.createElement('span');
        pip.className = 'charcard__owner';
        pip.style.background = c.color;
        btn.append(pip);
      }

      // Tapping your own character clears the pick.
      btn.addEventListener('click', () => {
        conn.send({ type: 'setCharacter', characterId: isMine ? null : c.id });
      });

      return btn;
    }),
  );

  el.hint.textContent = mine?.characterId
    ? 'Esperando a los demás…'
    : 'Toca un personaje para elegirlo.';
}

function renderPlayers() {
  el.playerCount.textContent = `(${state.players.length}/6)`;

  el.playerList.replaceChildren(
    ...state.players.map((p) => {
      const c = CHARACTERS.find((x) => x.id === p.characterId);

      const li = document.createElement('li');
      li.className = 'player';
      li.classList.toggle('is-offline', !p.connected);

      const dot = document.createElement('span');
      dot.className = 'player__dot';
      if (c) dot.style.background = c.color;

      const name = document.createElement('span');
      name.className = 'player__name';
      name.textContent = p.name + (p.id === playerId() ? ' (tú)' : '');

      const meta = document.createElement('span');
      meta.className = 'player__meta';
      if (!p.connected) meta.textContent = 'desconectado';
      else if (c) meta.textContent = c.className;
      else meta.textContent = 'eligiendo…';

      li.append(dot, name, meta);
      return li;
    }),
  );
}

function render() {
  if (!state) return;
  el.roomCode.textContent = conn.code;
  renderCharacters();
  renderPlayers();
}

// --- room lifecycle --------------------------------------------------------

function joinRoom(code) {
  conn = new RoomConnection(code);

  conn.addEventListener('welcome', (ev) => {
    state = ev.detail.state;
    // Announce ourselves if this is a fresh seat.
    if (!state.players.some((p) => p.id === playerId())) {
      conn.send({ type: 'join', name: el.name.value.trim() || 'Jugador' });
    }
    showScreen('screen-lobby');
    render();
  });

  conn.addEventListener('state', (ev) => {
    state = ev.detail.state;
    render();
  });

  conn.addEventListener('error', (ev) => toast(ev.detail.message, true));

  conn.addEventListener('status', (ev) => {
    if (!ev.detail.online) toast('Reconectando…', true);
  });

  conn.connect();

  const url = new URL(location.href);
  url.searchParams.set('sala', code);
  history.replaceState(null, '', url);
}

// --- events ----------------------------------------------------------------

el.name.value = localStorage.getItem(NAME_KEY) ?? '';
el.name.addEventListener('input', () => {
  localStorage.setItem(NAME_KEY, el.name.value);
  if (conn && state) conn.send({ type: 'setName', name: el.name.value });
});

el.create.addEventListener('click', async () => {
  el.create.disabled = true;
  try {
    const res = await fetch('/api/rooms', { method: 'POST' });
    if (!res.ok) throw new Error('no se pudo crear la sala');
    const { code } = await res.json();
    joinRoom(code);
  } catch (err) {
    toast(err.message, true);
  } finally {
    el.create.disabled = false;
  }
});

el.joinForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const code = el.code.value.trim().toUpperCase();
  if (code.length !== 4) return toast('El código tiene 4 caracteres', true);
  joinRoom(code);
});

el.share.addEventListener('click', async () => {
  const url = `${location.origin}/?sala=${conn.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Tornaris', url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado');
    }
  } catch {
    // user dismissed the share sheet
  }
});

// Deep link: /?sala=ABCD drops you straight into the lobby.
const fromUrl = new URL(location.href).searchParams.get('sala');
if (fromUrl) {
  el.code.value = fromUrl.toUpperCase();
  joinRoom(fromUrl.toUpperCase());
} else {
  showScreen('screen-home');
}
