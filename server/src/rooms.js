import { randomUUID } from 'node:crypto';

/**
 * Gestor de estado de salas EM MEMÓRIA.
 *
 * A forma dos dados espelha o rascunho do schema PostgreSQL (secção 4 do FD):
 * rooms { id, code, hostPlayerId, status, createdAt }
 * players { id, roomId, name, lives, isHost, connected, joinedAt }
 *
 * Quando o Prisma client estiver pronto (Semana 3), esta camada é substituída
 * de forma localizada — a app consome sempre estas mesmas estruturas.
 */

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I) — mais fácil de ditar numa festa.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const DEFAULT_LIVES = 3;

export class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} indexado por code */
    this.rooms = new Map();
  }

  generateCode() {
    let code;
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Cria uma sala e regista o criador como host.
   * @returns {{ room: Room, player: Player }}
   */
  createRoom(hostName) {
    const name = normalizeName(hostName);
    if (!name) throw new AppError('Nome inválido.');

    const code = this.generateCode();
    const room = {
      id: randomUUID(),
      code,
      hostPlayerId: null,
      status: 'lobby',
      createdAt: new Date().toISOString(),
      players: new Map(),
    };

    const player = this.#addPlayer(room, name, /* isHost */ true);
    room.hostPlayerId = player.id;
    this.rooms.set(code, room);
    return { room, player };
  }

  /**
   * Junta um jogador a uma sala existente. Valida nome único DENTRO da sala.
   * @returns {{ room: Room, player: Player }}
   */
  joinRoom(code, playerName) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');

    const name = normalizeName(playerName);
    if (!name) throw new AppError('Nome inválido.');

    const taken = [...room.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (taken) throw new AppError('Esse nome já está a ser usado nesta sala.');

    const player = this.#addPlayer(room, name, /* isHost */ false);
    return { room, player };
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').toUpperCase()) || null;
  }

  /** Marca jogador como desligado; remove a sala se ficar vazia. */
  handleDisconnect(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return null;
    const player = room.players.get(playerId);
    if (!player) return null;

    player.connected = false;

    // Se o host saiu, promove o próximo jogador ligado (se houver).
    if (player.isHost) {
      const next = [...room.players.values()].find(
        (p) => p.connected && p.id !== playerId
      );
      if (next) {
        player.isHost = false;
        next.isHost = true;
        room.hostPlayerId = next.id;
      }
    }

    const anyoneConnected = [...room.players.values()].some((p) => p.connected);
    if (!anyoneConnected) {
      this.rooms.delete(room.code);
      return { room: null, removed: true };
    }
    return { room, removed: false };
  }

  /** Arranca o jogo (só host, ≥2 ligados, ainda no lobby). */
  startGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    const player = room.players.get(playerId);
    if (!player || !player.isHost) throw new AppError('Só o host pode começar.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');
    const ligados = [...room.players.values()].filter((p) => p.connected).length;
    if (ligados < 2) throw new AppError('São precisos pelo menos 2 jogadores.');
    room.status = 'playing';
    return room;
  }

  /** Religa um jogador existente após queda de ligação. */
  reconnect(code, playerId) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('A sala já não existe.');
    const player = room.players.get(playerId);
    if (!player) throw new AppError('Já não fazes parte desta sala.');
    player.connected = true;
    return { room, player };
  }

  #addPlayer(room, name, isHost) {
    const player = {
      id: randomUUID(),
      roomId: room.id,
      name,
      lives: DEFAULT_LIVES,
      isHost,
      connected: true,
      joinedAt: new Date().toISOString(),
    };
    room.players.set(player.id, player);
    return player;
  }
}

/** Serializa a sala para o payload de rede (sem Map, ordenada por entrada). */
export function serializeRoom(room) {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    createdAt: room.createdAt,
    players: [...room.players.values()]
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((p) => ({
        id: p.id,
        name: p.name,
        lives: p.lives,
        isHost: p.isHost,
        connected: p.connected,
      })),
    // Estado de jogo (null enquanto no lobby). Ver game.js.
    game: room.game
      ? {
          phase: room.game.phase,
          intensity: room.game.intensity,
          startingLives: room.game.startingLives,
          roundCount: room.game.roundCount,
          round: room.game.round,
          currentPlayerId: room.game.currentPlayerId,
          finalStats: room.game.finalStats,
          // Só contagens (o texto das perguntas nunca é exposto antes de calhar).
          questionCount: (room.game.questions || []).length,
          questionsByTarget: (room.game.questions || []).reduce((m, q) => {
            m[q.targetPlayerId] = (m[q.targetPlayerId] || 0) + 1;
            return m;
          }, {}),
        }
      : null,
  };
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 20);
}

export class AppError extends Error {}
