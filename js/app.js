/* TXT app: editor, documents, toolbar, export wiring. */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function uid() { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }
  function toast(msg) {
    var el = $(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }
  function saveBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function safeName(s) {
    return String(s || "document").trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "document";
  }

  var FONTS = ["Calibri", "Arial", "Helvetica", "Times New Roman", "Georgia", "Garamond",
    "Verdana", "Tahoma", "Trebuchet MS", "Cambria", "Courier New", "Comic Sans MS", "Impact",
    "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
    "Playfair Display", "Merriweather", "Nunito", "Noto Sans Myanmar"];
  var SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 60, 72];
  var LS_DOCS = "txt.docs.v1", LS_SETTINGS = "txt.settings.v1";

  /* ---------- state ---------- */
  var sheet = $("#sheet"), canvas = $("#canvas"), zoomWrap = $("#zoomWrap");
  var docs = [], currentId = null;
  var settings = { paper: "a4", margin: "normal", zoom: 1 };
  var savedRange = null;

  var PAPERS = { a4: [210, 297], letter: [215.9, 279.4] };
  var MARGINS = { narrow: 12.7, normal: 25.4, wide: 31.8 };

  function loadState() {
    try { docs = JSON.parse(localStorage.getItem(LS_DOCS) || "[]"); } catch (e) { docs = []; }
    try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}")); } catch (e) {}
    if (!docs.length) {
      var id = uid();
      docs = [{ id: id, name: "Welcome to TXT", updatedAt: Date.now(), html:
        "<h1>Welcome to TXT</h1>" +
        "<p>This is your new word processor. Everything here really works: select text and use the toolbar to make it <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, or give it <span style=\"color:#4f46e5\">color</span>.</p>" +
        "<h2>Try the features</h2>" +
        "<ul><li>Headings, bullet and numbered lists</li><li>Tables, images, links and quotes</li><li>Find and replace with Ctrl+F</li></ul>" +
        "<p>Your work saves automatically in this browser. Use <strong>Export</strong> up top to download your document as DOCX, DOC, PDF, ODT, RTF, HTML, Markdown or plain text.</p>" +
        "<p><br></p>"
      }];
      currentId = id;
      persistDocs();
    } else if (!currentId) {
      currentId = docs[0].id;
    }
  }
  function persistDocs() {
    try { localStorage.setItem(LS_DOCS, JSON.stringify(docs)); } catch (e) { toast("Storage is full, oldest documents may not save"); }
  }
  function persistSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (e) {}
  }
  function getDoc(id) { return docs.find(function (d) { return d.id === (id || currentId); }); }

  var saveStateEl = $("#saveState");
  function markDirty() { saveStateEl.textContent = "Saving..."; }
  function markSaved() { saveStateEl.textContent = "Saved"; }
  var persistCurrent = debounce(function () {
    var d = getDoc();
    if (!d) return;
    d.html = sheet.innerHTML;
    d.updatedAt = Date.now();
    persistDocs();
    markSaved();
    renderDocList();
  }, 700);
  function persistNow() {
    var d = getDoc();
    if (!d) return;
    d.html = sheet.innerHTML;
    d.updatedAt = Date.now();
    persistDocs();
    markSaved();
  }

  /* ---------- sidebar document list ---------- */
  var docList = $("#docList"), docName = $("#docName");
  function fmtDate(ts) {
    var d = new Date(ts), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return sameDay ? t : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t;
  }
  function renderDocList() {
    docList.innerHTML = "";
    docs.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).forEach(function (d) {
      var el = document.createElement("div");
      el.className = "doc-item" + (d.id === currentId ? " active" : "");
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = d.name; nm.title = d.name;
      var dt = document.createElement("span"); dt.className = "dt"; dt.textContent = fmtDate(d.updatedAt);
      var del = document.createElement("button"); del.className = "del"; del.title = "Delete"; del.textContent = "×";
      del.addEventListener("click", function (e) { e.stopPropagation(); deleteDoc(d.id); });
      el.appendChild(nm); el.appendChild(dt); el.appendChild(del);
      el.addEventListener("click", function () { switchDoc(d.id); });
      el.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var inp = document.createElement("input");
        inp.value = d.name;
        el.innerHTML = ""; el.appendChild(inp);
        inp.focus(); inp.select();
        function done(save) {
          if (save && inp.value.trim()) { d.name = inp.value.trim(); if (d.id === currentId) docName.value = d.name; persistDocs(); }
          renderDocList();
        }
        inp.addEventListener("blur", function () { done(true); });
        inp.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") done(true);
          else if (ev.key === "Escape") done(false);
          ev.stopPropagation();
        });
        inp.addEventListener("click", function (ev) { ev.stopPropagation(); });
      });
      docList.appendChild(el);
    });
  }
  function switchDoc(id) {
    if (id === currentId) return;
    persistNow();
    currentId = id;
    var d = getDoc();
    sheet.innerHTML = d.html || "";
    docName.value = d.name;
    clearFind();
    renderDocList();
    updateCounts();
    applyZoom();
  }
  function newDoc() {
    persistNow();
    var d = { id: uid(), name: "Untitled document", updatedAt: Date.now(), html: "" };
    docs.unshift(d);
    currentId = d.id;
    sheet.innerHTML = "";
    docName.value = d.name;
    clearFind();
    persistDocs(); renderDocList(); updateCounts();
    sheet.focus();
    toast("New document");
  }
  function deleteDoc(id) {
    if (docs.length <= 1) { toast("You need at least one document"); return; }
    docs = docs.filter(function (d) { return d.id !== id; });
    if (id === currentId) {
      currentId = docs[0].id;
      var d = getDoc();
      sheet.innerHTML = d.html || "";
      docName.value = d.name;
    }
    persistDocs(); renderDocList(); updateCounts();
    toast("Document deleted");
  }

  /* ---------- selection helpers ---------- */
  function saveRange() {
    var sel = window.getSelection();
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    if (!savedRange) { sheet.focus(); return false; }
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }
  document.addEventListener("selectionchange", debounce(function () {
    var sel = window.getSelection();
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      updateToolbar();
    }
  }, 120));

  function currentBlock() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return null;
    var n = sel.anchorNode;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== sheet) {
      if (/^(P|H1|H2|H3|BLOCKQUOTE|LI|DIV|PRE)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  }

  /* ---------- toolbar ---------- */
  var toolbar = $("#toolbar");
  toolbar.addEventListener("mousedown", function (e) {
    if (e.target.closest("button.tool")) e.preventDefault();
  });

  $$("#toolbar [data-cmd]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      restoreRange();
      var cmd = btn.getAttribute("data-cmd");
      document.execCommand("styleWithCSS", false, true);
      document.execCommand(cmd, false, null);
      sheet.focus();
      updateToolbar();
      markDirty(); persistCurrent();
    });
  });

  var fontFamily = $("#fontFamily"), fontSize = $("#fontSize"), blockStyle = $("#blockStyle"), lineSpacing = $("#lineSpacing");
  FONTS.forEach(function (f) {
    var o = document.createElement("option");
    o.value = f; o.textContent = f; o.style.fontFamily = "'" + f + "', sans-serif";
    fontFamily.appendChild(o);
  });
  SIZES.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s; o.textContent = s;
    fontSize.appendChild(o);
  });
  fontFamily.addEventListener("change", function () {
    if (!restoreRange()) return;
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("fontName", false, fontFamily.value);
    sheet.focus(); markDirty(); persistCurrent();
  });
  fontSize.addEventListener("change", function () {
    applyFontSize(parseInt(fontSize.value, 10));
  });
  function applyFontSize(px) {
    if (!restoreRange()) return;
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("fontSize", false, "7");
    var guard = 0;
    var f;
    while ((f = sheet.querySelector('font[size="7"]')) && guard++ < 50) {
      var s = document.createElement("span");
      s.style.fontSize = px + "px";
      s.innerHTML = f.innerHTML;
      f.replaceWith(s);
    }
    sheet.focus(); updateToolbar(); markDirty(); persistCurrent();
  }
  blockStyle.addEventListener("change", function () {
    if (!restoreRange()) return;
    var v = blockStyle.value;
    document.execCommand("styleWithCSS", false, true);
    if (v === "blockquote") {
      var b = currentBlock();
      if (b && b.tagName === "BLOCKQUOTE") document.execCommand("formatBlock", false, "p");
      else document.execCommand("formatBlock", false, "blockquote");
    } else {
      document.execCommand("formatBlock", false, v);
    }
    sheet.focus(); updateToolbar(); markDirty(); persistCurrent();
  });
  lineSpacing.addEventListener("change", function () {
    if (!restoreRange()) return;
    var v = parseFloat(lineSpacing.value);
    var blocks = blocksInSelection();
    (blocks.length ? blocks : [currentBlock()]).forEach(function (b) {
      if (b) b.style.lineHeight = v;
    });
    sheet.focus(); markDirty(); persistCurrent();
  });
  function blocksInSelection() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return [];
    var range = sel.getRangeAt(0);
    var out = [];
    $$("p,h1,h2,h3,blockquote,li,pre", sheet).forEach(function (b) {
      try { if (range.intersectsNode(b)) out.push(b); } catch (e) {}
    });
    return out;
  }

  $("#foreColor").addEventListener("input", function (e) {
    if (!restoreRange()) return;
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("foreColor", false, e.target.value);
    $("#fgBar").style.background = e.target.value;
    sheet.focus(); markDirty(); persistCurrent();
  });
  $("#hiliteColor").addEventListener("input", function (e) {
    if (!restoreRange()) return;
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("hiliteColor", false, e.target.value);
    sheet.focus(); markDirty(); persistCurrent();
  });

  function ancestorFontSize() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return null;
    var n = sel.anchorNode;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== sheet) {
      if (n.style && n.style.fontSize) {
        var m = String(n.style.fontSize).match(/([\d.]+)px/);
        if (m) return Math.round(parseFloat(m[1]));
      }
      n = n.parentNode;
    }
    return null;
  }
  function updateToolbar() {
    try {
      ["bold", "italic", "underline", "strikeThrough", "subscript", "superscript",
       "insertUnorderedList", "insertOrderedList",
       "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"].forEach(function (cmd) {
        var btn = toolbar.querySelector('[data-cmd="' + cmd + '"]');
        if (btn) btn.classList.toggle("active", document.queryCommandState(cmd));
      });
      var fn = document.queryCommandValue("fontName").replace(/["']/g, "");
      if (fn && FONTS.indexOf(fn) >= 0) fontFamily.value = fn;
      var fs = ancestorFontSize();
      fontSize.value = fs && SIZES.indexOf(fs) >= 0 ? String(fs) : "";
      var b = currentBlock();
      var tag = b ? b.tagName.toLowerCase() : "p";
      blockStyle.value = ["p", "h1", "h2", "h3", "blockquote"].indexOf(tag) >= 0 ? tag : "p";
    } catch (e) {}
  }

  /* ---------- popover ---------- */
  var popover = $("#popover");
  function openPopover(anchor, html) {
    popover.innerHTML = html;
    popover.classList.remove("hidden");
    var r = anchor.getBoundingClientRect();
    popover.style.top = Math.min(window.innerHeight - popover.offsetHeight - 12, r.bottom + 8) + "px";
    popover.style.left = Math.max(8, Math.min(window.innerWidth - popover.offsetWidth - 12, r.left)) + "px";
    var first = popover.querySelector("input,select");
    if (first) first.focus();
  }
  function closePopover() { popover.classList.add("hidden"); popover.innerHTML = ""; }
  document.addEventListener("mousedown", function (e) {
    if (!popover.classList.contains("hidden") && !popover.contains(e.target) && !e.target.closest("#btnLink,#btnImage,#btnTable,#btnPageSetup")) closePopover();
    if (!$("#exportMenu").classList.contains("hidden") && !e.target.closest(".menu-wrap")) $("#exportMenu").classList.add("hidden");
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closePopover(); clearFind(); } });

  /* link */
  $("#btnLink").addEventListener("click", function () {
    saveRange();
    var sel = window.getSelection();
    var txt = sel.rangeCount ? sel.toString() : "";
    openPopover(this,
      "<h4>Insert link</h4>" +
      '<label>Web address</label><input id="ppUrl" placeholder="https://example.com">' +
      '<label>Text to show</label><input id="ppText" value="' + txt.replace(/"/g, "&quot;") + '">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">Cancel</button><button type="button" class="pbtn go" id="ppGo">Insert</button></div>');
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppGo").addEventListener("click", function () {
      var url = $("#ppUrl").value.trim(), text = $("#ppText").value.trim();
      if (!url) { closePopover(); return; }
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = "https://" + url;
      restoreRange();
      if (window.getSelection().isCollapsed && text) document.execCommand("insertHTML", false, '<a href="' + url.replace(/"/g, "&quot;") + '">' + text.replace(/</g, "&lt;") + "</a>");
      else document.execCommand("createLink", false, url);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });

  /* image */
  $("#btnImage").addEventListener("click", function () {
    saveRange();
    openPopover(this,
      "<h4>Insert image</h4>" +
      '<div class="row"><button type="button" class="pbtn go" id="ppUpload">Upload file</button></div>' +
      '<label>Or paste an image address</label><input id="ppImgUrl" placeholder="https://...">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">Cancel</button><button type="button" class="pbtn go" id="ppGo">Insert</button></div>');
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppUpload").addEventListener("click", function () { closePopover(); $("#imageFile").click(); });
    $("#ppGo").addEventListener("click", function () {
      var url = $("#ppImgUrl").value.trim();
      if (!url) { closePopover(); return; }
      restoreRange();
      document.execCommand("insertImage", false, url);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });
  $("#imageFile").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      restoreRange();
      document.execCommand("insertImage", false, rd.result);
      sheet.focus(); markDirty(); persistCurrent();
    };
    rd.readAsDataURL(f);
    this.value = "";
  });

  /* table */
  $("#btnTable").addEventListener("click", function () {
    saveRange();
    openPopover(this,
      "<h4>Insert table</h4>" +
      '<label>Rows</label><input id="ppRows" type="number" min="1" max="20" value="3">' +
      '<label>Columns</label><input id="ppCols" type="number" min="1" max="10" value="3">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">Cancel</button><button type="button" class="pbtn go" id="ppGo">Insert</button></div>');
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppGo").addEventListener("click", function () {
      var rows = Math.max(1, Math.min(20, parseInt($("#ppRows").value, 10) || 3));
      var cols = Math.max(1, Math.min(10, parseInt($("#ppCols").value, 10) || 3));
      var html = '<table class="txt-table"><tbody>';
      for (var r = 0; r < rows; r++) {
        html += "<tr>";
        for (var c = 0; c < cols; c++) html += "<td><br></td>";
        html += "</tr>";
      }
      html += "</tbody></table><p><br></p>";
      restoreRange();
      document.execCommand("insertHTML", false, html);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });

  /* page break */
  $("#btnPageBreak").addEventListener("click", function () {
    restoreRange();
    document.execCommand("insertHTML", false, '<div class="page-break"></div><p><br></p>');
    sheet.focus(); markDirty(); persistCurrent();
    toast("Page break inserted");
  });

  /* ---------- find and replace ---------- */
  var findbar = $("#findbar"), findInput = $("#findInput"), replaceInput = $("#replaceInput");
  var findMarks = [], findIdx = -1;
  $("#btnFind").addEventListener("click", function () { toggleFind(); });
  function toggleFind(force) {
    var show = force !== undefined ? force : findbar.classList.contains("hidden");
    findbar.classList.toggle("hidden", !show);
    if (show) { findInput.focus(); findInput.select(); runFind(); }
    else clearFind();
  }
  function clearFind() {
    findMarks.forEach(function (m) {
      var t = document.createTextNode(m.textContent);
      m.replaceWith(t);
    });
    findMarks = []; findIdx = -1;
    $("#findCount").textContent = "";
    sheet.normalize();
  }
  function runFind() {
    clearFind();
    var term = findInput.value;
    if (!term) return;
    var walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.toLowerCase().includes(term.toLowerCase())) return NodeFilter.FILTER_REJECT;
        if (n.parentNode && n.parentNode.closest("mark.txt-find")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var low = term.toLowerCase();
    nodes.forEach(function (node) {
      var text = node.nodeValue, start = 0, idx;
      var frag = document.createDocumentFragment();
      var tmp = text;
      var parts = [];
      while ((idx = tmp.toLowerCase().indexOf(low)) >= 0) {
        parts.push({ pre: tmp.slice(0, idx), match: tmp.slice(idx, idx + term.length) });
        tmp = tmp.slice(idx + term.length);
      }
      parts.push({ pre: tmp, match: null });
      parts.forEach(function (p, i) {
        if (p.pre) frag.appendChild(document.createTextNode(p.pre));
        if (p.match) {
          var m = document.createElement("mark");
          m.className = "txt-find"; m.textContent = p.match;
          frag.appendChild(m);
          findMarks.push(m);
        }
      });
      node.replaceWith(frag);
    });
    findIdx = findMarks.length ? 0 : -1;
    paintFind();
  }
  function paintFind() {
    findMarks.forEach(function (m, i) { m.classList.toggle("active", i === findIdx); });
    if (findIdx >= 0) {
      findMarks[findIdx].scrollIntoView({ block: "nearest" });
      $("#findCount").textContent = (findIdx + 1) + " of " + findMarks.length;
    } else {
      $("#findCount").textContent = findInput.value ? "0 found" : "";
    }
  }
  findInput.addEventListener("input", debounce(runFind, 250));
  $("#findNext").addEventListener("click", function () {
    if (!findMarks.length) return;
    findIdx = (findIdx + 1) % findMarks.length; paintFind();
  });
  $("#findPrev").addEventListener("click", function () {
    if (!findMarks.length) return;
    findIdx = (findIdx - 1 + findMarks.length) % findMarks.length; paintFind();
  });
  $("#replaceOne").addEventListener("click", function () {
    if (findIdx < 0) return;
    var m = findMarks[findIdx];
    m.replaceWith(document.createTextNode(replaceInput.value));
    sheet.normalize(); markDirty(); persistCurrent();
    runFindKeep(replaceInput.value ? findIdx : 0);
  });
  function runFindKeep(idx) {
    var term = findInput.value;
    runFind();
    if (findMarks.length) { findIdx = Math.min(idx, findMarks.length - 1); paintFind(); }
  }
  $("#replaceAll").addEventListener("click", function () {
    if (!findMarks.length) return;
    var n = findMarks.length, rep = replaceInput.value;
    findMarks.forEach(function (m) { m.replaceWith(document.createTextNode(rep)); });
    sheet.normalize(); markDirty(); persistCurrent();
    runFind();
    toast(n + " replaced");
  });
  $("#findClose").addEventListener("click", function () { toggleFind(false); sheet.focus(); });

  /* ---------- word count ---------- */
  var wordCount = $("#wordCount"), charCount = $("#charCount");
  function updateCounts() {
    var text = sheet.innerText || "";
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCount.textContent = words + (words === 1 ? " word" : " words");
    charCount.textContent = text.length + (text.length === 1 ? " character" : " characters");
  }
  var updateCountsSoon = debounce(updateCounts, 300);
  sheet.addEventListener("input", function () { markDirty(); persistCurrent(); updateCountsSoon(); });
  sheet.addEventListener("keyup", updateToolbar);
  sheet.addEventListener("click", updateToolbar);
  sheet.addEventListener("paste", function () { setTimeout(function () { updateCounts(); markDirty(); persistCurrent(); }, 50); });

  /* ---------- zoom + page setup ---------- */
  var zoomSel = $("#zoomSel");
  function applyZoom() {
    var z = settings.zoom;
    sheet.style.transform = "scale(" + z + ")";
    zoomWrap.style.height = Math.ceil(sheet.offsetHeight * z) + "px";
    zoomWrap.style.width = Math.ceil(sheet.offsetWidth * z) + "px";
    zoomSel.value = String(z);
  }
  zoomSel.addEventListener("change", function () {
    settings.zoom = parseFloat(zoomSel.value); persistSettings(); applyZoom();
  });
  $("#zoomIn").addEventListener("click", function () {
    var steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var i = steps.indexOf(settings.zoom);
    if (i < steps.length - 1) { settings.zoom = steps[i + 1]; persistSettings(); applyZoom(); }
  });
  $("#zoomOut").addEventListener("click", function () {
    var steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var i = steps.indexOf(settings.zoom);
    if (i > 0) { settings.zoom = steps[i - 1]; persistSettings(); applyZoom(); }
  });
  function applyPageSetup() {
    var p = PAPERS[settings.paper] || PAPERS.a4;
    var m = MARGINS[settings.margin] || MARGINS.normal;
    sheet.style.width = p[0] + "mm";
    sheet.style.minHeight = p[1] + "mm";
    sheet.style.padding = m + "mm";
    applyZoom();
  }
  $("#btnPageSetup").addEventListener("click", function () {
    openPopover(this,
      "<h4>Page setup</h4>" +
      '<label>Paper size</label><select id="ppPaper"><option value="a4">A4</option><option value="letter">Letter</option></select>' +
      '<label>Margins</label><select id="ppMargin"><option value="narrow">Narrow</option><option value="normal">Normal</option><option value="wide">Wide</option></select>' +
      '<div class="row"><button type="button" class="pbtn go" id="ppGo">Apply</button></div>');
    $("#ppPaper").value = settings.paper;
    $("#ppMargin").value = settings.margin;
    $("#ppGo").addEventListener("click", function () {
      settings.paper = $("#ppPaper").value;
      settings.margin = $("#ppMargin").value;
      persistSettings(); applyPageSetup(); closePopover();
      toast("Page setup applied");
    });
  });

  /* ---------- top bar: new / open / export ---------- */
  $("#btnNew").addEventListener("click", newDoc);
  $("#btnNewSide").addEventListener("click", newDoc);
  docName.addEventListener("input", function () {
    var d = getDoc();
    if (d) { d.name = docName.value.trim() || "Untitled document"; persistCurrent(); renderDocList(); }
  });
  $("#btnImport").addEventListener("click", function () { $("#importFile").click(); });
  $("#importFile").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var ext = f.name.split(".").pop().toLowerCase();
    var rd = new FileReader();
    rd.onload = function () {
      var html = "";
      if (ext === "md" || ext === "markdown") html = TXTConvert.markdownToHtml(String(rd.result));
      else if (ext === "html" || ext === "htm") html = TXTConvert.sanitizeHtml(String(rd.result));
      else html = "<p>" + TXTConvert.escHtml(String(rd.result)).replace(/\n/g, "<br>") + "</p>";
      persistNow();
      var d = { id: uid(), name: f.name.replace(/\.[^.]+$/, ""), updatedAt: Date.now(), html: html };
      docs.unshift(d);
      currentId = d.id;
      sheet.innerHTML = html;
      docName.value = d.name;
      persistDocs(); renderDocList(); updateCounts();
      toast("Opened " + f.name);
    };
    rd.readAsText(f);
    this.value = "";
  });

  $("#btnExport").addEventListener("click", function (e) {
    e.stopPropagation();
    $("#exportMenu").classList.toggle("hidden");
  });
  $$("#exportMenu [data-export]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $("#exportMenu").classList.add("hidden");
      doExport(btn.getAttribute("data-export"));
    });
  });

  function doExport(fmt) {
    persistNow();
    var model = TXTConvert.domToModel(sheet);
    var name = safeName(docName.value);
    if (fmt === "pdf") { window.print(); return; }
    if (fmt === "txt") { saveBlob(new Blob([TXTConvert.modelToText(model)], { type: "text/plain;charset=utf-8" }), name + ".txt"); }
    else if (fmt === "md") { saveBlob(new Blob([TXTConvert.modelToMarkdown(model)], { type: "text/markdown;charset=utf-8" }), name + ".md"); }
    else if (fmt === "html") { saveBlob(new Blob([TXTConvert.modelToHtmlDoc(model, name)], { type: "text/html;charset=utf-8" }), name + ".html"); }
    else if (fmt === "rtf") { saveBlob(new Blob([TXTConvert.modelToRtf(model)], { type: "application/rtf;charset=utf-8" }), name + ".rtf"); }
    else if (fmt === "doc") { saveBlob(new Blob([TXTConvert.modelToWordHtml(model, name)], { type: "application/msword;charset=utf-8" }), name + ".doc"); }
    else if (fmt === "odt") { saveBlob(new Blob([TXTConvert.modelToOdt(model, name)], { type: "application/vnd.oasis.opendocument.text" }), name + ".odt"); }
    else if (fmt === "docx") {
      toast("Building DOCX...");
      TXTDocx.buildBlob(model, name).then(function (blob) {
        saveBlob(blob, name + ".docx");
        toast("DOCX downloaded");
      }).catch(function (err) {
        toast("DOCX failed: " + err.message);
      });
      return;
    }
    toast("Downloaded " + name + "." + fmt);
  }

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); toggleFind(true); }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); persistNow(); toast("Saved"); }
  });
  window.addEventListener("beforeunload", persistNow);
  window.addEventListener("resize", debounce(applyZoom, 200));

  /* ---------- init ---------- */
  document.execCommand("styleWithCSS", false, true);
  loadState();
  var d0 = getDoc();
  sheet.innerHTML = (d0 && d0.html) || "";
  docName.value = (d0 && d0.name) || "Untitled document";
  renderDocList();
  applyPageSetup();
  updateCounts();
  markSaved();
})();
