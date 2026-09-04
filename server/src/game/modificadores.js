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
// Subir a aposta em CONSEQUÊNCIA, não em volume de álcool. Seis interruptores
// que mudam as regras da noite inteira. São ORTOGONAIS à intensidade de
// propósito: combinam-se com qualquer nível e com qualquer modo, em vez de serem
// mais um degrau numa lista que já satura no topo.
//
// Porque não são mais um nível a seguir ao `caos`:
//   · um sexto nível obrigaria a escrever conteúdo ainda mais forte — e o limite
//     não é a imaginação, é o que uma mesa real aguenta ouvir sobre si;
//   · são testáveis à unidade, e desligam-se um a um se um correr mal à mesa.
//
// PORQUE CALHAM, E NÃO SE ESCOLHEM (2026-09-04)
//
// Escolhidos pelo host no lobby, tinham dois defeitos que só se veem à mesa:
//   1. o pior momento do jogo passava a ser o host a ler seis descrições em voz
//      alta enquanto sete pessoas esperavam;
//   2. escolhidos, são CONHECIDOS — a mesa calibra-se a eles na primeira ronda e
//      a partir daí são só mais uma regra na lista.
//
// Agora SORTEIAM-SE, ponderados pela intensidade votada (ver `PLANO`), e alguns
// caem A MEIO DA NOITE com uma carta no ecrã de toda a gente. Uma regra que muda
// à ronda 12 é um acontecimento; a mesma regra lida no lobby é letra pequena.
// Assim a intensidade volta a ser o ÚNICO botão do lobby.
//
// O QUE O HOST AINDA DECIDE: o VETO. Em vez de escolher o que entra, marca o que
// esta mesa não quer — e o sorteio nunca lhe toca. É a mesma proteção de antes
// (há mesas para quem "sem anonimato" é o limite e "sem escape" é indiferente)
// mas do lado certo: zero cliques é o caso normal, e quem precisa, corta.
//
// A REGRA DE SEGURANÇA
//
// Nenhum modificador manda beber MAIS. Todos mexem em vidas, em vez, em
// exposição ou em risco de eliminação — coisas que doem sem encher um copo. Isto
// não é escrúpulo decorativo: é o que permite ter um modo "da morte" sem que o
// castigo de perder recaia em quem já bebeu de mais. E é o que permite SORTEAR
// sem perguntar: uma regra que caia sozinha nunca pode mandar ninguém beber.

import { LEVELS } from './intensity.js';

/**
 * O catálogo. `desc` é o que a mesa lê — tem de descrever a REGRA, não vender o
 * efeito: quem apanha isto tem de saber exatamente ao que vai.
 *
 * Os três campos do sorteio:
 *
 *   peso    quanto mais alto, mais vezes sai.
 *   quando  'inicio' = só pode entrar no arranque; 'sempre' = também pode cair
 *           a meio da noite. Quem cria ESTADO fica em 'inicio': A Conta abre
 *           dívidas que têm de fechar no fim, e o Sem Anonimato mudaria a
 *           promessa feita a quem já escreveu uma Intriga a contar com ela.
 *   temp    pode sair com prazo ("durante as próximas 4 rondas"). Só para regras
 *           sem estado nem calendário próprio.
 */
export const CATALOGO = [
  {
    key: 'sem_escape',
    emoji: '⛓️',
    label: 'Sem Escape',
    desc: 'Recusar custa duas vidas em vez de uma.',
    peso: 10,
    quando: 'sempre',
    temp: true,
  },
  {
    key: 'alvo_marcado',
    emoji: '🎯',
    label: 'Alvo Marcado',
    desc: 'Quem perde uma vida volta a ser o alvo na ronda seguinte.',
    peso: 10,
    quando: 'sempre',
    temp: true,
  },
  {
    key: 'dobro_ou_nada',
    emoji: '🔁',
    label: 'Dobro ou Nada',
    desc: 'Quem aceita pode dobrar. A mesa julga: consegue e ganha uma vida, falha e perde-a.',
    peso: 12,
    quando: 'sempre',
    temp: true,
  },
  {
    key: 'sem_anonimato',
    emoji: '🔒',
    label: 'Sem Anonimato',
    desc: 'A razão das Intrigas é sempre revelada a toda a mesa no fim.',
    peso: 6,
    quando: 'inicio',
    temp: false,
  },
  {
    key: 'divida',
    emoji: '📿',
    label: 'A Conta',
    desc: 'Podes adiar o gole e ficar a dever (com juro). A conta passa-se, herda-se, e fecha no fim.',
    peso: 8,
    quando: 'inicio',
    temp: false,
  },
  {
    key: 'morte_subita',
    emoji: '💀',
    label: 'Morte Súbita',
    desc: 'A partir do último terço da noite, recusar elimina em vez de tirar vida.',
    peso: 6,
    quando: 'sempre',
    temp: false, // já tem calendário próprio; um prazo por cima seria ilegível
  },
];

export const KEYS = CATALOGO.map((m) => m.key);

const porChave = (key) => CATALOGO.find((m) => m.key === key) || null;

/**
 * O que fica FORA do sorteio por omissão.
 *
 * Só o Sem Anonimato, e por uma razão que nenhum dos outros tem: as Intrigas
 * escrevem-se na fase de preparação, e quem as escreve fá-lo a contar com o
 * anonimato. Sortear esta regra é quebrar uma promessa já feita — os outros
 * cinco só endurecem decisões que ainda estão por tomar.
 *
 * O host pode desvetá-lo se a mesa quiser: é um toque no lobby.
 */
export const VETADOS_POR_OMISSAO = ['sem_anonimato'];

/**
 * Quantas regras a noite apanha, por intensidade votada.
 *
 *   inicio  [min, max] sorteados no arranque
 *   teto    máximo em vigor ao mesmo tempo (o resto vai caindo pela noite)
 *
 * Leve tem teto 1 de propósito: quem vota leve não pediu uma noite com regras
 * novas de dez em dez minutos. O Caos vai a seis — que é o catálogo inteiro.
 */
export const PLANO = {
  leve: { inicio: [0, 1], teto: 1 },
  picante: { inicio: [1, 2], teto: 3 },
  hardcore: { inicio: [2, 3], teto: 4 },
  caos: { inicio: [3, 4], teto: 6 },
};

const plano = (intensity) => PLANO[intensity] || PLANO.leve;

// De quantas em quantas rondas se tenta uma regra nova. Janela aleatória, como
// nos Eventos: a mesa nunca pode conseguir prever "agora vem aí".
export const MIN_RONDAS = 7;
export const MAX_RONDAS = 12;

// Quanto dura uma regra temporária, e com que frequência sai com prazo. Os
// prazos existem para a noite RESPIRAR: sem eles o sorteio só sabe endurecer.
const TEMP_PROB = 0.5;
const TEMP_MIN = 3;
const TEMP_MAX = 5;

const inteiro = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/** Filtra uma lista vinda do cliente para as chaves conhecidas, sem repetidos. */
export function normaliza(lista) {
  if (!Array.isArray(lista)) return [];
  return KEYS.filter((k) => lista.includes(k));
}

/** Está este modificador ligado nesta sala? */
export function ativo(room, key) {
  return !!room?.game?.modifiers?.includes(key);
}

// ----- O sorteio ---------------------------------------------------------------

/**
 * Combinações proibidas.
 *
 * ⛓️ + 💀 no último terço significa "recusas uma vez e sais" — que é exatamente
 * o que uma mesa em Caos pediu, e exatamente o que uma mesa em Picante não
 * pediu. Escolhidos à mão isto era um aviso; sorteados tem de ser um TRAVÃO,
 * porque já não há ninguém a ler o aviso antes de aceitar.
 */
function permitido(atuais, key, intensity) {
  const par = (a, b) => (key === a && atuais.includes(b)) || (key === b && atuais.includes(a));
  if (par('sem_escape', 'morte_subita')) return intensity === 'caos';
  return true;
}

/** Sorteio ponderado por `peso` dentro de um conjunto de entradas do catálogo. */
function tiraUm(pool) {
  const total = pool.reduce((s, m) => s + m.peso, 0);
  if (total <= 0) return null;
  let bilhete = Math.random() * total;
  for (const m of pool) {
    bilhete -= m.peso;
    if (bilhete <= 0) return m;
  }
  return pool[pool.length - 1];
}

/** O que ainda pode entrar: não vetado, não ativo, e do momento certo. */
function elegiveis({ vetados = [], atuais = [], momento = 'inicio' }) {
  return CATALOGO.filter(
    (m) =>
      !vetados.includes(m.key) &&
      !atuais.includes(m.key) &&
      (momento === 'inicio' || m.quando === 'sempre')
  );
}

/**
 * As regras com que a noite ARRANCA. Chamado uma vez, no `initGame`.
 *
 * Devolve na ordem canónica do catálogo (e não na ordem em que saíram) para o
 * ecrã ser estável entre broadcasts.
 */
export function sorteia({ intensity = 'leve', vetados = [] } = {}) {
  const p = plano(intensity);
  const quantos = inteiro(p.inicio[0], p.inicio[1]);
  const veto = normaliza(vetados);
  const out = [];
  let pool = elegiveis({ vetados: veto, momento: 'inicio' });
  while (out.length < quantos && pool.length) {
    const m = tiraUm(pool);
    if (!m) break;
    pool = pool.filter((x) => x.key !== m.key);
    if (!permitido(out, m.key, intensity)) continue;
    out.push(m.key);
  }
  return KEYS.filter((k) => out.includes(k));
}

/** Marca a ronda em que se tenta a próxima regra nova. */
export function agendaProximo(game) {
  if (!game) return;
  game.proximoModificadorNa = (game.roundCount || 0) + inteiro(MIN_RONDAS, MAX_RONDAS);
}

/**
 * Está na hora de cair uma regra nova?
 *
 * Nunca na última ronda nem no final: uma regra que muda o jogo e não chega a
 * ser jogada é só uma carta a atrasar o desfecho.
 */
export function horaDeSorteio(room) {
  const g = room?.game;
  if (!g?.sorteio) return false;
  if (g.finale || g.phase === 'gameover') return false;
  if (g.proximoModificadorNa == null) return false;
  if ((g.modifiers?.length || 0) >= plano(g.intensity).teto) return false;
  return (g.roundCount || 0) >= g.proximoModificadorNa;
}

/**
 * Sorteia e LIGA uma regra a meio da noite.
 *
 * Devolve o que o cliente precisa para a encenar (ou null se nada pegou — nesse
 * caso reagenda-se na mesma, como nos Eventos: uma tentativa falhada não gasta
 * a vez, mas também não pode voltar a tentar na ronda seguinte).
 */
export function sorteiaAMeio(room) {
  const g = room?.game;
  if (!g) return null;
  const pool = elegiveis({
    // Uma regra que já teve o seu prazo não volta. Sem isto, o Dobro ou Nada
    // podia cair, acabar e cair outra vez cinco rondas depois — e uma regra que
    // vai e vem deixa de ser um acontecimento para ser um interruptor avariado.
    vetados: [...(g.vetados || []), ...(g.modifiersFora || [])],
    atuais: g.modifiers || [],
    momento: 'meio',
  }).filter((m) => permitido(g.modifiers || [], m.key, g.intensity));

  const m = tiraUm(pool);
  agendaProximo(g);
  if (!m) return null;

  g.modifiers = KEYS.filter((k) => k === m.key || g.modifiers.includes(k));

  // Prazo, se a regra o admitir. Uma regra temporária é a única forma de a noite
  // ficar mais leve por si — tudo o resto no jogo só sabe apertar.
  let rondas = null;
  if (m.temp && Math.random() < TEMP_PROB) {
    rondas = inteiro(TEMP_MIN, TEMP_MAX);
    g.modifiersTemp = { ...(g.modifiersTemp || {}), [m.key]: rondas };
  }

  g.ultimoModificador = {
    key: m.key,
    emoji: m.emoji,
    titulo: m.label,
    desc: m.desc,
    rondas, // null = fica até ao fim da noite
    avisos: avisos(g.modifiers, g.intensity),
    em: Date.now(),
  };
  return g.ultimoModificador;
}

/**
 * Consome uma ronda dos prazos. Devolve as regras que EXPIRARAM agora, para
 * quem chama contar à mesa (o feed vive no game.js, não aqui).
 */
export function passaRonda(room) {
  const g = room?.game;
  if (!g?.modifiersTemp) return [];
  const expirados = [];
  for (const key of Object.keys(g.modifiersTemp)) {
    g.modifiersTemp[key] -= 1;
    if (g.modifiersTemp[key] > 0) continue;
    delete g.modifiersTemp[key];
    g.modifiers = (g.modifiers || []).filter((k) => k !== key);
    g.modifiersFora = [...(g.modifiersFora || []), key]; // já teve a sua vez
    // O Alvo Marcado deixa uma mira apontada; sem isto a regra acabava mas a
    // vítima ainda era escolhida mais uma vez.
    if (key === 'alvo_marcado') {
      g.alvoMarcadoId = null;
      g.alvoSeguidas = 0;
    }
    expirados.push(porChave(key));
  }
  return expirados.filter(Boolean);
}

// ----- Pontos de leitura das regras --------------------------------------------

/**
 * Quantas vidas custa uma recusa.
 *
 * Vive aqui e não no `resolveAction` porque o Modo da Morte precisa da mesma
 * pergunta — e uma regra de castigo escrita em dois sítios é uma regra que vai
 * divergir na primeira alteração.
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

// ----- Texto para os ecrãs -----------------------------------------------------

/**
 * Aviso sobre as regras EM VIGOR: combinações que valem a pena explicar à mesa.
 * Já não é texto de lobby (ninguém escolhe nada lá) — é o que se mostra quando
 * uma regra cai e se junta a outra que já lá estava.
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
    out.push('⚠️ Três regras em hardcore ou caos é uma noite curta.');
  }
  return out;
}

/** Uma linha para o lobby: quantas regras esta intensidade costuma trazer. */
export function resumoSorteio(intensity = 'leve') {
  const p = plano(intensity);
  const [min, max] = p.inicio;
  const arranque = min === max ? `${min}` : min === 0 ? `até ${max}` : `${min} a ${max}`;
  return `${arranque} à partida, até ${p.teto} durante a noite.`;
}

/**
 * Para o payload de rede: o catálogo, o que a mesa vetou, e o que está em vigor
 * (com os prazos). Recebe a SALA e não uma lista porque as três coisas vivem em
 * sítios diferentes — a sala (veto) e o jogo (ativos, prazos).
 */
export function serialize(room) {
  const g = room?.game;
  return {
    catalogo: CATALOGO,
    vetados: normaliza(room?.vetados || []),
    ativos: normaliza(g?.modifiers || []),
    prazos: { ...(g?.modifiersTemp || {}) },
  };
}
