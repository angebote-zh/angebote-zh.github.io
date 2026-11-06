# Integrationsangebote Stadt Zürich

Wegweiser für Angebote für Geflüchtete in der Stadt Zürich: https://angebote-zh.github.io

- **Welcome Desk / Fachpersonen:** Anliegen wählen (Information, Sozialhilfe, Recht, Deutsch, Ausbildung, Arbeit, Gesundheit, Familie, Kontakte), optional Ausweis, Alter, Deutsch, Kinderbetreuung, Fallführung. Ergebnis nach Zugangsweg: direkt hingehen, selbst anmelden, Zuweisung über die fallführende Stelle; mit Voraussetzungen, Kosten, Kontakt. Merkliste als Text oder Handout.
- **Tabelle:** alle Angebote mit Filtern und CSV-Export.
- **Für Geflüchtete (15 Sprachen):** 6 Fragen, danach passende Angebote nach Zugangsweg und die Nummer der AOZ Info-Line in der gewählten Sprache.

## Daten

| Datei | Quelle | Wie |
|---|---|---|
| `data/iazh.json` | Angebotsdatenbank Integrationsagenda Kanton Zürich ([integrationsangebote.zh.ch](https://integrationsangebote.zh.ch/home)) | `python3 tools/refresh.py`; die App zeigt nur Angebote in der Stadt (Region «Zürich» = Stadt; ohne Region zählt der Ort). Für Ausweis F und B, Zuweisung über die fallführende Stelle. |
| `data/aoz.json` | [AOZ Kurse und Angebote](https://aoz.ch/de/kurse-und-angebote) | `python3 tools/build_sources.py`; Einordnung (Anliegen, Zugang, Ausschlüsse, Zusammenführung mit IAZH) steht in den Listen oben im Skript. Neue AOZ-Angebote ohne Einordnung lassen das Skript abbrechen. |
| `data/stadt.json` | [Wegweiser Stadt Zürich](https://www.stadt-zuerich.ch/de/lebenslagen/unterstuetzung-und-beratung/izs/wegweiser/migration/asyl.html), Rubrik Asyl plus ausgewählte Einträge für Geflüchtete | ebenfalls `tools/build_sources.py` (Liste `STADT`) |
| `data/viventa.json` | [Fachschule Viventa](https://www.stadt-zuerich.ch/de/bildung/ausbildung-weiterbildung/integrationsangebote.html) | von Hand aus den Zulassungsseiten |

Ohne Gewähr: Aufnahme, freie Plätze und Finanzierung klärt immer die Stelle selbst.

## Übersetzungen

Die Oberfläche ist in 15 Sprachen (`i18n.js`): Deutsch, Englisch, Französisch, Arabisch, Farsi, Dari, Paschtu, Sorani, Kurmancî, Türkisch, Tigrinya, Ukrainisch, Russisch, Somali, Tamil. Alle ausser Deutsch sind maschinell übersetzt und sollten von Muttersprachigen geprüft werden. Angebotstitel und Beschreibungen bleiben deutsch, wie von den Anbietern publiziert.

## Lokal starten

```sh
python3 -m http.server 8765
```

Dann <http://127.0.0.1:8765> öffnen. Keine Abhängigkeiten, kein Build.
