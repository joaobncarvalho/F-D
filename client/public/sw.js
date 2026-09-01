// F&D — service worker mínimo.
//
// Existe por UMA razão: sem ele o browser não oferece "adicionar ao ecrã
// principal", e sem isso o jogo abre com a barra do browser a comer 15% de um
// ecrã que já é pequeno. NÃO faz cache agressiva de propósito — este é um jogo
// realtime; servir um bundle velho a meio de uma festa seria muito pior do que
// não funcionar offline.

const SHELL = 'fd-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon-192.png'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/socket.io')) return;
  // Rede primeiro; a cache só entra quando não há rede nenhuma (ex.: túnel).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (url.origin === location.origin && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/')))
  );
});
