// F&D — o Diretor da noite.
//
// O PROBLEMA
//
// Até aqui cada ronda era um sorteio independente. Nada no sistema sabia que o
// Zé não abre a boca há um quarto de hora, que a Ana já bebeu o dobro da mesa,
// ou que acabaram de sair três jogos longos seguidos. O único arco que existia
// era a curva de intensidade — e essa é uma função do relógio, não da mesa.
//
// A IDEIA
//
// A roda continua a girar no ecrã: a animação é boa e é ritual, e ninguém quer
// que o jogo pareça estar a ser decidido por um computador. O que muda é o que
// está POR TRÁS dela. O Diretor lê a mesa e escolhe o próximo momento como um
// anfitrião faria: dá o palco a quem está calado, alivia quem já está a levar
// com tudo, mete um jogo curto depois de dois longos, e sabe quando é hora de
// montar o final.
//
// A DIVISÃO DO TRABALHO
//
//   leitura(room)          — o que se passa na mesa, em números. Sem opiniões.
//   pesosDe(leitura)       — traduz a leitura em multiplicadores por tipo.
//   escolheFoco(room, l)   — a rotação continua a mandar; o Diretor só salta
//                            quando alguém anda MESMO esquecido.
//   faseDaNoite(room)      — aquecimento · meio · final.
//
// Manter isto separado é o que permite testar cada peça sem simular uma noite
// inteira: a leitura é uma função do estado, os pesos são uma função da leitura.
//
// O QUE NADA MAIS DESBLOQUEIA: UM FIM
//
// Hoje a noite acaba quando alguém se lembra de carregar em "terminar" — o pior
// momento possível, porque é sempre a meio de qualquer coisa. Com uma duração
// planeada (o host escolhe no lobby), o Diretor sabe quanto falta e monta um
// FINAL: anuncia-o, escolhe o tipo mais forte que a mesa aguenta e põe lá as
// pessoas certas. Depois disso o jogo termina sozinho, com as estatísticas.

import { connectedOrder } from './helpers.js';

// ----- Perfil dramatúrgico dos tipos ----------------------------------------
//
// O `min`/`peso` de cada tipo continuam em game.js (são regras de mesa: quantos
// jogadores são precisos e com que frequência aparece). Aqui fica o que só
// interessa ao Diretor — o PAPEL de cada tipo numa noite:
//
//   custo     quanto tempo/energia consome (1 curto · 2 médio · 3 longo)
//   holofote  põe UMA pessoa no meio (bom para quem anda calado)
//   mesa      toda a gente joga ao mesmo tempo (bom para reacender a sala)
//   clímax    aguenta ser o último momento da noite
//
const PAPEL = {
  desafio: { custo: 1, holofote: true, mesa: false, climax: true },
  boca_calada: { custo: 1, holofote: true, mesa: false, climax: true },
  isto_ou_aquilo: { custo: 1, holofote: true, mesa: false, climax: false },
  roleta_russa: { custo: 2, holofote: true, mesa: false, climax: true },
  categoria_relampago: { custo: 1, holofote: true, mesa: false, climax: false },
  mimica: { custo: 2, holofote: true, mesa: true, climax: false },
  desenho: { custo: 3, holofote: true, mesa: true, climax: false },
  duelo: { custo: 1, holofote: true, mesa: false, climax: true },
  eu_nunca: { custo: 1, holofote: false, mesa: true, climax: false },
  mais_provavel: { custo: 1, holofote: false, mesa: true, climax: false },
  termometro: { custo: 1, holofote: false, mesa: true, climax: false },
  quem_disse: { custo: 1, holofote: false, mesa: true, climax: false },
  reacao: { custo: 1, holofote: false, mesa: true, climax: false },
  cascata: { custo: 1, holofote: false, mesa: true, climax: false },
  intrigas: { custo: 2, holofote: true, mesa: true, climax: true },
  segredos: { custo: 2, holofote: false, mesa: true, climax: true },
  vasco: { custo: 3, holofote: false, mesa: true, climax: true },
  piramide: { custo: 3, holofote: false, mesa: true, climax: false },
};
const PAPEL_NEUTRO = { custo: 2, holofote: false, mesa: false, climax: false };

export const papelDe = (key) => PAPEL[key] || PAPEL_NEUTRO;

// Quanto tempo alguém pode ficar sem AGIR antes de a mesa o ter perdido. Não é
// o tempo sem ser o jogador da vez (isso é a rotação): é sem tocar no telemóvel.
const CALADO_MS = 6 * 60 * 1000;
// De quantas em quantas rondas, no máximo, o Diretor pode saltar a rotação para
// ir buscar alguém. Sem este travão deixava de haver rotação nenhuma.
const SALTO_A_CADA = 4;
// Acima disto (em relação à mediana) considera-se que alguém está a levar com
// tudo e alivia-se — não por bondade, por ritmo: quem já não aguenta desiste.
const CARGA_ALTA = 1.6;

// ----- 1. Leitura da mesa ----------------------------------------------------

/**
 * Fotografia da mesa em números. Função pura do estado — sem decisões.
 *
 * @returns {{
 *   jogadores:number, minutos:number, rondas:number,
 *   calados:Array<{id,name,silencioMs}>, sobrecarregados:string[], poupados:string[],
 *   cargaRecente:number, medianaGolos:number
 * }}
 */
export function leitura(room, agora = Date.now()) {
  const g = room.game;
  const ativos = connectedOrder(room);
  const sinais = g?.sinais || {};

  const golos = ativos.map((p) => g?.stats?.[p.id]?.drinks || 0);
  const medianaGolos = mediana(golos);

  const calados = ativos
    .map((p) => ({
      id: p.id,
      name: p.name,
      // Quem nunca agiu conta desde o início do jogo, não desde a época zero.
      silencioMs: agora - (sinais[p.id]?.agiuEm || g?.startedAt || agora),
    }))
    .filter((p) => p.silencioMs >= CALADO_MS)
    .sort((a, b) => b.silencioMs - a.silencioMs);

  // Quem está a levar com tudo (e quem tem escapado a tudo). Com a mesa toda a
  // zero — início da noite — não há sobrecarregados nem poupados.
  const sobrecarregados = medianaGolos > 0
    ? ativos.filter((p) => (g.stats?.[p.id]?.drinks || 0) > medianaGolos * CARGA_ALTA).map((p) => p.id)
    : [];
  const poupados = medianaGolos > 0
    ? ativos.filter((p) => (g.stats?.[p.id]?.drinks || 0) < medianaGolos * 0.5).map((p) => p.id)
    : [];

  // Peso dos últimos três tipos: é isto que diz se a mesa precisa de respirar.
  const recentes = (g?.recentTypes || []).slice(0, 3);
  const cargaRecente = recentes.reduce((soma, k) => soma + papelDe(k).custo, 0);

  return {
    jogadores: ativos.length,
    minutos: g?.startedAt ? (agora - g.startedAt) / 60000 : 0,
    rondas: g?.roundCount || 0,
    calados,
    sobrecarregados,
    poupados,
    cargaRecente,
    medianaGolos,
  };
}

// ----- 2. Fase da noite ------------------------------------------------------

/**
 * Em que ponto da noite estamos.
 *
 * Sem duração planeada (`plano.duracaoMin` a null) a noite não tem fim previsto
 * e nunca entra em 'final' — é o host que termina, como sempre foi. Quem escolhe
 * uma duração ganha um arco: aquece, joga, e acaba com alguma coisa.
 */
export function faseDaNoite(room, agora = Date.now()) {
  const g = room.game;
  if (!g) return 'aquecimento';
  if (g.finale) return 'final';

  const rondas = g.roundCount || 0;
  const duracao = g.plano?.duracaoMin;
  if (!duracao) return rondas < 4 ? 'aquecimento' : 'meio';

  const minutos = g.startedAt ? (agora - g.startedAt) / 60000 : 0;
  const decorrido = minutos / duracao;
  if (decorrido >= 0.88) return 'final';
  if (decorrido < 0.15 && rondas < 4) return 'aquecimento';
  return 'meio';
}

/** Está na hora de montar o final? (só uma vez, e só com mesa para isso) */
export function horaDoFinal(room, agora = Date.now()) {
  const g = room.game;
  if (!g || g.finale || g.finaleFeito) return false;
  if (!g.plano?.duracaoMin) return false;
  if (connectedOrder(room).length < 2) return false;
  return faseDaNoite(room, agora) === 'final';
}

// ----- 3. Pesos ---------------------------------------------------------------

/**
 * Traduz a leitura em multiplicadores por tipo (1 = deixa como está).
 *
 * Cada regra aqui tem uma razão de mesa, não de código:
 *
 *  · a mesa acabou de levar com jogos longos     → puxa os curtos
 *  · há gente calada há muito tempo              → puxa os de holofote
 *  · o aquecimento não é sítio para o Vasco      → segura os longos no início
 *  · o final quer um tipo que aguente ser o fim  → só clímax
 */
export function pesosDe(l, fase = 'meio') {
  // Todos os tipos começam em 1, mesmo os que nenhuma regra toca. Um mapa
  // esparso obrigava quem lê (e quem testa) a saber de cor que "ausente" quer
  // dizer "1" — e comparar dois mapas passava a comparar undefined com números.
  const pesos = Object.fromEntries(Object.keys(PAPEL).map((k) => [k, 1]));
  const multiplica = (key, fator) => {
    pesos[key] *= fator;
  };

  for (const key of Object.keys(PAPEL)) {
    const papel = papelDe(key);

    // Ritmo: três jogos longos seguidos cansam qualquer mesa.
    if (l.cargaRecente >= 7) multiplica(key, papel.custo === 1 ? 2.2 : 0.35);
    else if (l.cargaRecente <= 3) multiplica(key, papel.custo >= 2 ? 1.4 : 1);

    // Gente calada: dá-lhes o palco (ou acende a mesa toda).
    if (l.calados.length) {
      if (papel.holofote) multiplica(key, 1.8);
      else if (papel.mesa) multiplica(key, 1.3);
      else multiplica(key, 0.7);
    }

    // Aquecimento: nada de jogos de 5 minutos com a mesa ainda fria.
    if (fase === 'aquecimento') {
      if (papel.custo === 3) multiplica(key, 0.15);
      if (papel.mesa) multiplica(key, 1.5); // toda a gente a jogar quebra o gelo
    }

    // Final: só o que aguenta ser o último momento da noite.
    if (fase === 'final') multiplica(key, papel.climax ? 3 : 0.1);
  }

  return pesos;
}

// ----- 4. Foco ----------------------------------------------------------------

/**
 * Quem joga a seguir.
 *
 * A rotação sequencial continua a ser a regra — é justa, é previsível e foi uma
 * decisão de produto ("quem gira a roda é o jogador da vez"). O Diretor só se
 * intromete quando alguém anda MESMO esquecido, e mesmo aí no máximo de
 * SALTO_A_CADA rondas. Um diretor que decide tudo deixa de haver jogo.
 *
 * @returns {{ id:string, saltou:boolean, razao:string|null }|null}
 */
export function escolheFoco(room, l, proximoNaRotacao) {
  const g = room.game;
  if (!l.calados.length) return { id: proximoNaRotacao, saltou: false, razao: null };

  const desdeOSalto = (g.roundCount || 0) - (g.ultimoSaltoRonda ?? -SALTO_A_CADA);
  if (desdeOSalto < SALTO_A_CADA) return { id: proximoNaRotacao, saltou: false, razao: null };

  const esquecido = l.calados[0];
  if (!esquecido || esquecido.id === proximoNaRotacao) {
    return { id: proximoNaRotacao, saltou: false, razao: null };
  }
  return {
    id: esquecido.id,
    saltou: true,
    razao: `${esquecido.name} anda calado há um bocado`,
  };
}

// ----- 5. Sinais --------------------------------------------------------------

/**
 * Regista que um jogador FEZ alguma coisa.
 *
 * Chamado do middleware do socket, por isso passa por aqui tudo o que um
 * telemóvel envia. É de propósito: qualquer toque conta como estar presente, e
 * não é preciso instrumentar cinquenta handlers um a um (nem lembrar-se de o
 * fazer no próximo).
 */
export function registaAcao(room, playerId, agora = Date.now()) {
  const g = room?.game;
  if (!g || !playerId) return;
  const sinais = (g.sinais ||= {});
  (sinais[playerId] ||= {}).agiuEm = agora;
}

/** Regista que alguém foi o protagonista de uma ronda. */
export function registaFoco(room, playerId, agora = Date.now()) {
  const g = room?.game;
  if (!g || !playerId) return;
  const sinais = (g.sinais ||= {});
  (sinais[playerId] ||= {}).focoEm = agora;
  // Estar no meio da ronda também conta como estar presente.
  sinais[playerId].agiuEm = agora;
}

function mediana(nums) {
  if (!nums.length) return 0;
  const ord = [...nums].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}
