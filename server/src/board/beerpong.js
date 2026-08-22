// ---------- Casa Beer Pinga (beer pong) — acerta sempre; a força escolhe a fila ----------
// Mais força = fila mais atrás = maior risco/prémio. NENHUM copo é neutro: bebe-se
// sempre a "base" (cresce com a distância) e o copo pode agravar/recompensar.
// Extraído do board.js (comportamento idêntico). Depende só de ./core.js.

import { AppError } from '../errors.js';
import { requireBoard, nameOf, checkWin, advanceBoardTurn, giveRandomCard, applyPrison } from './core.js';

const BEERPONG_BASE = [2, 3, 4]; // golos base por fila: frente · meio · trás
const BEERPONG_OUTCOMES = [
  // Fila da frente (fácil de acertar) — consequências suaves
  [
    { emoji: '😮‍💨', title: 'Escapou barato', desc: 'só a base', type: 'none', good: true },
    { emoji: '🚀', title: 'Impulso', desc: 'avança 1 casa', type: 'advance', value: 1, good: true },
    { emoji: '🍻', title: 'Ronda leve', desc: 'os outros bebem 2', type: 'others', value: 2, good: true },
    { emoji: '🍺', title: 'Golo a mais', desc: '+2 golos', type: 'drink', value: 2, good: false },
  ],
  // Fila do meio — médio
  [
    { emoji: '🚀', title: 'Salto', desc: 'avança 2 casas', type: 'advance', value: 2, good: true },
    { emoji: '🎴', title: 'Carta!', desc: 'ganhas uma carta', type: 'card', good: true },
    { emoji: '🍺', title: 'Duplo shot', desc: '+3 golos', type: 'drink', value: 3, good: false },
    { emoji: '⬅️', title: 'Mão trémula', desc: 'recua 2 casas', type: 'back', value: 2, good: false },
    { emoji: '🍻', title: 'Ronda', desc: 'os outros bebem 3', type: 'others', value: 3, good: true },
  ],
  // Fila de trás (difícil) — extremo
  [
    { emoji: '🏆', title: 'JACKPOT', desc: 'avança 3 + carta', type: 'jackpot', good: true },
    { emoji: '🥴', title: 'Afogado', desc: '+6 golos', type: 'drink', value: 6, good: false },
    { emoji: '🚔', title: 'Copo maldito', desc: 'vais preso', type: 'prison', good: false },
    { emoji: '🍻', title: 'Ronda dupla', desc: 'os outros bebem 4', type: 'others', value: 4, good: true },
    { emoji: '⬅️', title: 'Ressaca', desc: 'recua 3 casas', type: 'back', value: 3, good: false },
  ],
];
function beerpongRow(power) {
  const p = Math.max(0, Math.min(1, Number(power) || 0));
  if (p < 0.45) return 0; // frente (pouca força)
  if (p < 0.8) return 1; // meio
  return 2; // trás (muita força, timing preciso)
}

/** Casa Beer Pinga: a força (0..1) escolhe a fila; acerta sempre num copo dessa fila. */
export function boardBeerpong(room, playerId, power) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'beerpong') throw new AppError('Nada de Beer Pinga.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const row = beerpongRow(power);
  const pool = BEERPONG_OUTCOMES[row];
  const cupIdx = Math.floor(Math.random() * pool.length);
  const cup = pool[cupIdx];
  const base = BEERPONG_BASE[row];
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  me.golos += base; // toda a gente bebe a base — nunca neutro

  switch (cup.type) {
    case 'advance':
      me.pos = Math.min(b.size, me.pos + cup.value);
      checkWin(room, playerId);
      break;
    case 'back':
      me.pos = Math.max(0, me.pos - cup.value);
      break;
    case 'drink':
      me.golos += cup.value;
      break;
    case 'others':
      for (const oid of Object.keys(b.players)) if (oid !== playerId) b.players[oid].golos += cup.value;
      break;
    case 'card':
      giveRandomCard(b, me);
      break;
    case 'jackpot':
      me.pos = Math.min(b.size, me.pos + 3);
      giveRandomCard(b, me);
      checkWin(room, playerId);
      break;
    case 'prison':
      applyPrison(room, playerId, 'copo maldito');
      break;
    default:
      break;
  }

  const rowName = ['frente', 'meio', 'trás'][row];
  b.lastEvent = {
    text: `🍺 ${nm} acertou no copo (${rowName}) — bebe ${base} · ${cup.desc}!`,
    beerpong: { row, cupIdx, cupCount: pool.length, base, emoji: cup.emoji, title: cup.title, desc: cup.desc, good: !!cup.good },
  };
  b.pending = null;
  if (b.phase !== 'over') advanceBoardTurn(room);
  return b;
}
