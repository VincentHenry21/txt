/* TXT Pixel Studio: histogram, adjustments, curves/levels, filters.
   Panels inside #pPanels (created here if the shell worker has not run yet).
   All edits apply to the ACTIVE layer with instant preview from a per-session
   backup snapshot; Apply keeps the result, Reset/Cancel restores the backup.
   Every control performs real ImageData pixel math. No emojis, no alert().
   Bus in: pixel:change, pixel:select, pixel:layers (refresh histogram). */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  function px() { return T.pixel || null; }
  function activeLayer() { var p = px(); return p ? p.activeLayer() : null; }
  function composite() {
    var p = px(); if (!p) return;
    try { p.composite(); } catch (e) {}
    T.bus.emit("pixel:change");
  }
  function ensurePanels() {
    var view = document.getElementById("view-pixel");
    if (!view) {
      view = document.createElement("section");
      view.id = "view-pixel"; view.className = "view hidden";
      var views = document.getElementById("views");
      if (views) views.appendChild(view); else document.body.appendChild(view);
    }
    var panels = document.getElementById("pPanels");
    if (!panels) { panels = document.createElement("div"); panels.id = "pPanels"; view.appendChild(panels); }
    return panels;
  }
  function guard() {
    var L = activeLayer();
    if (!px() || !L) { T.toast("No active layer", "error"); return null; }
    if (L.locked) { T.toast("Active layer is locked", "error"); return null; }
    if (!L.canvas || !L.canvas.width) { T.toast("Layer has no pixels", "error"); return null; }
    return L;
  }

  /* ---------------- edit session (backup snapshot) ---------------- */
  var ses = { layerId: null, data: null, w: 0, h: 0 };
  function beginSession(L) {
    if (ses.data && ses.layerId === L.id) return true;
    try {
      var c = L.canvas.getContext("2d");
      ses.data = c.getImageData(0, 0, L.canvas.width, L.canvas.height);
      ses.w = L.canvas.width; ses.h = L.canvas.height; ses.layerId = L.id;
      return true;
    } catch (e) { T.toast("Cannot read layer pixels", "error"); return false; }
  }
  function endSession(keep) {
    var L = activeLayer();
    if (!keep && ses.data && L && L.id === ses.layerId) {
      try { L.canvas.getContext("2d").putImageData(ses.data, 0, 0); } catch (e) {}
      composite();
    }
    ses.data = null; ses.layerId = null;
  }
  /* Restore a fresh copy of the backup, run fn(ImageData), push to canvas. */
  function previewRun(fn) {
    var L = activeLayer();
    if (!L || !ses.data || ses.layerId !== L.id) return;
    var img = new window.ImageData(new Uint8ClampedArray(ses.data.data), ses.w, ses.h);
    fn(img);
    try { L.canvas.getContext("2d").putImageData(img, 0, 0); } catch (e) {}
    composite();
  }

  /* ---------------- small UI helpers ---------------- */
  function sliderRow(label, min, max, step, val, onInput) {
    var row = document.createElement("div");
    row.className = "px-srow";
    var lb = document.createElement("span"); lb.className = "px-slab"; lb.textContent = label;
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(val);
    var vv = document.createElement("span"); vv.className = "px-sval"; vv.textContent = String(val);
    inp.addEventListener("input", function () { vv.textContent = inp.value; onInput(parseFloat(inp.value)); });
    row.appendChild(lb); row.appendChild(inp); row.appendChild(vv);
    row._set = function (v) { inp.value = String(v); vv.textContent = String(v); };
    return row;
  }
  function panelShell(title) {
    var d = document.createElement("div");
    d.className = "px-panel";
    d.innerHTML = '<div class="px-phead"><span>' + T.esc(title) + "</span></div>";
    return d;
  }

  /* ================================================================
     HISTOGRAM + readout
     ================================================================ */
  var histCanvas = null, readEl = null, histTimer = null;

  function buildHistogram(host) {
    var p = panelShell("Histogram");
    histCanvas = document.createElement("canvas");
    histCanvas.className = "px-hist"; histCanvas.width = 232; histCanvas.height = 76;
    readEl = document.createElement("div");
    readEl.className = "px-read";
    readEl.innerHTML = '<span class="px-swatch"></span><span class="px-rtext">x --, y -- · R -- G -- B --</span>';
    p.appendChild(histCanvas); p.appendChild(readEl);
    host.appendChild(p);
    var wrap = document.getElementById("pCanvasWrap");
    if (wrap) wrap.addEventListener("mousemove", onCanvasHover);
  }
  function onCanvasHover(e) {
    var L = activeLayer();
    if (!L || !L.canvas || !readEl) return;
    var wrap = document.getElementById("pCanvasWrap");
    var r = wrap.getBoundingClientRect();
    var sx = L.canvas.width / Math.max(1, r.width), sy = L.canvas.height / Math.max(1, r.height);
    var x = Math.floor((e.clientX - r.left) * sx), y = Math.floor((e.clientY - r.top) * sy);
    if (x < 0 || y < 0 || x >= L.canvas.width || y >= L.canvas.height) return;
    var d;
    try { d = L.canvas.getContext("2d").getImageData(x, y, 1, 1).data; } catch (err) { return; }
    var sw = readEl.querySelector(".px-swatch");
    if (sw) sw.style.background = "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")";
    var tx = readEl.querySelector(".px-rtext");
    if (tx) tx.textContent = "x " + x + ", y " + y + " · R " + d[0] + " G " + d[1] + " B " + d[2];
  }
  function drawHistogram() {
    if (!histCanvas) return;
    var L = activeLayer();
    var x = histCanvas.getContext("2d");
    x.clearRect(0, 0, histCanvas.width, histCanvas.height);
    if (!L || !L.canvas || !L.canvas.width) return;
    var w = L.canvas.width, h = L.canvas.height, d;
    try { d = L.canvas.getContext("2d").getImageData(0, 0, w, h).data; } catch (e) { return; }
    var rb = new Array(256).fill(0), gb = new Array(256).fill(0), bb = new Array(256).fill(0);
    var total = w * h, step = Math.max(1, Math.floor(total / 90000));
    for (var i = 0; i < total; i += step) {
      var o = i * 4;
      rb[d[o]]++; gb[d[o + 1]]++; bb[d[o + 2]]++;
    }
    var mx = 1, j;
    for (j = 0; j < 256; j++) { if (rb[j] > mx) mx = rb[j]; if (gb[j] > mx) mx = gb[j]; if (bb[j] > mx) mx = bb[j]; }
    function path(bins, color) {
      x.beginPath();
      x.moveTo(0, histCanvas.height);
      for (var k = 0; k < 256; k++) {
        var px2 = (k / 255) * histCanvas.width;
        var py = histCanvas.height - (bins[k] / mx) * (histCanvas.height - 6);
        x.lineTo(px2, py);
      }
      x.lineTo(histCanvas.width, histCanvas.height);
      x.closePath();
      x.fillStyle = color; x.fill();
    }
    path(rb, "rgba(255,80,80,0.55)");
    path(gb, "rgba(80,220,120,0.55)");
    path(bb, "rgba(90,140,255,0.55)");
  }
  function scheduleHist() {
    if (histTimer) clearTimeout(histTimer);
    histTimer = setTimeout(drawHistogram, 200);
  }

  /* ================================================================
     ADJUSTMENTS (single-pass pixel math)
     ================================================================ */
  var ADJ = { brightness: 0, contrast: 0, exposure: 0, hue: 0, saturation: 0, vibrance: 0, temperature: 0, sepia: 0, invert: 0 };
  var adjRows = [];

  function hueShift(r, g, b, deg) {
    var rad = deg * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
    var y = 0.299 * r + 0.587 * g + 0.114 * b;
    var i = 0.596 * r - 0.274 * g - 0.322 * b;
    var q = 0.211 * r - 0.523 * g + 0.312 * b;
    var i2 = i * co - q * si, q2 = i * si + q * co;
    return [y + 0.956 * i2 + 0.621 * q2, y - 0.272 * i2 - 0.647 * q2, y - 1.106 * i2 + 1.703 * q2];
  }
  function applyAdj(img, a) {
    var d = img.data, n = d.length;
    var br = a.brightness * 2.55;
    var cc = a.contrast * 2.55;
    var cf = (259 * (cc + 255)) / (255 * (259 - cc));
    var ex = Math.pow(2, a.exposure);
    var tp = a.temperature * 0.9;
    var st = 1 + a.saturation / 100;
    var vb = a.vibrance / 100;
    var sp = a.sepia / 100, iv = a.invert / 100;
    var doHue = a.hue !== 0;
    for (var i = 0; i < n; i += 4) {
      var r = d[i] + br, g = d[i + 1] + br, b = d[i + 2] + br;
      r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
      r *= ex; g *= ex; b *= ex;
      r += tp; b -= tp;
      var gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * st; g = gray + (g - gray) * st; b = gray + (b - gray) * st;
      if (vb !== 0) {
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        var vs = 1 + vb * (1 - (mx - mn) / 255);
        r = gray + (r - gray) * vs; g = gray + (g - gray) * vs; b = gray + (b - gray) * vs;
      }
      if (doHue) { var hs = hueShift(r, g, b, a.hue); r = hs[0]; g = hs[1]; b = hs[2]; }
      if (sp > 0) {
        var sr = 0.393 * r + 0.769 * g + 0.189 * b;
        var sg = 0.349 * r + 0.686 * g + 0.168 * b;
        var sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = r + (sr - r) * sp; g = g + (sg - g) * sp; b = b + (sb - b) * sp;
      }
      if (iv > 0) { r = r + ((255 - r) - r) * iv; g = g + ((255 - g) - g) * iv; b = b + ((255 - b) - b) * iv; }
      d[i] = r < 0 ? 0 : (r > 255 ? 255 : r);
      d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
      d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
    }
  }
  function adjPreview() {
    previewRun(function (img) { applyAdj(img, ADJ); });
  }
  function adjResetUI() {
    var keys = Object.keys(ADJ);
    for (var i = 0; i < keys.length; i++) { ADJ[keys[i]] = 0; if (adjRows[i]) adjRows[i]._set(0); }
  }
  function buildAdjust(host) {
    var p = panelShell("Adjustments");
    var defs = [
      ["brightness", "Brightness", -100, 100, 1], ["contrast", "Contrast", -100, 100, 1],
      ["exposure", "Exposure", -2, 2, 0.1], ["hue", "Hue", -180, 180, 1],
      ["saturation", "Saturation", -100, 100, 1], ["vibrance", "Vibrance", -100, 100, 1],
      ["temperature", "Temperature", -100, 100, 1], ["sepia", "Sepia", 0, 100, 1],
      ["invert", "Invert", 0, 100, 1]
    ];
    adjRows = [];
    defs.forEach(function (dd) {
      var row = sliderRow(dd[1], dd[2], dd[3], dd[4], 0, function (v) {
        var L = guard(); if (!L) return;
        if (!beginSession(L)) return;
        ADJ[dd[0]] = v;
        adjPreview();
      });
      adjRows.push(row); p.appendChild(row);
    });
    var bar = document.createElement("div");
    bar.className = "px-btnbar";
    var apply = document.createElement("button");
    apply.type = "button"; apply.className = "px-btn primary"; apply.textContent = "Apply";
    apply.addEventListener("click", function () { ses.data = null; ses.layerId = null; adjResetUI(); composite(); T.toast("Adjustments applied"); });
    var reset = document.createElement("button");
    reset.type = "button"; reset.className = "px-btn"; reset.textContent = "Reset";
    reset.addEventListener("click", function () { endSession(false); adjResetUI(); });
    bar.appendChild(apply); bar.appendChild(reset);
    p.appendChild(bar);
    host.appendChild(p);
  }

  /* ================================================================
     CURVES / LEVELS modal (custom overlay)
     ================================================================ */
  var overlay = null, overlayCleanup = null;

  function openOverlay(title) {
    closeOverlay();
    overlay = document.createElement("div");
    overlay.className = "px-overlay";
    overlay.innerHTML = '<div class="px-modal" role="dialog"><div class="px-mhead"><span>' + T.esc(title) + '</span>' +
      '<button type="button" class="px-ibtn" data-x="close" title="Close">' + T.icon("i-x") + "</button></div>" +
      '<div class="px-mbody"></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-x="close"]').addEventListener("click", closeOverlay);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeOverlay(); });
    function onKey(e) { if (e.key === "Escape") closeOverlay(); }
    document.addEventListener("keydown", onKey);
    var prevCleanup = overlayCleanup;
    overlayCleanup = function () {
      document.removeEventListener("keydown", onKey);
      if (prevCleanup) { try { prevCleanup(); } catch (e) {} }
      overlayCleanup = null;
    };
    return overlay.querySelector(".px-mbody");
  }
  function closeOverlay() {
    if (overlayCleanup) overlayCleanup();
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function defaultPts() { return [{ x: 0, y: 0 }, { x: 255, y: 255 }]; }
  function lutFromPts(pts) {
    var s = pts.slice().sort(function (a, b) { return a.x - b.x; });
    var lut = new Array(256), i, k = 0;
    for (i = 0; i < 256; i++) {
      while (k < s.length - 2 && i > s[k + 1].x) k++;
      var p0 = s[k], p1 = s[k + 1];
      if (i <= p0.x) lut[i] = p0.y;
      else if (i >= p1.x) lut[i] = p1.y;
      else lut[i] = p0.y + (p1.y - p0.y) * ((i - p0.x) / (p1.x - p0.x));
    }
    return lut;
  }

  function openCurves() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var chans = { rgb: defaultPts(), r: defaultPts(), g: defaultPts(), b: defaultPts() };
    var cur = "rgb";
    var body = openOverlay("Curves");
    var tabs = document.createElement("div"); tabs.className = "px-ctabs";
    ["rgb", "r", "g", "b"].forEach(function (c) {
      var b2 = document.createElement("button");
      b2.type = "button"; b2.className = "px-ctab" + (c === "rgb" ? " on" : "");
      b2.textContent = c === "rgb" ? "RGB" : c.toUpperCase();
      b2.addEventListener("click", function () {
        cur = c;
        $$(".px-ctab", tabs).forEach(function (t) { t.classList.remove("on"); });
        b2.classList.add("on"); draw();
      });
      tabs.appendChild(b2);
    });
    var cv = document.createElement("canvas");
    cv.width = 260; cv.height = 260; cv.className = "px-curve";
    var hint = document.createElement("div");
    hint.className = "px-hint"; hint.textContent = "Click to add a point, drag to move, double-click to remove.";
    body.appendChild(tabs); body.appendChild(cv); body.appendChild(hint);
    var bar = document.createElement("div"); bar.className = "px-btnbar";
    [["Apply", true], ["Reset", false]].forEach(function (bb) {
      var b2 = document.createElement("button");
      b2.type = "button"; b2.className = "px-btn" + (bb[1] ? " primary" : ""); b2.textContent = bb[0];
      b2.addEventListener("click", function () {
        if (bb[1]) { ses.data = null; ses.layerId = null; T.toast("Curves applied"); }
        else endSession(false);
        closeOverlay();
      });
      bar.appendChild(b2);
    });
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "px-btn"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () { endSession(false); closeOverlay(); });
    bar.appendChild(cancel); body.appendChild(bar);

    var PAD = 12, SZ = 260;
    function px2x(v) { return PAD + (v / 255) * (SZ - PAD * 2); }
    function py2y(v) { return SZ - PAD - (v / 255) * (SZ - PAD * 2); }
    function x2v(p) { return Math.round(((p - PAD) / (SZ - PAD * 2)) * 255); }
    function y2v(p) { return Math.round(((SZ - PAD - p) / (SZ - PAD * 2)) * 255); }
    function draw() {
      var x = cv.getContext("2d");
      x.clearRect(0, 0, SZ, SZ);
      x.strokeStyle = "rgba(128,128,128,0.35)"; x.lineWidth = 1;
      for (var g = 0; g <= 4; g++) {
        var gp = PAD + (g / 4) * (SZ - PAD * 2);
        x.beginPath(); x.moveTo(gp, PAD); x.lineTo(gp, SZ - PAD); x.stroke();
        x.beginPath(); x.moveTo(PAD, gp); x.lineTo(SZ - PAD, gp); x.stroke();
      }
      var pts = chans[cur].slice().sort(function (a, b) { return a.x - b.x; });
      var lut = lutFromPts(pts);
      x.strokeStyle = "#FF9A00"; x.lineWidth = 2; x.beginPath();
      for (var i = 0; i < 256; i += 2) {
        var X = px2x(i), Y = py2y(lut[i]);
        if (i === 0) x.moveTo(X, Y); else x.lineTo(X, Y);
      }
      x.stroke();
      pts.forEach(function (pt) {
        x.beginPath(); x.arc(px2x(pt.x), py2y(pt.y), 5, 0, 7);
        x.fillStyle = "#fff"; x.fill();
        x.strokeStyle = "#FF9A00"; x.lineWidth = 2; x.stroke();
      });
    }
    function applyPreview() {
      var luts = { rgb: lutFromPts(chans.rgb), r: lutFromPts(chans.r), g: lutFromPts(chans.g), b: lutFromPts(chans.b) };
      previewRun(function (img) {
        var d = img.data;
        for (var i = 0; i < d.length; i += 4) {
          var r = luts.r[d[i]], g = luts.g[d[i + 1]], b = luts.b[d[i + 2]];
          d[i] = luts.rgb[r]; d[i + 1] = luts.rgb[g]; d[i + 2] = luts.rgb[b];
        }
      });
    }
    var drag = -1;
    function evtPos(e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (SZ / r.width), y: (e.clientY - r.top) * (SZ / r.height) };
    }
    cv.addEventListener("mousedown", function (e) {
      var p = evtPos(e), pts = chans[cur], best = -1, bd = 14;
      for (var i = 0; i < pts.length; i++) {
        var dx = px2x(pts[i].x) - p.x, dy = py2y(pts[i].y) - p.y;
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best >= 0) { drag = best; }
      else {
        var v = { x: Math.max(0, Math.min(255, x2v(p.x))), y: Math.max(0, Math.min(255, y2v(p.y))) };
        pts.push(v); drag = pts.length - 1; draw(); applyPreview();
      }
    });
    function onCurveMove(e) {
      if (drag < 0 || !overlay) return;
      var p = evtPos(e), pts = chans[cur];
      pts[drag].x = Math.max(0, Math.min(255, x2v(p.x)));
      pts[drag].y = Math.max(0, Math.min(255, y2v(p.y)));
      draw(); applyPreview();
    }
    function onCurveUp() {
      drag = -1;
      window.removeEventListener("mousemove", onCurveMove);
      window.removeEventListener("mouseup", onCurveUp);
    }
    window.addEventListener("mousemove", onCurveMove);
    window.addEventListener("mouseup", onCurveUp);
    cv.addEventListener("dblclick", function (e) {
      var p = evtPos(e), pts = chans[cur];
      if (pts.length <= 2) return;
      for (var i = 0; i < pts.length; i++) {
        var dx = px2x(pts[i].x) - p.x, dy = py2y(pts[i].y) - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < 14) { pts.splice(i, 1); draw(); applyPreview(); return; }
      }
    });
    draw();
  }

  function openLevels() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var lv = { black: 0, white: 255, gamma: 100 };
    var body = openOverlay("Levels");
    function refresh() {
      previewRun(function (img) {
        var d = img.data, g = lv.gamma / 100, bl = lv.black, wh = Math.max(bl + 1, lv.white);
        var range = wh - bl;
        for (var i = 0; i < d.length; i += 4) {
          for (var k = 0; k < 3; k++) {
            var v = (d[i + k] - bl) / range;
            v = v < 0 ? 0 : (v > 1 ? 1 : v);
            d[i + k] = Math.round(255 * Math.pow(v, g));
          }
        }
      });
    }
    body.appendChild(sliderRow("Black point", 0, 254, 1, 0, function (v) { lv.black = Math.min(v, lv.white - 1); refresh(); }));
    body.appendChild(sliderRow("Gray (gamma x100)", 10, 999, 1, 100, function (v) { lv.gamma = v; refresh(); }));
    body.appendChild(sliderRow("White point", 1, 255, 1, 255, function (v) { lv.white = Math.max(v, lv.black + 1); refresh(); }));
    var bar = document.createElement("div"); bar.className = "px-btnbar";
    var apply = document.createElement("button");
    apply.type = "button"; apply.className = "px-btn primary"; apply.textContent = "Apply";
    apply.addEventListener("click", function () { ses.data = null; ses.layerId = null; closeOverlay(); T.toast("Levels applied"); });
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "px-btn"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () { endSession(false); closeOverlay(); });
    bar.appendChild(apply); bar.appendChild(cancel); body.appendChild(bar);
    refresh();
  }

  /* ================================================================
     FILTERS (real convolution / pixel ops, popover UI)
     ================================================================ */
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(title, buildControls, onApply) {
    closePop();
    var host = ensurePanels();
    pop = document.createElement("div");
    pop.className = "px-pop";
    pop.innerHTML = '<div class="px-phead"><span>' + T.esc(title) + "</span></div><div class=\"px-popbody\"></div>" +
      '<div class="px-btnbar"><button type="button" class="px-btn primary" data-x="ok">Apply</button>' +
      '<button type="button" class="px-btn" data-x="no">Cancel</button></div>';
    host.appendChild(pop);
    var body = pop.querySelector(".px-popbody");
    buildControls(body);
    pop.querySelector('[data-x="ok"]').addEventListener("click", function () { onApply(); closePop(); });
    pop.querySelector('[data-x="no"]').addEventListener("click", function () { endSession(false); closePop(); });
  }

  function gaussKernel(sigma) {
    var r = Math.min(24, Math.max(1, Math.ceil(sigma * 3))), k = [], sum = 0, i;
    for (i = -r; i <= r; i++) { var v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    for (i = 0; i < k.length; i++) k[i] /= sum;
    return { k: k, r: r };
  }
  function blurImageData(src, w, h, sigma) {
    var gk = gaussKernel(sigma), k = gk.k, r = gk.r;
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    var x, y, c, i, j, o;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      o = (y * w + x) * 4;
      for (c = 0; c < 4; c++) {
        var acc = 0;
        for (j = -r; j <= r; j++) {
          var xx = x + j; if (xx < 0) xx = 0; if (xx >= w) xx = w - 1;
          acc += src[((y * w + xx) * 4) + c] * k[j + r];
        }
        tmp[o + c] = acc;
      }
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      o = (y * w + x) * 4;
      for (c = 0; c < 4; c++) {
        var acc2 = 0;
        for (i = -r; i <= r; i++) {
          var yy = y + i; if (yy < 0) yy = 0; if (yy >= h) yy = h - 1;
          acc2 += tmp[((yy * w + x) * 4) + c] * k[i + r];
        }
        out[o + c] = acc2;
      }
    }
    return out;
  }
  function filterBlur() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var st = { radius: 4 };
    function run() {
      previewRun(function (img) {
        var b = blurImageData(ses.data.data, ses.w, ses.h, Math.max(0.4, st.radius / 2));
        var d = img.data;
        for (var i = 0; i < d.length; i++) d[i] = b[i] < 0 ? 0 : (b[i] > 255 ? 255 : b[i]);
      });
    }
    openPop("Gaussian Blur", function (body) {
      body.appendChild(sliderRow("Radius", 1, 20, 1, st.radius, function (v) { st.radius = v; run(); }));
    }, function () { ses.data = null; ses.layerId = null; composite(); T.toast("Blur applied"); });
    run();
  }
  function filterSharpen() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var st = { amount: 80 };
    function run() {
      previewRun(function (img) {
        var b = blurImageData(ses.data.data, ses.w, ses.h, 1.2);
        var d = img.data, s = ses.data.data, a = st.amount / 100;
        for (var i = 0; i < d.length; i += 4) {
          for (var c = 0; c < 3; c++) {
            var v = s[i + c] + (s[i + c] - b[i + c]) * a;
            d[i + c] = v < 0 ? 0 : (v > 255 ? 255 : v);
          }
          d[i + 3] = s[i + 3];
        }
      });
    }
    openPop("Sharpen", function (body) {
      body.appendChild(sliderRow("Amount %", 0, 200, 5, st.amount, function (v) { st.amount = v; run(); }));
    }, function () { ses.data = null; ses.layerId = null; composite(); T.toast("Sharpen applied"); });
    run();
  }
  function filterGrain() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var st = { amount: 25 };
    function run() {
      previewRun(function (img) {
        var d = img.data, s = ses.data.data, a = st.amount * 2.55;
        for (var i = 0; i < d.length; i += 4) {
          var nz = (Math.random() * 2 - 1) * a;
          for (var c = 0; c < 3; c++) {
            var v = s[i + c] + nz;
            d[i + c] = v < 0 ? 0 : (v > 255 ? 255 : v);
          }
          d[i + 3] = s[i + 3];
        }
      });
    }
    openPop("Film Grain", function (body) {
      body.appendChild(sliderRow("Amount", 0, 100, 1, st.amount, function (v) { st.amount = v; run(); }));
    }, function () { ses.data = null; ses.layerId = null; composite(); T.toast("Grain applied"); });
    run();
  }
  function filterPixelate() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var st = { size: 12 };
    function run() {
      previewRun(function (img) {
        var d = img.data, s = ses.data.data, w = ses.w, h = ses.h, n = Math.max(2, Math.round(st.size));
        for (var by = 0; by < h; by += n) for (var bx = 0; bx < w; bx += n) {
          var r = 0, g = 0, b = 0, a = 0, cnt = 0;
          for (var y = by; y < Math.min(by + n, h); y++) for (var x = bx; x < Math.min(bx + n, w); x++) {
            var o = (y * w + x) * 4;
            r += s[o]; g += s[o + 1]; b += s[o + 2]; a += s[o + 3]; cnt++;
          }
          r /= cnt; g /= cnt; b /= cnt; a /= cnt;
          for (var y2 = by; y2 < Math.min(by + n, h); y2++) for (var x2 = bx; x2 < Math.min(bx + n, w); x2++) {
            var o2 = (y2 * w + x2) * 4;
            d[o2] = r; d[o2 + 1] = g; d[o2 + 2] = b; d[o2 + 3] = a;
          }
        }
      });
    }
    openPop("Pixelate", function (body) {
      body.appendChild(sliderRow("Cell size", 2, 64, 1, st.size, function (v) { st.size = v; run(); }));
    }, function () { ses.data = null; ses.layerId = null; composite(); T.toast("Pixelate applied"); });
    run();
  }
  function filterVignette() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var st = { amount: 50 };
    function run() {
      previewRun(function (img) {
        var d = img.data, s = ses.data.data, w = ses.w, h = ses.h;
        var cx = w / 2, cy = h / 2, maxd = Math.sqrt(cx * cx + cy * cy);
        var a = st.amount / 100;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var o = (y * w + x) * 4;
          var dd = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxd;
          var f = 1 - a * dd * dd * 1.15;
          if (f < 0) f = 0;
          d[o] = s[o] * f; d[o + 1] = s[o + 1] * f; d[o + 2] = s[o + 2] * f; d[o + 3] = s[o + 3];
        }
      });
    }
    openPop("Vignette", function (body) {
      body.appendChild(sliderRow("Amount", 0, 100, 1, st.amount, function (v) { st.amount = v; run(); }));
    }, function () { ses.data = null; ses.layerId = null; composite(); T.toast("Vignette applied"); });
    run();
  }
  function hexRgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function filterDuotone() {
    var L = guard(); if (!L || !beginSession(L)) return;
    var st = { c1: "#14213d", c2: "#fca311" };
    function run() {
      previewRun(function (img) {
        var d = img.data, s = ses.data.data;
        var p1 = hexRgb(st.c1), p2 = hexRgb(st.c2);
        for (var i = 0; i < d.length; i += 4) {
          var lum = (0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]) / 255;
          d[i] = p1[0] + (p2[0] - p1[0]) * lum;
          d[i + 1] = p1[1] + (p2[1] - p1[1]) * lum;
          d[i + 2] = p1[2] + (p2[2] - p1[2]) * lum;
          d[i + 3] = s[i + 3];
        }
      });
    }
    openPop("Duotone", function (body) {
      [["Shadows", "c1"], ["Highlights", "c2"]].forEach(function (cc) {
        var row = document.createElement("div");
        row.className = "px-srow";
        var lb = document.createElement("span"); lb.className = "px-slab"; lb.textContent = cc[0];
        var inp = document.createElement("input");
        inp.type = "color"; inp.value = st[cc[1]];
        inp.addEventListener("input", function () { st[cc[1]] = inp.value; run(); });
        row.appendChild(lb); row.appendChild(inp);
        body.appendChild(row);
      });
    }, function () { ses.data = null; ses.layerId = null; composite(); T.toast("Duotone applied"); });
    run();
  }

  function buildTools(host) {
    var p = panelShell("Curves and Levels");
    var bar = document.createElement("div"); bar.className = "px-btnbar";
    var bc = document.createElement("button");
    bc.type = "button"; bc.className = "px-btn"; bc.textContent = "Curves";
    bc.addEventListener("click", openCurves);
    var bl = document.createElement("button");
    bl.type = "button"; bl.className = "px-btn"; bl.textContent = "Levels";
    bl.addEventListener("click", openLevels);
    bar.appendChild(bc); bar.appendChild(bl); p.appendChild(bar);
    host.appendChild(p);

    var f = panelShell("Filters");
    var grid = document.createElement("div"); grid.className = "px-fgrid";
    [["Blur", filterBlur], ["Sharpen", filterSharpen], ["Grain", filterGrain],
     ["Pixelate", filterPixelate], ["Vignette", filterVignette], ["Duotone", filterDuotone]
    ].forEach(function (ff) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "px-btn"; b.textContent = ff[0];
      b.addEventListener("click", ff[1]);
      grid.appendChild(b);
    });
    f.appendChild(grid);
    host.appendChild(f);
  }

  /* ---------------- init ---------------- */
  function init() {
    var host = ensurePanels();
    buildHistogram(host);
    buildAdjust(host);
    buildTools(host);
    drawHistogram();
    T.bus.on("pixel:change", scheduleHist);
    T.bus.on("pixel:layers", scheduleHist);
    T.bus.on("pixel:select", function (d) {
      // auto-apply a pending adjust session when switching layers (preview is kept)
      if (ses.data && d && d.id && d.id !== ses.layerId) {
        ses.data = null; ses.layerId = null; adjResetUI(); composite();
      }
      scheduleHist();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
