/* TXT core: state, event bus, strings, utils, selection, command registry, toast, modal.
   Exposes window.TXT. Every other module builds on this. */

(function () {
  "use strict";

  /* ---------------- strings (i18n-ready) ---------------- */
  var STRINGS = {
    untitled: "Untitled document",
    saved: "Saved to LocalStorage",
    saving: "Saving...",
    justNow: "Just now",
    newDoc: "New document",
    confirmNew: "Create a new document? Unsaved changes are auto-saved.",
    deleteDoc: "Delete this document?",
    pastePlain: "Paste as plain text: press Ctrl+Shift+V in the editor.",
    copied: "Copied to clipboard",
    aiWorking: "AI is writing...",
    aiError: "AI request failed. Check your connection and retry.",
    exportDone: "Downloaded",
    docxBuilding: "Building DOCX...",
    docxFail: "DOCX failed",
    goalSet: "Word goal",
    goalPrompt: "Set your word count goal:",
    theme: "Theme",
    noMatches: "No matches",
    matchOf: "of",
    replaced: "replaced",
    historyEmpty: "No versions yet. Versions are saved automatically as you work.",
    restore: "Restore",
    preview: "Preview",
    close: "Close",
    cancel: "Cancel",
    ok: "OK",
    apply: "Apply",
    insert: "Insert",
    remove: "Remove",
    changeCase: "Change case",
    upper: "UPPERCASE",
    lower: "lowercase",
    titleCase: "Title Case",
    sentenceCase: "Sentence case",
    commentPh: "Write a comment...",
    reply: "Reply",
    resolve: "Resolve",
    reopen: "Reopen",
    del: "Delete",
    accept: "Accept",
    reject: "Reject",
    acceptAll: "Accept all",
    rejectAll: "Reject all",
    trackOn: "Track Changes: ON",
    trackOff: "Track Changes: OFF",
    tableTools: "Table Tools",
    altText: "Alt text",
    imgWidth: "Image width",
    linkUrl: "URL",
    linkText: "Text",
    bookmarkName: "Bookmark name",
    footnoteText: "Footnote",
    citeStyle: "Citation style",
    customTable: "Insert table",
    rows: "Rows",
    cols: "Columns",
    dateFmt: "Date format",
    customWatermark: "Custom watermark",
    wmText: "Watermark text",
    wmStyle: "Style",
    diagonal: "Diagonal",
    horizontal: "Horizontal",
    pageColor: "Page color",
    clearColor: "Clear",
    statsTitle: "Document statistics",
    readability: "Readability",
    gradeLevel: "Flesch-Kincaid grade",
    readingTime: "Reading time",
    speakingTime: "Speaking time",
    sentences: "Sentences",
    wordsPerSentence: "Words per sentence",
    passivePct: "Passive voice",
    adverbPct: "Adverbs",
    min: "min",
    a11yIssues: "Accessibility issues",
    a11yNone: "No issues found. Nice work.",
    imgNoAlt: "Image missing alt text",
    skipHeading: "Skipped heading level",
    lowContrast: "Low contrast text",
    emptyHeading: "Empty heading",
    voices: "Voice",
    rate: "Speed",
    pitch: "Pitch",
    stop: "Stop",
    play: "Play",
    pause: "Pause",
    cmdPalettePh: "Type a command or search text...",
    noCommands: "No matching commands",
    textHits: "In document",
    openFile: "Open a .txt, .md or .html file",
    fontExport: "Download fonts used",
    noFonts: "No downloadable fonts used in this document.",
    downloading: "Downloading...",
    coverTitle: "Document title",
    coverSub: "Subtitle",
    confirmTitle: "Are you sure?"
  };
  function t(k) { return STRINGS[k] || k; }

  /* ---------------- utils ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function uid() { return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function debounce(fn, ms) {
    var h; return function () { var a = arguments, c = this; clearTimeout(h); h = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function relTime(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return t("justNow");
    if (s < 60) return s + "s ago";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    return Math.floor(m / 60) + "h ago";
  }

  /* ---------------- event bus ---------------- */
  var bus = {
    _m: {},
    on: function (ev, fn) { (this._m[ev] = this._m[ev] || []).push(fn); return fn; },
    off: function (ev, fn) { var a = this._m[ev]; if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit: function (ev, data) { var a = this._m[ev]; if (a) a.slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error("[TXT bus]", ev, e); } }); }
  };

  /* ---------------- state ---------------- */
  var LS_DOCS = "txt:docs", LS_PREFS = "txt:prefs";
  function lsGet(k, dflt) { try { var v = localStorage.getItem(k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var state = {
    docs: lsGet(LS_DOCS, []),           // [{id,title,updatedAt,words}]
    currentId: null,
    prefs: Object.assign({
      theme: "studio", paper: "sheet", ribbonMode: "full", ribbonTab: "home",
      view: "print", zoom: 1, wordGoal: 500, showRulers: true, showMarks: false,
      showGrid: false, trackChanges: false, sidebarOpen: true, sidebarPane: "outline"
    }, lsGet(LS_PREFS, {})),
    comments: [],   // [{id, bid, quote, resolved, messages:[{who,text,ts}]}]
    aiPanel: null
  };
  function savePrefs() { lsSet(LS_PREFS, state.prefs); }
  function docKey(id) { return "txt:doc:" + id; }
  function histKey(id) { return "txt:hist:" + id; }
  function loadDoc(id) {
    var d = lsGet(docKey(id), null);
    if (!d) d = { id: id, title: t("untitled"), html: "", updatedAt: Date.now() };
    return d;
  }
  function persistDoc(id, title, html) {
    lsSet(docKey(id), { id: id, title: title, html: html, updatedAt: Date.now() });
    var meta = null;
    state.docs = state.docs.map(function (m) { if (m.id === id) { meta = m; m.title = title; m.updatedAt = Date.now(); } return m; });
    if (!meta) { meta = { id: id, title: title, updatedAt: Date.now(), words: 0 }; state.docs.unshift(meta); }
    lsSet(LS_DOCS, state.docs);
  }
  function snapshot(id, title, html, words) {
    var h = lsGet(histKey(id), []);
    h.unshift({ ts: Date.now(), title: title, html: html, words: words });
    lsSet(histKey(id), h.slice(0, 30));
  }

  /* ---------------- selection helpers ---------------- */
  var savedRange = null;
  var sel = {
    save: function () {
      var s = window.getSelection();
      if (s.rangeCount) {
        var r = s.getRangeAt(0);
        var sheet = $("#sheetLayer .psheet");
        if (sheet && (sheet === r.commonAncestorContainer || sheet.contains(r.commonAncestorContainer))) {
          savedRange = r.cloneRange();
        }
      }
    },
    restore: function () {
      var sheet = $("#sheetLayer .psheet");
      if (!sheet) return false;
      if (!savedRange) { sheet.focus(); return false; }
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(savedRange);
      return true;
    },
    range: function () { var s = window.getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; },
    collapsed: function () { var s = window.getSelection(); return !s.rangeCount || s.isCollapsed; },
    sheet: function () { return $("#sheetLayer .psheet"); },
    block: function () {
      var sheet = sel.sheet(); if (!sheet) return null;
      var r = sel.range(); if (!r) return null;
      var n = r.commonAncestorContainer;
      if (n.nodeType === 3) n = n.parentNode;
      while (n && n !== sheet && !/^(P|H1|H2|H3|H4|LI|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName)) n = n.parentNode;
      return n === sheet ? null : n;
    },
    text: function () { return window.getSelection().toString(); }
  };
  document.addEventListener("selectionchange", debounce(function () { sel.save(); bus.emit("sel:change"); }, 120));

  /* ---------------- command registry ---------------- */
  var commands = {};
  function register(name, fn, meta) {
    commands[name] = { fn: fn, title: (meta && meta.title) || name, cat: (meta && meta.cat) || "General", icon: (meta && meta.icon) || "i-file", keys: (meta && meta.keys) || "" };
  }
  function cmd(name) {
    var c = commands[name];
    if (!c) { console.warn("[TXT] unknown command:", name); return; }
    var args = Array.prototype.slice.call(arguments, 1);
    return c.fn.apply(null, args);
  }
  function listCommands() {
    return Object.keys(commands).map(function (k) { return Object.assign({ name: k }, commands[k]); });
  }

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    var box = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast" + (kind === "error" ? " error" : "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(function () { el.remove(); }, 320); }, 2600);
  }

  /* ---------------- modal (promise-based) ---------------- */
  function modal(opts) {
    return new Promise(function (resolve) {
      var root = $("#modalRoot");
      var wrap = document.createElement("div");
      wrap.className = "modal-wrap";
      var bodyHtml = "";
      (opts.fields || []).forEach(function (f) {
        bodyHtml += '<label class="f">' + esc(f.label) + "</label>";
        if (f.type === "select") {
          bodyHtml += '<select data-k="' + esc(f.key) + '">' + f.options.map(function (o) {
            return '<option value="' + esc(o.v) + '"' + (o.v === f.value ? " selected" : "") + ">" + esc(o.t) + "</option>";
          }).join("") + "</select>";
        } else if (f.type === "textarea") {
          bodyHtml += '<textarea data-k="' + esc(f.key) + '" rows="4">' + esc(f.value || "") + "</textarea>";
        } else if (f.type === "color") {
          bodyHtml += '<input type="color" data-k="' + esc(f.key) + '" value="' + esc(f.value || "#000000") + '">';
        } else if (f.type === "range") {
          bodyHtml += '<input type="range" data-k="' + esc(f.key) + '" min="' + f.min + '" max="' + f.max + '" value="' + esc(f.value) + '">';
        } else {
          bodyHtml += '<input type="' + (f.type || "text") + '" data-k="' + esc(f.key) + '" value="' + esc(f.value || "") + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") + ">";
        }
      });
      if (opts.html) bodyHtml += opts.html;
      wrap.innerHTML = '<div class="modal" role="dialog"><h3>' + esc(opts.title || "") + "</h3>" +
        (opts.sub ? '<p class="msub">' + esc(opts.sub) + "</p>" : "") + bodyHtml +
        '<div class="mrow"><button type="button" class="btn ghost" data-x="cancel">' + esc(t("cancel")) + "</button>" +
        '<button type="button" class="btn-primary" data-x="ok">' + esc(opts.okText || t("ok")) + "</button></div></div>";
      function done(val) { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(val); }
      function onKey(e) { if (e.key === "Escape") done(null); }
      wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) done(null); });
      document.addEventListener("keydown", onKey);
      wrap.querySelector('[data-x="cancel"]').addEventListener("click", function () { done(null); });
      wrap.querySelector('[data-x="ok"]').addEventListener("click", function () {
        var out = {};
        $$("[data-k]", wrap).forEach(function (el) { out[el.getAttribute("data-k")] = el.value; });
        done(out);
      });
      root.appendChild(wrap);
      var first = wrap.querySelector("input, select, textarea");
      if (first) setTimeout(function () { first.focus(); }, 30);
    });
  }

  function icon(id, cls) {
    return '<svg class="' + (cls || "") + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }

  window.TXT = {
    $, $$, uid, esc, debounce, clamp, relTime, t,
    bus, state, savePrefs, loadDoc, persistDoc, snapshot, histKey, docKey, lsGet, lsSet,
    sel, register, cmd, listCommands, toast, modal, icon,
    version: "4.0.0"
  };
})();
