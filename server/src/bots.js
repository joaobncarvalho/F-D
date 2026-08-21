// F&D — bots de PLAYTEST (ferramenta de dev, desligada por defeito).
//
// Objetivo: o João poder testar o jogo SOZINHO, sem juntar vários telemóveis.
// Os bots enchem a sala e jogam as SUAS obrigações no modo Roda (girar, aceitar,
// votar, adivinhar, RPS, pirâmide, vasco…), à vez, ao ritmo de um "tick".
//
// Gating: só corre se ENABLE_DEV_BOTS=1 no ambiente. NUNCA em produção normal.
// Autoridade continua no servidor — os bots chamam as MESMAS funções do game.js
// que um cliente humano chamaria. Modo Tabuleiro fica como TODO (ver fim).

import * as game from './game.js';
import { log } from './log.js';

export const ENABLED = process.env.ENABLE_DEV_BOTS === '1';

const rand = () => Math.random();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function players(room) {
  return [...room.players.values()];
}
function activeOthers(room, id) {
  return players(room).filter((p) => p.connected && !p.eliminated && p.id !== id);
}
function connectedOthers(room, id) {
  return players(room).filter((p) => p.connected && p.id !== id);
}

const BOT_QUESTIONS = [
  'Qual foi a coisa mais parva que fizeste bêbado/a?',
  'Quem aqui beijarias se fosses obrigado/a?',
  'Já mentiste a alguém nesta sala? A quem?',
  'Qual é o teu maior arrependimento de sempre?',
];
const BOT_SECRETS = [
  'Uma vez fingi estar doente para faltar a um casamento.',
  'Já stalkei o/a ex às 3 da manhã.',
  'Tenho um talento secreto que ninguém aqui conhece.',
  'Comi comida do chão e não contei a ninguém.',
];

/**
 * Faz avançar os bots UMA jogada (no máximo uma ação por chamada, para animar a
 * ritmo humano). Devolve `true` se algum bot agiu (o chamador faz broadcast).
 * `hooks.onSpin(round)` é chamado quando um bot gira a roda (para o servidor
 * anunciar o tipo + entregar mãos/papéis privados aos HUMANOS).
 */
export async function driveBots(room, hooks = {}) {
  if (!room?.game) return false; // Tabuleiro: TODO (ver fim do ficheiro)
  const g = room.game;
  const bots = players(room).filter((p) => p.isBot && p.connected && !p.eliminated);
  if (!bots.length) return false;

  try {
    // PREP: cada bot submete 1 pergunta + 1 segredo (uma vez).
    if (g.phase === 'prep') {
      for (const bot of bots) {
        if (!bot._botAskedQ) {
          const target = pick(connectedOthers(room, bot.id));
          if (target) {
            game.addQuestion(room, bot.id, target.id, pick(BOT_QUESTIONS));
            bot._botAskedQ = true;
            return true;
          }
        }
        if (!bot._botAskedS) {
          game.addSecret(room, bot.id, pick(BOT_SECRETS));
          bot._botAskedS = true;
          return true;
        }
      }
      return false;
    }

    // WHEEL: se for a vez de um bot, ele gira.
    if (g.phase === 'wheel') {
      const cur = room.players.get(g.currentPlayerId);
      if (cur?.isBot) {
        const round = await game.spinWheel(room, cur.id);
        hooks.onSpin?.(round);
        return true;
      }
      return false;
    }

    // PROMPT (Boca Calada / Desafio): bot escolhe buddy se preciso, depois aceita/recusa.
    if (g.phase === 'prompt') {
      const r = g.round;
      const cur = room.players.get(r.currentPlayerId);
      if (cur?.isBot) {
        if (r.needsBuddy && !r.buddyId) {
          const b = pick(connectedOthers(room, cur.id));
          if (b) { game.chooseBuddy(room, cur.id, b.id); return true; }
        }
        game.resolveAction(room, cur.id, rand() < 0.75 ? 'accept' : 'refuse');
        return true;
      }
      return false;
    }

    // CHOICE (Isto ou Aquilo): escolhe uma opção e continua.
    if (g.phase === 'choice') {
      const r = g.round;
      const cur = room.players.get(r.currentPlayerId);
      if (cur?.isBot) {
        if (r.needsBuddy && !r.buddyId) {
          const b = pick(connectedOthers(room, cur.id));
          if (b) { game.chooseBuddy(room, cur.id, b.id); return true; }
        }
        if (r.status !== 'resolved') { game.chooseOption(room, cur.id, rand() < 0.5 ? 0 : 1); return true; }
        game.continueRound(room, cur.id);
        return true;
      }
      return false;
    }

    // INTRIGAS: choosing → escolher alvo; rps → jogar; reveal → continuar.
    if (g.phase === 'intrigas') {
      const r = g.round;
      if (r.substate === 'choosing') {
        const cur = room.players.get(r.currentPlayerId);
        if (cur?.isBot) {
          const t = pick(activeOthers(room, cur.id));
          if (t) { game.chooseTarget(room, cur.id, t.id); hooks.onIntrigasTarget?.(g.round); return true; }
        }
      } else if (r.substate === 'rps') {
        for (const id of [r.currentPlayerId, r.accusedId]) {
          const p = room.players.get(id);
          if (p?.isBot && !r.rps[id]) { game.submitRps(room, id, pick(['pedra', 'papel', 'tesoura'])); return true; }
        }
      } else if (r.substate === 'reveal') {
        const cur = room.players.get(r.currentPlayerId);
        if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      }
      return false;
    }

    // SEGREDOS: bots adivinham; depois o spinner (se bot) continua.
    if (g.phase === 'guessing') {
      const r = g.round;
      if (!r.revealed) {
        for (const bot of bots) {
          if (bot.id !== r.secretAuthorId && r.guesses[bot.id] === undefined) {
            const t = pick(activeOthers(room, bot.id));
            if (t) { game.castGuess(room, bot.id, t.id); return true; }
          }
        }
      } else {
        const cur = room.players.get(g.currentPlayerId);
        if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      }
      return false;
    }

    // PIRAMIDE: memorize → pronto; flipping → virar+atribuir/passar; challenge →
    // responder; resolved → próxima; summary → continuar.
    if (g.phase === 'piramide') {
      const r = g.round;
      if (r.substate === 'memorize') {
        for (const bot of bots) if (!r.ready[bot.id]) { game.piramideReady(room, bot.id); return true; }
      } else if (r.substate === 'flipping') {
        const f = room.players.get(r.currentPlayerId);
        if (f?.isBot) {
          if (!r.flippedCard) { game.piramideFlip(room, f.id); return true; }
          const t = pick(connectedOthers(room, f.id));
          if (t && rand() < 0.6) { game.piramideAssign(room, f.id, t.id); return true; }
          game.piramidePass(room, f.id);
          return true;
        }
      } else if (r.substate === 'challenge') {
        const t = room.players.get(r.assign?.targetId);
        if (t?.isBot) { game.piramideRespond(room, t.id, rand() < 0.5 ? 'aceitar' : 'desconfiar'); return true; }
      } else if (r.substate === 'resolved') {
        const f = room.players.get(r.currentPlayerId);
        if (f?.isBot) { game.piramideNext(room, f.id); return true; }
      } else if (r.substate === 'summary') {
        const cur = room.players.get(g.currentPlayerId);
        if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      }
      return false;
    }

    // VASCO: reveal → começar pistas; clues → dar pista; voting → votar;
    // redemption → adivinhar; result → continuar.
    if (g.phase === 'vasco') {
      const r = g.round;
      if (r.substate === 'reveal') {
        const cur = room.players.get(g.currentPlayerId);
        if (cur?.isBot) { game.vascoStartClues(room, cur.id); return true; }
      } else if (r.substate === 'clues') {
        const p = room.players.get(r.clueOrder[r.clueIdx]);
        if (p?.isBot) { game.vascoClueDone(room, p.id); return true; }
      } else if (r.substate === 'voting') {
        for (const bot of bots) {
          if (r.votes[bot.id] === undefined) {
            const t = pick(activeOthers(room, bot.id));
            if (t) { game.vascoVote(room, bot.id, t.id); return true; }
          }
        }
      } else if (r.substate === 'redemption') {
        const acc = room.players.get(r.accusedId);
        if (acc?.isBot) { game.vascoRedeem(room, acc.id, pick(r.board.words)); return true; }
      } else if (r.substate === 'result') {
        const cur = room.players.get(g.currentPlayerId);
        if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      }
      return false;
    }
  } catch (err) {
    // Um bot numa jogada inválida (corrida de estado) não pode partir o tick.
    log.warn('bot: jogada ignorada', { phase: g.phase, message: err?.message });
    return false;
  }

  return false;
}

// TODO(board): bots para o Modo Tabuleiro (pawn/roll/advance/resolve/blackjack/
// beerpong/gamble/evento). O Modo Roda é a prioridade de playtest; o Tabuleiro
// consegue-se testar avançando um peão, por isso fica como melhoria seguinte.
