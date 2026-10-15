/* TXT ecosystem shell (v5 wave 1): hosts the word/vector/pixel personas and
   the 6 companion apps. Injects the persona switch + waffle launcher into the
   existing topbar via DOM (topbar.js is not modified), manages view
   visibility, split-screen, the Adobe Pro Carbon theme, and keyboard
   shortcuts. Other personas/apps fill their #view-* sections in later waves.

   T.ecosystem = {
     persona, app,                 // live getters: 'word'|'vector'|'pixel', 'txt'|...
     setPersona(p),                // show persona view; vector/pixel morph to carbon theme
     openApp(a),                   // show app view; 'txt' == word persona
     toggleLauncher(),             // 9-dot app launcher popover
     setSplit(app|null, ratio)     // split-screen; null restores single view
   }; */
(function () {
  "use strict";
  var T = window.TXT;

  var PERSONAS = ["word", "vector", "pixel"];
  var APPS = ["txt", "grd", "dck", "mem", "pdf", "hub"];
  var VIEWS = ["view-word", "view-vector", "view-pixel",
    "view-grd", "view-dck", "view-mem", "view-pdf", "view-hub"];
  var VIEW_FOR_PERSONA = { word: "view-word", vector: "view-vector", pixel: "view-pixel" };
  var VIEW_FOR_APP = {
    txt: "view-word", grd: "view-grd", dck: "view-dck",
    mem: "view-mem", pdf: "view-pdf", hub: "view-hub"
  };
  var APPS_META = [
    { id: "txt", code: "TXT", color: "#2563EB", desc: "Flagship word processor" },
    { id: "grd", code: "GRD", color: "#10B981", desc: "Spreadsheet grid and kanban" },
    { id: "dck", code: "DCK", color: "#F97316", desc: "Slide deck generator" },
    { id: "mem", code: "MEM", color: "#8B5CF6", desc: "Memory clipper and notes" },
    { id: "pdf", code: "PDF", color: "#E11D48", desc: "PDF toolkit" },
    { id: "hub", code: "HUB", color: "#4F46E5", desc: "Ecosystem home" }
  ];

  var eco = { persona: "word", app: "txt" };
  var prevTheme = null;      // theme to restore when leaving vector/pixel
  var splitState = null;     // {a:viewId, b:viewId, ratio}
  var lastSplitApp = "grd";
  var homeOf = {};           // viewId -> {parent, next} for split restore

  function viewEl(id) { return document.getElementById(id); }
  function currentViewId() {
    return eco.app === "txt" ? VIEW_FOR_PERSONA[eco.persona] : VIEW_FOR_APP[eco.app];
  }

  /* ---------- Adobe Pro Carbon theme (no edit to js/themes.js) ---------- */
  // Runs on app:boot BEFORE themes.js's own boot handler (registration order
  // follows script order), so a persisted "carbon" theme applies cleanly.
  T.bus.on("app:boot", function () {
    if (!T.themes) return;
    if (T.themes.THEMES.indexOf("carbon") < 0) T.themes.THEMES.push("carbon");
    T.themes.NAMES.carbon = "Adobe Pro Carbon";
    var sel = document.getElementById("themePicker");
    if (sel && !sel.querySelector('option[value="carbon"]')) {
      var o = document.createElement("option");
      o.value = "carbon";
      o.textContent = "Adobe Pro Carbon";
      sel.appendChild(o);
    }
  });
  function applyCarbon() {
    if (T.themes && T.themes.apply) T.themes.apply("carbon");
    else {
      document.documentElement.setAttribute("data-theme", "carbon");
      T.state.prefs.theme = "carbon";
      T.savePrefs();
      T.bus.emit("theme:change", { theme: "carbon" });
    }
  }

  /* ---------- topbar injection ---------- */
  function injectTopbar() {
    var tb = document.getElementById("topbar");
    if (!tb) return;
    var tbRight = tb.querySelector(".tb-right");
    if (!tbRight) return;

    var sw = document.createElement("div");
    sw.id = "personaSwitch";
    sw.className = "segmented";
    sw.setAttribute("role", "tablist");
    sw.setAttribute("aria-label", "Persona");
    [["word", "W", "Word"], ["vector", "Ai", "Vector"], ["pixel", "Ps", "Pixel"]].forEach(function (d, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-persona", d[0]);
      b.setAttribute("role", "tab");
      if (d[0] === "word") b.classList.add("active");
      b.title = d[2] + " studio (Ctrl+" + (i + 1) + ")";
      var badge = document.createElement("span");
      badge.className = "persona-badge";
      badge.textContent = d[1];
      badge.setAttribute("aria-hidden", "true");
      b.appendChild(badge);
      b.appendChild(document.createTextNode(" " + d[2]));
      b.addEventListener("click", function () { setPersona(d[0]); });
      sw.appendChild(b);
    });
    var themePicker = document.getElementById("themePicker");
    if (themePicker && themePicker.parentNode === tbRight) tbRight.insertBefore(sw, themePicker);
    else tbRight.appendChild(sw);

    var wb = document.createElement("button");
    wb.type = "button";
    wb.id = "waffleBtn";
    wb.className = "icon-btn waffle-btn";
    wb.title = "App launcher";
    wb.setAttribute("aria-label", "App launcher");
    wb.setAttribute("aria-haspopup", "true");
    wb.setAttribute("aria-expanded", "false");
    var dots = document.createElement("span");
    dots.className = "waffle-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 9; i++) dots.appendChild(document.createElement("i"));
    wb.appendChild(dots);
    wb.addEventListener("click", function (e) { e.stopPropagation(); toggleLauncher(); });
    var exportBtn = document.getElementById("btnExportTop");
    if (exportBtn && exportBtn.parentNode === tbRight) {
      tbRight.insertBefore(wb, exportBtn.nextSibling);
    } else tbRight.appendChild(wb);
  }

  function syncPersonaSwitch() {
    var sw = document.getElementById("personaSwitch");
    if (!sw) return;
    var btns = sw.querySelectorAll("[data-persona]");
    Array.prototype.forEach.call(btns, function (b) {
      var p = b.getAttribute("data-persona");
      var on = (eco.app === "txt" && eco.persona === p);
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  /* ---------- app launcher popover ---------- */
  function buildLauncher() {
    var la = document.getElementById("appLauncher");
    if (!la) return;
    la.innerHTML = "";
    var head = document.createElement("div");
    head.className = "launcher-head";
    head.textContent = "Apps";
    la.appendChild(head);
    var grid = document.createElement("div");
    grid.className = "launcher-grid";
    APPS_META.forEach(function (m) {
      var tile = document.createElement("div");
      tile.className = "launcher-tile";
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", m.code + ": " + m.desc);
      var badge = document.createElement("span");
      badge.className = "tile-badge";
      badge.style.background = m.color;
      badge.textContent = m.code;
      badge.setAttribute("aria-hidden", "true");
      var nm = document.createElement("span");
      nm.className = "tile-name";
      nm.textContent = m.code;
      var ds = document.createElement("span");
      ds.className = "tile-desc";
      ds.textContent = m.desc;
      var splitBtn = document.createElement("button");
      splitBtn.type = "button";
      splitBtn.className = "tile-split";
      splitBtn.title = "Open in split view";
      splitBtn.setAttribute("aria-label", "Open " + m.code + " in split view");
      splitBtn.innerHTML = T.icon("i-split");
      splitBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        hideLauncher();
        setSplit(m.id);
      });
      tile.appendChild(badge);
      tile.appendChild(nm);
      tile.appendChild(ds);
      tile.appendChild(splitBtn);
      function open() { hideLauncher(); openApp(m.id); }
      tile.addEventListener("click", open);
      tile.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
      grid.appendChild(tile);
    });
    la.appendChild(grid);
  }
  function toggleLauncher() {
    var la = document.getElementById("appLauncher");
    if (!la) return;
    var willShow = la.classList.contains("hidden");
    la.classList.toggle("hidden", !willShow);
    var wb = document.getElementById("waffleBtn");
    if (wb) wb.setAttribute("aria-expanded", willShow ? "true" : "false");
  }
  function hideLauncher() {
    var la = document.getElementById("appLauncher");
    if (la && !la.classList.contains("hidden")) {
      la.classList.add("hidden");
      var wb = document.getElementById("waffleBtn");
      if (wb) wb.setAttribute("aria-expanded", "false");
    }
  }

  /* ---------- views ---------- */
  function showOnly(viewId) {
    if (splitState) unsplit();
    VIEWS.forEach(function (id) {
      var el = viewEl(id);
      if (el) el.classList.toggle("hidden", id !== viewId);
    });
  }
  function focusView(viewId) {
    var el = viewEl(viewId);
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
  }

  function setPersona(p) {
    if (PERSONAS.indexOf(p) < 0) p = "word";
    var prev = eco.persona;
    eco.persona = p;
    eco.app = "txt";
    hideLauncher();
    syncPersonaSwitch();
    showOnly(VIEW_FOR_PERSONA[p]);
    try {
      if (p === "vector" && T.vector && T.vector.show) T.vector.show();
      else if (p === "pixel" && T.pixel && T.pixel.open) T.pixel.open();
      else if (prev === "pixel" && T.pixel && T.pixel.close) T.pixel.close();
    } catch (e) {}
    var cur = document.documentElement.getAttribute("data-theme");
    if (p === "vector" || p === "pixel") {
      if (cur !== "carbon") prevTheme = T.state.prefs.theme || cur || "studio";
      applyCarbon();
    } else {
      if (cur === "carbon" && prevTheme) {
        if (T.themes && T.themes.apply) T.themes.apply(prevTheme);
        else {
          document.documentElement.setAttribute("data-theme", prevTheme);
          T.state.prefs.theme = prevTheme;
          T.savePrefs();
        }
      }
      prevTheme = null;
    }
    focusView(VIEW_FOR_PERSONA[p]);
    T.bus.emit("ecosystem:persona", { persona: p });
  }

  function openApp(a) {
    if (APPS.indexOf(a) < 0) a = "txt";
    if (a === "txt") { setPersona("word"); return; }
    eco.app = a;
    hideLauncher();
    syncPersonaSwitch();
    showOnly(VIEW_FOR_APP[a]);
    focusView(VIEW_FOR_APP[a]);
    T.bus.emit("ecosystem:app", { app: a });
  }

  /* ---------- split-screen ---------- */
  function homeFor(viewId) {
    if (!homeOf[viewId]) {
      var el = viewEl(viewId);
      homeOf[viewId] = el ? { parent: el.parentNode, next: el.nextElementSibling } : null;
    }
    return homeOf[viewId];
  }
  function restoreView(viewId) {
    var h = homeOf[viewId];
    var el = viewEl(viewId);
    if (!h || !el) return;
    if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(el, h.next);
    else h.parent.appendChild(el);
  }
  function applyRatio(ratio) {
    var sA = document.getElementById("splitA"), sB = document.getElementById("splitB");
    if (!sA || !sB) return;
    var parts = ratio === "65/35" ? [65, 35] : [50, 50];
    sA.style.flex = parts[0] + " " + parts[0] + " 0";
    sB.style.flex = parts[1] + " " + parts[1] + " 0";
    var dv = document.querySelector("#splitWrap .split-div");
    if (dv) dv.setAttribute("title", "Split " + ratio + " - click to toggle ratio");
  }
  function setSplit(app, ratio) {
    var viewsEl = document.getElementById("views");
    var wrap = document.getElementById("splitWrap");
    var sA = document.getElementById("splitA"), sB = document.getElementById("splitB");
    if (!viewsEl || !wrap || !sA || !sB) return;
    if (!app) { unsplit(); return; }
    if (APPS.indexOf(app) < 0) { T.toast("Unknown app.", "error"); return; }
    var primaryView = currentViewId();
    var secondaryView = VIEW_FOR_APP[app];
    if (secondaryView === primaryView) { T.toast("That app is already open.", "error"); return; }
    var pEl = viewEl(primaryView), sEl = viewEl(secondaryView);
    if (!pEl || !sEl) return;
    homeFor(primaryView);
    homeFor(secondaryView);
    pEl.classList.remove("hidden");
    sEl.classList.remove("hidden");
    sA.appendChild(pEl);
    sB.appendChild(sEl);
    viewsEl.classList.add("hidden");
    wrap.classList.remove("hidden");
    lastSplitApp = app;
    var r = ratio || (splitState && splitState.ratio) || "50/50";
    splitState = { a: primaryView, b: secondaryView, ratio: r };
    applyRatio(r);
    T.bus.emit("ecosystem:split", { on: true, ratio: r, a: appOf(primaryView), b: app });
  }
  function unsplit() {
    if (!splitState) return;
    var cur = currentViewId();
    restoreView(splitState.a);
    restoreView(splitState.b);
    splitState = null;
    var viewsEl = document.getElementById("views");
    var wrap = document.getElementById("splitWrap");
    if (viewsEl) viewsEl.classList.remove("hidden");
    if (wrap) wrap.classList.add("hidden");
    VIEWS.forEach(function (id) {
      var el = viewEl(id);
      if (el) el.classList.toggle("hidden", id !== cur);
    });
    T.bus.emit("ecosystem:split", { on: false });
  }
  function appOf(viewId) {
    for (var k in VIEW_FOR_APP) {
      if (VIEW_FOR_APP[k] === viewId) return k;
    }
    for (var p in VIEW_FOR_PERSONA) {
      if (VIEW_FOR_PERSONA[p] === viewId) return "txt";
    }
    return "txt";
  }
  function toggleRatio() {
    if (!splitState) return;
    var next = splitState.ratio === "50/50" ? "65/35" : "50/50";
    splitState.ratio = next;
    applyRatio(next);
    T.bus.emit("ecosystem:split", { on: true, ratio: next });
  }

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod || e.shiftKey || e.altKey) return;
    var t = e.target;
    var tag = (t && t.tagName ? t.tagName : "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (t && t.isContentEditable) return;
    if (e.key === "1") { e.preventDefault(); setPersona("word"); }
    else if (e.key === "2") { e.preventDefault(); setPersona("vector"); }
    else if (e.key === "3") { e.preventDefault(); setPersona("pixel"); }
  });

  /* ---------- wire up ---------- */
  injectTopbar();
  buildLauncher();
  document.addEventListener("click", function (e) {
    var la = document.getElementById("appLauncher");
    if (!la || la.classList.contains("hidden")) return;
    var t = e.target;
    if (t && t.closest && (t.closest("#appLauncher") || t.closest("#waffleBtn"))) return;
    hideLauncher();
  });
  T.bus.on("overlay:escape", hideLauncher);
  var splitDiv = document.querySelector("#splitWrap .split-div");
  if (splitDiv) splitDiv.addEventListener("click", toggleRatio);

  /* ---------- commands ---------- */
  T.register("persona.word", function () { setPersona("word"); },
    { title: "Word persona", cat: "Ecosystem", icon: "i-file", keys: "Ctrl+1", match: "word document" });
  T.register("persona.vector", function () { setPersona("vector"); },
    { title: "Vector persona", cat: "Ecosystem", icon: "i-shapes", keys: "Ctrl+2", match: "vector illustrator svg" });
  T.register("persona.pixel", function () { setPersona("pixel"); },
    { title: "Pixel persona", cat: "Ecosystem", icon: "i-image", keys: "Ctrl+3", match: "pixel photoshop raster" });
  APPS_META.forEach(function (m) {
    T.register("app." + m.id, (function (id) {
      return function () { openApp(id); };
    })(m.id), { title: "Open " + m.code + " app", cat: "Ecosystem", icon: "i-grid", match: m.code.toLowerCase() + " app open" });
  });
  T.register("theme.carbon", function () { applyCarbon(); },
    { title: "Adobe Pro Carbon theme", cat: "View", icon: "i-moon", match: "carbon adobe pro dark" });
  T.register("ecosystem.split", function () {
    if (splitState) setSplit(null);
    else setSplit(lastSplitApp);
  }, { title: "Toggle split view", cat: "Ecosystem", icon: "i-split", match: "split screen side by side" });
  T.register("ecosystem.launcher", function () { toggleLauncher(); },
    { title: "App launcher", cat: "Ecosystem", icon: "i-grid", match: "launcher apps waffle" });

  /* ---------- public API ---------- */
  T.ecosystem = {};
  Object.defineProperties(T.ecosystem, {
    persona: { get: function () { return eco.persona; }, enumerable: true },
    app: { get: function () { return eco.app; }, enumerable: true }
  });
  T.ecosystem.setPersona = setPersona;
  T.ecosystem.openApp = openApp;
  T.ecosystem.toggleLauncher = toggleLauncher;
  T.ecosystem.setSplit = setSplit;
  T.ecosystem._toggleRatio = toggleRatio; // internal helper, exposed for tests
})();
