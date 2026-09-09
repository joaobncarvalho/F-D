// F&D — SALA DE TESTE (playtest). Ferramenta de dev, não faz parte do jogo.
//
// O showroom (`?demo`) mostra os ecrãs com dados fictícios: vê-se o aspeto, não
// se testa a lógica. Isto é a outra metade — abrir a app REAL numa sala com
// bots, já dentro do jogo que se quer experimentar, e jogá-lo até ao fim.
//
// O contrato é o URL, para o showroom (e a /admin) só terem de abrir um link:
//
//   /?playtest=1&mode=wheel&tipo=tribunal&intensity=caos&bots=3
//   /?playtest=1&mode=board&casa=beerpong
//   /?playtest=1&mode=board&casa=mini&gameKey=isto_ou_aquilo
//
// Do lado do servidor isto é o evento `dev_playtest`, que está fechado a não ser
// que uma de duas chaves apareça: ENABLE_DEV_BOTS=1 (a máquina de dev) ou um
// BILHETE emitido pela /admin (produção — ver server/src/devticket.js). Ou seja:
// no servidor a sério, o caminho é abrir o showroom a partir da /admin.
//
// O BILHETE, e porque é que ele anda no `#`
//
// Chega no fragmento do URL (`#pt=…`) e não numa query string, por três razões:
// o fragmento não vai no pedido ao servidor, não vai no cabeçalho Referer, e
// pode ser apagado do URL mal a página arranca — que é o que fazemos aqui.
// Depois disso vive no sessionStorage deste separador e viaja para os separadores
// que o showroom abrir.

const params = new URLSearchParams(window.location.search);
const CHAVE_BILHETE = 'fd_playtest_ticket';

/**
 * Apanha o bilhete que veio no fragmento, guarda-o neste separador e limpa o URL
 * (para não ficar na barra nem no histórico). Corre uma vez, no arranque.
 */
function recolheBilhete() {
  const hash = window.location.hash || '';
  const m = hash.match(/[#&]pt=([^&]+)/);
  if (!m) return;
  try {
    sessionStorage.setItem(CHAVE_BILHETE, decodeURIComponent(m[1]));
  } catch {
    /* modo privado / storage cheio — o bilhete fica só nesta página */
  }
  const limpo = hash.replace(/[#&]pt=[^&]*/, '').replace(/^#$/, '');
  window.history.replaceState(null, '', window.location.pathname + window.location.search + limpo);
}
recolheBilhete();

/** O bilhete deste separador (ou null: em dev não é preciso nenhum). */
export function bilhete() {
  try {
    return sessionStorage.getItem(CHAVE_BILHETE) || null;
  } catch {
    return null;
  }
}

/** A encomenda que veio no URL, ou null se isto não é um playtest. */
export const PLAYTEST = params.has('playtest')
  ? {
      mode: ['board', 'tournament', 'morte'].includes(params.get('mode')) ? params.get('mode') : 'wheel',
      intensity: ['leve', 'picante', 'hardcore', 'caos'].includes(params.get('intensity'))
        ? params.get('intensity')
        : 'caos', // o playtest quer ver TUDO: em leve há tipos que nem entram no sorteio
      bots: Math.max(1, Math.min(7, Number(params.get('bots')) || 3)),
      name: params.get('name') || 'Tu',
      // Ritmo dos bots (server/src/socket.js -> BOT_RITMOS). Sem isto ficava o do servidor.
      ritmo: ['rapido','normal','lento','manual'].includes(params.get('ritmo')) ? params.get('ritmo') : null,
      gameTypeKey: params.get('tipo') || null,
      casa: params.get('casa') ? { kind: params.get('casa'), gameKey: params.get('gameKey') || null } : null,
    }
  : null;

/** Monta o link de uma sala de teste (usado pelos botões do showroom). */
export function linkPlaytest({ mode = 'wheel', tipo = null, casa = null, gameKey = null, intensity = 'caos', bots = 3, ritmo = null } = {}) {
  const p = new URLSearchParams({ playtest: '1', mode, intensity, bots: String(bots) });
  if (tipo) p.set('tipo', tipo);
  if (casa) p.set('casa', casa);
  if (gameKey) p.set('gameKey', gameKey);
  if (ritmo) p.set('ritmo', ritmo);
  // Sai do `?demo` de propósito: o showroom vive dentro dele e o playtest é a
  // app a sério. Mesma origem, para funcionar dentro do iframe da /admin.
  const t = bilhete();
  const frag = t ? `#pt=${encodeURIComponent(t)}` : '';
  return `${window.location.origin}${window.location.pathname}?${p}${frag}`;
}
