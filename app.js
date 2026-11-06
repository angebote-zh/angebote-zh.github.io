import { LANGS, INFOLINE, T } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const de = (s) => `<span lang="de" dir="ltr">${esc(s)}</span>`;

// ---------- vocabulary ----------
const NEEDS = [
  ["info", "Information & Orientierung", "n_info"],
  ["sozial", "Sozialhilfe & Alltag", "n_sozial"],
  ["recht", "Recht & Aufenthalt", "n_recht"],
  ["deutsch", "Deutsch lernen", "gLang"],
  ["bildung", "Schule & Ausbildung", "gEdu"],
  ["arbeit", "Arbeit & Abklärung", "gWork"],
  ["gesundheit", "Gesundheit & Psyche", "n_gesundheit"],
  ["familie", "Familie & Kinder", "n_familie"],
  ["kontakte", "Kontakte & Freizeit", "n_kontakte"],
];
const NEED_DE = Object.fromEntries(NEEDS.map(([k, d]) => [k, d]));
const ACCESS = [
  ["direkt", "Direkt hingehen / anrufen", "Ohne Anmeldung oder Zuweisung: Kontakt und Öffnungszeiten weitergeben."],
  ["anmeldung", "Selbst anmelden", "Die Person meldet sich selbst an (teils telefonisch). Voraussetzungen und Fristen erklären."],
  ["zuweisung", "Zuweisung über die fallführende Stelle", "Läuft über die Sozialberatung (AOZ / Sozialzentrum). An die fallführende Stelle verweisen."],
];
const ACCESS_DE = Object.fromEntries(ACCESS.map(([k, d]) => [k, d]));
const DEPT_NEED = { "Sprache": "deutsch", "Bildung": "bildung", "Arbeitsintegration": "arbeit", "Abklärung": "arbeit" };
const TG_DE = {
  adult: "Erwachsene", young: "16–25 J.", alpha1620: "Alpha 16–20", schooled: "schulgewohnt", unschooled: "schulungewohnt",
  women: "Fokus Frauen", qualified: "Hochqualifizierte", psych: "psychisch belastet", psychok: "auch psychisch belastet", deaf: "Gehörlose", nofocus: "",
};
const TG_SHOWN = ["young", "adult", "women", "alpha1620", "unschooled", "schooled", "qualified", "psych", "deaf"];
const AGE_GROUPS = { u16: [0, 15], "16": [16, 17], "18": [18, 20], "21": [21, 25], "26": [26, 40], "41": [41, 120] };
const AGE_OPTS = [["u16", "unter 16"], ["16", "16–17"], ["18", "18–20"], ["21", "21–25"], ["26", "26–40"], ["41", "41+"]];
const LEVELS = ["A1", "A2", "B1", "B2"];
const SRC_LABEL = { IAZH: "IAZH (Kanton)", AOZ: "AOZ", Stadt: "Wegweiser Stadt Zürich", Viventa: "Viventa" };
const SRC_SHORT = { IAZH: "IAZH", AOZ: "AOZ", Stadt: "Wegweiser Stadt", Viventa: "Viventa" };
const WOMEN_ONLY = /für Frauen|Frauen\*|Mütter|Migrantinnen|Mutter-Kind/i;

let lang = "de";
let offers = [];
let meta = {};
const answers = {};
const picked = new Set();
const desk = { need: "", status: "", age: "", de: "", kids: false, sex: "", case: "" };

function t(key, vars = {}) {
  const s = (T[lang] && T[lang][key]) ?? T.de[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// ---------- data ----------
// Only offers that take place in the City of Zürich. "Region Zürich" in the canton's data only says who may attend,
// so it counts only when no location is given.
const inCity = (o) => /\bZürich\b/.test(o.ort) || (!o.ort && o.region.includes("Zürich"));
const childcareOf = (arr) => (arr.some((c) => /^mit/i.test(c)) ? "ja" : arr.length && arr.every((c) => /^ohne/i.test(c)) ? "nein" : "unklar");

function fromIazh(o) {
  const need = DEPT_NEED[o.dept];
  if (!need) throw new Error(`Unbekannter IAZH-Bereich «${o.dept}» bei ${o.nr}`);
  const alpha = /Alpha/i.test(o.type) || o.tg.includes("alpha1620");
  const ageTags = o.tg.filter((x) => ["adult", "young", "alpha1620"].includes(x));
  const age = ageTags.length && !ageTags.includes("adult") && !o.tg.includes("nofocus") ? [16, ageTags.includes("young") ? 25 : 20] : [16, null];
  return {
    id: `iazh-${o.id}`, src: "IAZH", nr: o.nr, title: o.title, inst: o.inst, need, type: o.type,
    access: "zuweisung", status: ["F", "B"], statusNote: "F und B, finanziert über die Integrationspauschale",
    tg: o.tg, topics: o.topics, zeiten: o.intensity, kosten: o.price, lead: o.desc, ort: o.ort, zg: "", voraus: "", anmeldung: "",
    contacts: [{ phone: o.phone, email: o.email, address: o.address }].filter((c) => c.phone || c.email || c.address),
    url: `https://integrationsangebote.zh.ch/detail/${o.id}`, web: o.web, orte: "",
    r: {
      age, de: o.de, deMin: null, alphaCourse: alpha, literacy: !alpha && (need === "deutsch" || need === "bildung") ? true : null,
      womenOnly: WOMEN_ONLY.test(`${o.title} ${o.inst}`), childcare: childcareOf(o.childcare), nException: false, remote: false,
    },
  };
}

function curated(o, base) {
  const rules = o.rules || {};
  const b = base?.r || { age: null, de: [], deMin: null, alphaCourse: false, literacy: null, womenOnly: false, childcare: "unklar", nException: false, remote: false };
  const out = {
    tg: [], topics: [], contacts: [], ort: "", type: SRC_LABEL[o.src], zg: "", voraus: "", anmeldung: "", orte: "", zeiten: "", kosten: "", lead: "",
    ...(base || {}), ...o,
    tg: o.tg?.length ? o.tg : base?.tg || [],
    topics: o.topics?.length ? o.topics : base?.topics || [],
    contacts: o.contacts?.length ? o.contacts : base?.contacts || [],
    zeiten: o.zeiten || base?.zeiten || "",
    kosten: o.kosten || base?.kosten || "",
    need: o.need || base?.need,
    nr: base?.nr || o.nr || "",
    r: {
      age: rules.age ?? b.age,
      de: o.de?.length ? o.de : b.de,
      deMin: rules.deMin ?? b.deMin,
      alphaCourse: rules.alphaCourse ?? b.alphaCourse,
      literacy: rules.literacy ?? b.literacy,
      womenOnly: rules.womenOnly ?? (b.womenOnly || WOMEN_ONLY.test(o.title)),
      childcare: o.childcare?.length ? childcareOf(o.childcare) : b.childcare,
      nException: rules.nException ?? false,
      remote: rules.remote ?? false,
    },
  };
  if (base) out.iazhNote = `Auch im kantonalen Katalog (Nr. ${base.nr}${base.kosten ? `, Tarif ${base.kosten}` : ""}): für F/B über die Integrationspauschale.`;
  return out;
}

function validate(o) {
  if (!ACCESS_DE[o.access]) throw new Error(`Ungültiger Zugang «${o.access}» bei ${o.id}`);
  if (!NEED_DE[o.need]) throw new Error(`Ungültiges Anliegen «${o.need}» bei ${o.id}`);
  const a = o.r.age;
  if (a && !(Number.isInteger(a[0]) && (a[1] === null || Number.isInteger(a[1])))) throw new Error(`Ungültiges Alter bei ${o.id}`);
  return o;
}

async function load() {
  const files = ["iazh", "aoz", "stadt", "viventa"];
  const [iazh, aoz, stadt, viv] = await Promise.all(files.map((f) => fetch(`data/${f}.json`).then((r) => r.json())));
  meta = { iazh: iazh.fetched, aoz: aoz.fetched, stadt: stadt.fetched, viventa: viv.fetched };
  const byNr = new Map(iazh.offers.map((o) => [o.nr, fromIazh(o)]));
  const merged = new Set();
  const cur = [...aoz.offers, ...stadt.offers, ...viv.offers].map((o) => {
    const base = o.iazh ? byNr.get(o.iazh) : null;
    if (o.iazh && !base) throw new Error(`IAZH-Nr. ${o.iazh} (bei ${o.id}) nicht im Katalog gefunden`);
    if (base) merged.add(o.iazh);
    return curated(o, base);
  });
  offers = [...iazh.offers.filter(inCity).filter((o) => !merged.has(o.nr)).map(fromIazh), ...cur].map(validate);
}

// ---------- matching: one rule set for desk, table and simple mode ----------
const lvl = (l) => LEVELS.indexOf(l);
const fmtAge = (a) => (a[1] == null ? `ab ${a[0]}` : a[0] === 0 ? `bis ${a[1]}` : `${a[0]}–${a[1]}`);

// person: { status, age: [lo, hi] | null, de: "alpha" | "A1".."B2" | "", kids: bool, sex: "m" | "f" | "" }
function check(o, p) {
  const r = o.r, flags = [];
  if (p.status && !o.status.includes(p.status)) return null;
  if (p.status === "N" && r.nException) flags.push("Ausweis N: nur mit Ausnahmebewilligung");
  if (p.age && r.age) {
    const [a, b] = [r.age[0], r.age[1] ?? 120];
    if (p.age[1] < a || p.age[0] > b) return null;
    if (p.age[0] < a || p.age[1] > b) flags.push(`Alter ${fmtAge(r.age)} J. prüfen`);
  }
  if (p.de === "alpha") {
    if (o.need === "deutsch") {
      if (!r.alphaCourse && r.literacy !== null) return null;
      if (!r.alphaCourse) flags.push("kein Alphabetisierungskurs – nachfragen");
    } else if (r.literacy === true || (r.deMin && lvl(r.deMin) >= 1)) return null;
  } else if (p.de) {
    if (r.alphaCourse) return null;
    if (r.deMin && lvl(p.de) < lvl(r.deMin)) return null;
    if (r.de.length && !r.de.includes(p.de)) return null;
  }
  if (p.kids) {
    if (r.childcare === "nein") return null;
    if (r.childcare === "unklar") flags.push("Kinderbetreuung nachfragen");
  }
  if (p.sex === "m" && r.womenOnly) return null;
  return flags;
}

function score(o, p) {
  let s = o.src !== "IAZH" ? 1 : 0;
  if (p.age && p.age[1] <= 25 && o.tg.includes("young")) s += 3;
  if (p.sex === "f" && (o.tg.includes("women") || o.r.womenOnly)) s += 2;
  if (p.kids && o.r.childcare === "ja") s += 2;
  if (p.de === "alpha" && o.r.alphaCourse) s += 3;
  return s;
}

// ---------- one summary for card, handout and copied text ----------
function contactLines(o) {
  const rows = o.contacts.map((c) => [c.name, c.address, c.phone, c.email, c.hours].filter(Boolean).join(" · ")).filter(Boolean);
  if (o.orte) rows.push(o.orte);
  if (o.r.remote) rows.push("Sitz ausserhalb der Stadt Zürich – Beratung telefonisch/online");
  return rows;
}

function eligibility(o) {
  const r = o.r;
  const firstSentence = (o.lead.split(/(?<=[.!?])\s/)[0] || "").slice(0, 180);
  const who = o.zg || o.tg.map((x) => TG_DE[x]).filter(Boolean).join(", ") || firstSentence;
  const ausweis = o.status.length === 4 ? "alle (N, F, S, B)" : o.status.join(", ");
  const deutsch = r.alphaCourse ? "für Personen, die lesen und schreiben lernen"
    : [r.deMin ? `mindestens ${r.deMin}` : r.de.length ? `Einstieg ${r.de.join("/")}` : "", r.literacy ? "lateinische Schrift lesen und schreiben" : ""].filter(Boolean).join(", ");
  const lines = [
    ["Für wen", who],
    ["Ausweis", ausweis + (r.nException ? " – N nur mit Ausnahmebewilligung" : "") + (o.statusNote && !r.nException ? ` (${o.statusNote})` : "")],
    ["Alter", r.age ? `${fmtAge(r.age)} Jahre` : ""],
    ["Deutsch", deutsch],
    ["Kinderbetreuung", r.childcare === "ja" ? "ja" : r.childcare === "nein" ? "nein" : ""],
    ["Weitere Voraussetzungen", o.voraus],
  ].filter(([, v]) => v);
  if (!o.voraus && !r.age && !deutsch) lines.push(["Weitere Voraussetzungen", "beim Anbieter nachfragen"]);
  return lines;
}

function summaryText(o) {
  const lines = [...eligibility(o), ["Zugang", ACCESS_DE[o.access] + (o.anmeldung ? `: ${o.anmeldung}` : "")], ["Kosten", o.kosten], ["Kontakt", contactLines(o).join(" | ")]];
  return `• ${o.title} – ${o.inst}\n` + lines.filter(([, v]) => v).map(([k, v]) => `  ${k}: ${String(v).replace(/\s*\n\s*/g, " ")}`).join("\n") + `\n  ${o.url}`;
}

const dl = (lines) => `<dl class="elig">${lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
const contactHtml = (o) => contactLines(o).map((x) => `<div>${esc(x)}</div>`).join("");

// ---------- language / routing ----------
function setLang(code) {
  lang = T[code] ? code : "de";
  const L = LANGS.find((l) => l.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = L.rtl ? "rtl" : "ltr";
  try { localStorage.setItem("lang", lang); } catch { /* storage may be blocked */ }
  $("lang").value = lang;
  $("home").textContent = t("appTitle");
  $("langLabel").textContent = t("chooseLang");
  document.title = t("appTitle");
  $("mtNote").textContent = lang === "de" ? "" : t("mt");
  $("dataNote").innerHTML = `Quellen: <a href="https://integrationsangebote.zh.ch/home">IAZH-Katalog</a> (nur Angebote mit Ort Stadt Zürich, Stand ${esc(meta.iazh)}) · <a href="https://aoz.ch/de/kurse-und-angebote">AOZ</a> (${esc(meta.aoz)}) · <a href="https://www.stadt-zuerich.ch/de/lebenslagen/unterstuetzung-und-beratung/izs/wegweiser/migration/asyl.html">Wegweiser Stadt Zürich</a> (${esc(meta.stadt)}) · <a href="https://www.stadt-zuerich.ch/de/bildung/ausbildung-weiterbildung/integrationsangebote.html">Fachschule Viventa</a> (${esc(meta.viventa)}). Ohne Gewähr: Aufnahme, freie Plätze und Finanzierung klärt immer die Stelle selbst.`;
  route();
}

function route() {
  const h = location.hash.replace("#", "");
  document.body.dataset.view = h || "home";
  if (h === "desk") return renderDesk();
  if (h === "pro") return renderTable();
  if (h === "self") return renderStep(0);
  if (h === "results") return Object.keys(answers).length === QUESTIONS.length ? renderResults() : renderStep(0);
  renderHome();
}

function renderHome() {
  $("app").innerHTML = `<section class="hero">
    <h1>${esc(t("appTitle"))}</h1><p>${esc(t("tagline"))}</p>
    <button class="choice" id="goSelf"><b>${esc(t("modeSelf"))}</b><span>${esc(t("modeSelfSub"))}</span></button>
    <button class="choice" id="goDesk" lang="de" dir="ltr"><b>Welcome Desk / Fachpersonen</b><span>Wohin mit welchem Anliegen: Voraussetzungen, Zugangsweg, Kontakt</span></button>
    <button class="choice" id="goPro" lang="de" dir="ltr"><b>Alle Angebote als Tabelle</b><span>Filter, Kosten, Merkliste, CSV</span></button>
  </section>`;
  $("goSelf").onclick = () => { for (const k in answers) delete answers[k]; location.hash = "self"; };
  $("goDesk").onclick = () => { location.hash = "desk"; };
  $("goPro").onclick = () => { location.hash = "pro"; };
}

// ---------- shortlist (Merkliste) ----------
function star(o) {
  const on = picked.has(o.id);
  return `<button class="star" data-pick="${esc(o.id)}" aria-pressed="${on}" title="Merken">${on ? "★" : "☆"}</button>`;
}

function drawPickBar() {
  const host = $("pickHost");
  if (!host) return;
  host.innerHTML = picked.size ? `<div class="pickbar"><b>Merkliste: ${picked.size}</b>
    <button id="pkCopy">Als Text kopieren</button><button id="pkPrint">Handout drucken</button><button id="pkClear">Leeren</button></div>` : "";
  if (!picked.size) return;
  const sel = () => offers.filter((o) => picked.has(o.id));
  $("pkCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(sel().map(summaryText).join("\n\n")); $("pkCopy").textContent = "Kopiert ✓"; } catch { $("pkCopy").textContent = "Kopieren nicht möglich"; }
  };
  $("pkPrint").onclick = () => {
    $("printArea").innerHTML = `<h1>Angebote für Sie</h1><p>Stadt Zürich · ${esc(new Date().toLocaleDateString("de-CH"))}</p>` + sel().map((o) => `<div class="pcard"><h2>${esc(o.title)}</h2><p>${esc(o.inst)}</p>
      ${dl([...eligibility(o), ["So geht es", ACCESS_DE[o.access] + (o.anmeldung ? `: ${o.anmeldung}` : "")], ["Kosten", o.kosten]].filter(([, v]) => v))}
      <div>${contactHtml(o)}</div><p>${esc(o.url)}</p></div>`).join("");
    window.print();
  };
  $("pkClear").onclick = () => {
    picked.clear();
    document.querySelectorAll("[data-pick]").forEach((b) => { b.textContent = "☆"; b.setAttribute("aria-pressed", "false"); b.closest(".card,tr")?.classList.remove("picked"); });
    drawPickBar();
  };
}

function onStar(e) {
  const b = e.target.closest("[data-pick]");
  if (!b) return;
  const id = b.dataset.pick;
  picked.has(id) ? picked.delete(id) : picked.add(id);
  const on = picked.has(id);
  document.querySelectorAll(`[data-pick="${CSS.escape(id)}"]`).forEach((x) => { x.textContent = on ? "★" : "☆"; x.setAttribute("aria-pressed", String(on)); x.closest(".card,tr")?.classList.toggle("picked", on); });
  drawPickBar();
}

// ---------- Welcome Desk ----------
const deskPerson = () => ({ status: desk.status, age: desk.age ? AGE_GROUPS[desk.age] : null, de: desk.de, kids: desk.kids, sex: desk.sex });

function renderDesk() {
  const sel = (id, label, opts, val) => `<label>${label}<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  $("app").innerHTML = `<div class="deskwrap" lang="de" dir="ltr">
    <div class="profile">
      ${sel("dStatus", "Ausweis", [["", "alle"], ["N", "N"], ["F", "F"], ["S", "S"], ["B", "B"]], desk.status)}
      ${sel("dAge", "Alter", [["", "alle"], ...AGE_OPTS], desk.age)}
      ${sel("dDe", "Deutsch", [["", "alle"], ["alpha", "lernt lesen/schreiben"], ["A1", "A1 / keine"], ["A2", "A2"], ["B1", "B1"], ["B2", "B2+"]], desk.de)}
      ${sel("dSex", "Person", [["", "alle"], ["f", "Frau"], ["m", "Mann"]], desk.sex)}
      ${sel("dCase", "Fallführung", [["", "unklar"], ["ja", "vorhanden"], ["nein", "keine"]], desk.case)}
      <label class="chk"><input type="checkbox" id="dKids" ${desk.kids ? "checked" : ""}> braucht Kinderbetreuung</label>
      <button id="dReset">Zurücksetzen</button>
    </div>
    <h2 class="q">Welches Anliegen hat die Person?</h2>
    <div class="needs" id="needs"></div>
    <div id="pickHost"></div>
    <div id="deskRes"></div>
  </div>`;
  const bind = (id, key, isChk) => $(id).addEventListener("input", (e) => { desk[key] = isChk ? e.target.checked : e.target.value; drawDesk(); });
  bind("dStatus", "status"); bind("dAge", "age"); bind("dDe", "de"); bind("dSex", "sex"); bind("dCase", "case"); bind("dKids", "kids", true);
  $("dReset").onclick = () => { Object.assign(desk, { need: "", status: "", age: "", de: "", kids: false, sex: "", case: "" }); renderDesk(); };
  drawDesk();
}

function deskCard(o, flags) {
  const chips = [...o.tg.filter((x) => TG_SHOWN.includes(x)).map((x) => TG_DE[x]), o.r.childcare === "ja" ? "Kinderbetreuung" : ""].filter(Boolean);
  const more = [
    o.lead ? `<p>${esc(o.lead)}</p>` : "",
    o.anmeldung ? `<p><b>Anmeldung:</b> ${esc(o.anmeldung)}</p>` : "",
    o.zeiten ? `<p><b>Zeiten/Dauer:</b> ${esc(o.zeiten)}</p>` : "",
    o.iazhNote ? `<p class="meta">${esc(o.iazhNote)}</p>` : "",
  ].join("");
  return `<article class="card ${picked.has(o.id) ? "picked" : ""}">
    <div class="cardhead"><h3>${esc(o.title)}</h3>${star(o)}</div>
    <p class="who">${esc(o.inst)}${o.ort ? " · " + esc(o.ort) : ""} <span class="tag src">${esc(SRC_SHORT[o.src])}${o.nr ? " " + esc(o.nr) : ""}</span></p>
    ${flags.length ? `<div class="tags">${flags.map((f) => `<span class="tag flag">${esc(f)}</span>`).join("")}</div>` : ""}
    ${chips.length ? `<div class="tags">${chips.map((c) => `<span class="tag z">${esc(c)}</span>`).join("")}</div>` : ""}
    ${dl(eligibility(o))}
    ${o.kosten ? `<p class="meta"><b>Kosten:</b> ${esc(o.kosten)}</p>` : ""}
    ${contactLines(o).length ? `<div class="contact">${contactHtml(o)}</div>` : ""}
    <details><summary>Details</summary>${more}<p><a href="${esc(o.url)}" target="_blank" rel="noopener">Angebotsseite</a>${o.web && o.web !== o.url ? ` · <a href="${esc(o.web)}" target="_blank" rel="noopener">Website Anbieter</a>` : ""}</p></details>
  </article>`;
}

function drawDesk() {
  const p = deskPerson();
  const pool = offers.map((o) => [o, check(o, p)]).filter(([, f]) => f);
  $("needs").innerHTML = NEEDS.map(([k, label]) => {
    const n = pool.filter(([o]) => o.need === k).length;
    return `<button class="need ${desk.need === k ? "on" : ""}" data-need="${k}"><b>${esc(label)}</b><span>${n} Angebote</span></button>`;
  }).join("");
  $("needs").querySelectorAll("[data-need]").forEach((b) => b.addEventListener("click", () => {
    desk.need = desk.need === b.dataset.need ? "" : b.dataset.need; drawDesk();
    if (desk.need) $("deskRes").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  drawPickBar();
  if (!desk.need) { $("deskRes").innerHTML = `<p class="meta">Anliegen wählen. Die Angaben oben (Ausweis, Alter, Deutsch …) sind freiwillig und filtern die Liste.</p>`; return; }
  const list = pool.filter(([o]) => o.need === desk.need).sort(([a], [b]) => score(b, p) - score(a, p) || a.title.localeCompare(b.title, "de"));
  const groups = ACCESS.map(([k, label, hint]) => {
    const items = list.filter(([o]) => o.access === k);
    if (!items.length) return "";
    let body;
    if (k === "zuweisung" && items.length > 8) {
      const byType = new Map();
      items.forEach((it) => { const ty = it[0].src === "IAZH" ? it[0].type : `${SRC_SHORT[it[0].src]}-Angebote`; byType.set(ty, [...(byType.get(ty) || []), it]); });
      body = [...byType].sort((a, b) => a[0].localeCompare(b[0], "de")).map(([ty, arr]) => `<details class="grp"><summary>${esc(ty)} <span class="meta">(${arr.length})</span></summary><div class="cards">${arr.map(([o, f]) => deskCard(o, f)).join("")}</div></details>`).join("");
    } else body = `<div class="cards">${items.map(([o, f]) => deskCard(o, f)).join("")}</div>`;
    if (k === "zuweisung" && desk.case === "nein") {
      body = `<div class="box warn">Keine Fallführung: zuerst klären, wer zuständig ist – in der Stadt Zürich meist die AOZ-Sozialberatung (Geflüchtete) oder das Sozialzentrum. Erst dann sind diese Angebote möglich.</div>
        <details class="grp"><summary>Angebote mit Zuweisung trotzdem anzeigen <span class="meta">(${items.length})</span></summary>${body}</details>`;
    }
    return `<section class="acc acc-${k}"><h3>${esc(label)} <span class="meta">${items.length}</span></h3><p class="meta">${esc(hint)}</p>${body}</section>`;
  }).join("");
  $("deskRes").innerHTML = `<h2 class="q">${esc(NEED_DE[desk.need])}: ${list.length} Angebote</h2>` + (groups || `<div class="box">Keine passenden Angebote mit diesen Angaben. Filter oben lockern.</div>`);
}

// ---------- table ----------
const tbl = { sortK: "need", dir: 1, current: [] };

function renderTable() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((x, y) => x.localeCompare(y, "de"));
  const opts = (vals, first) => `<option value="">${first}</option>` + vals.map((v) => (Array.isArray(v) ? `<option value="${esc(v[0])}">${esc(v[1])}</option>` : `<option>${esc(v)}</option>`)).join("");
  $("app").innerHTML = `<div class="ctl" lang="de" dir="ltr">
    <input type="search" id="q" placeholder="Suchen: Angebot, Institution, Inhalt, Ort, Nummer …">
    <select id="fNeed">${opts(NEEDS.map(([k, d]) => [k, d]), "Alle Anliegen")}</select>
    <select id="fAcc">${opts(ACCESS.map(([k, d]) => [k, d]), "Alle Zugangswege")}</select>
    <select id="fSt">${opts([["N", "Ausweis N"], ["F", "Ausweis F"], ["S", "Ausweis S"], ["B", "Ausweis B"]], "Alle Ausweise")}</select>
    <select id="fAge">${opts(AGE_OPTS, "Alle Alter")}</select>
    <select id="fDe">${opts([["alpha", "lernt lesen/schreiben"], ["A1", "A1"], ["A2", "A2"], ["B1", "B1"], ["B2", "B2"]], "Deutsch: alle")}</select>
    <select id="fSex">${opts([["f", "Frau"], ["m", "Mann"]], "Person: alle")}</select>
    <select id="fTg">${opts(Object.entries(TG_DE).filter(([, v]) => v), "Alle Zielgruppen")}</select>
    <select id="fTop">${opts(uniq(offers.flatMap((o) => o.topics)), "Alle Themen/Branchen")}</select>
    <select id="fSrc">${opts(Object.entries(SRC_LABEL), "Alle Quellen")}</select>
    <label><input type="checkbox" id="fKids"> braucht Kinderbetreuung</label>
    <label><input type="checkbox" id="fPicked"> nur Merkliste</label>
    <button id="reset">Zurücksetzen</button>
    <button id="copyCsv">Als CSV kopieren</button>
    <span class="count" id="count"></span>
  </div>
  <div id="pickHost"></div>
  <div class="wrap" lang="de" dir="ltr"><table><thead><tr>
    <th>★</th><th data-k="need">Anliegen</th><th data-k="access">Zugang</th><th data-k="title">Angebot</th><th data-k="inst">Institution</th>
    <th data-k="zg">Für wen</th><th>Voraussetzungen</th><th data-k="lead">Inhalt</th><th data-k="kosten">Kosten</th><th>Kontakt</th><th data-k="src">Quelle</th>
  </tr></thead><tbody id="tb"></tbody></table></div>`;
  const ids = ["q", "fNeed", "fAcc", "fSt", "fAge", "fDe", "fSex", "fTg", "fTop", "fSrc", "fKids", "fPicked"];
  ids.forEach((id) => $(id).addEventListener("input", drawTable));
  $("reset").onclick = () => { ids.forEach((id) => { if ($(id).type === "checkbox") $(id).checked = false; else $(id).value = ""; }); tbl.sortK = "need"; tbl.dir = 1; drawTable(); };
  document.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.k; tbl.dir = tbl.sortK === k ? -tbl.dir : 1; tbl.sortK = k; drawTable(); }));
  $("copyCsv").onclick = async () => {
    const h = ["Anliegen", "Zugang", "Angebot", "Institution", "Für wen", "Ausweis", "Alter", "Deutsch", "Weitere Voraussetzungen", "Kosten", "Kontakt", "Beschreibung", "Nr", "Quelle", "Link"];
    const c = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = tbl.current.map(([o]) => {
      const e = Object.fromEntries(eligibility(o));
      return [NEED_DE[o.need], ACCESS_DE[o.access], o.title, o.inst, e["Für wen"], e.Ausweis, e.Alter, e.Deutsch, e["Weitere Voraussetzungen"], o.kosten, contactLines(o).join(" | "), o.lead, o.nr, o.src, o.url].map(c).join(";");
    });
    try { await navigator.clipboard.writeText([h.join(";"), ...rows].join("\n")); $("copyCsv").textContent = "Kopiert ✓"; } catch { $("copyCsv").textContent = "Kopieren nicht möglich"; }
  };
  drawTable();
}

function costNum(s) { const m = String(s || "").replace(/[’']/g, "").match(/\d[\d.]*/); return m ? parseFloat(m[0]) : Infinity; }

function drawTable() {
  const v = (id) => $(id).value;
  const q = v("q").toLowerCase().trim();
  const p = { status: v("fSt"), age: v("fAge") ? AGE_GROUPS[v("fAge")] : null, de: v("fDe"), kids: $("fKids").checked, sex: v("fSex") };
  const list = offers.map((o) => [o, check(o, p)]).filter(([o, f]) => f &&
    (!v("fNeed") || o.need === v("fNeed")) && (!v("fAcc") || o.access === v("fAcc")) && (!v("fTg") || o.tg.includes(v("fTg"))) &&
    (!v("fTop") || o.topics.includes(v("fTop"))) && (!v("fSrc") || o.src === v("fSrc")) && (!$("fPicked").checked || picked.has(o.id)) &&
    (!q || [o.title, o.inst, o.nr, o.ort, o.type, o.kosten, o.voraus, o.zg, o.lead, o.topics.join(" ")].join(" ").toLowerCase().includes(q)));
  const k = tbl.sortK, d = tbl.dir;
  const needIdx = (o) => NEEDS.findIndex(([x]) => x === o.need);
  list.sort(([a], [b]) => {
    if (k === "need") return (needIdx(a) - needIdx(b)) * d || a.access.localeCompare(b.access) || a.title.localeCompare(b.title, "de");
    if (k === "kosten") return (costNum(a.kosten) - costNum(b.kosten)) * d;
    return String(a[k] ?? "").localeCompare(String(b[k] ?? ""), "de") * d;
  });
  tbl.current = list;
  drawPickBar();
  $("tb").innerHTML = list.map(([o, flags]) => {
    const e = eligibility(o);
    const who = e.find(([x]) => x === "Für wen")?.[1] || "–";
    const vor = e.filter(([x]) => x !== "Für wen");
    const dsc = o.lead || "";
    const cut = dsc.length > 140 ? dsc.slice(0, 140).replace(/\s+\S*$/, "") + " …" : dsc;
    const desc = dsc.length > 140 ? `<details><summary><span class="cut">${esc(cut)} <span class="more">mehr</span></span></summary><p>${esc(dsc)}</p></details>` : esc(dsc);
    return `<tr class="${picked.has(o.id) ? "picked" : ""}">
      <td>${star(o)}</td>
      <td>${esc(NEED_DE[o.need])}</td><td><span class="tag acc-${o.access}">${esc(ACCESS_DE[o.access])}</span></td>
      <td class="ang"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)}</a></td><td>${esc(o.inst)}</td>
      <td class="zg">${esc(who)}</td>
      <td class="vor">${flags.map((f) => `<span class="tag flag">${esc(f)}</span>`).join(" ")}${dl(vor)}</td>
      <td class="inh">${desc}</td><td>${esc(o.kosten || "–")}</td><td class="kontakt">${contactHtml(o) || "–"}</td>
      <td><span class="tag src">${esc(SRC_SHORT[o.src])}${o.nr ? " " + esc(o.nr) : ""}</span></td></tr>`;
  }).join("");
  $("count").textContent = `${list.length} von ${offers.length} Angeboten`;
  document.querySelectorAll("th[data-k]").forEach((th) => th.classList.toggle("sorted", th.dataset.k === k));
}

// ---------- simple mode for refugees (15 languages) ----------
const QUESTIONS = [
  { k: "status", q: "qStatus", opts: [["F", "stF"], ["B", "stB"], ["N", "stN"], ["S", "stS"], ["", "stX"]] },
  { k: "age", q: "qAge", opts: [["u16", "ageU16"], ...AGE_OPTS.slice(1).map(([v, l]) => [v, null, l])] },
  { k: "de", q: "qDe", opts: [["alpha", "deAlpha"], ["A1", "de0"], ["A1", "deA1"], ["A2", "deA2"], ["B1", "deB1"], ["B2", "deB2"], ["", "deX"]] },
  { k: "need", q: "qGoal", opts: NEEDS.map(([k, , key]) => [k, key]) },
  { k: "kids", q: "qKids", opts: [["y", "yes"], ["n", "no"]] },
  { k: "woman", q: "qWoman", opts: [["y", "yes"], ["n", "no"], ["", "skip"]] },
];

function renderStep(i) {
  const q = QUESTIONS[i];
  $("app").innerHTML = `<section class="wiz">
    <div class="bar"><i style="width:${Math.round((i / QUESTIONS.length) * 100)}%"></i></div>
    <div class="step">${esc(t("step", { i: i + 1, n: QUESTIONS.length }))}</div>
    <h2>${esc(t(q.q))}</h2>
    ${q.opts.map(([, key, label], j) => `<button class="opt" data-i="${j}" ${j === 0 ? "autofocus" : ""}>${key ? esc(t(key)) : `<span dir="ltr">${esc(label)}</span>`}</button>`).join("")}
    <div class="navrow"><button id="back">${esc(t("back"))}</button></div>
  </section>`;
  document.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
    answers[q.k] = q.opts[+b.dataset.i][0];
    if (i + 1 < QUESTIONS.length) renderStep(i + 1);
    else location.hash = "results";
  }));
  $("back").onclick = () => (i === 0 ? (location.hash = "") : renderStep(i - 1));
  window.scrollTo(0, 0);
}

function simpleCard(o, flags) {
  const tags = [
    ...o.tg.filter((x) => TG_SHOWN.includes(x) && x !== "women").map((x) => `<span class="tag z">${esc(t("tg_" + x))}</span>`),
    o.r.womenOnly ? `<span class="tag z">${esc(t("tg_women"))}</span>` : "",
    o.r.childcare === "ja" ? `<span class="tag z">${esc(t("childcare"))}</span>` : "",
  ].join("");
  const c = o.access !== "zuweisung" && contactLines(o).length ? `<div class="contact"><b>${esc(t("contact"))}:</b> <span lang="de" dir="ltr">${contactHtml(o)}</span></div>` : "";
  return `<article class="card">
    <h3>${de(o.title)}</h3>
    <p class="who">${de(o.inst)}${o.ort ? ` · ${esc(t("place"))}: ${de(o.ort)}` : ""}</p>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${flags.length ? `<div class="tags">${flags.map((f) => `<span class="tag flag" lang="de" dir="ltr">${esc(f)}</span>`).join("")}</div>` : ""}
    <div lang="de" dir="ltr">${dl(eligibility(o))}</div>
    ${c}
    <details><summary>${esc(t("more"))}</summary>${o.lead ? `<p>${de(o.lead)}</p>` : ""}<p><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.url.replace(/^https:\/\//, ""))}</a></p></details>
  </article>`;
}

function renderResults() {
  const a = answers;
  const p = { status: a.status, age: AGE_GROUPS[a.age], de: a.de, kids: a.kids === "y", sex: a.woman === "n" ? "m" : a.woman === "y" ? "f" : "" };
  const list = offers.filter((o) => o.need === a.need).map((o) => [o, check(o, p)]).filter(([, f]) => f)
    .sort(([x], [y]) => score(y, p) - score(x, p) || x.title.localeCompare(y.title, "de"));
  const phone = INFOLINE[lang];
  const groups = ACCESS.map(([k]) => {
    const items = list.filter(([o]) => o.access === k);
    if (!items.length) return "";
    return `<h3 class="accHead">${esc(t("acc_" + k))} <span class="meta">(${items.length})</span></h3>${k === "zuweisung" ? `<div class="box">${esc(t("resNext"))}</div>` : ""}${items.map(([o, f]) => simpleCard(o, f)).join("")}`;
  }).join("");
  $("app").innerHTML = `<section class="res">
    <h2>${esc(t("resTitle"))}</h2>
    <p class="meta">${esc(t("resCount", { n: list.length }))}</p>
    ${a.age === "u16" ? `<div class="box warn">${esc(t("warnU16"))}</div>` : ""}
    ${list.length ? groups : `<div class="box">${esc(t("resNone"))}</div>`}
    <div class="box">${esc(t("help"))}<br><span class="phone">${esc(phone || INFOLINE.de)}</span>${phone ? "" : ` <span class="meta">(Deutsch) · English: <span class="phone">${esc(INFOLINE.en)}</span></span>`}</div>
    <div class="actions">
      <button id="print">${esc(t("print"))}</button>
      <button id="copy">${esc(t("copy"))}</button>
      <button id="restart">${esc(t("restart"))}</button>
    </div>
  </section>`;
  $("print").onclick = () => { $("printArea").innerHTML = ""; window.print(); };
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(list.map(([o]) => summaryText(o)).join("\n\n")); $("copy").textContent = t("copied"); } catch { /* clipboard blocked */ }
  };
  $("restart").onclick = () => { for (const k in answers) delete answers[k]; location.hash = "self"; route(); };
  window.scrollTo(0, 0);
}

// ---------- init ----------
async function init() {
  $("lang").innerHTML = LANGS.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join("");
  $("lang").addEventListener("change", (e) => setLang(e.target.value));
  window.addEventListener("hashchange", route);
  window.addEventListener("afterprint", () => { $("printArea").innerHTML = ""; });
  $("app").addEventListener("click", onStar);
  await load();
  let saved = null;
  try { saved = localStorage.getItem("lang"); } catch { /* storage may be blocked */ }
  const nav = (navigator.language || "de").toLowerCase().split("-")[0];
  setLang(saved || (T[nav] ? nav : "de"));
}

init().catch((err) => {
  $("app").innerHTML = `<div class="box warn">Fehler beim Laden der Daten: ${esc(err.message)}</div>`;
  throw err;
});
