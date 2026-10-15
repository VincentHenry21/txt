/* NXT OS Phase 1 workstream B functional test: boot splash, About modal, H3NZ pill.
   Loads js/core.js + js/nxt-boot.js in jsdom and drives the real module API.
   Run: node test/nxt-boot.test.js (needs jsdom on NODE_PATH, same as other tests). */
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
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
let captured = [], realST = null;
function fireCaptured(ms) {
  const c = captured.filter(function (x) { return x.ms === ms; })[0];
  if (c) c.fn();
}
function loadInto(win, rel) {
  win.eval(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function makeWin(reduced) {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    url: "https://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || (function () {
        return { matches: !!reduced, addListener: function () {}, removeListener: function () {},
                 addEventListener: function () {}, removeEventListener: function () {} };
      });
    }
  });
  const w = dom.window;
  loadInto(w, "js/core.js");
  loadInto(w, "js/nxt-boot.js");
  return w;
}
function byId(w, id) { return w.document.getElementById(id); }
function click(el, w) {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
}
function escKey(w) {
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

/* ---------- 1. module API ---------- */
let w = makeWin(true);
let T = w.TXT;
ok("T.nxtBoot exists", !!T.nxtBoot);
ok("T.nxtBoot has show/step/done/skip/about", T.nxtBoot &&
  ["show", "step", "done", "skip", "about"].every(function (k) { return typeof T.nxtBoot[k] === "function"; }));

/* ---------- 2. splash renders with brand copy and logo fallback ---------- */
T.nxtBoot.show();
let ov = byId(w, "nxtBoot");
ok("show() creates #nxtBoot", !!ov);
ok("wordmark present", ov && ov.textContent.indexOf("NXT OS") >= 0);
ok("byline present", ov && ov.textContent.indexOf("Engineered & Developed by H3NZ") >= 0);
ok("version present", ov && ov.textContent.indexOf("V1.0") >= 0);
ok("logo fallback NXT rendered without T.nxtLogos", ov && !!ov.querySelector(".nxtboot-logo-fallback"));
let bar = ov && ov.querySelector(".nxtboot-bar");
ok("progress bar has progressbar role", bar && bar.getAttribute("role") === "progressbar");
ok("progress starts at 0", bar && bar.getAttribute("aria-valuenow") === "0");

/* ---------- 3. staged steps drive bar + kernel log ---------- */
T.nxtBoot.step("store", 18, "Mounting local store");
ok("step sets bar width", bar.style.width === "" && byId(w, "nxtBoot").querySelector(".nxtboot-fill").style.width === "18%");
ok("step sets aria-valuenow", bar.getAttribute("aria-valuenow") === "18");
ok("kernel log line appears", ov.querySelectorAll(".nxtboot-logline").length === 1 &&
  ov.querySelector(".nxtboot-logline").textContent === "Mounting local store");
T.nxtBoot.step("docs", 45, "Opening documents");
T.nxtBoot.step("studios", 72, "Loading studios");
T.nxtBoot.step("ready", 100, "Ready");
T.nxtBoot.step("x1", 100, "Extra one");
T.nxtBoot.step("x2", 100, "Extra two");
T.nxtBoot.step("x3", 100, "Extra three");
ok("log capped at 4 lines", ov.querySelectorAll(".nxtboot-logline").length === 4);

/* ---------- 4. done() removes the overlay ---------- */
T.nxtBoot.done();
sleep(40).then(function () {
ok("done() removes #nxtBoot", !byId(w, "nxtBoot"));
ok("done() is idempotent", (function () { T.nxtBoot.done(); return !byId(w, "nxtBoot"); })());

/* ---------- 5. click skips ---------- */
w = makeWin(true);
T = w.TXT;
T.nxtBoot.show();
click(byId(w, "nxtBoot"), w);
return sleep(40);
}).then(function () {
ok("click on overlay skips and removes it", !byId(w, "nxtBoot"));

/* ---------- 6. ESC skips ---------- */
w = makeWin(true);
T = w.TXT;
T.nxtBoot.show();
escKey(w);
return sleep(40);
}).then(function () {
ok("ESC skips and removes overlay", !byId(w, "nxtBoot"));

/* ---------- 7. hard timeout forces dismissal (4s) ---------- */
w = makeWin(false);
T = w.TXT;
captured = [];
realST = w.setTimeout.bind(w);
w.setTimeout = function (fn, ms) { captured.push({ fn: fn, ms: ms }); return captured.length; };
w.clearTimeout = function () {};
T.nxtBoot.show();
let hard = captured.filter(function (c) { return c.ms === 4000; });
ok("hard timeout of 4000ms registered", hard.length === 1);
hard[0].fn();
fireCaptured(280);
ok("hard timeout dismisses the overlay", !byId(w, "nxtBoot"));

/* ---------- 8. T.nxtLogos used when available ---------- */
w = makeWin(true);
T = w.TXT;
T.nxtLogos = { get: function (k) { return k === "nxt" ? "<svg><rect/></svg>" : null; } };
T.nxtBoot.show();
ok("workstream A logo used when present", !!byId(w, "nxtBoot").querySelector(".nxtboot-logo svg"));
T.nxtBoot.done();

/* ---------- 9. palette command registered ---------- */
let cmds = T.listCommands();
let c = cmds.filter(function (x) { return x.name === "nxt.about"; })[0];
ok("nxt.about registered", !!c);
ok("nxt.about title/cat/match", c && c.title === "About NXT OS" && c.cat === "NXT OS" &&
  (c.match || "").indexOf("about") >= 0);
ok("nxt.about icon exists in sprite", (function () {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return html.indexOf('id="' + c.icon + '"') >= 0;
})());

/* ---------- 10. About modal opens and closes for real ---------- */
T.nxtBoot.about();
let wrap = w.document.querySelector(".nxtboot-about-wrap");
ok("about() opens modal", !!wrap);
let dlg = wrap && wrap.querySelector(".nxtboot-about");
ok("dialog has role=dialog + aria-modal", dlg && dlg.getAttribute("role") === "dialog" && dlg.getAttribute("aria-modal") === "true");
ok("about shows version", wrap.textContent.indexOf("V1.0") >= 0);
ok("about shows byline", wrap.textContent.indexOf("Engineered & Developed by H3NZ") >= 0);
ok("about lists 8 apps", wrap.querySelectorAll(".nxtboot-about-app").length === 8);
let closeBtn = wrap.querySelector(".nxtboot-about-close");
ok("Close button exists", !!closeBtn);
ok("Close button is 44px tall", w.getComputedStyle(closeBtn).minHeight === "44px" ||
  closeBtn.className === "nxtboot-about-close");
click(closeBtn, w);
ok("Close button closes the modal", !w.document.querySelector(".nxtboot-about-wrap"));

/* ESC close */
T.nxtBoot.about();
escKey(w);
ok("ESC closes about modal", !w.document.querySelector(".nxtboot-about-wrap"));

/* backdrop close */
T.nxtBoot.about();
let bw = w.document.querySelector(".nxtboot-about-wrap");
bw.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
ok("backdrop click closes about modal", !w.document.querySelector(".nxtboot-about-wrap"));

/* focus trap: Tab on single-button dialog keeps focus on Close */
T.nxtBoot.about();
let dw = w.document.querySelector(".nxtboot-about-wrap");
let db = dw.querySelector(".nxtboot-about-close");
ok("Close focused on open", w.document.activeElement === db);
dw.querySelector(".nxtboot-about").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
ok("Tab cycles focus back to Close", w.document.activeElement === db);
click(db, w);

/* ---------- 11. H3NZ pill injected on ecosystem:home ---------- */
let brand = w.document.createElement("div");
brand.className = "nxt-brand";
w.document.body.appendChild(brand);
T.bus.emit("ecosystem:home", {});
let pill = byId(w, "h3nzPill");
ok("pill injected into .nxt-brand", !!pill);
ok("pill copy", pill && pill.textContent === "Developed by H3NZ");
T.bus.emit("ecosystem:home", {});
ok("no duplicate pill on second event", w.document.querySelectorAll("#h3nzPill").length === 1);
click(pill, w);
ok("pill opens About modal", !!w.document.querySelector(".nxtboot-about-wrap"));
w.document.querySelector(".nxtboot-about-close").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
ok("about closed after pill path", !w.document.querySelector(".nxtboot-about-wrap"));

/* ---------- 12. missing T.nxthome never traps: hard timeout still works ---------- */
w = makeWin(false);
T = w.TXT;
ok("no T.nxthome in this harness", !T.nxthome);
captured = [];
w.setTimeout = function (fn, ms) { captured.push({ fn: fn, ms: ms }); return captured.length; };
w.clearTimeout = function () {};
T.nxtBoot.show();
ok("overlay shows even without T.nxthome", !!byId(w, "nxtBoot"));
captured.filter(function (x) { return x.ms === 4000; })[0].fn();
fireCaptured(280);
ok("hard timeout removes overlay without T.nxthome", !byId(w, "nxtBoot"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
});
