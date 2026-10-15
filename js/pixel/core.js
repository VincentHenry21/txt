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

  /* shared chrome icons for the per-app topbar (NXT phase 1) */
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var DOTS9 = "<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>";
  function fileIco() {
    return (T.icon && typeof T.icon === "function") ? T.icon("i-file") : "";
  }
  function xIco() {
    return (T.icon && typeof T.icon === "function") ? T.icon("i-x") : "";
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
    /* per-app chrome: studio badge + name, app launcher, settings, files (NXT phase 1) */
    var left = el("div", "px-topleft");
    left.innerHTML =
      '<span class="px-studio"><span class="px-badge">Ps</span><span class="px-sname">Pixel</span></span>' +
      '<button type="button" id="pxLauncher" class="icon-btn waffle-btn px-tbtn" title="App launcher" aria-label="Open app launcher"><span class="waffle-dots">' + DOTS9 + "</span></button>" +
      '<button type="button" id="pxSettingsBtn" class="icon-btn px-tbtn" title="Pixel settings" aria-label="Pixel settings">' + GEAR_SVG + "</button>" +
      '<button type="button" id="pxFilesBtn" class="icon-btn px-tbtn" title="Image files" aria-label="Image files">' + fileIco() + "</button>";
    top.appendChild(left);
    left.querySelector("#pxLauncher").addEventListener("click", function (e) {
      e.stopPropagation();
      if (T.ecosystem && typeof T.ecosystem.toggleLauncher === "function") {
        try { T.ecosystem.toggleLauncher(); } catch (err) { /* ignore */ }
      }
    });
    left.querySelector("#pxSettingsBtn").addEventListener("click", function () { togglePxDrawer("settings"); });
    left.querySelector("#pxFilesBtn").addEventListener("click", function () { togglePxDrawer("files"); });
    var opts = el("div", "px-toolopts");
    opts.id = "pToolOpts";
    top.appendChild(opts);
    var right = el("div", "px-topright");
    docInfoEl = el("span", "px-docinfo", "No document");
    docInfoEl.id = "pDocInfo";
    right.appendChild(docInfoEl);
    var pbtn = el("button", "px-btn", "Panels");
    pbtn.type = "button"; pbtn.id = "pPanelsBtn";
    pbtn.title = "Show panels";
    pbtn.setAttribute("aria-label", "Toggle panels");
    pbtn.setAttribute("aria-expanded", "false");
    pbtn.addEventListener("click", function () { togglePxPanels(); });
    right.appendChild(pbtn);
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

    var panels = el("div", "px-panels nxt-sheet");
    panels.id = "pPanels";
    var handle = el("div", "nxt-sheet-handle");
    handle.setAttribute("aria-hidden", "true");
    panels.appendChild(handle);
    var sheetOpts = el("div", "px-sheet-opts");
    sheetOpts.id = "pSheetToolOpts";
    panels.appendChild(sheetOpts);
    main.appendChild(panels);

    root.appendChild(main);
    host.appendChild(root);
    host.appendChild(buildPxSettingsDrawer());
    host.appendChild(buildPxFilesDrawer());

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
    loadPxSettings();
    applyPxSettings();
    pxFilesLoad();
    renderPxFilesList();
    newDoc(1200, 900);
    startAnts();
    bindPxBreakpoint();
  }

  /* ---------------- mobile panels bottom sheet ----------------
     On <=640px the panels become a bottom sheet (nxt-sheet) toggled by the
     "Panels" button in the mobile toolbar. Escape closes it; crossing the
     breakpoint back to desktop closes it and rebuilds the tool options bar
     into the correct host (see tools.js rebuildOptions). */
  function isMobileView() {
    try {
      if (typeof window.matchMedia === "function") {
        var mq = window.matchMedia("(max-width: 640px)");
        if (mq && typeof mq.matches === "boolean") return mq.matches;
      }
    } catch (e) { /* fall through to innerWidth */ }
    return typeof window.innerWidth === "number" && window.innerWidth <= 640;
  }

  function togglePxPanels(force) {
    var p = document.getElementById("pPanels");
    if (!p) return false;
    var open = (force === undefined) ? !p.classList.contains("open") : !!force;
    p.classList.toggle("open", open);
    var b = document.getElementById("pPanelsBtn");
    if (b) {
      b.textContent = open ? "Close" : "Panels";
      b.setAttribute("aria-expanded", open ? "true" : "false");
      b.title = open ? "Hide panels" : "Show panels";
    }
    return open;
  }

  var pxLastMobile = null;
  function onPxBreakpoint() {
    var mobile = isMobileView();
    if (mobile === pxLastMobile) return;
    pxLastMobile = mobile;
    if (!mobile) togglePxPanels(false);
    try {
      var px = T.pixel;
      if (px && px.internal && typeof px.internal.rebuildOptions === "function") {
        px.internal.rebuildOptions();
      }
    } catch (e) { /* options rebuild is best-effort */ }
  }
  function bindPxBreakpoint() {
    pxLastMobile = isMobileView();
    try {
      if (typeof window.matchMedia === "function") {
        var mq = window.matchMedia("(max-width: 640px)");
        if (mq) {
          if (typeof mq.addEventListener === "function") { mq.addEventListener("change", onPxBreakpoint); return; }
          if (typeof mq.addListener === "function") { mq.addListener(onPxBreakpoint); return; }
        }
      }
    } catch (e) { /* fall through to resize */ }
    window.addEventListener("resize", onPxBreakpoint);
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
    pxCurFileId = null; // a fresh doc is detached: it can never overwrite a saved file
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

  /* ================= per-app settings (NXT phase 1) =================
     Persisted in T.store under the 'pixel' namespace, key 'settings'.
     brushSize drives new brush strokes (S.brush.size is the single source of
     truth, so the tool options bar follows automatically); checkerboard
     toggles the transparency background; autoSelectLayer makes a canvas
     click select the topmost opaque layer under the cursor. */
  var PSET = { brushSize: 28, checkerboard: true, autoSelectLayer: false };
  function pxSettingsCopy() {
    return { brushSize: PSET.brushSize, checkerboard: PSET.checkerboard, autoSelectLayer: PSET.autoSelectLayer };
  }
  function loadPxSettings() {
    var s = null;
    try { s = T.store ? T.store.get("pixel", "settings") : null; } catch (e) { s = null; }
    if (s && typeof s === "object") {
      if (isFinite(+s.brushSize) && +s.brushSize >= 1) {
        PSET.brushSize = Math.min(200, Math.max(1, Math.round(+s.brushSize)));
      }
      PSET.checkerboard = s.checkerboard !== false;
      PSET.autoSelectLayer = !!s.autoSelectLayer;
    }
  }
  function savePxSettings() {
    try { if (T.store) { T.store.set("pixel", "settings", pxSettingsCopy()); } } catch (e) { /* ignore */ }
  }
  function syncPxSettingsUI() {
    var b = document.getElementById("pxSetBrush"),
        c = document.getElementById("pxSetChecker"),
        a = document.getElementById("pxSetAuto");
    if (b) { b.value = String(PSET.brushSize); }
    if (c) { c.checked = PSET.checkerboard; }
    if (a) { a.checked = PSET.autoSelectLayer; }
  }
  function applyPxSettings() {
    S.brush.size = PSET.brushSize;
    if (wrapEl) { wrapEl.classList.toggle("px-checker-off", !PSET.checkerboard); }
    syncPxSettingsUI();
    T.bus.emit("pixel:settings", { settings: pxSettingsCopy() });
  }
  function updatePxSettings(patch) {
    patch = patch || {};
    if (patch.brushSize !== undefined && isFinite(+patch.brushSize)) {
      PSET.brushSize = Math.min(200, Math.max(1, Math.round(+patch.brushSize)));
    }
    if (patch.checkerboard !== undefined) { PSET.checkerboard = !!patch.checkerboard; }
    if (patch.autoSelectLayer !== undefined) { PSET.autoSelectLayer = !!patch.autoSelectLayer; }
    savePxSettings();
    applyPxSettings();
  }

  /* Topmost visible layer with an opaque pixel at p (doc coords), or null. */
  function pickLayerAt(p) {
    if (!S.layers.length || !S.w) { return null; }
    var x = Math.max(0, Math.min(S.w - 1, Math.round(p.x)));
    var y = Math.max(0, Math.min(S.h - 1, Math.round(p.y)));
    for (var i = S.layers.length - 1; i >= 0; i--) {
      var L = S.layers[i];
      if (!L.visible) { continue; }
      try {
        var d = L.canvas.getContext("2d").getImageData(x, y, 1, 1).data;
        if (d[3] > 8) { setActive(L.id); return L; }
      } catch (e) { /* unreadable layer: skip */ }
    }
    return null;
  }

  /* ================= per-app files (NXT phase 1) =================
     Named image records {id, name, updatedAt, dataUrl}, persisted in
     T.store under the 'pixel' namespace, key 'files'.
     The open file auto-saves (debounced) on every pixel:change;
     create/duplicate snapshot the composite immediately.
     _persist verifies with a read-back because the store swallows quota
     errors: on failure it toasts honestly and keeps the in-memory doc. */
  var pxFiles = [], pxCurFileId = null, pxSaveTimer = null;
  function pxFilesLoad() {
    var arr = null;
    try { arr = T.store ? T.store.get("pixel", "files") : null; } catch (e) { arr = null; }
    pxFiles = Array.isArray(arr) ? arr.filter(function (rec) { return rec && rec.id; }) : [];
  }
  function pxFilesSave() {
    try { if (T.store) { T.store.set("pixel", "files", pxFiles); } } catch (e) { /* ignore */ }
    var ok = true;
    try {
      var back = T.store ? T.store.get("pixel", "files") : null;
      ok = !!(back && back.length === pxFiles.length);
    } catch (e2) { ok = false; }
    if (!ok && typeof T.toast === "function") {
      T.toast("Storage is full: the file list was not saved. Your open image is kept in memory.", "error");
    }
    return ok;
  }
  function pxFind(id) {
    for (var i = 0; i < pxFiles.length; i++) { if (pxFiles[i].id === id) { return pxFiles[i]; } }
    return null;
  }
  function pxNewId() {
    return "pf" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }
  function pxFlushSave() {
    if (!pxCurFileId) { return; }
    var rec = pxFind(pxCurFileId);
    if (!rec) { return; }
    try { rec.dataUrl = getDataURL(); } catch (e) { return; }
    rec.updatedAt = Date.now();
    pxFilesSave();
  }
  var pixelFiles = {
    list: function () {
      return pxFiles.map(function (r) {
        return { id: r.id, name: r.name, updatedAt: r.updatedAt, dataUrl: r.dataUrl };
      });
    },
    create: function (name) {
      build();
      pxFilesLoad();
      pxFlushSave(); // keep current work inside the previously open file
      var dw = S.w || 1200, dh = S.h || 900;
      newDoc(dw, dh); // newDoc detaches from any file (pxCurFileId reset below)
      pxCurFileId = null;
      var url = "";
      try { url = getDataURL(); } catch (e) { url = ""; }
      var nm = (name || "").trim() || ("Image " + (pxFiles.length + 1));
      var rec = { id: pxNewId(), name: nm, updatedAt: Date.now(), dataUrl: url };
      pxFiles.unshift(rec);
      pxCurFileId = rec.id;
      pxFilesSave();
      renderPxFilesList();
      return rec.id;
    },
    rename: function (id, name) {
      pxFilesLoad();
      var rec = pxFind(id);
      if (!rec) { return false; }
      var nm = (name || "").trim();
      if (!nm) { return false; }
      rec.name = nm;
      rec.updatedAt = Date.now();
      pxFilesSave();
      renderPxFilesList();
      return true;
    },
    duplicate: function (id) {
      pxFilesLoad();
      var rec = pxFind(id);
      if (!rec) { return null; }
      var copy = { id: pxNewId(), name: rec.name + " copy", updatedAt: Date.now(), dataUrl: rec.dataUrl };
      pxFiles.unshift(copy);
      pxFilesSave();
      renderPxFilesList();
      return copy.id;
    },
    remove: function (id) {
      var rec = pxFind(id);
      if (!rec) { return Promise.resolve(false); }
      function doRemove() {
        pxFilesLoad();
        pxFiles = pxFiles.filter(function (r) { return r.id !== id; });
        if (pxCurFileId === id) { pxCurFileId = null; }
        pxFilesSave();
        renderPxFilesList();
        if (typeof T.toast === "function") { T.toast("Image deleted."); }
        return true;
      }
      if (T.modal && typeof T.modal === "function") {
        return T.modal({
          title: "Delete image",
          sub: "Delete \"" + rec.name + "\"? This cannot be undone.",
          okText: "Delete",
          danger: true
        }).then(function (res) { return res ? doRemove() : false; });
      }
      doRemove();
      return Promise.resolve(true);
    },
    open: function (id) {
      build();
      pxFilesLoad();
      var rec = pxFind(id);
      if (!rec || !rec.dataUrl) { return Promise.resolve(false); }
      pxFlushSave();
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || 800, h = img.naturalHeight || 600;
            newDoc(Math.min(8000, w), Math.min(8000, h));
            pxCurFileId = id;
            loadDataURL(rec.dataUrl).then(function () {
              renderPxFilesList();
              resolve(true);
            }, function () { resolve(false); });
          } catch (e) { resolve(false); }
        };
        img.onerror = function () {
          if (typeof T.toast === "function") { T.toast("Could not open the saved image.", "error"); }
          resolve(false);
        };
        img.src = rec.dataUrl;
      });
    },
    currentId: function () { return pxCurFileId; }
  };

  /* ================= settings + files drawers ================= */
  function buildPxSettingsDrawer() {
    var d = el("div", "px-drawer hidden");
    d.id = "pxSettingsDrawer";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Pixel settings");
    d.innerHTML =
      '<div class="px-drawer-head"><span>Pixel settings</span>' +
      '<button type="button" class="icon-btn px-dclose" data-x="close" title="Close" aria-label="Close settings">' + xIco() + "</button></div>" +
      '<div class="px-drawer-body">' +
      '<div class="px-set-row"><label for="pxSetBrush">Default brush size<span class="px-set-sub">Px for new brush strokes</span></label>' +
      '<input id="pxSetBrush" type="number" min="1" max="200" step="1"></div>' +
      '<div class="px-set-row"><label for="pxSetChecker">Checkerboard background<span class="px-set-sub">Show transparency as a checkerboard</span></label>' +
      '<input id="pxSetChecker" type="checkbox" class="px-toggle"></div>' +
      '<div class="px-set-row"><label for="pxSetAuto">Auto-select layer<span class="px-set-sub">Clicking the canvas selects the topmost opaque layer</span></label>' +
      '<input id="pxSetAuto" type="checkbox" class="px-toggle"></div>' +
      '<div class="px-set-about"><span class="px-about-title">About</span>' +
      "<span>Pixel Studio is part of the NXT Ecosystem. Settings are saved on this device.</span></div>" +
      "</div>";
    d.querySelector('[data-x="close"]').addEventListener("click", function () { d.classList.add("hidden"); });
    d.querySelector("#pxSetBrush").addEventListener("change", function (e) {
      updatePxSettings({ brushSize: parseInt(e.target.value, 10) });
    });
    d.querySelector("#pxSetChecker").addEventListener("change", function (e) {
      updatePxSettings({ checkerboard: e.target.checked });
    });
    d.querySelector("#pxSetAuto").addEventListener("change", function (e) {
      updatePxSettings({ autoSelectLayer: e.target.checked });
    });
    return d;
  }
  function buildPxFilesDrawer() {
    var d = el("div", "px-drawer hidden");
    d.id = "pxFilesDrawer";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Image files");
    d.innerHTML =
      '<div class="px-drawer-head"><span>Image files</span>' +
      '<button type="button" class="px-new" id="pxFileNew">New</button>' +
      '<button type="button" class="icon-btn px-dclose" data-x="close" title="Close" aria-label="Close files">' + xIco() + "</button></div>" +
      '<div class="px-drawer-body"><div id="pxFilesList" class="px-files-list"></div></div>';
    d.querySelector('[data-x="close"]').addEventListener("click", function () { d.classList.add("hidden"); });
    d.querySelector("#pxFileNew").addEventListener("click", function () {
      if (!(T.modal && typeof T.modal === "function")) { pixelFiles.create(""); return; }
      T.modal({
        title: "New image",
        fields: [{ key: "name", label: "Name", value: "Image " + (pxFiles.length + 1) }],
        okText: "Create"
      }).then(function (res) {
        pixelFiles.create(res && res.name ? res.name : "");
      });
    });
    return d;
  }
  function togglePxDrawer(which) {
    var s = document.getElementById("pxSettingsDrawer"),
        f = document.getElementById("pxFilesDrawer");
    if (!s || !f) { return; }
    if (which === "settings") {
      var willShow = s.classList.contains("hidden");
      s.classList.toggle("hidden");
      if (willShow) { f.classList.add("hidden"); }
    } else {
      var willShowF = f.classList.contains("hidden");
      f.classList.toggle("hidden");
      if (willShowF) { s.classList.add("hidden"); renderPxFilesList(); }
    }
  }
  function fmtPxDate(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return ""; }
  }
  function renderPxFilesList() {
    var host = document.getElementById("pxFilesList");
    if (!host) { return; }
    host.innerHTML = "";
    pxFilesLoad();
    if (!pxFiles.length) {
      host.innerHTML = '<div class="px-files-empty">No saved images yet. Create one to keep named versions of this canvas.</div>';
      return;
    }
    pxFiles.forEach(function (rec) {
      var row = el("div", "px-file-row" + (rec.id === pxCurFileId ? " current" : ""));
      var thumb = document.createElement("img");
      thumb.className = "px-file-thumb";
      thumb.alt = "";
      if (rec.dataUrl) { thumb.src = rec.dataUrl; }
      row.appendChild(thumb);
      var open = el("button", "px-file-open");
      open.type = "button";
      open.title = "Open " + rec.name;
      open.innerHTML = '<span class="px-file-name">' + T.esc(rec.name) + "</span>" +
        '<span class="px-file-meta">' + T.esc(fmtPxDate(rec.updatedAt)) +
        (rec.id === pxCurFileId ? " · open" : "") + "</span>";
      open.addEventListener("click", function () { pixelFiles.open(rec.id); });
      row.appendChild(open);
      function act(iconId, title, fn) {
        var b = el("button", "px-fact");
        b.type = "button";
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = (T.icon && typeof T.icon === "function") ? T.icon(iconId) : title;
        b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
        row.appendChild(b);
      }
      act("i-pen", "Rename", function () {
        if (!(T.modal && typeof T.modal === "function")) { return; }
        T.modal({
          title: "Rename image",
          fields: [{ key: "name", label: "Name", value: rec.name }],
          okText: "Rename"
        }).then(function (res) {
          if (res && res.name) { pixelFiles.rename(rec.id, res.name); }
        });
      });
      act("i-copy", "Duplicate", function () { pixelFiles.duplicate(rec.id); });
      act("i-trash", "Delete", function () { pixelFiles.remove(rec.id); });
      host.appendChild(row);
    });
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
    /* NXT phase 1: per-app settings + named image files */
    files: pixelFiles,
    settings: pxSettingsCopy, setSettings: updatePxSettings,
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
      isMobileView: isMobileView,
      togglePanels: togglePxPanels,
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
      pickLayerAt: pickLayerAt,
      pxSettings: pxSettingsCopy,
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
    if (!mod && e.key === "Escape") { togglePxPanels(false); return; }
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

  /* NXT phase 1: auto-save the open image file (debounced) on every change.
     No-op when no file is open, so untitled docs stay in memory. */
  T.bus.on("pixel:change", function () {
    if (pxSaveTimer) { clearTimeout(pxSaveTimer); }
    pxSaveTimer = setTimeout(function () { pxSaveTimer = null; pxFlushSave(); }, 1200);
  });
})();
