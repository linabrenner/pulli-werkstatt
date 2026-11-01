// Speichert Projekte nur im Browser dieses Geräts. Sicherung als Datei über Export/Import.
const SCHLUESSEL = "pulli-werkstatt.v1";

export function laden() {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    return roh ? JSON.parse(roh) : { projekte: [] };
  } catch {
    return { projekte: [] };
  }
}

export function speichern(stand) {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(stand));
    return true;
  } catch {
    return false;
  }
}

export function exportieren(stand) {
  const blob = new Blob([JSON.stringify(stand, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pulli-werkstatt-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importieren(datei) {
  const stand = JSON.parse(await datei.text());
  if (!stand || !Array.isArray(stand.projekte)) throw new Error("Das ist keine Sicherung der Pulli-Werkstatt.");
  return stand;
}
