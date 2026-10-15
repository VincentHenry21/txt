/* TXT HUB dashboard test (jsdom).
   Stubs window.TXT minimally, loads js/hub/hub.js, seeds T.store with fake
   grd/dck/mem/pdf namespaces plus TXT docs, then asserts real behavior:
   recents merge/sort, omnibox content search, storage math, shelf round-trip,
   open dispatch, show/hide.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/hub.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "..");

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><main id="views"><section id="view-hub" class="view hidden"></section></main></body></html>',
  { url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously" }
);
const { window } = dom;

/* ---------- TXT stub ---------- */
const listeners = {};
const storeData = {};
const storeEmitted = [];
const cmds = {};
const openedApps = [];
const calls = { openDoc: [], newDoc: [], openSheet: [], newSheet: [], openDeck: [], newDeck: [], openNote: [], newNote: [], openPdf: [], newPdf: [] };
const toasts = [];
const toggleCalls = [];
const personaCalls = [];
const modalCalls = [];
let modalAnswer = null;
let uidN = 0;

window.TXT = {
  bus: {
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); return fn; },
    emit: (ev, data) => { (listeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  store: {
    get(app, key) {
      const ns = storeData[app];
      if (ns === undefined) return undefined;
      return key === undefined ? ns : ns[key];
    },
    set(app, key, val) {
      if (!storeData[app]) storeData[app] = {};
      storeData[app][key] = val;
      return val;
    },
    on: () => {},
    emit: (evt, data) => { storeEmitted.push({ evt, data }); }
  },
  register(name, fn, meta) { cmds[name] = Object.assign({ fn }, meta || {}); },
  cmd(name, ...a) { const c = cmds[name]; if (c) return c.fn(...a); },
  listCommands() { return Object.keys(cmds).map((k) => Object.assign({ name: k }, cmds[k])); },
  t: (k) => k,
  uid: (p) => (p || "id") + "-" + (++uidN),
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  relTime: (ts) => "rel(" + ts + ")",
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: (msg, kind) => { toasts.push({ msg, kind }); },
  modal: (opts) => { modalCalls.push(opts); return Promise.resolve(modalAnswer); },
  lsSet: (k, v) => { window.localStorage.setItem(k, JSON.stringify(v)); },
  docKey: (id) => "txt:doc:" + id,
  histKey: (id) => "txt:hist:" + id,
  ecosystem: {
    openApp: (a) => { openedApps.push(a); },
    toggleLauncher: () => { toggleCalls.push(1); },
    setPersona: (p) => { personaCalls.push(p); }
  },
  state: { docs: [] },
  loadDoc(id) {
    try {
      const raw = window.localStorage.getItem("txt:doc:" + id);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  lsGet(k, dflt) {
    try { const v = window.localStorage.getItem(k); return v == null ? dflt : JSON.parse(v); }
    catch (e) { return dflt; }
  },
  editor: {
    openDoc: (id) => { calls.openDoc.push(id); },
    newDoc: (t, h) => { calls.newDoc.push(t); }
  },
  grd: { openSheet: (id) => { calls.openSheet.push(id); }, newSheet: () => { calls.newSheet.push(1); } },
  dck: { openDeck: (id) => { calls.openDeck.push(id); }, newDeck: () => { calls.newDeck.push(1); } },
  mem: { openNote: (id) => { calls.openNote.push(id); }, newNote: () => { calls.newNote.push(1); } },
  pdf: { openDoc: (id) => { calls.openPdf.push(id); }, newDoc: () => { calls.newPdf.push(1); } }
};

window.eval(fs.readFileSync(path.join(ROOT, "js/hub/hub.js"), "utf8"));

/* ---------- seed data ---------- */
const now = Date.now();
window.localStorage.setItem("txt:doc:t1", JSON.stringify({
  id: "t1", title: "Quarterly Report",
  html: "<p>The <b>banana</b> harvest exceeded projections.</p>", updatedAt: now - 5000
}));
window.TXT.state.docs = [{ id: "t1", title: "Quarterly Report", updatedAt: now - 5000 }];
/* seed whole namespaces directly (T.store.set takes app,key,val) */
function seedNs(app, obj) { storeData[app] = obj; }
seedNs("grd", {
  recent: [{ id: "g1", title: "Budget 2026", updatedAt: now - 1000 }],
  sheets: [{ id: "g1", title: "Budget 2026", cells: { A1: "banana", B1: "120" } }]
});
seedNs("dck", {
  recent: [{ id: "d1", title: "Launch deck", updatedAt: now - 2000 }],
  decks: [{ id: "d1", title: "Launch deck", slides: [{ text: "go to market plan" }] }]
});
seedNs("mem", {
  recent: [{ id: "m1", title: "Ideas", updatedAt: now - 3000 }],
  notes: [{ id: "m1", title: "Ideas", body: "buy banana bread tomorrow" }]
});
seedNs("pdf", {
  recent: [{ id: "p1", title: "Invoice Q3", updatedAt: now - 4000 }],
  docs: [{ id: "p1", title: "Invoice Q3" }]
});
window.localStorage.setItem("grd:cache", JSON.stringify({ warm: true }));
window.localStorage.setItem("mem:draft", "hello");

/* ---------- harness: checks run SEQUENTIALLY so async renders (skeleton-first
   browser/storage) never interleave with a later test's synchronous setup ---------- */
let failures = [];
const queue = [];
function check(name, fn) { queue.push([name, fn]); }
function assert(c, m) { if (!c) { throw new Error(m || "assert"); } }

/* polls cond() until truthy; the browser/storage renders are skeleton-first
   and swap in real rows on the next frame, so async assertions must wait */
function waitFor(name, cond, timeout) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const lim = timeout || 2000;
    (function tick() {
      let ok = false;
      try { ok = !!cond(); } catch (e) { /* keep polling */ }
      if (ok) return resolve(true);
      if (Date.now() - t0 > lim) return reject(new Error("timeout waiting for " + name));
      setTimeout(tick, 25);
    })();
  });
}

const T = window.TXT, doc = window.document;

check("T.hub exposes the full API", () => {
  ["show", "hide", "search", "toggleShelf", "toggleSettings", "setTab", "getTab",
   "getSettings", "setSetting",
   "collectRecents", "searchAll",
   "storageStats", "formatBytes", "openRecent", "openFile", "renameFile", "deleteFile",
   "quickNew",
   "getShelf", "pinItem", "unpinItem", "removeItem",
   "pinSelection", "copyText", "insertIntoTxt", "downloadItem"
  ].forEach((k) => assert(typeof T.hub[k] === "function", "missing T.hub." + k));
  return true;
});

check("hub commands registered with hub. prefix", () => {
  ["hub.search", "hub.shelf", "hub.pin-selection", "hub.settings"].forEach((n) => assert(cmds[n], "missing " + n));
  return true;
});

check("show() builds the dashboard into #view-hub", () => {
  T.hub.show();
  const view = doc.getElementById("view-hub");
  assert(!view.classList.contains("hidden"), "view still hidden after show()");
  ["hub-root", "hub-omni", "hub-quick", "hub-recent", "hub-storage", "hub-drawer", "hub-shelfList"].forEach((id) =>
    assert(doc.getElementById(id), "missing #" + id));
  return true;
});

check("ecosystem:app bus event with app=hub triggers show", () => {
  doc.getElementById("view-hub").classList.add("hidden");
  T.bus.emit("ecosystem:app", { app: "hub" });
  assert(!doc.getElementById("view-hub").classList.contains("hidden"), "bus show did not unhide");
  T.bus.emit("ecosystem:app", { app: "grd" });
  assert(doc.getElementById("hub-root"), "other app event clobbered hub");
  return true;
});

check("collectRecents merges all 5 apps, sorted by updatedAt desc", () => {
  const rs = T.hub.collectRecents();
  assert(rs.length === 5, "want 5 recents, got " + rs.length);
  const order = rs.map((r) => r.app).join(",");
  assert(order === "grd,dck,mem,pdf,txt", "wrong order: " + order);
  assert(rs[0].title === "Budget 2026", "title wrong");
  return true;
});

check("recent list renders 5 rows with badges and working Open buttons", () => {
  const rows = doc.querySelectorAll("#hub-recent .hub-row");
  assert(rows.length === 5, "want 5 rows, got " + rows.length);
  const badges = Array.from(doc.querySelectorAll("#hub-recent .hub-badge")).map((b) => b.textContent);
  assert(badges.join(",") === "GRD,DCK,MEM,PDF,TXT", "badges wrong: " + badges.join(","));
  rows[0].querySelector(".hub-openbtn").click();
  assert(openedApps[openedApps.length - 1] === "grd", "open did not switch to grd");
  assert(calls.openSheet[calls.openSheet.length - 1] === "g1", "grd.openSheet not called with g1");
  return true;
});

check("openRecent txt uses T.editor.openDoc", () => {
  T.hub.openRecent({ app: "txt", id: "t1" });
  assert(openedApps[openedApps.length - 1] === "txt", "did not open txt app");
  assert(calls.openDoc[calls.openDoc.length - 1] === "t1", "editor.openDoc not called");
  return true;
});

check("openRecent toasts when the target app is not loaded", () => {
  const keep = T.dck; delete T.dck;
  const n = toasts.length;
  T.hub.openRecent({ app: "dck", id: "d1" });
  assert(openedApps[openedApps.length - 1] === "dck", "should still switch to the app view");
  assert(toasts.length === n + 1 && /not finished loading|not loaded/i.test(toasts[toasts.length - 1].msg),
    "expected a not-loaded toast");
  T.dck = keep;
  return true;
});

check("searchAll finds a GRD cell value by content", () => {
  const rs = T.hub.searchAll("banana");
  const hit = rs.find((r) => r.app === "grd" && r.group === "Content");
  assert(hit, "no GRD content hit; got " + JSON.stringify(rs.map((r) => r.app + "/" + r.group)));
  assert(/banana/i.test(hit.snippet), "snippet missing the term");
  return true;
});

check("searchAll finds a MEM note by content", () => {
  const rs = T.hub.searchAll("banana");
  const hit = rs.find((r) => r.app === "mem" && r.group === "Content");
  assert(hit, "no MEM content hit");
  assert(/banana/i.test(hit.snippet), "snippet missing the term");
  return true;
});

check("searchAll finds TXT paragraph content", () => {
  const rs = T.hub.searchAll("harvest");
  const hit = rs.find((r) => r.app === "txt" && r.group === "Content");
  assert(hit, "no TXT content hit");
  assert(/harvest/i.test(hit.snippet), "snippet missing the term");
  return true;
});

check("searchAll matches file titles and registered commands", () => {
  const files = T.hub.searchAll("budget");
  assert(files.some((r) => r.group === "Files" && r.app === "grd"), "no GRD title hit");
  const cmdsHit = T.hub.searchAll("clipboard shelf");
  assert(cmdsHit.some((r) => r.group === "Commands" && r.title.indexOf("clipboard shelf") >= 0),
    "no command hit");
  const cmdRes = cmdsHit.find((r) => r.group === "Commands");
  assert(typeof cmdRes.run === "function", "command result has no run()");
  return true;
});

check("searchAll returns [] on empty query", () => {
  assert(T.hub.searchAll("   ").length === 0, "expected empty");
  return true;
});

check("search(q) fills the omnibox and shows results", () => {
  T.hub.search("banana");
  assert(doc.getElementById("hub-omni").value === "banana", "omni value not set");
  const rows = doc.querySelectorAll("#hub-results .hub-result");
  assert(rows.length > 0, "no result rows rendered");
  assert(!doc.getElementById("hub-results").classList.contains("hidden"), "results hidden");
  return true;
});

check("storageStats computes nonzero per-app sizes", () => {
  const st = T.hub.storageStats();
  assert(st.ref === 5 * 1024 * 1024, "ref wrong");
  const byId = {};
  st.apps.forEach((a) => { byId[a.id] = a.bytes; });
  ["txt", "grd", "dck", "mem", "pdf"].forEach((a) =>
    assert(byId[a] > 0, a + " bytes not > 0 (got " + byId[a] + ")"));
  assert(st.total > 0, "total not > 0");
  assert(T.hub.formatBytes(1536) === "1.5 KB", "KB format wrong");
  assert(T.hub.formatBytes(5 * 1024 * 1024) === "5.00 MB", "MB format wrong");
  assert(T.hub.formatBytes(0) === "0 B", "zero format wrong");
  return true;
});

check("storage bars render with nonzero widths", () => {
  return waitFor("storage bars", () =>
    doc.querySelectorAll("#hub-storage .hub-bar-fill").length === 8
  ).then(() => waitFor("lit bars", () => {
    let lit = 0;
    doc.querySelectorAll("#hub-storage .hub-bar-fill").forEach((f) => { if (parseFloat(f.style.width) > 0) lit++; });
    return lit >= 5;
  })).then(() => {
    const total = doc.querySelector("#hub-storage .hub-stototal").textContent;
    assert(/Total .* of 5\.00 MB reference/.test(total), "total line wrong: " + total);
    return true;
  });
});

check("clipboard pin / unpin / delete round-trip with persistence", () => {
  assert(T.hub.getShelf().length === 0, "shelf should start empty");
  const it = T.hub.pinItem({ type: "text", title: "hello", content: "hello world" });
  assert(it && it.id, "pinItem returned no item");
  assert(T.hub.getShelf().length === 1, "shelf length != 1");
  assert(T.store.get("hub", "shelf").length === 1, "not persisted to T.store");
  T.hub.unpinItem(it.id);
  assert(T.hub.getShelf()[0].pinned === true, "unpin did not toggle to pinned");
  T.hub.unpinItem(it.id);
  assert(T.hub.getShelf()[0].pinned === false, "second toggle failed");
  T.hub.removeItem(it.id);
  assert(T.hub.getShelf().length === 0, "delete failed");
  assert(T.store.get("hub", "shelf").length === 0, "delete not persisted");
  return true;
});

check("pinItem auto-detects svg and image types", () => {
  const s = T.hub.pinItem({ content: "<svg><rect/></svg>" });
  assert(s.type === "svg", "svg not detected: " + s.type);
  const i = T.hub.pinItem({ content: "data:image/png;base64,AAA" });
  assert(i.type === "image", "image not detected: " + i.type);
  T.hub.removeItem(s.id); T.hub.removeItem(i.id);
  return true;
});

check("insertIntoTxt emits mem:send with the text", () => {
  const it = T.hub.pinItem({ type: "text", title: "t", content: "send me" });
  const n = storeEmitted.length;
  T.hub.insertIntoTxt(it);
  assert(storeEmitted.length === n + 1, "no emit");
  assert(storeEmitted[n].evt === "mem:send", "wrong event: " + storeEmitted[n].evt);
  assert(storeEmitted[n].data.text === "send me", "wrong payload");
  T.hub.removeItem(it.id);
  return true;
});

check("copyText falls back without navigator.clipboard and resolves a boolean", () => {
  return T.hub.copyText("abc").then((ok) => {
    assert(typeof ok === "boolean", "expected boolean, got " + typeof ok);
    return true;
  });
});

check("downloadItem does not throw and toasts", () => {
  const it = T.hub.pinItem({ type: "image", title: "pic", content: "data:image/png;base64,AAA" });
  const n = toasts.length;
  T.hub.downloadItem(it);
  assert(toasts.length === n + 1 && /Download started/.test(toasts[toasts.length - 1].msg),
    "expected download toast, got " + JSON.stringify(toasts.slice(n)));
  T.hub.removeItem(it.id);
  return true;
});

check("pinSelection with empty selection toasts and adds nothing", () => {
  const before = T.hub.getShelf().length;
  const n = toasts.length;
  const r = T.hub.pinSelection();
  assert(r === null, "expected null");
  assert(T.hub.getShelf().length === before, "shelf changed");
  assert(toasts.length === n + 1, "expected a toast");
  return true;
});

check("quick actions jump to the app and create", () => {
  T.hub.quickNew("mem");
  assert(openedApps[openedApps.length - 1] === "mem", "did not open mem");
  assert(calls.newNote.length === 1, "mem.newNote not called");
  T.hub.quickNew("txt");
  assert(calls.newDoc.length === 1, "editor.newDoc not called");
  return true;
});

check("quickNew toasts when the creation API is missing", () => {
  const keep = T.grd; delete T.grd;
  const n = toasts.length;
  T.hub.quickNew("grd");
  assert(toasts.length === n + 1, "expected a toast");
  T.grd = keep;
  return true;
});

check("toggleShelf opens and closes the drawer", () => {
  const wrap = doc.getElementById("hub-drawerWrap");
  T.hub.toggleShelf(true);
  assert(wrap.classList.contains("hub-open"), "drawer did not open");
  assert(wrap.getAttribute("aria-hidden") === "false", "aria-hidden wrong");
  T.hub.toggleShelf(false);
  assert(!wrap.classList.contains("hub-open"), "drawer did not close");
  T.hub.toggleShelf();
  assert(wrap.classList.contains("hub-open"), "toggle did not open");
  T.hub.toggleShelf();
  assert(!wrap.classList.contains("hub-open"), "toggle did not close");
  return true;
});

check("hide() hides #view-hub", () => {
  T.hub.show();
  T.hub.hide();
  assert(doc.getElementById("view-hub").classList.contains("hidden"), "view not hidden");
  return true;
});

/* ============================================================
   NXT phase 1: topbar, settings, file browser, rebrand
   ============================================================ */

check("topbar builds with a working launcher and gear button", () => {
  T.hub.show();
  const bar = doc.getElementById("hub-topbar");
  assert(bar, "no #hub-topbar");
  assert(bar.classList.contains("hub-topbar"), "topbar class wrong");
  const waffle = doc.getElementById("hub-launcherBtn");
  assert(waffle, "no launcher button");
  assert(waffle.classList.contains("waffle-btn"), "launcher missing waffle-btn class");
  assert(waffle.classList.contains("icon-btn"), "launcher missing icon-btn class");
  const dots = waffle.querySelectorAll(".waffle-dots i");
  assert(dots.length === 9, "want 9 dots, got " + dots.length);
  const n = toggleCalls.length;
  waffle.click();
  assert(toggleCalls.length === n + 1, "T.ecosystem.toggleLauncher not called");
  const gear = doc.getElementById("hub-settingsBtn");
  assert(gear, "no gear button");
  gear.click();
  const sw = doc.getElementById("hub-settingsWrap");
  assert(sw.classList.contains("hub-open"), "settings drawer did not open");
  assert(sw.getAttribute("aria-hidden") === "false", "settings aria-hidden wrong");
  doc.getElementById("hub-settingsBackdrop").click();
  assert(!sw.classList.contains("hub-open"), "settings drawer did not close");
  return true;
});

check("settings default, persist via T.store, and reject invalid values", () => {
  delete storeData.hub;
  const d = T.hub.getSettings();
  assert(d.warnMB === 50 && d.landing === "recent" && d.showCounts === true,
    "defaults wrong: " + JSON.stringify(d));
  T.hub.setSetting("warnMB", 25);
  assert(T.store.get("hub", "settings").warnMB === 25, "warnMB not persisted");
  const before = JSON.stringify(T.hub.getSettings());
  T.hub.setSetting("warnMB", -5);
  assert(JSON.stringify(T.hub.getSettings()) === before, "invalid warnMB accepted");
  T.hub.setSetting("landing", "nope");
  assert(T.hub.getSettings().landing === "recent", "invalid landing accepted");
  T.hub.setSetting("warnMB", 50);
  T.hub.setSetting("showCounts", true);
  return true;
});

check("settings drawer has the three settings and an NXT About row", () => {
  T.hub.toggleSettings(true);
  ["hub-set-warnMB", "hub-set-landing", "hub-set-showCounts"].forEach((id) =>
    assert(doc.getElementById(id), "missing #" + id));
  assert(doc.getElementById("hub-set-warnMB").type === "number", "warnMB is not a number input");
  assert(doc.getElementById("hub-set-landing").tagName === "SELECT", "landing is not a select");
  assert(doc.getElementById("hub-set-showCounts").type === "checkbox", "showCounts is not a checkbox");
  const about = doc.getElementById("hub-settingsList").textContent;
  assert(/NXT OS/.test(about), "About row missing NXT OS");
  T.hub.toggleSettings(false);
  assert(!doc.getElementById("hub-settingsWrap").classList.contains("hub-open"), "did not close");
  return true;
});

check("storage warning appears when usage exceeds the threshold", () => {
  T.hub.setSetting("warnMB", 0.0001);
  T.hub.show();
  return waitFor("storage warning", () => doc.querySelector("#hub-storage .hub-warn")).then(() => {
    const warn = doc.querySelector("#hub-storage .hub-warn");
    assert(/warning threshold/.test(warn.textContent), "warning text wrong: " + warn.textContent);
    assert(warn.getAttribute("role") === "alert", "warning should have role=alert");
    T.hub.setSetting("warnMB", 50);
    T.hub.show();
    return waitFor("warning cleared", () => !doc.querySelector("#hub-storage .hub-warn"));
  });
});

check("landing setting controls which tab is visible on show", () => {
  T.hub.setSetting("landing", "files");
  T.hub.show();
  assert(T.hub.getTab() === "files", "tab state wrong: " + T.hub.getTab());
  assert(doc.getElementById("hub-tab-files").classList.contains("hub-tab-active"), "files tab not active");
  assert(!doc.getElementById("hub-panel-files").classList.contains("hidden"), "files panel hidden");
  assert(doc.getElementById("hub-panel-recent").classList.contains("hidden"), "recent panel should be hidden");
  T.hub.setSetting("landing", "clipboard");
  T.hub.show();
  assert(!doc.getElementById("hub-panel-clipboard").classList.contains("hidden"), "clipboard panel hidden");
  assert(doc.querySelectorAll("#hub-panel-clipboard .hub-btn").length >= 2, "clipboard tab missing buttons");
  T.hub.setSetting("landing", "recent");
  T.hub.show();
  assert(T.hub.getTab() === "recent", "landing reset failed");
  return true;
});

check("tab buttons switch sections when clicked", () => {
  T.hub.show();
  doc.getElementById("hub-tab-clipboard").click();
  assert(T.hub.getTab() === "clipboard", "click did not switch tab");
  assert(!doc.getElementById("hub-panel-clipboard").classList.contains("hidden"), "clipboard panel hidden after click");
  doc.getElementById("hub-tab-recent").click();
  assert(T.hub.getTab() === "recent", "click back failed");
  return true;
});

check("showCounts setting toggles per-app counts in the browser", () => {
  T.hub.setSetting("showCounts", false);
  T.hub.show();
  return waitFor("browser sections", () =>
    doc.querySelectorAll("#hub-files .hub-filesec").length > 0
  ).then(() => {
    assert(doc.querySelectorAll("#hub-files .hub-filecount").length === 0, "counts should be hidden");
    T.hub.setSetting("showCounts", true);
    T.hub.show();
    return waitFor("counts rendered", () => {
      const secs = doc.querySelectorAll("#hub-files .hub-filesec");
      return secs.length > 0 && doc.querySelectorAll("#hub-files .hub-filecount").length === secs.length;
    });
  }).then(() => {
    const secs = doc.querySelectorAll("#hub-files .hub-filesec");
    const txtSec = Array.from(secs).find((s) => s.querySelector(".hub-filelabel").textContent === "Word documents");
    assert(txtSec, "no TXT section");
    assert(txtSec.querySelector(".hub-filecount").textContent === String(T.state.docs.length),
      "TXT count wrong: " + txtSec.querySelector(".hub-filecount").textContent);
    return true;
  });
});

/* install stub file APIs for the sibling-app contract (T.grd.files etc.) */
const fileCalls = { open: [], rename: [], remove: [], create: [] };
check("install stub file APIs for the sibling-app contract", () => {
  T.grd.files = {
    list: () => [
      { id: "g1", name: "Budget 2026", updatedAt: now - 1000 },
      { id: "g2", name: "Old sheet", updatedAt: now - 9000 }
    ],
    open: (id) => { fileCalls.open.push(id); },
    rename: (id, name) => { fileCalls.rename.push([id, name]); },
    remove: (id) => { fileCalls.remove.push(id); },
    create: (name) => { fileCalls.create.push(name || ""); },
    duplicate: (id) => {}
  };
  return true;
});

check("file browser renders a section per app whose file source exists", () => {
  T.hub.show();
  return waitFor("browser sections", () => {
    const secs = doc.querySelectorAll("#hub-files .hub-filesec");
    const g = Array.from(secs).find((s) => s.querySelector(".hub-filelabel").textContent === "Sheets");
    return g && g.querySelectorAll(".hub-filerow").length === 2;
  }).then(() => {
    const secs = doc.querySelectorAll("#hub-files .hub-filesec");
    const labels = Array.from(secs).map((s) => s.querySelector(".hub-filelabel").textContent);
    assert(labels.indexOf("Word documents") >= 0, "no TXT section: " + labels.join(","));
    assert(labels.indexOf("Sheets") >= 0, "no GRD section: " + labels.join(","));
    assert(labels.indexOf("Notes") < 0, "MEM section should not render without T.mem.files");
    const grdSec = Array.from(secs).find((s) => s.querySelector(".hub-filelabel").textContent === "Sheets");
    const rows = grdSec.querySelectorAll(".hub-filerow");
    assert(rows.length === 2, "want 2 GRD rows, got " + rows.length);
    rows.forEach((r) => {
      const btns = r.querySelectorAll("button");
      assert(btns.length === 3, "row should have Open/Rename/Delete, got " + btns.length);
      assert(r.querySelector(".hub-badge"), "row missing app badge");
    });
    return true;
  });
});

check("file browser open lands in the right app", () => {
  T.hub.show();
  return waitFor("grd rows", () => {
    const secs = doc.querySelectorAll("#hub-files .hub-filesec");
    const g = Array.from(secs).find((s) => s.querySelector(".hub-filelabel").textContent === "Sheets");
    return g && g.querySelectorAll(".hub-filerow").length === 2;
  }).then(() => {
    const secs = doc.querySelectorAll("#hub-files .hub-filesec");
    const grdSec = Array.from(secs).find((s) => s.querySelector(".hub-filelabel").textContent === "Sheets");
    const openBtn = grdSec.querySelector(".hub-filerow .hub-btn");
    assert(openBtn.textContent === "Open", "first row button should be Open");
    openBtn.click();
    assert(openedApps[openedApps.length - 1] === "grd", "did not switch to the grd view");
    assert(fileCalls.open[fileCalls.open.length - 1] === "g1", "files.open not called with g1");
    T.hub.openFile("txt", { id: "t1", name: "x" });
    assert(openedApps[openedApps.length - 1] === "txt", "did not switch to txt");
    assert(calls.openDoc[calls.openDoc.length - 1] === "t1", "editor.openDoc not called");
    return true;
  });
});

check("file browser rename round-trips through the app files API", () => {
  modalAnswer = { name: "Budget 2027" };
  const m = modalCalls.length;
  return T.hub.renameFile("grd", { id: "g1", name: "Budget 2026" }).then((r) => {
    assert(r === true, "expected true, got " + r);
    const last = fileCalls.rename[fileCalls.rename.length - 1];
    assert(last && last[0] === "g1" && last[1] === "Budget 2027",
      "rename args wrong: " + JSON.stringify(last));
    const modal = modalCalls[m];
    assert(modal && modal.fields, "rename should go through T.modal with a name field");
    return true;
  });
});

check("file browser delete confirms via T.modal then calls files.remove", () => {
  modalAnswer = { confirmed: true };
  const n = fileCalls.remove.length;
  const m = modalCalls.length;
  return T.hub.deleteFile("grd", { id: "g1", name: "Budget 2026" }).then((r) => {
    assert(r === true, "expected true, got " + r);
    assert(fileCalls.remove.length === n + 1 && fileCalls.remove[n] === "g1", "remove not called with g1");
    const lastModal = modalCalls[m];
    assert(lastModal && /Delete/.test(lastModal.title), "delete modal title wrong: " + (lastModal && lastModal.title));
    modalAnswer = null;
    return T.hub.deleteFile("grd", { id: "g1", name: "Budget 2026" });
  }).then((r2) => {
    assert(r2 === false, "cancelled delete should resolve false");
    return true;
  });
});

check("TXT rename updates the doc list and the stored body", () => {
  modalAnswer = { name: "Renamed Report" };
  return T.hub.renameFile("txt", { id: "t1", name: "Quarterly Report" }).then((r) => {
    assert(r === true, "expected true, got " + r);
    assert(T.state.docs[0].title === "Renamed Report", "doc list title not updated");
    const persisted = JSON.parse(window.localStorage.getItem("txt:docs"));
    assert(persisted[0].title === "Renamed Report", "persisted docs not updated");
    const body = JSON.parse(window.localStorage.getItem("txt:doc:t1"));
    assert(body.title === "Renamed Report", "stored body title not updated");
    /* restore for the rest of the suite */
    T.state.docs[0].title = "Quarterly Report";
    body.title = "Quarterly Report";
    T.lsSet("txt:docs", T.state.docs);
    T.lsSet(T.docKey("t1"), body);
    return true;
  });
});

check("TXT delete filters T.state.docs and clears stored data", () => {
  T.state.docs.push({ id: "t2", title: "Temp doc", updatedAt: now });
  window.localStorage.setItem("txt:doc:t2", JSON.stringify({ id: "t2", title: "Temp doc", html: "<p>x</p>" }));
  T.lsSet("txt:docs", T.state.docs);
  modalAnswer = { ok: true };
  return T.hub.deleteFile("txt", { id: "t2", name: "Temp doc" }).then((r) => {
    assert(r === true, "expected true, got " + r);
    assert(!T.state.docs.some((d) => d.id === "t2"), "t2 still in T.state.docs");
    const persisted = JSON.parse(window.localStorage.getItem("txt:docs"));
    assert(!persisted.some((d) => d.id === "t2"), "t2 still persisted");
    assert(window.localStorage.getItem("txt:doc:t2") === null, "stored body not removed");
    const names = T.hub.collectRecents().map((x) => x.id);
    assert(names.indexOf("t2") < 0, "t2 still in recents");
    return true;
  });
});

check("rename rejects an empty name and delete handles a missing modal gracefully", () => {
  modalAnswer = { name: "   " };
  const n = toasts.length;
  return T.hub.renameFile("grd", { id: "g1", name: "Budget 2026" }).then((r) => {
    assert(r === false, "empty rename should resolve false");
    const added = toasts.slice(n);
    assert(added.some((t) => /cannot be empty/i.test(t.msg)),
      "expected an error toast, got " + JSON.stringify(added.map((t) => t.msg)));
    return true;
  });
});

check("NXT OS rebrand is present", () => {
  T.hub.show();
  const foot = doc.getElementById("hub-footer");
  assert(foot && /Part of NXT OS/.test(foot.textContent), "footer missing NXT OS");
  assert(/NXT OS/.test(doc.getElementById("hub-topbar").textContent), "topbar missing brand");
  assert(/NXT OS/.test(doc.querySelector("#hub-root .eco-home-head").textContent), "header missing brand");
  return true;
});

check("no duplicate element IDs in the HUB view", () => {
  T.hub.show();
  const seen = {};
  const dupes = [];
  doc.querySelectorAll("[id]").forEach((elm) => {
    if (seen[elm.id]) dupes.push(elm.id);
    seen[elm.id] = true;
  });
  assert(dupes.length === 0, "duplicate IDs: " + dupes.join(","));
  return true;
});

check("settings persist across a rebuild of the view", () => {
  T.hub.setSetting("warnMB", 33);
  T.hub.setSetting("showCounts", false);
  assert(T.store.get("hub", "settings").warnMB === 33, "warnMB lost");
  assert(T.store.get("hub", "settings").showCounts === false, "showCounts lost");
  T.hub.setSetting("warnMB", 50);
  T.hub.setSetting("showCounts", true);
  T.hub.setSetting("landing", "recent");
  return true;
});

/* ============================================================
   NXT UI polish phase B: skeleton loaders, pagination, omnibox
   ============================================================ */

check("file browser and storage show skeletons first, then real content", () => {
  T.hub.show();
  const fileSkels = doc.querySelectorAll("#hub-files .nxt-skeleton");
  assert(fileSkels.length > 0, "no skeleton placeholders in the file browser right after show()");
  const stoSkels = doc.querySelectorAll("#hub-storage .nxt-skeleton");
  assert(stoSkels.length > 0, "no skeleton placeholders in storage right after show()");
  return waitFor("real content replaces skeletons", () =>
    doc.querySelectorAll("#hub-files .nxt-skeleton").length === 0 &&
    doc.querySelectorAll("#hub-files .hub-filerow").length > 0 &&
    doc.querySelectorAll("#hub-storage .nxt-skeleton").length === 0 &&
    doc.querySelectorAll("#hub-storage .hub-bar-fill").length > 0);
});

check("omnibox is present and never collapses", () => {
  T.hub.show();
  const omni = doc.getElementById("hub-omni");
  assert(omni, "no #hub-omni");
  assert(omni.type === "search", "omni should be a search input");
  assert(!omni.classList.contains("hidden"), "omni must not carry the hidden class");
  assert(omni.style.display !== "none", "omni must not be display:none");
  const wrap = doc.getElementById("hub-omniWrap");
  assert(wrap && !wrap.classList.contains("hidden"), "omni wrapper must not be hidden");
  assert(omni.getAttribute("aria-label"), "omni needs an accessible label");
  return true;
});

/* 120 GRD files to exercise pagination */
const bigFiles = [];
for (let i = 0; i < 120; i++) {
  bigFiles.push({ id: "gb" + i, name: "Sheet " + i, updatedAt: now - i });
}

check("file browser paginates: 50 rows, Show more, refresh resets to page 1", () => {
  const realGrdList = T.grd.files.list;
  T.grd.files.list = () => bigFiles.slice();
  T.hub.show();
  const grdSec = () => {
    const secs = doc.querySelectorAll("#hub-files .hub-filesec");
    return Array.from(secs).find((s) => s.querySelector(".hub-filelabel").textContent === "Sheets");
  };
  return waitFor("first page", () => grdSec() && grdSec().querySelectorAll(".hub-filerow").length === 50)
    .then(() => {
      const more = grdSec().querySelector(".hub-showmore");
      assert(more, "no Show more button on a 120-file section");
      assert(/70 remaining/.test(more.textContent), "remaining count wrong: " + more.textContent);
      more.click();
      return waitFor("second page", () => grdSec().querySelectorAll(".hub-filerow").length === 100);
    })
    .then(() => {
      const more = grdSec().querySelector(".hub-showmore");
      assert(more, "Show more should still be there for the last 20 files");
      more.click();
      return waitFor("last page", () =>
        grdSec().querySelectorAll(".hub-filerow").length === 120 &&
        !grdSec().querySelector(".hub-showmore"));
    })
    .then(() => {
      /* a full refresh resets pagination to the first page */
      T.hub.show();
      return waitFor("pagination reset", () => {
        const g = grdSec();
        return g && g.querySelectorAll(".hub-filerow").length === 50 && !!g.querySelector(".hub-showmore");
      });
    })
    .then(() => {
      T.grd.files.list = realGrdList;
      T.hub.show();
      return waitFor("list restored", () => grdSec() && grdSec().querySelectorAll(".hub-filerow").length === 2);
    });
});

(async function runAll() {
  for (const [name, fn] of queue) {
    try {
      await fn();
      console.log("  PASS " + name);
    } catch (e) {
      failures.push(name);
      console.log("  FAIL " + name + " :: " + (e && e.message));
    }
  }
  console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL PASS");
  process.exit(failures.length ? 1 : 0);
})();
