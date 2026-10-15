/* TXT ecosystem shell test (jsdom): boots the full app with wave-1 shell
   files and asserts store, ecosystem, and word-side listeners.
   Run: NODE_PATH=<jsdom> node test/ecosystem.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "");
html = html.replace(/<link[^>]*rel="preconnect"[^>]*>/g, "");
html = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, "");
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  // Sibling workstream scripts may not be built yet; tolerate missing files.
  let code = "";
  try { code = fs.readFileSync(path.join(ROOT, src), "utf8"); } catch (e) {}
  return '<script data-src="' + src + '">\n' + code + "\n</script>";
});

const dom = new JSDOM(html, {
  url: "https://localhost/",
  pretendToBeVisual: true,
  runScripts: "dangerously",
  beforeParse(window) {
    window.matchMedia = window.matchMedia || (() => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
    }));
    window.SpeechSynthesisUtterance = function (t) { this.text = t || ""; };
    window.speechSynthesis = {
      getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {},
      onvoiceschanged: null, addEventListener() {}
    };
    window.URL.createObjectURL = window.URL.createObjectURL || (() => "blob:test");
    window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});
    if (window.document) window.document.execCommand = () => true;
  }
});
const { window } = dom;
window.document.execCommand = () => true;
if (window.Element && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = function () {};
}

let failures = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error("assertion returned false");
    console.log("  PASS " + name);
  } catch (e) {
    failures.push(name + ": " + (e && e.message));
    console.log("  FAIL " + name + " :: " + (e && e.message));
  }
}
function assert(c, msg) { if (!c) throw new Error(msg || "assert failed"); }

window.addEventListener("load", () => {
  setTimeout(() => {
    const T = window.TXT;
    const doc = window.document;
    const $ = (s, r) => (r || doc).querySelector(s);

    console.log("-- shell presence --");
    check("T.store defined", () => !!T.store);
    check("T.ecosystem defined", () => !!T.ecosystem);
    check("T.ecoword defined", () => !!T.ecoword);
    check("personaSwitch injected with 3 buttons", () => {
      const sw = $("#personaSwitch");
      assert(sw, "no #personaSwitch");
      assert(sw.querySelectorAll("[data-persona]").length === 3, "wrong button count");
      return true;
    });
    check("waffle button injected", () => !!$("#waffleBtn"));
    check("launcher has 6 tiles", () => {
      const tiles = $("#appLauncher").querySelectorAll(".launcher-tile");
      assert(tiles.length === 6, "got " + tiles.length);
      return true;
    });
    check("8 views exist", () => {
      const ids = ["view-word", "view-vector", "view-pixel", "view-grd", "view-dck", "view-mem", "view-pdf", "view-hub"];
      assert(ids.every((id) => $("#" + id)), "missing view");
      assert($("#view-word").querySelector("#topbar"), "topbar not inside view-word");
      assert($("#view-word").querySelector("#app"), "#app not inside view-word");
      return true;
    });
    check("splitWrap structure", () => {
      assert($("#splitWrap") && $("#splitA") && $("#splitB"), "missing split nodes");
      assert(doc.querySelector("#splitWrap .split-div"), "missing divider");
      return true;
    });
    check("carbon option in theme picker", () => {
      const o = $('#themePicker option[value="carbon"]');
      assert(o, "no carbon option");
      assert(o.textContent === "Adobe Pro Carbon", "wrong label: " + o.textContent);
      return true;
    });

    console.log("-- personas --");
    check("default persona word / login gate at boot (signed out)", () => T.ecosystem.persona === "word" && T.ecosystem.app === "login");
    check("ecosystem.login shows the login view", () => {
      T.ecosystem.login();
      assert(T.ecosystem.app === "login", "app=" + T.ecosystem.app);
      assert(!doc.getElementById("view-login").classList.contains("hidden"), "view-login hidden");
      assert(doc.getElementById("view-home").classList.contains("hidden"), "view-home visible");
      return true;
    });
    check("setPersona vector -> carbon + view", () => {
      T.ecosystem.setPersona("vector");
      assert(doc.documentElement.getAttribute("data-theme") === "carbon", "theme=" + doc.documentElement.getAttribute("data-theme"));
      assert(!$("#view-vector").classList.contains("hidden"), "view-vector hidden");
      assert($("#view-word").classList.contains("hidden"), "view-word visible");
      assert(T.ecosystem.persona === "vector", "persona not vector");
      return true;
    });
    check("vector panels survive show() (no innerHTML wipe)", () => {
      const host = doc.getElementById("vPanels");
      assert(host, "no #vPanels");
      assert(host.children.length >= 7, "panels missing after show(), children=" + host.children.length);
      assert(doc.querySelectorAll("#vPanels").length === 1, "duplicate #vPanels");
      return true;
    });
    check("setPersona word restores theme", () => {
      T.ecosystem.setPersona("word");
      assert(doc.documentElement.getAttribute("data-theme") === "studio", "theme=" + doc.documentElement.getAttribute("data-theme"));
      assert(!$("#view-word").classList.contains("hidden"), "view-word hidden");
      return true;
    });
    check("setPersona pixel -> carbon", () => {
      T.ecosystem.setPersona("pixel");
      assert(doc.documentElement.getAttribute("data-theme") === "carbon", "not carbon");
      T.ecosystem.setPersona("word");
      return true;
    });

    console.log("-- apps --");
    check("openApp grd", () => {
      T.ecosystem.openApp("grd");
      assert(T.ecosystem.app === "grd", "app not grd");
      assert(!$("#view-grd").classList.contains("hidden"), "view-grd hidden");
      assert($("#view-word").classList.contains("hidden"), "view-word visible");
      T.ecosystem.openApp("txt");
      assert(T.ecosystem.app === "txt" && T.ecosystem.persona === "word", "not back to txt/word");
      return true;
    });
    check("launcher toggle", () => {
      const la = $("#appLauncher");
      assert(la.classList.contains("hidden"), "launcher visible at start");
      T.ecosystem.toggleLauncher();
      assert(!la.classList.contains("hidden"), "launcher did not open");
      T.ecosystem.toggleLauncher();
      assert(la.classList.contains("hidden"), "launcher did not close");
      return true;
    });

    console.log("-- split --");
    check("setSplit grd moves views", () => {
      T.ecosystem.setSplit("grd");
      assert(!$("#splitWrap").classList.contains("hidden"), "splitWrap hidden");
      assert($("#views").classList.contains("hidden"), "views visible");
      assert($("#splitA").querySelector("#view-word"), "view-word not in splitA");
      assert($("#splitB").querySelector("#view-grd"), "view-grd not in splitB");
      return true;
    });
    check("ratio toggle", () => {
      const sA = $("#splitA");
      T.ecosystem._toggleRatio();
      assert(sA.style.flex.indexOf("65") === 0, "not 65/35: " + sA.style.flex);
      T.ecosystem._toggleRatio();
      assert(sA.style.flex.indexOf("50") === 0, "not 50/50: " + sA.style.flex);
      return true;
    });
    check("setSplit null restores", () => {
      T.ecosystem.setSplit(null);
      assert($("#splitWrap").classList.contains("hidden"), "splitWrap visible");
      assert(!$("#views").classList.contains("hidden"), "views hidden");
      assert($("#views").querySelector("#view-word"), "view-word not restored to #views");
      assert($("#views").querySelector("#view-grd"), "view-grd not restored to #views");
      assert(!$("#view-word").classList.contains("hidden"), "view-word should be visible");
      return true;
    });

    console.log("-- store --");
    check("store set/get roundtrip", () => {
      T.store.set("grd", "cells", { a1: 42 });
      const v = T.store.get("grd", "cells");
      assert(v && v.a1 === 42, "got " + JSON.stringify(v));
      assert(window.localStorage.getItem("TXT_ECOSYSTEM_STORE").indexOf("a1") > 0, "not persisted");
      return true;
    });
    check("store emit fires local listener", () => {
      let got = null;
      T.store.on("test:evt", (d) => { got = d; });
      T.store.emit("test:evt", { x: 1 });
      assert(got && got.x === 1, "listener not fired");
      return true;
    });

    console.log("-- word-side listeners --");
    check("txt:insert-svg creates figure", () => {
      T.store.emit("txt:insert-svg", { id: "v1", svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' });
      const fig = doc.querySelector('figure.vector-block[data-vid="v1"]');
      assert(fig, "no figure");
      assert(fig.querySelector("svg"), "no svg inside");
      assert(fig.querySelector(".vec-edit-btn"), "no edit button");
      T.store.emit("txt:insert-svg", { id: "v1", svg: '<svg viewBox="0 0 10 10"><circle r="5"/></svg>' });
      assert(doc.querySelectorAll('figure.vector-block[data-vid="v1"]').length === 1, "duplicate figures");
      assert(fig.querySelector("circle"), "svg not updated");
      return true;
    });
    check("txt:insert-image creates img", () => {
      T.store.emit("txt:insert-image", { id: "p1", dataUrl: "data:image/png;base64,AAA" });
      const img = doc.querySelector('img[data-pid="p1"]');
      assert(img, "no img");
      assert(img.src.indexOf("data:image/png") === 0, "src not set: " + img.src.slice(0, 30));
      return true;
    });
    check("grd:live creates live block", () => {
      T.store.emit("grd:live", { id: "g1", label: "Budget", html: "<table><tr><td>1</td></tr></table>", values: { a1: 1 } });
      const div = doc.querySelector('div.live-grd[data-grid="g1"]');
      assert(div, "no live block");
      assert(div.querySelector(".live-badge").textContent === "LIVE - GRD", "badge wrong");
      assert(div.querySelector(".live-grd-body table"), "html not inserted");
      T.store.emit("grd:update", { id: "g1", values: { a1: 2 } });
      assert(div.getAttribute("data-values") === JSON.stringify({ a1: 2 }), "values not updated");
      return true;
    });
    check("mem:send inserts text", () => {
      const sh = T.sel.sheet();
      const p = sh.querySelector("p");
      const r = doc.createRange();
      r.setStart(p.firstChild, 0);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      const before = sh.textContent.length;
      T.store.emit("mem:send", { text: "MEMO:" });
      assert(sh.textContent.length === before + 5, "text not inserted");
      return true;
    });
    check("dblclick figure opens Vector Studio (studios loaded)", () => {
      assert(typeof T.vector !== "undefined" && typeof T.vector.setSVG === "function", "T.vector should be loaded");
      const fig = doc.querySelector("figure.vector-block");
      assert(fig, "no figure to dblclick");
      const ev = new window.MouseEvent("dblclick", { bubbles: true, cancelable: true });
      fig.dispatchEvent(ev); // must not throw
      assert(T.ecosystem.persona === "vector", "persona did not switch to vector");
      assert(!doc.getElementById("view-vector").classList.contains("hidden"), "view-vector not shown");
      T.ecosystem.setPersona("word"); // restore for later tests
      return true;
    });

    console.log("-- commands --");
    check("ecosystem commands registered", () => {
      const names = ["persona.word", "persona.vector", "persona.pixel",
        "app.txt", "app.grd", "app.dck", "app.mem", "app.pdf", "app.hub",
        "theme.carbon", "ecosystem.split", "ecosystem.launcher"];
      const all = T.listCommands().map((c) => c.name);
      names.forEach((n) => assert(all.indexOf(n) >= 0, "missing " + n));
      return true;
    });
    check("theme.carbon command", () => {
      T.cmd("theme.carbon");
      assert(doc.documentElement.getAttribute("data-theme") === "carbon", "not carbon");
      T.cmd("theme.light");
      assert(doc.documentElement.getAttribute("data-theme") === "studio", "not restored");
      return true;
    });
    check("ecosystem.split command toggles", () => {
      T.cmd("ecosystem.split");
      assert(!$("#splitWrap").classList.contains("hidden"), "split not on");
      T.cmd("ecosystem.split");
      assert($("#splitWrap").classList.contains("hidden"), "split not off");
      return true;
    });

    console.log("-- mobile launcher --");
    check("mobile waffle button exists", () => {
      const wm = $("#waffleBtnM");
      assert(wm, "no #waffleBtnM");
      assert(wm.parentNode === $("#mTopbar"), "not inside #mTopbar");
      assert(doc.querySelectorAll("#waffleBtn").length === 1, "desktop waffleBtn duplicated or missing");
      assert(doc.querySelectorAll("#waffleBtnM").length === 1, "mobile waffleBtnM duplicated");
      return true;
    });
    check("mobile launcher opens with Studio personas", () => {
      const wm = $("#waffleBtnM");
      wm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      const la = $("#appLauncher");
      assert(!la.classList.contains("hidden"), "launcher did not open");
      const personas = la.querySelectorAll(".launcher-persona");
      assert(personas.length === 3, "expected 3 persona buttons, got " + personas.length);
      const tiles = la.querySelectorAll(".launcher-tile");
      assert(tiles.length >= 6, "expected 6 app tiles, got " + tiles.length);
      return true;
    });
    check("launcher persona button switches to pixel", () => {
      const la = $("#appLauncher");
      const px = Array.prototype.find.call(la.querySelectorAll(".launcher-persona"), function (b) {
        return b.getAttribute("aria-label") === "Pixel studio";
      });
      assert(px, "no Pixel persona button");
      px.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      assert(T.ecosystem.persona === "pixel", "persona did not switch to pixel");
      assert(!$("#view-pixel").classList.contains("hidden"), "view-pixel not shown");
      assert(la.classList.contains("hidden"), "launcher did not close");
      T.ecosystem.setPersona("word");
      return true;
    });

    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL ECOSYSTEM TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 900);
});
