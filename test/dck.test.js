/* DCK slide deck app contract test (jsdom).
   Stubs window.TXT minimally (bus, store, register), loads js/dck/dck.js,
   then verifies the T.dck contract: homescreen, editor ops, generator,
   live GRD blocks, show/hide.
   Run: NODE_PATH=<jsdom> node test/dck.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><main id="views"><section id="view-dck" class="view hidden"></section></main></body></html>',
  { url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously" }
);
const { window } = dom;

// minimal TXT stub matching ARCHITECTURE.md conventions
const busListeners = {};
const storeListeners = {};
const storeDb = {};
window.TXT = {
  bus: {
    on: (ev, fn) => { (busListeners[ev] = busListeners[ev] || []).push(fn); },
    emit: (ev, data) => { (busListeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  store: {
    get: (app, key) => {
      const ns = storeDb[app];
      if (!ns) return undefined;
      return key === undefined ? ns : ns[key];
    },
    set: (app, key, val) => {
      if (!app) return;
      storeDb[app] = storeDb[app] || {};
      storeDb[app][key] = val;
      return val;
    },
    on: (ev, fn) => { (storeListeners[ev] = storeListeners[ev] || []).push(fn); },
    emit: (ev, data) => { (storeListeners[ev] || []).slice().forEach((fn) => fn(data)); }
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
  toast: () => {},
  ecosystem: {
    toggleLauncher: () => { window.__launcherClicks = (window.__launcherClicks || 0) + 1; },
    openApp: () => {}
  },
  // resolves with window.modalResult (test-controlled); null/undefined = cancel
  modal: (opts) => Promise.resolve(("modalResult" in window) ? window.modalResult : null),
  sel: null // set per-test to stub the live sheet
};
window.eval(fs.readFileSync(path.join(ROOT, "js/dck/dck.js"), "utf8"));

let failures = [];
const pendingAsync = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      pendingAsync.push(r.then(
        () => { console.log("  PASS " + name); },
        (e) => { failures.push(name); console.log("  FAIL " + name + " :: " + (e && e.message)); }
      ));
    } else {
      if (r === false) { throw new Error("returned false"); }
      console.log("  PASS " + name);
    }
  }
  catch (e) { failures.push(name); console.log("  FAIL " + name + " :: " + (e && e.message)); }
}
function assert(c, m) { if (!c) { throw new Error(m || "assert"); } }

const T = window.TXT, doc = window.document;
function $(id) { return doc.getElementById(id); }

check("T.dck contract exists", () => {
  ["show", "hide", "newDeck", "openDeck", "generateFromDocument", "parseDocument",
   "addSlide", "duplicateSlide", "deleteSlide", "setSlideLayout", "insertBlock",
   "deleteBlock", "present", "exitPresent", "currentDeck", "currentSlide"
  ].forEach((k) => { assert(typeof T.dck[k] === "function", "missing T.dck." + k); });
  return true;
});

check("ecosystem:app event with app=dck triggers show()", () => {
  T.bus.emit("ecosystem:app", { app: "dck" });
  assert(!$("view-dck").classList.contains("hidden"), "view-dck still hidden");
  assert($("dck-root"), "no #dck-root");
  assert($("dck-home"), "no #dck-home");
  return true;
});

check("homescreen has search, generate button, templates, empty state", () => {
  assert($("dck-home-search"), "no search");
  const gen = $("dck-gen-btn");
  assert(gen, "no generate button");
  assert(gen.textContent.indexOf("Generate Slide Deck from TXT Document") >= 0, "gen label");
  ["dck-tpl-blank", "dck-tpl-pitch", "dck-tpl-kpi"].forEach((id) => assert($(id), "missing " + id));
  assert($("dck-home-empty"), "no empty state");
  assert($("dck-badge"), "no app badge");
  assert($("dck-badge").style.background === "rgb(255, 46, 147)" || $("dck-badge").style.background === "#FF2E93",
    "badge color, got " + $("dck-badge").style.background);
  return true;
});

check("show()/hide() toggle the view", () => {
  T.dck.hide();
  assert($("view-dck").classList.contains("hidden"), "hide did not hide");
  T.dck.show();
  assert(!$("view-dck").classList.contains("hidden"), "show did not reveal");
  return true;
});

check("commands registered with dck. prefix", () => {
  ["dck.new", "dck.home", "dck.present", "dck.generate", "dck.newSlide"].forEach((c) => {
    assert(T.cmds[c], "missing command " + c);
  });
  return true;
});

check("template deck: Executive Pitch builds 5 slides", () => {
  T.dck.newDeck("Pitch", "pitch");
  const d = T.dck.currentDeck();
  assert(d && d.slides.length === 5, "want 5 slides, got " + (d && d.slides.length));
  assert($("dck-editor").style.display !== "none", "editor not visible");
  assert($("dck-filmstrip").querySelectorAll(".dck-thumb").length === 5, "filmstrip count");
  assert($("dck-inspector"), "no inspector");
  assert($("dck-notes-text"), "no notes tray");
  return true;
});

check("addSlide / duplicateSlide / deleteSlide", () => {
  const before = T.dck.currentDeck().slides.length;
  T.dck.addSlide("kpi");
  assert(T.dck.currentDeck().slides.length === before + 1, "addSlide");
  T.dck.duplicateSlide();
  assert(T.dck.currentDeck().slides.length === before + 2, "duplicateSlide");
  T.dck.deleteSlide();
  const dlg = $("dck-confirm");
  assert(dlg, "no confirm dialog for deleteSlide");
  $("dck-confirm-yes").click();
  assert(T.dck.currentDeck().slides.length === before + 1, "deleteSlide confirm, got " +
    T.dck.currentDeck().slides.length);
  return true;
});

check("setSlideLayout assigns layout on empty slide", () => {
  T.dck.addSlide("blank");
  const s = T.dck.currentSlide();
  assert(s.layout === "blank", "not blank");
  T.dck.setSlideLayout(s, "kpi");
  assert(s.layout === "kpi", "layout not set");
  assert(s.blocks.length > 0, "layout produced no blocks");
  return true;
});

check("parseDocument: h1 + 2 h2 + bullets", () => {
  const sheet = doc.createElement("div");
  sheet.innerHTML =
    "<h1>Quarterly Review</h1><p>The quarter in review.</p>" +
    "<h2>Revenue</h2><ul><li>Up 12 percent</li><li>New clients</li></ul>" +
    "<h2>Costs</h2><ol><li>Cut travel</li></ol>";
  const p = T.dck.parseDocument(sheet);
  assert(p.title === "Quarterly Review", "title: " + p.title);
  assert(p.subtitle === "The quarter in review.", "subtitle: " + p.subtitle);
  assert(p.slides.length === 2, "sections: " + p.slides.length);
  assert(p.slides[0].title === "Revenue", "s1 title");
  assert(p.slides[0].bullets.length === 2, "s1 bullets");
  assert(p.slides[0].bullets[0].text === "Up 12 percent", "s1 bullet text");
  assert(p.slides[1].title === "Costs", "s2 title");
  assert(p.slides[1].bullets.length === 1 && p.slides[1].bullets[0].text === "Cut travel", "s2 bullets");
  return true;
});

check("generateFromDocument builds 3 slides with titles and bullets", () => {
  const sheet = doc.createElement("div");
  sheet.innerHTML =
    "<h1>Quarterly Review</h1><p>The quarter in review.</p>" +
    "<h2>Revenue</h2><ul><li>Up 12 percent</li><li>New clients</li></ul>" +
    "<h2>Costs</h2><ol><li>Cut travel</li></ol>";
  T.sel = { sheet: () => sheet };
  const deck = T.dck.generateFromDocument();
  assert(deck, "no deck returned");
  assert(deck.slides.length === 3, "want 3 slides, got " + deck.slides.length);
  assert(deck.title === "Quarterly Review", "deck title");
  assert(deck.slides[0].layout === "cover", "slide 1 not cover");
  const titles = deck.slides.map((s) => {
    const t = s.blocks.find((b) => b.type === "text" && (b.cls === "dck-b-h2" || b.cls === "dck-b-title"));
    return t ? t.html.replace(/<[^>]*>/g, "") : "";
  });
  assert(titles[0] === "Quarterly Review", "cover title: " + titles[0]);
  assert(titles[1] === "Revenue", "slide 2 title: " + titles[1]);
  assert(titles[2] === "Costs", "slide 3 title: " + titles[2]);
  const b2 = deck.slides[1].blocks.find((b) => b.type === "bullets");
  assert(b2 && b2.items.length === 2 && b2.items[0] === "Up 12 percent", "slide 2 bullets");
  const b3 = deck.slides[2].blocks.find((b) => b.type === "bullets");
  assert(b3 && b3.items.length === 1 && b3.items[0] === "Cut travel", "slide 3 bullets");
  T.sel = null;
  return true;
});

check("generateFromDocument: live-grd block becomes chart slide", () => {
  const sheet = doc.createElement("div");
  sheet.innerHTML =
    "<h1>Sales</h1><h2>Numbers</h2><ul><li>Growing</li></ul>" +
    '<div class="live-grd" data-grid="g9" data-label="Q3 sales"><table><tr><th>M</th></tr><tr><td>5</td></tr></table></div>';
  T.sel = { sheet: () => sheet };
  const deck = T.dck.generateFromDocument();
  const charts = deck.slides.filter((s) => s.layout === "chart");
  assert(charts.length === 1, "want 1 chart slide, got " + charts.length);
  const gb = charts[0].blocks.find((b) => b.type === "grd");
  assert(gb && gb.gridId === "g9", "grd block missing or wrong gridId");
  T.sel = null;
  return true;
});

check("generateFromDocument with no sheet returns null and does not throw", () => {
  T.sel = null;
  const deck = T.dck.generateFromDocument();
  assert(deck === null, "expected null");
  return true;
});

check("grd:live inserts a LIVE badge block on the current slide", () => {
  T.dck.newDeck("GRD test", "blank");
  const before = T.dck.currentSlide().blocks.length;
  T.store.emit("grd:live", {
    id: "g1", label: "Sales", html: "<table><tr><td>1</td></tr></table>", values: [[1]]
  });
  const s = T.dck.currentSlide();
  assert(s.blocks.length === before + 1, "block not inserted");
  const b = s.blocks[s.blocks.length - 1];
  assert(b.type === "grd" && b.gridId === "g1", "wrong block");
  const rendered = $("dck-stage").querySelector('[data-bid="' + b.id + '"] .dck-live-badge');
  assert(rendered && rendered.textContent === "LIVE - GRD", "badge missing in stage");
  return true;
});

check("grd:update refreshes the matching block in place", () => {
  T.store.emit("grd:update", { id: "g1", values: [["Q1", "Q2"], ["10", "20"]] });
  const s = T.dck.currentSlide();
  const b = s.blocks.find((x) => x.type === "grd" && x.gridId === "g1");
  assert(b, "block gone after update");
  assert(b.html.indexOf("Q1") >= 0 && b.html.indexOf("20") >= 0, "values not refreshed: " + b.html);
  return true;
});

check("recent store is maintained (max 20)", () => {
  const recent = T.store.get("dck", "recent");
  assert(Array.isArray(recent) && recent.length > 0, "no recent entries");
  assert(recent.length <= 20, "recent over 20");
  assert(recent[0].id && recent[0].title && recent[0].updatedAt, "recent entry shape");
  return true;
});

check("search filters recent decks live", () => {
  T.dck.show();
  const search = $("dck-home-search");
  search.value = "GRD test";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  const cards = $("dck-home-recent").querySelectorAll(".eco-home-card");
  assert(cards.length >= 1, "no cards after filter");
  let allMatch = true;
  Array.prototype.forEach.call(cards, (c) => {
    if (c.querySelector("h3").textContent.toLowerCase().indexOf("grd test") < 0) allMatch = false;
  });
  assert(allMatch, "unfiltered card shown");
  search.value = "";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  return true;
});

check("no duplicate element ids in the built view", () => {
  const seen = {};
  let dup = null;
  Array.prototype.forEach.call(doc.querySelectorAll("#view-dck [id]"), (n) => {
    if (seen[n.id]) dup = n.id;
    seen[n.id] = true;
  });
  assert(!dup, "duplicate id: " + dup);
  return true;
});

check("deck persists across rebuild (store round trip)", () => {
  const d = T.dck.currentDeck();
  const decks = T.store.get("dck", "decks");
  assert(decks && decks[d.id] && decks[d.id].title === d.title, "deck not persisted");
  return true;
});

/* ---------------- phase 1: per-app topbar, settings, files ---------------- */

check("per-app topbar: badge, launcher button, gear button", () => {
  T.dck.show();
  const bar = $("dck-topbar");
  assert(bar, "no #dck-topbar");
  assert(bar.getAttribute("role") === "banner", "topbar role");
  const badge = $("dck-topbar-badge");
  assert(badge && badge.textContent === "DCK", "badge");
  assert(badge.classList.contains("app-badge"), "badge class");
  const waffle = $("dck-launcher-btn");
  assert(waffle, "no launcher button");
  assert(waffle.classList.contains("icon-btn") && waffle.classList.contains("waffle-btn"),
    "launcher must carry icon-btn waffle-btn");
  const dots = waffle.querySelector(".waffle-dots");
  assert(dots && dots.querySelectorAll("i").length === 9, "want 9 dots, got " +
    (dots ? dots.querySelectorAll("i").length : 0));
  const before = window.__launcherClicks || 0;
  waffle.click();
  assert((window.__launcherClicks || 0) === before + 1,
    "launcher click did not call T.ecosystem.toggleLauncher");
  const gear = $("dck-settings-btn");
  assert(gear, "no gear button");
  assert(gear.getAttribute("aria-label") === "DCK settings", "gear aria-label");
  return true;
});

check("topbar stays mounted in the editor view", () => {
  const rec = T.dck.files.create("Topbar deck");
  T.dck.openDeck(rec.id);
  assert($("dck-topbar"), "topbar gone in editor");
  assert($("dck-launcher-btn") && $("dck-settings-btn"), "topbar buttons gone in editor");
  T.dck.show();
  return true;
});

check("gear button opens the settings drawer; About mentions NXT OS", () => {
  $("dck-settings-btn").click();
  const ov = $("dck-settings-ov");
  assert(ov && ov.style.display !== "none", "drawer not visible");
  ["dck-set-aspect", "dck-set-transition", "dck-set-timer", "dck-set-spellcheck"].forEach((id) => {
    assert($(id), "missing " + id);
  });
  const about = $("dck-settings-about");
  assert(about && about.textContent.indexOf("NXT OS") >= 0, "About row lacks NXT OS");
  $("dck-settings-close").click();
  assert($("dck-settings-ov").style.display === "none", "drawer did not close");
  return true;
});

check("settings default to aspect 16:9, fade, timer on, spellcheck on", () => {
  const s = T.dck.getSettings();
  assert(s.aspect === "16:9", "aspect default: " + s.aspect);
  assert(s.transition === "fade", "transition default: " + s.transition);
  assert(s.timer === true, "timer default");
  assert(s.spellcheck === true, "spellcheck default");
  return true;
});

check("aspect setting persists and applies to newly created decks", () => {
  $("dck-settings-btn").click();
  const sel = $("dck-set-aspect");
  sel.value = "4:3";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const stored = T.store.get("dck", "settings");
  assert(stored && stored.aspect === "4:3", "aspect not persisted in T.store");
  const rec = T.dck.files.create("Aspect deck");
  assert(rec.deck.aspect === "4:3", "new deck did not take the aspect setting");
  T.dck.openDeck(rec.id);
  assert($("dck-stage").style.aspectRatio === "4 / 3",
    "stage aspect not applied, got " + $("dck-stage").style.aspectRatio);
  sel.value = "16:9";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const rec2 = T.dck.files.create("Wide deck");
  assert(rec2.deck.aspect === "16:9", "default aspect not restored on new decks");
  $("dck-settings-close").click();
  return true;
});

check("spellcheck setting toggles spellcheck on editing surfaces", () => {
  const rec = T.dck.files.create("Spell deck");
  T.dck.openDeck(rec.id);
  T.dck.insertBlock("text", { html: "Hello" });
  T.dck.insertBlock("bullets", { items: ["Point"] });
  const textSpell = () => {
    const n = $("dck-stage").querySelector(".dck-b-text");
    return n ? n.spellcheck : null;
  };
  const liSpell = () => {
    const li = $("dck-stage").querySelector(".dck-b-bullets li");
    return li ? li.spellcheck : null;
  };
  assert(textSpell() === true, "spellcheck should default on");
  assert(liSpell() === true, "bullets spellcheck should default on");
  $("dck-settings-btn").click();
  const cb = $("dck-set-spellcheck");
  cb.checked = false;
  cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(T.store.get("dck", "settings").spellcheck === false, "not persisted");
  assert(textSpell() === false, "text surface still spellchecked after disable");
  assert(liSpell() === false, "bullets surface still spellchecked after disable");
  cb.checked = true;
  cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(textSpell() === true, "text surface not spellchecked after re-enable");
  assert(liSpell() === true, "bullets surface not spellchecked after re-enable");
  $("dck-settings-close").click();
  return true;
});

check("presenter timer setting shows/hides the elapsed timer", () => {
  const rec = T.dck.files.create("Timer deck");
  T.dck.openDeck(rec.id);
  $("dck-settings-btn").click();
  const cb = $("dck-set-timer");
  cb.checked = false;
  cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(T.store.get("dck", "settings").timer === false, "not persisted");
  T.dck.present();
  const t = $("dck-p-timer");
  assert(t && t.style.display === "none", "timer not hidden");
  T.dck.exitPresent();
  cb.checked = true;
  cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  T.dck.present();
  const t2 = $("dck-p-timer");
  assert(t2 && t2.style.display !== "none", "timer hidden when it should show");
  T.dck.exitPresent();
  return true;
});

check("transition setting is used in presenter mode", () => {
  $("dck-settings-btn").click();
  const sel = $("dck-set-transition");
  sel.value = "slide";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(T.store.get("dck", "settings").transition === "slide", "not persisted");
  const rec = T.dck.files.create("Transition deck");
  assert(rec.deck.transition === "slide-left", "new deck transition, got " + rec.deck.transition);
  T.dck.openDeck(rec.id);
  T.dck.present();
  assert($("dck-present-stage").classList.contains("dck-tr-slide-left"),
    "presenter did not use the slide transition");
  T.dck.exitPresent();
  const d = T.dck.currentDeck();
  d.transition = "zoom-in";
  T.dck.saveNow();
  T.dck.present();
  assert($("dck-present-stage").classList.contains("dck-tr-zoom-in"),
    "per-deck transition choice was overridden");
  T.dck.exitPresent();
  sel.value = "fade";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  return true;
});

check("T.dck.files API shape", () => {
  ["list", "create", "rename", "duplicate", "remove", "open"].forEach((k) => {
    assert(typeof T.dck.files[k] === "function", "missing files." + k);
  });
  return true;
});

check("files: create/list/rename/duplicate/remove round-trip", () => {
  const rec = T.dck.files.create("CRUD deck");
  assert(rec && rec.id && rec.name === "CRUD deck" && rec.updatedAt, "create record shape");
  assert(rec.deck && rec.deck.title === "CRUD deck", "record must carry the deck payload");
  assert(rec.slides === 1, "record slide count, got " + rec.slides);
  let ids = T.dck.files.list().map((r) => r.id);
  assert(ids.indexOf(rec.id) >= 0, "list missing the created deck");
  const renamed = T.dck.files.rename(rec.id, "CRUD renamed");
  assert(renamed && renamed.name === "CRUD renamed", "rename record");
  assert(T.store.get("dck", "decks")[rec.id].title === "CRUD renamed", "rename not persisted");
  const dup = T.dck.files.duplicate(rec.id);
  assert(dup && dup.id !== rec.id, "duplicate id");
  assert(dup.name === "CRUD renamed copy", "duplicate name, got " + dup.name);
  assert(T.store.get("dck", "decks")[dup.id], "duplicate not persisted");
  assert(T.dck.files.rename("no-such-id", "x") === null, "rename of missing deck should be null");
  assert(T.dck.files.duplicate("no-such-id") === null, "duplicate of missing deck should be null");
  window.modalResult = null; // cancel the confirm
  return T.dck.files.remove(dup.id).then((ok) => {
    assert(ok === false, "cancel should resolve false");
    assert(T.store.get("dck", "decks")[dup.id], "cancelled delete removed the deck");
    window.modalResult = {}; // confirm the delete
    return T.dck.files.remove(dup.id);
  }).then((ok2) => {
    assert(ok2 === true, "confirm should resolve true");
    assert(!T.store.get("dck", "decks")[dup.id], "deck not removed from store");
    const ids2 = T.dck.files.list().map((r) => r.id);
    assert(ids2.indexOf(dup.id) < 0, "removed deck still listed");
    assert(ids2.indexOf(rec.id) >= 0, "the wrong deck was removed");
    delete window.modalResult;
    return true;
  });
});

check("homescreen: New deck button, file actions, NXT footer", () => {
  T.dck.show();
  $("dck-back").click(); // back to the DCK homescreen from the editor
  assert($("dck-new-deck"), "no New deck button");
  const foot = $("dck-home-footer");
  assert(foot && foot.textContent.indexOf("NXT OS") >= 0, "footer lacks NXT OS");
  const rec = T.dck.files.create("UI deck");
  $("dck-home-search").dispatchEvent(new window.Event("input", { bubbles: true }));
  ["open", "rename", "dup", "del"].forEach((sfx) => {
    assert($("dck-file-" + sfx + "-" + rec.id), "missing file action button: " + sfx);
  });
  const before = T.dck.files.list().length;
  $("dck-file-dup-" + rec.id).click();
  assert(T.dck.files.list().length === before + 1, "card duplicate did not add a file");
  T.dck.show();
  window.modalResult = { name: "UI deck renamed" };
  $("dck-file-rename-" + rec.id).click();
  return new Promise((res) => setTimeout(res, 20)).then(() => {
    assert(T.store.get("dck", "decks")[rec.id].title === "UI deck renamed",
      "card rename did not persist");
    window.modalResult = {}; // confirm the delete
    $("dck-file-del-" + rec.id).click();
    return new Promise((res2) => setTimeout(res2, 20));
  }).then(() => {
    assert(!T.store.get("dck", "decks")[rec.id], "card delete did not remove the deck");
    delete window.modalResult;
    return true;
  });
});

check("New deck button creates and opens a deck", () => {
  T.dck.show();
  $("dck-new-deck").click();
  const d = T.dck.currentDeck();
  assert(d, "no current deck after New deck");
  assert($("dck-editor").style.display !== "none", "editor not opened");
  return true;
});

/* ---------------- phase B: UI polish regressions ---------------- */

check("topbar Present button: labeled, 44px, launches presenter mode", () => {
  const rec = T.dck.files.create("Present deck");
  T.dck.openDeck(rec.id);
  const btn = $("dck-topbar-presentbtn");
  assert(btn, "no #dck-topbar-presentbtn");
  assert(btn.textContent.trim() === "Present", "label, got " + btn.textContent);
  assert(btn.classList.contains("dck-btn") && btn.classList.contains("dck-btn-accent"),
    "topbar Present button must be a prominent accent dck-btn");
  assert(btn.getAttribute("aria-label") === "Present the current deck", "aria-label");
  btn.click();
  const ov = $("dck-present");
  assert(ov, "presenter overlay not opened by topbar Present button");
  assert($("dck-present-stage"), "no presenter stage");
  T.dck.exitPresent();
  assert(!$("dck-present"), "presenter overlay did not close");
  return true;
});

check("inspector sheet: toggle opens, handle + close exist, close closes", () => {
  T.dck.show();
  const insp = $("dck-inspector");
  assert(insp, "no #dck-inspector");
  assert(insp.classList.contains("nxt-sheet"), "inspector missing nxt-sheet class");
  const tgl = $("dck-insp-toggle");
  assert(tgl, "no #dck-insp-toggle");
  assert(tgl.textContent.trim() === "Inspector", "toggle label, got " + tgl.textContent);
  assert(!insp.classList.contains("sheet-open"), "sheet should start closed");
  tgl.click();
  assert(insp.classList.contains("sheet-open"), "toggle did not open the sheet");
  assert(tgl.getAttribute("aria-expanded") === "true", "aria-expanded not set to true");
  const handle = insp.querySelector(".nxt-sheet-handle");
  assert(handle, "no sheet handle");
  const close = $("dck-inspector-close");
  assert(close, "no #dck-inspector-close");
  assert(close.getAttribute("aria-label") === "Close inspector", "close aria-label");
  close.click();
  assert(!insp.classList.contains("sheet-open"), "close did not close the sheet");
  assert(tgl.getAttribute("aria-expanded") === "false", "aria-expanded not reset");
  assert(typeof T.dck.toggleInspector === "function", "T.dck.toggleInspector missing");
  T.dck.toggleInspector(true);
  assert(T.dck.inspectorOpen() === true, "toggleInspector(true) failed");
  T.dck.toggleInspector(false);
  assert(T.dck.inspectorOpen() === false, "toggleInspector(false) failed");
  return true;
});

check("inspector width rule at the 1024px breakpoint is 240px", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/dck.css"), "utf8");
  const m = css.match(/@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{([\s\S]*?)\}\s*@media/);
  assert(m, "1024px media query not found");
  assert(/\.dck-inspector\s*\{\s*width:\s*240px;/.test(m[1]),
    "inspector not 240px at 1024px");
  return true;
});

check("skeleton loader and bottom-sheet CSS are present", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/dck.css"), "utf8");
  assert(css.indexOf(".nxt-skeleton") >= 0, "no .nxt-skeleton rule");
  assert(css.indexOf("nxt-shimmer") >= 0, "no shimmer keyframes");
  assert(css.indexOf("linear-gradient(100deg, transparent 20%, rgba(255,255,255,.45) 50%, transparent 80%)") >= 0,
    "shimmer gradient differs from the shared spec");
  assert(css.indexOf(".nxt-sheet") >= 0, "no .nxt-sheet rule");
  assert(css.indexOf(".nxt-sheet-handle") >= 0, "no sheet handle rule");
  assert(css.indexOf("max-height: 70vh") >= 0, "sheet max-height missing");
  return true;
});

check("primary buttons meet the 44px touch target in CSS", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/dck.css"), "utf8");
  const m = css.match(/\.dck-btn\s*\{([^}]*)\}/);
  assert(m && /min-height:\s*44px/.test(m[1]), ".dck-btn not 44px min-height");
  const ms = css.match(/\.dck-btn-small\s*\{([^}]*)\}/);
  assert(ms && /min-height:\s*44px/.test(ms[1]), ".dck-btn-small not 44px min-height");
  assert(/\.dck-swatch\s*\{[^}]*width:\s*44px/.test(css), ".dck-swatch not 44px");
  assert(/\.dck-layout-sel\s*\{[^}]*min-height:\s*44px/.test(css), ".dck-layout-sel not 44px");
  return true;
});

check("topbar meets the unified spec in CSS", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/dck.css"), "utf8");
  const m = css.match(/\.dck-topbar\s*\{([^}]*)\}/);
  assert(m && /min-height:\s*56px/.test(m[1]), "topbar not 56px min-height");
  assert(m && /padding:\s*6px 12px/.test(m[1]), "topbar padding not 6px 12px");
  const badge = css.match(/\.dck-topbar\s+\.app-badge\s*\{([^}]*)\}/);
  assert(badge && /width:\s*44px/.test(badge[1]) && /height:\s*44px/.test(badge[1]),
    "topbar badge not 44px");
  const name = css.match(/\.dck-topbar-name\s*\{([^}]*)\}/);
  assert(name && /font-weight:\s*800/.test(name[1]), "topbar title not weight 800");
  return true;
});

check("no sub-11px font sizes remain in dck.css", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/dck.css"), "utf8");
  const bad = [];
  // .dck-mini .dck-block is a scaled-down visual slide miniature, not
  // readable UI text, so it is exempt from the type scale.
  const exempt = css.match(/\.dck-mini\s+\.dck-block\s*\{[^}]*\}/);
  const probe = exempt ? css.replace(exempt[0], "") : css;
  const re = /font-size:\s*(clamp\(\s*)?(\d+(?:\.\d+)?)px/g;
  let mm;
  while ((mm = re.exec(probe)) !== null) {
    if (parseFloat(mm[2]) < 11) bad.push(mm[0]);
  }
  assert(bad.length === 0, "sub-11px font sizes: " + bad.slice(0, 5).join(", "));
  return true;
});

check("no nonstandard border radii (4/7/8/9/12px) remain in dck.css", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/dck.css"), "utf8");
  const bad = [];
  const re = /border-radius:\s*([^;]+);/g;
  let mm;
  while ((mm = re.exec(css)) !== null) {
    const v = mm[1].trim();
    if (/\b(4|7|8|9|12)px\b/.test(v) && v !== "50%") bad.push(v);
  }
  assert(bad.length === 0, "nonstandard radii: " + bad.slice(0, 5).join(", "));
  return true;
});

Promise.all(pendingAsync).then(() => {
  console.log(failures.length ? "\n" + failures.length + " FAILURES: " + failures.join(", ") : "\nALL DCK TESTS PASSED");
  process.exit(failures.length ? 1 : 0);
});
