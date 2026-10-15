/* TXT Pixel Studio - CORE: document model, layers, compositing, selection mask,
   view skeleton (#view-pixel), zoom, colors, send-to-word.
   Contract: T.pixel { newDoc, loadDataURL, getDataURL, layers, activeLayer,
   setActive, composite } + layer management for the layers worker.
   Emits: pixel:change, pixel:layers, pixel:select {selection}, pixel:color, pixel:zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var BLENDS = ["source-over", "multiply", "screen", "overlay", "darken", "lighten",
    "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
    "exclusion", "hue", "saturation", "color", "luminosity"];

  var S = {
    built: false, active: false,
    w: 0, h: 0,
    layers: [], activeId: null, seq: 0,
    mask: null, mctx: null, selection: null,
    zoom: 1,
    fg: "#1a1a1a", bg: "#ffffff",
    brush: { size: 28, hardness: 70, opacity: 100, flow: 100 },
    wandTol: 32,
    crop: null, mouse: null, antsTick: 0, raf: 0
  };

  var comp = null, cctx = null, over = null, octx = null;
  var wrapEl = null, docInfoEl = null, zoomPctEl = null;

  /* ---------------- view skeleton ---------------- */

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function build() {
    if (S.built) return;
    var host = document.getElementById("view-pixel");
    if (!host) {
      host = el("div");
      host.id = "view-pixel";
      var app = document.getElementById("app") || document.body;
      app.appendChild(host);
    }
    host.innerHTML = "";

    var root = el("div", "px-root");

    /* top options bar */
    var top = el("div", "px-topbar");
    top.id = "pTopbar";
    var opts = el("div", "px-toolopts");
    opts.id = "pToolOpts";
    top.appendChild(opts);
    var right = el("div", "px-topright");
    docInfoEl = el("span", "px-docinfo", "No document");
    docInfoEl.id = "pDocInfo";
    right.appendChild(docInfoEl);
    var zc = el("div", "px-zoom");
    var zb = el("button", "px-btn", "-");
    zb.type = "button"; zb.title = "Zoom out"; zb.id = "pZoomOut";
    zb.addEventListener("click", function () { setZoom(S.zoom / 1.25); });
    var zi = el("button", "px-btn", "+");
    zi.type = "button"; zi.title = "Zoom in"; zi.id = "pZoomIn";
    zi.addEventListener("click", function () { setZoom(S.zoom * 1.25); });
    zoomPctEl = el("button", "px-btn px-zoom-pct", "100%");
    zoomPctEl.type = "button"; zoomPctEl.title = "Reset zoom"; zoomPctEl.id = "pZoomPct";
    zoomPctEl.addEventListener("click", function () { setZoom(1); });
    zc.appendChild(zb); zc.appendChild(zoomPctEl); zc.appendChild(zi);
    right.appendChild(zc);
    var send = el("button", "px-btn px-primary", "Send to Word");
    send.type = "button"; send.id = "pSendWord"; send.title = "Insert flattened composite into the Word document";
    send.addEventListener("click", sendToWord);
    right.appendChild(send);
    top.appendChild(right);
    root.appendChild(top);

    /* main row */
    var main = el("div", "px-main");
    var dock = el("div", "px-tools");
    dock.id = "pTools";
    main.appendChild(dock);

    wrapEl = el("div", "px-canvaswrap");
    wrapEl.id = "pCanvasWrap";
    comp = document.createElement("canvas");
    comp.id = "pComposite";
    over = document.createElement("canvas");
    over.id = "pOverlay";
    wrapEl.appendChild(comp);
    wrapEl.appendChild(over);
    main.appendChild(wrapEl);

    var panels = el("div", "px-panels");
    panels.id = "pPanels";
    main.appendChild(panels);

    root.appendChild(main);
    host.appendChild(root);

    cctx = comp.getContext("2d");
    octx = over.getContext("2d");

    /* ctrl+wheel zoom */
    wrapEl.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false });

    wrapEl.addEventListener("pointermove", function (e) {
      var p = toDoc(e);
      S.mouse = p;
    });
    wrapEl.addEventListener("pointerleave", function () { S.mouse = null; });

    S.built = true;
    newDoc(1200, 900);
    startAnts();
  }

  /* ---------------- document & layers ---------------- */

  function mkCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function newDoc(w, h) {
    build();
    w = Math.max(1, Math.min(8000, Math.round(w) || 1200));
    h = Math.max(1, Math.min(8000, Math.round(h) || 900));
    S.w = w; S.h = h;
    S.layers = []; S.activeId = null; S.seq = 0;
    S.mask = mkCanvas(w, h); S.mctx = S.mask.getContext("2d");
    S.selection = null; S.crop = null;
    comp.width = w; comp.height = h;
    over.width = w; over.height = h;
    addLayer("Layer 1");
    applyZoom();
    updateDocInfo();
    composite();
    drawOverlay(true);
    T.bus.emit("pixel:layers", { layers: layers() });
    T.bus.emit("pixel:change", {});
    T.bus.emit("pixel:select", { selection: null });
    return { w: w, h: h };
  }

  function addLayer(name) {
    var L = {
      id: "pxl" + (++S.seq) + "_" + Date.now().toString(36),
      name: name || ("Layer " + (S.layers.length + 1)),
      canvas: mkCanvas(S.w, S.h),
      visible: true, opacity: 1, blend: "source-over", locked: false
    };
    S.layers.push(L);
    S.activeId = L.id;
    T.bus.emit("pixel:layers", { layers: layers() });
    composite();
    return L;
  }

  function removeLayer(id) {
    if (S.layers.length <= 1) { T.toast("A document needs at least one layer"); return false; }
    var i = idx(id);
    if (i < 0) return false;
    S.layers.splice(i, 1);
    if (S.activeId === id) S.activeId = S.layers[Math.max(0, i - 1)].id;
    T.bus.emit("pixel:layers", { layers: layers() });
    composite();
    T.bus.emit("pixel:change", {});
    return true;
  }

  function duplicateLayer(id) {
    var src = get(id);
    if (!src) return null;
    var L = addLayer(src.name + " copy");
    var x = L.canvas.getContext("2d");
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    x.drawImage(src.canvas, 0, 0);
    L.opacity = src.opacity; L.blend = src.blend; L.visible = src.visible;
    T.bus.emit("pixel:layers", { layers: layers() });
    composite();
    T.bus.emit("pixel:change", {});
    return L;
  }

  function idx(id) {
    for (var i = 0; i < S.layers.length; i++) if (S.layers[i].id === id) return i;
    return -1;
  }
  function get(id) { var i = idx(id); return i >= 0 ? S.layers[i] : null; }

  function layers() {
    return S.layers.map(function (L) {
      return { id: L.id, name: L.name, canvas: L.canvas, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked };
    });
  }
  function activeLayer() { return get(S.activeId) || S.layers[S.layers.length - 1] || null; }
  function setActive(id) {
    if (!get(id)) return false;
    S.activeId = id;
    T.bus.emit("pixel:layers", { layers: layers() });
    return true;
  }
  function rename(id, name) { var L = get(id); if (L && name) { L.name = String(name).slice(0, 60); T.bus.emit("pixel:layers", { layers: layers() }); } }
  function setVisible(id, v) { var L = get(id); if (L) { L.visible = !!v; composite(); T.bus.emit("pixel:layers", { layers: layers() }); T.bus.emit("pixel:change", {}); } }
  function setOpacity(id, v) { var L = get(id); if (L) { L.opacity = Math.max(0, Math.min(1, +v)); composite(); T.bus.emit("pixel:layers", { layers: layers() }); T.bus.emit("pixel:change", {}); } }
  function setBlend(id, b) { var L = get(id); if (L && BLENDS.indexOf(b) >= 0) { L.blend = b; composite(); T.bus.emit("pixel:layers", { layers: layers() }); T.bus.emit("pixel:change", {}); } }
  function setLocked(id, v) { var L = get(id); if (L) { L.locked = !!v; T.bus.emit("pixel:layers", { layers: layers() }); } }
  function moveLayer(id, dir) {
    var i = idx(id);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= S.layers.length) return false;
    var t = S.layers[i]; S.layers[i] = S.layers[j]; S.layers[j] = t;
    T.bus.emit("pixel:layers", { layers: layers() });
    composite();
    T.bus.emit("pixel:change", {});
    return true;
  }

  /* ---------------- compositing ---------------- */

  function composite() {
    if (!S.built || !S.w) return;
    var x = cctx;
    x.save();
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, S.w, S.h);
    for (var i = 0; i < S.layers.length; i++) {
      var L = S.layers[i];
      if (!L.visible) continue;
      x.globalAlpha = L.opacity;
      x.globalCompositeOperation = L.blend || "source-over";
      x.drawImage(L.canvas, 0, 0);
    }
    x.restore();
  }

  function getDataURL() {
    composite();
    return comp.toDataURL("image/png");
  }

  function loadDataURL(url) {
    build();
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          if (!S.w || !S.layers.length) newDoc(img.naturalWidth, img.naturalHeight);
          var L = addLayer("Image");
          var x = L.canvas.getContext("2d");
          x.clearRect(0, 0, S.w, S.h);
          /* draw at natural size, centered */
          var dw = img.naturalWidth, dh = img.naturalHeight;
          var dx = Math.round((S.w - dw) / 2), dy = Math.round((S.h - dh) / 2);
          x.drawImage(img, dx, dy, dw, dh);
          composite();
          T.bus.emit("pixel:change", {});
          resolve(L);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { T.toast("Could not load image", "error"); reject(new Error("load failed")); };
      img.src = url;
    });
  }

  /* ---------------- selection mask ---------------- */

  function maskEnsure() {
    if (!S.mask || S.mask.width !== S.w || S.mask.height !== S.h) {
      S.mask = mkCanvas(S.w, S.h);
      S.mctx = S.mask.getContext("2d");
    }
    return S.mctx;
  }

  function hasSelection() { return !!S.selection; }

  function inSelection(x, y) {
    if (!S.selection) return true;
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return false;
    var d = S.mctx.getImageData(x, y, 1, 1).data;
    return d[3] > 100;
  }

  function setSelection(sel) {
    S.selection = sel || null;
    if (!sel) maskEnsure().clearRect(0, 0, S.w, S.h);
    drawOverlay(true);
    T.bus.emit("pixel:select", { selection: S.selection });
  }

  function clearSelection() { setSelection(null); }

  function selectionRect(sel) {
    var r = normRect(sel);
    return { x: r.x, y: r.y, w: r.w, h: r.h, ellipse: !!sel.ellipse };
  }

  function normRect(r) {
    var x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.abs(r.x1 - r.x0)), h: Math.round(Math.abs(r.y1 - r.y0)) };
  }

  function maskFromRect(sel) {
    var x = maskEnsure();
    x.clearRect(0, 0, S.w, S.h);
    x.fillStyle = "#fff";
    var r = normRect(sel);
    if (sel.ellipse) {
      x.beginPath();
      x.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
      x.fill();
    } else {
      x.fillRect(r.x, r.y, Math.max(1, r.w), Math.max(1, r.h));
    }
  }

  function maskFromPoly(pts) {
    var x = maskEnsure();
    x.clearRect(0, 0, S.w, S.h);
    if (!pts || pts.length < 3) return;
    x.fillStyle = "#fff";
    x.beginPath();
    x.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) x.lineTo(pts[i].x, pts[i].y);
    x.closePath();
    x.fill();
  }

  /* flood-fill tolerance select on the flattened composite */
  function maskFromWand(px, py, tol) {
    composite();
    var x = maskEnsure();
    var img = cctx.getImageData(0, 0, S.w, S.h);
    var d = img.data, W = S.w, H = S.h;
    px |= 0; py |= 0;
    if (px < 0 || py < 0 || px >= W || py >= H) return 0;
    var si = (py * W + px) * 4;
    var tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];
    var tol2 = tol * tol;
    var seen = new Uint8Array(W * H);
    var out = x.createImageData(W, H);
    var od = out.data;
    var stack = [py * W + px];
    var count = 0;
    while (stack.length) {
      var i = stack.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      var o = i * 4;
      var dr = d[o] - tr, dg = d[o + 1] - tg, db = d[o + 2] - tb, da = (d[o + 3] - ta) * 2;
      if (dr * dr + dg * dg + db * db + da * da > tol2) continue;
      od[o + 3] = 255;
      count++;
      var ix = i % W, iy = (i / W) | 0;
      if (ix > 0) stack.push(i - 1);
      if (ix < W - 1) stack.push(i + 1);
      if (iy > 0) stack.push(i - W);
      if (iy < H - 1) stack.push(i + W);
    }
    x.clearRect(0, 0, W, H);
    x.putImageData(out, 0, 0);
    return count;
  }

  /* ---------------- overlay (marching ants, crop, cursor) ---------------- */

  function drawOverlay(force) {
    if (!S.built || !S.active) { if (!force) return; }
    var x = octx;
    x.clearRect(0, 0, S.w, S.h);
    /* selection ants */
    var sel = S.selection;
    if (sel) {
      x.save();
      x.strokeStyle = "rgba(0,0,0,0.9)";
      x.lineWidth = 1.5;
      x.setLineDash([7, 5]);
      x.lineDashOffset = -S.antsTick;
      x.beginPath();
      if (sel.poly) {
        x.moveTo(sel.poly[0].x, sel.poly[0].y);
        for (var i = 1; i < sel.poly.length; i++) x.lineTo(sel.poly[i].x, sel.poly[i].y);
        x.closePath();
      } else {
        var r = normRect(sel);
        if (sel.ellipse) x.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(1, r.w / 2), Math.max(1, r.h / 2), 0, 0, Math.PI * 2);
        else x.rect(r.x + 0.5, r.y + 0.5, Math.max(1, r.w), Math.max(1, r.h));
      }
      x.stroke();
      x.strokeStyle = "rgba(255,255,255,0.9)";
      x.lineDashOffset = -S.antsTick + 6;
      x.stroke();
      x.restore();
    }
    /* crop rect */
    if (S.crop) {
      var c = normRect(S.crop);
      x.save();
      x.fillStyle = "rgba(0,0,0,0.45)";
      x.fillRect(0, 0, S.w, c.y);
      x.fillRect(0, c.y + c.h, S.w, S.h - c.y - c.h);
      x.fillRect(0, c.y, c.x, c.h);
      x.fillRect(c.x + c.w, c.y, S.w - c.x - c.w, c.h);
      x.strokeStyle = "#fff"; x.lineWidth = 1.5;
      x.setLineDash([]);
      x.strokeRect(c.x + 0.5, c.y + 0.5, c.w, c.h);
      x.restore();
    }
    /* brush cursor ring */
    if (S.mouse && T.pixel.internal.toolCursorSize() > 0 && S.active) {
      var r2 = T.pixel.internal.toolCursorSize() / 2;
      x.save();
      x.strokeStyle = "rgba(0,0,0,0.7)"; x.lineWidth = 1.5;
      x.beginPath(); x.arc(S.mouse.x, S.mouse.y, r2, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = "rgba(255,255,255,0.7)"; x.lineWidth = 1;
      x.beginPath(); x.arc(S.mouse.x, S.mouse.y, r2, 0, Math.PI * 2); x.stroke();
      x.restore();
    }
  }

  function startAnts() {
    if (S.raf) return;
    var loop = function () {
      S.raf = requestAnimationFrame(loop);
      if (!S.active) return;
      S.antsTick = (S.antsTick + 0.6) % 24;
      drawOverlay(false);
    };
    S.raf = requestAnimationFrame(loop);
  }

  /* ---------------- view transform ---------------- */

  function toDoc(e) {
    var r = comp.getBoundingClientRect();
    var sx = S.w / Math.max(1, r.width), sy = S.h / Math.max(1, r.height);
    return {
      x: (e.clientX - r.left) * sx,
      y: (e.clientY - r.top) * sy,
      inside: true
    };
  }

  function setZoom(z) {
    S.zoom = Math.max(0.05, Math.min(8, z));
    applyZoom();
    T.bus.emit("pixel:zoom", { zoom: S.zoom });
  }
  function applyZoom() {
    if (!comp) return;
    var wpx = Math.max(1, Math.round(S.w * S.zoom));
    var hpx = Math.max(1, Math.round(S.h * S.zoom));
    comp.style.width = wpx + "px"; comp.style.height = hpx + "px";
    over.style.width = wpx + "px"; over.style.height = hpx + "px";
    if (zoomPctEl) zoomPctEl.textContent = Math.round(S.zoom * 100) + "%";
  }

  function updateDocInfo() {
    if (docInfoEl) docInfoEl.textContent = S.w + " x " + S.h + " px";
  }

  /* ---------------- colors ---------------- */

  function setFg(c) { S.fg = c; T.bus.emit("pixel:color", { fg: S.fg, bg: S.bg }); }
  function setBg(c) { S.bg = c; T.bus.emit("pixel:color", { fg: S.fg, bg: S.bg }); }
  function swapFgBg() { var t = S.fg; S.fg = S.bg; S.bg = t; T.bus.emit("pixel:color", { fg: S.fg, bg: S.bg }); }

  /* ---------------- crop apply ---------------- */

  function applyCrop() {
    if (!S.crop) return false;
    var r = normRect(S.crop);
    if (r.w < 2 || r.h < 2) { S.crop = null; drawOverlay(true); return false; }
    r.x = Math.max(0, r.x); r.y = Math.max(0, r.y);
    r.w = Math.min(r.w, S.w - r.x); r.h = Math.min(r.h, S.h - r.y);
    S.layers.forEach(function (L) {
      var nc = mkCanvas(r.w, r.h);
      nc.getContext("2d").drawImage(L.canvas, -r.x, -r.y);
      L.canvas = nc;
    });
    S.w = r.w; S.h = r.h;
    S.mask = mkCanvas(r.w, r.h); S.mctx = S.mask.getContext("2d");
    S.selection = null; S.crop = null;
    comp.width = r.w; comp.height = r.h;
    over.width = r.w; over.height = r.h;
    applyZoom(); updateDocInfo(); composite(); drawOverlay(true);
    T.bus.emit("pixel:change", {});
    T.bus.emit("pixel:select", { selection: null });
    return true;
  }

  /* ---------------- send composite to Word ---------------- */

  function sendToWord() {
    if (!S.w) { T.toast("Nothing to send yet"); return; }
    var url = getDataURL();
    try {
      if (T.store && typeof T.store.emit === "function") {
        T.store.emit("txt:insert-image", { dataURL: url });
        T.toast("Composite sent to the document");
      } else {
        T.bus.emit("pixel:send", { dataURL: url });
        T.toast("Composite ready");
      }
    } catch (e) {
      T.bus.emit("pixel:send", { dataURL: url });
    }
  }

  /* ---------------- open / close ---------------- */

  function open() {
    build();
    S.active = true;
    var host = document.getElementById("view-pixel");
    if (host) host.style.display = "";
    composite();
    drawOverlay(true);
    T.bus.emit("pixel:open", {});
  }
  function close() {
    S.active = false;
    var host = document.getElementById("view-pixel");
    if (host) host.style.display = "none";
    T.bus.emit("pixel:close", {});
  }

  /* ---------------- public contract ---------------- */

  T.pixel = {
    /* required contract */
    newDoc: newDoc,
    loadDataURL: loadDataURL,
    getDataURL: getDataURL,
    layers: layers,
    activeLayer: activeLayer,
    setActive: setActive,
    composite: composite,
    /* layer management (for the layers/adjustments worker) */
    addLayer: addLayer,
    removeLayer: removeLayer,
    duplicateLayer: duplicateLayer,
    rename: rename,
    setVisible: setVisible,
    setOpacity: setOpacity,
    setBlend: setBlend,
    setLocked: setLocked,
    moveLayer: moveLayer,
    BLENDS: BLENDS,
    /* view */
    open: open,
    close: close,
    /* colors */
    getFg: function () { return S.fg; },
    getBg: function () { return S.bg; },
    setFg: setFg, setBg: setBg, swapFgBg: swapFgBg,
    /* selection */
    getSelection: function () { return S.selection; },
    clearSelection: clearSelection,
    hasSelection: hasSelection,
    getMask: function () { maskEnsure(); return S.mask; },
    /* doc / view state */
    getDoc: function () { return { w: S.w, h: S.h }; },
    getZoom: function () { return S.zoom; },
    setZoom: setZoom,
    getCanvas: function () { return comp; },
    getBrush: function () { return S.brush; },
    getWandTol: function () { return S.wandTol; },
    setWandTol: function (v) { S.wandTol = Math.max(0, Math.min(442, +v || 0)); },
    /* internal API for tools.js (not for the layers worker) */
    internal: {
      ensure: function () { build(); },
      render: function () { composite(); },
      isActive: function () { return S.active; },
      toDoc: toDoc,
      docSize: function () { return { w: S.w, h: S.h }; },
      activeRaw: function () { return get(S.activeId) || S.layers[S.layers.length - 1] || null; },
      maskCtx: function () { return maskEnsure(); },
      inSelection: inSelection,
      setSelection: setSelection,
      maskFromRect: maskFromRect,
      maskFromPoly: maskFromPoly,
      maskFromWand: maskFromWand,
      selectionRect: selectionRect,
      normRect: normRect,
      setCrop: function (r) { S.crop = r; drawOverlay(true); },
      getCrop: function () { return S.crop; },
      applyCrop: applyCrop,
      toolCursorSize: function () { return 0; }, /* overridden by tools.js */
      optsEl: function () { return document.getElementById("pToolOpts"); },
      dockEl: function () { return document.getElementById("pTools"); },
      compEl: function () { return comp; },
      changed: function () { composite(); T.bus.emit("pixel:change", {}); }
    }
  };

  /* view-level keys that are not tool-specific */
  document.addEventListener("keydown", function (e) {
    if (!S.active) return;
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      clearSelection();
    } else if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
      var L = activeLayer();
      if (!L || L.locked) { if (L && L.locked) T.toast("Layer is locked"); return; }
      e.preventDefault();
      var x = L.canvas.getContext("2d");
      x.save();
      if (hasSelection()) {
        x.globalCompositeOperation = "destination-out";
        x.drawImage(S.mask, 0, 0);
      } else {
        x.clearRect(0, 0, S.w, S.h);
      }
      x.restore();
      T.pixel.internal.changed();
    }
  });
})();
