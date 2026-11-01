// Grundformeln aus "03 Maschenprobe und Umrechnung". Reine Funktionen, ohne Zugriff auf Browser oder Dateien.

/** Kaufmännisch runden (0,5 immer aufwärts, anders als Math.round bei negativen Zahlen). */
export function runden(x) {
  return Math.floor(x + 0.5);
}

/** Auf die nächste gerade Zahl runden; bei ungeradem Ergebnis auf- oder abrunden. */
export function gerade(x, aufrunden = true) {
  const n = runden(x);
  if (n % 2 === 0) return n;
  return aufrunden ? n + 1 : n - 1;
}

/** Auf ein Vielfaches des Rapports runden. */
export function aufRapport(x, rapport, aufrunden = true) {
  const n = x / rapport;
  return (aufrunden ? Math.ceil(n - 1e-9) : Math.floor(n + 1e-9)) * rapport;
}

/** Maschenprobe (auf 10 cm) in Maschen bzw. Reihen pro cm. */
export function proCm(auf10cm) {
  return auf10cm / 10;
}

/**
 * Line-Sum-Formel (KC Guild): n Formrunden gleichmäßig über R Runden verteilen.
 * Der letzte Abschnitt bleibt ohne Formgebung.
 * Ergebnis: Abschnitte als [{anzahl, abstand}] (Minderheit zuerst, wie in den Anleitungen),
 * plus die Zahl gerader Schlussrunden.
 */
export function lineSum(R, n) {
  if (n <= 0) return { plan: [], schluss: R };
  const N = n + 1;
  const q = Math.floor(R / N);
  const rest = R % N;
  if (q < 1) throw new Error(`${n} Formrunden passen nicht in ${R} Runden`);
  const lang = rest;          // Abschnitte à q+1
  const kurz = N - rest;      // Abschnitte à q
  let plan, schluss;
  if (kurz > 0) {
    plan = [{ anzahl: lang, abstand: q + 1 }, { anzahl: kurz - 1, abstand: q }];
    schluss = q;
  } else {
    plan = [{ anzahl: lang - 1, abstand: q + 1 }];
    schluss = q + 1;
  }
  plan = plan.filter((p) => p.anzahl > 0).sort((a, b) => a.anzahl - b.anzahl);
  return { plan, schluss };
}

/** Rundennummern (1-basiert), in denen laut Line-Sum-Plan geformt wird. */
export function formrunden({ plan }) {
  const runden = [];
  let r = 0;
  for (const { anzahl, abstand } of plan) {
    for (let i = 0; i < anzahl; i++) {
      r += abstand;
      runden.push(r);
    }
  }
  return runden;
}

/** n Abnahmen gleichmäßig über S Maschen in einer Runde: Segmentlängen (jedes endet mit 2 M zus). */
export function verteilenRund(S, n) {
  if (n <= 0) return [];
  const grenzen = Array.from({ length: n + 1 }, (_, j) => runden((j * S) / n));
  return grenzen.slice(1).map((g, j) => g - grenzen[j]);
}

/** Segmentlängen als Anleitungstext für eine Abnahmerunde zusammenfassen. */
export function abnahmeText(segmente) {
  const teile = [];
  for (const len of segmente) {
    const letzte = teile[teile.length - 1];
    if (letzte && letzte.len === len) letzte.mal++;
    else teile.push({ len, mal: 1 });
  }
  return teile
    .map(({ len, mal }) => {
      const t = len - 2 > 0 ? `${len - 2} M re, 2 M re zus` : "2 M re zus";
      return mal > 1 ? `(${t}) ${mal}×` : t;
    })
    .join(", ");
}

/** Line-Sum-Plan als Text, z. B. "4× in jeder Rd, 25× in jeder 2. Rd, dann 1 Rd gerade". */
export function planText({ plan, schluss }, wort = "Rd") {
  const teile = plan.map(({ anzahl, abstand }) =>
    abstand === 1 ? `${anzahl}× in jeder ${wort}` : `${anzahl}× in jeder ${abstand}. ${wort}`
  );
  if (schluss > 0) teile.push(`dann ${schluss} ${wort} gerade`);
  return teile.join(", ");
}

/** Mittelwert einer Spanne [min, max] oder {min, max}. */
export function mitte(spanne) {
  if (Array.isArray(spanne)) return (spanne[0] + spanne[1]) / 2;
  return (spanne.min + spanne.max) / 2;
}
