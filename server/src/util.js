// F&D — utilitários partilhados do servidor (sem dependências).

/**
 * Limpa texto vindo do cliente: troca caracteres de controlo por espaço, colapsa
 * espaços em branco (evita spam vertical/ASCII-art), faz trim e corta em `maxLen`.
 * Fonte única para nomes, chat, perguntas e segredos — o servidor NUNCA confia
 * no comprimento/conteúdo que o cliente manda (regra de ouro #4).
 */
export function sanitizeText(input, maxLen = 200) {
  let out = '';
  for (const ch of String(input ?? '')) {
    const code = ch.codePointAt(0);
    // Controlo C0 (< 0x20) e DEL (0x7F) → espaço; o resto (incl. emojis) passa.
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/**
 * Rate-limit simples por socket: devolve `true` se a ação `key` está a ser feita
 * depressa demais (< `ms` desde a última) e deve ser IGNORADA. Guarda o estado
 * na própria socket (`socket.data.throttle`). Barato e sem timers.
 */
export function throttled(socket, key, ms) {
  const now = Date.now();
  socket.data.throttle ||= {};
  const last = socket.data.throttle[key] || 0;
  if (now - last < ms) return true;
  socket.data.throttle[key] = now;
  return false;
}
