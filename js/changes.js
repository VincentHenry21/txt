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

  function handleInsert(e) {
    if (!e.data || e.isComposing) return; // IME: let native handle composition
    var r = T.sel.range();
    if (!r || !inSheet(r)) return;
    e.preventDefault();
    r = r.cloneRange();
    if (!r.collapsed) r.deleteContents();
    r.collapse(true);
    var ins = document.createElement("ins");
    ins.className = "tracked-insert";
    ins.setAttribute("data-author", authorName());
    ins.setAttribute("data-ts", String(Date.now()));
    ins.textContent = e.data;
    r.insertNode(ins);
    var s = window.getSelection();
    s.removeAllRanges();
    var cr = document.createRange();
    cr.setStartAfter(ins);
    cr.collapse(true);
    s.addRange(cr);
    T.editor.markDirty();
    T.bus.emit("doc:change");
  }

  function handleDelete(e, dir, byWord) {
    var r = T.sel.range();
    if (!r || !inSheet(r)) return;
    var s = window.getSelection();
    r = r.cloneRange();
    if (r.collapsed) {
      // Extend the collapsed caret by one unit in the delete direction.
      s.removeAllRanges();
      s.addRange(r);
      if (typeof s.modify !== "function") return; // cannot extend safely; let native handle it
      var gran = byWord ? "word" : "character";
      var before = s.toString();
      s.modify("extend", dir, gran);
      if (s.toString() === before && gran !== "character") s.modify("extend", dir, "character");
      if (!s.rangeCount || s.getRangeAt(0).collapsed) return; // nothing to delete
      r = s.getRangeAt(0).cloneRange();
    }
    e.preventDefault();
    var frag = r.extractContents();
    var del = document.createElement("del");
    del.className = "tracked-delete";
    del.setAttribute("data-author", authorName());
    del.setAttribute("data-ts", String(Date.now()));
    del.appendChild(frag);
    r.insertNode(del);
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
