// F&D — curva de intensidade.
//
// A votação do lobby deixa de ser um valor fixo e passa a ser o TETO da noite:
// começa-se leve (aquecimento) e sobe-se até à intensidade votada à medida que
// as rondas/minutos passam. Quem votar "leve" fica leve a noite toda.
//
// Puro e sem estado — recebe o estado do modo (roda/tabuleiro/torneio) e devolve
// a intensidade a usar AGORA.

export const LEVELS = ['leve', 'picante', 'hardcore', 'caos'];

const ROUNDS_TO_PEAK = 12; // ~12 rondas…
const MINUTES_TO_PEAK = 25; // …ou 25 minutos, o que vier primeiro

/**
 * @param state { intensity, curve, startedAt, roundCount }
 * @returns a intensidade efetiva ('leve' | 'picante' | 'hardcore' | 'caos')
 */
export function effectiveIntensity(state) {
  const ceiling = Math.max(0, LEVELS.indexOf(state?.intensity || 'leve'));
  if (!state?.curve || ceiling === 0) return LEVELS[ceiling];
  const minutes = state.startedAt ? (Date.now() - state.startedAt) / 60000 : 0;
  const progress = Math.min(1, Math.max((state.roundCount || 0) / ROUNDS_TO_PEAK, minutes / MINUTES_TO_PEAK));
  const idx = Math.min(ceiling, Math.floor(progress * (ceiling + 1)));
  return LEVELS[idx];
}
