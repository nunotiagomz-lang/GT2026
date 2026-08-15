/* Service worker da app Nova Logística.
   Guarda o "esqueleto" da app (HTML, ícones) para abrir offline.
   Os dados do Google Sheets NÃO passam por aqui: a app trata disso com
   o seu próprio cache (localStorage), que sabe distinguir dados frescos
   de dados guardados e avisa o utilizador. */
const CACHE = "nl-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/logo-mark.png",
  "./assets/logo-192.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Google Sheets fica de fora

  /* rede primeiro (para apanhar versões novas da app), cache como salvaguarda */
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});
