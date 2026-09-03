// F&D — auto-resolução de rondas encravadas.
//
// Os bots provam que a MÁQUINA não encrava. Numa festa quem encrava são as
// PESSOAS: alguém vai à casa de banho a meio da vez, o telemóvel bloqueia, o
// grupo distrai-se a discutir a ronda anterior. Sem isto, o jogo fica parado à
// espera de um toque que nunca chega e o host tem de andar a saltar vezes.
//
// Como funciona: em vez de espalhar prazos por todos os motores, este módulo
// tira uma "assinatura" do estado da sala. Enquanto a assinatura mudar, há
// progresso e o relógio reinicia. Se ficar igual tempo a mais, resolve-se a
// ronda pela via mais justa e segue-se (nunca se fica pendurado).
//
// A resolução por defeito é sempre a que o jogo já usava como penalização
// (quem não age, bebe) — não se inventa castigo novo.
//
// Desliga-se com AUTO_RESOLVE_MS=0.

import * as game from './game.js';
import * as board from './board.js';
import * as tournament from './tournament.js';
import { pushFeed } from './feed.js';
import { log } from './log.js';

const DEFAULT_MS = Number(process.env.AUTO_RESOLVE_MS ?? 75_000);
// Fases em que a mesa está mesmo à espera de UMA pessoa → prazo mais curto.
const CURTO_MS = Math.round(DEFAULT_MS * 0.6);
const CURTAS = new Set(['prompt', 'choice', 'wheel', 'cascata', 'reacao']);

export const ENABLED = DEFAULT_MS > 0;

/** Última assinatura vista por sala (não segura a sala em memória). */
const marks = new WeakMap();

/** Muda sempre que ALGUÉM faz alguma coisa — é a definição de "houve progresso". */
function signature(room) {
  const parts = [room.status, room.mode];
  const g = room.game;
  if (g) {
    parts.push(
      'g', g.phase, g.roundCount,
      g.round?.id, g.round?.substate, g.round?.status,
      Object.keys(g.round?.answers || {}).length,
      Object.keys(g.round?.guesses || {}).length,
      (g.round?.stopped || []).length,
      Object.keys(g.round?.votes || g.round?.rps || {}).length
    );
  }
  const b = room.board;
  if (b) parts.push('b', b.turnIndex, b.turnCount, b.pending?.kind, Object.keys(b.pending?.bids || {}).length);
  const t = room.tournament;
  if (t) parts.push('t', t.phase, t.roundIdx, t.duel?.id, Object.keys(t.duel?.actions || t.duel?.votes || {}).length);
  return parts.join('|');
}

function timeoutFor(room) {
  if (room.mode === 'wheel' && CURTAS.has(room.game?.phase)) return CURTO_MS;
  return DEFAULT_MS;
}

/**
 * Corre um "varrimento" a uma sala. Devolve `true` se mexeu em alguma coisa (o
 * chamador faz broadcast). Nunca lança.
 */
export async function sweep(room) {
  if (!ENABLED || !room || room.paused) return false;
  if (room.status !== 'playing') return false;

  const sig = signature(room);
  const mark = marks.get(room);
  if (!mark || mark.sig !== sig) {
    marks.set(room, { sig, since: Date.now() });
    return false;
  }
  if (Date.now() - mark.since < timeoutFor(room)) return false;

  let acted = false;
  try {
    acted = await resolve(room);
  } catch (err) {
    log.warn('auto-resolve falhou, abandono a ronda', { code: room.code, message: err?.message });
    acted = abandon(room);
  }
  // Conte ou não como progresso, o relógio recomeça (senão dispara em catadupa).
  marks.set(room, { sig: signature(room), since: Date.now() });
  return acted;
}

async function resolve(room) {
  if (room.mode === 'board' && room.board) return resolveBoard(room);
  if (room.mode === 'tournament' && room.tournament) return await resolveTournament(room);
  if (room.game) return await resolveWheel(room);
  return false;
}

// ----- Roda -----------------------------------------------------------------

async function resolveWheel(room) {
  const g = room.game;
  const r = g.round;
  const cur = g.currentPlayerId;
  const outros = (id) => [...room.players.values()].filter((p) => p.connected && !p.eliminated && p.id !== id);

  // A herança tranca-se em cima de qualquer fase: quem saiu já não está a olhar
  // para o telemóvel (às vezes já nem está na sala), e uma conta pendurada à
  // espera dele ficava para sempre. Sorteia-se e segue.
  if (g.heranca) {
    game.escolheHerdeiro(room, g.heranca.deId, null);
    pushFeed(room, '⏱️', 'Ninguém escolheu — a conta foi ao ar.');
    return true;
  }

  switch (g.phase) {
    case 'prep':
    case 'gameover':
      return false; // é o host que decide quando avançar

    case 'wheel': {
      // Ninguém girou a roda → gira-se por ele (menos punitivo do que saltar).
      const round = await game.spinWheel(room, cur);
      pushFeed(room, '⏱️', 'A roda girou sozinha — ninguém estava a ver.');
      return round ? true : false;
    }

    case 'prompt':
      // Dobro ou Nada: se ele dobrou e a mesa não votou, fecha-se com quem votou
      // (a mesma regra dos outros vereditos — o silêncio favorece quem atuou).
      if (r?.dobro?.aberto) {
        game.fechaVeredito(room);
        pushFeed(room, '⏱️', 'Fechou-se o veredito do dobro com quem votou a tempo.');
        return true;
      }
      if (r?.dobro && r.status === 'resolved') return continueOrAbandon(room);
      // Não responder é o mesmo que recusar: é a regra do jogo, não um castigo novo.
      if (r?.needsBuddy && !r.buddyId) game.chooseBuddy(room, r.currentPlayerId, outros(r.currentPlayerId)[0]?.id);
      pushFeed(room, '⏱️', 'Tempo esgotado — conta como recusa.');
      game.resolveAction(room, r.currentPlayerId, 'refuse');
      return true;

    case 'choice':
      if (r?.status !== 'resolved') {
        if (r?.needsBuddy && !r.buddyId) game.chooseBuddy(room, r.currentPlayerId, outros(r.currentPlayerId)[0]?.id);
        game.chooseOption(room, r.currentPlayerId, Math.random() < 0.5 ? 0 : 1);
        pushFeed(room, '⏱️', 'Tempo esgotado — a escolha foi ao ar.');
        return true;
      }
      return continueOrAbandon(room);

    case 'grupo':
      if (!r?.revealed) {
        game.grupoForceReveal(room); // revela com quem respondeu
        pushFeed(room, '⏱️', 'Fechou-se a votação com quem respondeu a tempo.');
        return true;
      }
      return continueOrAbandon(room);

    case 'cascata':
      if (r?.substate === 'ready') { game.cascataStart(room, r.currentPlayerId); return true; }
      if (r?.substate === 'running') {
        const next = r.order[r.stopped.length];
        if (next) { game.cascataStop(room, next.id); return true; }
      }
      return continueOrAbandon(room);

    case 'desenho':
      if (r?.substate === 'ready') { game.desenhoStart(room, r.currentPlayerId); return true; }
      if (r?.substate === 'drawing') {
        game.finishDesenho(room, null); // tempo esgotado → quem desenhou bebe
        pushFeed(room, '⏱️', 'Ninguém adivinhou a tempo.');
        return true;
      }
      return continueOrAbandon(room);

    case 'reacao':
      if (r?.substate === 'racing') { game.resolveReacaoRoda(room); return true; }
      return continueOrAbandon(room);

    // Jogos a tempo: ninguém marcou o fim → marca-se; ninguém votou o veredito →
    // fecha-se com quem votou (a mesma regra dos jogos de grupo). O empate e a
    // votação vazia favorecem quem atuou, por isso o silêncio nunca tira vidas.
    case 'relampago':
      if (r?.substate === 'ready') { game.relampagoStart(room, r.currentPlayerId); return true; }
      if (r?.substate === 'running') { game.relampagoTimeUp(room, r.currentPlayerId); return true; }
      if (r?.substate === 'veredito') {
        game.fechaVeredito(room);
        pushFeed(room, '⏱️', 'Fechou-se o veredito com quem votou a tempo.');
        return true;
      }
      return continueOrAbandon(room);

    case 'mimica':
      if (r?.substate === 'ready') { game.mimicaStart(room, r.currentPlayerId); return true; }
      if (r?.substate === 'running') { game.mimicaTimeUp(room, r.currentPlayerId); return true; }
      if (r?.substate === 'veredito') {
        game.fechaVeredito(room);
        pushFeed(room, '⏱️', 'Fechou-se o veredito com quem votou a tempo.');
        return true;
      }
      return continueOrAbandon(room);

    case 'roleta':
      if (r?.substate === 'asking') { game.roletaAnswer(room, r.currentPlayerId); return true; }
      return continueOrAbandon(room);

    // ----- Tipos da camada 3 --------------------------------------------------
    // A regra é a mesma de sempre: fecha-se com o que já se sabe, e o silêncio
    // nunca inventa um castigo que a mesa não decidiu.

    case 'bomba':
      // Ninguém passou e o pavio acabou → rebenta em quem a tinha na mão. É a
      // regra do jogo, não um castigo do auto-resolve: quem segura, leva.
      if (r?.substate === 'a_arder') {
        game.bombaEstoira(room);
        pushFeed(room, '💣', 'Ninguém passou a tempo. BUM.');
        return true;
      }
      return continueOrAbandon(room);

    case 'leilao':
      if (r?.substate === 'licitar') {
        game.fechaLeilao(room);
        pushFeed(room, '⏱️', 'O leilão fechou com quem licitou a tempo.');
        return true;
      }
      return continueOrAbandon(room);

    case 'sincronia':
      if (r?.substate === 'responder') {
        game.fechaSincronia(room);
        pushFeed(room, '⏱️', 'Tempo esgotado — quem não respondeu conta como divergência.');
        return true;
      }
      return continueOrAbandon(room);

    case 'detetor':
      // Ele nem marcou se era verdade → não se decide por ele; passa-se a vez.
      if (r?.substate === 'responder') return abandon(room);
      if (r?.substate === 'votar') {
        game.fechaDetetor(room);
        pushFeed(room, '⏱️', 'Fechou-se o detetor com quem votou a tempo.');
        return true;
      }
      return continueOrAbandon(room);

    case 'julgamento':
      if (r?.substate === 'defesa') {
        game.julgamentoAoVoto(room, r.reuId);
        pushFeed(room, '⏱️', 'Acabou o tempo de defesa — ao voto.');
        return true;
      }
      if (r?.substate === 'votar') {
        game.fechaVeredito(room);
        pushFeed(room, '⏱️', 'O júri decidiu com os votos que houve.');
        return true;
      }
      return continueOrAbandon(room);

    case 'contrato':
      // Um pacto que entra em vigor por silêncio não é um pacto: quem não
      // assinou, recusou. O `contrato.fecha` já trata disso.
      if (r?.substate === 'escolher') return abandon(room);
      if (r?.substate === 'assinar') {
        game.contratoExpira(room);
        pushFeed(room, '⏱️', 'O tempo de assinar acabou — quem não decidiu, recusou.');
        return true;
      }
      return continueOrAbandon(room);

    case 'duelo':
      if (r?.substate === 'calling') {
        game.dueloCall(room, r.currentPlayerId, Math.random() < 0.5 ? 'cara' : 'coroa');
        return true;
      }
      if (r?.substate === 'duelling') {
        const lados = [r.currentPlayerId, r.opponentId];
        game.dueloResult(room, r.currentPlayerId, lados[Math.random() < 0.5 ? 0 : 1]);
        return true;
      }
      return continueOrAbandon(room);

    case 'guessing':
      if (!r?.revealed) { game.revealResult(room, cur); return true; }
      return continueOrAbandon(room);

    case 'intrigas':
      if (r?.substate === 'choosing') {
        const alvo = outros(r.currentPlayerId)[0];
        if (alvo) { game.chooseTarget(room, r.currentPlayerId, alvo.id); return true; }
        return abandon(room);
      }
      if (r?.substate === 'rps') {
        const jogadas = ['pedra', 'papel', 'tesoura'];
        for (const id of [r.currentPlayerId, r.accusedId]) {
          if (!r.rps[id]) { game.submitRps(room, id, jogadas[Math.floor(Math.random() * 3)]); return true; }
        }
      }
      return continueOrAbandon(room);

    default:
      // Piramide e Vasco têm demasiados sub-passos para adivinhar a intenção do
      // grupo — se encravarem, encerra-se a ronda e passa-se a vez.
      return abandon(room);
  }
}

function continueOrAbandon(room) {
  try {
    game.continueRound(room, room.game.currentPlayerId);
    return true;
  } catch {
    return abandon(room);
  }
}

/** Última linha de defesa: fecha a ronda e passa a vez. */
function abandon(room) {
  if (!room.game) return false;
  pushFeed(room, '⏭️', 'Ronda encravada — passou-se a vez.');
  game.abandonRound(room);
  return true;
}

// ----- Tabuleiro / Torneio ---------------------------------------------------

function resolveBoard(room) {
  pushFeed(room, '⏱️', 'Tempo esgotado no tabuleiro — passou-se a vez.');
  board.boardAutoAdvance(room);
  return true;
}

async function resolveTournament(room) {
  pushFeed(room, '⏱️', 'Duelo sem resposta — resolvido à sorte.');
  await tournament.tournamentAutoResolve(room);
  return true;
}
