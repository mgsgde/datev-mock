# Belege-Portal (DATEV-Ersatz)

Nachbau von „Belege online“ aus DATEV Unternehmen online als Testziel für die Klick-Automatisierung (AutoMagic, Microsoft Edge unter Windows 11). Damit lässt sich der Ablauf „Rechnungen des Monats aus Outlook und dem Vodafone-Kundenportal einsammeln und hochladen“ durchspielen, bis der Mandant Zugriff auf das echte Portal gibt.

**Keine Verbindung zu DATEV.** Die Anmeldung ist simuliert, Dateien verlassen den Rechner nicht und werden nicht gespeichert. Im Browser (localStorage) bleiben nur Metadaten: Dateiname, Größe, Typ, Belegtyp, Monat, Zeitpunkt, Status. Die Oberfläche ist als „Testumgebung“ gekennzeichnet. Das Wort „Mock“ steht bewusst nicht in der UI, weil sie Kunden gezeigt wird.

Testdaten: Musterfirma GmbH, Beraternummer 12345, Mandantennummer 10001.

## Online zum Testen

https://mgsgde.github.io/datev-mock/ (GitHub Pages, öffentliches Repo `mgsgde/datev-mock`). Auf der Anmeldeseite stehen rechts die Testbelege zum Herunterladen und Links zu den Testvarianten. Die Belegliste liegt pro Browser im localStorage, jeder Tester hat also seine eigene.

Neuen Stand veröffentlichen: `./publish.sh` in diesem Ordner. Das Skript pusht nur den Ordnerinhalt als neuen Commit, ohne Historie aus dem privaten Repo. Danach braucht Pages etwa eine Minute.

## Testbelege

`testbelege/` enthält erfundene Belege (Firmen, Nummern, Beträge ausgedacht, jeweils als MUSTERBELEG gestempelt): drei PDF-Rechnungen, einen Kassenbon als PNG und `Notiz_nicht_erlaubt.txt`, die beim Upload abgelehnt wird. `testbelege.zip` enthält alle fünf. Für die 20-MB-Grenze liegt keine Datei bei, jede PDF über 20 MB taugt dafür.

## Anmeldung wie im Original: zweiter Faktor, ein Mensch muss bestätigen

DATEV Unternehmen online lässt sich nicht mit Benutzername und Passwort allein öffnen, sondern nur mit SmartLogin (QR-Code am Smartphone bestätigen), SmartCard oder mIDentity. Das kann AutoMagic nicht übernehmen. Der Nachbau bildet das so ab:

1. „Mit SmartLogin anmelden“ klicken.
2. Die Seite zeigt einen QR-Code (nicht scannbar) und „Warte auf Bestätigung am Smartphone …“.
3. Bestätigt wird entweder von einem Menschen über „Bestätigung simulieren“ oder, mit `?confirm=5`, automatisch nach 5 Sekunden.

**AutoMagic darf „Bestätigung simulieren“ nicht selbst klicken.** Der Knopf steht für die Handlung am Smartphone. AutoMagic soll die Warteseite erkennen, den Nutzer auffordern und warten, bis die Mandantenauswahl erscheint. Für unbeaufsichtigte Testläufe `?confirm=N` verwenden.

## Testvarianten (URL-Parameter)

Ohne Parameter geht alles sofort. Parameter lassen sich kombinieren, aktive Parameter stehen gelb in der Kopfzeile.

- `delay=1500`: Spinner „Wird geladen …“ für 1500 ms bei jedem Seitenwechsel.
- `cookie=1`: Cookie-Banner beim ersten Aufruf der Sitzung, blockiert die Seite bis „Nur notwendige“ oder „Alle akzeptieren“.
- `popup=1`: Hinweis-Dialog „Neu in Belege online“ beim ersten Öffnen von „Belege online“, blockiert bis „Schließen“.
- `confirm=5`: SmartLogin bestätigt sich nach 5 s selbst, der Knopf „Bestätigung simulieren“ ist dann ausgeblendet.
- `timeout=120`: Die Sitzung läuft nach 120 s ohne Aktion ab. Die nächste Aktion wird verworfen und führt zur Anmeldung mit „Ihre Sitzung ist abgelaufen“.
- `fail=0.3`: 30 % der Uploads schlagen fehl („Upload fehlgeschlagen, bitte erneut versuchen“), `fail=1` immer.
- `slow=3000`: Jede Datei braucht 3000 ms. Währenddessen steht „Wird hochgeladen: Datei X von Y“ mit Fortschrittsbalken, der Upload-Knopf ist gesperrt („Upload läuft …“).

Vorgefertigt auf der Anmeldeseite: „Realistisch“ = `?delay=1500&cookie=1&popup=1&confirm=5`, „Störfälle“ = `?confirm=5&slow=3000&fail=0.3&timeout=120`.

## Starten unter Windows ohne Internet

Variante 1, mit Python: Eingabeaufforderung im Ordner `datev-mock` öffnen und

    python -m http.server 8080

starten, dann in Edge http://localhost:8080 öffnen. Beenden mit Strg+C.

Variante 2, ohne Python: `index.html` doppelklicken. Läuft auch über `file://`, alles ist offline (keine CDNs, keine externen Schriften). Die gespeicherte Belegliste hängt am Ursprung, `file://` und `http://localhost:8080` haben also getrennte Listen.

Für stabile Pixel-Vergleiche Edge-Zoom auf 100 % lassen. Das Layout ist auf 1366x768 und 1920x1080 ausgelegt, ohne Animationen.

## Klickpfad für den Test

1. Anmeldung: „Mit SmartLogin anmelden“, dann warten, bis bestätigt ist (siehe oben).
2. Mandantenauswahl: Kachel „Musterfirma GmbH (10001)“ klicken. Die zweite Kachel ist ausgegraut und nicht anklickbar.
3. Belege online: Belegtyp wählen (Standard „Rechnungseingang“), Monat wählen (Standard aktueller Monat), „Belege hochladen“ klicken und im Windows-Dateidialog die Dateien auswählen. Alternativ Dateien auf die gestrichelte Fläche ziehen.
4. Ergebnis prüfen: Im Meldungsbereich erscheint „2 Belege hochgeladen“ und bleibt bis zum nächsten Upload stehen, rechts daneben das Ergebnis pro Datei. In der Tabelle steht pro Datei Status „Hochgeladen“, nach etwa 2 Sekunden „Bereitgestellt“.
5. Optional „Protokoll herunterladen“: lädt `belege-protokoll-10001.json` mit allen Einträgen und den aktiven Testparametern, zur automatischen Prüfung des Testlaufs.
6. „Abmelden“ oben rechts führt zurück zur Anmeldung.

Sonderfälle: Andere Dateitypen als PDF, JPG, PNG werden abgelehnt, ebenso Dateien über 20 MB. Eine Datei mit gleichem Namen und gleicher Größe wird als „Bereits vorhanden“ gemeldet (vereinfacht, DATEV prüft Dubletten anders). Ein Beleg zählt zu dem Monat, der beim Hochladen im Feld „Monat“ eingestellt war, die Tabelle zeigt ihn in der Spalte „Monat“. Ob das echte Portal beim Upload überhaupt einen Monat abfragt, ist ungeklärt.

„Testdaten zurücksetzen“ oben rechts neben der Überschrift leert die Liste für den nächsten Durchlauf.

## Feste Positionen für Pixel-Matching

Der Meldungsbereich hat eine feste Höhe (Platz für drei Ergebniszeilen, mehr wird darin gescrollt, der Fortschritt erscheint ebenfalls dort). Dadurch steht die Belegtabelle immer an derselben Stelle (Tabellenkopf bei 1366x768 und 1920x1080 jeweils bei y = 467 px, Edge-Zoom 100 %). Die Spaltenbreiten sind fest, lange Dateinamen werden mit „…“ gekürzt. Diese Stabilität gibt es so nur im Nachbau, Vorlagen für das echte DATEV müssen neu aufgenommen werden.

## Für Entwickler

Alle bedienbaren Elemente haben eine feste `id` und ein `data-testid`, z. B. `btn-smartlogin`, `smartlogin-status`, `btn-smartlogin-simulieren`, `login-timeout`, `tile-mandant-10001`, `select-belegtyp`, `select-monat`, `btn-belege-hochladen`, `input-datei`, `upload-feedback`, `upload-progress`, `upload-success`, `upload-error`, `beleg-row`, `beleg-monat`, `beleg-status`, `btn-protokoll`, `btn-reset`, `btn-abmelden`, `spinner`, `cookie-banner`, `btn-cookie-notwendig`, `popup-hinweis`, `btn-popup-schliessen`.

Dateien: `index.html`, `styles.css`, `app.js`. Screenshots aller Ansichten und Varianten in 1366x768 und 1920x1080 liegen in `screenshots/`.
