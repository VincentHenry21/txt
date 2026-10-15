/* TXT VAC Studio core/tools contract test (jsdom).
   Stubs window.TXT minimally, loads js/vac/core.js + js/vac/tools.js,
   then verifies the T.vac contract the panels worker depends on.
   Run: NODE_PATH=<jsdom> node test/vector.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

const dom = new JSDOM('<!DOCTYPE html><html><body><main id="views"></main></body></html>', {
  url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
});
const { window } = dom;

// minimal TXT stub matching ARCHITECTURE.md conventions
const listeners = {};
window.TXT = {
  bus: {
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: (ev, data) => { (listeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  cmds: {},
  register(name, fn, meta) { window.TXT.cmds[name] = { fn, meta: meta || {} }; },
  cmd(name, ...a) { const c = window.TXT.cmds[name]; if (c) { return c.fn(...a); } },
  t: (k) => k,
  uid: (() => { let n = 0; return () => "t" + (++n); })(),
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  debounce: (fn) => fn,
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: () => {}
};
// NXT phase 1: per-app store / modal / ecosystem stubs
window.TXT.store = {
  _d: {},
  get(a, k) { const n = this._d[a]; return n ? n[k] : undefined; },
  set(a, k, v) { (this._d[a] = this._d[a] || {})[k] = v; return v; },
  on() {}, emit() {}
};
window.TXT.modal = (o) => { window.__modalOpts = o; return Promise.resolve({}); };
window.TXT.ecosystem = {
  _calls: [],
  toggleLauncher() { this._calls.push("toggleLauncher"); },
  setPersona(p) { this._calls.push("setPersona:" + p); }
};
// jsdom lacks SVG getCTM/DOMMatrix: minimal fakes so nudge() runs end to end
window.Element.prototype.getCTM = function () { return null; };
window.DOMMatrix = function (a, b, c, d, e, f) {
  this.a = a === undefined ? 1 : a; this.b = b || 0; this.c = c || 0;
  this.d = d === undefined ? 1 : d; this.e = e || 0; this.f = f || 0;
};
window.DOMMatrix.prototype.translate = function (x, y) {
  return new window.DOMMatrix(this.a, this.b, this.c, this.d,
    this.e + this.a * x + this.c * y, this.f + this.b * x + this.d * y);
};
window.DOMMatrix.prototype.multiply = function (m) {
  return new window.DOMMatrix(
    this.a * m.a + this.c * m.b, this.b * m.a + this.d * m.b,
    this.a * m.c + this.c * m.d, this.b * m.c + this.d * m.d,
    this.a * m.e + this.c * m.f + this.e, this.b * m.e + this.d * m.f + this.f);
};
window.eval(fs.readFileSync(path.join(ROOT, "js/vac/core.js"), "utf8"));
window.eval(fs.readFileSync(path.join(ROOT, "js/vac/tools.js"), "utf8"));
// panels worker: needs T.vacOps (stubbed subset of the real ops.js contract)
window.TXT.vacOps = {
  visualBBox: () => null, unionBox: () => null, localBBox: () => null,
  getRot: () => 0, applyBox: () => {}, nudge: () => {}, changed: () => {},
  align: () => {}, distribute: () => {},
  unite: () => {}, minusFront: () => {}, intersect: () => {}, exclude: () => {}
};
window.eval(fs.readFileSync(path.join(ROOT, "js/vac/panels.js"), "utf8"));

let failures = [];
function check(name, fn) {
  try { if (fn() === false) { throw new Error("returned false"); } console.log("  PASS " + name); }
  catch (e) { failures.push(name); console.log("  FAIL " + name + " :: " + (e && e.message)); }
}
function assert(c, m) { if (!c) { throw new Error(m || "assert"); } }

const T = window.TXT, doc = window.document;
const SVGNS = "http://www.w3.org/2000/svg";

check("T.vac contract exists", () => {
  ["newDoc", "setSVG", "getSVG", "svgEl", "selection", "select"].forEach((k) => {
    assert(typeof T.vac[k] === "function", "missing " + k);
  });
  return true;
});

check("show() builds skeleton", () => {
  T.vac.show();
  ["vTopbar", "vTools", "vCanvasWrap", "vPanels", "vToolOptions", "vCoords", "vZoomPct"].forEach((id) => {
    assert(doc.getElementById(id), "missing #" + id);
  });
  const svg = T.vac.svgEl();
  assert(svg && svg.id === "vCanvas", "no svg#vCanvas");
  assert(svg.querySelector("#vArtboard"), "no artboard");
  assert(svg.querySelector("#vOverlay"), "no overlay");
  return true;
});

check("9 tools registered with shortcuts", () => {
  const ids = ["select", "node", "pen", "shapes", "brush", "type", "eyedropper", "hand", "zoom"];
  ids.forEach((id) => { assert(T.vac.tool && true, ""); });
  const dockBtns = doc.querySelectorAll("#vTools .vtool:not(.v-more)");
  assert(dockBtns.length === ids.length, "dock has " + dockBtns.length + " tool buttons, want " + ids.length);
  assert(doc.getElementById("vToolsMore"), "no #vToolsMore overflow button");
  T.vac.setTool("pen");
  assert(T.vac.tool().id === "pen", "setTool pen failed");
  T.vac.setTool("select");
  assert(T.vac.tool().id === "select", "setTool select failed");
  return true;
});

check("newDoc creates Layer 1, 800x600", () => {
  T.vac.newDoc();
  const layers = T.vac.layers();
  assert(layers.length >= 1, "no layers");
  assert(T.vac.artboardSize().w === 800 && T.vac.artboardSize().h === 600, "artboard size");
  return true;
});

check("shape creation via DOM + select + selection event", () => {
  let got = null;
  T.bus.on("vac:selection", (d) => { got = d; });
  const g = T.vac.activeLayer();
  const r = doc.createElementNS(SVGNS, "rect");
  r.setAttribute("x", "10"); r.setAttribute("y", "10");
  r.setAttribute("width", "50"); r.setAttribute("height", "40");
  g.appendChild(r);
  T.vac.select([r]);
  assert(T.vac.selection().length === 1, "selection len");
  assert(got && got.els.length === 1, "selection event");
  T.vac.select([]);
  assert(T.vac.selection().length === 0, "deselect");
  return true;
});

check("undo/redo round trip", () => {
  const g = T.vac.activeLayer();
  T.vac.checkpoint();
  const r = doc.createElementNS(SVGNS, "rect");
  r.setAttribute("x", "1"); r.setAttribute("y", "1");
  r.setAttribute("width", "5"); r.setAttribute("height", "5");
  g.appendChild(r);
  assert(g.querySelectorAll("rect").length >= 1, "rect added");
  T.vac.undo();
  const g2 = T.vac.activeLayer();
  const afterUndo = Array.prototype.filter.call(g2.querySelectorAll("rect"), (n) => n.getAttribute("x") === "1");
  assert(afterUndo.length === 0, "undo did not remove rect");
  T.vac.redo();
  const g3 = T.vac.activeLayer();
  const afterRedo = Array.prototype.filter.call(g3.querySelectorAll("rect"), (n) => n.getAttribute("x") === "1");
  assert(afterRedo.length === 1, "redo did not restore rect");
  // cleanup
  T.vac.undo();
  return true;
});

check("setSVG/getSVG round trip", () => {
  const src = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    '<g data-name="Layer 1"><rect x="5" y="5" width="20" height="20" fill="red"/></g></svg>';
  T.vac.setSVG(src);
  assert(T.vac.artboardSize().w === 400 && T.vac.artboardSize().h === 300, "artboard from svg");
  const out = T.vac.getSVG();
  assert(out.indexOf("<svg") === 0, "starts with svg");
  assert(out.indexOf('width="400"') > 0, "width kept");
  assert(out.indexOf("<rect") > 0, "rect kept");
  assert(out.indexOf("vOverlay") < 0, "overlay leaked into export");
  assert(out.indexOf("vChecker") < 0, "checker leaked into export");
  return true;
});

check("vac:change emitted on commit", () => {
  let n = 0;
  T.bus.on("vac:change", () => { n++; });
  T.vac.commit();
  assert(n === 1, "no change event");
  return true;
});

check("artboard resize via API", () => {
  T.vac.setArtboard(1024, 768);
  const s = T.vac.artboardSize();
  assert(s.w === 1024 && s.h === 768, "size not applied");
  const ab = doc.getElementById("vArtboard");
  assert(ab.getAttribute("width") === "1024", "rect not resized");
  T.vac.setArtboard(800, 600);
  return true;
});

check("commands registered", () => {
  ["vac.newDoc", "vac.undo", "vac.redo", "vac.delete", "vac.selectAll",
   "vac.deselect", "vac.zoomFit", "vac.zoomIn", "vac.zoomOut"].forEach((c) => {
    assert(T.cmds[c], "missing command " + c);
  });
  return true;
});

check("keyboard tool shortcut switches tool", () => {
  T.vac.setTool("select");
  const ev = new window.KeyboardEvent("keydown", { key: "p", bubbles: true });
  doc.dispatchEvent(ev);
  assert(T.vac.tool().id === "pen", "P did not switch to pen, got " + T.vac.tool().id);
  const ev2 = new window.KeyboardEvent("keydown", { key: "v", bubbles: true });
  doc.dispatchEvent(ev2);
  assert(T.vac.tool().id === "select", "V did not switch back");
  return true;
});

/* ---------- NXT phase 1: per-app topbar ---------- */

check("topbar has studio badge, launcher, settings and files buttons", () => {
  T.vac.show();
  const lb = doc.getElementById("vLauncher");
  assert(lb, "no #vLauncher");
  assert(lb.classList.contains("icon-btn") && lb.classList.contains("waffle-btn"), "launcher missing icon-btn waffle-btn classes");
  assert(lb.querySelectorAll(".waffle-dots i").length === 9, "launcher does not have 9 dots");
  assert(lb.getAttribute("aria-label"), "launcher missing aria-label");
  const nm = doc.querySelector("#vTopbar .v-sname");
  assert(nm && nm.textContent === "VAC", "studio name missing");
  assert(doc.querySelector("#vTopbar .v-badge"), "studio badge missing");
  assert(doc.getElementById("vSettingsBtn"), "no #vSettingsBtn");
  assert(doc.getElementById("vFilesBtn"), "no #vFilesBtn");
  return true;
});

check("launcher button calls T.ecosystem.toggleLauncher", () => {
  window.TXT.ecosystem._calls.length = 0;
  doc.getElementById("vLauncher").click();
  assert(window.TXT.ecosystem._calls.indexOf("toggleLauncher") >= 0, "toggleLauncher not called");
  return true;
});

check("gear opens settings drawer with NXT about row", () => {
  const dr = doc.getElementById("vSettingsDrawer");
  assert(dr, "no settings drawer");
  assert(dr.classList.contains("hidden"), "drawer should start hidden");
  doc.getElementById("vSettingsBtn").click();
  assert(!dr.classList.contains("hidden"), "drawer did not open");
  assert(dr.textContent.indexOf("NXT OS") >= 0, "about row missing NXT OS");
  assert(dr.querySelector("#vSetNudge"), "no nudge input");
  assert(dr.querySelector("#vSetSnap"), "no snap toggle");
  assert(dr.querySelector("#vSetRulers"), "no rulers toggle");
  dr.querySelector('[data-x="close"]').click();
  assert(dr.classList.contains("hidden"), "drawer did not close");
  return true;
});

/* ---------- NXT phase 1: settings change real behavior ---------- */

check("settings persist and nudge step changes arrow-key behavior", () => {
  const d0 = T.vac.settings();
  assert(d0.nudgeStep === 1 && d0.snapToGrid === false && d0.showRulers === false,
    "bad defaults: " + JSON.stringify(d0));
  T.vac.setSettings({ nudgeStep: 5 });
  const s = window.TXT.store.get("vac", "settings");
  assert(s && s.nudgeStep === 5, "setting not persisted");
  assert(T.vac.settings().nudgeStep === 5, "getter not updated");

  const g = T.vac.activeLayer();
  const r = doc.createElementNS(SVGNS, "rect");
  r.setAttribute("x", "10"); r.setAttribute("y", "10");
  r.setAttribute("width", "20"); r.setAttribute("height", "20");
  g.appendChild(r);
  T.vac.select([r]);
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert(r.getAttribute("transform") === "matrix(1 0 0 1 5 0)",
    "nudge step not applied, got " + r.getAttribute("transform"));
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
  assert(r.getAttribute("transform") === "matrix(1 0 0 1 0 50)",
    "shift nudge should be 10x step, got " + r.getAttribute("transform"));
  // cleanup
  if (r.parentNode) { r.parentNode.removeChild(r); }
  T.vac.select([]);
  T.vac.setSettings({ nudgeStep: 1 });
  assert(T.vac.settings().nudgeStep === 1, "reset failed");
  return true;
});

check("snap to grid changes the pointer mapping", () => {
  T.vac.setSettings({ snapToGrid: true });
  const p = T.vac._x.snapPt({ x: 12, y: 27 });
  assert(p.x === 10 && p.y === 30, "snap wrong: " + JSON.stringify(p));
  assert(window.TXT.store.get("vac", "settings").snapToGrid === true, "snap not persisted");
  T.vac.setSettings({ snapToGrid: false });
  const p2 = T.vac._x.snapPt({ x: 12, y: 27 });
  assert(p2.x === 12 && p2.y === 27, "snap should be off");
  return true;
});

check("rulers toggle shows and hides ruler strips", () => {
  T.vac.setSettings({ showRulers: true });
  const w = doc.getElementById("vCanvasWrap");
  assert(w.classList.contains("v-show-rulers"), "ruler class not applied");
  assert(doc.getElementById("vRulerH") && doc.getElementById("vRulerV"), "ruler canvases missing");
  assert(window.TXT.store.get("vac", "settings").showRulers === true, "rulers not persisted");
  T.vac.setSettings({ showRulers: false });
  assert(!w.classList.contains("v-show-rulers"), "ruler class stuck on");
  return true;
});

/* ---------- NXT phase 1: files ---------- */

const asyncChecks = [];
function acheck(name, fn) { asyncChecks.push({ name: name, fn: fn }); }

acheck("files drawer opens and lists artwork", async () => {
  const dr = doc.getElementById("vFilesDrawer");
  assert(dr, "no files drawer");
  doc.getElementById("vFilesBtn").click();
  assert(!dr.classList.contains("hidden"), "files drawer did not open");
  assert(dr.querySelector("#vFileNew"), "no New button");
  dr.querySelector('[data-x="close"]').click();
  assert(dr.classList.contains("hidden"), "files drawer did not close");
  return true;
});

acheck("files CRUD round trip with open restoring artwork", async () => {
  T.vac.show();
  T.vac.files.create("Alpha");
  let list = T.vac.files.list();
  assert(list.length === 1, "create failed, len " + list.length);
  const idA = list[0].id;
  assert(list[0].name === "Alpha", "name wrong");
  assert(list[0].svg.indexOf("<svg") === 0, "svg not snapshotted");
  const stored = window.TXT.store.get("vac", "files");
  assert(stored && stored.length === 1 && stored[0].id === idA, "not persisted to store");

  // draw into the open file, then create a second file: Alpha must keep the rect
  const g = T.vac.activeLayer();
  const r = doc.createElementNS(SVGNS, "rect");
  r.setAttribute("x", "7"); r.setAttribute("y", "7");
  r.setAttribute("width", "30"); r.setAttribute("height", "30");
  r.setAttribute("fill", "#ff0000");
  g.appendChild(r);
  T.vac.files.create("Beta");
  list = T.vac.files.list();
  assert(list.length === 2, "second create failed");
  const idB = list[0].id;
  assert(list[0].name === "Beta", "newest should be first");

  // duplicate + rename
  const idC = T.vac.files.duplicate(idA);
  assert(idC && T.vac.files.list().length === 3, "duplicate failed");
  assert(T.vac.files.list()[0].name === "Alpha copy", "duplicate name wrong");
  assert(T.vac.files.rename(idC, "Gamma") === true, "rename failed");
  assert(T.vac.files.list()[0].name === "Gamma", "rename not applied");
  assert(T.vac.files.rename(idC, "   ") === false, "blank rename should fail");

  // wipe the canvas, then open Alpha: the red rect must come back
  T.vac.newDoc();
  assert(T.vac.files.open(idA) === true, "open failed");
  const out = T.vac.getSVG();
  assert(out.indexOf("#ff0000") >= 0, "open did not restore artwork");
  assert(doc.getElementById("vDocName").value === "Alpha", "doc name not synced");
  assert(T.vac.files.currentId() === idA, "currentId wrong");

  // delete with modal confirm (stub resolves truthy)
  const ok = await T.vac.files.remove(idB);
  assert(ok === true, "remove failed");
  assert(T.vac.files.list().length === 2, "remove did not delete");
  assert(window.__modalOpts && window.__modalOpts.title === "Delete artwork", "delete did not confirm via modal");

  // drawer reflects the list
  doc.getElementById("vFilesBtn").click();
  const rows = doc.querySelectorAll("#vFilesList .v-file-row");
  assert(rows.length === 2, "drawer rows " + rows.length);
  doc.getElementById("vFilesDrawer").querySelector('[data-x="close"]').click();
  return true;
});

acheck("New button creates a file through the modal", async () => {
  const before = T.vac.files.list().length;
  doc.getElementById("vFilesBtn").click();
  doc.getElementById("vFileNew").click();
  await new Promise((res) => setTimeout(res, 30));
  assert(T.vac.files.list().length === before + 1, "New button did not create");
  assert(window.__modalOpts && window.__modalOpts.title === "New artwork", "New did not prompt via modal");
  doc.getElementById("vFilesDrawer").querySelector('[data-x="close"]').click();
  return true;
});

/* ---------- NXT UI polish: mobile chrome ---------- */

check("tool strip More button expands and collapses the overflow", () => {
  T.vac.show();
  const tools = doc.getElementById("vTools");
  const more = doc.getElementById("vToolsMore");
  assert(more, "no #vToolsMore");
  assert(more.classList.contains("vtool") && more.classList.contains("v-more"), "more button classes wrong");
  assert(more.getAttribute("aria-expanded") === "false", "aria-expanded should start false");
  assert(!tools.classList.contains("show-all"), "show-all should start off");
  more.click();
  assert(tools.classList.contains("show-all"), "show-all not added");
  assert(more.getAttribute("aria-expanded") === "true", "aria-expanded not true after open");
  // switching tools collapses the overflow again (renderDock rebuilds the
  // dock, so re-query the button: the old node is detached)
  T.vac.setTool("pen");
  assert(!tools.classList.contains("show-all"), "show-all stuck after setTool");
  const more2 = doc.getElementById("vToolsMore");
  assert(more2.getAttribute("aria-expanded") === "false", "aria-expanded stuck after setTool");
  T.vac.setTool("select");
  return true;
});

check("Properties button toggles the mobile sheet", () => {
  const btn = doc.getElementById("vPropsBtn");
  const panels = doc.getElementById("vPanels");
  assert(btn && panels, "missing props button or panels");
  assert(btn.getAttribute("aria-label"), "props button missing aria-label");
  assert(!panels.classList.contains("open"), "sheet should start closed");
  btn.click();
  assert(panels.classList.contains("open"), "sheet did not open");
  assert(btn.getAttribute("aria-expanded") === "true", "aria-expanded not set on open");
  btn.click();
  assert(!panels.classList.contains("open"), "sheet did not close");
  assert(btn.getAttribute("aria-expanded") === "false", "aria-expanded not reset on close");
  return true;
});

check("overflow menu opens and the Word CTA sends", () => {
  let sent = 0;
  const orig = T.vacPanels.sendToWord;
  T.vacPanels.sendToWord = function () { sent++; };
  try {
    const btn = doc.getElementById("vOverflowBtn");
    const menu = doc.getElementById("vOverflow");
    assert(btn && menu, "missing overflow button/menu");
    assert(menu.classList.contains("hidden"), "menu should start hidden");
    btn.click();
    assert(!menu.classList.contains("hidden"), "menu did not open");
    assert(btn.getAttribute("aria-expanded") === "true", "aria-expanded not set");
    assert(doc.getElementById("vWordCta"), "no Word CTA in the menu");
    doc.getElementById("vWordCta").click();
    assert(sent === 1, "sendToWord not called, got " + sent);
    assert(menu.classList.contains("hidden"), "menu did not close after the action");
  } finally {
    T.vacPanels.sendToWord = orig;
  }
  return true;
});

check("Escape closes the overflow menu", () => {
  const btn = doc.getElementById("vOverflowBtn");
  const menu = doc.getElementById("vOverflow");
  btn.click();
  assert(!menu.classList.contains("hidden"), "menu did not open");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(menu.classList.contains("hidden"), "Escape did not close the menu");
  return true;
});

check("tool options relocation bar exists in the main column", () => {
  const bar = doc.getElementById("vToolOptsBar");
  assert(bar, "no #vToolOptsBar");
  assert(bar.parentNode && bar.parentNode.id === "vMain", "bar not inside #vMain");
  // desktop (no matchMedia in jsdom): options stay in the topbar
  assert(doc.getElementById("vToolOptions").parentNode.id === "vTopbar", "options moved unexpectedly");
  return true;
});

check("no duplicate element IDs in the vector view", () => {
  const seen = {}, dupes = [];
  Array.prototype.forEach.call(doc.querySelectorAll("[id]"), (n) => {
    if (seen[n.id]) { dupes.push(n.id); }
    seen[n.id] = 1;
  });
  assert(dupes.length === 0, "duplicate ids: " + dupes.join(","));
  return true;
});

acheck("panels build into the mobile sheet with chrome and all sections", async () => {
  await new Promise((res) => setTimeout(res, 250));
  const panels = doc.getElementById("vPanels");
  assert(panels.classList.contains("nxt-sheet"), "#vPanels missing nxt-sheet class");
  assert(panels.querySelector(".v-sheet-chrome"), "no sheet chrome");
  assert(panels.querySelector(".nxt-sheet-handle"), "no sheet handle");
  assert(panels.querySelector("#vSheetClose"), "no sheet close button");
  ["transform", "pathfinder", "align", "stroke", "gradient", "layers"].forEach((id) => {
    assert(panels.querySelector('.vp-panel[data-p="' + id + '"]'), "missing panel " + id);
  });
  assert(panels.querySelectorAll(".nxt-skeleton").length === 0, "skeletons were not removed");
  return true;
});

acheck("sheet close button closes the properties sheet", async () => {
  const btn = doc.getElementById("vPropsBtn");
  const panels = doc.getElementById("vPanels");
  btn.click();
  assert(panels.classList.contains("open"), "sheet did not open");
  doc.getElementById("vSheetClose").click();
  assert(!panels.classList.contains("open"), "sheet close button did not close");
  assert(btn.getAttribute("aria-expanded") === "false", "aria-expanded not reset");
  return true;
});

(async () => {
  for (const t of asyncChecks) {
    try {
      const r = await t.fn();
      if (r === false) { throw new Error("returned false"); }
      console.log("  PASS " + t.name);
    } catch (e) {
      failures.push(t.name);
      console.log("  FAIL " + t.name + " :: " + (e && e.message));
    }
  }
  console.log(failures.length ? "\n" + failures.length + " FAILURES: " + failures.join(", ") : "\nALL VAC TESTS PASSED");
  process.exit(failures.length ? 1 : 0);
})();
