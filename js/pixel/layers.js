/* TXT Pixel Studio: layers manager panel.
   Fills #pPanels (inside #view-pixel) with the Layers panel. Owns layer-row UI
   (thumbnail, rename, eye, lock, opacity, blend) and structural ops: new,
   duplicate, merge down, flatten, delete, reorder. All ops mutate the real
   canvas stack exposed by T.pixel.layers() (assumed bottom-first: index 0 is
   the background), then call T.pixel.composite() and re-emit bus events so the
   core worker stays in sync.
   Contract used (js/pixel/core.js): T.pixel = { newDoc, loadDataURL, getDataURL,
   layers(), activeLayer(), setActive(id), composite() };
   Layer: { id, name, canvas, visible, opacity, blend, locked }
   Bus in: pixel:layers, pixel:change, pixel:select. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  function px() { return T.pixel || null; }

  /* #view-pixel / #pPanels are added by the shell worker; create them if the
     shell has not run yet so this module works standalone. */
  function ensurePanels() {
    var views = document.getElementById("views");
    var view = document.getElementById("view-pixel");
    if (!view) {
      view = document.createElement("section");
      view.id = "view-pixel";
      view.className = "view hidden";
      if (views) views.appendChild(view); else document.body.appendChild(view);
    }
    var panels = document.getElementById("pPanels");
    if (!panels) {
      panels = document.createElement("div");
      panels.id = "pPanels";
      view.appendChild(panels);
    }
    return panels;
  }

  /* Blend names: accept either the display name or a canvas gCO string. */
  var BLENDS = [
    ["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"],
    ["overlay", "Overlay"], ["difference", "Difference"],
    ["lighten", "Lighten"], ["darken", "Darken"]
  ];
  function normBlend(b) {
    if (!b) return "source-over";
    for (var i = 0; i < BLENDS.length; i++) {
      if (BLENDS[i][0] === b || BLENDS[i][1] === b || BLENDS[i][1].toLowerCase() === String(b).toLowerCase()) return BLENDS[i][0];
    }
    return "source-over";
  }
  function blendLabel(gco) {
    for (var i = 0; i < BLENDS.length; i++) if (BLENDS[i][0] === gco) return BLENDS[i][1];
    return "Normal";
  }

  function stack() { var p = px(); return p ? (p.layers() || []) : []; }
  function active() { var p = px(); return p ? p.activeLayer() : null; }
  function changed(structural) {
    var p = px(); if (!p) return;
    try { p.composite(); } catch (e) { /* core not ready */ }
    T.bus.emit("pixel:change");
    if (structural) T.bus.emit("pixel:layers");
  }
  function newId() { return "l" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function docSize() {
    var s = stack(), a = active();
    var c = (a && a.canvas) || (s.length && s[0].canvas);
    if (c && c.width) return { w: c.width, h: c.height };
    return { w: 800, h: 600 };
  }
  function layerName(n) {
    var names = {}, i, s = stack();
    for (i = 0; i < s.length; i++) names[s[i].name] = 1;
    var base = n || "Layer", k = 1, nm = base;
    while (names[nm]) { k++; nm = base + " " + k; }
    return nm;
  }

  /* ---------------- structural ops ---------------- */

  function opNew() {
    var p = px(); if (!p) return T.toast("Pixel engine not ready", "error");
    var sz = docSize();
    var c = document.createElement("canvas");
    c.width = sz.w; c.height = sz.h;
    var L = { id: newId(), name: layerName(), canvas: c, visible: true, opacity: 1, blend: "source-over", locked: false };
    stack().push(L);
    try { p.setActive(L.id); } catch (e) {}
    changed(true);
    T.toast("Layer added");
  }
  function opDuplicate() {
    var p = px(), a = active(); if (!p || !a) return;
    var c = document.createElement("canvas");
    c.width = a.canvas.width; c.height = a.canvas.height;
    c.getContext("2d").drawImage(a.canvas, 0, 0);
    var L = { id: newId(), name: layerName(a.name + " copy"), canvas: c, visible: a.visible !== false, opacity: a.opacity == null ? 1 : a.opacity, blend: normBlend(a.blend), locked: false };
    var s = stack(); s.splice(s.indexOf(a) + 1, 0, L);
    try { p.setActive(L.id); } catch (e) {}
    changed(true);
  }
  function opDelete() {
    var p = px(), a = active(), s = stack();
    if (!p || !a) return;
    if (s.length <= 1) { T.toast("A document needs at least one layer", "error"); return; }
    if (a.locked) { T.toast("Layer is locked", "error"); return; }
    var i = s.indexOf(a);
    s.splice(i, 1);
    var next = s[Math.min(i, s.length - 1)];
    try { p.setActive(next.id); } catch (e) {}
    changed(true);
  }
  function opMove(dir) { // dir +1 = up (toward top), -1 = down
    var p = px(), a = active(), s = stack();
    if (!p || !a) return;
    var i = s.indexOf(a), j = i + dir;
    if (j < 0 || j >= s.length) return;
    s[i] = s[j]; s[j] = a;
    changed(true);
  }
  function opMergeDown() {
    var p = px(), a = active(), s = stack();
    if (!p || !a) return;
    var i = s.indexOf(a);
    if (i <= 0) { T.toast("No layer below to merge into", "error"); return; }
    if (a.locked) { T.toast("Layer is locked", "error"); return; }
    var below = s[i - 1];
    if (below.locked) { T.toast("Layer below is locked", "error"); return; }
    var w = below.canvas.width, h = below.canvas.height;
    var tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    var c = tmp.getContext("2d");
    c.drawImage(below.canvas, 0, 0);
    c.globalAlpha = (a.opacity == null ? 1 : a.opacity);
    c.globalCompositeOperation = normBlend(a.blend);
    c.drawImage(a.canvas, 0, 0, w, h);
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    var bc = below.canvas.getContext("2d");
    bc.save(); bc.globalCompositeOperation = "source-over"; bc.globalAlpha = 1;
    bc.clearRect(0, 0, w, h); bc.drawImage(tmp, 0, 0); bc.restore();
    s.splice(i, 1);
    try { p.setActive(below.id); } catch (e) {}
    changed(true);
    T.toast("Merged down");
  }
  function opFlatten() {
    var p = px(), s = stack();
    if (!p || !s.length) return;
    var sz = docSize();
    var c = document.createElement("canvas"); c.width = sz.w; c.height = sz.h;
    var x = c.getContext("2d");
    s.forEach(function (L) {
      if (L.visible === false) return;
      x.save();
      x.globalAlpha = (L.opacity == null ? 1 : L.opacity);
      x.globalCompositeOperation = normBlend(L.blend);
      x.drawImage(L.canvas, 0, 0, sz.w, sz.h);
      x.restore();
    });
    s.length = 0;
    var L = { id: newId(), name: "Background", canvas: c, visible: true, opacity: 1, blend: "source-over", locked: false };
    s.push(L);
    try { p.setActive(L.id); } catch (e) {}
    changed(true);
    T.toast("Flattened to one layer");
  }

  /* ---------------- panel UI ---------------- */

  var panelEl = null, rowsEl = null, thumbTimer = null;
  var LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  function toolBtn(iconId, title, fn) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "px-tbtn"; b.title = title;
    b.innerHTML = T.icon(iconId);
    b.addEventListener("click", fn);
    return b;
  }

  function buildPanel() {
    var host = ensurePanels();
    panelEl = document.createElement("div");
    panelEl.className = "px-panel";
    panelEl.innerHTML =
      '<div class="px-phead"><span>Layers</span></div>' +
      '<div class="px-ltools"></div>' +
      '<div class="px-lrows"></div>' +
      '<button type="button" class="px-cta">' + T.icon("i-image") + '<span>Send Composite to Word Document</span></button>';
    var tools = panelEl.querySelector(".px-ltools");
    tools.appendChild(toolBtn("i-plus", "New layer", opNew));
    tools.appendChild(toolBtn("i-copy", "Duplicate layer", opDuplicate));
    tools.appendChild(toolBtn("i-chev-d", "Merge down", opMergeDown));
    var flat = document.createElement("button");
    flat.type = "button"; flat.className = "px-tbtn px-ttxt"; flat.title = "Flatten image";
    flat.textContent = "Flatten"; flat.addEventListener("click", opFlatten);
    tools.appendChild(flat);
    tools.appendChild(toolBtn("i-chev-u", "Move layer up", function () { opMove(1); }));
    tools.appendChild(toolBtn("i-chev-d", "Move layer down", function () { opMove(-1); }));
    tools.appendChild(toolBtn("i-trash", "Delete layer", opDelete));
    rowsEl = panelEl.querySelector(".px-lrows");
    panelEl.querySelector(".px-cta").addEventListener("click", sendToWord);
    host.appendChild(panelEl);
  }

  function sendToWord() {
    var p = px();
    if (!p) { T.toast("Pixel engine not ready", "error"); return; }
    var url = null;
    try { url = p.getDataURL(); } catch (e) { url = null; }
    if (!url) { T.toast("Nothing to send yet", "error"); return; }
    if (T.store) {
      T.store.emit("txt:insert-image", { id: "p" + Date.now(), dataUrl: url });
      T.toast("Composite sent to Word document");
    } else {
      T.toast("Word bridge not available", "error");
    }
  }
  T.register && T.register("pixel.sendToWord", sendToWord, { title: "Send composite to Word", cat: "Pixel", icon: "i-image" });

  function drawThumb(cv, layer) {
    var x = cv.getContext("2d");
    x.clearRect(0, 0, cv.width, cv.height);
    // checkerboard for transparency
    x.fillStyle = "#3a3a3e"; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = "#55555a";
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 10, j * 10, 10, 10);
    try { x.drawImage(layer.canvas, 0, 0, cv.width, cv.height); } catch (e) {}
  }

  function renderRows() {
    if (!rowsEl) return;
    var s = stack(), a = active();
    rowsEl.innerHTML = "";
    if (!px()) {
      rowsEl.innerHTML = '<div class="px-empty">Pixel engine loading.</div>';
      return;
    }
    if (!s.length) {
      rowsEl.innerHTML = '<div class="px-empty">No layers. Create a document to begin.</div>';
      return;
    }
    for (var k = s.length - 1; k >= 0; k--) { // display top-first
      (function (L) {
        var row = document.createElement("div");
        row.className = "px-layer" + (a && a.id === L.id ? " active" : "");
        row.setAttribute("data-id", L.id);
        var thumb = document.createElement("canvas");
        thumb.className = "px-thumb"; thumb.width = 40; thumb.height = 40;
        drawThumb(thumb, L);
        var nm = document.createElement("div");
        nm.className = "px-lname"; nm.textContent = L.name || "Layer"; nm.title = "Double-click to rename";
        nm.addEventListener("dblclick", function (e) {
          e.stopPropagation();
          var inp = document.createElement("input");
          inp.type = "text"; inp.className = "px-rename"; inp.value = L.name || "";
          nm.innerHTML = ""; nm.appendChild(inp); inp.focus(); inp.select();
          function commit(save) {
            var v = inp.value.trim();
            if (save && v) { L.name = v; T.bus.emit("pixel:layers"); }
            else renderRows();
          }
          inp.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") commit(true);
            else if (ev.key === "Escape") commit(false);
            ev.stopPropagation();
          });
          inp.addEventListener("blur", function () { commit(true); });
        });
        var eye = document.createElement("button");
        eye.type = "button"; eye.className = "px-ibtn" + (L.visible === false ? " off" : "");
        eye.title = "Toggle visibility"; eye.innerHTML = T.icon("i-eye");
        eye.addEventListener("click", function (e) {
          e.stopPropagation();
          L.visible = !(L.visible !== false);
          changed(false); renderRows();
        });
        var lock = document.createElement("button");
        lock.type = "button"; lock.className = "px-ibtn" + (L.locked ? " on" : "");
        lock.title = "Lock layer"; lock.innerHTML = LOCK_SVG;
        lock.addEventListener("click", function (e) {
          e.stopPropagation();
          L.locked = !L.locked;
          T.bus.emit("pixel:layers");
        });
        var op = document.createElement("input");
        op.type = "range"; op.className = "px-op"; op.min = "0"; op.max = "100";
        op.value = String(Math.round((L.opacity == null ? 1 : L.opacity) * 100));
        op.title = "Opacity";
        op.addEventListener("input", function (e) {
          e.stopPropagation();
          L.opacity = T.clamp(parseInt(op.value, 10) / 100, 0, 1);
          changed(false);
        });
        op.addEventListener("click", function (e) { e.stopPropagation(); });
        var bs = document.createElement("select");
        bs.className = "px-blend"; bs.title = "Blend mode";
        BLENDS.forEach(function (b) {
          var o = document.createElement("option");
          o.value = b[0]; o.textContent = b[1];
          if (b[0] === normBlend(L.blend)) o.selected = true;
          bs.appendChild(o);
        });
        bs.addEventListener("change", function (e) {
          e.stopPropagation();
          L.blend = bs.value;
          changed(false);
        });
        bs.addEventListener("click", function (e) { e.stopPropagation(); });
        row.appendChild(thumb); row.appendChild(nm); row.appendChild(eye); row.appendChild(lock);
        var sub = document.createElement("div");
        sub.className = "px-lsub"; sub.appendChild(op); sub.appendChild(bs);
        row.appendChild(sub);
        row.addEventListener("click", function () {
          var p = px(); if (!p) return;
          try { p.setActive(L.id); } catch (e) {}
          T.bus.emit("pixel:select", { id: L.id });
          renderRows();
        });
        rowsEl.appendChild(row);
      })(s[k]);
    }
  }

  function refreshThumbs() {
    if (!rowsEl) return;
    var s = stack();
    $$(".px-layer", rowsEl).forEach(function (row) {
      var id = row.getAttribute("data-id"), cv = row.querySelector(".px-thumb");
      for (var i = 0; i < s.length; i++) if (s[i].id === id && cv) { drawThumb(cv, s[i]); break; }
    });
  }

  function init() {
    buildPanel();
    renderRows();
    T.bus.on("pixel:layers", renderRows);
    T.bus.on("pixel:select", renderRows);
    T.bus.on("pixel:change", function () {
      if (thumbTimer) clearTimeout(thumbTimer);
      thumbTimer = setTimeout(refreshThumbs, 250);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
