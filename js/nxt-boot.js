/* NXT OS boot splash, About modal, and H3NZ pill (Phase 1 workstream B).
   IIFE module on window.TXT. The overlay #nxtBoot shows on launch before the
   launcher and drives a staged progress bar through real boot milestones
   instrumented in js/app.js. It can never trap the user: tap/click or ESC
   skips instantly, and a hard 4s timeout forces dismissal even if the boot
   sequence never finishes. T.nxtBoot.about() opens the About NXT OS dialog.
   The "Developed by H3NZ" pill is injected into .nxt-brand via DOM on the
   ecosystem:home bus event (js/nxt-home.js is not modified). */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var HARD_TIMEOUT_MS = 4000;
  var MAX_LOG_LINES = 4;

  /* ---------- NXT prism logo (workstream A) with text fallback ---------- */
  function logoHTML(size) {
    var svg = "";
    try {
      if (T.nxtLogos && typeof T.nxtLogos.get === "function") {
        var l = T.nxtLogos.get("nxt");
        if (l) svg = typeof l === "string" ? l : (l.outerHTML || "");
      }
    } catch (e) { svg = ""; }
    if (svg) return '<span class="nxtboot-logo' + (size === "sm" ? " nxtboot-logo-sm" : "") + '" aria-hidden="true">' + svg + "</span>";
    return '<span class="nxtboot-logo-fallback' + (size === "sm" ? " nxtboot-logo-fallback-sm" : "") + '" aria-hidden="true">NXT</span>';
  }

  /* ---------- boot splash ---------- */
  var overlay = null, fillEl = null, barEl = null, logEl = null;
  var timeoutId = 0, finished = false;

  function onBootKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      skip();
    }
  }

  function skip() { done(); }

  function done() {
    if (finished) return;
    finished = true;
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = 0; }
    document.removeEventListener("keydown", onBootKey, true);
    var ov = overlay;
    overlay = null; fillEl = null; barEl = null; logEl = null;
    if (!ov) return;
    ov.classList.add("nxtboot-leave");
    setTimeout(function () {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }, REDUCED ? 0 : 280);
  }

  function show() {
    if (overlay || finished) return;
    try {
      if (T.store && T.store.get("nxt", "bootSplash") === false) { finished = true; return; }
    } catch (e) {}
    overlay = document.createElement("div");
    overlay.id = "nxtBoot";
    overlay.className = "nxtboot" + (REDUCED ? " nxtboot-reduced" : "");
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", "NXT OS is starting");
    overlay.innerHTML =
      '<div class="nxtboot-inner">' +
        '<div class="nxtboot-logo-row">' + logoHTML() + "</div>" +
        '<div class="nxtboot-word">NXT OS</div>' +
        '<div class="nxtboot-welcome">Welcome to NXT OS Suite V1.0</div>' +
        '<div class="nxtboot-by">Engineered &amp; Developed by H3NZ</div>' +
        '<div class="nxtboot-ver">V1.0</div>' +
        '<div class="nxtboot-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Boot progress">' +
          '<div class="nxtboot-fill"></div>' +
        "</div>" +
        '<div class="nxtboot-log" aria-hidden="true"></div>' +
        '<div class="nxtboot-hint">Tap anywhere to skip</div>' +
      "</div>";
    document.body.appendChild(overlay);
    fillEl = overlay.querySelector(".nxtboot-fill");
    barEl = overlay.querySelector(".nxtboot-bar");
    logEl = overlay.querySelector(".nxtboot-log");
    overlay.addEventListener("click", skip);
    document.addEventListener("keydown", onBootKey, true);
    /* Never trap the user: force dismissal even if boot stalls. */
    timeoutId = setTimeout(done, HARD_TIMEOUT_MS);
  }

  function step(id, pct, text) {
    if (finished || !overlay) return;
    var p = Math.max(0, Math.min(100, Math.round(pct) || 0));
    if (barEl) barEl.setAttribute("aria-valuenow", String(p));
    if (fillEl) fillEl.style.width = p + "%";
    if (text && logEl) {
      var line = document.createElement("div");
      line.className = "nxtboot-logline";
      line.textContent = text;
      logEl.appendChild(line);
      while (logEl.children.length > MAX_LOG_LINES) logEl.removeChild(logEl.firstChild);
    }
  }

  /* ---------- About NXT OS dialog (minimal accessible custom modal) ---------- */
  var APPS8 = [
    { code: "TXT", name: "Word processor", color: "#7C3AED" },
    { code: "GRD", name: "Spreadsheets and kanban", color: "#06B6D4" },
    { code: "DCK", name: "Slide deck generator", color: "#FF2E93" },
    { code: "MEM", name: "Memory clipper and notes", color: "#10B981" },
    { code: "PDF", name: "PDF toolkit", color: "#F59E0B" },
    { code: "HUB", name: "Files and storage", color: "#3B82F6" },
    { code: "VAC", name: "VAC studio", color: "#84CC16" },
    { code: "PXL", name: "Pixel studio", color: "#EC4899" }
  ];
  var aboutOpen = false;

  function about() {
    if (aboutOpen) return;
    aboutOpen = true;
    var prev = document.activeElement;
    var wrap = document.createElement("div");
    wrap.className = "nxtboot-about-wrap" + (REDUCED ? " nxtboot-reduced" : "");
    var rows = APPS8.map(function (a) {
      return '<li class="nxtboot-about-app">' +
        '<span class="nxtboot-dot" style="background:' + a.color + '" aria-hidden="true"></span>' +
        '<span class="nxtboot-about-code">' + T.esc(a.code) + "</span>" +
        '<span class="nxtboot-about-name">' + T.esc(a.name) + "</span></li>";
    }).join("");
    wrap.innerHTML =
      '<div class="nxtboot-about" role="dialog" aria-modal="true" aria-labelledby="nxtAboutTitle">' +
        '<div class="nxtboot-about-logo">' + logoHTML("sm") + "</div>" +
        '<h2 id="nxtAboutTitle" class="nxtboot-about-title">NXT OS</h2>' +
        '<div class="nxtboot-about-ver">V1.0</div>' +
        '<div class="nxtboot-about-by">Engineered &amp; Developed by H3NZ</div>' +
        '<ul class="nxtboot-about-apps">' + rows + "</ul>" +
        '<button type="button" class="nxtboot-about-close">Close</button>' +
      "</div>";
    document.body.appendChild(wrap);
    var dlg = wrap.firstChild;
    var closeBtn = wrap.querySelector(".nxtboot-about-close");
    function close() {
      if (!aboutOpen) return;
      aboutOpen = false;
      document.removeEventListener("keydown", onKey, true);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "Tab") {
        var f = dlg.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) close(); });
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);
    closeBtn.focus();
  }

  T.register("nxt.about", about, {
    title: "About NXT OS",
    cat: "NXT OS",
    icon: "i-shield", // i-info does not exist in the sprite; shield fits identity
    match: "about version credits"
  });

  /* ---------- H3NZ pill: injected into .nxt-brand via DOM ---------- */
  function injectPill() {
    if (document.getElementById("h3nzPill")) return;
    var brand = document.querySelector(".nxt-brand");
    if (!brand) return;
    var pill = document.createElement("button");
    pill.type = "button";
    pill.id = "h3nzPill";
    pill.className = "h3nz-pill";
    pill.textContent = "Developed by H3NZ";
    pill.setAttribute("aria-label", "Developed by H3NZ. Open About NXT OS.");
    pill.addEventListener("click", about);
    brand.appendChild(pill);
  }
  T.bus.on("ecosystem:home", injectPill);
  if (document.readyState !== "loading") injectPill();
  else document.addEventListener("DOMContentLoaded", injectPill);

  T.nxtBoot = { show: show, step: step, done: done, skip: skip, about: about,
    _resetForTest: function () { finished = false; } };
})();
