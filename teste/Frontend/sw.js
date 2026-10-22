/* Cache exclusivo da interface. A API Flask e seus dados nunca passam por este cache. */

const CACHE_PREFIX = `tony-lanches-pwa-${encodeURIComponent(self.registration.scope)}-`;

// Incremente a versão ao publicar alterações nos arquivos da interface.

const CACHE_NAME = CACHE_PREFIX + 'v28-weekly-day-off';
const SHELL_FILES = [

  './index.html', './styles.css', './config.js', './auth.js', './api.js', './app.js',
  './pwa.js', './finance.js', './reminders.js', './manifest.webmanifest', './assets/logo.png',

  './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png'

];

const SHELL_URLS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).href));



// Instala apenas se todos os arquivos essenciais puderem ser armazenados.

self.addEventListener('install', event => {

  event.waitUntil(caches.open(CACHE_NAME).then(cache =>

    cache.addAll(SHELL_FILES.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})))

  ));

});



// Remove somente versões antigas deste aplicativo e deste escopo.

self.addEventListener('activate', event => {

  event.waitUntil((async () => {

    const keys = await caches.keys();

    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));

    await self.clients.claim();

  })());

});



// O usuário autoriza a troca de versão pelo botão Atualizar app.

self.addEventListener('message', event => {

  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();

});



self.addEventListener('fetch', event => {

  const request = event.request;

  const url = new URL(request.url);

  // Lista fechada: não intercepta APIs, POSTs/PUTs, fontes externas ou outras rotas.

  if (request.method !== 'GET' || url.origin !== self.location.origin || !SHELL_URLS.has(url.href)) return;

  event.respondWith((async () => {

    const cache = await caches.open(CACHE_NAME);

    // A configuração tenta a rede antes do cache para evitar manter o modo demo ao conectar o Flask.

    if (url.pathname.endsWith('/config.js')) {

      try {

        const response = await fetch(request);

        if (response.ok) { await cache.put(request, response.clone()); return response; }

        return (await cache.match(request)) || response;

      } catch {

        const saved = await cache.match(request);

        if (saved) return saved;

        return Response.error();

      }

    }

    // Cache-first mantém todos os arquivos da interface na mesma versão até a atualização aceita.

    const saved = await cache.match(request);

    return saved || fetch(request);

  })());

});


// Push recebe somente um aviso genérico; valores financeiros não são enviados.
self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  if (typeof data.title !== 'string' || typeof data.body !== 'string') return;
  event.waitUntil(self.registration.showNotification(data.title.slice(0, 80), {
    body: data.body.slice(0, 200), icon: './assets/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 80) : 'tony-reminder',
    data: {url: new URL('./index.html', self.registration.scope).href}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});
