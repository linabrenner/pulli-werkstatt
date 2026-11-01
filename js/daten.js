// Lädt die Wissensdaten (Kopie aus dem Vault, siehe scripts/daten-holen.sh).
const DATEIEN = ["garne", "nadeln", "groessen", "ease", "konstruktionen", "details", "muster", "techniken", "abkuerzungen", "regeln"];

export async function datenLaden() {
  const eintraege = await Promise.all(
    DATEIEN.map(async (name) => {
      const antwort = await fetch(`daten/${name}.json`);
      if (!antwort.ok) throw new Error(`daten/${name}.json konnte nicht geladen werden`);
      return [name, await antwort.json()];
    })
  );
  return Object.fromEntries(eintraege);
}
