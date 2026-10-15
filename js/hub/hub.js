/* TXT ecosystem HUB dashboard (v5 wave + NXT phase 1): fills #view-hub.

   Dependency-free IIFE module. The HUB view IS its own homescreen: a unified
   dashboard with a per-app topbar (9-dot launcher + HUB settings), an
   omnibox, quick actions, tabbed sections (Recent / Files / Clipboard),
   a cross-app file browser, per-app storage analytics, quick actions, and
   a persistent cross-app clipboard shelf.

   T.hub = {
     show(), hide(), search(q), toggleShelf(force), toggleSettings(force),
     setTab(name), getTab(),
     getSettings(), setSetting(key, val),
     collectRecents(), searchAll(q), storageStats(), formatBytes(n),
     openRecent(item), openFile(app, file), renameFile(app, file),
     deleteFile(app, file), quickNew(app),
     getShelf(), pinItem(item), unpinItem(id), removeItem(id),
     pinSelection(), copyText(text), insertIntoTxt(item), downloadItem(item)
   }

   Data sources (all read-only unless a file action is taken, all guarded):
   - TXT word docs: (T.state && T.state.docs), bodies via T.loadDoc / localStorage "txt:doc:<id>"
   - GRD/DCK/MEM/PDF/Vector/Pixel: T.<app>.files = { list, create, rename,
     duplicate, remove, open } when that API exists (feature-detected); the
     legacy open/new method maps are kept as a fallback.
   - Shelf + settings: persisted in T.store 'hub' namespace ('shelf', 'settings').

   Opening a file: T.ecosystem.openApp(app) (or setPersona for vector/pixel),
   then the target app's own files.open API (or legacy open method). If the
   app is not loaded, a toast explains. */
(function () {
  "use strict";
  var T = window.TXT;

  var APPS = [
    { id: "txt", code: "TXT", color: "#7C3AED", label: "Word documents" },
    { id: "grd", code: "GRD", color: "#06B6D4", label: "Sheets" },
    { id: "dck", code: "DCK", color: "#FF2E93", label: "Decks" },
    { id: "mem", code: "MEM", color: "#10B981", label: "Notes" },
    { id: "pdf", code: "PDF", color: "#F59E0B", label: "PDF docs" },
    { id: "vector", code: "VCT", color: "#84CC16", label: "Vector drawings" },
    { id: "pixel", code: "PXL", color: "#EC4899", label: "Pixel images" }
  ];
  var APP_BY_ID = {};
  APPS.forEach(function (a) { APP_BY_ID[a.id] = a; });

  /* apps with a file source, in browser order */
  var FILE_APPS = ["txt", "grd", "dck", "mem", "pdf", "vector", "pixel"];

  /* localStorage key prefixes counted toward each app's storage footprint */
  var LS_PREFIX = {
    txt: ["txt:"],
    grd: ["grd:", "GRD_"],
    dck: ["dck:", "DCK_"],
    mem: ["mem:", "MEM_"],
    pdf: ["pdf:", "PDF_"],
    vector: ["vector:"],
    pixel: ["pixel:"],
    hub: ["hub:", "HUB_"]
  };
  var REF_BYTES = 5 * 1024 * 1024; // 5 MB reference for the storage section
  var SHELF_MAX = 100;
  var SHELF_TAB_MAX = 6;

  var TABS = [
    { id: "recent", label: "Recent" },
    { id: "files", label: "Files" },
    { id: "clipboard", label: "Clipboard" }
  ];

  /* HUB settings: persisted via T.store, 'hub' namespace, 'settings' key. */
  var SET_DEFAULTS = { warnMB: 50, landing: "recent", showCounts: true };

  var GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06' +
    'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09' +
    'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83' +
    'l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09' +
    'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83' +
    'l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09' +
    'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83' +
    'l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4' +
    'h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

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
      if ((app === "vector" || app === "pixel") && T.ecosystem && typeof T.ecosystem.setPersona === "function") {
        T.ecosystem.setPersona(app);
        return;
      }
      if (T.ecosystem && typeof T.ecosystem.openApp === "function") T.ecosystem.openApp(app);
    } catch (e) { /* no shell */ }
  }
  function modalP(opts) {
    if (T.modal && typeof T.modal === "function") {
      try { return T.modal(opts); } catch (e) { return Promise.resolve(null); }
    }
    return Promise.resolve(null);
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

  /* ---------------- settings ---------------- */
  function getSettings() {
    var raw = storeGet("hub", "settings") || {};
    var warnMB = Number(raw.warnMB);
    if (!(warnMB > 0)) warnMB = SET_DEFAULTS.warnMB;
    var landing = raw.landing;
    var ok = false;
    TABS.forEach(function (t) { if (t.id === landing) ok = true; });
    if (!ok) landing = SET_DEFAULTS.landing;
    var showCounts = raw.showCounts === undefined ? SET_DEFAULTS.showCounts : !!raw.showCounts;
    return { warnMB: warnMB, landing: landing, showCounts: showCounts };
  }
  function setSetting(key, val) {
    var s = getSettings();
    if (key === "warnMB") {
      val = Number(val);
      if (!(val > 0)) return s;
      s.warnMB = val;
    } else if (key === "landing") {
      var ok = false;
      TABS.forEach(function (t) { if (t.id === val) ok = true; });
      if (!ok) return s;
      s.landing = val;
    } else if (key === "showCounts") {
      s.showCounts = !!val;
    } else {
      return s;
    }
    storeSet("hub", "settings", s);
    applySettings();
    return s;
  }
  function applySettings() {
    var s = getSettings();
    if (built) {
      syncSettingsForm();
      resetBrowserPaging();
      renderStorage();
      renderBrowser();
    }
    return s;
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
    ["grd", "dck", "mem", "pdf", "vector", "pixel"].forEach(function (app) {
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

  /* Open a file: switch to the app, then use that app's own open API. */
  function openFile(app, file) {
    if (!app || !file) return;
    openAppView(app);
    if (app === "txt") {
      if (T.editor && typeof T.editor.openDoc === "function") { T.editor.openDoc(file.id); return; }
      toast("The Word editor is not ready yet.", "error"); return;
    }
    var api = T[app];
    if (api && api.files && typeof api.files.open === "function") {
      try { api.files.open(file.id); } catch (e) { toast("Could not open the file.", "error"); }
      return;
    }
    var method = { grd: "openSheet", dck: "openDeck", mem: "openNote", pdf: "openDoc" }[app];
    if (api && method && typeof api[method] === "function") { api[method](file.id); return; }
    toast(((APP_BY_ID[app] || {}).code || app) + " is open, but it has not finished loading yet.", "error");
  }

  /* Backwards-compatible recent opener (recents carry title/kind). */
  function openRecent(item) {
    if (!item || !item.app) return;
    openFile(item.app, { id: item.id, name: item.title || "Untitled" });
  }

  /* ---------------- cross-app file sources ---------------- */
  /* Returns null when the app has no file source (section stays hidden),
     otherwise [{id, name, updatedAt}] sorted newest first. */
  function appFileSource(app) {
    if (app === "txt") {
      var docs = [];
      try { docs = (T.state && T.state.docs) || []; } catch (e) { docs = []; }
      return docs.filter(Boolean).map(function (m) {
        return { id: m.id, name: m.title || "Untitled document", updatedAt: m.updatedAt || 0 };
      }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    }
    var api = T[app];
    if (api && api.files && typeof api.files.list === "function") {
      var list = [];
      try { list = api.files.list() || []; } catch (e) { list = []; }
      return list.filter(Boolean).map(function (f) {
        return { id: f.id, name: f.name || f.title || "Untitled", updatedAt: f.updatedAt || f.ts || 0 };
      }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    }
    return null;
  }

  function refreshFileViews() {
    resetBrowserPaging();
    renderBrowser();
    renderRecents();
    renderStorage();
  }

  /* Rename a file through the owning app's API (TXT via the core docs list). */
  function renameFile(app, file) {
    if (!app || !file) return Promise.resolve(false);
    var label = ((APP_BY_ID[app] || {}).code || app);
    return modalP({
      title: "Rename",
      sub: "Rename this " + label + " file.",
      fields: [{ key: "name", label: "Name", value: file.name, ph: "File name" }],
      okText: "Rename"
    }).then(function (out) {
      if (!out) return false;
      var name = String(out.name == null ? "" : out.name).trim();
      if (!name) { toast("Name cannot be empty.", "error"); return false; }
      if (app === "txt") {
        var docs = [];
        try { docs = (T.state && T.state.docs) || []; } catch (e) { docs = []; }
        var m = null;
        for (var i = 0; i < docs.length; i++) {
          if (docs[i] && docs[i].id === file.id) { m = docs[i]; break; }
        }
        if (!m) { toast("File not found.", "error"); return false; }
        m.title = name;
        m.updatedAt = Date.now();
        try { if (typeof T.lsSet === "function") T.lsSet("txt:docs", docs); } catch (e) { /* blocked */ }
        try {
          if (typeof T.loadDoc === "function" && typeof T.docKey === "function" && typeof T.lsSet === "function") {
            var body = T.loadDoc(file.id);
            if (body) { body.title = name; T.lsSet(T.docKey(file.id), body); }
          }
        } catch (e) { /* blocked */ }
        toast("Renamed.");
        refreshFileViews();
        return true;
      }
      var api = T[app];
      if (api && api.files && typeof api.files.rename === "function") {
        var r;
        try { r = api.files.rename(file.id, name); }
        catch (e) { toast("Rename failed.", "error"); return false; }
        var done = function () { toast("Renamed."); refreshFileViews(); };
        if (r && typeof r.then === "function") r.then(done, function () { toast("Rename failed.", "error"); });
        else done();
        return true;
      }
      toast("Renaming is not available for this app.", "error");
      return false;
    });
  }

  /* Delete a file through the owning app's API, after a confirm modal. */
  function deleteFile(app, file) {
    if (!app || !file) return Promise.resolve(false);
    return modalP({
      title: "Delete file?",
      sub: "Delete \"" + file.name + "\"? This cannot be undone.",
      okText: "Delete",
      danger: true
    }).then(function (ok) {
      if (!ok) return false;
      if (app === "txt") {
        var docs = [];
        try { docs = (T.state && T.state.docs) || []; } catch (e) { docs = []; }
        var found = false;
        docs = docs.filter(function (d) {
          if (d && d.id === file.id) { found = true; return false; }
          return true;
        });
        if (!found) { toast("File not found.", "error"); return false; }
        try { if (T.state) T.state.docs = docs; } catch (e) { /* frozen */ }
        try { if (typeof T.lsSet === "function") T.lsSet("txt:docs", docs); } catch (e) { /* blocked */ }
        try {
          localStorage.removeItem("txt:doc:" + file.id);
          if (typeof T.histKey === "function") localStorage.removeItem(T.histKey(file.id));
        } catch (e) { /* blocked */ }
        try {
          if (T.state && T.state.currentId === file.id && T.editor && typeof T.editor.newDoc === "function") {
            var title = "Untitled document";
            try { title = T.t("untitled"); } catch (e2) {}
            T.editor.newDoc(title, "");
          }
        } catch (e) { /* headless */ }
        toast("Deleted: " + file.name);
        refreshFileViews();
        return true;
      }
      var api = T[app];
      if (api && api.files && typeof api.files.remove === "function") {
        var r;
        try { r = api.files.remove(file.id); }
        catch (e) { toast("Delete failed.", "error"); return false; }
        var done = function () { toast("Deleted: " + file.name); refreshFileViews(); };
        if (r && typeof r.then === "function") r.then(done, function () { toast("Delete failed.", "error"); });
        else done();
        return true;
      }
      toast("Delete is not available for this app.", "error");
      return false;
    });
  }

  /* Quick actions: jump to an app and trigger its creation flow. */
  function quickNew(app) {
    openAppView(app);
    if (app === "txt") {
      if (T.editor && typeof T.editor.newDoc === "function") {
        var title = "Untitled document";
        try { title = T.t("untitled"); } catch (e) {}
        T.editor.newDoc(title, "");
        return;
      }
      toast("The Word editor is not ready yet.", "error"); return;
    }
    var api = T[app];
    if (api && api.files && typeof api.files.create === "function") {
      try { api.files.create(); } catch (e) { toast("Could not create the file.", "error"); }
      return;
    }
    var method = { grd: "newSheet", dck: "newDeck", mem: "newNote", pdf: "newDoc" }[app];
    if (api && method && typeof api[method] === "function") { api[method](); return; }
    toast(((APP_BY_ID[app] || {}).code || app) + " is open, but it has not finished loading yet.", "error");
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
          if (k === "recent" || k === "shelf" || k === "settings") continue; // handled separately
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
    openRecent({ app: r.app, id: r.id, title: r.title });
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
  var tabState = "recent";

  /* P1: paginated file browser. browserLimits maps app id -> visible row count.
     Any full refresh (show, refreshFileViews, settings change) resets to page 1. */
  var PAGE_SIZE = 50;
  var browserLimits = {};
  var browserToken = 0;
  var storageToken = 0;

  /* Paint skeletons now, swap in real content on the next frame. */
  function deferPaint(fn) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () { setTimeout(fn, 30); });
    } else {
      setTimeout(fn, 30);
    }
  }
  function resetBrowserPaging() { browserLimits = {}; }
  function browserVisible(app) {
    var n = browserLimits[app];
    return n > 0 ? n : PAGE_SIZE;
  }

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

  /* ---- per-app topbar: badge + HUB name, 9-dot launcher, settings gear ---- */
  function buildTopbar(view) {
    var bar = el("div", "hub-topbar", "hub-topbar");
    var hb = el("span", "hub-badge");
    hb.style.background = "#3B82F6";
    hb.textContent = "HUB";
    var title = el("div", "hub-topbar-title");
    var nm = el("span", "hub-topbar-name");
    nm.textContent = "HUB";
    var eco = el("span", "hub-topbar-eco");
    eco.textContent = "NXT OS";
    title.appendChild(nm);
    title.appendChild(eco);
    var spacer = el("div", "hub-spacer");
    var waffle = el("button", "icon-btn waffle-btn", "hub-launcherBtn");
    waffle.type = "button";
    waffle.title = "Open app launcher";
    waffle.setAttribute("aria-label", "Open app launcher");
    waffle.setAttribute("aria-haspopup", "true");
    var dots = el("span", "waffle-dots");
    for (var i = 0; i < 9; i++) dots.appendChild(el("i"));
    waffle.appendChild(dots);
    waffle.addEventListener("click", function (e) {
      e.stopPropagation();
      try {
        if (T.ecosystem && typeof T.ecosystem.toggleLauncher === "function") {
          T.ecosystem.toggleLauncher();
          return;
        }
      } catch (err) { /* fall through to the toast */ }
      toast("The app launcher is not available yet.", "error");
    });
    var gear = el("button", "icon-btn", "hub-settingsBtn");
    gear.type = "button";
    gear.title = "HUB settings";
    gear.setAttribute("aria-label", "HUB settings");
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener("click", function () { toggleSettings(true); });
    bar.appendChild(hb);
    bar.appendChild(title);
    bar.appendChild(spacer);
    bar.appendChild(waffle);
    bar.appendChild(gear);
    view.appendChild(bar);
  }

  function setRowNumber(label, hint, id, min, max) {
    var row = el("label", "hub-setrow");
    var tx = el("div", "hub-settext");
    var t1 = el("div", "hub-title"); t1.textContent = label;
    var t2 = el("div", "hub-meta"); t2.textContent = hint;
    tx.appendChild(t1); tx.appendChild(t2);
    var inp = el("input", null, id);
    inp.type = "number";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = "1";
    row.appendChild(tx); row.appendChild(inp);
    return row;
  }
  function setRowSelect(label, hint, id, options) {
    var row = el("label", "hub-setrow");
    var tx = el("div", "hub-settext");
    var t1 = el("div", "hub-title"); t1.textContent = label;
    var t2 = el("div", "hub-meta"); t2.textContent = hint;
    tx.appendChild(t1); tx.appendChild(t2);
    var sel = el("select", null, id);
    options.forEach(function (o) {
      var op = el("option");
      op.value = o[0];
      op.textContent = o[1];
      sel.appendChild(op);
    });
    row.appendChild(tx); row.appendChild(sel);
    return row;
  }
  function setRowToggle(label, hint, id) {
    var row = el("label", "hub-setrow");
    var tx = el("div", "hub-settext");
    var t1 = el("div", "hub-title"); t1.textContent = label;
    var t2 = el("div", "hub-meta"); t2.textContent = hint;
    tx.appendChild(t1); tx.appendChild(t2);
    var sw = el("span", "hub-switch");
    var cb = el("input", null, id);
    cb.type = "checkbox";
    cb.setAttribute("role", "switch");
    cb.setAttribute("aria-label", label);
    var knob = el("span", "hub-knob");
    sw.appendChild(cb); sw.appendChild(knob);
    row.appendChild(tx); row.appendChild(sw);
    return row;
  }

  function syncSettingsForm() {
    var s = getSettings();
    var warn = document.getElementById("hub-set-warnMB");
    if (warn) warn.value = s.warnMB;
    var land = document.getElementById("hub-set-landing");
    if (land) land.value = s.landing;
    var sc = document.getElementById("hub-set-showCounts");
    if (sc) sc.checked = s.showCounts;
  }

  function buildSettingsDrawer(view) {
    var wrap = el("div", "hub-drawerwrap", "hub-settingsWrap");
    wrap.setAttribute("aria-hidden", "true");
    var back = el("div", "hub-backdrop", "hub-settingsBackdrop");
    back.addEventListener("click", function () { toggleSettings(false); });
    var drawer = el("aside", "hub-drawer", "hub-settingsDrawer");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "HUB settings");
    var dh = el("div", "hub-drawer-head");
    var dht = el("h2"); dht.textContent = "HUB settings";
    var closeB = iconBtn("i-x", "Close settings", function () { toggleSettings(false); });
    dh.appendChild(dht); dh.appendChild(closeB);
    drawer.appendChild(dh);
    var body = el("div", "hub-setbody", "hub-settingsList");
    body.appendChild(setRowNumber(
      "Storage warning",
      "Show a warning when total storage passes this many megabytes.",
      "hub-set-warnMB", 1, 100000));
    body.appendChild(setRowSelect(
      "Default landing tab",
      "Which section HUB shows first when you open it.",
      "hub-set-landing",
      [["recent", "Recent"], ["files", "Files"], ["clipboard", "Clipboard"]]));
    body.appendChild(setRowToggle(
      "Show file counts",
      "Show the number of files next to each app in the file browser.",
      "hub-set-showCounts"));
    var about = el("div", "hub-setrow hub-about");
    var at = el("div", "hub-settext");
    var at1 = el("div", "hub-title"); at1.textContent = "About";
    var at2 = el("div", "hub-meta");
    at2.textContent = "HUB, part of the NXT OS. One dashboard for TXT, GRD, DCK, MEM, PDF, Vector and Pixel.";
    at.appendChild(at1); at.appendChild(at2);
    about.appendChild(at);
    body.appendChild(about);
    drawer.appendChild(body);
    wrap.appendChild(back); wrap.appendChild(drawer);
    view.appendChild(wrap);
    els.settingsWrap = wrap;
    var warn = document.getElementById("hub-set-warnMB");
    warn.addEventListener("change", function () { setSetting("warnMB", warn.value); });
    var land = document.getElementById("hub-set-landing");
    land.addEventListener("change", function () { setSetting("landing", land.value); });
    var sc = document.getElementById("hub-set-showCounts");
    sc.addEventListener("change", function () { setSetting("showCounts", sc.checked); });
    syncSettingsForm();
  }

  function toggleSettings(force) {
    if (!built) build();
    var open = typeof force === "boolean" ? force : !els.settingsWrap.classList.contains("hub-open");
    els.settingsWrap.classList.toggle("hub-open", open);
    els.settingsWrap.setAttribute("aria-hidden", open ? "false" : "true");
  }

  /* ---- section tabs: Recent / Files / Clipboard ---- */
  function setTab(name) {
    var ok = false;
    TABS.forEach(function (t) { if (t.id === name) ok = true; });
    if (!ok) name = "recent";
    tabState = name;
    if (!built) return name;
    TABS.forEach(function (t) {
      var btn = document.getElementById("hub-tab-" + t.id);
      var panel = document.getElementById("hub-panel-" + t.id);
      var on = t.id === name;
      if (btn) {
        btn.classList.toggle("hub-tab-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.tabIndex = on ? 0 : -1;
      }
      if (panel) panel.classList.toggle("hidden", !on);
    });
    if (name === "clipboard") renderShelfTab();
    return name;
  }
  function getTab() { return tabState; }

  function buildTabs(root) {
    var tabsBar = el("div", "hub-tabs", "hub-tabs");
    tabsBar.setAttribute("role", "tablist");
    tabsBar.setAttribute("aria-label", "HUB sections");
    TABS.forEach(function (t) {
      var b = el("button", "hub-tab", "hub-tab-" + t.id);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "hub-panel-" + t.id);
      b.textContent = t.label;
      b.addEventListener("click", function () { setTab(t.id); });
      tabsBar.appendChild(b);
    });
    root.appendChild(tabsBar);

    /* recent panel */
    var pRecent = el("div", "hub-panel hub-panel-recent", "hub-panel-recent");
    pRecent.setAttribute("role", "tabpanel");
    pRecent.setAttribute("aria-label", "Recent files");
    var rcList = el("div", "hub-list", "hub-recent");
    pRecent.appendChild(rcList);
    root.appendChild(pRecent);
    els.recent = rcList;

    /* files panel: the cross-app file browser */
    var pFiles = el("div", "hub-panel hub-panel-files", "hub-panel-files");
    pFiles.setAttribute("role", "tabpanel");
    pFiles.setAttribute("aria-label", "All files");
    var fList = el("div", "hub-files", "hub-files");
    pFiles.appendChild(fList);
    root.appendChild(pFiles);
    els.files = fList;

    /* clipboard panel: compact shelf with shortcuts to the full drawer */
    var pClip = el("div", "hub-panel hub-panel-clipboard", "hub-panel-clipboard");
    pClip.setAttribute("role", "tabpanel");
    pClip.setAttribute("aria-label", "Clipboard");
    var cBtns = el("div", "hub-clipbtns");
    var openShelfBtn = el("button", "hub-btn", "hub-openShelf");
    openShelfBtn.type = "button";
    openShelfBtn.textContent = "Open clipboard shelf";
    openShelfBtn.addEventListener("click", function () { toggleShelf(true); });
    var pinBtn = el("button", "hub-btn hub-btn-ghost", "hub-pinClip");
    pinBtn.type = "button";
    pinBtn.textContent = "Pin current selection";
    pinBtn.addEventListener("click", pinSelection);
    cBtns.appendChild(openShelfBtn);
    cBtns.appendChild(pinBtn);
    pClip.appendChild(cBtns);
    var cList = el("div", "hub-list", "hub-shelfTab");
    pClip.appendChild(cList);
    root.appendChild(pClip);
    els.shelfTab = cList;
  }

  function build() {
    var view = document.getElementById("view-hub");
    if (!view) return;
    view.innerHTML = "";
    buildTopbar(view);

    var root = el("div", "eco-home hub-root", "hub-root");

    /* header: NXT OS brand, HUB as the app name */
    var head = el("div", "eco-home-head");
    var hb = el("span", "app-badge");
    hb.style.background = "#3B82F6";
    hb.textContent = "HUB";
    var htxt = el("div");
    var h1 = el("h1"); h1.textContent = "Hub";
    var hp = el("p"); hp.textContent = "NXT OS · every file, every app, one dashboard.";
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
    var qaSec = el("div", "eco-home-sec hub-sec-quick");
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

    /* tabbed sections: Recent / Files / Clipboard */
    buildTabs(root);

    /* storage */
    var stSec = el("div", "eco-home-sec hub-sec-storage");
    var stH = el("h2"); stH.textContent = "Storage";
    var stList = el("div", "hub-storage", "hub-storage");
    var stNote = el("p", "hub-note");
    stNote.textContent = "Measured from live data: app store namespaces plus localStorage keys.";
    stSec.appendChild(stH); stSec.appendChild(stList); stSec.appendChild(stNote);
    root.appendChild(stSec);
    els.storage = stList;

    /* NXT OS footer */
    var foot = el("div", "hub-footer", "hub-footer");
    var fBrand = el("span", "hub-foot-brand");
    fBrand.textContent = "Part of NXT OS";
    foot.appendChild(fBrand);
    var fLinks = el("div", "hub-foot-links");
    [["Terms", "showTerms"], ["Privacy", "showPrivacy"], ["FAQ", "showFaq"], ["Settings", "showSettings"]].forEach(function (pair) {
      var b = el("button", "hub-foot-link");
      b.type = "button";
      b.textContent = pair[0];
      b.addEventListener("click", function () { if (T.nxtLegal) T.nxtLegal[pair[1]](); });
      fLinks.appendChild(b);
    });
    foot.appendChild(fLinks);
    /* NXT OS status bar credit (Phase 1 Identity): right-aligned brand credit
       rendered in the app's H3NZ signature palette accent. */
    var fCredit = el("span", "hub-foot-credit nxt-sb-brand");
    fCredit.textContent = "NXT HUB • Developed by H3NZ";
    foot.appendChild(fCredit);
    root.appendChild(foot);

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

    /* settings drawer */
    buildSettingsDrawer(view);

    built = true;
    setTab(getSettings().landing);
    renderShelf();
  }

  function fileRow(app, f) {
    var row = el("div", "hub-row hub-filerow");
    var info = el("div", "hub-rowinfo");
    info.appendChild(badge(app));
    var tt = el("div", "hub-rowtext");
    var t1 = el("div", "hub-title"); t1.textContent = f.name;
    var t2 = el("div", "hub-meta"); t2.textContent = rel(f.updatedAt);
    tt.appendChild(t1); tt.appendChild(t2);
    info.appendChild(tt);
    row.appendChild(info);
    var open = el("button", "hub-btn hub-btn-ghost");
    open.type = "button";
    open.textContent = "Open";
    open.setAttribute("aria-label", "Open " + f.name);
    open.addEventListener("click", function () { openFile(app, f); });
    row.appendChild(open);
    var ren = el("button", "hub-btn hub-btn-ghost");
    ren.type = "button";
    ren.textContent = "Rename";
    ren.setAttribute("aria-label", "Rename " + f.name);
    ren.addEventListener("click", function () { renameFile(app, f); });
    row.appendChild(ren);
    var del = iconBtn("i-trash", "Delete " + f.name, function () { deleteFile(app, f); });
    row.appendChild(del);
    return row;
  }

  /* P1: the file browser paginates. A skeleton pass paints immediately so the
     layout does not jump, then the real pass renders the first PAGE_SIZE rows
     per app section plus a 44px "Show more" button for the next page.
     Any full refresh (show / refreshFileViews / settings change) resets
     pagination to page 1, so a changed filter never strands the user mid-list. */
  function browserSectionData() {
    var out = [];
    FILE_APPS.forEach(function (app) {
      var files = appFileSource(app);
      if (files === null) return; /* no file source: section stays hidden */
      out.push({ app: app, files: files });
    });
    return out;
  }

  function fillBrowserList(list, sec) {
    list.innerHTML = "";
    var shown = Math.min(browserVisible(sec.app), sec.files.length);
    for (var i = 0; i < shown; i++) list.appendChild(fileRow(sec.app, sec.files[i]));
    if (sec.files.length > shown) {
      var more = el("button", "hub-btn hub-btn-ghost hub-showmore");
      more.type = "button";
      more.textContent = "Show more (" + (sec.files.length - shown) + " remaining)";
      more.setAttribute("aria-label", "Show more files in " + ((APP_BY_ID[sec.app] || {}).label || sec.app));
      more.addEventListener("click", function () {
        browserLimits[sec.app] = shown + PAGE_SIZE;
        fillBrowserList(list, sec);
      });
      list.appendChild(more);
    }
  }

  function buildBrowserSection(sec, showCounts) {
    var wrap = el("div", "hub-filesec");
    var head = el("div", "hub-filehead");
    head.appendChild(badge(sec.app));
    var label = el("span", "hub-filelabel");
    label.textContent = (APP_BY_ID[sec.app] || {}).label || sec.app;
    head.appendChild(label);
    if (showCounts) {
      var cnt = el("span", "hub-filecount");
      cnt.textContent = String(sec.files.length);
      head.appendChild(cnt);
    }
    wrap.appendChild(head);
    if (!sec.files.length) {
      var empty = el("div", "eco-home-empty hub-filesempty");
      empty.textContent = "No files yet.";
      wrap.appendChild(empty);
    } else {
      var list = el("div", "hub-list");
      wrap.appendChild(list);
      fillBrowserList(list, sec);
    }
    return wrap;
  }

  function renderBrowser() {
    if (!els.files) return;
    els.files.innerHTML = "";
    var s = getSettings();
    var sections = browserSectionData();
    if (!sections.length) {
      var emptyAll = el("div", "eco-home-empty");
      emptyAll.textContent = "No apps expose files yet.";
      els.files.appendChild(emptyAll);
      return;
    }
    /* skeleton pass: paint placeholders immediately */
    var shells = sections.map(function (sec) {
      var wrap = el("div", "hub-filesec");
      var head = el("div", "hub-filehead");
      head.appendChild(badge(sec.app));
      var label = el("span", "hub-filelabel");
      label.textContent = (APP_BY_ID[sec.app] || {}).label || sec.app;
      head.appendChild(label);
      wrap.appendChild(head);
      var sk = el("div", "hub-list");
      var n = Math.min(Math.max(sec.files.length, 1), 4);
      for (var i = 0; i < n; i++) {
        var r = el("div", "nxt-skeleton hub-skelrow");
        r.setAttribute("aria-hidden", "true");
        sk.appendChild(r);
      }
      wrap.appendChild(sk);
      els.files.appendChild(wrap);
      return { sec: sec, wrap: wrap };
    });
    /* real pass: swap skeletons for the first page of rows on the next frame */
    var token = ++browserToken;
    deferPaint(function () {
      if (token !== browserToken || !els.files) return;
      try { if (!els.files.isConnected) return; } catch (e) {}
      els.files.innerHTML = "";
      shells.forEach(function (sh) {
        els.files.appendChild(buildBrowserSection(sh.sec, s));
      });
    });
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

  /* Storage analytics: skeleton pass first, real rows on the next frame. */
  function renderStorage() {
    if (!els.storage) return;
    els.storage.innerHTML = "";
    for (var i = 0; i < 4; i++) {
      var sk = el("div", "nxt-skeleton hub-skelrow");
      sk.setAttribute("aria-hidden", "true");
      els.storage.appendChild(sk);
    }
    var token = ++storageToken;
    deferPaint(function () {
      if (token !== storageToken || !els.storage) return;
      try { if (!els.storage.isConnected) return; } catch (e) {}
      renderStorageReal();
    });
  }

  function renderStorageReal() {
    els.storage.innerHTML = "";
    var st = storageStats();
    var s = getSettings();
    var threshold = s.warnMB * 1024 * 1024;
    if (st.total > threshold) {
      var w = el("div", "hub-warn");
      w.setAttribute("role", "alert");
      try { w.innerHTML = T.icon("i-shield"); } catch (e) { /* no icon */ }
      var wt = el("div", "hub-warntext");
      wt.textContent = "Storage is over your " + s.warnMB + " MB warning threshold (" +
        formatBytes(st.total) + " used). Delete old files to free space.";
      w.appendChild(wt);
      els.storage.appendChild(w);
    }
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

  function shelfCard(it) {
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
    var copyB = el("button", "hub-btn hub-btn-ghost");
    copyB.type = "button"; copyB.textContent = "Copy";
    copyB.addEventListener("click", function () {
      copyText(it.type === "text" ? it.content : stripHtml(it.content)).then(function (ok) {
        toast(ok ? "Copied." : "Copy failed in this browser.");
      });
    });
    acts.appendChild(copyB);
    var insB = el("button", "hub-btn hub-btn-ghost");
    insB.type = "button"; insB.textContent = "Insert into TXT";
    insB.addEventListener("click", function () { insertIntoTxt(it); });
    acts.appendChild(insB);
    if (it.type === "image" || it.type === "svg") {
      var dlB = el("button", "hub-btn hub-btn-ghost");
      dlB.type = "button"; dlB.textContent = "Download";
      dlB.addEventListener("click", function () { downloadItem(it); });
      acts.appendChild(dlB);
    }
    var pinB = el("button", "hub-btn hub-btn-ghost");
    pinB.type = "button"; pinB.textContent = it.pinned ? "Unpin" : "Pin";
    pinB.addEventListener("click", function () { unpinItem(it.id); });
    acts.appendChild(pinB);
    var delB = iconBtn("i-trash", "Delete item", function () { removeItem(it.id); });
    acts.appendChild(delB);
    card.appendChild(acts);
    return card;
  }

  function renderShelfCards(container, items, limit) {
    container.innerHTML = "";
    if (!items.length) {
      var empty = el("div", "eco-home-empty");
      empty.textContent = "Shelf is empty. Pin the current selection or type text above.";
      container.appendChild(empty);
      return;
    }
    items.slice(0, limit || items.length).forEach(function (it) {
      container.appendChild(shelfCard(it));
    });
  }

  function renderShelf() {
    var items = getShelf();
    if (els.shelfList) renderShelfCards(els.shelfList, items);
    renderShelfTab();
  }
  function renderShelfTab() {
    if (els.shelfTab) renderShelfCards(els.shelfTab, getShelf(), SHELF_TAB_MAX);
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

  /* ---------------- drawers ---------------- */
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
    setTab(getSettings().landing);
    resetBrowserPaging();
    renderRecents();
    renderBrowser();
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
    T.bus.on("overlay:escape", function () { toggleShelf(false); toggleSettings(false); });
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
  T.register("hub.settings", function () {
    openAppView("hub");
    show();
    toggleSettings(true);
  }, { title: "Hub: open settings", cat: "Hub", icon: "i-shield", match: "hub settings preferences" });

  T.hub = {
    show: show, hide: hide, search: search, toggleShelf: toggleShelf,
    toggleSettings: toggleSettings, setTab: setTab, getTab: getTab,
    getSettings: getSettings, setSetting: setSetting,
    collectRecents: collectRecents, searchAll: searchAll,
    storageStats: storageStats, formatBytes: formatBytes,
    openRecent: openRecent, openFile: openFile,
    renameFile: renameFile, deleteFile: deleteFile, quickNew: quickNew,
    getShelf: getShelf, pinItem: pinItem, unpinItem: unpinItem, removeItem: removeItem,
    pinSelection: pinSelection, copyText: copyText,
    insertIntoTxt: insertIntoTxt, downloadItem: downloadItem
  };
})();
