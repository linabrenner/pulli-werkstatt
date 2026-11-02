// Körpermaße und Fertigmaße, nach "05 Maße, Passform und Größen".
import { mitte } from "./grundlagen.js";

/** Körpermaße einer Standardgröße (Mittelwert jeder Spanne). */
export function standardMasse(daten, tabelle, groesse) {
  const t = daten.groessen.tabellen[tabelle];
  const i = t.groessen.indexOf(groesse);
  if (i < 0) throw new Error(`Größe ${groesse} gibt es in der Tabelle ${tabelle} nicht`);
  const masse = {};
  for (const [k, werte] of Object.entries(t["maße"])) masse[k] = mitte(werte[i]);
  return masse;
}

/** Eingegebene Maße gegen die Prüfregeln aus groessen.json testen. */
export function masseWarnungen(daten, masse) {
  const w = [];
  const { brust, oberarm, taille, huefte, schulterbreite, armlochtiefe } = masse;
  if (brust && oberarm && !(oberarm < brust * 0.5)) w.push("oberarm-brust");
  if (taille && huefte && !(taille <= huefte + 10)) w.push("taille-huefte");
  if (brust && schulterbreite && !(schulterbreite < brust / 2)) w.push("schulter-brust");
  if (armlochtiefe && !(armlochtiefe >= 10 && armlochtiefe <= 30)) w.push("armloch");
  const regeln = daten.groessen.plausibilitaet.regeln;
  return w.map((id) => regeln.find((r) => r.id === id).meldung);
}

/** Gesamtlänge hinten ab Nackenwirbel für die gewählte Länge. */
export function gesamtlaenge(daten, masse, laenge, tabelle = "damen") {
  const l = daten.groessen.laengen;
  const basis = masse.rueckenlaengeTaille;
  if (laenge === "crop") return basis + l.crop.damen;
  const zuschlag = (l[tabelle] && l[tabelle][laenge]) ?? l.damen[laenge];
  if (zuschlag === undefined) throw new Error(`Unbekannte Länge ${laenge}`);
  return basis + zuschlag;
}

/** Fertigmaße = Körpermaße + Ease. */
/** Raglantiefe = Armlochtiefe + Schulterschräge + Zugabe in der Tiefe (siehe konstruktionen.json). */
export function raglantiefe(daten, masse) {
  const p = daten.konstruktionen.konstruktionen.find((k) => k.id === "raglan").parameter.raglantiefe;
  return masse.armlochtiefe + p.schulterschraegeCm.standard + p.tiefenEaseCm.standard;
}

export function fertigmasse(daten, masse, { passform, laenge, tabelle, raglantiefeCm }) {
  const pf = daten.ease.passformen.find((p) => p.id === passform);
  if (!pf) throw new Error(`Unbekannte Passform ${passform}`);
  const mp = daten.ease.messpunkte;
  return {
    brust: masse.brust + pf.standardCm,
    oberarm: masse.oberarm + mp.oberarm.standardCm,
    handgelenk: masse.handgelenk + mp.handgelenk.standardCm,
    laenge: gesamtlaenge(daten, masse, laenge, tabelle),
    raglantiefe: raglantiefeCm ?? raglantiefe(daten, masse),
    easeBrust: pf.standardCm,
  };
}

/** Plausibilitätsprüfung der Brust-Ease gegen die Knotions-Prozente. */
export function easeKontrolle(daten, masse, easeCm, passform, garnklasse) {
  const k = daten.ease.knotionsProzent;
  const gruppe = Object.entries(k.garnGruppen).find(([, kl]) => kl.includes(garnklasse))?.[0];
  const spanne = gruppe && k.werte[passform]?.[gruppe];
  if (!spanne) return null;
  const prozent = (easeCm / masse.brust) * 100;
  const [min, max] = spanne;
  const abweichung = prozent < min ? min - prozent : max !== null && prozent > max ? prozent - max : 0;
  return { prozent, spanne, auffaellig: abweichung > 5 };
}
