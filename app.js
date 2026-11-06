import { LANGS, INFOLINE, T } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const de = (s) => `<span lang="de" dir="ltr">${esc(s)}</span>`;

const DEPT_KEY = { "Abklärung": "dAbklaerung", "Sprache": "dSprache", "Bildung": "dBildung", "Arbeitsintegration": "dArbeit" };
const DEPT_ORDER = ["Abklärung", "Sprache", "Bildung", "Arbeitsintegration"];
const TG_DE = {
  adult: "Erwachsene", young: "Jugendliche 16–25", alpha1620: "Alpha 16–20", schooled: "schulgewohnt", unschooled: "schulungewohnt",
  women: "Frauen", qualified: "Hochqualifizierte", psych: "psychisch belastet", psychok: "auch psychisch belastet", deaf: "Gehörlose", nofocus: "kein Fokus",
};
const TG_SHOWN = ["young", "adult", "women", "alpha1620", "unschooled", "schooled", "qualified", "psych", "deaf"];
const REGION_LABEL = {
  "Zürich": "Zürich", "Andelfingen/Winterthur": "Winterthur / Andelfingen", "Hinwil/Meilen/Pfäffikon/Uster": "Uster / Hinwil / Meilen / Pfäffikon",
  "Bülach/Dielsdorf": "Bülach / Dielsdorf", "Affoltern/Dietikon/Horgen": "Dietikon / Horgen / Affoltern",
};

let lang = "de";
let offers = [];
let meta = {};
const answers = {};

function t(key, vars = {}) {
  const s = (T[lang] && T[lang][key]) ?? T.de[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const QUESTIONS = [
  { k: "status", q: "qStatus", opts: [["F", "stF"], ["B", "stB"], ["N", "stN"], ["S", "stS"], ["X", "stX"]] },
  { k: "age", q: "qAge", opts: [["u16", "ageU16"], ["16", "age16"], ["26", "age26"]] },
  { k: "de", q: "qDe", opts: [["alpha", "deAlpha"], ["A1", "de0"], ["A1+", "deA1"], ["A2", "deA2"], ["B1", "deB1"], ["B2", "deB2"], ["x", "deX"]] },
  { k: "goal", q: "qGoal", opts: [["Sprache", "gLang"], ["Bildung", "gEdu"], ["Arbeitsintegration", "gWork"], ["Abklärung", "gCheck"]] },
  { k: "region", q: "qRegion", opts: [...Object.entries(REGION_LABEL).map(([v, l]) => [v, null, l]), ["x", "rX"]] },
  { k: "kids", q: "qKids", opts: [["y", "yes"], ["n", "no"]] },
  { k: "woman", q: "qWoman", opts: [["y", "yes"], ["n", "no"], ["x", "skip"]] },
];

// ---------- data ----------
async function load() {
  const [iazh, viv] = await Promise.all([fetch("data/iazh.json").then((r) => r.json()), fetch("data/viventa.json").then((r) => r.json())]);
  meta = { iazh: iazh.fetched, viventa: viv.fetched };
  offers = [
    ...iazh.offers.map((o) => ({ ...o, src: "IAZH", url: `https://integrationsangebote.zh.ch/detail/${o.id}` })),
    ...viv.offers.map((o) => ({ ...o, src: "Viventa" })),
  ];
}

// ---------- matching (simple mode) ----------
function isAlphaOffer(o) {
  return /Alpha/i.test(o.type) || o.tg.includes("alpha1620");
}

function matches(o, a) {
  if (o.dept !== a.goal) return false;
  if (a.region !== "x" && o.region.length && !o.region.includes(a.region)) return false;
  if (a.kids === "y" && o.childcare.length && o.childcare.every((c) => /^ohne/i.test(c))) return false;
  if (a.woman === "n" && o.tg.includes("women")) return false;
  const ageTags = o.tg.filter((x) => ["adult", "young", "alpha1620"].includes(x));
  if (a.age === "26" && ageTags.length && !ageTags.includes("adult") && !o.tg.includes("nofocus")) return false;
  if (a.de === "alpha") {
    if (a.goal === "Sprache" && !isAlphaOffer(o)) return false;
    if (a.goal !== "Sprache" && o.de.length && !isAlphaOffer(o)) return false;
  } else if (a.de !== "x") {
    const lvl = a.de === "A1+" ? "A1" : a.de;
    if (isAlphaOffer(o)) return false;
    if (o.de.length && !o.de.includes(lvl)) return false;
  }
  return true;
}

function score(o, a) {
  let s = 0;
  if ((a.age === "16" || a.age === "u16") && (o.tg.includes("young") || o.tg.includes("alpha1620"))) s += 3;
  if (a.age === "26" && o.tg.includes("adult")) s += 1;
  if (a.woman === "y" && o.tg.includes("women")) s += 2;
  if (a.kids === "y" && o.childcare.some((c) => /^mit/i.test(c))) s += 2;
  if (a.de === "alpha" && isAlphaOffer(o)) s += 2;
  return s;
}

// ---------- views ----------
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
  $("dataNote").innerHTML = `Daten: <a href="https://integrationsangebote.zh.ch/home">integrationsangebote.zh.ch</a> (Stand ${esc(meta.iazh || "")}) · <a href="https://www.stadt-zuerich.ch/de/bildung/ausbildung-weiterbildung/integrationsangebote.html">Fachschule Viventa</a> (Stand ${esc(meta.viventa || "")}) · <a href="https://aoz.ch/de/kurse-und-angebote/info-line-fuer-gefluechtete">AOZ Info-Line</a>`;
  route();
}

function route() {
  const h = location.hash.replace("#", "");
  if (h === "pro") return renderPro();
  if (h === "self") return renderStep(0);
  if (h === "results") return Object.keys(answers).length === QUESTIONS.length ? renderResults() : renderStep(0);
  renderHome();
}

function renderHome() {
  $("app").innerHTML = `<section class="hero">
    <h1>${esc(t("appTitle"))}</h1><p>${esc(t("tagline"))}</p>
    <button class="choice" id="goSelf"><b>${esc(t("modeSelf"))}</b><span>${esc(t("modeSelfSub"))}</span></button>
    <button class="choice" id="goPro"><b>${esc(t("modePro"))}</b><span>${esc(t("modeProSub"))}</span></button>
  </section>`;
  $("goSelf").onclick = () => { for (const k in answers) delete answers[k]; location.hash = "self"; };
  $("goPro").onclick = () => { location.hash = "pro"; };
}

function renderStep(i) {
  const q = QUESTIONS[i];
  $("app").innerHTML = `<section class="wiz">
    <div class="bar"><i style="width:${Math.round((i / QUESTIONS.length) * 100)}%"></i></div>
    <div class="step">${esc(t("step", { i: i + 1, n: QUESTIONS.length }))}</div>
    <h2>${esc(t(q.q))}</h2>
    ${q.opts.map(([v, key, label], j) => `<button class="opt" data-v="${esc(v)}" ${answers[q.k] === v ? 'aria-pressed="true"' : ""} ${j === 0 ? "autofocus" : ""}>${key ? esc(t(key)) : de(label)}</button>`).join("")}
    <div class="navrow"><button id="back">${esc(t("back"))}</button></div>
  </section>`;
  document.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
    answers[q.k] = b.dataset.v;
    if (i + 1 < QUESTIONS.length) renderStep(i + 1);
    else location.hash = "results";
  }));
  $("back").onclick = () => (i === 0 ? (location.hash = "") : renderStep(i - 1));
  window.scrollTo(0, 0);
}

function card(o) {
  const tags = [
    `<span class="tag">${esc(t(DEPT_KEY[o.dept]))}</span>`,
    ...o.tg.filter((x) => TG_SHOWN.includes(x)).map((x) => `<span class="tag z">${esc(t("tg_" + x))}</span>`),
    o.childcare.some((c) => /^mit/i.test(c)) ? `<span class="tag z">${esc(t("childcare"))}</span>` : "",
  ].join("");
  return `<article class="card">
    <h3>${de(o.title)}</h3>
    <p class="who">${de(o.inst)}${o.ort ? ` · ${esc(t("place"))}: ${de(o.ort)}` : ""}</p>
    <div class="tags">${tags}</div>
    ${o.intensity ? `<div class="meta">${de(o.intensity)}</div>` : ""}
    ${o.desc ? `<details><summary>${esc(t("more"))}</summary><p>${de(o.desc)}</p><p><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.url.replace(/^https:\/\//, ""))}</a></p></details>` : `<p><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(t("more"))}</a></p>`}
  </article>`;
}

function renderResults() {
  const a = answers;
  const list = offers.filter((o) => matches(o, a)).sort((x, y) => score(y, a) - score(x, a) || x.title.localeCompare(y.title, "de"));
  const phone = INFOLINE[lang];
  const warns = [
    ["N", "S", "X"].includes(a.status) ? `<div class="box warn">${esc(t("warnStatus"))}</div>` : "",
    a.age === "u16" ? `<div class="box warn">${esc(t("warnU16"))}</div>` : "",
  ].join("");
  $("app").innerHTML = `<section class="res">
    <h2>${esc(t("resTitle"))}</h2>
    <p class="meta">${esc(t("resCount", { n: list.length }))}</p>
    ${warns}
    <div class="box">${esc(t("resNext"))}</div>
    ${list.length ? list.map(card).join("") : `<div class="box">${esc(t("resNone"))}</div>`}
    <div class="box">${esc(t("help"))}<br><span class="phone">${esc(phone || INFOLINE.de)}</span>${phone ? "" : ` <span class="meta">(Deutsch) · English: <span class="phone">${esc(INFOLINE.en)}</span></span>`}</div>
    <div class="actions">
      <button id="print">${esc(t("print"))}</button>
      <button id="copy">${esc(t("copy"))}</button>
      <button id="restart">${esc(t("restart"))}</button>
    </div>
  </section>`;
  $("print").onclick = () => window.print();
  $("copy").onclick = async () => {
    const txt = list.map((o) => `- ${o.title} (${o.inst}${o.ort ? ", " + o.ort : ""})${o.nr ? " [" + o.nr + "]" : ""}\n  ${o.url}`).join("\n");
    try { await navigator.clipboard.writeText(txt); $("copy").textContent = t("copied"); } catch { /* clipboard blocked */ }
  };
  $("restart").onclick = () => { for (const k in answers) delete answers[k]; location.hash = "self"; route(); };
  window.scrollTo(0, 0);
}

// ---------- professional mode (German) ----------
const pro = { sortK: "dept", dir: 1, picked: new Set() };

function renderPro() {
  const uniq = (arr) => [...new Set(arr)].sort((x, y) => x.localeCompare(y, "de"));
  const opts = (vals, first) => `<option value="">${first}</option>` + vals.map((v) => `<option>${esc(v)}</option>`).join("");
  $("app").innerHTML = `<div class="ctl" lang="de" dir="ltr">
    <input type="search" id="q" placeholder="Suchen: Institution, Angebot, Inhalt, Ort, Nummer …">
    <select id="fDept">${opts(DEPT_ORDER, "Alle Bereiche")}</select>
    <select id="fType">${opts(uniq(offers.map((o) => o.type)), "Alle Angebotsarten")}</select>
    <select id="fTg"><option value="">Alle Zielgruppen</option>${Object.entries(TG_DE).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
    <select id="fDe">${opts(["A1", "A2", "B1", "B2"], "Deutsch-Niveau: alle")}</select>
    <select id="fGoal">${opts(["Arbeitsmarkt", "Ausbildung"], "Ziel: alle")}</select>
    <select id="fTop">${opts(uniq(offers.flatMap((o) => o.topics)), "Alle Themen/Branchen")}</select>
    <select id="fKids"><option value="">Kinderbetreuung: egal</option><option value="mit">mit Kinderbetreuung</option></select>
    <select id="fReg"><option value="">Alle Regionen</option>${Object.entries(REGION_LABEL).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("")}</select>
    <select id="fOrt">${opts(uniq(offers.flatMap((o) => o.ort.split(",").map((s) => s.trim()).filter(Boolean))), "Alle Orte")}</select>
    <select id="fSrc">${opts(["IAZH", "Viventa"], "Alle Quellen")}</select>
    <label><input type="checkbox" id="fPicked"> nur Merkliste</label>
    <button id="reset">Zurücksetzen</button>
    <button id="copyPick">Merkliste kopieren (<span id="nPick">0</span>)</button>
    <button id="copyCsv">Als CSV kopieren</button>
    <span class="count" id="count"></span>
  </div>
  <div class="wrap" lang="de" dir="ltr"><table><thead><tr>
    <th>✓</th><th data-k="dept">Bereich</th><th data-k="type">Angebotsart</th><th data-k="inst">Institution</th><th data-k="title">Angebot</th>
    <th data-k="tg">Zielgruppe</th><th data-k="de">Voraussetzungen</th><th data-k="desc">Inhalt</th><th data-k="nr">Nr.</th><th data-k="ort">Ort</th><th data-k="price">Kosten</th><th data-k="src">Quelle</th>
  </tr></thead><tbody id="tb"></tbody></table></div>`;
  const ids = ["q", "fDept", "fType", "fTg", "fDe", "fGoal", "fTop", "fKids", "fReg", "fOrt", "fSrc", "fPicked"];
  ids.forEach((id) => $(id).addEventListener("input", drawPro));
  $("reset").onclick = () => { ids.forEach((id) => { if ($(id).type === "checkbox") $(id).checked = false; else $(id).value = ""; }); pro.sortK = "dept"; pro.dir = 1; drawPro(); };
  document.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k; pro.dir = pro.sortK === k ? -pro.dir : 1; pro.sortK = k; drawPro();
  }));
  $("tb").addEventListener("change", (e) => {
    if (!e.target.matches("input[data-id]")) return;
    const id = e.target.dataset.id; e.target.checked ? pro.picked.add(id) : pro.picked.delete(id); $("nPick").textContent = pro.picked.size;
  });
  $("copyPick").onclick = () => copyText(offers.filter((o) => pro.picked.has(String(o.id))).map((o) => `- ${o.title} – ${o.inst}${o.ort ? ", " + o.ort : ""}${o.nr ? " [" + o.nr + "]" : ""}\n  Kosten: ${o.price || "s. Detailseite"}\n  ${o.url}`).join("\n"), "copyPick");
  $("copyCsv").onclick = () => {
    const h = ["Bereich", "Angebotsart", "Institution", "Angebot", "Zielgruppe", "Deutsch-Einstieg", "Ziel", "Themen", "Kursniveau", "Intensität", "Kinderbetreuung", "Beschreibung", "Nr", "Ort", "Kosten", "Quelle", "Link"];
    const c = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    copyText([h.join(";"), ...pro.current.map((o) => [o.dept, o.type, o.inst, o.title, o.tg.map((x) => TG_DE[x]).join(", "), o.de.join(", "), o.goal.join(", "), o.topics.join(", "), o.level.join(", "), o.intensity, o.childcare.join(", "), o.desc, o.nr, o.ort, o.price, o.src, o.url].map(c).join(";"))].join("\n"), "copyCsv");
  };
  drawPro();
}

async function copyText(txt, btnId) {
  const b = $(btnId); const old = b.innerHTML;
  try { await navigator.clipboard.writeText(txt); b.textContent = "Kopiert ✓"; } catch { b.textContent = "Kopieren nicht möglich"; }
  setTimeout(() => { b.innerHTML = old; $("nPick").textContent = pro.picked.size; }, 1600);
}

function costNum(s) { const m = String(s).replace(/[’']/g, "").match(/[\d.]+/); return m ? parseFloat(m[0]) : Infinity; }

function drawPro() {
  const v = (id) => $(id).value;
  const q = v("q").toLowerCase().trim();
  const onlyPicked = $("fPicked").checked;
  const list = offers.filter((o) =>
    (!v("fDept") || o.dept === v("fDept")) && (!v("fType") || o.type === v("fType")) && (!v("fTg") || o.tg.includes(v("fTg"))) &&
    (!v("fDe") || o.de.includes(v("fDe"))) && (!v("fGoal") || o.goal.includes(v("fGoal"))) && (!v("fTop") || o.topics.includes(v("fTop"))) &&
    (!v("fKids") || o.childcare.some((c) => /^mit/i.test(c))) && (!v("fReg") || o.region.includes(v("fReg"))) &&
    (!v("fOrt") || o.ort.split(",").map((s) => s.trim()).includes(v("fOrt"))) && (!v("fSrc") || o.src === v("fSrc")) &&
    (!onlyPicked || pro.picked.has(String(o.id))) &&
    (!q || [o.inst, o.title, o.nr, o.ort, o.type, o.price, o.tg.map((x) => TG_DE[x]).join(" "), o.topics.join(" "), o.desc].join(" ").toLowerCase().includes(q)));
  const k = pro.sortK, d = pro.dir;
  list.sort((a, b) => {
    if (k === "dept") return (DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept)) * d || a.type.localeCompare(b.type, "de") || a.inst.localeCompare(b.inst, "de");
    if (k === "price") return (costNum(a.price) - costNum(b.price)) * d;
    return String(a[k]).localeCompare(String(b[k]), "de") * d;
  });
  pro.current = list;
  $("tb").innerHTML = list.map((o) => {
    const vor = o.de.length ? `<div>Deutsch-Einstieg ab ${esc(o.de[0])}</div>${o.de.length > 1 ? `<div class="meta">möglich: ${esc(o.de.join(", "))}</div>` : ""}` : '<span class="none">keine Angabe</span>';
    const tags = [...o.goal.map((g) => `<span class="tag">${esc(g)}</span>`), ...o.topics.map((x) => `<span class="tag z">${esc(x)}</span>`)].join(" ");
    const m = [o.level.length ? `Kursniveau ${o.level[0]}${o.level.length > 1 ? "–" + o.level[o.level.length - 1] : ""}` : "", o.intensity, o.childcare.join(", ")].filter(Boolean).map(esc).join(" · ");
    const dsc = o.desc || "";
    const cut = dsc.length > 140 ? dsc.slice(0, 140).replace(/\s+\S*$/, "") + " …" : dsc;
    const desc = dsc.length > 140 ? `<details><summary><span class="cut">${esc(cut)} <span class="more">mehr</span></span></summary><p>${esc(dsc)}</p></details>` : esc(dsc);
    return `<tr>
      <td><input type="checkbox" data-id="${esc(o.id)}" ${pro.picked.has(String(o.id)) ? "checked" : ""} aria-label="Merken"></td>
      <td>${esc(o.dept)}</td><td>${esc(o.type)}</td><td>${esc(o.inst)}</td><td class="ang">${esc(o.title)}</td>
      <td class="zg">${o.tg.map((x) => `<span class="tag z">${esc(TG_DE[x])}</span>`).join(" ") || "–"}</td>
      <td class="vor">${vor}</td>
      <td class="inh">${tags ? `<div>${tags}</div>` : ""}${m ? `<div class="meta">${m}</div>` : ""}${desc}</td>
      <td class="nr"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.nr || "Seite")}</a></td>
      <td>${esc(o.ort || "–")}</td><td>${esc(o.price || "s. Detailseite")}</td>
      <td><span class="tag ${o.src === "Viventa" ? "v" : ""}">${esc(o.src)}</span></td></tr>`;
  }).join("");
  $("count").textContent = `${list.length} von ${offers.length} Angeboten`;
  $("nPick").textContent = pro.picked.size;
  document.querySelectorAll("th[data-k]").forEach((th) => th.classList.toggle("sorted", th.dataset.k === k));
}

// ---------- init ----------
async function init() {
  $("lang").innerHTML = LANGS.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join("");
  $("lang").addEventListener("change", (e) => setLang(e.target.value));
  window.addEventListener("hashchange", route);
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
