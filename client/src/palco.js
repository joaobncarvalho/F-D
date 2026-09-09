// F&D — o PALCO: uma cena de cada vez.
//
// O problema que isto resolve é do Tabuleiro, mas não é só dele. As encenações
// de ecrã inteiro (Evento da Noite, Regra Nova, Maldição, Ganância, ordem de
// jogo) nasceram cada uma no seu sítio, cada uma com o seu `useState` e o seu
// relógio. Enquanto vinham uma a uma, ninguém deu por nada. Só que no Tabuleiro
// vêm em cacho: uma jogada pode, no MESMO `room_state`, disparar a maldição que
// estava enterrada na casa E o castigo da ganância — e as duas montavam-se por
// cima uma da outra, z-[70] contra z-[70], dois sons a tocar juntos, dois
// abanões a anular-se. Via-se um borrão e não se percebia o que tinha acontecido.
//
// A regra passa a ser uma só: **o ecrã inteiro é de uma cena de cada vez**. Quem
// tem um momento para mostrar não o mostra — mete-o na fila (`encena`) e o palco
// trata do resto: toca a cena, espera que ela acabe, dá um respiro e chama a
// seguinte. O componente da cena não muda nada (os overlays continuam a ser os
// mesmos, com o mesmo `onDone`); o que muda é QUEM decide quando é que ele monta.
//
// E QUEM A MANDA EMBORA
//
// As encenações fechavam-se sozinhas ao fim dos seus 3 ou 4 segundos. Numa mesa
// isso não chega: são seis pessoas a ler o mesmo ecrã, uma delas a servir uma
// bebida e outra a olhar para o lado — quando voltam, já passou, e ninguém
// pergunta "o que é que dizia?" a meio da ronda. Agora a cena ACABA a animação
// e FICA, com um "toca para continuar"; sai quando alguém a fecha.
//
// Cada telemóvel fecha o seu (isto é tudo local): quem já leu segue, quem está
// a ler fica. O relógio só existe como rede — ao fim de `LIMITE_LEITURA_MS` a
// cena sai sozinha, para um telemóvel esquecido em cima da mesa não ficar preso
// nem entupir a fila.
//
// Isto vive num módulo e não num contexto de React de propósito: quem encena
// está espalhado pelo App e pelos ecrãs, e um contexto obrigava a passar o
// dispatch por todos eles. Aqui é um `import` e uma chamada.

import { useEffect, useState } from 'react';

const INTERVALO_MS = 260; // respiro entre cenas (dá tempo à saída da anterior)
const MARGEM_MS = 900; // rede de segurança por cima da duração anunciada
const DURACAO_OMISSAO = 4000;
// Quanto tempo uma cena fica à espera de um toque antes de sair sozinha. Não é
// o tempo de leitura (esse é o de cada um) — é a rede para um telemóvel
// pousado: 45 s chegam para ler três vezes e não prendem a fila a sério.
const LIMITE_LEITURA_MS = 45000;
const MAX_FILA = 5; // uma jogada não gera mais do que isto; o resto é lixo acumulado

let fila = [];
let atual = null;
let relogio = null;
let respiro = null;
const vistas = new Set(); // ids já encenados — um `room_state` repetido não repete a cena
const ouvintes = new Set();

function avisa() {
  for (const fn of ouvintes) fn();
}

function proxima() {
  clearTimeout(relogio);
  relogio = null;
  atual = fila.shift() || null;
  avisa();
  if (!atual) return;
  // Rede de segurança. Nas cenas que esperam por um toque é longa (o normal é
  // sair por toque); nas que se fecham sozinhas é a duração anunciada mais uma
  // margem, para um `onDone` que se perca não entupir o palco.
  const limite = atual.fechaSozinha
    ? (atual.duracaoMs || DURACAO_OMISSAO) + MARGEM_MS
    : (atual.duracaoMs || DURACAO_OMISSAO) + LIMITE_LEITURA_MS;
  relogio = setTimeout(() => fecha(atual?.id), limite);
}

/**
 * Põe uma cena na fila. O `id` é a identidade do MOMENTO (não do componente):
 * duas chamadas com o mesmo id são a mesma cena vista duas vezes pelo React, e
 * a segunda é ignorada.
 *
 * cena: { tipo, duracaoMs?, som?, fechaSozinha?, ...dados do componente }
 *
 * `fechaSozinha` é para o que NÃO é um momento a ler (o banner da carta usada):
 * essas passam e vão-se. Tudo o resto fica à espera de um toque.
 */
export function encena(id, cena) {
  if (!id || vistas.has(id)) return;
  vistas.add(id);
  if (vistas.size > 300) vistas.delete(vistas.values().next().value); // não cresce sem fim
  fila.push({ ...cena, id });
  // Uma fila comprida é sinal de que o jogo já andou para a frente — o que
  // interessa é o que acabou de acontecer, não a cena de há três jogadas.
  if (fila.length > MAX_FILA) fila = fila.slice(-MAX_FILA);
  if (!atual) proxima();
  else avisa(); // a fila mudou (há quem mostre "espera aí, vem mais")
}

/** A cena acabou (o componente chamou `onDone`, ou o toque fechou-a). */
export function fecha(id) {
  if (!atual || (id && atual.id !== id)) return;
  clearTimeout(relogio);
  relogio = null;
  atual = null;
  avisa();
  clearTimeout(respiro);
  respiro = setTimeout(proxima, INTERVALO_MS); // o respiro é o que evita o cruzamento
}

/** Sair da sala limpa o palco — cenas da noite anterior não entram na seguinte. */
export function limpaPalco() {
  clearTimeout(relogio);
  clearTimeout(respiro);
  relogio = null;
  respiro = null;
  fila = [];
  atual = null;
  vistas.clear();
  avisa();
}

/** A cena em palco agora (null = livre). Fora do React — testes e guardas. */
export function emCena() {
  return atual;
}

/**
 * O que está em cena, e quantas ainda esperam a vez: `{ cena, espera }`.
 * Devolve sempre um objeto novo — a fila pode mudar sem a cena mudar (é isso
 * que dá o "+2 a seguir" no canto), e com a mesma referência o React não
 * voltava a desenhar.
 */
export function useCena() {
  const [estado, setEstado] = useState(() => ({ cena: atual, espera: fila.length }));
  useEffect(() => {
    const fn = () => setEstado({ cena: atual, espera: fila.length });
    ouvintes.add(fn);
    fn(); // pode ter mudado entre o render e o efeito
    return () => ouvintes.delete(fn);
  }, []);
  return estado;
}
