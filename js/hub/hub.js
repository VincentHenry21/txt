/* TXT ecosystem HUB dashboard (v5 wave): fills #view-hub.

   Dependency-free IIFE module. The HUB view IS its own homescreen: a unified
   dashboard with an omnibox, recent files across all apps, per-app storage
   analytics, quick actions, and a persistent cross-app clipboard shelf.

   T.hub = {
     show(), hide(), search(q), toggleShelf(),
     collectRecents(), searchAll(q), storageStats(), formatBytes(n),
     openRecent(item), quickNew(app),
     getShelf(), pinItem(item), unpinItem(id), removeItem(id),
     pinSelection(), copyText(text), insertIntoTxt(item), downloadItem(item)
   }

   Data sources (all read-only, all guarded; apps may not have run yet):
   - TXT word docs: (T.state && T.state.docs), bodies via T.loadDoc / localStorage "txt:doc:<id>"
   - GRD/DCK/MEM/PDF: T.store.get('<app>') namespaces; their "recent" arrays
     for the recents list, whole namespace scanned for content search.
   - Shelf: persisted in T.store 'hub' namespace, key 'shelf'.

   Opening a file: T.ecosystem.openApp(app), then the target app's own open
   API, consumed defensively (T.grd.openSheet, T.dck.openDeck, T.mem.openNote,
   T.pdf.openDoc, T.editor.openDoc). If the app is not loaded, a toast explains. */
(function () {
  "use strict";
  var T = window.TXT;

  var APPS = [
    { id: "txt", code: "TXT", color: "#2563EB", label: "Word documents" },
    { id: "grd", code: "GRD", color: "#10B981", label: "Sheets" },
    { id: "dck", code: "DCK", color: "#F97316", label: "Decks" },
    { id: "mem", code: "MEM", color: "#8B5CF6", label: "Notes" },
    { id: "pdf", code: "PDF", color: "#E11D48", label: "PDF docs" }
  ];
  var APP_BY_ID = {};
  APPS.forEach(function (a) { APP_BY_ID[a.id] = a; });

  /* localStorage key prefixes counted toward each app's storage footprint */
  var LS_PREFIX = {
    txt: ["txt:"],
    grd: ["grd:", "GRD_"],
    dck: ["dck:", "DCK_"],
    mem: ["mem:", "MEM_"],
    pdf: ["pdf:", "PDF_"],
    hub: ["hub:", "HUB_"]
  };
  var REF_BYTES = 5 * 1024 * 1024; // 5 MB reference for the storage section
  var SHELF_MAX = 100;

  /* ---------------- small safe helpers ---------------- */
  function esc(s) {
    try { return T.esc(String(s == null ? "" : s)); } catch (e) { return ""; }
  }
  function rel(ts) {
    try { return T.relTime(ts || Date.now()); } catch (e) { return ""; }
  }
  function uid() {
    try { return T.uid("hub"); } catch (e) { return "hub-" + Date.now() + "-" + Math.floor(Math.random() * 1e6); }
  }
  function toast(msg, kind) {
    try { T.toast(msg, kind); } catch (e) { /* headless */ }
  }
  function storeGet(app, key) {
    try {
      if (!T.store || typeof T.store.get !== "function") return undefined;
      return key === undefined ? T.store.get(app) : T.store.get(app, key);
    } catch (e) { return undefined; }
  }
  function storeSet(app, key, val) {
    try {
      if (T.store && typeof T.store.set === "function") T.store.set(app, key, val);
    } catch (e) { /* storage blocked */ }
  }
  function openAppView(app) {
    try {
      if (T.ecosystem && typeof T.ecosystem.openApp === "function") T.ecosystem.openApp(app);
    } catch (e) { /* no shell */ }
  }
  function stripHtml(html) {
    if (!html) return "";
    try {
      var d = document.createElement("div");
      d.innerHTML = String(html);
      return (d.textContent || "").replace(/\s+/g, " ").trim();
    } catch (e) { return String(html).replace(/<[^>]+>/g, " "); }
  }
  function snippetAround(text, q, radius) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text.slice(0, 120);
    var r = radius || 48;
    var s = Math.max(0, i - r), e = Math.min(text.length, i + q.length + r);
    return (s > 0 ? "..." : "") + text.slice(s, e) + (e < text.length ? "..." : "");
  }

  /* ---------------- 1. recent files, unified ---------------- */
  function collectRecents() {
    var out = [];
    try {
      var docs = (T.state && T.state.docs) || [];
      docs.forEach(function (m) {
        if (!m) return;
        out.push({
          app: "txt", id: m.id, title: m.title || "Untitled document",
          updatedAt: m.updatedAt || 0, kind: "Word document"
        });
      });
    } catch (e) { /* txt not ready */ }
    ["grd", "dck", "mem", "pdf"].forEach(function (app) {
      var rec = storeGet(app, "recent");
      if (!rec || !rec.length) return;
      rec.forEach(function (e) {
        if (!e) return;
        out.push({
          app: app, id: e.id, title: e.title || e.name || "Untitled",
          updatedAt: e.updatedAt || e.ts || 0, kind: e.kind || APP_BY_ID[app].label.replace(/s$/, "")
        });
      });
    });
    out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return out;
  }

  /* Open a recent file: switch to the app, then use that app's own open API. */
  function openRecent(item) {
    if (!item || !item.app) return;
    var app = item.app, id = item.id;
    if (app === "txt") {
      openAppView("txt");
      if (T.editor && typeof T.editor.openDoc === "function") { T.editor.openDoc(id); return; }
      toast("The Word editor is not ready yet.", "error"); return;
    }
    openAppView(app);
    var api = T[app];
    var method = { grd: "openSheet", dck: "openDeck", mem: "openNote", pdf: "openDoc" }[app];
    if (api && method && typeof api[method] === "function") { api[method](id); return; }
    toast(APP_BY_ID[app].code + " is open, but it has not finished loading yet.", "error");
  }

  /* Quick actions: jump to an app and trigger its creation flow. */
  function quickNew(app) {
    if (app === "txt") {
      openAppView("txt");
      if (T.editor && typeof T.editor.newDoc === "function") {
        var title = "Untitled document";
        try { title = T.t("untitled"); } catch (e) {}
        T.editor.newDoc(title, "");
        return;
      }
      toast("The Word editor is not ready yet.", "error"); return;
    }
    openAppView(app);
    var api = T[app];
    var method = { grd: "newSheet", dck: "newDeck", mem: "newNote", pdf: "newDoc" }[app];
    if (api && method && typeof api[method] === "function") { api[method](); return; }
    toast(APP_BY_ID[app].code + " is open, but it has not finished loading yet.", "error");
  }

  /* ---------------- 2. storage analytics ---------------- */
  function bytesForApp(app) {
    var bytes = 0;
    try {
      var ns = storeGet(app);
      if (ns !== undefined && ns !== null) bytes += JSON.stringify(ns).length;
    } catch (e) { /* unserializable; ignore */ }
    try {
      var prefs = LS_PREFIX[app] || [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var p = 0; p < prefs.length; p++) {
          if (k.indexOf(prefs[p]) === 0) {
            var v = "";
            try { v = localStorage.getItem(k) || ""; } catch (e2) {}
            bytes += k.length + v.length;
            break;
          }
        }
      }
    } catch (e) { /* localStorage blocked */ }
    return bytes;
  }
  function storageStats() {
    var apps = APPS.concat([{ id: "hub", code: "HUB", color: "#4F46E5", label: "Hub data" }])
      .map(function (a) {
        return { id: a.id, code: a.code, color: a.color, label: a.label, bytes: bytesForApp(a.id) };
      });
    var total = apps.reduce(function (s, a) { return s + a.bytes; }, 0);
    return { apps: apps, total: total, ref: REF_BYTES };
  }
  function formatBytes(n) {
    n = Math.max(0, n || 0);
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  /* ---------------- 3. omnibox: real search ---------------- */
  function txtDocBody(id) {
    try {
      if (typeof T.loadDoc === "function") {
        var d = T.loadDoc(id);
        if (d && d.html) return stripHtml(d.html);
      }
    } catch (e) {}
    try {
      var raw = T.lsGet ? T.lsGet("txt:doc:" + id, null) : null;
      if (raw && raw.html) return stripHtml(raw.html);
    } catch (e) {}
    return "";
  }

  /* Depth-first walk of plain JSON; calls cb(pathString, stringValue, ctx)
     where ctx is the nearest enclosing {id, title}. */
  function walkStrings(root, cb) {
    var stack = [{ node: root, path: "", ctx: {}, depth: 0 }];
    var seen = [];
    while (stack.length) {
      var fr = stack.pop();
      if (fr.depth > 7) continue;
      var node = fr.node;
      if (node && typeof node === "object") {
        if (seen.indexOf(node) >= 0) continue;
        seen.push(node);
        var ctx = fr.ctx;
        if (!Array.isArray(node)) {
          var nid = node.id, ntitle = node.title || node.name;
          if (nid !== undefined || ntitle !== undefined) {
            ctx = { id: nid !== undefined ? nid : ctx.id, title: ntitle !== undefined ? ntitle : ctx.title };
          }
        }
        var keys = Object.keys(node);
        for (var i = keys.length - 1; i >= 0; i--) {
          var k = keys[i];
          if (k === "recent" || k === "shelf") continue; // handled separately
          stack.push({ node: node[k], path: fr.path ? fr.path + "." + k : k, ctx: ctx, depth: fr.depth + 1 });
        }
      } else if (typeof node === "string" && node.length >= 2 && node.length <= 4000) {
        cb(fr.path, node, fr.ctx);
      }
    }
  }

  function searchAll(q) {
    q = String(q == null ? "" : q).trim();
    if (!q) return [];
    var ql = q.toLowerCase();
    var files = [], content = [], commands = [];
    var seenContent = {};

    /* (a) titles + TXT paragraph bodies */
    try {
      var docs = (T.state && T.state.docs) || [];
      docs.forEach(function (m) {
        if (!m) return;
        var title = m.title || "Untitled document";
        if (title.toLowerCase().indexOf(ql) >= 0) {
          files.push({ group: "Files", app: "txt", id: m.id, title: title, subtitle: "Word document" });
        } else {
          var body = txtDocBody(m.id);
          if (body.toLowerCase().indexOf(ql) >= 0) {
            content.push({ group: "Content", app: "txt", id: m.id, title: title, subtitle: "Word document", snippet: snippetAround(body, q) });
          }
        }
      });
    } catch (e) {}

    /* (a)+(b) other apps: recent titles, then deep content scan */
    ["grd", "dck", "mem", "pdf"].forEach(function (app) {
      var ns = storeGet(app);
      if (!ns) return;
      var rec = ns.recent;
      if (rec && rec.length) {
        rec.forEach(function (e) {
          if (!e) return;
          var title = e.title || e.name || "Untitled";
          if (title.toLowerCase().indexOf(ql) >= 0) {
            files.push({ group: "Files", app: app, id: e.id, title: title, subtitle: APP_BY_ID[app].label.replace(/s$/, "") });
          }
        });
      }
      walkStrings(ns, function (path, val, ctx) {
        if (val.toLowerCase().indexOf(ql) < 0) return;
        var key = app + "|" + (ctx.id || ctx.title || path);
        if (seenContent[key]) return;
        seenContent[key] = true;
        content.push({
          group: "Content", app: app, id: ctx.id,
          title: ctx.title || APP_BY_ID[app].label,
          subtitle: APP_BY_ID[app].label.replace(/s$/, "") + " · " + path,
          snippet: snippetAround(val, q)
        });
      });
    });

    /* (c) registered commands */
    try {
      var list = (typeof T.listCommands === "function") ? T.listCommands() : [];
      list.forEach(function (c) {
        if (!c) return;
        var hay = ((c.title || "") + " " + (c.name || "") + " " + (c.match || "")).toLowerCase();
        if (hay.indexOf(ql) >= 0) {
          commands.push({
            group: "Commands", app: null, id: null,
            title: c.title || c.name, subtitle: (c.cat || "General") + (c.keys ? " · " + c.keys : ""),
            run: (function (name) { return function () { T.cmd(name); }; })(c.name)
          });
        }
      });
    } catch (e) {}

    var out = files.concat(content, commands);
    return out.slice(0, 40);
  }

  function openResult(r) {
    if (!r) return;
    if (typeof r.run === "function") { r.run(); return; }
    openRecent({ app: r.app, id: r.id });
  }

  /* ---------------- 4. clipboard shelf ---------------- */
  function getShelf() {
    var s = storeGet("hub", "shelf");
    return Array.isArray(s) ? s : [];
  }
  function saveShelf(items) {
    storeSet("hub", "shelf", items);
  }
  function detectType(content) {
    var c = String(content || "").trim();
    if (/^data:image\//i.test(c)) return "image";
    if (/^<svg[\s>]/i.test(c)) return "svg";
    if (/^</.test(c)) return "html";
    return "text";
  }
  function pinItem(item) {
    item = item || {};
    var items = getShelf();
    items.unshift({
      id: uid(),
      type: item.type || detectType(item.content),
      title: String(item.title || "").slice(0, 80) || "Pinned item",
      content: String(item.content == null ? "" : item.content),
      ts: Date.now(),
      pinned: false
    });
    saveShelf(items.slice(0, SHELF_MAX));
    renderShelf();
    return items[0];
  }
  function unpinItem(id) {
    var items = getShelf();
    var changed = false;
    items.forEach(function (it) {
      if (it.id === id) { it.pinned = !it.pinned; changed = true; }
    });
    if (changed) {
      items.sort(function (a, b) { return (b.pinned - a.pinned) || (b.ts - a.ts); });
      saveShelf(items);
      renderShelf();
    }
  }
  function removeItem(id) {
    saveShelf(getShelf().filter(function (it) { return it.id !== id; }));
    renderShelf();
  }
  function copyText(text) {
    text = String(text == null ? "" : text);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
    } catch (e) {}
    /* fallback: hidden textarea + execCommand */
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
      return Promise.resolve(!!ok);
    } catch (e3) {
      return Promise.resolve(false);
    }
  }
  function insertIntoTxt(item) {
    if (!item) return;
    var text = item.type === "text" ? item.content : stripHtml(item.content);
    try {
      if (T.store && typeof T.store.emit === "function") {
        T.store.emit("mem:send", { text: text });
        toast("Sent to the Word document.");
      } else {
        toast("Cross-app messaging is not available.", "error");
      }
    } catch (e) { toast("Could not send to TXT.", "error"); }
  }
  function downloadItem(item) {
    if (!item) return;
    try {
      var a = document.createElement("a");
      var ext = item.type === "svg" ? "svg" : item.type === "image" ? "png" : item.type === "html" ? "html" : "txt";
      var base = String(item.title || "shelf-item").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "shelf-item";
      a.download = base.slice(0, 60) + "." + ext;
      var content = String(item.content || "");
      if (/^data:/i.test(content)) {
        a.href = content;
      } else {
        var mime = item.type === "svg" ? "image/svg+xml" : item.type === "html" ? "text/html" : "text/plain";
        var blob = new Blob([content], { type: mime + ";charset=utf-8" });
        if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          a.href = URL.createObjectURL(blob);
          setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 4000);
        } else {
          a.href = "data:" + mime + ";charset=utf-8," + encodeURIComponent(content);
        }
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Download started.");
    } catch (e) { toast("Download failed.", "error"); }
  }
  function pinSelection() {
    var s = "";
    try { s = window.getSelection ? window.getSelection().toString() : ""; } catch (e) {}
    if (!s || !s.trim()) { toast("Select some text first, then pin it."); return null; }
    s = s.trim();
    var item = pinItem({ type: "text", title: s.slice(0, 40), content: s });
    toast("Pinned to the shelf.");
    return item;
  }

  /* ---------------- view: build / refresh / show / hide ---------------- */
  var built = false;
  var els = {};
  var omniState = { results: [], active: -1 };

  function el(tag, cls, id) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (id) d.id = id;
    return d;
  }
  function badge(app) {
    var a = APP_BY_ID[app] || { code: "?", color: "#6B7280" };
    var b = el("span", "hub-badge");
    b.style.background = a.color;
    b.textContent = a.code;
    return b;
  }
  function iconBtn(iconId, label, fn) {
    var b = el("button", "hub-iconbtn");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    try { b.innerHTML = T.icon(iconId); } catch (e) { b.textContent = label; }
    b.addEventListener("click", fn);
    return b;
  }

  function build() {
    var view = document.getElementById("view-hub");
    if (!view) return;
    view.innerHTML = "";
    var root = el("div", "eco-home hub-root", "hub-root");

    /* header */
    var head = el("div", "eco-home-head");
    var hb = el("span", "app-badge");
    hb.style.background = "#4F46E5";
    hb.textContent = "HUB";
    var htxt = el("div");
    var h1 = el("h1"); h1.textContent = "Hub";
    var hp = el("p"); hp.textContent = "Every file, every app, one dashboard.";
    htxt.appendChild(h1); htxt.appendChild(hp);
    var spacer = el("div", "spacer");
    var shelfBtn = el("button", "hub-btn hub-btn-ghost", "hub-shelfToggle");
    shelfBtn.type = "button";
    try { shelfBtn.innerHTML = T.icon("i-copy") + "<span>Clipboard shelf</span>"; }
    catch (e) { shelfBtn.textContent = "Clipboard shelf"; }
    shelfBtn.addEventListener("click", toggleShelf);
    head.appendChild(hb); head.appendChild(htxt); head.appendChild(spacer); head.appendChild(shelfBtn);
    root.appendChild(head);

    /* omnibox */
    var omniWrap = el("div", "hub-omniwrap", "hub-omniWrap");
    var omni = el("input", "eco-home-search hub-omni", "hub-omni");
    omni.type = "search";
    omni.placeholder = "Search files, content, commands...";
    omni.setAttribute("aria-label", "Search everything");
    omni.setAttribute("autocomplete", "off");
    var results = el("div", "hub-results hidden", "hub-results");
    results.setAttribute("role", "listbox");
    omniWrap.appendChild(omni); omniWrap.appendChild(results);
    root.appendChild(omniWrap);
    els.omni = omni; els.results = results;

    var deb = null;
    omni.addEventListener("input", function () {
      clearTimeout(deb);
      deb = setTimeout(function () { runSearch(omni.value); }, 120);
    });
    omni.addEventListener("keydown", function (e) {
      var rs = omniState.results;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rs.length) return;
        e.preventDefault();
        omniState.active = e.key === "ArrowDown"
          ? (omniState.active + 1) % rs.length
          : (omniState.active - 1 + rs.length) % rs.length;
        paintResults();
        var act = results.querySelector(".hub-active");
        if (act && act.scrollIntoView) { try { act.scrollIntoView({ block: "nearest" }); } catch (e2) {} }
      } else if (e.key === "Enter") {
        e.preventDefault();
        var pick = rs[omniState.active] || rs[0];
        if (pick) { openResult(pick); clearResults(); omni.value = ""; }
      } else if (e.key === "Escape") {
        clearResults(); omni.blur();
      }
    });
    omni.addEventListener("blur", function () {
      setTimeout(clearResults, 150); /* let click land first */
    });

    /* quick actions */
    var qaSec = el("div", "eco-home-sec");
    var qaH = el("h2"); qaH.textContent = "Quick actions";
    var qaRow = el("div", "eco-home-new", "hub-quick");
    [
      { app: "txt", label: "New TXT document" },
      { app: "grd", label: "New GRD sheet" },
      { app: "dck", label: "New DCK deck" },
      { app: "mem", label: "New MEM note" }
    ].forEach(function (q) {
      var b = el("button", "eco-home-tpl", "hub-new-" + q.app);
      b.type = "button";
      var plus = "";
      try { plus = T.icon("i-plus"); } catch (e) {}
      b.innerHTML = plus + "<span>" + esc(q.label) + "</span>";
      b.addEventListener("click", function () { quickNew(q.app); });
      qaRow.appendChild(b);
    });
    qaSec.appendChild(qaH); qaSec.appendChild(qaRow);
    root.appendChild(qaSec);

    /* recent files */
    var rcSec = el("div", "eco-home-sec");
    var rcH = el("h2"); rcH.textContent = "Recent files";
    var rcList = el("div", "hub-list", "hub-recent");
    rcSec.appendChild(rcH); rcSec.appendChild(rcList);
    root.appendChild(rcSec);
    els.recent = rcList;

    /* storage */
    var stSec = el("div", "eco-home-sec");
    var stH = el("h2"); stH.textContent = "Storage";
    var stList = el("div", "hub-storage", "hub-storage");
    var stNote = el("p", "hub-note");
    stNote.textContent = "Measured from live data: app store namespaces plus localStorage keys.";
    stSec.appendChild(stH); stSec.appendChild(stList); stSec.appendChild(stNote);
    root.appendChild(stSec);
    els.storage = stList;

    view.appendChild(root);

    /* clipboard drawer */
    var wrap = el("div", "hub-drawerwrap", "hub-drawerWrap");
    wrap.setAttribute("aria-hidden", "true");
    var back = el("div", "hub-backdrop", "hub-backdrop");
    back.addEventListener("click", toggleShelf.bind(null, false));
    var drawer = el("aside", "hub-drawer", "hub-drawer");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Clipboard shelf");
    var dh = el("div", "hub-drawer-head");
    var dht = el("h2"); dht.textContent = "Clipboard shelf";
    var closeB = iconBtn("i-x", "Close shelf", function () { toggleShelf(false); });
    dh.appendChild(dht); dh.appendChild(closeB);
    drawer.appendChild(dh);
    var addRow = el("div", "hub-addrow");
    var pinSel = el("button", "hub-btn", "hub-pinSel");
    pinSel.type = "button";
    pinSel.textContent = "Pin current selection";
    pinSel.addEventListener("click", pinSelection);
    addRow.appendChild(pinSel);
    var addTa = el("textarea", "hub-addtext", "hub-addText");
    addTa.placeholder = "Or type text to pin...";
    addTa.setAttribute("aria-label", "Text to pin");
    addTa.rows = 2;
    addRow.appendChild(addTa);
    var addBtn = el("button", "hub-btn hub-btn-ghost", "hub-pinText");
    addBtn.type = "button";
    addBtn.textContent = "Pin text";
    addBtn.addEventListener("click", function () {
      var v = addTa.value.trim();
      if (!v) { toast("Type something first."); return; }
      pinItem({ type: "text", title: v.slice(0, 40), content: v });
      addTa.value = "";
      toast("Pinned to the shelf.");
    });
    addRow.appendChild(addBtn);
    drawer.appendChild(addRow);
    var shelfList = el("div", "hub-shelflist", "hub-shelfList");
    drawer.appendChild(shelfList);
    wrap.appendChild(back); wrap.appendChild(drawer);
    view.appendChild(wrap);
    els.drawerWrap = wrap; els.shelfList = shelfList;

    built = true;
    renderShelf();
  }

  function renderRecents() {
    if (!els.recent) return;
    els.recent.innerHTML = "";
    var items = collectRecents();
    if (!items.length) {
      var empty = el("div", "eco-home-empty");
      empty.textContent = "No files yet. Create something from Quick actions above.";
      els.recent.appendChild(empty);
      return;
    }
    items.slice(0, 20).forEach(function (it) {
      var row = el("div", "hub-row");
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", "Open " + it.title);
      var info = el("div", "hub-rowinfo");
      info.appendChild(badge(it.app));
      var tt = el("div", "hub-rowtext");
      var t1 = el("div", "hub-title"); t1.textContent = it.title;
      var t2 = el("div", "hub-meta"); t2.textContent = it.kind + " · " + rel(it.updatedAt);
      tt.appendChild(t1); tt.appendChild(t2);
      info.appendChild(tt);
      var open = el("button", "hub-btn hub-btn-ghost hub-openbtn", "hub-open-" + it.app + "-" + String(it.id).replace(/[^\w-]/g, ""));
      open.type = "button";
      open.textContent = "Open";
      open.addEventListener("click", function (e) { e.stopPropagation(); openRecent(it); });
      row.appendChild(info); row.appendChild(open);
      function go() { openRecent(it); }
      row.addEventListener("click", go);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
      els.recent.appendChild(row);
    });
  }

  function renderStorage() {
    if (!els.storage) return;
    els.storage.innerHTML = "";
    var st = storageStats();
    var max = Math.max.apply(null, st.apps.map(function (a) { return a.bytes; }).concat([1]));
    st.apps.forEach(function (a) {
      var row = el("div", "hub-storow");
      row.appendChild(badge(a.id));
      var mid = el("div", "hub-stomid");
      var track = el("div", "hub-bar-track");
      var fill = el("div", "hub-bar-fill");
      fill.style.background = a.color;
      fill.style.width = "0%";
      track.appendChild(fill);
      mid.appendChild(track);
      var lab = el("div", "hub-stolabel");
      lab.textContent = formatBytes(a.bytes);
      row.appendChild(mid); row.appendChild(lab);
      els.storage.appendChild(row);
      var pct = Math.max(a.bytes > 0 ? 2 : 0, Math.round(a.bytes / max * 100));
      var apply = function () { fill.style.width = pct + "%"; };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
      else setTimeout(apply, 30);
    });
    var tot = el("div", "hub-stototal");
    var pctRef = Math.min(100, Math.round(st.total / st.ref * 100));
    tot.textContent = "Total " + formatBytes(st.total) + " of " + formatBytes(st.ref) + " reference (" + pctRef + "%)";
    els.storage.appendChild(tot);
  }

  function renderShelf() {
    if (!els.shelfList) return;
    els.shelfList.innerHTML = "";
    var items = getShelf();
    if (!items.length) {
      var empty = el("div", "eco-home-empty");
      empty.textContent = "Shelf is empty. Pin the current selection or type text above.";
      els.shelfList.appendChild(empty);
      return;
    }
    items.forEach(function (it) {
      var card = el("div", "hub-shelfcard");
      var top = el("div", "hub-shelftop");
      var chip = el("span", "hub-chip");
      chip.textContent = it.type;
      var tt = el("div", "hub-title"); tt.textContent = it.title;
      var t2 = el("div", "hub-meta"); t2.textContent = rel(it.ts) + (it.pinned ? " · pinned" : "");
      var tcol = el("div"); tcol.appendChild(tt); tcol.appendChild(t2);
      top.appendChild(chip); top.appendChild(tcol);
      card.appendChild(top);
      if (it.type === "image" && /^data:image\//i.test(it.content)) {
        var img = el("img", "hub-thumb");
        img.src = it.content;
        img.alt = it.title;
        card.appendChild(img);
      } else {
        var prev = el("div", "hub-preview");
        prev.textContent = String(it.content).slice(0, 160);
        card.appendChild(prev);
      }
      var acts = el("div", "hub-actions");
      var copyB = el("button", "hub-btn hub-btn-ghost", null);
      copyB.type = "button"; copyB.textContent = "Copy";
      copyB.addEventListener("click", function () {
        copyText(it.type === "text" ? it.content : stripHtml(it.content)).then(function (ok) {
          toast(ok ? "Copied." : "Copy failed in this browser.");
        });
      });
      acts.appendChild(copyB);
      var insB = el("button", "hub-btn hub-btn-ghost", null);
      insB.type = "button"; insB.textContent = "Insert into TXT";
      insB.addEventListener("click", function () { insertIntoTxt(it); });
      acts.appendChild(insB);
      if (it.type === "image" || it.type === "svg") {
        var dlB = el("button", "hub-btn hub-btn-ghost", null);
        dlB.type = "button"; dlB.textContent = "Download";
        dlB.addEventListener("click", function () { downloadItem(it); });
        acts.appendChild(dlB);
      }
      var pinB = el("button", "hub-btn hub-btn-ghost", null);
      pinB.type = "button"; pinB.textContent = it.pinned ? "Unpin" : "Pin";
      pinB.addEventListener("click", function () { unpinItem(it.id); });
      acts.appendChild(pinB);
      var delB = iconBtn("i-trash", "Delete item", function () { removeItem(it.id); });
      acts.appendChild(delB);
      card.appendChild(acts);
      els.shelfList.appendChild(card);
    });
  }

  /* ---------------- omnibox rendering ---------------- */
  function runSearch(q) {
    omniState.results = searchAll(q);
    omniState.active = omniState.results.length ? 0 : -1;
    paintResults();
  }
  function paintResults() {
    var box = els.results;
    if (!box) return;
    box.innerHTML = "";
    var rs = omniState.results;
    if (!rs.length) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var lastGroup = null;
    rs.forEach(function (r, i) {
      if (r.group !== lastGroup) {
        lastGroup = r.group;
        var gh = el("div", "hub-grouphead");
        gh.textContent = r.group;
        box.appendChild(gh);
      }
      var row = el("div", "hub-result" + (i === omniState.active ? " hub-active" : ""));
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", i === omniState.active ? "true" : "false");
      if (r.app) row.appendChild(badge(r.app));
      var tx = el("div", "hub-rowtext");
      var t1 = el("div", "hub-title"); t1.textContent = r.title;
      tx.appendChild(t1);
      var sub = r.snippet || r.subtitle;
      if (sub) { var t2 = el("div", "hub-meta"); t2.textContent = sub; tx.appendChild(t2); }
      row.appendChild(tx);
      (function (res) {
        row.addEventListener("mousedown", function (e) { e.preventDefault(); });
        row.addEventListener("click", function () {
          openResult(res);
          els.omni.value = "";
          clearResults();
        });
        row.addEventListener("mousemove", function () {
          if (omniState.active !== rs.indexOf(res)) { omniState.active = rs.indexOf(res); paintResults(); }
        });
      })(r);
      box.appendChild(row);
    });
  }
  function clearResults() {
    omniState.results = [];
    omniState.active = -1;
    if (els.results) { els.results.innerHTML = ""; els.results.classList.add("hidden"); }
  }

  /* ---------------- drawer ---------------- */
  function toggleShelf(force) {
    if (!built) build();
    var open = typeof force === "boolean" ? force : !els.drawerWrap.classList.contains("hub-open");
    els.drawerWrap.classList.toggle("hub-open", open);
    els.drawerWrap.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) renderShelf();
  }

  /* ---------------- show / hide / search ---------------- */
  function show() {
    if (!built) build();
    var view = document.getElementById("view-hub");
    if (view) view.classList.remove("hidden");
    renderRecents();
    renderStorage();
    renderShelf();
  }
  function hide() {
    var view = document.getElementById("view-hub");
    if (view) view.classList.add("hidden");
  }
  function search(q) {
    show();
    if (els.omni) {
      els.omni.value = String(q == null ? "" : q);
      runSearch(els.omni.value);
      try { els.omni.focus(); } catch (e) {}
    }
  }

  /* ---------------- wire up ---------------- */
  if (T.bus && typeof T.bus.on === "function") {
    T.bus.on("ecosystem:app", function (p) {
      if (p && p.app === "hub") show();
    });
    T.bus.on("overlay:escape", function () { toggleShelf(false); });
  }
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod || !e.shiftKey || e.altKey) return;
    if (e.key === "K" || e.key === "k") {
      e.preventDefault();
      toggleShelf();
    }
  });

  T.register("hub.search", function () {
    openAppView("hub");
    show();
    if (els.omni) { try { els.omni.focus(); } catch (e) {} }
  }, { title: "Hub: search everything", cat: "Hub", icon: "i-search", match: "hub search find everything omnibox" });
  T.register("hub.shelf", function () { toggleShelf(); },
    { title: "Hub: toggle clipboard shelf", cat: "Hub", icon: "i-copy", keys: "Ctrl+Shift+K", match: "hub clipboard shelf pin drawer" });
  T.register("hub.pin-selection", function () { toggleShelf(true); pinSelection(); },
    { title: "Hub: pin current selection", cat: "Hub", icon: "i-bookmark", match: "hub pin selection clipboard" });

  T.hub = {
    show: show, hide: hide, search: search, toggleShelf: toggleShelf,
    collectRecents: collectRecents, searchAll: searchAll,
    storageStats: storageStats, formatBytes: formatBytes,
    openRecent: openRecent, openResult: openResult, quickNew: quickNew,
    getShelf: getShelf, pinItem: pinItem, unpinItem: unpinItem, removeItem: removeItem,
    pinSelection: pinSelection, copyText: copyText,
    insertIntoTxt: insertIntoTxt, downloadItem: downloadItem
  };
})();
