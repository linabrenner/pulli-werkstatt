// Offline-Betrieb: alle App-Dateien beim ersten Öffnen zwischenspeichern.
// Bei jeder neuen Version VERSION hochzählen, dann holt sich die App beim nächsten Öffnen die neuen Dateien.
const VERSION = "v2";
const DATEIEN = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "css/app.css",
  "js/app.js", "js/daten.js", "js/speicher.js", "js/regeln.js",
  "js/rechenkern/grundlagen.js", "js/rechenkern/masse.js", "js/rechenkern/raglan.js",
  ...["garne", "nadeln", "groessen", "ease", "konstruktionen", "details", "muster", "techniken", "abkuerzungen", "regeln"].map((d) => `daten/${d}.json`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((alle) => Promise.all(alle.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Erst aus dem Netz (damit Updates ankommen), sonst aus dem Zwischenspeicher.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(VERSION).then((c) => c.put(e.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
