/* TXT Insert tab: pages, tables, media, links, header/footer, symbols.
   Loads after js/ribbon.js. Exposes nothing global; registers commands
   and builds the ribbon Insert tab. */

(function () {
  "use strict";

  var T = window.TXT;
  if (!T || !T.ribbon) return; // ribbon.js must load first

  /* ================= helpers ================= */

  function sheet() { return T.sel.sheet(); }

  function caretRange() {
    var sh = sheet();
    if (!sh) return null;
    var r = T.sel.range();
    if (r && (r.commonAncestorContainer === sh || sh.contains(r.commonAncestorContainer))) return r;
    return null;
  }

  /* Insert a DOM node at the caret. Falls back to the saved selection, then
     to appending at the end of the sheet. Returns the node. */
  function insertNodeAtCaret(node) {
    var sh = sheet();
    if (!sh) return null;
    T.sel.focusSheet();
    var r = caretRange();
    if (!r && T.sel.restore()) r = caretRange();
    if (r) {
      r.deleteContents();
      r.insertNode(node);
    } else {
      sh.appendChild(node);
    }
    T.editor.markDirty();
    T.editor.ensureBlockIds(sh);
    return node;
  }

  /* Insert a block-level node AFTER the current block (splitting it at the
     caret when necessary), never nested inside a heading or paragraph. */
  function insertBlockNodeAtCaret(node) {
    var sh = sheet();
    if (!sh) return null;
    T.sel.focusSheet();
    var r = caretRange();
    if (!r && T.sel.restore()) r = caretRange();
    var blk = r ? T.sel.block() : null;
    if (!blk || blk === sh || blk.parentNode !== sh) {
      if (r) { r.deleteContents(); r.insertNode(node); }
      else sh.appendChild(node);
    } else {
      var tail = document.createRange();
      tail.setStart(r.startContainer, r.startOffset);
      tail.setEndAfter(blk.lastChild || blk);
      var frag = tail.extractContents();
      var hasContent = frag.textContent.trim() || frag.querySelector("img,table,hr,ul,ol");
      insertAfter(blk, node);
      if (hasContent) {
        var tag = /^(P|DIV)$/.test(blk.tagName) ? blk.tagName.toLowerCase() : "p";
        var nb = document.createElement(tag);
        nb.appendChild(frag);
        insertAfter(node, nb);
      } else if (!blk.textContent.trim() && !blk.querySelector("img,table,hr")) {
        blk.innerHTML = "<br>";
      }
    }
    placeCaretAfter(node);
    T.editor.markDirty();
    T.editor.ensureBlockIds(sh);
    return node;
  }

  /* Insert an HTML string at the caret. Uses execCommand insertHTML first,
     then a DOM fallback. */
  function insertHtmlAtCaret(html) {
    var sh = sheet();
    if (!sh) return;
    T.sel.focusSheet();
    var r = caretRange();
    if (!r && T.sel.restore()) r = caretRange();
    var done = false;
    if (r) {
      try { done = document.execCommand("insertHTML", false, html); } catch (e) { done = false; }
    }
    if (!done && r) {
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      var frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      var last = frag.lastChild;
      r.deleteContents();
      r.insertNode(frag);
      if (last) placeCaretAfter(last);
    }
    T.editor.markDirty();
    T.editor.ensureBlockIds(sh);
  }

  /* Insert a block-level element at the caret position. */
  function insertBlockAtCaret(tag, className, innerHtml) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHtml != null) el.innerHTML = innerHtml;
    return insertNodeAtCaret(el);
  }

  /* Insert plain text at the caret. */
  function insertTextAtCaret(text) {
    var sh = sheet();
    if (!sh) return;
    T.sel.focusSheet();
    var r = caretRange();
    if (!r && T.sel.restore()) r = caretRange();
    var done = false;
    if (r) {
      try { done = document.execCommand("insertText", false, text); } catch (e) { done = false; }
    }
    if (!done && r) {
      r.deleteContents();
      r.insertNode(document.createTextNode(text));
      T.sel.save();
    }
    T.editor.markDirty();
    T.editor.ensureBlockIds(sh);
  }

  function placeCaretAfter(node) {
    var sh = sheet();
    if (!sh || !node || !node.parentNode) return;
    var r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    T.sel.focusSheet();
  }

  function placeCaretIn(node) {
    var sh = sheet();
    if (!sh || !node) return;
    var r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(true);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    T.sel.focusSheet();
  }

  function insertAfter(ref, node) {
    if (ref.nextSibling) ref.parentNode.insertBefore(node, ref.nextSibling);
    else ref.parentNode.appendChild(node);
  }

  /* Table context: the cell/row/table holding the caret, or null. */
  function tableCtx() {
    var sh = sheet();
    if (!sh) return null;
    var r = T.sel.range();
    if (!r) return null;
    var n = r.commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    var cell = null;
    while (n && n !== sh) {
      if (n.tagName === "TD" || n.tagName === "TH") { cell = n; break; }
      n = n.parentNode;
    }
    if (!cell) return null;
    var tbl = cell;
    while (tbl && tbl !== sh && tbl.tagName !== "TABLE") tbl = tbl.parentNode;
    if (!tbl || tbl.tagName !== "TABLE") return null;
    return { cell: cell, row: cell.parentNode, table: tbl, ci: cell.cellIndex };
  }

  function needTable() {
    var cx = tableCtx();
    if (!cx) T.toast("Place the caret inside a table first.");
    return cx;
  }

  /* Image under the caret/selection, or null. */
  function imgAtCaret() {
    var sh = sheet();
    if (!sh) return null;
    var r = T.sel.range();
    if (!r) return null;
    var n = r.commonAncestorContainer;
    if (n.nodeType === 1 && n.tagName === "IMG") return n;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== sh) {
      if (n.tagName === "IMG") return n;
      n = n.parentNode;
    }
    return null;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* ================= table builder ================= */

  function buildTable(r, c) {
    r = T.clamp(Math.round(r) || 1, 1, 20);
    c = T.clamp(Math.round(c) || 1, 1, 20);
    var t = document.createElement("table");
    t.className = "txt-table";
    t.setAttribute("data-tid", T.uid());
    var tb = document.createElement("tbody");
    for (var i = 0; i < r; i++) {
      var tr = document.createElement("tr");
      for (var j = 0; j < c; j++) {
        var td = document.createElement("td");
        td.innerHTML = "<br>";
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }

  function insertBuiltTable(r, c) {
    var t = buildTable(r, c);
    insertBlockNodeAtCaret(t);
    var first = t.querySelector("td, th");
    if (first) placeCaretIn(first);
    T.toast("Table inserted: " + t.rows.length + " x " + t.rows[0].cells.length);
  }

  function makeRow(cellCount) {
    var tr = document.createElement("tr");
    for (var i = 0; i < cellCount; i++) {
      var td = document.createElement("td");
      td.innerHTML = "<br>";
      tr.appendChild(td);
    }
    return tr;
  }

  function touchDoc() {
    var sh = sheet();
    if (sh) {
      T.editor.markDirty();
      T.editor.ensureBlockIds(sh);
    }
    T.bus.emit("doc:change");
  }

  /* ================= images ================= */

  function insertImage(src, alt) {
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    img.className = "txt-img";
    img.style.width = "100%";
    img.setAttribute("data-kind", "insert");
    img.setAttribute("data-tid", T.uid());
    insertNodeAtCaret(img);
    placeCaretAfter(img);
  }

  function readImageFile(f, alt) {
    var rd = new FileReader();
    rd.onload = function () { insertImage(String(rd.result), alt || f.name || "image"); };
    rd.onerror = function () { T.toast("Could not read the image file.", "error"); };
    rd.readAsDataURL(f);
  }

  /* ================= page number pills ================= */

  function pageLabelFor(el) {
    var y = 1, x = 1;
    try {
      y = T.editor.pageCount() || 1;
      x = T.editor.pageOfNode(el) || 1;
    } catch (e) {}
    return "Page " + x + " of " + y;
  }

  function refreshPgPills() {
    var pills = T.$$(".pgnum-pill");
    for (var i = 0; i < pills.length; i++) pills[i].textContent = pageLabelFor(pills[i]);
  }

  /* ================= date formatting ================= */

  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function formatDate(fmt) {
    var d = new Date();
    var M = d.getMonth(), D = d.getDate(), Y = d.getFullYear();
    if (fmt === "short") return MONTHS[M].slice(0, 3) + " " + D + ", " + Y;
    if (fmt === "dmy") return D + "/" + (M + 1) + "/" + Y;
    if (fmt === "iso") return Y + "-" + pad2(M + 1) + "-" + pad2(D);
    var h = d.getHours(), ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return MONTHS[M] + " " + D + ", " + Y + ", " + h + ":" + pad2(d.getMinutes()) + " " + ap;
  }

  /* ================= command registrations ================= */

  function reg(name, fn, title, icon) {
    T.register(name, fn, { title: title, cat: "Insert", icon: icon });
  }

  /* ---- Pages ---- */

  reg("insert.coverPage", function () {
    T.modal({
      title: "Cover page",
      sub: "Inserted at the start of the document.",
      fields: [
        { label: T.t("coverTitle"), key: "title", ph: "Document title" },
        { label: T.t("coverSub"), key: "sub", ph: "Subtitle" }
      ],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v) return;
      var sh = sheet();
      if (!sh) return;
      var d = document.createElement("div");
      d.className = "coverpage";
      d.setAttribute("data-tid", T.uid());
      d.innerHTML = "<h1>" + T.esc(v.title) + "</h1><p>" + T.esc(v.sub) + "</p>";
      if (sh.firstChild) sh.insertBefore(d, sh.firstChild);
      else sh.appendChild(d);
      touchDoc();
      T.toast("Cover page inserted.");
    });
  }, "Cover page", "i-cover");

  reg("insert.blankPage", function () {
    var sh = sheet();
    if (!sh) return;
    T.sel.focusSheet();
    if (!caretRange()) T.sel.restore();
    var blk = T.sel.block();
    var brk = document.createElement("div");
    brk.className = "pbreak";
    var p = document.createElement("p");
    p.innerHTML = "<br>";
    if (blk && blk.parentNode === sh) {
      insertAfter(blk, brk);
      insertAfter(brk, p);
    } else {
      sh.appendChild(brk);
      sh.appendChild(p);
    }
    touchDoc();
    placeCaretIn(p);
  }, "Blank page", "i-page");

  reg("insert.pageBreak", function () {
    insertBlockAtCaret("div", "pbreak", T.esc("--- Page Break ---"));
    touchDoc();
  }, "Page break", "i-pagebreak");

  /* ---- Tables ---- */

  reg("table.insert", function (r, c) {
    if (r && typeof r === "object") { c = r.c; r = r.r; } // mobile tile / slash menu pass {r,c}
    insertBuiltTable(r, c);
  }, "Insert table", "i-table");

  reg("table.custom", function () {
    T.modal({
      title: T.t("customTable"),
      fields: [
        { label: T.t("rows"), key: "rows", type: "number", value: 3 },
        { label: T.t("cols"), key: "cols", type: "number", value: 3 }
      ],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v) return;
      insertBuiltTable(parseInt(v.rows, 10), parseInt(v.cols, 10));
    });
  }, "Custom table", "i-table");

  reg("table.addRowAbove", function () {
    var cx = needTable();
    if (!cx) return;
    cx.row.parentNode.insertBefore(makeRow(cx.row.cells.length), cx.row);
    touchDoc();
  }, "Add row above", "i-table");

  reg("table.addRowBelow", function () {
    var cx = needTable();
    if (!cx) return;
    var tr = makeRow(cx.row.cells.length);
    if (cx.row.nextSibling) cx.row.parentNode.insertBefore(tr, cx.row.nextSibling);
    else cx.row.parentNode.appendChild(tr);
    touchDoc();
  }, "Add row below", "i-table");

  reg("table.addColLeft", function () {
    var cx = needTable();
    if (!cx) return;
    var rows = cx.table.rows;
    for (var i = 0; i < rows.length; i++) {
      var td = document.createElement("td");
      td.innerHTML = "<br>";
      var ref = rows[i].cells[cx.ci] || null;
      rows[i].insertBefore(td, ref);
    }
    touchDoc();
  }, "Add column left", "i-table");

  reg("table.addColRight", function () {
    var cx = needTable();
    if (!cx) return;
    var rows = cx.table.rows;
    for (var i = 0; i < rows.length; i++) {
      var td = document.createElement("td");
      td.innerHTML = "<br>";
      var ref = rows[i].cells[cx.ci];
      rows[i].insertBefore(td, ref ? ref.nextSibling : null);
    }
    touchDoc();
  }, "Add column right", "i-table");

  reg("table.deleteRow", function () {
    var cx = needTable();
    if (!cx) return;
    if (cx.table.rows.length <= 1) {
      cx.table.parentNode.removeChild(cx.table);
      T.toast("Table removed.");
    } else {
      cx.row.parentNode.removeChild(cx.row);
    }
    touchDoc();
  }, "Delete row", "i-trash");

  reg("table.deleteCol", function () {
    var cx = needTable();
    if (!cx) return;
    var rows = cx.table.rows;
    for (var i = 0; i < rows.length; i++) {
      var cell = rows[i].cells[cx.ci];
      if (cell) rows[i].removeChild(cell);
    }
    for (var j = rows.length - 1; j >= 0; j--) {
      if (rows[j].cells.length === 0) rows[j].parentNode.removeChild(rows[j]);
    }
    if (cx.table.rows.length === 0) {
      cx.table.parentNode.removeChild(cx.table);
      T.toast("Table removed.");
    }
    touchDoc();
  }, "Delete column", "i-trash");

  reg("table.zebra", function () {
    var cx = needTable();
    if (!cx) return;
    cx.table.classList.toggle("zebra");
    touchDoc();
    T.toast(cx.table.classList.contains("zebra") ? "Zebra striping on." : "Zebra striping off.");
  }, "Zebra striping", "i-zebra");

  reg("table.headerFill", function () {
    var cx = needTable();
    if (!cx) return;
    T.modal({
      title: "Header row fill",
      fields: [{ label: "Color", key: "color", type: "color", value: "#dbe7ff" }],
      okText: T.t("apply")
    }).then(function (v) {
      if (!v) return;
      var cells = cx.table.rows[0].cells;
      for (var i = 0; i < cells.length; i++) cells[i].style.background = v.color;
      touchDoc();
    });
  }, "Header row fill", "i-shading");

  /* ---- Media ---- */

  reg("insert.imageUpload", function () {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (f) readImageFile(f);
    });
    inp.click();
  }, "Upload image", "i-image");

  reg("insert.imageUrl", function () {
    T.modal({
      title: "Image from URL",
      fields: [
        { label: T.t("linkUrl"), key: "url", ph: "https://" },
        { label: T.t("altText"), key: "alt", ph: "Description of the image" }
      ],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v || !v.url) return;
      insertImage(v.url.trim(), v.alt);
    });
  }, "Image from URL", "i-image");

  reg("insert.imageWidth", function (pct) {
    var img = imgAtCaret();
    if (!img) {
      T.toast("Select an image first.");
      return;
    }
    img.style.width = T.clamp(parseInt(pct, 10) || 100, 1, 100) + "%";
    touchDoc();
  }, "Image width", "i-image");

  reg("insert.shapeBanner", function () {
    T.modal({
      title: "Shape banner",
      fields: [{ label: "Banner text", key: "title", ph: "Section title" }],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v || !v.title) return;
      var d = document.createElement("div");
      d.className = "shape-banner";
      d.setAttribute("data-tid", T.uid());
      d.innerHTML = '<svg viewBox="0 0 600 140" width="100%" role="img" aria-label="' + T.esc(v.title) + '">' +
        '<rect x="6" y="6" width="588" height="128" rx="20" fill="#2563EB"/>' +
        '<text x="300" y="84" text-anchor="middle" fill="#FFFFFF" font-size="34" font-weight="700" font-family="inherit">' +
        T.esc(v.title) + "</text></svg>";
      insertBlockNodeAtCaret(d);
      touchDoc();
    });
  }, "Shape banner", "i-shapes");

  reg("insert.compare", function () {
    var d = document.createElement("div");
    d.className = "cmp2";
    d.setAttribute("data-tid", T.uid());
    d.innerHTML = '<div class="cmp-col"><h4>Option A</h4><p>Type here.</p></div>' +
      '<div class="cmp-col"><h4>Option B</h4><p>Type here.</p></div>';
    insertBlockNodeAtCaret(d);
    var first = d.querySelector(".cmp-col p");
    if (first) placeCaretIn(first);
    touchDoc();
  }, "Compare card", "i-columns");

  reg("insert.callout", function (kind) {
    kind = kind || "info";
    var label = kind.charAt(0).toUpperCase() + kind.slice(1);
    var d = document.createElement("div");
    d.className = "callout " + kind;
    d.setAttribute("data-tid", T.uid());
    d.innerHTML = "<p>Type your " + T.esc(label.toLowerCase()) + " note here.</p>";
    insertBlockNodeAtCaret(d);
    var p = d.querySelector("p");
    if (p) placeCaretIn(p);
    touchDoc();
  }, "Callout", "i-callout");

  reg("insert.code", function () {
    var wrap = document.createElement("div");
    wrap.className = "codewrap";
    wrap.setAttribute("data-tid", T.uid());
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-code";
    btn.textContent = "Copy";
    btn.setAttribute("contenteditable", "false");
    btn.setAttribute("title", "Copy code");
    var pre = document.createElement("pre");
    pre.className = "codeblock";
    var code = document.createElement("code");
    code.textContent = "// paste code here";
    pre.appendChild(code);
    wrap.appendChild(btn);
    wrap.appendChild(pre);
    insertBlockNodeAtCaret(wrap);
    touchDoc();
  }, "Code block", "i-code");

  reg("insert.hr", function () {
    var hr = document.createElement("hr");
    insertBlockNodeAtCaret(hr);
    touchDoc();
  }, "Horizontal rule", "i-hr");

  /* ---- Links ---- */

  reg("link.insert", function () {
    var cur = T.sel.text();
    T.modal({
      title: "Insert link",
      fields: [
        { label: T.t("linkText"), key: "text", value: cur },
        { label: T.t("linkUrl"), key: "url", ph: "https://" }
      ],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v || !v.url) return;
      var url = v.url.trim();
      if (!/^(https?:\/\/|mailto:|#)/i.test(url)) url = "https://" + url;
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = v.text || url;
      a.setAttribute("data-tid", T.uid());
      insertNodeAtCaret(a);
      placeCaretAfter(a);
      touchDoc();
    });
  }, "Hyperlink", "i-link");

  reg("link.bookmark", function () {
    T.modal({
      title: "Bookmark",
      sub: "Bookmarks are listed in the sidebar for quick navigation.",
      fields: [{ label: T.t("bookmarkName"), key: "name", ph: "section-1" }],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v || !v.name) return;
      var name = v.name.trim();
      if (!name) return;
      var sp = document.createElement("span");
      sp.className = "bookmark-mark";
      sp.setAttribute("data-bookmark", name);
      sp.id = "bm-" + T.uid();
      sp.textContent = name;
      insertNodeAtCaret(sp);
      placeCaretAfter(sp);
      touchDoc();
      T.bus.emit("outline:update");
    });
  }, "Bookmark", "i-bookmark");

  /* ---- Header & Footer ---- */

  var hfOn = { header: false, footer: false };

  reg("hf.toggleHeader", function () {
    var el = document.getElementById("hfHeader");
    if (!el) { T.toast("Header zone is not ready yet."); return; }
    hfOn.header = !hfOn.header;
    el.style.display = hfOn.header ? "" : "none";
    if (hfOn.header) el.focus();
    T.toast(hfOn.header ? "Header on." : "Header off.");
  }, "Toggle header", "i-header");

  reg("hf.toggleFooter", function () {
    var el = document.getElementById("hfFooter");
    if (!el) { T.toast("Footer zone is not ready yet."); return; }
    hfOn.footer = !hfOn.footer;
    el.style.display = hfOn.footer ? "" : "none";
    if (hfOn.footer) el.focus();
    T.toast(hfOn.footer ? "Footer on." : "Footer off.");
  }, "Toggle footer", "i-footer");

  reg("hf.pageNumber", function () {
    var sp = document.createElement("span");
    sp.className = "pgnum-pill";
    sp.setAttribute("contenteditable", "false");
    sp.setAttribute("data-tid", T.uid());
    sp.textContent = pageLabelFor(sp);
    insertNodeAtCaret(sp);
    placeCaretAfter(sp);
    touchDoc();
  }, "Page number", "i-pagenum");

  reg("hf.dateTime", function () {
    T.modal({
      title: "Date and time",
      fields: [{
        label: T.t("dateFmt"), key: "fmt", type: "select", value: "long",
        options: [
          { v: "long", t: "October 15, 2026, 11:30 AM" },
          { v: "short", t: "Oct 15, 2026" },
          { v: "dmy", t: "15/10/2026" },
          { v: "iso", t: "2026-10-15" }
        ]
      }],
      okText: T.t("insert")
    }).then(function (v) {
      if (!v) return;
      var sp = document.createElement("span");
      sp.className = "date-pill";
      sp.setAttribute("data-tid", T.uid());
      sp.textContent = formatDate(v.fmt);
      insertNodeAtCaret(sp);
      placeCaretAfter(sp);
      touchDoc();
    });
  }, "Date and time", "i-calendar");

  /* ---- Symbols ---- */

  var SYMS = ["±", "≠", "≈", "∑", "∏", "√", "∞", "§", "¶", "™", "©", "®",
    "€", "£", "¥", "₹", "→", "⇒", "←", "↑", "↓", "×", "÷", "°", "µ", "π",
    "Δ", "λ", "α", "β", "γ", "θ", "Ω", "•", "◦", "▪", "◆", "★", "☆",
    "♠", "♥", "♦", "♣", "✓", "✗", "↔", "½", "¼", "¾", "…"];

  function symGridHtml() {
    var h = '<div class="sym-pop"><div class="sym-grid" role="listbox">';
    for (var i = 0; i < SYMS.length; i++) {
      h += '<button type="button" class="sym" role="option" data-s="' + T.esc(SYMS[i]) + '">' + T.esc(SYMS[i]) + "</button>";
    }
    return h + "</div></div>";
  }

  reg("insert.symbol", function () {
    if (symBtn) T.ribbon.openMenu(symBtn, [{ html: symGridHtml() }]);
  }, "Symbols", "i-symbol");

  /* ================= ribbon construction ================= */

  T.ribbon.addTab({ id: "insert", label: "Insert", keytip: "N" });

  /* ---- Pages group ---- */
  var gPages = T.ribbon.group("insert", "Pages");
  gPages.appendChild(T.ribbon.btn({ icon: "i-cover", label: "Cover page", cmd: "insert.coverPage", title: "Insert a cover page at the start", keytip: "C" }));
  gPages.appendChild(T.ribbon.btn({ icon: "i-page", label: "Blank page", cmd: "insert.blankPage", title: "Insert a blank page after this one", keytip: "B" }));
  gPages.appendChild(T.ribbon.btn({ icon: "i-pagebreak", label: "Page break", cmd: "insert.pageBreak", title: "Insert a page break", keytip: "P" }));

  /* ---- Tables group ---- */
  function tableGridHtml() {
    var h = '<div class="tbl-pop"><div class="tbl-label">1 x 1</div><div class="tbl-grid">';
    for (var r = 1; r <= 8; r++) {
      for (var c = 1; c <= 8; c++) {
        h += '<button type="button" class="tbl-cell" data-r="' + r + '" data-c="' + c + '" aria-label="' + r + " by " + c + ' table"></button>';
      }
    }
    return h + "</div></div>";
  }

  var gTables = T.ribbon.group("insert", "Tables");
  gTables.appendChild(T.ribbon.menuBtn({
    icon: "i-table", label: "Table", title: "Insert table",
    items: [{ html: tableGridHtml() }]
  }));
  gTables.appendChild(T.ribbon.btn({ icon: "i-grid", label: "Custom", cmd: "table.custom", title: "Insert table with custom rows and columns" }));

  /* ---- Table Tools contextual group ---- */
  var gTools = T.ribbon.group("insert", "Table Tools");
  var gToolsWrap = gTools._rgroup || gTools;
  gToolsWrap.style.display = "none";
  gTools.appendChild(T.ribbon.btn({ icon: "i-plus", label: "Row above", cmd: "table.addRowAbove", title: "Add a row above the current row", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-plus", label: "Row below", cmd: "table.addRowBelow", title: "Add a row below the current row", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-plus", label: "Col left", cmd: "table.addColLeft", title: "Add a column to the left", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-plus", label: "Col right", cmd: "table.addColRight", title: "Add a column to the right", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-trash", label: "Del row", cmd: "table.deleteRow", title: "Delete the current row", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-trash", label: "Del col", cmd: "table.deleteCol", title: "Delete the current column", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-zebra", label: "Zebra", cmd: "table.zebra", title: "Toggle zebra striping", small: true }));
  gTools.appendChild(T.ribbon.btn({ icon: "i-shading", label: "Header fill", cmd: "table.headerFill", title: "Set header row fill color", small: true }));

  function updateToolsVis() {
    var show = false;
    try { show = tableCtx() !== null; } catch (e) { show = false; }
    gToolsWrap.style.display = show ? "" : "none";
  }
  T.bus.on("sel:change", updateToolsVis);
  T.bus.on("doc:change", updateToolsVis);
  try { updateToolsVis(); } catch (e) {}

  /* ---- Media group ---- */
  var gMedia = T.ribbon.group("insert", "Media");
  gMedia.appendChild(T.ribbon.menuBtn({
    icon: "i-image", label: "Image", title: "Insert image",
    items: [
      { icon: "i-image", label: "Upload image", fn: function () { T.cmd("insert.imageUpload"); } },
      { icon: "i-globe", label: "From URL", fn: function () { T.cmd("insert.imageUrl"); } },
      { sep: 1 },
      { head: "Width" },
      { label: "25%", fn: function () { T.cmd("insert.imageWidth", 25); } },
      { label: "50%", fn: function () { T.cmd("insert.imageWidth", 50); } },
      { label: "75%", fn: function () { T.cmd("insert.imageWidth", 75); } },
      { label: "100%", fn: function () { T.cmd("insert.imageWidth", 100); } }
    ]
  }));
  gMedia.appendChild(T.ribbon.btn({ icon: "i-shapes", label: "Banner", cmd: "insert.shapeBanner", title: "Insert a shape banner" }));
  gMedia.appendChild(T.ribbon.btn({ icon: "i-columns", label: "Compare", cmd: "insert.compare", title: "Insert a comparison card" }));
  gMedia.appendChild(T.ribbon.menuBtn({
    icon: "i-callout", label: "Callout", title: "Insert callout",
    items: [
      { label: "Info", fn: function () { T.cmd("insert.callout", "info"); } },
      { label: "Warning", fn: function () { T.cmd("insert.callout", "warning"); } },
      { label: "Success", fn: function () { T.cmd("insert.callout", "success"); } },
      { label: "Danger", fn: function () { T.cmd("insert.callout", "danger"); } }
    ]
  }));
  gMedia.appendChild(T.ribbon.btn({ icon: "i-code", label: "Code", cmd: "insert.code", title: "Insert a code block" }));
  gMedia.appendChild(T.ribbon.btn({ icon: "i-hr", label: "Rule", cmd: "insert.hr", title: "Insert a horizontal rule" }));

  /* ---- Links group ---- */
  var gLinks = T.ribbon.group("insert", "Links");
  gLinks.appendChild(T.ribbon.btn({ icon: "i-link", label: "Link", cmd: "link.insert", title: "Insert hyperlink", keytip: "L" }));
  gLinks.appendChild(T.ribbon.btn({ icon: "i-bookmark", label: "Bookmark", cmd: "link.bookmark", title: "Insert a bookmark" }));

  /* ---- Header & Footer group ---- */
  var gHf = T.ribbon.group("insert", "Header & Footer");
  gHf.appendChild(T.ribbon.btn({ icon: "i-header", label: "Header", cmd: "hf.toggleHeader", title: "Show or hide the header" }));
  gHf.appendChild(T.ribbon.btn({ icon: "i-footer", label: "Footer", cmd: "hf.toggleFooter", title: "Show or hide the footer" }));
  gHf.appendChild(T.ribbon.btn({ icon: "i-pagenum", label: "Page number", cmd: "hf.pageNumber", title: "Insert a page number pill" }));
  gHf.appendChild(T.ribbon.btn({ icon: "i-calendar", label: "Date", cmd: "hf.dateTime", title: "Insert the current date and time" }));

  /* ---- Symbols group ---- */
  var gSym = T.ribbon.group("insert", "Symbols");
  var symBtn = T.ribbon.menuBtn({
    icon: "i-symbol", label: "Symbols", title: "Insert symbol",
    items: [{ html: symGridHtml() }]
  });
  gSym.appendChild(symBtn);

  /* ================= one-time delegated listeners ================= */

  var wired = false;
  function wireOnce() {
    if (wired) return;
    wired = true;

    /* table grid hover highlight + click insert */
    document.addEventListener("mouseover", function (e) {
      var cell = e.target && e.target.closest ? e.target.closest(".tbl-cell") : null;
      if (!cell) return;
      var grid = cell.closest(".tbl-grid");
      if (!grid) return;
      var r = parseInt(cell.getAttribute("data-r"), 10);
      var c = parseInt(cell.getAttribute("data-c"), 10);
      var cells = grid.querySelectorAll(".tbl-cell");
      for (var i = 0; i < cells.length; i++) {
        var cr = parseInt(cells[i].getAttribute("data-r"), 10);
        var cc = parseInt(cells[i].getAttribute("data-c"), 10);
        if (cr <= r && cc <= c) cells[i].classList.add("lit");
        else cells[i].classList.remove("lit");
      }
      var pop = grid.closest(".tbl-pop");
      var label = pop ? pop.querySelector(".tbl-label") : null;
      if (label) label.textContent = r + " x " + c;
    });
    document.addEventListener("click", function (e) {
      var cell = e.target && e.target.closest ? e.target.closest(".tbl-cell") : null;
      if (cell) {
        var r = parseInt(cell.getAttribute("data-r"), 10);
        var c = parseInt(cell.getAttribute("data-c"), 10);
        T.ribbon.closeMenu();
        T.cmd("table.insert", r, c);
        return;
      }
      var sym = e.target && e.target.closest ? e.target.closest(".sym") : null;
      if (sym) {
        var ch = sym.getAttribute("data-s");
        T.ribbon.closeMenu();
        insertTextAtCaret(ch);
        return;
      }
      var copy = e.target && e.target.closest ? e.target.closest(".copy-code") : null;
      if (copy) {
        var wrap = copy.closest(".codewrap");
        var pre = wrap ? wrap.querySelector("pre") : null;
        var txt = pre ? pre.innerText : "";
        var done = function () { T.toast(T.t("copied")); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
        } else {
          fallbackCopy(txt);
          done();
        }
      }
    });

    /* drag-and-drop images into the sheet */
    document.addEventListener("dragover", function (e) {
      if (e.target && e.target.closest && e.target.closest(".psheet")) e.preventDefault();
    });
    document.addEventListener("drop", function (e) {
      if (!(e.target && e.target.closest && e.target.closest(".psheet"))) return;
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var imgs = [];
      for (var i = 0; i < files.length; i++) {
        if (/^image\//.test(files[i].type)) imgs.push(files[i]);
      }
      if (!imgs.length) return;
      e.preventDefault();
      e.stopPropagation();
      var sh = sheet();
      if (sh) {
        var rr = null;
        try { rr = document.caretRangeFromPoint(e.clientX, e.clientY); } catch (ex) { rr = null; }
        if (rr && (rr.commonAncestorContainer === sh || sh.contains(rr.commonAncestorContainer))) {
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(rr);
        }
      }
      imgs.forEach(function (f) { readImageFile(f); });
    });

    /* keep page-number pills current */
    T.bus.on("page:change", refreshPgPills);
  }
  wireOnce();

  function fallbackCopy(txt) {
    var ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

})();
