/* TXT track changes engine: intercepts beforeinput on the sheet when enabled,
   wrapping typed text in <ins class="tracked-insert"> and deleted text in
   <del class="tracked-delete"> instead of removing it.
   Exposes window.TXT.changes per ARCHITECTURE.md section 9. */

(function () {
  "use strict";
  var T = window.TXT;
  var $$ = T.$$;

  /* ----- state ----- */
  function authorName() { return T.state.prefs.authorName || "You"; }
  function isOn() { return !!T.state.prefs.trackChanges; }

  function set(b) {
    T.state.prefs.trackChanges = !!b;
    T.savePrefs();
    T.bus.emit("changes:update", { on: !!b });
    T.toast(T.t(b ? "trackOn" : "trackOff"));
  }
  function toggle() { set(!isOn()); }

  /* ----- beforeinput interception (sheet is recreated per doc) ----- */
  var boundSheet = null;

  function attach() {
    var sheet = (T.editor && T.editor.sheetEl) ? T.editor.sheetEl() : null;
    if (!sheet || sheet === boundSheet) return;
    if (boundSheet) boundSheet.removeEventListener("beforeinput", onBeforeInput);
    boundSheet = sheet;
    sheet.addEventListener("beforeinput", onBeforeInput);
  }
  T.bus.on("doc:open", attach);

  function inSheet(r) {
    var sheet = T.editor.sheetEl();
    if (!sheet || !r) return false;
    var n = r.commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    return n === sheet || sheet.contains(n);
  }

  var DELETE_TYPES = {
    deleteContentBackward: "backward",
    deleteContentForward: "forward",
    deleteWordBackward: "backward",
    deleteWordForward: "forward"
  };

  function onBeforeInput(e) {
    if (!isOn()) return;
    if (e.inputType === "insertText") { handleInsert(e); return; }
    var dir = DELETE_TYPES[e.inputType];
    if (dir) handleDelete(e, dir, e.inputType.indexOf("Word") >= 0);
  }

  function authorTitle() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return authorName() + " - " + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function makeIns() {
    var ins = document.createElement("ins");
    ins.className = "tracked-insert";
    ins.setAttribute("data-author", authorName());
    ins.setAttribute("data-ts", String(Date.now()));
    ins.setAttribute("title", authorTitle());
    return ins;
  }
  function makeDel() {
    var del = document.createElement("del");
    del.className = "tracked-delete";
    del.setAttribute("data-author", authorName());
    del.setAttribute("data-ts", String(Date.now()));
    del.setAttribute("title", authorTitle());
    return del;
  }

  function handleInsert(e) {
    if (!e.data || e.isComposing) return; // IME: let native handle composition
    var r = T.sel.range();
    if (!r || !inSheet(r)) return;
    e.preventDefault();
    r = r.cloneRange();
    if (!r.collapsed) {
      // selected text becomes a tracked deletion first
      var frag = r.extractContents();
      if (frag.textContent || frag.querySelector("img,table,hr")) {
        var del0 = makeDel();
        del0.appendChild(frag);
        r.insertNode(del0);
        r.setStartAfter(del0);
      }
      r.collapse(true);
    }
    // merge with previous insertion by same author within a short burst
    var caretNode = r.startContainer, prev = null;
    if (caretNode.nodeType === 3) prev = caretNode.parentNode;
    else prev = caretNode.childNodes[r.startOffset - 1] || null;
    function caretAtEndOf(el) {
      var sc = r.startContainer, so = r.startOffset;
      var last = el.lastChild;
      if (last && last.nodeType === 3 && sc === last && so === last.nodeValue.length) return true;
      if (sc.nodeType === 1 && so > 0 && sc.childNodes[so - 1] === el) return true;
      return false;
    }
    if (prev && prev.nodeType === 1 && prev.classList.contains("tracked-insert") &&
        prev.getAttribute("data-author") === authorName() &&
        (Date.now() - (+(prev.getAttribute("data-ts") || 0))) < 4000 &&
        caretAtEndOf(prev)) {
      // caret is right at the end of the previous ins: append
      prev.textContent += e.data;
      prev.setAttribute("data-ts", String(Date.now()));
      prev.setAttribute("title", authorTitle());
      placeCaretAfter(prev);
    } else {
      var ins = makeIns();
      ins.textContent = e.data;
      r.insertNode(ins);
      placeCaretAfter(ins);
    }
    T.editor.markDirty();
    T.bus.emit("doc:change");
  }

  function placeCaretAfter(node) {
    var s = window.getSelection();
    s.removeAllRanges();
    var cr = document.createRange();
    cr.setStartAfter(node);
    cr.collapse(true);
    s.addRange(cr);
  }

  /* ----- deterministic deletion range (no Selection.modify) ----- */
  function textNodesOf(root) {
    var out = [];
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = tw.nextNode())) out.push(n);
    return out;
  }
  function insideTrackedDel(n) {
    var p = n.parentNode;
    while (p) {
      if (p.nodeType === 1 && p.classList && p.classList.contains("tracked-delete")) return true;
      p = p.parentNode;
    }
    return false;
  }
  // Live (not yet deleted) non-empty text nodes under n. A TreeWalker never
  // yields its own root, so a bare text-node child is included by hand;
  // without that, caretTextNode misses plain text at element boundaries.
  // Text already wrapped in del.tracked-delete is skipped: it is deleted
  // already and must not be deleted a second time.
  function liveTexts(n) {
    if (n.nodeType === 3) {
      return (n.nodeValue.length && !insideTrackedDel(n)) ? [n] : [];
    }
    var out = [];
    var t;
    var tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    while ((t = tw.nextNode())) {
      if (t.nodeValue.length && !insideTrackedDel(t)) out.push(t);
    }
    return out;
  }
  function prevText(tn, sheet) {
    var all = textNodesOf(sheet), i = all.indexOf(tn);
    for (var k = i - 1; k >= 0; k--) if (all[k].nodeValue.length) return all[k];
    return null;
  }
  function nextText(tn, sheet) {
    var all = textNodesOf(sheet), i = all.indexOf(tn);
    for (var k = i + 1; k < all.length; k++) if (all[k].nodeValue.length) return all[k];
    return null;
  }
  // normalize caret (container, offset) to a text node + offset
  function caretTextNode(sc, so, dir, sheet) {
    if (sc.nodeType === 3) return { node: sc, offset: Math.min(so, sc.nodeValue.length) };
    var kids = sc.childNodes, i, t;
    if (dir === "backward") {
      for (i = Math.min(so, kids.length) - 1; i >= 0; i--) {
        t = liveTexts(kids[i]);
        if (t.length) { var last = t[t.length - 1]; return { node: last, offset: last.nodeValue.length }; }
      }
      return null; // block boundary: leave it to the native engine
    }
    for (i = Math.max(so, 0); i < kids.length; i++) {
      t = liveTexts(kids[i]);
      if (t.length) return { node: t[0], offset: 0 };
    }
    return null; // block boundary: leave it to the native engine
  }

  function wordEdge(text, off, dir) {
    if (dir === "backward") {
      var left = text.slice(0, off);
      var m = left.match(/(\S+\s*)$/);
      // skip over whitespace-only gaps first
      var ws = left.match(/(\s+)$/);
      if (ws && !m) return off - ws[1].length;
      return m ? off - m[1].length : 0;
    }
    var right = text.slice(off);
    var m2 = right.match(/^(\s*\S+)/);
    return m2 ? off + m2[1].length : text.length;
  }

  function extendDeleteRange(r, dir, byWord) {
    var sheet = T.editor.sheetEl();
    if (!sheet) return null;
    var ct = caretTextNode(r.startContainer, r.startOffset, dir, sheet);
    if (!ct) return null;
    var tn = ct.node, off = ct.offset;
    var nr = document.createRange();
    if (!byWord) {
      if (dir === "backward") {
        if (off > 0) { nr.setStart(tn, off - 1); nr.setEnd(tn, off); }
        else {
          var p = prevText(tn, sheet);
          if (!p) return null;
          nr.setStart(p, p.nodeValue.length - 1); nr.setEnd(p, p.nodeValue.length);
        }
      } else {
        if (off < tn.nodeValue.length) { nr.setStart(tn, off); nr.setEnd(tn, off + 1); }
        else {
          var nx = nextText(tn, sheet);
          if (!nx) return null;
          nr.setStart(nx, 0); nr.setEnd(nx, 1);
        }
      }
    } else {
      var edge = wordEdge(tn.nodeValue, off, dir);
      if (edge === off) {
        // at a boundary with nothing to take: step one char instead
        return extendDeleteRange(r, dir, false);
      }
      if (dir === "backward") { nr.setStart(tn, edge); nr.setEnd(tn, off); }
      else { nr.setStart(tn, off); nr.setEnd(tn, edge); }
    }
    return nr;
  }

  function mergeableDel(n) {
    return !!n && n.nodeType === 1 && n.classList.contains("tracked-delete") &&
      n.getAttribute("data-author") === authorName();
  }
  function skipEmptyText(n, dir) {
    while (n && n.nodeType === 3 && !n.nodeValue.length) n = dir < 0 ? n.previousSibling : n.nextSibling;
    return n;
  }
  // Merge a fresh del into an adjacent del by the same author so consecutive
  // deletions become one wrapper. Backward deletions land before the previous
  // del, forward deletions after it; empty text nodes left behind by the
  // split performed on insert are skipped when looking for the neighbor.
  function mergeAdjacentDel(del) {
    var prev = skipEmptyText(del.previousSibling, -1);
    if (mergeableDel(prev)) {
      while (del.firstChild) prev.appendChild(del.firstChild);
      prev.setAttribute("data-ts", String(Date.now()));
      prev.setAttribute("title", authorTitle());
      del.remove();
      return prev;
    }
    var next = skipEmptyText(del.nextSibling, 1);
    if (mergeableDel(next)) {
      while (del.firstChild) next.insertBefore(del.firstChild, next.firstChild);
      next.setAttribute("data-ts", String(Date.now()));
      next.setAttribute("title", authorTitle());
      del.remove();
      return next;
    }
    return del;
  }

  function handleDelete(e, dir, byWord) {
    var r = T.sel.range();
    if (!r || !inSheet(r)) return;
    var delR = r.collapsed ? extendDeleteRange(r.cloneRange(), dir, byWord) : r.cloneRange();
    if (!delR || delR.collapsed) return; // let native handle it
    e.preventDefault();
    var frag = delR.extractContents();
    var del = makeDel();
    del.appendChild(frag);
    delR.insertNode(del);
    del = mergeAdjacentDel(del);
    var s = window.getSelection();
    s.removeAllRanges();
    var cr = document.createRange();
    cr.setStartBefore(del);
    cr.collapse(true);
    s.addRange(cr);
    T.editor.markDirty();
    T.bus.emit("doc:change");
  }

  /* ----- listing ----- */
  function list() {
    var sheet = T.editor.sheetEl();
    var out = [];
    if (!sheet) return out;
    $$("ins.tracked-insert, del.tracked-delete", sheet).forEach(function (el) {
      out.push({
        type: el.tagName === "INS" ? "ins" : "del",
        el: el,
        text: el.textContent,
        author: el.getAttribute("data-author") || "You",
        ts: +(el.getAttribute("data-ts") || 0)
      });
    });
    return out;
  }

  /* ----- accept / reject ----- */
  function unwrap(el) {
    var p = el.parentNode;
    if (!p) return;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  }
  function emitUpdate() { T.bus.emit("changes:update", { on: isOn() }); }

  function acceptOne(el) {
    if (!el || !el.parentNode) return;
    if (el.tagName === "INS") unwrap(el); else el.remove();
    T.editor.markDirty();
    emitUpdate();
  }
  function rejectOne(el) {
    if (!el || !el.parentNode) return;
    if (el.tagName === "DEL") unwrap(el); else el.remove();
    T.editor.markDirty();
    emitUpdate();
  }
  function acceptAll() {
    list().forEach(function (c) { acceptOne(c.el); });
    emitUpdate();
  }
  function rejectAll() {
    list().forEach(function (c) { rejectOne(c.el); });
    emitUpdate();
  }

  T.changes = {
    isOn: isOn, set: set, toggle: toggle,
    list: list,
    acceptOne: acceptOne, rejectOne: rejectOne,
    acceptAll: acceptAll, rejectAll: rejectAll
  };

  /* ----- inspector panel ----- */
  function refresh() {
    if (T.inspector && typeof T.inspector.refresh === "function") T.inspector.refresh();
  }

  function renderChangesPanel(body) {
    body.innerHTML = "";
    var items = list();
    var wrap = document.createElement("div");
    wrap.className = "chg-panel";
    var html = '<div class="chg-top">' +
      '<button type="button" class="btn" data-act="accept-all">' + T.icon("i-check") + "<span>" + T.esc(T.t("acceptAll")) + "</span></button>" +
      '<button type="button" class="btn" data-act="reject-all">' + T.icon("i-x") + "<span>" + T.esc(T.t("rejectAll")) + "</span></button>" +
      "</div>";
    if (!items.length) {
      html += '<p class="chg-empty">No tracked changes yet. Turn on Track Changes and your edits will be listed here.</p>';
    }
    html += '<div class="chg-list"></div>';
    wrap.innerHTML = html;
    var listEl = wrap.querySelector(".chg-list");
    items.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "chg-row";
      var quote = c.text.length > 80 ? c.text.slice(0, 80) + "..." : c.text;
      row.innerHTML =
        '<span class="chg-badge ' + c.type + '">' + (c.type === "ins" ? "Inserted" : "Deleted") + "</span>" +
        '<div class="chg-main"><div class="chg-text">&ldquo;' + T.esc(quote) + "&rdquo;</div>" +
        '<div class="chg-meta">' + T.esc(c.author) + " &middot; " + T.esc(T.relTime(c.ts)) + "</div></div>" +
        '<div class="chg-acts">' +
        '<button type="button" class="btn sm" data-act="accept" title="' + T.esc(T.t("accept")) + '">' + T.icon("i-check") + "</button>" +
        '<button type="button" class="btn sm" data-act="reject" title="' + T.esc(T.t("reject")) + '">' + T.icon("i-x") + "</button>" +
        "</div>";
      row.querySelector('[data-act="accept"]').addEventListener("click", function () { acceptOne(c.el); refresh(); });
      row.querySelector('[data-act="reject"]').addEventListener("click", function () { rejectOne(c.el); refresh(); });
      listEl.appendChild(row);
    });
    wrap.querySelector('[data-act="accept-all"]').addEventListener("click", function () { acceptAll(); refresh(); });
    wrap.querySelector('[data-act="reject-all"]').addEventListener("click", function () { rejectAll(); refresh(); });
    body.appendChild(wrap);
  }

  function registerPanel() {
    if (T.inspector && typeof T.inspector.registerPanel === "function") {
      T.inspector.registerPanel("changes", "Track Changes", renderChangesPanel);
      return true;
    }
    return false;
  }
  if (!registerPanel()) {
    T.bus.on("app:ready", function retry() {
      if (registerPanel()) T.bus.off("app:ready", retry);
    });
  }

  T.bus.on("changes:update", refresh);
  T.bus.on("doc:change", refresh);
})();
