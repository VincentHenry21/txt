/* TXT word.js: advanced Word features (ribbon panels). Uses window.TXTApp (set by js/app.js). */
(function () {
  "use strict";
  function A() { return window.TXTApp; }
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
  function ready(fn) {
    if (window.TXTApp) fn();
    else document.addEventListener("DOMContentLoaded", function () { setTimeout(fn, 0); });
  }

  ready(function () {
    var T = A();
    var $ = T.$, $$ = T.$$;

    /* ---------- paragraph spacing in points ---------- */
    on("btnParaSpacing", function () {
      T.saveRange();
      var b = T.currentBlock();
      var st = (b && b.style) || {};
      var before = (String(st.marginTop || "").match(/([\d.]+)/) || [])[1] || "0";
      var after = (String(st.marginBottom || "").match(/([\d.]+)/) || [])[1] || "8";
      var lh = String(st.lineHeight || "");
      var rule = "single", val = "";
      if (lh === "1.15") rule = "115";
      else if (lh === "1.5") rule = "15";
      else if (lh === "2") rule = "double";
      else if (/pt-min$/.test(lh)) { rule = "atleast"; val = lh.replace("pt-min", ""); }
      else if (/pt$/.test(lh)) { rule = "exactly"; val = lh.replace("pt", ""); }
      else if (lh && !isNaN(parseFloat(lh))) { rule = "multiple"; val = lh; }
      T.openPopover(this,
        "<h4>" + T.t("paraSpacing") + "</h4>" +
        '<label>' + T.t("before") + " (" + T.t("points") + ")</label>" + '<input id="ppBefore" type="number" min="0" max="200" value="' + before + '">' +
        '<label>' + T.t("after") + " (" + T.t("points") + ")</label>" + '<input id="ppAfter" type="number" min="0" max="200" value="' + after + '">' +
        '<label>' + T.t("lineRule") + "</label>" +
        '<select id="ppLineRule"><option value="single">' + T.t("lsSingle") + '</option><option value="115">1.15</option><option value="15">' + T.t("ls15") + '</option><option value="double">' + T.t("lsDouble") + '</option><option value="atleast">' + T.t("lsAtLeast") + '</option><option value="exactly">' + T.t("lsExactly") + '</option><option value="multiple">' + T.t("lsMultiple") + "</option></select>" +
        '<label>' + T.t("points") + " / " + T.t("lsMultiple") + "</label>" + '<input id="ppLineVal" type="number" min="0" step="0.5" value="' + val + '">' +
        '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + T.t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + T.t("apply") + "</button></div>");
      $("#ppLineRule").value = rule;
      $("#ppCancel").addEventListener("click", T.closePopover);
      $("#ppGo").addEventListener("click", function () {
        if (!T.restoreRange()) { T.closePopover(); return; }
        var bf = Math.max(0, parseFloat($("#ppBefore").value) || 0);
        var af = Math.max(0, parseFloat($("#ppAfter").value) || 0);
        var lr = $("#ppLineRule").value, lv = parseFloat($("#ppLineVal").value) || 0;
        var blocks = T.blocksInSelection();
        (blocks.length ? blocks : [T.currentBlock()]).forEach(function (bl) {
          if (!bl) return;
          bl.style.marginTop = bf + "pt";
          bl.style.marginBottom = af + "pt";
          delete bl.dataset.lineRule;
          if (lr === "single") bl.style.lineHeight = "";
          else if (lr === "115") bl.style.lineHeight = "1.15";
          else if (lr === "15") bl.style.lineHeight = "1.5";
          else if (lr === "double") bl.style.lineHeight = "2";
          else if (lr === "atleast" && lv > 0) { bl.style.lineHeight = lv + "pt"; bl.dataset.lineRule = "atleast"; }
          else if (lr === "exactly" && lv > 0) { bl.style.lineHeight = lv + "pt"; bl.dataset.lineRule = "exactly"; }
          else if (lr === "multiple" && lv > 0) bl.style.lineHeight = String(lv);
        });
        T.closePopover(); T.sheet().focus(); T.markDirty(); T.persistCurrent();
      });
    });

    /* ---------- shading + borders ---------- */
    var SHADES = ["#ffffff", "#f8fafc", "#fef3c7", "#dbeafe", "#dcfce7", "#fee2e2", "#f3e8ff", "#e0e7ff", "#4f46e5", "#1d2330", "none"];
    on("btnShading", function () {
      T.saveRange();
      var sw = SHADES.map(function (c) {
        var bg = c === "none" ? "repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/12px 12px" : c;
        return '<button type="button" class="swatch" data-c="' + c + '" style="background:' + bg + '" title="' + c + '"></button>';
      }).join("");
      T.openPopover(this, "<h4>" + T.t("shading") + '</h4><div class="swatches">' + sw + "</div>");
      $$("#popover .swatch").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!T.restoreRange()) { T.closePopover(); return; }
          var c = b.getAttribute("data-c");
          var blocks = T.blocksInSelection();
          (blocks.length ? blocks : [T.currentBlock()]).forEach(function (bl) {
            if (bl) bl.style.backgroundColor = c === "none" ? "" : c;
          });
          T.closePopover(); T.sheet().focus(); T.markDirty(); T.persistCurrent();
        });
      });
    });
    on("btnBorders", function () {
      T.saveRange();
      T.openPopover(this,
        "<h4>" + T.t("borders") + "</h4>" +
        '<div class="row" style="justify-content:flex-start;flex-direction:column;align-items:stretch">' +
        '<button type="button" class="pbtn" data-b="none">' + T.t("close") + ": none</button>" +
        '<button type="button" class="pbtn" data-b="bottom">Bottom border</button>' +
        '<button type="button" class="pbtn" data-b="box">Box border</button></div>');
      $$("#popover [data-b]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!T.restoreRange()) { T.closePopover(); return; }
          var kind = b.getAttribute("data-b");
          var blocks = T.blocksInSelection();
          (blocks.length ? blocks : [T.currentBlock()]).forEach(function (bl) {
            if (!bl) return;
            bl.style.border = ""; bl.style.borderBottom = "";
            if (kind === "bottom") bl.style.borderBottom = "1pt solid #999999";
            else if (kind === "box") bl.style.border = "1pt solid #999999";
          });
          T.closePopover(); T.sheet().focus(); T.markDirty(); T.persistCurrent();
        });
      });
    });

    /* ---------- grow / shrink font ---------- */
    function curFontPx() {
      var sheet = T.sheet(), sel = window.getSelection();
      var n = sel.rangeCount ? sel.anchorNode : null;
      if (n && n.nodeType === 3) n = n.parentNode;
      while (n && n !== sheet) {
        if (n.style && n.style.fontSize) {
          var m = String(n.style.fontSize).match(/([\d.]+)px/);
          if (m) return parseFloat(m[1]);
        }
        n = n.parentNode;
      }
      return 15;
    }
    function stepFont(delta) {
      var sheet = T.sheet();
      if (!T.restoreRange()) return;
      var sel = window.getSelection();
      var next = Math.max(6, Math.min(200, curFontPx() + delta));
      document.execCommand("styleWithCSS", false, true);
      if (sel.isCollapsed) {
        var sp = document.createElement("span");
        sp.style.fontSize = next + "px";
        sp.innerHTML = "&#8203;";
        var r = sel.getRangeAt(0);
        r.insertNode(sp);
        r.setStart(sp.firstChild, 1); r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
      } else {
        document.execCommand("fontSize", false, "7");
        var guard = 0, f;
        while ((f = sheet.querySelector('font[size="7"]')) && guard++ < 60) {
          var s = document.createElement("span");
          s.style.fontSize = next + "px";
          s.innerHTML = f.innerHTML;
          f.replaceWith(s);
        }
      }
      sheet.focus(); T.updateToolbar(); T.markDirty(); T.persistCurrent();
    }
    on("btnGrow", function () { stepFont(2); });
    on("btnShrink", function () { stepFont(-2); });

    /* ---------- multilevel list ---------- */
    on("btnMultiLevel", function () {
      T.restoreRange();
      document.execCommand("insertHTML", false,
        '<ol class="multi"><li>First level item<ol><li>Second level item<ol><li>Third level item</li></ol></li></ol></li><li>Another first level item</li></ol><p><br></p>');
      T.sheet().focus(); T.markDirty(); T.persistCurrent();
    });

    /* ---------- paste plain + select all ---------- */
    on("btnPastePlain", function () {
      T.restoreRange();
      var done = function (txt) {
        if (txt) document.execCommand("insertText", false, txt);
        T.sheet().focus(); T.markDirty(); T.persistCurrent();
      };
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(done).catch(function () { T.toast(T.t("pastePlain")); });
      } else { T.toast(T.t("pastePlain")); }
    });
    on("btnSelectAll", function () {
      T.sheet().focus();
      document.execCommand("selectAll", false, null);
    });

    /* ---------- show / hide marks ---------- */
    on("btnMarks", function () {
      document.body.classList.toggle("show-marks");
      this.classList.toggle("active", document.body.classList.contains("show-marks"));
      T.sheet().focus();
    });

    /* ---------- header / footer ---------- */
    function toggleZone(which) {
      var d = T.getDoc();
      var el = which === "header" ? T.docHeader() : T.docFooter();
      if (which === "header") d.headerOn = !d.headerOn;
      else d.footerOn = !d.footerOn;
      var isOn = which === "header" ? d.headerOn : d.footerOn;
      el.classList.toggle("hidden", !isOn);
      T.markDirty(); T.persistNow();
      T.toast(T.t(which === "header" ? (isOn ? "headerOn" : "headerOff") : (isOn ? "footerOn" : "footerOff")));
      if (isOn) el.focus();
    }
    on("btnHeader", function () { toggleZone("header"); });
    on("btnFooter", function () { toggleZone("footer"); });
    on("btnPageNum", function () {
      T.restoreRange();
      document.execCommand("insertHTML", false, '<span class="pagenum" contenteditable="false">#</span>&nbsp;');
      T.sheet().focus(); T.markDirty(); T.persistCurrent();
    });

    /* ---------- date / time ---------- */
    on("btnDate", function () {
      T.saveRange();
      var now = new Date();
      var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      function pad(n) { return (n < 10 ? "0" : "") + n; }
      var d = now.getDate(), m = now.getMonth(), y = now.getFullYear();
      var h = now.getHours(), ap = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
      var fmts = [
        months[m] + " " + d + ", " + y,
        d + " " + months[m] + " " + y,
        y + "-" + pad(m + 1) + "-" + pad(d),
        pad(m + 1) + "/" + pad(d) + "/" + y,
        h12 + ":" + pad(now.getMinutes()) + " " + ap,
        months[m] + " " + d + ", " + y + " " + h12 + ":" + pad(now.getMinutes()) + " " + ap
      ];
      T.openPopover(this, "<h4>" + T.t("insertDate") + "</h4>" +
        '<div style="display:flex;flex-direction:column;gap:4px">' +
        fmts.map(function (f) { return '<button type="button" class="pbtn" data-f="' + f + '" style="text-align:left">' + f + "</button>"; }).join("") +
        "</div>");
      $$("#popover [data-f]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!T.restoreRange()) { T.closePopover(); return; }
          document.execCommand("insertText", false, b.getAttribute("data-f"));
          T.closePopover(); T.sheet().focus(); T.markDirty(); T.persistCurrent();
          T.toast(T.t("dateInserted"));
        });
      });
    });

    /* ---------- symbols ---------- */
    var SYMBOLS = ["©", "®", "™", "€", "£", "¥", "§", "¶", "±", "×", "÷", "°", "½", "¼", "¾",
      "←", "→", "↑", "↓", "•", "…", "–", "—", "“", "”", "‘", "’",
      "✓", "✔", "★", "☆", "♥", "♦", "♣", "♠", "⇒", "⇐", "≈", "≠", "≤", "≥", "∞", "α", "β", "π", "Ω"];
    on("btnSymbol", function () {
      T.saveRange();
      T.openPopover(this, "<h4>" + T.t("insertSymbol") + '</h4><div class="symbol-grid">' +
        SYMBOLS.map(function (s) { return '<button type="button" data-s="' + s + '">' + s + "</button>"; }).join("") +
        "</div>");
      $$("#popover [data-s]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!T.restoreRange()) { T.closePopover(); return; }
          document.execCommand("insertText", false, b.getAttribute("data-s"));
          T.sheet().focus(); T.markDirty(); T.persistCurrent();
        });
      });
    });

    /* ---------- drop cap ---------- */
    on("btnDropCap", function () {
      if (!T.restoreRange()) return;
      var b = T.currentBlock();
      if (!b) return;
      var ex = b.querySelector("span.dropcap");
      if (ex) {
        ex.replaceWith(document.createTextNode(ex.textContent));
      } else {
        var walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        var tn = walker.nextNode();
        while (tn && !tn.nodeValue.trim()) tn = walker.nextNode();
        if (tn && tn.nodeValue.trim()) {
          var txt = tn.nodeValue, i = 0;
          while (i < txt.length && /\s/.test(txt[i])) i++;
          if (i < txt.length) {
            var sp = document.createElement("span");
            sp.className = "dropcap";
            sp.textContent = txt[i];
            var rest = document.createTextNode(txt.slice(0, i) + txt.slice(i + 1));
            tn.replaceWith(rest);
            rest.parentNode.insertBefore(sp, rest);
          }
        }
      }
      T.sheet().focus(); T.markDirty(); T.persistCurrent();
    });

    /* ---------- comments ---------- */
    on("btnComment", function () {
      T.saveRange();
      var sel = window.getSelection();
      var txt = sel.rangeCount ? sel.toString().trim() : "";
      if (!txt) { T.toast(T.t("selectAll")); return; }
      T.openPopover(this,
        "<h4>" + T.t("insertComment") + "</h4>" +
        '<label>' + T.t("commentText") + '</label><input id="ppComment" maxlength="500">' +
        '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + T.t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + T.t("addComment") + "</button></div>");
      $("#ppCancel").addEventListener("click", T.closePopover);
      $("#ppGo").addEventListener("click", function () {
        var text = $("#ppComment").value.trim();
        if (!text) { T.closePopover(); return; }
        if (!T.restoreRange()) { T.closePopover(); return; }
        var cid = T.uid();
        var prof = T.getProfile();
        var d = T.getDoc();
        d.comments.push({ cid: cid, quote: txt.slice(0, 200), text: text, author: prof ? prof.name : T.t("guest"), ts: Date.now(), done: false });
        document.execCommand("insertHTML", false, '<span class="cmt" data-cid="' + cid + '">' + T.escAttr(txt) + "</span>");
        T.closePopover(); T.sheet().focus(); T.markDirty(); T.persistCurrent();
        T.renderComments();
        T.toast(T.t("commentAdded"));
      });
    });
    on("btnCommentsPane", function () {
      var p = document.getElementById("commentsPane");
      p.classList.toggle("hidden");
      if (!p.classList.contains("hidden")) T.renderComments();
    });

    /* ---------- watermark ---------- */
    var WM_PRESETS = ["DRAFT", "CONFIDENTIAL", "DO NOT COPY", "URGENT", "SAMPLE"];
    on("btnWatermark", function () {
      var d = T.getDoc();
      var wm = d.watermark || { text: "", style: "diagonal", size: 72, opacity: 0.18 };
      T.openPopover(this,
        "<h4>" + T.t("watermark") + "</h4>" +
        '<label>' + T.t("wmPresets") + "</label>" +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
        WM_PRESETS.map(function (p) { return '<button type="button" class="pbtn" data-wm="' + p + '" style="font-size:11px;padding:6px 10px">' + p + "</button>"; }).join("") +
        "</div>" +
        '<label>' + T.t("watermarkText") + '</label><input id="ppWmText" maxlength="40" value="' + T.escAttr(wm.text) + '">' +
        '<label>' + T.t("watermarkStyle") + '</label><select id="ppWmStyle"><option value="diagonal">' + T.t("diagonal") + '</option><option value="horizontal">' + T.t("horizontal") + "</option></select>" +
        '<label>' + T.t("wmSize") + " (px)</label>" + '<input id="ppWmSize" type="number" min="24" max="200" value="' + (wm.size || 72) + '">' +
        '<label>' + T.t("wmOpacity") + " (%)</label>" + '<input id="ppWmOp" type="number" min="5" max="60" value="' + Math.round((wm.opacity != null ? wm.opacity : 0.18) * 100) + '">' +
        '<div class="row"><button type="button" class="pbtn" id="ppWmRemove">' + T.t("remove") + '</button><button type="button" class="pbtn go" id="ppGo">' + T.t("apply") + "</button></div>");
      $("#ppWmStyle").value = wm.style || "diagonal";
      $$("#popover [data-wm]").forEach(function (b) {
        b.addEventListener("click", function () { $("#ppWmText").value = b.getAttribute("data-wm"); });
      });
      $("#ppWmRemove").addEventListener("click", function () {
        d.watermark = null;
        T.closePopover(); T.renderWatermark(); T.markDirty(); T.persistNow();
      });
      $("#ppGo").addEventListener("click", function () {
        var txt = $("#ppWmText").value.trim();
        if (!txt) { d.watermark = null; }
        else {
          d.watermark = {
            text: txt,
            style: $("#ppWmStyle").value,
            size: Math.max(24, Math.min(200, parseInt($("#ppWmSize").value, 10) || 72)),
            opacity: Math.max(5, Math.min(60, parseInt($("#ppWmOp").value, 10) || 18)) / 100,
            color: "#9aa0b4"
          };
        }
        T.closePopover(); T.renderWatermark(); T.markDirty(); T.persistNow();
      });
    });

    /* ---------- table tools ---------- */
    function curTable() {
      var sel = window.getSelection();
      if (!sel.rangeCount) return null;
      var n = sel.anchorNode;
      if (n.nodeType === 3) n = n.parentNode;
      return n.closest ? n.closest("table") : null;
    }
    function curCell() {
      var sel = window.getSelection();
      if (!sel.rangeCount) return null;
      var n = sel.anchorNode;
      if (n.nodeType === 3) n = n.parentNode;
      return n.closest ? n.closest("td,th") : null;
    }
    function emptyRow(n) {
      var tr = document.createElement("tr");
      for (var i = 0; i < n; i++) { var td = document.createElement("td"); td.innerHTML = "<br>"; tr.appendChild(td); }
      return tr;
    }
    function needTable() { var tb = curTable(); if (!tb) T.toast(T.t("needTable")); return tb; }
    on("btnRowAbove", function () {
      var tb = needTable(); if (!tb) return;
      var cell = curCell(), tr = cell ? cell.parentNode : tb.querySelector("tr");
      tr.parentNode.insertBefore(emptyRow(tr.children.length), tr);
      T.markDirty(); T.persistCurrent();
    });
    on("btnRowBelow", function () {
      var tb = needTable(); if (!tb) return;
      var cell = curCell(), tr = cell ? cell.parentNode : tb.querySelector("tr");
      tr.parentNode.insertBefore(emptyRow(tr.children.length), tr.nextSibling);
      T.markDirty(); T.persistCurrent();
    });
    on("btnColLeft", function () {
      var tb = needTable(); if (!tb) return;
      var cell = curCell(), idx = cell ? cell.cellIndex : 0;
      $$("tr", tb).forEach(function (tr) {
        var td = document.createElement("td"); td.innerHTML = "<br>";
        tr.insertBefore(td, tr.children[idx] || null);
      });
      T.markDirty(); T.persistCurrent();
    });
    on("btnColRight", function () {
      var tb = needTable(); if (!tb) return;
      var cell = curCell(), idx = cell ? cell.cellIndex + 1 : 1;
      $$("tr", tb).forEach(function (tr) {
        var td = document.createElement("td"); td.innerHTML = "<br>";
        tr.insertBefore(td, tr.children[idx] || null);
      });
      T.markDirty(); T.persistCurrent();
    });
    on("btnDelRow", function () {
      var tb = needTable(); if (!tb) return;
      var cell = curCell();
      if (cell) cell.parentNode.remove();
      T.markDirty(); T.persistCurrent();
    });
    on("btnDelCol", function () {
      var tb = needTable(); if (!tb) return;
      var cell = curCell(), idx = cell ? cell.cellIndex : 0;
      $$("tr", tb).forEach(function (tr) { if (tr.children[idx]) tr.children[idx].remove(); });
      T.markDirty(); T.persistCurrent();
    });
    on("btnDelTable", function () {
      var tb = needTable(); if (!tb) return;
      tb.remove();
      T.markDirty(); T.persistCurrent();
    });

    /* ---------- table of contents ---------- */
    function tocEntries() {
      var sheet = T.sheet();
      return $$("h1,h2,h3", sheet).map(function (h) {
        if (!h.id) h.id = "h" + T.uid();
        return { id: h.id, text: h.textContent.trim().slice(0, 80), level: parseInt(h.tagName[1], 10) };
      }).filter(function (e) { return e.text; });
    }
    function tocHtml() {
      return tocEntries().map(function (e) {
        return '<p class="toc-entry" style="padding-left:' + ((e.level - 1) * 18) + 'px"><a href="#' + e.id + '">' +
          T.escAttr(e.text) + "</a></p>";
      }).join("");
    }
    function updateToc() {
      var toc = T.sheet().querySelector(".toc");
      if (!toc) return false;
      var box = toc.querySelector(".toc-entries");
      if (box) box.innerHTML = tocHtml();
      T.markDirty(); T.persistCurrent();
      return true;
    }
    on("btnToc", function () {
      if (updateToc()) { T.toast(T.t("tocUpdated")); return; }
      T.restoreRange();
      document.execCommand("insertHTML", false,
        '<div class="toc" contenteditable="false"><h2>' + T.t("tocTitle") + '</h2><div class="toc-entries">' +
        tocHtml() + "</div></div><p><br></p>");
      T.sheet().focus(); T.markDirty(); T.persistCurrent();
      T.toast(T.t("tocInserted"));
    });
    on("btnTocUpdate", function () {
      if (updateToc()) T.toast(T.t("tocUpdated"));
    });

    /* ---------- word count dialog ---------- */
    function wordCountDialog() {
      var sheet = T.sheet();
      var text = sheet.innerText || "";
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      var paras = $$("p,h1,h2,h3,li,blockquote", sheet).length;
      T.openPopover(document.getElementById("btnWordCount") || document.body,
        "<h4>" + T.t("wcTitle") + "</h4>" +
        '<div class="kv"><span>' + T.t("wordCount") + "</span><b>" + words + "</b></div>" +
        '<div class="kv"><span>' + T.t("characters") + "</span><b>" + text.length + "</b></div>" +
        '<div class="kv"><span>' + T.t("charsNoSpaces") + "</span><b>" + text.replace(/\s/g, "").length + "</b></div>" +
        '<div class="kv"><span>' + T.t("paragraphs") + "</span><b>" + paras + "</b></div>" +
        '<div class="row"><button type="button" class="pbtn go" id="ppCancel">' + T.t("close") + "</button></div>");
      $("#ppCancel").addEventListener("click", T.closePopover);
    }
    on("btnWordCount", wordCountDialog);
    on("btnFileCount", wordCountDialog);

    /* ---------- orientation + columns ---------- */
    on("btnOrient", function () {
      var d = T.getDoc();
      d.orient = d.orient === "landscape" ? "portrait" : "landscape";
      T.applyPageSetup(); T.markDirty(); T.persistNow();
    });
    function setCols(n) {
      var d = T.getDoc();
      d.columns = n;
      T.applyPageSetup(); T.markDirty(); T.persistNow();
    }
    on("btnCols1", function () { setCols(1); });
    on("btnCols2", function () { setCols(2); });
    on("btnCols3", function () { setCols(3); });

    /* ---------- page setup dialog ---------- */
    on("btnPageSetup", function () {
      var d = T.getDoc();
      T.openPopover(this,
        "<h4>" + T.t("pageSetup") + "</h4>" +
        '<label>' + T.t("paperSize") + '</label><select id="ppPaper"><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="a5">A5</option></select>' +
        '<label>' + T.t("margins") + '</label><select id="ppMargin"><option value="narrow">' + T.t("narrow") + '</option><option value="normal">' + T.t("normalMargin") + '</option><option value="wide">' + T.t("wide") + "</option></select>" +
        '<label>' + T.t("orientation") + '</label><select id="ppOrient"><option value="portrait">' + T.t("portrait") + '</option><option value="landscape">' + T.t("landscape") + "</option></select>" +
        '<label style="display:flex;align-items:center;gap:8px;margin-top:12px"><input type="checkbox" id="ppDiffFirst" style="width:auto">' + T.t("diffFirst") + "</label>" +
        '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + T.t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + T.t("apply") + "</button></div>");
      $("#ppPaper").value = d.paper || "a4";
      $("#ppMargin").value = d.margin || "normal";
      $("#ppOrient").value = d.orient || "portrait";
      $("#ppDiffFirst").checked = !!d.diffFirst;
      $("#ppCancel").addEventListener("click", T.closePopover);
      $("#ppGo").addEventListener("click", function () {
        d.paper = $("#ppPaper").value;
        d.margin = $("#ppMargin").value;
        d.orient = $("#ppOrient").value;
        d.diffFirst = $("#ppDiffFirst").checked;
        T.applyPageSetup(); T.markDirty(); T.persistNow(); T.closePopover();
        T.toast(T.t("apply"));
      });
    });

    /* ---------- outline pane ---------- */
    on("btnOutline", function () {
      var p = document.getElementById("outlinePane");
      p.classList.toggle("hidden");
      this.classList.toggle("active", !p.classList.contains("hidden"));
      if (!p.classList.contains("hidden")) T.renderOutline();
    });

    /* ---------- file panel ---------- */
    on("btnFileNew", function () { T.newDoc(); });
    on("btnFileOpen", function () { T.openFilePicker(); });
    on("btnFilePrint", function () { T.printDoc(); });
    on("btnFileFonts", function () { T.exportFonts(); });
    on("btnLang2", function () { T.toggleLang(); });
  });
})();
