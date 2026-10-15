/* TXT VAC Studio: right-side panels for the Illustrator persona.
   Builds into #vPanels (inside #view-vac): Word CTA, Transform,
   Pathfinder, Align and Distribute, Stroke, Gradient builder, Layers tree.
   All controls edit the live SVG through T.vac / T.vacOps.
   Refreshes on bus events 'vac:selection' and 'vac:change'. */

(function () {
  "use strict";
  var T = window.TXT;
  var SVGNS = "http://www.w3.org/2000/svg";

  function svg() { return (T.vac && typeof T.vac.svgEl === "function") ? T.vac.svgEl() : null; }
  function sel() { return (T.vac && typeof T.vac.selection === "function") ? (T.vac.selection() || []) : []; }
  function ops() { return T.vacOps || null; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }
  function fieldRow(label, input) {
    var w = h("label", "vp-field");
    w.appendChild(h("span", "vp-flab", T.esc(label)));
    w.appendChild(input);
    return w;
  }
  function numInput(min, max, step, val) {
    var i = document.createElement("input");
    i.type = "number"; i.className = "vp-num";
    if (min !== undefined) i.min = String(min);
    if (max !== undefined) i.max = String(max);
    if (step !== undefined) i.step = String(step);
    i.value = String(val);
    return i;
  }
  function rangeInput(min, max, step, val) {
    var i = document.createElement("input");
    i.type = "range"; i.className = "vp-range";
    i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(val);
    return i;
  }
  /* Segmented control. options: [{v, t, icon}]. */
  function seg(options, current, onPick) {
    var w = h("div", "vp-seg");
    options.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.title = o.t;
      b.setAttribute("data-v", o.v);
      b.innerHTML = (o.icon ? T.icon(o.icon) : "") + "<span>" + T.esc(o.t) + "</span>";
      if (String(o.v) === String(current)) b.classList.add("active");
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(w.children, function (c) { c.classList.remove("active"); });
        b.classList.add("active");
        onPick(o.v);
      });
      w.appendChild(b);
    });
    w.set = function (v) {
      Array.prototype.forEach.call(w.children, function (c) {
        c.classList.toggle("active", c.getAttribute("data-v") === String(v));
      });
    };
    return w;
  }
  function makePanel(id, title) {
    var sec = h("section", "vp-panel");
    sec.setAttribute("data-p", id);
    var head = document.createElement("button");
    head.type = "button"; head.className = "vp-head";
    head.innerHTML = T.icon("i-chev-d", "vp-chev") + "<span>" + T.esc(title) + "</span>";
    head.addEventListener("click", function () { sec.classList.toggle("closed"); });
    var body = h("div", "vp-body");
    sec.appendChild(head); sec.appendChild(body);
    sec._body = body;
    return sec;
  }

  /* ================= 0. Word CTA ================= */
  function sendToWord() {
    if (!T.store || typeof T.store.emit !== "function") { T.toast("Word bridge is not ready yet.", "error"); return; }
    if (!T.vac || typeof T.vac.getSVG !== "function") { T.toast("VAC engine is not ready yet.", "error"); return; }
    var id = T.vac._vid || ("v" + Date.now());
    T.vac._vid = id;
    try {
      T.store.emit("txt:insert-svg", { id: id, svg: T.vac.getSVG() });
      T.toast("Artwork sent to the TXT document.");
    } catch (e) { T.toast("Could not send artwork.", "error"); }
  }
  function buildCTA() {
    var wrap = h("div", "vp-cta");
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "vp-btn primary";
    btn.innerHTML = T.icon("i-export") + "<span>Insert / Update in TXT Document</span>";
    btn.addEventListener("click", sendToWord);
    wrap.appendChild(btn);
    wrap.appendChild(h("div", "vp-cta-note", "Sends the artwork to the TXT document as an editable figure. Sending again updates the same figure."));
    return wrap;
  }

  /* ================= 1. Transform ================= */
  var TR = { fX: null, fY: null, fW: null, fH: null, rot: null, rotVal: null, corner: null, op: null, blend: null, rotShown: 0 };
  function curBoxes() {
    var O = ops(); if (!O) return [];
    return sel().map(function (el) { return { el: el, b: O.visualBBox(el) }; }).filter(function (o) { return o.b; });
  }
  function applyToSelection(fn) {
    var O = ops(); if (!O) return;
    var items = curBoxes();
    if (!items.length) return;
    fn(items, O);
    O.changed();
  }
  function buildTransform() {
    var p = makePanel("transform", "Properties and Transform"), b = p._body;
    var row1 = h("div", "vp-row2");
    TR.fX = numInput(-5000, 5000, 1, 0); TR.fY = numInput(-5000, 5000, 1, 0);
    row1.appendChild(fieldRow("X", TR.fX)); row1.appendChild(fieldRow("Y", TR.fY));
    var row2 = h("div", "vp-row2");
    TR.fW = numInput(0.5, 5000, 1, 0); TR.fH = numInput(0.5, 5000, 1, 0);
    row2.appendChild(fieldRow("W", TR.fW)); row2.appendChild(fieldRow("H", TR.fH));
    b.appendChild(row1); b.appendChild(row2);

    var rrow = h("div", "vp-row");
    TR.rot = rangeInput(-180, 180, 1, 0); TR.rotVal = h("span", "vp-val", "0 deg");
    rrow.appendChild(fieldRow("Rotation", TR.rot)); rrow.appendChild(TR.rotVal);
    b.appendChild(rrow);

    var crow = h("div", "vp-row");
    TR.corner = numInput(0, 500, 1, 0);
    crow.appendChild(fieldRow("Corner radius", TR.corner));
    b.appendChild(crow);

    var orow = h("div", "vp-row");
    TR.op = rangeInput(0, 100, 1, 100);
    orow.appendChild(fieldRow("Opacity", TR.op));
    b.appendChild(orow);

    TR.blend = document.createElement("select");
    TR.blend.className = "vp-select";
    ["normal", "multiply", "screen", "overlay", "darken", "lighten"].forEach(function (m) {
      var o = document.createElement("option"); o.value = m; o.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      TR.blend.appendChild(o);
    });
    var brow = h("div", "vp-row");
    brow.appendChild(fieldRow("Blend mode", TR.blend));
    b.appendChild(brow);

    function singleBox() {
      var items = curBoxes();
      return items.length === 1 ? items[0] : null;
    }
    function unionOf(items) { return ops().unionBox(items.map(function (o) { return o.b; })); }

    TR.fX.addEventListener("change", function () {
      var v = parseFloat(TR.fX.value); if (isNaN(v)) { refreshTransform(); return; }
      applyToSelection(function (items, O) {
        if (items.length === 1) { var b = items[0].b; O.applyBox(items[0].el, { x: v, y: b.y, w: b.w, h: b.h, rotation: O.getRot(items[0].el) }); }
        else { var u = unionOf(items), dx = v - u.x; items.forEach(function (o) { O.nudge(o.el, dx, 0); }); }
      });
      refreshTransform(TR.fX);
    });
    TR.fY.addEventListener("change", function () {
      var v = parseFloat(TR.fY.value); if (isNaN(v)) { refreshTransform(); return; }
      applyToSelection(function (items, O) {
        if (items.length === 1) { var b = items[0].b; O.applyBox(items[0].el, { x: b.x, y: v, w: b.w, h: b.h, rotation: O.getRot(items[0].el) }); }
        else { var u = unionOf(items), dy = v - u.y; items.forEach(function (o) { O.nudge(o.el, 0, dy); }); }
      });
      refreshTransform(TR.fY);
    });
    TR.fW.addEventListener("change", function () {
      var v = Math.max(0.5, parseFloat(TR.fW.value)); if (isNaN(v)) { refreshTransform(); return; }
      applyToSelection(function (items, O) {
        if (items.length === 1) { var b = items[0].b; O.applyBox(items[0].el, { x: b.x, y: b.y, w: v, h: b.h, rotation: O.getRot(items[0].el) }); }
        else {
          var u = unionOf(items), k = v / Math.max(0.5, u.w), cx = u.x + u.w / 2, cy = u.y + u.h / 2;
          items.forEach(function (o) {
            var b2 = o.b, ncx = cx + (b2.x + b2.w / 2 - cx) * k;
            O.applyBox(o.el, { x: ncx - b2.w * k / 2, y: b2.y, w: b2.w * k, h: b2.h, rotation: O.getRot(o.el) });
          });
        }
      });
      refreshTransform(TR.fW);
    });
    TR.fH.addEventListener("change", function () {
      var v = Math.max(0.5, parseFloat(TR.fH.value)); if (isNaN(v)) { refreshTransform(); return; }
      applyToSelection(function (items, O) {
        if (items.length === 1) { var b = items[0].b; O.applyBox(items[0].el, { x: b.x, y: b.y, w: b.w, h: v, rotation: O.getRot(items[0].el) }); }
        else {
          var u = unionOf(items), k = v / Math.max(0.5, u.h), cx = u.x + u.w / 2, cy = u.y + u.h / 2;
          items.forEach(function (o) {
            var b2 = o.b, ncy = cy + (b2.y + b2.h / 2 - cy) * k;
            O.applyBox(o.el, { x: b2.x, y: ncy - b2.h * k / 2, w: b2.w, h: b2.h * k, rotation: O.getRot(o.el) });
          });
        }
      });
      refreshTransform(TR.fH);
    });
    TR.rot.addEventListener("input", function () {
      var v = parseFloat(TR.rot.value) || 0;
      TR.rotVal.textContent = v + " deg";
      var d = v - TR.rotShown;
      applyToSelection(function (items, O) {
        items.forEach(function (o) {
          var b = o.b;
          O.applyBox(o.el, { x: b.x, y: b.y, w: b.w, h: b.h, rotation: O.getRot(o.el) + d });
        });
      });
      TR.rotShown = v;
      refreshTransform(TR.rot);
    });
    TR.rot.addEventListener("change", function () { refreshTransform(); });
    TR.corner.addEventListener("change", function () {
      var one = singleBox();
      if (!one || (one.el.tagName || "").toLowerCase() !== "rect") { refreshTransform(); return; }
      var v = Math.max(0, parseFloat(TR.corner.value) || 0);
      var b = ops().localBBox(one.el) || one.b;
      v = Math.min(v, b.w / 2, b.h / 2);
      one.el.setAttribute("rx", String(r2(v)));
      one.el.setAttribute("ry", String(r2(v)));
      ops().changed();
      refreshTransform(TR.corner);
    });
    TR.op.addEventListener("input", function () {
      var v = Math.min(100, Math.max(0, parseFloat(TR.op.value) || 0)) / 100;
      sel().forEach(function (el) { el.setAttribute("opacity", String(r2(v))); });
      ops().changed();
    });
    TR.blend.addEventListener("change", function () {
      var v = TR.blend.value;
      sel().forEach(function (el) {
        if (v === "normal") el.style.removeProperty("mix-blend-mode");
        else el.style.setProperty("mix-blend-mode", v);
      });
      ops().changed();
    });
    return p;
  }
  function refreshTransform(skip) {
    var p = PAN.transform; if (!p || !ops()) return;
    var items = curBoxes();
    var ctrls = [TR.fX, TR.fY, TR.fW, TR.fH, TR.rot, TR.corner, TR.op, TR.blend];
    if (!items.length) {
      ctrls.forEach(function (c) { if (c && c !== skip) { c.disabled = true; if ("value" in c && c.type === "number") c.value = ""; } });
      if (TR.rotVal) TR.rotVal.textContent = "";
      return;
    }
    ctrls.forEach(function (c) { if (c) c.disabled = false; });
    var O = ops();
    if (items.length === 1) {
      var b = items[0].b, rot = O.getRot(items[0].el);
      if (TR.fX !== skip) TR.fX.value = r2(b.x);
      if (TR.fY !== skip) TR.fY.value = r2(b.y);
      if (TR.fW !== skip) TR.fW.value = r2(b.w);
      if (TR.fH !== skip) TR.fH.value = r2(b.h);
      if (TR.rot !== skip) { TR.rot.value = r2(rot); TR.rotVal.textContent = r2(rot) + " deg"; }
      TR.rotShown = r2(rot);
      var isRect = (items[0].el.tagName || "").toLowerCase() === "rect";
      TR.corner.disabled = !isRect;
      if (TR.corner !== skip) TR.corner.value = isRect ? (parseFloat(items[0].el.getAttribute("rx")) || 0) : "";
      var op = parseFloat(items[0].el.getAttribute("opacity"));
      if (TR.op !== skip) TR.op.value = isNaN(op) ? 100 : Math.round(op * 100);
      if (TR.blend !== skip) TR.blend.value = items[0].el.style.getPropertyValue("mix-blend-mode") || "normal";
    } else {
      var u = O.unionBox(items.map(function (o) { return o.b; }));
      if (TR.fX !== skip) TR.fX.value = r2(u.x);
      if (TR.fY !== skip) TR.fY.value = r2(u.y);
      if (TR.fW !== skip) TR.fW.value = r2(u.w);
      if (TR.fH !== skip) TR.fH.value = r2(u.h);
      if (TR.rot !== skip) { TR.rot.value = 0; TR.rotVal.textContent = "0 deg"; }
      TR.rotShown = 0;
      TR.corner.disabled = true;
      if (TR.corner !== skip) TR.corner.value = "";
    }
  }

  /* ================= 2. Pathfinder ================= */
  function pfGlyph(kind) {
    // tiny illustrative glyphs, inline SVG (designed, no emoji)
    var s1 = '<rect x="2" y="5" width="10" height="10" rx="1"/>';
    var s2 = '<rect x="8" y="2" width="10" height="10" rx="1"/>';
    var inner = "";
    if (kind === "unite") inner = '<path d="M8 5h4v-3h6v6h-4v3h-6v-6z" fill="currentColor" stroke="none"/>' + s1 + s2;
    else if (kind === "minus") inner = '<path d="M2 5h6v6H2z" fill="currentColor" stroke="none"/>' + s1 + s2;
    else if (kind === "intersect") inner = '<rect x="8" y="5" width="4" height="10" fill="currentColor" stroke="none"/>' + s1 + s2;
    else inner = '<path d="M2 5h6v-3h10v10h-6v3H2z M8 5h4v10H8z" fill="currentColor" stroke="none"/>' + s1 + s2;
    return '<svg viewBox="0 0 20 20" class="vp-pfico" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">' + inner + "</svg>";
  }
  function buildPathfinder() {
    var p = makePanel("pathfinder", "Pathfinder"), b = p._body;
    var grid = h("div", "vp-grid2");
    [["unite", "Unite", "unite"], ["minus", "Minus Front", "minusFront"], ["intersect", "Intersect", "intersect"], ["exclude", "Exclude", "exclude"]].forEach(function (d) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "vp-pfbtn";
      btn.innerHTML = pfGlyph(d[0]) + "<span>" + T.esc(d[1]) + "</span>";
      btn.addEventListener("click", function () { var O = ops(); if (O && O[d[2]]) O[d[2]](sel()); });
      grid.appendChild(btn);
    });
    b.appendChild(grid);
    b.appendChild(h("div", "vp-hint", "Needs two or more closed shapes. Curves are flattened to polygons first, so results are polygonal approximations."));
    return p;
  }

  /* ================= 3. Align and Distribute ================= */
  function alGlyph(kind) {
    var p = "";
    if (kind === "left") p = '<line x1="4" y1="2" x2="4" y2="18"/><rect x="7" y="5" width="9" height="4"/><rect x="7" y="11" width="6" height="4"/>';
    else if (kind === "centerX") p = '<line x1="10" y1="2" x2="10" y2="18"/><rect x="5" y="5" width="10" height="4"/><rect x="7" y="11" width="6" height="4"/>';
    else if (kind === "right") p = '<line x1="16" y1="2" x2="16" y2="18"/><rect x="4" y="5" width="9" height="4"/><rect x="7" y="11" width="6" height="4"/>';
    else if (kind === "top") p = '<line x1="2" y1="4" x2="18" y2="4"/><rect x="5" y="7" width="4" height="9"/><rect x="11" y="7" width="4" height="6"/>';
    else if (kind === "centerY") p = '<line x1="2" y1="10" x2="18" y2="10"/><rect x="5" y="5" width="4" height="10"/><rect x="11" y="7" width="4" height="6"/>';
    else if (kind === "bottom") p = '<line x1="2" y1="16" x2="18" y2="16"/><rect x="5" y="4" width="4" height="9"/><rect x="11" y="7" width="4" height="6"/>';
    else if (kind === "distX") p = '<rect x="2" y="7" width="4" height="6"/><rect x="8" y="7" width="4" height="6"/><rect x="14" y="7" width="4" height="6"/>';
    else p = '<rect x="7" y="2" width="6" height="4"/><rect x="7" y="8" width="6" height="4"/><rect x="7" y="14" width="6" height="4"/>';
    return '<svg viewBox="0 0 20 20" class="vp-pfico" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">' + p + "</svg>";
  }
  function buildAlign() {
    var p = makePanel("align", "Align and Distribute"), b = p._body;
    var toArt = document.createElement("input");
    toArt.type = "checkbox"; toArt.className = "v-toggle";
    toArt.title = "Align to the active artboard instead of the selection";
    function alignRef() {
      if (toArt.checked && T.vacEngine && typeof T.vacEngine.activeArtboard === "function") {
        var ab = T.vacEngine.activeArtboard();
        if (ab) { return { x: ab.x, y: ab.y, w: ab.w, h: ab.h }; }
      }
      return null;
    }
    var r1 = h("div", "vp-arow");
    [["left", "Align left"], ["centerX", "Align center"], ["right", "Align right"], ["top", "Align top"], ["centerY", "Align middle"], ["bottom", "Align bottom"]].forEach(function (d) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "vp-abtn"; btn.title = d[1];
      btn.innerHTML = alGlyph(d[0]);
      btn.addEventListener("click", function () { ops().align(sel(), d[0], alignRef()); });
      r1.appendChild(btn);
    });
    var r2 = h("div", "vp-arow");
    [["distX", "Distribute horizontally"], ["distY", "Distribute vertically"]].forEach(function (d) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "vp-abtn wide"; btn.title = d[1];
      btn.innerHTML = alGlyph(d[0]) + "<span>" + T.esc(d[1].replace("Distribute ", "")) + "</span>";
      btn.addEventListener("click", function () { ops().distribute(sel(), d[0] === "distX" ? "x" : "y"); });
      r2.appendChild(btn);
    });
    b.appendChild(r1); b.appendChild(r2);
    var trow = h("div", "vp-row");
    var tlab = h("label", "vp-field");
    tlab.appendChild(h("span", "vp-flab", "Align to artboard"));
    tlab.appendChild(toArt);
    trow.appendChild(tlab);
    b.appendChild(trow);
    [["x", "Gap X (px)"], ["y", "Gap Y (px)"]].forEach(function (d) {
      var row = h("div", "vp-row");
      var inp = numInput(0, 2000, 1, 20);
      row.appendChild(fieldRow(d[1], inp));
      var go = document.createElement("button");
      go.type = "button"; go.className = "vp-btn";
      go.innerHTML = "<span>Distribute</span>";
      go.title = "Distribute with an exact gap between edges";
      go.addEventListener("click", function () {
        if (ops()) { ops().distributeSpacing(sel(), d[0], parseFloat(inp.value) || 0); }
      });
      row.appendChild(go);
      b.appendChild(row);
    });
    return p;
  }

  /* ================= 4. Stroke ================= */
  var ST = { w: null, wVal: null, cap: null, join: null, dash: null, arrows: null };
  function ensureArrowMarker() {
    var s = svg(); if (!s) return null;
    var defs = s.querySelector("defs");
    if (!defs) { defs = document.createElementNS(SVGNS, "defs"); s.insertBefore(defs, s.firstChild); }
    var m = defs.querySelector("#vArrow");
    if (!m) {
      m = document.createElementNS(SVGNS, "marker");
      m.setAttribute("id", "vArrow");
      m.setAttribute("viewBox", "0 0 10 10");
      m.setAttribute("refX", "8"); m.setAttribute("refY", "5");
      m.setAttribute("markerWidth", "7"); m.setAttribute("markerHeight", "7");
      m.setAttribute("orient", "auto-start-reverse");
      var path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", "M0 0L10 5L0 10z");
      path.setAttribute("fill", "context-stroke");
      m.appendChild(path);
      defs.appendChild(m);
    }
    return "url(#vArrow)";
  }
  function buildStroke() {
    var p = makePanel("stroke", "Stroke"), b = p._body;
    var wrow = h("div", "vp-row");
    ST.w = rangeInput(0.25, 24, 0.25, 2); ST.wVal = h("span", "vp-val", "2");
    wrow.appendChild(fieldRow("Weight", ST.w)); wrow.appendChild(ST.wVal);
    b.appendChild(wrow);
    b.appendChild(h("div", "vp-glab", "Cap"));
    ST.cap = seg([{ v: "butt", t: "Butt" }, { v: "round", t: "Round" }, { v: "square", t: "Square" }], "butt", function (v) {
      sel().forEach(function (el) { el.setAttribute("stroke-linecap", v); });
      ops().changed();
    });
    b.appendChild(ST.cap);
    b.appendChild(h("div", "vp-glab", "Join"));
    ST.join = seg([{ v: "miter", t: "Miter" }, { v: "round", t: "Round" }, { v: "bevel", t: "Bevel" }], "miter", function (v) {
      sel().forEach(function (el) { el.setAttribute("stroke-linejoin", v); });
      ops().changed();
    });
    b.appendChild(ST.join);
    var drow = h("div", "vp-row");
    ST.dash = document.createElement("input");
    ST.dash.type = "text"; ST.dash.className = "vp-text"; ST.dash.placeholder = "e.g. 6 3";
    drow.appendChild(fieldRow("Dash pattern", ST.dash));
    b.appendChild(drow);
    b.appendChild(h("div", "vp-glab", "Arrowheads"));
    ST.arrows = seg([{ v: "none", t: "None" }, { v: "start", t: "Start" }, { v: "end", t: "End" }, { v: "both", t: "Both" }], "none", function (v) {
      var url = v === "none" ? null : ensureArrowMarker();
      sel().forEach(function (el) {
        if (url) {
          if (v === "start" || v === "both") el.setAttribute("marker-start", url); else el.removeAttribute("marker-start");
          if (v === "end" || v === "both") el.setAttribute("marker-end", url); else el.removeAttribute("marker-end");
        } else { el.removeAttribute("marker-start"); el.removeAttribute("marker-end"); }
      });
      ops().changed();
    });
    b.appendChild(ST.arrows);

    ST.w.addEventListener("input", function () {
      var v = parseFloat(ST.w.value) || 0.25;
      ST.wVal.textContent = String(v);
      sel().forEach(function (el) { el.setAttribute("stroke-width", String(v)); });
      ops().changed();
    });
    ST.dash.addEventListener("change", function () {
      var raw = ST.dash.value.trim();
      if (!raw) { sel().forEach(function (el) { el.removeAttribute("stroke-dasharray"); }); ops().changed(); return; }
      var parts = raw.split(/[\s,]+/).map(parseFloat).filter(function (n) { return !isNaN(n) && n >= 0; });
      if (!parts.length) { T.toast("Dash pattern needs numbers like 6 3.", "error"); ST.dash.value = ""; return; }
      var val = parts.join(" ");
      sel().forEach(function (el) { el.setAttribute("stroke-dasharray", val); });
      ops().changed();
    });
    return p;
  }
  function refreshStroke() {
    var p = PAN.stroke; if (!p) return;
    var els = sel();
    var dis = !els.length;
    [ST.w, ST.dash].forEach(function (c) { if (c) c.disabled = dis; });
    [ST.cap, ST.join, ST.arrows].forEach(function (sg) {
      if (sg) Array.prototype.forEach.call(sg.querySelectorAll("button"), function (b) { b.disabled = dis; });
    });
    if (dis) return;
    var el = els[0];
    var w = parseFloat(el.getAttribute("stroke-width"));
    if (!isNaN(w)) { ST.w.value = w; ST.wVal.textContent = String(w); }
    ST.cap.set(el.getAttribute("stroke-linecap") || "butt");
    ST.join.set(el.getAttribute("stroke-linejoin") || "miter");
    ST.dash.value = el.getAttribute("stroke-dasharray") || "";
    var ms = el.getAttribute("marker-start"), me = el.getAttribute("marker-end");
    ST.arrows.set(ms && me ? "both" : (ms ? "start" : (me ? "end" : "none")));
  }

  /* ================= 5. Gradient ================= */
  var G = { type: "linear", angle: 0, stops: [{ o: 0, c: "#31A8FF" }, { o: 100, c: "#FF9A00" }] };
  var GR = { typeSeg: null, angle: null, angleVal: null, stopsBox: null, angleRow: null };
  function applyGradient() {
    var s = svg(); if (!s || !ops()) return;
    var els = sel();
    if (!els.length) return;
    var defs = s.querySelector("defs");
    if (!defs) { defs = document.createElementNS(SVGNS, "defs"); s.insertBefore(defs, s.firstChild); }
    var old = defs.querySelector("#vGrad"); if (old) old.remove();
    var g = document.createElementNS(SVGNS, G.type === "linear" ? "linearGradient" : "radialGradient");
    g.setAttribute("id", "vGrad");
    if (G.type === "linear") {
      var a = G.angle * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
      g.setAttribute("x1", r2(0.5 - 0.5 * c)); g.setAttribute("y1", r2(0.5 - 0.5 * si));
      g.setAttribute("x2", r2(0.5 + 0.5 * c)); g.setAttribute("y2", r2(0.5 + 0.5 * si));
    }
    G.stops.forEach(function (st) {
      var so = document.createElementNS(SVGNS, "stop");
      so.setAttribute("offset", Math.min(100, Math.max(0, st.o)) + "%");
      so.setAttribute("stop-color", st.c);
      g.appendChild(so);
    });
    defs.appendChild(g);
    els.forEach(function (el) {
      if (el._vPrevFill === undefined) el._vPrevFill = el.getAttribute("fill");
      el.setAttribute("fill", "url(#vGrad)");
    });
    ops().changed();
  }
  function clearGradient() {
    var s = svg();
    sel().forEach(function (el) {
      if (el._vPrevFill === undefined) return;
      if (el._vPrevFill === null) el.removeAttribute("fill"); else el.setAttribute("fill", el._vPrevFill);
      delete el._vPrevFill;
    });
    var old = s && s.querySelector("#vGrad"); if (old) old.remove();
    if (ops()) ops().changed();
  }
  function renderStops() {
    var box = GR.stopsBox; if (!box) return;
    box.innerHTML = "";
    G.stops.forEach(function (st, i) {
      var row = h("div", "vp-stop");
      var col = document.createElement("input");
      col.type = "color"; col.className = "vp-color"; col.value = st.c;
      col.addEventListener("input", function () { st.c = col.value; applyGradient(); });
      var off = rangeInput(0, 100, 1, st.o);
      off.addEventListener("input", function () { st.o = parseFloat(off.value) || 0; offVal.textContent = off.value + "%"; applyGradient(); });
      var offVal = h("span", "vp-val", st.o + "%");
      row.appendChild(col); row.appendChild(off); row.appendChild(offVal);
      if (G.stops.length > 2) {
        var del = document.createElement("button");
        del.type = "button"; del.className = "vp-icobtn"; del.title = "Remove stop";
        del.innerHTML = T.icon("i-x");
        del.addEventListener("click", function () { G.stops.splice(i, 1); renderStops(); applyGradient(); });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }
  function buildGradient() {
    var p = makePanel("gradient", "Gradient"), b = p._body;
    GR.typeSeg = seg([{ v: "linear", t: "Linear" }, { v: "radial", t: "Radial" }], "linear", function (v) {
      G.type = v;
      GR.angleRow.style.display = v === "linear" ? "" : "none";
      applyGradient();
    });
    b.appendChild(GR.typeSeg);
    GR.angleRow = h("div", "vp-row");
    GR.angle = rangeInput(0, 360, 1, 0); GR.angleVal = h("span", "vp-val", "0 deg");
    GR.angleRow.appendChild(fieldRow("Angle", GR.angle)); GR.angleRow.appendChild(GR.angleVal);
    b.appendChild(GR.angleRow);
    GR.stopsBox = h("div", "vp-stops");
    b.appendChild(GR.stopsBox);
    var addRow = h("div", "vp-row");
    var add = document.createElement("button");
    add.type = "button"; add.className = "vp-btn";
    add.innerHTML = T.icon("i-plus") + "<span>Add stop</span>";
    add.addEventListener("click", function () {
      if (G.stops.length >= 6) { T.toast("Six stops is the most for now.", "error"); return; }
      G.stops.push({ o: 100, c: "#ffffff" });
      renderStops(); applyGradient();
    });
    var clear = document.createElement("button");
    clear.type = "button"; clear.className = "vp-btn ghost";
    clear.innerHTML = "<span>Remove gradient</span>";
    clear.addEventListener("click", clearGradient);
    addRow.appendChild(add); addRow.appendChild(clear);
    b.appendChild(addRow);
    GR.angle.addEventListener("input", function () {
      G.angle = parseFloat(GR.angle.value) || 0;
      GR.angleVal.textContent = G.angle + " deg";
      applyGradient();
    });
    renderStops();
    return p;
  }

  /* ================= 6. Layers ================= */
  /* Layer groups live inside the viewport <g> (see core.js makeLayer), so
     resolve them through the T.vac contract instead of scanning the
     svg root (which previously found nothing and created stray layers). */
  function layerGroups() {
    try {
      return (T.vac && typeof T.vac.layers === "function") ? (T.vac.layers() || []) : [];
    } catch (e) { return []; }
  }
  function ensureLayer() {
    var groups = layerGroups();
    if (groups.length) return groups[groups.length - 1];
    try {
      if (T.vac && typeof T.vac.makeLayer === "function") return T.vac.makeLayer("Layer 1");
    } catch (e) { /* ignore */ }
    return null;
  }
  var dragShapeEl = null;
  function shapeLabel(el, idx) {
    var tag = (el.tagName || "").toLowerCase();
    var id = el.getAttribute("id");
    if (id) return id;
    if (tag === "g") return "Group " + (idx + 1);
    return tag.charAt(0).toUpperCase() + tag.slice(1) + " " + (idx + 1);
  }
  function refreshLayers() {
    var p = PAN.layers; if (!p) return;
    var body = p._body;
    body.innerHTML = "";
    var VE = T.vacEngine || null;
    var selection = sel();
    // isolation breadcrumb
    var iso = (VE && typeof VE.isolated === "function") ? VE.isolated() : null;
    if (iso) {
      var crumb = h("div", "ve-crumb");
      crumb.appendChild(h("span", "", "Isolating: "));
      var strong = document.createElement("strong");
      strong.textContent = shapeLabel(iso, 0);
      crumb.appendChild(strong);
      var exit = document.createElement("button");
      exit.type = "button"; exit.className = "vp-btn ghost";
      exit.innerHTML = "<span>Exit isolation</span>";
      exit.addEventListener("click", function () { VE.exitIsolation(); refreshLayers(); });
      crumb.appendChild(exit);
      body.appendChild(crumb);
    }
    var tree = h("div", "ve-ltree");
    var groups = layerGroups();
    if (!groups.length) { tree.appendChild(h("div", "vp-lempty", "No layers yet.")); }
    groups.forEach(function (g, gi) {
      tree.appendChild(layerHeadRow(g, gi));
      var kids = Array.prototype.filter.call(g.childNodes, function (n) { return n.nodeType === 1; });
      kids.forEach(function (n, ki) { tree.appendChild(shapeRow(n, g, gi, ki, selection, VE)); });
    });
    body.appendChild(tree);
    var addRow = h("div", "vp-row");
    var add = document.createElement("button");
    add.type = "button"; add.className = "vp-btn";
    add.innerHTML = T.icon("i-plus") + "<span>New layer</span>";
    add.addEventListener("click", function () {
      if (!T.vac || typeof T.vac.makeLayer !== "function") return;
      var names = layerGroups().map(function (x) { return x.getAttribute("data-name"); });
      var n = 1;
      while (names.indexOf("Layer " + n) >= 0) n++;
      T.vac.makeLayer("Layer " + n);
      if (ops()) ops().changed(); else refreshLayers();
    });
    addRow.appendChild(add);
    body.appendChild(addRow);
  }
  function eyeBtn(el, isLayer) {
    var eye = document.createElement("button");
    eye.type = "button"; eye.className = "vp-icobtn"; eye.title = "Toggle visibility";
    eye.setAttribute("aria-label", "Toggle visibility");
    eye.innerHTML = T.icon("i-eye");
    function sync() { eye.classList.toggle("off", el.style.display === "none"); }
    sync();
    eye.addEventListener("click", function (e) {
      e.stopPropagation();
      var hidden = el.style.display === "none";
      el.style.display = hidden ? "" : "none";
      sync();
      if (ops()) ops().changed();
    });
    return eye;
  }
  function lockBtn(el) {
    var lock = document.createElement("button");
    lock.type = "button"; lock.className = "vp-icobtn"; lock.title = "Lock (blocks selection and edits)";
    lock.setAttribute("aria-label", "Lock");
    lock.innerHTML = '<svg viewBox="0 0 16 16" class="vp-lock" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>';
    function sync() { lock.classList.toggle("off", el.getAttribute("data-locked") !== "1"); }
    sync();
    lock.addEventListener("click", function (e) {
      e.stopPropagation();
      var now = el.getAttribute("data-locked") !== "1";
      if (now) { el.setAttribute("data-locked", "1"); el.style.pointerEvents = "none"; }
      else { el.removeAttribute("data-locked"); el.style.removeProperty("pointer-events"); }
      sync();
      if (ops()) ops().changed(); else refreshLayers();
    });
    return lock;
  }
  function layerHeadRow(g, gi) {
    var row = h("div", "ve-lhead");
    row.appendChild(eyeBtn(g, true));
    row.appendChild(lockBtn(g));
    var nm = h("span", "ve-lname", T.esc(g.getAttribute("data-name") || "Layer"));
    nm.title = "Double-click to rename";
    nm.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      var inp = document.createElement("input");
      inp.type = "text"; inp.className = "vp-text"; inp.value = g.getAttribute("data-name") || "";
      nm.replaceWith(inp);
      inp.focus(); inp.select();
      var done = false;
      function commit(ok) {
        if (done) return; done = true;
        if (ok && inp.value.trim()) g.setAttribute("data-name", inp.value.trim());
        if (ops()) ops().changed(); else refreshLayers();
      }
      inp.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
        if (ev.key === "Enter") commit(true);
        else if (ev.key === "Escape") commit(false);
      });
      inp.addEventListener("blur", function () { commit(true); });
    });
    var count = h("span", "vp-lcount", String(Array.prototype.filter.call(g.childNodes, function (n) { return n.nodeType === 1; }).length));
    function mvBtn(icon, title, dir) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "vp-icobtn"; b.title = title;
      b.setAttribute("aria-label", title);
      b.innerHTML = T.icon(icon);
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var sib = dir < 0 ? g.previousElementSibling : g.nextElementSibling;
        if (sib && sib.tagName && sib.tagName.toLowerCase() === "g" && sib.hasAttribute("data-name")) {
          if (dir < 0) g.parentNode.insertBefore(g, sib);
          else g.parentNode.insertBefore(sib, g);
          if (ops()) ops().changed(); else refreshLayers();
        }
      });
      return b;
    }
    var del = document.createElement("button");
    del.type = "button"; del.className = "vp-icobtn danger"; del.title = "Delete layer";
    del.setAttribute("aria-label", "Delete layer");
    del.innerHTML = T.icon("i-trash");
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof T.modal !== "function") return;
      T.modal({
        title: "Delete layer",
        sub: "Delete \"" + (g.getAttribute("data-name") || "Layer") + "\" and its contents?",
        okText: "Delete", danger: true
      }).then(function (res) {
        if (!res) return;
        if (g.parentNode) g.parentNode.removeChild(g);
        if (ops()) ops().changed(); else refreshLayers();
        T.toast("Layer deleted.");
      });
    });
    // drop target: dropping a shape here moves it into this layer
    row.addEventListener("dragover", function (e) {
      if (!dragShapeEl) return;
      e.preventDefault();
      row.classList.add("ve-drop-target");
    });
    row.addEventListener("dragleave", function () { row.classList.remove("ve-drop-target"); });
    row.addEventListener("drop", function (e) {
      e.preventDefault();
      row.classList.remove("ve-drop-target");
      if (!dragShapeEl || dragShapeEl.parentNode === g) { dragShapeEl = null; return; }
      if (T.vac && T.vac.checkpoint) T.vac.checkpoint();
      g.appendChild(dragShapeEl);
      dragShapeEl = null;
      if (ops()) ops().changed(); else refreshLayers();
    });
    row.appendChild(nm); row.appendChild(count);
    row.appendChild(mvBtn("i-chev-u", "Move layer up", -1));
    row.appendChild(mvBtn("i-chev-d", "Move layer down", 1));
    row.appendChild(del);
    return row;
  }
  function shapeRow(el, layer, gi, ki, selection, VE) {
    var tag = (el.tagName || "").toLowerCase();
    var isGroup = tag === "g";
    var row = h("div", "ve-lrow");
    row.setAttribute("draggable", "true");
    if (selection.indexOf(el) >= 0) row.classList.add("sel");
    if (VE && VE.isolated && VE.isolated() === el) row.classList.add("isolated");
    row.appendChild(eyeBtn(el, false));
    row.appendChild(lockBtn(el));
    row.appendChild(h("span", "ve-ltag", T.esc(tag === "g" ? "grp" : tag)));
    var nm = h("span", "ve-lname", T.esc(shapeLabel(el, ki)));
    if (isGroup) nm.title = "Double-click to enter isolation mode";
    row.appendChild(nm);
    row.addEventListener("click", function () {
      if (T.vac && typeof T.vac.select === "function") T.vac.select([el]);
    });
    if (isGroup && VE) {
      row.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        VE.isolate(el);
        refreshLayers();
      });
    }
    // drag to reorder: real z-order change in the SVG DOM
    row.addEventListener("dragstart", function (e) {
      dragShapeEl = el;
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "vac-shape"); } catch (err) {}
    });
    row.addEventListener("dragend", function () {
      dragShapeEl = null;
      Array.prototype.forEach.call(document.querySelectorAll(".ve-drop-target"), function (n) { n.classList.remove("ve-drop-target"); });
    });
    row.addEventListener("dragover", function (e) {
      if (!dragShapeEl || dragShapeEl === el) return;
      e.preventDefault();
      row.classList.add("ve-drop-target");
    });
    row.addEventListener("dragleave", function () { row.classList.remove("ve-drop-target"); });
    row.addEventListener("drop", function (e) {
      e.preventDefault(); e.stopPropagation();
      row.classList.remove("ve-drop-target");
      var src = dragShapeEl;
      dragShapeEl = null;
      if (!src || src === el || src.parentNode !== el.parentNode) return;
      if (T.vac && T.vac.checkpoint) T.vac.checkpoint();
      var r = row.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      el.parentNode.insertBefore(src, after ? el.nextSibling : el);
      if (ops()) ops().changed(); else refreshLayers();
    });
    return row;
  }
  function buildLayers() {
    var p = makePanel("layers", "Layers");
    return p;
  }

  /* ================= assembly ================= */
  var PAN = {};
  var busBound = false;
  function refresh() {
    if (!T.vac || !T.vacOps) return;
    refreshTransform();
    refreshStroke();
    refreshLayers();
  }
  /* Mobile sheet chrome: drag handle + Properties title + 44px close button.
     Hidden on desktop via CSS (.v-sheet-chrome). */
  function buildSheetChrome() {
    function closeSheet() {
      var p = document.getElementById("vPanels");
      if (p) { p.classList.remove("open"); }
      var b = document.getElementById("vPropsBtn");
      if (b) { b.setAttribute("aria-expanded", "false"); }
    }
    var c = h("div", "v-sheet-chrome");
    var handle = h("div", "nxt-sheet-handle");
    handle.title = "Close properties";
    handle.setAttribute("role", "button");
    handle.setAttribute("tabindex", "0");
    handle.setAttribute("aria-label", "Close properties panel");
    handle.addEventListener("click", closeSheet);
    handle.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeSheet(); }
    });
    var head = h("div", "v-sheet-head");
    head.appendChild(h("span", "v-sheet-title", "Properties"));
    var x = document.createElement("button");
    x.type = "button";
    x.id = "vSheetClose";
    x.className = "vbtn v-sheet-close";
    x.title = "Close properties";
    x.setAttribute("aria-label", "Close properties");
    x.innerHTML = T.icon("i-x");
    x.addEventListener("click", closeSheet);
    head.appendChild(x);
    c.appendChild(handle);
    c.appendChild(head);
    return c;
  }
  function init() {
    if (!T.vac || !T.vacOps) return false;
    var host = document.getElementById("vPanels");    if (!host) {
      var vv = document.getElementById("view-vac");
      if (!vv) return false;
      host = document.createElement("aside");
      host.id = "vPanels";
      vv.appendChild(host);
    }
    host.classList.add("nxt-sheet"); /* mobile: fixed bottom sheet (see vac-panels.css) */
    if (host.getAttribute("data-vp") === "1") return true;
    host.setAttribute("data-vp", "1");
    host.appendChild(buildSheetChrome());
    host.appendChild(buildCTA());
    PAN.transform = buildTransform(); host.appendChild(PAN.transform);
    PAN.pathfinder = buildPathfinder(); host.appendChild(PAN.pathfinder);
    PAN.align = buildAlign(); host.appendChild(PAN.align);
    PAN.stroke = buildStroke(); host.appendChild(PAN.stroke);
    PAN.gradient = buildGradient(); host.appendChild(PAN.gradient);
    PAN.layers = buildLayers(); host.appendChild(PAN.layers);
    ensureLayer();
    if (!busBound) {
      busBound = true;
      T.bus.on("vac:selection", refresh);
      T.bus.on("vac:change", refresh);
    }
    refresh();
    return true;
  }

  function registerCommands() {
    if (typeof T.register !== "function") return;
    T.register("vac.pathfinder.unite", function () { if (ops()) ops().unite(sel()); }, { title: "Pathfinder: Unite", cat: "VAC", icon: "i-shapes" });
    T.register("vac.pathfinder.minusFront", function () { if (ops()) ops().minusFront(sel()); }, { title: "Pathfinder: Minus Front", cat: "VAC", icon: "i-shapes" });
    T.register("vac.pathfinder.intersect", function () { if (ops()) ops().intersect(sel()); }, { title: "Pathfinder: Intersect", cat: "VAC", icon: "i-shapes" });
    T.register("vac.pathfinder.exclude", function () { if (ops()) ops().exclude(sel()); }, { title: "Pathfinder: Exclude", cat: "VAC", icon: "i-shapes" });
    [["left", "Align left"], ["centerX", "Align center"], ["right", "Align right"], ["top", "Align top"], ["centerY", "Align middle"], ["bottom", "Align bottom"]].forEach(function (d) {
      T.register("vac.align." + d[0], (function (mode) {
        return function () { if (ops()) ops().align(sel(), mode); };
      })(d[0]), { title: "VAC: " + d[1], cat: "VAC", icon: "i-align-l" });
    });
    T.register("vac.distribute.x", function () { if (ops()) ops().distribute(sel(), "x"); }, { title: "VAC: Distribute horizontally", cat: "VAC", icon: "i-align-c" });
    T.register("vac.distribute.y", function () { if (ops()) ops().distribute(sel(), "y"); }, { title: "VAC: Distribute vertically", cat: "VAC", icon: "i-align-c" });
    T.register("vac.sendToWord", function () { sendToWord(); }, { title: "VAC: Send to TXT document", cat: "VAC", icon: "i-export" });
  }

  T.vacPanels = { init: init, refresh: refresh, sendToWord: sendToWord };

  if (!init()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (init() || tries > 40) clearInterval(timer);
    }, 250);
  }
  registerCommands();
})();
