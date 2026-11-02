// Tests für die Foto-Erkennung ohne Netzwerk: Schema, Anfrage, Auswertung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { antwortSchema, anfrage, auswerten, kosten, systemAnweisung } from "../js/foto/erkennung.js";

const ordner = new URL("../daten/", import.meta.url);
const daten = Object.fromEntries(
  readdirSync(ordner).filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(new URL(f, ordner), "utf8"))])
);

/** Alle Objekte im Schema: additionalProperties false, alle Felder required (Vorgabe für Structured Outputs). */
function pruefeObjekte(s, pfad = "$") {
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false, `${pfad}: additionalProperties`);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${pfad}: required`);
    for (const [k, v] of Object.entries(s.properties)) pruefeObjekte(v, `${pfad}.${k}`);
  }
  if (s.type === "array") pruefeObjekte(s.items, `${pfad}[]`);
  for (const verboten of ["minimum", "maximum", "minLength", "maxLength"]) assert.ok(!(verboten in s), `${pfad}: ${verboten}`);
}

test("Schema erfüllt die Regeln für Structured Outputs", () => {
  pruefeObjekte(antwortSchema(daten));
});

test("Schema-Werte stammen aus den App-Daten", () => {
  const s = antwortSchema(daten).properties;
  for (const k of daten.konstruktionen.konstruktionen) assert.ok(s.konstruktion.properties.wert.enum.includes(k.id));
  for (const id of ["sitz", "laenge", "aermel", "musterOrt"]) {
    const erlaubt = daten.regeln.wunschEigenschaften.find((w) => w.id === id).optionen.map((o) => o.id);
    assert.deepEqual(s[id].properties.wert.enum, erlaubt, id);
  }
  assert.deepEqual(s.garnklasse.properties.von.enum, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("Anfrage: Opus mit Rückfall-Modell, Haiku ohne", () => {
  const a = anfrage(daten, "AAAA");
  assert.equal(a.model, "claude-opus-5-5");
  assert.equal(a.fallbacks, "default");
  assert.deepEqual(a.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(a.output_config.format.type, "json_schema");
  assert.equal(a.messages[0].content[0].type, "image");
  const h = anfrage(daten, "AAAA", "image/jpeg", "claude-haiku-5-5");
  assert.ok(!("fallbacks" in h) && !("betas" in h));
  assert.ok(systemAnweisung(daten).includes("raglan"));
});

test("Auswertung: Ablehnung, abgeschnittene und gültige Antwort", () => {
  assert.ok(auswerten({ stop_reason: "refusal", content: [] }).fehler);
  assert.ok(auswerten({ stop_reason: "max_tokens", content: [] }).fehler);
  assert.ok(auswerten({ stop_reason: "end_turn", content: [{ type: "text", text: "kein json" }] }).fehler);
  const ok = auswerten({ stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 4000, output_tokens: 1000 },
    content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"teil":{"wert":"pullover","sicherheit":"sicher"}}' }] });
  assert.equal(ok.ergebnis.teil.wert, "pullover");
  assert.equal(kosten(ok.usage).toFixed(3), "0.036");
});
