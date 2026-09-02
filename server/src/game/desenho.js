// ----- Desenha e Adivinha ----------------------------------------------------
//
// Quem está à vez recebe uma palavra em PRIVADO (canal `desenho_word`) e desenha
// no telemóvel; os traços são retransmitidos por um canal próprio (`draw_stroke`)
// e não pelo `room_state` — o estado da sala não é sítio para dezenas de pontos
// por segundo. Os outros escrevem palpites.
//
//   alguém acerta  → quem acertou e quem desenhou safam-se; os restantes bebem 1
//   ninguém acerta → quem desenhou bebe 3 (desenhaste mal, paga-se)
//
// Invariante: a palavra nunca entra no broadcast antes do fim da ronda.

import { AppError } from '../errors.js';
import { connectedOrder, drink, nameOf, perdeVida } from './helpers.js';
import { sanitizeText } from '../util.js';

const SECONDS = 75;
const GOLOS_OUTROS = 1;
const GOLOS_DESENHISTA = 3;
const MAX_PALPITES = 30; // histórico visível (os erros dão graça à coisa)

/** Normaliza para comparar palpites: minúsculas, sem acentos e sem pontuação. */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function setupDesenho(round, prompt) {
  round.word = prompt?.text || 'Cerveja'; // PRIVADO até ao fim
  round.seconds = SECONDS;
  round.substate = 'ready'; // ready → drawing → result
  round.guesses = []; // { playerId, name, text, correct }
  round.winnerId = null;
  round.result = null;
}

function requireDesenho(room, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'desenho' || !r) throw new AppError('Não há desenho ativo.');
  if (substate && r.substate !== substate) throw new AppError('Não é altura disso.');
  return r;
}

/** A palavra privada de quem desenha (entrega no spin e na reconexão). */
export function desenhoWord(room, playerId) {
  const r = room.game?.round;
  if (!r || r.gameTypeKey !== 'desenho') return null;
  if (playerId !== r.currentPlayerId) return null;
  return { word: r.word, seconds: r.seconds };
}

/** Quem está a desenhar pode começar (todos os ecrãs abrem a tela ao mesmo tempo). */
export function desenhoStart(room, playerId) {
  const r = requireDesenho(room, 'ready');
  if (playerId !== r.currentPlayerId) throw new AppError('Só quem desenha pode começar.');
  r.substate = 'drawing';
  r.startedAt = Date.now();
  return r;
}

/** Um palpite. Devolve { correct } — quem acerta fecha a ronda. */
export function desenhoGuess(room, playerId, text) {
  const r = requireDesenho(room, 'drawing');
  if (playerId === r.currentPlayerId) throw new AppError('Estás a desenhar — não podes adivinhar.');
  const player = room.players.get(playerId);
  if (!player || !player.connected) throw new AppError('Jogador inválido.');
  const clean = sanitizeText(text, 40);
  if (clean.length < 2) throw new AppError('Escreve um palpite.');

  const correct = normalize(clean) === normalize(r.word);
  r.guesses.push({ playerId, name: player.name, text: clean, correct });
  if (r.guesses.length > MAX_PALPITES) r.guesses.splice(0, r.guesses.length - MAX_PALPITES);
  if (correct) finishDesenho(room, playerId);
  return { correct };
}

/** Fecha a ronda: `winnerId` = quem acertou, ou null se o tempo acabou. */
export function finishDesenho(room, winnerId = null) {
  const g = room.game;
  const r = g.round;
  if (!r || r.substate === 'result') return r;
  const named = (id) => ({ id, name: nameOf(room, id) });
  const drinkers = [];

  if (winnerId) {
    // Safam-se quem acertou e quem desenhou; o resto da mesa bebe.
    for (const p of connectedOrder(room)) {
      if (p.id === winnerId || p.id === r.currentPlayerId) continue;
      drink(g, p.id, GOLOS_OUTROS);
      drinkers.push(named(p.id));
    }
  } else {
    // Ninguém acertou. Aqui a app SABE o resultado (os palpites são dados nela),
    // por isso não há votação a fazer — mas o preço é o mesmo dos outros jogos a
    // tempo: uma vida. Falhar contra o relógio tem de custar sempre o mesmo.
    r.efeitoVida = perdeVida(room, r.currentPlayerId, { motivo: 'ninguém acertou o desenho' });
    drinkers.push(named(r.currentPlayerId));
  }

  r.winnerId = winnerId;
  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    word: r.word, // agora sim, pública
    winner: winnerId ? named(winnerId) : null,
    drawer: named(r.currentPlayerId),
    drinkers,
    golos: winnerId ? GOLOS_OUTROS : GOLOS_DESENHISTA,
  };
  return r;
}

/** Tempo esgotado / desisti — marcado por quem desenha ou pelo host. */
export function desenhoGiveUp(room, playerId) {
  const r = requireDesenho(room, 'drawing');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== r.currentPlayerId))
    throw new AppError('Só quem desenha (ou o host) pode desistir.');
  return finishDesenho(room, null);
}

export function serializeDesenho(base, r) {
  base.substate = r.substate;
  base.seconds = r.seconds;
  base.startedAt = r.startedAt || null;
  base.guesses = r.guesses || [];
  base.result = r.result || null; // a palavra só aparece aqui, no fim
}
