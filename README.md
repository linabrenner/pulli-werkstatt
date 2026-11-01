# Pulli-Werkstatt

Persönliche Web-App: Pulli-Idee zusammenklicken, Größe und Maschenprobe eingeben, durchgerechnete Anleitung bekommen und im Strick-Modus Runde für Runde geführt werden. Nicht gewerblich, ohne Konto, ohne KI. Alle Daten bleiben auf dem Gerät.

Konzept und Wissen: Obsidian-Vault, `03 Bereiche/Stricken/` (Notizen 09–11).

## Ausprobieren

```sh
npm start        # http://localhost:8080
npm test         # Rechenkern gegen die Testfälle prüfen
npm run daten    # App-Daten aus dem Vault neu übernehmen
```

Keine Abhängigkeiten, kein Build-Schritt: nur HTML, CSS, JavaScript-Module und JSON. Node wird nur für Tests und den lokalen Server gebraucht.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `daten/` | Wissensdaten (Kopie aus dem Vault, dort pflegen) |
| `js/rechenkern/` | reine Rechenfunktionen: Grundformeln, Maße, Raglan |
| `js/regeln.js` | Vorschläge und Warnungen aus `daten/regeln.json` |
| `js/app.js` | Oberfläche: Idee, Schnitt, Größe, Maschenprobe, Anleitung, Strick-Modus |
| `js/speicher.js` | Speichern im Browser, Sicherung als Datei |
| `sw.js`, `manifest.webmanifest` | Offline-Betrieb und „Zum Startbildschirm hinzufügen“ |
| `test/` | Tests mit `node --test` |

Neue Version veröffentlichen: in `sw.js` die `VERSION` hochzählen, damit Handys die neuen Dateien holen.

## Stand

Rechnet einen Raglan von oben (glatt rechts, Rundhals, lange Ärmel, 1×1-Rippen) für Damengrößen XS–5X oder eigene Maße. Andere Schnitte, Ausschnitte, Ärmel und Muster sind in den Daten angelegt, werden aber noch nicht berechnet.
