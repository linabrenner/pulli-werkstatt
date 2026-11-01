// Oberfläche der Pulli-Werkstatt: Idee → Schnitt → Größe → Maschenprobe → Anleitung → Strick-Modus.
import { datenLaden } from "./daten.js";
import { laden, speichern, exportieren, importieren } from "./speicher.js";
import { auswerten, empfohleneKonstruktionen } from "./regeln.js";
import { standardMasse, masseWarnungen } from "./rechenkern/masse.js";
import { berechneRaglan } from "./rechenkern/raglan.js";
import { mitte, runden } from "./rechenkern/grundlagen.js";

const app = document.getElementById("app");
const dialog = document.getElementById("dialog");
let D;            // Wissensdaten
let stand;        // {projekte: [...]}
let wakeLock = null;
let tick = false; // Zähler kurz hervorheben, nachdem eine Runde gezählt wurde

const SEITEN = [
  ["idee", "Idee"], ["schnitt", "Schnitt"], ["groesse", "Größe"], ["probe", "Maschenprobe"], ["anleitung", "Anleitung"], ["stricken", "Stricken"],
];
const MASSFELDER = [
  ["brust", "Brust"], ["oberarm", "Oberarm"], ["armlochtiefe", "Armlochtiefe"], ["rueckenlaengeTaille", "Rückenlänge bis Taille"],
  ["armlaenge", "Armlänge bis Achsel"], ["huefte", "Hüfte"], ["taille", "Taille"], ["schulterbreite", "Schulterbreite"], ["handgelenk", "Handgelenk"],
];
const PFLICHT = ["brust", "oberarm", "armlochtiefe", "rueckenlaengeTaille", "armlaenge", "huefte", "handgelenk"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const zahl = (x, st = 1) => (Number.isFinite(x) ? x.toLocaleString("de-DE", { maximumFractionDigits: st }) : "–");
const finde = (liste, id) => liste.find((x) => x.id === id);
const technik = (id) => finde(D.techniken.techniken, id);

// ---------- Projekt-Helfer ----------
function neuesProjekt() {
  const p = {
    id: Math.random().toString(36).slice(2, 9),
    name: "Mein Pulli",
    erstellt: new Date().toISOString(),
    auswahl: {},
    konstruktion: "raglan",
    faser: "wolle",
    groesse: { modus: "standard", tabelle: "damen", groesse: "M", masse: { ...standardMasse(D, "damen", "M"), handgelenk: 16 } },
    probe: {},
    nadelMm: null,
    nackenerhoehung: null,
    fortschritt: { schritt: 0, zaehler: {}, gesehen: [], erledigt: {} },
    notizen: {},
  };
  stand.projekte.unshift(p);
  sichern();
  return p;
}
const sichern = () => speichern(stand);
const projekt = (id) => stand.projekte.find((p) => p.id === id);

function garnklasseAusProbe(m10) {
  const kl = D.garne.garnklassen.filter((g) => (g.maschen10cm.min ?? 0) <= m10 && m10 <= (g.maschen10cm.max ?? 99));
  if (!kl.length) return m10 > 40 ? 0 : 7;
  return kl.sort((a, b) => Math.abs(mitte({ min: a.maschen10cm.min ?? 0, max: a.maschen10cm.max }) - m10)
    - Math.abs(mitte({ min: b.maschen10cm.min ?? 0, max: b.maschen10cm.max }) - m10))[0].id;
}
function garnklasseVorschlag(p) {
  const w = finde(finde(D.regeln.wunschEigenschaften, "waerme").optionen, p.auswahl.waerme);
  const liste = w ? w.garnklassen : [3, 4];
  return liste[Math.floor(liste.length / 2)];
}
function naechsteNadel(mm) {
  return D.nadeln.staerken.map((s) => s.mm).reduce((a, b) => (Math.abs(b - mm) < Math.abs(a - mm) ? b : a));
}
function garnklasse(p) {
  return p.probe.m10 ? garnklasseAusProbe(p.probe.m10) : garnklasseVorschlag(p);
}
function nadelVorschlag(p) {
  const g = finde(D.garne.garnklassen, garnklasse(p));
  return naechsteNadel(mitte({ min: g.nadelMm.min ?? g.nadelMm.max, max: g.nadelMm.max ?? g.nadelMm.min }));
}
/** Maschenprobe, notfalls aus der Garnklasse geschätzt. */
function probe(p) {
  if (p.probe.m10 && p.probe.r10) return { m10: p.probe.m10, r10: p.probe.r10, rippen10: p.probe.rippen10 || runden(p.probe.m10 * 1.1), geschaetzt: false };
  const g = finde(D.garne.garnklassen, garnklasse(p));
  const m10 = runden(mitte({ min: g.maschen10cm.min ?? g.maschen10cm.max, max: g.maschen10cm.max }));
  return { m10, r10: runden(m10 * 1.35), rippen10: runden(m10 * 1.1), geschaetzt: true };
}
function passform(p) {
  return finde(finde(D.regeln.wunschEigenschaften, "sitz").optionen, p.auswahl.sitz)?.passform ?? "klassisch";
}
function nackenerhoehung(p) {
  return p.nackenerhoehung ?? p.auswahl.erfahrung !== "erster";
}
function kontext(p, erg) {
  return {
    ...p.auswahl, passform: passform(p), faser: p.faser, garnklasse: garnklasse(p), konstruktion: p.konstruktion,
    richtung: "topDown", schwierigkeitMax: erg?.schwierigkeit,
  };
}
function fehlendeMasse(p) {
  return PFLICHT.filter((k) => !(p.groesse.masse[k] > 0));
}
function berechne(p) {
  const pr = probe(p);
  return berechneRaglan(D, {
    masse: p.groesse.masse, tabelle: "damen", passform: passform(p), laenge: p.auswahl.laenge || "huefte",
    maschenprobe: pr, nadelMm: p.nadelMm || nadelVorschlag(p), garnklasse: garnklasse(p), nackenerhoehung: nackenerhoehung(p),
    probeGewicht10cm: p.probe.gewicht, lauflaenge100g: p.probe.lauflaenge,
  });
}
/** Strick-Reihenfolge: Ärmelschritte werden für den zweiten Ärmel wiederholt. */
function strickfolge(erg) {
  const aermel = erg.schritte.filter((s) => s.abschnitt === "Ärmel (2×)");
  const folge = [];
  for (const s of erg.schritte) {
    if (s.abschnitt === "Ärmel (2×)") continue;
    if (s.abschnitt === "Fertigstellen") {
      for (const n of [1, 2]) for (const a of aermel) folge.push({ ...a, id: `${a.id}-${n}`, abschnitt: `Ärmel ${n}`, anweisung: a.anweisung.replace(" Zweiten Ärmel genauso.", "") });
    }
    folge.push(s);
  }
  return folge;
}

// ---------- Bausteine ----------
function nav(p, aktiv) {
  return `<nav class="schritte-nav" aria-label="Schritte">${SEITEN.map(([id, name]) =>
    `<a href="#/p/${p.id}/${id}" ${id === aktiv ? 'aria-current="page"' : ""}>${name}</a>`).join("")}</nav>`;
}
function hinweisBox(stufe, titel, text) {
  const k = { wichtig: "wichtig", hinweis: "hinweis-gelb", info: "info", vorschlag: "vorschlag", gut: "gut", ok: "gut", offen: "hinweis-gelb" }[stufe] || "info";
  return `<div class="hinweis ${k}">${titel ? `<b>${esc(titel)}</b>` : ""}${esc(text)}</div>`;
}
function weiterLeiste(p, zurueck, weiter, weiterText = "Weiter", gesperrt = false) {
  return `<div class="leiste unten-fest">
    ${zurueck ? `<a class="knopf" href="#/p/${p.id}/${zurueck}">Zurück</a>` : ""}
    <a class="knopf primaer" href="${gesperrt ? "#" : `#/p/${p.id}/${weiter}`}" ${gesperrt ? 'aria-disabled="true" onclick="return false" style="opacity:.45"' : ""}>${weiterText}</a></div>`;
}
function regelBoxen(p, erg) {
  const { vorschlaege, warnungen } = auswerten(D.regeln, kontext(p, erg));
  return [
    ...vorschlaege.map((v) => hinweisBox("vorschlag", "Vorschlag", v.begruendung)),
    ...warnungen.map((w) => hinweisBox(w.stufe, w.alternative ? `Tipp: lieber ${w.alternative}` : null, w.meldung)),
  ].join("");
}
const maschenreihe = (anteil, label) =>
  `<div class="maschenreihe" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${runden(anteil * 100)}" style="--anteil:${(anteil * 100).toFixed(1)}%"></div>`;

function zeigeTechnik(id) {
  const t = technik(id);
  if (!t) return;
  document.getElementById("dialog-inhalt").innerHTML = `<h2>${esc(t.name)}</h2>
    <p>${esc(t.erklaerung)}</p>${t.hinweis ? `<p class="leise">${esc(t.hinweis)}</p>` : ""}
    ${t.video ? `<p><a href="${esc(t.video)}" target="_blank" rel="noopener">Video ansehen</a></p>` : `<p class="leise">Video folgt.</p>`}`;
  dialog.showModal();
}
function zeigeText(titel, html) {
  document.getElementById("dialog-inhalt").innerHTML = `<h2>${esc(titel)}</h2>${html}`;
  dialog.showModal();
}

// ---------- Seiten ----------
function seiteStart() {
  const liste = stand.projekte.map((p) => {
    let anteil = 0, gesamt = 0;
    try { gesamt = strickfolge(berechne(p)).length; anteil = Object.keys(p.fortschritt.erledigt).length / gesamt; } catch { /* unvollständig */ }
    const status = anteil >= 1 ? "Fertig gestrickt" : anteil > 0 ? `${Object.keys(p.fortschritt.erledigt).length} von ${gesamt} Schritten gestrickt` : "Noch in Planung";
    return `<a class="karte projekt" href="#/p/${p.id}/${anteil > 0 ? "stricken" : "idee"}">
      <span class="projekt-kopf"><strong>${esc(p.name)}</strong><span class="projekt-stand">${status}</span></span>
      ${maschenreihe(anteil, `Fortschritt ${p.name}`)}</a>`;
  }).join("");
  app.innerHTML = `<div class="start">
    <div class="swatch" aria-hidden="true"></div>
    <h1>Was strickst du als Nächstes?</h1>
    <p class="unterzeile">Klick deine Idee zusammen. Die Werkstatt rechnet jede Masche aus und führt dich Runde für Runde durch.</p>
    <button class="knopf primaer gross" data-aktion="neu">Neuen Pulli planen</button>
    <h2>Deine Projekte</h2>
    ${liste || `<p class="leer">Hier erscheinen deine Pullis, sobald du den ersten planst.</p>`}
    <h2>Sicherung</h2>
    <p class="leise">Deine Projekte liegen nur auf diesem Gerät. Sichere sie ab und zu als Datei, zum Beispiel vor einem Handywechsel.</p>
    <div class="leiste"><button class="knopf" data-aktion="export">Sichern</button>
    <label class="knopf">Wiederherstellen<input type="file" accept="application/json" data-aktion="import" hidden></label></div></div>`;
}

function seiteIdee(p) {
  const erg = auswerten(D.regeln, kontext(p));
  const empf = empfohleneKonstruktionen(erg.vorschlaege);
  const fragen = D.regeln.wunschEigenschaften.filter((w) => !(w.nurWenn && (!p.auswahl.musterOrt || p.auswahl.musterOrt === "nirgends")));
  app.innerHTML = `${nav(p, "idee")}<h1>Deine Idee</h1>
    <div class="feld"><label for="name">Name</label><input id="name" data-feld="name" value="${esc(p.name)}"></div>
    ${fragen.map((w) => `<div class="frage">${esc(w.frage)}</div><div class="chips">${w.optionen.map((o) =>
      `<button class="chip" data-wunsch="${w.id}" data-wert="${o.id}" aria-pressed="${p.auswahl[w.id] === o.id}">${esc(o.name)}</button>`).join("")}</div>`).join("")}
    ${(erg.vorschlaege.length || erg.warnungen.length) ? `<h2>Das schlägt die Werkstatt vor</h2>${regelBoxen(p)}` : ""}
    ${empf.length ? `<p class="leise">Passende Schnitte: ${empf.map((k) => esc(finde(D.konstruktionen.konstruktionen, k).name)).join(", ")}</p>` : ""}
    ${weiterLeiste(p, null, "schnitt")}`;
}

function seiteSchnitt(p) {
  const empf = empfohleneKonstruktionen(auswerten(D.regeln, kontext(p)).vorschlaege);
  const a = p.auswahl;
  const grenzen = [];
  if (a.kragen && a.kragen !== "rundhals") grenzen.push(`${finde(finde(D.regeln.wunschEigenschaften, "kragen").optionen, a.kragen).name} kommt noch. Die Werkstatt rechnet vorerst mit Rundhals.`);
  if (a.aermel && a.aermel !== "lang") grenzen.push("Kurze, ¾- und Ballonärmel kommen noch. Vorerst lange, schmal zulaufende Ärmel.");
  if (a.musterOrt && a.musterOrt !== "nirgends") grenzen.push("Muster kommen noch. Vorerst glatt rechts, die Hinweise zu deinem Muster siehst du trotzdem.");
  app.innerHTML = `${nav(p, "schnitt")}<h1>Schnitt</h1>
    ${D.konstruktionen.konstruktionen.map((k) => {
      const geht = k.status === "mvp";
      return `<button class="option" data-konstruktion="${k.id}" aria-pressed="${p.konstruktion === k.id}" ${geht ? "" : "disabled"}>
        <span><strong>${esc(k.name)}${empf.includes(k.id) ? '<span class="marke-klein empf">passt zu deiner Idee</span>' : ""}${geht ? "" : '<span class="marke-klein spaeter">kommt noch</span>'}</strong>
        <span class="leise">${esc(k.beschreibung)}</span></span></button>`;
    }).join("")}
    ${grenzen.map((g) => hinweisBox("hinweis", null, g)).join("")}
    <div class="feld"><label for="faser">Faser</label><select id="faser" data-feld="faser">${D.garne.fasern.map((f) =>
      `<option value="${f.id}" ${p.faser === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select>
      <span class="leise">${esc(finde(D.garne.fasern, p.faser).hinweise.join(" "))}</span></div>
    <div class="feld"><label class="schalter"><input type="checkbox" data-feld="nackenerhoehung" ${nackenerhoehung(p) ? "checked" : ""}>
      <span>Nackenerhöhung mit verkürzten Reihen<span class="leise" style="display:block;font-weight:400">Hebt den Nacken an, damit der Pulli nicht nach hinten rutscht. Technik für Erfahrene, die App erklärt sie dir.</span></span></label></div>
    ${regelBoxen(p)}
    ${weiterLeiste(p, "idee", "groesse")}`;
}

function seiteGroesse(p) {
  const g = p.groesse;
  const tab = D.groessen.tabellen.damen;
  const warn = masseWarnungen(D, g.masse);
  const fehlt = fehlendeMasse(p);
  const mp = (id) => finde(D.groessen.messpunkte, id);
  app.innerHTML = `${nav(p, "groesse")}<h1>Größe</h1>
    <div class="chips"><button class="chip" data-modus="standard" aria-pressed="${g.modus === "standard"}">Standardgröße</button>
    <button class="chip" data-modus="eigen" aria-pressed="${g.modus === "eigen"}">Meine Maße</button></div>
    ${g.modus === "standard" ? `<div class="feld"><label for="gr">Damengröße (Craft Yarn Council)</label>
      <select id="gr" data-feld="standardgroesse">${tab.groessen.map((x) => `<option ${x === g.groesse ? "selected" : ""}>${x}</option>`).join("")}</select>
      <span class="leise">Körpermaße als Mittelwert der Tabelle. Unten kannst du einzelne Maße anpassen.</span></div>` :
      `<p class="leise">Miss am Körper, nicht am Pulli. Am besten misst eine zweite Person.</p>`}
    <div class="zwei">${MASSFELDER.map(([id, name]) => `<div class="feld"><label for="m-${id}">${name}${PFLICHT.includes(id) ? "" : " (optional)"}</label>
      <div class="einheit"><input id="m-${id}" inputmode="decimal" data-mass="${id}" value="${g.masse[id] ? zahl(g.masse[id]) : ""}"><span>cm</span></div></div>`).join("")}</div>
    <details><summary>So misst du richtig</summary>${MASSFELDER.map(([id, name]) => mp(id) ? `<p><b>${name}:</b> ${esc(mp(id).anleitung)}</p>` : "").join("")}
      ${D.groessen.messtipps.map((t) => `<p class="leise">${esc(t)}</p>`).join("")}</details>
    ${hinweisBox("info", null, "Für Herren- und Kindergrößen fehlen noch Daten (Oberarm, Armlochtiefe, Halsbreite). Mit eigenen Maßen geht es trotzdem.")}
    ${g.masse.handgelenk === 16 && g.modus === "standard" ? hinweisBox("hinweis", null, "Das Handgelenk (16 cm) ist eine Annahme, die Tabelle kennt es nicht. Miss am besten selbst nach.") : ""}
    ${warn.map((w) => hinweisBox("hinweis", "Bitte prüfen", w)).join("")}
    ${fehlt.length ? hinweisBox("wichtig", "Es fehlen noch", fehlt.map((k) => MASSFELDER.find(([id]) => id === k)[1]).join(", ")) : ""}
    ${weiterLeiste(p, "schnitt", "probe", "Weiter", fehlt.length > 0)}`;
}

function seiteProbe(p) {
  const pr = probe(p);
  const gk = finde(D.garne.garnklassen, garnklasse(p));
  const vorschlag = nadelVorschlag(p);
  const toleranz = D.details.maschenprobe.toleranzMaschenProzent.standard;
  let rueck = "";
  if (p.probe.m10) {
    const soll = gk.maschen10cm;
    if (soll.max && p.probe.m10 > soll.max * (1 + toleranz / 100)) rueck = hinweisBox("hinweis", "Deine Probe ist fester als üblich", `Nimm eine um ${D.details.maschenprobe.nadelwechselMm} mm dickere Nadel, oder die Werkstatt rechnet einfach mit deinen Werten.`);
    else if (soll.min && p.probe.m10 < soll.min * (1 - toleranz / 100)) rueck = hinweisBox("hinweis", "Deine Probe ist lockerer als üblich", `Nimm eine um ${D.details.maschenprobe.nadelwechselMm} mm dünnere Nadel, oder die Werkstatt rechnet einfach mit deinen Werten.`);
    else rueck = hinweisBox("gut", null, `Passt zu Garnklasse ${gk.id} (${gk.name}).`);
  }
  const feld = (id, name, wert, einheit, hilfe = "") => `<div class="feld"><label for="p-${id}">${name}</label>
    <div class="einheit"><input id="p-${id}" inputmode="decimal" data-probe="${id}" value="${wert ?? ""}"><span>${einheit}</span></div>${hilfe}</div>`;
  app.innerHTML = `${nav(p, "probe")}<h1>Maschenprobe</h1>
    <details ${p.probe.m10 ? "" : "open"}><summary>So strickst du die Probe</summary>
      <p>Mit deinem Garn und Nadel ${zahl(p.nadelMm || vorschlag)} mm ein Stück von mindestens ${D.details.maschenprobe.probeGroesseCmMin} × ${D.details.maschenprobe.probeGroesseCmMin} cm glatt rechts stricken, am besten in Runden.</p>
      ${D.details.maschenprobe.regeln.map((r) => `<p>${esc(r)}</p>`).join("")}
      <p>Dann in der Mitte zählen, wie viele Maschen und Runden auf 10 cm passen. Für die Bündchen zusätzlich ein Stück 1×1-Rippen messen.</p></details>
    <div class="feld"><label for="nadel">Nadel</label><select id="nadel" data-feld="nadelMm">${D.nadeln.staerken.map((s) =>
      `<option value="${s.mm}" ${(p.nadelMm || vorschlag) === s.mm ? "selected" : ""}>${zahl(s.mm, 2)} mm${s.us ? ` (US ${s.us})` : ""}${s.mm === vorschlag ? " – Vorschlag" : ""}</option>`).join("")}</select></div>
    <div class="zwei">${feld("m10", "Maschen auf 10 cm", p.probe.m10, "M")}${feld("r10", "Runden auf 10 cm", p.probe.r10, "Rd")}</div>
    ${feld("rippen10", "Rippen: Maschen auf 10 cm (optional)", p.probe.rippen10, "M")}
    ${rueck}
    ${pr.geschaetzt ? hinweisBox("wichtig", "Ohne eigene Probe", `Die Werkstatt schätzt ${pr.m10} M × ${pr.r10} Rd aus der Garnklasse ${gk.id} (${gk.name}). Der Pulli kann damit deutlich zu groß oder zu klein werden.`) : ""}
    <h2>Für den Garnbedarf (optional)</h2>
    <div class="zwei">${feld("gewicht", "Gewicht der 10 × 10-cm-Probe", p.probe.gewicht, "g")}${feld("lauflaenge", "Lauflänge", p.probe.lauflaenge, "m/100 g")}</div>
    ${weiterLeiste(p, "groesse", "anleitung", "Anleitung berechnen")}`;
}

function seiteAnleitung(p) {
  let erg;
  try { erg = berechne(p); } catch (fehler) {
    app.innerHTML = `${nav(p, "anleitung")}<h1>Anleitung</h1>${hinweisBox("wichtig", "Das lässt sich so nicht berechnen", fehler.message)}${weiterLeiste(p, "probe", "groesse", "Maße prüfen")}`;
    return;
  }
  const f = erg.fertig;
  const pr = probe(p);
  const text = erg.schritte.map((s) => `${s.anweisung} ${s.kontrolle || ""}`).join(" ");
  const abk = Object.values(D.abkuerzungen.abkuerzungen).filter((a) => new RegExp(`(^|[^\\wäöü])${a.kurz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\wäöü])`).test(text));
  let abschnitt = "";
  const schritte = erg.schritte.map((s) => {
    const kopf = s.abschnitt !== abschnitt ? `<p class="abschnitt-titel">${esc((abschnitt = s.abschnitt))}</p>` : "";
    return `${kopf}<div class="anleitung-schritt"><h3>${esc(s.titel)}</h3><p>${esc(s.anweisung)}</p>
      ${s.reihen ? `<ol>${s.reihen.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ol>` : ""}
      ${s.kontrolle ? `<p class="kontrolle">Kontrolle: ${esc(s.kontrolle)}</p>` : s.maschen ? `<p class="kontrolle">= ${s.maschen} M</p>` : ""}
      ${(s.techniken || []).length ? `<div class="chips">${s.techniken.map((t) => `<button class="chip" data-technik="${t}">${esc(technik(t)?.name ?? t)}</button>`).join("")}</div>` : ""}</div>`;
  }).join("");
  const stufe = finde(D.techniken.schwierigkeitsstufen.map((x) => ({ ...x, id: x.stufe })), erg.schwierigkeit);
  app.innerHTML = `${nav(p, "anleitung")}<h1>${esc(p.name)}</h1>
    <div class="etiketten"><span class="etikett stark">Raglan von oben</span><span class="etikett">Passform ${esc(finde(D.ease.passformen, passform(p)).name.toLowerCase())}</span><span class="etikett">Schwierigkeit: ${esc(stufe?.name)}</span></div>
    ${pr.geschaetzt ? hinweisBox("wichtig", null, "Gerechnet mit geschätzter Maschenprobe. Für einen passenden Pulli erst die Probe stricken.") : ""}
    <div class="karte"><h2>Fertigmaße</h2><table class="tabelle">
      <tr><td>Brustumfang</td><td>${zahl(erg.zahlen.KK / (pr.m10 / 10), 0)} cm</td></tr>
      <tr><td>Oberarm</td><td>${zahl(erg.zahlen.AA / (pr.m10 / 10), 0)} cm</td></tr>
      <tr><td>Länge hinten ab Nacken</td><td>${zahl(f.laenge)} cm</td></tr>
      <tr><td>Passe</td><td>${zahl(f.raglantiefe)} cm</td></tr>
      <tr><td>Körper ab Achsel</td><td>${zahl(erg.koerperAbAchsel)} cm</td></tr>
      <tr><td>Ärmellänge</td><td>${zahl(p.groesse.masse.armlaenge)} cm</td></tr></table></div>
    <div class="karte"><h2>Material</h2>
      <p><b>Garn:</b> Garnklasse ${erg.material.garnklasse} (${esc(finde(D.garne.garnklassen, erg.material.garnklasse).name)}), ${esc(finde(D.garne.fasern, p.faser).name)}.
      ${erg.garn.gramm ? `Ca. <b>${erg.garn.gramm} g</b>${erg.garn.meter ? ` (${erg.garn.meter} m)` : ""} inkl. 10 % Reserve.` : `Menge: Probe wiegen und auf der Seite Maschenprobe eintragen (Fläche ca. ${zahl(erg.garn.flaecheCm2 / 10000, 2)} m²).`}</p>
      <table class="tabelle">${erg.material.nadeln.map((n) => `<tr><td>${esc(n.wofuer)}<div class="leise">${esc(n.art)}</div></td><td>${zahl(n.mm, 2)} mm</td></tr>`).join("")}</table>
      <p style="margin-top:12px"><b>Zubehör:</b> ${erg.material.zubehoer.map(esc).join(", ")}</p></div>
    ${erg.pruefungen.map((x) => hinweisBox(x.stufe, null, x.meldung)).join("")}
    ${regelBoxen(p, erg)}
    <details><summary>Abkürzungen (${abk.length})</summary><table class="tabelle">${abk.map((a) => `<tr><td><b>${esc(a.kurz)}</b> ${esc(a.lang)}</td><td class="leise">${esc(a.en ?? "")}</td></tr>`).join("")}</table></details>
    <h2>Anleitung</h2>${schritte}
    <div class="leiste unten-fest"><a class="knopf" href="#/p/${p.id}/probe">Zurück</a><a class="knopf primaer" href="#/p/${p.id}/stricken">Stricken starten</a></div>`;
}

function seiteStricken(p) {
  let erg;
  try { erg = berechne(p); } catch { location.hash = `#/p/${p.id}/anleitung`; return; }
  const folge = strickfolge(erg);
  const fo = p.fortschritt;
  fo.schritt = Math.min(fo.schritt, folge.length - 1);
  const s = folge[fo.schritt];
  const liste = s.runden || s.reihen || null;
  const gesamt = liste ? liste.length : s.zaehlen || 0;
  const n = fo.zaehler[s.id] || 0;
  const fertig = gesamt === 0 || n >= gesamt;
  const neu = (s.techniken || []).filter((t) => !fo.gesehen.includes(t)).map(technik).filter(Boolean);
  const wort = s.reihen ? "Reihe" : "Runde";

  let feld = "", daumen = "";
  if (gesamt > 0 && !fertig) {
    const akt = liste ? liste[n] : null;
    let vorschau = "";
    if (liste) {
      const k = liste.findIndex((x, i) => i > n && x.zunahme);
      if (k > n && !akt.zunahme) vorschau = `In ${k - n} ${k - n === 1 ? wort : wort + "n"}: ${liste[k].text}`;
      else if (n + 1 < gesamt) vorschau = `Danach: ${liste[n + 1].text}`;
    }
    feld = `<div class="zaehlfeld">
      <div class="zaehler ${tick ? "tick" : ""}" aria-live="polite">${n + 1}<small> / ${gesamt}</small></div><div class="zaehler-wort">${wort}</div>
      ${akt ? `<div class="jetzt ${akt.zunahme ? "aktion" : ""}">${esc(akt.text)}${akt.maschen ? `<div class="maschen">danach ${akt.maschen} M</div>` : ""}</div>` : ""}
      ${vorschau ? `<p class="vorschau">${esc(vorschau)}</p>` : ""}</div>`;
    daumen = `<div class="daumen"><div class="zaehl-knoepfe"><button class="knopf gross" data-zaehl="-1" ${n === 0 ? "disabled" : ""} aria-label="Eine ${wort} zurück">−1</button>
      <button class="knopf primaer gross" data-zaehl="1">${wort} fertig</button></div></div>`;
  } else {
    const naechster = folge[fo.schritt + 1];
    feld = s.maschen || naechster ? `<div class="zaehlfeld">
      ${s.maschen ? `<div class="jetzt">Hast du jetzt ${s.maschen} M auf der Nadel?${s.kontrolle ? `<div class="maschen">${esc(s.kontrolle)}</div>` : ""}</div>` : ""}
      ${naechster ? `<p class="vorschau">Als Nächstes: ${esc(naechster.titel)} (${esc(naechster.abschnitt)})</p>` : ""}</div>` : "";
    daumen = `<div class="daumen"><div class="zaehl-knoepfe" ${s.maschen ? "" : 'style="grid-template-columns:1fr"'}>${s.maschen ? `<button class="knopf gross" data-aktion="falsch">Nein</button>` : ""}
      <button class="knopf primaer gross" data-aktion="weiter">${naechster ? (s.maschen ? "Ja, weiter" : "Erledigt, weiter") : "Pulli fertig!"}</button></div></div>`;
  }
  tick = false;

  app.innerHTML = `${nav(p, "stricken")}<div class="strick">
    <div class="strick-kopf"><div class="strick-ort"><span>${esc(s.abschnitt)}</span><span>Schritt ${fo.schritt + 1} von ${folge.length}</span></div>
    ${maschenreihe(fo.schritt / folge.length, "Fortschritt am ganzen Pulli")}
    <h1>${esc(s.titel)}</h1></div>
    ${neu.length ? `<div class="neu"><b>Neu für dich</b>${neu.map((t) => `<p><b>${esc(t.name)}:</b> ${esc(t.erklaerung)}</p>`).join("")}
      <button class="knopf" data-aktion="verstanden">Verstanden</button></div>` : ""}
    ${feld}
    <p class="text">${esc(s.anweisung)}</p>
    ${(s.techniken || []).length ? `<div class="technik-chips">${s.techniken.map((t) => `<button class="chip" data-technik="${t}">${esc(technik(t)?.name ?? t)}</button>`).join("")}</div>` : ""}
    <details><summary>Notiz zu diesem Schritt</summary><textarea data-notiz="${s.id}" placeholder="z. B. 2 Runden mehr gestrickt">${esc(p.notizen[s.id] || "")}</textarea></details>
    <div class="schritt-wechsel"><button class="knopf" data-schritt="-1" ${fo.schritt === 0 ? "disabled" : ""}>Vorheriger Schritt</button>
    <button class="knopf" data-schritt="1" ${fo.schritt >= folge.length - 1 ? "disabled" : ""}>Nächster Schritt</button></div>
    ${daumen}</div>`;
  bildschirmAn();
}

async function bildschirmAn() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch { /* nicht verfügbar */ }
}

// ---------- Router ----------
function route() {
  const [, , id, seite] = location.hash.split("/");
  const y = window.scrollY;
  const p = id && projekt(id);
  if (!p) seiteStart();
  else ({ idee: seiteIdee, schnitt: seiteSchnitt, groesse: seiteGroesse, probe: seiteProbe, anleitung: seiteAnleitung, stricken: seiteStricken }[seite] || seiteIdee)(p);
  if (route.letzte === location.hash) window.scrollTo(0, y); else { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
  document.querySelector(".schritte-nav [aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" });
  route.letzte = location.hash;
  if (seite !== "stricken" && wakeLock) { wakeLock.release(); wakeLock = null; }
}
const aktuellesProjekt = () => projekt(location.hash.split("/")[2]);
const zahlAus = (s) => { const x = parseFloat(String(s).replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : undefined; };

// ---------- Ereignisse ----------
app.addEventListener("click", (ev) => {
  const el = ev.target.closest("button");
  if (!el) return;
  const p = aktuellesProjekt();
  const d = el.dataset;
  if (d.technik) return zeigeTechnik(d.technik);
  if (d.aktion === "neu") { const n = neuesProjekt(); location.hash = `#/p/${n.id}/idee`; return; }
  if (d.aktion === "export") return exportieren(stand);
  if (!p) return;
  if (d.wunsch) { p.auswahl[d.wunsch] = p.auswahl[d.wunsch] === d.wert ? undefined : d.wert; if (d.wunsch === "musterOrt" && d.wert === "nirgends") p.auswahl.musterArt = undefined; }
  else if (d.konstruktion) p.konstruktion = d.konstruktion;
  else if (d.modus) { p.groesse.modus = d.modus; }
  else if (d.zaehl) { tick = d.zaehl === "1"; const s = strickfolge(berechne(p))[p.fortschritt.schritt]; p.fortschritt.zaehler[s.id] = Math.max(0, (p.fortschritt.zaehler[s.id] || 0) + Number(d.zaehl)); }
  else if (d.schritt) { p.fortschritt.schritt = Math.max(0, p.fortschritt.schritt + Number(d.schritt)); }
  else if (d.aktion === "verstanden") { const s = strickfolge(berechne(p))[p.fortschritt.schritt]; p.fortschritt.gesehen.push(...(s.techniken || [])); }
  else if (d.aktion === "weiter") {
    const folge = strickfolge(berechne(p));
    p.fortschritt.erledigt[folge[p.fortschritt.schritt].id] = true;
    if (p.fortschritt.schritt < folge.length - 1) p.fortschritt.schritt++;
    else zeigeText("Geschafft!", "<p>Dein Pulli ist fertig. Waschen, spannen, anziehen.</p>");
  } else if (d.aktion === "falsch") {
    const s = strickfolge(berechne(p))[p.fortschritt.schritt];
    return zeigeText("Maschenzahl stimmt nicht", `<p>Zähle abschnittweise zwischen den Markierern${s.kontrolle ? `: ${esc(s.kontrolle)}` : ""}.</p>
      <p><b>Zu wenige?</b> Prüfe, ob in jeder Zu- bzw. Abnahmerunde an allen Stellen gearbeitet wurde, und ob eine Masche von der Nadel gefallen ist.</p>
      <p><b>Zu viele?</b> Vielleicht wurde eine Runde doppelt zugenommen oder ein Querfaden zusätzlich abgestrickt.</p>
      <p>Ein, zwei Maschen Unterschied kannst du in der nächsten Zu- bzw. Abnahmerunde ausgleichen. Bei mehr lieber zurückstricken.</p>`);
  } else return;
  sichern(); route();
});

app.addEventListener("change", async (ev) => {
  const el = ev.target;
  const d = el.dataset;
  if (d.aktion === "import" && el.files[0]) {
    try { stand = await importieren(el.files[0]); sichern(); route(); } catch (f) { zeigeText("Wiederherstellen fehlgeschlagen", `<p>${esc(f.message)}</p>`); }
    return;
  }
  const p = aktuellesProjekt();
  if (!p) return;
  if (d.feld === "name") p.name = el.value.trim() || "Mein Pulli";
  else if (d.feld === "faser") p.faser = el.value;
  else if (d.feld === "nackenerhoehung") p.nackenerhoehung = el.checked;
  else if (d.feld === "nadelMm") p.nadelMm = Number(el.value);
  else if (d.feld === "standardgroesse") { p.groesse.groesse = el.value; p.groesse.masse = { ...standardMasse(D, "damen", el.value), handgelenk: p.groesse.masse.handgelenk || 16 }; }
  else if (d.mass) { p.groesse.masse[d.mass] = zahlAus(el.value); if (p.groesse.modus === "standard") p.groesse.modus = "eigen"; }
  else if (d.probe) p.probe[d.probe] = zahlAus(el.value);
  else if (d.notiz) { p.notizen[d.notiz] = el.value; sichern(); return; }
  else return;
  sichern(); route();
});

window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && location.hash.endsWith("/stricken")) bildschirmAn(); });

// ---------- Start ----------
(async () => {
  try {
    D = await datenLaden();
    stand = laden();
    route();
  } catch (f) {
    app.innerHTML = `<div class="hinweis wichtig"><b>Die Daten konnten nicht geladen werden.</b>${esc(f.message)}</div>`;
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
