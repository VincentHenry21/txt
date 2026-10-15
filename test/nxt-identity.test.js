/* NXT OS identity test (jsdom): rebrand strings, boot splash, palettes,
   splash cards, logos, banned colors.
   Run: NODE_PATH=<jsdom> node test/nxt-identity.test.js */
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

    /* Boot lands on the dedicated login screen when signed out; sign in so
       the home view builds for the rebrand assertions below. */
    T.store.set("nxt", "username", "IdentityTest");
    T.nxthome.show();

    console.log("-- rebrand strings --");
    check("document title is NXT OS", () => {
      assert(doc.title === "NXT OS", "title=" + doc.title);
      return true;
    });
    check("no 'NXT Ecosystem' in user-visible DOM", () => {
      const body = doc.body.textContent || "";
      assert(body.indexOf("NXT Ecosystem") < 0, "found NXT Ecosystem in DOM");
      return true;
    });
    check("launcher brand is NXT OS", () => {
      const b = $(".nxt-brand-name");
      assert(b && b.textContent === "NXT OS", "brand=" + (b && b.textContent));
      return true;
    });
    check("PXL/VAC naming on studio buttons", () => {
      const names = Array.prototype.map.call(
        $(".nxt-studios").querySelectorAll(".nxt-studio-name"), (e) => e.textContent);
      assert(names.indexOf("VAC") >= 0, "no VAC: " + names.join(","));
      assert(names.indexOf("PXL") >= 0, "no PXL: " + names.join(","));
      assert(names.indexOf("VEC") < 0 && names.indexOf("Pixel") < 0, "old names remain");
      return true;
    });
    check("H3NZ pill on launcher", () => {
      const pill = doc.getElementById("h3nzPill");
      assert(pill && /H3NZ/.test(pill.textContent), "no H3NZ pill");
      return true;
    });

    console.log("-- boot splash --");
    check("T.nxtBoot contract", () => {
      assert(T.nxtBoot, "no T.nxtBoot");
      ["show", "done", "step", "about"].forEach((m) => {
        assert(typeof T.nxtBoot[m] === "function", "no " + m);
      });
      return true;
    });
    check("splash shows then dismisses", () => {
      if (T.nxtBoot._resetForTest) T.nxtBoot._resetForTest();
      T.nxtBoot.show();
      const el = doc.getElementById("nxtBoot");
      assert(el && !el.classList.contains("hidden"), "splash not visible");
      assert(/H3NZ/.test(el.textContent), "no H3NZ credit");
      assert(/V1\.0/.test(el.textContent), "no V1.0 version");
      assert(/Welcome to NXT OS Suite/.test(el.textContent), "no welcome text");
      const css = fs.readFileSync(path.join(ROOT, "css/nxt-boot.css"), "utf8");
      assert(/\.nxtboot-welcome\s*\{[^}]*animation\s*:/.test(css), "welcome has no entrance animation");
      assert(/@keyframes\s+nxtboot-welcome-in/.test(css), "no welcome keyframes");
      T.nxtBoot.done();
      const gone = !doc.getElementById("nxtBoot") ||
        doc.getElementById("nxtBoot").classList.contains("nxtboot-leave");
      assert(gone, "splash stuck");
      return true;
    });
    check("splash skip on click never traps", () => {
      if (T.nxtBoot._resetForTest) T.nxtBoot._resetForTest();
      T.nxtBoot.show();
      const el = doc.getElementById("nxtBoot");
      assert(el, "splash did not show for skip test");
      el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      const gone = !doc.getElementById("nxtBoot") ||
        doc.getElementById("nxtBoot").classList.contains("nxtboot-leave");
      assert(gone, "click did not skip");
      return true;
    });
    check("about modal opens and closes", () => {
      T.nxtBoot.about();
      const wrap = doc.querySelector(".nxtboot-about-wrap");
      assert(wrap, "about did not open");
      assert(/H3NZ/.test(wrap.textContent), "no H3NZ credit");
      assert(/V1\.0/.test(wrap.textContent), "no V1.0 version");
      const close = wrap.querySelector(".nxtboot-about-close");
      assert(close, "no close control");
      close.click();
      assert(!doc.querySelector(".nxtboot-about-wrap"), "about did not close");
      return true;
    });

    console.log("-- palettes --");
    check("T.nxtTheme applies per-app dataset", () => {
      assert(T.nxtTheme, "no T.nxtTheme");
      T.nxtTheme.apply("grd");
      assert(doc.documentElement.dataset.nxtApp === "grd", "dataset=" + doc.documentElement.dataset.nxtApp);
      assert(T.nxtTheme.current() === "grd", "current=" + T.nxtTheme.current());
      T.nxtTheme.apply("bogus");
      assert(doc.documentElement.dataset.nxtApp === "grd", "bogus id changed dataset");
      T.nxtTheme.apply("home");
      return true;
    });
    check("palette bridge drives live --accent per app", () => {
      const css = fs.readFileSync(path.join(ROOT, "css/nxt-palettes.css"), "utf8");
      ["home", "txt", "grd", "dck", "mem", "pdf", "hub", "vac", "pixel"].forEach((k) => {
        const m = css.match(new RegExp('html\\[data-nxt-app="' + k + '"\\]\\s*\\{([\\s\\S]*?)\\n\\}'));
        assert(m, "no block for " + k);
        assert(/--nxt-accent\s*:/.test(m[1]), "no --nxt-accent in " + k);
        assert(/--accent\s*:\s*var\(--nxt-accent\)/.test(m[1]), "no --accent bridge in " + k);
      });
      return true;
    });
    check("palette accents match spec, no banned colors", () => {
      const css = fs.readFileSync(path.join(ROOT, "css/nxt-palettes.css"), "utf8");
      assert(css.indexOf("#7C3AED") >= 0, "txt accent missing");
      assert(css.indexOf("#EC4899") >= 0, "pxl accent missing");
      assert(css.indexOf("#84CC16") >= 0, "vac accent missing");
      ["#2563EB", "#F97316", "#E11D48"].forEach((b) => {
        assert(css.indexOf(b) < 0, "banned color " + b + " in palettes");
      });
      return true;
    });

    console.log("-- splash cards --");
    check("T.nxtSplash shows and hides", () => {
      assert(T.nxtSplash, "no T.nxtSplash");
      T.nxtSplash.show("grd");
      const el = doc.getElementById("nxtSplash");
      assert(el, "no splash node");
      assert(/GRD/.test(el.textContent), "no app name");
      assert(/H3NZ/.test(el.textContent), "no H3NZ credit");
      T.nxtSplash.hide();
      assert(!doc.getElementById("nxtSplash"), "splash node stuck in DOM");
      return true;
    });

    console.log("-- logos --");
    check("nine logos render", () => {
      assert(T.nxtLogos, "no T.nxtLogos");
      const ids = T.nxtLogos.ids();
      assert(ids.length === 9, "ids=" + ids.length);
      ids.forEach((id) => {
        const s = T.nxtLogos.get(id);
        assert(typeof s === "string" && s.indexOf("<svg") >= 0 && s.indexOf("</svg>") > 0, "bad logo " + id);
      });
      return true;
    });

    console.log("-- dedicated login screen --");
    check("T.nxtLogin contract", () => {
      assert(T.nxtLogin, "no T.nxtLogin");
      ["show", "hide", "isVisible"].forEach((m) => {
        assert(typeof T.nxtLogin[m] === "function", "no " + m);
      });
      return true;
    });
    check("login is a separate view from home", () => {
      T.store.set("nxt", "username", "");
      T.nxtLogin.show();
      const lv = doc.getElementById("view-login");
      const hv = doc.getElementById("view-home");
      assert(lv && !lv.classList.contains("hidden"), "login view not visible");
      assert(hv.classList.contains("hidden"), "home view not hidden");
      assert(lv.querySelector(".nxtlogin-input"), "no username input on login");
      assert(lv.querySelector(".nxtlogin-terms input"), "no terms checkbox on login");
      assert(lv.querySelector(".nxtlogin-btn"), "no Get started button");
      assert(/Welcome to NXT OS Suite V1\.0/.test(lv.textContent), "no welcome text");
      assert(/H3NZ/.test(lv.textContent), "no H3NZ branding");
      const sup = lv.querySelector('a[href="mailto:thitsarnextdoor@gmail.com"]');
      assert(sup, "no support mailto on login");
      assert(T.nxtLogin.isVisible(), "isVisible false");
      return true;
    });
    check("home has no sign-in form", () => {
      T.store.set("nxt", "username", "HomeCheck");
      T.nxthome.show();
      const hv = doc.getElementById("view-home");
      assert(hv && !hv.classList.contains("hidden"), "home not visible");
      const prof = $(".nxt-profile");
      assert(prof, "no profile section");
      assert(!prof.querySelector(".nxtlogin-input"), "login input leaked onto home");
      assert(!prof.querySelector(".nxt-signin"), "old signin form still on home");
      assert(/HomeCheck/.test(prof.textContent), "no username in greeting");
      assert(/what's your goal for today/.test(prof.textContent), "no goal prompt");
      T.store.set("nxt", "username", "");
      return true;
    });
    check("sign-in requires username and accepted terms", () => {
      T.store.set("nxt", "username", "");
      T.store.set("nxt", "termsAccepted", false);
      T.nxtLogin.show();
      const lv = doc.getElementById("view-login");
      const inp = lv.querySelector(".nxtlogin-input");
      const chk = lv.querySelector(".nxtlogin-terms input");
      const btn = lv.querySelector(".nxtlogin-btn");
      const errBox = lv.querySelector(".nxtlogin-err");
      assert(inp && chk && btn && errBox, "missing login controls");
      inp.value = "";
      chk.checked = true;
      btn.click();
      assert(T.store.get("nxt", "username") === "", "empty username accepted");
      assert(!errBox.hidden && /username/i.test(errBox.textContent), "no username error");
      assert(!lv.classList.contains("hidden"), "left login on invalid submit");
      inp.value = "LoginUser";
      chk.checked = false;
      btn.click();
      assert(T.store.get("nxt", "username") === "", "terms gate bypassed");
      assert(!errBox.hidden && /Terms/i.test(errBox.textContent), "no terms error");
      chk.checked = true;
      btn.click();
      assert(T.store.get("nxt", "username") === "LoginUser", "username not persisted");
      assert(T.nxtLegal.accepted() === true, "terms acceptance not persisted");
      assert(!doc.getElementById("view-home").classList.contains("hidden"), "home not shown after sign-in");
      assert(lv.classList.contains("hidden"), "login still visible after sign-in");
      assert(/LoginUser/.test($(".nxt-profile").textContent), "greeting missing username");
      return true;
    });
    check("switch user works", () => {
      const prof = $(".nxt-profile");
      prof.querySelector(".nxt-user").click();
      const inp = prof.querySelector(".nxt-name-input");
      assert(inp, "no edit input");
      inp.value = "SecondUser";
      prof.querySelector(".nxt-name-btn").click();
      assert(/SecondUser/.test(prof.textContent), "switch failed");
      assert(T.store.get("nxt", "username") === "SecondUser", "switch not persisted");
      return true;
    });
    check("footer support mailto link", () => {
      const a = $(".nxt-foot-support");
      assert(a, "no support link");
      assert(a.getAttribute("href") === "mailto:thitsarnextdoor@gmail.com",
        "href=" + a.getAttribute("href"));
      assert(/H3NZ/.test($(".nxt-foot").textContent), "no H3NZ in footer");
      return true;
    });

    console.log("-- legal + settings --");
    check("T.nxtLegal contract", () => {
      assert(T.nxtLegal, "no T.nxtLegal");
      ["showTerms", "showPrivacy", "showFaq", "showSettings", "accepted", "accept"].forEach((m) => {
        assert(typeof T.nxtLegal[m] === "function", "no " + m);
      });
      return true;
    });
    check("terms view opens with real content", () => {
      T.nxtLegal.showTerms();
      const w = doc.querySelector(".nxtlegal-wrap");
      assert(w, "terms did not open");
      assert(/Your content stays yours/.test(w.textContent), "no real terms content");
      assert(/H3NZ/.test(w.textContent), "no H3NZ credit");
      w.querySelector(".nxtlegal-close").click();
      assert(!doc.querySelector(".nxtlegal-wrap"), "terms did not close");
      return true;
    });
    check("privacy view opens with real content", () => {
      T.nxtLegal.showPrivacy();
      const w = doc.querySelector(".nxtlegal-wrap");
      assert(w && /What we collect/.test(w.textContent), "privacy content wrong");
      w.querySelector(".nxtlegal-close").click();
      return true;
    });
    check("faq has 8+ real questions, accordion works", () => {
      assert(T.nxtLegal.faqCount() >= 8, "faqCount=" + T.nxtLegal.faqCount());
      T.nxtLegal.showFaq();
      const w = doc.querySelector(".nxtlegal-wrap");
      const items = w.querySelectorAll(".nxtlegal-faq-item");
      assert(items.length >= 8, "items=" + items.length);
      const q = items[0].querySelector(".nxtlegal-faq-q");
      const a = items[0].querySelector(".nxtlegal-faq-a");
      assert(a.hidden, "answer visible before click");
      q.click();
      assert(!a.hidden && q.getAttribute("aria-expanded") === "true", "accordion did not open");
      q.click();
      assert(a.hidden, "accordion did not close");
      w.querySelector(".nxtlegal-close").click();
      return true;
    });
    check("settings: theme, splash toggle, signout, about", () => {
      T.nxtLegal.showSettings();
      const w = doc.querySelector(".nxtlegal-wrap");
      assert(w, "settings did not open");
      const sel = w.querySelector(".nxtlegal-select");
      assert(sel && sel.options.length >= 4, "no theme picker");
      sel.value = "obsidian";
      sel.dispatchEvent(new window.Event("change", { bubbles: true }));
      assert(doc.documentElement.getAttribute("data-theme") === "obsidian", "theme did not apply");
      sel.value = "studio";
      sel.dispatchEvent(new window.Event("change", { bubbles: true }));
      const tog = w.querySelector('.nxtlegal-check input[type="checkbox"]');
      assert(tog, "no splash toggle");
      tog.checked = false;
      tog.dispatchEvent(new window.Event("change", { bubbles: true }));
      assert(T.store.get("nxt", "bootSplash") === false, "toggle not persisted");
      tog.checked = true;
      tog.dispatchEvent(new window.Event("change", { bubbles: true }));
      assert(/V1\.0/.test(w.textContent), "no V1.0 about");
      assert(/H3NZ/.test(w.textContent), "no H3NZ about");
      const legalBtns = w.querySelectorAll(".nxtlegal-link");
      assert(legalBtns.length >= 4, "legal links=" + legalBtns.length);
      const out = Array.prototype.find.call(w.querySelectorAll(".nxtlegal-btn"),
        (b) => b.textContent === "Sign out");
      assert(out, "no sign out");
      out.click();
      assert(T.store.get("nxt", "username") === "", "signout did not clear");
      const lvAfter = doc.getElementById("view-login");
      assert(lvAfter && !lvAfter.classList.contains("hidden"), "login not shown after signout");
      assert(doc.getElementById("view-home").classList.contains("hidden"), "home visible after signout");
      assert(lvAfter.querySelector(".nxtlogin-input"), "no username input on login after signout");
      return true;
    });
    check("footer links open legal views", () => {
      const links = doc.querySelectorAll(".nxt-foot-link");
      assert(links.length >= 4, "footer links=" + links.length);
      links[0].click();
      assert(doc.querySelector(".nxtlegal-wrap"), "terms did not open from footer");
      doc.querySelector(".nxtlegal-close").click();
      return true;
    });

    console.log("-- hygiene --");
    check("no emojis or em dashes in new identity files", () => {
      ["js/nxt-boot.js", "css/nxt-boot.css", "js/nxt-splash.js", "css/nxt-splash.css",
       "js/nxt-logos.js", "js/nxt-theme.js", "css/nxt-palettes.css",
       "js/nxt-login.js", "js/nxt-home.js", "css/nxt-home.css", "css/nxt-legal.css"].forEach((f) => {
        const c = fs.readFileSync(path.join(ROOT, f), "utf8");
        assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c), "emoji in " + f);
        assert(c.indexOf("—") < 0, "em dash in " + f);
      });
      return true;
    });

    console.log(failures.length ? "\n" + failures.length + " FAILURES" : "\nALL IDENTITY TESTS PASSED");
    process.exit(failures.length ? 1 : 0);
  }, 900);
});
