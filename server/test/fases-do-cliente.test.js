// F&D — o contrato das FASES entre o servidor e o ecrã da Roda.
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
