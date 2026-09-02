// F&D — linguagem de movimento.
//
// Antes disto cada componente inventava as suas molas: stiffness 200 aqui, 260
// ali, 300 acolá, damping 14/16/20/22. Nenhuma estava errada — mas juntas faziam
// a app parecer montada por cinco pessoas diferentes. O que dá a sensação de
// "produto caro" não é ter mais animação, é ter a MESMA animação em todo o lado.
//
// Três molas, e chegam:
//   suave  — o normal. Entradas de ecrã, cartas, listas. Assenta sem drama.
//   pop    — coisas que aparecem e querem atenção (contadores, medalhas, chips).
//   pesada — coisas com massa: overlays de ecrã inteiro, revelações, o podium.
//
// Regra de ouro do movimento nesta app: nada que a mesa tenha de ESPERAR pode
// demorar mais de 400 ms. Só os momentos em que toda a gente está a olhar para o
// mesmo sítio (roda, reveal, fim de jogo) é que ganham tempo — e esses ganham
// mesmo, porque é aí que o jogo respira.

export const MOLA = {
  suave: { type: 'spring', stiffness: 210, damping: 24, mass: 0.9 },
  pop: { type: 'spring', stiffness: 420, damping: 18, mass: 0.7 },
  pesada: { type: 'spring', stiffness: 120, damping: 18, mass: 1.4 },
  // Ressalta. É o que os reveals do Tabuleiro já faziam à mão (damping ~12) e
  // funciona: uma carta que salta lê-se como boa notícia. Fica como token para
  // não se voltar a escrever o número à mão.
  salto: { type: 'spring', stiffness: 260, damping: 13, mass: 0.9 },
};

/**
 * Correspondência para converter as molas escritas à mão que ainda restam nos
 * ecrãs do Tabuleiro e do Torneio (~20 sítios). Não é automática de propósito:
 * o `damping` é que define o CARÁTER, e trocá-lo às cegas mudava reveals que
 * foram afinados a olho. Ao mexer num desses ecrãs, converte-se pelo damping:
 *
 *   damping <= 14  -> MOLA.salto   (ressalta: prémios, cartas, dados)
 *   damping 15-20  -> MOLA.pop     (aparece e fixa: contadores, medalhas)
 *   damping >= 21  -> MOLA.suave   (assenta: painéis, listas, ecrãs)
 */

export const DUR = {
  instante: 0.12, // feedback de toque
  rapida: 0.22, // trocas dentro do mesmo ecrã
  media: 0.38, // entrada de cartas e painéis
  lenta: 0.7, // momentos partilhados (reveals)
};

/** Curva de saída usada nas transições sem mola (fade/sweeps). */
export const SUAVIZA = [0.16, 1, 0.3, 1];

// ----- Variantes reutilizáveis ----------------------------------------------

/** Entrada padrão de uma carta/painel: sobe e assenta. */
export const ENTRA = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
  transition: MOLA.suave,
};

/** Entrada de ecrã inteiro (troca de página). */
export const ENTRA_ECRA = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: DUR.media, ease: SUAVIZA },
};

/**
 * Lista com entrada escalonada. O atraso é curto de propósito: uma lista de 8
 * jogadores com 0,1 s cada demorava quase um segundo a montar, e ninguém quer
 * ver isso duas vezes.
 */
export const LISTA = {
  animate: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

export const ITEM_LISTA = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: MOLA.suave },
  exit: { opacity: 0, x: -12, transition: { duration: DUR.rapida } },
};

/** Pulsar contínuo (destaques que têm de chamar sem gritar). */
export const PULSA = {
  animate: { scale: [1, 1.045, 1] },
  transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
};

// ----- Movimento reduzido ----------------------------------------------------

/**
 * Quem pediu menos animação no sistema (ou está ao 5.º copo) recebe as mesmas
 * transições sem deslocamento nem escala — só opacidade. Nada desaparece do
 * ecrã: só deixa de saltar.
 */
export function movimentoReduzido() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Passa uma variante pelo filtro do movimento reduzido. */
export function suavizado(variante) {
  if (!movimentoReduzido()) return variante;
  const limpa = (estado) => {
    if (!estado || typeof estado !== 'object') return estado;
    const { y, x, scale, rotate, ...resto } = estado;
    return resto;
  };
  return {
    ...variante,
    initial: limpa(variante.initial),
    animate: limpa(variante.animate),
    exit: limpa(variante.exit),
    transition: { duration: DUR.rapida },
  };
}
