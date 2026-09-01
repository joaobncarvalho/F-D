// F&D — saco de prompts por sala (anti-repetição) + packs temáticos.
//
// Problema que resolve: `repo.getRandomPrompt` sorteia à sorte, por isso numa
// noite de uma hora o mesmo desafio saía 3-4 vezes. Aqui guardamos, POR SALA e
// POR TIPO, os textos que já saíram; só quando o saco esgota é que se repõe.
//
// Também é o sítio único onde se aplica o PACK temático da sala (room.pack) —
// assim nenhum motor precisa de saber que os packs existem.

import * as repo from '../repo.js';

/** Textos já usados nesta sala, por tipo de jogo. */
function bagFor(room, key) {
  const bags = (room.promptBags ||= {});
  return (bags[key] ||= new Set());
}

/** Esvazia os sacos (novo jogo → conteúdo todo outra vez disponível). */
export function resetBags(room) {
  room.promptBags = {};
}

/**
 * Sorteia um prompt SEM repetir enquanto houver conteúdo novo nesta sala.
 * Se o saco deste tipo esgotar, repõe-se e recomeça (nunca devolve null por
 * esgotamento — só se o tipo não tiver mesmo conteúdo nenhum).
 */
export async function pickPrompt(room, gameTypeKey, intensity) {
  const bag = bagFor(room, gameTypeKey);
  const tag = room?.pack || null;
  let p = await repo.getRandomPrompt(gameTypeKey, intensity, { exclude: bag, tag });
  if (!p) {
    bag.clear(); // saco esgotado → volta a haver conteúdo
    p = await repo.getRandomPrompt(gameTypeKey, intensity, { exclude: bag, tag });
  }
  if (p?.text) bag.add(p.text);
  return p;
}
