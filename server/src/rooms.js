import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { serializeGame } from './game.js';
import { serializeBoard } from './board.js';
import { serializeTournament } from './tournament.js';
import { sanitizeText } from './util.js';
import { serializeFeed } from './feed.js';
import { EMOJIS, COLORS, defaultIdentity } from './content/identity.js';

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
// Teto de jogadores por sala. Não é anti-abuso: é jogabilidade. Com 30 pessoas
// esperava-se 30 rondas pela própria vez, a pirâmide não tem cartas para todos e
// os nomes deixam de caber no ecrã. Quem não couber vê pelo modo TV (/?tv=CODIGO).
const MAX_PLAYERS = Math.max(2, Number(process.env.MAX_PLAYERS) || 12);
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
      mode: 'wheel', // 'wheel' (roda) | 'board' (tabuleiro) | 'tournament' (torneio)
      pack: null, // pack temático: null | 'aniversario' | 'despedida' | 'reencontro'
      curve: true, // curva de intensidade (leve → teto votado ao longo da noite)
      paused: false, // pausa do host: congela ações e cronómetros
      feed: [], // feed de eventos da sala (feed.js)
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
    // Numa festa TODA a gente chega tarde. Fechar a sala ao arrancar obrigava o
    // host a terminar a ronda por cada atrasado — por isso 'playing' também
    // aceita: o jogador entra e o modo integra-o (joinInProgress no socket.js).
    // Só um jogo TERMINADO recusa: aí o caminho é o host voltar ao lobby.
    if (room.status === 'ended')
      throw new AppError('O jogo terminou. Peçam ao anfitrião para voltar ao lobby.');

    const name = normalizeName(playerName);
    if (!name) throw new AppError('Nome inválido.');

    const taken = [...room.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (taken) throw new AppError('Esse nome já está a ser usado nesta sala.');

    if (room.players.size >= MAX_PLAYERS)
      throw new AppError(`A sala está cheia (máximo ${MAX_PLAYERS}). Vejam num ecrã grande com o modo TV.`);

    this.#cancelCleanup(room); // alguém entrou → cancela remoção pendente
    const player = this.#addPlayer(room, name, /* isHost */ false);

    // Sala sem host LIGADO (o anfitrião saiu e ainda corre o período de graça):
    // quem entra assume. Sem isto a sala ficava viva mas morta — ninguém podia
    // começar o jogo, escolher o modo ou terminá-lo.
    const temHost = [...room.players.values()].some((p) => p.isHost && p.connected);
    if (!temHost) {
      for (const p of room.players.values()) p.isHost = false;
      player.isHost = true;
      room.hostPlayerId = player.id;
    }

    return { room, player, latecomer: room.status === 'playing' };
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

  /** Modo de jogo escolhido pelo host no lobby ('wheel' | 'board' | 'tournament'). */
  setMode(code, playerId, mode) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    const player = room.players.get(playerId);
    if (!player || !player.isHost) throw new AppError('Só o host pode escolher o modo.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');
    room.mode = ['board', 'tournament'].includes(mode) ? mode : 'wheel';
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

  /** Identidade (emoji + cor). Qualquer jogador, só no lobby, sem repetir emoji. */
  setIdentity(code, playerId, { emoji, color } = {}) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');
    const player = room.players.get(playerId);
    if (!player) throw new AppError('Jogador inválido.');
    if (emoji !== undefined && emoji !== null) {
      if (!EMOJIS.includes(emoji)) throw new AppError('Emoji inválido.');
      const taken = [...room.players.values()].some((p) => p.id !== playerId && p.emoji === emoji);
      if (taken) throw new AppError('Esse emoji já está a ser usado.');
      player.emoji = emoji;
    }
    if (color !== undefined && color !== null) {
      if (!COLORS.includes(color)) throw new AppError('Cor inválida.');
      player.color = color;
    }
    return room;
  }

  /** Pack temático do conteúdo (só host, só no lobby). */
  setPack(code, playerId, pack) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    const player = room.players.get(playerId);
    if (!player || !player.isHost) throw new AppError('Só o host escolhe o pack.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');
    room.pack = ['aniversario', 'despedida', 'reencontro'].includes(pack) ? pack : null;
    return room;
  }

  /** Liga/desliga a curva de intensidade (só host, só no lobby). */
  setCurve(code, playerId, on) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    const player = room.players.get(playerId);
    if (!player || !player.isHost) throw new AppError('Só o host muda isto.');
    if (room.status !== 'lobby') throw new AppError('O jogo já começou.');
    room.curve = !!on;
    return room;
  }

  /**
   * Pausa do host ("intervalo, casa de banho"). Enquanto a sala está em pausa o
   * servidor recusa ações de jogo e os cronómetros do cliente congelam.
   */
  setPaused(code, playerId, paused) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    const player = room.players.get(playerId);
    if (!player || !player.isHost) throw new AppError('Só o host pode pausar.');
    room.paused = !!paused;
    room.pausedAt = room.paused ? Date.now() : null;
    return room;
  }

  /**
   * Religa um jogador existente após queda de ligação.
   *
   * O `token` é a PROVA de que este telemóvel é mesmo daquele jogador. Sem ele
   * bastava ler um `playerId` do `room_state` (vão lá todos — o cliente precisa
   * deles para desenhar a mesa) para assumir a identidade de outra pessoa: e com
   * ela a mão da Pirâmide, o papel do Vasco, o aviso de autor do Segredo e os
   * poderes de host. O token NUNCA vai no broadcast — só no `room_joined` do
   * próprio jogador.
   */
  reconnect(code, playerId, token) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('A sala já não existe.');
    const player = room.players.get(playerId);
    if (!player) throw new AppError('Já não fazes parte desta sala.');
    if (!player.token || player.token !== token)
      throw new AppError('Sessão inválida — volta a entrar com o código da sala.');
    this.#cancelCleanup(room); // o jogador voltou → cancela remoção pendente
    player.connected = true;
    return { room, player };
  }

  #addPlayer(room, name, isHost) {
    // Identidade por defeito pela ordem de entrada — trocável no lobby.
    const ident = defaultIdentity(room.players.size);
    const player = {
      id: randomUUID(),
      // Segredo partilhado só com este telemóvel (ver reconnect). Fora do broadcast.
      token: randomUUID(),
      roomId: room.id,
      name,
      emoji: ident.emoji,
      color: ident.color,
      lives: DEFAULT_LIVES,
      isHost,
      connected: true,
      eliminated: false, // sem vidas → espectador (telemóvel partido)
      isBot: false, // bots de playtest (dev) — nunca host
      joinedAt: new Date().toISOString(),
    };
    room.players.set(player.id, player);
    return player;
  }

  /** Adiciona um bot de playtest (dev). Nome único automático (Bot1, Bot2…). */
  addBot(code) {
    const room = this.getRoom(code);
    if (!room) throw new AppError('Sala não encontrada.');
    if (room.status !== 'lobby') throw new AppError('Só dá para adicionar bots no lobby.');
    if (room.players.size >= MAX_PLAYERS) throw new AppError('A sala está cheia.');
    let n = 1;
    let name;
    const taken = (nm) => [...room.players.values()].some((p) => p.name.toLowerCase() === nm.toLowerCase());
    do {
      name = `Bot${n++}`;
    } while (taken(name));
    const player = this.#addPlayer(room, name, /* isHost */ false);
    player.isBot = true;
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
        emoji: p.emoji,
        color: p.color,
        lives: p.lives,
        isHost: p.isHost,
        connected: p.connected,
        eliminated: p.eliminated,
        isBot: !!p.isBot,
      })),
    intensityVotes: room.intensityVotes || {}, // votos no lobby (playerId -> intensidade)
    mode: room.mode || 'wheel',
    pack: room.pack || null,
    curve: room.curve !== false,
    paused: !!room.paused,
    feed: serializeFeed(room),
    // Estado de jogo (null enquanto no lobby). Serialização/anonimização em game.js/board.js.
    game: serializeGame(room),
    board: serializeBoard(room),
    tournament: serializeTournament(room),
  };
}

function normalizeName(name) {
  return sanitizeText(name, 20);
}
