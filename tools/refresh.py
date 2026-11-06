"""Lädt den kantonalen IAZH-Katalog und schreibt einen schlanken Snapshot nach data/iazh.json.

Aufruf: python3 tools/refresh.py
"""
import datetime
import html
import json
import pathlib
import re
import urllib.request

API = "https://integrationsangebote-backend.zh.ch/api/v1/offers"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "iazh.json"

TG = {
    "Fokus Erwachsene": "adult", "Erwachsene": "adult",
    "Fokus Jugendliche/junge Erwachsene (16-25 Jahre)": "young",
    "Jugendliche (15-18 Jahre)": "young", "Junge Erwachsene (19-25 Jahre)": "young",
    "Fokus Alphabetisierung (16-20 Jahre)": "alpha1620",
    "Fokus schulgewohnte Personen": "schooled", "Fokus schulungewohnte Personen": "unschooled",
    "Fokus Frauen": "women", "Fokus gut- und hochqualifizierte Personen": "qualified",
    "Fokus Personen mit psychischen Belastungen": "psych", "auch Personen mit psychischen Belastungen": "psychok",
    "Gehörlose Personen": "deaf", "keine Fokus-Zielgruppe": "nofocus",
}
LEVELS = ["A1", "A2", "B1", "B2"]


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def items(v):
    return [s.strip() for s in (v or []) if isinstance(s, str) and s.strip()]


def slim(o):
    unknown = [t for t in o["target_group"] if t not in TG]
    if unknown:
        raise ValueError(f"Unbekannte Zielgruppe in {o['internal_reference']}: {unknown}")
    return {
        "id": o["id"], "nr": o["internal_reference"], "title": o["title"].strip(),
        "inst": ", ".join(items(o["institution"])), "dept": o["department_name"], "type": o["offer_type_name"],
        "tg": sorted({TG[t] for t in o["target_group"]}), "region": items(o["region"]),
        "ort": ", ".join(items(o["municipalities_short"])), "price": clean(o["price_formatted"]),
        "de": [l for l in LEVELS if l in (o["german_level_starting"] or [])],
        "level": [l for l in LEVELS if l in (o["course_level"] or [])],
        "goal": items(o["integration_goal"]),
        "topics": list(dict.fromkeys(items(o["course_topic"]) + items(o["industry"]) + items(o["course_content"]))),
        "intensity": clean(o["intensity_short"]), "childcare": items(o["child_care"]),
        "desc": clean(o["short_description"]),
        "phone": (o.get("phone") or "").strip(), "email": (o.get("contact_email") or "").strip(),
        "address": clean(o.get("place_detail")), "web": (o.get("external_offer_url") or o.get("external_url") or "").strip(),
    }


def main():
    req = urllib.request.Request(API, headers={"User-Agent": "integrationsangebote-zh refresh"})
    with urllib.request.urlopen(req, timeout=60) as r:
        offers = json.load(r)
    data = {"fetched": datetime.date.today().isoformat(), "source": API,
            "offers": [slim(o) for o in offers if o.get("state") == "published"]}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(data['offers'])} Angebote -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
