// Kleiner Server zum Ausprobieren auf dem eigenen Rechner: npm start, dann http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const TYPEN = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  const pfad = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const datei = join(WURZEL, pfad.endsWith("/") ? pfad + "index.html" : pfad);
  if (!datei.startsWith(WURZEL)) { res.writeHead(403).end(); return; }
  try {
    const inhalt = await readFile(datei);
    res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream", "Cache-Control": "no-cache" }).end(inhalt);
  } catch {
    res.writeHead(404).end("Nicht gefunden");
  }
}).listen(PORT, () => console.log(`Pulli-Werkstatt läuft auf http://localhost:${PORT}`));
