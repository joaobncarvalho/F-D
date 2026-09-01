// F&D — identidade do jogador (emoji + cor), escolhida no lobby.
//
// Antes só existiam peões no Tabuleiro. Passa a ser transversal: o mesmo emoji e
// a mesma cor identificam o jogador na Roda, no Tabuleiro, no Torneio, no chat e
// no pódio. Numa mesa de 8 pessoas, com o telemóvel na mão, reconhece-se muito
// mais depressa um 🦊 laranja do que um nome pequenino.
//
// O cliente tem uma cópia destas listas só para desenhar as opções; a validação
// é SEMPRE aqui (servidor é a autoridade).

export const EMOJIS = [
  '🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨',
  '🐼', '🐷', '🐧', '🐢', '🐔', '🦖', '🦩', '🦉',
];

export const COLORS = [
  '#ff3d8b', '#9b5cff', '#ffb020', '#1fd3b6',
  '#5b8cff', '#4ade80', '#f472b6', '#38bdf8',
];

/** Identidade por defeito para quem nunca escolheu (determinística pela ordem). */
export function defaultIdentity(index) {
  return { emoji: EMOJIS[index % EMOJIS.length], color: COLORS[index % COLORS.length] };
}
