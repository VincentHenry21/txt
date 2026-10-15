/* TXT topbar (zone A): title, quick access, command palette, goal ring,
   ribbon mode, device mode, theme picker, paper toggle, export CTA. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  function ed() { return T.editor; }

  /* ---------- document title ---------- */
  var titleEl = $("#docTitle");
  function setTitleFromDoc() {
    var e = ed();
    if (!e || !titleEl) return;
    var d = e.getDoc();
    if (d && titleEl.value !== d.title) titleEl.value = d.title || "";
  }
  if (titleEl) {
    titleEl.addEventListener("input", function () {
      var e = ed();
      if (!e) return;
      var d = e.getDoc();
      if (d) d.title = titleEl.value;
      e.markDirty();
    });
    T.bus.on("doc:open", setTitleFromDoc);
  }

  /* ---------- quick access ---------- */
  var qa = { qaUndo: "doc.undo", qaRedo: "doc.redo", qaPrint: "doc.print" };
  Object.keys(qa).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function () { T.cmd(qa[id]); });
  });

  /* ---------- command palette ---------- */
  var cmdkBtn = $("#cmdkBtn");
  if (cmdkBtn) cmdkBtn.addEventListener("click", function () { T.bus.emit("palette:open"); });

  /* ---------- file menu (backstage) ---------- */
  var logoBadge = $("#logoBadge");
  if (logoBadge) logoBadge.addEventListener("click", function () {
    if (T.backstage && T.backstage.open) T.backstage.open("new");
  });

  /* ---------- word goal ring ---------- */
  var goalRing = $("#goalRing"), goalArc = $("#goalArc"), goalPct = $("#goalPct");
  function updateGoalRing(words) {
    if (!goalArc || !goalPct) return;
    var goal = Math.max(1, parseInt(T.state.prefs.wordGoal, 10) || 500);
    var w = Math.max(0, parseInt(words, 10) || 0);
    var pct = Math.min(100, (w / goal) * 100);
    var disp = Math.round(pct);
    goalArc.setAttribute("stroke-dasharray", "100.5");
    goalArc.setAttribute("stroke-dashoffset", String(100.5 * (1 - pct / 100)));
    goalPct.textContent = disp + "%";
    if (goalRing) goalRing.setAttribute("title", "Word goal: " + w + " of " + goal + " words");
  }
  if (goalRing) {
    goalRing.addEventListener("click", function () {
      T.modal({
        title: "Word goal",
        sub: "Daily target in words. The ring fills as you type.",
        fields: [{ key: "goal", label: "Words", type: "number", value: String(T.state.prefs.wordGoal || 500) }],
        okText: "Save goal"
      }).then(function (out) {
        if (!out) return;
        var v = parseInt(out.goal, 10);
        if (!(v > 0)) { T.toast("Goal must be at least 1 word.", "error"); return; }
        T.state.prefs.wordGoal = Math.min(100000, v);
        T.savePrefs();
        var e = ed();
        updateGoalRing(e && e.countWords ? e.countWords() : 0);
        T.toast("Word goal set to " + T.state.prefs.wordGoal + " words.");
      });
    });
    T.bus.on("counts", function (c) { updateGoalRing(c ? c.words : 0); });
    T.bus.on("doc:open", function () {
      var e = ed();
      updateGoalRing(e && e.countWords ? e.countWords() : 0);
    });
  }

  /* ---------- ribbon mode segmented ---------- */
  var ribbonMode = $("#ribbonMode");
  function syncRibbonMode(mode) {
    if (!ribbonMode) return;
    Array.prototype.forEach.call(ribbonMode.querySelectorAll("[data-mode]"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  }
  if (ribbonMode) {
    ribbonMode.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-mode]") : null;
      if (!b) return;
      var mode = b.getAttribute("data-mode");
      syncRibbonMode(mode);
      if (T.ribbon && T.ribbon.setMode) T.ribbon.setMode(mode);
      T.state.prefs.ribbonMode = mode;
      T.savePrefs();
    });
    syncRibbonMode(T.state.prefs.ribbonMode || "full");
  }

  /* ---------- device mode segmented ---------- */
  var deviceMode = $("#deviceMode");
  if (deviceMode) {
    deviceMode.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-device]") : null;
      if (!b) return;
      var mode = b.getAttribute("data-device");
      Array.prototype.forEach.call(deviceMode.querySelectorAll("[data-device]"), function (x) {
        x.classList.toggle("active", x === b);
      });
      if (T.mobile && T.mobile.setDevice) T.mobile.setDevice(mode);
    });
  }

  /* ---------- theme picker + paper toggle ---------- */
  var themePicker = $("#themePicker"), paperToggle = $("#paperToggle");
  function syncThemeUI(theme) {
    if (themePicker && themePicker.value !== theme) themePicker.value = theme;
    if (paperToggle) paperToggle.classList.toggle("hidden", theme !== "obsidian");
  }
  if (themePicker) {
    themePicker.addEventListener("change", function () {
      if (T.themes && T.themes.apply) T.themes.apply(themePicker.value);
    });
    syncThemeUI(T.state.prefs.theme || "studio");
  }
  T.bus.on("theme:change", function (d) { syncThemeUI(d ? d.theme : T.state.prefs.theme); });
  if (paperToggle) {
    paperToggle.addEventListener("click", function () {
      if (T.themes && T.themes.togglePaper) T.themes.togglePaper();
    });
  }

  /* ---------- export CTA ---------- */
  var btnExportTop = $("#btnExportTop");
  if (btnExportTop) {
    btnExportTop.addEventListener("click", function () {
      var items = T.listCommands()
        .filter(function (c) { return c.name.indexOf("export.") === 0; })
        .map(function (c) {
          return { icon: c.icon, label: c.title, fn: function () { T.cmd(c.name); } };
        });
      if (!items.length) { T.toast("No exporters available yet."); return; }
      if (T.ribbon && T.ribbon.openMenu) T.ribbon.openMenu(btnExportTop, items);
    });
  }

  /* initial goal ring paint */
  (function () {
    var e = ed();
    updateGoalRing(e && e.countWords ? e.countWords() : 0);
  })();
})();
