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
import * as board from './board.js';
import * as tournament from './tournament.js';
import { PAWNS } from './board.js';
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
  if (room?.mode === 'board' && room.board) return driveBoardBots(room);
  if (room?.mode === 'tournament' && room.tournament) return driveTournamentBots(room);
  if (!room?.game) return false;
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

    // RELÂMPAGO / MÍMICA: arrancar o cronómetro → dar o tempo por terminado →
    // a MESA vota o veredito → continuar. Os bots votam como plateia; se a mesa
    // for só de bots, votam todos e a votação fecha sozinha.
    if (g.phase === 'relampago' || g.phase === 'mimica') {
      const r = g.round;
      const cur = room.players.get(r.currentPlayerId);
      const isRelampago = g.phase === 'relampago';

      if (r.substate === 'veredito') {
        // Vota o primeiro bot que ainda não votou (um por tique, para se ver a
        // votação a encher em vez de aparecer feita).
        const porVotar = [...room.players.values()].find(
          (p) => p.isBot && p.connected && !p.eliminated
            && !r.veredito.atores.includes(p.id) && !r.veredito.votos[p.id]
        );
        if (!porVotar) return false;
        game.votaVeredito(room, porVotar.id, rand() < 0.6 ? 'sim' : 'nao');
        return true;
      }

      if (!cur?.isBot) return false;
      if (r.substate === 'ready') {
        if (isRelampago) game.relampagoStart(room, cur.id);
        else game.mimicaStart(room, cur.id);
        return true;
      }
      if (r.substate === 'running') {
        if (isRelampago) game.relampagoTimeUp(room, cur.id);
        else game.mimicaTimeUp(room, cur.id);
        return true;
      }
      game.continueRound(room, cur.id);
      return true;
    }

    // ROLETA RUSSA: passa umas quantas vezes e acaba por responder.
    if (g.phase === 'roleta') {
      const r = g.round;
      const cur = room.players.get(r.currentPlayerId);
      if (!cur?.isBot) return false;
      if (r.substate === 'asking') {
        if (rand() < 0.35) await game.roletaPass(room, cur.id);
        else game.roletaAnswer(room, cur.id);
        return true;
      }
      game.continueRound(room, cur.id);
      return true;
    }

    // DUELO 1v1: um dos duelistas (ou o host) marca o vencedor; depois continua.
    if (g.phase === 'duelo') {
      const r = g.round;
      const cur = room.players.get(r.currentPlayerId);
      if (r.substate === 'calling') {
        // Cara ou coroa é lançado pela app — o bot só tem de pedir uma face.
        if (cur?.isBot) { game.dueloCall(room, cur.id, rand() < 0.5 ? 'cara' : 'coroa'); return true; }
        return false;
      }
      if (r.substate === 'duelling') {
        const marker = [r.currentPlayerId, r.opponentId].find((id) => room.players.get(id)?.isBot);
        if (marker) {
          game.dueloResult(room, marker, rand() < 0.5 ? r.currentPlayerId : r.opponentId);
          return true;
        }
        return false;
      }
      if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      return false;
    }

    // GRUPO (Eu Nunca / Mais Provável / Termómetro / Quem Disse): todos respondem
    // e o reveal é automático; depois o spinner (se bot) continua.
    if (g.phase === 'grupo') {
      const r = g.round;
      if (!r.revealed) {
        const voters = game.grupoVoters(room).filter((p) => p.isBot);
        for (const bot of voters) {
          if (r.answers[bot.id] !== undefined) continue;
          let value;
          if (r.gameTypeKey === 'eu_nunca') value = rand() < 0.5 ? 'ja' : 'nunca';
          else if (r.gameTypeKey === 'termometro') value = Math.floor(rand() * 11);
          else {
            const t = pick(activeOthers(room, bot.id));
            if (!t) continue;
            value = t.id;
          }
          game.grupoAnswer(room, bot.id, value);
          return true;
        }
        return false;
      }
      const cur = room.players.get(g.currentPlayerId);
      if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      return false;
    }

    // CASCATA: arrancar → parar por ORDEM (o servidor não deixa furar a fila).
    if (g.phase === 'cascata') {
      const r = g.round;
      const cur = room.players.get(r.currentPlayerId);
      if (r.substate === 'ready') {
        if (cur?.isBot) { game.cascataStart(room, cur.id); return true; }
        return false;
      }
      if (r.substate === 'running') {
        const next = room.players.get(r.order[r.stopped.length]?.id);
        if (next?.isBot) { game.cascataStop(room, next.id); return true; }
        return false;
      }
      if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      return false;
    }

    // DESENHO: quem desenha arranca; os outros palpitam (metade das vezes acertam,
    // porque um bot não sabe desenhar); se ninguém acerta, o desenhista desiste.
    if (g.phase === 'desenho') {
      const r = g.round;
      const drawer = room.players.get(r.currentPlayerId);
      if (r.substate === 'ready') {
        if (drawer?.isBot) { game.desenhoStart(room, drawer.id); return true; }
        return false;
      }
      if (r.substate === 'drawing') {
        const guesser = bots.find((b) => b.id !== r.currentPlayerId);
        if (guesser && r.guesses.length < 3) {
          game.desenhoGuess(room, guesser.id, rand() < 0.5 ? r.word : 'uma cerveja');
          return true;
        }
        if (drawer?.isBot) { game.desenhoGiveUp(room, drawer.id); return true; }
        return false;
      }
      const cur = room.players.get(g.currentPlayerId);
      if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
      return false;
    }

    // REAÇÃO: espera pelo GO e carrega. Numa sala SÓ de bots (playtest/testes) não
    // se espera de verdade — adianta-se o relógio, senão o tick ficava parado.
    if (g.phase === 'reacao') {
      const r = g.round;
      if (r.substate === 'racing') {
        const semHumanos = players(room).every((p) => p.isBot || !p.connected);
        if (semHumanos && Date.now() < r.reaction.goAt) r.reaction.goAt = Date.now();
        if (Date.now() < r.reaction.goAt) return false; // ainda não é o GO
        const next = bots.find(
          (b) => r.reaction.taps[b.id] === undefined && !r.reaction.falseStarts.includes(b.id)
        );
        if (next) { game.reacaoTap(room, next.id); return true; }
        return false;
      }
      const cur = room.players.get(g.currentPlayerId);
      if (cur?.isBot) { game.continueRound(room, cur.id); return true; }
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

/**
 * Conduz os bots no Modo Torneio: arrancar duelos, jogar o duelo quando é com
 * eles, votar como espetadores e fechar o resultado. Uma ação por chamada.
 */
async function driveTournamentBots(room) {
  const t = room.tournament;
  const bots = players(room).filter((p) => p.isBot && p.connected);
  if (!bots.length || t.phase === 'over') return false;

  try {
    if (t.phase === 'bracket') {
      const starter = bots[0];
      await tournament.tournamentNext(room, starter.id);
      return true;
    }

    const d = t.duel;
    if (!d) return false;

    if (d.substate === 'daring') {
      for (const id of [d.aId, d.bId]) {
        const p = room.players.get(id);
        if (p?.isBot && !d.actions[id]) {
          tournament.tournamentAction(room, id, rand() < 0.7 ? 'accept' : 'refuse');
          return true;
        }
      }
      return false;
    }
    if (d.substate === 'choosing') {
      for (const id of [d.aId, d.bId]) {
        const p = room.players.get(id);
        if (p?.isBot && d.actions[id] === undefined) {
          tournament.tournamentChoose(room, id, rand() < 0.5 ? 0 : 1);
          return true;
        }
      }
      return false;
    }
    // Cara ou Coroa: o duelista sorteado pede uma face e a app lança a moeda.
    if (d.substate === 'calling') {
      const quem = room.players.get(d.aId);
      if (quem?.isBot) { tournament.tournamentCall(room, d.aId, rand() < 0.5 ? 'cara' : 'coroa'); return true; }
      return false;
    }
    // Apostas dos espetadores: quem não está a duelar aposta (também os eliminados).
    for (const bot of bots) {
      if ([d.aId, d.bId].includes(bot.id)) continue;
      if (d.bets[bot.id] || d.substate === 'result') continue;
      tournament.tournamentBet(room, bot.id, rand() < 0.5 ? d.aId : d.bId);
      return true;
    }

    // Duelo de Reação: espera pelo GO (numa sala só de bots, adianta-o).
    if (d.substate === 'racing') {
      const semHumanos = players(room).every((p) => p.isBot || !p.connected);
      if (semHumanos && Date.now() < d.reaction.goAt) d.reaction.goAt = Date.now();
      if (Date.now() < d.reaction.goAt) return false;
      for (const id of [d.aId, d.bId]) {
        const p = room.players.get(id);
        if (p?.isBot && d.reaction.taps[id] === undefined && !d.reaction.falseStarts.includes(id)) {
          tournament.tournamentTap(room, id);
          return true;
        }
      }
      return false;
    }
    if (d.substate === 'judging') {
      for (const bot of bots) {
        if (bot.id !== d.aId && bot.id !== d.bId && !d.votes[bot.id]) {
          tournament.tournamentVote(room, bot.id, rand() < 0.5 ? d.aId : d.bId);
          return true;
        }
      }
      return false;
    }
    if (d.substate === 'result') {
      const closer = [d.aId, d.bId].find((id) => room.players.get(id)?.isBot);
      // Pode reabrir a final (série à melhor de 3) → devolve promessa nesse caso.
      if (closer) { await tournament.tournamentContinue(room, closer); return true; }
      return false;
    }
  } catch (err) {
    log.warn('bot (torneio): jogada ignorada', { phase: t?.phase, message: err?.message });
    return false;
  }
  return false;
}

/**
 * Conduz os bots no Modo Tabuleiro (uma ação por chamada, ao ritmo do tick):
 * escolher peão → lançar dado da ordem → na sua vez, resolver a casa pendente
 * (mini/gamble/blackjack/beerpong/??) ou avançar 1–3 casas.
 */
async function driveBoardBots(room) {
  const b = room.board;
  const bots = players(room).filter((p) => p.isBot && p.connected);
  if (!bots.length) return false;

  try {
    // Escolher peão (fase pawn): cada bot pega num peão livre.
    if (b.phase === 'pawn') {
      for (const bot of bots) {
        if (!b.players[bot.id]?.pawn) {
          const taken = new Set(Object.values(b.players).map((pl) => pl.pawn).filter(Boolean));
          const free = PAWNS.find((pw) => !taken.has(pw));
          if (free) { board.pickPawn(room, bot.id, free); return true; }
        }
      }
      return false;
    }

    // Lançar o dado da ordem (fase order).
    if (b.phase === 'order') {
      for (const bot of bots) {
        if (b.dice[bot.id] == null) { board.rollOrder(room, bot.id); return true; }
      }
      return false;
    }

    // Corrida (fase playing): só age se for a vez de um bot.
    if (b.phase === 'playing') {
      // Leilão: licitam TODOS (não só quem está à vez) — senão o leilão encravava.
      if (b.pending?.kind === 'auction') {
        for (const bot of bots) {
          if (b.players[bot.id] && b.pending.bids[bot.id] == null) {
            board.boardBid(room, bot.id, Math.floor(rand() * (b.pending.maxBid + 1)));
            return true;
          }
        }
        return false;
      }
      // Casa de Reação: carregam os DOIS duelistas, não só quem está à vez.
      // Numa sala só de bots adianta-se o GO (senão o tick ficava à espera).
      if (b.pending?.kind === 'reacao') {
        const reac = b.pending.reaction;
        const semHumanos = players(room).every((p) => p.isBot || !p.connected);
        if (semHumanos && Date.now() < reac.goAt) reac.goAt = Date.now();
        if (Date.now() < reac.goAt) return false;
        for (const id of [b.pending.playerId, b.pending.opponentId]) {
          const p = room.players.get(id);
          if (p?.isBot && reac.taps[id] === undefined && !reac.falseStarts.includes(id)) {
            board.boardReacao(room, id);
            return true;
          }
        }
        return false;
      }

      const cur = room.players.get(b.currentPlayerId);
      if (!cur?.isBot) return false;

      // Há casa pendente? Resolve-a primeiro.
      if (b.pending) {
        switch (b.pending.kind) {
          case 'mini':
            if (b.pending.variant === 'dare') board.boardResolve(room, cur.id, { action: rand() < 0.5 ? 'drink' : 'do' });
            else board.boardResolve(room, cur.id, { choice: rand() < 0.5 ? 0 : 1 });
            return true;
          case 'gamble':
            board.boardGamble(room, cur.id, rand() < 0.6); // aposta 60% das vezes
            return true;
          case 'blackjack':
            board.boardBlackjack(room, cur.id, 'stand'); // planta sempre (termina já)
            return true;
          case 'beerpong':
            board.boardBeerpong(room, cur.id, rand()); // força aleatória 0..1
            return true;
          case 'evento':
            board.boardEventoPick(room, cur.id, Math.floor(rand() * 3)); // 1 de 3 cartas
            return true;
          default:
            return false;
        }
      }

      // Sem pendência → avança 1 a 3 casas (async: conteúdo da casa).
      await board.advance(room, cur.id, 1 + Math.floor(rand() * 3));
      return true;
    }
  } catch (err) {
    log.warn('bot (tabuleiro): jogada ignorada', { phase: b?.phase, message: err?.message });
    return false;
  }
  return false; // fase over
}
