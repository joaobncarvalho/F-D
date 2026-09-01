// F&D — relógio de jogo, que para quando o host pausa.
//
// Sem isto a pausa era meia-verdade: o servidor recusava ações (bom), mas os
// cronómetros do ecrã continuavam a correr e quem voltasse da casa de banho
// encontrava o tempo esgotado. Aqui contabilizamos quanto tempo a sala esteve
// em pausa e descontamo-lo a todos os cronómetros.
//
// Fica fora do React de propósito: os cronómetros correm em `setInterval` e o
// que precisam é de uma função pura para consultar, não de re-renders.

let pausedAt = null; // instante em que a pausa começou (ou null)
let pausedTotal = 0; // milissegundos acumulados em pausa desde que a app abriu

/** Chamado pelo App sempre que o estado de pausa da sala muda. */
export function setPaused(paused) {
  if (paused && pausedAt === null) {
    pausedAt = Date.now();
  } else if (!paused && pausedAt !== null) {
    pausedTotal += Date.now() - pausedAt;
    pausedAt = null;
  }
}

export function isPaused() {
  return pausedAt !== null;
}

/** Total de tempo em pausa até agora (inclui a pausa a decorrer). */
function pausedMs() {
  return pausedTotal + (pausedAt === null ? 0 : Date.now() - pausedAt);
}

/**
 * Tempo decorrido desde `start`, DESCONTANDO as pausas.
 * @param start Date.now() do momento em que o cronómetro arrancou
 */
export function elapsedSince(start) {
  if (startPauses.size > 50) startPauses.clear(); // cronómetros são curtos: não guardar histórico
  const pausadoAntes = startPauses.get(start) ?? pausedMs();
  if (!startPauses.has(start)) startPauses.set(start, pausadoAntes);
  return Math.max(0, Date.now() - start - (pausedMs() - pausadoAntes));
}

// Quanto tempo de pausa já existia quando cada cronómetro arrancou — só assim se
// desconta a pausa DESTE cronómetro e não as de antes dele.
const startPauses = new Map();
