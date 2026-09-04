// F&D — o veredito da mesa.
//
// O PROBLEMA
//
// Nos jogos com cronómetro (Mímica, Categoria Relâmpago, Desenha) alguém tinha
// de carregar num botão a dizer se a pessoa tinha conseguido. Esse alguém era o
// próprio jogador — ou o host, que podia carregar por ele. As duas versões são
// más: uma é juiz em causa própria, a outra é o host a decidir a sorte dos
// outros a partir do seu telemóvel.
//
// A REGRA NOVA
//
// Quem decide é a MESA. Acabado o tempo, toda a gente MENOS quem estava a atuar
// vota "conseguiu" ou "não conseguiu", e a maioria manda. Falhar custa uma VIDA,
// não uns goles: é o que faz o cronómetro meter medo.
//
// Duas decisões que valem a pena explicar:
//
//   · EMPATE FAVORECE QUEM ATUOU. Perder uma vida por um empate é o tipo de
//     injustiça de que uma mesa se lembra a noite toda.
//   · QUEM NÃO VOTA NÃO CONTA. Não se assume "não conseguiu" por silêncio —
//     numa festa metade da mesa está a olhar para a pessoa, não para o telemóvel.
//     Sem votos nenhuns, o benefício da dúvida é de quem atuou.
//
// O auto-resolve (autoresolve.js) fecha a votação com quem já votou, como já faz
// nos jogos de grupo.

// O `holder` é o objeto que GUARDA a votação. Por omissão é a ronda da Roda
// (`room.game.round`), que é onde vivem todas as votações desde o início. O
// Tabuleiro passa o seu (`room.board.tribunal`) porque lá não há "ronda" — e é
// só por isso que estas funções o aceitam. Continua a haver um único sistema de
// votação, com uma única regra de empate: era isso que se queria proteger.

import { AppError } from '../errors.js';
import { nameOf } from './helpers.js';

/**
 * Abre a votação do veredito.
 *
 * @param round     a ronda (mutada)
 * @param atores    quem NÃO vota (quem esteve a atuar)
 * @param pergunta  o que a mesa está a julgar
 * @param rotulos   { sim, nao, aviso } — o que se lê nos botões. O Julgamento
 *                  vota "inocente/culpado", não "conseguiu/não conseguiu"; sem
 *                  isto seria preciso um segundo sistema de votação só por causa
 *                  das palavras, com uma segunda regra de empate a divergir.
 */
export function abre(round, atores = [], pergunta = 'Conseguiu?', rotulos = null) {
  round.veredito = {
    pergunta,
    rotulos: rotulos || null,
    atores: atores.filter(Boolean),
    votos: {}, // playerId -> 'sim' | 'nao' (secreto até fechar)
    fechado: false,
    resultado: null, // 'sim' | 'nao'
    sim: 0,
    nao: 0,
  };
  return round.veredito;
}

/** Um voto da mesa. Não se troca depois de dado. */
export function vota(room, playerId, valor, holder = null) {
  const r = holder || room.game?.round;
  const v = r?.veredito;
  if (!v) throw new AppError('Não há veredito a decidir.');
  if (v.fechado) throw new AppError('A votação já fechou.');
  if (v.atores.includes(playerId)) throw new AppError('Não podes votar em ti próprio.');
  if (!room.players.get(playerId)) throw new AppError('Jogador inválido.');
  if (v.votos[playerId]) throw new AppError('Já votaste.');
  const escolha = valor === 'sim' || valor === true ? 'sim' : 'nao';
  v.votos[playerId] = escolha;
  return v;
}

/** Quem ainda pode votar (ligado, não eliminado e fora do palco). */
export function eleitores(room, v) {
  return [...room.players.values()].filter(
    (p) => p.connected && !p.eliminated && !v.atores.includes(p.id)
  );
}

/** Já votou toda a gente que podia? */
export function completo(room, holder = null) {
  const v = (holder || room.game?.round)?.veredito;
  if (!v || v.fechado) return false;
  const podem = eleitores(room, v);
  return podem.length > 0 && podem.every((p) => v.votos[p.id]);
}

/**
 * Fecha a votação e devolve o veredito.
 * @returns {{ conseguiu:boolean, sim:number, nao:number }|null}
 */
export function fecha(room, holder = null) {
  const v = (holder || room.game?.round)?.veredito;
  if (!v || v.fechado) return null;
  const valores = Object.values(v.votos);
  v.sim = valores.filter((x) => x === 'sim').length;
  v.nao = valores.filter((x) => x === 'nao').length;
  v.fechado = true;
  // Empate (e mesa sem votos) → conseguiu. Ver o cabeçalho.
  v.resultado = v.nao > v.sim ? 'nao' : 'sim';
  return { conseguiu: v.resultado === 'sim', sim: v.sim, nao: v.nao };
}

/**
 * Serializa para o estado da sala.
 *
 * Antes de fechar vai só QUEM já votou — nunca em quê. Se os votos se vissem a
 * meio, a mesa alinhava pelo primeiro e deixava de haver julgamento.
 *
 * Quantos podem votar não vai daqui: o cliente já tem a lista de jogadores e
 * calcula-o do mesmo modo que na faixa de palpites. Fazer o `room` atravessar
 * os cinco serializadores só para contar cabeças não valia a viagem.
 */
export function serialize(round) {
  const v = round?.veredito;
  if (!v) return null;
  const base = {
    pergunta: v.pergunta,
    rotulos: v.rotulos || null,
    atores: v.atores,
    jaVotaram: Object.keys(v.votos),
    fechado: v.fechado,
  };
  if (!v.fechado) return base;
  return { ...base, resultado: v.resultado, sim: v.sim, nao: v.nao };
}

/** Frase para o feed. */
export function frase(room, atorId, conseguiu, v) {
  const nome = nameOf(room, atorId) || 'alguém';
  return conseguiu
    ? `A mesa deu por bom o ${nome} (${v.sim}-${v.nao})`
    : `A mesa não deu por bom o ${nome} (${v.nao}-${v.sim}) — menos uma vida`;
}
