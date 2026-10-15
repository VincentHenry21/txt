/* TXT ecosystem word-side listeners (v5 wave 1): receives cross-app messages
   via T.store and materializes them in the word document.

   - 'txt:insert-svg'   {id, svg}            -> figure.vector-block[data-vid]
   - 'txt:insert-image' {id, dataUrl}        -> img[data-pid]
   - 'grd:live'         {id, label, html, values} -> div.live-grd[data-grid]
   - 'grd:update'       {id, values}         -> refresh live-grd values
   - 'mem:send'         {text}               -> insert text at cursor

   Double-click a figure.vector-block to open it in the Vector persona
   (T.vac.setSVG); double-click an img[data-pid] to open the Pixel
   persona (T.pixel.loadDataURL). Every studio call is guarded so nothing
   throws before the studios load. */
(function () {
  "use strict";
  var T = window.TXT;

  function sheetEl() { return (T.sel && T.sel.sheet) ? T.sel.sheet() : null; }
  function touchDoc() {
    if (T.editor && T.editor.markDirty) T.editor.markDirty();
    T.bus.emit("doc:change");
  }
  function escId(id) {
    return String(id == null ? "" : id).replace(/["\\]/g, "\\$&");
  }

  /* Insert a block-level node after the block holding the caret (never nested
     inside a heading or paragraph). Falls back to appending at the end. */
  function insertBlockNode(node) {
    var sh = sheetEl();
    if (!sh) return false;
    var r = T.sel.range();
    var blk = (r && T.sel.block) ? T.sel.block() : null;
    if (blk && blk !== sh && blk.parentNode === sh) {
      if (blk.nextSibling) blk.parentNode.insertBefore(node, blk.nextSibling);
      else blk.parentNode.appendChild(node);
    } else if (r && sh.contains(r.commonAncestorContainer)) {
      try {
        r.deleteContents();
        r.insertNode(node);
      } catch (e) { sh.appendChild(node); }
    } else {
      sh.appendChild(node);
    }
    return true;
  }

  function insertTextAtCursor(text) {
    var sh = sheetEl();
    if (!sh || text == null) return false;
    var r = T.sel.range();
    if (r && sh.contains(r.commonAncestorContainer)) {
      try {
        r.deleteContents();
        var tn = document.createTextNode(String(text));
        r.insertNode(tn);
        r.setStartAfter(tn);
        r.collapse(true);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch (e) {
        var p = document.createElement("p");
        p.textContent = String(text);
        sh.appendChild(p);
      }
    } else {
      var p2 = document.createElement("p");
      p2.textContent = String(text);
      sh.appendChild(p2);
    }
    return true;
  }

  /* ---------- vector blocks ---------- */
  function svgRootFrom(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    var svg = tmp.querySelector("svg");
    return svg;
  }
  function upsertVectorBlock(id, svg) {
    var sh = sheetEl();
    if (!sh || id == null) return;
    var sel = 'figure.vector-block[data-vid="' + escId(id) + '"]';
    var fig = sh.querySelector(sel);
    if (!fig) {
      fig = document.createElement("figure");
      fig.className = "vector-block";
      fig.setAttribute("data-vid", String(id));
      fig.setAttribute("tabindex", "0");
      fig.setAttribute("title", "Double-click to edit in VAC Studio");
      var cap = document.createElement("figcaption");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vac-edit-btn";
      btn.innerHTML = T.icon("i-pen") + "<span>Edit in Vector</span>";
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        openInVac(fig);
      });
      cap.appendChild(btn);
      fig.appendChild(cap);
      if (!insertBlockNode(fig)) return;
    }
    var svgEl = svgRootFrom(svg);
    if (svgEl) {
      var old = fig.querySelector(":scope > svg");
      var capEl = fig.querySelector("figcaption");
      if (old) fig.replaceChild(svgEl, old);
      else if (capEl) fig.insertBefore(svgEl, capEl);
      else fig.appendChild(svgEl);
    }
    touchDoc();
  }
  function openInVac(fig) {
    if (typeof T.vac === "undefined" || !T.vac || typeof T.vac.setSVG !== "function") {
      T.toast("VAC Studio is not loaded yet.", "error");
      return;
    }
    var svg = fig.querySelector(":scope > svg");
    if (T.store) T.store.set("vac", "editVid", fig.getAttribute("data-vid"));
    if (T.ecosystem && T.ecosystem.setPersona) T.ecosystem.setPersona("vac");
    try { T.vac.setSVG(svg ? svg.outerHTML : ""); }
    catch (e) { T.toast("Could not open in VAC Studio.", "error"); }
  }

  /* ---------- pixel images ---------- */
  function upsertPixelImage(id, dataUrl) {
    var sh = sheetEl();
    if (!sh || id == null || !dataUrl) return;
    var sel = 'img[data-pid="' + escId(id) + '"]';
    var img = sh.querySelector(sel);
    if (!img) {
      img = document.createElement("img");
      img.className = "pixel-block";
      img.setAttribute("data-pid", String(id));
      img.setAttribute("alt", "Pixel Studio image");
      img.setAttribute("title", "Double-click to edit in Pixel Studio");
      if (!insertBlockNode(img)) return;
    }
    img.src = String(dataUrl);
    touchDoc();
  }
  function openInPixel(img) {
    if (typeof T.pixel === "undefined" || !T.pixel || typeof T.pixel.loadDataURL !== "function") {
      T.toast("Pixel Studio is not loaded yet.", "error");
      return;
    }
    if (T.store) T.store.set("pixel", "editPid", img.getAttribute("data-pid"));
    if (T.ecosystem && T.ecosystem.setPersona) T.ecosystem.setPersona("pixel");
    try { T.pixel.loadDataURL(img.src); }
    catch (e) { T.toast("Could not open in Pixel Studio.", "error"); }
  }

  /* ---------- live GRD blocks ---------- */
  function upsertLiveGrd(id, label, html, values) {
    var sh = sheetEl();
    if (!sh || id == null) return;
    var sel = 'div.live-grd[data-grid="' + escId(id) + '"]';
    var div = sh.querySelector(sel);
    if (!div) {
      div = document.createElement("div");
      div.className = "live-grd";
      div.setAttribute("data-grid", String(id));
      var badge = document.createElement("span");
      badge.className = "live-badge";
      badge.textContent = "LIVE - GRD";
      var body = document.createElement("div");
      body.className = "live-grd-body";
      div.appendChild(badge);
      div.appendChild(body);
      if (!insertBlockNode(div)) return;
    }
    if (label != null) div.setAttribute("data-label", String(label));
    if (html != null) {
      var bodyEl = div.querySelector(".live-grd-body");
      if (bodyEl) bodyEl.innerHTML = String(html);
    }
    if (values !== undefined) {
      try { div.setAttribute("data-values", JSON.stringify(values)); } catch (e) {}
    }
    touchDoc();
  }
  function refreshLiveGrd(id, values) {
    var sh = sheetEl();
    if (!sh || id == null) return;
    var div = sh.querySelector('div.live-grd[data-grid="' + escId(id) + '"]');
    if (!div) return;
    if (values !== undefined) {
      try { div.setAttribute("data-values", JSON.stringify(values)); } catch (e) {}
    }
    div.classList.remove("live-pulse");
    void div.offsetWidth; // restart the pulse animation
    div.classList.add("live-pulse");
  }

  /* ---------- store subscriptions ---------- */
  function onSvg(d) { if (d) upsertVectorBlock(d.id, d.svg); }
  function onImg(d) { if (d) upsertPixelImage(d.id, d.dataUrl); }
  function onGrdLive(d) { if (d) upsertLiveGrd(d.id, d.label, d.html, d.values); }
  function onGrdUpdate(d) { if (d) refreshLiveGrd(d.id, d.values); }
  function onMemSend(d) {
    if (!d) return;
    var text = (typeof d === "string") ? d : d.text;
    if (text == null || text === "") return;
    if (insertTextAtCursor(text)) {
      touchDoc();
      T.toast("Inserted from MEM.");
    }
  }
  if (T.store && T.store.on) {
    T.store.on("txt:insert-svg", onSvg);
    T.store.on("txt:insert-image", onImg);
    T.store.on("grd:live", onGrdLive);
    T.store.on("grd:update", onGrdUpdate);
    T.store.on("mem:send", onMemSend);
  }

  /* ---------- double-click to edit in studios ---------- */
  document.addEventListener("dblclick", function (e) {
    var sh = sheetEl();
    if (!sh || !e.target || !e.target.closest) return;
    var fig = e.target.closest("figure.vector-block");
    if (fig && sh.contains(fig)) {
      if (e.target.closest("button")) return; // the Edit button handles itself
      e.preventDefault();
      openInVac(fig);
      return;
    }
    var img = e.target.closest("img[data-pid]");
    if (img && sh.contains(img)) {
      e.preventDefault();
      openInPixel(img);
    }
  });

  /* ---------- public API ---------- */
  T.ecoword = {
    upsertVectorBlock: upsertVectorBlock,
    upsertPixelImage: upsertPixelImage,
    upsertLiveGrd: upsertLiveGrd,
    insertTextAtCursor: insertTextAtCursor
  };
})();
