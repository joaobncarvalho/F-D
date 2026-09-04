import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './errors.js';
import { sanitizeText } from './util.js';
import { pickPrompt, resetBags } from './content/bag.js';
import { effectiveIntensity } from './game/intensity.js';
import { pushFeed, clearFeed } from './feed.js';
import { connectedOrder, statsFor, drink, nameOf, perdeVida } from './game/helpers.js';
import { dealPiramide, serializePiramide } from './game/piramide.js';
import { dealVasco, tallyVascoVotes, buildVascoResult, serializeVasco } from './game/vasco.js';
import { setupIntrigas, serializeIntrigas } from './game/intrigas.js';
import { pickSecret, setupSegredos, revealSegredos, serializeSegredos } from './game/segredos.js';
import { setupRelampago, serializeRelampago } from './game/relampago.js';
import { setupMimica, serializeMimica } from './game/mimica.js';
import { setupRoleta, serializeRoleta } from './game/roleta.js';
import { setupDuelo, serializeDuelo } from './game/duelo.js';
import { GRUPO_KEYS, setupGrupo, serializeGrupo } from './game/grupo.js';
import { setupCascata, serializeCascata } from './game/cascata.js';
import { setupDesenho, serializeDesenho } from './game/desenho.js';
import { setupReacaoRoda, serializeReacaoRoda } from './game/reacao.js';
import { setupBomba, serializeBomba } from './game/bomba.js';
import { setupLeilao, serializeLeilao } from './game/leilao.js';
import { setupSincronia, serializeSincronia } from './game/sincronia.js';
import { setupDetetor, serializeDetetor } from './game/detetor.js';
import { setupJulgamento, serializeJulgamento, julgamentoVeredito } from './game/julgamento.js';
import { setupContrato, serializeContrato, fecha as fechaContrato } from './game/contrato.js';
import { ganhaVida, elimina } from './game/helpers.js';
import * as modificadores from './game/modificadores.js';
import * as divida from './game/divida.js';
import * as morte from './game/morte.js';
import * as director from './game/director.js';
import * as palpites from './game/palpites.js';
import * as veredito from './game/veredito.js';
import * as eventos from './game/eventos.js';
// Importados (e não só re-exportados): o `export { x } from` não cria binding
// local, e o fechaVeredito abaixo precisa mesmo de lhes chamar.
import { mimicaVeredito } from './game/mimica.js';
import { relampagoVeredito } from './game/relampago.js';
// Ações dos mini-jogos chamadas diretamente pelo socket.js — re-exportadas daqui.
export {
  piramideReady,
  piramideFlip,
  piramideAssign,
  piramidePass,
  piramideRespond,
  piramideHand,
  piramideNext,
} from './game/piramide.js';
export {
  vascoRole,
  vascoStartClues,
  vascoClueDone,
  vascoVote,
  vascoRedeem,
} from './game/vasco.js';
export { chooseTarget, submitRps } from './game/intrigas.js';
export { bombaPassa, bombaExpirou, bombaEstoira } from './game/bomba.js';
export { leilaoLicita, fecha as fechaLeilao } from './game/leilao.js';
export { sincroniaResponde, fecha as fechaSincronia } from './game/sincronia.js';
export { detetorMarca, detetorVota, fecha as fechaDetetor } from './game/detetor.js';
export { julgamentoAoVoto } from './game/julgamento.js';
export { contratoEscolhe } from './game/contrato.js';
import { contratoAssina as contratoAssinaRaw, contratoExpira as contratoExpiraRaw } from './game/contrato.js';

/**
 * Voto no veredito da mesa. Um só handler para todos os jogos a tempo: quando a
 * mesa toda vota, fecha-se e aplica-se — quem falhou perde uma vida.
 */
export function votaVeredito(room, playerId, valor) {
  const g = room.game;
  const r = g?.round;
  if (!r?.veredito) throw new AppError('Não há veredito a decidir.');
  veredito.vota(room, playerId, valor);
  if (!veredito.completo(room)) return { fechado: false };
  return fechaVeredito(room);
}

/** Fecha o veredito da ronda atual (votação completa, ou auto-resolve). */
export function fechaVeredito(room) {
  const g = room.game;
  const r = g?.round;
  if (!r?.veredito || r.veredito.fechado) return { fechado: false };
  const res = r.dobro
    ? dobroVeredito(room)
    : r.gameTypeKey === 'julgamento'
      ? julgamentoVeredito(room)
      : r.gameTypeKey === 'mimica'
        ? mimicaVeredito(room)
        : relampagoVeredito(room);
  if (!res) return { fechado: false };
  pushFeed(
    room,
    res.conseguiu ? '👏' : '💔',
    res.frase || veredito.frase(room, res.atorId, res.conseguiu, r.veredito)
  );
  return { fechado: true, ...res };
}

/**
 * Modificador "Dobro ou Nada": alguém aceitou e foi a dobrar. A mesa julgou.
 *
 * A aposta é simétrica de propósito — uma vida contra uma vida. Se o prémio
 * fosse menor do que o risco, ninguém dobrava e o modificador não existia; se
 * fosse maior, dobrava-se sempre e deixava de ser uma decisão.
 */
function dobroVeredito(room) {
  const g = room.game;
  const r = g.round;
  const res = veredito.fecha(room);
  const atorId = r.currentPlayerId;
  const nome = nameOf(room, atorId) || 'alguém';
  let efeito;
  if (res.conseguiu) {
    efeito = ganhaVida(room, atorId);
    r.dobro.resultado = 'ganhou';
  } else {
    efeito = perdeVida(room, atorId, { motivo: 'falhou o dobro' });
    r.dobro.resultado = 'perdeu';
  }
  r.dobro.aberto = false;
  r.status = 'resolved';
  palpites.resolve(room, 'aceita'); // ele aceitou — dobrar não muda isso
  return {
    ...res,
    efeito,
    atorId,
    frase: res.conseguiu
      ? `🔁 ${nome} dobrou e a mesa deu por bom (${res.sim}-${res.nao}) — mais uma vida`
      : `🔁 ${nome} dobrou e falhou (${res.nao}-${res.sim}) — menos uma vida`,
  };
}
export { aposta as darPalpite } from './game/palpites.js';
export { castGuess } from './game/segredos.js';
export { relampagoStart, relampagoTimeUp, relampagoVeredito } from './game/relampago.js';
export { mimicaWord, mimicaStart, mimicaTimeUp, mimicaVeredito } from './game/mimica.js';
export { roletaAnswer, roletaPass } from './game/roleta.js';
export { dueloResult, dueloCall } from './game/duelo.js';
export { grupoAnswer, grupoForceReveal, revealGrupo, grupoVoters } from './game/grupo.js';
export { cascataStart, cascataStop } from './game/cascata.js';
export { desenhoStart, desenhoGuess, desenhoGiveUp, desenhoWord, finishDesenho } from './game/desenho.js';
export { reacaoTap, resolveReacaoRoda } from './game/reacao.js';

// Motor de jogo. Opera sobre `room.game` (criado por initGame).
//
// Fases:
//   'prep'     — jogadores escrevem perguntas dirigidas (Boca Calada) e segredos (Segredos)
//   'wheel'    — é a vez de um jogador; ELE gira a roda (não o host)
//   'prompt'   — Boca Calada / Desafio: o jogador da vez aceita ou recusa (bebe)
//   'voting'   — Intrigas: TODOS votam anonimamente; mais votado bebe
//   'guessing' — Segredos: mostra segredo anónimo; todos adivinham o autor
//   'relampago'— Categoria Relâmpago: cronómetro; travar custa golos
//   'mimica'   — Mímica/Desenho: palavra privada + cronómetro; ninguém acerta = bebe
//   'roleta'   — Roleta Russa: responder ou passar (o passe fica cada vez mais caro)
//   'duelo'    — Duelo 1v1: dois jogadores, mini-duelo presencial; quem perde bebe
//   'grupo'    — TODA a mesa responde em segredo e revela-se de uma vez
//                (eu_nunca / mais_provavel / termometro / quem_disse)
//   'cascata'  — corrente: só paras depois de quem está à tua frente
//   'desenho'  — desenha e adivinha (traços por canal próprio, palavra privada)
//   'reacao'   — primeiro a carregar; o último bebe
//   'gameover'
//
// Vidas: só se perdem em recusas (Boca Calada / Desafio). Intrigas/Segredos dão
// "goles" (contam para estatísticas) mas não tiram vidas.

const DEFAULT_LIVES = 3;
const MIN_LIVES = 1;
const MAX_LIVES = 5;
// Leve · Picante (+18/festa) · Hardcore (mesmo embaraçoso) · Caos (expose/drama).
const INTENSITIES = ['leve', 'picante', 'hardcore', 'caos'];

// connectedOrder/statsFor/drink/nameOf/shuffle vivem em ./game/helpers.js.

// Regras com duração: cada avanço de vez é uma "jogada" → decrementa e limpa.
function decrementRules(game) {
  if (!game.activeRules?.length) return;
  for (const rule of game.activeRules) rule.remaining -= 1;
  game.activeRules = game.activeRules.filter((rule) => rule.remaining > 0);
}

function addRule(room, playerId, text, remaining) {
  room.game.activeRules.push({
    id: randomUUID(),
    playerId,
    playerName: nameOf(room, playerId),
    text,
    remaining,
  });
}

function advanceTurn(room) {
  const g = room.game;
  decrementRules(g); // uma jogada passou
  const order = connectedOrder(room);
  if (!order.length) {
    g.currentPlayerId = null;
    return;
  }
  // Modificador "Alvo Marcado": quem acabou de perder uma vida não sai da mira.
  // Consome-se a marca aqui (é de uso único por ronda) e o travão das repetições
  // vive no helpers.marcaAlvo — a mesa não fica a ver a mesma pessoa afundar.
  if (g.alvoMarcadoId) {
    const alvo = room.players.get(g.alvoMarcadoId);
    g.alvoMarcadoId = null;
    if (alvo && alvo.connected && !alvo.eliminated && order.length > 1) {
      g.currentPlayerId = alvo.id;
      pushFeed(room, '🎯', `Alvo Marcado: ${alvo.name} não sai da mira.`);
      return;
    }
    g.alvoSeguidas = 0;
  }

  // Um evento pode ter virado a mesa ao contrário (eventos.js: 'inversao').
  if (g.ordemInvertida) order.reverse();
  let idx = 0;
  if (g.currentPlayerId) {
    const cur = order.findIndex((p) => p.id === g.currentPlayerId);
    idx = cur === -1 ? 0 : (cur + 1) % order.length;
  }
  const proximo = order[idx].id;

  // A rotação continua a mandar. O Diretor só se intromete quando alguém anda
  // MESMO esquecido — e mesmo aí com um travão (ver director.escolheFoco).
  const foco = director.escolheFoco(room, director.leitura(room), proximo);
  g.currentPlayerId = foco?.id || proximo;
  if (foco?.saltou) {
    g.ultimoSaltoRonda = g.roundCount || 0;
    pushFeed(room, '🎬', `A vez saltou: ${foco.razao}.`);
  }
}

/**
 * Fecha a ronda e devolve a mesa à roda.
 *
 * Existe para haver UM sítio por onde todas as rondas acabam — antes eram sete
 * cópias de `advanceTurn + round = null + phase = 'wheel'`, e qualquer coisa que
 * tivesse de acontecer no fim de uma ronda tinha de ser escrita sete vezes (e
 * esquecida numa). É por aqui que o Diretor monta o final da noite.
 */
function fecharRonda(room, { limpaRonda = true } = {}) {
  const g = room.game;

  // MODO DA MORTE: as eliminações da ronda tratam-se aqui, num sítio só (há uma
  // dúzia de caminhos que eliminam alguém). Antes do `advanceTurn`, para a vez
  // não ir parar a quem acabou de sair.
  const ceifa = morte.varre(room);
  for (const c of ceifa.condenados) pushFeed(room, '💀', `Ronda condenada: ${c.name} está fora.`);
  for (const n of ceifa.novos) {
    pushFeed(room, '👻', `${n.name} saiu — e volta como fantasma, com cartas e um testamento.`);
  }

  advanceTurn(room);
  if (limpaRonda) g.round = null;

  // O final já foi jogado → a noite acaba aqui, com as estatísticas, em vez de
  // ficar à espera que alguém se lembre de carregar em "terminar".
  if (g.finale) {
    g.finale = false;
    g.finaleFeito = true;
    g.phase = 'gameover';
    g.finalStats = buildStats(room);
    room.status = 'ended';
    pushFeed(room, '🏁', 'E é assim que acaba a noite.');
    return g;
  }

  // MODO DA MORTE: acaba sozinho. Sobrou um → é o vencedor e a noite fecha, com
  // as estatísticas; sobraram dois → a próxima ronda é o duelo final. Nenhum dos
  // dois depende de alguém se lembrar de carregar em "terminar".
  const fim = morte.estadoDoFim(room);
  if (fim === 'fim') {
    g.phase = 'gameover';
    g.finalStats = buildStats(room);
    room.status = 'ended';
    const [ultimo] = connectedOrder(room);
    pushFeed(room, '🏆', ultimo ? `${ultimo.name} é o último de pé.` : 'Não sobrou ninguém.');
    return g;
  }
  if (g.morte) {
    // Recalculado a cada ronda, e não uma marca que fica: um fantasma pode
    // ressuscitar alguém e voltar a haver três à mesa — nesse caso o final
    // deixa de estar à porta e a roda volta a decidir o que sai.
    const eraFinal = g.morte.dueloFinal;
    g.morte.dueloFinal = fim === 'duelo';
    if (g.morte.dueloFinal && !eraFinal) {
      pushFeed(room, '⚔️', 'Restam dois. A próxima ronda é o duelo final — quem perder, sai.');
    }
  }
  morte.passaRonda(room); // liberta a carta de fantasma da ronda

  g.phase = 'wheel';
  eventos.passaRonda(g); // consome a trégua, se houver

  // O EVENTO DA NOITE cai ENTRE rondas, nunca a meio de uma: interromper uma
  // ronda a meio para anunciar um evento seria tirar a alguém a vez que já
  // estava a jogar. Aqui a mesa está entre coisas e pode olhar toda para o ecrã.
  let caiuAlgo = false;
  if (eventos.horaDeEvento(room)) {
    const ev = eventos.dispara(room);
    if (ev) {
      pushFeed(room, ev.emoji, ev.texto);
      caiuAlgo = true;
    }
  }

  // Regras com prazo que acabaram agora. Anuncia-se sempre: uma regra que se
  // desliga em silêncio é pior do que nunca ter existido — a mesa continua a
  // jogar com medo dela.
  for (const m of modificadores.passaRonda(room)) {
    pushFeed(room, m.emoji, `${m.label} acabou. Volta tudo ao normal.`);
  }

  // A REGRA NOVA cai entre rondas, pela mesma razão que o Evento — e nunca na
  // mesma ronda que ele: duas cartas de ecrã inteiro seguidas anulam-se, e a
  // segunda ninguém lê. Quem perde a vez é a regra, que fica agendada na mesma.
  if (!caiuAlgo && modificadores.horaDeSorteio(room)) {
    const nova = modificadores.sorteiaAMeio(room);
    if (nova) {
      pushFeed(
        room,
        nova.emoji,
        nova.rondas
          ? `Regra nova: ${nova.titulo} — durante ${nova.rondas} rondas. ${nova.desc}`
          : `Regra nova: ${nova.titulo}. ${nova.desc}`
      );
    }
  }

  // Chegou a hora do final? Anuncia-se ANTES de girar, para a mesa saber que o
  // que vem a seguir é o último momento — metade da graça é o aviso.
  if (director.horaDoFinal(room)) {
    g.finale = true;
    pushFeed(room, '🎬', 'Última ronda da noite. Façam com que conte.');
  }
  return g;
}

function pickQuestion(game, targetId) {
  let pool = game.questions.filter((q) => q.targetPlayerId === targetId && !q.used);
  if (!pool.length) {
    const all = game.questions.filter((q) => q.targetPlayerId === targetId);
    if (!all.length) return null;
    all.forEach((q) => (q.used = false));
    pool = all;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  q.used = true;
  return { text: q.text };
}

/**
 * Perfil de cada tipo na roda. Duas colunas, duas razões diferentes:
 *
 *   min  — nº MÍNIMO de jogadores ativos para o tipo fazer sentido. O Vasco com
 *          3 pessoas é uma acusação a dois; o Duelo com 3 deixa um a olhar. Um
 *          tipo abaixo do mínimo nem entra no sorteio.
 *   peso — RITMO da noite. Nem todos os tipos custam o mesmo tempo: a Pirâmide,
 *          o Vasco e o Desenha são de 5+ minutos e cansam se saírem seguidos;
 *          os curtos (desafio, eu nunca) aguentam sair muitas vezes. Peso alto
 *          = sai mais vezes. É aqui — e só aqui — que se afina a cadência.
 *
 * Um tipo que não esteja nesta tabela (conteúdo novo vindo da BD) entra com o
 * perfil neutro DEFAULT_PROFILE: nunca fica de fora por esquecimento.
 */
const TYPE_PROFILE = {
  desafio: { min: 2, peso: 12 },
  boca_calada: { min: 2, peso: 10 },
  eu_nunca: { min: 2, peso: 10 },
  isto_ou_aquilo: { min: 2, peso: 8 },
  termometro: { min: 2, peso: 7 },
  mais_provavel: { min: 3, peso: 8 },
  reacao: { min: 3, peso: 8 },
  quem_disse: { min: 3, peso: 7 },
  cascata: { min: 3, peso: 6 },
  intrigas: { min: 3, peso: 6 },
  segredos: { min: 3, peso: 6 },
  roleta_russa: { min: 2, peso: 6 },
  categoria_relampago: { min: 2, peso: 6 },
  mimica: { min: 3, peso: 5 },
  duelo: { min: 3, peso: 5 },
  desenho: { min: 3, peso: 4 },
  vasco: { min: 4, peso: 3 },
  piramide: { min: 3, peso: 3 },
  // Tipos "hardcore" (camada 3). Pesos deliberadamente moderados: são todos mais
  // longos ou mais expostos do que a média, e uma noite feita só disto cansa.
  bomba: { min: 3, peso: 8 }, // curto e barulhento → aguenta sair muitas vezes
  leilao: { min: 3, peso: 5 },
  sincronia: { min: 4, peso: 6 }, // precisa de dupla + mesa para pagar
  detetor: { min: 3, peso: 6 },
  julgamento: { min: 4, peso: 4 }, // réu + advogado + júri
  contrato: { min: 3, peso: 4 }, // deixa uma regra ativa atrás de si
};
const DEFAULT_PROFILE = { min: 2, peso: 6 };
// Quantos tipos recentes se evitam. Com sorteio uniforme entre 18 tipos, o mesmo
// saía outra vez dentro de 3 voltas em ~1 de cada 6 rondas — e a mesa nota.
const EVITAR_RECENTES = 2;

const perfil = (key) => TYPE_PROFILE[key] || DEFAULT_PROFILE;

/**
 * Escolhe o tipo da próxima volta.
 *
 * @param types    tipos disponíveis (repo.getGameTypes)
 * @param opts.jogadores  nº de jogadores ATIVOS (ligados e não eliminados)
 * @param opts.recentes   chaves das últimas voltas (mais recente primeiro)
 * @param opts.pesos      multiplicadores por tipo vindos do Diretor (1 = como está).
 *                        Ficam DEPOIS dos filtros de propósito: o Diretor afina a
 *                        probabilidade, mas nunca faz sair um tipo que a mesa não
 *                        tem gente para jogar.
 *
 * A ordem dos filtros importa: primeiro corta-se o que não SERVE (poucos
 * jogadores), depois o que ABORRECE (acabou de sair). O segundo filtro é
 * dispensável — se ao evitar os recentes ficasse quase nada, prefere-se repetir
 * um tipo a estreitar a roda a duas opções.
 */
export function pickWeightedType(types, { jogadores = 99, recentes = [], pesos = null } = {}) {
  if (!types?.length) return null;

  const cabem = types.filter((t) => jogadores >= perfil(t.key).min);
  // Mesa muito pequena (2 pessoas): fica o que houver, nem que seja tudo.
  let pool = cabem.length ? cabem : types;

  const evitar = new Set(recentes.slice(0, EVITAR_RECENTES));
  const frescos = pool.filter((t) => !evitar.has(t.key));
  if (frescos.length >= 3) pool = frescos;

  const pesoDe = (t) => Math.max(0.01, perfil(t.key).peso * (pesos?.[t.key] ?? 1));
  const total = pool.reduce((soma, t) => soma + pesoDe(t), 0);
  let bilhete = Math.random() * total;
  for (const t of pool) {
    bilhete -= pesoDe(t);
    if (bilhete <= 0) return t;
  }
  return pool[pool.length - 1];
}

/**
 * Apura a votação de intensidade do lobby. Maioria simples ganha; empate (ou
 * sem votos) → sorteia entre as empatadas (o "randomizer" que o cliente anima).
 */
export function tallyIntensity(room) {
  const counts = { leve: 0, picante: 0, hardcore: 0, caos: 0 };
  for (const v of Object.values(room.intensityVotes || {})) {
    if (counts[v] !== undefined) counts[v] += 1;
  }
  const max = Math.max(...Object.values(counts));
  let candidates = INTENSITIES.filter((k) => counts[k] === max && max > 0);
  if (!candidates.length) candidates = [...INTENSITIES]; // ninguém votou → sorteia entre todas
  const randomized = candidates.length > 1;
  const intensity = candidates[Math.floor(Math.random() * candidates.length)];
  return { intensity, randomized, candidates, counts };
}

export function initGame(
  room,
  // `lives` sem valor por omissão AQUI: o número por omissão depende do modo (ver
  // abaixo), e um default no destructuring ganhava-lhe sempre.
  {
    lives = null,
    intensity = 'leve',
    curve = true,
    duracaoMin = null,
    // Modificadores: ou SORTEADOS (`sorteio: true`, o caminho real — ver
    // game/modificadores.js) ou dados à mão. A lista explícita continua a
    // existir porque os testes precisam de ligar uma regra e só essa; sem ela,
    // testar "Sem Escape" era esperar que o sorteio calhasse nele.
    sorteio = false,
    vetados = [],
    modifiers = [],
  } = {}
) {
  // O Modo da Morte começa com menos vidas: duas dão um estado de "ferido" antes
  // do fim, e três arrastavam uma noite que vive de fechar depressa.
  const porOmissao = morte.ativo(room) ? morte.VIDAS_DEFEITO : DEFAULT_LIVES;
  const n = Math.max(MIN_LIVES, Math.min(MAX_LIVES, Number(lives) || porOmissao));
  for (const p of room.players.values()) {
    p.lives = n;
    p.eliminated = false; // novo jogo → todos voltam a jogar
  }

  resetBags(room); // conteúdo todo outra vez disponível (saco anti-repetição)
  clearFeed(room);

  room.game = {
    phase: 'prep',
    intensity: INTENSITIES.includes(intensity) ? intensity : 'leve',
    curve: !!curve, // a intensidade votada é o TETO; começa-se leve e sobe
    startedAt: Date.now(),
    startingLives: n,
    questions: [], // { id, targetPlayerId, authorPlayerId, text, used }
    secrets: [], // { id, authorPlayerId, text, used }
    round: null,
    roundCount: 0,
    recentTypes: [], // últimos tipos que saíram na roda (anti-repetição)
    currentPlayerId: null,
    stats: {},
    // --- Diretor da noite (game/director.js) ---
    plano: { duracaoMin: duracaoMin || null }, // null = noite sem fim previsto
    sinais: {}, // playerId -> { agiuEm, focoEm }: quem anda vivo e quem anda calado
    finale: false, // a próxima ronda é a última
    finaleFeito: false, // já houve final (não se monta outro)
    ultimoSaltoRonda: -99, // trava saltos de rotação seguidos
    // --- Evento da Noite (game/eventos.js) ---
    ultimoEvento: null, // o que caiu sobre a mesa (o cliente encena)
    tregua: 0, // rondas sem se perderem vidas
    ordemInvertida: false, // um evento pode virar a mesa ao contrário
    activeRules: [], // regras com duração: { id, playerId, playerName, text, remaining }
    // --- Modificadores da noite (game/modificadores.js) ---
    // A intensidade aqui é o TETO votado, não a da curva: o sorteio tem de saber
    // a que noite a mesa se comprometeu, não em que ponto dela vai.
    modifiers: sorteio
      ? modificadores.sorteia({ intensity, vetados })
      : modificadores.normaliza(modifiers),
    sorteio: !!sorteio, // …e há mais regras por cair durante a noite?
    vetados: modificadores.normaliza(vetados), // o que nunca pode calhar
    modifiersTemp: {}, // key -> rondas que ainda faltam (regras com prazo)
    modifiersFora: [], // regras cujo prazo já acabou: não voltam a sair
    ultimoModificador: null, // a última regra que caiu (o cliente encena)
    alvoMarcadoId: null, // "Alvo Marcado": quem fica na mira da próxima ronda
    alvoSeguidas: 0, // …e há quantas rondas seguidas (travão de repetições)
    // --- A Conta (game/divida.js) ---
    dividas: {}, // playerId -> goles em dívida
    heranca: null, // quem saiu a dever está a escolher herdeiro
    // --- Modo da Morte (game/morte.js): null nos outros modos ---
    morte: morte.ativo(room) ? morte.estadoInicial() : null,
    finalStats: null,
  };
  eventos.agendaProximo(room.game); // marca a ronda do primeiro evento
  if (sorteio) modificadores.agendaProximo(room.game); // …e a da primeira regra nova
  return room.game;
}

export function addQuestion(room, authorId, targetPlayerId, text) {
  const g = room.game;
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de escrever perguntas.');
  const author = room.players.get(authorId);
  const target = room.players.get(targetPlayerId);
  if (!author) throw new AppError('Jogador inválido.');
  if (!target) throw new AppError('Escolhe um jogador válido.');
  if (targetPlayerId === authorId) throw new AppError('Escolhe outro jogador (não tu).');
  const clean = sanitizeText(text, 200);
  if (clean.length < 3) throw new AppError('Escreve uma pergunta.');
  g.questions.push({ id: randomUUID(), targetPlayerId, authorPlayerId: authorId, text: clean, used: false });
  return g.questions.length;
}

export function addSecret(room, authorId, text) {
  const g = room.game;
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de escrever segredos.');
  const author = room.players.get(authorId);
  if (!author) throw new AppError('Jogador inválido.');
  const clean = sanitizeText(text, 200);
  if (clean.length < 3) throw new AppError('Escreve um segredo.');
  g.secrets.push({ id: randomUUID(), authorPlayerId: authorId, text: clean, used: false });
  return g.secrets.length;
}

export function beginPlay(room, playerId) {
  const g = room.game;
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode começar a jogar.');
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de começar.');
  const order = connectedOrder(room);
  if (order.length < 2) throw new AppError('São precisos pelo menos 2 jogadores ligados.');
  g.currentPlayerId = order[0].id;
  g.phase = 'wheel';
  return g;
}

/** O jogador da vez gira a roda: decide o TIPO e prepara a mecânica. */
export async function spinWheel(room, playerId) {
  const g = room.game;
  if (!g) throw new AppError('O jogo ainda não começou.');
  if (g.phase !== 'wheel') throw new AppError('Não é altura de girar a roda.');
  if (g.currentPlayerId !== playerId) throw new AppError('Só quem está à vez pode girar a roda.');

  const player = room.players.get(playerId);
  const types = await repo.getGameTypes();

  // O DIRETOR (game/director.js). A roda continua a girar no ecrã — o que muda é
  // o que está por trás dela: quem anda calado, quem já está a levar com tudo,
  // se a mesa acabou de aguentar três jogos longos, e em que ponto vai a noite.
  const l = director.leitura(room);
  const fase = director.faseDaNoite(room);
  let gt = pickWeightedType(types, {
    jogadores: l.jogadores,
    recentes: g.recentTypes || [],
    pesos: director.pesosDe(l, fase),
  });
  // MODO DA MORTE: restam dois → o Diretor não escolhe nada. A noite acaba com
  // um duelo frente a frente, e não com o que a roda calhar a dar.
  if (g.morte?.dueloFinal) gt = types.find((t) => t.key === 'duelo') || gt;
  if (!gt) throw new AppError('Não há tipos de jogo disponíveis.');
  g.recentTypes = [gt.key, ...(g.recentTypes || [])].slice(0, 4);
  director.registaFoco(room, playerId);
  const inten = effectiveIntensity(g); // curva: leve no aquecimento, sobe até ao teto votado

  const round = {
    id: randomUUID(),
    gameTypeKey: gt.key,
    gameTypeLabel: gt.label,
    currentPlayerId: playerId,
    currentPlayerName: player.name,
    prompt: null,
    status: 'pending',
    needsBuddy: false, // prompt de buddy → o jogador escolhe alguém que bebe junto
    buddyId: null,
    buddyName: null,
    ruleDuration: null, // se aceitar um prompt com duração → cria regra ativa
  };

  if (gt.key === 'boca_calada') {
    const q = pickQuestion(g, playerId) || (await pickPrompt(room, 'boca_calada', inten));
    round.prompt = q ? { text: q.text } : null;
    round.needsBuddy = !!q?.buddy;
    round.ruleDuration = q?.duration || null;
    g.phase = 'prompt';
  } else if (gt.key === 'desafio') {
    const p = await pickPrompt(room, 'desafio', inten);
    round.prompt = p ? { text: p.text } : null;
    round.needsBuddy = !!p?.buddy;
    round.ruleDuration = p?.duration || null;
    g.phase = 'prompt';
  } else if (gt.key === 'isto_ou_aquilo') {
    const p = await pickPrompt(room, 'isto_ou_aquilo', inten);
    const parts = String(p?.text || '||').split('||');
    round.options = [(parts[0] || '—').trim(), (parts[1] || '—').trim()];
    round.chosen = null;
    round.needsBuddy = !!p?.buddy;
    g.phase = 'choice';
  } else if (gt.key === 'intrigas') {
    const p = await pickPrompt(room, 'intrigas', inten);
    setupIntrigas(round, p?.text); // razão SERVER-SIDE (nunca no broadcast)
    g.phase = 'intrigas';
  } else if (gt.key === 'segredos') {
    const secret = pickSecret(g, playerId);
    if (secret) {
      setupSegredos(round, secret); // autor privado até ao reveal
      g.phase = 'guessing';
    } else {
      // Sem segredos submetidos → confissão simples (aceita/recusa).
      const p = await pickPrompt(room, 'segredos', inten);
      round.prompt = p ? { text: p.text } : null;
      g.phase = 'prompt';
    }
  } else if (gt.key === 'piramide') {
    round.prompt = null;
    dealPiramide(room, round); // dá as mãos (privadas) e monta a pirâmide
    g.phase = 'piramide';
  } else if (gt.key === 'vasco') {
    round.prompt = null;
    await dealVasco(room, round); // escolhe palavra + impostor(es), papéis privados
    g.phase = 'vasco';
  } else if (gt.key === 'categoria_relampago') {
    const p = await pickPrompt(room, 'categoria_relampago', inten);
    setupRelampago(round, p);
    g.phase = 'relampago';
  } else if (gt.key === 'mimica') {
    const p = await pickPrompt(room, 'mimica', inten);
    setupMimica(round, p); // palavra privada (canal mimica_word)
    g.phase = 'mimica';
  } else if (gt.key === 'roleta_russa') {
    const p = await pickPrompt(room, 'roleta_russa', inten);
    setupRoleta(round, p);
    g.phase = 'roleta';
  } else if (gt.key === 'duelo') {
    if (setupDuelo(room, round)) {
      g.phase = 'duelo';
    } else {
      // Sem adversário disponível (todos os outros saíram) → desafio simples.
      await fallbackDesafio(room, round, inten);
    }
  } else if (GRUPO_KEYS.includes(gt.key)) {
    // Jogos de mesa inteira: o quem_disse vive das perguntas da preparação.
    const p = gt.key === 'quem_disse' ? null : await pickPrompt(room, gt.key, inten);
    if (setupGrupo(room, round, gt.key, p)) g.phase = 'grupo';
    else await fallbackDesafio(room, round, inten); // ninguém escreveu perguntas
  } else if (gt.key === 'cascata') {
    if (setupCascata(room, round)) g.phase = 'cascata';
    else await fallbackDesafio(room, round, inten);
  } else if (gt.key === 'desenho') {
    const p = await pickPrompt(room, 'desenho', inten);
    setupDesenho(round, p); // palavra privada (canal desenho_word)
    g.phase = 'desenho';
  } else if (gt.key === 'reacao') {
    if (setupReacaoRoda(room, round)) g.phase = 'reacao';
    else await fallbackDesafio(room, round, inten);
  } else if (gt.key === 'bomba') {
    const p = await pickPrompt(room, 'bomba', inten);
    setupBomba(round, p, room); // pavio SERVER-SIDE
    g.phase = 'bomba';
  } else if (gt.key === 'leilao') {
    const p = await pickPrompt(room, 'leilao', inten);
    setupLeilao(room, round, p);
    g.phase = 'leilao';
  } else if (gt.key === 'sincronia') {
    const p = await pickPrompt(room, 'sincronia', inten);
    if (setupSincronia(room, round, p)) g.phase = 'sincronia';
    else await fallbackDesafio(room, round, inten);
  } else if (gt.key === 'detetor') {
    const p = await pickPrompt(room, 'detetor', inten);
    setupDetetor(round, p); // a marca "era verdade?" nunca vai no broadcast
    g.phase = 'detetor';
  } else if (gt.key === 'julgamento') {
    const p = await pickPrompt(room, 'julgamento', inten);
    if (setupJulgamento(room, round, p)) g.phase = 'julgamento';
    else await fallbackDesafio(room, round, inten);
  } else if (gt.key === 'contrato') {
    const p = await pickPrompt(room, 'contrato', inten);
    if (setupContrato(room, round, p)) g.phase = 'contrato';
    else await fallbackDesafio(room, round, inten);
  }

  // A segunda camada abre-se DEPOIS de a ronda estar montada — o Isto ou Aquilo
  // precisa das opções já sorteadas para as poder oferecer como aposta. Quem
  // está a jogar a ronda fica de fora: não se aposta em si próprio.
  palpites.abre(round, [round.currentPlayerId, round.buddyId, round.opponentId]);

  g.round = round;
  g.roundCount += 1;
  morte.abreRonda(room); // fotografa as vidas (a carta 💀 Condenar precisa disto)
  pushFeed(room, '🎡', `${player.name} girou a roda → ${round.gameTypeLabel}`);
  return round;
}

/** Rede de segurança: um tipo que não dá para montar agora vira um Desafio. */
async function fallbackDesafio(room, round, inten) {
  const p = await pickPrompt(room, 'desafio', inten);
  round.gameTypeKey = 'desafio';
  round.gameTypeLabel = 'Desafio';
  round.prompt = p ? { text: p.text } : null;
  room.game.phase = 'prompt';
}

/** Boca Calada / Desafio: aceitar (passa) ou recusar (bebe → vida/shot). */
export function resolveAction(room, playerId, action) {
  const g = room.game;
  if (!g || g.phase !== 'prompt' || !g.round) throw new AppError('Não há ronda ativa.');
  if (g.round.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  if (g.round.needsBuddy && !g.round.buddyId) throw new AppError('Escolhe primeiro o teu buddy 🤝.');

  const player = room.players.get(playerId);
  const st = statsFor(g, playerId);
  let effect;

  // Modificador "Dobro ou Nada": aceitar não fecha logo a ronda — quem quiser
  // arriscar entrega-se ao julgamento da mesa por mais uma vida.
  if (action === 'double') {
    if (!modificadores.podeDobrar(room, g.round)) throw new AppError('Não podes dobrar nesta ronda.');
    g.round.dobro = { aberto: true, resultado: null };
    g.round.status = 'doubling';
    veredito.abre(g.round, [playerId, g.round.buddyId], 'Cumpriu, a dobrar?');
    pushFeed(room, '🔁', `${player.name} foi a dobrar. A mesa decide.`);
    return { round: g.round, effect: { type: 'doubling', playerId }, gameOver: null };
  }

  // "Adiar" é uma recusa como as outras — a vida custa o mesmo. O que muda é que
  // o gole não se bebe agora: fica na conta, com juro, à vista de toda a mesa.
  const adiou = action === 'adiar';
  if (adiou && !divida.podeAdiar(room, playerId)) {
    throw new AppError('Não podes adiar agora — ou não está ligado, ou a conta está cheia.');
  }

  if (action === 'refuse' || adiou) {
    st.refusals += 1;
    if (adiou) {
      const total = divida.adia(room, playerId);
      pushFeed(room, '📿', `${player.name} adiou — fica a dever ${total} ${total === 1 ? 'gole' : 'goles'}`);
    } else {
      st.drinks += 1;
      pushFeed(room, '🍺', `${player.name} recusou e bebeu`);
    }

    // No Modo da Morte não há recusar: ou fazes, ou sais. É a primeira das três
    // regras do modo (ver game/morte.js) e a razão de ele existir.
    const saiPorRecusar = morte.ativo(room) || modificadores.morteSubita(room);
    if (saiPorRecusar && (g.tregua || 0) <= 0) {
      // Não há vidas a descontar — quem recusa sai. Note-se que NÃO se bebe mais
      // por isso: o castigo é a saída, e somar-lhe bebida seria mandar beber
      // mais precisamente quem a noite já castigou.
      effect = elimina(room, playerId, morte.ativo(room) ? 'recusou' : 'morte súbita');
      pushFeed(
        room,
        '💀',
        morte.ativo(room)
          ? `${player.name} recusou. Não há recusar — está fora.`
          : `Morte Súbita: ${player.name} recusou e está fora.`
      );
    } else {
      // Pelo helper partilhado (game/helpers.js) e não à mão: é ele que conhece a
      // regra do "sem vidas → shot", a trégua dos eventos e o Alvo Marcado.
      const custo = modificadores.custoRecusa(room);
      for (let i = 0; i < custo; i++) {
        const passo = perdeVida(room, playerId, { motivo: 'recusou' });
        effect = passo || effect;
        if (!passo || passo.type !== 'vida_perdida') break; // trégua ou já saiu
      }
      if (custo > 1 && effect?.type !== 'tregua') {
        pushFeed(room, '⛓️', `Sem Escape: a recusa do ${player.name} custou o dobro.`);
      }
      if (effect?.type === 'eliminated') pushFeed(room, '💀', `${player.name} ficou sem vidas — shot!`);
      if (effect?.type === 'tregua') pushFeed(room, '🛡️', `A trégua salvou o ${player.name}`);
    }
    g.round.status = 'refused';
  } else {
    effect = { type: 'accepted', playerId };
    pushFeed(room, '🎉', `${player.name} aceitou o desafio`);
    g.round.status = 'resolved';
  }

  // Quem sai com a conta por pagar deixa-a a alguém (game/divida.js). É o último
  // ato de quem sai — e é o que impede que sair signifique deixar de contar.
  if (effect?.type === 'eliminated') abreHerancaSeHouver(room, playerId);

  // A plateia apostou em aceitar/beber (game/palpites.js) — fecha-se com o que
  // aconteceu de facto, sem uma segunda fonte de verdade sobre a ronda. Adiar
  // conta como beber: a mesa apostou que ele não ia cumprir, e não cumpriu.
  palpites.resolve(room, action === 'refuse' || adiou ? 'bebe' : 'aceita');

  // Aceitar um desafio com duração → passa a regra ativa (N jogadas).
  const dur = action !== 'refuse' && !adiou ? g.round.ruleDuration : null;
  const ruleText = g.round.prompt?.text;
  fecharRonda(room, { limpaRonda: false }); // decrementa regras existentes... (já salta o eliminado)
  if (dur && ruleText) addRule(room, playerId, ruleText, dur); // ...e adiciona a nova com duração cheia

  // O final da noite (Diretor) já pode ter fechado o jogo dentro do fecharRonda.
  let gameOver = g.phase === 'gameover' ? g.finalStats : null;
  // Auto-fim: se sobrar ≤1 jogador ativo, o último de pé vence.
  if (!gameOver && player.eliminated && connectedOrder(room).length <= 1) {
    gameOver = buildStats(room);
    g.finalStats = gameOver;
    g.phase = 'gameover';
    room.status = 'ended';
  }
  return { round: g.round, effect, gameOver };
}

/**
 * Abre a herança de quem acabou de sair, se houver conta por pagar.
 *
 * Num sítio só porque há vários caminhos para a eliminação (recusa, Morte
 * Súbita, veredito, eventos) e a conta de quem sai não pode desaparecer só
 * porque saiu por uma porta em vez de outra.
 */
function abreHerancaSeHouver(room, playerId) {
  const h = divida.abreHeranca(room, playerId);
  if (h) {
    pushFeed(room, '👑', `${h.deName} saiu a dever ${h.golos}. Escolhe quem herda a conta.`);
  }
  return h;
}

/** Quem saiu escolhe (ou o auto-resolve sorteia) a quem deixa a conta. */
export function escolheHerdeiro(room, playerId, escolhidoId) {
  const res = divida.escolheHerdeiro(room, playerId, escolhidoId);
  pushFeed(room, '👑', `${res.deName} deixou ${res.golos} goles ao ${res.herdeiroName}.`);
  return res;
}

// ----- Modo da Morte: as ações de quem já saiu -------------------------------

/**
 * Um fantasma joga uma carta. É o game.js que faz isto (e não o morte.js
 * sozinho) porque a carta 🎯 Marcar mexe na ROTAÇÃO DA VEZ, e a rotação é daqui.
 */
export function fantasmaJogaCarta(room, playerId, key, alvoId) {
  const res = morte.jogaCarta(room, playerId, key, alvoId);
  if (res.marcar) {
    room.game.alvoMarcadoId = res.marcar;
    room.game.alvoSeguidas = 0; // uma carta não conta para o travão do modificador
  }
  pushFeed(room, res.emoji, res.texto);
  return res;
}

/** O testamento de quem saiu: uma regra que vale até ao fim da noite. */
export function deixaTestamento(room, playerId, texto) {
  const res = morte.escreveTestamento(room, playerId, texto);
  // `Infinity` e não um número grande: isto não é uma regra com duração que por
  // acaso dura muito — é uma regra que não expira, e o `decrementRules` já
  // filtra por `remaining > 0`.
  addRule(room, res.deId, `👻 ${res.deName} deixou: ${res.texto}`, Infinity);
  pushFeed(room, '📜', `Testamento de ${res.deName}: ${res.texto}`);
  return res;
}

/** A mão privada de um fantasma (entrega individual, nunca no broadcast). */
export function maoFantasma(room, playerId) {
  return morte.mao(room, playerId);
}

export { fechaTestamento } from './game/morte.js';

/** Alguém assume a conta de outro — e ganha uma vida por o fazer. */
export function transfereDivida(room, deId, paraId) {
  const res = divida.transfere(room, deId, paraId);
  pushFeed(room, '📿', `${res.paraName} assumiu os ${res.golos} goles do ${res.deName} — e ganhou uma vida.`);
  return res;
}

/** A conta de alguém vence agora (evento do Cobrador, fim da noite). */
export function cobraDivida(room, playerId) {
  const golos = divida.cobra(room, playerId);
  if (golos) pushFeed(room, '📿', `${nameOf(room, playerId)} pagou a conta: ${golos} goles.`);
  return golos;
}

/**
 * Contrato: assinar (ou recusar). Passa pelo game.js e não é um re-export direto
 * porque um pacto aceite vira uma REGRA ATIVA, e as `activeRules` são daqui — é
 * o mesmo mecanismo dos desafios com duração, e não vale a pena ter dois.
 */
export function contratoAssina(room, playerId, aceita) {
  return aplicaContrato(room, contratoAssinaRaw(room, playerId, aceita));
}

/** Auto-resolve: quem não assinou a tempo recusou (ver game/contrato.js). */
export function contratoExpira(room) {
  return aplicaContrato(room, contratoExpiraRaw(room));
}

function aplicaContrato(room, res) {
  if (res.fechado) {
    if (res.regra) {
      addRule(room, room.game.round.currentPlayerId, res.regra.texto, res.regra.jogadas);
      pushFeed(room, '🤝', `Contrato assinado: ${res.regra.texto}`);
    } else {
      const quem = res.round.result.recusaram.map((p) => p.name).join(' e ');
      pushFeed(room, '✍️', `O contrato caiu — ${quem || 'ninguém'} não assinou.`);
    }
  }
  return res;
}

/** Buddy: quem tem o desafio escolhe outro jogador que "bebe junto". */
export function chooseBuddy(room, playerId, buddyId) {
  const g = room.game;
  const r = g?.round;
  if (!g || !r || !r.needsBuddy) throw new AppError('Não há buddy a escolher.');
  if (r.currentPlayerId !== playerId) throw new AppError('Só quem tem o desafio escolhe o buddy.');
  if (r.buddyId) throw new AppError('Já escolheste o buddy.');
  const buddy = room.players.get(buddyId);
  if (!buddy || !buddy.connected) throw new AppError('Escolhe um jogador válido.');
  if (buddyId === playerId) throw new AppError('Escolhe outra pessoa.');
  r.buddyId = buddyId;
  r.buddyName = buddy.name;
  return r;
}

/** Isto ou Aquilo: o jogador da vez escolhe a opção 0 ou 1. Mostra e espera "continuar". */
export function chooseOption(room, playerId, index) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'choice' || !r) throw new AppError('Não há escolha ativa.');
  if (r.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  if (r.needsBuddy && !r.buddyId) throw new AppError('Escolhe primeiro o teu buddy 🤝.');
  const i = Number(index);
  if (i !== 0 && i !== 1) throw new AppError('Escolha inválida.');
  r.chosen = i;
  r.status = 'resolved';
  palpites.resolve(room, String(i));
  return r;
}

/** Força o reveal do Segredos (host ou quem girou), sem todos terem adivinhado. */
export function revealResult(room, playerId) {
  const g = room.game;
  if (!g || !g.round) throw new AppError('Nada para revelar.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== g.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode revelar.');
  if (g.phase === 'guessing' && !g.round.revealed) revealSegredos(room);
  else if (g.phase === 'vasco' && g.round.substate === 'voting') tallyVascoVotes(room);
  else if (g.phase === 'vasco' && g.round.substate === 'redemption') buildVascoResult(room); // força: sem redenção → falha
  else throw new AppError('Nada para revelar.');
  return g.round;
}

/** Avança para a próxima vez (após reveal de Intrigas/Segredos ou fim da Piramide). */
export function continueRound(room, playerId) {
  const g = room.game;
  if (!g) throw new AppError('O jogo ainda não começou.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== g.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode continuar.');

  // Piramide: só se fecha no resumo final; aí aplica o prémio (+1 vida a quem fez beber mais).
  if (g.phase === 'piramide') {
    if (g.round?.substate !== 'summary') throw new AppError('A pirâmide ainda não terminou.');
    const winners = g.round.summary?.winners || [];
    for (const w of winners) {
      const winner = room.players.get(w.id);
      if (winner) winner.lives += 1;
    }
    fecharRonda(room);
    return { game: g, rewarded: winners };
  }

  // Jogo do Vasco: fecha-se no resultado (prémio +1 vida já aplicado no reveal).
  if (g.phase === 'vasco') {
    if (g.round?.substate !== 'result') throw new AppError('O Jogo do Vasco ainda não terminou.');
    fecharRonda(room);
    return { game: g, rewarded: [] };
  }

  // Tipos que se fecham com um veredicto simples (escolha / marcação manual):
  // só avançam depois de a ronda estar resolvida.
  if (
    [
      'choice', 'relampago', 'mimica', 'roleta', 'duelo', 'grupo', 'cascata', 'desenho', 'reacao',
      // Tipos da camada 3: todos fecham num ecrã de resultado que a mesa lê antes
      // de a vez passar — a mesma regra dos outros, e por isso a mesma lista.
      'bomba', 'leilao', 'sincronia', 'detetor', 'julgamento', 'contrato',
    ].includes(g.phase)
  ) {
    if (g.round?.status !== 'resolved') throw new AppError('Esta ronda ainda não terminou.');
    fecharRonda(room);
    return { game: g, rewarded: [] };
  }

  // Dobro ou Nada: a ronda de prompt fica aberta enquanto a mesa julga.
  if (g.phase === 'prompt' && g.round?.dobro) {
    if (g.round.status !== 'resolved') throw new AppError('A mesa ainda está a decidir.');
    fecharRonda(room);
    return { game: g, rewarded: [] };
  }

  if (!['intrigas', 'guessing'].includes(g.phase)) throw new AppError('Nada a continuar.');
  fecharRonda(room);
  return { game: g, rewarded: [] };
}

/**
 * Fecha a ronda atual e passa a vez, sem veredicto nem castigo. É a última linha
 * do auto-resolve (autoresolve.js) para fases com sub-passos a mais (Piramide,
 * Vasco) em que adivinhar a intenção da mesa seria pior do que seguir em frente.
 */
export function abandonRound(room) {
  const g = room.game;
  if (!g || ['prep', 'gameover'].includes(g.phase)) return g;
  fecharRonda(room);
  return g;
}

export function skipTurn(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode saltar.');
  const g = room.game;
  if (!g || g.phase === 'prep' || g.phase === 'gameover')
    throw new AppError('Não há vez para saltar.');
  fecharRonda(room);
  return g;
}

export function endGame(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode terminar.');
  if (!room.game) throw new AppError('O jogo ainda não começou.');
  const stats = buildStats(room);
  room.game.phase = 'gameover';
  room.game.finalStats = stats;
  room.status = 'ended';
  return stats;
}

/**
 * Alguém entrou com o jogo a decorrer (ver rooms.joinRoom).
 *
 * A Roda não precisa de lugar marcado: a vez roda por `connectedOrder`, e quem
 * chega já lá está. Só há duas coisas a acertar — as vidas, que têm de ser as
 * MESMAS com que a mesa começou (senão quem chega tarde joga com outra regra), e
 * o aviso no feed, para ninguém levar um susto com um nome novo no ecrã.
 *
 * As perguntas dirigidas (Boca Calada) não existem para quem chegou tarde —
 * `pickQuestion` já cai para o banco de prompts nesse caso.
 */
export function addLatecomer(room, player) {
  const g = room.game;
  if (!g) return;
  player.lives = g.startingLives ?? DEFAULT_LIVES;
  player.eliminated = false;
  pushFeed(room, '👋', `${player.name} entrou a meio do jogo`);
  if (!g.currentPlayerId) advanceTurn(room); // mesa estava vazia → é a vez dele
}

export function resetToLobby(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode voltar ao lobby.');
  room.game = null;
  room.board = null; // limpa o tabuleiro (mantém o modo escolhido)
  room.tournament = null; // e o quadro do torneio
  room.status = 'lobby';
  room.intensityVotes = {}; // nova votação de intensidade
  return room;
}

function buildStats(room) {
  const g = room.game;
  // A CONTA FECHA. Uma dívida que nunca vence é decoração — e sem isto adiar era
  // uma forma gratuita de nunca beber. O que se devia entra nos goles do fim.
  const contaFinal = g.modifiers?.includes('divida') ? divida.contas(room) : [];
  if (contaFinal.length) {
    divida.cobraTudo(room);
    pushFeed(room, '📿', `A conta fechou: ${contaFinal.map((c) => `${c.name} ${c.golos}`).join(' · ')}`);
  }
  const rows = [...room.players.values()]
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((p) => {
      const s = g.stats[p.id] || { drinks: 0, refusals: 0, shots: 0 };
      return {
        id: p.id,
        name: p.name,
        lives: p.lives,
        eliminated: p.eliminated,
        drinks: s.drinks,
        refusals: s.refusals,
        shots: s.shots,
      };
    });
  const top = (key) =>
    rows.reduce((best, r) => (r[key] > (best?.[key] ?? -1) && r[key] > 0 ? r : best), null);
  const alive = rows.filter((r) => !r.eliminated);
  const survivor = alive.length === 1 ? alive[0] : null; // último de pé
  return {
    rows,
    roundCount: g.roundCount,
    mostDrinks: top('drinks'),
    mostRefusals: top('refusals'),
    survivor,
    contaFinal, // quem tinha conta aberta quando a noite acabou (📿 A Conta)
  };
}

/** Serializa a ronda para a rede — anonimiza votos/segredos até ao reveal. */
function serializeRound(g) {
  const r = g.round;
  if (!r) return null;
  const base = {
    id: r.id,
    gameTypeKey: r.gameTypeKey,
    gameTypeLabel: r.gameTypeLabel,
    currentPlayerId: r.currentPlayerId,
    currentPlayerName: r.currentPlayerName,
    prompt: r.prompt,
    status: r.status,
    needsBuddy: !!r.needsBuddy,
    buddyId: r.buddyId || null,
    buddyName: r.buddyName || null,
    // Segunda camada: enquanto um joga, a mesa aposta (game/palpites.js).
    palpite: palpites.serialize(r),
  };
  // Modificador "Dobro ou Nada": o botão só aparece a quem pode dobrar AGORA, e
  // a faixa de veredito é a mesma dos jogos a tempo (client já a sabe desenhar).
  if (r.dobro) {
    base.dobro = { aberto: !!r.dobro.aberto, resultado: r.dobro.resultado || null };
    base.veredito = veredito.serialize(r);
  }
  if (r.gameTypeKey === 'isto_ou_aquilo') {
    base.options = r.options || [];
    base.chosen = r.chosen ?? null;
  }
  if (r.gameTypeKey === 'intrigas') serializeIntrigas(base, r);
  if (r.gameTypeKey === 'segredos') serializeSegredos(base, r);
  if (r.gameTypeKey === 'piramide') serializePiramide(base, r);
  if (r.gameTypeKey === 'vasco') serializeVasco(base, r);
  if (r.gameTypeKey === 'categoria_relampago') serializeRelampago(base, r);
  if (r.gameTypeKey === 'mimica') serializeMimica(base, r);
  if (r.gameTypeKey === 'roleta_russa') serializeRoleta(base, r);
  if (r.gameTypeKey === 'duelo') serializeDuelo(base, r);
  if (GRUPO_KEYS.includes(r.gameTypeKey)) serializeGrupo(base, r);
  if (r.gameTypeKey === 'cascata') serializeCascata(base, r);
  if (r.gameTypeKey === 'desenho') serializeDesenho(base, r);
  if (r.gameTypeKey === 'reacao') serializeReacaoRoda(base, r);
  if (r.gameTypeKey === 'bomba') serializeBomba(base, r);
  if (r.gameTypeKey === 'leilao') serializeLeilao(base, r);
  if (r.gameTypeKey === 'sincronia') serializeSincronia(base, r);
  if (r.gameTypeKey === 'detetor') serializeDetetor(base, r);
  if (r.gameTypeKey === 'julgamento') serializeJulgamento(base, r);
  if (r.gameTypeKey === 'contrato') serializeContrato(base, r);
  return base;
}

/** Serializa o estado de jogo para o payload de rede. */
export function serializeGame(room) {
  const g = room.game;
  if (!g) return null;
  return {
    phase: g.phase,
    intensity: effectiveIntensity(g), // a que está em vigor AGORA (curva)
    intensityCeiling: g.intensity, // a votada no lobby (teto da noite)
    curve: !!g.curve,
    // --- Diretor: o arco da noite, para o cliente poder anunciá-lo ---
    faseNoite: director.faseDaNoite(room), // aquecimento | meio | final
    finale: !!g.finale, // a PRÓXIMA ronda é a última
    duracaoMin: g.plano?.duracaoMin || null,
    // --- Evento da Noite ---
    ultimoEvento: g.ultimoEvento || null,
    tregua: g.tregua || 0,
    // --- Modificadores (game/modificadores.js) ---
    modifiers: g.modifiers || [],
    modifiersTemp: { ...(g.modifiersTemp || {}) }, // key -> rondas que faltam
    ultimoModificador: g.ultimoModificador || null, // a regra nova, para encenar
    morteSubita: modificadores.morteSubita(room), // já está a valer? (banner + botões)
    podeDobrar: modificadores.podeDobrar(room, g.round), // mostra o botão "dobrar"
    alvoMarcadoId: g.alvoMarcadoId || null,
    // --- Modo da Morte (game/morte.js): null nos outros modos ---
    morte: morte.serialize(room),
    // --- A Conta (game/divida.js): null quando o modificador está desligado ---
    divida: divida.serialize(room),
    podeAdiar: divida.podeAdiar(room, g.currentPlayerId),
    ordemInvertida: !!g.ordemInvertida,
    startingLives: g.startingLives,
    roundCount: g.roundCount,
    currentPlayerId: g.currentPlayerId,
    finalStats: g.finalStats,
    activeRules: (g.activeRules || []).map((r) => ({
      id: r.id,
      playerId: r.playerId,
      playerName: r.playerName,
      text: r.text,
      remaining: r.remaining,
    })),
    round: serializeRound(g),
    questionCount: g.questions.length,
    questionsByTarget: g.questions.reduce((m, q) => {
      m[q.targetPlayerId] = (m[q.targetPlayerId] || 0) + 1;
      return m;
    }, {}),
    secretCount: g.secrets.length,
  };
}
