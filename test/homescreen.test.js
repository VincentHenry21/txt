/* TXT homescreen test (jsdom): boots the full app from index.html in script
   order, then asserts the start view contract, search, templates, recents,
   import wiring, and the home navigation buttons.
   Run: NODE_PATH=<jsdom> node test/homescreen.test.js */
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
function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

window.addEventListener("load", () => {
  setTimeout(async () => {
    const T = window.TXT;
    const doc = window.document;
    const $ = (s, r) => (r || doc).querySelector(s);
    const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
    const hs = () => $("#homescreen");
    const searchEl = () => $("#hsSearch");

    function setSearch(v) {
      const s = searchEl();
      s.value = v;
      s.dispatchEvent(new window.Event("input", { bubbles: true }));
    }
    function keyOnSearch(key) {
      searchEl().dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }

    console.log("-- contract --");
    check("T.homescreen exposed with show/hide/isVisible", () => {
      assert(T.homescreen, "missing");
      assert(typeof T.homescreen.show === "function", "no show");
      assert(typeof T.homescreen.hide === "function", "no hide");
      assert(typeof T.homescreen.isVisible === "function", "no isVisible");
      return true;
    });
    check("#homescreen inside #view-word", () => {
      assert(hs(), "no #homescreen");
      assert($("#view-word").contains(hs()), "not inside #view-word");
      return true;
    });
    check("login visible at boot when signed out (not txt homescreen)", () => {
      assert(T.nxtLogin.isVisible() === true, "login not visible at boot");
      assert(!doc.getElementById("view-login").classList.contains("hidden"), "view-login has .hidden");
      assert(doc.getElementById("view-home").classList.contains("hidden"), "view-home visible at boot");
      assert(T.homescreen.isVisible() === false, "txt homescreen should be hidden at boot");
      T.store.set("nxt", "username", "HSTest");
      T.nxthome.show();
      return true;
    });
    check("openApp txt shows word view without forcing its homescreen", () => {
      T.ecosystem.openApp("txt");
      assert(!doc.getElementById("view-word").classList.contains("hidden"), "view-word hidden");
      assert(doc.getElementById("view-home").classList.contains("hidden"), "view-home still visible");
      T.nxthome.show();
      return true;
    });
    check("hide/show roundtrip", () => {
      T.homescreen.hide();
      assert(T.homescreen.isVisible() === false, "still visible");
      assert(hs().classList.contains("hidden"), "no .hidden");
      T.homescreen.show();
      assert(T.homescreen.isVisible() === true, "not visible after show");
      return true;
    });

    console.log("-- templates --");
    check("template card count equals T.templates.all.length", () => {
      const n = T.templates.all.length;
      assert(n >= 6, "expected >= 6 templates, got " + n);
      assert($$(".hs-tpl-card").length === n, "cards=" + $$(".hs-tpl-card").length + " templates=" + n);
      return true;
    });
    check("search filters templates", () => {
      setSearch("blank");
      const cards = $$(".hs-tpl-card");
      assert(cards.length === 1, "expected 1 card, got " + cards.length);
      assert(cards[0].textContent.toLowerCase().indexOf("blank") >= 0, "wrong card");
      setSearch("");
      assert($$(".hs-tpl-card").length === T.templates.all.length, "not restored");
      return true;
    });
    check("clicking a template card opens it and hides homescreen", () => {
      T.homescreen.show();
      const card = $$(".hs-tpl-card")[1];
      const name = card.querySelector(".hs-tpl-name").textContent.trim();
      card.click();
      assert(T.homescreen.isVisible() === false, "homescreen still visible");
      assert(T.editor.getDoc().title === name, "doc title=" + T.editor.getDoc().title + " card=" + name);
      return true;
    });
    check("Enter opens first filtered result", () => {
      T.homescreen.show();
      setSearch("blank");
      keyOnSearch("Enter");
      assert(T.homescreen.isVisible() === false, "homescreen still visible");
      assert(T.editor.getDoc().title === "Blank Document", "title=" + T.editor.getDoc().title);
      return true;
    });
    check("Escape clears the search", () => {
      T.homescreen.show();
      setSearch("zzz-no-match");
      assert($$(".hs-tpl-card").length === 0, "cards not filtered out");
      keyOnSearch("Escape");
      assert(searchEl().value === "", "search not cleared");
      assert($$(".hs-tpl-card").length === T.templates.all.length, "cards not restored");
      return true;
    });

    console.log("-- recents --");
    check("recent rows render with meta", () => {
      T.homescreen.show();
      setSearch("");
      const rows = $$(".hs-rec-row");
      assert(rows.length >= 1, "no recent rows");
      const first = rows[0];
      assert(first.querySelector(".hs-rec-title"), "no title");
      assert(first.querySelector(".hs-rec-meta"), "no meta");
      assert(first.querySelector(".hs-open"), "no Open button");
      assert(first.querySelector(".hs-del"), "no delete button");
      return true;
    });
    check("search filters recents", () => {
      setSearch("Q4 Product Architecture");
      assert($$(".hs-rec-row").length >= 1, "showcase row not found");
      setSearch("zzz-no-match-xyz");
      assert($$(".hs-rec-row").length === 0, "rows not filtered");
      setSearch("");
      return true;
    });
    check("recent Open opens the doc and hides homescreen", () => {
      T.homescreen.show();
      setSearch("");
      const row = $$(".hs-rec-row")[0];
      const title = row.querySelector(".hs-rec-title").textContent.trim();
      row.querySelector(".hs-open").click();
      assert(T.homescreen.isVisible() === false, "homescreen still visible");
      assert(T.editor.getDoc().title === title, "title mismatch: " + T.editor.getDoc().title);
      return true;
    });
    check("recent delete removes the doc", async () => {
      T.homescreen.show();
      setSearch("");
      const before = (T.state.docs || []).length;
      assert(before >= 1, "no docs to delete");
      const row = $$(".hs-rec-row")[0];
      const id = T.state.docs[0].id;
      T.modal = function () { return Promise.resolve(true); };
      row.querySelector(".hs-del").click();
      await wait(60);
      const gone = (T.state.docs || []).every((d) => d.id !== id);
      assert(gone, "doc still in T.state.docs");
      return true;
    });

    console.log("-- import + navigation --");
    check("Open local file button wired to real import path", () => {
      assert($("#hsOpenFile"), "no #hsOpenFile");
      const fi = $("#hsFileInput");
      assert(fi, "no #hsFileInput");
      assert(fi.getAttribute("accept") === ".txt,.md,.html", "accept=" + fi.getAttribute("accept"));
      assert(T.backstage && typeof T.backstage.openLocal === "function", "T.backstage.openLocal missing");
      return true;
    });
    check("desktop home button shows homescreen", () => {
      const hb = $("#homeBtn");
      assert(hb, "no #homeBtn");
      T.homescreen.hide();
      hb.click();
      assert(T.homescreen.isVisible() === true, "homescreen not shown");
      return true;
    });
    check("mobile #mBack opens homescreen", () => {
      T.homescreen.hide();
      $("#mBack").click();
      assert(T.homescreen.isVisible() === true, "homescreen not shown via mBack");
      return true;
    });
    check("home.show command registered", () => {
      const names = T.listCommands().map((c) => c.name);
      assert(names.indexOf("home.show") >= 0, "missing home.show");
      T.homescreen.hide();
      T.cmd("home.show");
      assert(T.homescreen.isVisible() === true, "command did not show");
      return true;
    });

    console.log("-- hygiene --");
    check("no duplicate IDs in document", () => {
      const seen = {};
      const dupes = [];
      $$("[id]").forEach((n) => {
        if (seen[n.id]) dupes.push(n.id);
        seen[n.id] = 1;
      });
      assert(dupes.length === 0, "dupes: " + dupes.join(","));
      return true;
    });
    check("no emojis in new files", () => {
      const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
      ["css/homescreen.css", "js/homescreen.js"].forEach((f) => {
        const src = fs.readFileSync(path.join(ROOT, f), "utf8");
        assert(!emo.test(src), "emoji found in " + f);
      });
      return true;
    });
    check("no alert() or CSS zoom in new files", () => {
      const css = fs.readFileSync(path.join(ROOT, "css/homescreen.css"), "utf8");
      const js = fs.readFileSync(path.join(ROOT, "js/homescreen.js"), "utf8");
      assert(!/(^|[\s;{])zoom\s*:/m.test(css), "zoom property in css");
      assert(!/\balert\s*\(/.test(js), "alert in js");
      return true;
    });
    check("no em dashes in new files", () => {
      ["css/homescreen.css", "js/homescreen.js"].forEach((f) => {
        const src = fs.readFileSync(path.join(ROOT, f), "utf8");
        assert(src.indexOf("\u2014") < 0, "em dash in " + f);
      });
      return true;
    });

    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL HOMESCREEN TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 900);
});
