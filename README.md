# Unternehmen online (Mock)

Lokale Nachbildung von „Belege online“ als Testziel für die Klick-Automatisierung (AutoMagic, Microsoft Edge unter Windows 11). Damit lässt sich der Ablauf „Rechnungen des Monats aus Outlook und dem Vodafone-Kundenportal einsammeln und hochladen“ durchspielen, bis der Mandant Zugriff auf das echte Portal gibt.

**Das ist ein Mock ohne jede Verbindung zu DATEV.** Es gibt keine echte Anmeldung, Dateien verlassen den Rechner nicht und werden nicht gespeichert. Im Browser (localStorage) bleiben nur Metadaten: Dateiname, Größe, Typ, Belegtyp, Monat, Zeitpunkt, Status. Passwörter werden nie gespeichert.

Testdaten: Musterfirma GmbH, Beraternummer 12345, Mandantennummer 10001.

## Online zum Testen

https://mgsgde.github.io/datev-mock/ (GitHub Pages, öffentliches Repo `mgsgde/datev-mock`). Auf der Anmeldeseite stehen rechts die Testbelege zum Herunterladen, einzeln oder als ZIP. Die Belegliste liegt pro Browser im localStorage, jeder Tester hat also seine eigene.

Neuen Stand veröffentlichen: `./publish.sh` in diesem Ordner. Das Skript pusht nur den Ordnerinhalt als neuen Commit, ohne Historie aus dem privaten Repo. Danach braucht Pages etwa eine Minute.

## Testbelege

`testbelege/` enthält erfundene Belege (Firmen, Nummern, Beträge ausgedacht, jeweils als MUSTERBELEG gestempelt): drei PDF-Rechnungen, einen Kassenbon als PNG und `Notiz_nicht_erlaubt.txt`, die beim Upload abgelehnt wird. `testbelege.zip` enthält alle fünf.

## Starten unter Windows

Variante 1, mit Python (empfohlen): Eingabeaufforderung im Ordner `datev-mock` öffnen und

    python -m http.server 8080

starten, dann in Edge http://localhost:8080 öffnen. Beenden mit Strg+C.

Variante 2, ohne Python: `index.html` doppelklicken. Läuft auch über `file://`, alles ist offline (keine CDNs, keine externen Schriften). Hinweis: Die gespeicherte Belegliste hängt am Ursprung, `file://` und `http://localhost:8080` haben also getrennte Listen.

Für stabile Pixel-Vergleiche Edge-Zoom auf 100 % lassen. Das Layout ist auf 1366x768 und 1920x1080 ausgelegt, ohne Animationen.

## Klickpfad für den Test

1. Anmeldung: Benutzername und Passwort eintragen (beliebige Werte), „Anmelden“ klicken. Leere Felder zeigen eine Fehlermeldung.
2. Mandantenauswahl: Kachel „Musterfirma GmbH (10001)“ klicken. Die zweite Kachel ist ausgegraut und nicht anklickbar.
3. Belege online: Belegtyp wählen (Standard „Rechnungseingang“), Monat wählen (Standard aktueller Monat), „Belege hochladen“ klicken und im Windows-Dateidialog die PDFs auswählen. Alternativ Dateien auf die gestrichelte Fläche ziehen.
4. Ergebnis prüfen: Im Meldungsbereich unter der Ablagefläche erscheint „2 Belege hochgeladen“ und bleibt bis zum nächsten Upload stehen, rechts daneben das Ergebnis pro Datei. In der Tabelle steht pro Datei Status „Hochgeladen“, nach etwa 2 Sekunden „Bereitgestellt“.
5. Optional „Protokoll herunterladen“: lädt `belege-protokoll-10001.json` mit allen Einträgen, zur automatischen Prüfung des Testlaufs.
6. „Abmelden“ oben rechts führt zurück zur Anmeldung.

Sonderfälle: Andere Dateitypen als PDF, JPG, PNG werden mit einer roten Zeile abgelehnt. Eine Datei mit gleichem Namen und gleicher Größe wird nicht doppelt übernommen, sondern als „Bereits vorhanden“ gemeldet. Der Zähler zeigt „X Belege im Monat MM/YYYY“ für den gewählten Monat. Ein Beleg zählt zu dem Monat, der beim Hochladen im Feld „Monat“ eingestellt war (nicht zum Upload-Datum), die Tabelle zeigt ihn in der Spalte „Monat“.

„Testdaten zurücksetzen“ oben rechts neben der Überschrift leert die Liste für den nächsten Durchlauf.

## Feste Positionen für Pixel-Matching

Der Meldungsbereich hat eine feste Höhe (Platz für drei Ergebniszeilen, mehr wird darin gescrollt). Dadurch steht die Belegtabelle immer an derselben Stelle, egal ob gerade eine Meldung sichtbar ist (Tabellenkopf bei 1366x768 und 1920x1080 jeweils bei y = 467 px, Edge-Zoom 100 %). Die Spaltenbreiten sind fest, lange Dateinamen werden mit „…“ gekürzt.

## Für Entwickler

Alle bedienbaren Elemente haben eine feste `id` und ein `data-testid`, z. B. `btn-anmelden`, `tile-mandant-10001`, `select-belegtyp`, `select-monat`, `btn-belege-hochladen`, `input-datei`, `upload-feedback`, `upload-idle`, `upload-success`, `upload-error`, `beleg-row`, `beleg-monat`, `beleg-status`, `btn-protokoll`, `btn-reset`, `btn-abmelden`.

Dateien: `index.html`, `styles.css`, `app.js`. Screenshots der Ansichten in 1366x768 und 1920x1080 liegen in `screenshots/` (`03a-leer-*` ist „Belege online“ vor dem ersten Upload).
