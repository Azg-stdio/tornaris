// Room connection. Keeps a socket to the room's Durable Object, reconnects with
// backoff, and hands decoded state to a listener.
//
// The player id lives in localStorage so a refresh reclaims the same seat rather
// than joining as a stranger.

const PID_KEY = 'tornaris_pid';

export function playerId() {
  let id = localStorage.getItem(PID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PID_KEY, id);
  }
  return id;
}

export class RoomConnection extends EventTarget {
  constructor(code) {
    super();
    this.code = code;
    this.ws = null;
    this.attempt = 0;
    this.closed = false;
    this.queue = [];
  }

  connect() {
    this.closed = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/rooms/${this.code}/ws?pid=${playerId()}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this.emit('status', { online: true });
      // Flush anything queued while we were down.
      for (const msg of this.queue.splice(0)) this.send(msg);
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.emit(msg.type, msg);
    });

    ws.addEventListener('close', () => {
      this.emit('status', { online: false });
      if (!this.closed) this.scheduleReconnect();
    });

    ws.addEventListener('error', () => ws.close());
  }

  scheduleReconnect() {
    // 0.5s, 1s, 2s, 4s ... capped at 8s, with jitter so six friends reloading
    // at once don't retry in lockstep.
    const base = Math.min(8000, 500 * 2 ** this.attempt++);
    const delay = base * (0.7 + Math.random() * 0.6);
    setTimeout(() => { if (!this.closed) this.connect(); }, delay);
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
