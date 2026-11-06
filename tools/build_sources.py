"""Builds data/aoz.json and data/stadt.json from the AOZ website and the city's IZS signpost.

The lists below are the hand curation: which offers count for refugees in the City of Zürich,
which need they answer, how people get in (access) and which permits are admitted.

Run: python3 tools/build_sources.py
"""
import datetime
import html
import json
import pathlib
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "angebote-zh build_sources"}
AOZ = "https://aoz.ch"
IZS = "https://www.stadt-zuerich.ch/content/web/de/lebenslagen/unterstuetzung-und-beratung/izs/wegweiser/data/_jcr_content.izssocialservices.json"
IZS_PAGE = "https://www.stadt-zuerich.ch/de/lebenslagen/unterstuetzung-und-beratung/izs/wegweiser/migration/asyl.html"
ALL = ["N", "F", "S", "B"]
INFOLINE = ("Arabisch +41 79 343 34 74 · Dari/Farsi/Paschtu +41 79 941 69 39 · Französisch +41 79 832 86 52 · "
            "Deutsch, Kurmancî, Türkisch +41 79 943 18 73 · Englisch +41 79 227 36 95 · Sorani +41 79 947 32 52 · "
            "Tigrinya +41 79 792 50 51 · Ukrainisch/Russisch +41 79 942 62 59 (WhatsApp, SMS, Anruf)")

# ---- AOZ curation -------------------------------------------------------------------------
# Offers outside the city, only via RAV, or not aimed at refugees.
AOZ_SKIP = {
    "angebote-fuer-gemeinden-im-bereich-fruehe-kindheit", "deutschkurs-adliswil", "deutschkurs-birmensdorf",
    "deutschkurs-dietikon", "deutschkurs-horgen", "deutschkurs-oberengstringen", "deutschkurs-richterswil",
    "deutschkurs-schlieren", "deutschkurs-thalwil", "deutschkurs-waedenswil", "deutschkurse-gemeinden-a1-b1",
    "deutschkurse-plus-kanton-schwyz-a1-b1", "fachberatung-rav", "jobcoaching-plus-fuer-stellensuchende",
    "motivationssemester-next-level", "praxis-check", "strategiekurse-d", "workcenter-qualifizierung-fuer-stellensuchende",
    "individuelle-erstgespraeche", "infopoint-integration-schlieren", "infopoint-wohnen-schlieren",
    "tour-der-offenen-tueren", "treffpunkt-fuer-eltern-und-kinder-waedenswil",
    "kantonaler-deutschtest-im-einbuergerungsverfahren-kde", "future-kids-mentoringprogramm",
    "bewerbungsunterstuetzung-coaching-und-nachbegleitung-fuer-gehoerlose",
}
# AOZ pages that describe an offer already in the IAZH catalogue: merged into that entry.
AOZ_IAZH = {
    "alphabetisierung-intensiv-mit-deutschkurs-fuer-langsam-lernende": "S-03-004",
    "alphabetisierung-semi-intensiv-mit-deutschkurs-fuer-langsam-lernende": "S-03-005",
    "deutsch-lokal-a1-a2": "S-02-004",
    "deutsch-mit-ziel-arbeitsmarkt-festigungskurs-a1-a2": "S-01-034",
    "deutsch-mit-ziel-arbeitsmarkt-intensiv-a1-b2": "S-01-021",
    "deutsch-mit-ziel-arbeitsmarkt-semi-intensiv-a1-b2": "S-01-022",
    "arbeitsintegrationscoaching-fuer-gut-oder-hochqualifizierte": "AI-04-021",
    "arbeitsintegrationscoaching-fuer-personen-mit-arbeitsmarktpotenzial": "AI-04-020",
    "arbeitsintegrationscoaching-fuer-personen-mit-ausbildungspotenzial": "AI-04-022",
    "arbeitsintegrationscoaching-fuer-personen-mit-psychischen-belastungen": "AI-04-023",
    "detailhandel-und-transport-brockito": "AI-01-017", "gastrokurs-mit-zertifikat-gastrozuerich": "AI-03-006",
    "gep-berufliche-integration": "AI-02-014", "kompetenzerfassung": "A-01-005",
    "pflegekurs-mit-srk-gleichwertigkeitszertifikat": "AI-03-008", "praxisassessment": "A-02-007",
    "produktionskueche-tasteria-systemgastronomie": "AI-01-021", "reinigungskurs-mit-wetrok-zertifikat": "AI-03-009",
    "restaurant-riedbach": "AI-01-019", "restaurant-und-catering-paprika": "AI-01-015",
    "velostationen-zueri-rollt": "AI-01-014", "velowerkstatt-zueri-rollt": "AI-01-016",
    "vollschulisches-bildungsangebot-alpha-tast-integral": "B-03-001",
    "vollschulisches-bildungsangebot-berufsbildung-basics-intensiv": "B-01-027",
    "vollschulisches-bildungsangebot-berufsbildung-integration-intensiv": "B-01-001",
}
# need, access (direkt | anmeldung | zuweisung); status is derived from the text unless given.
AOZ_NEW = {
    "ahoi-ankommen-mit-kindern-im-vorschulalter": ("familie", "anmeldung"),
    "begleitete-ausbildung-schreinerpraktikerin-eba": ("bildung", "zuweisung"),
    "begleitete-ausbildungen-restaurant-und-kueche-riedbach": ("bildung", "zuweisung"),
    "begleitete-vorlehre-detailhandelsfachfraumann-textil-oder-moebel": ("bildung", "zuweisung"),
    "begleitete-vorlehre-fahrradmechanikerin": ("bildung", "zuweisung"),
    "berufsvorbereitungsjahr-bvj-trampolin-basic": ("bildung", "zuweisung"),
    "bewerbungsunterstuetzung-und-nachbegleitung": ("arbeit", "zuweisung"),
    "deutsch-der-bibliothek": ("deutsch", "direkt"), "deutsch-der-langstrasse": ("deutsch", "direkt"),
    "deutsch-im-letzipark": ("deutsch", "direkt"), "deutsch-leimbach": ("deutsch", "direkt"),
    "deutsch-lernen-mit-dem-handy-und-computer": ("deutsch", "direkt"), "deutsch-oerlikon": ("deutsch", "direkt"),
    "deutschpruefung-telc-a2-b2": ("deutsch", "anmeldung"), "fide-test-a1-b1": ("deutsch", "anmeldung"),
    "pruefungstraining-telc-a2-b2": ("deutsch", "anmeldung"),
    "familiencoaching": ("familie", "zuweisung"),
    "handwerkstatt-tagesstruktur-und-stabilisierende-foerderung": ("arbeit", "zuweisung"),
    "info-line-fuer-gefluechtete": ("info", "direkt"),
    "infopoint-integration-stadt-zuerich": ("info", "direkt"),
    "kurzassessment-kostenlos": ("arbeit", "zuweisung"),
    "muttersprachliche-erstinformation": ("info", "anmeldung"),
    "psychotherapie-und-beratung-fuer-erwachsene": ("gesundheit", "zuweisung"),
    "psychotherapie-und-beratung-fuer-minderjaehrige-und-junge-erwachsene": ("gesundheit", "zuweisung"),
    "ressourcenabklaerung": ("arbeit", "zuweisung"),
    "supported-education": ("bildung", "zuweisung"),
    "swiss-info-beratungen": ("info", "direkt"),
    "swiss-info-erstgespraeche": ("info", "zuweisung"),
    "swiss-info-juniors-kurse": ("info", "anmeldung"),
    "tandemprogramm": ("kontakte", "anmeldung"),
    "tueren-oeffnen": ("kontakte", "anmeldung"),
    "veloplus-academy": ("arbeit", "zuweisung"),
    "walk-in": ("arbeit", "direkt"),
    "zuercher-anlaufstelle-rassismus-zueras": ("recht", "direkt"),
}
# Sections that describe something else than the participants' prerequisites (e.g. volunteers).
AOZ_NO_VORAUS = {"tueren-oeffnen", "tandemprogramm"}
FILLER = re.compile(r"^(Standorte?|Gerne beraten wir Sie persönlich\.?|Auf dieser Seite)$")
# Admission rules taken from the provider texts (age from–to, German minimum, literacy).
# alphaCourse = suitable for people still learning to read and write; literacy = Latin script required.
ADULT_LIT = {"age": [18, None], "literacy": True}
AOZ_RULES = {
    "alphabetisierung-intensiv-mit-deutschkurs-fuer-langsam-lernende": {"age": [18, None], "alphaCourse": True},
    "alphabetisierung-semi-intensiv-mit-deutschkurs-fuer-langsam-lernende": {"age": [18, None], "alphaCourse": True},
    "arbeitsintegrationscoaching-fuer-gut-oder-hochqualifizierte": {"age": [18, 60], "deMin": "A2"},
    "arbeitsintegrationscoaching-fuer-personen-mit-arbeitsmarktpotenzial": {"age": [18, 60], "deMin": "A2"},
    "arbeitsintegrationscoaching-fuer-personen-mit-ausbildungspotenzial": {"age": [18, 60], "deMin": "A2"},
    "arbeitsintegrationscoaching-fuer-personen-mit-psychischen-belastungen": {"age": [18, 60], "deMin": "A2"},
    "begleitete-ausbildung-schreinerpraktikerin-eba": {"deMin": "A2"},
    "begleitete-ausbildungen-restaurant-und-kueche-riedbach": {"age": [15, 25]},
    "begleitete-vorlehre-detailhandelsfachfraumann-textil-oder-moebel": {"age": [15, 25]},
    "begleitete-vorlehre-fahrradmechanikerin": {"age": [15, 25]},
    "berufsvorbereitungsjahr-bvj-trampolin-basic": {"age": [16, 40], "deMin": "A2", "literacy": True},
    "bewerbungsunterstuetzung-und-nachbegleitung": {"age": [18, 55], "deMin": "A1"},
    "detailhandel-und-transport-brockito": {"deMin": "A1"}, "gep-berufliche-integration": {"deMin": "A1"},
    "produktionskueche-tasteria-systemgastronomie": {"deMin": "A1"}, "restaurant-riedbach": {"deMin": "A1"},
    "restaurant-und-catering-paprika": {"deMin": "A1"}, "velostationen-zueri-rollt": {"deMin": "A1"},
    "velowerkstatt-zueri-rollt": {"deMin": "A1"}, "gastrokurs-mit-zertifikat-gastrozuerich": {"deMin": "A1"},
    "pflegekurs-mit-srk-gleichwertigkeitszertifikat": {"deMin": "B1", "literacy": True},
    "reinigungskurs-mit-wetrok-zertifikat": {"deMin": "A2"},
    "praxisassessment": {"deMin": "A1"}, "ressourcenabklaerung": {"deMin": "A2"},
    "deutsch-lokal-a1-a2": ADULT_LIT, "deutsch-mit-ziel-arbeitsmarkt-intensiv-a1-b2": ADULT_LIT,
    "deutsch-mit-ziel-arbeitsmarkt-semi-intensiv-a1-b2": ADULT_LIT, "deutsch-mit-ziel-arbeitsmarkt-festigungskurs-a1-a2": ADULT_LIT,
    "deutschpruefung-telc-a2-b2": {"deMin": "A2", "literacy": True}, "pruefungstraining-telc-a2-b2": {"deMin": "A2", "literacy": True},
    "fide-test-a1-b1": {"deMin": "A1", "literacy": True},
    "deutsch-der-bibliothek": {"age": [18, None]}, "deutsch-der-langstrasse": {"age": [18, None]}, "deutsch-im-letzipark": {"age": [18, None]},
    "deutsch-leimbach": {"age": [18, None]}, "deutsch-oerlikon": {"age": [18, None]}, "deutsch-lernen-mit-dem-handy-und-computer": {"age": [18, None], "literacy": True},
    "psychotherapie-und-beratung-fuer-minderjaehrige-und-junge-erwachsene": {"age": [0, 25]},
    "psychotherapie-und-beratung-fuer-erwachsene": {"age": [18, None]},
    "swiss-info-juniors-kurse": {"age": [15, 25]},
    "vollschulisches-bildungsangebot-alpha-tast-integral": {"age": [16, 25], "alphaCourse": True},
    "vollschulisches-bildungsangebot-berufsbildung-basics-intensiv": {"age": [16, 40], "literacy": True},
    "vollschulisches-bildungsangebot-berufsbildung-integration-intensiv": {"age": [16, 40], "literacy": True},
}
AOZ_STATUS = {  # where the text does not say it clearly
    "kurzassessment-kostenlos": ["F", "B"], "pflegekurs-mit-srk-gleichwertigkeitszertifikat": ["F", "B"],
    "reinigungskurs-mit-wetrok-zertifikat": ["F", "B"],
}

# ---- City IZS curation (match on the start of the entry name) -------------------------------
STADT = [
    ("AOZ - soziale und berufliche Integration für Geflüchtete", "sozial", "direkt"),
    ("SRK Kanton Zürich - Sozialberatung", "sozial", "direkt"),
    ("Kantonales Sozialamt - Rückkehrberatung", "recht", "direkt"),
    ("Migrationsamt Kanton Zürich - Information über Einreise", "recht", "direkt"),
    ("AsyLex", "recht", "direkt"),
    ("Freiplatzaktion Zürich", "recht", "direkt"),
    ("Schweizerische Flüchtlingshilfe SFH - Informationen", "recht", "direkt"),
    ("Schweizerische Flüchtlingshilfe SFH - Juristische", "recht", "direkt"),
    ("Zürcher Beratungsstelle für Asylsuchende", "recht", "direkt"),
    ("Anlaufstelle für Sans-Papiers SPAZ", "recht", "anmeldung"),
    ("SAH MIRSAH", "recht", "direkt"),
    ("AOZ - Beratung bei psychosozialen Problemen", "gesundheit", "direkt"),
    ("NCBI Schweiz Sektion Zürich - Brückenbauer", "gesundheit", "direkt"),
    ("Spirit - Strategien", "gesundheit", "anmeldung"),
    ("\"aacho\" - Mutter-Kind-Gruppen", "familie", "direkt"),
    ("NCBI Schweiz Sektion Zürich - Kurse für Familien", "familie", "anmeldung"),
    ("\"aacho - am Tag\"", "kontakte", "direkt"),
    ("OFF Ort für Frauen", "kontakte", "direkt"),
    ("Solinetz Zürich - Tandem", "kontakte", "anmeldung"),
    ("SRK \"Meet'n'Speak\"", "kontakte", "anmeldung"),
    ("HEKS Neue Gärten Zürich", "kontakte", "anmeldung"),
    ("Autonome Schule Zürich", "deutsch", "direkt"),
    ("Solinetz Zürich - Kostenlose Deutschkurse", "deutsch", "direkt"),
    ("Laufbahnzentrum Zürich - Information für Migrant", "bildung", "direkt"),
    ("Amt für Jugend und Berufsberatung Kanton Zürich – Bildungsangebote für Geflüchtete", "bildung", "direkt"),
    ("Stiftung Futuri - FUTURI Ausbildungsbegleitung", "bildung", "zuweisung"),
]


STADT_RULES = {
    "Amt für Jugend und Berufsberatung Kanton Zürich – Bildungsangebote für Geflüchtete": {"age": [16, None]},
    "SRK \"Meet'n'Speak\"": {"age": [5, 25]},
    "OFF Ort für Frauen": {"womenOnly": True},
    "\"aacho\" - Mutter-Kind-Gruppen": {"womenOnly": True},
    "Schweizerische Flüchtlingshilfe SFH - Informationen": {"remote": True},
    "Schweizerische Flüchtlingshilfe SFH - Juristische": {"remote": True},
    "NCBI Schweiz Sektion Zürich - Brückenbauer": {"remote": True},
    "NCBI Schweiz Sektion Zürich - Kurse für Familien": {"remote": True},
    "AsyLex": {"remote": True},
}


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode("utf-8")


def nuxt(page):
    raw = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', page, re.S).group(1)
    d = json.loads(raw)
    memo = {}
    wrap = {"Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError"}

    def r(i):
        if not isinstance(i, int) or i < 0:
            return None
        if i in memo:
            return memo[i]
        v = d[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in wrap:
                memo[i] = r(v[1]) if len(v) > 1 else None
                return memo[i]
            if v and isinstance(v[0], str) and v[0] in ("Set", "Date", "BigInt", "RegExp"):
                memo[i] = v[1:] if v[0] == "Set" else v[1]
                return memo[i]
            out = []
            memo[i] = out
            out.extend(r(x) for x in v)
            return out
        if isinstance(v, dict):
            out = {}
            memo[i] = out
            for k, x in v.items():
                out[k] = r(x)
            return out
        memo[i] = v
        return v

    return r(0)


def text(h):
    h = re.sub(r"<(br|/p|/li|/h\d)[^>]*>", "\n", h or "")
    h = re.sub(r"<li[^>]*>", "• ", h)
    h = html.unescape(re.sub(r"<[^>]+>", "", h))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", h)).strip()


def sections(entity):
    sec, contacts, intro = {}, [], []

    def split_h3(h):
        parts = re.split(r"<h3[^>]*>(.*?)</h3>", h or "")
        out = {"_": text(parts[0])}
        for i in range(1, len(parts), 2):
            out[text(parts[i])] = text(parts[i + 1])
        return out

    def walk(ps):
        for p in ps or []:
            b, pr = p.get("bundle"), p.get("props") or {}
            if b == "info_box":
                d = split_h3(pr.get("text"))
                sec[(pr.get("title") or "Info").strip()] = d.pop("_")
                sec.update({k.strip(): v for k, v in d.items()})
            elif b == "accordeon":
                sec[(pr.get("title") or "").strip()] = "\n".join(text((q.get("props") or {}).get("text")) for q in pr.get("paragraphs") or [] if (q.get("props") or {}).get("text"))
            elif b == "text":
                d = split_h3(pr.get("text"))
                kept = "\n".join(x for x in d["_"].split("\n") if not FILLER.match(x.strip()))
                if kept:
                    intro.append(kept)
                d.pop("_")
                sec.update({k.strip(): v for k, v in d.items() if v})
            elif b == "contact":
                tx = pr.get("taxonomy") or {}
                c = {k: tx.get(k) for k in ("name", "email", "phone") if tx.get(k)}
                a = tx.get("address")
                if isinstance(a, dict):
                    a = ", ".join(str(a[k]) for k in ("addressLine1", "addressLine2", "postalCode", "locality") if a.get(k))
                if a:
                    c["address"] = a
                if c and c not in contacts:
                    contacts.append(c)
            else:
                walk(pr.get("paragraphs"))

    walk(entity.get("paragraphs"))
    return sec, contacts, "\n".join(intro)


def first(sec, *keys):
    for k in keys:
        if sec.get(k):
            return sec[k]
    return ""


def status_from(txt):
    t = txt.lower()
    if re.search(r"unabhängig vo[mn] (ihrem )?aufenthaltsstatus|mit oder ohne migrationshintergrund", t):
        return ALL
    if re.search(r"vorläufig aufgenommen|anerkannte flüchtling", t) and not re.search(r"geflüchtete und zugewanderte", t):
        return ["F", "B"]
    return None


def build_aoz():
    root = nuxt(get(f"{AOZ}/de/kurse-und-angebote"))
    teasers = next(v for k, v in root["data"].items() if "getIntegrationProgramTeasers" in k)
    slugs = [t["url"]["path"].rsplit("/", 1)[-1] for t in teasers]
    unknown = [s for s in slugs if s not in AOZ_SKIP and s not in AOZ_IAZH and s not in AOZ_NEW]
    if unknown:
        raise SystemExit(f"Neue AOZ-Angebote ohne Einordnung, bitte in build_sources.py ergänzen: {unknown}")

    def detail(slug):
        root = nuxt(get(f"{AOZ}/de/kurse-und-angebote/{slug}"))
        return slug, next(v for k, v in root["data"].items() if "routeSlug" in k)["route"]["entity"]

    with ThreadPoolExecutor(8) as ex:
        pages = dict(ex.map(detail, [s for s in slugs if s not in AOZ_SKIP]))
    out = []
    for slug, e in pages.items():
        sec, contacts, intro = sections(e)
        tags = [t["label"] for t in e.get("tag") or []]
        zg = first(sec, "Zielgruppe", "Zielgruppe und Voraussetzungen", "Wer kann teilnehmen?")
        voraus = first(sec, "Voraussetzungen", "Zielgruppe und Voraussetzungen")
        entry = {
            "id": f"aoz-{slug}", "src": "AOZ", "title": e["title"], "inst": "Asyl-Organisation Zürich (AOZ)",
            "url": f"{AOZ}/de/kurse-und-angebote/{slug}", "lead": "\n".join(x for x in (text(e.get("lead")), intro) if x)[:1500],
            "zg": zg, "voraus": "" if slug in AOZ_NO_VORAUS or voraus == zg else voraus,
            "anmeldung": first(sec, "Anmeldung", "Einstieg / Anmeldung", "Anmeldung und Kosten"),
            "orte": first(sec, "Standorte", "Telefonnummern der Info-Lines:", "Standort"),
            "kosten": first(sec, "Kosten", "Kosten und Finanzierung"),
            "zeiten": " · ".join(x for x in (first(sec, "Tage", "Tage und Zeiten", "Kurszeit", "Daten und Zeiten"), first(sec, "Zeit"), first(sec, "Dauer")) if x),
            "childcare": ["mit Kinderbetreuung"] if "mit Kinderbetreuung" in tags else [],
            "contacts": contacts[:3],
            "status": AOZ_STATUS.get(slug) or status_from(zg + " " + voraus) or (["F", "B"] if slug in AOZ_IAZH else ALL),
            "rules": AOZ_RULES.get(slug, {}),
        }
        if slug in AOZ_IAZH:
            entry["iazh"] = AOZ_IAZH[slug]
            entry["access"] = "zuweisung"
        else:
            entry["need"], entry["access"] = AOZ_NEW[slug]
        out.append(entry)
    return sorted(out, key=lambda o: o["title"])


def build_stadt():
    data = json.loads(get(IZS))
    out = []
    for prefix, need, access in STADT:
        hits = [o for o in data if (o.get("name") or "").startswith(prefix)]
        if len(hits) != 1:
            raise SystemExit(f"IZS-Eintrag nicht eindeutig gefunden ({len(hits)}): {prefix}")
        o = hits[0]
        addr = ", ".join(x for x in (o.get("addressLine1"), f"{o.get('zip', '')} {o.get('place', '')}".strip()) if x)
        out.append({
            "id": f"stadt-{o['id']}", "src": "Stadt", "need": need, "access": access, "status": ALL,
            "title": o["name"].replace('"', "").strip(),
            "inst": o.get("facilityName") or o.get("fundingBodyName") or "",
            "lead": text(o.get("description")), "zg": o.get("coverage") or "",
            "contacts": [{k: v for k, v in {"address": addr, "phone": o.get("phone"), "email": o.get("email")}.items() if v}],
            "url": o.get("websiteUrl") or IZS_PAGE,
            "rules": STADT_RULES.get(prefix, {}),
        })
    return out


def main():
    stamp = datetime.date.today().isoformat()
    aoz = build_aoz()
    for o in aoz:  # the Info-Line numbers sit in a widget the script cannot read
        if o["id"] == "aoz-info-line-fuer-gefluechtete":
            o["orte"] = INFOLINE
    (ROOT / "data" / "aoz.json").write_text(json.dumps({"fetched": stamp, "source": f"{AOZ}/de/kurse-und-angebote", "offers": aoz}, ensure_ascii=False, indent=1))
    stadt = build_stadt()
    (ROOT / "data" / "stadt.json").write_text(json.dumps({"fetched": stamp, "source": IZS_PAGE, "offers": stadt}, ensure_ascii=False, indent=1))
    print(f"AOZ {len(aoz)} ({sum(1 for o in aoz if 'iazh' in o)} mit IAZH zusammengeführt), Stadt {len(stadt)}")


if __name__ == "__main__":
    main()
