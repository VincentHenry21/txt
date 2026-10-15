/* TXT PDF Studio (ecosystem app, #view-pdf).
   Homescreen, TXT-to-PDF conversion with paginated preview and bookmark tree,
   annotation tools (highlight, sticky notes, shapes), true burn-in redaction,
   signature pad, and HTML / TXT / print export.
   Phase 1: per-app topbar (app launcher + settings), persisted per-app
   settings, and a real per-app file model backed by the pdf store namespace.

   Dependency-free IIFE module. Reuses the app's existing export path:
   T.download (blob downloads, js/export.js), T.exporters.pdf (window.print),
   T.sel.sheet() for live word-document content, T.store for persistence,
   T.register for commands, T.bus for ecosystem events.

   Conventions: no emojis, no em dashes, no CSS zoom, no alert(), every
   toolbar button is wired to real logic, every element id prefixed "pdf-",
   theme colors via CSS variables, 44px touch targets, Burmese line-height
   1.85 handled in css/pdf.css. */
(function () {
  "use strict";
  var T = window.TXT;

  var BLOCK_CH = "\u2588";
  var LINES_PER_PAGE = 58;
  var CPL = 92; /* chars per line, pagination estimate */
  var MAX_RECENT = 20;
  var UNDO_MAX = 50;

  var SAMPLE_HTML =
    "<h1>Sample Document</h1>" +
    "<p>This is a sample document used when no live TXT document is open. " +
    "Open a real document in the TXT word processor, then choose " +
    "\"From TXT document\" to convert it here.</p>" +
    "<h2>Getting started</h2>" +
    "<p>Use the toolbar to highlight text, add sticky notes, draw shapes, " +
    "redact sensitive words, and place a signature. The bookmark panel on " +
    "the right is built automatically from headings.</p>" +
    "<h3>Redaction test line</h3>" +
    "<p>The word secretword in this paragraph can be redacted. After you " +
    "choose Apply redactions, secretword is permanently removed from the " +
    "document data and can no longer be exported.</p>";

  /* ---------------- state ---------------- */
  var built = false;
  var doc = null;            /* active document model, see newDocFromHtml */
  var tool = "select";       /* select | highlight | note | shape | redact | sign */
  var hlColor = "#FDE68A";
  var shapeColor = "#E11D48";
  var shapeKind = "rect";
  var undoStack = [];
  var pendingSig = null;     /* signature waiting for placement */
  var dragState = null;
  var sigPad = null;         /* active signature pad in the modal */
  var inkColor = "#111827";  /* signature / draw ink, from settings */
  var singlePage = 0;        /* current page index in single-page mode */

  var SETTING_DEFAULTS = { zoom: "fit", highlight: "#FDE68A", ink: "#111827", pageMode: "continuous" };
  var HL_SWATCHES = ["#FDE68A", "#BBF7D0", "#FBCFE8", "#BFDBFE", "#FED7AA"];
  var INK_SWATCHES = ["#111827", "#1D4ED8", "#B91C1C", "#047857", "#7C3AED"];
  var GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33' +
    ' 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1' +
    ' 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65' +
    ' 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0' +
    ' 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0' +
    ' 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  /* ---------------- small helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return T.esc ? T.esc(s) : String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function uid() { return (T.uid ? T.uid() : "x" + Math.random().toString(36).slice(2)); }
  function toast(m, k) { if (T.toast) T.toast(m, k); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function el(tag, cls, id) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (id) n.id = id;
    return n;
  }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); }
  }
  function safeTitle(t) {
    return (t || "document").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "document";
  }

  /* ---------------- store ---------------- */
  function getRecent() {
    var r = T.store ? T.store.get("pdf", "recent") : null;
    return Array.isArray(r) ? r : [];
  }
  function pushRecent(entry) {
    if (!T.store) return;
    var r = getRecent().filter(function (e) { return e && e.id !== entry.id; });
    r.unshift(entry);
    T.store.set("pdf", "recent", r.slice(0, MAX_RECENT));
  }
  function removeRecent(id) {
    if (!T.store) return;
    T.store.set("pdf", "recent", getRecent().filter(function (e) { return e && e.id !== id; }));
    T.store.set("pdf", "doc:" + id, null);
  }
  function persistDoc() {
    if (!T.store || !doc) return;
    doc.updatedAt = Date.now();
    T.store.set("pdf", "doc:" + doc.id, JSON.parse(JSON.stringify(doc)));
    pushRecent({ id: doc.id, title: doc.title, source: doc.source, updatedAt: doc.updatedAt });
  }

  /* ---------------- per-app settings (persisted under pdf/settings) ---------------- */
  function getSettings() {
    var s = T.store ? T.store.get("pdf", "settings") : null;
    var out = {}, k;
    for (k in SETTING_DEFAULTS) out[k] = (s && s[k] !== undefined && s[k] !== null) ? s[k] : SETTING_DEFAULTS[k];
    return out;
  }

  function setSettings(patch) {
    var s = getSettings(), k;
    for (k in (patch || {})) if (k in SETTING_DEFAULTS) s[k] = patch[k];
    if (T.store) T.store.set("pdf", "settings", s);
    applySettings();
    return s;
  }

  function syncSwatches(containerId, value) {
    var box = $(containerId);
    if (!box) return;
    var want = String(value || "").toLowerCase();
    Array.prototype.forEach.call(box.querySelectorAll("[data-color]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-color")).toLowerCase() === want ? "true" : "false");
    });
  }

  /* Apply settings to live state + DOM. Safe to call before the view exists. */
  function applySettings() {
    var s = getSettings();
    hlColor = s.highlight;
    inkColor = s.ink;
    var hl = $("pdf-hl-color");
    if (hl && hl.value !== s.highlight) hl.value = s.highlight;
    var stage = $("pdf-stage");
    if (stage) {
      stage.setAttribute("data-zoom", s.zoom);
      stage.setAttribute("data-pagemode", s.pageMode);
    }
    var pager = $("pdf-pager");
    if (pager) pager.classList.toggle("hidden", s.pageMode !== "single");
    var zs = $("pdf-set-zoom");
    if (zs) zs.value = s.zoom;
    var pm = $("pdf-set-pagemode");
    if (pm) pm.value = s.pageMode;
    syncSwatches("pdf-set-hl", s.highlight);
    syncSwatches("pdf-set-ink", s.ink);
    var zlab = $("pdf-zoom-label");
    if (zlab) zlab.textContent = ZOOM_LABELS[s.zoom] || s.zoom;
    if (doc && s.pageMode === "single") refreshSinglePage();
  }

  /* ---------------- per-app files (records over the existing recent/doc storage) ---------------- */
  function fileRecord(d) {
    if (!d) return null;
    return { id: d.id, name: d.title || "Untitled", updatedAt: d.updatedAt, source: d.source, payload: d };
  }

  function findFile(id) {
    var e = getRecent().filter(function (x) { return x && x.id === id; })[0];
    if (!e) return null;
    var payload = T.store ? T.store.get("pdf", "doc:" + id) : null;
    return { id: e.id, name: e.title || "Untitled", updatedAt: e.updatedAt, source: e.source, payload: payload || null };
  }

  function listFiles() {
    return getRecent().map(function (e) {
      var payload = T.store ? T.store.get("pdf", "doc:" + e.id) : null;
      return { id: e.id, name: e.title || "Untitled", updatedAt: e.updatedAt, source: e.source, payload: payload || null };
    });
  }

  function createFile(name) {
    var d = newDocFromHtml((name || "").trim() || "Untitled", "", "file");
    return fileRecord(d);
  }

  function renameFile(id, name) {
    name = (name || "").trim();
    if (!name || !T.store) return false;
    var payload = T.store.get("pdf", "doc:" + id);
    if (!payload || !payload.model) { toast("That document is no longer stored."); return false; }
    payload.title = name;
    payload.updatedAt = Date.now();
    T.store.set("pdf", "doc:" + id, payload);
    var r = getRecent();
    r.forEach(function (e) { if (e && e.id === id) { e.title = name; e.updatedAt = payload.updatedAt; } });
    T.store.set("pdf", "recent", r);
    if (doc && doc.id === id) {
      doc.title = name;
      var t = $("pdf-doc-title");
      if (t) t.textContent = name;
    }
    return fileRecord(payload);
  }

  function duplicateFile(id) {
    if (!T.store) return false;
    var payload = T.store.get("pdf", "doc:" + id);
    if (!payload || !payload.model) { toast("That document is no longer stored."); return false; }
    var copy = JSON.parse(JSON.stringify(payload));
    copy.id = uid();
    copy.title = (copy.title || "Untitled") + " copy";
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    T.store.set("pdf", "doc:" + copy.id, copy);
    pushRecent({ id: copy.id, title: copy.title, source: copy.source, updatedAt: copy.updatedAt });
    toast("Duplicated as \"" + copy.title + "\".");
    return fileRecord(copy);
  }

  function removeFile(id) {
    var rec = findFile(id);
    if (!rec) return Promise.resolve(false);
    function done() {
      removeRecent(id);
      if (doc && doc.id === id) doc = null;
      renderRecent($("pdf-search") ? $("pdf-search").value : "");
      show();
      return true;
    }
    if (T.modal) {
      return T.modal({
        title: "Delete document?",
        sub: "Delete \"" + rec.name + "\" permanently? This cannot be undone.",
        okText: "Delete"
      }).then(function (ok) { return ok ? done() : false; });
    }
    return Promise.resolve(done());
  }

  function openFile(id) { return openRecent(id); }

  function promptRename(id) {
    var rec = findFile(id);
    if (!rec) return;
    if (!T.modal) { toast("Renaming is not available here."); return; }
    T.modal({
      title: "Rename document",
      fields: [{ key: "name", label: "Name", type: "text", value: rec.name }],
      okText: "Rename"
    }).then(function (out) {
      if (out && out.name && String(out.name).trim()) {
        renameFile(id, String(out.name).trim());
        renderRecent($("pdf-search") ? $("pdf-search").value : "");
      }
    });
  }

  /* ---------------- text model + pagination (pure helpers) ---------------- */
  function parseBlocks(html) {
    var host = document.createElement("div");
    host.innerHTML = html || "";
    var blocks = [];
    Array.prototype.forEach.call(host.childNodes, function (n) {
      var node = null;
      if (n.nodeType === 1) node = n;
      else if (n.nodeType === 3 && n.textContent.trim()) {
        node = document.createElement("p");
        node.textContent = n.textContent;
      }
      if (!node) return;
      blocks.push({
        id: uid(),
        kind: node.tagName.toLowerCase(),
        html: node.innerHTML,
        text: node.textContent || ""
      });
    });
    if (!blocks.length) blocks.push({ id: uid(), kind: "p", html: "", text: "" });
    return blocks;
  }

  function estimateLines(b) {
    var base = 1, w = 1;
    if (b.kind === "h1") base = 2.2;
    else if (b.kind === "h2") base = 1.8;
    else if (b.kind === "h3") base = 1.5;
    else if (b.kind === "table") { base = 2; w = 0.6; }
    else if (b.kind === "img" || b.kind === "figure") base = 10;
    var chars = (b.text || "").length;
    return base + Math.ceil(chars / CPL) * w;
  }

  /* buildPages(html) -> { blocks, pages, bookmarks }. Pure: no DOM writes. */
  function buildPages(html) {
    var blocks = parseBlocks(html);
    var pages = [[]];
    var used = 0;
    blocks.forEach(function (b, i) {
      var need = estimateLines(b);
      if (used + need > LINES_PER_PAGE && used > 0) { pages.push([]); used = 0; }
      b.page = pages.length; /* 1-based */
      pages[pages.length - 1].push(i);
      used += need;
    });
    var bookmarks = [];
    blocks.forEach(function (b) {
      if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") {
        bookmarks.push({
          level: parseInt(b.kind.charAt(1), 10),
          title: (b.text || "").trim().slice(0, 120) || "Untitled heading",
          blockId: b.id,
          page: b.page
        });
      }
    });
    return { blocks: blocks, pages: pages, bookmarks: bookmarks };
  }

  function blockById(id) {
    if (!doc) return null;
    for (var i = 0; i < doc.model.blocks.length; i++) {
      if (doc.model.blocks[i].id === id) return doc.model.blocks[i];
    }
    return null;
  }

  function textNodesOf(rootEl) {
    var out = [];
    var walker = document.createTreeWalker(rootEl, 4 /* NodeFilter.SHOW_TEXT */, null, false);
    var n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  /* Burn replacement inside one block's html at the given text-node ranges. */
  function redactBlockHtml(html, ranges) {
    var host = document.createElement("div");
    host.innerHTML = html;
    var nodes = textNodesOf(host);
    var byNode = {};
    ranges.forEach(function (r) {
      (byNode[r.nodeIdx] = byNode[r.nodeIdx] || []).push(r);
    });
    Object.keys(byNode).forEach(function (k) {
      var node = nodes[parseInt(k, 10)];
      if (!node) return;
      var rs = byNode[k].slice().sort(function (a, b) { return b.start - a.start; });
      var txt = node.nodeValue;
      rs.forEach(function (r) {
        var s = clamp(r.start, 0, txt.length), e = clamp(r.end, s, txt.length);
        if (e > s) txt = txt.slice(0, s) + BLOCK_CH.repeat(e - s) + txt.slice(e);
      });
      node.nodeValue = txt;
    });
    return host.innerHTML;
  }

  /* ---------------- document lifecycle ---------------- */
  function newDocFromHtml(title, html, source) {
    var model = buildPages(html);
    doc = {
      id: uid(),
      title: title || "Untitled",
      source: source || "txt",
      model: model,
      annotations: { notes: [], shapes: [], redactions: [], signatures: [], highlights: [] },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    undoStack = [];
    pendingSig = null;
    singlePage = 0;
    ensureView();
    showStudio();
    renderDocAsync();
    persistDoc();
    T.bus.emit("pdf:opened", { id: doc.id, title: doc.title });
    return doc;
  }

  function openRecent(id) {
    var saved = T.store ? T.store.get("pdf", "doc:" + id) : null;
    if (!saved || !saved.model) { toast("That document is no longer stored."); return false; }
    doc = saved;
    undoStack = [];
    pendingSig = null;
    singlePage = 0;
    ensureView();
    showStudio();
    renderDocAsync();
    pushRecent({ id: doc.id, title: doc.title, source: doc.source, updatedAt: Date.now() });
    return true;
  }

  function liveSheetHtml() {
    try {
      if (T.sel && T.sel.sheet) {
        var s = T.sel.sheet();
        if (s && s.innerHTML && s.innerHTML.trim()) return s.innerHTML;
      }
    } catch (e) { /* fall through to sample */ }
    return null;
  }

  function openFromTxt() {
    var html = liveSheetHtml();
    var fromLive = !!html;
    var title = "Sample Document";
    if (fromLive) {
      try {
        var d = T.editor && T.editor.getDoc ? T.editor.getDoc() : null;
        if (d && d.title) title = String(d.title).replace(/\.txtdoc$/i, "");
      } catch (e) { title = "TXT Document"; }
    } else {
      html = SAMPLE_HTML;
    }
    newDocFromHtml(title, html, fromLive ? "txt" : "sample");
    if (!fromLive) toast("No live TXT document found, opened a sample instead.");
    return doc;
  }

  function extractBody(html) {
    var m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html || "");
    return m ? m[1] : (html || "");
  }

  function importFile(file) {
    if (!file) return Promise.resolve(false);
    var name = file.name || "file";
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") {
      toast("PDF binary import is not supported in this build. Convert the PDF to HTML or TXT first, then import it here.");
      return Promise.resolve(false);
    }
    function done(text) {
      var html;
      if (ext === "html" || ext === "htm") html = extractBody(text);
      else html = "<p>" + esc(text).split(/\n{2,}/).join("</p><p>").split("\n").join("<br>") + "</p>";
      newDocFromHtml(name.replace(/\.[^.]+$/, "") || "Imported", html, "import");
      return true;
    }
    if (typeof file.text === "function") {
      return file.text().then(function (t) { return done(String(t || "")); });
    }
    return new Promise(function (resolve) {
      try {
        var fr = new FileReader();
        fr.onload = function () { resolve(done(String(fr.result || ""))); };
        fr.onerror = function () { toast("Could not read that file."); resolve(false); };
        fr.readAsText(file);
      } catch (e) { toast("Could not read that file."); resolve(false); }
    });
  }

  /* ---------------- view skeleton (lazy) ---------------- */
  function ensureView() {
    if (built) return;
    var view = $("view-pdf");
    if (!view) return;
    view.innerHTML = "";
    buildTopbar(view);
    buildHome(view);
    buildStudio(view);
    buildSettingsDrawer(view);
    applySettings();
    built = true;
  }

  function showStudio() {
    var home = $("pdf-home"), studio = $("pdf-studio");
    if (home) home.classList.add("hidden");
    if (studio) studio.classList.remove("hidden");
    setTool("select");
  }

  function show() {
    ensureView();
    var v = $("view-pdf");
    if (v) v.classList.remove("hidden");
    var home = $("pdf-home"), studio = $("pdf-studio");
    if (home) home.classList.toggle("hidden", !!doc);
    if (studio) studio.classList.toggle("hidden", !doc);
    renderRecent();
  }

  function hide() {
    var v = $("view-pdf");
    if (v) v.classList.add("hidden");
  }

  /* ---------------- per-app topbar (launcher + settings) ---------------- */
  function buildTopbar(view) {
    var bar = el("div", "pdf-topbar");
    bar.id = "pdf-topbar";
    var badge = el("span", "pdf-app-badge");
    var pdfTopLogo = (T.appLogoImg ? T.appLogoImg("pdf") : null);
    if (pdfTopLogo) { badge.className += " app-logo-badge"; badge.appendChild(pdfTopLogo); }
    else { badge.textContent = "PDF"; }
    var name = el("span", "pdf-topbar-name");
    name.textContent = "PDF Studio";
    var spacer = el("span", "pdf-topbar-spacer");
    var signBtn = el("button", "pdf-sign-btn");
    signBtn.type = "button";
    signBtn.id = "pdf-sign-btn";
    signBtn.textContent = "Sign";
    signBtn.setAttribute("aria-label", "Sign this document");
    signBtn.addEventListener("click", function () {
      ensureView();
      if (!doc) { toast("Open a document first, then sign it."); return; }
      showStudio();
      openSigModal();
    });
    var waffle = el("button", "icon-btn waffle-btn");
    waffle.type = "button";
    waffle.id = "pdf-launcher-btn";
    waffle.title = "Apps";
    waffle.setAttribute("aria-label", "Open app launcher");
    var dots = el("span", "waffle-dots");
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 9; i++) dots.appendChild(el("i"));
    waffle.appendChild(dots);
    waffle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (T.ecosystem && typeof T.ecosystem.toggleLauncher === "function") T.ecosystem.toggleLauncher();
      else toast("The app launcher is not available in this build.");
    });
    var gear = el("button", "icon-btn");
    gear.type = "button";
    gear.id = "pdf-settings-btn";
    gear.title = "PDF settings";
    gear.setAttribute("aria-label", "PDF settings");
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener("click", openSettings);
    bar.appendChild(badge);
    bar.appendChild(name);
    bar.appendChild(spacer);
    bar.appendChild(signBtn);
    bar.appendChild(waffle);
    bar.appendChild(gear);
    view.insertBefore(bar, view.firstChild);
  }

  /* ---------------- homescreen ---------------- */
  function buildHome(view) {
    var home = el("div", "eco-home");
    home.id = "pdf-home";

    var head = el("div", "eco-home-head");
    var badge = el("span", "app-badge");
    var pdfLogo = (T.appLogoImg ? T.appLogoImg("pdf") : null);
    if (pdfLogo) { badge.className += " app-logo-badge"; badge.appendChild(pdfLogo); }
    else { badge.style.background = "var(--pdf-brand)"; badge.textContent = "PDF"; }
    var titles = el("div");
    var h1 = el("h1"); h1.textContent = "PDF Studio";
    var p = el("p"); p.textContent = "Convert, annotate, redact, sign and print documents.";
    titles.appendChild(h1); titles.appendChild(p);
    var spacer = el("span", "spacer");
    head.appendChild(badge); head.appendChild(titles); head.appendChild(spacer);
    home.appendChild(head);

    var search = el("input", "eco-home-search");
    search.id = "pdf-search";
    search.type = "search";
    search.placeholder = "Search recent PDFs...";
    search.setAttribute("aria-label", "Search recent PDFs");
    search.addEventListener("input", function () { renderRecent(search.value); });
    home.appendChild(search);

    var secNew = el("div", "eco-home-sec");
    var hNew = el("h2"); hNew.textContent = "New";
    var newRow = el("div", "eco-home-new");
    var bTxt = el("button", "eco-home-tpl");
    bTxt.id = "pdf-new-txt";
    bTxt.innerHTML = (T.icon ? T.icon("i-file") : "") + "<span>From TXT document</span>";
    bTxt.addEventListener("click", function () { openFromTxt(); });
    var bImp = el("button", "eco-home-tpl");
    bImp.id = "pdf-new-import";
    bImp.innerHTML = (T.icon ? T.icon("i-upload") : "") + "<span>Open / import file</span>";
    bImp.addEventListener("click", function () { var f = $("pdf-file"); if (f) f.click(); });
    var file = el("input");
    file.id = "pdf-file";
    file.type = "file";
    file.accept = ".pdf,.html,.txt";
    file.style.display = "none";
    file.addEventListener("change", function () {
      if (file.files && file.files[0]) importFile(file.files[0]);
      file.value = "";
    });
    newRow.appendChild(bTxt); newRow.appendChild(bImp); newRow.appendChild(file);
    secNew.appendChild(hNew); secNew.appendChild(newRow);
    home.appendChild(secNew);

    var secRec = el("div", "eco-home-sec");
    var hRec = el("h2"); hRec.textContent = "Files";
    var grid = el("div", "eco-home-grid");
    grid.id = "pdf-recent-grid";
    var empty = el("div", "eco-home-empty");
    empty.id = "pdf-recent-empty";
    empty.textContent = "No recent PDFs yet. Convert a TXT document or import a file to get started.";
    secRec.appendChild(hRec); secRec.appendChild(grid); secRec.appendChild(empty);
    home.appendChild(secRec);

    var foot = el("div", "pdf-eco-foot");
    foot.id = "pdf-eco-foot";
    foot.textContent = "Part of NXT OS";
    home.appendChild(foot);

    view.appendChild(home);
  }

  function renderRecent(filter) {
    var grid = $("pdf-recent-grid"), empty = $("pdf-recent-empty");
    if (!grid) return;
    grid.innerHTML = "";
    var q = (filter || "").trim().toLowerCase();
    var list = getRecent().filter(function (e) {
      return e && (!q || (e.title || "").toLowerCase().indexOf(q) >= 0);
    });
    if (empty) empty.style.display = list.length ? "none" : "";
    list.forEach(function (e) {
      var card = el("article", "eco-home-card");
      var h3 = el("h3"); h3.textContent = e.title || "Untitled";
      var meta = el("div", "meta");
      meta.textContent = fmtTime(e.updatedAt) + "  ·  " + (e.source === "txt" ? "TXT document" : e.source === "import" ? "Imported file" : "Sample");
      var row = el("div", "row");
      var open = el("button", "pdf-btn pdf-btn-primary");
      open.type = "button";
      open.textContent = "Open";
      open.addEventListener("click", function (ev) { ev.stopPropagation(); openRecent(e.id); });
      var ren = el("button", "pdf-btn pdf-btn-sm");
      ren.type = "button";
      ren.textContent = "Rename";
      ren.setAttribute("aria-label", "Rename " + (e.title || "document"));
      ren.addEventListener("click", function (ev) { ev.stopPropagation(); promptRename(e.id); });
      var dup = el("button", "pdf-btn pdf-btn-sm");
      dup.type = "button";
      dup.textContent = "Duplicate";
      dup.setAttribute("aria-label", "Duplicate " + (e.title || "document"));
      dup.addEventListener("click", function (ev) {
        ev.stopPropagation();
        duplicateFile(e.id);
        renderRecent($("pdf-search") ? $("pdf-search").value : "");
      });
      var del = el("button", "pdf-btn pdf-btn-sm");
      del.type = "button";
      del.textContent = "Delete";
      del.setAttribute("aria-label", "Delete " + (e.title || "document"));
      del.addEventListener("click", function (ev) {
        ev.stopPropagation();
        removeFile(e.id).then(function (ok) {
          if (ok) {
            toast("Document deleted.");
            renderRecent($("pdf-search") ? $("pdf-search").value : "");
          }
        });
      });
      row.appendChild(open); row.appendChild(ren); row.appendChild(dup); row.appendChild(del);
      card.appendChild(h3); card.appendChild(meta); card.appendChild(row);
      card.addEventListener("click", function () { openRecent(e.id); });
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") openRecent(e.id);
      });
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      grid.appendChild(card);
    });
  }

  /* ---------------- unified drawer pattern ----------------
     Every drawer in this app uses the same classes (.pdf-scrim overlay +
     .pdf-drawer panel with .pdf-drawer-head/.pdf-drawer-body), the same
     open/close helpers, and the same overlay handling (scrim click and
     Escape both close). */
  function openPdfDrawer(dr, scrim) {
    if (scrim) scrim.classList.remove("hidden");
    if (dr) dr.classList.remove("hidden");
  }

  function closePdfDrawer(dr, scrim) {
    if (scrim) scrim.classList.add("hidden");
    if (dr) dr.classList.add("hidden");
  }

  function closeOpenDrawers() {
    var open = document.querySelectorAll("#view-pdf .pdf-drawer:not(.hidden)");
    Array.prototype.forEach.call(open, function (dr) {
      var scrim = dr.previousElementSibling;
      if (scrim && scrim.classList && scrim.classList.contains("pdf-scrim")) scrim.classList.add("hidden");
      dr.classList.add("hidden");
    });
  }

  /* ---------------- settings drawer ---------------- */
  function openSettings() {
    ensureView();
    applySettings();
    openPdfDrawer($("pdf-settings-drawer"), $("pdf-settings-scrim"));
  }

  function closeSettings() {
    closePdfDrawer($("pdf-settings-drawer"), $("pdf-settings-scrim"));
  }

  function swatchRow(containerId, colors, label) {
    var box = el("div", "pdf-swatches");
    box.id = containerId;
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-label", label);
    colors.forEach(function (c) {
      var b = el("button", "pdf-swatch");
      b.type = "button";
      b.setAttribute("data-color", c);
      b.style.background = c;
      b.setAttribute("aria-label", label + " " + c);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        var patch = {};
        patch[containerId === "pdf-set-hl" ? "highlight" : "ink"] = c;
        setSettings(patch);
      });
      box.appendChild(b);
    });
    return box;
  }

  function buildSettingsDrawer(view) {
    var scrim = el("div", "pdf-scrim hidden");
    scrim.id = "pdf-settings-scrim";
    scrim.setAttribute("aria-hidden", "true");
    scrim.addEventListener("click", closeSettings);

    var dr = el("div", "pdf-drawer hidden");
    dr.id = "pdf-settings-drawer";
    dr.setAttribute("role", "dialog");
    dr.setAttribute("aria-label", "PDF settings");

    var head = el("div", "pdf-drawer-head");
    var h2 = el("h2"); h2.textContent = "PDF settings";
    var close = el("button", "icon-btn");
    close.type = "button";
    close.id = "pdf-settings-close";
    close.setAttribute("aria-label", "Close settings");
    close.innerHTML = T.icon ? T.icon("i-x") : "x";
    close.addEventListener("click", closeSettings);
    head.appendChild(h2); head.appendChild(close);
    dr.appendChild(head);

    var body = el("div", "pdf-drawer-body");

    /* default zoom */
    var zr = el("div", "pdf-set-row");
    var zl = el("label"); zl.setAttribute("for", "pdf-set-zoom"); zl.textContent = "Default zoom";
    var zs = el("select", "pdf-select pdf-set-select");
    zs.id = "pdf-set-zoom";
    [["fit", "Fit width"], ["100", "100%"], ["150", "150%"]].forEach(function (o) {
      var op = el("option"); op.value = o[0]; op.textContent = o[1]; zs.appendChild(op);
    });
    zs.addEventListener("change", function () { setSettings({ zoom: zs.value }); });
    var zh = el("p", "pdf-set-hint");
    zh.textContent = "Controls how large document pages render in the viewer.";
    zr.appendChild(zl); zr.appendChild(zs); zr.appendChild(zh);
    body.appendChild(zr);

    /* highlight color */
    var hr = el("div", "pdf-set-row");
    var hlab = el("span", "pdf-set-label"); hlab.id = "pdf-set-hl-label"; hlab.textContent = "Highlight color";
    var hb = swatchRow("pdf-set-hl", HL_SWATCHES, "Highlight color");
    hb.setAttribute("aria-labelledby", "pdf-set-hl-label");
    var hh = el("p", "pdf-set-hint");
    hh.textContent = "Used for new highlights made with the highlight tool.";
    hr.appendChild(hlab); hr.appendChild(hb); hr.appendChild(hh);
    body.appendChild(hr);

    /* ink color */
    var ir = el("div", "pdf-set-row");
    var ilab = el("span", "pdf-set-label"); ilab.id = "pdf-set-ink-label"; ilab.textContent = "Ink color";
    var ib = swatchRow("pdf-set-ink", INK_SWATCHES, "Ink color");
    ib.setAttribute("aria-labelledby", "pdf-set-ink-label");
    var ih = el("p", "pdf-set-hint");
    ih.textContent = "Used for drawn signatures and typed signature text.";
    ir.appendChild(ilab); ir.appendChild(ib); ir.appendChild(ih);
    body.appendChild(ir);

    /* page mode */
    var pr = el("div", "pdf-set-row");
    var pl = el("label"); pl.setAttribute("for", "pdf-set-pagemode"); pl.textContent = "Page mode";
    var ps = el("select", "pdf-select pdf-set-select");
    ps.id = "pdf-set-pagemode";
    [["continuous", "Continuous"], ["single", "Single page"]].forEach(function (o) {
      var op = el("option"); op.value = o[0]; op.textContent = o[1]; ps.appendChild(op);
    });
    ps.addEventListener("change", function () { setSettings({ pageMode: ps.value }); });
    var ph = el("p", "pdf-set-hint");
    ph.textContent = "Continuous scrolls through every page. Single page shows one page at a time with pager controls.";
    pr.appendChild(pl); pr.appendChild(ps); pr.appendChild(ph);
    body.appendChild(pr);

    /* about */
    var about = el("div", "pdf-set-about");
    about.id = "pdf-set-about";
    var ah = el("h3"); ah.textContent = "About";
    var ap = el("p");
    ap.textContent = "PDF Studio is part of the NXT OS. Convert, annotate, redact, sign and print documents, all on this device.";
    about.appendChild(ah); about.appendChild(ap);
    body.appendChild(about);

    dr.appendChild(body);
    view.appendChild(scrim);
    view.appendChild(dr);
  }

  /* ---------------- studio ---------------- */
  function toolButton(id, toolId, label, iconId) {
    var b = el("button", "pdf-tool");
    b.type = "button";
    b.id = id;
    b.setAttribute("data-tool", toolId);
    b.title = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = (T.icon ? T.icon(iconId) : "") + "<span>" + esc(label) + "</span>";
    b.addEventListener("click", function () { setTool(toolId); });
    return b;
  }

  function actionButton(id, label, iconId, fn) {
    var b = el("button", "pdf-tool pdf-act");
    b.type = "button";
    b.id = id;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = (T.icon ? T.icon(iconId) : "") + "<span>" + esc(label) + "</span>";
    b.addEventListener("click", fn);
    return b;
  }

  /* ---------------- toolbar overflow ("More" sheet) ---------------- */
  function openMore() {
    var w = $("pdf-more-wrap"), s = $("pdf-more-scrim"), b = $("pdf-more-btn");
    if (!w) return;
    w.classList.add("open");
    if (s) s.classList.remove("hidden");
    if (b) b.setAttribute("aria-expanded", "true");
  }

  function closeMore() {
    var w = $("pdf-more-wrap"), s = $("pdf-more-scrim"), b = $("pdf-more-btn");
    if (w) w.classList.remove("open");
    if (s) s.classList.add("hidden");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function toggleMore() {
    var w = $("pdf-more-wrap");
    if (w && w.classList.contains("open")) closeMore();
    else openMore();
  }

  /* ---------------- zoom stepper ---------------- */
  var ZOOM_LEVELS = ["fit", "100", "150"];
  var ZOOM_LABELS = { fit: "Fit", "100": "100%", "150": "150%" };

  function zoomStep(dir) {
    var cur = getSettings().zoom;
    var i = ZOOM_LEVELS.indexOf(cur);
    if (i < 0) i = 0;
    var n = clamp(i + dir, 0, ZOOM_LEVELS.length - 1);
    if (n === i) { toast(dir > 0 ? "Already at maximum zoom." : "Already at minimum zoom."); return; }
    setSettings({ zoom: ZOOM_LEVELS[n] });
  }

  /* ---------------- render pipeline ---------------- */
  function nextFrame(fn) {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(function () { fn(); });
    } else { setTimeout(fn, 16); }
  }

  /* Skeleton page placeholders shown while a document renders. */
  function showStageSkeletons() {
    var stage = $("pdf-stage");
    if (!stage) return;
    stage.innerHTML = "";
    for (var i = 0; i < 3; i++) stage.appendChild(el("div", "nxt-skeleton pdf-page-skel"));
  }

  function renderDocAsync() {
    showStageSkeletons();
    nextFrame(function () { renderPages(); renderSide(); });
  }

  function buildStudio(view) {
    var studio = el("div", "pdf-studio hidden");
    studio.id = "pdf-studio";

    var tb = el("div", "pdf-toolbar");
    tb.id = "pdf-toolbar";
    tb.setAttribute("role", "toolbar");
    tb.setAttribute("aria-label", "PDF tools");

    /* Overflow "More" sheet: rarely-used tools live in moreWrap. On desktop
       the wrap is display:contents (tools lay out inline, More button hidden);
       on <=640px it becomes a bottom sheet toggled by the More button. */
    var moreWrap = el("div", "pdf-more-wrap nxt-sheet");
    moreWrap.id = "pdf-more-wrap";
    var moreHandle = el("div", "nxt-sheet-handle");
    moreHandle.setAttribute("aria-hidden", "true");
    moreWrap.appendChild(moreHandle);
    function tbAdd(node, overflow) {
      if (overflow) moreWrap.appendChild(node);
      else tb.appendChild(node);
    }

    tbAdd(actionButton("pdf-back", "Home", "i-home", function () {
      var home = $("pdf-home"); if (home) home.classList.remove("hidden");
      studio.classList.add("hidden");
      renderRecent();
    }));
    var titleWrap = el("span", "pdf-doc-title");
    titleWrap.id = "pdf-doc-title";
    tbAdd(titleWrap, false);

    tbAdd(toolButton("pdf-tool-select", "select", "Select", "i-cursor"), false);
    tbAdd(toolButton("pdf-tool-highlight", "highlight", "Highlight", "i-highlight"), false);
    tbAdd(toolButton("pdf-tool-note", "note", "Note", "i-note"), false);
    tbAdd(toolButton("pdf-tool-shape", "shape", "Shape", "i-shapes"), true);
    tbAdd(toolButton("pdf-tool-redact", "redact", "Redact", "i-redact"), true);
    tbAdd(toolButton("pdf-tool-sign", "sign", "Sign", "i-sign"), true);

    var hlWrap = el("label", "pdf-color-wrap");
    hlWrap.title = "Highlight color";
    hlWrap.innerHTML = "<span>Highlight</span>";
    var hl = el("input", "pdf-color");
    hl.id = "pdf-hl-color";
    hl.type = "color";
    hl.value = hlColor;
    hl.setAttribute("aria-label", "Highlight color");
    hl.addEventListener("input", function () { setSettings({ highlight: hl.value }); });
    hlWrap.appendChild(hl);
    tbAdd(hlWrap, true);

    var shWrap = el("label", "pdf-color-wrap");
    shWrap.title = "Shape and redaction color";
    shWrap.innerHTML = "<span>Shape</span>";
    var sh = el("input", "pdf-color");
    sh.id = "pdf-shape-color";
    sh.type = "color";
    sh.value = shapeColor;
    sh.setAttribute("aria-label", "Shape color");
    sh.addEventListener("input", function () { shapeColor = sh.value; });
    shWrap.appendChild(sh);
    tbAdd(shWrap, true);

    var kind = el("select", "pdf-select");
    kind.id = "pdf-shape-kind";
    kind.setAttribute("aria-label", "Shape kind");
    [["rect", "Rectangle"], ["ellipse", "Ellipse"], ["line", "Line"]].forEach(function (o) {
      var op = el("option"); op.value = o[0]; op.textContent = o[1];
      kind.appendChild(op);
    });
    kind.addEventListener("change", function () { shapeKind = kind.value; setTool("shape"); });
    tbAdd(kind, true);

    tbAdd(actionButton("pdf-undo", "Undo", "i-undo", undo), false);
    tbAdd(actionButton("pdf-apply-redact", "Apply redactions", "i-lock", function () { applyRedactions(); }), true);
    tbAdd(actionButton("pdf-sig-new", "New signature", "i-sign", openSigModal), true);
    tbAdd(actionButton("pdf-export-html", "Export HTML", "i-export", downloadHTML), true);
    tbAdd(actionButton("pdf-export-txt", "Export TXT", "i-export", downloadTXT), true);
    tbAdd(actionButton("pdf-print", "Export / Print", "i-print", doPrint), true);

    var moreBtn = el("button", "pdf-more-btn");
    moreBtn.type = "button";
    moreBtn.id = "pdf-more-btn";
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.setAttribute("aria-controls", "pdf-more-wrap");
    moreBtn.innerHTML = "<span>More</span>" + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    moreBtn.addEventListener("click", toggleMore);
    tb.appendChild(moreBtn);
    tb.appendChild(moreWrap);
    /* choosing a tool from the sheet activates it and closes the sheet */
    moreWrap.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button") : null;
      if (b && b.classList.contains("pdf-tool")) closeMore();
    });
    var moreScrim = el("div", "pdf-more-scrim hidden");
    moreScrim.id = "pdf-more-scrim";
    moreScrim.setAttribute("aria-hidden", "true");
    moreScrim.addEventListener("click", closeMore);
    view.appendChild(moreScrim);

    var main = el("div", "pdf-main");
    var stage = el("div", "pdf-stage");
    stage.id = "pdf-stage";
    var side = el("aside", "pdf-side");
    side.id = "pdf-side";
    buildSide(side);
    main.appendChild(stage);
    main.appendChild(side);

    var zc = el("div", "pdf-zoomctl");
    zc.id = "pdf-zoomctl";
    zc.setAttribute("role", "group");
    zc.setAttribute("aria-label", "Zoom controls");
    var zOut = el("button", "pdf-zoom-btn");
    zOut.type = "button";
    zOut.id = "pdf-zoom-out";
    zOut.textContent = "\u2212";
    zOut.setAttribute("aria-label", "Zoom out");
    zOut.addEventListener("click", function () { zoomStep(-1); });
    var zLab = el("span", "pdf-zoom-label");
    zLab.id = "pdf-zoom-label";
    zLab.textContent = "Fit";
    var zIn = el("button", "pdf-zoom-btn");
    zIn.type = "button";
    zIn.id = "pdf-zoom-in";
    zIn.textContent = "+";
    zIn.setAttribute("aria-label", "Zoom in");
    zIn.addEventListener("click", function () { zoomStep(1); });
    zc.appendChild(zOut);
    zc.appendChild(zLab);
    zc.appendChild(zIn);
    main.appendChild(zc);

    var pager = el("div", "pdf-pager hidden");
    pager.id = "pdf-pager";
    var prev = el("button", "pdf-btn");
    prev.type = "button"; prev.id = "pdf-pager-prev";
    prev.textContent = "Previous";
    prev.setAttribute("aria-label", "Previous page");
    prev.addEventListener("click", function () { singlePage--; refreshSinglePage(); });
    var plabel = el("span", "pdf-pager-label");
    plabel.id = "pdf-pager-label";
    plabel.textContent = "Page 1 of 1";
    var next = el("button", "pdf-btn");
    next.type = "button"; next.id = "pdf-pager-next";
    next.textContent = "Next";
    next.setAttribute("aria-label", "Next page");
    next.addEventListener("click", function () { singlePage++; refreshSinglePage(); });
    pager.appendChild(prev); pager.appendChild(plabel); pager.appendChild(next);

    studio.appendChild(tb);
    studio.appendChild(pager);
    studio.appendChild(main);

    /* NXT OS status bar credit (Phase 1 Identity): right-aligned brand credit
       rendered in the app's H3NZ signature palette accent. */
    var sbBar = el("div", "nxt-statusbar", "pdf-statusbar");
    var sbBrand = el("span", "nxt-sb-brand");
    sbBrand.textContent = "NXT PDF • Developed by H3NZ";
    sbBar.appendChild(sbBrand);
    studio.appendChild(sbBar);

    view.appendChild(studio);

    wireStage(stage);
  }

  function refreshSinglePage() {
    if (!doc) return;
    var n = doc.model.pages.length;
    singlePage = clamp(singlePage, 0, Math.max(n - 1, 0));
    var stage = $("pdf-stage");
    if (!stage) return;
    var pages = stage.querySelectorAll(".pdf-page");
    Array.prototype.forEach.call(pages, function (pg, i) {
      pg.classList.toggle("is-current", i === singlePage);
    });
    var caps = stage.querySelectorAll(".pdf-page-cap");
    Array.prototype.forEach.call(caps, function (c, i) {
      c.classList.toggle("is-current", i === singlePage);
    });
    var lbl = $("pdf-pager-label");
    if (lbl) lbl.textContent = "Page " + (singlePage + 1) + " of " + n;
    stage.scrollTop = 0;
  }

  var SIDE_TABS = [
    ["bookmarks", "Bookmarks"],
    ["comments", "Comments"],
    ["redactions", "Redactions"],
    ["signatures", "Signatures"]
  ];

  function buildSide(side) {
    var tabs = el("div", "pdf-tabs");
    tabs.setAttribute("role", "tablist");
    SIDE_TABS.forEach(function (t, i) {
      var b = el("button", "pdf-tab" + (i === 0 ? " active" : ""));
      b.type = "button";
      b.id = "pdf-tab-" + t[0];
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.textContent = t[1];
      b.addEventListener("click", function () { selectSideTab(t[0]); });
      tabs.appendChild(b);
    });
    side.appendChild(tabs);
    SIDE_TABS.forEach(function (t, i) {
      var p = el("div", "pdf-panel" + (i === 0 ? "" : " hidden"));
      p.id = "pdf-panel-" + t[0];
      p.setAttribute("role", "tabpanel");
      side.appendChild(p);
    });
  }

  function selectSideTab(name) {
    SIDE_TABS.forEach(function (t) {
      var b = $("pdf-tab-" + t[0]), p = $("pdf-panel-" + t[0]);
      var on = t[0] === name;
      if (b) { b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); }
      if (p) p.classList.toggle("hidden", !on);
    });
  }

  function setTool(t) {
    tool = t;
    var btns = document.querySelectorAll("#pdf-toolbar [data-tool]");
    Array.prototype.forEach.call(btns, function (b) {
      var on = b.getAttribute("data-tool") === t;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var stage = $("pdf-stage");
    if (stage) stage.setAttribute("data-tool", t);
    if (t === "sign" && !pendingSig) openSigModal();
  }

  /* ---------------- pages + overlays ---------------- */
  function renderPages() {
    var stage = $("pdf-stage");
    if (!stage || !doc) return;
    stage.innerHTML = "";
    var title = $("pdf-doc-title");
    if (title) title.textContent = doc.title;
    doc.model.pages.forEach(function (pageBlocks, pi) {
      var page = el("div", "pdf-page");
      page.id = "pdf-page-" + (pi + 1);
      page.setAttribute("data-page", String(pi));
      var inner = el("div", "pdf-page-inner");
      pageBlocks.forEach(function (bi) {
        var b = doc.model.blocks[bi];
        var tag = /^[a-z][a-z0-9]*$/.test(b.kind) ? b.kind : "p";
        var node = document.createElement(tag);
        node.className = "pdf-block";
        node.setAttribute("data-pdf-block", b.id);
        node.innerHTML = b.html;
        inner.appendChild(node);
      });
      var annot = el("div", "pdf-annot");
      page.appendChild(inner);
      page.appendChild(annot);
      renderOverlays(annot, pi);
      stage.appendChild(page);
      var cap = el("div", "pdf-page-cap");
      cap.textContent = "Page " + (pi + 1) + " of " + doc.model.pages.length;
      stage.appendChild(cap);
    });
    applySettings();
  }

  function pct(v) { return clamp(v, 0, 100) + "%"; }

  function renderOverlays(annot, pi) {
    var A = doc.annotations;
    A.notes.forEach(function (n, idx) {
      if (n.page !== pi) return;
      var pin = el("button", "pdf-note-pin");
      pin.type = "button";
      pin.style.left = pct(n.x); pin.style.top = pct(n.y);
      pin.textContent = String(idx + 1);
      pin.title = (n.text || "").slice(0, 80) || "Note";
      pin.setAttribute("aria-label", "Note " + (idx + 1) + ": " + pin.title);
      pin.addEventListener("click", function (ev) {
        ev.stopPropagation();
        selectSideTab("comments");
        var row = $("pdf-note-" + n.id);
        if (row) { row.scrollIntoView({ block: "nearest" }); row.classList.add("flash"); setTimeout(function () { row.classList.remove("flash"); }, 1200); }
      });
      annot.appendChild(pin);
    });
    A.shapes.forEach(function (s) {
      if (s.page !== pi) return;
      var d = el("div", "pdf-shape pdf-shape-" + s.kind);
      d.setAttribute("data-pdf-shape", s.id);
      d.style.left = pct(s.x); d.style.top = pct(s.y);
      if (s.kind === "line") {
        var len = Math.sqrt(Math.pow(s.w, 2) + Math.pow(s.h, 2));
        var ang = Math.atan2(s.h, s.w) * 180 / Math.PI;
        d.style.width = len + "%";
        d.style.height = "3px";
        d.style.background = s.color;
        d.style.transformOrigin = "0 50%";
        d.style.transform = "rotate(" + ang + "deg)";
      } else {
        d.style.width = pct(Math.max(s.w, 0.5));
        d.style.height = pct(Math.max(s.h, 0.5));
        d.style.borderColor = s.color;
      }
      annot.appendChild(d);
    });
    A.redactions.forEach(function (r) {
      if (r.page !== pi) return;
      var d = el("div", "pdf-redactbox" + (r.applied ? " is-applied" : ""));
      d.setAttribute("data-pdf-redact", r.id);
      d.style.left = pct(r.x); d.style.top = pct(r.y);
      d.style.width = pct(Math.max(r.w, 0.5)); d.style.height = pct(Math.max(r.h, 0.5));
      d.title = r.applied ? "Redaction applied (burned in)" : "Redaction pending, choose Apply redactions";
      annot.appendChild(d);
    });
    A.signatures.forEach(function (s) {
      if (s.page !== pi) return;
      var wrap = el("div", "pdf-sig");
      wrap.setAttribute("data-pdf-sig", s.id);
      wrap.style.left = pct(s.x); wrap.style.top = pct(s.y);
      wrap.style.width = pct(s.w || 30);
      if (s.dataUrl) {
        var img = el("img", "pdf-sig-img");
        img.src = s.dataUrl;
        img.alt = "Signature of " + s.signer;
        wrap.appendChild(img);
      } else {
        var typed = el("div", "pdf-sig-typed");
        typed.textContent = s.typed || s.signer;
        typed.style.color = s.ink || inkColor;
        wrap.appendChild(typed);
      }
      var badge = el("div", "pdf-sig-badge");
      badge.textContent = s.stamp;
      wrap.appendChild(badge);
      var grip = el("span", "pdf-sig-grip");
      grip.title = "Drag to resize";
      grip.setAttribute("aria-hidden", "true");
      wrap.appendChild(grip);
      makeDraggable(wrap, s, grip);
      annot.appendChild(wrap);
    });
  }

  function makeDraggable(wrapEl, sig, grip) {
    var mode = null, startX = 0, startY = 0, startW = 0, ox = 0, oy = 0;
    function pageOf(node) {
      while (node && !node.classList.contains("pdf-page")) node = node.parentNode;
      return node;
    }
    wrapEl.addEventListener("pointerdown", function (e) {
      if (e.target === grip) mode = "resize"; else mode = "move";
      startX = e.clientX; startY = e.clientY;
      startW = sig.w || 30; ox = sig.x; oy = sig.y;
      wrapEl.setPointerCapture && wrapEl.setPointerCapture(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
    wrapEl.addEventListener("pointermove", function (e) {
      if (!mode) return;
      var page = pageOf(wrapEl);
      if (!page) return;
      var r = page.getBoundingClientRect();
      var dx = (e.clientX - startX) / (r.width || 1) * 100;
      var dy = (e.clientY - startY) / (r.height || 1) * 100;
      if (mode === "move") { sig.x = clamp(ox + dx, 0, 95); sig.y = clamp(oy + dy, 0, 97); }
      else { sig.w = clamp(startW + dx, 8, 90); }
      wrapEl.style.left = pct(sig.x); wrapEl.style.top = pct(sig.y);
      wrapEl.style.width = pct(sig.w);
    });
    wrapEl.addEventListener("pointerup", function () {
      if (mode) { mode = null; checkpoint(); persistDoc(); }
    });
  }

  /* ---------------- side panels ---------------- */
  function renderSide() {
    renderBookmarks();
    renderComments();
    renderRedactionsPanel();
    renderSignaturesPanel();
  }

  function clearPanel(name) {
    var p = $("pdf-panel-" + name);
    if (p) p.innerHTML = "";
    return p;
  }

  function renderBookmarks() {
    var p = clearPanel("bookmarks");
    if (!p || !doc) return;
    if (!doc.model.bookmarks.length) {
      var e = el("div", "pdf-side-empty");
      e.textContent = "No headings found. Headings (H1/H2/H3) in the document become bookmarks here.";
      p.appendChild(e);
      return;
    }
    doc.model.bookmarks.forEach(function (b) {
      var btn = el("button", "pdf-bm pdf-bm-" + b.level);
      btn.type = "button";
      btn.id = "pdf-bm-" + b.blockId;
      btn.innerHTML = "<span class='pdf-bm-t'>" + esc(b.title) + "</span><span class='pdf-bm-p'>p." + b.page + "</span>";
      btn.addEventListener("click", function () { jumpToPage(b.page); });
      p.appendChild(btn);
    });
  }

  function jumpToPage(pageNum) {
    var target = $("pdf-page-" + pageNum);
    if (getSettings().pageMode === "single" && doc) {
      singlePage = clamp(pageNum - 1, 0, Math.max(doc.model.pages.length - 1, 0));
      refreshSinglePage();
    } else if (target && target.scrollIntoView) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    if (target) {
      target.classList.add("flash");
      setTimeout(function () { target.classList.remove("flash"); }, 1200);
    }
  }

  function renderComments() {
    var p = clearPanel("comments");
    if (!p || !doc) return;
    var notes = doc.annotations.notes;
    if (!notes.length) {
      var e = el("div", "pdf-side-empty");
      e.textContent = "No comments yet. Choose the Note tool, then click anywhere on a page.";
      p.appendChild(e);
      return;
    }
    notes.forEach(function (n, idx) {
      var row = el("div", "pdf-note-row");
      row.id = "pdf-note-" + n.id;
      var head = el("div", "pdf-note-head");
      var num = el("span", "pdf-note-num"); num.textContent = String(idx + 1);
      var pg = el("span", "pdf-note-page"); pg.textContent = "Page " + (n.page + 1);
      var jump = el("button", "pdf-btn pdf-btn-sm");
      jump.type = "button"; jump.textContent = "Jump";
      jump.addEventListener("click", function () { jumpToPage(n.page + 1); });
      var del = el("button", "pdf-btn pdf-btn-sm");
      del.type = "button"; del.textContent = "Delete";
      del.setAttribute("aria-label", "Delete note " + (idx + 1));
      del.addEventListener("click", function () {
        checkpoint();
        doc.annotations.notes = doc.annotations.notes.filter(function (x) { return x.id !== n.id; });
        renderPages(); renderSide(); persistDoc();
      });
      head.appendChild(num); head.appendChild(pg); head.appendChild(jump); head.appendChild(del);
      var ta = el("textarea", "pdf-note-text");
      ta.value = n.text || "";
      ta.rows = 2;
      ta.setAttribute("aria-label", "Note " + (idx + 1) + " text");
      ta.addEventListener("change", function () {
        checkpoint();
        n.text = ta.value;
        renderPages(); persistDoc();
      });
      row.appendChild(head); row.appendChild(ta);
      p.appendChild(row);
    });
  }

  function renderRedactionsPanel() {
    var p = clearPanel("redactions");
    if (!p || !doc) return;
    var list = doc.annotations.redactions;
    if (!list.length) {
      var e = el("div", "pdf-side-empty");
      e.textContent = "No redactions yet. Choose the Redact tool and drag over text you want to burn out.";
      p.appendChild(e);
      return;
    }
    var bar = el("div", "pdf-panel-bar");
    var apply = el("button", "pdf-btn pdf-btn-danger");
    apply.type = "button";
    apply.textContent = "Apply all redactions";
    apply.addEventListener("click", function () { applyRedactions(); });
    bar.appendChild(apply);
    p.appendChild(bar);
    list.forEach(function (r, idx) {
      var row = el("div", "pdf-red-row");
      var label = el("span");
      label.textContent = "Redaction " + (idx + 1) + " · Page " + (r.page + 1) + (r.applied ? " · applied" : " · pending");
      var jump = el("button", "pdf-btn pdf-btn-sm");
      jump.type = "button"; jump.textContent = "Jump";
      jump.addEventListener("click", function () { jumpToPage(r.page + 1); });
      row.appendChild(label); row.appendChild(jump);
      if (!r.applied) {
        var del = el("button", "pdf-btn pdf-btn-sm");
        del.type = "button"; del.textContent = "Remove";
        del.setAttribute("aria-label", "Remove redaction " + (idx + 1));
        del.addEventListener("click", function () {
          checkpoint();
          doc.annotations.redactions = doc.annotations.redactions.filter(function (x) { return x.id !== r.id; });
          renderPages(); renderSide(); persistDoc();
        });
        row.appendChild(del);
      }
      p.appendChild(row);
    });
    var warn = el("div", "pdf-side-note");
    warn.textContent = "Applying is permanent: covered characters are replaced in the document data and re-rendered. This cannot be undone after the tab is closed.";
    p.appendChild(warn);
  }

  function renderSignaturesPanel() {
    var p = clearPanel("signatures");
    if (!p || !doc) return;
    var list = doc.annotations.signatures;
    var bar = el("div", "pdf-panel-bar");
    var add = el("button", "pdf-btn pdf-btn-primary");
    add.type = "button";
    add.textContent = "New signature";
    add.addEventListener("click", openSigModal);
    bar.appendChild(add);
    p.appendChild(bar);
    if (!list.length) {
      var e = el("div", "pdf-side-empty");
      e.textContent = "No signatures yet. Draw or type a signature, then click a page to place it.";
      p.appendChild(e);
      return;
    }
    list.forEach(function (s, idx) {
      var row = el("div", "pdf-sig-row");
      var label = el("span");
      label.textContent = "Signature " + (idx + 1) + " · " + s.signer + " · Page " + (s.page + 1);
      var jump = el("button", "pdf-btn pdf-btn-sm");
      jump.type = "button"; jump.textContent = "Jump";
      jump.addEventListener("click", function () { jumpToPage(s.page + 1); });
      var del = el("button", "pdf-btn pdf-btn-sm");
      del.type = "button"; del.textContent = "Remove";
      del.setAttribute("aria-label", "Remove signature " + (idx + 1));
      del.addEventListener("click", function () {
        checkpoint();
        doc.annotations.signatures = doc.annotations.signatures.filter(function (x) { return x.id !== s.id; });
        renderPages(); renderSide(); persistDoc();
      });
      row.appendChild(label); row.appendChild(jump); row.appendChild(del);
      p.appendChild(row);
    });
  }

  /* ---------------- undo ---------------- */
  function checkpoint() {
    if (!doc) return;
    undoStack.push(JSON.stringify({ blocks: doc.model.blocks, annotations: doc.annotations }));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }

  function undo() {
    if (!doc || !undoStack.length) { toast("Nothing to undo."); return false; }
    var snap = JSON.parse(undoStack.pop());
    doc.model.blocks = snap.blocks;
    doc.annotations = snap.annotations;
    /* rebuild page assignment after block edits */
    rebuildPagination();
    renderPages();
    renderSide();
    persistDoc();
    return true;
  }

  function rebuildPagination() {
    var pages = [[]];
    var used = 0;
    doc.model.blocks.forEach(function (b, i) {
      var need = estimateLines(b);
      if (used + need > LINES_PER_PAGE && used > 0) { pages.push([]); used = 0; }
      b.page = pages.length;
      pages[pages.length - 1].push(i);
      used += need;
    });
    doc.model.pages = pages;
    doc.model.bookmarks.forEach(function (bm) {
      var b = blockById(bm.blockId);
      if (b) bm.page = b.page;
    });
  }

  /* ---------------- stage interactions ---------------- */
  function pagePoint(pageEl, clientX, clientY) {
    var r = pageEl.getBoundingClientRect();
    return {
      x: clamp((clientX - r.left) / (r.width || 1) * 100, 0, 100),
      y: clamp((clientY - r.top) / (r.height || 1) * 100, 0, 100)
    };
  }

  function closestPage(node) {
    while (node && !(node.classList && node.classList.contains("pdf-page"))) node = node.parentNode;
    return node;
  }

  function wireStage(stage) {
    stage.addEventListener("mousedown", function (e) {
      var page = closestPage(e.target);
      if (!page || !doc) return;
      if (e.target.closest && e.target.closest(".pdf-sig")) return; /* signature handles its own drag */
      if (tool === "shape" || tool === "redact") {
        var pt = pagePoint(page, e.clientX, e.clientY);
        dragState = { page: page, pageIdx: parseInt(page.getAttribute("data-page"), 10), x0: pt.x, y0: pt.y, ghost: null };
        e.preventDefault();
      }
    });
    stage.addEventListener("mousemove", function (e) {
      if (!dragState) return;
      var pt = pagePoint(dragState.page, e.clientX, e.clientY);
      var g = dragState.ghost;
      if (!g) {
        g = el("div", "pdf-drag-ghost" + (tool === "redact" ? " is-redact" : ""));
        dragState.page.querySelector(".pdf-annot").appendChild(g);
        dragState.ghost = g;
      }
      var x = Math.min(dragState.x0, pt.x), y = Math.min(dragState.y0, pt.y);
      var w = Math.abs(pt.x - dragState.x0), h = Math.abs(pt.y - dragState.y0);
      g.style.left = pct(x); g.style.top = pct(y);
      g.style.width = pct(Math.max(w, 0.5)); g.style.height = pct(Math.max(h, 0.5));
    });
    stage.addEventListener("mouseup", function (e) {
      var page = closestPage(e.target);
      /* highlight applies on mouseup whenever text is selected with the highlight tool */
      if (tool === "highlight" && page) {
        var sel = window.getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed) {
          var range = sel.getRangeAt(0);
          if (page.contains(range.commonAncestorContainer)) {
            highlightSelection(hlColor);
            return;
          }
        }
      }
      if (!dragState) return;
      var ds = dragState;
      dragState = null;
      if (ds.ghost) ds.ghost.remove();
      var pt = pagePoint(ds.page, e.clientX, e.clientY);
      var x = Math.min(ds.x0, pt.x), y = Math.min(ds.y0, pt.y);
      var w = Math.abs(pt.x - ds.x0), h = Math.abs(pt.y - ds.y0);
      if (w < 1 || h < 1) return;
      if (tool === "shape") {
        checkpoint();
        doc.annotations.shapes.push({ id: uid(), page: ds.pageIdx, kind: shapeKind, x: x, y: y, w: w, h: h, color: shapeColor });
        renderPages(); renderSide(); persistDoc();
        toast("Shape added.");
      } else if (tool === "redact") {
        addRedactionFromRect(ds.page, { x: x, y: y, w: w, h: h });
      }
    });
    stage.addEventListener("click", function (e) {
      var page = closestPage(e.target);
      if (!page || !doc) return;
      if (e.target.closest && (e.target.closest(".pdf-sig") || e.target.closest(".pdf-note-pin") || e.target.closest(".pdf-note-pop"))) return;
      var pageIdx = parseInt(page.getAttribute("data-page"), 10);
      if (tool === "note") {
        openNoteEditor(page, pageIdx, pagePoint(page, e.clientX, e.clientY));
      } else if (tool === "sign") {
        if (pendingSig) placeSignature(pageIdx, pagePoint(page, e.clientX, e.clientY).x, pagePoint(page, e.clientX, e.clientY).y);
        else openSigModal();
      }
    });
    /* swipe left/right changes pages on touch devices (single-page mode,
       select tool only, so it never fights annotation gestures) */
    var swipeStart = null;
    stage.addEventListener("touchstart", function (e) {
      if (e.touches && e.touches.length === 1) {
        swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      } else { swipeStart = null; }
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      var s0 = swipeStart;
      swipeStart = null;
      if (!s0 || !doc) return;
      if (tool !== "select" || getSettings().pageMode !== "single") return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - s0.x, dy = t.clientY - s0.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s0.t < 900) {
        if (dx < 0) singlePage++; else singlePage--;
        refreshSinglePage();
      }
    }, { passive: true });
  }

  /* ---------------- highlight ---------------- */
  function highlightSelection(color) {
    if (!doc) return false;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    var range = sel.getRangeAt(0);
    var page = closestPage(range.commonAncestorContainer);
    if (!page || !page.contains(range.commonAncestorContainer)) return false;
    var span = document.createElement("span");
    span.className = "pdf-hl";
    span.style.background = color || hlColor;
    var hid = uid();
    span.setAttribute("data-hl", hid);
    try {
      range.surroundContents(span);
    } catch (err) {
      try {
        var frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      } catch (err2) { return false; }
    }
    checkpoint();
    syncBlocksFromDOM();
    doc.annotations.highlights.push({ id: hid, color: color || hlColor, text: span.textContent.slice(0, 80) });
    sel.removeAllRanges();
    renderSide();
    persistDoc();
    return true;
  }

  function removeHighlight(hid) {
    if (!doc) return;
    checkpoint();
    var spans = document.querySelectorAll('#pdf-stage span[data-hl="' + hid + '"]');
    Array.prototype.forEach.call(spans, function (s) {
      var parent = s.parentNode;
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
    });
    doc.annotations.highlights = doc.annotations.highlights.filter(function (h) { return h.id !== hid; });
    syncBlocksFromDOM();
    renderSide();
    persistDoc();
  }

  function syncBlocksFromDOM() {
    if (!doc) return;
    var nodes = document.querySelectorAll("#pdf-stage [data-pdf-block]");
    Array.prototype.forEach.call(nodes, function (node) {
      var b = blockById(node.getAttribute("data-pdf-block"));
      if (b) { b.html = node.innerHTML; b.text = node.textContent || ""; }
    });
  }

  /* ---------------- sticky notes ---------------- */
  function openNoteEditor(pageEl, pageIdx, pt) {
    closeNoteEditor();
    var annot = pageEl.querySelector(".pdf-annot");
    var pop = el("div", "pdf-note-pop");
    pop.id = "pdf-note-pop";
    pop.style.left = pct(pt.x); pop.style.top = pct(pt.y);
    var ta = el("textarea", "pdf-note-pop-text");
    ta.rows = 3;
    ta.placeholder = "Write a comment...";
    ta.setAttribute("aria-label", "New note text");
    var row = el("div", "pdf-note-pop-row");
    var save = el("button", "pdf-btn pdf-btn-primary pdf-btn-sm");
    save.type = "button"; save.textContent = "Add note";
    var cancel = el("button", "pdf-btn pdf-btn-sm");
    cancel.type = "button"; cancel.textContent = "Cancel";
    save.addEventListener("click", function () {
      var text = ta.value.trim();
      if (!text) { toast("Write something first."); return; }
      checkpoint();
      doc.annotations.notes.push({ id: uid(), page: pageIdx, x: pt.x, y: pt.y, text: text });
      closeNoteEditor();
      selectSideTab("comments");
      renderPages(); renderSide(); persistDoc();
      toast("Note added.");
    });
    cancel.addEventListener("click", closeNoteEditor);
    row.appendChild(save); row.appendChild(cancel);
    pop.appendChild(ta); pop.appendChild(row);
    annot.appendChild(pop);
    ta.focus();
  }

  function closeNoteEditor() {
    var pop = $("pdf-note-pop");
    if (pop) pop.remove();
  }

  /* ---------------- redaction (true burn-in) ---------------- */
  function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* Find text-node ranges covered by a page-relative (% units) rect. */
  function addRedactionFromRect(pageEl, rectPct) {
    if (!doc) return 0;
    var pageRect = pageEl.getBoundingClientRect();
    var inner = pageEl.querySelector(".pdf-page-inner");
    var found = [];
    var blocks = inner.querySelectorAll("[data-pdf-block]");
    Array.prototype.forEach.call(blocks, function (blockEl) {
      var blockId = blockEl.getAttribute("data-pdf-block");
      var nodes = textNodesOf(blockEl);
      nodes.forEach(function (node, nodeIdx) {
        if (!node.nodeValue || !node.nodeValue.trim()) return;
        var r = document.createRange();
        r.selectNodeContents(node);
        var cr = r.getClientRects();
        for (var i = 0; i < cr.length; i++) {
          var c = cr[i];
          var rel = {
            x: (c.left - pageRect.left) / (pageRect.width || 1) * 100,
            y: (c.top - pageRect.top) / (pageRect.height || 1) * 100,
            w: c.width / (pageRect.width || 1) * 100,
            h: c.height / (pageRect.height || 1) * 100
          };
          if (rectsIntersect(rel, rectPct)) {
            found.push({ blockId: blockId, nodeIdx: nodeIdx, start: 0, end: node.nodeValue.length });
            break;
          }
        }
      });
    });
    if (!found.length) { toast("No text under that area."); return 0; }
    checkpoint();
    var pageIdx = parseInt(pageEl.getAttribute("data-page"), 10);
    found.forEach(function (f) {
      doc.annotations.redactions.push({
        id: uid(), page: pageIdx,
        blockId: f.blockId, nodeIdx: f.nodeIdx, start: f.start, end: f.end,
        x: rectPct.x, y: rectPct.y, w: rectPct.w, h: rectPct.h,
        applied: false
      });
    });
    selectSideTab("redactions");
    renderPages(); renderSide(); persistDoc();
    toast(found.length + " text run(s) marked. Choose Apply redactions to burn in.");
    return found.length;
  }

  /* Testable primitive: redact the first occurrence of `text` inside a block. */
  function redactText(blockId, text) {
    if (!doc || !text) return false;
    var b = blockById(blockId);
    if (!b) return false;
    var host = document.createElement("div");
    host.innerHTML = b.html;
    var nodes = textNodesOf(host);
    for (var i = 0; i < nodes.length; i++) {
      var at = nodes[i].nodeValue.indexOf(text);
      if (at >= 0) {
        checkpoint();
        doc.annotations.redactions.push({
          id: uid(), page: b.page - 1,
          blockId: blockId, nodeIdx: i, start: at, end: at + text.length,
          x: 0, y: 0, w: 0, h: 0, applied: false
        });
        renderPages(); renderSide(); persistDoc();
        return true;
      }
    }
    return false;
  }

  /* Permanently replace covered characters in the data model, then re-render.
     After this runs, the covered text no longer exists in blocks or exports. */
  function applyRedactions() {
    if (!doc) return 0;
    var n = 0;
    doc.annotations.redactions.forEach(function (r) {
      if (r.applied) return;
      var b = blockById(r.blockId);
      if (!b) return;
      b.html = redactBlockHtml(b.html, [{ nodeIdx: r.nodeIdx, start: r.start, end: r.end }]);
      var host = document.createElement("div");
      host.innerHTML = b.html;
      b.text = host.textContent || "";
      r.applied = true;
      n++;
    });
    if (!n) { toast("No pending redactions."); return 0; }
    rebuildPagination();
    renderPages();
    renderSide();
    persistDoc();
    toast(n + " redaction(s) burned in. The covered text is gone from the document data.");
    return n;
  }

  /* ---------------- signature ---------------- */
  function openSigModal() {
    closeSigModal();
    var overlay = el("div", "pdf-sig-overlay");
    overlay.id = "pdf-sig-overlay";
    var box = el("div", "pdf-sig-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Create signature");
    var h = el("h2"); h.textContent = "Create signature";
    box.appendChild(h);

    var nameRow = el("label", "pdf-field");
    nameRow.innerHTML = "<span>Signer name</span>";
    var nameInput = el("input", "pdf-input");
    nameInput.id = "pdf-sig-name";
    nameInput.type = "text";
    nameInput.placeholder = "Your name";
    nameInput.value = "Thit Sar";
    nameRow.appendChild(nameInput);
    box.appendChild(nameRow);

    var modeRow = el("div", "pdf-seg");
    var bDraw = el("button", "pdf-seg-btn active"); bDraw.type = "button"; bDraw.textContent = "Draw";
    var bType = el("button", "pdf-seg-btn"); bType.type = "button"; bType.textContent = "Type";
    modeRow.appendChild(bDraw); modeRow.appendChild(bType);
    box.appendChild(modeRow);

    var canvas = el("canvas", "pdf-sig-canvas");
    canvas.id = "pdf-sig-canvas";
    canvas.width = 480; canvas.height = 160;
    box.appendChild(canvas);

    var typeWrap = el("div", "pdf-sig-typewrap hidden");
    var typeInput = el("input", "pdf-input pdf-sig-typeinput");
    typeInput.id = "pdf-sig-typed";
    typeInput.type = "text";
    typeInput.placeholder = "Type your signature";
    typeInput.value = "Thit Sar";
    var typePrev = el("div", "pdf-sig-typeprev");
    typePrev.id = "pdf-sig-typeprev";
    typePrev.textContent = "Thit Sar";
    typeWrap.appendChild(typeInput); typeWrap.appendChild(typePrev);
    box.appendChild(typeWrap);

    var mode = "draw";
    bDraw.addEventListener("click", function () {
      mode = "draw";
      bDraw.classList.add("active"); bType.classList.remove("active");
      canvas.classList.remove("hidden"); typeWrap.classList.add("hidden");
    });
    bType.addEventListener("click", function () {
      mode = "type";
      bType.classList.add("active"); bDraw.classList.remove("active");
      canvas.classList.add("hidden"); typeWrap.classList.remove("hidden");
    });
    typeInput.addEventListener("input", function () { typePrev.textContent = typeInput.value || " "; });

    sigPad = makeSigPad(canvas);

    var btnRow = el("div", "pdf-sig-btnrow");
    var bClear = el("button", "pdf-btn"); bClear.type = "button"; bClear.textContent = "Clear";
    bClear.addEventListener("click", function () { if (sigPad) sigPad.clear(); });
    var bUndo = el("button", "pdf-btn"); bUndo.type = "button"; bUndo.textContent = "Undo stroke";
    bUndo.addEventListener("click", function () { if (sigPad) sigPad.undoStroke(); });
    var bPlace = el("button", "pdf-btn pdf-btn-primary"); bPlace.type = "button"; bPlace.textContent = "Place signature";
    bPlace.addEventListener("click", function () {
      var signer = (nameInput.value || "").trim() || "Signer";
      var data = null;
      if (mode === "draw") {
        if (!sigPad || sigPad.isEmpty()) { toast("Draw your signature first, or switch to Type."); return; }
        data = { dataUrl: sigPad.toDataURL() };
      } else {
        var typed = (typeInput.value || "").trim();
        if (!typed) { toast("Type your signature first."); return; }
        data = { typed: typed };
      }
      saveSignature({ signer: signer, dataUrl: data.dataUrl || null, typed: data.typed || null });
      closeSigModal();
      setTool("sign");
      toast("Signature ready. Click anywhere on a page to place it.");
    });
    var bCancel = el("button", "pdf-btn"); bCancel.type = "button"; bCancel.textContent = "Cancel";
    bCancel.addEventListener("click", closeSigModal);
    btnRow.appendChild(bClear); btnRow.appendChild(bUndo); btnRow.appendChild(bPlace); btnRow.appendChild(bCancel);
    box.appendChild(btnRow);

    var honest = el("div", "pdf-side-note");
    honest.textContent = "The stamp shows a local date and time badge. It is not a certified digital signature.";
    box.appendChild(honest);

    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSigModal(); });
    document.body.appendChild(overlay);
    if (nameInput.focus) { try { nameInput.focus(); } catch (e2) {} }
  }

  function closeSigModal() {
    var o = $("pdf-sig-overlay");
    if (o) o.remove();
    sigPad = null;
  }

  function makeSigPad(canvas) {
    var ctx = canvas.getContext ? canvas.getContext("2d") : null;
    var strokes = [];
    var cur = null;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var cx = e.clientX, cy = e.clientY;
      if (e.touches && e.touches[0]) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      var sx = canvas.width / (r.width || 1), sy = canvas.height / (r.height || 1);
      return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
    }
    function redraw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      strokes.forEach(function (s) {
        var pts = s.pts || [];
        if (pts.length < 2) return;
        ctx.strokeStyle = s.color || inkColor;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      });
    }
    function start(e) {
      e.preventDefault();
      cur = { pts: [pos(e)], color: inkColor };
      strokes.push(cur);
      redraw();
    }
    function move(e) {
      if (!cur) return;
      e.preventDefault();
      cur.pts.push(pos(e));
      redraw();
    }
    function end() { cur = null; }
    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return {
      clear: function () { strokes = []; cur = null; redraw(); },
      undoStroke: function () { strokes.pop(); redraw(); },
      isEmpty: function () { return strokes.length === 0; },
      toDataURL: function () { return canvas.toDataURL ? canvas.toDataURL("image/png") : ""; }
    };
  }

  /* Store a signature (drawn dataURL or typed name). Exposed for tests. */
  function saveSignature(opts) {
    opts = opts || {};
    var signer = (opts.signer || "").trim() || "Signer";
    pendingSig = {
      signer: signer,
      dataUrl: opts.dataUrl || null,
      typed: opts.typed || null,
      ink: inkColor,
      stamp: "Signed by " + signer + " · " + fmtTime(Date.now()) + " · local timestamp, not a certified digital signature"
    };
    return pendingSig;
  }

  /* Place the pending signature on a page. Exposed for tests. */
  function placeSignature(pageIdx, x, y) {
    if (!doc || !pendingSig) { toast("Create a signature first."); return false; }
    checkpoint();
    doc.annotations.signatures.push({
      id: uid(),
      page: clamp(Math.round(pageIdx) || 0, 0, Math.max(doc.model.pages.length - 1, 0)),
      x: clamp(x, 0, 90), y: clamp(y, 0, 95), w: 30,
      signer: pendingSig.signer,
      dataUrl: pendingSig.dataUrl,
      typed: pendingSig.typed,
      ink: pendingSig.ink || inkColor,
      stamp: pendingSig.stamp
    });
    pendingSig = null;
    setTool("select");
    selectSideTab("signatures");
    renderPages(); renderSide(); persistDoc();
    toast("Signature placed.");
    return true;
  }

  /* ---------------- export ---------------- */
  function exportHTML() {
    if (!doc) return "";
    var css =
      "body{font-family:Georgia,'Times New Roman',serif;color:#111;background:#fff;margin:0;padding:24px;}" +
      ".pdf-page{position:relative;width:100%;max-width:720px;margin:0 auto 24px;aspect-ratio:210/297;" +
      "background:#fff;border:1px solid #ddd;box-shadow:0 2px 10px rgba(0,0,0,.12);overflow:hidden;page-break-after:always;}" +
      ".pdf-page-inner{position:absolute;inset:0;padding:8%;overflow:hidden;}" +
      ".pdf-annot{position:absolute;inset:0;pointer-events:none;}" +
      ".pdf-hl{padding:0 1px;border-radius:2px;}" +
      ".pdf-redactbox{position:absolute;background:#000;}" +
      ".pdf-shape{position:absolute;border:3px solid;}" +
      ".pdf-shape-ellipse{border-radius:50%;}" +
      ".pdf-sig{position:absolute;}" +
      ".pdf-sig img{width:100%;display:block;}" +
      ".pdf-sig-typed{font-family:'Brush Script MT','Segoe Script','Apple Chancery',cursive;font-size:34px;}" +
      ".pdf-sig-badge{font-family:Arial,sans-serif;font-size:10px;color:#444;margin-top:2px;}" +
      ".pdf-notes{max-width:720px;margin:0 auto;font-family:Arial,sans-serif;}" +
      ".pdf-notes li{margin-bottom:8px;}" +
      "[lang=my]{line-height:1.85;}";
    var body = "";
    doc.model.pages.forEach(function (pageBlocks, pi) {
      var inner = "";
      pageBlocks.forEach(function (bi) {
        var b = doc.model.blocks[bi];
        var tag = /^[a-z][a-z0-9]*$/.test(b.kind) ? b.kind : "p";
        inner += "<" + tag + ">" + b.html + "</" + tag + ">";
      });
      var annot = "";
      doc.annotations.shapes.forEach(function (s) {
        if (s.page !== pi) return;
        if (s.kind === "line") {
          var len = Math.sqrt(s.w * s.w + s.h * s.h);
          var ang = Math.atan2(s.h, s.w) * 180 / Math.PI;
          annot += '<div class="pdf-shape" style="left:' + s.x + '%;top:' + s.y + '%;width:' + len +
            '%;height:3px;background:' + esc(s.color) + ';transform-origin:0 50%;transform:rotate(' + ang + 'deg);"></div>';
        } else {
          annot += '<div class="pdf-shape' + (s.kind === "ellipse" ? " pdf-shape-ellipse" : "") +
            '" style="left:' + s.x + '%;top:' + s.y + '%;width:' + s.w + '%;height:' + s.h +
            '%;border-color:' + esc(s.color) + ';"></div>';
        }
      });
      doc.annotations.redactions.forEach(function (r) {
        if (r.page !== pi) return;
        annot += '<div class="pdf-redactbox" style="left:' + r.x + '%;top:' + r.y + '%;width:' + r.w + '%;height:' + r.h + '%;"></div>';
      });
      doc.annotations.signatures.forEach(function (s) {
        if (s.page !== pi) return;
        var sigHtml = s.dataUrl
          ? '<img src="' + s.dataUrl + '" alt="Signature of ' + esc(s.signer) + '">'
          : '<div class="pdf-sig-typed"' + (s.ink ? ' style="color:' + esc(s.ink) + ';"' : "") + ">" + esc(s.typed || s.signer) + "</div>";
        annot += '<div class="pdf-sig" style="left:' + s.x + '%;top:' + s.y + '%;width:' + (s.w || 30) + '%;">' +
          sigHtml + '<div class="pdf-sig-badge">' + esc(s.stamp) + "</div></div>";
      });
      body += '<div class="pdf-page"><div class="pdf-page-inner">' + inner +
        '</div><div class="pdf-annot">' + annot + "</div></div>";
    });
    if (doc.annotations.notes.length) {
      body += '<section class="pdf-notes"><h2>Comments</h2><ol>';
      doc.annotations.notes.forEach(function (n) {
        body += "<li><strong>Page " + (n.page + 1) + ":</strong> " + esc(n.text || "") + "</li>";
      });
      body += "</ol></section>";
    }
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + esc(doc.title) +
      "</title><style>" + css + "</style></head><body>" + body + "</body></html>";
  }

  function downloadBlob(text, name, mime) {
    var blob = new Blob([text], { type: mime });
    if (T.download) { T.download(blob, name); return true; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    return true;
  }

  function downloadHTML() {
    if (!doc) { toast("Open a document first."); return false; }
    downloadBlob(exportHTML(), safeTitle(doc.title) + ".pdf.html", "text/html");
    toast("HTML exported: " + safeTitle(doc.title) + ".pdf.html");
    return true;
  }

  function exportTXT() {
    if (!doc) return "";
    return doc.model.blocks.map(function (b) { return b.text; }).join("\n\n");
  }

  function downloadTXT() {
    if (!doc) { toast("Open a document first."); return false; }
    downloadBlob(exportTXT(), safeTitle(doc.title) + ".txt", "text/plain");
    toast("TXT exported: " + safeTitle(doc.title) + ".txt");
    return true;
  }

  /* Primary print path reuses the app's existing PDF export (window.print). */
  function doPrint() {
    if (!doc) { toast("Open a document first."); return false; }
    if (T.exporters && T.exporters.pdf) { T.exporters.pdf(); return true; }
    if (typeof window.print === "function") { window.print(); return true; }
    toast("Printing is not available here.");
    return false;
  }

  /* beforeprint/afterprint: print CSS shows only the PDF pages. */
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("beforeprint", function () { document.body.classList.add("pdf-printing"); });
    window.addEventListener("afterprint", function () { document.body.classList.remove("pdf-printing"); });
    document.addEventListener("keydown", function (e) {
      if (e && e.key === "Escape") {
        closeMore();
        closeOpenDrawers();
      }
    });
  }

  /* ---------------- commands ---------------- */
  T.register("pdf.new", function () { openFromTxt(); },
    { title: "PDF: convert TXT document", cat: "PDF", icon: "i-file", match: "pdf convert txt document" });
  T.register("pdf.open", function () { show(); if (T.ecosystem && T.ecosystem.openApp) T.ecosystem.openApp("pdf"); },
    { title: "PDF: open PDF Studio", cat: "PDF", icon: "i-grid", match: "pdf studio open" });
  T.register("pdf.import", function () {
    show(); ensureView();
    var f = $("pdf-file");
    if (f) f.click();
    else toast("Open PDF Studio first.");
  }, { title: "PDF: import file", cat: "PDF", icon: "i-upload", match: "pdf import file open" });
  T.register("pdf.exportHtml", function () { downloadHTML(); },
    { title: "PDF: export as HTML", cat: "PDF", icon: "i-export", match: "pdf export html download" });
  T.register("pdf.exportTxt", function () { downloadTXT(); },
    { title: "PDF: export as TXT", cat: "PDF", icon: "i-export", match: "pdf export txt text download" });
  T.register("pdf.print", function () { doPrint(); },
    { title: "PDF: export / print", cat: "PDF", icon: "i-print", match: "pdf print export" });
  T.register("pdf.applyRedactions", function () { applyRedactions(); },
    { title: "PDF: apply redactions", cat: "PDF", icon: "i-lock", match: "pdf redaction apply burn" });

  /* ---------------- ecosystem wiring ---------------- */
  T.bus.on("ecosystem:app", function (p) {
    if (!p) return;
    if (p.app === "pdf") show();
    else hide();
  });
  T.bus.on("ecosystem:persona", function () { hide(); });

  /* ---------------- public API ---------------- */
  T.pdf = {
    show: show,
    hide: hide,
    openFromTxt: openFromTxt,
    importFile: importFile,
    openRecent: openRecent,
    buildPages: buildPages,
    highlightSelection: highlightSelection,
    removeHighlight: removeHighlight,
    redactText: redactText,
    applyRedactions: applyRedactions,
    saveSignature: saveSignature,
    placeSignature: placeSignature,
    exportHTML: exportHTML,
    exportTXT: exportTXT,
    downloadHTML: downloadHTML,
    downloadTXT: downloadTXT,
    printDoc: doPrint,
    setTool: setTool,
    currentTool: function () { return tool; },
    undo: undo,
    getDoc: function () { return doc; },
    files: {
      list: listFiles,
      create: createFile,
      rename: renameFile,
      duplicate: duplicateFile,
      remove: removeFile,
      open: openFile
    },
    getSettings: getSettings,
    setSettings: setSettings,
    openSettings: openSettings,
    closeSettings: closeSettings
  };
})();
