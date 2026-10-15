/* TXT flagship boot test (jsdom): loads every script in index.html order,
   stubs browser-only APIs, then asserts services, tabs, commands, and smoke-runs
   one command per ribbon tab. Run: node test/boot.test.js (needs jsdom resolvable). */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// Strip stylesheets/font links (no network in test); inline every local script.
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "");
html = html.replace(/<link[^>]*rel="preconnect"[^>]*>/g, "");
html = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, "");
const scriptOrder = [];
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  // Sibling workstream scripts may not be built yet; tolerate missing files.
  let code = "";
  try { code = fs.readFileSync(path.join(ROOT, src), "utf8"); } catch (e) {}
  scriptOrder.push(src);
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
    if (window.document) {
      window.document.execCommand = () => true;
    }
  }
});
const { window } = dom;

// execCommand + scrollIntoView must exist before scripts run; JSDOM document exists in beforeParse,
// but patch again here for safety (idempotent).
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
function smoke(name, cmdName, args) {
  check("cmd " + name, () => {
    window.TXT.cmd(cmdName, ...(args || []));
    return true;
  });
}

window.addEventListener("load", () => {
  setTimeout(() => {
    console.log("scripts inlined: " + scriptOrder.length);
    const T = window.TXT;
    console.log("-- core --");
    check("window.TXT defined", () => !!T);
    check("9 ribbon tabs registered", () => {
      const ids = ["home", "insert", "draw", "design", "layout", "refs", "review", "view", "access"];
      return ids.every((id) => window.document.querySelector('section[data-panel="' + id + '"]'));
    });
    check("tab buttons = 9", () => window.document.querySelectorAll("#ribbonTabs button").length === 9);

    console.log("-- services --");
    ["ribbon", "inspector", "changes", "comments", "ai", "speech", "a11y", "stats", "ink", "mobile",
     "backstage", "editor", "themes", "exporters", "fonts", "templates", "palette"].forEach((k) => {
      check("T." + k + " defined", () => !!T[k]);
    });
    check("T.ai.ACTIONS has 6", () => T.ai.ACTIONS.length === 6);

    console.log("-- commands --");
    check("every registered command is a function", () => {
      const bad = T.listCommands().filter((c) => typeof c.fn !== "function");
      if (bad.length) throw new Error("bad: " + bad.map((c) => c.name).join(","));
      console.log("    command count: " + T.listCommands().length);
      return true;
    });

    // Ensure a live document/sheet for command smoke tests.
    if (!T.editor.getDoc()) T.editor.newDoc("Boot Test", "<p>Smoke test paragraph.</p>");

    console.log("-- smoke: one command per tab --");
    smoke("home fmt.bold", "fmt.bold");
    smoke("insert pageBreak", "insert.pageBreak");
    smoke("draw pen", "ink.toolPen");
    smoke("draw exit", "ink.exit");
    smoke("design preset", "design.presetCorporate");
    smoke("layout columns2", "layout.columns2");
    smoke("layout columns1", "layout.columns1");
    smoke("refs toc", "refs.toc");
    smoke("review readability", "review.readability");
    smoke("view web", "view.web");
    smoke("view print", "view.print");
    smoke("access check", "a11y.check");
    smoke("speech toggle", "speech.toggle");
    smoke("speech stop", "speech.stop");
    smoke("changes toggle on", "changes.toggle");
    smoke("changes toggle off", "changes.toggle");
    smoke("stats open", "stats.open");
    smoke("export html", "export.html");
    smoke("backstage open", "backstage.open", ["new"]);
    check("backstage close", () => { T.backstage.close(); return true; });
    smoke("doc undo", "doc.undo");
    smoke("ai open", "ai.open");
    check("inspector close", () => { T.inspector.close(); return true; });

    console.log("-- state --");
    check("T.changes.list() is array", () => Array.isArray(T.changes.list()));
    check("T.comments.list() is array", () => Array.isArray(T.comments.list()));
    check("a11y.check() returns array", () => Array.isArray(T.a11y.check()));

    console.log(failures.length ? "\nBOOT TEST FAILED (" + failures.length + ")" : "\nALL BOOT TESTS PASSED");
    failures.forEach((f) => console.log(" - " + f));
    process.exit(failures.length ? 1 : 0);
  }, 400);
});
