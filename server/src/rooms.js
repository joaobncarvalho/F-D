import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { serializeGame } from './game.js';

export { AppError }; // re-exportado para compatibilidade (socket.js importa daqui)

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
// Tempo que uma sala VAZIA (ninguém ligado) sobrevive antes de ser apagada.
// Cobre o caso comum: criar sala → sair da app para partilhar o código → voltar.
const EMPTY_ROOM_GRACE_MS = Number(process.env.EMPTY_ROOM_GRACE_MS) || 120_000;

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
      intensityVotes: {}, // playerId -> intensidade (votação no lobby)
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

    this.#cancelCleanup(room); // alguém entrou → cancela remoção pendente
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
      // Não apagar já: dar um período de graça (ex.: o host saiu para partilhar
      // o código). Se ninguém voltar/entrar a tempo, a sala é removida no timer.
      this.#scheduleCleanup(room);
      return { room, removed: false, empty: true };
    }
    return { room, removed: false };
  }

  /** Agenda a remoção de uma sala vazia; cancelável se alguém (re)entrar. */
  #scheduleCleanup(room) {
    if (room.cleanupTimer) return; // já agendado
    room.cleanupTimer = setTimeout(() => {
      const cur = this.rooms.get(room.code);
      if (!cur) return;
      cur.cleanupTimer = null;
      const stillEmpty = ![...cur.players.values()].some((p) => p.connected);
      if (stillEmpty) this.rooms.delete(cur.code);
    }, EMPTY_ROOM_GRACE_MS);
    room.cleanupTimer.unref?.(); // não segurar o processo por causa deste timer
  }

  /** Cancela a remoção agendada (alguém voltou ou entrou). */
  #cancelCleanup(room) {
    if (room?.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
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

  /** Voto de intensidade no lobby (qualquer jogador). */
  voteIntensity(code, playerId, intensity) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');
    if (!room.players.get(playerId)) throw new AppError('Jogador inválido.');
    if (!['leve', 'picante', 'hardcore', 'caos'].includes(intensity))
      throw new AppError('Intensidade inválida.');
    room.intensityVotes[playerId] = intensity;
    return room;
  }

  /** Religa um jogador existente após queda de ligação. */
  reconnect(code, playerId) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('A sala já não existe.');
    const player = room.players.get(playerId);
    if (!player) throw new AppError('Já não fazes parte desta sala.');
    this.#cancelCleanup(room); // o jogador voltou → cancela remoção pendente
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
      eliminated: false, // sem vidas → espectador (telemóvel partido)
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
        eliminated: p.eliminated,
      })),
    intensityVotes: room.intensityVotes || {}, // votos no lobby (playerId -> intensidade)
    // Estado de jogo (null enquanto no lobby). Serialização/anonimização em game.js.
    game: serializeGame(room),
  };
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 20);
}
