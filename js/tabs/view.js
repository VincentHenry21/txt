/* TXT View tab: document views, show toggles, zoom, focus mode.
   Ribbon tab + commands. Owns #stage view classes, split-screen overlay,
   ruler/grid/marks/nav visibility, and the shared zoom applier. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  function setOn(el, on) {
    if (!el) return;
    el.classList.toggle("active", !!on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  }

  var VIEWS = ["print", "web", "outline", "split", "immersive"];
  var ZOOMS = [50, 75, 100, 125, 150, 200];

  T.ribbon.addTab({ id: "view", label: "View", keytip: "W" });

  /* ---------------- zoom applier (also drives statusbar controls) ---------------- */
  var zoomSelect = null;
  function applyZoom(z) {
    z = T.clamp(Math.round(z) || 100, 50, 200);
    var f = z / 100;
    T.state.prefs.zoom = f;
    T.savePrefs();
    var zw = $("#zoomWrap");
    if (zw) zw.style.transform = "scale(" + f + ")";
    var slider = $("#zoomSlider");
    if (slider) slider.value = String(z);
    var pct = $("#zoomPct");
    if (pct) pct.textContent = z + "%";
    if (zoomSelect) zoomSelect.value = String(z);
    T.bus.emit("view:zoom", z);
    return z;
  }
  function curZoom() { return Math.round((T.state.prefs.zoom || 1) * 100); }
  function stepZoom(dir) {
    var c = curZoom(), next = c;
    if (dir < 0) {
      for (var i = ZOOMS.length - 1; i >= 0; i--) {
        if (ZOOMS[i] < c) { next = ZOOMS[i]; break; }
      }
      if (next === c) next = ZOOMS[0];
    } else {
      for (var j = 0; j < ZOOMS.length; j++) {
        if (ZOOMS[j] > c) { next = ZOOMS[j]; break; }
      }
      if (next === c) next = ZOOMS[ZOOMS.length - 1];
    }
    T.cmd("view.zoomSet", next);
  }

  /* ---------------- split screen overlay ---------------- */
  var splitPanes = null;
  var splitCSSAdded = false;
  function ensureSplitCSS() {
    if (splitCSSAdded) return;
    splitCSSAdded = true;
    var css =
      "#stageSplit{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;background:var(--ws-bg);}" +
      "#stageSplit .split-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--surface);}" +
      "#stageSplit .split-title{font-size:12px;font-weight:600;color:var(--muted);}" +
      "#stageSplit .split-close{margin-left:auto;}" +
      "#stageSplit .split-body{flex:1;display:flex;min-height:0;}" +
      "#stageSplit .split-pane{flex:1;min-width:0;overflow:auto;padding:20px 12px;}" +
      "#stageSplit .split-pane+.split-pane{border-left:1px solid var(--line);}" +
      "#stageSplit .split-doc .psheet{pointer-events:none;}" +
      "#stageSplit .split-doc .page{position:relative !important;margin:0 auto 24px !important;left:auto !important;top:auto !important;transform:none !important;}";
    var st = document.createElement("style");
    st.setAttribute("data-txt", "view-split");
    st.textContent = css;
    document.head.appendChild(st);
  }
  function snapshotPages(host) {
    var src = $("#pages");
    host.innerHTML = "";
    if (!src) return;
    var clone = src.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.add("split-doc");
    var sheet = clone.querySelector(".psheet");
    if (sheet) {
      sheet.setAttribute("contenteditable", "false");
      sheet.setAttribute("aria-readonly", "true");
    }
    host.appendChild(clone);
  }
  function refreshSplit() {
    if (!splitPanes) return;
    snapshotPages(splitPanes[0]);
    snapshotPages(splitPanes[1]);
  }
  var refreshSplitDeb = T.debounce(refreshSplit, 600);
  function splitIsOpen() { return !!$("#stageSplit"); }
  function openSplit() {
    if (splitIsOpen()) return;
    var stage = $("#stage");
    if (!stage) return;
    ensureSplitCSS();
    var ov = document.createElement("div");
    ov.id = "stageSplit";
    var bar = document.createElement("div");
    bar.className = "split-bar";
    var title = document.createElement("span");
    title.className = "split-title";
    title.textContent = "Split Screen";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "rbtn sm split-close";
    close.setAttribute("aria-label", "Close split screen");
    close.innerHTML = T.icon("i-x") + '<span class="rlab">Close split</span>';
    close.addEventListener("click", function () { T.cmd("view.split"); });
    bar.appendChild(title);
    bar.appendChild(close);
    var body = document.createElement("div");
    body.className = "split-body";
    var p1 = document.createElement("div");
    p1.className = "split-pane";
    p1.setAttribute("aria-label", "Split pane 1, read only");
    var p2 = document.createElement("div");
    p2.className = "split-pane";
    p2.setAttribute("aria-label", "Split pane 2, read only");
    body.appendChild(p1);
    body.appendChild(p2);
    ov.appendChild(bar);
    ov.appendChild(body);
    stage.appendChild(ov);
    splitPanes = [p1, p2];
    refreshSplit();
  }
  function closeSplit() {
    var ov = $("#stageSplit");
    if (ov) ov.remove();
    splitPanes = null;
  }
  T.bus.on("doc:change", refreshSplitDeb);
  T.bus.on("page:change", refreshSplitDeb);
  T.bus.on("overlay:escape", function () {
    if (splitIsOpen()) T.cmd("view.split");
  });

  /* ---------------- view switching ---------------- */
  var viewBtns = {};
  function applyView(v, opts) {
    if (VIEWS.indexOf(v) < 0) v = "print";
    var stage = $("#stage");
    if (stage) {
      stage.classList.remove("view-web", "view-outline", "immersive");
      if (v === "web") stage.classList.add("view-web");
      else if (v === "outline") stage.classList.add("view-outline");
      else if (v === "immersive") stage.classList.add("immersive");
    }
    if (v === "split") openSplit(); else closeSplit();
    T.state.prefs.view = v;
    T.savePrefs();
    VIEWS.forEach(function (k) { setOn(viewBtns[k], k === v); });
    if (!opts || !opts.silent) T.bus.emit("view:change", v);
  }

  /* ---------------- show toggles ---------------- */
  var rulersBtn = null, gridBtn = null, marksBtn = null, navBtn = null;
  function setRulers(on) {
    T.state.prefs.showRulers = !!on;
    T.savePrefs();
    var h = $("#rulerH"), v = $("#rulerV");
    if (h) h.style.display = on ? "" : "none";
    if (v) v.style.display = on ? "" : "none";
    setOn(rulersBtn, on);
    if (T.rulers && T.rulers.redraw) T.rulers.redraw();
  }
  function setGrid(on) {
    T.state.prefs.showGrid = !!on;
    T.savePrefs();
    var stage = $("#stage");
    if (stage) stage.classList.toggle("show-grid", !!on);
    setOn(gridBtn, on);
  }
  function setMarks(on) {
    T.state.prefs.showMarks = !!on;
    T.savePrefs();
    var stage = $("#stage");
    if (stage) stage.classList.toggle("show-marks", !!on);
    setOn(marksBtn, on);
  }
  function setNav(open) {
    T.state.prefs.sidebarOpen = !!open;
    T.savePrefs();
    var sb = $("#sidebar");
    if (sb) sb.classList.toggle("collapsed", !open);
    setOn(navBtn, open);
  }

  /* ---------------- ribbon build ---------------- */
  var gViews = T.ribbon.group("view", "Views");
  viewBtns.print = T.ribbon.btn({ icon: "i-print", label: "Print Layout", cmd: "view.print", toggle: true, title: "Print Layout view, paged" });
  viewBtns.web = T.ribbon.btn({ icon: "i-globe", label: "Web Continuous", cmd: "view.web", toggle: true, title: "Continuous web view, no page breaks" });
  viewBtns.outline = T.ribbon.btn({ icon: "i-toc", label: "Outline", cmd: "view.outline", toggle: true, title: "Outline view, headings only" });
  viewBtns.split = T.ribbon.btn({ icon: "i-split", label: "Split Screen", cmd: "view.split", toggle: true, title: "Split screen, two read-only panes" });
  viewBtns.immersive = T.ribbon.btn({ icon: "i-reading", label: "Immersive Reader", cmd: "view.immersive", toggle: true, title: "Immersive reader, focused reading" });

  var gShow = T.ribbon.group("view", "Show");
  rulersBtn = T.ribbon.btn({ icon: "i-ruler", label: "Rulers", cmd: "view.rulers", toggle: true, small: true, title: "Show or hide the rulers" });
  gridBtn = T.ribbon.btn({ icon: "i-grid", label: "Gridlines", cmd: "view.grid", toggle: true, small: true, title: "Show or hide page gridlines" });
  marksBtn = T.ribbon.btn({ icon: "i-marks", label: "Formatting Marks", cmd: "view.marks", toggle: true, small: true, title: "Show or hide formatting marks" });
  navBtn = T.ribbon.btn({ icon: "i-book", label: "Navigation Pane", cmd: "view.nav", toggle: true, small: true, title: "Show or hide the navigation pane" });

  var gZoom = T.ribbon.group("view", "Zoom");
  T.ribbon.btn({ icon: "i-minus", label: "Zoom Out", cmd: "view.zoomOut", small: true, title: "Zoom out" });
  var zoomOpts = ZOOMS.map(function (z) { return { v: String(z), t: z + "%" }; });
  zoomSelect = T.ribbon.select({
    options: zoomOpts, value: String(curZoom()), cls: "zoom-sel", title: "Zoom level",
    onChange: function (v) { T.cmd("view.zoomSet", parseInt(String(v), 10)); }
  });
  T.ribbon.btn({ icon: "i-plus", label: "Zoom In", cmd: "view.zoomIn", small: true, title: "Zoom in" });

  var gFocus = T.ribbon.group("view", "Focus");
  T.ribbon.btn({ icon: "i-focus", label: "Focus Mode", cmd: "view.focusMode", title: "Toggle focus mode, hide chrome" });

  /* ---------------- command registration ---------------- */
  T.register("view.print", function () { applyView("print"); }, { title: "Print Layout", cat: "View", icon: "i-print" });
  T.register("view.web", function () { applyView("web"); }, { title: "Web Continuous", cat: "View", icon: "i-globe" });
  T.register("view.outline", function () { applyView("outline"); }, { title: "Outline", cat: "View", icon: "i-toc" });
  T.register("view.split", function () { applyView(splitIsOpen() ? "print" : "split"); }, { title: "Split Screen", cat: "View", icon: "i-split" });
  T.register("view.immersive", function () { applyView("immersive"); }, { title: "Immersive Reader", cat: "View", icon: "i-reading" });
  T.register("view.rulers", function () { setRulers(!T.state.prefs.showRulers); }, { title: "Toggle rulers", cat: "View", icon: "i-ruler" });
  T.register("view.grid", function () { setGrid(!T.state.prefs.showGrid); }, { title: "Toggle gridlines", cat: "View", icon: "i-grid" });
  T.register("view.marks", function () { setMarks(!T.state.prefs.showMarks); }, { title: "Toggle formatting marks", cat: "View", icon: "i-marks" });
  T.register("view.nav", function () { setNav(!T.state.prefs.sidebarOpen); }, { title: "Toggle navigation pane", cat: "View", icon: "i-book" });
  T.register("view.zoomOut", function () { stepZoom(-1); }, { title: "Zoom out", cat: "View", icon: "i-minus" });
  T.register("view.zoomIn", function () { stepZoom(1); }, { title: "Zoom in", cat: "View", icon: "i-plus" });
  T.register("view.zoomSet", function (z) { applyZoom(z); }, { title: "Set zoom", cat: "View", icon: "i-plus" });
  T.register("view.focusMode", function () { T.cmd("view.focus"); }, { title: "Focus mode", cat: "View", icon: "i-focus" });

  /* keep ribbon zoom select in sync when zoom changes elsewhere (statusbar) */
  T.bus.on("view:zoom", function (z) { if (zoomSelect) zoomSelect.value = String(z); });

  /* ---------------- apply persisted prefs ---------------- */
  applyView(T.state.prefs.view || "print", { silent: true });
  applyZoom(curZoom());
  setRulers(T.state.prefs.showRulers !== false);
  setGrid(!!T.state.prefs.showGrid);
  setMarks(!!T.state.prefs.showMarks);
  setNav(T.state.prefs.sidebarOpen !== false);
})();
