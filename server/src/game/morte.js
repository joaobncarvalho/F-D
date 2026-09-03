// F&D — o MODO DA MORTE ("Última Ronda").
//
// PORQUE É QUE ISTO NÃO É UM QUARTO MOTOR
//
// Havia a tentação óbvia: copiar o `game.js` e escrever um motor de eliminação
// ao lado do da Roda, do Tabuleiro e do Torneio. Seria a quarta vez que se
// escrevia rotação de vez, estatísticas, curva de intensidade, feed e fim de
// jogo — cerca de duas mil linhas de duplicação, e exatamente a dívida que a
// reestruturação #3 do backlog existe para pagar.
//
// Este ficheiro é a alternativa: uma CAMADA sobre a Roda. As rondas são as
// mesmas, os vinte e quatro tipos são os mesmos, o Diretor é o mesmo. O que muda
// são três regras de resolução, e é só isso que vive aqui.
//
// AS TRÊS REGRAS
//
//   1. NÃO HÁ RECUSAR. Recusar não tira uma vida: põe fora. Falhar um jogo a
//      tempo também. Ou fazes, ou sais.
//   2. QUEM SAI GANHA PODER. É a inversão que faz o modo funcionar. Num jogo de
//      eliminação normal, sair é ficar a ver os outros divertirem-se — o pior
//      castigo possível numa festa, e a razão pela qual estes jogos acabam com
//      metade da mesa no telemóvel. Aqui, sair transforma-te em FANTASMA: ficas
//      com cartas que mexem na vida de quem ficou, e com um TESTAMENTO — uma
//      regra tua que vale até ao fim da noite. Quanto mais gente morre, mais
//      barulhenta fica a plateia.
//   3. O RELÓGIO ENCURTA. Cada eliminação aperta o prazo de auto-resolução. A
//      mesa sente a noite a fechar-se sem que ninguém tenha de anunciar nada.
//
// E ACABA SOZINHO. Quando sobram dois, a ronda seguinte é um duelo, à melhor de
// uma. Quando sobra um, acabou. O modo tem um fim que não depende de alguém se
// lembrar de carregar em "terminar".
//
// A REGRA DE SEGURANÇA (a mesma dos modificadores)
//
// Sair NÃO obriga a beber. O castigo é a eliminação, e nada mais: somar um shot
// a quem já foi eliminado seria mandar beber mais precisamente a pessoa que a
// noite já castigou — e num modo em que se sai depressa isso é o caminho mais
// curto para alguém passar mal. Quem sai bebe o que já tinha bebido, e mais nada.

import { AppError } from '../errors.js';
import { connectedOrder, elimina, ganhaVida, nameOf, shuffle } from './helpers.js';
import { sanitizeText } from '../util.js';

/** Vidas por defeito neste modo. Duas dá um estado de "ferido" antes do fim. */
export const VIDAS_DEFEITO = 2;

/** Relógio da ronda: começa aqui e encurta a cada eliminação, até ao mínimo. */
export const SEGUNDOS_BASE = 60;
export const SEGUNDOS_POR_MORTE = 8;
export const SEGUNDOS_MIN = 15;

export const ativo = (room) => room?.mode === 'morte';

/** Estado inicial da camada (o `initGame` mete isto no `room.game`). */
export function estadoInicial() {
  return {
    fantasmas: {}, // playerId -> { cartas: [key], testamento: string|null }
    testamentoAberto: null, // { deId, deName } enquanto alguém escreve o seu
    cartaJogadaNaRonda: false, // uma carta de fantasma por ronda (ver CARTAS)
    condenada: false, // a ronda atual está condenada (carta 💀): perder = sair
    vidasNoInicio: null, // fotografia para a Condenar saber quem perdeu alguma
    mortes: 0,
    dueloFinal: false, // sobraram dois → a próxima ronda é o duelo
  };
}

// ----- Cartas de fantasma ----------------------------------------------------
//
// Quatro, e não doze: cada uma tem de ser explicável numa linha e visível no
// momento em que é jogada. Uma carta cujo efeito a mesa não vê acontecer é uma
// carta que não existe.
//
// UMA POR RONDA, no total e não por fantasma. Com seis mortos e cartas livres, a
// ronda dos vivos desaparecia debaixo dos mortos — e o modo passava a ser jogado
// por quem já perdeu.

export const CARTAS = {
  marcar: {
    emoji: '🎯',
    label: 'Marcar',
    desc: 'Escolhes quem joga a próxima ronda.',
    precisaAlvo: true,
  },
  condenar: {
    emoji: '💀',
    label: 'Condenar',
    desc: 'Nesta ronda, quem perder uma vida sai à primeira.',
    precisaAlvo: false,
  },
  ressuscitar: {
    emoji: '💞',
    label: 'Ressuscitar',
    desc: 'Devolves alguém à mesa com uma vida. Nunca a ti.',
    precisaAlvo: true,
  },
  trocar: {
    emoji: '🔀',
    label: 'Trocar',
    desc: 'Trocas as vidas de duas pessoas vivas.',
    precisaAlvo: true, // o alvo é o segundo; o primeiro é quem tem menos vidas
  },
};

const MAO = 2; // cartas por fantasma, sorteadas no momento em que sai

/**
 * Alguém saiu. Vira fantasma, abre o testamento e aperta o relógio.
 *
 * Chamado do `game.js` sempre que uma eliminação acontece — por qualquer via.
 * Não decide nada sobre a ronda em curso: quem sai a meio de uma ronda continua
 * a sair a meio, e a ronda fecha como fecharia.
 */
export function aoEliminar(room, playerId) {
  const g = room.game;
  if (!ativo(room) || !g?.morte) return null;
  const m = g.morte;
  if (m.fantasmas[playerId]) return null; // já era fantasma (não se morre duas vezes)

  m.mortes += 1;
  m.fantasmas[playerId] = {
    cartas: shuffle(Object.keys(CARTAS)).slice(0, MAO),
    testamento: null,
  };
  // O testamento é individual e não bloqueia a mesa: enquanto ele escreve, a
  // ronda seguinte já pode arrancar. Um jogo parado à espera de quem acabou de
  // perder é a pior forma possível de castigar o resto da mesa.
  m.testamentoAberto = { deId: playerId, deName: nameOf(room, playerId) };
  return { fantasma: m.fantasmas[playerId], mortes: m.mortes };
}

/**
 * Varre a mesa no fim de cada ronda e trata das eliminações que aconteceram.
 *
 * Existe UM sítio a fazer isto, e é este, porque há uma dúzia de caminhos que
 * eliminam alguém (recusar, falhar um veredito, a bomba, um evento da noite, uma
 * carta de fantasma). Um gancho dentro do `perdeVida` seria mais imediato mas
 * fechava um ciclo de imports entre este módulo e o `helpers.js` — e obrigava a
 * abrir o testamento a meio de uma ronda, que é o pior momento para o fazer.
 *
 * @returns { novos: [{id, name, mortes}], condenados: [{id, name}] }
 */
export function varre(room) {
  const g = room.game;
  if (!ativo(room) || !g?.morte) return { novos: [], condenados: [] };
  const m = g.morte;

  // Carta 💀 Condenar: nesta ronda, quem perdeu uma vida sai à primeira. Compara-
  // se com as vidas do início da ronda porque uma "perda" é uma diferença, e não
  // um número absoluto que se possa ler de qualquer jogador.
  const condenados = [];
  if (m.condenada && m.vidasNoInicio) {
    for (const p of room.players.values()) {
      if (p.eliminated) continue;
      const antes = m.vidasNoInicio[p.id];
      if (antes === undefined || p.lives >= antes) continue;
      elimina(room, p.id, 'ronda condenada');
      condenados.push({ id: p.id, name: p.name });
    }
  }

  const novos = [];
  for (const p of room.players.values()) {
    if (!p.eliminated || m.fantasmas[p.id]) continue;
    const res = aoEliminar(room, p.id);
    if (res) novos.push({ id: p.id, name: p.name, mortes: res.mortes });
  }
  return { novos, condenados };
}

/** Fotografa as vidas no arranque da ronda (só a carta Condenar precisa disto). */
export function abreRonda(room) {
  const m = room.game?.morte;
  if (!m) return;
  m.vidasNoInicio = Object.fromEntries(
    [...room.players.values()].filter((p) => !p.eliminated).map((p) => [p.id, p.lives])
  );
}

/** Segundos de prazo da ronda, já com o aperto das eliminações. */
export function segundosRonda(room) {
  const m = room.game?.morte;
  if (!m) return SEGUNDOS_BASE;
  return Math.max(SEGUNDOS_MIN, SEGUNDOS_BASE - m.mortes * SEGUNDOS_POR_MORTE);
}

/**
 * O testamento: uma regra que quem sai deixa à mesa, e que vale até ao fim.
 * Devolve o texto a pôr nas `activeRules` (é o game.js que lá mexe).
 */
export function escreveTestamento(room, playerId, texto) {
  const m = room.game?.morte;
  if (!m?.testamentoAberto) throw new AppError('Não há testamento a escrever.');
  if (m.testamentoAberto.deId !== playerId) throw new AppError('Este testamento não é teu.');
  const limpo = sanitizeText(texto, 120);
  if (limpo.length < 3) throw new AppError('Escreve a tua regra.');
  m.fantasmas[playerId].testamento = limpo;
  const nome = m.testamentoAberto.deName;
  m.testamentoAberto = null;
  return { texto: limpo, deId: playerId, deName: nome };
}

/** Quem sai e não escreve nada não deixa regra nenhuma. Não se inventa por ele. */
export function fechaTestamento(room) {
  const m = room.game?.morte;
  if (!m?.testamentoAberto) return null;
  const fechado = m.testamentoAberto;
  m.testamentoAberto = null;
  return fechado;
}

// ----- Jogar uma carta -------------------------------------------------------

function requireFantasma(room, playerId) {
  const m = room.game?.morte;
  if (!ativo(room) || !m) throw new AppError('Não estás no Modo da Morte.');
  const f = m.fantasmas[playerId];
  if (!f) throw new AppError('Só quem já saiu tem cartas.');
  return { m, f };
}

/**
 * Um fantasma joga uma carta.
 *
 * @returns { carta, texto, efeitos } — `texto` vai para o feed, `efeitos` são os
 *          que o cliente anima (vidas). Quem aplica a marcação da vez é o
 *          game.js, que é dono da rotação.
 */
export function jogaCarta(room, playerId, key, alvoId = null) {
  const { m, f } = requireFantasma(room, playerId);
  const carta = CARTAS[key];
  if (!carta) throw new AppError('Carta inválida.');
  if (!f.cartas.includes(key)) throw new AppError('Já não tens essa carta.');
  if (m.cartaJogadaNaRonda) throw new AppError('Já foi jogada uma carta nesta ronda.');

  const vivos = connectedOrder(room);
  if (vivos.length <= 1) throw new AppError('Já não há mesa para isso.');

  const efeitos = [];
  let texto;
  let marcar = null;

  if (key === 'marcar') {
    const alvo = vivos.find((p) => p.id === alvoId);
    if (!alvo) throw new AppError('Escolhe alguém que ainda esteja a jogar.');
    marcar = alvo.id;
    texto = `${nameOf(room, playerId)} marcou o ${alvo.name} para a próxima ronda.`;
  } else if (key === 'condenar') {
    m.condenada = true;
    texto = `${nameOf(room, playerId)} condenou esta ronda: quem perder, sai.`;
  } else if (key === 'ressuscitar') {
    const alvo = room.players.get(alvoId);
    if (!alvo || !alvo.eliminated) throw new AppError('Escolhe alguém que esteja fora.');
    if (alvoId === playerId) throw new AppError('Não podes ressuscitar-te a ti próprio.');
    alvo.eliminated = false;
    alvo.lives = 1;
    delete m.fantasmas[alvoId]; // volta a jogar → deixa de ser plateia
    m.mortes = Math.max(0, m.mortes - 1); // e o relógio afrouxa outra vez
    efeitos.push({ type: 'vida_extra', playerId: alvoId, lives: 1, name: alvo.name });
    texto = `${nameOf(room, playerId)} trouxe o ${alvo.name} de volta, com uma vida.`;
  } else if (key === 'trocar') {
    const b = vivos.find((p) => p.id === alvoId);
    if (!b) throw new AppError('Escolhe alguém que ainda esteja a jogar.');
    // O outro lado da troca é quem tem MENOS vidas: assim a carta é sempre uma
    // decisão sobre quem se quer salvar, e não uma forma de dar jeito a si mesmo
    // (o fantasma já não tem vidas nenhumas para trocar).
    const a = [...vivos].sort((x, y) => x.lives - y.lives)[0];
    if (a.id === b.id) throw new AppError('Escolhe outra pessoa.');
    [a.lives, b.lives] = [b.lives, a.lives];
    efeitos.push(
      { type: 'vida_extra', playerId: a.id, lives: a.lives, name: a.name },
      { type: 'vida_extra', playerId: b.id, lives: b.lives, name: b.name }
    );
    texto = `${nameOf(room, playerId)} trocou as vidas do ${a.name} e do ${b.name}.`;
  }

  f.cartas = f.cartas.filter((k) => k !== key);
  m.cartaJogadaNaRonda = true;
  return { carta: key, emoji: carta.emoji, texto, efeitos, marcar };
}

/** Uma ronda nova → volta a haver espaço para uma carta. */
export function passaRonda(room) {
  const m = room.game?.morte;
  if (!m) return;
  m.cartaJogadaNaRonda = false;
  m.condenada = false;
}

/**
 * Como acaba a noite.
 *
 * @returns 'fim' (sobrou um) | 'duelo' (sobraram dois) | null
 */
export function estadoDoFim(room) {
  if (!ativo(room)) return null;
  const vivos = connectedOrder(room);
  if (vivos.length <= 1) return 'fim';
  if (vivos.length === 2) return 'duelo';
  return null;
}

/** A mão privada de um fantasma (nunca vai no broadcast). */
export function mao(room, playerId) {
  const f = room.game?.morte?.fantasmas?.[playerId];
  if (!f) return null;
  return f.cartas.map((k) => ({ key: k, ...CARTAS[k] }));
}

/**
 * Para o payload público.
 *
 * As MÃOS não vão daqui — cada fantasma recebe a sua por entrega privada, como
 * as cartas do Tabuleiro e da Pirâmide. O que a mesa vê é quantas cartas andam
 * por aí, e isso chega para a fazer olhar por cima do ombro.
 */
export function serialize(room) {
  const m = room.game?.morte;
  if (!ativo(room) || !m) return null;
  return {
    mortes: m.mortes,
    segundosRonda: segundosRonda(room),
    condenada: !!m.condenada,
    cartaJogadaNaRonda: !!m.cartaJogadaNaRonda,
    dueloFinal: !!m.dueloFinal,
    testamentoAberto: m.testamentoAberto || null,
    fantasmas: Object.entries(m.fantasmas).map(([id, f]) => ({
      id,
      name: nameOf(room, id) || '—',
      cartas: f.cartas.length, // quantas, nunca quais
      testamento: f.testamento,
    })),
    catalogo: CARTAS,
  };
}
