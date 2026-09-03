// F&D — o Evento da Noite.
//
// O PROBLEMA
//
// A roda era monótona: dezoito tipos, mas sempre o mesmo CONTRATO — uma pessoa
// faz uma coisa, alguém bebe, passa a vez. Nada abanava a mesa toda de uma vez,
// e nada mudava a situação de quem já estava a ganhar ou a perder. Havia também
// pouca coisa a custar vidas, o que fazia as vidas parecerem decorativas.
//
// A IDEIA
//
// De tempos a tempos, entre rondas, cai um EVENTO sobre a mesa inteira. Pode ser
// bom ou mau, e mexe em coisas que uma ronda normal não mexe: vidas, a ordem, a
// intensidade. É o único momento do jogo que não pergunta nada a ninguém — cai e
// pronto. É isso que o torna memorável.
//
// A metade BOA existe por três razões, não por simpatia:
//   1. um jogo em que só podem acontecer coisas más ensina a mesa a temer o ecrã;
//   2. equilibra as vidas que se perdem agora nos jogos a tempo (ver veredito.js);
//   3. faz valer a pena estar a perder — há eventos que só ajudam quem vai atrás.
//
// EQUILÍBRIO
//
// Os eventos são raros de propósito (ver \`DE_QUANTAS_EM_QUANTAS\`) e os que mexem
// em vidas são os mais raros de todos. Um evento que caia a toda a hora deixa de
// ser evento e passa a ser ruído — e um que tire vidas com frequência transforma
// a noite numa eliminatória em vez de um jogo.

import { connectedOrder, perdeVida, ganhaVida, drink, nameOf, shuffle } from './helpers.js';
import * as divida from './divida.js';

// De quantas em quantas rondas se tenta um evento. Não é fixo: sorteia-se uma
// janela para a mesa nunca conseguir prever "agora vem aí".
export const MIN_RONDAS = 5;
export const MAX_RONDAS = 9;

// Desliga-se com EVENTOS=0, como o SNAPSHOT e o AUTO_RESOLVE_MS. Serve os testes
// que medem goles ou vidas ao golo: um evento a cair a meio somava bebidas a
// toda a mesa e o teste falhava de vez em quando, sem nada de errado no código.
export const ENABLED = process.env.EVENTOS !== '0';

/**
 * O banco de eventos.
 *
 *   tom     'bom' | 'mau' — decide a animação no cliente (festa ou tempestade)
 *   peso    quanto mais alto, mais vezes sai
 *   aplica  (room) => { texto, alvos?, efeitos? }
 *
 * `efeitos` são os que o cliente anima um a um (perder/ganhar vida). O `texto` é
 * a frase que a mesa lê no ecrã e no feed.
 */
export const EVENTOS_RODA = [
  // ----- BONS -----------------------------------------------------------------
  {
    key: 'ronda_da_casa',
    tom: 'bom',
    emoji: '🍀',
    titulo: 'Ronda da casa',
    peso: 10,
    aplica: (room) => {
      const atras = maisAtras(room);
      if (!atras) return null;
      const efeito = ganhaVida(room, atras.id);
      return {
        texto: `${atras.name} estava a levar com tudo — a casa devolve-lhe uma vida.`,
        efeitos: efeito ? [efeito] : [],
      };
    },
  },
  {
    key: 'perdao_geral',
    tom: 'bom',
    emoji: '🕊️',
    titulo: 'Perdão geral',
    peso: 6,
    aplica: (room) => {
      const efeitos = [];
      for (const p of connectedOrder(room)) {
        const e = ganhaVida(room, p.id);
        if (e) efeitos.push(e);
      }
      return { texto: 'Toda a gente recupera uma vida. Aproveitem, que não se repete.', efeitos };
    },
  },
  {
    key: 'tregua',
    tom: 'bom',
    emoji: '🛡️',
    titulo: 'Trégua',
    peso: 9,
    aplica: (room) => {
      room.game.tregua = 2; // duas rondas sem se perderem vidas
      return { texto: 'Duas rondas de trégua: ninguém perde vidas (beber, bebe-se na mesma).' };
    },
  },
  {
    key: 'brinde',
    tom: 'bom',
    emoji: '🥂',
    titulo: 'Brinde',
    peso: 11,
    aplica: (room) => ({
      texto: 'Brinde obrigatório: toda a gente bebe um gole e ninguém perde nada.',
      efeitos: [],
      todosBebem: 1,
    }),
  },
  {
    key: 'perdao_de_contas',
    tom: 'bom',
    emoji: '🧾',
    titulo: 'Perdão de contas',
    peso: 5,
    aplica: (room) => {
      // Só sai quando o modificador "A Conta" está ligado E há conta aberta: um
      // evento que não muda nada é pior do que evento nenhum — a mesa olha para
      // o ecrã à espera de alguma coisa. Devolver null põe-no de parte.
      const abertas = divida.contas(room);
      if (!abertas.length) return null;
      const sortudo = abertas[0]; // o maior devedor — é onde faz diferença
      delete room.game.dividas[sortudo.id];
      return { texto: `A casa perdoa os ${sortudo.golos} goles do ${sortudo.name}. Conta limpa.` };
    },
  },

  // ----- MAUS -----------------------------------------------------------------
  {
    key: 'o_cobrador',
    tom: 'mau',
    emoji: '📿',
    titulo: 'O Cobrador',
    peso: 6,
    aplica: (room) => {
      const abertas = divida.contas(room);
      if (!abertas.length) return null;
      divida.cobraTudo(room);
      const lista = abertas.map((c) => `${c.name} ${c.golos}`).join(' · ');
      return { texto: `Chegou o Cobrador. As contas vencem AGORA: ${lista}.` };
    },
  },
  {
    key: 'tempestade',
    tom: 'mau',
    emoji: '⛈️',
    titulo: 'Tempestade',
    peso: 8,
    aplica: (room) => {
      const efeitos = [];
      for (const p of connectedOrder(room)) {
        const e = perdeVida(room, p.id, { motivo: 'a tempestade não poupou ninguém' });
        if (e) efeitos.push(e);
      }
      return { texto: 'Cai tudo ao mesmo tempo: menos uma vida para TODA a gente.', efeitos };
    },
  },
  {
    key: 'imposto_do_lider',
    tom: 'mau',
    emoji: '👑',
    titulo: 'Imposto do líder',
    peso: 11,
    aplica: (room) => {
      const lider = maisAFrente(room);
      if (!lider) return null;
      const e = perdeVida(room, lider.id, { motivo: 'imposto do líder' });
      return {
        texto: `${lider.name} está confortável de mais. Menos uma vida.`,
        efeitos: e ? [e] : [],
      };
    },
  },
  {
    key: 'roleta_da_mesa',
    tom: 'mau',
    emoji: '🎯',
    titulo: 'Roleta da mesa',
    peso: 9,
    aplica: (room) => {
      const ativos = connectedOrder(room);
      if (!ativos.length) return null;
      const azarado = ativos[Math.floor(Math.random() * ativos.length)];
      const e = perdeVida(room, azarado.id, { motivo: 'a roleta escolheu-o' });
      return { texto: `A roleta parou no ${azarado.name}. Menos uma vida.`, efeitos: e ? [e] : [] };
    },
  },
  {
    key: 'noite_a_serio',
    tom: 'mau',
    emoji: '🔥',
    titulo: 'A noite aquece',
    peso: 12,
    aplica: (room) => {
      const g = room.game;
      const niveis = ['leve', 'picante', 'hardcore', 'caos'];
      const i = niveis.indexOf(g.intensity);
      if (i < 0 || i === niveis.length - 1) return null;
      g.intensity = niveis[i + 1]; // sobe o TETO da noite
      g.curve = false; // e passa a valer já, sem esperar pela curva
      return { texto: `A noite sobe de tom: agora é ${niveis[i + 1].toUpperCase()}. Sem volta atrás.` };
    },
  },
  {
    key: 'inversao',
    tom: 'mau',
    emoji: '🔄',
    titulo: 'Inversão',
    peso: 10,
    aplica: (room) => {
      const g = room.game;
      g.ordemInvertida = !g.ordemInvertida;
      return { texto: 'A ordem da mesa inverte-se. Quem se ia safar, deixou de se safar.' };
    },
  },
  {
    key: 'todos_bebem',
    tom: 'mau',
    emoji: '🍺',
    titulo: 'Rodada geral',
    peso: 12,
    aplica: () => ({ texto: 'Rodada geral: três goles para toda a gente.', todosBebem: 3 }),
  },
];

/**
 * O banco do TABULEIRO.
 *
 * Aqui não há vidas — há posição numa corrida. Por isso os eventos mexem no que
 * ali importa: casas para a frente e para trás, e a ordem da corrida. É a mesma
 * ideia ("uma coisa que muda tudo, boa ou má") traduzida para a moeda do modo.
 */
export const EVENTOS_TABULEIRO = [
  // ----- BONS -----------------------------------------------------------------
  {
    key: 'boleia',
    tom: 'bom',
    emoji: '🚀',
    titulo: 'Boleia',
    peso: 12,
    aplica: (room) => {
      const b = room.board;
      const atras = ultimoNaCorrida(room);
      if (!atras) return null;
      b.players[atras.id].pos = Math.min(b.size - 1, b.players[atras.id].pos + 5);
      return { texto: `${atras.name} ia em último — apanha boleia de 5 casas.` };
    },
  },
  {
    key: 'vento_a_favor',
    tom: 'bom',
    emoji: '🍃',
    titulo: 'Vento a favor',
    peso: 10,
    aplica: (room) => {
      const b = room.board;
      for (const id of Object.keys(b.players)) {
        if (b.players[id].finished) continue;
        b.players[id].pos = Math.min(b.size - 1, b.players[id].pos + 2);
      }
      return { texto: 'Vento a favor: toda a gente avança 2 casas.' };
    },
  },
  {
    key: 'escudos',
    tom: 'bom',
    emoji: '🛡️',
    titulo: 'Escudos',
    peso: 8,
    aplica: (room) => {
      const b = room.board;
      for (const id of Object.keys(b.players)) b.players[id].shield = true;
      return { texto: 'Escudo para toda a gente: a próxima carta contra ti não conta.' };
    },
  },

  // ----- MAUS -----------------------------------------------------------------
  {
    key: 'tempestade',
    tom: 'mau',
    emoji: '⛈️',
    titulo: 'Tempestade',
    peso: 11,
    aplica: (room) => {
      const b = room.board;
      for (const id of Object.keys(b.players)) {
        if (b.players[id].finished) continue;
        b.players[id].pos = Math.max(0, b.players[id].pos - 3);
      }
      return { texto: 'Tempestade: toda a gente recua 3 casas.' };
    },
  },
  {
    key: 'golpe_de_estado',
    tom: 'mau',
    emoji: '🔄',
    titulo: 'Golpe de estado',
    peso: 9,
    aplica: (room) => {
      const b = room.board;
      const lider = primeiroNaCorrida(room);
      const ultimo = ultimoNaCorrida(room);
      if (!lider || !ultimo || lider.id === ultimo.id) return null;
      const a = b.players[lider.id].pos;
      b.players[lider.id].pos = b.players[ultimo.id].pos;
      b.players[ultimo.id].pos = a;
      return { texto: `Golpe de estado: ${lider.name} e ${ultimo.name} trocam de lugar na corrida.` };
    },
  },
  {
    key: 'imposto_do_lider',
    tom: 'mau',
    emoji: '👑',
    titulo: 'Imposto do líder',
    peso: 11,
    aplica: (room) => {
      const b = room.board;
      const lider = primeiroNaCorrida(room);
      if (!lider) return null;
      b.players[lider.id].pos = Math.max(0, b.players[lider.id].pos - 5);
      return { texto: `${lider.name} vai à frente de mais. Recua 5 casas.` };
    },
  },
  {
    key: 'rodada_geral',
    tom: 'mau',
    emoji: '🍺',
    titulo: 'Rodada geral',
    peso: 12,
    aplica: () => ({ texto: 'Rodada geral: três goles para toda a gente.', todosBebemTabuleiro: 3 }),
  },
];

// ----- Escolha ---------------------------------------------------------------

/**
 * O "relógio" de cada modo. A Roda conta rondas (`roundCount`), o Tabuleiro
 * conta jogadas (`turnCount`) — mas o resto da moldura é a mesma, por isso é só
 * aqui que a diferença existe.
 */
const contador = (estado) => estado.roundCount ?? estado.turnCount ?? 0;

/** Marca quando cai o próximo evento (janela aleatória a partir de agora). */
export function agendaProximo(estado) {
  const janela = MIN_RONDAS + Math.floor(Math.random() * (MAX_RONDAS - MIN_RONDAS + 1));
  estado.proximoEventoNa = contador(estado) + janela;
}

/**
 * Está na hora de um evento?
 * @param estado room.game (Roda) ou room.board (Tabuleiro)
 */
export function horaDeEvento(room, estado = room?.game) {
  if (!ENABLED) return false;
  if (!estado || estado.finale || estado.phase === 'gameover' || estado.phase === 'over') return false;
  if (estado.proximoEventoNa == null) return false;
  if (connectedOrder(room).length < 2) return false;
  return contador(estado) >= estado.proximoEventoNa;
}

/**
 * Sorteia e aplica um evento. Devolve o que o cliente precisa para o encenar.
 *
 * Um evento que não se possa aplicar (o "aquece" com a noite já em Caos, por
 * exemplo) devolve null do seu \`aplica\` e tenta-se outro — nunca se gasta a vez
 * do evento numa coisa que não aconteceu.
 */
export function dispara(room, estado = room.game) {
  const banco = estado === room.board ? EVENTOS_TABULEIRO : EVENTOS_RODA;
  const pool = shuffle([...banco]);
  const total = pool.reduce((s, e) => s + e.peso, 0);
  let bilhete = Math.random() * total;
  let escolhido = pool[pool.length - 1];
  for (const e of pool) {
    bilhete -= e.peso;
    if (bilhete <= 0) {
      escolhido = e;
      break;
    }
  }

  // Tenta o escolhido; se não der, percorre os outros até um pegar.
  const ordem = [escolhido, ...pool.filter((e) => e !== escolhido)];
  for (const ev of ordem) {
    const res = ev.aplica(room);
    if (!res) continue;

    // Beber conta-se onde cada modo guarda as suas contas: a Roda em
    // `game.stats`, o Tabuleiro em `board.players[id].golos`.
    if (res.todosBebem && room.game) {
      for (const p of connectedOrder(room)) drink(room.game, p.id, res.todosBebem);
    }
    if (res.todosBebemTabuleiro && room.board) {
      for (const id of Object.keys(room.board.players)) {
        room.board.players[id].golos += res.todosBebemTabuleiro;
      }
    }

    agendaProximo(estado);
    estado.ultimoEvento = {
      key: ev.key,
      tom: ev.tom,
      emoji: ev.emoji,
      titulo: ev.titulo,
      texto: res.texto,
      efeitos: res.efeitos || [],
      em: Date.now(),
    };
    return estado.ultimoEvento;
  }
  agendaProximo(estado); // nada pegou: tenta-se outra vez daqui a umas rondas
  return null;
}

/** Consome a trégua no fim de cada ronda (usado pelo game.js). */
export function passaRonda(game) {
  if (game?.tregua > 0) game.tregua -= 1;
}

/** Há trégua em vigor? (o \`perdeVida\` do motor consulta isto) */
export const emTregua = (game) => (game?.tregua || 0) > 0;

// ----- Leituras auxiliares ----------------------------------------------------

function maisAtras(room) {
  const ativos = connectedOrder(room);
  if (!ativos.length) return null;
  return ativos.reduce((pior, p) => (p.lives < pior.lives ? p : pior), ativos[0]);
}

/** Quem vai à frente / atrás na corrida do Tabuleiro. */
function primeiroNaCorrida(room) {
  const b = room.board;
  const ids = Object.keys(b.players).filter((id) => !b.players[id].finished);
  if (!ids.length) return null;
  const id = ids.reduce((melhor, x) => (b.players[x].pos > b.players[melhor].pos ? x : melhor), ids[0]);
  return { id, name: nameOf(room, id) };
}

function ultimoNaCorrida(room) {
  const b = room.board;
  const ids = Object.keys(b.players).filter((id) => !b.players[id].finished);
  if (!ids.length) return null;
  const id = ids.reduce((pior, x) => (b.players[x].pos < b.players[pior].pos ? x : pior), ids[0]);
  return { id, name: nameOf(room, id) };
}

function maisAFrente(room) {
  const ativos = connectedOrder(room);
  if (!ativos.length) return null;
  // Líder = mais vidas; empate desempata por quem bebeu menos.
  const g = room.game;
  const golos = (p) => g.stats?.[p.id]?.drinks || 0;
  return ativos.reduce((melhor, p) => {
    if (p.lives > melhor.lives) return p;
    if (p.lives === melhor.lives && golos(p) < golos(melhor)) return p;
    return melhor;
  }, ativos[0]);
}

export { nameOf };
