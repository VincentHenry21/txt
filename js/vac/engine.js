/* NXT VAC engine depth upgrade (v6).
   Builds on the retained-mode SVG scene graph in js/vac/core.js:
   multi-artboard manager, pro gradient builder, global swatches, image
   trace (marching squares), outline mode, smart guides, per-artboard
   SVG/PNG/PDF/EPS export, and publish bridges to TXT/DCK/PDF.

   Pure geometry lives in js/vac/geom.js (T.vacGeom) so it stays unit
   testable without a browser. This file is DOM/UI only.

   Mount timing: the #vPanels container is created lazily by core.js
   buildView(), so this module retries until the panels host exists
   (MutationObserver + interval fallback) instead of initing into the void.

   Conventions: IIFE, var T = window.TXT, T.bus, no emojis, no em dashes,
   no CSS zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T || typeof document === "undefined") { return; }
  var SVGNS = "http://www.w3.org/2000/svg";

  function G() { return T.vacGeom || null; }
  function svg() { return (T.vac && typeof T.vac.svgEl === "function") ? T.vac.svgEl() : null; }
  function sel() { return (T.vac && typeof T.vac.selection === "function") ? (T.vac.selection() || []) : []; }
  function ops() { return T.vacOps || null; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function esc(s) { return T.esc(String(s === undefined || s === null ? "" : s)); }

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined && html !== null) { e.innerHTML = html; }
    return e;
  }
  function btn(label, cls, title) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls || "vp-btn";
    if (title) { b.title = title; }
    b.innerHTML = "<span>" + esc(label) + "</span>";
    return b;
  }
  function numInput(min, max, step, val, cls) {
    var i = document.createElement("input");
    i.type = "number"; i.className = cls || "vp-num";
    if (min !== undefined && min !== null) { i.min = String(min); }
    if (max !== undefined && max !== null) { i.max = String(max); }
    if (step !== undefined && step !== null) { i.step = String(step); }
    i.value = String(val);
    return i;
  }
  function toast(msg, kind) {
    if (typeof T.toast === "function") { T.toast(msg, kind); }
  }
  function changed() { if (ops()) { ops().changed(); } else { T.bus.emit("vac:change"); } }

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = (window.URL || window.webkitURL).createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { (window.URL || window.webkitURL).revokeObjectURL(a.href); } catch (e) {}
      if (a.parentNode) { a.parentNode.removeChild(a); }
    }, 4000);
  }
  function b64encode(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(b64) {
    return decodeURIComponent(escape(window.atob(b64)));
  }

  /* ================= ARTBOARD MANAGER ================= */
  var artboards = [];
  var activeAbId = null;
  var abSeq = 0;
  var abInit = false;
  var abHist = [];
  var canvasWired = false;

  var AB_PRESETS = [
    { name: "iPhone 16 Pro", w: 402, h: 874 },
    { name: "iPad Pro", w: 1024, h: 1366 },
    { name: "A4 Print", w: 794, h: 1123 },
    { name: "Square 1080", w: 1080, h: 1080 },
    { name: "HD 1920", w: 1920, h: 1080 },
    { name: "Custom", w: 0, h: 0 }
  ];

  function abById(id) {
    for (var i = 0; i < artboards.length; i++) { if (artboards[i].id === id) { return artboards[i]; } }
    return null;
  }
  function activeArtboard() {
    return abById(activeAbId) || artboards[0] || null;
  }
  function pushAbHist() {
    abHist.push(JSON.stringify(artboards));
    if (abHist.length > 30) { abHist.shift(); }
  }
  function undoArtboards() {
    if (!abHist.length) { toast("Nothing to undo for artboards."); return; }
    artboards = JSON.parse(abHist.pop());
    if (!abById(activeAbId)) { activeAbId = artboards.length ? artboards[0].id : null; }
    saveArtboards();
    renderArtboards();
    renderAbPanel();
    toast("Artboard change undone.");
  }
  function saveArtboards() {
    try {
      if (T.store) { T.store.set("vac", "artboards", JSON.parse(JSON.stringify(artboards))); }
    } catch (e) { /* storage unavailable */ }
  }
  function loadArtboards() {
    var arr = null;
    try { arr = T.store ? T.store.get("vac", "artboards") : null; } catch (e) { arr = null; }
    if (Array.isArray(arr) && arr.length) {
      artboards = arr.filter(function (a) {
        return a && isFinite(a.x) && isFinite(a.y) && a.w > 0 && a.h > 0;
      }).map(function (a) {
        abSeq = Math.max(abSeq, parseInt(String(a.id).replace(/\D/g, ""), 10) || 0);
        return { id: String(a.id), name: String(a.name || "Artboard"), x: +a.x, y: +a.y, w: +a.w, h: +a.h };
      });
    }
    if (!artboards.length) { defaultArtboards(); }
    if (!abById(activeAbId)) { activeAbId = artboards[0].id; }
  }
  function defaultArtboards() {
    var s = (T.vac && T.vac.artboardSize) ? T.vac.artboardSize() : { w: 800, h: 600 };
    abSeq += 1;
    artboards = [{ id: "ab" + abSeq, name: "Artboard 1", x: 0, y: 0, w: s.w || 800, h: s.h || 600 }];
    activeAbId = artboards[0].id;
  }
  function ensureArtboards() {
    if (abInit) { return; }
    abInit = true;
    loadArtboards();
    renderArtboards();
  }

  function artboardsGroup() {
    var s = svg();
    if (!s) { return null; }
    var g = s.querySelector("#vArtboardsG");
    if (g) { return g; }
    var NS = SVGNS;
    g = document.createElementNS(NS, "g");
    g.setAttribute("id", "vArtboardsG");
    var vp = (T.vac._x && T.vac._x.viewport) ? T.vac._x.viewport() : null;
    var paste = s.querySelector("#vPasteboard");
    if (vp) {
      if (paste && paste.nextSibling) { vp.insertBefore(g, paste.nextSibling); }
      else { vp.appendChild(g); }
    } else {
      s.insertBefore(g, s.firstChild);
    }
    return g;
  }
  /* Hide the legacy single-artboard rect; the manager draws its own. */
  function hideLegacyArtboard() {
    var s = svg();
    if (!s) { return; }
    var leg = s.querySelector("#vArtboard");
    if (leg) { leg.style.display = "none"; }
  }
  function renderArtboards() {
    var g = artboardsGroup();
    if (!g) { return; }
    hideLegacyArtboard();
    while (g.firstChild) { g.removeChild(g.firstChild); }
    var NS = SVGNS;
    artboards.forEach(function (ab) {
      var grp = document.createElementNS(NS, "g");
      grp.setAttribute("data-artboard", "1");
      grp.setAttribute("data-abid", ab.id);
      var r = document.createElementNS(NS, "rect");
      r.setAttribute("x", r2(ab.x)); r.setAttribute("y", r2(ab.y));
      r.setAttribute("width", Math.max(1, Math.round(ab.w)));
      r.setAttribute("height", Math.max(1, Math.round(ab.h)));
      r.setAttribute("fill", "#ffffff");
      r.setAttribute("stroke", ab.id === activeAbId ? "#84CC16" : "#9aa0a6");
      r.setAttribute("stroke-width", ab.id === activeAbId ? "2" : "1");
      r.style.cursor = "move";
      grp.appendChild(r);
      var label = document.createElementNS(NS, "text");
      label.setAttribute("x", r2(ab.x + 6)); label.setAttribute("y", r2(ab.y - 8));
      label.setAttribute("font-size", "12");
      label.setAttribute("font-family", "Inter, system-ui, sans-serif");
      label.setAttribute("fill", "#6b7280");
      label.textContent = ab.name + "  " + Math.round(ab.w) + " x " + Math.round(ab.h);
      grp.appendChild(label);
      g.appendChild(grp);
    });
  }
  function setActiveAb(id) {
    if (!abById(id)) { return; }
    activeAbId = id;
    renderArtboards();
    renderAbPanel();
  }
  /* Shapes whose visual center falls inside an artboard belong to it. */
  function shapesInArtboard(ab) {
    var out = [];
    var O = ops();
    if (!O) { return out; }
    T.vac.layers().forEach(function (layer) {
      Array.prototype.forEach.call(layer.querySelectorAll("rect,circle,ellipse,polygon,polyline,path,line,text,image"), function (el) {
        var b = null;
        try { b = O.visualBBox(el); } catch (e) { b = null; }
        if (!b) { return; }
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (cx >= ab.x && cx <= ab.x + ab.w && cy >= ab.y && cy <= ab.y + ab.h) { out.push(el); }
      });
    });
    return out;
  }
  function addArtboard(name, w, h) {
    pushAbHist();
    abSeq += 1;
    var x = 0, y = 0;
    artboards.forEach(function (ab) { x = Math.max(x, ab.x + ab.w + 48); });
    var ab = { id: "ab" + abSeq, name: name || ("Artboard " + (artboards.length + 1)), x: x, y: y, w: w, h: h };
    artboards.push(ab);
    activeAbId = ab.id;
    saveArtboards();
    renderArtboards();
    renderAbPanel();
    return ab;
  }
  function duplicateArtboard(id, withArtwork) {
    var src = abById(id);
    if (!src) { return; }
    pushAbHist();
    if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
    var x = src.x + src.w + 48;
    abSeq += 1;
    var ab = { id: "ab" + abSeq, name: src.name + " copy", x: x, y: src.y, w: src.w, h: src.h };
    artboards.push(ab);
    if (withArtwork) {
      var dx = x - src.x, dy = 0, O = ops();
      shapesInArtboard(src).forEach(function (el) {
        var c = el.cloneNode(true);
        c.removeAttribute("id");
        el.parentNode.insertBefore(c, el.nextSibling);
        if (O) { O.nudge(c, r2(dx), r2(dy)); }
      });
    }
    activeAbId = ab.id;
    saveArtboards();
    renderArtboards();
    renderAbPanel();
    changed();
    toast(withArtwork ? "Artboard duplicated with artwork." : "Artboard duplicated.");
    return ab;
  }
  function deleteArtboard(id) {
    if (artboards.length <= 1) { toast("A document needs at least one artboard.", "error"); return; }
    var ab = abById(id);
    if (!ab) { return; }
    pushAbHist();
    artboards = artboards.filter(function (a) { return a.id !== id; });
    if (activeAbId === id) { activeAbId = artboards[0].id; }
    saveArtboards();
    renderArtboards();
    renderAbPanel();
    toast("Artboard deleted. Artwork on it was kept on the pasteboard.");
  }
  function moveArtboard(id, dir) {
    var i = -1;
    artboards.forEach(function (a, k) { if (a.id === id) { i = k; } });
    if (i < 0) { return; }
    var j = i + dir;
    if (j < 0 || j >= artboards.length) { return; }
    pushAbHist();
    var t = artboards[i]; artboards[i] = artboards[j]; artboards[j] = t;
    saveArtboards();
    renderArtboards();
    renderAbPanel();
  }
  /* Artboard drag on the canvas (select tool only): pointerdown on an
     artboard rect moves the artboard, not the artwork. Capture phase so the
     tool router in core.js never sees the gesture. */
  function wireArtboardDrag() {
    if (canvasWired) { return; }
    var s = svg();
    if (!s) { return; }
    canvasWired = true;
    s.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) { return; }
      var tool = T.vac.tool ? T.vac.tool() : null;
      if (!tool || tool.id !== "select") { return; }
      var grp = e.target && e.target.closest ? e.target.closest("[data-artboard]") : null;
      if (!grp) { return; }
      var ab = abById(grp.getAttribute("data-abid"));
      if (!ab) { return; }
      e.stopPropagation();
      e.preventDefault();
      var toLocal = T.vac._x.toLocal;
      var start = toLocal(e);
      var ox = ab.x, oy = ab.y, moved = false;
      pushAbHist();
      setActiveAb(ab.id);
      function mv(ev) {
        var p = toLocal(ev);
        var nx = ox + (p.x - start.x), ny = oy + (p.y - start.y);
        if (Math.abs(nx - ab.x) > 0.5 || Math.abs(ny - ab.y) > 0.5) { moved = true; }
        ab.x = r2(nx); ab.y = r2(ny);
        var rect = grp.querySelector("rect"), lab = grp.querySelector("text");
        if (rect) { rect.setAttribute("x", ab.x); rect.setAttribute("y", ab.y); }
        if (lab) { lab.setAttribute("x", r2(ab.x + 6)); lab.setAttribute("y", r2(ab.y - 8)); }
      }
      function up() {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up);
        if (!moved) { abHist.pop(); }
        else { saveArtboards(); renderAbPanel(); }
      }
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    }, true);
  }

  /* ---- getSVG / setSVG wrappers: carry artboards + defs in saved files ----
     Saved artwork records store the SVG string, so artboard metadata travels
     inside a <metadata> element and shared defs (gradients, swatches) are
     injected after the opening tag. On load the metadata is stripped back
     out and the artboards are restored. */
  var svgWrapped = false;
  function wrapGetSet() {
    if (svgWrapped || !T.vac) { return; }
    svgWrapped = true;
    var _get = T.vac.getSVG, _set = T.vac.setSVG;
    T.vac.getSVG = function () {
      var s = detachPreviews(_get);
      var sv = svg();
      var defs = sv ? sv.querySelector("defs") : null;
      if (defs) {
        var ds = new XMLSerializer().serializeToString(defs);
        s = s.replace(/<svg[^>]*>/, function (m) { return m + ds; });
      }
      var meta = '<metadata data-artboards-b64="' + b64encode(JSON.stringify(artboards)) + '"></metadata>';
      s = s.replace(/<\/svg>\s*$/, meta + "</svg>");
      return s;
    };
    T.vac.setSVG = function (str) {
      str = String(str || "");
      var m = /<metadata data-artboards-b64="([^"]*)"><\/metadata>/.exec(str);
      var dm = /<defs[\s\S]*?<\/defs>/.exec(str);
      var clean = str;
      if (m) { clean = clean.replace(m[0], ""); }
      if (dm) { clean = clean.replace(dm[0], ""); }
      _set(clean);
      if (dm) { mergeDefs(dm[0]); }
      ensureSwatchDefs();
      if (m) {
        try {
          var arr = JSON.parse(b64decode(m[1]));
          if (Array.isArray(arr) && arr.length) {
            artboards = arr.filter(function (a) { return a && a.w > 0 && a.h > 0; });
            artboards.forEach(function (a) {
              var n = parseInt(String(a.id).replace(/\D/g, ""), 10);
              if (n > abSeq) { abSeq = n; }
            });
            if (!abById(activeAbId)) { activeAbId = artboards[0].id; }
          } else { defaultArtboards(); }
        } catch (e) { defaultArtboards(); }
      } else { defaultArtboards(); }
      abInit = true;
      saveArtboards();
      renderArtboards();
      renderAbPanel();
    };
  }
  /* Temporarily detach trace-preview nodes so exports and saves stay clean. */
  function detachPreviews(fn) {
    var sv = svg();
    if (!sv) { return fn(); }
    var nodes = Array.prototype.slice.call(sv.querySelectorAll("[data-trace-preview]"));
    var parents = nodes.map(function (n) { return n.parentNode; });
    var nexts = nodes.map(function (n) { return n.nextSibling; });
    nodes.forEach(function (n) { if (n.parentNode) { n.parentNode.removeChild(n); } });
    try { return fn(); }
    finally {
      nodes.forEach(function (n, i) {
        if (parents[i]) { parents[i].insertBefore(n, nexts[i]); }
      });
    }
  }
  function mergeDefs(defsHtml) {
    var sv = svg();
    if (!sv) { return; }
    var doc = null;
    try { doc = new DOMParser().parseFromString(defsHtml, "image/svg+xml"); } catch (e) { return; }
    if (!doc || !doc.documentElement) { return; }
    var live = sv.querySelector("defs");
    if (!live) {
      live = document.createElementNS(SVGNS, "defs");
      sv.insertBefore(live, sv.firstChild);
    }
    Array.prototype.forEach.call(doc.documentElement.childNodes, function (n) {
      if (n.nodeType !== 1) { return; }
      var id = n.getAttribute("id");
      if (id) {
        var exists = null;
        try { exists = live.querySelector('[id="' + id + '"]'); } catch (e2) { exists = null; }
        if (exists) { return; }
      }
      live.appendChild(document.importNode(n, true));
    });
  }
  /* Serialize the ACTIVE artboard as a standalone SVG (export uses artboard
     bounds: width/height/viewBox all come from the artboard). */
  function artboardSVG(ab) {
    ab = ab || activeArtboard();
    var box = G().artboardExportBox(ab);
    var sv = svg();
    var defsHtml = "";
    var defs = sv ? sv.querySelector("defs") : null;
    if (defs) { defsHtml = new XMLSerializer().serializeToString(defs); }
    var body = detachPreviews(function () {
      return T.vac.layers().map(function (g) {
        return new XMLSerializer().serializeToString(g);
      }).join("");
    });
    return '<svg xmlns="' + SVGNS + '" width="' + box.w + '" height="' + box.h + '"' +
      ' viewBox="' + box.x + " " + box.y + " " + box.w + " " + box.h + '">' +
      defsHtml + body + "</svg>";
  }

  /* ================= ARTBOARDS PANEL ================= */
  var ABP = {};
  function makePanel(id, title) {
    var sec = h("section", "vp-panel");
    sec.setAttribute("data-p", id);
    var head = document.createElement("button");
    head.type = "button"; head.className = "vp-head";
    head.innerHTML = T.icon("i-chev-d", "vp-chev") + "<span>" + esc(title) + "</span>";
    head.addEventListener("click", function () { sec.classList.toggle("closed"); });
    var body = h("div", "vp-body");
    sec.appendChild(head); sec.appendChild(body);
    sec._body = body;
    return sec;
  }
  function buildArtboardsPanel() {
    var p = makePanel("vac-artboards", "Artboards"), b = p._body;
    var addRow = h("div", "vp-row");
    var preset = document.createElement("select");
    preset.className = "vp-select";
    preset.setAttribute("aria-label", "Artboard preset");
    AB_PRESETS.forEach(function (pr, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = pr.name + (pr.w ? " (" + pr.w + " x " + pr.h + ")" : "");
      preset.appendChild(o);
    });
    var cw = numInput(1, 5000, 1, 800); cw.title = "Custom width";
    var ch = numInput(1, 5000, 1, 600); ch.title = "Custom height";
    cw.style.display = "none"; ch.style.display = "none";
    preset.addEventListener("change", function () {
      var custom = AB_PRESETS[+preset.value].name === "Custom";
      cw.style.display = custom ? "" : "none";
      ch.style.display = custom ? "" : "none";
    });
    var add = btn("Add", "vp-btn", "Add artboard with the chosen preset");
    add.addEventListener("click", function () {
      var pr = AB_PRESETS[+preset.value];
      var w = pr.w, hh = pr.h;
      if (pr.name === "Custom") {
        w = Math.max(1, Math.min(5000, parseInt(cw.value, 10) || 800));
        hh = Math.max(1, Math.min(5000, parseInt(ch.value, 10) || 600));
      }
      addArtboard(pr.name === "Custom" ? "Custom" : pr.name, w, hh);
    });
    addRow.appendChild(preset); addRow.appendChild(cw); addRow.appendChild(ch); addRow.appendChild(add);
    b.appendChild(addRow);
    ABP.list = h("div", "ve-ablist");
    b.appendChild(ABP.list);
    var row2 = h("div", "vp-row");
    var fit = btn("Fit all", "vp-btn ghost", "Zoom to fit every artboard");
    fit.addEventListener("click", fitAllArtboards);
    var und = btn("Undo", "vp-btn ghost", "Undo the last artboard change");
    und.addEventListener("click", undoArtboards);
    row2.appendChild(fit); row2.appendChild(und);
    b.appendChild(row2);
    b.appendChild(h("div", "vp-hint", "Tip: with the Select tool, drag any artboard directly on the canvas to reposition it. Export uses the highlighted artboard."));
    renderAbPanel();
    return p;
  }
  function renderAbPanel() {
    if (!ABP.list) { return; }
    ABP.list.innerHTML = "";
    artboards.forEach(function (ab, i) {
      var row = h("div", "ve-abrow" + (ab.id === activeAbId ? " active" : ""));
      var main = document.createElement("button");
      main.type = "button"; main.className = "ve-abmain";
      main.title = "Click to make this the active artboard for export";
      main.innerHTML = '<span class="ve-abname">' + esc(ab.name) + '</span>' +
        '<span class="ve-abmeta">' + Math.round(ab.w) + " x " + Math.round(ab.h) + "</span>";
      main.addEventListener("click", function () { setActiveAb(ab.id); });
      var nm = main.querySelector(".ve-abname");
      nm.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var inp = document.createElement("input");
        inp.type = "text"; inp.className = "vp-text"; inp.value = ab.name;
        nm.replaceWith(inp);
        inp.focus(); inp.select();
        var done = false;
        function commit(ok) {
          if (done) { return; } done = true;
          if (ok && inp.value.trim()) { pushAbHist(); ab.name = inp.value.trim(); saveArtboards(); renderArtboards(); }
          renderAbPanel();
        }
        inp.addEventListener("keydown", function (ev) {
          ev.stopPropagation();
          if (ev.key === "Enter") { commit(true); } else if (ev.key === "Escape") { commit(false); }
        });
        inp.addEventListener("blur", function () { commit(true); });
      });
      row.appendChild(main);
      function mini(label, title, fn) {
        var x = document.createElement("button");
        x.type = "button"; x.className = "vp-icobtn"; x.title = title;
        x.setAttribute("aria-label", title);
        x.innerHTML = "<span>" + esc(label) + "</span>";
        x.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
        row.appendChild(x);
      }
      mini("A", "Move artboard up", function () { moveArtboard(ab.id, -1); });
      mini("V", "Move artboard down", function () { moveArtboard(ab.id, 1); });
      mini("2", "Duplicate with artwork", function () { duplicateArtboard(ab.id, true); });
      mini("1", "Duplicate empty", function () { duplicateArtboard(ab.id, false); });
      var del = document.createElement("button");
      del.type = "button"; del.className = "vp-icobtn danger"; del.title = "Delete artboard (artwork is kept)";
      del.setAttribute("aria-label", "Delete artboard");
      del.innerHTML = T.icon("i-trash");
      del.addEventListener("click", function (e) { e.stopPropagation(); deleteArtboard(ab.id); });
      row.appendChild(del);
      ABP.list.appendChild(row);
    });
  }
  function fitAllArtboards() {
    if (!artboards.length) { return; }
    var X = T.vac._x;
    var u = G().unionOfBoxes(artboards.map(function (a) { return { x: a.x, y: a.y, w: a.w, h: a.h }; }));
    var wrap = X.wrap();
    var r = null;
    try { r = wrap.getBoundingClientRect(); } catch (e) { r = null; }
    if (!r || r.width < 10) { return; }
    var z = Math.min((r.width - 120) / u.w, (r.height - 120) / u.h);
    X.setZoom(Math.min(8, Math.max(0.1, z)));
    X.pan.x = (r.width - u.w * X.zoom()) / 2 - u.x * X.zoom();
    X.pan.y = (r.height - u.h * X.zoom()) / 2 - u.y * X.zoom();
    X.applyView();
  }

  /* ================= GRADIENT BUILDER ================= */
  /* Replaces the stock gradient panel body with a real builder: click the
     bar to add stops, drag stops to move them, per-stop color and opacity,
     angle control, linear and radial. Applied as genuine SVG gradients. */
  var gradSeq = 0;
  var GS = { type: "linear", angle: 0, stops: [{ o: 0, c: "#84CC16", op: 1 }, { o: 100, c: "#31A8FF", op: 1 }], sel: 0 };
  var GR2 = {};
  function gradDefs() {
    var sv = svg();
    if (!sv) { return null; }
    var defs = sv.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(SVGNS, "defs");
      sv.insertBefore(defs, sv.firstChild);
    }
    return defs;
  }
  function cssForStops(stops) {
    var parts = stops.slice().sort(function (a, b) { return a.o - b.o; }).map(function (s) {
      return hexA(s.c, s.op) + " " + Math.round(s.o) + "%";
    });
    return "linear-gradient(90deg, " + parts.join(", ") + ")";
  }
  function hexA(hex, op) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
    if (!m) { return hex; }
    var r = parseInt(m[1].substr(0, 2), 16), g = parseInt(m[1].substr(2, 2), 16), b = parseInt(m[1].substr(4, 2), 16);
    return "rgba(" + r + "," + g + "," + b + "," + (op === undefined ? 1 : op) + ")";
  }
  function applyGradient() {
    var defs = gradDefs();
    if (!defs || !ops()) { return; }
    var els = sel();
    if (!els.length) { return; }
    gradSeq += 1;
    var id = "vgrad-" + gradSeq + "-" + Date.now().toString(36);
    var old = defs.querySelector("#" + id);
    if (old) { old.remove(); }
    var g = document.createElementNS(SVGNS, GS.type === "radial" ? "radialGradient" : "linearGradient");
    g.setAttribute("id", id);
    if (GS.type === "linear") {
      var a = GS.angle * Math.PI / 180, c = Math.cos(a), s2 = Math.sin(a);
      g.setAttribute("x1", r2(0.5 - 0.5 * c)); g.setAttribute("y1", r2(0.5 - 0.5 * s2));
      g.setAttribute("x2", r2(0.5 + 0.5 * c)); g.setAttribute("y2", r2(0.5 + 0.5 * s2));
    }
    GS.stops.slice().sort(function (x, y) { return x.o - y.o; }).forEach(function (st) {
      var so = document.createElementNS(SVGNS, "stop");
      so.setAttribute("offset", Math.min(100, Math.max(0, Math.round(st.o))) + "%");
      so.setAttribute("stop-color", st.c);
      if (st.op !== undefined && st.op < 1) { so.setAttribute("stop-opacity", String(r2(st.op))); }
      g.appendChild(so);
    });
    defs.appendChild(g);
    var ser = G().serGradient(GS);
    els.forEach(function (el) {
      el.setAttribute("fill", "url(#" + id + ")");
      el.setAttribute("data-vgrad", ser);
      el.removeAttribute("data-vsw");
    });
    changed();
  }
  function removeGradient() {
    var els = sel();
    if (!els.length || !ops()) { return; }
    els.forEach(function (el) {
      var ser = el.getAttribute("data-vgrad");
      var flat = "#ffffff";
      if (ser) {
        var pg = G().parseGradient(ser);
        if (pg.stops.length) { flat = pg.stops[0].c; }
      }
      el.setAttribute("fill", flat);
      el.removeAttribute("data-vgrad");
    });
    changed();
    toast("Gradient removed.");
  }
  function loadGradientFromSelection() {
    var els = sel();
    if (!els.length) { return; }
    var ser = els[0].getAttribute("data-vgrad");
    if (!ser) { return; }
    var pg = G().parseGradient(ser);
    if (!pg.stops.length) { return; }
    GS = { type: pg.type, angle: pg.angle, stops: pg.stops, sel: 0 };
    renderGradBar();
    renderGradStopEditor();
    if (GR2.typeSeg) { GR2.typeSeg.set(GS.type); }
    if (GR2.angle) { GR2.angle.value = String(Math.round(GS.angle)); }
    if (GR2.angleVal) { GR2.angleVal.textContent = Math.round(GS.angle) + " deg"; }
    if (GR2.angleRow) { GR2.angleRow.style.display = GS.type === "linear" ? "" : "none"; }
  }
  function renderGradBar() {
    var bar = GR2.bar;
    if (!bar) { return; }
    bar.style.background = cssForStops(GS.stops);
    var thumbs = bar.querySelectorAll(".ve-gstop");
    Array.prototype.forEach.call(thumbs, function (t) { t.remove(); });
    GS.stops.forEach(function (st, i) {
      var th = h("span", "ve-gstop" + (i === GS.sel ? " sel" : ""));
      th.style.left = Math.min(100, Math.max(0, st.o)) + "%";
      th.style.background = hexA(st.c, st.op);
      th.title = "Stop " + (i + 1) + ": " + Math.round(st.o) + "%";
      th.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        e.preventDefault();
        GS.sel = i;
        renderGradBar(); renderGradStopEditor();
        if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
        var rect = bar.getBoundingClientRect();
        function mv(ev) {
          var o = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100;
          st.o = Math.min(100, Math.max(0, Math.round(o)));
          renderGradBar();
          var ed = GR2.stopOff;
          if (ed) { ed.value = String(Math.round(st.o)); }
          applyGradient();
        }
        function up() {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
          changed();
        }
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
      });
      bar.appendChild(th);
    });
  }
  function renderGradStopEditor() {
    var host = GR2.stopEd;
    if (!host) { return; }
    host.innerHTML = "";
    var st = GS.stops[GS.sel];
    if (!st) {
      host.appendChild(h("div", "vp-hint", "Select a stop on the bar, or click the bar to add one."));
      return;
    }
    var row = h("div", "vp-row");
    var col = document.createElement("input");
    col.type = "color"; col.className = "vp-color"; col.value = st.c; col.title = "Stop color";
    col.addEventListener("input", function () { st.c = col.value; renderGradBar(); applyGradient(); });
    GR2.stopOff = numInput(0, 100, 1, Math.round(st.o));
    GR2.stopOff.title = "Stop position percent";
    GR2.stopOff.addEventListener("input", function () {
      st.o = Math.min(100, Math.max(0, parseFloat(GR2.stopOff.value) || 0));
      renderGradBar(); applyGradient();
    });
    var opR = document.createElement("input");
    opR.type = "range"; opR.className = "vp-range"; opR.min = "0"; opR.max = "1"; opR.step = "0.01";
    opR.value = String(st.op === undefined ? 1 : st.op);
    opR.title = "Stop opacity";
    var opV = h("span", "vp-val", Math.round((st.op === undefined ? 1 : st.op) * 100) + "%");
    opR.addEventListener("input", function () {
      st.op = parseFloat(opR.value);
      opV.textContent = Math.round(st.op * 100) + "%";
      renderGradBar(); applyGradient();
    });
    var del = btn("Delete", "vp-btn ghost", "Delete this stop");
    del.addEventListener("click", function () {
      if (GS.stops.length <= 2) { toast("A gradient needs at least two stops.", "error"); return; }
      GS.stops.splice(GS.sel, 1);
      GS.sel = Math.max(0, GS.sel - 1);
      renderGradBar(); renderGradStopEditor(); applyGradient();
    });
    row.appendChild(col); row.appendChild(GR2.stopOff);
    host.appendChild(row);
    var row2 = h("div", "vp-row");
    var lab = h("label", "vp-field");
    lab.appendChild(h("span", "vp-flab", "Opacity"));
    lab.appendChild(opR);
    row2.appendChild(lab); row2.appendChild(opV);
    host.appendChild(row2);
    host.appendChild(del);
  }
  function buildGradientPanel() {
    var p = makePanel("vac-gradient", "Gradient"), b = p._body;
    GR2.typeSeg = seg2(
      [{ v: "linear", t: "Linear" }, { v: "radial", t: "Radial" }],
      GS.type,
      function (v) {
        GS.type = v;
        GR2.angleRow.style.display = v === "linear" ? "" : "none";
        applyGradient();
      });
    b.appendChild(GR2.typeSeg);
    GR2.angleRow = h("div", "vp-row");
    GR2.angle = document.createElement("input");
    GR2.angle.type = "range"; GR2.angle.className = "vp-range";
    GR2.angle.min = "-180"; GR2.angle.max = "180"; GR2.angle.step = "1"; GR2.angle.value = "0";
    GR2.angleVal = h("span", "vp-val", "0 deg");
    var alab = h("label", "vp-field");
    alab.appendChild(h("span", "vp-flab", "Angle"));
    alab.appendChild(GR2.angle);
    GR2.angleRow.appendChild(alab); GR2.angleRow.appendChild(GR2.angleVal);
    GR2.angle.addEventListener("input", function () {
      GS.angle = parseFloat(GR2.angle.value) || 0;
      GR2.angleVal.textContent = Math.round(GS.angle) + " deg";
      applyGradient();
    });
    b.appendChild(GR2.angleRow);
    GR2.bar = h("div", "ve-gbar");
    GR2.bar.title = "Click to add a stop, drag stops to move them";
    GR2.bar.addEventListener("pointerdown", function (e) {
      if (e.target !== GR2.bar) { return; }
      var rect = GR2.bar.getBoundingClientRect();
      var o = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      if (GS.stops.length >= 8) { toast("Eight stops is the most for now.", "error"); return; }
      if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
      GS.stops.push({ o: Math.round(o), c: "#ffffff", op: 1 });
      GS.stops.sort(function (a, b2) { return a.o - b2.o; });
      GS.sel = GS.stops.length - 1;
      renderGradBar(); renderGradStopEditor(); applyGradient();
    });
    b.appendChild(GR2.bar);
    GR2.stopEd = h("div", "ve-gstop-ed");
    b.appendChild(GR2.stopEd);
    var row = h("div", "vp-row");
    var apply = btn("Apply", "vp-btn primary", "Apply this gradient to the selection");
    apply.addEventListener("click", function () {
      if (!sel().length) { toast("Select a shape first.", "error"); return; }
      if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
      applyGradient();
    });
    var clear = btn("Remove", "vp-btn ghost", "Remove the gradient from the selection");
    clear.addEventListener("click", removeGradient);
    row.appendChild(apply); row.appendChild(clear);
    b.appendChild(row);
    renderGradBar();
    renderGradStopEditor();
    return p;
  }
  /* Segmented control (local copy so this module does not depend on panels.js). */
  function seg2(options, current, onPick) {
    var w = h("div", "vp-seg");
    options.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.title = o.t;
      b.setAttribute("data-v", o.v);
      b.innerHTML = "<span>" + esc(o.t) + "</span>";
      if (String(o.v) === String(current)) { b.classList.add("active"); }
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

  /* ================= GLOBAL SWATCHES ================= */
  /* A global swatch is one linearGradient with two identical stops. Editing
     the swatch rewrites the stop colors, so every shape filled with
     url(#vgsw-<id>) updates instantly. The url() reference on the fill IS
     the stored swatch-id reference. */
  var swatches = [];
  var swTarget = "fill";
  var SW_DEFAULTS = [
    { name: "Acid Lime", color: "#84CC16" },
    { name: "Ink", color: "#1a1a1a" },
    { name: "Paper", color: "#ffffff" },
    { name: "Sky", color: "#31A8FF" },
    { name: "Ember", color: "#FF5A1F" }
  ];
  var SWP = {};
  function loadSwatches() {
    var arr = null;
    try { arr = T.store ? T.store.get("vac", "swatches") : null; } catch (e) { arr = null; }
    if (Array.isArray(arr) && arr.length) {
      swatches = arr.filter(function (s) { return s && s.id && s.color; });
    } else {
      swatches = SW_DEFAULTS.map(function (d, i) {
        return { id: "sw" + (i + 1), name: d.name, color: d.color };
      });
    }
  }
  function saveSwatches() {
    try { if (T.store) { T.store.set("vac", "swatches", JSON.parse(JSON.stringify(swatches))); } } catch (e) {}
  }
  function swatchId(s) { return "vgsw-" + s.id; }
  function ensureSwatchDefs() {
    var defs = gradDefs();
    if (!defs) { return; }
    swatches.forEach(function (s) {
      var id = swatchId(s);
      var g = defs.querySelector('[id="' + id + '"]');
      if (!g) {
        g = document.createElementNS(SVGNS, "linearGradient");
        g.setAttribute("id", id);
        var s1 = document.createElementNS(SVGNS, "stop");
        s1.setAttribute("offset", "0%");
        var s2 = document.createElementNS(SVGNS, "stop");
        s2.setAttribute("offset", "100%");
        g.appendChild(s1); g.appendChild(s2);
        defs.appendChild(g);
      }
      Array.prototype.forEach.call(g.querySelectorAll("stop"), function (st) {
        st.setAttribute("stop-color", s.color);
      });
    });
  }
  function applySwatch(s) {
    var els = sel();
    if (!els.length) { toast("Select a shape first.", "error"); return; }
    if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
    ensureSwatchDefs();
    var url = "url(#" + swatchId(s) + ")";
    els.forEach(function (el) {
      el.setAttribute(swTarget, url);
      el.setAttribute("data-vsw", s.id);
      if (swTarget === "fill") { el.removeAttribute("data-vgrad"); }
    });
    changed();
    toast("Swatch applied to " + swTarget + ".");
  }
  function buildSwatchesPanel() {
    var p = makePanel("vac-swatches", "Swatches"), b = p._body;
    var trow = h("div", "vp-row");
    SWP.tgt = seg2([{ v: "fill", t: "Fill" }, { v: "stroke", t: "Stroke" }], swTarget, function (v) { swTarget = v; });
    trow.appendChild(SWP.tgt);
    b.appendChild(trow);
    SWP.grid = h("div", "ve-swgrid");
    b.appendChild(SWP.grid);
    var addRow = h("div", "vp-row");
    var add = btn("New swatch", "vp-btn", "Add a swatch from the current fill color");
    add.addEventListener("click", function () {
      var c = (T.vac.paint && T.vac.paint.fill) || "#84CC16";
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) { c = "#84CC16"; }
      swatches.push({ id: "sw" + Date.now().toString(36), name: "Swatch " + (swatches.length + 1), color: c });
      saveSwatches(); ensureSwatchDefs(); renderSwatches();
    });
    addRow.appendChild(add);
    b.appendChild(addRow);
    b.appendChild(h("div", "vp-hint", "Global swatches: editing a swatch color updates every shape that uses it."));
    renderSwatches();
    return p;
  }
  function renderSwatches() {
    if (!SWP.grid) { return; }
    SWP.grid.innerHTML = "";
    swatches.forEach(function (s) {
      var cell = h("div", "ve-swcell");
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "ve-swatch";
      chip.style.background = s.color;
      chip.title = "Apply " + s.name + " (" + s.color + ") to selection " + swTarget;
      chip.setAttribute("aria-label", "Apply swatch " + s.name);
      chip.addEventListener("click", function () { applySwatch(s); });
      var col = document.createElement("input");
      col.type = "color"; col.className = "vp-color ve-swedit"; col.value = s.color;
      col.title = "Edit swatch color (updates every shape using it)";
      col.addEventListener("input", function () {
        s.color = col.value;
        chip.style.background = s.color;
        saveSwatches();
        ensureSwatchDefs();
        changed();
      });
      var nm = h("span", "ve-swname", esc(s.name));
      nm.title = "Double-click to rename";
      nm.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var inp = document.createElement("input");
        inp.type = "text"; inp.className = "vp-text"; inp.value = s.name;
        nm.replaceWith(inp);
        inp.focus(); inp.select();
        var done = false;
        function commit(ok) {
          if (done) { return; } done = true;
          if (ok && inp.value.trim()) { s.name = inp.value.trim(); saveSwatches(); }
          renderSwatches();
        }
        inp.addEventListener("keydown", function (ev) {
          ev.stopPropagation();
          if (ev.key === "Enter") { commit(true); } else if (ev.key === "Escape") { commit(false); }
        });
        inp.addEventListener("blur", function () { commit(true); });
      });
      var del = document.createElement("button");
      del.type = "button"; del.className = "vp-icobtn danger"; del.title = "Delete swatch (shapes keep the flat color)";
      del.innerHTML = T.icon("i-x");
      del.addEventListener("click", function () {
        var id = swatchId(s);
        if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
        T.vac.layers().forEach(function (layer) {
          Array.prototype.forEach.call(layer.querySelectorAll('[data-vsw="' + s.id + '"]'), function (el) {
            el.setAttribute("fill", s.color);
            el.removeAttribute("data-vsw");
          });
        });
        var defs = gradDefs();
        var g = defs && defs.querySelector('[id="' + id + '"]');
        if (g) { g.remove(); }
        swatches = swatches.filter(function (x) { return x.id !== s.id; });
        saveSwatches();
        renderSwatches();
        changed();
      });
      cell.appendChild(chip); cell.appendChild(col); cell.appendChild(nm); cell.appendChild(del);
      SWP.grid.appendChild(cell);
    });
  }

  /* ================= IMAGE TRACE ================= */
  /* Real marching-squares (potrace-style) contour tracing. Upload a raster
     file or paste one from the clipboard; the threshold slider and blur
     pre-process feed T.vacGeom.traceBitmap; the result is a genuine SVG
     path. "Expand" commits the preview into a normal editable path. */
  var traceState = { gray: null, w: 0, h: 0, threshold: 128, blur: 0, busy: false };
  var TRP = {};
  function traceStatus(msg) {
    if (TRP.status) { TRP.status.textContent = msg; }
  }
  function setTraceSource(gray, w, h, label) {
    traceState.gray = gray; traceState.w = w; traceState.h = h;
    traceStatus("Loaded " + label + " (" + w + " x " + h + "). Adjust and press Trace.");
    runTrace();
  }
  function imageToGray(img, label) {
    var w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height;
    if (!w || !hh) { toast("Could not read that image.", "error"); return; }
    var scale = 1;
    if (w * hh > 1500000) { scale = Math.sqrt(1500000 / (w * hh)); }
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(hh * scale));
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) { toast("Canvas is not available.", "error"); return; }
    ctx.drawImage(img, 0, 0, cw, ch);
    var d;
    try { d = ctx.getImageData(0, 0, cw, ch); } catch (e) { toast("Could not read image pixels.", "error"); return; }
    var gray = new Float64Array(cw * ch);
    for (var i = 0; i < cw * ch; i++) {
      gray[i] = 0.2126 * d.data[i * 4] + 0.7152 * d.data[i * 4 + 1] + 0.0722 * d.data[i * 4 + 2];
    }
    setTraceSource(gray, cw, ch, label + (scale < 1 ? " (downscaled for tracing)" : ""));
  }
  function runTrace() {
    if (traceState.busy) { return; }
    var g = G();
    if (!g || !traceState.gray) { return; }
    traceState.busy = true;
    traceStatus("Tracing...");
    setTimeout(function () {
      try {
        var gray = traceState.gray;
        if (traceState.blur > 0) { gray = g.boxBlur(gray, traceState.w, traceState.h, traceState.blur); }
        var t0 = Date.now();
        var loops = g.traceBitmap(gray, traceState.w, traceState.h, traceState.threshold);
        var d = g.traceToD(loops);
        var ms = Date.now() - t0;
        clearTracePreview(true);
        if (!d) {
          traceStatus("No contours found. Try a different threshold.");
          traceState.busy = false;
          return;
        }
        var sv = svg();
        if (!sv || !T.vac.activeLayer) { traceState.busy = false; return; }
        var ab = activeArtboard() || { x: 0, y: 0 };
        var path = document.createElementNS(SVGNS, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#ff3df0");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "6 3");
        path.setAttribute("transform", "translate(" + r2(ab.x) + " " + r2(ab.y) + ")");
        path.setAttribute("data-trace-preview", "1");
        T.vac.activeLayer().appendChild(path);
        traceStatus("Traced " + loops.length + " contour(s) in " + ms + " ms. Press Expand to make it editable artwork.");
        changed();
      } catch (e) {
        traceStatus("Trace failed: " + (e && e.message ? e.message : "unknown error"));
      }
      traceState.busy = false;
    }, 30);
  }
  function tracePreviewEl() {
    var sv = svg();
    return sv ? sv.querySelector("[data-trace-preview]") : null;
  }
  function clearTracePreview(silent) {
    var p = tracePreviewEl();
    if (p && p.parentNode) {
      p.parentNode.removeChild(p);
      if (!silent) { changed(); traceStatus("Preview cleared."); }
    }
  }
  function expandTrace() {
    var p = tracePreviewEl();
    if (!p) { toast("Trace an image first.", "error"); return; }
    if (T.vac && T.vac.checkpoint) { T.vac.checkpoint(); }
    p.removeAttribute("data-trace-preview");
    p.removeAttribute("stroke-dasharray");
    var paint = T.vac.paint || {};
    p.setAttribute("fill", paint.fill || "#1a1a1a");
    p.setAttribute("fill-rule", "evenodd");
    p.setAttribute("stroke", "none");
    p.removeAttribute("stroke-width");
    T.vac.select([p]);
    changed();
    traceStatus("Expanded to an editable vector path. Use the Direct Select tool to edit its nodes.");
    toast("Trace expanded to editable paths.");
  }
  function buildTracePanel() {
    var p = makePanel("vac-trace", "Image Trace"), b = p._body;
    var row = h("div", "vp-row");
    var up = btn("Upload image", "vp-btn", "Upload a raster image to trace");
    var file = document.createElement("input");
    file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.addEventListener("change", function () {
      if (!file.files || !file.files[0]) { return; }
      var img = new Image();
      img.onload = function () {
        imageToGray(img, file.files[0].name || "image");
        file.value = "";
      };
      img.onerror = function () { toast("Could not load that image.", "error"); file.value = ""; };
      img.src = (window.URL || window.webkitURL).createObjectURL(file.files[0]);
    });
    up.addEventListener("click", function () { file.click(); });
    var paste = btn("Paste", "vp-btn ghost", "Paste an image from the clipboard");
    paste.addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        toast("Clipboard image reading is not available in this browser.", "error");
        return;
      }
      navigator.clipboard.read().then(function (items) {
        var found = null;
        items.forEach(function (it) {
          (it.types || []).forEach(function (tp) {
            if (!found && tp.indexOf("image/") === 0) {
              found = it.getType(tp);
            }
          });
        });
        if (!found) { toast("No image on the clipboard.", "error"); return; }
        found.then(function (blob) {
          var img = new Image();
          img.onload = function () { imageToGray(img, "clipboard image"); };
          img.onerror = function () { toast("Could not load the pasted image.", "error"); };
          img.src = (window.URL || window.webkitURL).createObjectURL(blob);
        });
      }).catch(function () { toast("Clipboard read was denied.", "error"); });
    });
    row.appendChild(up); row.appendChild(paste); row.appendChild(file);
    b.appendChild(row);
    var trow = h("div", "vp-row");
    var tlab = h("label", "vp-field");
    tlab.appendChild(h("span", "vp-flab", "Threshold"));
    TRP.thr = document.createElement("input");
    TRP.thr.type = "range"; TRP.thr.className = "vp-range";
    TRP.thr.min = "1"; TRP.thr.max = "255"; TRP.thr.step = "1"; TRP.thr.value = "128";
    TRP.thrVal = h("span", "vp-val", "128");
    TRP.thr.addEventListener("input", function () {
      traceState.threshold = parseInt(TRP.thr.value, 10) || 128;
      TRP.thrVal.textContent = TRP.thr.value;
      runTrace();
    });
    tlab.appendChild(TRP.thr);
    trow.appendChild(tlab); trow.appendChild(TRP.thrVal);
    b.appendChild(trow);
    var brow = h("div", "vp-row");
    var blab = h("label", "vp-field");
    blab.appendChild(h("span", "vp-flab", "Blur"));
    TRP.blur = document.createElement("input");
    TRP.blur.type = "range"; TRP.blur.className = "vp-range";
    TRP.blur.min = "0"; TRP.blur.max = "5"; TRP.blur.step = "1"; TRP.blur.value = "0";
    TRP.blurVal = h("span", "vp-val", "0");
    TRP.blur.addEventListener("input", function () {
      traceState.blur = parseInt(TRP.blur.value, 10) || 0;
      TRP.blurVal.textContent = TRP.blur.value;
      runTrace();
    });
    blab.appendChild(TRP.blur);
    brow.appendChild(blab); brow.appendChild(TRP.blurVal);
    b.appendChild(brow);
    var arow = h("div", "vp-row");
    var trace = btn("Trace", "vp-btn primary", "Run the trace on the loaded image");
    trace.addEventListener("click", function () {
      if (!traceState.gray) { toast("Upload or paste an image first.", "error"); return; }
      runTrace();
    });
    var expand = btn("Expand", "vp-btn", "Convert the trace preview into editable vector paths");
    expand.addEventListener("click", expandTrace);
    var clear = btn("Clear", "vp-btn ghost", "Remove the trace preview");
    clear.addEventListener("click", function () { clearTracePreview(false); });
    arow.appendChild(trace); arow.appendChild(expand); arow.appendChild(clear);
    b.appendChild(arow);
    TRP.status = h("div", "vp-hint", "Upload or paste a raster image to vectorize it.");
    b.appendChild(TRP.status);
    return p;
  }

  /* ================= VIEW MODES ================= */
  var outlineOn = false;
  var guidesOn = false;
  var VWP = {};
  function setOutline(on) {
    outlineOn = !!on;
    var sv = svg();
    if (sv) { sv.classList.toggle("v-outline", outlineOn); }
    if (VWP.olBtn) { VWP.olBtn.classList.toggle("active", outlineOn); }
    drawOutlineAnchors();
  }
  function outlineEnabled() { return outlineOn; }
  /* Anchor points of one element in its own local coords. */
  function anchorsOf(el) {
    var tag = (el.tagName || "").toLowerCase(), out = [];
    function n(k, d) { return parseFloat(el.getAttribute(k) || (d || 0)); }
    if (tag === "rect") {
      var x = n("x"), y = n("y"), w = n("width"), hh = n("height");
      out = [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + hh }, { x: x, y: y + hh }];
    } else if (tag === "ellipse" || tag === "circle") {
      var cx = n("cx"), cy = n("cy");
      var rx = tag === "circle" ? n("r") : n("rx"), ry = tag === "circle" ? n("r") : n("ry");
      out = [{ x: cx - rx, y: cy }, { x: cx + rx, y: cy }, { x: cx, y: cy - ry }, { x: cx, y: cy + ry }];
    } else if (tag === "polygon" || tag === "polyline") {
      var raw = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(parseFloat);
      for (var i = 0; i + 1 < raw.length; i += 2) {
        if (!isNaN(raw[i]) && !isNaN(raw[i + 1])) { out.push({ x: raw[i], y: raw[i + 1] }); }
      }
    } else if (tag === "line") {
      out = [{ x: n("x1"), y: n("y1") }, { x: n("x2"), y: n("y2") }];
    } else if (tag === "path") {
      var g = G();
      if (g) {
        g.parseD(el.getAttribute("d") || "").forEach(function (sg) {
          var pts = sg.pts;
          if (pts.length >= 2) { out.push({ x: pts[pts.length - 2], y: pts[pts.length - 1] }); }
        });
      }
    }
    return out;
  }
  function drawOutlineAnchors() {
    var X = T.vac._x;
    var ov = X.overlay();
    if (!ov) { return; }
    Array.prototype.forEach.call(ov.querySelectorAll("[data-ol-anchor]"), function (n) { n.remove(); });
    if (!outlineOn || !ops()) { return; }
    var m = ops().parseTransform, mp = T.vacOps.matPt;
    var zm = X.zoom(), s = 1 / zm, count = 0;
    T.vac.layers().forEach(function (layer) {
      Array.prototype.forEach.call(layer.querySelectorAll("rect,circle,ellipse,polygon,polyline,path,line"), function (el) {
        if (el.hasAttribute("data-trace-preview")) { return; }
        var tm = m(el.getAttribute("transform"));
        anchorsOf(el).forEach(function (a) {
          if (count > 3000) { return; }
          count++;
          var q = mp(tm, a.x, a.y);
          var r = document.createElementNS(SVGNS, "rect");
          r.setAttribute("x", r2(q.x - 2.5 * s)); r.setAttribute("y", r2(q.y - 2.5 * s));
          r.setAttribute("width", 5 * s); r.setAttribute("height", 5 * s);
          r.setAttribute("fill", "#ffffff");
          r.setAttribute("stroke", "#84CC16");
          r.setAttribute("stroke-width", 1.2 * s);
          r.setAttribute("data-ol-anchor", "1");
          r.setAttribute("pointer-events", "none");
          ov.appendChild(r);
        });
      });
    });
  }
  /* Smart guides: magenta snap lines while dragging. */
  function collectLeafBoxes(root, out, skipSet) {
    var O = ops();
    if (!O) { return; }
    Array.prototype.forEach.call(root.childNodes, function (n) {
      if (n.nodeType !== 1) { return; }
      var tag = (n.tagName || "").toLowerCase();
      if (tag === "g") { collectLeafBoxes(n, out, skipSet); return; }
      if (skipSet && skipSet.indexOf(n) >= 0) { return; }
      if (n.hasAttribute("data-trace-preview")) { return; }
      var b = null;
      try { b = O.visualBBox(n); } catch (e) { b = null; }
      if (b && b.w >= 0 && b.h >= 0) { out.push(b); }
    });
  }
  T.vacGuides = {
    enabled: function () { return guidesOn; },
    set: function (v) {
      guidesOn = !!v;
      if (VWP.gdBtn) { VWP.gdBtn.classList.toggle("active", guidesOn); }
      if (!guidesOn) { this.clear(); }
    },
    snapMove: function (els, dx, dy) {
      if (!guidesOn || !ops() || !G()) { return { dx: dx, dy: dy, guides: [] }; }
      var O = ops();
      var moving = els.map(function (el) {
        try { return O.visualBBox(el); } catch (e) { return null; }
      }).filter(Boolean);
      if (!moving.length) { return { dx: dx, dy: dy, guides: [] }; }
      var statics = [];
      T.vac.layers().forEach(function (layer) { collectLeafBoxes(layer, statics, els); });
      var zm = T.vac._x.zoom();
      return G().snapDeltas(moving, statics, dx, dy, 6 / zm);
    },
    draw: function (guides) {
      var X = T.vac._x, ov = X.overlay();
      if (!ov || !guides || !guides.length) { return; }
      this.clear();
      var s = 1 / X.zoom();
      var all = [];
      T.vac.layers().forEach(function (layer) { collectLeafBoxes(layer, all, []); });
      var u = G().unionOfBoxes(all) || { x: 0, y: 0, w: 800, h: 600 };
      guides.forEach(function (gd) {
        var ln = document.createElementNS(SVGNS, "line");
        if (gd.axis === "x") {
          ln.setAttribute("x1", gd.pos); ln.setAttribute("y1", u.y - 30);
          ln.setAttribute("x2", gd.pos); ln.setAttribute("y2", u.y + u.h + 30);
        } else {
          ln.setAttribute("x1", u.x - 30); ln.setAttribute("y1", gd.pos);
          ln.setAttribute("x2", u.x + u.w + 30); ln.setAttribute("y2", gd.pos);
        }
        ln.setAttribute("stroke", "#ff3df0");
        ln.setAttribute("stroke-width", 1 * s);
        ln.setAttribute("data-guide", "1");
        ln.setAttribute("pointer-events", "none");
        ov.appendChild(ln);
      });
    },
    clear: function () {
      var ov = T.vac._x.overlay();
      if (!ov) { return; }
      Array.prototype.forEach.call(ov.querySelectorAll("[data-guide]"), function (n) { n.remove(); });
    }
  };
  function buildViewPanel() {
    var p = makePanel("vac-view", "View"), b = p._body;
    var row = h("div", "vp-row");
    VWP.olBtn = btn("Outline", "vp-btn", "Outline mode: 1px wireframes with anchors, fills hidden");
    VWP.olBtn.classList.toggle("active", outlineOn);
    VWP.olBtn.addEventListener("click", function () { setOutline(!outlineOn); });
    VWP.gdBtn = btn("Smart Guides", "vp-btn", "Magenta snap lines when dragging near other objects");
    VWP.gdBtn.classList.toggle("active", guidesOn);
    VWP.gdBtn.addEventListener("click", function () { T.vacGuides.set(!guidesOn); });
    row.appendChild(VWP.olBtn); row.appendChild(VWP.gdBtn);
    b.appendChild(row);
    b.appendChild(h("div", "vp-hint", "Outline hides fills and strokes as thin wireframes. Smart Guides snap dragged shapes to nearby edges and centers."));
    return p;
  }

  /* ================= EXPORT ================= */
  function fillOf(el) {
    var f = el.getAttribute("fill");
    if (!f || f === "none") { return null; }
    if (f.indexOf("url(") === 0) {
      var m = /url\(#([^)]+)\)/.exec(f);
      if (m) {
        var sv = svg();
        var gr = sv && sv.querySelector('[id="' + m[1] + '"]');
        if (gr) {
          var stop = gr.querySelector("stop");
          if (stop) { return stop.getAttribute("stop-color") || "#808080"; }
        }
      }
      return "#808080";
    }
    return f;
  }
  /* Flatten artwork of the active artboard into export shapes, translated to
     artboard-local coords. Group transforms are composed (unlike the
     pathfinder fast path, which documents ignoring them). */
  function shapesForExport(ab) {
    var O = ops(), g = G();
    var out = [];
    if (!O || !g) { return out; }
    var parseT = O.parseTransform, matMul = null;
    function matMul2(a, b) {
      return [
        a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
      ];
    }
    function walk(node, acc) {
      Array.prototype.forEach.call(node.childNodes, function (el) {
        if (el.nodeType !== 1) { return; }
        if (el.hasAttribute("data-trace-preview")) { return; }
        var tag = (el.tagName || "").toLowerCase();
        var m = matMul2(acc, parseT(el.getAttribute("transform")));
        if (tag === "g") { walk(el, m); return; }
        if (tag === "text") {
          var tx = parseFloat(el.getAttribute("x") || 0), ty = parseFloat(el.getAttribute("y") || 0);
          var p0 = O.matPt(m, tx, ty);
          out.push({ texts: [{ x: r2(p0.x - ab.x), y: r2(p0.y - ab.y), size: parseFloat(el.getAttribute("font-size") || 16), str: el.textContent || "", fill: fillOf(el) || "#000000" }] });
          return;
        }
        var poly = null;
        try { poly = O.shapeToPolygon(el); } catch (e) { poly = null; }
        if (!poly || !poly.length) { return; }
        var loop = poly.map(function (pt) {
          var q = O.matPt(m, pt.x, pt.y);
          return { x: r2(q.x - ab.x), y: r2(q.y - ab.y) };
        });
        out.push({
          loops: [loop],
          fill: fillOf(el),
          stroke: el.getAttribute("stroke") && el.getAttribute("stroke") !== "none" ? el.getAttribute("stroke") : null,
          sw: parseFloat(el.getAttribute("stroke-width") || 1),
          opacity: parseFloat(el.getAttribute("opacity") || 1)
        });
      });
    }
    T.vac.layers().forEach(function (layer) { walk(layer, [1, 0, 0, 1, 0, 0]); });
    return out;
  }
  function exportFileName(ext, scale) {
    var ab = activeArtboard();
    var base = (ab ? ab.name : "artboard").replace(/[^\w\-]+/g, "-").toLowerCase() || "artboard";
    return base + (scale && scale > 1 ? "@" + scale + "x" : "") + "." + ext;
  }
  function doExportSVG() {
    var ab = activeArtboard();
    if (!ab) { toast("No artboard.", "error"); return; }
    download(new Blob([artboardSVG(ab)], { type: "image/svg+xml" }), exportFileName("svg"));
    toast("SVG exported for " + ab.name + ".");
  }
  function doExportPNG(scale) {
    var ab = activeArtboard();
    if (!ab) { toast("No artboard.", "error"); return; }
    var box = G().artboardExportBox(ab);
    var str = artboardSVG(ab);
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement("canvas");
        c.width = Math.max(1, box.w * scale);
        c.height = Math.max(1, box.h * scale);
        var ctx = c.getContext("2d");
        if (!ctx) { toast("Canvas is not available.", "error"); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b2) {
          if (b2) { download(b2, exportFileName("png", scale)); toast("PNG exported at " + scale + "x."); }
          else { toast("PNG rasterization failed.", "error"); }
        }, "image/png");
      } catch (e) { toast("PNG rasterization failed.", "error"); }
    };
    img.onerror = function () { toast("PNG rasterization failed.", "error"); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
  }
  function doExportPDF() {
    var ab = activeArtboard(), g = G();
    if (!ab || !g) { toast("No artboard.", "error"); return; }
    var box = g.artboardExportBox(ab);
    var pdf = g.buildPdf(box.w, box.h, shapesForExport(ab));
    download(new Blob([pdf], { type: "application/pdf" }), exportFileName("pdf"));
    toast("PDF exported for " + ab.name + ". Curves are flattened polylines.");
  }
  function doExportEPS() {
    var ab = activeArtboard(), g = G();
    if (!ab || !g) { toast("No artboard.", "error"); return; }
    var box = g.artboardExportBox(ab);
    var eps = g.buildEps(box.w, box.h, shapesForExport(ab));
    download(new Blob([eps], { type: "application/postscript" }), exportFileName("eps"));
    toast("EPS wrapper exported for " + ab.name + ".");
  }
  /* ---- publish bridges ---- */
  function publishTXT() {
    if (!T.store || typeof T.store.emit !== "function") { toast("Word bridge is not ready yet.", "error"); return; }
    var ab = activeArtboard();
    var id = T.vac._vid || ("v" + Date.now());
    T.vac._vid = id;
    try {
      T.store.emit("txt:insert-svg", { id: id, svg: artboardSVG(ab) });
      toast("Artboard sent to the TXT document.");
    } catch (e) { toast("Could not send artwork.", "error"); }
  }
  function publishDCK() {
    if (!T.dck || typeof T.dck.insertBlock !== "function") { toast("DCK is not ready yet.", "error"); return; }
    try {
      var deck = null;
      if (typeof T.dck.currentDeck === "function") { deck = T.dck.currentDeck(); }
      if (!deck && typeof T.dck.newDeck === "function") {
        deck = T.dck.newDeck("Vector artwork");
        toast("Created a new deck for the artwork.");
      }
      var src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(artboardSVG(activeArtboard()));
      var b = T.dck.insertBlock("image", { src: src });
      if (b) { toast("Artboard inserted into the DCK slide."); }
      else { toast("Could not insert into DCK.", "error"); }
    } catch (e) { toast("Could not insert into DCK.", "error"); }
  }
  function publishPDF() {
    if (!T.pdf || typeof T.pdf.importFile !== "function") { toast("The PDF app is not ready yet.", "error"); return; }
    try {
      var ab = activeArtboard();
      var name = (ab ? ab.name : "artwork").replace(/[^\w\- ]+/g, "").trim() || "artwork";
      var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + esc(name) +
        "</title></head><body><h1>" + esc(name) + "</h1>" + artboardSVG(ab) + "</body></html>";
      var file = new File([html], name + ".html", { type: "text/html" });
      T.pdf.importFile(file).then(function (ok) {
        if (ok) { toast("Artboard opened as a document in the PDF app."); }
        else { toast("The PDF app could not open it.", "error"); }
      });
    } catch (e) { toast("Could not send to the PDF app.", "error"); }
  }
  function buildExportPanel() {
    var p = makePanel("vac-export", "Export and Publish"), b = p._body;
    var lab = h("div", "vp-hint", "Exports use the active artboard bounds.");
    b.appendChild(lab);
    var grid = h("div", "vp-grid2");
    [["SVG", doExportSVG, "Download the artboard as a standalone SVG file"],
     ["PNG 1x", function () { doExportPNG(1); }, "Transparent PNG at artboard size"],
     ["PNG 2x", function () { doExportPNG(2); }, "Transparent PNG at double size"],
     ["PNG 4x", function () { doExportPNG(4); }, "Transparent PNG at quadruple size"],
     ["PDF", doExportPDF, "Vector PDF. Curves are exported as flattened polylines"],
     ["EPS (wrapper)", doExportEPS, "Genuine EPS wrapper with vector path ops, not a native .ai file"]
    ].forEach(function (d) {
      var x = btn(d[0], "vp-btn", d[2]);
      x.addEventListener("click", d[1]);
      grid.appendChild(x);
    });
    b.appendChild(grid);
    b.appendChild(h("div", "vp-glab", "Publish"));
    var prow = h("div", "vp-row");
    [["Send to TXT", publishTXT, "Push this artboard into the TXT document as an editable figure"],
     ["Send to DCK", publishDCK, "Insert this artboard as an image block on the current DCK slide"],
     ["Send to PDF", publishPDF, "Open this artboard as a document in the PDF app"]
    ].forEach(function (d) {
      var x = btn(d[0], "vp-btn", d[2]);
      x.addEventListener("click", d[1]);
      prow.appendChild(x);
    });
    b.appendChild(prow);
    return p;
  }

  /* ================= ISOLATION MODE ================= */
  /* Double-click a group in the Layers panel to isolate it: everything else
     dims, a breadcrumb offers the exit. */
  var isolatedGroup = null;
  var dimmed = [];
  function setIsolation(g) {
    exitIsolation(true);
    if (!g || !g.parentNode) { return; }
    isolatedGroup = g;
    dimmed = [];
    T.vac.layers().forEach(function (layer) {
      if (layer.contains(g)) {
        Array.prototype.forEach.call(layer.childNodes, function (n) {
          if (n.nodeType !== 1) { return; }
          if (n === g || n.contains(g)) { return; }
          dimmed.push({ el: n, op: n.style.opacity || "" });
          n.style.opacity = "0.12";
        });
      } else {
        dimmed.push({ el: layer, op: layer.style.opacity || "" });
        layer.style.opacity = "0.12";
      }
    });
    changed();
  }
  function exitIsolation(silent) {
    dimmed.forEach(function (d) {
      if (d.op) { d.el.style.opacity = d.op; } else { d.el.style.removeProperty("opacity"); }
    });
    dimmed = [];
    isolatedGroup = null;
    if (!silent) { changed(); }
  }
  function getIsolated() { return isolatedGroup; }

  /* ================= MOUNT ================= */
  var mounted = false;
  var showWrapped = false;
  function mount() {
    if (!T.vac || !T.vacOps || !G()) { return false; }
    /* Build the view FIRST. T.vac.svgEl() runs buildView(), which sets
       view.innerHTML and therefore destroys and recreates #vPanels. Any
       engine panels appended before this point would be wiped (this bit us
       during boot: mount() appended panels, then ensureSwatchDefs() called
       svg() -> svgEl() -> buildView() and the fresh #vPanels lost them).
       After this call built=true, so later svgEl() calls are no-ops. */
    try { T.vac.svgEl(); } catch (e) { return false; }
    var host = document.getElementById("vPanels");
    if (!host || host.getAttribute("data-vp") !== "1") { return false; }
    if (host.getAttribute("data-ve") === "1") { mounted = true; return true; }
    host.setAttribute("data-ve", "1");
    /* The stock gradient panel is superseded by the pro builder below. */
    var oldGrad = host.querySelector('.vp-panel[data-p="gradient"]');
    if (oldGrad) { oldGrad.style.display = "none"; }
    loadSwatches(); // populate before buildSwatchesPanel() renders
    host.appendChild(buildArtboardsPanel());
    host.appendChild(buildGradientPanel());
    host.appendChild(buildSwatchesPanel());
    host.appendChild(buildTracePanel());
    host.appendChild(buildViewPanel());
    host.appendChild(buildExportPanel());
    wrapGetSet();
    wrapShow();
    T.bus.on("vac:selection", function () {
      loadGradientFromSelection();
      drawOutlineAnchors();
    });
    T.bus.on("vac:change", function () {
      drawOutlineAnchors();
    });
    ensureArtboards();
    ensureSwatchDefs();
    mounted = true;
    return true;
  }
  function wrapShow() {
    if (showWrapped || !T.vac) { return; }
    showWrapped = true;
    var _show = T.vac.show;
    T.vac.show = function () {
      _show();
      try {
        ensureArtboards();
        ensureSwatchDefs();
        wireArtboardDrag();
        if (outlineOn) { setOutline(true); }
      } catch (e) { /* engine extras must never break opening the studio */ }
    };
  }
  function tryMountSoon() {
    if (mount()) { return; }
    var host = document.getElementById("vPanels");
    if (host) {
      var mo = new MutationObserver(function () { if (mount()) { mo.disconnect(); } });
      mo.observe(host, { attributes: true, attributeFilter: ["data-vp"] });
    }
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (mount() || tries > 60) { clearInterval(timer); }
    }, 250);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryMountSoon);
  } else {
    tryMountSoon();
  }

  /* ================= public API ================= */
  T.vacEngine = {
    mount: mount,
    artboards: function () {
      return artboards.map(function (a) { return { id: a.id, name: a.name, x: a.x, y: a.y, w: a.w, h: a.h }; });
    },
    activeArtboard: activeArtboard,
    setActiveArtboard: setActiveAb,
    addArtboard: addArtboard,
    duplicateArtboard: duplicateArtboard,
    deleteArtboard: deleteArtboard,
    undoArtboards: undoArtboards,
    fitAllArtboards: fitAllArtboards,
    exportArtboardSVG: artboardSVG,
    shapesForExport: shapesForExport,
    setOutline: setOutline,
    outlineEnabled: outlineEnabled,
    isolate: setIsolation,
    exitIsolation: exitIsolation,
    isolated: getIsolated,
    applySwatch: applySwatch,
    setGradient: function (spec) {
      var p = G() && G().parseGradient(spec);
      if (p) { GS = p; renderGradBar(); renderGradStopEditor(); }
    },
    applyGradient: applyGradient,
    swatches: function () { return swatches.slice(); },
    ensureSwatchDefs: ensureSwatchDefs,
    expandTrace: expandTrace,
    clearTracePreview: function () { clearTracePreview(false); }
  };
})();
