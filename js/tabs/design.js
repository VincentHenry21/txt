/* TXT Design tab: document themes, watermark, page color, page borders.
   Builds against the ribbon contract in ARCHITECTURE.md section 9. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  T.ribbon.addTab({ id: "design", label: "Design", keytip: "G" });

  /* ---------- per-doc design metadata (persisted across reloads) ---------- */
  function metaKey() {
    var d = T.editor.getDoc();
    return d ? "txt:design:" + d.id : null;
  }
  function saveMeta() {
    var k = metaKey(), d = T.editor.getDoc();
    if (!k || !d) return;
    T.lsSet(k, { preset: d.designPreset || null, pageColor: d.pageColor || "", pageBorder: d.pageBorder || "none" });
  }
  function loadMeta() {
    var k = metaKey();
    return k ? (T.lsGet(k, null) || {}) : {};
  }

  /* ---------- document themes ---------- */
  var PRESETS = {
    corporate: {
      label: "Corporate Swiss", icon: "i-swatch",
      sheet: { font: "Inter", lineHeight: "1.35", textAlign: "" },
      head: { font: "Inter", weight: "800", color: "#1d4ed8", spacing: "-0.01em" }
    },
    academic: {
      label: "Academic Serif", icon: "i-book",
      sheet: { font: "Georgia", lineHeight: "1.7", textAlign: "justify" },
      head: { font: "Georgia", weight: "700", color: "", spacing: "" }
    },
    tech: {
      label: "Modern Tech", icon: "i-code",
      sheet: { font: "Inter", lineHeight: "1.55", textAlign: "" },
      head: { font: "JetBrains Mono", weight: "700", color: "#0f172a", spacing: "" }
    },
    editorial: {
      label: "Editorial Magazine", icon: "i-quote",
      sheet: { font: "Georgia", lineHeight: "1.65", textAlign: "" },
      head: { font: "Playfair Display", weight: "700", color: "#7c2d12", spacing: "" }
    },
    mono: {
      label: "Manuscript Mono", icon: "i-code",
      sheet: { font: "JetBrains Mono", lineHeight: "1.6", textAlign: "" },
      head: { font: "JetBrains Mono", weight: "700", color: "", spacing: "" }
    }
  };

  function applyPreset(id) {
    var p = PRESETS[id];
    if (!p) return;
    var sheet = T.editor.sheetEl();
    if (!sheet) { T.toast("Open a document first"); return; }
    T.fonts.ensure(p.sheet.font);
    T.fonts.ensure(p.head.font);
    sheet.style.fontFamily = T.fonts.stackFor(p.sheet.font);
    sheet.style.lineHeight = p.sheet.lineHeight;
    sheet.style.textAlign = p.sheet.textAlign;
    $$("h1,h2,h3", sheet).forEach(function (h) {
      h.style.fontFamily = T.fonts.stackFor(p.head.font);
      h.style.fontWeight = p.head.weight;
      h.style.color = p.head.color;
      h.style.letterSpacing = p.head.spacing;
    });
    var doc = T.editor.getDoc();
    if (doc) doc.designPreset = id;
    saveMeta();
    T.editor.markDirty();
    refreshDesignUI();
  }

  function currentPreset() {
    var doc = T.editor.getDoc();
    return doc ? (doc.designPreset || null) : null;
  }

  var presetBtns = {};
  function refreshDesignUI() {
    var cur = currentPreset();
    Object.keys(presetBtns).forEach(function (id) {
      var b = presetBtns[id];
      if (b) b.classList.toggle("active", cur === id);
    });
  }

  /* ---------- page color ---------- */
  function applyPageColor(color) {
    var doc = T.editor.getDoc();
    if (doc) doc.pageColor = color || "";
    $$("#pages .page").forEach(function (p) {
      p.style.background = color || "";
    });
    saveMeta();
  }
  function clearPageColor() {
    applyPageColor("");
    T.editor.markDirty();
  }
  function pageColorMenu(anchor) {
    var doc = T.editor.getDoc();
    var val = (doc && doc.pageColor) || "#ffffff";
    T.ribbon.openMenu(anchor, [
      { head: "Page color" },
      { html: '<div class="menu-color-row"><input type="color" id="txtPageColorPick" value="' + T.esc(val) + '" aria-label="Page color"><span>Pick a color</span></div>' },
      { sep: true },
      { icon: "i-x", label: "Clear", fn: function () { clearPageColor(); } }
    ]);
    setTimeout(function () {
      var inp = document.getElementById("txtPageColorPick");
      if (!inp) return;
      function live() { applyPageColor(inp.value); }
      inp.addEventListener("input", live);
      inp.addEventListener("change", function () { applyPageColor(inp.value); T.editor.markDirty(); });
    }, 30);
  }

  /* ---------- page borders ---------- */
  var BORDERS = {
    none: "",
    simple: ".page{box-shadow:inset 0 0 0 2px rgba(100,116,139,.55) !important;}",
    double: ".page{outline:3px double #475569 !important;outline-offset:-8px;}",
    artistic: ".page{outline:2px dashed #9a6b2f !important;outline-offset:-10px;border-radius:6px;}"
  };
  var BORDER_LABELS = { none: "None", simple: "Simple Box", double: "Double Frame", artistic: "Artistic Dashed" };

  function borderStyleEl() {
    var el = document.getElementById("txtPageBorderStyle");
    if (!el) {
      el = document.createElement("style");
      el.id = "txtPageBorderStyle";
      document.head.appendChild(el);
    }
    return el;
  }
  function applyPageBorder(id) {
    if (!BORDERS.hasOwnProperty(id)) id = "none";
    borderStyleEl().textContent = BORDERS[id];
    var doc = T.editor.getDoc();
    if (doc) doc.pageBorder = id;
    saveMeta();
    T.editor.markDirty();
  }
  function currentBorder() {
    var doc = T.editor.getDoc();
    return (doc && doc.pageBorder) || "none";
  }
  function pageBorderItems() {
    return Object.keys(BORDER_LABELS).map(function (id) {
      return {
        icon: "i-border",
        label: BORDER_LABELS[id],
        active: currentBorder() === id,
        fn: function () { applyPageBorder(id); }
      };
    });
  }

  /* ---------- watermark ---------- */
  function watermarkDialog() {
    var doc = T.editor.getDoc();
    var wm = (doc && doc.wm) || {};
    T.modal({
      title: "Watermark",
      sub: "Leave the text empty to clear the watermark.",
      okText: "Apply",
      fields: [
        { key: "text", label: "Watermark text", type: "text", value: wm.text || "", ph: "DRAFT" },
        {
          key: "style", label: "Style", type: "select", value: wm.style || "diagonal",
          options: [{ v: "diagonal", t: "Diagonal" }, { v: "horizontal", t: "Horizontal" }]
        },
        { key: "size", label: "Size (px)", type: "number", value: wm.size || 84 },
        { key: "opacity", label: "Opacity (%)", type: "range", min: 5, max: 60, value: Math.round(((wm.opacity != null ? wm.opacity : 0.16)) * 100) },
        { key: "color", label: "Color", type: "color", value: wm.color || "#9aa0b4" }
      ]
    }).then(function (out) {
      if (!out) return;
      var text = (out.text || "").trim();
      if (!text) {
        T.editor.setWatermark(null);
        T.toast("Watermark cleared");
        return;
      }
      T.editor.setWatermark({
        text: text,
        style: out.style || "diagonal",
        size: Math.max(12, Math.min(400, parseInt(out.size, 10) || 84)),
        opacity: Math.max(0.05, Math.min(0.6, (parseFloat(out.opacity) || 16) / 100)),
        color: out.color || "#9aa0b4"
      });
    });
  }

  /* ---------- ribbon UI ---------- */
  var g1 = T.ribbon.group("design", "Document Themes");
  Object.keys(PRESETS).forEach(function (id) {
    var p = PRESETS[id];
    var b = T.ribbon.btn({
      icon: p.icon, label: p.label, title: "Apply the " + p.label + " theme",
      cmd: "design.preset", args: [id]
    });
    presetBtns[id] = b;
    g1.appendChild(b);
  });

  var g2 = T.ribbon.group("design", "Page Background");
  var colorBtn = T.ribbon.btn({
    icon: "i-pagecolor", label: "Page Color", title: "Set the page background color",
    cmd: "design.pageColor"
  });
  g2.appendChild(colorBtn);
  var wmBtn = T.ribbon.btn({
    icon: "i-watermark", label: "Watermark", title: "Add or clear a page watermark",
    cmd: "design.watermark"
  });
  g2.appendChild(wmBtn);
  var borderMenuBtn = T.ribbon.menuBtn({
    icon: "i-border", label: "Page Borders", title: "Draw a border around each page",
    items: pageBorderItems()
  });
  g2.appendChild(borderMenuBtn);

  /* ---------- commands ---------- */
  T.register("design.preset", function (id) { applyPreset(id); }, { title: "Apply document theme", cat: "Design", icon: "i-swatch" });
  T.register("design.presetCorporate", function () { applyPreset("corporate"); }, { title: "Apply Corporate Swiss theme", cat: "Design", icon: "i-swatch" });
  T.register("design.presetAcademic", function () { applyPreset("academic"); }, { title: "Apply Academic Serif theme", cat: "Design", icon: "i-book" });
  T.register("design.presetTech", function () { applyPreset("tech"); }, { title: "Apply Modern Tech theme", cat: "Design", icon: "i-code" });
  T.register("design.presetEditorial", function () { applyPreset("editorial"); }, { title: "Apply Editorial Magazine theme", cat: "Design", icon: "i-quote" });
  T.register("design.presetMono", function () { applyPreset("mono"); }, { title: "Apply Manuscript Mono theme", cat: "Design", icon: "i-code" });
  T.register("design.watermark", function () { watermarkDialog(); }, { title: "Watermark", cat: "Design", icon: "i-watermark" });
  T.register("design.pageColor", function (color) {
    if (typeof color === "string" && color) { applyPageColor(color); T.editor.markDirty(); }
    else pageColorMenu(colorBtn);
  }, { title: "Page color", cat: "Design", icon: "i-pagecolor" });
  T.register("design.pageBorder", function (id) {
    if (typeof id === "string" && BORDERS.hasOwnProperty(id)) { applyPageBorder(id); }
    else T.ribbon.openMenu(borderMenuBtn, pageBorderItems());
  }, { title: "Page border", cat: "Design", icon: "i-border" });

  /* ---------- reapply on page geometry changes and doc switches ---------- */
  T.bus.on("page:change", function () { applyPageColor((T.editor.getDoc() || {}).pageColor || ""); });
  T.bus.on("doc:open", function () {
    var m = loadMeta();
    var doc = T.editor.getDoc();
    if (doc) {
      doc.designPreset = m.preset || null;
      doc.pageColor = m.pageColor || "";
      doc.pageBorder = m.pageBorder || "none";
    }
    borderStyleEl().textContent = BORDERS[m.pageBorder] || "";
    applyPageColor(m.pageColor || "");
    refreshDesignUI();
  });
  refreshDesignUI();
})();
