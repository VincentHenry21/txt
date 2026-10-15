/* TXT track-changes regression tests: consecutive deletions.
   - double/triple backspace merges into ONE <del>
   - backspace, type, backspace keeps SEPARATE dels
   - forward Delete merges the same way
   - nothing is ever deleted untracked when Track Changes is on
   Drives the real app path: synthetic beforeinput events on the sheet.
   When the handler does not preventDefault, nativeBackspace/nativeDeleteFwd
   model what the browser would do natively (Chrome deletes the char), so a
   test fails if a deletion escapes tracking.
   Run: NODE_PATH=<jsdom> node test/track-changes.test.js */
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
    if (window.document) window.document.execCommand = () => true;
  }
});
const { window } = dom;
window.document.execCommand = () => true;
if (window.Element && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = function () {};
}
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
    const $$ = (s, r) => Array.prototype.slice.call((r || sheet()).querySelectorAll(s));

    function setCaret(node, offset) {
      const r = doc.createRange();
      r.setStart(node, offset);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    function fire(type, data) {
      const ev = new window.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: type, data: data || null });
      sheet().dispatchEvent(ev);
      return ev;
    }
    // Model of the browser's native editing when our handler bails out
    // without preventDefault: delete the char adjacent to the caret.
    function textBeforeCaret(sh) {
      const s = window.getSelection();
      if (!s.rangeCount) return null;
      const caret = s.getRangeAt(0);
      const tw = doc.createTreeWalker(sh, window.NodeFilter.SHOW_TEXT);
      let n, cand = null;
      while ((n = tw.nextNode())) {
        if (!n.nodeValue.length) continue;
        const rr = doc.createRange();
        rr.selectNode(n);
        if (rr.compareBoundaryPoints(window.Range.END_TO_START, caret) <= 0) cand = n;
        else break;
      }
      return cand;
    }
    function nativeBackspace(sh) {
      const cand = textBeforeCaret(sh);
      if (!cand) return;
      cand.nodeValue = cand.nodeValue.slice(0, -1);
      const r = doc.createRange();
      r.setStart(cand, cand.nodeValue.length);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    function nativeDeleteFwd(sh) {
      const s = window.getSelection();
      if (!s.rangeCount) return;
      const caret = s.getRangeAt(0);
      const tw = doc.createTreeWalker(sh, window.NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (!n.nodeValue.length) continue;
        const rr = doc.createRange();
        rr.selectNode(n);
        if (rr.compareBoundaryPoints(window.Range.START_TO_START, caret) >= 0) {
          n.nodeValue = n.nodeValue.slice(1);
          return;
        }
      }
    }
    function backspace() {
      const ev = fire("deleteContentBackward", null);
      if (!ev.defaultPrevented) nativeBackspace(sheet());
      return ev.defaultPrevented;
    }
    function delFwd() {
      const ev = fire("deleteContentForward", null);
      if (!ev.defaultPrevented) nativeDeleteFwd(sheet());
      return ev.defaultPrevented;
    }
    function freshPara() {
      const p = doc.createElement("p");
      sheet().appendChild(p);
      const tn = doc.createTextNode("");
      p.appendChild(tn);
      setCaret(tn, 0);
      return p;
    }
    function type(p, word) {
      word.split("").forEach((ch) => { fire("insertText", ch); });
    }
    function delTexts(p) {
      return $$("del.tracked-delete", p).map((d) => d.textContent);
    }

    T.changes.set(true);

    console.log("-- consecutive deletions --");
    check("double backspace merges into one del", () => {
      const p = freshPara();
      type(p, "hello");
      assert(backspace() === true, "1st backspace not tracked");
      assert(backspace() === true, "2nd backspace not tracked");
      const dels = $$("del.tracked-delete", p);
      assert(dels.length === 1, "expected 1 merged del, got " + dels.length);
      assert(dels[0].textContent === "lo", "merged text: " + dels[0].textContent);
      assert(p.textContent === "hello", "chars lost: " + p.textContent);
      return true;
    });

    check("triple backspace merges into one del", () => {
      const p = freshPara();
      type(p, "hello");
      backspace(); backspace();
      assert(backspace() === true, "3rd backspace not tracked");
      const dels = $$("del.tracked-delete", p);
      assert(dels.length === 1, "expected 1 merged del, got " + dels.length);
      assert(dels[0].textContent === "llo", "merged text: " + dels[0].textContent);
      return true;
    });

    check("backspace, type, backspace keeps separate dels", () => {
      const p = freshPara();
      type(p, "hello");
      backspace();
      fire("insertText", "x");
      assert(backspace() === true, "backspace after typing not tracked");
      const texts = delTexts(p).sort();
      assert(texts.length === 2, "expected 2 dels, got " + texts.length);
      assert(texts[0] === "o" && texts[1] === "x", "del texts: " + JSON.stringify(texts));
      return true;
    });

    check("double forward-Delete merges into one del", () => {
      const p = freshPara();
      type(p, "hello");
      const ins = p.querySelector("ins.tracked-insert");
      setCaret(ins.firstChild, 0);
      assert(delFwd() === true, "1st Delete not tracked");
      assert(delFwd() === true, "2nd Delete not tracked");
      const dels = $$("del.tracked-delete", p);
      assert(dels.length === 1, "expected 1 merged del, got " + dels.length);
      assert(dels[0].textContent === "he", "merged text: " + dels[0].textContent);
      assert(p.textContent === "hello", "chars lost: " + p.textContent);
      return true;
    });

    check("merged del keeps author tooltip", () => {
      const p = freshPara();
      type(p, "hello");
      backspace(); backspace();
      const del = p.querySelector("del.tracked-delete");
      assert(del.getAttribute("data-author") === "You", "author: " + del.getAttribute("data-author"));
      assert(/^You - \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(del.getAttribute("title")),
        "title: " + del.getAttribute("title"));
      return true;
    });

    check("changes.list reflects the merged del", () => {
      const before = T.changes.list().filter((c) => c.type === "del").length;
      const p = freshPara();
      type(p, "hello");
      backspace(); backspace();
      const after = T.changes.list().filter((c) => c.type === "del").length;
      assert(after === before + 1, "list del count went " + before + " -> " + after);
      return true;
    });

    check("forward Delete at end of block does not eat document start", () => {
      const p = freshPara();
      type(p, "abc");
      const ins = p.querySelector("ins.tracked-insert");
      setCaret(ins.firstChild, 3);
      const delsBefore = T.changes.list().filter((c) => c.type === "del").length;
      const prevented = delFwd();
      const delsAfter = T.changes.list().filter((c) => c.type === "del").length;
      assert(prevented === false, "should leave block-boundary deletes to native");
      assert(delsAfter === delsBefore, "a del was created from the wrong place");
      return true;
    });

    T.changes.set(false);
    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL TRACK-CHANGES TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 800);
});
