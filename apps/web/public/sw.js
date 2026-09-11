// Service worker minimale (installabilità PWA — CLAUDE.md §"PWA", i
// professionisti sono spesso sul campo con connessione scarsa). Cache
// SOLO gli asset statici (JS/CSS/font/icone dell'app shell, mai le
// pagine HTML né le risposte API): il sito ha già una regola esplicita
// "ricerca sempre aggiornata, mai professionisti eliminati/obsoleti"
// (dati sempre freschi, no-store lato fetch) — un service worker che
// mettesse in cache pagine o dati riproporrebbe esattamente quel bug già
// corretto in passato. Nessun supporto offline dei dati: solo un
// caricamento più rapido a rivisita e la possibilità tecnica di
// installare l'app.
const CACHE_NAME = "professionisti-static-v1";
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icon-192.png", "/icon-512.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
