// Testlauf der Foto-Erkennung mit eigenen Testfotos und bekannter Antwort.
//
//   node scripts/foto-test.mjs --trocken            # prüft Fotos und Antworten, schickt nichts
//   node scripts/foto-test.mjs                      # mit Claude Opus 5.5 (braucht ANTHROPIC_API_KEY)
//   node scripts/foto-test.mjs --modell claude-haiku-5-5
//
// Erwartet im Ordner fotos-test/ die Fotos und eine Datei antworten.json (Vorlage: antworten.beispiel.json).
// Fotos werden mit sips (macOS) auf 1568 px verkleinert und ohne Metadaten neu gespeichert.
import { readFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { anfrage, auswerten, kosten, MODELL, MAX_KANTE_PX } from "../js/foto/erkennung.js";

const wurzel = fileURLToPath(new URL("..", import.meta.url));
const ordner = join(wurzel, "fotos-test");
const args = process.argv.slice(2);
const trocken = args.includes("--trocken");
const modell = args.includes("--modell") ? args[args.indexOf("--modell") + 1] : MODELL;

const daten = Object.fromEntries(
  readdirSync(join(wurzel, "daten")).filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(join(wurzel, "daten", f), "utf8"))])
);

const antwortDatei = join(ordner, "antworten.json");
if (!existsSync(antwortDatei)) {
  console.error("fotos-test/antworten.json fehlt. Vorlage: fotos-test/antworten.beispiel.json");
  process.exit(1);
}
const faelle = JSON.parse(readFileSync(antwortDatei, "utf8"));
const fehlend = faelle.filter((f) => !existsSync(join(ordner, f.datei)));
if (fehlend.length) {
  console.error(`Fotos fehlen: ${fehlend.map((f) => f.datei).join(", ")}`);
  process.exit(1);
}

/** Foto verkleinern und als JPEG ohne Metadaten neu schreiben. */
const tmp = mkdtempSync(join(tmpdir(), "pulli-foto-"));
function vorbereiten(datei) {
  const ziel = join(tmp, datei.replace(/\.[^.]+$/, "") + ".jpg");
  execFileSync("sips", ["-Z", String(MAX_KANTE_PX), "-s", "format", "jpeg", "-s", "formatOptions", "85", join(ordner, datei), "--out", ziel], { stdio: "ignore" });
  return readFileSync(ziel).toString("base64");
}

const felder = ["teil", "konstruktion", "kragen", "aermel", "laenge", "sitz", "musterOrt", "musterArt", "buendchen"];
const treffer = Object.fromEntries(felder.map((f) => [f, { richtig: 0, gesamt: 0 }]));
let summe = 0;
const abweichungen = [];

let client;
if (!trocken) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY ist nicht gesetzt. Im Terminal: export ANTHROPIC_API_KEY=… (Schlüssel nicht in Dateien speichern)");
    process.exit(1);
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  client = new Anthropic();
}

for (const fall of faelle) {
  const bild = vorbereiten(fall.datei);
  const params = anfrage(daten, bild, "image/jpeg", modell);
  if (trocken) {
    console.log(`✓ ${fall.datei}: ${Math.round(bild.length * 0.75 / 1024)} KB, erwartet ${Object.keys(fall.erwartet).join(", ")}`);
    continue;
  }
  let antwort;
  try {
    antwort = await client.beta.messages.create(params);
  } catch (fehler) {
    console.log(`✗ ${fall.datei}: API-Fehler ${fehler.status ?? ""} ${fehler.message}`);
    continue;
  }
  const { ergebnis, fehler, usage } = auswerten(antwort);
  if (fehler) { console.log(`✗ ${fall.datei}: ${fehler}`); continue; }
  summe += kosten(usage, modell);
  for (const f of felder) {
    if (!(f in fall.erwartet)) continue;
    treffer[f].gesamt++;
    if (ergebnis[f].wert === fall.erwartet[f]) treffer[f].richtig++;
    else abweichungen.push(`${fall.datei}: ${f} erwartet „${fall.erwartet[f]}“, erkannt „${ergebnis[f].wert}“ (${ergebnis[f].sicherheit})`);
  }
  console.log(`✓ ${fall.datei}: ${ergebnis.kurzbeschreibung}`);
}

if (trocken) {
  console.log(`\nTrockenlauf: ${faelle.length} Fotos bereit, Modell ${modell}. Nichts gesendet.`);
} else {
  console.log(`\nTrefferquote je Feld (${modell}):`);
  for (const f of felder) if (treffer[f].gesamt) console.log(`  ${f.padEnd(13)} ${treffer[f].richtig}/${treffer[f].gesamt}`);
  if (abweichungen.length) console.log(`\nAbweichungen:\n  ${abweichungen.join("\n  ")}`);
  console.log(`\nKosten dieses Laufs: ca. ${summe.toFixed(2)} $ (${(summe / faelle.length * 100).toFixed(1)} Cent pro Foto)`);
}
