/* NXT OS Tutorials system test: data coverage, structure, progress persistence.
   Loads js/core.js + js/store.js + js/nxt-tutorials-data.js + js/nxt-tutorials.js
   in jsdom and drives the real module API.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/nxt-tutorials.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("ok   - " + name); }
  else { fail++; console.log("FAIL - " + name); }
}
function loadInto(win, rel) {
  win.eval(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function makeWin() {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body>" +
    '<section id="view-tutorials" class="view"></section>' +
    "</body></html>", {
    url: "https://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function () {
        return { matches: false, addListener: function () {}, removeListener: function () {},
                 addEventListener: function () {}, removeEventListener: function () {} };
      };
    }
  });
  const w = dom.window;
  loadInto(w, "js/core.js");
  loadInto(w, "js/store.js");
  // stub ecosystem/bus/logos AFTER core.js (it replaces window.TXT wholesale)
  w.eval("TXT.ecosystem = { openApp: function(){}, setPersona: function(){}, home: function(){}, showTutorials: function(){}, get persona(){ return 'word'; } };" +
    "TXT.bus = { on: function(){}, emit: function(){} };" +
    "TXT.nxtLogos = { get: function(){ return '<svg></svg>'; } };");
  loadInto(w, "js/nxt-tutorials-data.js");
  loadInto(w, "js/nxt-tutorials.js");
  return w;
}

/* ---------- 1. data covers all 8 apps ---------- */
let w = makeWin();
const T = w.TXT;
const EXPECTED = ["txt", "pxl", "vec", "pdf", "grd", "dck", "mem", "hub"];
ok("data exposes T.NXT_TUTORIALS", !!T.NXT_TUTORIALS);
EXPECTED.forEach(function (id) {
  ok("app covered: " + id, !!T.NXT_TUTORIALS[id]);
});

/* ---------- 2. structure: tabs, features, 3+ steps, no empties ---------- */
let totalFeatures = 0, totalTabs = 0;
let structureOk = true, noEmDash = true, noEmoji = true;
EXPECTED.forEach(function (aid) {
  const app = T.NXT_TUTORIALS[aid];
  if (!app.name || !app.code || !app.color || !app.desc) structureOk = false;
  if (!app.open || (app.open.kind !== "app" && app.open.kind !== "persona") || !app.open.id) structureOk = false;
  if (!Array.isArray(app.tabs) || app.tabs.length === 0) structureOk = false;
  app.tabs.forEach(function (t) {
    totalTabs++;
    if (!t.id || !t.title || !Array.isArray(t.features) || t.features.length === 0) structureOk = false;
    t.features.forEach(function (f) {
      totalFeatures++;
      if (!f.id || !f.title || !Array.isArray(f.steps) || f.steps.length < 3) structureOk = false;
      const blob = f.title + " " + f.steps.join(" ") + " " + (f.tip || "");
      if (!blob.trim()) structureOk = false;
      f.steps.forEach(function (s) { if (!s || !s.trim()) structureOk = false; });
      if (blob.indexOf("\u2014") >= 0) noEmDash = false; // em dash
      if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(blob)) noEmoji = false;
    });
  });
});
ok("every app has name/code/color/desc/open/tabs", structureOk);
ok("total tabs >= 24 (got " + totalTabs + ")", totalTabs >= 24);
ok("total features >= 60 (got " + totalFeatures + ")", totalFeatures >= 60);
ok("no em dashes in tutorial copy", noEmDash);
ok("no emojis in tutorial copy", noEmoji);

/* ---------- 3. referenced app ids exist ---------- */
let refsOk = true;
EXPECTED.forEach(function (aid) {
  const app = T.NXT_TUTORIALS[aid];
  if (!T.NXT_TUTORIALS[app.open.id] && ["txt", "grd", "dck", "mem", "pdf", "hub"].indexOf(app.open.id) < 0) {
    // persona ids map to tutorial apps
    if (!{ pixel: "pxl", vector: "vec" }[app.open.id]) refsOk = false;
  }
});
ok("all open targets resolve", refsOk);

/* ---------- 4. viewer builds and renders ---------- */
ok("T.tutorials API exists", !!T.tutorials && typeof T.tutorials.open === "function");
T.tutorials.open("dck");
const view = w.document.getElementById("view-tutorials");
ok("viewer built DOM", !!view.querySelector(".nt-wrap"));
ok("8 app buttons rendered", view.querySelectorAll(".nt-app").length === 8);
ok("search box present", !!view.querySelector(".nt-search"));
const featCount = view.querySelectorAll(".nt-feature").length;
ok("features rendered for dck (" + featCount + ")", featCount > 0);

/* ---------- 5. expand, try-it, mark done ---------- */
function firstFeatureCard() { return view.querySelector(".nt-feature"); }
let card = firstFeatureCard();
card.querySelector(".nt-exp").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
card = firstFeatureCard(); // render() rebuilds the DOM; re-query
const steps = card.querySelectorAll(".nt-steps li");
ok("expanding shows steps (" + steps.length + ")", steps.length >= 3);
let doneBtn = card.querySelector(".nt-donebtn");
const before = doneBtn.textContent;
doneBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
card = firstFeatureCard();
ok("mark done toggles label", card.querySelector(".nt-donebtn").textContent !== before);
// progress persisted in T.store
const prog = T.store.get("nxt", "tutorialProgress");
const keys = Object.keys(prog || {});
ok("progress persisted to T.store (" + keys.length + " keys)", keys.length === 1);
// try-it button exists and is wired (ecosystem stubbed)
const tryBtn = firstFeatureCard().querySelector(".nt-try");
ok("Try it button present", !!tryBtn);

/* ---------- 6. search filters across apps ---------- */
let search = view.querySelector(".nt-search");
search.value = "histogram";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const hits = view.querySelectorAll(".nt-feature").length;
ok("search finds histogram features (" + hits + ")", hits > 0);
search.value = "zzz-no-such-feature";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
ok("empty search shows empty state", !!view.querySelector(".nt-empty"));

/* ---------- 7. help button injection ---------- */
w.document.body.insertAdjacentHTML("beforeend",
  '<section id="view-dck" class="view"><div><button type="button" class="icon-btn waffle-btn" id="dck-launcher-btn"></button></div></section>');
T.tutorials._injectHelp();
const helpBtn = w.document.querySelector("#dck-launcher-btn") &&
  w.document.querySelector("#dck-launcher-btn").parentNode.querySelector(".nt-helpbtn");
ok("help button injected next to launcher", !!helpBtn);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
