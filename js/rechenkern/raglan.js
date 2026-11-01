// Raglan von oben, nahtlos in Runden, glatt rechts, Rundhals, lange Ärmel, 1×1-Rippen.
// Rechenweg wie in "04 Pulloverkonstruktionen" und "11 Testpulli Raglan".
import { runden, gerade, proCm, lineSum, formrunden, verteilenRund, abnahmeText, planText } from "./grundlagen.js";
import { fertigmasse, easeKontrolle } from "./masse.js";

const finde = (liste, id) => liste.find((x) => x.id === id);

/** Kandidat in der Nähe von ziel, der die Bedingung erfüllt; bei Gleichstand der größere. */
function naechster(ziel, ok, spielraum = 3) {
  const kandidaten = [];
  for (let x = Math.max(1, runden(ziel) - spielraum); x <= runden(ziel) + spielraum; x++) kandidaten.push(x);
  kandidaten.sort((a, b) => Math.abs(a - ziel) - Math.abs(b - ziel) || b - a);
  const x = kandidaten.find(ok);
  if (x === undefined) throw new Error(`Keine passende Maschenzahl in der Nähe von ${ziel.toFixed(1)}`);
  return x;
}

function seillaenge(daten, umfangCm) {
  const passend = daten.nadeln.rundnadelLaengen.werte.filter((w) => umfangCm >= w.umfangMinCm);
  return passend.length ? `Rundnadel ${passend[passend.length - 1].seilCm} cm` : "Nadelspiel oder Magic Loop";
}

function buendchenNadel(daten, nadelMm) {
  const st = daten.nadeln.staerken.map((s) => s.mm);
  const i = st.indexOf(nadelMm);
  const stufen = daten.details.buendchen.nadelDuennerStufen.standard;
  if (i < 0) return Math.max(st[0], nadelMm - 0.5);
  return st[Math.max(0, i - stufen)];
}

/**
 * @param daten  alle JSON-Dateien aus /daten als Objekt {garne, groessen, ease, ...}
 * @param e      Eingabe: { masse, tabelle, passform, laenge, maschenprobe: {m10, r10, rippen10},
 *               nadelMm, garnklasse, nackenerhoehung, probeGewicht10cm?, lauflaenge100g? }
 */
export function berechneRaglan(daten, e) {
  const m = proCm(e.maschenprobe.m10);
  const r = proCm(e.maschenprobe.r10);
  const mRip = proCm(e.maschenprobe.rippen10 ?? e.maschenprobe.m10 * 1.1);
  const km = e.masse;
  const f = fertigmasse(daten, km, e);
  const rg = finde(daten.konstruktionen.konstruktionen, "raglan").parameter;
  const rh = finde(daten.details.halsausschnitte, "rundhals").parameter;
  const bu = daten.details.buendchen;
  const pruefungen = [];

  // --- Passe ---
  const K = gerade(f.brust * m);
  const B0 = gerade(rh.halsbreiteCm.standard * m);
  const uRoh = K * rg.achselanschlagAnteilVonK.standard;
  const U = naechster(uRoh, (u) => (K - 2 * u) % 2 === 0 && ((K - 2 * u) / 2 - B0) % 2 === 0);
  const FB = (K - 2 * U) / 2;
  const aZiel = runden(f.oberarm * m) - U;
  const a0Roh = B0 * rg.aermelAnschlagAnteilVonRuecken.standard;
  const A0 = naechster(a0Roh, (a) => (aZiel - a) % 2 === 0, 2);
  const nK = (FB - B0) / 2;
  const nA = (aZiel - A0) / 2;
  const Y = runden(f.raglantiefe * r);
  const H = 2 * B0 + 2 * A0;

  if (2 * Math.max(nK, nA) > Y) {
    pruefungen.push({ id: "p-raglanTiefe", stufe: "info", meldung: finde(daten.regeln.rechenPruefungen, "p-raglanTiefe").meldung });
  }
  if (Math.max(nK, nA) > Y) throw new Error("Die Passe ist zu kurz für die nötigen Zunahmen. Raglantiefe oder Maße prüfen.");
  const planK = lineSum(Y, nK);
  const planA = lineSum(Y, nA);
  const geradeCm = Math.max(planK.schluss, planA.schluss) / r;
  if (geradeCm > rg.maxGeradeStueckOhneZunahmeCm.standard) {
    pruefungen.push({ id: "p-raglanGerade", stufe: "hinweis", meldung: finde(daten.regeln.rechenPruefungen, "p-raglanGerade").meldung });
  }
  const zunK = new Set(formrunden(planK));
  const zunA = new Set(formrunden(planA));

  // --- Nackenerhöhung ---
  const vr = daten.details.verkuerzteReihen;
  const paare = e.nackenerhoehung ? runden((vr.zielErhoehungCm.standard * r) / 2) : 0;
  const aussen = B0 / 2 + A0 - 2;
  const innen = runden(B0 / 3 / 2);
  const wendestellen = paare > 1
    ? Array.from({ length: paare }, (_, j) => runden(aussen - (j * (aussen - innen)) / (paare - 1)))
    : paare === 1 ? [aussen] : [];
  const erhoehungCm = (2 * paare) / r;

  // --- Körper ---
  const halsH = bu.hoeheCm.hals.standard;
  const saumH = bu.hoeheCm.saum.standard;
  const koerperAbAchsel = f.laenge - halsH - erhoehungCm - f.raglantiefe;
  const koerperGlattRd = runden((koerperAbAchsel - saumH) * r);
  const KK = 2 * FB + 2 * U;
  const saumK = km.huefte >= km.brust - 5 ? 0 : bu.maschenReduktion.standard;
  const saumM = gerade(KK * (1 - saumK));

  // --- Ärmel ---
  const AA = aZiel + U;
  let mUnten = runden(f.handgelenk * m);
  if ((AA - mUnten) % 2) mUnten += 1;
  const nAb = (AA - mUnten) / 2;
  const geradeOben = daten.details.aermelGeradeUnterAchselCm.standard;
  const geradeObenRd = runden(geradeOben * r);
  const manschH = bu.hoeheCm.aermel.standard;
  const rAb = runden((km.armlaenge - manschH - geradeOben) * r);
  const planAb = lineSum(rAb, nAb);
  const manschM = gerade(mUnten * (1 - bu.maschenReduktion.standard));
  const manschSegmente = verteilenRund(mUnten, mUnten - manschM);

  // --- Prüfungen ---
  pruefungen.push({ id: "p-rate", stufe: "ok", meldung: "Nie mehr als 1 Zunahme je Seite pro Runde." });
  const ek = easeKontrolle(daten, km, f.easeBrust, e.passform, e.garnklasse);
  if (ek?.auffaellig) pruefungen.push({ id: "p-easeKnotions", stufe: "info", meldung: finde(daten.regeln.rechenPruefungen, "p-easeKnotions").meldung });
  pruefungen.push({
    id: "p-kopf", stufe: "offen",
    meldung: `Halsöffnung entspannt ${(H / mRip).toFixed(0)} cm. Ob sie über den Kopf passt, hängt von der Dehnung der Rippen ab: vor dem Weiterstricken über den Kopf ziehen.`,
  });

  // --- Material ---
  const nadelB = buendchenNadel(daten, e.nadelMm);
  const material = {
    garnklasse: e.garnklasse,
    nadeln: [
      { mm: e.nadelMm, wofuer: "Passe", art: seillaenge(daten, H / m) },
      { mm: e.nadelMm, wofuer: "Körper", art: seillaenge(daten, KK / m) },
      { mm: e.nadelMm, wofuer: "Ärmel", art: seillaenge(daten, AA / m) },
      { mm: nadelB, wofuer: "Bündchen Hals und Saum", art: `${seillaenge(daten, H / mRip)} und ${seillaenge(daten, saumM / mRip)}` },
      { mm: nadelB, wofuer: "Manschetten", art: seillaenge(daten, manschM / mRip) },
    ],
    zubehoer: [
      "4 Maschenmarkierer + 1 andersfarbiger für den Rundenbeginn",
      "Restgarn oder 2 Maschenraffer für die Ärmel",
      "Wollnadel", "Maßband", "Reihenzähler (oder der Zähler in der App)",
    ],
  };

  // --- Garnbedarf (Flächenmethode) ---
  const passeUnten = (2 * FB + 2 * aZiel) / m;
  const flaeche = ((H / m + passeUnten) / 2) * f.raglantiefe + (KK / m) * koerperAbAchsel
    + 2 * (((AA + mUnten) / m / 2) * km.armlaenge) + (H / m) * halsH;
  const garn = { flaecheCm2: runden(flaeche) };
  if (e.probeGewicht10cm) {
    garn.gramm = runden((e.probeGewicht10cm / 100) * flaeche * daten.details.garnbedarf.reserve);
    if (e.lauflaenge100g) garn.meter = runden((garn.gramm * e.lauflaenge100g) / 100);
  }

  // --- Schritte ---
  const s = [];
  const add = (x) => s.push({ id: `s${s.length + 1}`, ...x });
  add({ abschnitt: "Halsbündchen", titel: "Anschlagen",
    anweisung: `Mit ${nadelB} mm ${H} M im verdrehten Kreuzanschlag anschlagen und zur Runde schließen, ohne die Maschen zu verdrehen. Andersfarbigen MM für den Rundenbeginn setzen (= hintere Mitte).`,
    techniken: ["verdrehterKreuzanschlag", "rundstricken", "markierer"], maschen: H });
  const halsRd = runden(halsH * r);
  add({ abschnitt: "Halsbündchen", titel: "Rippen",
    anweisung: `${halsRd} Rd 1×1-Rippen: *1 M re, 1 M li* wdh. In der letzten Rd die Raglan-MM setzen: ${B0 / 2} M, MM, ${A0} M, MM, ${B0} M, MM, ${A0} M, MM, ${B0 / 2} M.`,
    techniken: ["rechteMasche", "linkeMasche", "markierer"], zaehlen: halsRd, maschen: H });
  add({ abschnitt: "Halsbündchen", titel: "Nadel wechseln", anweisung: `Zur Nadel ${e.nadelMm} mm wechseln.`, maschen: H });

  if (paare > 0) {
    const zeilen = [];
    wendestellen.forEach((w, j) => {
      zeilen.push({ nr: 2 * j + 1, text: `Hinr: re bis ${w} M nach dem Rundenbeginn, wenden, DM.` });
      zeilen.push({ nr: 2 * j + 2, text: `Rückr: li bis ${w} M nach dem Rundenbeginn auf der anderen Seite, wenden, DM.` });
    });
    zeilen.push({ nr: zeilen.length + 1, text: "Re bis zum Rundenbeginn, dabei DM als 1 M stricken." });
    add({ abschnitt: "Nackenerhöhung", titel: `Verkürzte Reihen (${paare} Paare)`,
      anweisung: `Hinten werden ${2 * paare} Reihen extra gestrickt, das hebt den Nacken um ca. ${erhoehungCm.toFixed(1)} cm. Die restlichen DM werden in der 1. Passenrunde abgestrickt.`,
      techniken: ["verkuerzteReihen"], reihen: zeilen, maschen: H });
  }

  const passeRunden = [];
  let mm = H;
  for (let rd = 1; rd <= Y; rd++) {
    const k = zunK.has(rd), a = zunA.has(rd);
    mm += (k ? 4 : 0) + (a ? 4 : 0);
    const text = k && a ? "Zunahmerunde Körper und Ärmel (+8 M)" : k ? "Zunahmerunde nur Körper (+4 M)" : a ? "Zunahmerunde nur Ärmel (+4 M)" : "Runde ohne Zunahme";
    passeRunden.push({ nr: rd, text, maschen: mm, zunahme: k || a });
  }
  add({ abschnitt: "Passe", titel: `Raglan-Zunahmen (${Y} Rd)`,
    anweisung: `Körper: an jedem der 4 MM auf der Seite von Rücken bzw. Vorderteil zunehmen, vor dem MM M1R, nach dem MM M1L. Ärmel: nach dem ersten Ärmel-MM M1L, vor dem zweiten M1R.\nKörper: ${planText(planK)}.\nÄrmel: ${planText(planA)}.`,
    techniken: ["m1r", "m1l", "markierer"], runden: passeRunden, maschen: mm,
    kontrolle: `Rücken ${FB}, Vorderteil ${FB}, Ärmel je ${aZiel} = ${mm} M` });

  add({ abschnitt: "Teilung", titel: "Körper und Ärmel trennen",
    anweisung: `Ärmelmaschen (je ${aZiel}) auf Restgarn stilllegen und unter jeder Achsel ${U} M im Aufstrick-Anschlag neu anschlagen.`,
    techniken: ["maschenStilllegen", "aufstrickAnschlag"], maschen: KK, kontrolle: `Körper = ${KK} M (${(KK / m).toFixed(0)} cm)` });

  add({ abschnitt: "Körper", titel: "Glatt rechts",
    anweisung: `${koerperGlattRd} Rd glatt rechts (${(koerperGlattRd / r).toFixed(1)} cm). Zwischendurch anprobieren: Länge ab Achsel soll am Ende ${(koerperAbAchsel - saumH).toFixed(1)} cm sein.`,
    techniken: ["rechteMasche"], zaehlen: koerperGlattRd, maschen: KK });
  const saumAbn = KK - saumM;
  add({ abschnitt: "Körper", titel: "Saumbündchen",
    anweisung: `Zur Nadel ${nadelB} mm wechseln.${saumAbn > 0 ? ` 1 Rd: ${abnahmeText(verteilenRund(KK, saumAbn))}.` : ""} ${runden(saumH * r)} Rd 1×1-Rippen über ${saumM} M, dann im Rippenmuster abketten.`,
    techniken: ["rechteMasche", "linkeMasche", "abkettenImMuster", ...(saumAbn > 0 ? ["k2tog"] : [])], zaehlen: runden(saumH * r), maschen: saumM });

  const abRunden = new Set(formrunden(planAb));
  const aermelRunden = [];
  let am = AA;
  for (let rd = 1; rd <= geradeObenRd + rAb; rd++) {
    const ab = rd > geradeObenRd && abRunden.has(rd - geradeObenRd);
    if (ab) am -= 2;
    aermelRunden.push({ nr: rd, text: ab ? "Abnahmerunde: 1 M re, ssk, re bis 3 M vor Rundenende, 2 M re zus, 1 M re (−2 M)" : "Runde ohne Abnahme", maschen: am, zunahme: ab });
  }
  add({ abschnitt: "Ärmel (2×)", titel: "Maschen aufnehmen",
    anweisung: `${aZiel} stillgelegte M auf ${e.nadelMm} mm nehmen, aus dem Achselanschlag ${U} M aufnehmen, Rundenbeginn in der Achselmitte.`,
    techniken: ["maschenAufnehmen", "magicLoop"], maschen: AA });
  add({ abschnitt: "Ärmel (2×)", titel: "Ärmel stricken",
    anweisung: `${geradeObenRd} Rd gerade, dann abnehmen: ${planText(planAb)}.`,
    techniken: ["ssk", "k2tog"], runden: aermelRunden, maschen: mUnten,
    kontrolle: `${mUnten} M, Ärmel misst ${(geradeOben + rAb / r).toFixed(0)} cm` });
  add({ abschnitt: "Ärmel (2×)", titel: "Manschette",
    anweisung: `Zur Nadel ${nadelB} mm wechseln.${mUnten > manschM ? ` 1 Rd: ${abnahmeText(manschSegmente)}.` : ""} ${runden(manschH * r)} Rd 1×1-Rippen über ${manschM} M, im Rippenmuster abketten. Zweiten Ärmel genauso.`,
    techniken: ["k2tog", "abkettenImMuster"], zaehlen: runden(manschH * r), maschen: manschM });
  add({ abschnitt: "Fertigstellen", titel: "Fertigstellen",
    anweisung: "Löcher an den Achseln schließen, Fäden vernähen, waschen und auf Fertigmaß spannen.",
    techniken: ["faedenVernaehen", "spannen"] });

  const technikIds = [...new Set(s.flatMap((x) => x.techniken || []))];
  const schwierigkeit = Math.max(...technikIds.map((t) => finde(daten.techniken.techniken, t)?.schwierigkeit ?? 1));

  return {
    fertig: f,
    zahlen: { K, U, FB, aZiel, B0, A0, H, Y, nK, nA, paare, wendestellen, KK, koerperGlattRd, saumM, AA, mUnten, nAb, manschM },
    plaene: { koerper: planText(planK), aermel: planText(planA), aermelAbnahme: planText(planAb) },
    koerperAbAchsel, erhoehungCm, pruefungen, material, garn, schritte: s, technikIds, schwierigkeit,
  };
}
