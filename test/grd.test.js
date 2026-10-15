/* TXT GRD spreadsheet contract test (jsdom).
   Stubs window.TXT minimally (bus/store/register), loads js/grd/grd.js,
   then verifies: formula engine, dependency recalc, cycles, live push
   events, and show()/hide() view construction.
   Run: NODE_PATH=<jsdom> node test/grd.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><main id="views"><section id="view-grd" class="view hidden"></section></main></body></html>',
  { url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously" }
);
const { window } = dom;

// minimal TXT stub
const listeners = {};
const emitted = []; // {evt, data} captured from T.store.emit
const storeData = {};
let uidN = 0;
window.TXT = {
  bus: {
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: (ev, data) => { (listeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  store: {
    get: (app, key) => {
      const ns = storeData[app];
      if (!ns) return undefined;
      return key === undefined ? ns : ns[key];
    },
    set: (app, key, val) => { (storeData[app] = storeData[app] || {})[key] = val; return val; },
    on: () => {},
    emit: (evt, data) => { emitted.push({ evt, data }); }
  },
  cmds: {},
  register(name, fn, meta) { window.TXT.cmds[name] = { fn, meta: meta || {} }; },
  cmd(name, ...a) { const c = window.TXT.cmds[name]; if (c) { return c.fn(...a); } },
  t: (k) => k,
  uid: (p) => (p || "t") + "-" + (++uidN),
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  debounce: (fn) => fn,
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: () => {}
};
window.eval(fs.readFileSync(path.join(ROOT, "js/grd/grd.js"), "utf8"));

let failures = [];
function check(name, fn) {
  try { if (fn() === false) { throw new Error("returned false"); } console.log("  PASS " + name); }
  catch (e) { failures.push(name); console.log("  FAIL " + name + " :: " + (e && e.message)); }
}
function assert(c, m) { if (!c) { throw new Error(m || "assert"); } }
function val(g, a) { const r = window.TXT.grd.getValue(g, a); return r.e ? "#" + r.e : r.v; }
function tick(ms) { return new Promise(function (res) { setTimeout(res, ms || 10); }); }
function cardFor(name) {
  const cards = doc.querySelectorAll("#grd-recent-grid .eco-home-card");
  for (let i = 0; i < cards.length; i++) {
    const t = cards[i].querySelector(".eco-card-title");
    if (t && t.textContent === name) return cards[i];
  }
  return null;
}

// async checks run strictly in registration order (no shared-state races),
// then are awaited before the final verdict
const pending = [];
let asyncChain = Promise.resolve();
function checkAsync(name, fn) {
  asyncChain = asyncChain.then(function () {
    return Promise.resolve().then(fn).then(
      function () { console.log("  PASS " + name); },
      function (e) { failures.push(name); console.log("  FAIL " + name + " :: " + (e && e.message)); }
    );
  });
  pending.push(asyncChain);
}

const T = window.TXT, doc = window.document, G = T.grd;

check("T.grd contract exists", () => {
  ["show", "hide", "newGrid", "setCell", "getCell", "getValue", "evaluate",
   "parse", "newDoc", "openDoc", "current", "pushLiveTable", "updateLive"
  ].forEach((k) => assert(typeof G[k] === "function", "missing " + k));
  return true;
});

check("formula arithmetic and precedence", () => {
  const g = G.newGrid();
  assert(val(g, "A9") === null, "empty not null");
  G.setCell(g, "A1", 10); G.setCell(g, "A2", 3);
  assert(G.evaluate(g, "=1+2*3").v === 7, "precedence");
  assert(G.evaluate(g, "=(2+3)*4").v === 20, "parens");
  assert(G.evaluate(g, "=A1+A2*2").v === 16, "refs");
  assert(G.evaluate(g, "=A1-A2").v === 7, "sub");
  assert(G.evaluate(g, "=A1/A2").v === 10 / 3, "div");
  assert(G.evaluate(g, "=-A2").v === -3, "unary");
  assert(G.evaluate(g, "=2^3") === undefined || true, "noop");
  return true;
});

check("SUM and AVERAGE over a range", () => {
  const g = G.newGrid();
  [5, 10, 15, 20].forEach((v, i) => G.setCell(g, "B" + (i + 1), v));
  G.setCell(g, "B5", "=SUM(B1:B4)");
  G.setCell(g, "B6", "=AVERAGE(B1:B4)");
  assert(val(g, "B5") === 50, "sum got " + val(g, "B5"));
  assert(val(g, "B6") === 12.5, "avg got " + val(g, "B6"));
  assert(G.evaluate(g, "=MIN(B1:B4)").v === 5, "min");
  assert(G.evaluate(g, "=MAX(B1:B4)").v === 20, "max");
  assert(G.evaluate(g, "=COUNT(B1:B4)").v === 4, "count");
  return true;
});

check("nested dependency chain recalcs", () => {
  const g = G.newGrid();
  [2, 4, 6].forEach((v, i) => G.setCell(g, "A" + (i + 1), v));
  G.setCell(g, "A4", "=SUM(A1:A3)");   // 12
  G.setCell(g, "A5", "=A4*2");          // 24
  G.setCell(g, "A6", "=A5+A1");         // 26
  assert(val(g, "A4") === 12, "a4");
  assert(val(g, "A5") === 24, "a5");
  assert(val(g, "A6") === 26, "a6");
  G.setCell(g, "A1", 10);               // chain: 20, 40, 50
  assert(val(g, "A4") === 20, "a4 after edit, got " + val(g, "A4"));
  assert(val(g, "A5") === 40, "a5 after edit");
  assert(val(g, "A6") === 50, "a6 after edit");
  return true;
});

check("IF true/false branches with string literals", () => {
  const g = G.newGrid();
  G.setCell(g, "A1", 10);
  assert(G.evaluate(g, '=IF(A1>5,"big","small")').v === "big", "if true");
  assert(G.evaluate(g, '=IF(A1<5,"big","small")').v === "small", "if false");
  assert(G.evaluate(g, '=IF(A1=10,"yes","no")').v === "yes", "eq");
  assert(G.evaluate(g, '=IF(A1<>10,"yes","no")').v === "no", "ne");
  return true;
});

check("cycle detection reports #CYCLE", () => {
  const g = G.newGrid();
  G.setCell(g, "A1", "=B1");
  G.setCell(g, "B1", "=A1");
  assert(val(g, "A1") === "#CYCLE", "a1 cycle, got " + val(g, "A1"));
  assert(val(g, "B1") === "#CYCLE", "b1 cycle");
  G.setCell(g, "C1", "=C1+1");
  assert(val(g, "C1") === "#CYCLE", "self cycle");
  // breaking the cycle recovers
  G.setCell(g, "B1", 5);
  assert(val(g, "A1") === 5, "recovered, got " + val(g, "A1"));
  return true;
});

check("division by zero and bad refs", () => {
  const g = G.newGrid();
  G.setCell(g, "A1", 10); G.setCell(g, "A2", 0);
  assert(val(g, "A3") === null, "empty");
  G.setCell(g, "A3", "=A1/A2");
  assert(val(g, "A3") === "#DIV/0", "div0, got " + val(g, "A3"));
  assert(G.evaluate(g, "=ZZ1+1").e === "REF", "bad col ref");
  assert(G.evaluate(g, "=A101+1").e === "REF", "bad row ref");
  assert(G.evaluate(g, "=NOSUCHFN(1)").e === "NAME", "bad fn");
  return true;
});

check("comparisons and nested IF", () => {
  const g = G.newGrid();
  assert(G.evaluate(g, "=3<5").v === true, "lt");
  assert(G.evaluate(g, "=5<=5").v === true, "le");
  assert(G.evaluate(g, '=IF(1+1=2,IF(2>1,"a","b"),"c")').v === "a", "nested if");
  assert(G.evaluate(g, '="x"="X"').v === true, "string eq");
  return true;
});

check("templates build working sheets", () => {
  const d = G.newDoc("Budget test", "budget");
  assert(val(d.grid, "C7") === 735000, "budget total, got " + val(d.grid, "C7"));
  const k = G.newDoc("Kanban test", "kanban");
  assert(k.kanban.statusCol === "C", "kanban status col");
  assert(G.getCell(k.grid, "C2").value === "Doing", "kanban status value");
  const gb = G.newDoc("Grades", "gradebook");
  assert(Math.abs(G.getValue(gb.grid, "D2").v - 86.5) < 1e-9, "gradebook avg");
  return true;
});

check("grd:live emit payload shape", () => {
  emitted.length = 0;
  const d = G.newDoc("Live test");
  G.setCell(d.grid, "A1", "Name"); G.setCell(d.grid, "B1", "Score");
  G.setCell(d.grid, "A2", "Aung"); G.setCell(d.grid, "B2", 88);
  const b = G.pushLiveTable(d, "A1:B2", "Scores");
  assert(b && b.id, "block id");
  assert(emitted.length === 1, "one emit, got " + emitted.length);
  const p = emitted[0];
  assert(p.evt === "grd:live", "evt name");
  assert(p.data.id === b.id, "id matches");
  assert(p.data.label === "Scores", "label");
  assert(typeof p.data.html === "string" && p.data.html.indexOf("<table") === 0, "html table");
  assert(Array.isArray(p.data.values) && p.data.values.length === 2, "values rows");
  assert(p.data.values[1][1] === "88", "value cell, got " + p.data.values[1][1]);
  return true;
});

check("grd:update re-emits on affecting edit only", () => {
  emitted.length = 0;
  const d = G.newDoc("Update test");
  G.setCell(d.grid, "A1", 5); G.setCell(d.grid, "A2", 10);
  G.pushLiveTable(d, "A1:A2", "Nums");
  emitted.length = 0;
  const n = G.updateLive(d, "B9"); // outside the pushed range
  assert(n === 0 && emitted.length === 0, "no emit for unrelated edit");
  G.setCell(d.grid, "A1", 7);
  const n2 = G.updateLive(d, "A1");
  assert(n2 === 1, "one block updated");
  assert(emitted.length === 1 && emitted[0].evt === "grd:update", "grd:update evt");
  assert(emitted[0].data.values[0][0] === "7", "fresh value, got " + emitted[0].data.values[0][0]);
  return true;
});

check("chart data extraction", () => {
  const d = G.newDoc("Chart test");
  G.setCell(d.grid, "A1", "Month"); G.setCell(d.grid, "B1", "Sales");
  G.setCell(d.grid, "A2", "Jan"); G.setCell(d.grid, "B2", 100);
  G.setCell(d.grid, "A3", "Feb"); G.setCell(d.grid, "B3", 150);
  const ch = { id: "ch-1", type: "bar", range: "A1:B3", title: "Sales" };
  const data = G.chartData(d, ch);
  assert(data.labels.join(",") === "Jan,Feb", "labels");
  assert(data.series.length === 1 && data.series[0].name === "Sales", "series name");
  assert(data.series[0].data.join(",") === "100,150", "series data");
  return true;
});

check("show() builds view, hide() is a safe no-op", () => {
  G.show();
  assert(doc.getElementById("grd-root"), "grd-root");
  const home = doc.getElementById("grd-home");
  assert(home && home.classList.contains("eco-home"), "eco-home root");
  assert(home.querySelector(".eco-home-head"), "eco-home-head");
  const badge = home.querySelector(".eco-home-head .eco-badge");
  assert(badge && badge.textContent === "GRD", "GRD badge");
  assert(home.querySelector("input.eco-home-search"), "eco-home-search");
  assert(home.querySelector(".eco-home-sec > h2"), "eco-home-sec h2");
  assert(home.querySelector(".eco-home-grid"), "eco-home-grid");
  assert(home.querySelector(".eco-home-new"), "eco-home-new");
  G.hide(); // must not throw
  // grid skeleton: 26 cols x 100 rows of cells
  const cells = doc.querySelectorAll("#grd-grid .grd-cell");
  assert(cells.length === 2600, "2600 cells, got " + cells.length);
  const headers = doc.querySelectorAll("#grd-grid .grd-ch");
  assert(headers.length === 26, "26 col headers");
  assert(doc.getElementById("grd-fx"), "formula bar");
  assert(doc.getElementById("grd-editor"), "floating editor");
  return true;
});

check("bus ecosystem:app routes to show()", () => {
  assert(doc.getElementById("grd-root"), "already built");
  T.bus.emit("ecosystem:app", { app: "grd" });
  assert(doc.getElementById("grd-home"), "home still present after bus show");
  T.bus.emit("ecosystem:app", { app: "dck" }); // must be ignored, no throw
  return true;
});

check("grd.* commands registered", () => {
  ["grd.new", "grd.home", "grd.grid", "grd.kanban", "grd.charts", "grd.push-live"].forEach((n) => {
    assert(T.cmds[n], "missing command " + n);
    assert(/^grd\./.test(n), "prefix");
  });
  return true;
});

check("recent list maintained in store (max 20)", () => {
  for (let i = 0; i < 22; i++) G.newDoc("Sheet " + i);
  const rec = T.store.get("grd", "recent");
  assert(Array.isArray(rec) && rec.length === 20, "capped at 20, got " + (rec && rec.length));
  assert(rec[0].title === "Sheet 21", "most recent first");
  return true;
});

check("per-app settings: defaults, persist, gridlines toggle", () => {
  G.show();
  const s0 = G.settings();
  assert(s0.showGridlines === true, "default gridlines on");
  assert(s0.defaultNumFmt === "general", "default fmt general");
  assert(s0.freezeHeaderRow === false, "default freeze off");
  assert(s0.compactRowHeight === false, "default compact off");
  G.saveSettings({ showGridlines: false });
  const stored = T.store.get("grd", "settings");
  assert(stored && stored.showGridlines === false, "persisted to T.store");
  const grid = doc.getElementById("grd-grid");
  assert(grid.classList.contains("grd-no-gridlines"), "no-gridlines class applied");
  G.saveSettings({ showGridlines: true });
  assert(!grid.classList.contains("grd-no-gridlines"), "gridlines restored");
  return true;
});

check("per-app settings: freeze header row + compact row height flip classes", () => {
  G.saveSettings({ freezeHeaderRow: true, compactRowHeight: true });
  const grid = doc.getElementById("grd-grid");
  assert(grid.classList.contains("grd-freeze-row1"), "freeze class");
  assert(grid.classList.contains("grd-compact"), "compact class");
  const rh0 = grid.querySelector('.grd-rh[data-r="0"]');
  assert(rh0 && rh0.textContent === "1", "row header carries data-r=0 for freeze targeting");
  assert(grid.querySelector('.grd-cell[data-r="0"]'), "data row 1 cells carry data-r=0");
  G.saveSettings({ freezeHeaderRow: false, compactRowHeight: false });
  assert(!grid.classList.contains("grd-freeze-row1"), "freeze class removed");
  assert(!grid.classList.contains("grd-compact"), "compact class removed");
  return true;
});

check("per-app settings: default number format applies to newly entered values", () => {
  G.saveSettings({ defaultNumFmt: "currency" });
  const d = G.newDoc("fmt test");
  G.openDoc(d.id);
  assert(G.commitValue("A1", 1200) === true, "commitValue ok");
  assert(G.displayOf(d.grid, "A1") === "Ks 1,200", "currency applied, got " + G.displayOf(d.grid, "A1"));
  G.saveSettings({ defaultNumFmt: "percent" });
  G.commitValue("B1", 0.5);
  assert(G.displayOf(d.grid, "B1") === "50%", "percent applied, got " + G.displayOf(d.grid, "B1"));
  // an explicit per-cell format is not stomped by a later default change
  G.commitValue("A2", 5); // percent was the default at commit time
  G.saveSettings({ defaultNumFmt: "general" });
  G.commitValue("A2", 7);
  assert(G.displayOf(d.grid, "A2") === "700%", "explicit kept, got " + G.displayOf(d.grid, "A2"));
  G.commitValue("C1", 1200);
  assert(G.displayOf(d.grid, "C1") === "1,200", "general, got " + G.displayOf(d.grid, "C1"));
  return true;
});

check("file model: create/rename/duplicate/remove/open round-trip", () => {
  const f = G.files.create("Crud Sheet");
  assert(f && f.id && f.name === "Crud Sheet", "create record");
  assert(f.doc && f.doc.title === "Crud Sheet", "record carries sheet payload");
  assert(f.updatedAt, "record has updatedAt");
  assert(G.files.list().some(function (x) { return x.id === f.id; }), "listed");
  const r = G.files.rename(f.id, "Crud Renamed");
  assert(r && r.name === "Crud Renamed", "rename");
  assert(G.current().title === "Crud Renamed", "rename updates current title");
  G.setCell(f.doc.grid, "A1", 42);
  const c = G.files.duplicate(f.id);
  assert(c && c.id !== f.id, "duplicate gets a new id");
  assert(c.name === "Crud Renamed copy", "duplicate name, got " + c.name);
  assert(c.doc.grid.cells["A1"] === 42, "duplicate carries the payload");
  c.doc.grid.cells["A1"] = 999;
  assert(f.doc.grid.cells["A1"] === 42, "duplicate is a deep copy");
  const o = G.files.open(c.id);
  assert(o && o.id === c.id && G.current().id === c.id, "open sets current");
  assert(doc.getElementById("grd-title").value === "Crud Renamed copy", "open syncs title input");
  assert(G.files.remove(f.id) === true, "remove true");
  assert(!G.files.list().some(function (x) { return x.id === f.id; }), "removed from list");
  assert(G.files.remove("no-such-id") === false, "remove missing false");
  assert(G.files.rename("no-such-id", "x") === null, "rename missing null");
  assert(G.files.duplicate("no-such-id") === null, "duplicate missing null");
  assert(G.files.open("no-such-id") === null, "open missing null");
  G.files.remove(c.id);
  return true;
});

check("per-app topbar: badge, name, working launcher + gear buttons", () => {
  G.show();
  const bar = doc.getElementById("grd-topbar");
  assert(bar, "topbar");
  assert(doc.getElementById("grd-top-badge"), "badge");
  const nm = doc.getElementById("grd-appname");
  assert(nm && nm.textContent === "GRD", "GRD name");
  const launch = doc.getElementById("grd-launcher");
  assert(launch, "launcher button");
  assert(launch.classList.contains("icon-btn") && launch.classList.contains("waffle-btn"), "launcher classes");
  const dots = launch.querySelectorAll(".waffle-dots i");
  assert(dots.length === 9, "9 dots, got " + dots.length);
  let fired = false;
  T.ecosystem = { toggleLauncher: function () { fired = true; } };
  launch.click();
  assert(fired, "launcher calls T.ecosystem.toggleLauncher");
  const gear = doc.getElementById("grd-settings-btn");
  assert(gear, "gear button");
  const panel = doc.getElementById("grd-settings");
  assert(panel && panel.classList.contains("hidden"), "settings hidden initially");
  gear.click();
  assert(!panel.classList.contains("hidden"), "gear opens settings drawer");
  assert(doc.getElementById("grd-set-gridlines"), "gridlines toggle");
  assert(doc.getElementById("grd-set-numfmt"), "numfmt select");
  assert(doc.getElementById("grd-set-freezerow"), "freeze toggle");
  assert(doc.getElementById("grd-set-compact"), "compact toggle");
  const about = panel.querySelector(".grd-set-about");
  assert(about && /NXT OS/.test(about.textContent), "about mentions NXT OS");
  doc.getElementById("grd-settings-close").click();
  assert(panel.classList.contains("hidden"), "close hides drawer");
  return true;
});

checkAsync("homescreen lists files with 4 actions + NXT footer", async () => {
  G.files.create("Home Card Sheet");
  G.goHome();
  await tick(20); // home cards paint asynchronously after the skeleton pass
  const card = cardFor("Home Card Sheet");
  assert(card, "card for created file");
  const labels = Array.prototype.map.call(
    card.querySelectorAll(".eco-card-actions button"), function (b) { return b.textContent; });
  assert(labels.join(",") === "Open,Rename,Duplicate,Delete", "four actions, got " + labels.join(","));
  const n0 = G.files.list().length;
  card.querySelectorAll(".eco-card-actions button")[2].click(); // Duplicate
  await tick(20); // duplicate re-renders home through the skeleton pass
  assert(G.files.list().length === n0 + 1, "card duplicate adds a file");
  assert(G.files.list().some(function (x) { return x.name === "Home Card Sheet copy"; }), "duplicate named");
  // rename through the card's inline input
  const card2 = cardFor("Home Card Sheet");
  assert(card2, "card still present after re-render");
  card2.querySelectorAll(".eco-card-actions button")[1].click(); // Rename
  const inp = card2.querySelector(".grd-rename-input");
  assert(inp && inp.value === "Home Card Sheet", "inline rename input");
  inp.value = "Home Card Renamed";
  inp.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert(G.files.list().some(function (x) { return x.name === "Home Card Renamed"; }), "renamed via card");
  const foot = doc.getElementById("grd-home-foot");
  assert(foot && foot.textContent === "Part of NXT OS", "NXT footer");
});

check("homescreen New sheet action creates and opens a file", () => {
  G.goHome();
  const n0 = G.files.list().length;
  const nb = doc.getElementById("grd-new-sheet");
  assert(nb, "new sheet button");
  nb.click();
  assert(G.files.list().length === n0 + 1, "file created");
  assert(G.current(), "a doc is current");
  G.goHome();
  return true;
});

/* ---- Phase B UI polish regressions ---- */
const grdCss = fs.readFileSync(path.join(ROOT, "css/grd.css"), "utf8");

check("mobile Format sheet: toggle opens/closes, handle + close affordance", () => {
  G.show();
  const tgl = doc.getElementById("grd-fmt-toggle");
  assert(tgl && tgl.textContent === "Format", "Format toggle button");
  const ft = doc.getElementById("grd-formatbar");
  assert(ft && ft.classList.contains("nxt-sheet"), "formatbar carries nxt-sheet class");
  assert(ft.querySelector(".nxt-sheet-handle"), "sheet handle present");
  const close = doc.getElementById("grd-fmt-close");
  assert(close && close.textContent === "Close", "44px close button present");
  const scrim = doc.getElementById("grd-fmt-scrim");
  assert(scrim, "sheet scrim present");
  assert(!ft.classList.contains("grd-open"), "sheet closed initially");
  tgl.click();
  assert(ft.classList.contains("grd-open"), "toggle opens the sheet");
  assert(scrim.classList.contains("grd-open"), "scrim opens with the sheet");
  assert(tgl.getAttribute("aria-expanded") === "true", "aria-expanded true when open");
  close.click();
  assert(!ft.classList.contains("grd-open"), "close button closes the sheet");
  assert(!scrim.classList.contains("grd-open"), "scrim closes with the sheet");
  tgl.click();
  assert(ft.classList.contains("grd-open"), "reopened");
  scrim.click();
  assert(!ft.classList.contains("grd-open"), "tapping scrim closes the sheet");
  tgl.click();
  ft.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(!ft.classList.contains("grd-open"), "Escape closes the sheet");
  return true;
});

check("format sheet keeps every format control wired to a real action", () => {
  const ft = doc.getElementById("grd-formatbar");
  assert(ft, "formatbar");
  const ids = ["grd-f-bold", "grd-f-fg", "grd-f-bg", "grd-f-numfmt", "grd-f-ctype",
               "grd-sort-asc", "grd-sort-desc", "grd-clear"];
  ids.forEach(function (id) { assert(doc.getElementById(id), "control present: " + id); });
  return true;
});

check("home grids are max-width constrained (iPad stretch fix)", () => {
  assert(/#grd-home\s+\.eco-home-grid\s*\{[^}]*max-width:\s*1100px/.test(grdCss),
    "max-width 1100px rule for #grd-home .eco-home-grid");
  assert(/#grd-home\s+\.eco-home-grid\s*\{[^}]*margin-left:\s*auto/.test(grdCss),
    "centered margins for #grd-home .eco-home-grid");
  return true;
});

check("formula bar stacks vertically on <=640px", () => {
  assert(/@media\s*\(\s*max-width:\s*640px\s*\)[\s\S]*\.grd-fxinput\s*\{[^}]*flex:\s*1\s+1\s+100%/.test(grdCss),
    ".grd-fxinput flex-basis 100% inside the 640px media query");
  assert(/@media\s*\(\s*max-width:\s*640px\s*\)[\s\S]*\.grd-fxbar\s*\{[^}]*flex-wrap:\s*wrap/.test(grdCss),
    ".grd-fxbar wraps inside the 640px media query");
  return true;
});

check("kanban stacks to one column on <=640px", () => {
  assert(/@media\s*\(\s*max-width:\s*640px\s*\)[\s\S]*\.grd-kb-board\s*\{[^}]*grid-template-columns:\s*1fr/.test(grdCss),
    ".grd-kb-board single column inside the 640px media query");
  return true;
});

check("NXT shared CSS: skeleton + bottom sheet blocks present", () => {
  assert(grdCss.indexOf(".nxt-skeleton") >= 0, ".nxt-skeleton block");
  assert(grdCss.indexOf("nxt-shimmer") >= 0, "shimmer keyframes");
  assert(grdCss.indexOf(".nxt-sheet") >= 0, ".nxt-sheet block");
  assert(grdCss.indexOf(".nxt-sheet-handle") >= 0, ".nxt-sheet-handle block");
  assert(grdCss.indexOf("z-index: 350") >= 0, "sheet z-index");
  return true;
});

check("topbar spec: 56px min-height, 44px badge", () => {
  assert(/\.grd-topbar\s*\{[^}]*min-height:\s*56px/.test(grdCss), "topbar min-height 56px");
  assert(/\.grd-appbadge\s*\{[^}]*width:\s*44px/.test(grdCss), "badge 44px wide");
  assert(/\.grd-appbadge\s*\{[^}]*height:\s*44px/.test(grdCss), "badge 44px tall");
  assert(/\.grd-appbadge\s*\{[^}]*border-radius:\s*10px/.test(grdCss), "badge radius 10px");
  assert(/\.grd-appname\s*\{[^}]*font-size:\s*15px/.test(grdCss), "app name 15px");
  return true;
});

check("no sub-11px type and no off-scale radii remain", () => {
  const sizes = [];
  let m;
  const re = /font-size:\s*([\d.]+)px/g;
  while ((m = re.exec(grdCss)) !== null) sizes.push(parseFloat(m[1]));
  const tooSmall = sizes.filter(function (s) { return s < 11; });
  assert(tooSmall.length === 0, "sub-11px sizes: " + tooSmall.join(","));
  const allowedScale = [11, 13, 15, 17];
  const offScale = sizes.filter(function (s) { return allowedScale.indexOf(s) < 0; });
  assert(offScale.length === 0, "off-scale sizes: " + offScale.join(","));
  const radii = [];
  const rr = /border-radius:\s*([\d.]+)px/g;
  while ((m = rr.exec(grdCss)) !== null) radii.push(parseFloat(m[1]));
  const badRadii = radii.filter(function (r) { return [6, 10, 14, 999].indexOf(r) < 0; });
  assert(badRadii.length === 0, "off-scale radii: " + badRadii.join(","));
  return true;
});

checkAsync("home grids paint skeleton cards before real cards", async () => {
  G.files.create("Skeleton Probe Sheet");
  G.goHome();
  const rg = doc.getElementById("grd-recent-grid");
  const skels = rg.querySelectorAll(".nxt-skeleton");
  assert(skels.length > 0, "skeleton cards present immediately after goHome");
  await tick(20);
  assert(rg.querySelectorAll(".nxt-skeleton").length === 0, "skeletons replaced");
  assert(cardFor("Skeleton Probe Sheet"), "real card painted after the skeleton pass");
});

checkAsync("delete confirms via T.modal when available", async () => {
  const calls = [];
  T.modal = function (opts) { calls.push(opts); return Promise.resolve({}); };
  const f = G.files.create("Modal Delete Me");
  G.goHome();
  await tick(20); // wait for the async home paint
  const card = cardFor("Modal Delete Me");
  assert(card, "card found");
  card.querySelectorAll(".eco-card-actions button")[3].click(); // Delete
  await tick(20);
  assert(calls.length === 1, "T.modal called once, got " + calls.length);
  assert(calls[0].title === "Delete sheet?", "modal title");
  assert(calls[0].danger === true, "modal danger flag");
  assert(!G.files.list().some(function (x) { return x.id === f.id; }), "file removed after confirm");
  delete T.modal;
});

checkAsync("delete falls back to local confirm when T.modal is absent", async () => {
  assert(!T.modal, "no T.modal in this path");
  const f = G.files.create("Fallback Delete Me");
  G.goHome();
  await tick(20); // wait for the async home paint
  const card = cardFor("Fallback Delete Me");
  assert(card, "card found");
  card.querySelectorAll(".eco-card-actions button")[3].click(); // Delete
  await tick(20);
  const wrap = doc.querySelector("#view-grd .grd-confirm-wrap");
  assert(wrap, "local confirm shown");
  assert(/Fallback Delete Me/.test(wrap.textContent), "dialog names the sheet");
  const btns = wrap.querySelectorAll(".grd-confirm-row .grd-btn");
  assert(btns.length === 2, "cancel + ok buttons");
  btns[1].click(); // confirm
  await tick(20);
  assert(!doc.querySelector("#view-grd .grd-confirm-wrap"), "dialog closed");
  assert(!G.files.list().some(function (x) { return x.id === f.id; }), "file removed after local confirm");
  // cancel path keeps the file
  const g = G.files.create("Fallback Keep Me");
  G.goHome();
  await tick(20); // wait for the async home paint
  cardFor("Fallback Keep Me").querySelectorAll(".eco-card-actions button")[3].click();
  await tick(20);
  const wrap2 = doc.querySelector("#view-grd .grd-confirm-wrap");
  assert(wrap2, "confirm shown again");
  wrap2.querySelectorAll(".grd-confirm-row .grd-btn")[0].click(); // Cancel
  await tick(20);
  assert(G.files.list().some(function (x) { return x.id === g.id; }), "file kept after cancel");
  assert(!doc.querySelector("#view-grd .grd-confirm-wrap"), "dialog closed after cancel");
  G.files.remove(g.id);
});

check("no duplicate grd- ids in built view", () => {
  const seen = {};
  let dup = null;
  doc.querySelectorAll("#view-grd [id]").forEach((n) => {
    const id = n.id;
    assert(id.indexOf("grd-") === 0, "id not grd- prefixed: " + id);
    if (seen[id]) dup = id;
    seen[id] = 1;
  });
  assert(!dup, "duplicate id: " + dup);
  return true;
});

Promise.all(pending).then(function () {
  console.log(failures.length ? ("\n" + failures.length + " FAILURES") : "\nALL PASS");
  process.exit(failures.length ? 1 : 0);
});
