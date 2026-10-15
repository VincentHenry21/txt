/* TXT Layout tab: margins, orientation, paper size, columns.
   Builds against the ribbon contract in ARCHITECTURE.md section 9. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  T.ribbon.addTab({ id: "layout", label: "Layout", keytip: "L" });

  /* smooth geometry animation: injected once */
  (function injectAnim() {
    if (document.getElementById("txtOrientAnim")) return;
    var el = document.createElement("style");
    el.id = "txtOrientAnim";
    el.textContent = ".page{transition:width .35s ease,height .35s ease}#sheetLayer .psheet{transition:padding .35s ease}";
    document.head.appendChild(el);
  })();

  var MARGIN_OPTS = [
    { v: "normal", t: "Normal" },
    { v: "narrow", t: "Narrow" },
    { v: "moderate", t: "Moderate" },
    { v: "wide", t: "Wide" },
    { v: "custom", t: "Custom..." }
  ];
  var MARGIN_CYCLE = ["normal", "narrow", "moderate", "wide"];
  var PAPER_OPTS = [
    { v: "letter", t: "US Letter" },
    { v: "a4", t: "A4" },
    { v: "legal", t: "Legal" },
    { v: "executive", t: "Executive" }
  ];
  var PAPER_CYCLE = ["letter", "a4", "legal", "executive"];

  /* ---------- state setters ---------- */
  function setMargin(id) {
    if (id === "custom") { customMarginDialog(); return; }
    if (!T.editor.MARGINS.hasOwnProperty(id)) return;
    T.editor.geom.margin = id;
    T.editor.applyGeom();
    refreshLayoutUI();
  }
  function customMarginDialog() {
    var cur = T.editor.geom.customMargin || T.editor.marginPx();
    T.modal({
      title: "Custom margins",
      sub: "Margin size in pixels, applied to all four sides.",
      okText: "Apply",
      fields: [{ key: "px", label: "Margin (px)", type: "number", value: cur }]
    }).then(function (out) {
      if (!out) { refreshLayoutUI(); return; }
      var px = T.clamp(parseInt(out.px, 10) || 0, 0, 400);
      T.editor.geom.margin = "custom";
      T.editor.geom.customMargin = px;
      T.editor.applyGeom();
      refreshLayoutUI();
    });
  }
  function setOrient(o) {
    if (o !== "portrait" && o !== "landscape") return;
    T.editor.geom.orient = o;
    T.editor.applyGeom();
    refreshLayoutUI();
  }
  function setPaper(p) {
    if (!T.editor.PAPERS[p]) return;
    T.editor.geom.paper = p;
    T.editor.applyGeom();
    refreshLayoutUI();
  }
  function setColumns(n) {
    n = T.clamp(parseInt(n, 10) || 1, 1, 3);
    T.editor.geom.columns = n;
    T.editor.applyGeom();
    refreshLayoutUI();
  }
  function toggleColDivider() {
    T.editor.geom.colDiv = !T.editor.geom.colDiv;
    T.editor.applyGeom();
    refreshLayoutUI();
  }

  /* ---------- ribbon UI ---------- */
  var g1 = T.ribbon.group("layout", "Margins");
  var marginSel = T.ribbon.select({
    options: MARGIN_OPTS,
    value: T.editor.geom.margin,
    title: "Page margins",
    onChange: function (v) { setMargin(v); }
  });
  g1.appendChild(marginSel);

  var g2 = T.ribbon.group("layout", "Orientation");
  var portBtn = T.ribbon.btn({
    icon: "i-orient", label: "Portrait", title: "Portrait orientation",
    cmd: "layout.orientationPortrait"
  });
  g2.appendChild(portBtn);
  var landBtn = T.ribbon.btn({
    icon: "i-orient", label: "Landscape", title: "Landscape orientation",
    cmd: "layout.orientationLandscape"
  });
  g2.appendChild(landBtn);

  var g3 = T.ribbon.group("layout", "Paper Size");
  var paperSel = T.ribbon.select({
    options: PAPER_OPTS,
    value: T.editor.geom.paper,
    title: "Paper size",
    onChange: function (v) { setPaper(v); }
  });
  g3.appendChild(paperSel);

  var g4 = T.ribbon.group("layout", "Columns");
  var colBtns = {};
  [1, 2, 3].forEach(function (n) {
    var b = T.ribbon.btn({
      icon: "i-columns", label: String(n), title: n + " column" + (n > 1 ? "s" : ""),
      cmd: "layout.columns", args: [n], small: true
    });
    colBtns[n] = b;
    g4.appendChild(b);
  });
  var divBtn = T.ribbon.btn({
    icon: "i-split", label: "Divider", title: "Show a divider line between columns",
    cmd: "layout.colDivider", small: true
  });
  g4.appendChild(divBtn);

  /* ---------- UI refresh (keeps ribbon in sync with geom) ---------- */
  function refreshLayoutUI() {
    var g = T.editor.geom;
    if (marginSel && marginSel.value !== g.margin) marginSel.value = g.margin;
    if (paperSel && paperSel.value !== g.paper) paperSel.value = g.paper;
    if (portBtn) portBtn.classList.toggle("active", g.orient === "portrait");
    if (landBtn) landBtn.classList.toggle("active", g.orient === "landscape");
    Object.keys(colBtns).forEach(function (n) {
      colBtns[n].classList.toggle("active", g.columns === parseInt(n, 10));
    });
    if (divBtn) divBtn.classList.toggle("active", !!g.colDiv);
  }

  /* ---------- commands ---------- */
  T.register("layout.margins", function (id) {
    if (typeof id === "string" && id) { setMargin(id); return; }
    var g = T.editor.geom.margin;
    var i = MARGIN_CYCLE.indexOf(g);
    setMargin(MARGIN_CYCLE[(i + 1) % MARGIN_CYCLE.length]);
  }, { title: "Margins", cat: "Layout", icon: "i-margins" });
  T.register("layout.orientationPortrait", function () { setOrient("portrait"); }, { title: "Portrait orientation", cat: "Layout", icon: "i-orient" });
  T.register("layout.orientationLandscape", function () { setOrient("landscape"); }, { title: "Landscape orientation", cat: "Layout", icon: "i-orient" });
  T.register("layout.paper", function (p) {
    if (typeof p === "string" && T.editor.PAPERS[p]) { setPaper(p); return; }
    var i = PAPER_CYCLE.indexOf(T.editor.geom.paper);
    setPaper(PAPER_CYCLE[(i + 1) % PAPER_CYCLE.length]);
  }, { title: "Paper size", cat: "Layout", icon: "i-papersize" });
  T.register("layout.columns", function (n) { setColumns(n == null ? 1 : n); }, { title: "Columns", cat: "Layout", icon: "i-columns" });
  T.register("layout.columns1", function () { setColumns(1); }, { title: "One column", cat: "Layout", icon: "i-columns" });
  T.register("layout.columns2", function () { setColumns(2); }, { title: "Two columns", cat: "Layout", icon: "i-columns" });
  T.register("layout.columns3", function () { setColumns(3); }, { title: "Three columns", cat: "Layout", icon: "i-columns" });
  T.register("layout.colDivider", function () { toggleColDivider(); }, { title: "Column divider", cat: "Layout", icon: "i-split" });

  T.bus.on("doc:open", refreshLayoutUI);
  refreshLayoutUI();
})();
