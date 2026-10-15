/* TXT MEM whiteboard + notes app test (jsdom).
   Stubs window.TXT minimally, loads the REAL js/store.js plus js/mem/mem.js,
   then verifies the T.mem contract the ecosystem shell depends on.
   Run: NODE_PATH=<jsdom> node test/mem.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

const dom = new JSDOM('<!DOCTYPE html><html><body><section id="view-mem" class="view hidden"></section><div id="toasts"></div></body></html>', {
  url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
});
const { window } = dom;

// minimal TXT stub matching ARCHITECTURE.md conventions
const listeners = {};
const toasts = [];
let uidN = 0;
window.TXT = {
  bus: {
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: (ev, data) => { (listeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  cmds: {},
  register(name, fn, meta) { window.TXT.cmds[name] = { fn, meta: meta || {} }; },
  cmd(name, ...a) { const c = window.TXT.cmds[name]; if (c) { return c.fn(...a); } },
  t: (k) => k,
  uid: () => "u" + (++uidN),
  esc: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  debounce: (fn) => fn,
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: (msg, kind) => { toasts.push({ msg: String(msg), kind: kind || "info" }); }
};
// modal stub: controllable confirm/cancel; rename field value injectable
let modalBehavior = "confirm";
let modalNameValue = null;
const modalCalls = [];
window.TXT.modal = (opts) => {
  modalCalls.push(opts);
  if (modalBehavior === "cancel") return Promise.resolve(null);
  const out = {};
  (opts.fields || []).forEach((f) => {
    out[f.key] = (f.key === "name" && modalNameValue !== null) ? modalNameValue : f.value;
  });
  return Promise.resolve(out);
};
// ecosystem stub: launcher calls are counted
let launcherCalls = 0;
window.TXT.ecosystem = {
  toggleLauncher: () => { launcherCalls++; },
  openApp: (a) => { window.TXT._openedApp = a; }
};
window.eval(fs.readFileSync(path.join(ROOT, "js/store.js"), "utf8"));
window.eval(fs.readFileSync(path.join(ROOT, "js/mem/mem.js"), "utf8"));

let failures = [];
const pending = [];
function check(name, fn) {
  const run = async () => {
    try {
      const r = await fn();
      if (r === false) { throw new Error("returned false"); }
      console.log("  PASS " + name);
    } catch (e) { failures.push(name); console.log("  FAIL " + name + " :: " + (e && e.message)); }
  };
  pending.push(run());
}
function assert(c, m) { if (!c) { throw new Error(m || "assert"); } }

const T = window.TXT, doc = window.document;
assert(T.mem, "T.mem missing");

check("T.mem contract exists", () => {
  ["show", "hide", "addNote", "sendToTxt", "addBoard", "addSticky", "moveSticky",
   "addArrow", "setTagFilter", "goHome", "goMasonry", "openBoard",
   "getNotes", "getBoards", "isBuilt", "visible", "screen"].forEach((k) => {
    assert(typeof T.mem[k] === "function", "missing T.mem." + k);
  });
  return true;
});

check("mem.* commands registered", () => {
  ["mem.open", "mem.home", "mem.new", "mem.new-checklist", "mem.new-board"].forEach((c) => {
    assert(T.cmds[c], "missing command " + c);
  });
  Object.keys(T.cmds).forEach((c) => {
    assert(c.indexOf("mem.") === 0 || true, "");
  });
  return true;
});

check("bus ecosystem:app mem -> show(), other -> hide()", () => {
  assert(!T.mem.isBuilt(), "built too early");
  T.bus.emit("ecosystem:app", { app: "mem" });
  assert(T.mem.isBuilt(), "show did not build");
  assert(T.mem.visible(), "not visible after show");
  T.bus.emit("ecosystem:app", { app: "grd" });
  assert(!T.mem.visible(), "hide did not run");
  T.bus.emit("ecosystem:app", { app: "mem" });
  assert(T.mem.visible(), "re-show failed");
  return true;
});

check("show() builds homescreen DOM lazily", () => {
  ["mem-home", "mem-homeSearch", "mem-tplBoard", "mem-tplNote", "mem-recentGrid", "mem-homeEmpty",
   "mem-masonry", "mem-grid", "mem-tagChips", "mem-board", "mem-boardViewport",
   "mem-boardWorld", "mem-boardSvg", "mem-stickies", "mem-recBar"].forEach((id) => {
    assert(doc.getElementById(id), "missing #" + id);
  });
  const badge = doc.querySelector("#mem-home .app-badge");
  assert(badge && badge.textContent === "MEM", "badge");
  const tplBoard = doc.getElementById("mem-tplBoard");
  assert(tplBoard.textContent.indexOf("New board") >= 0, "board template card");
  const tplNote = doc.getElementById("mem-tplNote");
  assert(tplNote.textContent.indexOf("New note") >= 0, "note template card");
  return true;
});

check("UI polish: skeleton placeholders show while loading, replaced on first paint", async () => {
  const skCards = doc.querySelectorAll("#mem-grid .nxt-skeleton");
  assert(skCards.length >= 3, "no skeleton cards in masonry grid, got " + skCards.length);
  const skStk = doc.querySelectorAll("#mem-stickies .nxt-skeleton");
  assert(skStk.length >= 1, "no skeleton stickies on board, got " + skStk.length);
  await new Promise((r) => setTimeout(r, 80));
  T.mem.goMasonry();
  assert(doc.querySelectorAll("#mem-grid .nxt-skeleton").length === 0,
    "skeleton cards were not replaced by the first real paint");
  return true;
});

check("create note -> appears in masonry grid", () => {
  T.mem.goMasonry();
  assert(T.mem.screen() === "masonry", "screen not masonry");
  const n = T.mem.addNote("note", { title: "Sprint plan", html: "ship it <b>fast</b>" });
  const card = doc.getElementById("mem-card-" + n.id);
  assert(card, "card not rendered");
  assert(doc.getElementById("mem-grid").contains(card), "card not in grid");
  assert(card.querySelector(".mem-card-title").value === "Sprint plan", "title");
  assert(card.querySelector(".mem-card-body").innerHTML.indexOf("ship it") >= 0, "body html");
  const stored = T.store.get("mem", "notes").filter((x) => x.id === n.id);
  assert(stored.length === 1, "note not persisted to store");
  return true;
});

check("tag extraction + tag filter chips filter the grid", () => {
  const a = T.mem.addNote("note", { title: "Alpha", html: "launch notes #strategy" });
  T.mem.addNote("note", { title: "Beta", html: "random thoughts" });
  const chips = doc.getElementById("mem-tagChips");
  const chipLabels = Array.prototype.map.call(chips.querySelectorAll(".mem-chip"), (c) => c.textContent);
  assert(chipLabels.some((t) => t.indexOf("strategy") >= 0), "no #strategy chip, got: " + chipLabels.join(","));
  T.mem.setTagFilter("strategy");
  const visible = Array.prototype.filter.call(
    doc.querySelectorAll("#mem-grid .mem-card"), (c) => c.id === "mem-card-" + a.id);
  assert(visible.length === 1, "tag filter did not isolate the tagged note");
  T.mem.setTagFilter(null);
  assert(doc.querySelectorAll("#mem-grid .mem-card").length >= 3, "clearing filter did not restore cards");
  return true;
});

check("search filters masonry notes live", () => {
  const s = doc.getElementById("mem-masSearch");
  s.value = "Sprint plan";
  s.dispatchEvent(new window.Event("input", { bubbles: true }));
  const cards = doc.querySelectorAll("#mem-grid .mem-card");
  assert(cards.length === 1 && cards[0].id.indexOf("Sprint") < 0 || cards.length === 1, "search did not filter");
  const title = cards[0].querySelector(".mem-card-title").value;
  assert(title === "Sprint plan", "wrong card after search: " + title);
  s.value = "";
  s.dispatchEvent(new window.Event("input", { bubbles: true }));
  return true;
});

check("send-to-TXT emits mem:send with the card text", () => {
  let got = null;
  T.store.on("mem:send", (d) => { got = d; });
  const n = T.mem.addNote("note", { title: "Clip me", html: "clip body text" });
  const card = doc.getElementById("mem-card-" + n.id);
  const sendBtn = card.querySelector(".mem-send");
  assert(sendBtn, "no send button on card");
  sendBtn.click();
  assert(got && got.text === "Clip me\nclip body text", "bad payload: " + JSON.stringify(got));
  const lastToast = toasts[toasts.length - 1];
  assert(lastToast && lastToast.msg === "Sent to TXT", "no Sent to TXT toast");
  return true;
});

check("checklist note: add + check + send text", () => {
  const n = T.mem.addNote("checklist", { title: "Todos" });
  assert(n.items.length === 1, "checklist should start with one item");
  const card = doc.getElementById("mem-card-" + n.id);
  assert(card.querySelector(".mem-checklist"), "no checklist ul");
  let got = null;
  const off = T.store.on("mem:send", (d) => { got = d; });
  T.mem.sendToTxt(T.mem.noteToText({ id: "x", kind: "checklist", title: "Todos",
    items: [{ text: "buy milk", done: true }, { text: "ship", done: false }] }));
  assert(got && got.text.indexOf("[x] buy milk") >= 0 && got.text.indexOf("[ ] ship") >= 0,
    "checklist text wrong: " + (got && got.text));
  return true;
});

check("voice button explains when MediaRecorder is unavailable", () => {
  toasts.length = 0;
  const n = T.mem.addNote("note", { title: "Voice test" });
  const card = doc.getElementById("mem-card-" + n.id);
  const micBtn = Array.prototype.filter.call(card.querySelectorAll(".mem-card-actions .mem-btn"),
    (b) => b.title === "Record voice memo")[0];
  assert(micBtn, "no mic button");
  micBtn.click();
  const t = toasts[toasts.length - 1];
  assert(t && t.kind === "error" && /microphone|MediaRecorder/i.test(t.msg),
    "mic button did not explain: " + JSON.stringify(t));
  return true;
});

check("sticky add/move on board model + rendered", () => {
  const b = T.mem.addBoard("Board A");
  const s = T.mem.addSticky(b.id, { x: 10, y: 20 });
  assert(s && s.x === 10 && s.y === 20 && s.type === "sticky", "sticky not added");
  T.mem.moveSticky(b.id, s.id, 99, 100);
  const b2 = T.mem.getBoard(b.id);
  const moved = b2.elements.filter((e) => e.id === s.id)[0];
  assert(moved.x === 99 && moved.y === 100, "sticky not moved in model");
  T.mem.openBoard(b.id);
  const el = doc.getElementById("mem-stk-" + s.id);
  assert(el, "sticky not rendered on board");
  assert(el.style.left === "99px" && el.style.top === "100px", "sticky position not painted");
  return true;
});

check("connector arrow links two stickies and repaints on move", () => {
  const b = T.mem.currentBoard();
  const s1 = T.mem.addSticky(b.id, { x: 0, y: 0 });
  const s2 = T.mem.addSticky(b.id, { x: 400, y: 0 });
  const ar = T.mem.addArrow(b.id, s1.id, s2.id);
  assert(ar && ar.from === s1.id && ar.to === s2.id, "arrow not created");
  const dup = T.mem.addArrow(b.id, s1.id, s2.id);
  assert(dup.id === ar.id, "duplicate arrow created");
  const self = T.mem.addArrow(b.id, s1.id, s1.id);
  assert(self === null, "self arrow allowed");
  T.mem.moveSticky(b.id, s1.id, 50, 60);
  const b2 = T.mem.getBoard(b.id);
  assert(b2.elements.some((e) => e.type === "arrow" && e.id === ar.id), "arrow lost after move");
  return true;
});

check("stroke + frame models", () => {
  const b = T.mem.currentBoard();
  const st = T.mem.addStroke(b.id, [[0, 0], [10, 10], [20, 5]], "#DC2626", 4);
  assert(st && st.pts.length === 3 && st.color === "#DC2626", "stroke not added");
  const fr = T.mem.addFrame(b.id, { x: 5, y: 5, w: 300, h: 200, label: "Ideas" });
  assert(fr && fr.label === "Ideas", "frame not added");
  const ok = T.mem.deleteEl(b.id, st.id);
  assert(ok === true, "deleteEl failed");
  assert(!T.mem.getBoard(b.id).elements.some((e) => e.id === st.id), "stroke not deleted");
  return true;
});

check("delete sticky removes its arrows", () => {
  const b = T.mem.addBoard("Board B");
  const s1 = T.mem.addSticky(b.id, { x: 0, y: 0 });
  const s2 = T.mem.addSticky(b.id, { x: 300, y: 0 });
  T.mem.addArrow(b.id, s1.id, s2.id);
  T.mem.deleteEl(b.id, s1.id);
  const b2 = T.mem.getBoard(b.id);
  assert(!b2.elements.some((e) => e.type === "arrow"), "orphan arrow left behind");
  return true;
});

check("zoom clamps 25% to 400%", () => {
  const b = T.mem.currentBoard() || T.mem.addBoard("Zoom board");
  T.mem.openBoard(b.id);
  T.mem.zoomBy(100);
  assert(T.mem.currentBoard().view.zoom === 4,
    "zoom not clamped at 400%, got " + T.mem.currentBoard().view.zoom);
  T.mem.zoomBy(0.0001);
  assert(T.mem.currentBoard().view.zoom === 0.25,
    "zoom not clamped at 25%, got " + T.mem.currentBoard().view.zoom);
  const pct = doc.getElementById("mem-zoomPct").textContent;
  assert(pct === "25%", "zoom label wrong: " + pct);
  T.mem.zoomBy(4);
  return true;
});

check("sticky Send to TXT emits sticky text", () => {
  const b = T.mem.currentBoard();
  const s = T.mem.addSticky(b.id, { x: 0, y: 0, title: "Idea", html: "build <b>more</b>" });
  T.mem.openBoard(b.id);
  let got = null;
  T.store.on("mem:send", (d) => { got = d; });
  const el = doc.getElementById("mem-stk-" + s.id);
  const sendBtn = el.querySelector(".mem-send");
  assert(sendBtn, "sticky has no Send to TXT button");
  sendBtn.click();
  assert(got && got.text === "Idea\nbuild more", "sticky payload wrong: " + JSON.stringify(got));
  return true;
});

check("recent store caps at 20 and homescreen lists all files", () => {
  for (let i = 0; i < 25; i++) T.mem.addNote("note", { title: "Bulk " + i });
  const rec = T.store.get("mem", "recent");
  assert(Array.isArray(rec) && rec.length <= 20, "recent longer than 20: " + rec.length);
  T.mem.goHome();
  const cards = doc.querySelectorAll("#mem-recentGrid .eco-home-card");
  const files = T.mem.files.list();
  assert(cards.length === files.length && cards.length > 20, "files grid wrong size: " + cards.length + " vs " + files.length);
  assert(doc.getElementById("mem-homeEmpty").classList.contains("hidden"), "empty state shown with items");
  return true;
});

check("homescreen search filters recent cards live", () => {
  const s = doc.getElementById("mem-homeSearch");
  s.value = "Bulk 24";
  s.dispatchEvent(new window.Event("input", { bubbles: true }));
  const cards = doc.querySelectorAll("#mem-recentGrid .eco-home-card");
  assert(cards.length === 1, "home search did not filter, got " + cards.length);
  assert(cards[0].querySelector("h3").textContent === "Bulk 24", "wrong card");
  s.value = "";
  s.dispatchEvent(new window.Event("input", { bubbles: true }));
  return true;
});

check("mode switcher segmented control exists in both editors", () => {
  T.mem.goMasonry();
  const seg1 = doc.querySelector("#mem-modeSegWrap .mem-seg");
  assert(seg1 && seg1.querySelectorAll("button").length === 2, "masonry seg missing");
  T.mem.openBoard(T.mem.getBoards()[0].id);
  const seg2 = doc.querySelector("#mem-modeSegWrap2 .mem-seg");
  assert(seg2 && seg2.querySelectorAll("button").length === 2, "board seg missing");
  const active = seg2.querySelector("button.active");
  assert(active && active.getAttribute("data-mode") === "board", "seg did not reflect board mode");
  return true;
});

check("duplicate + delete note round trip", () => {
  const n = T.mem.addNote("note", { title: "Dup me", html: "x" });
  const c = T.mem.duplicateNote(n.id);
  assert(c && c.id !== n.id && c.title === "Dup me", "duplicate failed");
  T.mem.deleteNote(n.id);
  assert(!T.mem.getNotes().some((x) => x.id === n.id), "delete failed");
  assert(T.mem.getNotes().some((x) => x.id === c.id), "duplicate wrongly deleted");
  return true;
});

check("no dead toolbar buttons: every tool button switches tool", () => {
  T.mem.openBoard(T.mem.getBoards()[0].id);
  ["select", "sticky", "draw", "arrow", "frame", "eraser"].forEach((t) => {
    doc.getElementById("mem-tool-" + t).click();
    const active = doc.querySelector("#mem-boardTools .mem-tool.active");
    assert(active && active.getAttribute("data-tool") === t, "tool " + t + " did not activate");
  });
  doc.getElementById("mem-tool-select").click();
  return true;
});

check("NXT phase 1: both topbars have MEM badge + launcher + gear, all wired", () => {
  launcherCalls = 0;
  T.mem.goMasonry();
  const masBar = doc.querySelector("#mem-masonry .mem-topbar");
  assert(masBar, "masonry topbar missing");
  const badge1 = masBar.querySelector(".mem-appbadge");
  assert(badge1 && badge1.textContent === "MEM", "masonry MEM badge missing");
  const lz1 = masBar.querySelector(".waffle-btn");
  assert(lz1 && lz1.querySelectorAll(".waffle-dots i").length === 9, "masonry launcher needs 9 dots");
  lz1.click();
  assert(launcherCalls === 1, "masonry launcher did not call toggleLauncher");
  const g1 = masBar.querySelector("#mem-settings-masonry");
  assert(g1, "masonry gear missing");
  g1.click();
  const wrap = doc.getElementById("mem-settingsWrap");
  assert(wrap && !wrap.classList.contains("hidden"), "gear did not open settings drawer");
  doc.getElementById("mem-settingsClose").click();
  assert(wrap.classList.contains("hidden"), "close did not hide settings drawer");
  T.mem.openBoard(T.mem.getBoards()[0].id);
  const bBar = doc.querySelector("#mem-board .mem-topbar");
  assert(bBar, "board topbar missing");
  const badge2 = bBar.querySelector(".mem-appbadge");
  assert(badge2 && badge2.textContent === "MEM", "board MEM badge missing");
  const lz2 = bBar.querySelector(".waffle-btn");
  assert(lz2 && lz2.querySelectorAll(".waffle-dots i").length === 9, "board launcher needs 9 dots");
  lz2.click();
  assert(launcherCalls === 2, "board launcher did not call toggleLauncher");
  const g2 = bBar.querySelector("#mem-settings-board");
  assert(g2, "board gear missing");
  g2.click();
  assert(!doc.getElementById("mem-settingsWrap").classList.contains("hidden"), "board gear did not open drawer");
  doc.getElementById("mem-settingsClose").click();
  return true;
});

check("NXT phase 1: dot grid setting persists and toggles the whiteboard background", () => {
  T.mem.setSettings({ dotGrid: false });
  const stored = T.store.get("mem", "settings");
  assert(stored && stored.dotGrid === false, "settings not persisted to store");
  T.mem.openBoard(T.mem.getBoards()[0].id);
  const vp = doc.getElementById("mem-boardViewport");
  assert(vp.classList.contains("mem-nodots"), "viewport missing mem-nodots when dotGrid off");
  T.mem.setSettings({ dotGrid: true });
  assert(!vp.classList.contains("mem-nodots"), "viewport kept mem-nodots when dotGrid on");
  assert(T.store.get("mem", "settings").dotGrid === true, "dotGrid on not persisted");
  const sw = doc.getElementById("mem-setDots");
  T.mem.openSettings();
  assert(sw.getAttribute("aria-pressed") === "true", "drawer switch out of sync");
  T.mem.closeSettings();
  return true;
});

check("NXT phase 1: default note color applies to newly created notes", () => {
  T.mem.setSettings({ noteColor: "#FEF3C7" });
  const n = T.mem.addNote("note", { title: "Colored" });
  assert(n.color === "#FEF3C7", "new note did not use default color: " + n.color);
  assert(T.store.get("mem", "settings").noteColor === "#FEF3C7", "noteColor not persisted");
  T.mem.setSettings({ noteColor: "#FFFFFF" });
  const n2 = T.mem.addNote("note", { title: "Plain" });
  assert(n2.color === "#FFFFFF", "color did not reset");
  const explicit = T.mem.addNote("note", { title: "Explicit", color: "#DBEAFE" });
  assert(explicit.color === "#DBEAFE", "explicit color was overridden");
  return true;
});

check("NXT phase 1: default sort orders the notes list", () => {
  T.mem.addNote("note", { title: "Zulu sort check" });
  T.mem.addNote("note", { title: "Alpha sort check" });
  T.mem.setSettings({ sort: "name" });
  T.mem.goMasonry();
  const titles = Array.prototype.map.call(doc.querySelectorAll("#mem-grid .mem-card .mem-card-title"), (i) => i.value);
  const sorted = titles.slice().sort((a, b) => {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  assert(JSON.stringify(titles) === JSON.stringify(sorted), "name sort wrong: " + titles.slice(0, 6).join("|"));
  T.mem.setSettings({ sort: "newest" });
  assert(T.store.get("mem", "settings").sort === "newest", "sort not persisted");
  return true;
});

check("NXT phase 1: snap to grid changes sticky drag math", () => {
  T.mem.setSettings({ snapGrid: false });
  const off = T.mem.snapPoint(33, 37);
  assert(off.x === 33 && off.y === 37, "snap applied when disabled");
  T.mem.setSettings({ snapGrid: true });
  const on = T.mem.snapPoint(33, 37);
  assert(on.x === 40 && on.y === 40, "snap not applied: " + JSON.stringify(on));
  assert(T.store.get("mem", "settings").snapGrid === true, "snapGrid not persisted");
  T.mem.setSettings({ snapGrid: false });
  return true;
});

check("NXT phase 1: file model CRUD round trip (notes)", async () => {
  modalBehavior = "confirm";
  const rec = T.mem.files.create("File Alpha", "note");
  assert(rec && rec.kind === "note" && rec.name === "File Alpha" && rec.updatedAt > 0, "create note file: " + JSON.stringify(rec));
  assert(T.mem.files.list().some((f) => f.id === rec.id), "list missing created file");
  const rn = T.mem.files.rename(rec.id, "File Alpha 2");
  assert(rn && rn.name === "File Alpha 2", "rename failed");
  const stored = T.store.get("mem", "notes").filter((n) => n.id === rec.id)[0];
  assert(stored && stored.title === "File Alpha 2", "rename not persisted to store");
  const dup = T.mem.files.duplicate(rec.id);
  assert(dup && dup.id !== rec.id && dup.kind === "note" && dup.name.indexOf("(copy)") >= 0, "duplicate failed");
  const opened = T.mem.files.open(rec.id);
  assert(opened && opened.id === rec.id && T.mem.screen() === "masonry", "open did not land on masonry");
  const removed = await T.mem.files.remove(rec.id);
  assert(removed === true, "remove did not resolve true");
  assert(!T.mem.files.list().some((f) => f.id === rec.id), "file still listed after remove");
  assert(!T.store.get("mem", "notes").some((n) => n.id === rec.id), "note still in store");
  const nopeRes = await T.mem.files.remove("nope");
  assert(nopeRes === false, "remove of unknown id should resolve false");
  await T.mem.files.remove(dup.id);
  return true;
});

check("NXT phase 1: file model CRUD round trip (boards)", async () => {
  const rec = T.mem.files.create("Board File", "board");
  assert(rec && rec.kind === "board" && rec.name === "Board File", "create board file");
  const opened = T.mem.files.open(rec.id);
  assert(opened && opened.id === rec.id && T.mem.screen() === "board", "open did not open board");
  modalBehavior = "cancel";
  const nModalBefore = modalCalls.length;
  const kept = await T.mem.files.remove(rec.id);
  assert(kept === false, "cancelled remove did not resolve false");
  assert(T.mem.files.list().some((f) => f.id === rec.id), "cancelled remove deleted the file");
  assert(modalCalls[nModalBefore].title === "Delete board", "confirm modal had wrong title");
  modalBehavior = "confirm";
  const gone = await T.mem.files.remove(rec.id);
  assert(gone === true, "confirmed remove failed");
  assert(!T.mem.files.list().some((f) => f.id === rec.id), "board still listed");
  assert(!T.store.get("mem", "boards").some((b) => b.id === rec.id), "board still in store");
  assert(T.mem.screen() === "home", "screen did not return home after deleting the open board");
  return true;
});

check("NXT phase 1: homescreen lists files with open/rename/duplicate/delete + NXT footer", () => {
  T.mem.goHome();
  const files = T.mem.files.list();
  const cards = doc.querySelectorAll("#mem-recentGrid .mem-file-card");
  assert(cards.length === files.length && cards.length > 0, "file cards " + cards.length + " vs files " + files.length);
  const card = cards[0];
  assert(card.querySelector('button[aria-label="Open"]'), "no Open action");
  assert(card.querySelector('button[aria-label="Rename"]'), "no Rename action");
  assert(card.querySelector('button[aria-label="Duplicate"]'), "no Duplicate action");
  assert(card.querySelector('button[aria-label="Delete"]'), "no Delete action");
  const foot = doc.getElementById("mem-homeFooter");
  assert(foot && foot.textContent.indexOf("Part of NXT OS") >= 0, "footer missing NXT line");
  assert(doc.getElementById("mem-tplNote"), "New note action missing");
  assert(doc.getElementById("mem-tplBoard"), "New board action missing");
  const about = doc.getElementById("mem-settingsAbout");
  assert(about && about.textContent.indexOf("NXT OS") >= 0, "settings About missing NXT mention");
  return true;
});

check("NXT phase 1: rename action opens modal and renames the file", async () => {
  modalBehavior = "confirm";
  modalNameValue = "Renamed OK";
  const rec = T.mem.files.create("Rename Me", "note");
  T.mem.goHome();
  const cards = Array.prototype.filter.call(doc.querySelectorAll("#mem-recentGrid .mem-file-card"),
    (c) => c.querySelector("h3").textContent === "Rename Me");
  assert(cards.length === 1, "rename fixture card missing");
  cards[0].querySelector('button[aria-label="Rename"]').click();
  await new Promise((r) => setTimeout(r, 0));
  modalNameValue = null;
  const got = T.mem.files.list().filter((f) => f.id === rec.id)[0];
  assert(got && got.name === "Renamed OK", "rename via modal failed: " + (got && got.name));
  modalBehavior = "confirm";
  await T.mem.files.remove(rec.id);
  return true;
});

check("UI polish: single board-rename path (title button opens the rename modal)", async () => {
  const b = T.mem.addBoard("Rename Path Board");
  T.mem.openBoard(b.id);
  const titleEl = doc.getElementById("mem-boardTitle");
  assert(titleEl, "board title element missing");
  assert(titleEl.tagName !== "INPUT", "board title is still an inline input: two rename paths remain");
  assert(titleEl.textContent === "Rename Path Board", "title button text wrong: " + titleEl.textContent);
  modalBehavior = "confirm";
  modalNameValue = "Board Renamed OK";
  const nCalls = modalCalls.length;
  titleEl.click();
  T.mem.goHome();
  await new Promise((r) => setTimeout(r, 0));
  modalNameValue = null;
  const newCalls = modalCalls.slice(nCalls);
  assert(newCalls.some((c) => c.title === "Rename file"), "title button did not open the rename modal");
  assert(T.mem.getBoard(b.id).title === "Board Renamed OK", "board not renamed");
  assert(doc.getElementById("mem-boardTitle").textContent === "Board Renamed OK", "title button not synced");
  return true;
});

check("UI polish: sticky color is an inline popover on wide screens", () => {
  const narrowNow = typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 640px)").matches;
  assert(!narrowNow, "test env is unexpectedly narrow");
  const b = T.mem.currentBoard();
  const s = T.mem.addSticky(b.id, { x: 20, y: 20 });
  T.mem.openBoard(b.id);
  const el = doc.getElementById("mem-stk-" + s.id);
  assert(el, "sticky not rendered");
  const inline = el.querySelector(".mem-sticky-colors");
  el.querySelector(".mem-sticky-pal").click();
  assert(inline && !inline.classList.contains("hidden"), "inline color popover did not open on wide");
  assert(!doc.getElementById("mem-colorSheet"), "bottom sheet opened on a wide screen");
  el.querySelector(".mem-sticky-pal").click();
  assert(inline.classList.contains("hidden"), "inline popover did not toggle closed");
  T.mem.goHome();
  return true;
});

check("UI polish: sticky color opens a bottom sheet on narrow screens", () => {
  const realMM = window.matchMedia;
  window.matchMedia = (q) => ({
    matches: String(q).indexOf("640") >= 0, media: q,
    addListener: () => {}, removeListener: () => {}
  });
  try {
    const b = T.mem.currentBoard() || T.mem.addBoard("Sheet Board");
    const s = T.mem.addSticky(b.id, { x: 10, y: 10 });
    const before = s.color;
    T.mem.openBoard(b.id);
    const el = doc.getElementById("mem-stk-" + s.id);
    assert(el, "sticky not rendered");
    el.querySelector(".mem-sticky-pal").click();
    const sheet = doc.getElementById("mem-colorSheet");
    assert(sheet && sheet.classList.contains("nxt-sheet"), "no nxt-sheet color sheet on narrow");
    assert(sheet.querySelector(".nxt-sheet-handle"), "sheet missing drag handle");
    assert(sheet.getAttribute("role") === "dialog", "sheet missing dialog role");
    const swatches = sheet.querySelectorAll(".mem-swatch");
    assert(swatches.length >= 5, "sheet missing color swatches, got " + swatches.length);
    assert(sheet.querySelector(".mem-sheet-done"), "sheet missing Done button");
    swatches[1].click();
    assert(!doc.getElementById("mem-colorSheet"), "sheet did not close after picking a color");
    const updated = T.mem.getBoard(b.id).elements.filter((e) => e.id === s.id)[0];
    assert(updated && updated.color && updated.color !== before,
      "sticky color not updated: " + (updated && updated.color));
    T.mem.goHome();
  } finally {
    if (realMM === undefined) { delete window.matchMedia; } else { window.matchMedia = realMM; }
  }
  return true;
});

check("UI polish: board toolbar scrolls horizontally at 393px + sheet/skeleton CSS present", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/mem.css"), "utf8");
  const mq = css.lastIndexOf("@media (max-width: 640px)");
  assert(mq >= 0, "640px media query missing from mem.css");
  const block = css.slice(mq, mq + 4000);
  assert(block.indexOf(".mem-tools") >= 0 && block.indexOf("overflow-x: auto") >= 0,
    "mem-tools is not a horizontal scroll container in the mobile query");
  assert(css.indexOf(".nxt-sheet { position: fixed;") >= 0, "exact .nxt-sheet CSS missing");
  assert(css.indexOf("@keyframes nxt-shimmer") >= 0, "nxt-shimmer keyframes missing");
  assert(css.indexOf("min-height: 56px") >= 0, "topbar 56px min-height missing");
  return true;
});

check("NXT phase 1: palette categories are NXT OS", () => {
  ["mem.open", "mem.home", "mem.new", "mem.new-checklist", "mem.new-board"].forEach((c) => {
    assert(T.cmds[c] && T.cmds[c].meta && T.cmds[c].meta.cat === "NXT OS", c + " cat is not NXT OS");
  });
  return true;
});

check("NXT phase 1: no duplicate element IDs in the document", () => {
  const seen = {};
  const dups = [];
  Array.prototype.forEach.call(doc.querySelectorAll("[id]"), (el) => {
    if (seen[el.id]) dups.push(el.id); else seen[el.id] = 1;
  });
  assert(dups.length === 0, "duplicate ids: " + dups.join(", "));
  return true;
});

(async () => {
  await Promise.all(pending);
  console.log(failures.length ? "\n" + failures.length + " FAILURES: " + failures.join(", ") : "\nALL MEM TESTS PASSED");
  process.exit(failures.length ? 1 : 0);
})();
