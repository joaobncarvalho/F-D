// F&D — bilhetes da SALA DE TESTE (playtest) em produção.
//
// O problema: a sala de teste (socket.js → `dev_playtest`) vive atrás do
// ENABLE_DEV_BOTS, que só está ligado em dev. No servidor a sério a variável
// não está — e não deve estar: sem gate nenhum, qualquer pessoa podia encher o
// servidor de salas com bots. Mas é EM PRODUÇÃO que o João quer experimentar o
// que acabou de sair, e obrigá-lo a mexer em variáveis do Railway a cada teste
// não é forma de trabalhar.
//
// A saída: quem já provou que é o dono — entrou na /admin com a ADMIN_PASSWORD —
// pede um bilhete, e o bilhete abre a sala de teste durante uma hora. Não há
// segredo novo (é a mesma password que protege o resto da /admin), o bilhete é
// opaco, expira sozinho e morre com o processo.
//
// O bilhete viaja no FRAGMENTO do URL (`#pt=…`, ver client/src/playtest.js), que
// o browser não manda ao servidor nem ao Referer, e o cliente limpa-o do URL
// mal arranca. Nunca vai numa query string.

import { randomUUID } from 'node:crypto';

const VALIDADE_MS = 60 * 60 * 1000; // uma hora chega para uma sessão de testes
const bilhetes = new Map(); // token -> expira (ms)

/** Emite um bilhete novo. Só o chamador autenticado da /admin lá chega. */
export function emite() {
  limpa();
  const token = randomUUID();
  bilhetes.set(token, Date.now() + VALIDADE_MS);
  return { token, validadeMs: VALIDADE_MS };
}

/** O bilhete serve? (expirado ou desconhecido → não). */
export function valida(token) {
  if (!token) return false;
  const expira = bilhetes.get(token);
  if (!expira) return false;
  if (expira < Date.now()) {
    bilhetes.delete(token);
    return false;
  }
  return true;
}

/** Deita fora os expirados (chamado a cada emissão — não precisa de temporizador). */
function limpa() {
  const agora = Date.now();
  for (const [t, expira] of bilhetes) if (expira < agora) bilhetes.delete(t);
}
