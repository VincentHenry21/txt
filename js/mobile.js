/* TXT mobile chrome: device simulator, bottom sheets, accessory bar, mobile top bar.
   Defines T.mobile per ARCHITECTURE.md section 9. Loads last (before app.js). */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;
  var bus = T.bus;

  var readOnly = false;

  /* ---------- command helpers ---------- */
  function hasCmd(name) {
    var list = T.listCommands(), i;
    for (i = 0; i < list.length; i++) { if (list[i].name === name) return true; }
    return false;
  }
  /* Run the first registered command in names with arg; else run fallback(). */
  function firstCmd(names, arg, fallback) {
    for (var i = 0; i < names.length; i++) {
      if (hasCmd(names[i])) {
        if (arg === undefined) T.cmd(names[i]);
        else T.cmd(names[i], arg);
        return true;
      }
    }
    if (fallback) fallback();
    return false;
  }
  function styleCmd(name, tag) {
    firstCmd([name], undefined, function () { document.execCommand("formatBlock", false, tag); });
  }

  /* ---------- DOM helpers ---------- */
  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }
  function chip(label, fn, iconId) {
    var b = el("button", "seg-chip");
    b.type = "button";
    if (iconId) b.innerHTML = T.icon(iconId) + " ";
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function tile(iconId, label, fn) {
    var b = el("button", "tile");
    b.type = "button";
    b.innerHTML = T.icon(iconId);
    b.appendChild(el("span", null, label));
    b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function sec(title) {
    var s = el("div", "sheet-sec");
    s.appendChild(el("h5", null, title));
    return s;
  }
  function row() { return el("div", "seg-row"); }

  /* ---------- bottom sheet ---------- */
  function sheetModal() { return $("#sheetModal"); }
  function sheetScrim() { return $("#sheetScrim"); }

  function sheet(title, bodyEl) {
    var m = sheetModal();
    if (!m) return;
    $("#sheetTitle").textContent = title || "";
    var body = $("#sheetBody");
    body.innerHTML = "";
    if (bodyEl) body.appendChild(bodyEl);
    m.classList.remove("hidden");
    m.classList.add("open");
    var sc = sheetScrim();
    if (sc) { sc.classList.remove("hidden"); sc.classList.add("open"); }
  }

  function closeSheet() {
    clearFindMarks();
    var m = sheetModal();
    if (m) { m.classList.add("hidden"); m.classList.remove("open"); }
    var sc = sheetScrim();
    if (sc) { sc.classList.add("hidden"); sc.classList.remove("open"); }
  }

  /* ---------- device mode (session-only: always boots to desktop) ---------- */
  function setDevice(mode) {
    if (mode !== "desktop" && mode !== "ipad" && mode !== "mobile") mode = "desktop";
    document.documentElement.dataset.device = mode;
    var stage = $("#stage");
    var mob = (mode === "mobile");
    if (stage) stage.classList.toggle("view-reflow", mob);
    ["#mTopbar", "#accBar", "#editFab"].forEach(function (s) {
      var n = $(s);
      if (n) n.classList.toggle("hidden", !mob);
    });
    var dm = $("#deviceMode");
    if (dm) {
      $$("[data-device]", dm).forEach(function (x) {
        x.classList.toggle("active", x.getAttribute("data-device") === mode);
      });
    }
    if (!mob) closeSheet();
    ensureExitPill(mode);
    bus.emit("device:change", { mode: mode });
  }

  /* Floating exit pill so a preview mode can never trap the user. */
  function ensureExitPill(mode) {
    var b = $("#deviceExit");
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.id = "deviceExit";
      b.className = "device-exit hidden";
      document.body.appendChild(b);
      b.addEventListener("click", function () { setDevice("desktop"); });
    }
    var names = { ipad: "iPad preview", mobile: "iPhone preview" };
    b.innerHTML = "Exit " + (names[mode] || "preview");
    b.classList.toggle("hidden", mode === "desktop");
  }

  /* ---------- read-only ---------- */
  function fabLabel() {
    var f = $("#editFab");
    return f ? f.querySelector("span") : null;
  }
  function setReadOnly(b) {
    readOnly = !!b;
    var sheet = T.sel.sheet();
    if (sheet) sheet.contentEditable = readOnly ? "false" : "true";
    var lab = fabLabel();
    if (lab) lab.textContent = readOnly ? "Edit" : "Reading";
    var f = $("#editFab");
    if (f) f.classList.toggle("is-reading", readOnly);
    T.toast(readOnly ? "Reading mode on" : "Editing on");
  }

  /* ---------- formatting sheet ---------- */
  var TEXT_COLORS = ["#111827", "#DC2626", "#2563EB", "#059669", "#D97706", "#7C3AED"];
  var HI_COLORS = ["#FFFF00", "#A7F3D0", "#BFDBFE", "#FBCFE8", "#FDE68A", "#E9D5FF"];

  function swatchRow(colors, fn) {
    var r = row();
    colors.forEach(function (c) {
      var b = el("button", "ink-sw");
      b.type = "button";
      b.style.background = c;
      b.title = c;
      b.setAttribute("aria-label", "Color " + c);
      b.addEventListener("click", function () { fn(c); });
      r.appendChild(b);
    });
    return r;
  }

  function buildFormatSheet() {
    var wrap = el("div");

    var s1 = sec("Style");
    var r1 = row();
    r1.appendChild(chip("H1", function () { styleCmd("style.h1", "<h1>"); }));
    r1.appendChild(chip("H2", function () { styleCmd("style.h2", "<h2>"); }));
    r1.appendChild(chip("H3", function () { styleCmd("style.h3", "<h3>"); }));
    r1.appendChild(chip("Body", function () { styleCmd("style.body", "<p>"); }));
    r1.appendChild(chip("Quote", function () { styleCmd("style.quote", "<blockquote>"); }));
    s1.appendChild(r1);
    wrap.appendChild(s1);

    var sP = sec("Preview");
    var rP = row();
    [["Desktop", "desktop", "i-monitor"], ["iPad", "ipad", "i-tablet"], ["iPhone", "mobile", "i-phone"]].forEach(function (d) {
      rP.appendChild(chip(d[0], function () { setDevice(d[1]); closeSheet(); }, d[2]));
    });
    sP.appendChild(rP);
    wrap.appendChild(sP);

    var s2 = sec("Font");
    var r2 = row();
    var sel = el("select");
    sel.style.cssText = "flex:1;min-height:42px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font-size:14px";
    T.fonts.names().forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () { T.cmd("fmt.fontFamily", sel.value); });
    r2.appendChild(sel);
    s2.appendChild(r2);
    wrap.appendChild(s2);

    var s3 = sec("Size");
    var r3 = row();
    r3.appendChild(chip("A minus", function () { T.cmd("fmt.fontShrink"); }, "i-minus"));
    r3.appendChild(chip("A plus", function () { T.cmd("fmt.fontGrow"); }, "i-plus"));
    s3.appendChild(r3);
    wrap.appendChild(s3);

    var s4 = sec("Text color");
    s4.appendChild(swatchRow(TEXT_COLORS, function (c) { T.cmd("fmt.textColor", c); }));
    wrap.appendChild(s4);

    var s5 = sec("Highlight");
    s5.appendChild(swatchRow(HI_COLORS, function (c) { T.cmd("fmt.highlight", c); }));
    wrap.appendChild(s5);

    var s6 = sec("Alignment");
    var r6 = row();
    var aligns = [
      ["i-align-l", "Left", "justifyLeft", ["para.alignLeft", "fmt.alignLeft"]],
      ["i-align-c", "Center", "justifyCenter", ["para.alignCenter", "fmt.alignCenter"]],
      ["i-align-r", "Right", "justifyRight", ["para.alignRight", "fmt.alignRight"]],
      ["i-align-j", "Justify", "justifyFull", ["para.alignJustify", "fmt.alignJustify"]]
    ];
    aligns.forEach(function (a) {
      r6.appendChild(chip(a[1], function () {
        firstCmd(a[3], undefined, function () { document.execCommand(a[2], false, null); });
      }, a[0]));
    });
    s6.appendChild(r6);
    wrap.appendChild(s6);

    var s7 = sec("Line spacing");
    var r7 = row();
    var lsel = el("select");
    lsel.style.cssText = "flex:1;min-height:42px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font-size:14px";
    [["1", "Single"], ["1.15", "1.15"], ["1.5", "1.5"], ["2", "Double"]].forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      lsel.appendChild(op);
    });
    lsel.addEventListener("change", function () {
      var v = parseFloat(lsel.value);
      firstCmd(["para.lineSpacing", "fmt.lineSpacing"], v, function () {
        var b = T.sel.block();
        if (b) { b.style.lineHeight = String(v); T.editor.markDirty(); }
      });
    });
    r7.appendChild(lsel);
    s7.appendChild(r7);
    wrap.appendChild(s7);

    return wrap;
  }

  /* ---------- insert sheet ---------- */
  function withSelection(fn) {
    var sheet = T.sel.sheet();
    if (sheet) {
      var r = T.sel.range(), inside = false;
      if (r) {
        var node = r.commonAncestorContainer;
        inside = (node === sheet || sheet.contains(node));
      }
      if (!inside && !T.sel.restore()) sheet.focus();
    }
    fn();
  }

  function startVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { T.toast("Voice input not supported"); return; }
    closeSheet();
    withSelection(function () {
      var rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = function (e) {
        var res = e.results[e.results.length - 1];
        var txt = res[0].transcript;
        document.execCommand("insertText", false, txt + " ");
        T.editor.markDirty();
      };
      rec.onerror = function () { T.toast("Voice input failed", "error"); };
      try {
        rec.start();
        T.toast("Listening...");
      } catch (err) { T.toast("Voice input failed", "error"); }
    });
  }

  function buildInsertSheet() {
    var wrap = el("div");
    var g = el("div", "tile-grid");
    function go(fn) { return function () { closeSheet(); withSelection(fn); }; }
    g.appendChild(tile("i-table", "Table", go(function () { T.cmd("table.insert", { r: 3, c: 3 }); })));
    g.appendChild(tile("i-image", "Image", go(function () { T.cmd("insert.imageUpload"); })));
    g.appendChild(tile("i-callout", "Callout", go(function () { T.cmd("insert.callout", "info"); })));
    g.appendChild(tile("i-checklist", "Checklist", go(function () { T.cmd("para.checklist"); })));
    g.appendChild(tile("i-hr", "Divider", go(function () { T.cmd("insert.hr"); })));
    g.appendChild(tile("i-footnote", "Footnote", go(function () { T.cmd("refs.footnote"); })));
    g.appendChild(tile("i-mic", "Dictate", function () { startVoice(); }));
    wrap.appendChild(g);
    return wrap;
  }

  /* ---------- nav / review sheet ---------- */
  function flashEl(node) {
    if (!node || !node.style) return;
    var old = node.style.boxShadow;
    node.style.boxShadow = "0 0 0 3px var(--accent)";
    setTimeout(function () { node.style.boxShadow = old; }, 1200);
  }

  function buildOutlinePane() {
    var wrap = el("div");
    var sheet = T.sel.sheet();
    var heads = sheet ? $$("h1,h2,h3", sheet) : [];
    if (!heads.length) {
      wrap.appendChild(el("p", null, "No headings yet."));
      return wrap;
    }
    heads.forEach(function (h) {
      var lvl = parseInt(h.tagName.charAt(1), 10) || 1;
      var b = chip((h.textContent || "").trim().slice(0, 60) || "Untitled heading", function () {
        closeSheet();
        if (h.scrollIntoView) h.scrollIntoView({ block: "start", behavior: "smooth" });
        flashEl(h);
      });
      b.style.marginLeft = ((lvl - 1) * 16) + "px";
      b.style.justifyContent = "flex-start";
      b.style.width = "100%";
      wrap.appendChild(b);
    });
    return wrap;
  }

  function buildCommentsPane() {
    var wrap = el("div");
    var list = (T.comments && T.comments.list) ? T.comments.list() : [];
    if (!list.length) {
      wrap.appendChild(el("p", null, "No comments yet."));
      return wrap;
    }
    list.forEach(function (c) {
      var n = (c.messages && c.messages.length) || 0;
      var label = ((c.resolved ? "Resolved, " : "") + (c.quote || "Comment")).slice(0, 48) + " (" + n + ")";
      wrap.appendChild(chip(label, function () {
        closeSheet();
        if (T.comments && T.comments.jump) T.comments.jump(c.id);
      }, "i-comment"));
    });
    return wrap;
  }

  /* minimal inline find: marks matches, prev/next cycles */
  var findMarks = [], findIdx = -1, findQ = "";
  function clearFindMarks() {
    var sheet = T.sel.sheet();
    if (!sheet) { findMarks = []; findIdx = -1; return; }
    $$(".mfind", sheet).forEach(function (m) {
      m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
    });
    if (sheet.normalize) sheet.normalize();
    findMarks = [];
    findIdx = -1;
  }
  function updateFindUI(countEl) {
    findMarks.forEach(function (m, i) {
      m.style.background = (i === findIdx) ? "#F59E0B" : "";
    });
    if (countEl) {
      countEl.textContent = findMarks.length ? (findIdx + 1) + " of " + findMarks.length : (findQ ? "No matches" : "");
    }
    var cur = findMarks[findIdx];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "center" });
  }
  function doFind(q, countEl) {
    clearFindMarks();
    findQ = q || "";
    var sheet = T.sel.sheet();
    if (!sheet || !findQ) { updateFindUI(countEl); return; }
    var ql = findQ.toLowerCase();
    var tw = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    var nodes = [], n;
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) {
      var txt = tn.data, tl = txt.toLowerCase();
      var pos = tl.indexOf(ql), last = 0, hit = false;
      if (pos < 0) return;
      var frag = document.createDocumentFragment();
      while (pos >= 0) {
        hit = true;
        frag.appendChild(document.createTextNode(txt.slice(last, pos)));
        var mk = document.createElement("mark");
        mk.className = "mfind";
        mk.textContent = txt.slice(pos, pos + findQ.length);
        frag.appendChild(mk);
        last = pos + findQ.length;
        pos = tl.indexOf(ql, last);
      }
      if (hit) {
        frag.appendChild(document.createTextNode(txt.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      }
    });
    findMarks = $$(".mfind", sheet);
    findIdx = findMarks.length ? 0 : -1;
    updateFindUI(countEl);
  }

  function buildFindPane() {
    var wrap = el("div");
    var r1 = row();
    var inp = el("input");
    inp.type = "text";
    inp.placeholder = "Find in document";
    inp.setAttribute("aria-label", "Find in document");
    inp.style.cssText = "flex:1;min-height:42px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font-size:14px";
    var count = el("span", null, "");
    count.style.cssText = "font-size:12px;color:var(--muted);min-width:64px;text-align:right";
    r1.appendChild(inp);
    r1.appendChild(count);
    wrap.appendChild(r1);
    var r2 = row();
    r2.appendChild(chip("Previous", function () {
      if (!findMarks.length) return;
      findIdx = (findIdx - 1 + findMarks.length) % findMarks.length;
      updateFindUI(count);
    }));
    r2.appendChild(chip("Next", function () {
      if (!findMarks.length) return;
      findIdx = (findIdx + 1) % findMarks.length;
      updateFindUI(count);
    }));
    r2.appendChild(chip("Clear", function () {
      inp.value = "";
      clearFindMarks();
      count.textContent = "";
    }));
    wrap.appendChild(r2);
    var deb = T.debounce(function () { doFind(inp.value.trim(), count); }, 250);
    inp.addEventListener("input", deb);
    return wrap;
  }

  function buildNavSheet() {
    var wrap = el("div");
    var tabs = row();
    var panes = el("div");
    panes.style.cssText = "display:flex;flex-direction:column;gap:8px";
    var defs = [
      ["Outline", buildOutlinePane],
      ["Comments", buildCommentsPane],
      ["Find", buildFindPane]
    ];
    var btns = [];
    defs.forEach(function (d, i) {
      var b = chip(d[0], function () {
        btns.forEach(function (x, k) { x.classList.toggle("active", k === i); });
        panes.innerHTML = "";
        panes.appendChild(d[1]());
      });
      btns.push(b);
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs);
    wrap.appendChild(panes);
    btns[0].classList.add("active");
    panes.appendChild(defs[0][1]());
    return wrap;
  }

  /* ---------- more sheet ---------- */
  var EXPORT_FMTS = [
    ["html", "HTML"], ["md", "Markdown"], ["doc", "Word"], ["txt", "Text"],
    ["rtf", "RTF"], ["odt", "ODT"], ["docx", "DOCX"], ["pdf", "PDF"]
  ];
  function buildMoreSheet() {
    var wrap = el("div");

    var s1 = sec("View");
    var r1 = row();
    r1.appendChild(chip("Theme", function () { T.cmd("theme.cycle"); }, "i-moon"));
    r1.appendChild(chip("Focus mode", function () { T.cmd("view.focus"); closeSheet(); }, "i-focus"));
    r1.appendChild(chip("Navigate", function () { sheet("Navigate", buildNavSheet()); }, "i-search"));
    s1.appendChild(r1);
    wrap.appendChild(s1);

    var sP = sec("Preview");
    var rP = row();
    [["Desktop", "desktop", "i-monitor"], ["iPad", "ipad", "i-tablet"], ["iPhone", "mobile", "i-phone"]].forEach(function (d) {
      rP.appendChild(chip(d[0], function () { setDevice(d[1]); closeSheet(); }, d[2]));
    });
    sP.appendChild(rP);
    wrap.appendChild(sP);

    var s2 = sec("Export");
    var r2 = row();
    EXPORT_FMTS.forEach(function (f) {
      r2.appendChild(chip(f[1], function () { T.cmd("export." + f[0]); closeSheet(); }, "i-export"));
    });
    s2.appendChild(r2);
    wrap.appendChild(s2);

    var s3 = sec("Document");
    var r3 = row();
    r3.appendChild(chip("Word goal", function () {      T.modal({
        title: "Word goal",
        sub: "Set your daily word target.",
        fields: [{ key: "goal", label: "Words", type: "number", value: String(T.state.prefs.wordGoal || 500) }],
        okText: "Set goal"
      }).then(function (res) {
        if (!res) return;
        var g = parseInt(res.goal, 10);
        if (g > 0) {
          T.state.prefs.wordGoal = g;
          T.savePrefs();
          T.toast("Word goal set");
        }
      });
    }, "i-stats"));
    s3.appendChild(r3);
    wrap.appendChild(s3);

    return wrap;
  }

  /* ---------- accessory bar ---------- */
  var accBuilt = false, accB, accI, accU;
  function accBtn(iconId, label, fn, textMode) {
    var b = el("button", "acc-btn");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    if (textMode) {
      b.textContent = label;
      b.style.fontWeight = "800";
    } else {
      b.innerHTML = T.icon(iconId);
    }
    b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function buildAccBar() {
    var bar = $("#accBar");
    if (!bar || accBuilt) return;
    accBuilt = true;
    accB = accBtn("i-bold", "Bold", function () { T.cmd("fmt.bold"); });
    accI = accBtn("i-italic", "Italic", function () { T.cmd("fmt.italic"); });
    accU = accBtn("i-underline", "Underline", function () { T.cmd("fmt.underline"); });
    bar.appendChild(accBtn(null, "Aa", function () { sheet("Format", buildFormatSheet()); }, true));
    bar.appendChild(accB);
    bar.appendChild(accI);
    bar.appendChild(accU);
    bar.appendChild(accBtn("i-highlighter", "Highlight", function () { T.cmd("fmt.highlight", "#FFFF00"); }));
    bar.appendChild(accBtn("i-bullets", "Bullets", function () { T.cmd("para.bullets"); }));
    bar.appendChild(accBtn("i-checklist", "Checklist", function () { T.cmd("para.checklist"); }));
    bar.appendChild(accBtn("i-indent", "Indent", function () { T.cmd("para.indent"); }));
    bar.appendChild(accBtn("i-outdent", "Outdent", function () { T.cmd("para.outdent"); }));
    bar.appendChild(accBtn("i-plus", "Insert", function () { sheet("Insert", buildInsertSheet()); }));
    bar.appendChild(accBtn("i-comment", "Comment", function () { if (T.comments) T.comments.add(); }));
    bar.appendChild(accBtn("i-ai", "AI assistant", function () { if (T.ai) T.ai.openPanel(""); }));
    bus.on("sel:change", T.debounce(function () {
      try {
        accB.classList.toggle("active", !!document.queryCommandState("bold"));
        accI.classList.toggle("active", !!document.queryCommandState("italic"));
        accU.classList.toggle("active", !!document.queryCommandState("underline"));
      } catch (e) {}
    }, 150));
  }

  /* ---------- mobile top bar ---------- */
  function syncMTitle(v) {
    var mt = $("#mTitle");
    if (mt && document.activeElement !== mt) mt.textContent = v || "";
  }
  function wireMTopbar() {
    var back = $("#mBack");
    if (back) back.addEventListener("click", function () {
      if (T.backstage && T.backstage.open) T.backstage.open("new");
    });

    var mt = $("#mTitle");
    if (mt) {
      mt.setAttribute("contenteditable", "true");
      mt.setAttribute("spellcheck", "false");
      mt.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); mt.blur(); }
      });
      mt.addEventListener("input", function () {
        var v = mt.textContent.trim();
        if (!v) return;
        var dt = $("#docTitle");
        if (dt && dt.value !== v) dt.value = v;
        var d = T.editor.getDoc();
        if (d && v !== d.title) {
          d.title = v;
          T.editor.markDirty();
          bus.emit("doc:title", v);
        }
      });
    }
    bus.on("doc:open", function (d) { syncMTitle(d && d.title); });
    bus.on("doc:title", function (v) { syncMTitle(v); });

    var reflow = $("#mReflow");
    if (reflow) reflow.addEventListener("click", function () {
      var stage = $("#stage");
      if (!stage) return;
      var on = stage.classList.toggle("view-reflow");
      reflow.classList.toggle("active", on);
    });

    var undo = $("#mUndo");
    if (undo) undo.addEventListener("click", function () { T.cmd("doc.undo"); });
    var redo = $("#mRedo");
    if (redo) redo.addEventListener("click", function () { T.cmd("doc.redo"); });

    var more = $("#mMore");
    if (more) more.addEventListener("click", function () { sheet("More", buildMoreSheet()); });
  }

  /* ---------- edit FAB ---------- */
  function wireFab() {
    var f = $("#editFab");
    if (f) f.addEventListener("click", function () { setReadOnly(!readOnly); });
  }

  /* ---------- sheet dismiss wiring ---------- */
  function wireSheetDismiss() {
    var c = $("#sheetClose");
    if (c) c.addEventListener("click", closeSheet);
    var sc = sheetScrim();
    if (sc) sc.addEventListener("click", closeSheet);
    bus.on("overlay:escape", closeSheet);
  }

  /* ---------- public API ---------- */
  T.mobile = {
    sheet: sheet,
    closeSheet: closeSheet,
    setDevice: setDevice,
    setReadOnly: setReadOnly
  };

  buildAccBar();
  wireMTopbar();
  wireFab();
  wireSheetDismiss();
  setDevice("desktop"); // previews are session-only; never boot trapped in one
})();
