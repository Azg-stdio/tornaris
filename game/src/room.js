// One Durable Object per room code. Owns the authoritative game state, accepts
// player sockets, and broadcasts state after every change.
//
// Two things worth knowing about this file:
//
// 1. It uses the WebSocket Hibernation API (ctx.acceptWebSocket rather than
//    ws.accept). Hibernated sockets stay open while the object is evicted from
//    memory, so an idle room costs nothing.
// 2. State is held in memory and flushed on an alarm rather than written on
//    every action. The free plan allows 100k SQLite row writes/day and a busy
//    6-player game would otherwise burn through that fast.

import { MAX_PLAYERS, MIN_PLAYERS, CHARACTERS } from '../public/js/shared/data.js';
import {
  startGame, spinRoulette, chooseTile, unchooseTile,
  buyEquipment, sellEquipment, nextTurn, turnComplete, viewFor,
  beginDungeonCombat, dungeonUse, dungeonPass, dungeonDeclare,
  beginDuel, duelUse, duelPass,
  rollTournamentOrder, convertGold, finishConversion,
  startTournamentMatch, tournamentUse, tournamentPass,
} from '../public/js/shared/engine.js';

const SAVE_DEBOUNCE_MS = 2000;
const PROTOCOL_VERSION = 1;

function createLobbyState() {
  return {
    version: PROTOCOL_VERSION,
    phase: 'lobby',
    createdAt: Date.now(),
    hostId: null,
    players: [], // { id, name, characterId, connected, seat }
  };
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.game = null;
    this.dirty = false;
  }

  async load() {
    if (!this.game) {
      this.game = (await this.ctx.storage.get('game')) ?? createLobbyState();
    }
    return this.game;
  }

  // Coalesce writes: mark dirty and let the alarm flush. Survives hibernation,
  // which a setTimeout would not.
  async touch() {
    this.dirty = true;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(Date.now() + SAVE_DEBOUNCE_MS);
    }
  }

  async alarm() {
    if (this.dirty && this.game) {
      await this.ctx.storage.put('game', this.game);
      this.dirty = false;
    }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const url = new URL(request.url);
    // The client persists its own id in localStorage so a refresh reclaims the
    // same seat instead of joining as a new player.
    const playerId = url.searchParams.get('pid');
    if (!playerId) return new Response('missing pid', { status: 400 });

    const game = await this.load();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment({ playerId });

    const existing = game.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      await this.touch();
    }

    this.send(server, { type: 'welcome', playerId, state: viewFor(game, playerId) });
    this.broadcast();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.send(ws, { type: 'error', message: 'malformed message' });
    }

    const { playerId } = ws.deserializeAttachment() ?? {};
    if (!playerId) return;

    const game = await this.load();

    try {
      this.handle(game, playerId, msg);
    } catch (err) {
      return this.send(ws, { type: 'error', message: err.message });
    }

    await this.touch();
    this.broadcast();
  }

  async webSocketClose(ws) {
    const { playerId } = ws.deserializeAttachment() ?? {};
    const game = await this.load();
    const player = game.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
      await this.touch();
    }
    // Flush immediately: the room may now be empty and hibernate for a long time.
    await this.alarm();
    this.broadcast();
  }

  webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  // --- actions -------------------------------------------------------------

  handle(game, playerId, msg) {
    switch (msg.type) {
      case 'join':
        return this.join(game, playerId, msg);
      case 'setName':
        return this.setName(game, playerId, msg);
      case 'setCharacter':
        return this.setCharacter(game, playerId, msg);
      case 'leave':
        return this.leave(game, playerId);

      // --- in-game actions; the engine validates and throws on illegal moves
      case 'startGame':
        this.requireHost(game, playerId);
        return startGame(game);
      case 'spinRoulette':
        return spinRoulette(game, playerId, msg.arcId ?? null);
      case 'chooseTile':
        return chooseTile(game, playerId, msg.tile);
      case 'unchooseTile':
        return unchooseTile(game, playerId);
      case 'buyEquipment':
        return buyEquipment(game, playerId, msg.equipmentId);
      case 'sellEquipment':
        return sellEquipment(game, playerId, msg.equipmentId);
      case 'nextTurn':
        if (!turnComplete(game)) throw new Error('falta resolver combates');
        return nextTurn(game);

      // --- combat
      case 'beginDungeon':
        return beginDungeonCombat(game);
      case 'dungeonUse':
        return dungeonUse(game, playerId, msg.equipmentId, msg.manualBonus);
      case 'dungeonPass':
        return dungeonPass(game, playerId);
      case 'dungeonDeclare':
        return dungeonDeclare(game, msg.outcome);
      case 'beginDuel':
        return beginDuel(game, msg.aId, msg.bId, msg.context);
      case 'duelUse':
        return duelUse(game, playerId, msg.equipmentId, msg.manualBonus);
      case 'duelPass':
        return duelPass(game, playerId);

      // --- tournament
      case 'rollTournamentOrder':
        this.requireHost(game, playerId);
        return rollTournamentOrder(game);
      case 'convertGold':
        return convertGold(game, playerId, msg.effect);
      case 'finishConversion':
        this.requireHost(game, playerId);
        return finishConversion(game);
      case 'startMatch':
        return startTournamentMatch(game);
      case 'tournamentUse':
        return tournamentUse(game, playerId, msg.equipmentId, msg.manualBonus);
      case 'tournamentPass':
        return tournamentPass(game, playerId);

      case 'ping':
        return; // keepalive
      default:
        throw new Error(`unknown action: ${msg.type}`);
    }
  }

  requireHost(game, playerId) {
    if (game.hostId !== playerId) throw new Error('solo el anfitrión puede hacer eso');
  }

  join(game, playerId, msg) {
    if (game.phase !== 'lobby') throw new Error('la partida ya empezó');
    if (game.players.some((p) => p.id === playerId)) return;
    if (game.players.length >= MAX_PLAYERS) throw new Error('la sala está llena');

    const name = String(msg.name ?? '').trim().slice(0, 20) || 'Jugador';
    game.players.push({
      id: playerId,
      name,
      characterId: null,
      connected: true,
      seat: game.players.length,
    });
    if (!game.hostId) game.hostId = playerId;
  }

  setName(game, playerId, msg) {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) throw new Error('no estás en la sala');
    player.name = String(msg.name ?? '').trim().slice(0, 20) || 'Jugador';
  }

  setCharacter(game, playerId, msg) {
    if (game.phase !== 'lobby') throw new Error('la partida ya empezó');
    const player = game.players.find((p) => p.id === playerId);
    if (!player) throw new Error('no estás en la sala');

    const characterId = msg.characterId;
    if (characterId !== null) {
      if (!CHARACTERS.some((c) => c.id === characterId)) {
        throw new Error('personaje desconocido');
      }
      const taken = game.players.some(
        (p) => p.id !== playerId && p.characterId === characterId,
      );
      if (taken) throw new Error('ese personaje ya está elegido');
    }
    player.characterId = characterId;
  }

  leave(game, playerId) {
    const idx = game.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    game.players.splice(idx, 1);
    game.players.forEach((p, i) => (p.seat = i));
    if (game.hostId === playerId) {
      game.hostId = game.players[0]?.id ?? null;
    }
  }

  // --- transport -----------------------------------------------------------

  send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // socket already gone; the close handler will clean up
    }
  }

  // Each socket gets its own redacted view: secret tile choices and other
  // players' hands never leave the server before the reveal, so there is
  // nothing for a modified client to peek at.
  broadcast() {
    if (!this.game) return;
    for (const ws of this.ctx.getWebSockets()) {
      const { playerId } = ws.deserializeAttachment() ?? {};
      this.send(ws, { type: 'state', state: viewFor(this.game, playerId) });
    }
  }
}

export { MIN_PLAYERS, MAX_PLAYERS };
