# Belege-Portal (Testumgebung)

Nachbau des Belege-Uploads aus DATEV Unternehmen online als Testziel für die Klick-Automatisierung (AutoMagic, Microsoft Edge unter Windows 11). Damit lässt sich der Ablauf „Rechnungen des Monats aus Outlook und dem Vodafone-Kundenportal einsammeln und hochladen“ durchspielen, bis der Mandant Zugriff auf das echte Portal gibt.

Öffentlich bewusst neutral: Struktur, Begriffe, Anordnung und Farbwelt folgen dem Original (Anmeldung mit Verfahrenswahl, SmartLogin, Unternehmen auswählen, Übersicht, Upload online, Belege online), aber ohne Logo und ohne DATEV in Kopfzeile und Titel. Die Oberfläche ist als „Testumgebung“ gekennzeichnet, fragt nie Zugangsdaten ab, und das Wort „Mock“ steht nicht in der UI.

**Keine Verbindung zu DATEV.** Dateien verlassen den Rechner nicht und werden nicht gespeichert. Im Browser (localStorage) bleiben nur Metadaten: Dateiname, Größe, Typ, Belegtyp, Zeitpunkt.

Testdaten: Musterfirma GmbH, Beraternummer 12345, Mandantennummer 10001.

## Online zum Testen

https://mgsgde.github.io/datev-mock/ (GitHub Pages, öffentliches Repo `mgsgde/datev-mock`). Auf der Anmeldeseite stehen links die Testbelege zum Herunterladen und Links zu den Testvarianten. Die Belegliste liegt pro Browser im localStorage, jeder Tester hat also seine eigene.

Neuen Stand veröffentlichen: `./publish.sh` in diesem Ordner. Das Skript pusht nur den Ordnerinhalt als neuen Commit, ohne Historie aus dem privaten Repo, und hängt eine Versionsnummer an CSS und JS. Danach braucht Pages etwa eine Minute.

## Testbelege

`testbelege/` enthält erfundene Belege (Firmen, Nummern, Beträge ausgedacht, jeweils als MUSTERBELEG gestempelt): drei PDF-Rechnungen, einen Kassenbon als PNG und `Notiz_nicht_erlaubt.txt`, die in der aktuellen Upload-Version abgelehnt wird. `testbelege.zip` enthält alle fünf. Für die 20-MB-Grenze liegt keine Datei bei, jede PDF über 20 MB taugt dafür.

## Anmeldung wie im Original: zweiter Faktor, ein Mensch muss bestätigen

DATEV Unternehmen online lässt sich nicht mit Benutzername und Passwort allein öffnen, sondern nur mit SmartLogin (QR-Code am Smartphone bestätigen), SmartCard oder mIDentity. Der Nachbau bildet das so ab:

1. Anmeldeverfahren „SmartLogin“ wählen (SmartCard ist ausgegraut), optional „Immer mit diesem Anmeldeverfahren anmelden“ anhaken, „Weiter“. Ohne Auswahl erscheint „Bitte wählen Sie ein Anmeldeverfahren.“ Der Haken wird im Browser gemerkt, beim nächsten Mal ist SmartLogin vorausgewählt.
2. Die Seite zeigt einen QR-Code (nicht scannbar) und „Warte auf Bestätigung am Smartphone …“.
3. Bestätigt wird entweder von einem Menschen über „Bestätigung simulieren“ oder, mit `?confirm=5`, automatisch nach 5 Sekunden.

**AutoMagic darf „Bestätigung simulieren“ nicht selbst klicken.** Der Knopf steht für die Handlung am Smartphone. AutoMagic soll die Warteseite erkennen, den Nutzer auffordern und warten, bis „Unternehmen auswählen“ erscheint. Für unbeaufsichtigte Testläufe `?confirm=N` verwenden.

## Klickpfad für den Test

1. Anmeldung wie oben.
2. Unternehmen auswählen: Zeile „Musterfirma GmbH“ klicken. „Beispiel Handel KG“ ist gesperrt (kein Zugriff). Später wechselt man das Unternehmen über den Namen in der Kopfzeile.
3. Übersicht: links „Belege hochladen“.
4. Upload online: Belegtyp als Reiter wählen (Rechnungseingang, Rechnungsausgang, Kasse, Sonstige), dann „Dateien auswählen“ in der gestrichelten Fläche (öffnet den Windows-Dateidialog) oder Dateien auf die Fläche ziehen. Die Dateien erscheinen in der Vorschauliste, der Reiter zeigt die Anzahl, z. B. „Rechnungseingang (2)“. Mehrere Reiter lassen sich nacheinander füllen.
5. Unten rechts „3 Dateien übertragen“ klicken. Danach steht darunter „Übertragene Dateien (3)“ mit jeder Datei, Belegtyp, Größe und Zeit. Über „Weiter zu…“ geht es zu „Belege online“ oder zur Übersicht. Die Liste „Übertragene Dateien“ gilt nur für den aktuellen Besuch der Seite.
6. Belege online: Tabelle mit Dateiname, Belegtyp, Eingang am, Größe, neueste oben.
7. Abmelden: rechts oben auf „TN“ klicken, im Menü „Abmelden“.

Einen Monat fragt der Upload nicht ab, wie im Original.

## Regeln und Fehlerfälle

- Erlaubte Formate (aktuelle Version): PDF, GIF, JPG, JPEG, TIF, TIFF, PNG, XML. Mit `?version=alt` zusätzlich TXT, DOCX, XLSX, MSG (ältere Upload-Version).
- Andere Formate und Dateien über 20 MB kommen nicht in die Vorschau, die Meldung steht rot über der Liste („Notiz_nicht_erlaubt.txt: Dateiformat wird nicht unterstützt“, „… Datei ist größer als 20 MB“).
- Höchstens 300 Dateien auf einmal.
- Dublette (gleicher Dateiname und gleiche Größe wie ein vorhandener Beleg): beim Übertragen erscheint das Fenster „Beleg ist bereits vorhanden“, Code BT1038, mit Dateiname, Größe, Belegtyp und „Es handelt sich um ein Duplikat.“. Schließen mit ✕ (bei mehreren Dubletten kommt danach die nächste) oder „Original anzeigen“ (öffnet Belege online). Das echte Portal prüft Dubletten am Inhalt, hier vereinfacht.
- Fehlgeschlagene Übertragung (`fail`): „2 Dateien konnten nicht übertragen werden. Bitte erneut versuchen.“ Die Dateien bleiben in der Vorschau, „2 Dateien übertragen“ ist wieder klickbar.

## Testvarianten (URL-Parameter)

Ohne Parameter geht alles sofort. Parameter lassen sich kombinieren, aktive Parameter stehen gelb in der Kopfzeile.

- `delay=1500`: Spinner „Wird geladen …“ für 1500 ms bei jedem Seitenwechsel.
- `cookie=1`: Cookie-Banner beim ersten Aufruf der Sitzung, blockiert die Seite bis „Nur notwendige“ oder „Alle zulassen“.
- `popup=1`: Hinweis „Neuerungen“ beim ersten Öffnen von „Upload online“, blockiert bis „Schließen“.
- `confirm=5`: SmartLogin bestätigt sich nach 5 s selbst, der Knopf „Bestätigung simulieren“ ist dann ausgeblendet.
- `timeout=120`: Die Sitzung läuft nach 120 s ohne Aktion ab. Die nächste Aktion wird verworfen und führt zur Anmeldung mit „Ihre Sitzung ist abgelaufen“. (Im Original etwa 25 Minuten.)
- `fail=0.3`: 30 % der Dateien schlagen beim Übertragen fehl, `fail=1` alle.
- `slow=3000`: Jede Datei braucht beim Übertragen 3000 ms. Währenddessen steht „Wird übertragen: Datei X von Y“, der Knopf zeigt „Übertragung läuft …“ und ist gesperrt.
- `version=alt`: ältere Upload-Version mit zusätzlichen Formaten (siehe oben).

Vorgefertigt auf der Anmeldeseite: „Realistisch“ = `?delay=1500&cookie=1&popup=1&confirm=5`, „Störfälle“ = `?confirm=5&slow=3000&fail=0.3&timeout=120`.

## Testleiste

Ganz unten liegt eine schmale gelbe Leiste außerhalb der Arbeitsfläche: „Protokoll herunterladen“ lädt `belege-protokoll-10001.json` mit allen Belegen und den aktiven Testparametern (zur automatischen Prüfung des Testlaufs), „Testdaten zurücksetzen“ leert Belegablage und Vorschau. Klicks in der Leiste lösen keinen Sitzungs-Timeout aus.

## Starten unter Windows ohne Internet

Variante 1, mit Python: Eingabeaufforderung im Ordner `datev-mock` öffnen und

    python -m http.server 8080

starten, dann in Edge http://localhost:8080 öffnen. Beenden mit Strg+C.

Variante 2, ohne Python: `index.html` doppelklicken. Läuft auch über `file://`, alles ist offline (keine CDNs, keine externen Schriften). Die gespeicherte Belegliste hängt am Ursprung, `file://` und `http://localhost:8080` haben also getrennte Listen.

Für stabile Pixel-Vergleiche Edge-Zoom auf 100 % lassen. Das Layout ist auf 1366x768 und 1920x1080 ausgelegt, ohne Animationen.

## Feste Positionen für Pixel-Matching

Dropzone, Meldungsbereich und Vorschauliste haben feste Höhen (die Vorschau scrollt ab drei Dateien). Dadurch steht „Dateien übertragen“ immer an derselben Stelle (Oberkante bei y = 592 px in 1366x768 und 1920x1080, Edge-Zoom 100 %), egal ob Meldungen angezeigt werden. Der Unternehmensname steht mittig in der Kopfzeile, auch wenn Testparameter angezeigt werden. Diese Stabilität gibt es so nur im Nachbau, Vorlagen für das echte Portal müssen neu aufgenommen werden.

## Für Entwickler

Alle bedienbaren Elemente haben eine feste `id` und ein `data-testid`, z. B. `radio-smartlogin`, `check-immer`, `btn-weiter`, `login-error`, `login-timeout`, `smartlogin-status`, `btn-smartlogin-simulieren`, `row-unternehmen-10001`, `btn-unternehmen`, `btn-belege-hochladen`, `link-belege-online`, `tab-rechnungseingang` (`-rechnungsausgang`, `-kasse`, `-sonstige`), `dropzone`, `btn-dateien-auswaehlen`, `input-datei`, `upload-error`, `upload-progress`, `pv-list`, `pv-row`, `pv-entfernen`, `btn-uebertragen`, `uebertragen-box`, `uebertragen-row`, `select-weiter`, `dublette`, `dublette-datei`, `btn-dublette-schliessen`, `btn-original-anzeigen`, `beleg-tabelle`, `beleg-row`, `btn-benutzer`, `btn-abmelden`, `btn-protokoll`, `btn-reset`, `spinner`, `cookie-banner`, `btn-cookie-notwendig`, `popup-hinweis`, `btn-popup-schliessen`. `body[data-view]` nennt die aktuelle Ansicht.

Dateien: `index.html`, `styles.css`, `app.js`. Screenshots aller Ansichten und Varianten in 1366x768 und 1920x1080 liegen in `screenshots/`.
