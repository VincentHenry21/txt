/* NXT OS home test (jsdom): boots the full app and asserts the
   launcher home is the boot view and its tiles open apps correctly.
   Run: NODE_PATH=<jsdom> node test/nxt-home.test.js */
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

    console.log("-- nxt home --");
    check("contract", () => {
      assert(T.nxthome, "no T.nxthome");
      assert(typeof T.nxthome.show === "function", "no show");
      assert(typeof T.nxthome.hide === "function", "no hide");
      assert(typeof T.nxthome.isVisible === "function", "no isVisible");
      assert(typeof T.ecosystem.home === "function", "no T.ecosystem.home");
      return true;
    });
    check("boot routes to dedicated login when signed out", () => {
      assert(T.nxtLogin.isVisible(), "login not visible at boot");
      assert(!$("#view-login").classList.contains("hidden"), "view-login hidden");
      assert($("#view-home").classList.contains("hidden"), "view-home visible at boot");
      ["view-word", "view-grd", "view-dck"].forEach((id) => {
        assert($("#" + id).classList.contains("hidden"), id + " visible at boot");
      });
      assert($("#view-login .nxtlogin-input"), "no username input on login");
      return true;
    });
    check("sign in from login lands on nxt home", () => {
      const lv = $("#view-login");
      lv.querySelector(".nxtlogin-input").value = "BootUser";
      lv.querySelector(".nxtlogin-terms input").checked = true;
      lv.querySelector(".nxtlogin-btn").click();
      assert(T.nxthome.isVisible(), "not visible after sign-in");
      assert(!$("#view-home").classList.contains("hidden"), "view-home hidden");
      assert(T.ecosystem.app === "home", "app=" + T.ecosystem.app);
      assert(/BootUser/.test($(".nxt-profile").textContent), "greeting missing username");
      return true;
    });
    check("brand + search + sections", () => {
      const brand = $(".nxt-brand-name");
      assert(brand && brand.textContent === "NXT OS", "brand wrong");
      assert($(".nxt-search"), "no search");
      assert($(".nxt-studios"), "no studios row");
      assert($(".nxt-grid"), "no app grid");
      assert($(".nxt-recents"), "no recents");
      return true;
    });
    check("7 app tiles + 3 studio buttons", () => {
      assert($(".nxt-grid").querySelectorAll(".nxt-tile").length === 7, "tiles != 7");
      assert($(".nxt-studios").querySelectorAll(".nxt-studio").length === 3, "studios != 3");
      return true;
    });
    check("search filters tiles", () => {
      const inp = $(".nxt-search");
      inp.value = "spreadsheet";
      inp.dispatchEvent(new window.Event("input", { bubbles: true }));
      const tiles = $(".nxt-grid").querySelectorAll(".nxt-tile");
      let visible = 0, grdVisible = false;
      tiles.forEach((t) => {
        if (t.style.display !== "none") {
          visible++;
          if (t.getAttribute("aria-label").indexOf("GRD") === 0) grdVisible = true;
        }
      });
      assert(visible === 1 && grdVisible, "filter broken, visible=" + visible);
      inp.value = "";
      inp.dispatchEvent(new window.Event("input", { bubbles: true }));
      return true;
    });
    check("txt tile opens word view + txt homescreen", () => {
      const tile = Array.prototype.find.call(
        $(".nxt-grid").querySelectorAll(".nxt-tile"),
        (t) => t.getAttribute("aria-label").indexOf("TXT") === 0);
      assert(tile, "no txt tile");
      tile.click();
      assert(!$("#view-word").classList.contains("hidden"), "view-word hidden");
      assert($("#view-home").classList.contains("hidden"), "view-home visible");
      assert(T.homescreen.isVisible(), "txt homescreen not shown");
      return true;
    });
    check("grd tile opens grd view", () => {
      T.nxthome.show();
      const tile = Array.prototype.find.call(
        $(".nxt-grid").querySelectorAll(".nxt-tile"),
        (t) => t.getAttribute("aria-label").indexOf("GRD") === 0);
      tile.click();
      assert(!$("#view-grd").classList.contains("hidden"), "view-grd hidden");
      assert($("#view-home").classList.contains("hidden"), "view-home visible");
      return true;
    });
    check("studio button switches persona", () => {
      T.nxthome.show();
      const px = Array.prototype.find.call(
        $(".nxt-studios").querySelectorAll(".nxt-studio"),
        (b) => b.getAttribute("aria-label") === "PXL studio");
      assert(px, "no pixel studio button");
      px.click();
      assert(T.ecosystem.persona === "pixel", "persona=" + T.ecosystem.persona);
      assert(!$("#view-pixel").classList.contains("hidden"), "view-pixel hidden");
      return true;
    });
    check("launcher brand goes home", () => {
      T.ecosystem.toggleLauncher();
      const la = $("#appLauncher");
      assert(!la.classList.contains("hidden"), "launcher closed");
      const brand = la.querySelector(".launcher-brand");
      assert(brand && brand.textContent === "NXT OS", "no brand");
      brand.click();
      assert(T.nxthome.isVisible(), "not home after brand click");
      assert(la.classList.contains("hidden"), "launcher stayed open");
      return true;
    });
    check("nxt.home command", () => {
      T.ecosystem.openApp("grd");
      T.cmd("nxt.home");
      assert(T.nxthome.isVisible(), "command did not go home");
      return true;
    });

    console.log("-- hygiene --");
    check("no duplicate ids", () => {
      const seen = {};
      let dup = null;
      doc.querySelectorAll("[id]").forEach((e) => {
        if (seen[e.id]) dup = e.id;
        seen[e.id] = 1;
      });
      assert(!dup, "duplicate id: " + dup);
      return true;
    });
    check("no emojis in nxt files", () => {
      const js = fs.readFileSync(path.join(ROOT, "js/nxt-home.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "css/nxt-home.css"), "utf8");
      assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(js + css), "emoji found");
      assert(js.indexOf("alert(") < 0, "alert() found");
      assert(css.indexOf("zoom") < 0 || css.indexOf("zoom:") < 0, "css zoom found");
      return true;
    });
    check("no em dashes in nxt files", () => {
      const js = fs.readFileSync(path.join(ROOT, "js/nxt-home.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "css/nxt-home.css"), "utf8");
      assert(js.indexOf("\u2014") < 0 && css.indexOf("\u2014") < 0, "em dash found");
      return true;
    });

    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL NXT-HOME TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 900);
});
