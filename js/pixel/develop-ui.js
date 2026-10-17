/* NXT PXL Develop Engine, UI worker.
   Builds the Develop panel set inside #pPanels (prepended above the legacy
   panels): parametric develop accordions, live histogram with clipping and
   direct-drag tonal zones, tone curve editor, HSL mixer, color grading
   wheels, presets, masks, history/snapshots, filmstrip and export.
   All rendering goes through T.PXL.developImageData (real pixel math).
   Local only. No emojis, no alert(), no em dashes in UI text. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T || !T.PXL) return;
  var PXL = T.PXL;
  var $ = T.$, $$ = T.$$;

  /* ================= state ================= */
  var DS = {
    params: PXL.neutralParams(),
    ses: { data: null, w: 0, h: 0, layerId: null },
    masks: [],            /* {id,type,label,enabled,invert,feather,geom,strokes,adj} */
    selMask: null,
    maskTool: null,       /* null | "linear" | "radial" | "brush" */
    history: [],
    snapshots: [],
    viewMode: "normal",   /* normal | before | split | wipe */
    wipeFrac: 0.5,
    clip: null,           /* null | "shadows" | "highlights" */
    intensity: 100,
    clipboard: null,
    film: null,           /* filmstrip state */
    targeted: false,
    targetedHue: null,
    brushSize: 28,
    renderTimer: null,
    histTimer: null,
    built: false
  };
  var refreshers = [];    /* fns that re-read DS.params into slider positions */
  var maskSeq = 0;

  function px() { return T.pixel || null; }
  function activeLayer() { var p = px(); return p ? p.activeLayer() : null; }
  function composite() {
    var p = px(); if (!p) return;
    try { p.composite(); } catch (e) {}
    T.bus.emit("pixel:change");
  }
  function guard() {
    var L = activeLayer();
    if (!px() || !L) { T.toast("No active layer", "error"); return null; }
    if (L.locked) { T.toast("Active layer is locked", "error"); return null; }
    if (!L.canvas || !L.canvas.width) { T.toast("Layer has no pixels", "error"); return null; }
    return L;
  }

  /* ================= edit session ================= */
  function beginSession(L) {
    if (DS.ses.data && DS.ses.layerId === L.id) return true;
    try {
      var c = L.canvas.getContext("2d");
      DS.ses.data = c.getImageData(0, 0, L.canvas.width, L.canvas.height);
      DS.ses.w = L.canvas.width; DS.ses.h = L.canvas.height; DS.ses.layerId = L.id;
      return true;
    } catch (e) { T.toast("Cannot read layer pixels", "error"); return false; }
  }
  function endSession(keep) {
    var L = activeLayer();
    if (!keep && DS.ses.data && L && L.id === DS.ses.layerId) {
      try { L.canvas.getContext("2d").putImageData(DS.ses.data, 0, 0); } catch (e) {}
      composite();
    }
    DS.ses.data = null; DS.ses.layerId = null;
  }

  /* ================= render ================= */
  function enabledMasks() {
    return DS.masks.filter(function (m) { return m.enabled !== false; });
  }
  function renderDev() {
    var L = activeLayer();
    if (!L || !DS.ses.data || DS.ses.layerId !== L.id) return;
    if (DS.viewMode === "before") {
      try { L.canvas.getContext("2d").putImageData(DS.ses.data, 0, 0); } catch (e) {}
      composite();
      scheduleHistDraw();
      return;
    }
    var split = null;
    if (DS.viewMode === "split") split = { frac: 0.5 };
    else if (DS.viewMode === "wipe") split = { frac: DS.wipeFrac };
    var out;
    try {
      out = PXL.developImageData(DS.ses.data.data, DS.ses.w, DS.ses.h, DS.params, {
        masks: enabledMasks(),
        clip: DS.clip,
        split: split,
        before: split ? DS.ses.data.data : null
      });
    } catch (e) { return; }
    try {
      var img = new window.ImageData(new Uint8ClampedArray(out), DS.ses.w, DS.ses.h);
      L.canvas.getContext("2d").putImageData(img, 0, 0);
    } catch (e) { return; }
    composite();
    scheduleHistDraw();
  }
  function scheduleRender() {
    if (DS.renderTimer) clearTimeout(DS.renderTimer);
    DS.renderTimer = setTimeout(renderDev, 60);
  }

  /* ================= history ================= */
  function cloneMasks(masks) {
    return (masks || []).map(function (m) {
      return {
        id: m.id, type: m.type, label: m.label, enabled: m.enabled,
        invert: m.invert, feather: m.feather,
        geom: m.geom ? JSON.parse(JSON.stringify(m.geom)) : null,
        strokes: m.strokes ? JSON.parse(JSON.stringify(m.strokes)) : [],
        adj: m.adj ? JSON.parse(JSON.stringify(m.adj)) : {}
      };
    });
  }
  function pushHistory(label) {
    DS.history.push({ label: label, params: PXL.cloneParams(DS.params), masks: cloneMasks(DS.masks) });
    if (DS.history.length > 60) DS.history.shift();
    renderHistoryList();
  }
  function restoreState(st) {
    DS.params = PXL.cloneParams(st.params);
    DS.masks = cloneMasks(st.masks);
    DS.selMask = null; DS.maskTool = null;
    refreshAll(); renderMasksList(); drawMaskOverlay(); scheduleRender();
  }

  /* ================= tiny UI helpers ================= */
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function panelShell(title, extraCls) {
    var d = el("div", "px-panel dv-panel" + (extraCls ? " " + extraCls : ""));
    d.innerHTML = '<div class="px-phead"><span>' + T.esc(title) + "</span></div>";
    return d;
  }
  function fmtVal(v, digits) {
    var n = parseFloat(v);
    if (digits == null) digits = (Math.abs(n) < 10 && n % 1 !== 0) ? 1 : 0;
    return String(Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits));
  }
  /* Slider row bound to get/set. Double-click the knob resets to the default. */
  function sliderRow(label, min, max, step, get, set, opts) {
    opts = opts || {};
    var def = opts.def == null ? 0 : opts.def;
    var row = el("div", "px-srow dv-srow");
    var lb = el("span", "px-slab", T.esc(label));
    var inp = document.createElement("input");
    inp.type = "range";
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(get());
    inp.setAttribute("aria-label", label);
    var vv = el("span", "px-sval", fmtVal(get()));
    function sync() { inp.value = String(get()); vv.textContent = fmtVal(get()); }
    inp.addEventListener("input", function () {
      var v = parseFloat(inp.value);
      vv.textContent = fmtVal(v);
      if (!DS.ses.data) {
        var L0 = guard();
        if (!L0 || !beginSession(L0)) return;
      }
      set(v);
      scheduleRender();
    });
    inp.addEventListener("change", function () {
      pushHistory(label + " " + fmtVal(parseFloat(inp.value)));
      saveDev();
    });
    inp.addEventListener("dblclick", function () {
      set(def); sync(); scheduleRender();
      pushHistory(label + " reset");
      saveDev();
    });
    row.appendChild(lb); row.appendChild(inp); row.appendChild(vv);
    refreshers.push(sync);
    row._sync = sync; row._input = inp;
    return row;
  }
  function accordion(title, open) {
    var acc = el("div", "dv-acc" + (open ? " open" : ""));
    var head = el("button", "dv-acchead", "");
    head.type = "button";
    head.innerHTML = '<span class="dv-acct">' + T.esc(title) + "</span>" +
      '<span class="dv-chev">' + T.icon("i-chev-d") + "</span>";
    var body = el("div", "dv-accbody");
    head.addEventListener("click", function () { acc.classList.toggle("open"); });
    acc.appendChild(head); acc.appendChild(body);
    acc._body = body;
    return acc;
  }
  function btnBar() { return el("div", "px-btnbar dv-btnbar"); }
  function mkBtn(label, primary, fn, title) {
    var b = el("button", "px-btn" + (primary ? " primary" : ""), T.esc(label));
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", fn);
    return b;
  }
  function refreshAll() {
    for (var i = 0; i < refreshers.length; i++) {
      try { refreshers[i](); } catch (e) {}
    }
    if (DS._curveDraw) DS._curveDraw();
    if (DS._wheelsDraw) DS._wheelsDraw();
  }

  /* ================= persistence ================= */
  function saveDev() {
    try {
      var p = PXL.cloneParams(DS.params);
      delete p._lutCache;
      T.store.set("pixel", "develop", {
        params: p,
        masks: cloneMasks(DS.masks),
        snapshots: DS.snapshots
      });
    } catch (e) {}
  }
  function loadDev() {
    try {
      var s = T.store.get("pixel", "develop");
      if (!s) return;
      if (s.params) DS.params = Object.assign(PXL.neutralParams(), s.params);
      if (s.masks) DS.masks = cloneMasks(s.masks);
      if (s.snapshots) DS.snapshots = s.snapshots;
    } catch (e) {}
  }

  /* ================= DEVELOP panel (8 accordions) ================= */
  function Pget(path) {
    var ks = path.split(".");
    return function () {
      var o = DS.params;
      for (var i = 0; i < ks.length; i++) o = o[ks[i]];
      return o;
    };
  }
  function Pset(path) {
    var ks = path.split(".");
    return function (v) {
      var o = DS.params;
      for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      o[ks[ks.length - 1]] = v;
      if (path.indexOf("curve") === 0) DS.params._lutCache = null;
    };
  }

  function buildBasic(acc) {
    var b = acc._body;
    b.appendChild(sliderRow("Exposure", -5, 5, 0.1, Pget("exposure"), Pset("exposure")));
    b.appendChild(sliderRow("Contrast", -100, 100, 1, Pget("contrast"), Pset("contrast")));
    b.appendChild(sliderRow("Highlights", -100, 100, 1, Pget("highlights"), Pset("highlights")));
    b.appendChild(sliderRow("Shadows", -100, 100, 1, Pget("shadows"), Pset("shadows")));
    b.appendChild(sliderRow("Whites", -100, 100, 1, Pget("whites"), Pset("whites")));
    b.appendChild(sliderRow("Blacks", -100, 100, 1, Pget("blacks"), Pset("blacks")));
    b.appendChild(sliderRow("Texture (clarity)", -100, 100, 1, Pget("clarity"), Pset("clarity")));
    b.appendChild(sliderRow("Dehaze", -100, 100, 1, Pget("dehaze"), Pset("dehaze")));
    b.appendChild(sliderRow("Vibrance", -100, 100, 1, Pget("vibrance"), Pset("vibrance")));
    b.appendChild(sliderRow("Saturation", -100, 100, 1, Pget("saturation"), Pset("saturation")));
    b.appendChild(sliderRow("Temp", -100, 100, 1, Pget("temp"), Pset("temp")));
    b.appendChild(sliderRow("Tint", -100, 100, 1, Pget("tint"), Pset("tint")));
    b.appendChild(sliderRow("B&W treatment", 0, 100, 1, Pget("bw"), Pset("bw")));
    var bar = btnBar();
    bar.appendChild(mkBtn("Auto tone", false, function () {
      var L = guard(); if (!L || !beginSession(L)) return;
      var pts = PXL.autoTonePoints(DS.ses.data.data);
      DS.params.tone = { black: pts.black, white: pts.white };
      scheduleRender();
      pushHistory("Auto tone");
      saveDev();
      T.toast("Auto tone applied");
    }, "Stretch black and white points from the histogram"));
    bar.appendChild(mkBtn("Reset tone", false, function () {
      DS.params.tone = { black: 0, white: 1 };
      scheduleRender(); pushHistory("Tone points reset"); saveDev();
    }));
    b.appendChild(bar);
    var hint = el("div", "px-hint", "Double-click a slider knob to reset it to 0.");
    b.appendChild(hint);
  }

  /* ---- tone curve editor ---- */
  var curveChan = "rgb";
  function setCurveChan(chan, pts) {
    var nc = {
      rgb: chan === "rgb" ? pts : DS.params.curve.rgb,
      r: chan === "r" ? pts : DS.params.curve.r,
      g: chan === "g" ? pts : DS.params.curve.g,
      b: chan === "b" ? pts : DS.params.curve.b
    };
    DS.params.curve = nc;
    DS.params._lutCache = null;
  }
  function buildCurve(acc) {
    var b = acc._body;
    var tabs = el("div", "dv-ctabs");
    var tabBtns = {};
    ["rgb", "r", "g", "b"].forEach(function (c) {
      var tb = el("button", "dv-ctab" + (c === "rgb" ? " on" : ""), c === "rgb" ? "RGB" : c.toUpperCase());
      tb.type = "button";
      tb.addEventListener("click", function () {
        curveChan = c;
        Object.keys(tabBtns).forEach(function (k) { tabBtns[k].classList.remove("on"); });
        tb.classList.add("on");
        drawCurve();
      });
      tabBtns[c] = tb; tabs.appendChild(tb);
    });
    b.appendChild(tabs);
    var cv = document.createElement("canvas");
    cv.width = 256; cv.height = 256; cv.className = "dv-curve";
    cv.setAttribute("aria-label", "Tone curve editor");
    b.appendChild(cv);
    var hint = el("div", "px-hint", "Click to add a point, drag to bend, right-click a point to delete it.");
    b.appendChild(hint);
    var presets = el("div", "dv-cpresets");
    [["Linear", "linear"], ["Medium contrast", "medium"], ["Strong S-curve", "strong"], ["Matte faded blacks", "matte"]].forEach(function (pp) {
      var pb = mkBtn(pp[0], false, function () {
        setCurveChan(curveChan, PXL.CURVE_PRESETS[pp[1]].map(function (p) { return { x: p.x, y: p.y }; }));
        drawCurve(); scheduleRender();
        pushHistory("Curve preset " + pp[0]); saveDev();
      });
      presets.appendChild(pb);
    });
    b.appendChild(presets);

    var PAD = 10, SZ = 256;
    function px2x(v) { return PAD + (v / 255) * (SZ - PAD * 2); }
    function py2y(v) { return SZ - PAD - (v / 255) * (SZ - PAD * 2); }
    function x2v(p) { return Math.round(((p - PAD) / (SZ - PAD * 2)) * 255); }
    function y2v(p) { return Math.round(((SZ - PAD - p) / (SZ - PAD * 2)) * 255); }
    function drawCurve() {
      var x = cv.getContext("2d");
      x.clearRect(0, 0, SZ, SZ);
      x.strokeStyle = "rgba(128,128,128,0.35)"; x.lineWidth = 1;
      for (var g = 0; g <= 4; g++) {
        var gp = PAD + (g / 4) * (SZ - PAD * 2);
        x.beginPath(); x.moveTo(gp, PAD); x.lineTo(gp, SZ - PAD); x.stroke();
        x.beginPath(); x.moveTo(PAD, gp); x.lineTo(SZ - PAD, gp); x.stroke();
      }
      var pts = DS.params.curve[curveChan].slice().sort(function (a, b2) { return a.x - b2.x; });
      var lut = PXL.lutFromPoints(pts);
      var col = curveChan === "rgb" ? "#EC4899" : (curveChan === "r" ? "#EF4444" : (curveChan === "g" ? "#10B981" : "#3B82F6"));
      x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
      for (var i = 0; i < 256; i += 2) {
        var X = px2x(i), Y = py2y(lut[i]);
        if (i === 0) x.moveTo(X, Y); else x.lineTo(X, Y);
      }
      x.stroke();
      pts.forEach(function (pt) {
        x.beginPath(); x.arc(px2x(pt.x), py2y(pt.y), 5, 0, 7);
        x.fillStyle = "#fff"; x.fill();
        x.strokeStyle = col; x.lineWidth = 2; x.stroke();
      });
    }
    DS._curveDraw = drawCurve;
    function evtPos(e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (SZ / r.width), y: (e.clientY - r.top) * (SZ / r.height) };
    }
    var drag = -1;
    cv.addEventListener("pointerdown", function (e) {
      var L = guard(); if (!L || !beginSession(L)) return;
      var p = evtPos(e), pts = DS.params.curve[curveChan].map(function (q) { return { x: q.x, y: q.y }; });
      var best = -1, bd = 16;
      for (var i = 0; i < pts.length; i++) {
        var dx = px2x(pts[i].x) - p.x, dy = py2y(pts[i].y) - p.y;
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best >= 0) { drag = best; setCurveChan(curveChan, pts); }
      else {
        pts.push({ x: Math.max(0, Math.min(255, x2v(p.x))), y: Math.max(0, Math.min(255, y2v(p.y))) });
        drag = pts.length - 1;
        setCurveChan(curveChan, pts);
      }
      cv.setPointerCapture(e.pointerId);
      drawCurve(); scheduleRender();
    });
    cv.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var p = evtPos(e);
      var pts = DS.params.curve[curveChan].map(function (q) { return { x: q.x, y: q.y }; });
      pts[drag].x = Math.max(0, Math.min(255, x2v(p.x)));
      pts[drag].y = Math.max(0, Math.min(255, y2v(p.y)));
      setCurveChan(curveChan, pts);
      drawCurve(); scheduleRender();
    });
    cv.addEventListener("pointerup", function () {
      if (drag >= 0) { drag = -1; pushHistory("Tone curve " + curveChan.toUpperCase()); saveDev(); }
    });
    cv.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var p = evtPos(e);
      var pts = DS.params.curve[curveChan].map(function (q) { return { x: q.x, y: q.y }; });
      if (pts.length <= 2) return;
      for (var i = 0; i < pts.length; i++) {
        var dx = px2x(pts[i].x) - p.x, dy = py2y(pts[i].y) - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < 16) {
          pts.splice(i, 1);
          setCurveChan(curveChan, pts);
          drawCurve(); scheduleRender();
          pushHistory("Tone curve point deleted"); saveDev();
          return;
        }
      }
    });
    drawCurve();
  }

  /* ---- HSL mixer ---- */
  var HSL_SECTORS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
  var HSL_CHIP = { red: "#EF4444", orange: "#F97316", yellow: "#EAB308", green: "#22C55E", aqua: "#06B6D4", blue: "#3B82F6", purple: "#8B5CF6", magenta: "#D946EF" };
  function buildHSL(acc) {
    var b = acc._body;
    var grid = el("div", "dv-hslgrid");
    HSL_SECTORS.forEach(function (name) {
      var row = el("div", "dv-hslrow");
      var chip = el("span", "dv-hslchip", "");
      chip.style.background = HSL_CHIP[name];
      chip.title = name;
      row.appendChild(chip);
      [["h", "H", -100, 100], ["s", "S", -100, 100], ["l", "L", -100, 100]].forEach(function (cc) {
        var key = "hsl." + name + "." + cc[0];
        var wrap = el("label", "dv-hslcell", "");
        var nm = el("span", "dv-hsln", cc[1]);
        var inp = document.createElement("input");
        inp.type = "range"; inp.min = String(cc[2]); inp.max = String(cc[3]); inp.step = "1";
        inp.value = String(Pget(key)());
        inp.setAttribute("aria-label", name + " " + cc[1]);
        inp.addEventListener("input", function () { Pset(key)(parseFloat(inp.value)); scheduleRender(); });
        inp.addEventListener("change", function () { pushHistory("HSL " + name + " " + cc[1]); saveDev(); });
        inp.addEventListener("dblclick", function () { Pset(key)(0); inp.value = "0"; scheduleRender(); });
        refreshers.push(function () { inp.value = String(Pget(key)()); });
        wrap.appendChild(nm); wrap.appendChild(inp);
        row.appendChild(wrap);
      });
      grid.appendChild(row);
    });
    b.appendChild(grid);
    var bar = btnBar();
    var tg = mkBtn("Targeted adjust: off", false, function () {
      DS.targeted = !DS.targeted;
      tg.textContent = "Targeted adjust: " + (DS.targeted ? "on" : "off");
      tg.classList.toggle("primary", DS.targeted);
      drawMaskOverlay();
      T.toast(DS.targeted ? "Drag vertically on the image to adjust the hue under the cursor" : "Targeted adjust off");
    }, "Drag vertically on the image to adjust the dominant hue range there");
    bar.appendChild(tg);
    b.appendChild(bar);
  }

  /* ---- color grading wheels ---- */
  function buildGrading(acc) {
    var b = acc._body;
    var zones = [["shadows", "Shadows"], ["midtones", "Midtones"], ["highlights", "Highlights"], ["global", "Global"]];
    var wheels = [];
    var grid = el("div", "dv-wheels");
    zones.forEach(function (zz) {
      var key = "grade." + zz[0];
      var cell = el("div", "dv-wheelcell");
      cell.appendChild(el("div", "dv-wheellab", T.esc(zz[1])));
      var cv = document.createElement("canvas");
      cv.width = 96; cv.height = 96; cv.className = "dv-wheel";
      cv.setAttribute("aria-label", zz[1] + " color wheel");
      cell.appendChild(cv);
      var lab = el("div", "dv-wheellab2", "h 0, s 0");
      cell.appendChild(lab);
      grid.appendChild(cell);
      wheels.push({ key: key, cv: cv, lab: lab });
    });
    b.appendChild(grid);
    function drawWheels() {
      wheels.forEach(function (w2) {
        var x = w2.cv.getContext("2d"), SZ = 96, cx = 48, cy = 48, R0 = 44;
        x.clearRect(0, 0, SZ, SZ);
        for (var a = 0; a < 360; a += 6) {
          var g2 = x.createLinearGradient(cx, cy, cx + Math.cos(a * Math.PI / 180) * R0, cy + Math.sin(a * Math.PI / 180) * R0);
          g2.addColorStop(0, "hsl(" + a + ",0%,50%)");
          g2.addColorStop(1, "hsl(" + a + ",100%,50%)");
          x.strokeStyle = g2; x.lineWidth = 8;
          x.beginPath();
          x.arc(cx, cy, R0 - 4, (a - 3) * Math.PI / 180, (a + 3) * Math.PI / 180);
          x.stroke();
        }
        var h = Pget(w2.key + ".h")(), s = Pget(w2.key + ".s")();
        var rr = (s / 100) * (R0 - 8);
        var pxp = cx + Math.cos(h * Math.PI / 180) * rr, pyp = cy + Math.sin(h * Math.PI / 180) * rr;
        x.beginPath(); x.arc(pxp, pyp, 6, 0, 7);
        x.fillStyle = "#fff"; x.fill();
        x.strokeStyle = "#111"; x.lineWidth = 2; x.stroke();
        w2.lab.textContent = "h " + Math.round(h) + ", s " + Math.round(s);
      });
    }
    DS._wheelsDraw = drawWheels;
    wheels.forEach(function (w2) {
      function setFromEvent(e) {
        var r = w2.cv.getBoundingClientRect();
        var dx = (e.clientX - r.left) * (96 / r.width) - 48;
        var dy = (e.clientY - r.top) * (96 / r.height) - 48;
        var h = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360);
        var s = Math.round(Math.min(1, Math.sqrt(dx * dx + dy * dy) / 40) * 100);
        Pset(w2.key + ".h")(h); Pset(w2.key + ".s")(s);
        drawWheels(); scheduleRender();
      }
      w2.cv.addEventListener("pointerdown", function (e) {
        var L = guard(); if (!L || !beginSession(L)) return;
        w2.cv.setPointerCapture(e.pointerId);
        w2._drag = true; setFromEvent(e);
      });
      w2.cv.addEventListener("pointermove", function (e) { if (w2._drag) setFromEvent(e); });
      w2.cv.addEventListener("pointerup", function () {
        if (w2._drag) { w2._drag = false; pushHistory("Grade " + w2.key); saveDev(); }
      });
      var lrow = sliderRow("Luminance", -100, 100, 1, Pget(w2.key + ".lum"), Pset(w2.key + ".lum"));
      var wrap = el("div", "dv-wheelcell");
      wrap.appendChild(lrow);
      b.appendChild(wrap);
    });
    b.appendChild(sliderRow("Blending", 0, 100, 1, Pget("grade.blend"), Pset("grade.blend")));
    b.appendChild(sliderRow("Balance", -100, 100, 1, Pget("grade.balance"), Pset("grade.balance")));
    drawWheels();
  }

  function buildDetail(acc) {
    var b = acc._body;
    b.appendChild(sliderRow("Sharpening", 0, 150, 1, Pget("detail.sharpen"), Pset("detail.sharpen")));
    b.appendChild(sliderRow("Radius", 0.5, 3, 0.1, Pget("detail.radius"), Pset("detail.radius")));
    b.appendChild(sliderRow("Luminance NR", 0, 100, 1, Pget("detail.lumNR"), Pset("detail.lumNR")));
    b.appendChild(sliderRow("Color NR", 0, 100, 1, Pget("detail.colorNR"), Pset("detail.colorNR")));
    b.appendChild(el("div", "px-hint", "Sharpening uses a real 3x3 unsharp kernel. NR blurs luminance and chroma separately."));
  }
  function buildEffects(acc) {
    var b = acc._body;
    b.appendChild(el("div", "dv-subhead", "Vignette"));
    b.appendChild(sliderRow("Amount", -100, 100, 1, Pget("effects.vignette.amount"), Pset("effects.vignette.amount")));
    b.appendChild(sliderRow("Midpoint", 0, 100, 1, Pget("effects.vignette.midpoint"), Pset("effects.vignette.midpoint")));
    b.appendChild(sliderRow("Roundness", -100, 100, 1, Pget("effects.vignette.roundness"), Pset("effects.vignette.roundness")));
    b.appendChild(sliderRow("Feather", 0, 100, 1, Pget("effects.vignette.feather"), Pset("effects.vignette.feather")));
    b.appendChild(el("div", "dv-subhead", "Film grain (procedural)"));
    b.appendChild(sliderRow("Amount", 0, 100, 1, Pget("effects.grain.amount"), Pset("effects.grain.amount")));
    b.appendChild(sliderRow("Size", 0, 100, 1, Pget("effects.grain.size"), Pset("effects.grain.size")));
    b.appendChild(sliderRow("Roughness", 0, 100, 1, Pget("effects.grain.roughness"), Pset("effects.grain.roughness")));
  }
  function buildCalibration(acc) {
    var b = acc._body;
    b.appendChild(sliderRow("Shadow tint", -100, 100, 1, Pget("calibration.shadowTint"), Pset("calibration.shadowTint")));
    [["red", "Red primary"], ["green", "Green primary"], ["blue", "Blue primary"]].forEach(function (pp) {
      b.appendChild(el("div", "dv-subhead", T.esc(pp[1])));
      b.appendChild(sliderRow("Hue shift", -100, 100, 1, Pget("calibration." + pp[0] + ".h"), Pset("calibration." + pp[0] + ".h")));
      b.appendChild(sliderRow("Sat shift", -100, 100, 1, Pget("calibration." + pp[0] + ".s"), Pset("calibration." + pp[0] + ".s")));
    });
  }
  function buildLens(acc) {
    var b = acc._body;
    b.appendChild(sliderRow("Chromatic aberration", 0, 100, 1, Pget("lens.ca"), Pset("lens.ca")));
    b.appendChild(sliderRow("Vignette correction", 0, 100, 1, Pget("lens.vignetteCorr"), Pset("lens.vignetteCorr")));
    b.appendChild(el("div", "px-hint", "Both are approximations computed per pixel, no lens profile database."));
  }

  function buildDevelopPanel(host) {
    var p = panelShell("Develop");
    var bar = btnBar();
    bar.appendChild(mkBtn("Apply", true, function () {
      var L = guard(); if (!L || !beginSession(L)) return;
      renderDev();
      DS.ses.data = null; DS.ses.layerId = null;
      DS.params = PXL.neutralParams();
      DS.masks = []; DS.selMask = null; DS.maskTool = null;
      DS.viewMode = "normal"; DS.clip = null;
      refreshAll(); renderMasksList(); drawMaskOverlay();
      composite(); saveDev();
      pushHistory("Develop applied");
      T.toast("Develop applied");
    }, "Bake the develop settings into the layer"));
    bar.appendChild(mkBtn("Reset", false, function () {
      endSession(false);
      DS.params = PXL.neutralParams();
      DS.masks = []; DS.selMask = null; DS.maskTool = null;
      DS.viewMode = "normal"; DS.clip = null;
      refreshAll(); renderMasksList(); drawMaskOverlay();
      saveDev(); pushHistory("Develop reset");
    }, "Discard the develop session"));
    bar.appendChild(mkBtn("Export", false, openExport, "Export the developed image"));
    p.appendChild(bar);
    var accs = [
      ["Basic tone and presence", true, buildBasic],
      ["Tone curve", false, buildCurve],
      ["HSL mixer", false, buildHSL],
      ["Color grading", false, buildGrading],
      ["Detail", false, buildDetail],
      ["Effects", false, buildEffects],
      ["Calibration", false, buildCalibration],
      ["Lens", false, buildLens]
    ];
    accs.forEach(function (a) {
      var ac = accordion(a[0], a[1]);
      a[2](ac);
      p.appendChild(ac);
    });
    host.appendChild(p);
  }

  /* ================= HISTOGRAM ================= */
  var histCv = null;
  function drawHistogram() {
    if (!histCv) return;
    var x = histCv.getContext("2d");
    var W = 280, H = 120;
    x.clearRect(0, 0, W, H);
    x.globalCompositeOperation = "source-over";
    var L = activeLayer();
    if (L && L.canvas && L.canvas.width) {
      var d;
      try { d = L.canvas.getContext("2d").getImageData(0, 0, L.canvas.width, L.canvas.height).data; }
      catch (e) { d = null; }
      if (d) {
        var hb = PXL.histogram(d), mx = 1, i;
        for (i = 0; i < 256; i++) {
          if (hb.r[i] > mx) mx = hb.r[i];
          if (hb.g[i] > mx) mx = hb.g[i];
          if (hb.b[i] > mx) mx = hb.b[i];
          if (hb.lum[i] > mx) mx = hb.lum[i];
        }
        var clip = PXL.clippingStats(d);
        DS._clipStats = clip;
        function path(bins, color) {
          x.beginPath();
          x.moveTo(0, H);
          for (var k = 0; k < 256; k++) {
            x.lineTo((k / 255) * W, H - (bins[k] / mx) * (H - 8));
          }
          x.lineTo(W, H); x.closePath();
          x.fillStyle = color; x.fill();
        }
        path(hb.lum, "rgba(255,255,255,0.35)");
        x.globalCompositeOperation = "screen";
        path(hb.r, "rgba(239,68,68,0.55)");
        path(hb.g, "rgba(16,185,129,0.55)");
        path(hb.b, "rgba(59,130,246,0.55)");
        x.globalCompositeOperation = "source-over";
      }
    }
    /* corner clipping triangles */
    function tri(left, color, on) {
      x.beginPath();
      if (left) { x.moveTo(2, 2); x.lineTo(18, 2); x.lineTo(2, 18); }
      else { x.moveTo(W - 2, 2); x.lineTo(W - 18, 2); x.lineTo(W - 2, 18); }
      x.closePath();
      x.fillStyle = on ? color : "rgba(128,128,128,0.25)";
      x.fill();
    }
    tri(true, "#3B82F6", DS.clip === "shadows");
    tri(false, "#EF4444", DS.clip === "highlights");
  }
  function scheduleHistDraw() {
    if (DS.histTimer) clearTimeout(DS.histTimer);
    DS.histTimer = setTimeout(drawHistogram, 120);
  }
  function cycleClip() {
    var L = guard(); if (!L || !beginSession(L)) return;
    DS.clip = DS.clip === null ? "shadows" : (DS.clip === "shadows" ? "highlights" : null);
    renderDev();
    T.toast(DS.clip === null ? "Clipping overlays off" :
      (DS.clip === "shadows" ? "Shadow clipping: pure black shown blue" : "Highlight clipping: pure white shown red"));
  }

  var ZONES = [
    { label: "Blacks", key: "blacks", min: -100, max: 100 },
    { label: "Shadows", key: "shadows", min: -100, max: 100 },
    { label: "Exposure", key: "exposure", min: -5, max: 5 },
    { label: "Highlights", key: "highlights", min: -100, max: 100 },
    { label: "Whites", key: "whites", min: -100, max: 100 }
  ];
  function buildHistogramPanel(host) {
    var p = panelShell("Develop histogram");
    histCv = document.createElement("canvas");
    histCv.width = 280; histCv.height = 120; histCv.className = "dv-hist";
    histCv.setAttribute("aria-label", "RGB and luminance histogram");
    p.appendChild(histCv);
    var zones = el("div", "dv-zones");
    ZONES.forEach(function (z) {
      var zd = el("div", "dv-zone", '<span class="dv-zlab">' + T.esc(z.label) + '</span><span class="dv-zval">0</span>');
      zd.title = "Drag horizontally to adjust " + z.label;
      (function (zone, node) {
        var valEl = node.querySelector(".dv-zval");
        function sync() { valEl.textContent = fmtVal(Pget(zone.key)()); }
        refreshers.push(sync); sync();
        var sx = 0, sv = 0, dragging = false;
        node.addEventListener("pointerdown", function (e) {
          var L = guard(); if (!L || !beginSession(L)) return;
          dragging = true; sx = e.clientX; sv = Pget(zone.key)();
          node.setPointerCapture(e.pointerId);
        });
        node.addEventListener("pointermove", function (e) {
          if (!dragging) return;
          var range = zone.max - zone.min;
          var v = sv + ((e.clientX - sx) / 160) * range;
          v = Math.max(zone.min, Math.min(zone.max, v));
          Pset(zone.key)(Math.round(v * 10) / 10);
          sync(); scheduleRender();
        });
        node.addEventListener("pointerup", function () {
          if (dragging) {
            dragging = false;
            refreshAll(); /* sync the matching Basic slider */
            pushHistory(zone.label + " zone " + fmtVal(Pget(zone.key)()));
            saveDev();
          }
        });
      })(z, zd);
      zones.appendChild(zd);
    });
    p.appendChild(zones);
    var row = btnBar();
    row.appendChild(mkBtn("Clip: J", false, cycleClip, "Toggle shadow/highlight clipping overlays"));
    row.appendChild(mkBtn("Before: \\", false, toggleBefore, "Toggle full before/after"));
    row.appendChild(mkBtn("Split: Y", false, toggleSplit, "Toggle side-by-side before/after"));
    row.appendChild(mkBtn("Wipe", false, toggleWipe, "Draggable wipe divider"));
    p.appendChild(row);
    p.appendChild(el("div", "px-hint", "J toggles clipping overlays. Backslash shows the original. Y splits the view."));
    host.appendChild(p);
  }
  function toggleBefore() {
    var L = guard(); if (!L || !beginSession(L)) return;
    DS.viewMode = DS.viewMode === "before" ? "normal" : "before";
    renderDev();
  }
  function toggleSplit() {
    var L = guard(); if (!L || !beginSession(L)) return;
    DS.viewMode = DS.viewMode === "split" ? "normal" : "split";
    renderDev();
  }
  function toggleWipe() {
    var L = guard(); if (!L || !beginSession(L)) return;
    DS.viewMode = DS.viewMode === "wipe" ? "normal" : "wipe";
    DS.maskTool = null;
    drawMaskOverlay();
    renderDev();
    T.toast(DS.viewMode === "wipe" ? "Drag on the image to move the wipe divider" : "Wipe divider off");
  }

  /* ================= PRESETS ================= */
  var presetsHost = null;
  function userPresets() {
    try { return JSON.parse(localStorage.getItem("pxl.userPresets") || "[]"); }
    catch (e) { return []; }
  }
  function saveUserPresets(list) {
    try { localStorage.setItem("pxl.userPresets", JSON.stringify(list)); } catch (e) {}
  }
  function applyPresetParams(scaled, label) {
    var L = guard(); if (!L || !beginSession(L)) return;
    DS.params = scaled;
    DS.params._lutCache = null;
    refreshAll(); scheduleRender();
    pushHistory("Preset " + label);
    saveDev();
  }
  function renderPresets() {
    if (!presetsHost) return;
    presetsHost.innerHTML = "";
    var groups = {};
    PXL.PRESET_FOLDERS.forEach(function (f) { groups[f] = []; });
    PXL.BUILTIN_PRESETS.forEach(function (pr) { (groups[pr.folder] = groups[pr.folder] || []).push(pr); });
    userPresets().forEach(function (pr) {
      var f = pr.folder || "My presets";
      (groups[f] = groups[f] || []).push(pr);
    });
    Object.keys(groups).forEach(function (folder) {
      var list = groups[folder];
      if (!list.length) return;
      var sec = el("div", "dv-pfolder");
      sec.appendChild(el("div", "dv-pftitle", T.esc(folder) + ' <span class="dv-pfcount">' + list.length + "</span>"));
      var grid = el("div", "dv-pgrid");
      list.forEach(function (pr) {
        var b2 = el("button", "dv-preset", T.esc(pr.name));
        b2.type = "button";
        b2.addEventListener("mouseenter", function () {
          if (!DS.ses.data) return; /* preview needs an active develop session */
          DS._hoverBackup = DS.params;
          DS.params = PXL.scalePreset(pr, DS.intensity);
          DS.params._lutCache = null;
          renderDev();
        });
        b2.addEventListener("mouseleave", function () {
          if (DS._hoverBackup) {
            DS.params = DS._hoverBackup;
            DS._hoverBackup = null;
            renderDev();
          }
        });
        b2.addEventListener("click", function () {
          DS._hoverBackup = null;
          applyPresetParams(PXL.scalePreset(pr, DS.intensity), pr.name);
          T.toast("Preset applied: " + pr.name);
        });
        grid.appendChild(b2);
      });
      sec.appendChild(grid);
      presetsHost.appendChild(sec);
    });
  }
  function openNewPresetModal() {
    var ov = el("div", "px-overlay");
    ov.innerHTML = '<div class="px-modal" role="dialog"><div class="px-mhead"><span>New preset</span></div><div class="px-mbody"></div></div>';
    var body = ov.querySelector(".px-mbody");
    function field(label, node) {
      var w = el("label", "dv-pfield", "");
      w.appendChild(el("span", "px-slab", T.esc(label)));
      w.appendChild(node);
      body.appendChild(w);
    }
    var nameIn = document.createElement("input");
    nameIn.type = "text"; nameIn.placeholder = "e.g. H3NZ Dawn"; nameIn.maxLength = 40;
    field("Preset name", nameIn);
    var folderSel = document.createElement("select");
    PXL.PRESET_FOLDERS.concat(["My presets"]).forEach(function (f) {
      var o = document.createElement("option");
      o.value = f; o.textContent = f;
      folderSel.appendChild(o);
    });
    folderSel.value = "My presets";
    field("Folder", folderSel);
    body.appendChild(el("div", "dv-subhead", "Include parameter groups"));
    var groups = el("div", "dv-pgroups");
    Object.keys(GROUP_KEYS).forEach(function (g2) {
      var lb = el("label", "dv-pg", "");
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.setAttribute("data-g", g2);
      lb.appendChild(cb);
      lb.appendChild(document.createTextNode(" " + g2));
      groups.appendChild(lb);
    });
    body.appendChild(groups);
    var bar = btnBar();
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    bar.appendChild(mkBtn("Cancel", false, close));
    bar.appendChild(mkBtn("Save preset", true, function () {
      var name = nameIn.value.trim();
      if (!name) { T.toast("Give the preset a name", "error"); return; }
      var sel = [];
      $$("input[data-g]", groups).forEach(function (cb) { if (cb.checked) sel.push(cb.getAttribute("data-g")); });
      if (!sel.length) { T.toast("Pick at least one group", "error"); return; }
      var partial = {};
      sel.forEach(function (g2) {
        GROUP_KEYS[g2].forEach(function (k) {
          partial[k] = JSON.parse(JSON.stringify(DS.params[k]));
        });
      });
      var list = userPresets();
      list.push({ name: name.slice(0, 40), folder: folderSel.value, params: partial });
      saveUserPresets(list);
      renderPresets();
      close();
      T.toast("Preset saved");
    }));
    body.appendChild(bar);
    document.body.appendChild(ov);
    setTimeout(function () { nameIn.focus(); }, 30);
  }
  var GROUP_KEYS = {
    basic: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "clarity", "dehaze", "vibrance", "saturation", "temp", "tint", "bw", "tone"],
    curve: ["curve"], hsl: ["hsl"], grading: ["grade"],
    detail: ["detail"], effects: ["effects"], calibration: ["calibration"], lens: ["lens"]
  };
  function buildPresetsPanel(host) {
    var p = panelShell("Presets");
    p.appendChild(sliderRow("Intensity", 0, 200, 1,
      function () { return DS.intensity; },
      function (v) { DS.intensity = v; },
      { def: 100 }));
    presetsHost = el("div", "dv-presets");
    p.appendChild(presetsHost);
    var bar = btnBar();
    bar.appendChild(mkBtn("+ New preset", false, openNewPresetModal));
    bar.appendChild(mkBtn("Export JSON", false, function () {
      var blob = new Blob([JSON.stringify(userPresets(), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pxl-presets.json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }));
    bar.appendChild(mkBtn("Import JSON", false, function () {
      var fi = document.createElement("input");
      fi.type = "file"; fi.accept = "application/json,.json";
      fi.addEventListener("change", function () {
        var f = fi.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var arr = JSON.parse(rd.result);
            if (!Array.isArray(arr)) throw new Error("bad file");
            var list = userPresets();
            arr.forEach(function (pr) {
              if (pr && pr.name && pr.params) list.push({ name: String(pr.name).slice(0, 40), folder: pr.folder || "My presets", params: pr.params });
            });
            saveUserPresets(list); renderPresets();
            T.toast("Presets imported");
          } catch (e) { T.toast("Could not read that JSON file", "error"); }
        };
        rd.readAsText(f);
      });
      fi.click();
    }));
    p.appendChild(bar);
    host.appendChild(p);
    renderPresets();
  }

  /* ================= HISTORY + SNAPSHOTS ================= */
  var histListEl = null, snapListEl = null;
  function renderHistoryList() {
    if (!histListEl) return;
    histListEl.innerHTML = "";
    for (var i = DS.history.length - 1; i >= 0; i--) {
      (function (idx) {
        var b2 = el("button", "dv-histrow", T.esc(DS.history[idx].label));
        b2.type = "button";
        b2.addEventListener("click", function () {
          var L = guard(); if (!L || !beginSession(L)) return;
          restoreState(DS.history[idx]);
          pushHistory("Restored: " + DS.history[idx].label);
          saveDev();
        });
        histListEl.appendChild(b2);
      })(i);
    }
    if (!DS.history.length) histListEl.appendChild(el("div", "px-hint", "No edits yet. Every change is logged here."));
  }
  function renderSnapshots() {
    if (!snapListEl) return;
    snapListEl.innerHTML = "";
    DS.snapshots.forEach(function (sn, i) {
      var row = el("div", "dv-snaprow");
      var b2 = el("button", "dv-histrow dv-snapname", T.esc(sn.name));
      b2.type = "button";
      b2.addEventListener("click", function () {
        var L = guard(); if (!L || !beginSession(L)) return;
        restoreState(sn);
        pushHistory("Snapshot: " + sn.name);
        saveDev();
      });
      var del = el("button", "px-ibtn", T.icon("i-x"));
      del.type = "button"; del.title = "Delete snapshot";
      del.addEventListener("click", function () {
        DS.snapshots.splice(i, 1); saveDev(); renderSnapshots();
      });
      row.appendChild(b2); row.appendChild(del);
      snapListEl.appendChild(row);
    });
  }
  function buildHistoryPanel(host) {
    var p = panelShell("History");
    var bar = btnBar();
    bar.appendChild(mkBtn("Snapshot", false, function () {
      T.modal({
        title: "Save snapshot",
        fields: [{ key: "name", label: "Snapshot name", type: "text", value: "Snapshot " + (DS.snapshots.length + 1) }],
        okText: "Save"
      }).then(function (res) {
        if (!res || !res.name) return;
        DS.snapshots.push({ name: String(res.name).slice(0, 40), params: PXL.cloneParams(DS.params), masks: cloneMasks(DS.masks) });
        saveDev(); renderSnapshots();
        T.toast("Snapshot saved");
      });
    }, "Save the current settings as a named snapshot"));
    p.appendChild(bar);
    snapListEl = el("div", "dv-snaps");
    p.appendChild(snapListEl);
    histListEl = el("div", "dv-histlist");
    p.appendChild(histListEl);
    host.appendChild(p);
    renderHistoryList(); renderSnapshots();
  }

  /* ================= MASKS ================= */
  var masksListEl = null, maskEditEl = null;
  var MASK_ADJ = [
    ["exposure", "Exposure", -5, 5, 0.1], ["temp", "Temp", -100, 100, 1],
    ["contrast", "Contrast", -100, 100, 1], ["highlights", "Highlights", -100, 100, 1],
    ["shadows", "Shadows", -100, 100, 1], ["saturation", "Saturation", -100, 100, 1]
  ];
  function newMask(type, label) {
    maskSeq++;
    return {
      id: "m" + Date.now().toString(36) + (maskSeq),
      type: type, label: label, enabled: true, invert: false, feather: 50,
      geom: type === "linear" ? { x0: 0.25, y0: 0.5, x1: 0.75, y1: 0.5 } :
        type === "radial" ? { cx: 0.5, cy: 0.5, rx: 0.28, ry: 0.28 } :
        type === "heuristic" ? { kind: "subject" } : null,
      strokes: [],
      adj: { exposure: 0, temp: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0 }
    };
  }
  function selMaskObj() {
    return DS.masks.find(function (m) { return m.id === DS.selMask; }) || null;
  }
  function renderMasksList() {
    if (!masksListEl) return;
    masksListEl.innerHTML = "";
    DS.masks.forEach(function (m) {
      var row = el("div", "dv-maskrow" + (m.id === DS.selMask ? " sel" : ""));
      var en = document.createElement("input");
      en.type = "checkbox"; en.checked = m.enabled !== false; en.title = "Enable mask";
      en.setAttribute("aria-label", "Enable " + m.label);
      en.addEventListener("change", function () { m.enabled = en.checked; scheduleRender(); saveDev(); });
      var lb = el("button", "dv-maskname", T.esc(m.label));
      lb.type = "button";
      lb.addEventListener("click", function () {
        DS.selMask = m.id;
        DS.maskTool = (m.type === "linear" || m.type === "radial" || m.type === "brush") ? m.type : null;
        renderMasksList(); renderMaskEdit(); drawMaskOverlay();
      });
      row.appendChild(en); row.appendChild(lb);
      if (m.type === "radial" || m.type === "heuristic") {
        var inv = el("button", "px-ibtn" + (m.invert ? " on" : ""), T.icon("i-eye"));
        inv.type = "button"; inv.title = "Invert mask";
        inv.addEventListener("click", function () { m.invert = !m.invert; inv.classList.toggle("on", m.invert); scheduleRender(); saveDev(); });
        row.appendChild(inv);
      }
      var del = el("button", "px-ibtn", T.icon("i-x"));
      del.type = "button"; del.title = "Delete mask";
      del.addEventListener("click", function () {
        DS.masks = DS.masks.filter(function (x) { return x.id !== m.id; });
        if (DS.selMask === m.id) { DS.selMask = null; DS.maskTool = null; }
        renderMasksList(); renderMaskEdit(); drawMaskOverlay(); scheduleRender(); saveDev();
        pushHistory("Mask deleted");
      });
      row.appendChild(del);
      masksListEl.appendChild(row);
    });
    if (!DS.masks.length) masksListEl.appendChild(el("div", "px-hint", "No masks. Add one below, then paint or drag on the image."));
  }
  function renderMaskEdit() {
    if (!maskEditEl) return;
    maskEditEl.innerHTML = "";
    var m = selMaskObj();
    if (!m) return;
    maskEditEl.appendChild(el("div", "dv-subhead", T.esc(m.label) + " adjustments"));
    if (m.type === "brush") {
      maskEditEl.appendChild(sliderRow("Brush size", 4, 120, 1,
        function () { return DS.brushSize; },
        function (v) { DS.brushSize = v; }));
    }
    maskEditEl.appendChild(sliderRow("Feather", 0, 100, 1,
      function () { return m.feather; },
      function (v) { m.feather = v; }));
    MASK_ADJ.forEach(function (dd) {
      maskEditEl.appendChild(sliderRow(dd[1], dd[2], dd[3], dd[4],
        (function (k) { return function () { return m.adj[k] || 0; }; })(dd[0]),
        (function (k) { return function (v) { m.adj[k] = v; }; })(dd[0])));
    });
    var bar = btnBar();
    bar.appendChild(mkBtn("Clear strokes", false, function () {
      m.strokes = []; drawMaskOverlay(); scheduleRender(); saveDev();
    }));
    maskEditEl.appendChild(bar);
  }
  function buildMasksPanel(host) {
    var p = panelShell("Masks");
    var bar = btnBar();
    function addMask(type, label, tool) {
      return function () {
        var L = guard(); if (!L || !beginSession(L)) return;
        var m = newMask(type, label);
        if (type === "heuristic") m.label = label + " (beta heuristic)";
        DS.masks.push(m);
        DS.selMask = m.id;
        DS.maskTool = tool;
        renderMasksList(); renderMaskEdit(); drawMaskOverlay();
        pushHistory("Mask added: " + m.label);
        saveDev();
        if (tool) T.toast("Drag on the image to shape the " + type + " mask");
      };
    }
    bar.appendChild(mkBtn("Linear", false, addMask("linear", "Linear gradient", "linear"), "Drag on the image to set the gradient"));
    bar.appendChild(mkBtn("Radial", false, addMask("radial", "Radial gradient", "radial"), "Drag on the image to size the ellipse"));
    bar.appendChild(mkBtn("Brush", false, addMask("brush", "Brush", "brush"), "Paint the mask on the image"));
    p.appendChild(bar);
    var bar2 = btnBar();
    bar2.appendChild(mkBtn("Heuristic subject", false, addMask("heuristic", "Subject", null), "Beta heuristic: skin-tone region detection, not AI"));
    bar2.appendChild(mkBtn("Heuristic sky", false, function () {
      var L = guard(); if (!L || !beginSession(L)) return;
      var m = newMask("heuristic", "Sky");
      m.label = "Sky (beta heuristic)";
      m.geom = { kind: "sky" };
      DS.masks.push(m); DS.selMask = m.id; DS.maskTool = null;
      renderMasksList(); renderMaskEdit(); drawMaskOverlay();
      pushHistory("Mask added: " + m.label); saveDev();
    }, "Beta heuristic: blue upper-region detection, not AI"));
    p.appendChild(bar2);
    p.appendChild(el("div", "px-hint", "Heuristic selects are beta approximations (luminance and color rules), never AI."));
    masksListEl = el("div", "dv-masklist");
    p.appendChild(masksListEl);
    maskEditEl = el("div", "dv-maskedit");
    p.appendChild(maskEditEl);
    host.appendChild(p);
    renderMasksList();
  }

  /* ---- mask overlay canvas ---- */
  var maskOv = null;
  function buildMaskOverlay() {
    var wrap = document.getElementById("pCanvasWrap");
    if (!wrap || maskOv) return;
    maskOv = document.createElement("canvas");
    maskOv.id = "dvMaskOv";
    maskOv.className = "dv-maskov";
    maskOv.style.display = "none";
    wrap.appendChild(maskOv);
    maskOv.addEventListener("pointerdown", onOvDown);
    maskOv.addEventListener("pointermove", onOvMove);
    maskOv.addEventListener("pointerup", onOvUp);
    placeOverlay();
  }
  function placeOverlay() {
    if (!maskOv) buildMaskOverlay();
    if (!maskOv) return;
    var wrap = document.getElementById("pCanvasWrap");
    var comp = document.getElementById("pComposite");
    var L = activeLayer();
    if (!wrap || !comp || !L || !L.canvas) { maskOv.style.display = "none"; return; }
    if (L.canvas.width !== maskOv.width || L.canvas.height !== maskOv.height) {
      maskOv.width = L.canvas.width; maskOv.height = L.canvas.height;
    }
    var r1 = comp.getBoundingClientRect(), r2 = wrap.getBoundingClientRect();
    maskOv.style.left = (r1.left - r2.left + wrap.scrollLeft) + "px";
    maskOv.style.top = (r1.top - r2.top + wrap.scrollTop) + "px";
    maskOv.style.width = r1.width + "px";
    maskOv.style.height = r1.height + "px";
    var show = !!(DS.maskTool || DS.targeted || DS.viewMode === "wipe");
    maskOv.style.display = show ? "block" : "none";
    maskOv.style.pointerEvents = show ? "auto" : "none";
  }
  function ovDoc(e) {
    var r = maskOv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / Math.max(1, r.width) * maskOv.width,
      y: (e.clientY - r.top) / Math.max(1, r.height) * maskOv.height
    };
  }
  var ovDrag = null;
  function onOvDown(e) {
    var L = guard(); if (!L || !beginSession(L)) return;
    var p = ovDoc(e);
    if (DS.targeted) {
      var d;
      try { d = L.canvas.getContext("2d").getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data; }
      catch (err) { return; }
      var hsl = PXL.rgb2hsl(d[0] / 255, d[1] / 255, d[2] / 255);
      var sector = Math.floor((((hsl[0] + 22.5) % 360) + 360) % 360 / 45) % 8;
      ovDrag = { mode: "targeted", sector: sector, y0: e.clientY, s0: DS.params.hsl[PXL.HUE_NAMES[sector]].s };
      maskOv.setPointerCapture(e.pointerId);
      return;
    }
    if (DS.viewMode === "wipe" && !DS.maskTool) {
      ovDrag = { mode: "wipe" };
      DS.wipeFrac = p.x / maskOv.width;
      scheduleRender(); drawMaskOverlay();
      maskOv.setPointerCapture(e.pointerId);
      return;
    }
    var m = selMaskObj();
    if (!m) return;
    if (DS.maskTool === "linear" && m.type === "linear") {
      m.geom = { x0: p.x / maskOv.width, y0: p.y / maskOv.height, x1: p.x / maskOv.width, y1: p.y / maskOv.height };
      ovDrag = { mode: "linear" };
    } else if (DS.maskTool === "radial" && m.type === "radial") {
      m.geom = { cx: p.x / maskOv.width, cy: p.y / maskOv.height, rx: 0.05, ry: 0.05 };
      ovDrag = { mode: "radial" };
    } else if (DS.maskTool === "brush" && m.type === "brush") {
      ovDrag = { mode: "brush" };
      m.strokes.push({ x: p.x, y: p.y, r: DS.brushSize, feather: 50, flow: 80 });
    }
    if (ovDrag) { maskOv.setPointerCapture(e.pointerId); drawMaskOverlay(); }
  }
  function onOvMove(e) {
    if (!ovDrag) return;
    var m = selMaskObj();
    var p = ovDoc(e);
    if (ovDrag.mode === "targeted" && m !== undefined) {
      var ds = -((e.clientY - ovDrag.y0) / 2);
      var nv = Math.max(-100, Math.min(100, ovDrag.s0 + ds));
      DS.params.hsl[PXL.HUE_NAMES[ovDrag.sector]].s = Math.round(nv);
      refreshAll(); scheduleRender();
      return;
    }
    if (ovDrag.mode === "wipe") {
      DS.wipeFrac = Math.max(0, Math.min(1, p.x / maskOv.width));
      scheduleRender(); drawMaskOverlay();
      return;
    }
    if (!m) return;
    if (ovDrag.mode === "linear" && m.geom) {
      m.geom.x1 = p.x / maskOv.width; m.geom.y1 = p.y / maskOv.height;
    } else if (ovDrag.mode === "radial" && m.geom) {
      m.geom.rx = Math.max(0.02, Math.abs(p.x / maskOv.width - m.geom.cx));
      m.geom.ry = Math.max(0.02, Math.abs(p.y / maskOv.height - m.geom.cy));
    } else if (ovDrag.mode === "brush") {
      var last = m.strokes[m.strokes.length - 1];
      if (last && Math.hypot(last.x - p.x, last.y - p.y) > 6) {
        m.strokes.push({ x: p.x, y: p.y, r: DS.brushSize, feather: 50, flow: 80 });
      }
    }
    drawMaskOverlay(); scheduleRender();
  }
  function onOvUp() {
    if (!ovDrag) return;
    var mode = ovDrag.mode;
    ovDrag = null;
    drawMaskOverlay(); scheduleRender(); saveDev();
    if (mode === "linear") pushHistory("Linear mask shaped");
    else if (mode === "radial") pushHistory("Radial mask shaped");
    else if (mode === "brush") pushHistory("Brush mask painted");
    else if (mode === "targeted") pushHistory("Targeted HSL adjust");
  }
  function drawMaskOverlay() {
    placeOverlay();
    if (!maskOv || maskOv.style.display === "none") return;
    var x = maskOv.getContext("2d");
    var W = maskOv.width, H = maskOv.height;
    x.clearRect(0, 0, W, H);
    var m = selMaskObj();
    if (DS.viewMode === "wipe") {
      var wx = DS.wipeFrac * W;
      x.strokeStyle = "#EC4899"; x.lineWidth = Math.max(2, W / 400);
      x.beginPath(); x.moveTo(wx, 0); x.lineTo(wx, H); x.stroke();
      x.fillStyle = "#EC4899";
      x.beginPath(); x.arc(wx, 24, 8, 0, 7); x.fill();
    }
    if (!m || !DS.maskTool) return;
    if (m.type === "linear" && m.geom) {
      var g = m.geom;
      x.strokeStyle = "#EC4899"; x.lineWidth = Math.max(2, W / 400);
      x.beginPath(); x.moveTo(g.x0 * W, g.y0 * H); x.lineTo(g.x1 * W, g.y1 * H); x.stroke();
      [[g.x0, g.y0], [g.x1, g.y1]].forEach(function (pt) {
        x.beginPath(); x.arc(pt[0] * W, pt[1] * H, 8, 0, 7);
        x.fillStyle = "#EC4899"; x.fill();
      });
    } else if (m.type === "radial" && m.geom) {
      x.strokeStyle = "#EC4899"; x.lineWidth = Math.max(2, W / 400);
      x.beginPath();
      x.ellipse(m.geom.cx * W, m.geom.cy * H, m.geom.rx * W, m.geom.ry * H, 0, 0, 7);
      x.stroke();
    } else if ((m.type === "brush" || m.type === "heuristic") && DS.ses.data) {
      var wgt = PXL.buildMaskWeights(m, W, H, DS.ses.data.data);
      var off = document.createElement("canvas");
      off.width = W; off.height = H;
      var ox = off.getContext("2d");
      var img = ox.createImageData(W, H);
      for (var i = 0; i < wgt.length; i++) {
        img.data[i * 4] = 236; img.data[i * 4 + 1] = 72; img.data[i * 4 + 2] = 153;
        img.data[i * 4 + 3] = Math.round(wgt[i] * 110);
      }
      ox.putImageData(img, 0, 0);
      x.drawImage(off, 0, 0);
    }
  }

  /* ================= FILMSTRIP ================= */
  var filmEl = null;
  function srand(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function sceneCanvas(paint) {
    var c = document.createElement("canvas");
    c.width = 320; c.height = 200;
    paint(c.getContext("2d"), 320, 200);
    return c;
  }
  function vgrad(x, w, h, stops) {
    var g = x.createLinearGradient(0, 0, 0, h);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  var SCENES = [
    ["Sunset Dunes", function (x, w, h) {
      vgrad(x, w, h, [[0, "#2b1055"], [0.55, "#ff7e5f"], [1, "#feb47b"]]);
      x.fillStyle = "#ffe9a8"; x.beginPath(); x.arc(w * 0.62, h * 0.52, 26, 0, 7); x.fill();
      x.fillStyle = "#7a3b2e";
      x.beginPath(); x.moveTo(0, h * 0.72);
      x.quadraticCurveTo(w * 0.3, h * 0.6, w * 0.6, h * 0.74);
      x.quadraticCurveTo(w * 0.85, h * 0.85, w, h * 0.7);
      x.lineTo(w, h); x.lineTo(0, h); x.fill();
      x.fillStyle = "#5a2a22";
      x.beginPath(); x.moveTo(0, h * 0.88);
      x.quadraticCurveTo(w * 0.4, h * 0.8, w, h * 0.92);
      x.lineTo(w, h); x.lineTo(0, h); x.fill();
    }],
    ["Mountain Lake", function (x, w, h) {
      vgrad(x, w, h, [[0, "#0f2a5c"], [0.55, "#3b82c4"], [1, "#9fd0ef"]]);
      var rnd = srand(11);
      x.fillStyle = "#4a5a6a";
      for (var i = 0; i < 4; i++) {
        var bx = i * w / 3.2 - 20, bw = w / 2.6, bh = h * (0.35 + rnd() * 0.2);
        x.beginPath(); x.moveTo(bx, h * 0.62); x.lineTo(bx + bw / 2, h * 0.62 - bh); x.lineTo(bx + bw, h * 0.62); x.fill();
        x.fillStyle = "#e8eef4";
        x.beginPath(); x.moveTo(bx + bw / 2 - bw * 0.12, h * 0.62 - bh * 0.76); x.lineTo(bx + bw / 2, h * 0.62 - bh); x.lineTo(bx + bw / 2 + bw * 0.12, h * 0.62 - bh * 0.76); x.fill();
        x.fillStyle = "#4a5a6a";
      }
      x.fillStyle = "#2c5f8a"; x.fillRect(0, h * 0.62, w, h * 0.38);
      x.fillStyle = "rgba(255,255,255,0.25)";
      for (var j = 0; j < 14; j++) x.fillRect(rnd() * w, h * 0.64 + rnd() * h * 0.3, 20 + rnd() * 40, 2);
    }],
    ["Forest Path", function (x, w, h) {
      vgrad(x, w, h, [[0, "#0d3b1e"], [1, "#123f22"]]);
      var rnd = srand(23);
      for (var i = 0; i < 9; i++) {
        var tx = rnd() * w, tw = 8 + rnd() * 14;
        x.fillStyle = "#3a2415"; x.fillRect(tx, 0, tw, h);
        x.fillStyle = "#1d5c2e";
        x.beginPath(); x.moveTo(tx + tw / 2, 0); x.lineTo(tx - 34, h * 0.5); x.lineTo(tx + tw + 34, h * 0.5); x.fill();
      }
      x.fillStyle = "#c9a86a";
      x.beginPath(); x.moveTo(w * 0.42, h); x.lineTo(w * 0.48, h * 0.35); x.lineTo(w * 0.52, h * 0.35); x.lineTo(w * 0.62, h); x.fill();
    }],
    ["City Night", function (x, w, h) {
      vgrad(x, w, h, [[0, "#060a18"], [1, "#0d1830"]]);
      var rnd = srand(37);
      x.fillStyle = "#f4f1de"; x.beginPath(); x.arc(w * 0.82, h * 0.2, 16, 0, 7); x.fill();
      for (var i = 0; i < 40; i++) { x.fillStyle = "rgba(255,255,255,0.8)"; x.fillRect(rnd() * w, rnd() * h * 0.5, 1.6, 1.6); }
      for (var b = 0; b < 7; b++) {
        var bw = w / 9, bx = b * (w / 7) + 6, bh = h * (0.3 + rnd() * 0.35);
        x.fillStyle = "#101b33"; x.fillRect(bx, h - bh, bw, bh);
        for (var wy = h - bh + 6; wy < h - 8; wy += 12) for (var wx = bx + 4; wx < bx + bw - 6; wx += 10) {
          if (rnd() > 0.45) { x.fillStyle = "#ffd97a"; x.fillRect(wx, wy, 6, 7); }
        }
      }
    }],
    ["Portrait Study", function (x, w, h) {
      vgrad(x, w, h, [[0, "#8a5a3b"], [1, "#3d2418"]]);
      x.fillStyle = "#6b4a34";
      x.beginPath(); x.ellipse(w * 0.5, h * 1.02, w * 0.3, h * 0.42, 0, 0, 7); x.fill();
      x.fillStyle = "#e8b48c";
      x.beginPath(); x.ellipse(w * 0.5, h * 0.42, w * 0.11, h * 0.17, 0, 0, 7); x.fill();
      x.fillStyle = "#2b1a10";
      x.beginPath(); x.ellipse(w * 0.5, h * 0.3, w * 0.115, h * 0.1, 0, Math.PI, 0); x.fill();
      x.fillStyle = "#d69c78";
      x.beginPath(); x.ellipse(w * 0.5, h * 0.62, w * 0.045, h * 0.07, 0, 0, 7); x.fill();
      x.fillStyle = "rgba(255,255,255,0.12)";
      x.beginPath(); x.ellipse(w * 0.42, h * 0.36, w * 0.03, h * 0.05, -0.4, 0, 7); x.fill();
    }],
    ["Ocean Wave", function (x, w, h) {
      vgrad(x, w, h, [[0, "#0b3d66"], [0.6, "#1470a8"], [1, "#1f9ed1"]]);
      x.strokeStyle = "rgba(255,255,255,0.85)"; x.lineWidth = 5;
      for (var i = 0; i < 4; i++) {
        x.beginPath();
        x.moveTo(0, h * (0.45 + i * 0.14));
        x.bezierCurveTo(w * 0.3, h * (0.35 + i * 0.14), w * 0.6, h * (0.55 + i * 0.14), w, h * (0.42 + i * 0.14));
        x.stroke();
      }
      x.fillStyle = "rgba(255,255,255,0.35)";
      for (var j = 0; j < 26; j++) { var rnd = srand(j + 50); x.beginPath(); x.arc(rnd() * w, rnd() * h, 2 + rnd() * 4, 0, 7); x.fill(); }
    }],
    ["Desert Bloom", function (x, w, h) {
      vgrad(x, w, h, [[0, "#f7d08a"], [0.6, "#e8a85c"], [1, "#c97f3a"]]);
      x.fillStyle = "#fff3d6"; x.beginPath(); x.arc(w * 0.78, h * 0.26, 22, 0, 7); x.fill();
      x.fillStyle = "#3f7a3a";
      x.fillRect(w * 0.3 - 7, h * 0.45, 14, h * 0.4);
      x.fillRect(w * 0.3 - 26, h * 0.58, 20, 10);
      x.fillRect(w * 0.3 + 6, h * 0.66, 20, 10);
      var petals = ["#e8456c", "#f27ba7", "#e8456c", "#f27ba7", "#e8456c", "#f27ba7", "#e8456c", "#f27ba7"];
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        x.fillStyle = petals[i];
        x.beginPath(); x.ellipse(w * 0.3 + Math.cos(a) * 16, h * 0.38 + Math.sin(a) * 16, 12, 7, a, 0, 7); x.fill();
      }
      x.fillStyle = "#ffd94d"; x.beginPath(); x.arc(w * 0.3, h * 0.38, 9, 0, 7); x.fill();
    }],
    ["Alpine Snow", function (x, w, h) {
      vgrad(x, w, h, [[0, "#bfe0f5"], [0.55, "#e8f3fc"], [1, "#ffffff"]]);
      var rnd = srand(77);
      x.fillStyle = "#5b7a99";
      for (var i = 0; i < 3; i++) {
        var bx = i * w / 2.4 - 30, bw = w / 1.9, bh = h * 0.62;
        x.beginPath(); x.moveTo(bx, h * 0.78); x.lineTo(bx + bw / 2, h * 0.78 - bh); x.lineTo(bx + bw, h * 0.78); x.fill();
        x.fillStyle = "#ffffff";
        x.beginPath(); x.moveTo(bx + bw / 2 - bw * 0.16, h * 0.78 - bh * 0.68); x.lineTo(bx + bw / 2, h * 0.78 - bh); x.lineTo(bx + bw / 2 + bw * 0.16, h * 0.78 - bh * 0.68); x.fill();
        x.fillStyle = "#5b7a99";
      }
      x.fillStyle = "#2f5d3a";
      for (var t = 0; t < 12; t++) {
        var tx = rnd() * w, th = 18 + rnd() * 22;
        x.beginPath(); x.moveTo(tx, h - th); x.lineTo(tx - 8, h); x.lineTo(tx + 8, h); x.fill();
      }
    }]
  ];
  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
  function buildFilmstrip() {
    DS.film = {
      sel: 0,
      photos: SCENES.map(function (sc, i) {
        var c = sceneCanvas(sc[1]);
        var d = c.getContext("2d").getImageData(0, 0, 320, 200);
        return {
          id: "f" + i, name: sc[0],
          data: { data: d.data, w: 320, h: 200 },
          params: PXL.neutralParams(), masks: [],
          rating: 0, flag: null
        };
      })
    };
    renderFilmstrip();
  }
  function renderFilmstrip() {
    if (!filmEl || !DS.film) return;
    filmEl.innerHTML = "";
    DS.film.photos.forEach(function (ph, i) {
      var item = el("div", "dv-fitem" + (i === DS.film.sel ? " sel" : ""));
      var cv = document.createElement("canvas");
      cv.width = 320; cv.height = 200; cv.className = "dv-fthumb";
      try {
        var img = new window.ImageData(new Uint8ClampedArray(ph.data.data), 320, 200);
        cv.getContext("2d").putImageData(img, 0, 0);
      } catch (e) {}
      cv.addEventListener("click", function () { selectPhoto(i); });
      item.appendChild(cv);
      item.appendChild(el("div", "dv-fname", T.esc(ph.name)));
      var stars = el("div", "dv-stars");
      for (var s = 1; s <= 5; s++) {
        (function (n) {
          var sb = el("button", "dv-star" + (n <= ph.rating ? " on" : ""), STAR_SVG);
          sb.type = "button"; sb.title = n + " star" + (n > 1 ? "s" : "");
          sb.setAttribute("aria-label", "Rate " + n + " stars");
          sb.addEventListener("click", function (e) {
            e.stopPropagation();
            ph.rating = (ph.rating === n) ? 0 : n;
            renderFilmstrip();
          });
          stars.appendChild(sb);
        })(s);
      }
      item.appendChild(stars);
      var flag = el("button", "dv-flag" + (ph.flag ? " " + ph.flag : ""),
        ph.flag === "pick" ? "Pick" : (ph.flag === "reject" ? "Reject" : "Flag"));
      flag.type = "button";
      flag.addEventListener("click", function (e) {
        e.stopPropagation();
        ph.flag = ph.flag === null ? "pick" : (ph.flag === "pick" ? "reject" : null);
        renderFilmstrip();
      });
      item.appendChild(flag);
      filmEl.appendChild(item);
    });
  }
  function selectPhoto(i) {
    var F = DS.film;
    if (!F || !F.photos[i]) return;
    /* stash current photo settings */
    var cur = F.photos[F.sel];
    cur.params = PXL.cloneParams(DS.params);
    cur.masks = cloneMasks(DS.masks);
    endSession(true);
    var ph = F.photos[i];
    F.sel = i;
    var p = px();
    if (p && typeof p.newDoc === "function") {
      try { p.newDoc(ph.data.w, ph.data.h); } catch (e) {}
    }
    var L = activeLayer();
    if (!L) { T.toast("Could not open the photo", "error"); return; }
    try {
      L.canvas.width = ph.data.w; L.canvas.height = ph.data.h;
      var img = new window.ImageData(new Uint8ClampedArray(ph.data.data), ph.data.w, ph.data.h);
      L.canvas.getContext("2d").putImageData(img, 0, 0);
    } catch (e) { T.toast("Could not open the photo", "error"); return; }
    composite();
    DS.params = PXL.cloneParams(ph.params);
    DS.masks = cloneMasks(ph.masks);
    DS.selMask = null; DS.maskTool = null;
    DS.viewMode = "normal"; DS.clip = null;
    if (!beginSession(L)) return;
    refreshAll(); renderMasksList(); renderMaskEdit(); renderFilmstrip();
    drawMaskOverlay(); renderDev();
    pushHistory("Opened " + ph.name);
  }
  function copySettings() {
    DS.clipboard = { params: PXL.cloneParams(DS.params), masks: cloneMasks(DS.masks) };
    T.toast("Develop settings copied");
  }
  function pasteSettings() {
    if (!DS.clipboard) { T.toast("Nothing copied yet", "error"); return; }
    var L = guard(); if (!L || !beginSession(L)) return;
    DS.params = PXL.cloneParams(DS.clipboard.params);
    DS.masks = cloneMasks(DS.clipboard.masks);
    DS.selMask = null;
    refreshAll(); renderMasksList(); renderMaskEdit(); drawMaskOverlay(); scheduleRender();
    pushHistory("Pasted develop settings");
    saveDev();
    T.toast("Develop settings pasted");
  }
  function buildFilmstripPanel(host) {
    var p = panelShell("Filmstrip");
    var bar = btnBar();
    bar.appendChild(mkBtn("Copy settings", false, copySettings, "Ctrl+Shift+C"));
    bar.appendChild(mkBtn("Paste settings", false, pasteSettings, "Ctrl+Shift+V"));
    p.appendChild(bar);
    filmEl = el("div", "dv-film");
    p.appendChild(filmEl);
    p.appendChild(el("div", "px-hint", "Sample photos are generated in-app. Click a photo to develop it. Settings travel with each photo."));
    host.appendChild(p);
  }

  /* ================= EXPORT ================= */
  function openExport() {
    var L = activeLayer();
    if (!L || !L.canvas || !L.canvas.width) { T.toast("Nothing to export", "error"); return; }
    T.modal({
      title: "Export developed image",
      sub: "Exports in sRGB IEC 61966-2.1. PNG is the lossless option.",
      fields: [
        { key: "format", label: "Format", type: "select", value: "jpeg",
          options: [{ v: "jpeg", t: "JPG" }, { v: "png", t: "PNG" }, { v: "webp", t: "WEBP" }] },
        { key: "quality", label: "JPG / WEBP quality (1-100)", type: "range", min: 1, max: 100, value: 92 },
        { key: "resize", label: "Resize", type: "select", value: "original",
          options: [{ v: "original", t: "Original size" }, { v: "half", t: "50 percent" }, { v: "quarter", t: "25 percent" }, { v: "custom", t: "Custom width" }] },
        { key: "width", label: "Custom width (px)", type: "text", value: "", ph: "e.g. 1920" },
        { key: "watermark", label: "Watermark text (empty for none)", type: "text", value: "H3NZ Studio", ph: "H3NZ Studio" },
        { key: "wmpos", label: "Watermark position", type: "select", value: "br",
          options: [
            { v: "tl", t: "Top left" }, { v: "tc", t: "Top center" }, { v: "tr", t: "Top right" },
            { v: "cl", t: "Middle left" }, { v: "cc", t: "Center" }, { v: "cr", t: "Middle right" },
            { v: "bl", t: "Bottom left" }, { v: "bc", t: "Bottom center" }, { v: "br", t: "Bottom right" }
          ] },
        { key: "wmop", label: "Watermark opacity (10-100)", type: "range", min: 10, max: 100, value: 70 }
      ],
      okText: "Export"
    }).then(function (res) {
      if (!res) return;
      doExport(res);
    });
  }
  function doExport(o) {
    var L = activeLayer();
    if (!L) return;
    var srcW, srcH, srcData;
    if (DS.ses.data && L.id === DS.ses.layerId) {
      /* render the live develop state offscreen so export matches preview */
      srcW = DS.ses.w; srcH = DS.ses.h;
      try {
        srcData = PXL.developImageData(DS.ses.data.data, srcW, srcH, DS.params, { masks: enabledMasks() });
      } catch (e) { return; }
    } else {
      srcW = L.canvas.width; srcH = L.canvas.height;
      try { srcData = L.canvas.getContext("2d").getImageData(0, 0, srcW, srcH).data; }
      catch (e) { T.toast("Cannot read pixels for export", "error"); return; }
    }
    var scale = 1;
    if (o.resize === "half") scale = 0.5;
    else if (o.resize === "quarter") scale = 0.25;
    else if (o.resize === "custom") {
      var cw = parseInt(o.width, 10);
      if (cw > 0 && cw <= 8000) scale = cw / srcW;
    }
    var ew = Math.max(1, Math.round(srcW * scale)), eh = Math.max(1, Math.round(srcH * scale));
    var ec = document.createElement("canvas");
    ec.width = ew; ec.height = eh;
    var ex = ec.getContext("2d");
    var srcImg;
    try {
      srcImg = new window.ImageData(new Uint8ClampedArray(srcData), srcW, srcH);
    } catch (e) { T.toast("Export failed", "error"); return; }
    var tmp = document.createElement("canvas");
    tmp.width = srcW; tmp.height = srcH;
    tmp.getContext("2d").putImageData(srcImg, 0, 0);
    ex.drawImage(tmp, 0, 0, ew, eh);
    var wm = (o.watermark || "").trim();
    if (wm) {
      var op = Math.max(10, Math.min(100, parseInt(o.wmop, 10) || 70)) / 100;
      var fs = Math.max(12, Math.round(ew / 42));
      ex.font = "600 " + fs + "px system-ui, sans-serif";
      ex.fillStyle = "rgba(255,255,255," + op.toFixed(2) + ")";
      ex.strokeStyle = "rgba(0,0,0," + (op * 0.6).toFixed(2) + ")";
      ex.lineWidth = Math.max(1, fs / 12);
      var tw = ex.measureText(wm).width;
      var mx = ew * 0.04, my = eh * 0.05;
      var px2 = ew - tw - mx, py2 = eh - fs - my;
      var pos = { tl: [mx, my + fs], tc: [(ew - tw) / 2, my + fs], tr: [px2, my + fs],
        cl: [mx, eh / 2], cc: [(ew - tw) / 2, eh / 2], cr: [px2, eh / 2],
        bl: [mx, py2], bc: [(ew - tw) / 2, py2], br: [px2, py2] };
      var pp = pos[o.wmpos] || pos.br;
      ex.strokeText(wm, pp[0], pp[1]);
      ex.fillText(wm, pp[0], pp[1]);
    }
    var mime = o.format === "png" ? "image/png" : (o.format === "webp" ? "image/webp" : "image/jpeg");
    var q = Math.max(1, Math.min(100, parseInt(o.quality, 10) || 92)) / 100;
    var url;
    try { url = ec.toDataURL(mime, q); }
    catch (e) { T.toast("Export failed", "error"); return; }
    var a = document.createElement("a");
    a.href = url;
    a.download = "pxl-export." + (o.format === "jpeg" ? "jpg" : o.format);
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 500);
    T.toast("Exported");
  }

  /* ================= keyboard ================= */
  function onKey(e) {
    var p = px();
    if (!p || !p.internal || !p.internal.isActive()) return;
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.key === "C" || e.key === "c")) { e.preventDefault(); copySettings(); return; }
    if (mod && e.shiftKey && (e.key === "V" || e.key === "v")) { e.preventDefault(); pasteSettings(); return; }
    if (mod) return;
    if (e.key === "j" || e.key === "J") cycleClip();
    else if (e.key === "\\") toggleBefore();
    else if (e.key === "y" || e.key === "Y") toggleSplit();
  }

  /* ================= init ================= */
  function init() {
    if (DS.built) return;
    DS.built = true;
    loadDev();
    var panels = document.getElementById("pPanels");
    if (panels) {
      var frag = document.createDocumentFragment();
      buildDevelopPanel(frag);
      buildHistogramPanel(frag);
      buildPresetsPanel(frag);
      buildMasksPanel(frag);
      buildHistoryPanel(frag);
      buildFilmstripPanel(frag);
      /* keep the mobile sheet chrome (handle, section tabs, tool options)
         on top: insert after #pSheetToolOpts when it exists. */
      var anchor = panels.querySelector("#pSheetToolOpts");
      if (anchor && anchor.nextSibling) panels.insertBefore(frag, anchor.nextSibling);
      else if (anchor) panels.appendChild(frag);
      else panels.insertBefore(frag, panels.firstChild);
    }
    buildMaskOverlay();
    buildFilmstrip();
    document.addEventListener("keydown", onKey);
    if (T.bus && T.bus.on) {
      T.bus.on("pixel:zoom", placeOverlay);
      T.bus.on("pixel:change", scheduleHistDraw);
      T.bus.on("pixel:select", function () {
        /* a different layer took over: drop the develop session for safety */
        if (DS.ses.data) { DS.ses.data = null; DS.ses.layerId = null; }
        scheduleHistDraw();
      });
    }
    window.addEventListener("resize", placeOverlay);
    scheduleHistDraw();
    /* expose a small API for tests and power users */
    T.pixelDevelop = {
      params: function () { return DS.params; },
      setParams: function (p) { DS.params = p; refreshAll(); scheduleRender(); },
      masks: function () { return DS.masks; },
      history: function () { return DS.history; },
      renderNow: renderDev,
      presetCount: function () { return PXL.BUILTIN_PRESETS.length; },
      filmCount: function () { return DS.film ? DS.film.photos.length : 0; }
    };
  }

  if (document.getElementById("pPanels")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  } else if (typeof MutationObserver === "function") {
    /* #pPanels is built lazily by js/pixel/core.js when the PXL app first
       builds; wait for it instead of running once into the void. */
    var mo = new MutationObserver(function () {
      if (document.getElementById("pPanels")) { mo.disconnect(); init(); }
    });
    var root = document.documentElement || document.body;
    if (root) mo.observe(root, { childList: true, subtree: true });
    else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  } else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
