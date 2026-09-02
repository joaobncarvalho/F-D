// F&D — o humor da noite.
//
// O servidor já sabe a intensidade em vigor a cada momento (a curva sobe de
// 'leve' até ao teto votado, `game.intensity` no room_state). Até agora essa
// informação só mudava o TEXTO dos desafios: às três da manhã, em Caos, a app
// tinha exatamente o mesmo aspeto que às dez da noite.
//
// Aqui ela passa a mudar a própria app. Não é decoração: é a mesa perceber, sem
// ninguém explicar, que a noite está a aquecer. O nível vai para o <html> como
// `data-fd-mood` e o CSS trata do resto (cores do fundo, velocidade dos halos,
// vinheta, brilho das cartas). Uma única variável, e a app inteira acompanha.
//
//   leve      🍃  frio e lento — teal/verde, halos calmos, sem vinheta
//   picante   🌶️  âmbar, tudo um pouco mais desperto
//   hardcore  🔥  vermelho, halos rápidos, vinheta presente
//   caos      💥  magenta, vinheta a respirar, o ecrã treme nos momentos fortes

export const NIVEIS = ['leve', 'picante', 'hardcore', 'caos'];

/** Paletas de confetti por humor — o mesmo evento sabe diferente em Caos. */
const PALETAS = {
  leve: ['#1fd3b6', '#4ade80', '#7dd3fc', '#ffffff'],
  picante: ['#ffb020', '#ff7a00', '#ffd166', '#ffffff'],
  hardcore: ['#ff4d6d', '#ff3d8b', '#ff8c42', '#ffffff'],
  caos: ['#c04cff', '#ff3d8b', '#9b5cff', '#ffffff'],
};

let atual = 'leve';

/** A intensidade em vigor, venha ela de que modo vier. */
export function humorDaSala(room) {
  const nivel = room?.game?.intensity || room?.board?.intensity || room?.tournament?.intensity;
  return NIVEIS.includes(nivel) ? nivel : 'leve';
}

/** Escreve o humor no <html>. O CSS faz a transição — aqui não se anima nada. */
export function aplicaHumor(nivel) {
  const seguro = NIVEIS.includes(nivel) ? nivel : 'leve';
  atual = seguro;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.fdMood = seguro;
  }
  return seguro;
}

export function humorAtual() {
  return atual;
}

export function paleta(nivel = atual) {
  return PALETAS[nivel] || PALETAS.leve;
}

/** Quão forte deve ser um momento, dado o humor. 0 = leve, 3 = caos. */
export function grau(nivel = atual) {
  return Math.max(0, NIVEIS.indexOf(nivel));
}

/**
 * Abana o ecrã.
 *
 * Só a partir do Hardcore, e de propósito: se abanasse a noite toda deixava de
 * significar nada (e enjoa). É o mesmo princípio dos efeitos raros da casa ?? —
 * o que é dramático tem de ser escasso para continuar dramático.
 *
 * @param força 'leve' | 'forte'
 */
export function abana(força = 'leve') {
  if (typeof document === 'undefined') return;
  if (grau() < 2) return; // leve/picante não abanam
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.documentElement;
  const classe = força === 'forte' ? 'fd-abana-forte' : 'fd-abana';
  el.classList.remove('fd-abana', 'fd-abana-forte');
  void el.offsetWidth; // reinicia a animação se disparar duas vezes seguidas
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), 620);
}
