// Wertet die Wenn-dann-Regeln aus daten/regeln.json gegen die aktuelle Auswahl aus. Kein Sprachmodell.

/** Prüft eine einzelne Bedingung. Fehlt der Wert in der Auswahl, gilt die Bedingung als nicht erfüllt. */
function erfuellt(schluessel, soll, kontext) {
  if (schluessel === "garnklasseMin") return kontext.garnklasse !== undefined && kontext.garnklasse >= soll;
  if (schluessel === "techniken.schwierigkeitMax") return kontext.schwierigkeitMax !== undefined && kontext.schwierigkeitMax >= soll;
  const ist = kontext[schluessel];
  if (ist === undefined || ist === null || ist === "") return false;
  if (Array.isArray(soll)) return soll.includes(ist);
  if (typeof soll === "string" && soll.startsWith("!")) return ist !== soll.slice(1);
  return ist === soll;
}

const passt = (regel, kontext) => Object.entries(regel.wenn).every(([k, v]) => erfuellt(k, v, kontext));

/**
 * @param regeln   Inhalt von regeln.json
 * @param kontext  flaches Objekt mit der Auswahl, z. B. {erfahrung, sitz, passform, faser, garnklasse, konstruktion, musterArt, ...}
 */
export function auswerten(regeln, kontext) {
  return {
    vorschlaege: regeln.vorschlagsRegeln.filter((r) => passt(r, kontext)),
    warnungen: regeln.warnRegeln.filter((r) => passt(r, kontext)),
  };
}

/** Empfohlene Konstruktionen aus allen passenden Vorschlägen, nach Häufigkeit sortiert. */
export function empfohleneKonstruktionen(vorschlaege) {
  const zaehler = new Map();
  for (const v of vorschlaege) for (const k of v.dann.konstruktion || []) zaehler.set(k, (zaehler.get(k) || 0) + 1);
  return [...zaehler.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
