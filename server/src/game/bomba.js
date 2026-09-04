// ----- Bomba-Relógio ---------------------------------------------------------
//
// O tipo que faltava ao catálogo: barulho físico.
//
// Dezoito tipos e quase todos se jogam com a mesa sentada a olhar para um ecrã.
// A Bomba é a única coisa que põe toda a gente a mexer ao mesmo tempo e a falar
// alto — passa-se o telemóvel (ou a vez) à volta, cada um diz um item do tema, e
// quem estiver com ela na mão quando rebentar perde uma vida.
//
// O PAVIO É SECRETO
//
// A duração está no servidor e nunca vai no payload. É a regra inteira do jogo:
// se a mesa soubesse quanto falta, isto era um cronómetro — e um cronómetro
// visível faz o contrário do que se quer, porque toda a gente espera pelo fim em
// vez de despachar. O que o cliente recebe é só "está a arder".
//
// QUEM SEGURA DEMAIS, REBENTA
//
// A explosão é verificada em cada passagem: se o pavio já acabou quando alguém
// passa, rebenta em quem a tinha. Não há tique do servidor a decidir sozinho —
// isso obrigava a timers por sala, e um timer que sobrevive a um reinício é uma
// classe de bugs que este projeto não precisa de ter. O auto-resolve trata do
// caso em que ninguém passa (`autoresolve.js`).

import { AppError } from '../errors.js';
import { connectedOrder, perdeVida, nameOf, shuffle } from './helpers.js';

// DOIS PAVIOS, E REBENTA O PRIMEIRO QUE ACABAR (playtest de 2026-09-04)
//
// Com pavio só de tempo, uma bomba chegou às QUARENTA passagens. Não era avaria:
// o pavio conta segundos e a tensão conta-se em VOLTAS À MESA. Uma mesa rápida
// despacha uma passagem por segundo e faz oito voltas dentro do mesmo pavio; uma
// mesa lenta faz duas. O mesmo número no servidor dava dois jogos diferentes — e
// o mais rápido, que devia ser o mais aflito, era o que arrastava.
//
// Por isso há agora um segundo pavio contado em PASSAGENS, e rebenta o primeiro
// que acabar. Assim as duas mesas jogam a mesma coisa: entre duas e três voltas
// e meia, seja qual for a velocidade a que falam.
//
// Ambos continuam SECRETOS, pela razão de sempre: uma contagem à vista faz a
// mesa esperar pelo fim em vez de despachar.

// Janela do pavio de tempo. O mínimo tem de dar tempo a duas ou três passagens
// (senão rebenta sempre no primeiro e não há jogo); o máximo é o ponto a partir
// do qual a mesa começa a desconfiar de que se esqueceram dela. Encurtado no
// mesmo playtest — 62s era um minuto inteiro a passar um telemóvel.
export const PAVIO_MIN_MS = 14000;
export const PAVIO_MAX_MS = 42000;

// Pavio de passagens, contado em VOLTAS à mesa (e não num número fixo): três
// voltas são três voltas com quatro pessoas ou com oito, e é isso que a mesa
// sente. O mínimo absoluto existe para uma mesa de três não ter uma bomba que
// rebenta antes de toda a gente lhe ter tocado uma vez.
export const VOLTAS_MIN = 2;
export const VOLTAS_MAX = 3.5;
const PASSAGENS_MIN = 5;

// Chão de tempo para o pavio das passagens. Uma mesa de três a despachar uma
// passagem por segundo esgotava as voltas em seis segundos — a carta mal
// aparecia e já tinha rebentado, o que não é uma bomba aflita, é um susto sem
// jogo. Abaixo disto só o relógio pode rebentar (e o mínimo dele é maior),
// portanto na prática nenhuma bomba dura menos do que isto.
const TEMPO_MINIMO_MS = 12000;

export function setupBomba(round, prompt, room) {
  round.tema = prompt?.text || 'Marcas de cerveja';
  // Inteiro, e não o float que o `random` dá: `acesaEm` é calculado a partir de
  // `Date.now()` (na ordem dos 1e12) e um pavio fracionário perdia os bits de
  // baixo na subtração, deixando o "já rebentou?" a falhar por milésimos —
  // milésimos que, num tique de bots, davam voltas infinitas.
  round.pavioMs = Math.round(PAVIO_MIN_MS + Math.random() * (PAVIO_MAX_MS - PAVIO_MIN_MS)); // SERVER-SIDE
  round.acesaEm = Date.now();
  round.holderId = round.currentPlayerId;
  round.passagens = 0;
  round.ordem = shuffle(connectedOrder(room).map((p) => p.id)); // não é a ordem da mesa
  // O segundo pavio, também SERVER-SIDE: quantas passagens esta bomba aguenta.
  const naMesa = Math.max(2, round.ordem.length);
  round.pavioPassagens = Math.max(
    PASSAGENS_MIN,
    Math.round((VOLTAS_MIN + Math.random() * (VOLTAS_MAX - VOLTAS_MIN)) * naMesa)
  );
  round.substate = 'a_arder'; // a_arder → rebentou
  round.result = null;
}

function requireBomba(room) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'bomba' || !r) throw new AppError('Não há bomba nenhuma.');
  return r;
}

function rebenta(room, r, quemId, porque = 'tempo') {
  const efeito = perdeVida(room, quemId, { motivo: 'ficou com a bomba', emoji: '💣' });
  r.substate = 'rebentou';
  r.status = 'resolved';
  r.result = {
    quemId,
    quemName: nameOf(room, quemId),
    passagens: r.passagens,
    porque, // 'tempo' | 'passagens' — qual dos dois pavios acabou primeiro
    // Só AGORA se revela quanto era, e só o pavio que REBENTOU: dizer "o pavio
    // era de 40s" numa bomba que rebentou às 12 passagens seria mentir à mesa
    // sobre o que a matou.
    segundos: porque === 'tempo' ? Math.round(r.pavioMs / 1000) : null,
  };
  return { round: r, rebentou: true, efeito };
}

/**
 * Passa a bomba ao próximo. Se o pavio já tinha acabado, rebenta em quem a
 * segurava — a verificação é aqui, no momento em que ele larga.
 */
export function bombaPassa(room, playerId) {
  const r = requireBomba(room);
  if (r.substate !== 'a_arder') throw new AppError('A bomba já rebentou.');
  if (r.holderId !== playerId) throw new AppError('A bomba não está contigo.');

  // Rebenta o primeiro dos dois pavios a acabar. A verificação é aqui, no
  // momento em que ele larga: quem segura demais é quem leva.
  const decorrido = Date.now() - r.acesaEm;
  if (decorrido >= r.pavioMs) return rebenta(room, r, playerId, 'tempo');
  if (r.passagens >= r.pavioPassagens && decorrido >= TEMPO_MINIMO_MS) {
    return rebenta(room, r, playerId, 'passagens');
  }

  const vivos = r.ordem.filter((id) => {
    const p = room.players.get(id);
    return p && p.connected && !p.eliminated;
  });
  if (vivos.length < 2) return rebenta(room, r, playerId); // ficou sozinho com ela
  const i = vivos.indexOf(playerId);
  r.holderId = vivos[(i + 1) % vivos.length];
  r.passagens += 1;
  return { round: r, rebentou: false };
}

/** O pavio já acabou? (para o auto-resolve rebentar em quem a tem na mão). */
export function bombaExpirou(room) {
  const r = room.game?.round;
  if (!r || room.game.phase !== 'bomba' || r.substate !== 'a_arder') return false;
  return Date.now() - r.acesaEm >= r.pavioMs;
}

/** Auto-resolve: ninguém passou e o pavio acabou. Rebenta em quem a segurava. */
export function bombaEstoira(room) {
  const r = requireBomba(room);
  if (r.substate !== 'a_arder') return null;
  return rebenta(room, r, r.holderId);
}

/** Os dois pavios (`pavioMs`, `pavioPassagens`) NUNCA saem daqui — são a regra
 *  inteira do jogo. O `passagens` sai, porque é o que já aconteceu à vista de
 *  toda a mesa; quantas faltam é que não. */
export function serializeBomba(base, r) {
  base.tema = r.tema;
  base.holderId = r.holderId;
  base.passagens = r.passagens;
  base.substate = r.substate;
  base.result = r.result || null;
  return base;
}
