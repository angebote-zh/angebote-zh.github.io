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
  ["anmeldung", "Selbst anmelden", "Die Person meldet sich selbst an. Voraussetzungen und Fristen erklären."],
  ["zuweisung", "Zuweisung über die fallführende Stelle", "Läuft über Sozialberatung (AOZ / Sozialzentrum). An die fallführende Stelle verweisen."],
];
const ACCESS_DE = Object.fromEntries(ACCESS.map(([k, d]) => [k, d]));
const DEPT_NEED = { "Sprache": "deutsch", "Bildung": "bildung", "Arbeitsintegration": "arbeit", "Abklärung": "arbeit" };
const TG_DE = {
  adult: "Erwachsene", young: "16–25 J.", alpha1620: "Alpha 16–20", schooled: "schulgewohnt", unschooled: "schulungewohnt",
  women: "Frauen", qualified: "Hochqualifizierte", psych: "psychisch belastet", psychok: "auch psychisch belastet", deaf: "Gehörlose", nofocus: "",
};
const TG_SHOWN = ["young", "adult", "women", "alpha1620", "unschooled", "schooled", "qualified", "psych", "deaf"];
const AGE_GROUPS = { u16: [0, 15], "16": [16, 20], "21": [21, 25], "26": [26, 45], "46": [46, 120], y: [16, 25], a: [26, 120] };
const SRC_LABEL = { IAZH: "IAZH (Kanton)", AOZ: "AOZ", Stadt: "Wegweiser Stadt Zürich", Viventa: "Viventa" };
const SRC_SHORT = { IAZH: "IAZH", AOZ: "AOZ", Stadt: "Wegweiser Stadt", Viventa: "Viventa" };

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

function fromIazh(o) {
  return {
    id: `iazh-${o.id}`, src: "IAZH", nr: o.nr, title: o.title, inst: o.inst, need: DEPT_NEED[o.dept] || "arbeit", type: o.type,
    access: "zuweisung", status: ["F", "B"], statusNote: "Für vorläufig Aufgenommene (F) und anerkannte Flüchtlinge (B), finanziert über die Integrationspauschale",
    tg: o.tg, de: o.de, level: o.level, goal: o.goal, topics: o.topics, zeiten: o.intensity, childcare: o.childcare,
    kosten: o.price, lead: o.desc, ort: o.ort,
    zg: ["Ausweis F oder B", ...o.tg.map((x) => TG_DE[x]).filter(Boolean)].join(", ") + (o.tg.includes("nofocus") ? " (kein besonderer Schwerpunkt)" : ""), voraus: o.de.length ? `Deutsch-Einstieg ab ${o.de[0]}` : "",
    contacts: [{ phone: o.phone, email: o.email, address: o.address }].filter((c) => c.phone || c.email || c.address),
    url: `https://integrationsangebote.zh.ch/detail/${o.id}`, web: o.web,
  };
}

function curated(o, base) {
  const out = {
    tg: [], de: [], level: [], goal: [], topics: [], childcare: [], contacts: [], ort: "", type: SRC_LABEL[o.src],
    ...(base || {}), ...o, id: o.id,
  };
  if (base) {
    out.need = o.need || base.need;
    out.nr = base.nr;
    out.iazhNote = `Auch im kantonalen Katalog (Nr. ${base.nr}${base.kosten ? `, Tarif ${base.kosten}` : ""}): für F/B über die Integrationspauschale.`;
    out.tg = base.tg; out.de = o.de?.length ? o.de : base.de; out.childcare = o.childcare?.length ? o.childcare : base.childcare;
    out.contacts = o.contacts?.length ? o.contacts : base.contacts;
    if (!o.zeiten) out.zeiten = base.zeiten;
    if (!o.kosten) out.kosten = base.kosten;
  }
  if (/Frauen|Mütter|Mutter-Kind/.test(o.title) && !out.tg.includes("women")) out.tg = [...out.tg, "women"];
  return out;
}

async function load() {
  const files = ["iazh", "aoz", "stadt", "viventa"];
  const [iazh, aoz, stadt, viv] = await Promise.all(files.map((f) => fetch(`data/${f}.json`).then((r) => r.json())));
  meta = { iazh: iazh.fetched, aoz: aoz.fetched, stadt: stadt.fetched, viventa: viv.fetched };
  const byNr = new Map(iazh.offers.map((o) => [o.nr, fromIazh(o)]));
  const merged = new Set();
  const cur = [...aoz.offers, ...stadt.offers, ...viv.offers].map((o) => {
    const base = o.iazh ? byNr.get(o.iazh) : null;
    if (o.iazh && !base) console.warn("IAZH-Nr. nicht gefunden:", o.iazh);
    if (base) merged.add(o.iazh);
    return curated(o, base);
  });
  offers = [...iazh.offers.filter(inCity).filter((o) => !merged.has(o.nr)).map(fromIazh), ...cur];
}

// ---------- shared matching ----------
function ageOk(o, group) {
  if (!group) return true;
  const [lo, hi] = AGE_GROUPS[group];
  if (o.age) return !(hi < o.age[0] || (o.age[1] != null && lo > o.age[1]));
  const ageTags = o.tg.filter((x) => ["adult", "young", "alpha1620"].includes(x));
  if (lo >= 26 && ageTags.length && !ageTags.includes("adult") && !o.tg.includes("nofocus")) return false;
  return true;
}
const isAlpha = (o) => /Alpha/i.test(o.type || "") || o.tg.includes("alpha1620");
function deOk(o, lvl) {
  if (!lvl) return true;
  if (lvl === "alpha") return !o.de.length || isAlpha(o);
  if (isAlpha(o)) return false;
  return !o.de.length || o.de.includes(lvl);
}
const statusOk = (o, st) => !st || st === "X" || o.status.includes(st);
const kidsOk = (o, need) => !need || !o.childcare.length || !o.childcare.every((c) => /^ohne/i.test(c));
const sexOk = (o, sex) => sex !== "m" || !o.tg.includes("women");
const hasKids = (o) => o.childcare.some((c) => /^mit/i.test(c));

function contactHtml(o, full = true) {
  const rows = o.contacts.map((c) => [
    c.name ? `<b>${esc(c.name)}</b>` : "",
    c.address ? esc(c.address) : "",
    c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ""))}" class="tel">${esc(c.phone)}</a>` : "",
    c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "",
    c.hours ? esc(c.hours) : "",
  ].filter(Boolean).join(" · ")).filter(Boolean);
  if (full && o.orte) rows.push(esc(o.orte));
  return rows.map((r) => `<div>${r}</div>`).join("");
}

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
  $("dataNote").innerHTML = `Quellen: <a href="https://integrationsangebote.zh.ch/home">IAZH-Katalog</a> (nur Angebote in der Stadt Zürich, Stand ${esc(meta.iazh)}) · <a href="https://aoz.ch/de/kurse-und-angebote">AOZ</a> (${esc(meta.aoz)}) · <a href="https://www.stadt-zuerich.ch/de/lebenslagen/unterstuetzung-und-beratung/izs/wegweiser/migration/asyl.html">Wegweiser Stadt Zürich</a> (${esc(meta.stadt)}) · <a href="https://www.stadt-zuerich.ch/de/bildung/ausbildung-weiterbildung/integrationsangebote.html">Fachschule Viventa</a> (${esc(meta.viventa)}). Ohne Gewähr: Aufnahme und freie Plätze klärt immer die Stelle selbst.`;
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

// ---------- Welcome Desk ----------
function deskMatches(o) {
  return statusOk(o, desk.status) && ageOk(o, desk.age) && deOk(o, desk.de) && kidsOk(o, desk.kids) && sexOk(o, desk.sex);
}

function renderDesk() {
  const sel = (id, label, opts, val) => `<label>${label}<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  $("app").innerHTML = `<div class="deskwrap" lang="de" dir="ltr">
    <div class="profile">
      ${sel("dStatus", "Ausweis", [["", "alle"], ["N", "N"], ["F", "F"], ["S", "S"], ["B", "B"]], desk.status)}
      ${sel("dAge", "Alter", [["", "alle"], ["u16", "unter 16"], ["16", "16–20"], ["21", "21–25"], ["26", "26–45"], ["46", "46+"]], desk.age)}
      ${sel("dDe", "Deutsch", [["", "alle"], ["alpha", "lernt lesen/schreiben"], ["A1", "A1 / keine"], ["A2", "A2"], ["B1", "B1"], ["B2", "B2+"]], desk.de)}
      ${sel("dSex", "Person", [["", "alle"], ["f", "Frau"], ["m", "Mann"]], desk.sex)}
      ${sel("dCase", "Fallführung", [["", "unklar"], ["ja", "vorhanden"], ["nein", "keine"]], desk.case)}
      <label class="chk"><input type="checkbox" id="dKids" ${desk.kids ? "checked" : ""}> braucht Kinderbetreuung</label>
      <button id="dReset">Zurücksetzen</button>
    </div>
    <h2 class="q">Welches Anliegen hat die Person?</h2>
    <div class="needs" id="needs"></div>
    <div id="deskRes"></div>
  </div>`;
  const bind = (id, key, isChk) => $(id).addEventListener("input", (e) => { desk[key] = isChk ? e.target.checked : e.target.value; drawDesk(); });
  bind("dStatus", "status"); bind("dAge", "age"); bind("dDe", "de"); bind("dSex", "sex"); bind("dCase", "case"); bind("dKids", "kids", true);
  $("dReset").onclick = () => { Object.assign(desk, { need: "", status: "", age: "", de: "", kids: false, sex: "", case: "" }); renderDesk(); };
  drawDesk();
}

function deskCard(o) {
  const chips = [
    o.status.length === 4 ? "alle Ausweise" : `Ausweis ${o.status.join("/")}`,
    o.age ? `${o.age[0]}${o.age[1] != null ? "–" + o.age[1] : "+"} J.` : "",
    ...o.tg.filter((x) => TG_SHOWN.includes(x)).map((x) => TG_DE[x]),
    o.de.length ? `Deutsch ${o.de.join("/")}` : "",
    hasKids(o) ? "Kinderbetreuung" : "",
  ].filter(Boolean);
  const pick = picked.has(o.id);
  const more = [
    o.lead ? `<p>${esc(o.lead)}</p>` : "",
    o.zg ? `<p><b>Zielgruppe:</b> ${esc(o.zg)}</p>` : "",
    o.anmeldung ? `<p><b>Anmeldung:</b> ${esc(o.anmeldung)}</p>` : "",
    o.zeiten ? `<p><b>Zeiten/Dauer:</b> ${esc(o.zeiten)}</p>` : "",
    o.statusNote ? `<p><b>Aufenthaltsstatus:</b> ${esc(o.statusNote)}</p>` : "",
    o.iazhNote ? `<p class="meta">${esc(o.iazhNote)}</p>` : "",
  ].join("");
  return `<article class="card ${pick ? "picked" : ""}">
    <div class="cardhead"><h3>${esc(o.title)}</h3><button class="star" data-pick="${esc(o.id)}" aria-pressed="${pick}" title="Merken">${pick ? "★" : "☆"}</button></div>
    <p class="who">${esc(o.inst)}${o.ort ? " · " + esc(o.ort) : ""} <span class="tag src">${esc(SRC_SHORT[o.src])}${o.nr ? " " + esc(o.nr) : ""}</span></p>
    <div class="tags">${chips.map((c) => `<span class="tag z">${esc(c)}</span>`).join("")}</div>
    ${o.zg ? `<p class="vor"><b>Für wen:</b> ${esc(o.zg)}</p>` : ""}
    <p class="vor"><b>Voraussetzungen:</b> ${o.voraus ? esc(o.voraus) : '<span class="none">keine Angabe beim Anbieter – Details auf der Angebotsseite</span>'}</p>
    ${o.kosten ? `<p class="meta"><b>Kosten:</b> ${esc(o.kosten)}</p>` : ""}
    ${o.contacts.length || o.orte ? `<div class="contact">${contactHtml(o)}</div>` : ""}
    <details><summary>Details</summary>${more}<p><a href="${esc(o.url)}" target="_blank" rel="noopener">Angebotsseite</a>${o.web && o.web !== o.url ? ` · <a href="${esc(o.web)}" target="_blank" rel="noopener">Website Anbieter</a>` : ""}</p></details>
  </article>`;
}

function drawDesk() {
  const pool = offers.filter(deskMatches);
  $("needs").innerHTML = NEEDS.map(([k, label]) => {
    const n = pool.filter((o) => o.need === k).length;
    return `<button class="need ${desk.need === k ? "on" : ""}" data-need="${k}"><b>${esc(label)}</b><span>${n} Angebote</span></button>`;
  }).join("");
  $("needs").querySelectorAll("[data-need]").forEach((b) => b.addEventListener("click", () => {
    desk.need = desk.need === b.dataset.need ? "" : b.dataset.need; drawDesk();
    if (desk.need) $("deskRes").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  if (!desk.need) { $("deskRes").innerHTML = pickBar() + `<p class="meta">Anliegen wählen. Die Angaben oben (Ausweis, Alter, Deutsch …) sind freiwillig und filtern die Liste.</p>`; bindPick(); return; }
  const list = pool.filter((o) => o.need === desk.need).sort((a, b) => (b.src !== "IAZH") - (a.src !== "IAZH") || a.title.localeCompare(b.title, "de"));
  const groups = ACCESS.map(([k, label, hint]) => {
    const items = list.filter((o) => o.access === k);
    if (!items.length) return "";
    let body;
    if (k === "zuweisung" && items.length > 8) {
      const byType = new Map();
      items.forEach((o) => { const ty = o.src === "IAZH" ? o.type : `${o.src}-Angebote`; byType.set(ty, [...(byType.get(ty) || []), o]); });
      body = [...byType].sort((a, b) => a[0].localeCompare(b[0], "de")).map(([ty, arr]) => `<details class="grp"><summary>${esc(ty)} <span class="meta">(${arr.length})</span></summary><div class="cards">${arr.map(deskCard).join("")}</div></details>`).join("");
    } else body = `<div class="cards">${items.map(deskCard).join("")}</div>`;
    const caseWarn = k === "zuweisung" && desk.case === "nein"
      ? `<div class="box warn">Keine Fallführung: zuerst klären, wer zuständig ist (in der Stadt Zürich meist die AOZ-Sozialberatung oder das Sozialzentrum). Erst dann sind diese Angebote möglich.</div>` : "";
    return `<section class="acc acc-${k}"><h3>${esc(label)} <span class="meta">${items.length}</span></h3><p class="meta">${esc(hint)}</p>${caseWarn}${body}</section>`;
  }).join("");
  $("deskRes").innerHTML = pickBar() + `<h2 class="q">${esc(NEED_DE[desk.need])}: ${list.length} Angebote</h2>` + (groups || `<div class="box">Keine passenden Angebote mit diesen Angaben. Filter oben lockern.</div>`);
  bindPick();
}

// ---------- shortlist (Merkliste) ----------
function pickBar() {
  return `<div class="pickbar" ${picked.size ? "" : "hidden"}><b>Merkliste: ${picked.size}</b>
    <button id="pkCopy">Als Text kopieren</button><button id="pkPrint">Handout drucken</button><button id="pkClear">Leeren</button></div>`;
}
function pickText() {
  return offers.filter((o) => picked.has(o.id)).map((o) => {
    const c = o.contacts.map((x) => [x.name, x.address, x.phone, x.email, x.hours].filter(Boolean).join(", ")).filter(Boolean).join(" | ");
    return `• ${o.title} – ${o.inst}\n  Zugang: ${ACCESS_DE[o.access]}${o.voraus ? `\n  Voraussetzungen: ${o.voraus}` : ""}${o.kosten ? `\n  Kosten: ${o.kosten}` : ""}${c ? `\n  Kontakt: ${c}` : ""}\n  ${o.url}`;
  }).join("\n\n");
}
function bindPick() {
  document.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.pick; picked.has(id) ? picked.delete(id) : picked.add(id);
    const y = window.scrollY; (location.hash === "#pro" ? drawTable : drawDesk)(); window.scrollTo(0, y);
  }));
  if (!$("pkCopy")) return;
  $("pkCopy").onclick = async () => { try { await navigator.clipboard.writeText(pickText()); $("pkCopy").textContent = "Kopiert ✓"; } catch { $("pkCopy").textContent = "Kopieren nicht möglich"; } };
  $("pkPrint").onclick = () => {
    const sel = offers.filter((o) => picked.has(o.id));
    $("printArea").innerHTML = `<h1>Angebote für Sie</h1><p>Stadt Zürich · ${new Date().toLocaleDateString("de-CH")}</p>` + sel.map((o) => `<div class="pcard"><h2>${esc(o.title)}</h2><p>${esc(o.inst)}</p><p><b>So geht es:</b> ${esc(ACCESS_DE[o.access])}</p>${o.voraus ? `<p><b>Voraussetzungen:</b> ${esc(o.voraus)}</p>` : ""}${o.kosten ? `<p><b>Kosten:</b> ${esc(o.kosten)}</p>` : ""}<div>${contactHtml(o)}</div><p>${esc(o.url)}</p></div>`).join("");
    window.print();
  };
  $("pkClear").onclick = () => { picked.clear(); (location.hash === "#pro" ? drawTable : drawDesk)(); };
}

// ---------- table ----------
const tbl = { sortK: "need", dir: 1 };

function renderTable() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((x, y) => x.localeCompare(y, "de"));
  const opts = (vals, first) => `<option value="">${first}</option>` + vals.map((v) => (Array.isArray(v) ? `<option value="${esc(v[0])}">${esc(v[1])}</option>` : `<option>${esc(v)}</option>`)).join("");
  $("app").innerHTML = `<div class="ctl" lang="de" dir="ltr">
    <input type="search" id="q" placeholder="Suchen: Angebot, Institution, Inhalt, Ort, Nummer …">
    <select id="fNeed">${opts(NEEDS.map(([k, d]) => [k, d]), "Alle Anliegen")}</select>
    <select id="fAcc">${opts(ACCESS.map(([k, d]) => [k, d]), "Alle Zugangswege")}</select>
    <select id="fSt">${opts([["N", "Ausweis N"], ["F", "Ausweis F"], ["S", "Ausweis S"], ["B", "Ausweis B"]], "Alle Ausweise")}</select>
    <select id="fAge">${opts([["u16", "unter 16"], ["16", "16–20"], ["21", "21–25"], ["26", "26–45"], ["46", "46+"]], "Alle Alter")}</select>
    <select id="fDe">${opts([["alpha", "lernt lesen/schreiben"], ["A1", "A1"], ["A2", "A2"], ["B1", "B1"], ["B2", "B2"]], "Deutsch: alle")}</select>
    <select id="fTg">${opts(Object.entries(TG_DE).filter(([, v]) => v), "Alle Zielgruppen")}</select>
    <select id="fTop">${opts(uniq(offers.flatMap((o) => o.topics)), "Alle Themen/Branchen")}</select>
    <select id="fSrc">${opts(Object.entries(SRC_LABEL), "Alle Quellen")}</select>
    <label><input type="checkbox" id="fKids"> mit Kinderbetreuung</label>
    <label><input type="checkbox" id="fPicked"> nur Merkliste</label>
    <button id="reset">Zurücksetzen</button>
    <button id="copyCsv">Als CSV kopieren</button>
    <span class="count" id="count"></span>
  </div>
  <div id="pickHost"></div>
  <div class="wrap" lang="de" dir="ltr"><table><thead><tr>
    <th>★</th><th data-k="need">Anliegen</th><th data-k="access">Zugang</th><th data-k="title">Angebot</th><th data-k="inst">Institution</th>
    <th data-k="status">Für wen</th><th data-k="voraus">Voraussetzungen</th><th data-k="lead">Inhalt</th><th data-k="kosten">Kosten</th><th>Kontakt</th><th data-k="src">Quelle</th>
  </tr></thead><tbody id="tb"></tbody></table></div>`;
  const ids = ["q", "fNeed", "fAcc", "fSt", "fAge", "fDe", "fTg", "fTop", "fSrc", "fKids", "fPicked"];
  ids.forEach((id) => $(id).addEventListener("input", drawTable));
  $("reset").onclick = () => { ids.forEach((id) => { if ($(id).type === "checkbox") $(id).checked = false; else $(id).value = ""; }); tbl.sortK = "need"; tbl.dir = 1; drawTable(); };
  document.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.k; tbl.dir = tbl.sortK === k ? -tbl.dir : 1; tbl.sortK = k; drawTable(); }));
  $("copyCsv").onclick = async () => {
    const h = ["Anliegen", "Zugang", "Angebot", "Institution", "Ausweis", "Alter", "Zielgruppe", "Deutsch", "Voraussetzungen", "Kosten", "Kontakt", "Beschreibung", "Nr", "Quelle", "Link"];
    const c = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = tbl.current.map((o) => [NEED_DE[o.need], ACCESS_DE[o.access], o.title, o.inst, o.status.join("/"), o.age ? o.age.join("–") : "", o.tg.map((x) => TG_DE[x]).filter(Boolean).join(", "), o.de.join(", "), o.voraus, o.kosten, o.contacts.map((x) => [x.address, x.phone, x.email].filter(Boolean).join(", ")).join(" | "), o.lead, o.nr, o.src, o.url].map(c).join(";"));
    try { await navigator.clipboard.writeText([h.join(";"), ...rows].join("\n")); $("copyCsv").textContent = "Kopiert ✓"; } catch { $("copyCsv").textContent = "Kopieren nicht möglich"; }
  };
  drawTable();
}

function costNum(s) { const m = String(s || "").replace(/[’']/g, "").match(/\d[\d.]*/); return m ? parseFloat(m[0]) : Infinity; }

function drawTable() {
  const v = (id) => $(id).value;
  const q = v("q").toLowerCase().trim();
  const list = offers.filter((o) =>
    (!v("fNeed") || o.need === v("fNeed")) && (!v("fAcc") || o.access === v("fAcc")) && statusOk(o, v("fSt")) && ageOk(o, v("fAge")) &&
    deOk(o, v("fDe")) && (!v("fTg") || o.tg.includes(v("fTg"))) && (!v("fTop") || o.topics.includes(v("fTop"))) && (!v("fSrc") || o.src === v("fSrc")) &&
    (!$("fKids").checked || hasKids(o)) && (!$("fPicked").checked || picked.has(o.id)) &&
    (!q || [o.title, o.inst, o.nr, o.ort, o.type, o.kosten, o.voraus, o.zg, o.lead, o.topics.join(" ")].join(" ").toLowerCase().includes(q)));
  const k = tbl.sortK, d = tbl.dir;
  const needIdx = (o) => NEEDS.findIndex(([x]) => x === o.need);
  list.sort((a, b) => {
    if (k === "need") return (needIdx(a) - needIdx(b)) * d || a.access.localeCompare(b.access) || a.title.localeCompare(b.title, "de");
    if (k === "kosten") return (costNum(a.kosten) - costNum(b.kosten)) * d;
    return String(a[k] ?? "").localeCompare(String(b[k] ?? ""), "de") * d;
  });
  tbl.current = list;
  $("pickHost").innerHTML = pickBar();
  $("tb").innerHTML = list.map((o) => {
    const who = [o.status.length === 4 ? "alle Ausweise" : o.status.join("/"), o.age ? `${o.age[0]}${o.age[1] != null ? "–" + o.age[1] : "+"} J.` : "", ...o.tg.filter((x) => TG_SHOWN.includes(x)).map((x) => TG_DE[x])].filter(Boolean);
    const dsc = o.lead || "";
    const cut = dsc.length > 140 ? dsc.slice(0, 140).replace(/\s+\S*$/, "") + " …" : dsc;
    const desc = dsc.length > 140 ? `<details><summary><span class="cut">${esc(cut)} <span class="more">mehr</span></span></summary><p>${esc(dsc)}</p></details>` : esc(dsc);
    return `<tr class="${picked.has(o.id) ? "picked" : ""}">
      <td><button class="star" data-pick="${esc(o.id)}" aria-pressed="${picked.has(o.id)}">${picked.has(o.id) ? "★" : "☆"}</button></td>
      <td>${esc(NEED_DE[o.need])}</td><td><span class="tag acc-${o.access}">${esc(ACCESS_DE[o.access])}</span></td>
      <td class="ang"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)}</a></td><td>${esc(o.inst)}</td>
      <td class="zg">${who.map((x) => `<span class="tag z">${esc(x)}</span>`).join(" ")}</td>
      <td class="vor">${esc(o.voraus || o.zg || "–")}</td>
      <td class="inh">${desc}</td><td>${esc(o.kosten || "–")}</td><td class="kontakt">${contactHtml(o, false) || "–"}</td>
      <td><span class="tag src">${esc(SRC_SHORT[o.src])}${o.nr ? " " + esc(o.nr) : ""}</span></td></tr>`;
  }).join("");
  $("count").textContent = `${list.length} von ${offers.length} Angeboten`;
  document.querySelectorAll("th[data-k]").forEach((th) => th.classList.toggle("sorted", th.dataset.k === k));
  bindPick();
}

// ---------- simple mode for refugees (15 languages) ----------
const QUESTIONS = [
  { k: "status", q: "qStatus", opts: [["F", "stF"], ["B", "stB"], ["N", "stN"], ["S", "stS"], ["X", "stX"]] },
  { k: "age", q: "qAge", opts: [["u16", "ageU16"], ["16", "age16"], ["26", "age26"]] },
  { k: "de", q: "qDe", opts: [["alpha", "deAlpha"], ["A1", "de0"], ["A1", "deA1"], ["A2", "deA2"], ["B1", "deB1"], ["B2", "deB2"], ["", "deX"]] },
  { k: "need", q: "qGoal", opts: NEEDS.map(([k, , key]) => [k, key]) },
  { k: "kids", q: "qKids", opts: [["y", "yes"], ["n", "no"]] },
  { k: "woman", q: "qWoman", opts: [["y", "yes"], ["n", "no"], ["x", "skip"]] },
];

function renderStep(i) {
  const q = QUESTIONS[i];
  $("app").innerHTML = `<section class="wiz">
    <div class="bar"><i style="width:${Math.round((i / QUESTIONS.length) * 100)}%"></i></div>
    <div class="step">${esc(t("step", { i: i + 1, n: QUESTIONS.length }))}</div>
    <h2>${esc(t(q.q))}</h2>
    ${q.opts.map(([v, key], j) => `<button class="opt" data-i="${j}" ${j === 0 ? "autofocus" : ""}>${esc(t(key))}</button>`).join("")}
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

function simpleCard(o) {
  const tags = [
    `<span class="tag">${esc(t("acc_" + o.access))}</span>`,
    o.status.length < 4 ? `<span class="tag z" dir="ltr">${esc(o.status.join(" / "))}</span>` : "",
    o.age ? `<span class="tag z" dir="ltr">${o.age[0]}${o.age[1] != null ? "–" + o.age[1] : "+"}</span>` : "",
    ...o.tg.filter((x) => TG_SHOWN.includes(x)).map((x) => `<span class="tag z">${esc(t("tg_" + x))}</span>`),
    o.de.length ? `<span class="tag z" dir="ltr">Deutsch ${esc(o.de.join("/"))}</span>` : "",
    hasKids(o) ? `<span class="tag z">${esc(t("childcare"))}</span>` : "",
  ].join("");
  const c = o.access !== "zuweisung" && (o.contacts.length || o.orte) ? `<div class="contact"><b>${esc(t("contact"))}:</b> <span lang="de" dir="ltr">${contactHtml(o)}</span></div>` : "";
  return `<article class="card">
    <h3>${de(o.title)}</h3>
    <p class="who">${de(o.inst)}${o.ort ? ` · ${esc(t("place"))}: ${de(o.ort)}` : ""}</p>
    <div class="tags">${tags}</div>
    ${o.zg || o.voraus ? `<p class="vor">${de([o.zg, o.voraus].filter(Boolean).join(" · "))}</p>` : ""}
    ${c}
    <details><summary>${esc(t("more"))}</summary>${o.lead ? `<p>${de(o.lead)}</p>` : ""}<p><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.url.replace(/^https:\/\//, ""))}</a></p></details>
  </article>`;
}

function renderResults() {
  const a = answers;
  const ageGroup = a.age === "u16" ? "u16" : a.age === "16" ? "y" : "a";
  const list = offers.filter((o) => o.need === a.need && statusOk(o, a.status) && ageOk(o, ageGroup) && deOk(o, a.de) && kidsOk(o, a.kids === "y") && sexOk(o, a.woman === "n" ? "m" : ""))
    .sort((x, y) => (y.src !== "IAZH") - (x.src !== "IAZH") || x.title.localeCompare(y.title, "de"));
  const phone = INFOLINE[lang];
  const groups = ACCESS.map(([k]) => {
    const items = list.filter((o) => o.access === k);
    if (!items.length) return "";
    return `<h3 class="accHead">${esc(t("acc_" + k))} <span class="meta">(${items.length})</span></h3>${k === "zuweisung" ? `<div class="box">${esc(t("resNext"))}</div>` : ""}${items.map(simpleCard).join("")}`;
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
    const txt = list.map((o) => `- ${o.title} (${o.inst})\n  ${o.url}`).join("\n");
    try { await navigator.clipboard.writeText(txt); $("copy").textContent = t("copied"); } catch { /* clipboard blocked */ }
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
  await load();
  let saved = null;
  try { saved = localStorage.getItem("lang"); } catch { /* storage may be blocked */ }
  const nav = (navigator.language || "de").toLowerCase().split("-")[0];
  setLang(saved || (T[nav] ? nav : "de"));
}

init().catch((err) => {
  $("app").innerHTML = `<div class="box warn">Daten konnten nicht geladen werden: ${esc(err.message)}</div>`;
  throw err;
});
