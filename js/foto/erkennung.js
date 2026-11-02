// Foto-Erkennung: Antwortschema, Anweisung an das Modell und Auswertung der Antwort.
// Reine Funktionen ohne Netzwerk, damit App und Testskript dasselbe benutzen (Plan: Vault-Notiz 14).

export const MODELL = "claude-opus-5-5";
export const MAX_KANTE_PX = 1568;

const optionen = (daten, id) => daten.regeln.wunschEigenschaften.find((w) => w.id === id).optionen.map((o) => o.id);
const SICHERHEIT = ["sicher", "ziemlich sicher", "unsicher"];

/** Feld mit Wert aus einer festen Liste plus Sicherheit. */
function feld(werte, beschreibung) {
  return {
    type: "object",
    description: beschreibung,
    properties: { wert: { type: "string", enum: werte }, sicherheit: { type: "string", enum: SICHERHEIT } },
    required: ["wert", "sicherheit"],
    additionalProperties: false,
  };
}

/** JSON-Schema der Antwort, erzeugt aus den App-Daten. */
export function antwortSchema(daten) {
  const konstruktionen = daten.konstruktionen.konstruktionen.map((k) => k.id);
  const garnklassen = daten.garne.garnklassen.map((g) => g.id);
  const musterArt = [...optionen(daten, "musterArt"), "keins"];
  return {
    type: "object",
    properties: {
      teil: feld(["pullover", "strickjacke", "weste", "anderes"], "Was für ein Kleidungsstück ist zu sehen?"),
      konstruktion: feld([...konstruktionen, "unklar"], "Schulter- und Ärmelform"),
      kragen: feld([...optionen(daten, "kragen"), "andere"], "Halsausschnitt"),
      aermel: feld(optionen(daten, "aermel"), "Ärmelform und -länge"),
      laenge: feld(optionen(daten, "laenge"), "Länge des Körpers"),
      sitz: feld(optionen(daten, "sitz"), "Wie weit sitzt das Teil am Körper?"),
      musterOrt: feld(optionen(daten, "musterOrt"), "Wo ist ein Muster zu sehen?"),
      musterArt: feld(musterArt, "Art des Musters, 'keins' bei glatt rechts"),
      buendchen: feld(["rippen1x1", "rippen2x2", "rollrand", "krausRechts", "keins", "unklar"], "Art der Bündchen"),
      garnklasse: {
        type: "object",
        description: "Grobe Schätzung der Garnstärke als Spanne der Garnklassen 0–7",
        properties: {
          von: { type: "integer", enum: garnklassen },
          bis: { type: "integer", enum: garnklassen },
          sicherheit: { type: "string", enum: SICHERHEIT },
        },
        required: ["von", "bis", "sicherheit"],
        additionalProperties: false,
      },
      nichtErkennbar: { type: "array", items: { type: "string" }, description: "Was auf dem Foto nicht zu beurteilen ist, auf Deutsch" },
      kurzbeschreibung: { type: "string", description: "1–2 Sätze auf Deutsch" },
    },
    required: ["teil", "konstruktion", "kragen", "aermel", "laenge", "sitz", "musterOrt", "musterArt", "buendchen", "garnklasse", "nichtErkennbar", "kurzbeschreibung"],
    additionalProperties: false,
  };
}

/** Anweisung an das Modell, mit kurzen Erklärungen der Werte aus den App-Daten. */
export function systemAnweisung(daten) {
  const konstr = daten.konstruktionen.konstruktionen.map((k) => `- ${k.id}: ${k.name}. ${k.beschreibung}`).join("\n");
  const garn = daten.garne.garnklassen.map((g) => `- ${g.id}: ${g.name} (${g.bezeichnungen.join(", ")}), ca. ${g.maschen10cm.min ?? "?"}–${g.maschen10cm.max ?? "?"} M auf 10 cm`).join("\n");
  return `Du bestimmst auf einem Foto eines gestrickten Kleidungsstücks die Merkmale, die eine Strick-App braucht, um eine ähnliche Anleitung in den Maßen der Nutzerin zu berechnen.

Wähle für jedes Feld genau einen der erlaubten Werte. Gib bei "sicherheit" ehrlich an, wie gut das Merkmal auf dem Foto zu sehen ist; verdeckte oder unscharfe Stellen sind "unsicher". Schätze keine Zentimeter und keine Maschenzahlen. Wenn mehrere Teile zu sehen sind, beschreibe das größte, am besten sichtbare.

Konstruktionen:
${konstr}

Garnklassen (aus Maschengröße und Dicke des Gestricks schätzen):
${garn}

"nichtErkennbar" listet kurz, was man für einen Nachbau bräuchte, das Foto aber nicht zeigt. "kurzbeschreibung" beschreibt das Teil in ein bis zwei Sätzen auf Deutsch.`;
}

/** Anfrage-Parameter für client.beta.messages.create. */
export function anfrage(daten, bildBase64, mediaType = "image/jpeg", modell = MODELL) {
  const mitFallback = !modell.startsWith("claude-haiku");
  return {
    model: modell,
    max_tokens: 4000,
    ...(mitFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    output_config: { effort: "low", format: { type: "json_schema", schema: antwortSchema(daten) } },
    system: systemAnweisung(daten),
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: bildBase64 } },
        { type: "text", text: "Bestimme die Merkmale dieses Kleidungsstücks." },
      ],
    }],
  };
}

/** Antwort auswerten: liefert {ergebnis} oder {fehler} mit verständlicher Meldung. */
export function auswerten(antwort) {
  if (antwort.stop_reason === "refusal") return { fehler: "Das Foto wurde nicht ausgewertet. Versuch ein anderes Foto, am besten nur das Kleidungsstück." };
  if (antwort.stop_reason === "max_tokens") return { fehler: "Die Antwort war unvollständig. Bitte noch einmal versuchen." };
  const text = antwort.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { ergebnis: JSON.parse(text), modell: antwort.model, usage: antwort.usage };
  } catch {
    return { fehler: "Die Antwort ließ sich nicht lesen. Bitte noch einmal versuchen." };
  }
}

/** Kosten in US-Dollar aus usage (Preise pro Million Token). */
export function kosten(usage, modell = MODELL) {
  const preise = { "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10] }[modell] ?? [4, 20];
  return ((usage.input_tokens ?? 0) * preise[0] + (usage.output_tokens ?? 0) * preise[1]) / 1e6;
}

// ---------- Chat-Weg: Anweisung zum Kopieren, Antwort zum Einfügen (kostenlos, ohne API-Schlüssel) ----------

const FELDER = ["teil", "konstruktion", "kragen", "aermel", "laenge", "sitz", "musterOrt", "musterArt", "buendchen"];

/** Anweisung, die man zusammen mit dem Foto in den Claude-Chat einfügt. */
export function chatAnweisung(daten) {
  const s = antwortSchema(daten).properties;
  const werte = FELDER.map((f) => `- ${f}: ${s[f].properties.wert.enum.join(", ")}`).join("\n");
  const beispiel = {
    ...Object.fromEntries(FELDER.map((f) => [f, { wert: s[f].properties.wert.enum[0], sicherheit: "sicher" }])),
    garnklasse: { von: 3, bis: 4, sicherheit: "unsicher" },
    nichtErkennbar: ["…"],
    kurzbeschreibung: "…",
  };
  return `${systemAnweisung(daten)}

Erlaubte Werte je Feld:
${werte}
- sicherheit: ${SICHERHEIT.join(", ")}
- garnklasse: von und bis jeweils 0–7

Antworte nur mit einem JSON-Codeblock in genau diesem Aufbau, ohne weiteren Text:
\`\`\`json
${JSON.stringify(beispiel, null, 2)}
\`\`\`

Bestimme jetzt die Merkmale des Kleidungsstücks auf dem angehängten Foto.`;
}

/**
 * Eingefügte Chat-Antwort lesen und gegen die erlaubten Werte prüfen.
 * Unbekannte oder fehlende Werte werden weggelassen und als Hinweis gemeldet, statt alles abzulehnen.
 */
export function antwortAusText(daten, text) {
  const roh = String(text ?? "").trim();
  if (!roh) return { fehler: "Es wurde nichts eingefügt." };
  const block = roh.match(/```(?:json)?\s*([\s\S]*?)```/);
  const kandidat = block ? block[1] : roh.slice(roh.indexOf("{"), roh.lastIndexOf("}") + 1);
  let obj;
  try { obj = JSON.parse(kandidat); } catch { return { fehler: "Das sieht nicht wie die Antwort aus dem Chat aus. Kopiere die ganze Antwort von Claude und füge sie hier ein." }; }
  const s = antwortSchema(daten).properties;
  const ergebnis = {};
  const hinweise = [];
  for (const f of FELDER) {
    const v = obj?.[f];
    if (v && s[f].properties.wert.enum.includes(v.wert)) {
      ergebnis[f] = { wert: v.wert, sicherheit: SICHERHEIT.includes(v.sicherheit) ? v.sicherheit : "unsicher" };
    } else if (v !== undefined) hinweise.push(`„${f}“ hatte einen unbekannten Wert und wird ignoriert.`);
  }
  const g = obj?.garnklasse;
  if (g && Number.isInteger(g.von) && Number.isInteger(g.bis) && g.von >= 0 && g.bis <= 7 && g.von <= g.bis) {
    ergebnis.garnklasse = { von: g.von, bis: g.bis, sicherheit: SICHERHEIT.includes(g.sicherheit) ? g.sicherheit : "unsicher" };
  }
  ergebnis.nichtErkennbar = Array.isArray(obj?.nichtErkennbar) ? obj.nichtErkennbar.filter((x) => typeof x === "string" && x !== "…").slice(0, 8) : [];
  ergebnis.kurzbeschreibung = typeof obj?.kurzbeschreibung === "string" && obj.kurzbeschreibung !== "…" ? obj.kurzbeschreibung : "";
  if (!FELDER.some((f) => f in ergebnis)) return { fehler: "In der Antwort war kein einziges bekanntes Merkmal. Bitte die Anweisung neu kopieren und noch einmal fragen." };
  return { ergebnis, hinweise };
}
