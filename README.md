# Elektroplaner

Web-App zur Planung und Durchführung von Elektroinstallationen (Steckdosen, Schalter, Daten, KNX, Leitungen).
Läuft komplett im Browser, ohne Server. Die Daten bleiben lokal im Browser (IndexedDB) und lassen sich als JSON exportieren.

**Stand: Etappe 1** – Grundriss laden, kalibrieren, Wände zeichnen, 3D-Modell, Geräte und Leitungen in 3D, DIN-18015-3-Zonen, VDE-Prüfung.
Noch offen: Bemaßungen (Etappe 4), Druckansichten mit Checklisten (Etappe 5), Material- und Kostenliste (Etappe 6).

## Workflow

1. **Grundriss laden** (Button oben): PDF (auch mehrseitig, jede Seite wird ein Geschoss) oder PNG/JPG.
   Bei PDFs den Druckmaßstab angeben (Standard 1 : 100).
2. **Maßstab kalibrieren** (Werkzeug *K*): zwei Punkte mit bekanntem Abstand anklicken und die echte Länge eintippen.
3. **Wände nachzeichnen** (*W*): Klicken setzt Punkte, Doppelklick/Enter/Rechtsklick beendet. Es rastet an Ecken, Wänden und Raster ein.
   *Shift* schaltet „rechtwinklig“ um. Griffe an gewählten Wänden verschieben die Ecken (verbundene Wände folgen).
4. **Tür/Fenster** (*O*) und **Geräte** (*D*: Steckdosen, Schalter, Ethernet, KNX, Wanddisplay, Dosen) auf Wände klicken, danach ziehen oder rechts im Inspector Maße eintippen.
5. **Leitungen** (*C*): Typ und Höhe wählen, Punkte klicken. Auf ein Gerät klicken verbindet die Leitung damit.
   Für senkrechte Abschnitte neue Höhe eintragen und *Senkrecht* drücken. Leitungen sind in 3D immer sichtbar.
6. Im Inspector erscheinen **VDE-Prüfung** (Belastbarkeit, Spannungsfall, Abschaltbedingung, maximale Länge) und **Zonenprüfung**.

Alle Maße sind intern in Millimetern, die Anzeige lässt sich oben auf mm / cm / m umstellen.

Tastenkürzel: V Auswählen · W Wand · O Tür/Fenster · D Gerät · C Leitung · K Kalibrieren · F Einpassen · ⌘/Strg+Z Rückgängig · ⇧⌘Z Wiederholen · Entf Löschen · Leertaste+Ziehen Ansicht verschieben.

## Normwerte anpassen

Alle Werte stehen zentral in `src/config/catalog.ts` und (pro Projekt) in den **Projekteinstellungen**:

- Installationszonen nach DIN 18015-3 (waagerechte Mitten, Breiten, senkrechter Abstand von Ecken/Öffnungen)
- Strombelastbarkeit nach Verlegeart (`AMPACITY`, Richtwerte nach DIN VDE 0298-4 – bitte gegen die aktuelle Fassung prüfen)
- VDE-Parameter: Grenzwert Spannungsfall, Leitfähigkeit κ, cos φ, Netzimpedanz bis zum Verteiler
- Gerätetypen, Leitungstypen und Preise (Preise sind Platzhalter)

Die VDE-Prüfung ist ein vereinfachtes Modell (Spannungsfall je Leitung, Abschaltbedingung über Schleifenimpedanz).
Sie ersetzt keine Messung nach DIN VDE 0100-600 und keine Fachplanung.

## Entwickeln

```bash
npm install
npm run dev      # lokaler Entwicklungsserver
npm test         # Unit-Tests (Geometrie, Einheiten, VDE, Zonen)
npm run build    # Produktionsbuild nach dist/
```

## Auf GitHub Pages veröffentlichen

1. Repository anlegen und diesen Ordner pushen (Branch `main`).
2. Im Repository unter **Settings → Pages** als Quelle **GitHub Actions** wählen.
3. Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push und veröffentlicht die App unter `https://<user>.github.io/<repo>/`.

## Technik

React · TypeScript · Vite · Three.js (react-three-fiber) · Zustand + Immer (mit Undo/Redo) · pdf.js · IndexedDB (idb-keyval)
