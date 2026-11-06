# Integrationsangebote Stadt Zürich

Suchhilfe für Kurse und Programme für Geflüchtete in der Stadt Zürich: https://angebote-zh.github.io

- **Einfache Suche (15 Sprachen):** 6 Fragen (Ausweis, Alter, Deutsch, Ziel, Kinderbetreuung, Frau), danach eine passende Liste zum Zeigen, Drucken oder Kopieren, mit der Nummer der AOZ Info-Line in der gewählten Sprache.
- **Fachpersonen (Deutsch):** alle Angebote als Tabelle mit Filtern (Zielgruppe, Deutsch-Niveau, Ziel, Thema, Kinderbetreuung, Ort), Kosten, Merkliste und CSV-Export.

## Daten

| Datei | Quelle | Stand |
|---|---|---|
| `data/iazh.json` | Angebotsdatenbank Integrationsagenda Kanton Zürich, [integrationsangebote.zh.ch](https://integrationsangebote.zh.ch/home) | siehe `fetched` |
| `data/viventa.json` | [Fachschule Viventa, Stadt Zürich](https://www.stadt-zuerich.ch/de/bildung/ausbildung-weiterbildung/integrationsangebote.html), von Hand erfasst | siehe `fetched` |

Die Kantonsdatenbank enthält Angebote aus dem ganzen Kanton. Das Tool zeigt nur Angebote in der Stadt Zürich (Region «Zürich» = Bezirk Zürich = Stadt; ohne Regionsangabe zählt der Ort). Die IAZH-Angebote sind für vorläufig Aufgenommene (F) und anerkannte Flüchtlinge (B); die Zuweisung läuft über die fallführende Stelle.

Daten aktualisieren:

```sh
python3 tools/refresh.py
```

## Übersetzungen

Die Oberfläche ist in 15 Sprachen (`i18n.js`): Deutsch, Englisch, Französisch, Arabisch, Farsi, Dari, Paschtu, Sorani, Kurmancî, Türkisch, Tigrinya, Ukrainisch, Russisch, Somali, Tamil. Alle ausser Deutsch sind maschinell übersetzt und sollten von Muttersprachigen geprüft werden. Angebotstitel und Beschreibungen bleiben deutsch, wie von den Anbietern publiziert.

## Lokal starten

```sh
python3 -m http.server 8765
```

Dann <http://127.0.0.1:8765> öffnen. Keine Abhängigkeiten, kein Build.
