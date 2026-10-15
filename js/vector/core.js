/* TXT Vector Studio CORE (Illustrator persona, v5).
   Owns the #view-vector skeleton, SVG canvas, layers, selection, pan/zoom,
   undo, tool registry, and the T.vector contract used by panels/ops workers.
   Conventions: IIFE, var T = window.TXT, T.bus, T.register, no emojis, no CSS zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) { return; }
  var SVGNS = "http://www.w3.org/2000/svg";

  /* ================= designed icon set (inline SVG, 24 grid) ================= */
  var VICONS = {
    select: '<path d="M6 3l13 9.5-7.5 1L8 21z"/>',
    node: '<path d="M12 3l9 9-9 9-9-9z"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    pen: '<path d="M4 20l1.2-4.2L16.5 4.5l3 3L8.2 18.8z"/><path d="M14.5 6.5l3 3"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    polygon: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>',
    brush: '<path d="M20 4c-6 0-12 6-14 12l-2 4 4-2c6-2 12-8 12-14z"/><path d="M6 18l3.5-3.5"/>',
    type: '<path d="M5 5h14M12 5v14M9 19h6"/>',
    eyedropper: '<path d="M14.5 3.5l6 6-2 2-6-6z"/><path d="M12.5 7.5L4 16l-1.5 5L8 19.5z"/><path d="M5 15l3 3"/>',
    hand: '<path d="M8 12.5V6a1.5 1.5 0 013 0v5.5V4.5a1.5 1.5 0 013 0V11v-4.5a1.5 1.5 0 013 0V14c0 4-2.8 7-6.8 7-2.8 0-4.9-1.2-6.6-3.8l-2-3.1c-.6-1 0-2 1-2.4.7-.3 1.6 0 2.4.8z"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M8.5 11h5M11 8.5v5"/>',
    undo: '<path d="M8 5L3 10l5 5M3 10h11a7 7 0 017 7v1"/>',
    redo: '<path d="M16 5l5 5-5 5M21 10H10a7 7 0 00-7 7v1"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'
  };
  function vIcon(name, cls) {
    return '<svg class="vico ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (VICONS[name] || VICONS.select) + "</svg>";
  }

  /* ================= state ================= */
  var built = false;
  var view, vCanvas, vViewport, vOverlay, vArtboard, vPasteboard, vWrap, vTextEdit;
  var vTopbar, vToolOptions, vCoords, vZoomPct, vDocName, vArtW, vArtH;
  var vTools;
  var artW = 800, artH = 600;
  var pan = { x: 40, y: 40 }, zm = 1;
  var sel = [];
  var layerSeq = 0;
  var activeLayerName = null;
  var undoStack = [], redoStack = [];
  var curToolId = null;
  var tools = {}, toolOrder = [];
  var cur = { fill: "#ffffff", stroke: "#1a1a1a", strokeWidth: 2, opacity: 1, activePaint: "fill" };
  var docSeq = 0;

  /* ================= view skeleton ================= */
  function buildView() {
    if (built) { return; }
    var holder = document.getElementById("views");
    view = document.getElementById("view-vector");
    if (!view) {
      view = document.createElement("section");
      view.id = "view-vector";
      view.className = "view hidden";
      if (holder) { holder.appendChild(view); } else { document.body.appendChild(view); }
    }
    view.innerHTML =
      '<div id="vTopbar">' +
        '<div class="vt-left">' +
          '<input id="vDocName" class="v-docname" value="Untitled-1" spellcheck="false" title="Document name">' +
          '<label class="v-dims" title="Artboard width">W <input id="vArtW" type="number" min="1" max="5000" value="800"></label>' +
          '<label class="v-dims" title="Artboard height">H <input id="vArtH" type="number" min="1" max="5000" value="600"></label>' +
          '<span class="v-sep"></span>' +
          '<button type="button" id="vUndo" class="vbtn" title="Undo (Ctrl+Z)">' + vIcon("undo") + "</button>" +
          '<button type="button" id="vRedo" class="vbtn" title="Redo (Ctrl+Shift+Z)">' + vIcon("redo") + "</button>" +
        "</div>" +
        '<div id="vToolOptions" class="vt-center"></div>' +
        '<div class="vt-right">' +
          '<span id="vCoords" class="v-status" title="Cursor position">X: 0, Y: 0</span>' +
          '<span class="v-sep"></span>' +
          '<button type="button" id="vZoomOut" class="vbtn" title="Zoom out">' + vIcon("minus") + "</button>" +
          '<span id="vZoomPct" class="v-status" title="Zoom level">100%</span>' +
          '<button type="button" id="vZoomIn" class="vbtn" title="Zoom in">' + vIcon("plus") + "</button>" +
          '<button type="button" id="vZoomFit" class="vbtn" title="Fit artboard">' + vIcon("fit") + "</button>" +
        "</div>" +
      "</div>" +
      '<div id="vMain">' +
        '<div id="vTools" role="toolbar" aria-label="Vector tools"></div>' +
        '<div id="vCanvasWrap"><input id="vTextEdit" class="hidden" spellcheck="false" autocomplete="off"></div>' +
        '<div id="vPanels"></div>' +
      "</div>";

    vTopbar = view.querySelector("#vTopbar");
    vToolOptions = view.querySelector("#vToolOptions");
    vCoords = view.querySelector("#vCoords");
    vZoomPct = view.querySelector("#vZoomPct");
    vDocName = view.querySelector("#vDocName");
    vArtW = view.querySelector("#vArtW");
    vArtH = view.querySelector("#vArtH");
    vTools = view.querySelector("#vTools");
    vWrap = view.querySelector("#vCanvasWrap");
    vTextEdit = view.querySelector("#vTextEdit");

    var NS = SVGNS;
    vCanvas = document.createElementNS(NS, "svg");
    vCanvas.id = "vCanvas";
    vCanvas.setAttribute("xmlns", NS);
    var defs = document.createElementNS(NS, "defs");
    defs.innerHTML =
      '<pattern id="vChecker" width="18" height="18" patternUnits="userSpaceOnUse">' +
        '<rect width="18" height="18" fill="#262626"/>' +
        '<rect width="9" height="9" fill="#2e2e2e"/>' +
        '<rect x="9" y="9" width="9" height="9" fill="#2e2e2e"/>' +
      "</pattern>" +
      '<filter id="vArtShadow" x="-20%" y="-20%" width="140%" height="140%">' +
        '<feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#000000" flood-opacity="0.45"/>' +
      "</filter>";
    vViewport = document.createElementNS(NS, "g");
    vViewport.id = "vViewport";
    vPasteboard = document.createElementNS(NS, "rect");
    vPasteboard.id = "vPasteboard";
    vPasteboard.setAttribute("x", "-6000"); vPasteboard.setAttribute("y", "-6000");
    vPasteboard.setAttribute("width", "12000"); vPasteboard.setAttribute("height", "12000");
    vPasteboard.setAttribute("fill", "url(#vChecker)");
    vArtboard = document.createElementNS(NS, "rect");
    vArtboard.id = "vArtboard";
    vArtboard.setAttribute("x", "0"); vArtboard.setAttribute("y", "0");
    vArtboard.setAttribute("width", String(artW)); vArtboard.setAttribute("height", String(artH));
    vArtboard.setAttribute("fill", "#ffffff");
    vArtboard.setAttribute("filter", "url(#vArtShadow)");
    vOverlay = document.createElementNS(NS, "g");
    vOverlay.id = "vOverlay";
    vOverlay.setAttribute("pointer-events", "none");
    vViewport.appendChild(vPasteboard);
    vViewport.appendChild(vArtboard);
    vViewport.appendChild(vOverlay);
    vCanvas.appendChild(defs);
    vCanvas.appendChild(vViewport);
    vWrap.insertBefore(vCanvas, vTextEdit);

    wireChrome();
    applyView();
    built = true;
  }

  /* ================= chrome wiring ================= */
  function wireChrome() {
    view.querySelector("#vUndo").addEventListener("click", function () { undo(); });
    view.querySelector("#vRedo").addEventListener("click", function () { redo(); });
    view.querySelector("#vZoomIn").addEventListener("click", function () { zoomStep(1.25); });
    view.querySelector("#vZoomOut").addEventListener("click", function () { zoomStep(1 / 1.25); });
    view.querySelector("#vZoomFit").addEventListener("click", function () { zoomFit(); });
    function artResize() {
      var w = T.clamp(parseInt(vArtW.value, 10) || artW, 1, 5000);
      var h = T.clamp(parseInt(vArtH.value, 10) || artH, 1, 5000);
      setArtboard(w, h);
    }
    vArtW.addEventListener("change", artResize);
    vArtH.addEventListener("change", artResize);

    vCanvas.addEventListener("pointerdown", onDown);
    vCanvas.addEventListener("dblclick", onDbl);
    vCanvas.addEventListener("mousemove", onHover);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    vCanvas.addEventListener("wheel", onWheel, { passive: false });
    vCanvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("keydown", onKey, true);
  }

  /* ================= pan / zoom ================= */
  function applyView() {
    if (!vViewport) { return; }
    vViewport.setAttribute("transform", "translate(" + pan.x + " " + pan.y + ") scale(" + zm + ")");
    if (vZoomPct) { vZoomPct.textContent = Math.round(zm * 100) + "%"; }
  }
  function zoomAt(cx, cy, factor) {
    var before = toLocal({ clientX: cx, clientY: cy });
    zm = T.clamp(zm * factor, 0.1, 8);
    var rect = vCanvas.getBoundingClientRect();
    var sx = cx - rect.left, sy = cy - rect.top;
    pan.x = sx - before.x * zm;
    pan.y = sy - before.y * zm;
    applyView();
  }
  function zoomStep(f) {
    var r = vCanvas.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }
  function zoomFit() {
    if (!vWrap) { return; }
    var r = vWrap.getBoundingClientRect();
    if (r.width < 10) { return; }
    zm = T.clamp(Math.min((r.width - 120) / artW, (r.height - 120) / artH), 0.1, 8);
    pan.x = (r.width - artW * zm) / 2;
    pan.y = (r.height - artH * zm) / 2;
    applyView();
  }
  function toLocal(e) {
    var pt = vCanvas.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    var m = vViewport.getScreenCTM();
    if (!m) { return { x: 0, y: 0 }; }
    var p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function onWheel(e) {
    e.preventDefault();
    var r = vCanvas.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    } else if (e.shiftKey) {
      pan.x -= e.deltaY; applyView();
    } else {
      pan.y -= e.deltaY; applyView();
    }
  }

  /* ================= layers ================= */
  function layerGroups() {
    var out = [], kids = vViewport.childNodes, i, n;
    for (i = 0; i < kids.length; i++) {
      n = kids[i];
      if (n.nodeType === 1 && n.tagName === "g" && n !== vOverlay && n.hasAttribute("data-name")) { out.push(n); }
    }
    return out;
  }
  function makeLayer(name) {
    layerSeq += 1;
    var g = document.createElementNS(SVGNS, "g");
    g.setAttribute("data-name", name || ("Layer " + layerSeq));
    vViewport.insertBefore(g, vOverlay);
    activeLayerName = g.getAttribute("data-name");
    return g;
  }
  function activeLayer() {
    var ls = layerGroups(), i;
    for (i = 0; i < ls.length; i++) {
      if (ls[i].getAttribute("data-name") === activeLayerName) { return ls[i]; }
    }
    if (!ls.length) { return makeLayer(); }
    activeLayerName = ls[ls.length - 1].getAttribute("data-name");
    return ls[ls.length - 1];
  }
  function setActiveLayer(name) {
    activeLayerName = name;
    T.bus.emit("vector:layers");
  }

  /* ================= selection ================= */
  function isArtwork(el) {
    return el && el.nodeType === 1 && vCanvas.contains(el) &&
      el !== vCanvas && el !== vViewport && el !== vOverlay && el !== vArtboard &&
      el !== vPasteboard && !vOverlay.contains(el);
  }
  function selection() { return sel.slice(); }
  function select(els) {
    var out = [];
    (els || []).forEach(function (el) {
      if (isArtwork(el) && out.indexOf(el) < 0) { out.push(el); }
    });
    sel = out;
    renderOverlay();
    T.bus.emit("vector:selection", { els: sel.slice() });
  }
  function clearSel() { select([]); }

  /* viewport-space bbox of one element (respects its transform chain) */
  function relMatrix(el) {
    var m = el.getCTM(), vm = vViewport.getCTM();
    if (!m || !vm) { return new DOMMatrix(); }
    return vm.inverse().multiply(m);
  }
  function xformBox(el) {
    var b;
    try { b = el.getBBox(); } catch (e) { return null; }
    var m = relMatrix(el);
    var pts = [
      { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
      { x: b.x, y: b.y + b.height }, { x: b.x + b.width, y: b.y + b.height }
    ].map(function (p) {
      var q = new DOMPoint(p.x, p.y).matrixTransform(m);
      return { x: q.x, y: q.y };
    });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    return {
      x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
      w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
      h: Math.max.apply(null, ys) - Math.min.apply(null, ys)
    };
  }
  function unionBox(els) {
    var u = null;
    els.forEach(function (el) {
      var b = xformBox(el);
      if (!b) { return; }
      if (!u) { u = { x: b.x, y: b.y, w: b.w, h: b.h }; }
      else {
        var x2 = Math.max(u.x + u.w, b.x + b.w), y2 = Math.max(u.y + u.h, b.y + b.h);
        u.x = Math.min(u.x, b.x); u.y = Math.min(u.y, b.y);
        u.w = x2 - u.x; u.h = y2 - u.y;
      }
    });
    return u;
  }

  /* ================= overlay (selection bbox + handles) ================= */
  var HANDLE_R = 5;
  function ovEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) { n.setAttribute(k, attrs[k]); }
    vOverlay.appendChild(n);
    return n;
  }
  function renderOverlay() {
    clearOv();
    drawSelBox();
  }
  function clearOv() {
    if (!vOverlay) { return; }
    while (vOverlay.firstChild) { vOverlay.removeChild(vOverlay.firstChild); }
  }
  function drawSelBox() {
    if (!vOverlay) { return; }
    if (!sel.length) { return; }
    var u = unionBox(sel);
    if (!u) { return; }
    var s = 1 / zm; // keep overlay chrome constant on screen
    ovEl("rect", {
      x: u.x, y: u.y, width: Math.max(u.w, 1), height: Math.max(u.h, 1),
      fill: "none", stroke: "#31A8FF", "stroke-width": 1.2 * s,
      "stroke-dasharray": (5 * s) + " " + (4 * s), "vector-effect": "non-scaling-stroke"
    });
    var hs = handlePositions(u);
    hs.forEach(function (h) {
      var r = ovEl("rect", {
        x: h.x - HANDLE_R * s, y: h.y - HANDLE_R * s,
        width: HANDLE_R * 2 * s, height: HANDLE_R * 2 * s,
        fill: "#ffffff", stroke: "#31A8FF", "stroke-width": 1.2 * s,
        "data-handle": h.id, "pointer-events": "all", cursor: h.cursor
      });
      r.style.pointerEvents = "all";
    });
    // rotate handle
    var rx = u.x + u.w / 2, ry = u.y - 22 * s;
    ovEl("line", { x1: u.x + u.w / 2, y1: u.y, x2: rx, y2: ry, stroke: "#31A8FF", "stroke-width": 1.2 * s });
    var rc = ovEl("circle", {
      cx: rx, cy: ry, r: HANDLE_R * s, fill: "#ffffff",
      stroke: "#31A8FF", "stroke-width": 1.2 * s, "data-handle": "rot", cursor: "grab"
    });
    rc.style.pointerEvents = "all";
  }
  function handlePositions(u) {
    var x = u.x, y = u.y, w = u.w, h = u.h;
    return [
      { id: "nw", x: x, y: y, cursor: "nwse-resize" },
      { id: "n", x: x + w / 2, y: y, cursor: "ns-resize" },
      { id: "ne", x: x + w, y: y, cursor: "nesw-resize" },
      { id: "e", x: x + w, y: y + h / 2, cursor: "ew-resize" },
      { id: "se", x: x + w, y: y + h, cursor: "nwse-resize" },
      { id: "s", x: x + w / 2, y: y + h, cursor: "ns-resize" },
      { id: "sw", x: x, y: y + h, cursor: "nesw-resize" },
      { id: "w", x: x, y: y + h / 2, cursor: "ew-resize" }
    ];
  }

  /* ================= undo ================= */
  function layersHTML() {
    var s = "";
    layerGroups().forEach(function (g) { s += new XMLSerializer().serializeToString(g); });
    return s;
  }
  function snapState() {
    return JSON.stringify({ w: artW, h: artH, html: layersHTML(), active: activeLayerName });
  }
  function checkpoint() {
    undoStack.push(snapState());
    if (undoStack.length > 60) { undoStack.shift(); }
    redoStack.length = 0;
    syncUndoBtns();
  }
  function applySnap(json) {
    var st;
    try { st = JSON.parse(json); } catch (e) { return; }
    setArtboard(st.w, st.h, true);
    layerGroups().forEach(function (g) { vViewport.removeChild(g); });
    // parse via DOMParser (innerHTML on SVG elements is unreliable in some engines)
    var doc2;
    try { doc2 = new DOMParser().parseFromString('<g xmlns="' + SVGNS + '">' + st.html + "</g>", "image/svg+xml"); }
    catch (e2) { doc2 = null; }
    if (doc2 && doc2.documentElement) {
      var kids = [], i, n;
      for (i = 0; i < doc2.documentElement.childNodes.length; i++) {
        n = doc2.documentElement.childNodes[i];
        if (n.nodeType === 1) { kids.push(document.importNode(n, true)); }
      }
      kids.forEach(function (k) { vViewport.insertBefore(k, vOverlay); });
    }
    activeLayerName = st.active || null;
    if (!layerGroups().length) { makeLayer(); }
    select([]);
    renderOverlay();
    syncUndoBtns();
    T.bus.emit("vector:change");
  }
  function undo() {
    if (!undoStack.length) { return; }
    redoStack.push(snapState());
    applySnap(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) { return; }
    undoStack.push(snapState());
    applySnap(redoStack.pop());
  }
  function syncUndoBtns() {
    if (!built) { return; }
    view.querySelector("#vUndo").disabled = !undoStack.length;
    view.querySelector("#vRedo").disabled = !redoStack.length;
  }

  /* ================= document ops ================= */
  function setArtboard(w, h, silent) {
    artW = T.clamp(Math.round(w) || 800, 1, 5000);
    artH = T.clamp(Math.round(h) || 600, 1, 5000);
    if (vArtboard) {
      vArtboard.setAttribute("width", String(artW));
      vArtboard.setAttribute("height", String(artH));
    }
    if (vArtW) { vArtW.value = String(artW); }
    if (vArtH) { vArtH.value = String(artH); }
    if (!silent) { checkpoint(); commit(); }
  }
  function clearLayers() {
    layerGroups().forEach(function (g) { vViewport.removeChild(g); });
    layerSeq = 0;
    activeLayerName = null;
  }
  function newDoc() {
    buildView();
    checkpoint();
    clearLayers();
    setArtboard(800, 600, true);
    makeLayer("Layer 1");
    undoStack.length = 0; redoStack.length = 0;
    docSeq += 1;
    if (vDocName) { vDocName.value = "Untitled-" + docSeq; }
    select([]);
    zoomFit();
    syncUndoBtns();
    T.bus.emit("vector:change");
  }
  function getSVG() {
    buildView();
    return '<svg xmlns="' + SVGNS + '" width="' + artW + '" height="' + artH + '"' +
      ' viewBox="0 0 ' + artW + " " + artH + '">' +
      '<rect width="' + artW + '" height="' + artH + '" fill="#ffffff"/>' +
      layersHTML() + "</svg>";
  }
  function setSVG(str) {
    buildView();
    var doc;
    try { doc = new DOMParser().parseFromString(str, "image/svg+xml"); }
    catch (e) { T.toast("Could not parse SVG.", "error"); return; }
    var root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") { T.toast("Not an SVG document.", "error"); return; }
    var w = parseFloat(root.getAttribute("width")), h = parseFloat(root.getAttribute("height"));
    var vb = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(parseFloat);
    if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
    w = w || 800; h = h || 600;
    checkpoint();
    clearLayers();
    var imported = [], i, n;
    for (i = 0; i < root.childNodes.length; i++) {
      n = root.childNodes[i];
      if (n.nodeType !== 1) { continue; }
      if (n.getAttribute && n.getAttribute("id") === "vArtboard") { continue; }
      imported.push(document.importNode(n, true));
    }
    // strip editor-only ids that would collide
    imported.forEach(function (el) {
      if (el.querySelectorAll) {
        ["vOverlay", "vViewport", "vCanvas", "vPasteboard"].forEach(function (id) {
          var f = el.querySelector("#" + id);
          if (f && f.parentNode) { f.parentNode.removeChild(f); }
        });
      }
      if (el.removeAttribute) { el.removeAttribute("id"); }
    });
    var named = imported.filter(function (el) { return el.tagName === "g" && el.hasAttribute("data-name"); });
    var rest = imported.filter(function (el) { return !(el.tagName === "g" && el.hasAttribute("data-name")); });
    named.forEach(function (g) {
      vViewport.insertBefore(g, vOverlay);
      var m = (g.getAttribute("data-name") || "").match(/(\d+)\s*$/);
      if (m) { layerSeq = Math.max(layerSeq, parseInt(m[1], 10)); }
    });
    if (rest.length) {
      var g0 = makeLayer("Layer 1");
      rest.forEach(function (el) { g0.appendChild(el); });
    }
    if (!layerGroups().length) { makeLayer("Layer 1"); }
    var ls = layerGroups();
    activeLayerName = ls[ls.length - 1].getAttribute("data-name");
    setArtboard(w, h, true);
    select([]);
    zoomFit();
    T.bus.emit("vector:change");
  }
  function commit() {
    renderOverlay();
    T.bus.emit("vector:change");
  }
  function refresh() { renderOverlay(); }

  /* ================= tool registry ================= */
  function registerTool(def) {
    tools[def.id] = def;
    if (toolOrder.indexOf(def.id) < 0) { toolOrder.push(def.id); }
  }
  function setTool(id) {
    if (!tools[id] || curToolId === id) { return; }
    var old = tools[curToolId];
    if (old && old.deactivate) { try { old.deactivate(); } catch (e) { /* ignore */ } }
    curToolId = id;
    renderDock();
    renderOptions();
    var t = tools[id];
    if (vCanvas) { vCanvas.style.cursor = t.cursor || "default"; }
    if (t.activate) { try { t.activate(); } catch (e) { /* ignore */ } }
    T.bus.emit("vector:tool", { id: id });
  }
  function currentTool() { return tools[curToolId] || null; }
  function renderDock() {
    if (!vTools) { return; }
    vTools.innerHTML = "";
    toolOrder.forEach(function (id) {
      var t = tools[id];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vtool" + (id === curToolId ? " active" : "");
      b.title = t.label + (t.key ? " (" + t.key.toUpperCase() + ")" : "");
      b.innerHTML = vIcon(t.icon || "select");
      b.setAttribute("aria-label", t.label);
      b.addEventListener("click", function () { setTool(id); });
      vTools.appendChild(b);
    });
    // fill/stroke stack at dock bottom
    var stack = document.createElement("div");
    stack.id = "vPaintStack";
    stack.title = "Fill / Stroke (click toggles target, D resets, Shift+X swaps)";
    stack.innerHTML =
      '<div class="v-paint-stroke" id="vSwStroke" title="Stroke (click to target)"></div>' +
      '<div class="v-paint-fill" id="vSwFill" title="Fill (click to target)"></div>';
    stack.addEventListener("click", function (e) {
      var tgt = e.target.id === "vSwStroke" ? "stroke" : "fill";
      cur.activePaint = tgt;
      syncPaintStack();
      renderOptions();
    });
    stack.addEventListener("dblclick", function () { pickPaintColor(); });
    vTools.appendChild(stack);
    syncPaintStack();
  }
  function syncPaintStack() {
    if (!built) { return; }
    var f = view.querySelector("#vSwFill"), s = view.querySelector("#vSwStroke");
    if (!f || !s) { return; }
    f.style.background = cur.fill;
    s.style.borderColor = cur.stroke;
    f.classList.toggle("active", cur.activePaint === "fill");
    s.classList.toggle("active", cur.activePaint === "stroke");
  }
  function pickPaintColor() {
    var inp = document.createElement("input");
    inp.type = "color";
    inp.value = cur.activePaint === "fill" ? cur.fill : cur.stroke;
    inp.style.position = "fixed"; inp.style.opacity = "0"; inp.style.pointerEvents = "none";
    document.body.appendChild(inp);
    inp.addEventListener("input", function () {
      if (cur.activePaint === "fill") { cur.fill = inp.value; } else { cur.stroke = inp.value; }
      syncPaintStack(); renderOptions();
    });
    inp.addEventListener("change", function () { if (inp.parentNode) { inp.parentNode.removeChild(inp); } });
    inp.click();
  }
  function renderOptions() {
    if (!vToolOptions) { return; }
    vToolOptions.innerHTML = "";
    var t = currentTool();
    if (t && t.options) {
      try { t.options(vToolOptions); } catch (e) { /* ignore */ }
    }
    paintOptions(vToolOptions);
  }
  /* shared fill/stroke/width/opacity controls in the options bar */
  function paintOptions(host) {
    var wrap = document.createElement("div");
    wrap.className = "v-paint-opts";
    wrap.innerHTML =
      '<label title="Fill color">Fill <input type="color" data-k="fill" value="' + T.esc(cur.fill) + '"></label>' +
      '<label title="Stroke color">Stroke <input type="color" data-k="stroke" value="' + T.esc(cur.stroke) + '"></label>' +
      '<label title="Stroke width">W <input type="number" data-k="sw" min="0" max="200" step="0.5" value="' + cur.strokeWidth + '"></label>' +
      '<label title="Opacity">Op <input type="number" data-k="op" min="0" max="1" step="0.05" value="' + cur.opacity + '"></label>';
    wrap.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-k");
      if (!k) { return; }
      if (k === "fill") { cur.fill = e.target.value; }
      else if (k === "stroke") { cur.stroke = e.target.value; }
      else if (k === "sw") { cur.strokeWidth = T.clamp(parseFloat(e.target.value) || 0, 0, 200); }
      else if (k === "op") { cur.opacity = T.clamp(parseFloat(e.target.value) || 0, 0, 1); }
      applyPaintToSelection();
      syncPaintStack();
    });
    host.appendChild(wrap);
  }
  function applyPaintToSelection() {
    if (!sel.length) { return; }
    checkpoint();
    sel.forEach(function (el) {
      el.setAttribute("fill", cur.fill);
      el.setAttribute("stroke", cur.stroke);
      el.setAttribute("stroke-width", String(cur.strokeWidth));
      el.setAttribute("opacity", String(cur.opacity));
    });
    commit();
  }
  function resetPaint() {
    cur.fill = "#ffffff"; cur.stroke = "#1a1a1a"; cur.strokeWidth = 2; cur.opacity = 1;
    syncPaintStack(); renderOptions();
  }
  function swapPaint() {
    var f = cur.fill;
    cur.fill = cur.stroke; cur.stroke = f;
    syncPaintStack(); renderOptions();
  }

  /* ================= pointer routing ================= */
  var drag = null;
  function evLocal(e) { return toLocal(e); }
  function onDown(e) {
    if (e.button === 1 || (curToolId === "hand")) { beginPan(e); return; }
    if (e.button !== 0) { return; }
    var t = currentTool();
    if (!t || !t.down) { return; }
    var p = evLocal(e);
    try { vCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drag = { tool: t, id: e.pointerId };
    try { t.down(e, p); } catch (err2) { drag = null; }
  }
  function onMove(e) {
    updateCoords(e);
    if (!drag || e.pointerId !== drag.id) { return; }
    var t = drag.tool;
    if (t && t.move) { try { t.move(e, evLocal(e)); } catch (err) { /* ignore */ } }
  }
  function onUp(e) {
    if (drag && e.pointerId === drag.id) {
      var t = drag.tool;
      drag = null;
      if (t && t.up) { try { t.up(e, evLocal(e)); } catch (err) { /* ignore */ } }
    }
    panDrag = null;
  }
  function onDbl(e) {
    var t = currentTool();
    if (t && t.dblclick) {
      try { t.dblclick(e, evLocal(e)); } catch (err) { /* ignore */ }
    }
  }
  function onHover(e) { updateCoords(e); }
  function updateCoords(e) {
    if (!vCoords || !vCanvas) { return; }
    var r = vCanvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { return; }
    var p = toLocal(e);
    vCoords.textContent = "X: " + Math.round(p.x) + ", Y: " + Math.round(p.y);
  }
  var panDrag = null;
  function beginPan(e) {
    panDrag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, id: e.pointerId };
    try { vCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var mv = function (ev) {
      if (!panDrag || ev.pointerId !== panDrag.id) { return; }
      pan.x = panDrag.px + (ev.clientX - panDrag.x);
      pan.y = panDrag.py + (ev.clientY - panDrag.y);
      applyView();
    };
    var up = function (ev) {
      if (ev.pointerId !== panDrag.id) { return; }
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      panDrag = null;
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    vCanvas.style.cursor = "grabbing";
    setTimeout(function () {
      var t = currentTool();
      if (vCanvas) { vCanvas.style.cursor = t ? (t.cursor || "default") : "default"; }
    }, 50);
  }

  /* ================= keyboard ================= */
  function inField(el) {
    if (!el) { return false; }
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }
  function onKey(e) {
    if (!built || view.classList.contains("hidden")) { return; }
    var mod = e.ctrlKey || e.metaKey;
    if (inField(e.target)) {
      if (e.key === "Escape" && e.target === vTextEdit) { endTextEdit(false); }
      else if (e.key === "Enter" && e.target === vTextEdit) { endTextEdit(true); }
      return;
    }
    var k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (mod && k === "a") { e.preventDefault(); selectAllArt(); return; }
    if (mod && k === "d") { e.preventDefault(); clearSel(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
      e.preventDefault(); deleteSelection(); return;
    }
    if (e.key === "Escape") {
      var t = currentTool();
      if (t && t.cancel && t.cancel()) { return; }
      clearSel(); return;
    }
    if (e.key.indexOf("Arrow") === 0 && sel.length) {
      e.preventDefault();
      var d = e.shiftKey ? 10 : 1;
      var dx = 0, dy = 0;
      if (e.key === "ArrowLeft") { dx = -d; }
      else if (e.key === "ArrowRight") { dx = d; }
      else if (e.key === "ArrowUp") { dy = -d; }
      else if (e.key === "ArrowDown") { dy = d; }
      nudge(dx, dy);
      return;
    }
    if (mod || e.altKey) { return; }
    var map = { v: "select", a: "node", p: "pen", m: "shapes", b: "brush", t: "type", i: "eyedropper", h: "hand", z: "zoom" };
    if (map[k]) {
      var tid = map[k], ct0 = currentTool();
      if (ct0 && ct0.id === tid && ct0.onReselect) { try { ct0.onReselect(); } catch (err) { /* ignore */ } }
      else { setTool(tid); }
      return;
    }
    if (k === "x" && e.shiftKey) { swapPaint(); return; }
    if (k === "d") { resetPaint(); return; }
    var ct = currentTool();
    if (ct && ct.toolKey) { try { ct.toolKey(e); } catch (err) { /* ignore */ } }
  }
  function nudge(dx, dy) {
    checkpoint();
    sel.forEach(function (el) {
      var m = relMatrix(el);
      m = new DOMMatrix().translate(dx, dy).multiply(m);
      el.setAttribute("transform", matrixStr(m));
    });
    commit();
  }
  function matrixStr(m) {
    return "matrix(" + [m.a, m.b, m.c, m.d, m.e, m.f].map(function (n) {
      return Math.round(n * 10000) / 10000;
    }).join(" ") + ")";
  }
  function deleteSelection() {
    if (!sel.length) { return; }
    checkpoint();
    sel.forEach(function (el) { if (el.parentNode) { el.parentNode.removeChild(el); } });
    select([]);
    commit();
  }
  function selectAllArt() {
    var out = [];
    layerGroups().forEach(function (g) {
      Array.prototype.forEach.call(g.childNodes, function (n) {
        if (n.nodeType === 1) { out.push(n); }
      });
    });
    select(out);
  }

  /* ================= text edit helper ================= */
  var textEditCb = null;
  function beginTextEdit(x, y, initial, cb) {
    buildView();
    textEditCb = cb;
    vTextEdit.value = initial || "";
    var r = vCanvas.getBoundingClientRect();
    vTextEdit.style.left = (x * zm + pan.x) + "px";
    vTextEdit.style.top = (y * zm + pan.y - 14) + "px";
    vTextEdit.style.fontSize = Math.max(12, 16 * zm) + "px";
    vTextEdit.classList.remove("hidden");
    setTimeout(function () { vTextEdit.focus(); vTextEdit.select(); }, 20);
  }
  function endTextEdit(ok) {
    if (vTextEdit.classList.contains("hidden")) { return; }
    var v = vTextEdit.value;
    vTextEdit.classList.add("hidden");
    var cb = textEditCb;
    textEditCb = null;
    if (cb) { try { cb(ok ? v : null); } catch (e) { /* ignore */ } }
  }

  /* ================= show / hide ================= */
  function show() {
    buildView();
    view.classList.remove("hidden");
    if (!layerGroups().length) { newDoc(); }
    else { zoomFit(); }
    if (!curToolId && toolOrder.length) { setTool(toolOrder[0]); }
    renderDock(); renderOptions(); syncUndoBtns(); syncPaintStack();
  }
  function hide() {
    if (built) { view.classList.add("hidden"); }
    endTextEdit(false);
  }
  function isActive() { return built && !view.classList.contains("hidden"); }

  /* ================= public contract ================= */
  T.vector = {
    newDoc: newDoc,
    setSVG: setSVG,
    getSVG: getSVG,
    svgEl: function () { buildView(); return vCanvas; },
    selection: selection,
    select: select,
    _vid: null, // stable artwork id for the Word bridge (set by ops/panels)
    // extras used by tools.js / shell
    show: show, hide: hide, isActive: isActive,
    setTool: setTool, tool: currentTool, registerTool: registerTool,
    repaintOptions: renderOptions,
    undo: undo, redo: redo, checkpoint: checkpoint, commit: commit, refresh: refresh,
    deleteSelection: deleteSelection, selectAll: selectAllArt,
    zoomFit: zoomFit, zoomIn: function () { zoomStep(1.25); }, zoomOut: function () { zoomStep(1 / 1.25); },
    setArtboard: setArtboard, artboardSize: function () { return { w: artW, h: artH }; },
    layers: layerGroups, activeLayer: activeLayer, setActiveLayer: setActiveLayer, makeLayer: makeLayer,
    beginTextEdit: beginTextEdit, endTextEdit: endTextEdit,
    icon: vIcon,
    paint: cur, resetPaint: resetPaint, swapPaint: swapPaint, applyPaintToSelection: applyPaintToSelection,
    // internal helpers shared with tools.js (stable within v5)
    _x: {
      SVGNS: SVGNS,
      toLocal: toLocal, view: function () { return view; }, canvas: function () { return vCanvas; },
      viewport: function () { return vViewport; }, overlay: function () { return vOverlay; },
      wrap: function () { return vWrap; },
      relMatrix: relMatrix, xformBox: xformBox, unionBox: unionBox,
      matrixStr: matrixStr, pan: pan,
      zoom: function () { return zm; }, setZoom: function (z) { zm = T.clamp(z, 0.1, 8); applyView(); },
      applyView: applyView, zoomAt: zoomAt,
      ovEl: ovEl, isArtwork: isArtwork,
      clearOv: clearOv, drawSelBox: drawSelBox,
      clearSel: clearSel, onKeyTarget: null
    }
  };

  /* palette / command registrations */
  T.register("vector.newDoc", function () { T.vector.show(); T.vector.newDoc(); }, { title: "Vector: new document", cat: "Vector", icon: "i-file" });
  T.register("vector.undo", function () { T.vector.undo(); }, { title: "Vector: undo", cat: "Vector", icon: "i-undo", keys: "Ctrl+Z" });
  T.register("vector.redo", function () { T.vector.redo(); }, { title: "Vector: redo", cat: "Vector", icon: "i-redo", keys: "Ctrl+Y" });
  T.register("vector.delete", function () { T.vector.deleteSelection(); }, { title: "Vector: delete selection", cat: "Vector", icon: "i-trash" });
  T.register("vector.selectAll", function () { T.vector.selectAll(); }, { title: "Vector: select all", cat: "Vector", icon: "i-search" });
  T.register("vector.deselect", function () { T.vector.select([]); }, { title: "Vector: deselect", cat: "Vector", icon: "i-x" });
  T.register("vector.zoomFit", function () { T.vector.zoomFit(); }, { title: "Vector: fit artboard", cat: "Vector", icon: "i-eye" });
  T.register("vector.zoomIn", function () { T.vector.zoomIn(); }, { title: "Vector: zoom in", cat: "Vector", icon: "i-plus" });
  T.register("vector.zoomOut", function () { T.vector.zoomOut(); }, { title: "Vector: zoom out", cat: "Vector", icon: "i-minus" });
})();
