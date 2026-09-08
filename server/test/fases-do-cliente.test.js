// F&D — o contrato das TABELAS DE DESPACHO entre o servidor e os ecrãs.
//
// Porque é que este teste existe: o ⚖️ Tribunal chegou a estar meio ligado. O
// servidor punha `g.phase = 'tribunal'` e o `Game.jsx` até tinha o cartão do
// julgamento escrito — mas a fase não estava na lista `SPIN_PHASES`, e essa lista
// é a condição do `revealed` que manda desenhar o cartão. Resultado: a roda
// parava e a app ficava em BRANCO. Ninguém deu por isso porque o tipo só sai em
// hardcore/caos, e foi preciso a sala de teste (que o faz sair a pedido) para
// aparecer.
//
// O erro não foi esquecer uma linha — foi haver duas listas, uma de cada lado do
// arame, sem nada a compará-las. É isso que este teste é: lê as fases que o
// servidor consegue produzir e exige que o cliente saiba desenhá-las todas.
//
// Cruza a fronteira servidor↔cliente de propósito. Vivem no mesmo repositório e
// esta é exatamente a costura que se rasgou.
//
// A Roda foi onde rebentou, mas a forma do erro não é dela: sempre que o
// servidor escolhe um valor e o cliente tem de ter um RAMO para esse valor, há
// duas listas a precisar de alguém que as compare. No repositório há três:
//
//   · Roda      — `g.phase`            → `SPIN_PHASES` no Game.jsx
//   · Tabuleiro — `board.pending.kind` → `pending?.kind === '…'` no Board.jsx
//   · Torneio   — `t.phase`            → `t.phase === '…'` no Tournament.jsx
//
// Os `substate` de cada mini-jogo ficam DE FORA: aí o ramo por omissão é
// legítimo (o VascoCard trata o `result` como caso final, sem o nomear), e um
// guarda genérico só daria falsos positivos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = new URL('../src/', import.meta.url);
const gameJsx = fileURLToPath(new URL('../../client/src/pages/Game.jsx', import.meta.url));

// Fases que NÃO são de ronda: têm o seu próprio caminho no Game.jsx (ecrã da
// roda, preparação, fim de jogo) e não passam pelo SPIN_PHASES.
const FORA = new Set(['wheel', 'prep', 'gameover']);

/** Todas as fases que o motor da Roda consegue pôr em `g.phase`. */
function fasesDoServidor() {
  const ficheiros = [
    fileURLToPath(new URL('game.js', raiz)),
    ...readdirSync(fileURLToPath(new URL('game/', raiz)))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fileURLToPath(new URL('game/' + f, raiz))),
  ];
  const fases = new Set();
  for (const f of ficheiros) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/g\.phase\s*=\s*'([a-z_]+)'/g)) fases.add(m[1]);
    for (const m of src.matchAll(/game\.phase\s*=\s*'([a-z_]+)'/g)) fases.add(m[1]);
  }
  return [...fases].filter((f) => !FORA.has(f));
}

/** A lista `SPIN_PHASES` do ecrã da Roda, tal como está escrita no cliente. */
function fasesDoCliente() {
  const src = readFileSync(gameJsx, 'utf8');
  const bloco = src.match(/const SPIN_PHASES = \[([\s\S]*?)\];/);
  assert.ok(bloco, 'não encontrei o SPIN_PHASES no Game.jsx');
  return [...bloco[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('todas as fases de ronda do servidor são desenhadas pelo cliente', () => {
  const servidor = fasesDoServidor();
  const cliente = new Set(fasesDoCliente());
  assert.ok(servidor.length > 15, 'a leitura das fases do servidor falhou');

  const esquecidas = servidor.filter((f) => !cliente.has(f));
  assert.deepEqual(
    esquecidas,
    [],
    `fases que o servidor produz e o ecrã da Roda não desenha (dão ECRÃ EM BRANCO): ${esquecidas.join(', ')}`
  );
});

test('cada fase de ronda tem um cartão escrito no Game.jsx', () => {
  const src = readFileSync(gameJsx, 'utf8');
  const semCartao = fasesDoServidor().filter((f) => !src.includes(`g.phase === '${f}'`));
  assert.deepEqual(semCartao, [], `fases sem nada que as desenhe: ${semCartao.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Tabuleiro — o que o servidor põe em `board.pending.kind`
// ---------------------------------------------------------------------------

const boardJsx = fileURLToPath(new URL('../../client/src/pages/Board.jsx', import.meta.url));
const boardDir = fileURLToPath(new URL('../../client/src/pages/board/', import.meta.url));

/** Todos os `kind` que o motor do Tabuleiro consegue pôr em `pending`. */
function kindsDoServidor() {
  const ficheiros = [
    fileURLToPath(new URL('board.js', raiz)),
    ...readdirSync(fileURLToPath(new URL('board/', raiz)))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fileURLToPath(new URL('board/' + f, raiz))),
  ];
  const kinds = new Set();
  for (const f of ficheiros) {
    const src = readFileSync(f, 'utf8');
    // Apanha tanto `b.pending = { kind: 'x' }` como a versão em várias linhas.
    for (const m of src.matchAll(/pending\s*=\s*\{\s*kind:\s*'([a-z_]+)'/g)) kinds.add(m[1]);
  }
  return [...kinds];
}

test('todos os pending.kind do Tabuleiro são desenhados pelo cliente', () => {
  const kinds = kindsDoServidor();
  assert.ok(kinds.length >= 6, `a leitura dos kinds falhou (li ${kinds.length})`);

  // O ecrã principal e os cartões da pasta board/ contam os dois: alguns kinds
  // são despachados no Board.jsx e desenhados num ficheiro à parte.
  const cliente =
    readFileSync(boardJsx, 'utf8') +
    readdirSync(boardDir)
      .filter((f) => f.endsWith('.jsx'))
      .map((f) => readFileSync(boardDir + f, 'utf8'))
      .join('\n');

  const esquecidos = kinds.filter((k) => !cliente.includes(`kind === '${k}'`));
  assert.deepEqual(
    esquecidos,
    [],
    `kinds que o Tabuleiro produz e o cliente não desenha (a casa fica MUDA): ${esquecidos.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// Torneio — o que o servidor põe em `t.phase`
// ---------------------------------------------------------------------------

const tournamentJsx = fileURLToPath(new URL('../../client/src/pages/Tournament.jsx', import.meta.url));

/**
 * Fases do Torneio que o cliente trata no ramo POR OMISSÃO, de propósito.
 *
 * O quadro (`bracket`) é o que se vê quando não há duelo a decorrer nem
 * vencedor — é o corpo do ecrã, não um caso especial. Fica escrito aqui para
 * que uma fase NOVA não entre em silêncio no mesmo saco: quem a acrescentar
 * tem de vir aqui decidir se é mesmo o ecrã de repouso.
 */
const TORNEIO_POR_OMISSAO = new Set(['bracket']);

test('todas as fases do Torneio são desenhadas pelo cliente', () => {
  const src = readFileSync(fileURLToPath(new URL('tournament.js', raiz)), 'utf8');
  const fases = [...new Set([...src.matchAll(/t\.phase\s*=\s*'([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(fases.length >= 3, `a leitura das fases do Torneio falhou (li ${fases.length})`);

  const cliente = readFileSync(tournamentJsx, 'utf8');
  const esquecidas = fases.filter(
    (f) => !TORNEIO_POR_OMISSAO.has(f) && !cliente.includes(`phase === '${f}'`)
  );
  assert.deepEqual(
    esquecidas,
    [],
    `fases que o Torneio produz e o cliente não desenha: ${esquecidas.join(', ')}`
  );
});
