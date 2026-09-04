// ----- Segredos Anónimos ----------------------------------------------------
//
// Segredos submetidos na prep (anónimos). Ao sair, mostra-se um segredo e o grupo
// adivinha o autor; quem erra bebe (se TODOS acertam, o autor foi apanhado e bebe).
// O autor NUNCA vai no payload antes do reveal (aviso privado `you_are_author`).
//
// Extraído do game.js (comportamento idêntico). Depende só de ./helpers.js.

import { AppError } from '../errors.js';
import { connectedOrder, drink, nameOf } from './helpers.js';

/** Escolhe um segredo por revelar (evita o do próprio spinner); recicla se preciso. */
export function pickSecret(game, excludeAuthorId) {
  const unusedOther = game.secrets.filter((s) => !s.used && s.authorPlayerId !== excludeAuthorId);
  const unusedAny = game.secrets.filter((s) => !s.used);
  let pool = unusedOther.length ? unusedOther : unusedAny;
  if (!pool.length) {
    if (!game.secrets.length) return null;
    game.secrets.forEach((s) => (s.used = false)); // reciclar
    pool = game.secrets.filter((s) => s.authorPlayerId !== excludeAuthorId);
    if (!pool.length) pool = game.secrets;
  }
  const s = pool[Math.floor(Math.random() * pool.length)];
  s.used = true;
  return s;
}

/** Prepara a ronda Segredos (o autor é privado — nunca serializado antes do reveal). */
export function setupSegredos(round, secret) {
  round.prompt = { text: secret.text };
  round.promptDaMesa = true; // é um segredo da mesa — nunca entra em contador nenhum
  round.secretAuthorId = secret.authorPlayerId; // NUNCA serializado antes do reveal
  round.guesses = {};
  round.revealed = false;
  round.result = null;
}

/** Segredos: um jogador (não o autor) adivinha. Auto-revela quando todos adivinharem. */
export function castGuess(room, guesserId, guessedId) {
  const g = room.game;
  if (!g || g.phase !== 'guessing' || !g.round) throw new AppError('Não há adivinha ativa.');
  if (g.round.revealed) throw new AppError('Já foi revelado.');
  if (guesserId === g.round.secretAuthorId) throw new AppError('É o teu segredo — fica calado! 🤫');
  const guesser = room.players.get(guesserId);
  const guessed = room.players.get(guessedId);
  if (!guesser || !guessed) throw new AppError('Escolhe um jogador válido.');
  if (guesser.eliminated) throw new AppError('Estás fora — só a ver.');

  g.round.guesses[guesserId] = guessedId;

  const eligible = connectedOrder(room)
    .map((p) => p.id)
    .filter((id) => id !== g.round.secretAuthorId);
  if (eligible.length && eligible.every((id) => g.round.guesses[id] !== undefined)) {
    revealSegredos(room);
  }
  return g.round;
}

export function revealSegredos(room) {
  const g = room.game;
  const r = g.round;
  const authorId = r.secretAuthorId;
  const entries = Object.entries(r.guesses); // [guesserId, guessedId]
  const correct = entries.filter(([, gid]) => gid === authorId).map(([id]) => id);
  const wrong = entries.filter(([, gid]) => gid !== authorId).map(([id]) => id);

  let drinkers;
  if (authorId && entries.length > 0 && wrong.length === 0) {
    drinkers = [authorId]; // todos acertaram → autor foi apanhado, bebe
    drink(g, authorId, 1);
  } else {
    drinkers = wrong; // quem errou bebe
    wrong.forEach((id) => drink(g, id, 1));
  }

  r.result = {
    authorId,
    authorName: authorId ? nameOf(room, authorId) : null,
    correct: correct.map((id) => ({ id, name: nameOf(room, id) })),
    wrong: wrong.map((id) => ({ id, name: nameOf(room, id) })),
    drinkers: drinkers.map((id) => ({ id, name: nameOf(room, id) })),
  };
  r.revealed = true;
}

/** Preenche `base` com os campos públicos de Segredos (o autor só aparece no reveal). */
export function serializeSegredos(base, r) {
  base.guessers = Object.keys(r.guesses || {});
  base.hasAuthor = !!r.secretAuthorId; // se false, é confissão sem autor
  base.revealed = !!r.revealed;
  base.result = r.revealed ? r.result : null; // autor só aqui
}
