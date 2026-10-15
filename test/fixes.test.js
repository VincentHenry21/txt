/* TXT QA regression test: verifies the fixes for the v4 live-QA failures.
   - track changes: insertions merge into one <ins>, deletions wrap in <del>
   - undo: T.cmd("fmt.fontSize") then T.history.undo() restores
   - TOC: entries use real heading text
   - palette: "dark" matches a theme command
   Run: NODE_PATH=<jsdom> node test/fixes.test.js */
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
// localStorage stub
if (!window.localStorage) {
  const store = {};
  window.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
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
    const sheet = () => T.editor.sheetEl();

    function setCaret(node, offset) {
      const r = doc.createRange();
      r.setStart(node, offset);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    function fireBeforeInput(type, data) {
      const sh = sheet();
      let ev;
      try {
        ev = new window.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: type, data: data || null });
      } catch (e) {
        ev = doc.createEvent("Event");
        ev.initEvent("beforeinput", true, true);
        ev.inputType = type;
        ev.data = data || null;
      }
      sh.dispatchEvent(ev);
      return ev;
    }

    console.log("-- track changes --");
    T.changes.set(true);
    check("badge state on", () => T.changes.isOn() === true);

    // type "Hi" as two keystrokes at end of first paragraph
    const p = sheet().querySelector("p");
    const tn = doc.createTextNode("");
    p.appendChild(tn);
    setCaret(tn, 0);
    fireBeforeInput("insertText", "H");
    fireBeforeInput("insertText", "i");
    check("insertions merged into one ins", () => {
      const ins = sheet().querySelectorAll("ins.tracked-insert");
      assert(ins.length === 1, "expected 1 ins, got " + ins.length);
      assert(ins[0].textContent === "Hi", "got: " + ins[0].textContent);
      assert(ins[0].getAttribute("title"), "missing title tooltip");
      return true;
    });
    check("no ::after author text injected", () => {
      // author must not appear as visible text inside ins
      const ins = sheet().querySelector("ins.tracked-insert");
      assert(ins.textContent === "Hi", "textContent polluted: " + ins.textContent);
      return true;
    });

    // delete one char backward with collapsed caret at end of "Hi"
    const insEl = sheet().querySelector("ins.tracked-insert");
    const tnode = insEl.firstChild;
    setCaret(tnode, tnode.nodeValue.length);
    fireBeforeInput("deleteContentBackward", null);
    check("deletion wrapped in del", () => {
      const del = sheet().querySelector("del.tracked-delete");
      assert(del, "no del found");
      assert(del.textContent === "i", "del text: " + del.textContent);
      // del nests inside the ins ("H" kept as inserted, "i" as deleted): correct
      assert(insEl.childNodes[0].nodeValue === "H", "ins head: " + insEl.childNodes[0].nodeValue);
      assert(del.parentNode === insEl, "del should nest in the ins");
      return true;
    });

    check("acceptAll resolves cleanly", () => {
      T.changes.acceptAll();
      assert(!sheet().querySelector("ins.tracked-insert"), "ins remains");
      assert(!sheet().querySelector("del.tracked-delete"), "del remains");
      return true;
    });
    T.changes.set(false);

    console.log("-- undo --");
    check("fmt.fontSize is undoable", () => {
      const before = sheet().innerHTML;
      // select all text in first paragraph
      const p1 = sheet().querySelector("p");
      const r = doc.createRange();
      r.selectNodeContents(p1);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      T.cmd("fmt.fontSize", "24");
      const after = sheet().innerHTML;
      assert(after !== before, "no change applied");
      assert(/font-size:\s*32px/.test(after), "expected 32px (24pt): " + after.slice(0, 200));
      assert(!/xxx-large/.test(after), "xxx-large leaked");
      T.cmd("doc.undo");
      assert(sheet().innerHTML === before, "undo did not restore");
      T.cmd("doc.redo");
      assert(sheet().innerHTML === after, "redo did not re-apply");
      T.cmd("doc.undo");
      return true;
    });

    console.log("-- TOC --");
    check("TOC uses real heading texts", () => {
      T.cmd("refs.toc");
      const toc = sheet().querySelector(".toc-block");
      assert(toc, "no toc block");
      const links = Array.prototype.map.call(toc.querySelectorAll(".toc-line a"), (a) => a.textContent);
      assert(links.length >= 3, "only " + links.length + " entries");
      assert(links.indexOf("Executive Summary") >= 0, "missing real heading: " + JSON.stringify(links));
      assert(links.every((t) => !/^Heading \d$/.test(t)), "generic entry present: " + JSON.stringify(links));
      return true;
    });

    console.log("-- palette keywords --");
    check("'dark' matches a theme command", () => {
      const all = T.listCommands();
      const hit = all.filter((c) => ((c.title + " " + c.name + " " + (c.match || "")).toLowerCase().indexOf("dark") >= 0));
      assert(hit.length > 0, "no command matches 'dark'");
      return true;
    });

    console.log("-- table block insert --");
    check("table inserts after block, not inside heading", () => {
      const h1 = sheet().querySelector("h1");
      // caret at end of h1's last text node (h1 starts with a seeded comment span)
      const tw = doc.createTreeWalker(h1, window.NodeFilter.SHOW_TEXT);
      let last = null, n;
      while ((n = tw.nextNode())) last = n;
      assert(last, "no text in h1");
      const r = doc.createRange();
      r.setStart(last, last.nodeValue.length);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      const tablesBefore = sheet().querySelectorAll("table.txt-table").length; // showcase has a metrics table
      T.cmd("table.insert", 2, 2);
      const tbls = sheet().querySelectorAll("table.txt-table");
      assert(tbls.length === tablesBefore + 1, "table not inserted");
      const fresh = h1.nextElementSibling;
      assert(fresh && fresh.tagName === "TABLE" && fresh.classList.contains("txt-table"),
        "table not right after h1; got " + (fresh && fresh.tagName));
      assert(fresh.parentNode === sheet(), "table nested: " + fresh.parentNode.tagName);
      T.cmd("doc.undo");
      assert(sheet().querySelectorAll("table.txt-table").length === tablesBefore, "undo did not remove table");
      return true;
    });

    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL FIX TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 800);
});
