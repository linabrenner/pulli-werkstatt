// Tests gegen die Testfälle aus der Recherche und den Testpulli ("11 Testpulli Raglan").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { lineSum, formrunden, verteilenRund, abnahmeText, planText, gerade } from "../js/rechenkern/grundlagen.js";
import { standardMasse } from "../js/rechenkern/masse.js";
import { berechneRaglan } from "../js/rechenkern/raglan.js";
import { auswerten } from "../js/regeln.js";

const ordner = new URL("../daten/", import.meta.url);
const daten = Object.fromEntries(
  readdirSync(ordner).filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(new URL(f, ordner), "utf8"))])
);

test("Line-Sum-Formel: Beispiel KC Guild (90 Reihen, 70 → 100 M)", () => {
  // KC Guild: 6 Abschnitte à 5 und 10 à 6 Reihen, einer davon ohne Zunahme.
  // Die App lässt einen kurzen Abschnitt gerade, KC Guild einen langen; beides ist gültig.
  const p = lineSum(90, 15);
  assert.deepEqual(p.plan, [{ anzahl: 5, abstand: 5 }, { anzahl: 10, abstand: 6 }]);
  assert.equal(p.schluss, 5);
  assert.equal(p.plan.reduce((s, x) => s + x.anzahl * x.abstand, 0) + p.schluss, 90);
  assert.equal(formrunden(p).length, 15);
});

test("Gleichmäßig verteilen: Segmente ergeben die Maschenzahl", () => {
  const seg = verteilenRund(37, 3);
  assert.equal(seg.reduce((a, b) => a + b, 0), 37);
  assert.equal(abnahmeText(seg), "10 M re, 2 M re zus, 11 M re, 2 M re zus, 10 M re, 2 M re zus");
  assert.equal(abnahmeText([12, 12, 13]), "(10 M re, 2 M re zus) 2×, 11 M re, 2 M re zus");
});

test("Gerade runden", () => {
  assert.equal(gerade(201.6), 202);
  assert.equal(gerade(33.3), 34);
  assert.equal(gerade(41.8), 42);
});

test("EPS: Abnahmefaktoren führen von 138 % K zu ca. 41 % K", () => {
  const eps = daten.konstruktionen.konstruktionen.find((k) => k.id === "rundpasse").parameter;
  const passe = 1 + 2 * eps.eps.aermelOberarm.standard - 4 * eps.eps.achselJeTeil.standard;
  const hals = eps.abnahmerunden.reduce((p, a) => p * a.faktor, passe);
  assert.ok(Math.abs(passe - 1.38) < 1e-9);
  assert.ok(Math.abs(hals - 0.414) < 0.002);
});

test("Testpulli Raglan Damen M: alle Zahlen wie in der Notiz", () => {
  const tf = daten.konstruktionen.konstruktionen.find((k) => k.id === "raglan").testfallEigen;
  const masse = { ...standardMasse(daten, "damen", "M"), handgelenk: tf.eingabe.handgelenkCm };
  const erg = berechneRaglan(daten, {
    masse, tabelle: "damen", passform: tf.eingabe.passform, laenge: "huefte",
    maschenprobe: { m10: tf.eingabe.maschen10cm, r10: tf.eingabe.runden10cm, rippen10: tf.eingabe.rippenMaschen10cm },
    nadelMm: 4.0, garnklasse: 3, nackenerhoehung: true,
  });
  const z = erg.zahlen, w = tf.erwartet;
  assert.equal(z.K, w.K);
  assert.equal(z.U, w.achselanschlag);
  assert.equal(z.FB, w.vorderUndRuecken);
  assert.equal(z.aZiel, w.aermelAchsel);
  assert.equal(z.B0, w.anschlag.ruecken);
  assert.equal(z.A0, w.anschlag.aermel);
  assert.equal(z.H, w.anschlag.gesamt);
  assert.equal(z.Y, w.passeRunden);
  assert.equal(erg.plaene.koerper, "4× in jeder Rd, 25× in jeder 2. Rd, dann 1 Rd gerade");
  assert.equal(erg.plaene.aermel, "3× in jeder 3. Rd, 22× in jeder 2. Rd, dann 2 Rd gerade");
  assert.equal(z.paare, w.nackenerhoehungPaare);
  assert.deepEqual(z.wendestellen, w.wendestellenAbMitte);
  assert.equal(z.KK, w.koerperNachTeilung);
  assert.equal(z.koerperGlattRd, w.koerperGlattRunden);
  assert.equal(z.saumM, w.saumMaschen);
  assert.equal(z.AA, w.aermelOben);
  assert.equal(z.mUnten, w.aermelUnten);
  assert.equal(erg.plaene.aermelAbnahme, "5× in jeder 6. Rd, 14× in jeder 5. Rd, dann 5 Rd gerade");
  assert.equal(z.manschM, w.manschette);
  // Maschenzahl nach der Passe
  const passe = erg.schritte.find((s) => s.abschnitt === "Passe");
  assert.equal(passe.runden.at(-1).maschen, 326);
  const aermel = erg.schritte.find((s) => s.titel === "Ärmel stricken");
  assert.equal(aermel.runden.at(-1).maschen, 37);
  assert.ok(erg.pruefungen.some((p) => p.id === "p-raglanTiefe"));
});

test("Raglan rechnet für alle Damengrößen ohne Fehler", () => {
  for (const g of daten.groessen.tabellen.damen.groessen) {
    const masse = { ...standardMasse(daten, "damen", g), handgelenk: 16 };
    for (const passform of ["eng", "klassisch", "locker", "oversized"]) {
      const erg = berechneRaglan(daten, {
        masse, tabelle: "damen", passform, laenge: "huefte",
        maschenprobe: { m10: 22, r10: 30, rippen10: 24 }, nadelMm: 4.0, garnklasse: 3, nackenerhoehung: true,
      });
      const passe = erg.schritte.find((s) => s.abschnitt === "Passe").runden.at(-1).maschen;
      assert.equal(passe, 2 * erg.zahlen.FB + 2 * erg.zahlen.aZiel, `${g} ${passform}`);
    }
  }
});

test("Regeln: Anfängerin bekommt Raglan/Drop Shoulder vorgeschlagen, Superwash warnt", () => {
  const erg = auswerten(daten.regeln, { erfahrung: "erster", faser: "superwash" });
  assert.ok(erg.vorschlaege.some((v) => v.id === "v-anfaenger"));
  assert.ok(erg.warnungen.some((w) => w.id === "w-superwash"));
  assert.ok(!erg.warnungen.some((w) => w.id === "w-alpakaLaenge"));
});

test("Regeln: Negation und Mindestwerte", () => {
  const a = auswerten(daten.regeln, { anschlag: "schlauchanschlag", buendchenMuster: "rippen2x2" });
  assert.ok(a.warnungen.some((w) => w.id === "w-schlauchanschlag"));
  const b = auswerten(daten.regeln, { anschlag: "schlauchanschlag", buendchenMuster: "rippen1x1" });
  assert.ok(!b.warnungen.some((w) => w.id === "w-schlauchanschlag"));
  const c = auswerten(daten.regeln, { garnklasse: 6 });
  assert.ok(c.vorschlaege.some((v) => v.id === "v-grobesGarn"));
});

test("planText", () => {
  assert.equal(planText({ plan: [{ anzahl: 2, abstand: 4 }], schluss: 0 }), "2× in jeder 4. Rd");
});
