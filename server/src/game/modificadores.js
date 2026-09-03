// F&D — os Modificadores da noite.
//
// O PROBLEMA
//
// A intensidade (leve · picante · hardcore · caos) só mexe no CONTEÚDO: as
// frases ficam mais atrevidas, e mais nada. As REGRAS são as mesmas às três da
// manhã e às nove da noite — recusa-se do mesmo modo, perde-se uma vida do mesmo
// modo, a vez roda do mesmo modo. Por isso o "hardcore" satura: já não há frase
// nenhuma que choque uma mesa que já ouviu quarenta.
//
// A IDEIA
//
// Subir a aposta em CONSEQUÊNCIA, não em volume de álcool. Cinco interruptores
// que o host liga no lobby e que mudam as regras da noite inteira. São
// ORTOGONAIS à intensidade de propósito: combinam-se com qualquer nível e com
// qualquer modo, em vez de serem mais um degrau numa lista que já satura no topo.
//
// Porque não são mais um nível a seguir ao `caos`:
//   · um sexto nível obrigaria a escrever conteúdo ainda mais forte — e o limite
//     não é a imaginação, é o que uma mesa real aguenta ouvir sobre si;
//   · escolher UM nível é escolher tudo; escolher interruptores é escolher o que
//     este grupo acha divertido (há mesas para quem "sem anonimato" é o limite e
//     "sem escape" é indiferente);
//   · são testáveis à unidade, e desligam-se um a um se um deles correr mal à mesa.
//
// A REGRA DE SEGURANÇA
//
// Nenhum modificador manda beber MAIS. Todos mexem em vidas, em vez, em
// exposição ou em risco de eliminação — coisas que doem sem encher um copo. Isto
// não é escrúpulo decorativo: é o que permite ter um modo "da morte" sem que o
// castigo de perder recaia em quem já bebeu de mais.

import { LEVELS } from './intensity.js';

/**
 * O catálogo. `desc` é o que a mesa lê no lobby — tem de descrever a REGRA, não
 * vender o efeito: quem liga isto tem de saber exatamente ao que vai.
 */
export const CATALOGO = [
  {
    key: 'sem_escape',
    emoji: '⛓️',
    label: 'Sem Escape',
    desc: 'Recusar custa duas vidas em vez de uma.',
  },
  {
    key: 'alvo_marcado',
    emoji: '🎯',
    label: 'Alvo Marcado',
    desc: 'Quem perde uma vida volta a ser o alvo na ronda seguinte.',
  },
  {
    key: 'dobro_ou_nada',
    emoji: '🔁',
    label: 'Dobro ou Nada',
    desc: 'Quem aceita pode dobrar. A mesa julga: consegue e ganha uma vida, falha e perde-a.',
  },
  {
    key: 'sem_anonimato',
    emoji: '🔒',
    label: 'Sem Anonimato',
    desc: 'A razão das Intrigas é sempre revelada a toda a mesa no fim.',
  },
  {
    key: 'morte_subita',
    emoji: '💀',
    label: 'Morte Súbita',
    desc: 'A partir do último terço da noite, recusar elimina em vez de tirar vida.',
  },
];

export const KEYS = CATALOGO.map((m) => m.key);

/** Filtra uma lista vinda do cliente para as chaves conhecidas, sem repetidos. */
export function normaliza(lista) {
  if (!Array.isArray(lista)) return [];
  return KEYS.filter((k) => lista.includes(k));
}

/** Está este modificador ligado nesta sala? */
export function ativo(room, key) {
  return !!room?.game?.modifiers?.includes(key);
}

/**
 * Quantas vidas custa uma recusa.
 *
 * Vive aqui e não no `resolveAction` porque o Modo da Morte vai precisar da
 * mesma pergunta — e uma regra de castigo escrita em dois sítios é uma regra que
 * vai divergir na primeira alteração.
 */
export function custoRecusa(room) {
  return ativo(room, 'sem_escape') ? 2 : 1;
}

/**
 * A Morte Súbita já está a valer?
 *
 * Só no último terço da noite: ligada desde o início transformaria qualquer noite
 * numa eliminatória de dez minutos, e o que se quer é o aperto no fim. Sem
 * duração planeada não há "último terço" nenhum — nesse caso conta-se por rondas.
 */
const RONDAS_ATE_MORTE_SUBITA = 20;

export function morteSubita(room) {
  if (!ativo(room, 'morte_subita')) return false;
  const g = room.game;
  if (!g) return false;
  const dur = g.plano?.duracaoMin;
  if (dur) {
    const decorrido = (Date.now() - (g.startedAt || Date.now())) / 60000;
    return decorrido >= dur * (2 / 3);
  }
  return (g.roundCount || 0) >= RONDAS_ATE_MORTE_SUBITA;
}

/** Pode este jogador oferecer-se para dobrar nesta ronda? */
export function podeDobrar(room, round) {
  if (!ativo(room, 'dobro_ou_nada')) return false;
  if (!round || round.status !== 'pending') return false;
  if (round.dobro) return false;
  // Só faz sentido no que tem um desafio concreto para a mesa julgar.
  return ['boca_calada', 'desafio'].includes(round.gameTypeKey) && !!round.prompt?.text;
}

/**
 * Sem Anonimato: a razão da Intriga vai para toda a mesa no fim da ronda.
 *
 * O socket.js é que faz a entrega (é ele que conhece as salas privadas); aqui
 * fica só a decisão, para a regra não andar espalhada pelos handlers.
 */
export function revelaRazao(room) {
  return ativo(room, 'sem_anonimato');
}

/**
 * Aviso para o lobby: combinações que valem a pena explicar à mesa antes de
 * começar. Devolve strings prontas a mostrar (vazio = nada a dizer).
 */
export function avisos(modifiers = [], intensity = 'leve') {
  const out = [];
  const tem = (k) => modifiers.includes(k);
  if (tem('sem_escape') && tem('morte_subita')) {
    out.push('⛓️💀 Sem Escape + Morte Súbita: no último terço, uma recusa põe-te fora à primeira.');
  }
  if (tem('alvo_marcado') && tem('sem_escape')) {
    out.push('🎯⛓️ Alvo Marcado + Sem Escape: quem começa a perder afunda depressa.');
  }
  if (modifiers.length >= 3 && LEVELS.indexOf(intensity) >= 2) {
    out.push('⚠️ Três modificadores em hardcore ou caos é uma noite curta. Combinem antes de começar.');
  }
  return out;
}

/** Para o payload de rede: o catálogo completo + o que está ligado. */
export function serialize(modifiers = []) {
  return {
    ativos: normaliza(modifiers),
    catalogo: CATALOGO,
  };
}
