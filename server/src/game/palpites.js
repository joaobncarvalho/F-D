// F&D — a segunda camada de cada ronda: o palpite da mesa.
//
// O PROBLEMA, QUE JÁ TINHA SIDO DESCOBERTO E NÃO GENERALIZADO
//
// No 1.º playtest o Torneio com 6 pessoas era fraco, e o diagnóstico foi certo:
// o problema não era o bracket, era o tempo morto — três saíam na 1.ª ronda e
// ficavam a olhar. A solução (apostas em todos os duelos) resolveu-o.
//
// Só que o mesmo se passa na RODA inteira. Numa mesa de oito, sete pessoas são
// plateia em cada Boca Calada, Desafio, Roleta Russa, Mímica, Relâmpago. Repara
// no que os jogos bons do catálogo têm em comum — Vasco, Segredos, Intrigas,
// Quem Disse, Eu Nunca: em TODOS a mesa inteira tem alguma coisa a fazer. Os
// fracos são todos de um jogador a atuar. O padrão estava no próprio catálogo.
//
// A SOLUÇÃO
//
// Não é um tipo novo. É um campo na ronda que os motores existentes abrem ou
// ignoram: enquanto um joga, os outros apostam no que vai acontecer. Quem erra
// bebe. Ligar um tipo novo custa duas linhas — `abre()` no início e `resolve()`
// onde o motor já decide o resultado.
//
// SEGREDO ATÉ AO FIM
//
// Os palpites são secretos até à resolução, pela mesma razão das apostas do
// Torneio: se se vissem, apostava toda a gente no mesmo e deixava de haver
// aposta. Vai no estado só a CONTAGEM — e a cada jogador o seu próprio palpite.

import { AppError } from '../errors.js';
import { drink, nameOf } from './helpers.js';

// Errar custa o mesmo que no Torneio. É de propósito: a mesa já aprendeu este
// preço e não se ganha nada em ter duas moedas diferentes na mesma noite.
export const GOLOS_ERRADO = 2;

/**
 * Especificações por tipo. A chave é o `gameTypeKey`; o valor descreve a
 * pergunta que se faz à plateia e as respostas possíveis.
 *
 * `opcoes[].key` tem de bater certo com o que o motor passa ao `resolve()`.
 *
 * Os tipos de MESA INTEIRA (eu_nunca, segredos, vasco…) não estão aqui de
 * propósito: já têm toda a gente a jogar, e pôr uma aposta por cima seria pedir
 * duas coisas ao mesmo tempo.
 */
const SPECS = {
  boca_calada: {
    pergunta: 'Aceita ou bebe?',
    opcoes: [
      { key: 'aceita', rotulo: '🎤 Responde', emoji: '🎤' },
      { key: 'bebe', rotulo: '🤐 Bebe', emoji: '🤐' },
    ],
  },
  desafio: {
    pergunta: 'Aceita ou bebe?',
    opcoes: [
      { key: 'aceita', rotulo: '💪 Aceita', emoji: '💪' },
      { key: 'bebe', rotulo: '🍺 Bebe', emoji: '🍺' },
    ],
  },
  isto_ou_aquilo: {
    pergunta: 'Qual vai escolher?',
    // As opções são preenchidas no `abre()` — dependem do prompt da ronda.
    dinamicas: true,
  },
  roleta_russa: {
    pergunta: 'Responde ou passa?',
    opcoes: [
      { key: 'aceita', rotulo: '🎤 Responde', emoji: '🎤' },
      { key: 'passa', rotulo: '🎯 Passa', emoji: '🎯' },
    ],
  },
  categoria_relampago: {
    pergunta: 'Aguenta até ao fim?',
    opcoes: [
      { key: 'aguenta', rotulo: '⚡ Aguenta', emoji: '⚡' },
      { key: 'trava', rotulo: '🧊 Trava', emoji: '🧊' },
    ],
  },
};
//
// A Mímica e o Desenha ficaram DE FORA por decisão, não por esquecimento: neles
// a mesa está a adivinhar em voz alta. Pôr uma aposta por cima era pedir duas
// coisas ao mesmo tempo — e a aposta ganhava sempre, porque é a que tem botão.
// A regra desta camada é só uma: entra onde a plateia não tem MESMO nada que
// fazer.

export const temPalpite = (gameTypeKey) => !!SPECS[gameTypeKey];

/**
 * Abre a camada de palpites numa ronda.
 *
 * @param round      a ronda (mutada)
 * @param excluidos  quem NÃO aposta (quem está a jogar a ronda)
 */
export function abre(round, excluidos = []) {
  const spec = SPECS[round.gameTypeKey];
  if (!spec) return null;

  let opcoes = spec.opcoes;
  if (spec.dinamicas) {
    // Isto ou Aquilo: as opções são as do próprio dilema.
    const [a, b] = round.options || [];
    if (!a || !b) return null;
    opcoes = [
      { key: '0', rotulo: a, emoji: '🅰️' },
      { key: '1', rotulo: b, emoji: '🅱️' },
    ];
  }

  round.palpite = {
    pergunta: spec.pergunta,
    opcoes,
    apostas: {}, // playerId -> key (SECRETO até resolver)
    excluidos: excluidos.filter(Boolean),
    resolvido: false,
    resultado: null,
    certos: [], // [{ id, name }]
    errados: [], // [{ id, name }]
  };
  return round.palpite;
}

/** Regista o palpite de um espectador. Não se troca depois de dado. */
export function aposta(room, playerId, key) {
  const r = room.game?.round;
  const p = r?.palpite;
  if (!p) throw new AppError('Não há palpites nesta ronda.');
  if (p.resolvido) throw new AppError('Os palpites já fecharam.');
  if (p.excluidos.includes(playerId)) throw new AppError('Estás a jogar esta ronda — não podes apostar.');
  if (!room.players.get(playerId)) throw new AppError('Jogador inválido.');
  if (p.apostas[playerId]) throw new AppError('Já deste o teu palpite.');
  if (!p.opcoes.some((o) => o.key === String(key))) throw new AppError('Palpite inválido.');
  p.apostas[playerId] = String(key);
  return p;
}

/**
 * Fecha os palpites com o resultado real e cobra a quem errou.
 *
 * Chamado pelos motores no ponto em que JÁ decidem o resultado — não há aqui
 * uma segunda fonte de verdade sobre o que aconteceu na ronda.
 *
 * @returns {{ certos, errados }|null}
 */
export function resolve(room, resultadoKey) {
  const g = room.game;
  const p = g?.round?.palpite;
  if (!p || p.resolvido) return null;

  p.resolvido = true;
  p.resultado = String(resultadoKey);

  for (const [playerId, escolha] of Object.entries(p.apostas)) {
    const quem = { id: playerId, name: nameOf(room, playerId) };
    if (escolha === p.resultado) {
      p.certos.push(quem);
    } else {
      p.errados.push(quem);
      drink(g, playerId, GOLOS_ERRADO);
    }
  }
  return { certos: p.certos, errados: p.errados };
}

/**
 * Serializa para o estado da sala.
 *
 * Antes de resolver vai QUEM já apostou, nunca EM QUÊ — se os palpites se
 * vissem, apostava toda a gente no mesmo e deixava de haver aposta. Saber quem
 * já votou não estraga nada (o Torneio e os jogos de grupo já mostram "3/4") e
 * poupa um canal privado só para cada um saber se já jogou.
 */
export function serialize(round) {
  const p = round?.palpite;
  if (!p) return null;
  const base = {
    pergunta: p.pergunta,
    opcoes: p.opcoes,
    excluidos: p.excluidos,
    jaApostaram: Object.keys(p.apostas),
    resolvido: p.resolvido,
    golos: GOLOS_ERRADO, // o preço de errar é anunciado ANTES de se apostar
  };
  if (!p.resolvido) return base;
  return { ...base, resultado: p.resultado, certos: p.certos, errados: p.errados };
}
