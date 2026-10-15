/* TXT Pixel Studio - TOOLS: left dock, options bar, shortcuts, pointer routing,
   brush engine (velocity width), marquee/lasso/wand selections, clone stamp,
   eyedropper, crop, move. All tools do real pixel work on the active layer. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T || !T.pixel) return;
  var PX = T.pixel, IN = PX.internal;
  IN.ensure();

  /* ---------------- icons (inline designed SVG, no emoji) ---------------- */
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  var ICONS = {
    move: svg('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
    marquee: svg('<rect x="4" y="7" width="16" height="10" stroke-dasharray="4 2.5"/><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/>'),
    lasso: svg('<path d="M8 3.5c4.5-1 9 2.5 9.5 7s-2 8-6 9.5S4 18.5 4.5 14.5 7 11 9.5 12s3 3.5 1.5 5"/>'),
    wand: svg('<path d="M4 20L13.5 10.5"/><path d="M17 3.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/><path d="M20.5 11.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/>'),
    brush: svg('<path d="M9.5 14.5l7-7 3.5 3.5-7 7z"/><path d="M9.5 14.5L4 20l5.5-1z"/><path d="M13.5 7.5l3 3"/>'),
    eraser: svg('<path d="M6.8 15.2l6.4-6.4 4.6 4.6-3.9 3.9H9.4z"/><path d="M4 21h16"/>'),
    clone: svg('<rect x="8" y="3" width="8" height="5" rx="1"/><path d="M12 8v3"/><path d="M7 16.5c0-2.2 2.2-3.5 5-3.5s5 1.3 5 3.5V18H7z"/><path d="M5 21h14"/>'),
    eyedropper: svg('<path d="M13 6.5l4.5 4.5L9 19.5a2.12 2.12 0 0 1-3-3z"/><path d="M14.5 5l1.8-1.8a1.4 1.4 0 0 1 2 2L16.5 7"/><circle cx="19" cy="18.5" r="1.4"/>'),
    crop: svg('<path d="M4 9h12v12"/><path d="M20 15H8V3"/><path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9"/>')
  };

  /* ---------------- helpers ---------------- */

  function hexA(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function stampFor(size, hardness, color) {
    var key = size + "|" + hardness + "|" + color;
    if (stampFor.cache[key]) return stampFor.cache[key];
    var d = Math.max(2, Math.ceil(size));
    var c = document.createElement("canvas");
    c.width = c.height = d;
    var x = c.getContext("2d");
    var g = x.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
    var inner = Math.max(0, Math.min(0.98, hardness / 100));
    g.addColorStop(0, hexA(color, 1));
    g.addColorStop(Math.max(0.01, inner * 0.92), hexA(color, 1));
    g.addColorStop(1, hexA(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, d, d);
    stampFor.cache[key] = c;
    return c;
  }
  stampFor.cache = {};

  function circleMask(size, hardness) {
    var d = Math.max(2, Math.ceil(size));
    var c = document.createElement("canvas");
    c.width = c.height = d;
    var x = c.getContext("2d");
    var g = x.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
    var inner = Math.max(0, Math.min(0.98, hardness / 100));
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(Math.max(0.01, inner * 0.92), "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, d, d);
    return c;
  }

  function activeEditable() {
    var L = IN.activeRaw();
    if (!L) { T.toast("No layer"); return null; }
    if (L.locked) { T.toast("Layer is locked"); return null; }
    return L;
  }

  function maskTemp(temp) {
    /* cut the current selection out of a stroke temp canvas */
    if (!PX.hasSelection()) return;
    var x = temp.getContext("2d");
    x.save();
    x.globalCompositeOperation = "destination-in";
    x.drawImage(PX.getMask(), 0, 0);
    x.restore();
  }

  function previewTemp(temp) {
    PX.composite();
    IN.compEl().getContext("2d").drawImage(temp, 0, 0);
  }

  /* ---------------- brush / eraser stroke engine ---------------- */

  function strokeEngine(isEraser) {
    var S = null;
    function opts() { return PX.getBrush(); }
    function dab(x, y, sizeEff) {
      var o = opts();
      var st = stampFor(Math.max(1, Math.round(sizeEff)), o.hardness, isEraser ? "#ffffff" : S.color);
      var d = st.width;
      S.tctx.globalAlpha = Math.max(0.01, o.flow / 100);
      S.tctx.drawImage(st, x - d / 2, y - d / 2);
    }
    function spacing(sizeEff) { return Math.max(1, sizeEff * 0.22); }
    return {
      down: function (p) {
        var L = activeEditable();
        if (!L) return false;
        var doc = IN.docSize();
        S = {
          layer: L, color: PX.getFg(),
          temp: (function () { var c = document.createElement("canvas"); c.width = doc.w; c.height = doc.h; return c; })(),
          pts: [{ x: p.x, y: p.y, t: performance.now() }]
        };
        S.tctx = S.temp.getContext("2d");
        dab(p.x, p.y, opts().size);
        previewTemp(S.temp);
        return true;
      },
      move: function (p) {
        if (!S) return;
        var o = opts();
        var last = S.pts[S.pts.length - 1];
        var dx = p.x - last.x, dy = p.y - last.y;
        var dist = Math.hypot(dx, dy);
        if (dist < 0.5) return;
        var now = performance.now();
        var dt = Math.max(1, now - last.t);
        var v = dist / dt; /* px per ms */
        var wScale = 1 - 0.55 * Math.min(1, v / 2.2);
        var sizeEff = Math.max(1, o.size * wScale);
        var sp = spacing(sizeEff), n = Math.max(1, Math.floor(dist / sp));
        for (var i = 1; i <= n; i++) {
          dab(last.x + dx * i / n, last.y + dy * i / n, sizeEff);
        }
        S.pts.push({ x: p.x, y: p.y, t: now });
        previewTemp(S.temp);
      },
      up: function () {
        if (!S) return;
        var o = opts();
        maskTemp(S.temp);
        var lc = S.layer.canvas.getContext("2d");
        lc.save();
        if (isEraser) {
          lc.globalCompositeOperation = "destination-out";
          lc.globalAlpha = Math.max(0.01, o.opacity / 100);
        } else {
          lc.globalCompositeOperation = "source-over";
          lc.globalAlpha = Math.max(0.01, o.opacity / 100);
        }
        lc.drawImage(S.temp, 0, 0);
        lc.restore();
        S = null;
        IN.changed();
      },
      cursorSize: function () { return opts().size; }
    };
  }

  var brushStroke = strokeEngine(false);
  var eraserStroke = strokeEngine(true);

  /* ---------------- individual tools ---------------- */

  var marqueeState = null;
  var lassoPts = null;
  var moveState = null;
  var cloneSrc = null;
  var cloneOff = null;
  var cropDrag = null;

  var TOOLS = {
    move: {
      key: "V", label: "Move",
      hint: "Drag to move the active layer",
      down: function (p) {
        var L = activeEditable();
        if (!L) return false;
        var snap = document.createElement("canvas");
        snap.width = L.canvas.width; snap.height = L.canvas.height;
        snap.getContext("2d").drawImage(L.canvas, 0, 0);
        moveState = { layer: L, snap: snap, sx: p.x, sy: p.y };
        return true;
      },
      move: function (p) {
        if (!moveState) return;
        var L = moveState.layer;
        var x = L.canvas.getContext("2d");
        x.save();
        x.globalCompositeOperation = "source-over";
        x.clearRect(0, 0, L.canvas.width, L.canvas.height);
        x.drawImage(moveState.snap, Math.round(p.x - moveState.sx), Math.round(p.y - moveState.sy));
        x.restore();
        PX.composite();
      },
      up: function () { if (moveState) { moveState = null; IN.changed(); } },
      cursorSize: function () { return 0; }
    },

    marquee: {
      key: "M", label: "Marquee",
      hint: "Drag a selection. Shift constrains to square",
      ellipse: false,
      down: function (p) {
        marqueeState = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        return true;
      },
      move: function (p, e) {
        if (!marqueeState) return;
        var m = marqueeState;
        m.x1 = p.x; m.y1 = p.y;
        if (e.shiftKey) {
          var w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
          var s = Math.max(w, h);
          m.x1 = m.x0 + (m.x1 >= m.x0 ? s : -s);
          m.y1 = m.y0 + (m.y1 >= m.y0 ? s : -s);
        }
        var sel = { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, ellipse: TOOLS.marquee.ellipse };
        IN.maskFromRect(sel);
        IN.setSelection(sel);
      },
      up: function () {
        if (!marqueeState) return;
        var r = IN.normRect(marqueeState);
        marqueeState = null;
        if (r.w < 3 || r.h < 3) { IN.setSelection(null); }
      },
      cursorSize: function () { return 0; }
    },

    lasso: {
      key: "L", label: "Lasso",
      hint: "Draw a freehand selection",
      down: function (p) {
        lassoPts = [{ x: p.x, y: p.y }];
        return true;
      },
      move: function (p) {
        if (!lassoPts) return;
        var last = lassoPts[lassoPts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 2) {
          lassoPts.push({ x: p.x, y: p.y });
          if (lassoPts.length > 2) {
            IN.maskFromPoly(lassoPts);
            IN.setSelection({ poly: lassoPts.slice() });
          }
        }
      },
      up: function () {
        if (!lassoPts) return;
        if (lassoPts.length > 2) {
          IN.maskFromPoly(lassoPts);
          IN.setSelection({ poly: lassoPts.slice() });
        } else {
          IN.setSelection(null);
        }
        lassoPts = null;
      },
      cursorSize: function () { return 0; }
    },

    wand: {
      key: "W", label: "Magic Wand",
      hint: "Click to select similar colors",
      down: function (p) {
        var n = IN.maskFromWand(p.x, p.y, PX.getWandTol());
        if (n > 0) IN.setSelection({ magic: true, x: Math.round(p.x), y: Math.round(p.y) });
        else T.toast("No similar pixels found");
        return true;
      },
      move: function () {}, up: function () {},
      cursorSize: function () { return 0; }
    },

    brush: {
      key: "B", label: "Brush",
      hint: "Paint with a pressure-feel round brush",
      down: function (p) { return brushStroke.down(p); },
      move: function (p) { brushStroke.move(p); },
      up: function () { brushStroke.up(); },
      cursorSize: function () { return brushStroke.cursorSize(); }
    },

    eraser: {
      key: "E", label: "Eraser",
      hint: "Paint transparency on the active layer",
      down: function (p) { return eraserStroke.down(p); },
      move: function (p) { eraserStroke.move(p); },
      up: function () { eraserStroke.up(); },
      cursorSize: function () { return eraserStroke.cursorSize(); }
    },

    clone: {
      key: "S", label: "Clone Stamp",
      hint: "Alt-click to set the source, then paint",
      down: function (p, e) {
        if (e.altKey) {
          cloneSrc = { x: p.x, y: p.y };
          T.toast("Clone source set");
          return false;
        }
        var L = activeEditable();
        if (!L) return false;
        if (!cloneSrc) { T.toast("Alt-click to set the clone source first"); return false; }
        cloneOff = { x: p.x - cloneSrc.x, y: p.y - cloneSrc.y };
        cloneDab(L, p);
        return true;
      },
      move: function (p) {
        var L = IN.activeRaw();
        if (!L || !cloneOff) return;
        cloneDab(L, p);
      },
      up: function () { if (cloneOff) { cloneOff = null; IN.changed(); } },
      cursorSize: function () { return PX.getBrush().size; }
    },

    eyedropper: {
      key: "I", label: "Eyedropper",
      hint: "Click to sample the foreground color (Alt for background)",
      down: function (p, e) {
        var doc = IN.docSize();
        var x = Math.max(0, Math.min(doc.w - 1, Math.round(p.x)));
        var y = Math.max(0, Math.min(doc.h - 1, Math.round(p.y)));
        try {
          var d = IN.compEl().getContext("2d").getImageData(x, y, 1, 1).data;
          var hex = "#" + [d[0], d[1], d[2]].map(function (v) {
            var s = v.toString(16); return s.length < 2 ? "0" + s : s;
          }).join("");
          if (e.altKey) PX.setBg(hex); else PX.setFg(hex);
        } catch (err) { T.toast("Could not sample color", "error"); }
        return true;
      },
      move: function () {}, up: function () {},
      cursorSize: function () { return 0; }
    },

    crop: {
      key: "C", label: "Crop",
      hint: "Drag a rectangle, then Enter to apply (Esc cancels)",
      down: function (p) {
        cropDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        IN.setCrop(cropDrag);
        return true;
      },
      move: function (p) {
        if (!cropDrag) return;
        cropDrag.x1 = p.x; cropDrag.y1 = p.y;
        IN.setCrop(cropDrag);
      },
      up: function () {},
      cursorSize: function () { return 0; }
    }
  };

  function cloneDab(L, p) {
    var o = PX.getBrush();
    var size = Math.max(2, Math.round(o.size));
    var sx = p.x - cloneOff.x, sy = p.y - cloneOff.y;
    var dab = document.createElement("canvas");
    dab.width = dab.height = size;
    var dx = dab.getContext("2d");
    dx.drawImage(L.canvas, sx - size / 2, sy - size / 2, size, size, 0, 0, size, size);
    dx.globalCompositeOperation = "destination-in";
    dx.drawImage(circleMask(size, o.hardness), 0, 0);
    dx.globalCompositeOperation = "source-over";
    /* respect selection */
    if (PX.hasSelection() && !IN.inSelection(p.x, p.y)) return;
    var lc = L.canvas.getContext("2d");
    lc.save();
    lc.globalAlpha = Math.max(0.01, o.opacity / 100);
    lc.drawImage(dab, Math.round(p.x - size / 2), Math.round(p.y - size / 2));
    lc.restore();
    PX.composite();
  }

  var ORDER = ["move", "marquee", "lasso", "wand", "crop", "brush", "eraser", "clone", "eyedropper"];
  var active = "brush";
  var drawing = false;

  /* ---------------- dock ---------------- */

  function buildDock() {
    var dock = IN.dockEl();
    if (!dock) return;
    dock.innerHTML = "";
    ORDER.forEach(function (id) {
      var t = TOOLS[id];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "px-tool" + (id === active ? " on" : "");
      b.dataset.tool = id;
      b.title = t.label + " (" + t.key + ")";
      b.innerHTML = ICONS[id] + '<span class="px-key">' + t.key + "</span>";
      b.addEventListener("click", function () { selectTool(id); });
      dock.appendChild(b);
    });
    /* fg/bg swatch stack */
    var sw = document.createElement("div");
    sw.className = "px-swatches";
    sw.innerHTML =
      '<div class="px-swbg" id="pxSwBg" title="Background color (click to change)"></div>' +
      '<div class="px-swfg" id="pxSwFg" title="Foreground color (click to change)"></div>' +
      '<button type="button" class="px-swswap" id="pxSwSwap" title="Swap colors (X)">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 16V8m0 0L4 11m3-3l3 3M17 8v8m0 0l3-3m-3 3l-3-3"/></svg></button>' +
      '<input type="color" id="pxFgPick" class="px-hiddenpick" value="' + PX.getFg() + '">' +
      '<input type="color" id="pxBgPick" class="px-hiddenpick" value="' + PX.getBg() + '">';
    dock.appendChild(sw);
    paintSwatches();
    sw.querySelector("#pxSwFg").addEventListener("click", function () { sw.querySelector("#pxFgPick").click(); });
    sw.querySelector("#pxSwBg").addEventListener("click", function () { sw.querySelector("#pxBgPick").click(); });
    sw.querySelector("#pxSwSwap").addEventListener("click", function () { PX.swapFgBg(); });
    sw.querySelector("#pxFgPick").addEventListener("input", function (e) { PX.setFg(e.target.value); });
    sw.querySelector("#pxBgPick").addEventListener("input", function (e) { PX.setBg(e.target.value); });
    T.bus.on("pixel:color", paintSwatches);
  }

  function paintSwatches() {
    var f = document.getElementById("pxSwFg"), b = document.getElementById("pxSwBg");
    if (f) f.style.background = PX.getFg();
    if (b) b.style.background = PX.getBg();
    var fp = document.getElementById("pxFgPick"), bp = document.getElementById("pxBgPick");
    if (fp) fp.value = PX.getFg();
    if (bp) bp.value = PX.getBg();
  }

  function selectTool(id) {
    if (!TOOLS[id]) return;
    active = id;
    var dock = IN.dockEl();
    if (dock) {
      var btns = dock.querySelectorAll(".px-tool");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("on", btns[i].dataset.tool === id);
      }
    }
    buildOptions();
    IN.toolCursorSize = TOOLS[id].cursorSize;
    T.bus.emit("pixel:tool", { tool: id });
  }

  /* ---------------- options bar ---------------- */

  function sliderRow(label, min, max, val, onInput) {
    var w = document.createElement("div");
    w.className = "px-opt";
    var lb = document.createElement("span");
    lb.className = "px-opt-lb";
    lb.textContent = label;
    var s = document.createElement("input");
    s.type = "range"; s.min = min; s.max = max; s.value = val;
    s.className = "px-range";
    var v = document.createElement("span");
    v.className = "px-opt-v";
    v.textContent = val;
    s.addEventListener("input", function () {
      v.textContent = s.value;
      onInput(+s.value);
    });
    w.appendChild(lb); w.appendChild(s); w.appendChild(v);
    return w;
  }

  function hintRow(text) {
    var w = document.createElement("div");
    w.className = "px-opt px-hint";
    w.textContent = text;
    return w;
  }

  function segRow(label, options, val, onPick) {
    var w = document.createElement("div");
    w.className = "px-opt";
    var lb = document.createElement("span");
    lb.className = "px-opt-lb";
    lb.textContent = label;
    w.appendChild(lb);
    options.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "px-seg" + (o.v === val ? " on" : "");
      b.textContent = o.t;
      b.addEventListener("click", function () {
        var bs = w.querySelectorAll(".px-seg");
        for (var i = 0; i < bs.length; i++) bs[i].classList.remove("on");
        b.classList.add("on");
        onPick(o.v);
      });
      w.appendChild(b);
    });
    return w;
  }

  function buildOptions() {
    var host = IN.optsEl();
    if (!host) return;
    host.innerHTML = "";
    var t = TOOLS[active];
    var b = PX.getBrush();
    var title = document.createElement("span");
    title.className = "px-toolname";
    title.textContent = t.label;
    host.appendChild(title);
    if (active === "brush" || active === "eraser" || active === "clone") {
      host.appendChild(sliderRow("Size", 1, 200, b.size, function (v) { b.size = v; }));
      host.appendChild(sliderRow("Hardness", 0, 100, b.hardness, function (v) { b.hardness = v; }));
      host.appendChild(sliderRow("Opacity", 1, 100, b.opacity, function (v) { b.opacity = v; }));
      if (active === "brush") host.appendChild(sliderRow("Flow", 1, 100, b.flow, function (v) { b.flow = v; }));
    } else if (active === "wand") {
      host.appendChild(sliderRow("Tolerance", 0, 200, PX.getWandTol(), function (v) { PX.setWandTol(v); }));
    } else if (active === "marquee") {
      host.appendChild(segRow("Shape", [{ v: false, t: "Rectangle" }, { v: true, t: "Ellipse" }], t.ellipse, function (v) {
        t.ellipse = v;
        var sel = PX.getSelection();
        if (sel && !sel.poly && !sel.magic) {
          sel.ellipse = v;
          IN.maskFromRect(sel);
          IN.setSelection(sel);
        }
      }));
    }
    host.appendChild(hintRow(t.hint));
  }

  /* ---------------- pointer routing ---------------- */

  function bindCanvas() {
    var cv = IN.compEl();
    if (!cv || cv._pxBound) return;
    cv._pxBound = true;
    cv.addEventListener("pointerdown", function (e) {
      if (!IN.isActive()) return;
      if (e.button !== 0 && !e.altKey) return;
      var p = IN.toDoc(e);
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      var t = TOOLS[active];
      drawing = t.down(p, e) === true;
      e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!IN.isActive() || !drawing) return;
      var p = IN.toDoc(e);
      TOOLS[active].move(p, e);
      e.preventDefault();
    });
    function end(e) {
      if (!drawing) return;
      drawing = false;
      TOOLS[active].up(IN.toDoc(e), e);
    }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", function () { drawing = false; });
  }

  /* ---------------- keyboard ---------------- */

  var KEYMAP = {};
  ORDER.forEach(function (id) { KEYMAP[TOOLS[id].key.toLowerCase()] = id; });

  document.addEventListener("keydown", function (e) {
    if (!IN.isActive()) return;
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod) return; /* core.js owns Ctrl+D / Delete */
    var k = e.key;
    if (k === "Escape") {
      if (IN.getCrop()) { IN.setCrop(null); }
      else PX.clearSelection();
      return;
    }
    if (k === "Enter" && IN.getCrop()) {
      if (IN.applyCrop()) T.toast("Cropped");
      return;
    }
    if (k === "x" || k === "X") { PX.swapFgBg(); return; }
    if (k === "[") { var b1 = PX.getBrush(); b1.size = Math.max(1, b1.size - 4); buildOptions(); return; }
    if (k === "]") { var b2 = PX.getBrush(); b2.size = Math.min(200, b2.size + 4); buildOptions(); return; }
    var id = KEYMAP[k.toLowerCase()];
    if (id && k.length === 1) { selectTool(id); }
  });

  /* ---------------- boot ---------------- */

  buildDock();
  buildOptions();
  bindCanvas();
  IN.toolCursorSize = TOOLS[active].cursorSize;
  T.bus.on("pixel:open", function () { bindCanvas(); });

  /* palette commands */
  ORDER.forEach(function (id) {
    T.register("pixel.tool." + id, function () { PX.open(); selectTool(id); },
      { title: "Pixel: " + TOOLS[id].label + " tool", cat: "Pixel", icon: "i-image" });
  });
  T.register("pixel.open", function () { PX.open(); }, { title: "Open Pixel Studio", cat: "Pixel", icon: "i-image" });
  T.register("pixel.new", function () { PX.open(); PX.newDoc(1200, 900); }, { title: "Pixel: new document", cat: "Pixel", icon: "i-file" });
})();
