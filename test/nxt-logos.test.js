/* NXT OS user-supplied app logos test: 8 PNG assets exist, T.appLogos maps
   every app id (renamed from VEC to VAC), and the
   launcher / 9-dot switcher / per-app topbars reference the logos.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/nxt-logos.test.js */
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
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const IDS = ["txt", "grd", "dck", "vac", "pxl", "mem", "hub", "pdf"];

// --- assets on disk ---
IDS.forEach(function (id) {
  const p = path.join(ROOT, "assets", "logos", id + ".png");
  const exists = fs.existsSync(p);
  ok("logo asset exists: assets/logos/" + id + ".png", exists);
  if (exists) {
    const st = fs.statSync(p);
    ok("logo asset non-empty: " + id, st.size > 1000);
    const head = fs.readFileSync(p).slice(0, 8);
    const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    ok("logo asset is a real PNG: " + id, head.equals(pngSig));
  }
});

// --- T.appLogos module ---
const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
  url: "https://localhost/",
  runScripts: "dangerously",
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
w.eval(read("js/nxt-app-logos.js"));
const T = w.TXT;
ok("T.appLogos exists", !!(T && T.appLogos));
IDS.forEach(function (id) {
  ok("T.appLogos maps " + id, T.appLogos && T.appLogos[id] === "assets/logos/" + id + ".png");
});
ok("vac logo mapped", T.appLogos.vac === "assets/logos/vac.png");
ok("ascend has no supplied logo", !T.appLogos.ascend);
ok("T.appLogoImg is a function", typeof T.appLogoImg === "function");
const img = T.appLogoImg("txt");
ok("appLogoImg returns an img element", img && img.tagName === "IMG");
ok("appLogoImg src points at the logo file",
  img && img.getAttribute("src") === "assets/logos/txt.png");
ok("appLogoImg sets an alt label", img && /TXT/i.test(img.getAttribute("alt") || ""));
ok("appLogoImg returns null for unknown id", T.appLogoImg("nope") === null);

// --- wiring in source ---
const indexHtml = read("index.html");
ok("index.html loads css/nxt-logos.css", indexHtml.indexOf("css/nxt-logos.css") >= 0);
ok("index.html loads js/nxt-app-logos.js", indexHtml.indexOf("js/nxt-app-logos.js") >= 0);
ok("nxt-app-logos.js loads before ecosystem.js",
  indexHtml.indexOf("js/nxt-app-logos.js") < indexHtml.indexOf("js/ecosystem.js"));
const home = read("js/nxt-home.js");
ok("nxt-home APPS carry logo fields", /logo:\s*"txt"/.test(home) && /logo:\s*"hub"/.test(home));
ok("nxt-home studios carry vac/pxl logos", /logo:\s*"vac"/.test(home) && /logo:\s*"pxl"/.test(home));
ok("nxt-home tile build uses T.appLogoImg", home.indexOf("T.appLogoImg") >= 0);
ok("nxt-home studio build uses T.appLogoImg", home.indexOf("nxt-studio-logo") >= 0);
const eco = read("js/ecosystem.js");
ok("ecosystem APPS_META carry logo fields", /logo:\s*"grd"/.test(eco) && /logo:\s*"pdf"/.test(eco));
ok("ecosystem launcher uses T.appLogoImg", eco.indexOf("T.appLogoImg") >= 0);
ok("ecosystem launcher tile-logo class present", eco.indexOf("tile-logo") >= 0);
[["js/hub/hub.js", "hub"], ["js/mem/mem.js", "mem"], ["js/pdf/pdf.js", "pdf"],
 ["js/dck/dck.js", "dck"], ["js/grd/grd.js", "grd"]].forEach(function (pair) {
  const src = read(pair[0]);
  ok(pair[0] + " swaps badge to logo", src.indexOf('appLogoImg("' + pair[1] + '")') >= 0);
});
ok("hub topbar badge swaps to logo", read("js/hub/hub.js").indexOf("hubTopLogo") >= 0);
const css = read("css/nxt-logos.css");
ok("css defines white tile for launcher badges", css.indexOf(".nxt-tile-logo") >= 0);
ok("css defines white tile for switcher badges", css.indexOf(".tile-logo") >= 0);
ok("css defines white tile for app badges", css.indexOf(".app-logo-badge") >= 0);
ok("css has no zoom property", !/zoom\s*:/.test(css));
ok("css covers hub topbar badge", css.indexOf(".hub-badge.app-logo-badge") >= 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
