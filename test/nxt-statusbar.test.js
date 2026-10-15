/* NXT OS status-bar credit test (jsdom): every app's bottom status bar must
   contain its "NXT [APP] • Developed by H3NZ" credit, exactly once.
   Run: NODE_PATH=<jsdom> node test/nxt-statusbar.test.js */
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
    /* jsdom without the canvas package returns null from getContext; give the
       app builders a harmless no-op 2d context so view construction succeeds. */
    if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
      window.HTMLCanvasElement.prototype.getContext = function () {
        return new Proxy(function () {}, {
          get: function (t, p) {
            if (p === "canvas") return {};
            return function () { return {}; };
          },
          set: function () { return true; }
        });
      };
    }
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
function countIn(root, text) {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let n = 0, node;
  while ((node = walker.nextNode())) {
    let idx = -1, v = node.nodeValue || "";
    while ((idx = v.indexOf(text, idx + 1)) >= 0) n++;
  }
  return n;
}

window.addEventListener("load", () => {
  setTimeout(() => {
    const T = window.TXT;
    const doc = window.document;
    assert(T && T.ecosystem, "no T.ecosystem");

    console.log("-- status-bar credits --");

    check("TXT status bar has credit", () => {
      const sb = doc.getElementById("statusbar");
      assert(sb, "no #statusbar");
      assert(countIn(sb, "NXT TXT • Developed by H3NZ") === 1, "credit missing/duplicated in #statusbar");
      return true;
    });

    check("PXL status bar has credit", () => {
      T.ecosystem.setPersona("pixel");
      const sb = doc.getElementById("px-statusbar");
      assert(sb, "no #px-statusbar after opening PXL");
      assert(sb.classList.contains("nxt-statusbar"), "missing nxt-statusbar class");
      assert(countIn(sb, "NXT PXL • Developed by H3NZ") === 1, "credit missing/duplicated");
      assert(doc.querySelectorAll("#px-statusbar").length === 1, "duplicate #px-statusbar");
      return true;
    });

    check("PDF status bar has credit", () => {
      T.ecosystem.setPersona("word");
      T.ecosystem.openApp("pdf");
      const sb = doc.getElementById("pdf-statusbar");
      assert(sb, "no #pdf-statusbar after opening PDF");
      assert(countIn(sb, "NXT PDF • Developed by H3NZ") === 1, "credit missing/duplicated");
      return true;
    });

    check("DCK status bar has credit", () => {
      T.ecosystem.openApp("dck");
      const view = doc.getElementById("view-dck");
      assert(view, "no #view-dck");
      const sb = view.querySelector(".nxt-statusbar");
      assert(sb, "no .nxt-statusbar in DCK editor");
      assert(countIn(sb, "NXT DCK • Developed by H3NZ") === 1, "credit missing/duplicated");
      return true;
    });

    check("MEM status bar has credit", () => {
      T.ecosystem.openApp("mem");
      assert(T.mem && typeof T.mem.openBoard === "function", "no T.mem.openBoard");
      T.mem.openBoard();
      const sb = doc.getElementById("mem-boardStatusbar");
      assert(sb, "no #mem-boardStatusbar after opening MEM board");
      assert(countIn(sb, "NXT MEM • Developed by H3NZ") === 1, "credit missing/duplicated");
      return true;
    });

    check("HUB footer has credit", () => {
      T.ecosystem.openApp("hub");
      const c = doc.querySelector(".hub-foot-credit");
      assert(c, "no .hub-foot-credit after opening HUB");
      assert(countIn(c, "NXT HUB • Developed by H3NZ") === 1, "credit missing/duplicated");
      assert(doc.querySelectorAll(".hub-foot-credit").length === 1, "duplicate hub credit");
      return true;
    });

    console.log("-- hygiene --");
    check("no emojis or em dashes in touched files", () => {
      ["js/pixel/core.js", "js/pdf/pdf.js", "js/dck/dck.js", "js/mem/mem.js",
       "js/hub/hub.js", "css/nxt-palettes.css", "css/shell.css"].forEach((f) => {
        const c = fs.readFileSync(path.join(ROOT, f), "utf8");
        assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c), "emoji in " + f);
        assert(c.indexOf("—") < 0, "em dash in " + f);
      });
      return true;
    });

    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL STATUS-BAR TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 1200);
});
