// Worker entry. Serves the client from ./public (via the assets binding) and
// routes room traffic to the Durable Object that owns that room.

export { Room } from './room.js';

// Room codes are short and human-readable: no vowels (avoids accidental words),
// no 0/O/1/I (avoids misreading them out loud to friends).
const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 4;

function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST /api/rooms -> mint a fresh code. We don't touch the DO here; the room
    // materialises when the first player actually connects.
    if (path === '/api/rooms' && request.method === 'POST') {
      return json({ code: makeRoomCode() });
    }

    // GET /api/rooms/:code/ws -> hand the socket to that room's Durable Object.
    const match = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/);
    if (match) {
      const code = match[1].toUpperCase();
      if (code.length !== CODE_LENGTH) {
        return json({ error: 'invalid room code' }, 400);
      }
      // idFromName is deterministic, so the same code always reaches the same
      // object no matter which edge location the player connects from.
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    if (path.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    // Everything else is the client itself.
    return env.ASSETS.fetch(request);
  },
};
