/* TXT comments engine: wraps a selection in <span class="cmt" data-cid>,
   keeps a per-document thread store persisted to localStorage.
   Exposes window.TXT.comments per ARCHITECTURE.md section 9. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  var LS_PREFIX = "txt:cmt:";
  var store = [];

  /* ----- persistence (per doc) ----- */
  function docId() { return T.state.currentId; }
  function persist() {
    var id = docId();
    if (id) T.lsSet(LS_PREFIX + id, store);
  }
  function load(id) {
    store = T.lsGet(LS_PREFIX + id, []);
    if (!Array.isArray(store)) store = [];
  }
  T.bus.on("doc:open", function (d) { if (d && d.id) load(d.id); });
  T.bus.on("doc:saved", function (d) { if (d && d.id === docId()) persist(); });

  /* ----- helpers ----- */
  function authorName() { return T.state.prefs.authorName || "You"; }
  function find(id) {
    for (var i = 0; i < store.length; i++) if (store[i].id === id) return store[i];
    return null;
  }
  function spanFor(id) {
    var sheet = T.editor.sheetEl();
    if (!sheet) return null;
    return sheet.querySelector('span.cmt[data-cid="' + id + '"]');
  }
  function unwrap(el) {
    var p = el.parentNode;
    if (!p) return;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  }
  function inSheet(r) {
    var sheet = T.editor.sheetEl();
    if (!sheet || !r) return false;
    var n = r.commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    return n === sheet || sheet.contains(n);
  }

  /* ----- public API ----- */
  function add() {
    var sheet = T.editor.sheetEl();
    if (!sheet) return;
    if (T.sel.collapsed()) {
      T.toast("Select some text first, then add a comment.");
      return;
    }
    var r = T.sel.range();
    if (!r || !inSheet(r)) {
      T.toast("Select text inside the document.");
      return;
    }
    var cid = T.uid();
    r = r.cloneRange();
    var frag = r.extractContents();
    var sp = document.createElement("span");
    sp.className = "cmt";
    sp.setAttribute("data-cid", cid);
    sp.appendChild(frag);
    r.insertNode(sp);
    var quote = sp.textContent.trim().replace(/\s+/g, " ");
    if (quote.length > 40) quote = quote.slice(0, 40) + "...";
    store.push({ id: cid, quote: quote, resolved: false, messages: [] });
    var s = window.getSelection();
    s.removeAllRanges();
    var cr = document.createRange();
    cr.setStartAfter(sp);
    cr.collapse(true);
    s.addRange(cr);
    T.editor.markDirty();
    persist();
    T.bus.emit("comments:update", { id: cid });
    if (T.inspector && typeof T.inspector.open === "function") T.inspector.open("comments", { focus: cid });
  }

  function list() { return store; }

  function reply(id, text) {
    var c = find(id);
    if (!c) return;
    text = String(text == null ? "" : text).trim();
    if (!text) return;
    c.messages.push({ who: authorName(), text: text, ts: Date.now() });
    persist();
    T.bus.emit("comments:update", { id: id });
  }

  function resolve(id, b) {
    var c = find(id);
    if (!c) return;
    c.resolved = !!b;
    var sp = spanFor(id);
    if (sp) sp.classList.toggle("resolved", !!b);
    persist();
    T.editor.markDirty();
    T.bus.emit("comments:update", { id: id });
  }

  function del(id) {
    var sp = spanFor(id);
    if (sp) unwrap(sp);
    store = store.filter(function (c) { return c.id !== id; });
    persist();
    T.editor.markDirty();
    T.bus.emit("comments:update", { id: id });
  }

  function jump(id) {
    var sp = spanFor(id);
    if (!sp) return;
    sp.scrollIntoView({ block: "center" });
    sp.style.outline = "2px solid var(--accent)";
    sp.style.outlineOffset = "2px";
    setTimeout(function () { sp.style.outline = ""; sp.style.outlineOffset = ""; }, 1400);
  }

  T.comments = {
    add: add, list: list,
    reply: reply, resolve: resolve, del: del, jump: jump
  };

  /* ----- sample seeding ----- */
  function wrapFirstWords(el, n, cid) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var tn = null;
    while ((tn = walker.nextNode())) { if (tn.nodeValue.trim()) break; }
    if (!tn) return null;
    var re = new RegExp("^(\\s*)(\\S+(?:\\s+\\S+){0," + (n - 1) + "})([\\s\\S]*)$");
    var m = tn.nodeValue.match(re);
    if (!m) return null;
    var parent = tn.parentNode;
    var sp = document.createElement("span");
    sp.className = "cmt";
    sp.setAttribute("data-cid", cid);
    sp.textContent = m[2];
    if (m[1]) { tn.nodeValue = m[1]; parent.insertBefore(sp, tn.nextSibling); }
    else { parent.insertBefore(sp, tn); parent.removeChild(tn); }
    if (m[3]) parent.insertBefore(document.createTextNode(m[3]), sp.nextSibling);
    return m[2];
  }

  T.bus.on("comments:seed", function () {
    if (store.length) return;
    var sheet = T.editor.sheetEl();
    if (!sheet) return;
    var seeds = [
      { sel: "h1", who: "Ava", text: "Tighten this intro before Friday." },
      { sel: "h2", who: "You", text: "Verify these numbers with finance." }
    ];
    var added = false;
    seeds.forEach(function (s) {
      var el = sheet.querySelector(s.sel);
      if (!el) return;
      var cid = T.uid();
      var words = wrapFirstWords(el, 3, cid);
      if (!words) return;
      store.push({
        id: cid,
        quote: words.length > 40 ? words.slice(0, 40) + "..." : words,
        resolved: false,
        messages: [{ who: s.who, text: s.text, ts: Date.now() }]
      });
      added = true;
    });
    if (added) {
      persist();
      T.editor.markDirty();
      T.bus.emit("comments:update", {});
    }
  });

  /* ----- inspector panel ----- */
  function refresh() {
    if (T.inspector && typeof T.inspector.refresh === "function") T.inspector.refresh();
  }

  function renderCommentsPanel(body, data) {
    body.innerHTML = "";
    var focusCid = data && data.focus;
    var wrap = document.createElement("div");
    wrap.className = "cmt-panel";
    if (!store.length) {
      var p = document.createElement("p");
      p.className = "cmt-empty";
      p.textContent = "No comments yet. Select text in the document, then add a comment from the Review tab.";
      wrap.appendChild(p);
    }
    store.forEach(function (c) {
      var th = document.createElement("div");
      th.className = "cmt-thread" + (c.resolved ? " is-resolved" : "");
      var h = '<div class="cmt-quote">&ldquo;' + T.esc(c.quote) + "&rdquo;</div>" + '<div class="cmt-msgs">';
      c.messages.forEach(function (m) {
        h += '<div class="cmt-msg"><span class="who">' + T.esc(m.who) + "</span>" +
          '<span class="txt">' + T.esc(m.text) + "</span>" +
          '<span class="ts">' + T.esc(T.relTime(m.ts)) + "</span></div>";
      });
      if (!c.messages.length) h += '<div class="cmt-noreply">No replies yet. Start the thread below.</div>';
      h += "</div>";
      h += '<div class="cmt-composer">' +
        '<input type="text" data-reply-for="' + T.esc(c.id) + '" placeholder="' + T.esc(T.t("commentPh")) + '" aria-label="' + T.esc(T.t("reply")) + '">' +
        '<button type="button" class="btn sm" data-act="reply">' + T.esc(T.t("reply")) + "</button></div>";
      h += '<div class="cmt-acts">' +
        '<button type="button" class="btn sm" data-act="resolve">' + T.icon(c.resolved ? "i-undo" : "i-check") + "<span>" + T.esc(c.resolved ? T.t("reopen") : T.t("resolve")) + "</span></button>" +
        '<button type="button" class="btn sm" data-act="jump">' + T.icon("i-search") + "<span>Jump</span></button>" +
        '<button type="button" class="btn sm danger" data-act="del">' + T.icon("i-trash") + "<span>" + T.esc(T.t("del")) + "</span></button>" +
        "</div>";
      th.innerHTML = h;
      var input = th.querySelector("input[data-reply-for]");
      function sendReply() { reply(c.id, input.value); }
      th.querySelector('[data-act="reply"]').addEventListener("click", sendReply);
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); sendReply(); }
      });
      th.querySelector('[data-act="resolve"]').addEventListener("click", function () { resolve(c.id, !c.resolved); });
      th.querySelector('[data-act="jump"]').addEventListener("click", function () { jump(c.id); });
      th.querySelector('[data-act="del"]').addEventListener("click", function () { del(c.id); });
      wrap.appendChild(th);
    });
    body.appendChild(wrap);
    if (focusCid) {
      var f = body.querySelector('input[data-reply-for="' + focusCid + '"]');
      if (f) setTimeout(function () { f.focus(); }, 60);
    }
  }

  function registerPanel() {
    if (T.inspector && typeof T.inspector.registerPanel === "function") {
      T.inspector.registerPanel("comments", "Comments", renderCommentsPanel);
      return true;
    }
    return false;
  }
  if (!registerPanel()) {
    T.bus.on("app:ready", function retry() {
      if (registerPanel()) T.bus.off("app:ready", retry);
    });
  }

  T.bus.on("comments:update", refresh);
  T.bus.on("doc:open", refresh);
})();
