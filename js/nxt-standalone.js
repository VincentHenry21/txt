/* NXT standalone app boot.
   Used by apps/<id>/index.html pages, which set window.NXT_APP before any
   app script loads. Replaces js/app.js + js/ecosystem.js + js/nxt-home.js for
   single-app pages: runs the NXT boot splash, then the dedicated login view
   (reuses T.nxtLogin; skipped when a username is already stored), then shows
   ONLY this app's view. Lazily mounts the app (grd/dck/pdf show, vac mount,
   pixel open, txt seed + wiring). Converts every 9-dot waffle button into an
   app switcher menu linking the 6 standalone apps plus the full suite.
   Depends only on shared core modules, never on ecosystem.js or nxt-home.js.
   Every DOM lookup is guarded so missing elements never throw.
   Conventions: IIFE, var T = window.TXT, T.bus, T.store, no emojis,
   no em dashes, no CSS zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;
  var APP = window.NXT_APP || null;
  if (!APP) return;

  var NAMES = { txt: "TXT", grd: "GRD", dck: "DCK", pdf: "PDF", vac: "VAC", pxl: "PXL" };
  var VIEWS = { txt: "view-word", grd: "view-grd", dck: "view-dck",
                pdf: "view-pdf", vac: "view-vac", pxl: "view-pixel" };
  /* nxt-theme.js only accepts these ids ("pixel", not "pxl"). */
  var THEME_APP = { txt: "txt", grd: "grd", dck: "dck", pdf: "pdf", vac: "vac", pxl: "pixel" };

  function appName() { return NAMES[APP] || String(APP).toUpperCase(); }
  function $(s, r) { try { return (r || document).querySelector(s); } catch (e) { return null; } }
  function getUsername() {
    try { return (T.store && T.store.get("nxt", "username")) || ""; } catch (e) { return ""; }
  }

  /* ---------- per-app branding (DOM text only; shared files untouched) ---------- */
  function customizeBrand() {
    var label = "NXT " + appName();
    var w = $(".nxtboot-welcome"); if (w) w.textContent = "Welcome to " + label;
    var bw = $(".nxtboot-word"); if (bw) bw.textContent = label;
    var lw = $(".nxtlogin-welcome"); if (lw) lw.textContent = "Welcome to " + label;
    var ln = $(".nxtlogin-word"); if (ln) ln.textContent = label;
    try { document.title = label; } catch (e) {}
  }

  /* ---------- view switching ---------- */
  function showOnly(id) {
    var views = document.querySelectorAll("section.view");
    for (var i = 0; i < views.length; i++) {
      views[i].classList.toggle("hidden", views[i].id !== id);
    }
  }
  function applyAppTheme() {
    if (T.nxtTheme && typeof T.nxtTheme.apply === "function") {
      try { T.nxtTheme.apply(THEME_APP[APP] || APP); } catch (e) {}
    }
  }

  /* ---------- TXT seed + wiring (mirrors the js/app.js essentials) ---------- */
  var txtMounted = false;
  function registerTxtCommands() {
    if (!T.register) return;
    try {
      T.register("doc.undo", function () { if (T.history) T.history.undo(); },
        { title: "Undo", cat: "Document", icon: "i-undo", keys: "Ctrl+Z" });
      T.register("doc.redo", function () { if (T.history) T.history.redo(); },
        { title: "Redo", cat: "Document", icon: "i-redo", keys: "Ctrl+Y" });
      T.register("doc.print", function () { window.print(); },
        { title: "Print", cat: "Document", icon: "i-print", keys: "Ctrl+P" });
      T.register("doc.new", function () {
        T.modal({ title: T.t("newDoc"), sub: T.t("confirmNew"), okText: "Create" }).then(function (r) {
          if (!r) return;
          T.editor.saveNow();
          T.editor.newDoc("", "<p><br></p>");
          var dt = $("#docTitle");
          if (dt) dt.value = T.editor.getDoc().title;
        });
      }, { title: "New document", cat: "Document", icon: "i-plus" });
      T.register("doc.save", function () { T.editor.saveNow(); T.toast(T.t("saved")); },
        { title: "Save now", cat: "Document", icon: "i-check", keys: "Ctrl+S" });
      T.register("view.focus", function () { document.body.classList.toggle("focus-mode"); },
        { title: "Focus mode", cat: "View", icon: "i-focus" });
    } catch (e) {}
  }
  function txtGlobalKeys(e) {
    var mod = e.ctrlKey || e.metaKey;
    var tag = (e.target.tagName || "").toLowerCase();
    var inField = tag === "input" || tag === "textarea" || tag === "select";
    var key = e.key.toLowerCase();
    if (mod && key === "k" && !inField) { e.preventDefault(); T.bus.emit("palette:open"); }
    else if (mod && key === "s") { e.preventDefault(); T.cmd("doc.save"); }
    else if (mod && key === "p" && !e.shiftKey) { e.preventDefault(); T.cmd("doc.print"); }
    else if (mod && key === "z" && !e.shiftKey && !inField) { e.preventDefault(); T.cmd("doc.undo"); }
    else if (mod && (key === "y" || (key === "z" && e.shiftKey)) && !inField) { e.preventDefault(); T.cmd("doc.redo"); }
    else if (e.key === "Escape") { T.bus.emit("overlay:escape"); }
  }
  function mountTxt() {
    if (txtMounted || !T.editor) return;
    txtMounted = true;
    registerTxtCommands();
    var doc = null;
    try {
      if (T.state && T.state.docs && T.state.docs.length) {
        doc = T.editor.openDoc(T.state.docs[0].id);
      } else if (T.templates && typeof T.templates.showcase === "function") {
        var s = T.templates.showcase();
        doc = T.editor.newDoc(s.title, s.html);
        setTimeout(function () {
          try {
            T.bus.emit("comments:seed", [
              { quote: "Executive Summary", text: "Maya: Please double-check the session length numbers before Friday.", who: "Maya" },
              { quote: "session length", text: "Leo: DOCX fidelity check is scheduled for Thursday.", who: "Leo" }
            ]);
          } catch (e) {}
        }, 400);
      }
    } catch (e) { doc = null; }
    try {
      var dt = $("#docTitle");
      if (dt && doc) dt.value = doc.title;
      if (dt && T.debounce) dt.addEventListener("input", T.debounce(function () {
        var d = T.editor.getDoc();
        var v = dt.value.trim() || (T.t ? T.t("untitled") : "Untitled");
        if (d && v !== d.title) { d.title = v; T.editor.markDirty(); }
      }, 500));
      var sp = $("#savePill");
      if (sp && T.bus) sp.addEventListener("click", function () { T.bus.emit("history:open"); });
      var qu = $("#qaUndo"); if (qu) qu.addEventListener("click", function () { T.cmd("doc.undo"); });
      var qr = $("#qaRedo"); if (qr) qr.addEventListener("click", function () { T.cmd("doc.redo"); });
      var qp = $("#qaPrint"); if (qp) qp.addEventListener("click", function () { T.cmd("doc.print"); });
    } catch (e) {}
    try { document.addEventListener("keydown", txtGlobalKeys); } catch (e) {}
  }

  /* ---------- lazy app mount ---------- */
  function mountApp() {
    try {
      if (APP === "txt") { mountTxt(); return; }
      if (APP === "grd" && T.grd && typeof T.grd.show === "function") { T.grd.show(); return; }
      if (APP === "dck" && T.dck && typeof T.dck.show === "function") { T.dck.show(); return; }
      if (APP === "pdf" && T.pdf && typeof T.pdf.show === "function") { T.pdf.show(); return; }
      if (APP === "vac" && T.vacEngine && typeof T.vacEngine.mount === "function") { T.vacEngine.mount(); return; }
      if (APP === "pxl" && T.pixel && typeof T.pixel.open === "function") { T.pixel.open(); return; }
    } catch (e) { /* an app mount must never break boot */ }
  }

  function showApp() {
    mountApp();
    showOnly(VIEWS[APP]);
    applyAppTheme();
    customizeBrand();
    /* Waffles for lazily built apps (grd/dck/pdf) appear during mountApp;
       wire them synchronously so the switcher works on the first click. */
    wireAppSwitcher();
  }
  function showTutorials(appId) {
    try {
      if (T.tutorials && typeof T.tutorials.open === "function") T.tutorials.open(appId || APP);
    } catch (e) {}
    showOnly("view-tutorials");
    applyAppTheme();
    var tv = document.getElementById("view-tutorials");
    var back = tv ? tv.querySelector(".nt-back") : null;
    if (back && !back.getAttribute("data-sa-wired")) {
      back.setAttribute("data-sa-wired", "1");
      back.addEventListener("click", function () { showApp(); });
    }
  }

  /* ---------- 9-dot waffle becomes an app switcher ---------- */
  var SWITCH_APPS = [
    { id: "txt", name: "TXT", desc: "Word processor", href: "../txt/" },
    { id: "grd", name: "GRD", desc: "Spreadsheet", href: "../grd/" },
    { id: "dck", name: "DCK", desc: "Presentations", href: "../dck/" },
    { id: "pdf", name: "PDF", desc: "PDF toolkit", href: "../pdf/" },
    { id: "vac", name: "VAC", desc: "Vector studio", href: "../vac/" },
    { id: "pxl", name: "PXL", desc: "Pixel studio", href: "../pxl/" }
  ];
  var menuEl = null;
  function closeMenu() {
    if (menuEl && menuEl.parentNode) { try { menuEl.parentNode.removeChild(menuEl); } catch (e) {} }
    menuEl = null;
    try { document.removeEventListener("mousedown", onDocDown, true); } catch (e) {}
    try { document.removeEventListener("keydown", onMenuKey, true); } catch (e) {}
  }
  function onDocDown(e) {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }
  function onMenuKey(e) {
    if (e.key === "Escape") closeMenu();
  }
  function toggleSwitcher(anchor) {
    if (menuEl) { closeMenu(); return; }
    menuEl = document.createElement("div");
    menuEl.className = "sa-switcher";
    menuEl.setAttribute("role", "menu");
    menuEl.setAttribute("aria-label", "Switch app");
    var html = "";
    SWITCH_APPS.forEach(function (a) {
      var cur = a.id === APP;
      html += '<a role="menuitem" class="sa-app' + (cur ? " sa-current" : "") + '"' +
        (cur ? ' aria-current="true"' : ' href="' + a.href + '"') + ">" +
        '<span class="sa-appname">' + a.name + "</span>" +
        '<span class="sa-appdesc">' + a.desc + "</span>" +
        (cur ? '<span class="sa-cur">Current</span>' : "") + "</a>";
    });
    html += '<a role="menuitem" class="sa-app sa-suite" href="../../index.html">' +
      '<span class="sa-appname">Full NXT OS Suite</span>' +
      '<span class="sa-appdesc">All 9 apps in one place</span></a>';
    menuEl.innerHTML = html;
    var r = null;
    try { r = anchor.getBoundingClientRect(); } catch (e) { r = null; }
    menuEl.style.top = ((r ? r.bottom : 60) + 8) + "px";
    var left = r ? r.left : 16;
    try { left = Math.max(8, Math.min(left, window.innerWidth - 260)); } catch (e) {}
    menuEl.style.left = left + "px";
    document.body.appendChild(menuEl);
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onMenuKey, true);
  }
  function wireAppSwitcher() {
    var btns = document.querySelectorAll(".waffle-btn");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        if (btn.getAttribute("data-sa-wired")) return;
        /* Clone to drop the suite launcher handler (a guarded no-op here). */
        var clone = btn.cloneNode(true);
        clone.setAttribute("data-sa-wired", "1");
        clone.setAttribute("aria-label", "Switch app");
        clone.title = "Switch app";
        if (!btn.parentNode) return;
        btn.parentNode.replaceChild(clone, btn);
        clone.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleSwitcher(clone);
        });
      })(btns[i]);
    }
  }
  function watchWaffles() {
    wireAppSwitcher();
    if (!window.MutationObserver) return;
    try {
      var mo = new MutationObserver(function (muts) {
        var found = false;
        for (var i = 0; i < muts.length && !found; i++) {
          var nodes = muts[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            var n = nodes[j];
            if (!n || n.nodeType !== 1) continue;
            if ((n.classList && n.classList.contains("waffle-btn") && !n.getAttribute("data-sa-wired")) ||
                (n.querySelector && n.querySelector(".waffle-btn:not([data-sa-wired])"))) {
              found = true;
              break;
            }
          }
        }
        if (found) wireAppSwitcher();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* ---------- TXT has no waffle; give it a tutorials entry point ---------- */
  function wireTxtHelp() {
    if (APP !== "txt") return;
    if ($(".nt-helpbtn")) return;
    var anchor = document.getElementById("btnExportTop");
    if (!anchor || !anchor.parentNode) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn nt-helpbtn";
    b.title = "TXT tutorials";
    b.setAttribute("aria-label", "Open TXT tutorials");
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      showTutorials("txt");
    });
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
  }

  /* ---------- login completion watcher ---------- */
  function watchLogin() {
    var view = document.getElementById("view-login");
    if (!view || !window.MutationObserver) return;
    try {
      var mo = new MutationObserver(function () {
        if (view.classList.contains("hidden") && getUsername()) {
          try { mo.disconnect(); } catch (e) {}
          showApp();
        }
      });
      mo.observe(view, { attributes: true, attributeFilter: ["class"] });
    } catch (e) {}
  }

  /* ---------- boot ---------- */
  function boot() {
    if (T.nxtBoot) { try { T.nxtBoot.show(); } catch (e) {} }
    try { if (T.bus && typeof T.bus.emit === "function") T.bus.emit("app:boot"); } catch (e) {}
    if (T.nxtBoot) { try { T.nxtBoot.step("standalone", 55, "Loading " + appName()); } catch (e) {} }
    customizeBrand();
    watchWaffles();
    if (APP === "txt") wireTxtHelp();
    if (getUsername()) {
      showApp();
    } else if (T.nxtLogin && typeof T.nxtLogin.show === "function") {
      try { T.nxtLogin.show(); } catch (e) {}
      customizeBrand();
      watchLogin();
    } else {
      showApp();
    }
    if (T.nxtBoot) { try { T.nxtBoot.step("ready", 100, "Ready"); } catch (e) {} }
    try { if (T.bus && typeof T.bus.emit === "function") T.bus.emit("app:ready"); } catch (e) {}
    if (T.nxtBoot) { try { T.nxtBoot.done(); } catch (e) {} }
  }

  T.standalone = { show: showApp, showTutorials: showTutorials, app: APP };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
