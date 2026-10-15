/* NXT OS Ascend integration test: tile registration, view wiring, iframe
   behavior, and button wiring. Loads js/core.js + js/store.js +
   js/nxt-ascend.js in jsdom and drives the real module API, plus
   source-string checks for the ecosystem/home/theme/palette wiring.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/nxt-ascend.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const ASCEND_URL = "https://ascend-study-564.netlify.app";
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("ok   - " + name); }
  else { fail++; console.log("FAIL - " + name); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const dom = new JSDOM("<!DOCTYPE html><html><head></head><body>" +
  '<section id="view-ascend" class="view hidden"></section>' +
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
w.eval(read("js/core.js"));
w.eval(read("js/store.js"));
// stub the neighbours the module touches
w.__opened = null;
w.open = function (url) { w.__opened = url; };
w.eval("TXT.ecosystem = { home: function(){ window.__wentHome = true; } };" +
  "TXT.nxthome = { show: function(){ window.__wentHome = true; } };" +
  "window.__wentHome = false;");
w.eval(read("js/nxt-ascend.js"));

const T = w.TXT;
ok("T.ascend module exists", !!(T && T.ascend));
ok("T.ascend exposes open/close/isOpen/reload/openExternal",
  ["open", "close", "isOpen", "reload", "openExternal"].every(function (k) {
    return T.ascend && typeof T.ascend[k] === "function";
  }));
ok("Ascend URL constant is correct", T.ascend.URL === ASCEND_URL);

// --- open() builds the view ---
T.ascend.open();
const view = w.document.getElementById("view-ascend");
ok("view-ascend section is populated on open", view && view.children.length >= 3);
const frame = view.querySelector("iframe.nxt-asc-frame");
ok("iframe exists with correct src", frame && frame.getAttribute("src") === ASCEND_URL);
const sandbox = (frame && frame.getAttribute("sandbox")) || "";
ok("iframe sandbox has allow-scripts", sandbox.indexOf("allow-scripts") >= 0);
ok("iframe sandbox has allow-same-origin", sandbox.indexOf("allow-same-origin") >= 0);
ok("iframe sandbox has allow-forms", sandbox.indexOf("allow-forms") >= 0);
ok("iframe sandbox has allow-popups", sandbox.indexOf("allow-popups") >= 0);
ok("loading state visible on open", !view.querySelector(".nxt-asc-loading").classList.contains("hidden"));
ok("isOpen() true after open", T.ascend.isOpen() === true);

// --- every visible control works ---
const btns = Array.prototype.slice.call(view.querySelectorAll("button"));
ok("view has real buttons (back, reload, open, retry, open2)", btns.length >= 5);
let threw = false;
try {
  btns.forEach(function (b) { b.click(); });
} catch (e) { threw = true; }
ok("clicking every button throws nothing", !threw);
ok("back button routes home", w.__wentHome === true);
ok("open-in-new-tab calls window.open with Ascend URL", w.__opened === ASCEND_URL);

// --- load event hides loading ---
frame.dispatchEvent(new w.Event("load"));
ok("load event hides the loading overlay",
  view.querySelector(".nxt-asc-loading").classList.contains("hidden"));

// --- timeout path shows the honest error state ---
T.ascend._setLoadTimeout(30);
T.ascend.reload(); // forces a fresh startLoad; the 30ms timer must win
setTimeout(function () {
  const errVisible = !view.querySelector(".nxt-asc-error").classList.contains("hidden");
  ok("load timeout shows the error state", errVisible);
  const retry = view.querySelector(".nxt-asc-retry");
  ok("retry button exists and re-arms loading", (function () {
    retry.click();
    return !view.querySelector(".nxt-asc-loading").classList.contains("hidden");
  })());

  // --- source wiring checks ---
  const eco = read("js/ecosystem.js");
  ok("ecosystem VIEWS includes view-ascend", eco.indexOf('"view-ascend"') >= 0);
  ok("ecosystem APPS includes ascend", /var APPS = \[[^\]]*"ascend"/.test(eco));
  ok("ecosystem VIEW_FOR_APP maps ascend", eco.indexOf('ascend: "view-ascend"') >= 0);
  ok("ecosystem APPS_META has ASC entry", eco.indexOf('id: "ascend", code: "ASC"') >= 0);
  ok("ecosystem openApp hooks T.ascend.open", eco.indexOf("T.ascend.open()") >= 0);

  const home = read("js/nxt-home.js");
  ok("launcher home APPS has Ascend tile", home.indexOf('id: "ascend", code: "ASC"') >= 0);
  ok("Ascend tile uses graduation-cap icon badge", home.indexOf('icon: "cap"') >= 0);

  const theme = read("js/nxt-theme.js");
  ok("nxt-theme whitelist includes ascend", theme.indexOf('"ascend"') >= 0);
  const pal = read("css/nxt-palettes.css");
  ok("palettes define an ascend theme", pal.indexOf('html[data-nxt-app="ascend"]') >= 0);

  const html = read("index.html");
  ok("index.html has the view-ascend section", html.indexOf('id="view-ascend"') >= 0);
  ok("index.html links nxt-ascend.css", html.indexOf("css/nxt-ascend.css") >= 0);
  ok("index.html loads js/nxt-ascend.js", html.indexOf("js/nxt-ascend.js") >= 0);

  const mod = read("js/nxt-ascend.js");
  ok("module copy has no em dashes", mod.indexOf("\u2014") < 0);
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  ok("module copy has no emojis", !emojiRe.test(mod));

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}, 150);
