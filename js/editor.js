/* TXT editor engine: virtual paginated canvas, block ids, input pipeline, keyboard.
   Pagination model: ONE .psheet[contenteditable] holds the document. .page frames are
   absolutely positioned backgrounds at --page-h intervals behind it. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  var PAPERS = {
    letter: { w: 816, h: 1056, name: "US Letter" },
    a4: { w: 794, h: 1123, name: "A4" },
    legal: { w: 816, h: 1344, name: "Legal" },
    executive: { w: 720, h: 1008, name: "Executive" }
  };
  var MARGINS = { normal: 96, narrow: 48, moderate: 72, wide: 144 };

  var geom = { paper: "letter", orient: "portrait", margin: "normal", customMargin: 96, columns: 1, colDiv: false };

  function pageW() { var p = PAPERS[geom.paper]; return geom.orient === "portrait" ? p.w : p.h; }
  function pageH() { var p = PAPERS[geom.paper]; return geom.orient === "portrait" ? p.h : p.w; }
  function marginPx() { return geom.margin === "custom" ? geom.customMargin : MARGINS[geom.margin]; }

  function applyGeom() {
    var r = document.documentElement.style;
    r.setProperty("--page-w", pageW() + "px");
    r.setProperty("--page-h", pageH() + "px");
    r.setProperty("--page-pad", marginPx() + "px");
    var sheet = sheetEl();
    if (sheet) {
      sheet.style.columnCount = geom.columns > 1 ? geom.columns : "";
      sheet.style.columnGap = geom.columns > 1 ? "32px" : "";
      sheet.classList.toggle("has-col-div", geom.columns > 1 && geom.colDiv);
    }
    layoutPages();
    T.bus.emit("page:geom", { w: pageW(), h: pageH(), margin: marginPx() });
  }

  function pagesEl() { return $("#pages"); }
  function sheetEl() { return $("#sheetLayer .psheet"); }

  /* ----- document lifecycle ----- */
  var cur = null; // {id,title,html,updatedAt}
  var dirtyTimer = null;

  function newDoc(title, html) {
    var id = T.uid();
    cur = { id: id, title: title || T.t("untitled"), html: html || "", updatedAt: Date.now() };
    T.state.currentId = id;
    T.state.docs.unshift({ id: id, title: cur.title, updatedAt: Date.now(), words: 0 });
    T.persistDoc(id, cur.title, cur.html);
    mountSheet();
    T.bus.emit("doc:open", cur);
    return cur;
  }
  function openDoc(id) {
    var d = T.loadDoc(id);
    cur = { id: d.id, title: d.title, html: d.html, updatedAt: d.updatedAt };
    T.state.currentId = id;
    mountSheet();
    T.bus.emit("doc:open", cur);
    return cur;
  }
  function getDoc() { return cur; }

  function mountSheet() {
    var pages = pagesEl();
    pages.innerHTML =
      '<div id="sheetLayer"><div class="psheet" id="psheet" contenteditable="true" spellcheck="true" aria-label="Document"></div></div>' +
      '<div class="hf-zone" id="hfHeader" contenteditable="true" spellcheck="false" data-ph="Header (click to edit)"></div>' +
      '<div class="hf-zone" id="hfFooter" contenteditable="true" spellcheck="false" data-ph="Footer (click to edit)"></div>';
    var sheet = sheetEl();
    sheet.innerHTML = cur.html || "";
    if (!sheet.innerHTML.trim()) sheet.innerHTML = "<p><br></p>";
    bindSheet(sheet);
    ensureBlockIds(sheet);
    applyGeom();
    updateCounts();
    T.bus.emit("doc:change");
  }

  /* ----- virtual pagination ----- */
  function layoutPages() {
    var pages = pagesEl(), sheet = sheetEl();
    if (!pages || !sheet) return;
    $$(".page", pages).forEach(function (p) { p.remove(); });
    var h = pageH(), w = pageW();
    var sh = Math.max(sheet.scrollHeight, sheet.offsetHeight, h);
    var n = Math.max(1, Math.ceil(sh / h));
    pages.style.height = (n * h) + "px";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var pg = document.createElement("div");
      pg.className = "page";
      pg.style.top = (i * h) + "px";
      pg.innerHTML = '<div class="wm-layer" data-wm="' + i + '"></div><div class="pgnum" data-pg="' + i + '">Page ' + (i + 1) + " of " + n + "</div>";
      frag.appendChild(pg);
    }
    pages.insertBefore(frag, pages.firstChild);
    renderWatermarks();
    T.bus.emit("page:change", { count: n });
  }
  var layoutDeb = T.debounce(layoutPages, 250);

  function pageOfNode(node) {
    var sheet = sheetEl(); if (!sheet || !node) return 1;
    var r = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    var sr = sheet.getBoundingClientRect();
    if (!r) return 1;
    var y = r.top - sr.top + sheet.scrollTop;
    return Math.max(1, Math.floor(y / pageH()) + 1);
  }
  function pageCount() { return $$(".page", pagesEl()).length || 1; }
  function caretPage() {
    var r = T.sel.range();
    var node = r ? (r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer) : null;
    return pageOfNode(node);
  }

  /* ----- watermarks / page color / borders (per-doc, stored in state.doc) ----- */
  function renderWatermarks() {
    var wm = cur && cur.wm;
    $$(".wm-layer", pagesEl()).forEach(function (layer) {
      if (wm && wm.text) {
        layer.innerHTML = '<div class="wm-text ' + (wm.style || "diagonal") + '" style="font-size:' +
          (wm.size || 84) + "px;color:" + (wm.color || "#9aa0b4") + ";opacity:" +
          (wm.opacity != null ? wm.opacity : 0.16) + '">' + T.esc(wm.text) + "</div>";
      } else layer.innerHTML = "";
    });
  }
  function setWatermark(wm) { if (cur) { cur.wm = wm; renderWatermarks(); markDirty(); } }

  /* ----- block ids (for comments / outline anchoring) ----- */
  function ensureBlockIds(sheet) {
    $$(":scope > *", sheet).forEach(function (el) {
      if (!el.getAttribute("data-bid")) el.setAttribute("data-bid", T.uid());
    });
  }

  /* ----- input pipeline ----- */
  function bindSheet(sheet) {
    sheet.addEventListener("input", function () {
      ensureBlockIds(sheet);
      markDirty();
      layoutDeb();
      T.bus.emit("doc:change");
      T.bus.emit("outline:update");
    });
    sheet.addEventListener("paste", function (e) {
      if (T.state.prefs.pastePlain) {
        e.preventDefault();
        var txt = (e.clipboardData || window.clipboardData).getData("text/plain");
        document.execCommand("insertText", false, txt);
      }
    });
    sheet.addEventListener("keydown", onKey);
    sheet.addEventListener("click", function () { T.bus.emit("sel:change"); });
    sheet.addEventListener("keyup", function () { T.bus.emit("sel:change"); updateCursorPos(); });
  }

  function onKey(e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); T.bus.emit("palette:open"); return; }
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); T.bus.emit("sidebar:find"); return; }
    if (mod && e.key.toLowerCase() === "h") { e.preventDefault(); T.bus.emit("sidebar:find"); return; }
    if (mod && e.key === "Enter") { e.preventDefault(); T.cmd("insertPageBreak"); return; }
    if (e.key === "Alt") { T.bus.emit("keytips:toggle"); return; }
    if (e.key === "/" && T.sel.collapsed()) {
      var b = T.sel.block();
      if (b && (b.textContent.trim() === "" || (b.tagName === "P" && b.textContent === ""))) {
        setTimeout(function () { T.bus.emit("slash:maybe"); }, 30);
      }
    }
  }

  /* ----- dirty / autosave ----- */
  var savePillTimer = null;
  function markDirty() {
    setPill(true);
    T.bus.emit("doc:dirty");
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(saveNow, 800);
  }
  function setPill(saving) {
    var pill = $("#savePill"), txt = $("#savePillText");
    if (!pill) return;
    pill.classList.toggle("saving", !!saving);
    if (txt) txt.textContent = saving ? T.t("saving") : T.t("saved") + " - " + T.relTime(cur ? cur.updatedAt : Date.now());
  }
  setInterval(function () { if (cur) setPill(false); }, 30000);

  function htmlOf() {
    var sheet = sheetEl();
    return sheet ? sheet.innerHTML : "";
  }
  function saveNow() {
    if (!cur) return;
    var sheet = sheetEl();
    cur.html = htmlOf();
    cur.updatedAt = Date.now();
    var words = countWords(sheet);
    T.persistDoc(cur.id, cur.title, cur.html);
    T.snapshot(cur.id, cur.title, cur.html, words);
    var meta = T.state.docs.find(function (m) { return m.id === cur.id; });
    if (meta) meta.words = words;
    setPill(false);
    updateCounts();
    T.bus.emit("doc:saved", cur);
  }

  /* ----- counts ----- */
  function textOf() { var s = sheetEl(); return s ? s.innerText || "" : ""; }
  function countWords(sheet) {
    var tx = (sheet ? (sheet.innerText || "") : "").replace(/\u2028/g, "").trim();
    if (!tx) return 0;
    return tx.split(/\s+/).length;
  }
  function updateCounts() {
    var sheet = sheetEl();
    var tx = sheet ? (sheet.innerText || "").replace(/\u2028/g, "") : "";
    var words = tx.trim() ? tx.trim().split(/\s+/).length : 0;
    var chars = tx.length;
    T.bus.emit("counts", { words: words, chars: chars, text: tx });
  }
  function updateCursorPos() {
    var r = T.sel.range();
    if (!r) return;
    var sheet = sheetEl();
    var pre = document.createRange();
    pre.selectNodeContents(sheet);
    pre.setEnd(r.startContainer, r.startOffset);
    var tx = pre.toString();
    var ln = tx.split("\n").length;
    var col = tx.split("\n").pop().length + 1;
    T.bus.emit("cursor", { ln: ln, col: col });
  }

  /* ----- public API ----- */
  T.editor = {
    newDoc: newDoc, openDoc: openDoc, getDoc: getDoc,
    sheetEl: sheetEl, pagesEl: pagesEl,
    layoutPages: layoutPages, applyGeom: applyGeom,
    geom: geom, PAPERS: PAPERS, MARGINS: MARGINS,
    pageW: pageW, pageH: pageH, marginPx: marginPx,
    pageCount: pageCount, caretPage: caretPage, pageOfNode: pageOfNode,
    markDirty: markDirty, saveNow: saveNow, updateCounts: updateCounts,
    setWatermark: setWatermark, renderWatermarks: renderWatermarks,
    textOf: textOf, countWords: countWords, ensureBlockIds: ensureBlockIds
  };
})();
