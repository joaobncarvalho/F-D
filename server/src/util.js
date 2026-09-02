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

/**
 * Limite por JANELA: deixa passar até `max` ações em cada `windowMs`, gastas à
 * velocidade que o cliente quiser. Devolve `true` quando a ação deve ser
 * ignorada.
 *
 * Porquê outro limitador: o `throttled` impõe um ESPAÇAMENTO mínimo, e há canais
 * em que isso corta o que é legítimo. Os traços do desenho são o caso — o cliente
 * já os junta em lotes de 12 pontos, e o lote final de um traço curto sai logo a
 * seguir ao anterior. Com espaçamento mínimo esse lote desaparecia e o traço
 * ficava truncado no ecrã dos outros. Aqui uma rajada passa inteira; só um fluxo
 * sustentado (que já não é uma pessoa a desenhar) é travado.
 */
export function rateLimited(socket, key, max, windowMs) {
  const now = Date.now();
  socket.data.rates ||= {};
  const bucket = (socket.data.rates[key] ||= { inicio: now, contagem: 0 });
  if (now - bucket.inicio >= windowMs) {
    bucket.inicio = now;
    bucket.contagem = 0;
  }
  bucket.contagem += 1;
  return bucket.contagem > max;
}
