/* MEM: whiteboard + masonry notes companion app for the TXT ecosystem.
   Fills #view-mem. Dependency-free IIFE, builds its DOM lazily on first show().

   Screens: homescreen (eco-home) | masonry notes | spatial whiteboard.
   Data lives in T.store under app "mem": notes, boards, recent (max 20).
   Clipper: every note card and sticky note has "Send to TXT", which emits
   'mem:send' {text} on the store bus (word side inserts at the cursor).

   T.mem = { show, hide, addNote, addBoard, addSticky, moveSticky, addArrow,
             sendToTxt, setTagFilter, goHome, goMasonry, openBoard, ... } */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T || !T.bus || !T.store) return;

  /* ================= utilities ================= */
  var uid = (typeof T.uid === "function") ? function () { return T.uid(); } :
    (function () { var n = 0; return function () { return "memx" + (++n) + Date.now().toString(36); }; })();
  function esc(s) {
    return (typeof T.esc === "function") ? T.esc(s) :
      String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
  }
  function clamp(v, a, b) {
    return (typeof T.clamp === "function") ? T.clamp(v, a, b) : Math.min(b, Math.max(a, v));
  }
  function toast(msg, kind) { if (typeof T.toast === "function") T.toast(msg, kind); }
  function icon(id) { return (typeof T.icon === "function") ? T.icon(id) : ""; }
  function debounce(fn, ms) {
    if (typeof T.debounce === "function") return T.debounce(fn, ms || 400);
    var h; return function () { var a = arguments, c = this; clearTimeout(h); h = setTimeout(function () { fn.apply(c, a); }, ms || 400); };
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function mk(tag, cls, id) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (id) d.id = id;
    return d;
  }
  function btn(id, title, inner, cls) {
    var b = mk("button", cls || "mem-btn", id);
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    if (typeof inner === "string") b.innerHTML = inner; else if (inner) b.appendChild(inner);
    return b;
  }
  function now() { return Date.now(); }
  function relTime(ts) {
    if (typeof T.relTime === "function") { try { return T.relTime(ts); } catch (e) {} }
    var s = Math.max(0, Math.floor((now() - ts) / 1000));
    if (s < 60) return s + "s ago";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  var MY_RE = /[\u1000-\u109F]/;
  function markMy(node) {
    if (node && MY_RE.test(node.textContent || "")) node.setAttribute("lang", "my");
    else if (node) node.removeAttribute("lang");
  }
  function plainText(html) {
    var d = mk("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+\n/g, "\n").trim();
  }

  /* ================= store ================= */
  function getNotes() { var n = T.store.get("mem", "notes"); return Array.isArray(n) ? n : []; }
  function setNotes(n) { T.store.set("mem", "notes", n); }
  function getBoards() { var b = T.store.get("mem", "boards"); return Array.isArray(b) ? b : []; }
  function setBoards(b) { T.store.set("mem", "boards", b); }
  function getBoard(id) {
    var bs = getBoards();
    for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i];
    return null;
  }
  function saveBoard(b) {
    b.updatedAt = now();
    var bs = getBoards();
    var done = false;
    for (var i = 0; i < bs.length; i++) if (bs[i].id === b.id) { bs[i] = b; done = true; break; }
    if (!done) bs.unshift(b);
    setBoards(bs);
    if (typeof ui !== "undefined" && ui.board && ui.board.id === b.id) ui.board = b;
    touchRecent({ id: b.id, title: b.title || "Untitled board", updatedAt: b.updatedAt, kind: "board" });
  }
  function retagNote(n) {
    var text = (n.title || "") + " " + plainText(n.html) + " " +
      ((n.items || []).map(function (it) { return it.text; }).join(" "));
    n.tags = extractTags(text);
    return n.tags;
  }
  function saveNote(n) {
    retagNote(n);
    n.updatedAt = now();
    var ns = getNotes();
    var done = false;
    for (var i = 0; i < ns.length; i++) if (ns[i].id === n.id) { ns[i] = n; done = true; break; }
    if (!done) ns.unshift(n);
    setNotes(ns);
    touchRecent({ id: n.id, title: noteTitle(n), updatedAt: n.updatedAt, kind: "note" });
  }
  function touchRecent(item) {
    var r = T.store.get("mem", "recent");
    if (!Array.isArray(r)) r = [];
    r = r.filter(function (x) { return x && x.id !== item.id; });
    r.unshift({ id: item.id, title: item.title || "Untitled", updatedAt: item.updatedAt || now(), kind: item.kind });
    T.store.set("mem", "recent", r.slice(0, 20));
  }
  function removeRecent(id) {
    var r = T.store.get("mem", "recent");
    if (!Array.isArray(r)) return;
    T.store.set("mem", "recent", r.filter(function (x) { return x && x.id !== id; }));
  }

  /* ================= models ================= */
  var NOTE_COLORS = [
    { v: "#FFFFFF", n: "White" }, { v: "#FEF3C7", n: "Amber" }, { v: "#D1FAE5", n: "Mint" },
    { v: "#DBEAFE", n: "Sky" }, { v: "#EDE9FE", n: "Lavender" }, { v: "#FFEDD5", n: "Peach" },
    { v: "#F3F4F6", n: "Stone" }
  ];
  var STICKY_COLORS = [
    { v: "#FEF08A", n: "Yellow" }, { v: "#BBF7D0", n: "Green" }, { v: "#BFDBFE", n: "Blue" },
    { v: "#DDD6FE", n: "Purple" }, { v: "#FED7AA", n: "Orange" }, { v: "#99F6E4", n: "Teal" },
    { v: "#E7E5E4", n: "Stone" }
  ];
  var DRAW_COLORS = ["#1F2937", "#DC2626", "#2563EB", "#059669", "#D97706", "#7C3AED"];
  var DRAW_WIDTHS = [2, 4, 8];

  function noteTitle(n) {
    var t = (n.title || "").trim();
    if (t) return t;
    var p = plainText(n.html).split("\n")[0] || "";
    if (n.kind === "checklist" && n.items && n.items.length) p = n.items[0].text || p;
    if (n.kind === "voice") p = p || "Voice memo";
    return p ? (p.length > 42 ? p.slice(0, 42) + "..." : p) : "Untitled note";
  }
  function extractTags(text) {
    var tags = [], seen = {};
    String(text || "").replace(/#([\p{L}\p{N}_-]{2,40})/gu, function (m, g) {
      var tag = g.toLowerCase();
      if (!seen[tag]) { seen[tag] = 1; tags.push(tag); }
      return m;
    });
    return tags;
  }

  function addNote(kind, opts) {
    opts = opts || {};
    var n = {
      id: uid(), kind: kind || "note", title: opts.title || "", html: opts.html || "",
      tags: [], color: opts.color || memSettings().noteColor || NOTE_COLORS[0].v,
      items: (kind === "checklist") ? [{ id: uid(), text: "", done: false }] : [],
      audioUrl: null, audioMs: 0,
      createdAt: now(), updatedAt: now()
    };
    if (opts.tags) n.tags = opts.tags.slice();
    saveNote(n);
    refreshCurrent();
    return n;
  }
  function deleteNote(id) {
    setNotes(getNotes().filter(function (n) { return n.id !== id; }));
    removeRecent(id);
    revokeAudio(id);
    refreshCurrent();
  }
  function duplicateNote(id) {
    var ns = getNotes(), src = null;
    for (var i = 0; i < ns.length; i++) if (ns[i].id === id) src = ns[i];
    if (!src) return null;
    var c = JSON.parse(JSON.stringify(src));
    c.id = uid(); c.createdAt = now(); c.updatedAt = now(); c.audioUrl = null;
    if (c.items) c.items.forEach(function (it) { it.id = uid(); });
    saveNote(c);
    refreshCurrent();
    return c;
  }

  /* ================= MEM settings (per-app, persisted in the mem namespace) ================= */
  var MEM_SETTINGS_DEF = { noteColor: "#FFFFFF", dotGrid: true, snapGrid: false, sort: "newest" };
  var MEM_SNAP = 20;
  function memSettings() {
    var s = T.store.get("mem", "settings");
    var out = {}, k;
    for (k in MEM_SETTINGS_DEF) out[k] = MEM_SETTINGS_DEF[k];
    if (s && typeof s === "object") for (k in MEM_SETTINGS_DEF) {
      if (s[k] !== undefined) out[k] = s[k];
    }
    var ok = false;
    for (var i = 0; i < NOTE_COLORS.length; i++) if (NOTE_COLORS[i].v === out.noteColor) { ok = true; break; }
    if (!ok) out.noteColor = MEM_SETTINGS_DEF.noteColor;
    if (out.sort !== "newest" && out.sort !== "oldest" && out.sort !== "name") out.sort = "newest";
    out.dotGrid = !!out.dotGrid;
    out.snapGrid = !!out.snapGrid;
    return out;
  }
  function saveMemSettings(patch) {
    var s = memSettings();
    if (patch && typeof patch === "object") {
      var k;
      for (k in MEM_SETTINGS_DEF) if (patch[k] !== undefined) s[k] = patch[k];
    }
    T.store.set("mem", "settings", s);
    applySettings();
    syncSettingsUI();
    refreshCurrent();
    return s;
  }
  function applySettings() {
    var s = memSettings();
    var vp = document.getElementById("mem-boardViewport");
    if (vp) vp.classList.toggle("mem-nodots", !s.dotGrid);
  }
  function snapPoint(x, y) {
    if (!memSettings().snapGrid) return { x: x, y: y };
    return { x: Math.round(x / MEM_SNAP) * MEM_SNAP, y: Math.round(y / MEM_SNAP) * MEM_SNAP };
  }
  function cmpId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
  function sortNotes(list) {
    var s = memSettings().sort;
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (s === "oldest") return (a.createdAt || 0) - (b.createdAt || 0) || cmpId(a, b);
      if (s === "name") {
        var x = noteTitle(a).toLowerCase(), y = noteTitle(b).toLowerCase();
        return x < y ? -1 : x > y ? 1 : cmpId(a, b);
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0) || cmpId(a, b);
    });
    return arr;
  }
  function sortFiles(list) {
    var s = memSettings().sort;
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (s === "oldest") return (a.updatedAt || 0) - (b.updatedAt || 0) || cmpId(a, b);
      if (s === "name") {
        var x = (a.name || "").toLowerCase(), y = (b.name || "").toLowerCase();
        return x < y ? -1 : x > y ? 1 : cmpId(a, b);
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0) || cmpId(a, b);
    });
    return arr;
  }

  /* ================= per-app files: notes + boards in the mem namespace ================= */
  function fileRecNote(n) {
    return { id: n.id, name: noteTitle(n), kind: "note", updatedAt: n.updatedAt || 0 };
  }
  function fileRecBoard(b) {
    return { id: b.id, name: b.title || "Untitled board", kind: "board", updatedAt: b.updatedAt || 0 };
  }
  function findFile(id) {
    var ns = getNotes();
    for (var i = 0; i < ns.length; i++) if (ns[i].id === id) return { rec: fileRecNote(ns[i]), kind: "note" };
    var b = getBoard(id);
    if (b) return { rec: fileRecBoard(b), kind: "board" };
    return null;
  }
  function duplicateBoard(id) {
    var src = getBoard(id);
    if (!src) return null;
    var idMap = {};
    var c = JSON.parse(JSON.stringify(src));
    c.id = uid();
    c.title = (c.title || "Untitled board") + " (copy)";
    c.createdAt = now(); c.updatedAt = now();
    (c.elements || []).forEach(function (e) { var nid = uid(); idMap[e.id] = nid; e.id = nid; });
    (c.elements || []).forEach(function (e) {
      if (e.type === "arrow") {
        if (idMap[e.from]) e.from = idMap[e.from];
        if (idMap[e.to]) e.to = idMap[e.to];
      }
    });
    saveBoard(c);
    refreshCurrent();
    return c;
  }
  function doRemoveFile(f) {
    if (f.kind === "note") {
      deleteNote(f.rec.id);
    } else {
      var cur = ui.board && ui.board.id === f.rec.id;
      deleteBoard(f.rec.id);
      if (cur) { ui.board = null; ui.boardId = null; }
    }
    toast("Deleted");
    if (ui.boardId == null && ui.screen === "board") goHome();
    else refreshCurrent();
    return true;
  }
  var memFiles = {
    list: function () {
      var out = [];
      getNotes().forEach(function (n) { out.push(fileRecNote(n)); });
      getBoards().forEach(function (b) { out.push(fileRecBoard(b)); });
      return sortFiles(out);
    },
    create: function (name, kind) {
      var nm = (typeof name === "string" && name.trim()) ? name.trim() : null;
      if (kind === "board") {
        var b = addBoard(nm || "Untitled board");
        return fileRecBoard(b);
      }
      var n = addNote("note", { title: nm || "Untitled note" });
      return fileRecNote(n);
    },
    rename: function (id, name) {
      var nm = (typeof name === "string" && name.trim()) ? name.trim() : null;
      if (!nm) return null;
      var ns = getNotes();
      for (var i = 0; i < ns.length; i++) if (ns[i].id === id) {
        ns[i].title = nm; saveNote(ns[i]); refreshCurrent(); return fileRecNote(ns[i]);
      }
      var b = getBoard(id);
      if (b) {
        b.title = nm; saveBoard(b);
        /* store.get deserializes, so refresh the live board ref when it is current */
        if (ui.board && ui.board.id === id) ui.board = b;
        syncBoardTitle(); refreshCurrent(); return fileRecBoard(b);
      }
      return null;
    },
    duplicate: function (id) {
      var n = duplicateNote(id);
      if (n) {
        n.title = (n.title || "Untitled note") + " (copy)";
        saveNote(n); refreshCurrent();
        return fileRecNote(n);
      }
      var b = duplicateBoard(id);
      if (b) return fileRecBoard(b);
      return null;
    },
    remove: function (id) {
      var f = findFile(id);
      if (!f) return Promise.resolve(false);
      if (typeof T.modal !== "function") { doRemoveFile(f); return Promise.resolve(true); }
      return T.modal({
        title: "Delete " + f.kind,
        sub: 'Delete "' + f.rec.name + '"? This cannot be undone.',
        okText: "Delete", danger: true
      }).then(function (ok) { return ok ? doRemoveFile(f) : false; });
    },
    open: function (id) {
      var f = findFile(id);
      if (!f) return null;
      if (f.kind === "board") openBoard(id);
      else { goMasonry(); focusNoteCard(id); }
      return f.rec;
    }
  };
  function promptRenameFile(id) {
    var f = findFile(id);
    if (!f || typeof T.modal !== "function") return;
    T.modal({
      title: "Rename file",
      fields: [{ label: "Name", key: "name", value: f.rec.name, ph: "File name" }],
      okText: "Rename"
    }).then(function (r) {
      if (r && typeof r.name === "string" && r.name.trim()) {
        memFiles.rename(id, r.name.trim());
      }
    });
  }

  /* voice memo blobs are session-only (blob URLs cannot persist to the store) */
  var audioBlobs = {};
  function revokeAudio(id) {
    if (audioBlobs[id]) { try { URL.revokeObjectURL(audioBlobs[id]); } catch (e) {} delete audioBlobs[id]; }
  }

  function addBoard(title) {
    var b = {
      id: uid(), title: title || "Untitled board",
      createdAt: now(), updatedAt: now(),
      view: { x: 80, y: 80, zoom: 1 },
      elements: []
    };
    saveBoard(b);
    refreshCurrent();
    return b;
  }
  function deleteBoard(id) {
    setBoards(getBoards().filter(function (b) { return b.id !== id; }));
    removeRecent(id);
    refreshCurrent();
  }
  function findEl(b, elId) {
    for (var i = 0; i < b.elements.length; i++) if (b.elements[i].id === elId) return b.elements[i];
    return null;
  }
  function addSticky(boardId, opts) {
    var b = typeof boardId === "string" ? getBoard(boardId) : boardId;
    if (!b) return null;
    opts = opts || {};
    var s = {
      id: uid(), type: "sticky",
      x: opts.x != null ? opts.x : 120, y: opts.y != null ? opts.y : 120,
      w: opts.w || 220, h: opts.h || 180,
      color: opts.color || STICKY_COLORS[0].v,
      title: opts.title || "", html: opts.html || "",
      updatedAt: now()
    };
    b.elements.push(s);
    saveBoard(b);
    return s;
  }
  function moveSticky(boardId, stickyId, x, y) {
    var b = typeof boardId === "string" ? getBoard(boardId) : boardId;
    if (!b) return null;
    var s = findEl(b, stickyId);
    if (!s || s.type !== "sticky") return null;
    s.x = x; s.y = y; s.updatedAt = now();
    saveBoard(b);
    return s;
  }
  function addStroke(boardId, pts, color, width) {
    var b = typeof boardId === "string" ? getBoard(boardId) : boardId;
    if (!b || !pts || pts.length < 2) return null;
    var s = { id: uid(), type: "stroke", pts: pts, color: color || DRAW_COLORS[0], width: width || 4 };
    b.elements.push(s);
    saveBoard(b);
    return s;
  }
  function addFrame(boardId, opts) {
    var b = typeof boardId === "string" ? getBoard(boardId) : boardId;
    if (!b) return null;
    opts = opts || {};
    var f = {
      id: uid(), type: "frame",
      x: opts.x || 60, y: opts.y || 60, w: opts.w || 480, h: opts.h || 320,
      label: opts.label || "Section"
    };
    b.elements.push(f);
    saveBoard(b);
    return f;
  }
  function addArrow(boardId, fromId, toId, color) {
    var b = typeof boardId === "string" ? getBoard(boardId) : boardId;
    if (!b || !fromId || !toId || fromId === toId) return null;
    var a = findEl(b, fromId), c = findEl(b, toId);
    if (!a || !c || a.type !== "sticky" || c.type !== "sticky") return null;
    for (var i = 0; i < b.elements.length; i++) {
      var e = b.elements[i];
      if (e.type === "arrow" && e.from === fromId && e.to === toId) return e;
    }
    var ar = { id: uid(), type: "arrow", from: fromId, to: toId, color: color || "#8B5CF6" };
    b.elements.push(ar);
    saveBoard(b);
    return ar;
  }
  function deleteEl(boardId, elId) {
    var b = typeof boardId === "string" ? getBoard(boardId) : boardId;
    if (!b) return false;
    var removedSticky = false;
    b.elements = b.elements.filter(function (e) {
      if (e.id === elId) { if (e.type === "sticky") removedSticky = true; return false; }
      return true;
    });
    if (removedSticky) {
      b.elements = b.elements.filter(function (e) {
        return !(e.type === "arrow" && (e.from === elId || e.to === elId));
      });
    }
    saveBoard(b);
    return true;
  }

  /* ================= clipper ================= */
  function noteToText(n) {
    var lines = [noteTitle(n)];
    if (n.kind === "checklist") {
      (n.items || []).forEach(function (it) {
        lines.push((it.done ? "[x] " : "[ ] ") + (it.text || ""));
      });
    } else if (n.kind === "voice") {
      lines.push("(voice memo" + (n.audioMs ? ", " + Math.round(n.audioMs / 1000) + "s" : "") + ")");
      var p = plainText(n.html);
      if (p) lines.push(p);
    } else {
      var p2 = plainText(n.html);
      if (p2 && p2 !== lines[0]) lines.push(p2);
    }
    return lines.join("\n");
  }
  function stickyToText(s) {
    var t = (s.title || "").trim();
    var p = plainText(s.html);
    if (t && p) return t + "\n" + p;
    return t || p || "Sticky note";
  }
  function sendToTxt(text) {
    var t = String(text == null ? "" : text).trim();
    if (!t) { toast("Nothing to send yet. Add some text first.", "error"); return false; }
    T.store.emit("mem:send", { text: t });
    toast("Sent to TXT");
    return true;
  }

  /* ================= ui state ================= */
  var ui = {
    built: false, visible: false, screen: "home",
    boardId: null, board: null,
    tool: "select", drawColor: DRAW_COLORS[0], drawWidth: 4,
    masonryQuery: "", tagFilter: null,
    homeQuery: "", selectedEl: null, pendingArrowFrom: null,
    spaceDown: false, recording: null, firstPaint: false
  };
  var saveBoardSoon = debounce(function () { if (ui.board) saveBoard(ui.board); }, 500);
  var saveNoteSoon = debounce(function (n) { if (n) saveNote(n); }, 500);

  function viewEl() { return document.getElementById("view-mem"); }

  /* ================= show / hide ================= */
  function show() {
    if (!ui.built) buildView();
    ui.visible = true;
    renderRecordingBar();
    if (!ui.firstPaint) {
      /* first paint: leave the skeleton placeholders in the DOM for one frame
         so the loading state is real, then render the current screen */
      ui.firstPaint = true;
      setTimeout(function () {
        if (!ui.visible) return;
        if (ui.screen === "board" && ui.boardId) openBoard(ui.boardId, true);
        else if (ui.screen === "masonry") goMasonry(true);
        else goHome(true);
      }, 30);
      return;
    }
    if (ui.screen === "board" && ui.boardId) openBoard(ui.boardId, true);
    else if (ui.screen === "masonry") goMasonry(true);
    else goHome(true);
  }
  function hide() { ui.visible = false; stopRecording(true); }

  /* ================= build ================= */
  function buildView() {
    var root = viewEl();
    if (!root || ui.built) return;
    root.innerHTML = "";
    root.appendChild(buildHome());
    root.appendChild(buildMasonry());
    root.appendChild(buildBoard());
    var rec = mk("div", "mem-recbar hidden", "mem-recBar");
    var lbl = mk("span"); lbl.textContent = "Recording voice memo";
    var stop = mk("button", null, "mem-recStop");
    stop.type = "button"; stop.textContent = "Stop";
    stop.setAttribute("aria-label", "Stop recording");
    stop.addEventListener("click", function () { stopRecording(); });
    rec.appendChild(lbl); rec.appendChild(stop);
    root.appendChild(rec);
    root.appendChild(buildSettingsDrawer());
    ui.built = true;
    applySettings();
  }
  /* ---------- per-app topbar chrome: MEM badge + 9-dot launcher + settings gear ----------
     One shared builder, called from both the notes topbar and the board topbar. */
  var MEM_GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 ' +
    '1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 ' +
    '1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 ' +
    '1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 ' +
    '0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 ' +
    '2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>';
  function memTopbarChrome(bar, tag) {
    var badge = mk("span", "mem-appbadge");
    badge.textContent = "MEM";
    badge.setAttribute("aria-hidden", "true");
    bar.insertBefore(badge, bar.firstChild);
    var launch = btn("mem-launcher-" + tag, "App launcher", null, "icon-btn waffle-btn mem-topbtn");
    launch.setAttribute("aria-haspopup", "true");
    var dots = mk("span", "waffle-dots");
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 9; i++) dots.appendChild(document.createElement("i"));
    launch.appendChild(dots);
    launch.addEventListener("click", function (e) {
      e.stopPropagation();
      if (T.ecosystem && typeof T.ecosystem.toggleLauncher === "function") T.ecosystem.toggleLauncher();
    });
    var gear = btn("mem-settings-" + tag, "MEM settings", MEM_GEAR_SVG, "icon-btn mem-topbtn");
    gear.addEventListener("click", openSettings);
    bar.appendChild(launch);
    bar.appendChild(gear);
  }
  /* ---------- per-app settings drawer (built inside #view-mem) ---------- */
  function buildSettingsDrawer() {
    var wrap = mk("div", "mem-settings-wrap hidden", "mem-settingsWrap");
    wrap.setAttribute("aria-hidden", "true");
    var panel = mk("div", "mem-settings");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "MEM settings");
    var head = mk("div", "mem-settings-head");
    var h = mk("h2"); h.textContent = "MEM settings";
    var close = btn("mem-settingsClose", "Close settings", icon("i-x"), "icon-btn mem-topbtn");
    close.addEventListener("click", closeSettings);
    head.appendChild(h); head.appendChild(close);
    panel.appendChild(head);
    var body = mk("div", "mem-settings-body");

    var r1 = mk("div", "mem-set-row mem-set-stack");
    var l1 = mk("div", "mem-set-label");
    l1.innerHTML = "<strong>Default note color</strong><span>Used for newly created notes</span>";
    var colors = mk("div", "mem-set-colors", "mem-setColors");
    colors.setAttribute("role", "radiogroup");
    colors.setAttribute("aria-label", "Default note color");
    NOTE_COLORS.forEach(function (c) {
      var sw = btn(null, c.n, null, "mem-swatch");
      sw.style.backgroundColor = c.v;
      sw.setAttribute("role", "radio");
      sw.setAttribute("data-v", c.v);
      sw.addEventListener("click", function () { saveMemSettings({ noteColor: c.v }); });
      colors.appendChild(sw);
    });
    r1.appendChild(l1); r1.appendChild(colors);
    body.appendChild(r1);

    body.appendChild(setToggleRow("mem-setDots", "Dot grid", "Show the dot grid on the whiteboard",
      function () { return memSettings().dotGrid; },
      function (v) { saveMemSettings({ dotGrid: v }); }));
    body.appendChild(setToggleRow("mem-setSnap", "Snap to grid", "Sticky notes snap to a 20px grid while dragging",
      function () { return memSettings().snapGrid; },
      function (v) { saveMemSettings({ snapGrid: v }); }));

    var r4 = mk("div", "mem-set-row mem-set-stack");
    var l4 = mk("div", "mem-set-label");
    l4.innerHTML = "<strong>Default sort</strong><span>Order of the notes list and file list</span>";
    var seg = mk("div", "mem-seg mem-set-sort", "mem-setSort");
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", "Default sort");
    [["newest", "Newest"], ["oldest", "Oldest"], ["name", "Name"]].forEach(function (o) {
      var b = btn(null, "Sort by " + o[1].toLowerCase(), "<span>" + o[1] + "</span>", null);
      b.setAttribute("role", "radio");
      b.setAttribute("data-v", o[0]);
      b.addEventListener("click", function () { saveMemSettings({ sort: o[0] }); });
      seg.appendChild(b);
    });
    r4.appendChild(l4); r4.appendChild(seg);
    body.appendChild(r4);

    panel.appendChild(body);
    var about = mk("div", "mem-settings-about", "mem-settingsAbout");
    about.innerHTML = "<strong>MEM</strong> · Part of NXT Ecosystem<br>Notes and whiteboards that clip straight into TXT.";
    panel.appendChild(about);
    wrap.appendChild(panel);
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) closeSettings(); });
    return wrap;
  }
  function setToggleRow(id, label, desc, get, set) {
    var row = mk("div", "mem-set-row");
    var l = mk("div", "mem-set-label");
    l.innerHTML = "<strong>" + esc(label) + "</strong><span>" + esc(desc) + "</span>";
    var sw = btn(id, label, null, "mem-switch");
    sw.setAttribute("role", "switch");
    var track = mk("span", "mem-track"); track.setAttribute("aria-hidden", "true");
    var knob = mk("span", "mem-knob"); knob.setAttribute("aria-hidden", "true");
    sw.appendChild(track); sw.appendChild(knob);
    sw.addEventListener("click", function () { set(!get()); });
    row.appendChild(l); row.appendChild(sw);
    return row;
  }
  function syncSettingsUI() {
    var s = memSettings();
    var colors = document.getElementById("mem-setColors");
    if (colors) {
      $all(".mem-swatch", colors).forEach(function (sw) {
        var on = sw.getAttribute("data-v") === s.noteColor;
        sw.classList.toggle("active", on);
        sw.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    var dots = document.getElementById("mem-setDots");
    if (dots) dots.setAttribute("aria-pressed", s.dotGrid ? "true" : "false");
    var snap = document.getElementById("mem-setSnap");
    if (snap) snap.setAttribute("aria-pressed", s.snapGrid ? "true" : "false");
    var seg = document.getElementById("mem-setSort");
    if (seg) {
      $all("button", seg).forEach(function (b) {
        var on = b.getAttribute("data-v") === s.sort;
        b.classList.toggle("active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
  }
  function onSettingsKey(e) { if (e.key === "Escape") closeSettings(); }
  function openSettings() {
    if (!ui.built) buildView();
    var wrap = document.getElementById("mem-settingsWrap");
    if (!wrap) return;
    syncSettingsUI();
    wrap.classList.remove("hidden");
    wrap.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onSettingsKey);
    var c = document.getElementById("mem-settingsClose");
    if (c) c.focus();
  }
  function closeSettings() {
    var wrap = document.getElementById("mem-settingsWrap");
    if (wrap) { wrap.classList.add("hidden"); wrap.setAttribute("aria-hidden", "true"); }
    document.removeEventListener("keydown", onSettingsKey);
  }
  function setScreen(name) {
    ui.screen = name;
    ["home", "masonry", "board"].forEach(function (s) {
      var sec = document.getElementById("mem-" + s);
      if (sec) sec.classList.toggle("hidden", s !== name);
    });
    syncModeSeg();
  }
  function syncBoardTitle() {
    var t = document.getElementById("mem-boardTitle");
    if (!t || !ui.board) return;
    t.textContent = ui.board.title || "Untitled board";
    markMy(t);
  }
  function refreshCurrent() {
    if (!ui.built) return;
    if (ui.screen === "masonry") renderMasonry();
    else if (ui.screen === "home") renderFiles();
    else if (ui.screen === "board" && ui.board) { renderBoard(); syncBoardTitle(); }
    renderRecordingBar();
  }
  function modeSegHTML() {
    return '<div class="mem-seg" role="tablist" aria-label="MEM mode">' +
      '<button type="button" data-mode="masonry" role="tab">Masonry</button>' +
      '<button type="button" data-mode="board" role="tab">Board</button></div>';
  }
  function wireModeSeg(wrap) {
    var seg = wrap.querySelector(".mem-seg");
    $all("button", seg).forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-mode");
        if (m === "masonry") goMasonry();
        else openBoard(ui.boardId || T.store.get("mem", "lastBoardId"));
      });
    });
  }
  function syncModeSeg() {
    $all(".mem-seg").forEach(function (seg) {
      $all("button", seg).forEach(function (b) {
        var on = b.getAttribute("data-mode") === ui.screen;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    });
  }

  /* ================= homescreen ================= */
  function buildHome() {
    var home = mk("div", "eco-home", "mem-home");
    var head = mk("div", "eco-home-head");
    var badge = mk("span", "app-badge");
    badge.style.background = "#8B5CF6";
    badge.textContent = "MEM";
    var titles = mk("div");
    var h1 = mk("h1"); h1.textContent = "MEM";
    var sub = mk("p"); sub.textContent = "Whiteboard and notes. Clip anything straight into TXT.";
    titles.appendChild(h1); titles.appendChild(sub);
    var spacer = mk("div", "spacer");
    head.appendChild(badge); head.appendChild(titles); head.appendChild(spacer);
    home.appendChild(head);

    var search = mk("input", "eco-home-search", "mem-homeSearch");
    search.type = "search";
    search.placeholder = "Search boards and notes";
    search.setAttribute("aria-label", "Search boards and notes");
    search.addEventListener("input", function () { ui.homeQuery = search.value; renderFiles(); });
    home.appendChild(search);

    var secNew = mk("div", "eco-home-sec");
    var hNew = mk("h2"); hNew.textContent = "Start new";
    var newRow = mk("div", "eco-home-new");
    var tplBoard = btn("mem-tplBoard", "New whiteboard", icon("i-grid") + "<span>New board</span><small>Whiteboard</small>", "eco-home-tpl");
    tplBoard.addEventListener("click", function () { var b = addBoard(); openBoard(b.id); });
    var tplNote = btn("mem-tplNote", "New note", icon("i-file") + "<span>New note</span><small>Masonry note</small>", "eco-home-tpl");
    tplNote.addEventListener("click", function () { goMasonry(); var n = addNote("note"); renderMasonry(); focusNoteCard(n.id); });
    newRow.appendChild(tplBoard); newRow.appendChild(tplNote);
    secNew.appendChild(hNew); secNew.appendChild(newRow);
    home.appendChild(secNew);

    var secRec = mk("div", "eco-home-sec");
    var hRec = mk("h2"); hRec.textContent = "Files";
    var grid = mk("div", "eco-home-grid", "mem-recentGrid");
    var empty = mk("div", "eco-home-empty hidden", "mem-homeEmpty");
    empty.textContent = "No boards or notes yet. Start with a new board or a new note above.";
    secRec.appendChild(hRec); secRec.appendChild(grid); secRec.appendChild(empty);
    home.appendChild(secRec);
    var foot = mk("div", "mem-home-footer", "mem-homeFooter");
    foot.textContent = "Part of NXT Ecosystem";
    home.appendChild(foot);
    return home;
  }
  function goHome() {
    if (!ui.built) buildView();
    setScreen("home");
    renderFiles();
  }
  function renderFiles() {
    var grid = document.getElementById("mem-recentGrid");
    var empty = document.getElementById("mem-homeEmpty");
    if (!grid) return;
    grid.innerHTML = "";
    var q = (ui.homeQuery || "").trim().toLowerCase();
    var files = memFiles.list().filter(function (f) {
      return !q || (f.name || "").toLowerCase().indexOf(q) >= 0;
    });
    files.forEach(function (f) {
      var card = btn(null, "Open " + f.name, null, "eco-home-card mem-file-card");
      var h3 = mk("h3"); h3.textContent = f.name; markMy(h3);
      var meta = mk("div", "meta");
      meta.textContent = (f.kind === "board" ? "Board" : "Note") + " · " + relTime(f.updatedAt);
      var row = mk("div", "row mem-file-actions");
      var open = btn(null, "Open", icon("i-chev-r") + "<span>Open</span>", "mem-mini");
      var rn = btn(null, "Rename", icon("i-pen") + "<span>Rename</span>", "mem-mini");
      var dup = btn(null, "Duplicate", icon("i-copy") + "<span>Duplicate</span>", "mem-mini");
      var del = btn(null, "Delete", icon("i-trash") + "<span>Delete</span>", "mem-mini mem-danger");
      open.addEventListener("click", function (e) { e.stopPropagation(); memFiles.open(f.id); });
      rn.addEventListener("click", function (e) { e.stopPropagation(); promptRenameFile(f.id); });
      dup.addEventListener("click", function (e) {
        e.stopPropagation(); memFiles.duplicate(f.id); renderFiles(); toast("Duplicated");
      });
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        memFiles.remove(f.id).then(function (ok) { if (ok) renderFiles(); });
      });
      row.appendChild(open); row.appendChild(rn); row.appendChild(dup); row.appendChild(del);
      card.appendChild(h3); card.appendChild(meta); card.appendChild(row);
      card.addEventListener("click", function () { memFiles.open(f.id); });
      grid.appendChild(card);
    });
    if (empty) empty.classList.toggle("hidden", files.length > 0);
  }

  /* ================= masonry ================= */
  function buildMasonry() {
    var wrap = mk("div", "hidden", "mem-masonry");
    var bar = mk("div", "mem-topbar");
    var back = btn("mem-masBack", "Back to MEM home", icon("i-back"), "mem-btn mem-icon");
    back.addEventListener("click", goHome);
    var title = mk("h2", "mem-title"); title.textContent = "Notes";
    var segWrap = mk("div", null, "mem-modeSegWrap");
    segWrap.innerHTML = modeSegHTML();
    wireModeSeg(segWrap);
    var spacer = mk("div", "mem-spacer");
    var search = mk("input", "mem-search", "mem-masSearch");
    search.type = "search"; search.placeholder = "Search notes"; search.setAttribute("aria-label", "Search notes");
    search.addEventListener("input", function () { ui.masonryQuery = search.value; renderMasonry(); });
    var add = btn("mem-addNote", "New note", icon("i-plus") + "<span>Note</span>", "mem-btn mem-primary");
    add.addEventListener("click", function () { var n = addNote("note"); renderMasonry(); focusNoteCard(n.id); });
    bar.appendChild(back); bar.appendChild(title); bar.appendChild(segWrap);
    bar.appendChild(spacer); bar.appendChild(search); bar.appendChild(add);
    memTopbarChrome(bar, "masonry");
    wrap.appendChild(bar);
    var chips = mk("div", "mem-chips", "mem-tagChips");
    chips.setAttribute("aria-label", "Filter by tag");
    wrap.appendChild(chips);
    var grid = mk("div", "mem-masonry-grid", "mem-grid");
    /* skeleton placeholders: replaced by renderMasonry on the first real paint */
    for (var gi = 0; gi < 6; gi++) {
      var gsk = mk("div", "nxt-skeleton mem-card-skel");
      gsk.setAttribute("aria-hidden", "true");
      grid.appendChild(gsk);
    }
    wrap.appendChild(grid);
    return wrap;
  }
  function goMasonry(silent) {
    if (!ui.built) buildView();
    setScreen("masonry");
    renderMasonry();
    if (!silent) { /* no-op */ }
  }
  function visibleNotes() {
    var q = (ui.masonryQuery || "").trim().toLowerCase();
    var tag = ui.tagFilter;
    return getNotes().filter(function (n) {
      if (tag && (n.tags || []).indexOf(tag) < 0) return false;
      if (q) {
        var hay = ((n.title || "") + " " + plainText(n.html) + " " + (n.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function renderMasonry() {
    var grid = document.getElementById("mem-grid");
    var chips = document.getElementById("mem-tagChips");
    if (!grid) return;
    renderTagChips(chips);
    grid.innerHTML = "";
    var notes = sortNotes(visibleNotes());
    if (!notes.length) {
      var e = mk("div", "eco-home-empty");
      e.textContent = getNotes().length ? "No notes match this filter." : "No notes yet. Create your first note.";
      grid.appendChild(e);
      return;
    }
    notes.forEach(function (n) { grid.appendChild(buildNoteCard(n)); });
  }
  function allTags() {
    var seen = {}, out = [];
    getNotes().forEach(function (n) {
      (n.tags || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } });
    });
    out.sort();
    return out;
  }
  function renderTagChips(chips) {
    if (!chips) return;
    chips.innerHTML = "";
    var tags = allTags();
    if (!tags.length) { chips.classList.add("hidden"); return; }
    chips.classList.remove("hidden");
    var all = btn(null, "Show all notes", "<span>All</span>", "mem-chip" + (ui.tagFilter ? "" : " active"));
    all.addEventListener("click", function () { setTagFilter(null); });
    chips.appendChild(all);
    tags.forEach(function (t) {
      var c = btn(null, "Filter by #" + t, "<span>#" + esc(t) + "</span>", "mem-chip" + (ui.tagFilter === t ? " active" : ""));
      c.addEventListener("click", function () { setTagFilter(ui.tagFilter === t ? null : t); });
      chips.appendChild(c);
    });
  }
  function setTagFilter(tag) {
    ui.tagFilter = tag || null;
    renderMasonry();
  }
  function focusNoteCard(id) {
    var card = document.getElementById("mem-card-" + id);
    if (!card) return;
    if (typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
    var body = card.querySelector(".mem-card-body, .mem-card-title");
    if (body) { try { body.focus(); } catch (e) {} }
  }

  function buildNoteCard(n) {
    var card = mk("article", "mem-card", "mem-card-" + n.id);
    card.style.background = n.color || "#FFFFFF";
    card.setAttribute("data-kind", n.kind);

    var title = mk("input", "mem-card-title");
    title.type = "text"; title.placeholder = "Title"; title.value = n.title || "";
    title.setAttribute("aria-label", "Note title");
    markMy(title);
    title.addEventListener("input", function () {
      n.title = title.value; markMy(title);
      saveNoteSoon(n); refreshCardTags(card, n);
    });
    card.appendChild(title);

    if (n.kind === "note") {
      var fmt = mk("div", "mem-fmt");
      [["bold", "i-bold", "Bold"], ["italic", "i-italic", "Italic"], ["underline", "i-underline", "Underline"]].forEach(function (f) {
        var b = btn(null, f[2], icon(f[1]), "mem-btn mem-icon mem-fmtbtn");
        b.addEventListener("mousedown", function (e) { e.preventDefault(); });
        b.addEventListener("click", function () {
          body.focus();
          if (typeof document.execCommand === "function") document.execCommand(f[0], false, null);
          else toast("Rich text editing is not available here.", "error");
          n.html = body.innerHTML;
          saveNoteSoon(n); refreshCardTags(card, n);
        });
        fmt.appendChild(b);
      });
      card.appendChild(fmt);
      var body = mk("div", "mem-card-body");
      body.contentEditable = "true";
      body.innerHTML = n.html || "";
      body.setAttribute("aria-label", "Note body");
      body.setAttribute("data-ph", "Write something. Use #tags to organize.");
      markMy(body);
      body.addEventListener("input", function () {
        n.html = body.innerHTML; markMy(body);
        saveNoteSoon(n); refreshCardTags(card, n);
      });
      card.appendChild(body);
    } else if (n.kind === "checklist") {
      var list = mk("ul", "mem-checklist");
      (n.items || []).forEach(function (it) { list.appendChild(checkItemEl(n, it, card)); });
      card.appendChild(list);
      var addRow = mk("div", "mem-check-add");
      var addIn = mk("input", null, null);
      addIn.type = "text"; addIn.placeholder = "Add item, press Enter";
      addIn.setAttribute("aria-label", "Add checklist item");
      addIn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && addIn.value.trim()) {
          var it = { id: uid(), text: addIn.value.trim(), done: false };
          n.items.push(it);
          list.appendChild(checkItemEl(n, it, card));
          addIn.value = "";
          saveNoteSoon(n);
          e.preventDefault();
        }
      });
      var addBtn = btn(null, "Add item", icon("i-plus"), "mem-btn mem-icon");
      addBtn.addEventListener("click", function () {
        if (!addIn.value.trim()) { toast("Type an item first.", "error"); return; }
        var it = { id: uid(), text: addIn.value.trim(), done: false };
        n.items.push(it);
        list.appendChild(checkItemEl(n, it, card));
        addIn.value = "";
        saveNoteSoon(n);
      });
      addRow.appendChild(addIn); addRow.appendChild(addBtn);
      card.appendChild(addRow);
    } else if (n.kind === "voice") {
      var vwrap = mk("div", "mem-voice");
      var url = audioBlobs[n.id];
      if (url) {
        var au = mk("audio");
        au.controls = true; au.src = url;
        vwrap.appendChild(au);
        var dur = mk("div", "mem-meta");
        dur.textContent = "Voice memo · " + Math.round((n.audioMs || 0) / 1000) + "s";
        vwrap.appendChild(dur);
      } else {
        var none = mk("div", "mem-meta");
        none.textContent = "Recording kept for this session only. Record again to hear it.";
        vwrap.appendChild(none);
      }
      card.appendChild(vwrap);
    }

    var tagRow = mk("div", "mem-card-tags");
    card.appendChild(tagRow);
    refreshCardTags(card, n, tagRow);

    var foot = mk("div", "mem-card-foot");
    var colors = mk("div", "mem-swatches");
    NOTE_COLORS.forEach(function (c) {
      var s = btn(null, c.n, null, "mem-swatch" + (n.color === c.v ? " active" : ""));
      s.style.backgroundColor = c.v;
      s.addEventListener("click", function () {
        n.color = c.v; card.style.background = c.v; saveNoteSoon(n);
        $all(".mem-swatch", colors).forEach(function (x) { x.classList.remove("active"); });
        s.classList.add("active");
      });
      colors.appendChild(s);
    });
    foot.appendChild(colors);

    var actions = mk("div", "mem-card-actions");
    var kindBtn = btn(null, n.kind === "checklist" ? "Convert to text note" : "Convert to checklist",
      icon("i-checklist"), "mem-btn mem-icon");
    kindBtn.addEventListener("click", function () {
      if (n.kind === "checklist") {
        n.html = (n.items || []).map(function (it) { return esc(it.text); }).join("<br>");
        n.items = []; n.kind = "note";
      } else {
        var lines = plainText(n.html).split("\n").filter(function (l) { return l.trim(); });
        n.items = lines.map(function (l) { return { id: uid(), text: l.trim(), done: false }; });
        if (!n.items.length) n.items = [{ id: uid(), text: "", done: false }];
        n.kind = "checklist";
      }
      saveNote(n); renderMasonry(); focusNoteCard(n.id);
    });
    actions.appendChild(kindBtn);

    var micBtn = btn(null, "Record voice memo", icon("i-mic"), "mem-btn mem-icon");
    micBtn.addEventListener("click", function () { startRecording(n); });
    actions.appendChild(micBtn);

    var sendBtn = btn(null, "Send to TXT", icon("i-export") + "<span>TXT</span>", "mem-btn mem-send");
    sendBtn.addEventListener("click", function () { sendToTxt(noteToText(n)); });
    actions.appendChild(sendBtn);

    var dupBtn = btn(null, "Duplicate note", icon("i-copy"), "mem-btn mem-icon");
    dupBtn.addEventListener("click", function () { var c = duplicateNote(n.id); if (c) { renderMasonry(); focusNoteCard(c.id); } });
    actions.appendChild(dupBtn);

    var delBtn = btn(null, "Delete note", icon("i-trash"), "mem-btn mem-icon mem-danger");
    delBtn.addEventListener("click", function () { deleteNote(n.id); renderMasonry(); toast("Note deleted"); });
    actions.appendChild(delBtn);

    foot.appendChild(actions);
    card.appendChild(foot);
    return card;
  }
  function refreshCardTags(card, n, tagRow) {
    tagRow = tagRow || card.querySelector(".mem-card-tags");
    if (!tagRow) return;
    retagNote(n);
    saveNote(n);
    var tags = n.tags;
    tagRow.innerHTML = "";
    tags.forEach(function (t) {
      var c = btn(null, "Filter by #" + t, "<span>#" + esc(t) + "</span>", "mem-chip mem-chip-sm");
      c.addEventListener("click", function (e) { e.stopPropagation(); setTagFilter(t); });
      tagRow.appendChild(c);
    });
    if (!tags.length) tagRow.classList.add("hidden"); else tagRow.classList.remove("hidden");
    var chips = document.getElementById("mem-tagChips");
    if (chips && ui.screen === "masonry") renderTagChips(chips);
  }
  function checkItemEl(n, it, card) {
    var li = mk("li", "mem-check-item" + (it.done ? " done" : ""));
    var cb = mk("input");
    cb.type = "checkbox"; cb.checked = !!it.done; cb.setAttribute("aria-label", "Done");
    cb.addEventListener("change", function () {
      it.done = cb.checked;
      li.classList.toggle("done", it.done);
      saveNoteSoon(n);
    });
    var tx = mk("input", "mem-check-text");
    tx.type = "text"; tx.value = it.text || ""; tx.placeholder = "Item";
    tx.setAttribute("aria-label", "Checklist item");
    markMy(tx);
    tx.addEventListener("input", function () { it.text = tx.value; markMy(tx); saveNoteSoon(n); });
    var rm = btn(null, "Remove item", icon("i-x"), "mem-btn mem-icon mem-danger");
    rm.addEventListener("click", function () {
      n.items = n.items.filter(function (x) { return x.id !== it.id; });
      li.remove(); saveNoteSoon(n);
    });
    li.appendChild(cb); li.appendChild(tx); li.appendChild(rm);
    return li;
  }

  /* ================= voice memos ================= */
  function micAvailable() {
    return (typeof window.MediaRecorder !== "undefined") &&
      !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
  }
  function startRecording(note) {
    if (ui.recording) { stopRecording(); return; }
    if (!micAvailable()) {
      toast("Voice memos need a browser with microphone and MediaRecorder support.", "error");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var rec;
      try { rec = new MediaRecorder(stream); }
      catch (e) { toast("Could not start the recorder: " + (e && e.message ? e.message : e), "error"); return; }
      var chunks = [];
      var t0 = now();
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e2) {} });
        ui.recording = null;
        renderRecordingBar();
        var blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        var ms = now() - t0;
        revokeAudio(note.id);
        var url = URL.createObjectURL(blob);
        audioBlobs[note.id] = url;
        note.kind = "voice"; note.audioMs = ms;
        saveNote(note);
        if (ui.screen === "masonry") { renderMasonry(); focusNoteCard(note.id); }
        toast("Voice memo saved");
      };
      rec.onerror = function () {
        toast("Recording failed.", "error");
        stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e2) {} });
        ui.recording = null;
        renderRecordingBar();
        if (ui.screen === "masonry") renderMasonry();
      };
      ui.recording = { rec: rec, noteId: note.id, stream: stream };
      rec.start();
      renderRecordingBar();
      if (ui.screen === "masonry") renderMasonry();
      toast("Recording. Tap the mic again to stop.");
    }).catch(function (e) {
      var msg = (e && e.name === "NotAllowedError") ?
        "Microphone access was denied. Allow the mic to record voice memos." :
        "Could not access the microphone: " + (e && e.message ? e.message : e);
      toast(msg, "error");
    });
  }
  function stopRecording(silent) {
    var r = ui.recording;
    if (!r) return;
    ui.recording = null;
    renderRecordingBar();
    try { if (r.rec.state !== "inactive") r.rec.stop(); } catch (e) {}
    if (!silent && ui.screen === "masonry") renderMasonry();
  }
  function renderRecordingBar() {
    var bar = document.getElementById("mem-recBar");
    if (!bar) return;
    bar.classList.toggle("hidden", !ui.recording);
  }

  /* ================= board view ================= */
  var SVGNS = "http://www.w3.org/2000/svg";
  function buildBoard() {
    var wrap = mk("div", "hidden", "mem-board");

    var bar = mk("div", "mem-topbar");
    var back = btn("mem-boardBack", "Back to MEM home", icon("i-back"), "mem-btn mem-icon");
    back.addEventListener("click", function () { persistView(); goHome(); });
    /* single canonical board-rename path: this button opens the same rename
       modal the file list uses (promptRenameFile -> memFiles.rename) */
    var title = btn("mem-boardTitle", "Rename board", null, "mem-board-title");
    title.addEventListener("click", function () { if (ui.board) promptRenameFile(ui.board.id); });
    var segWrap = mk("div", null, "mem-modeSegWrap2");
    segWrap.innerHTML = modeSegHTML();
    wireModeSeg(segWrap);
    var spacer = mk("div", "mem-spacer");
    var zOut = btn("mem-zoomOut", "Zoom out", icon("i-minus"), "mem-btn mem-icon");
    zOut.addEventListener("click", function () { zoomBy(1 / 1.25); });
    var zPct = mk("span", "mem-zoom-pct", "mem-zoomPct"); zPct.textContent = "100%";
    var zIn = btn("mem-zoomIn", "Zoom in", icon("i-plus"), "mem-btn mem-icon");
    zIn.addEventListener("click", function () { zoomBy(1.25); });
    var fit = btn("mem-boardFit", "Fit board to view", icon("i-focus"), "mem-btn mem-icon");
    fit.addEventListener("click", fitBoard);
    var del = btn("mem-boardDel", "Delete this board", icon("i-trash"), "mem-btn mem-icon mem-danger");
    del.addEventListener("click", function () {
      if (!ui.board) return;
      deleteBoard(ui.board.id);
      ui.board = null; ui.boardId = null;
      toast("Board deleted");
      goHome();
    });
    bar.appendChild(back); bar.appendChild(title); bar.appendChild(segWrap); bar.appendChild(spacer);
    bar.appendChild(zOut); bar.appendChild(zPct); bar.appendChild(zIn); bar.appendChild(fit); bar.appendChild(del);
    memTopbarChrome(bar, "board");
    wrap.appendChild(bar);

    var tools = mk("div", "mem-tools", "mem-boardTools");
    var toolDefs = [
      ["select", "i-pos", "Select / pan (V)"],
      ["sticky", "i-file", "Sticky note (S)"],
      ["draw", "i-pen", "Draw (D)"],
      ["arrow", "i-chev-r", "Connector arrow (A): click a source sticky, then a target"],
      ["frame", "i-border", "Section frame (F)"],
      ["eraser", "i-eraser", "Eraser (E): tap strokes to remove them"]
    ];
    toolDefs.forEach(function (td) {
      var b = btn("mem-tool-" + td[0], td[2], icon(td[1]), "mem-tool");
      b.setAttribute("data-tool", td[0]);
      b.addEventListener("click", function () { setTool(td[0]); });
      tools.appendChild(b);
    });
    var opts = mk("div", "mem-tool-opts", "mem-toolOpts");
    tools.appendChild(opts);
    wrap.appendChild(tools);

    var vp = mk("div", "mem-viewport", "mem-boardViewport");
    vp.style.touchAction = "none";
    var world = mk("div", "mem-world", "mem-boardWorld");
    var frames = mk("div", null, "mem-frames");
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("id", "mem-boardSvg");
    svg.setAttribute("width", "10"); svg.setAttribute("height", "10");
    svg.style.overflow = "visible";
    svg.style.position = "absolute"; svg.style.left = "0"; svg.style.top = "0";
    var defs = document.createElementNS(SVGNS, "defs");
    defs.innerHTML = '<marker id="mem-arrowHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#8B5CF6"></path></marker>';
    var gAr = document.createElementNS(SVGNS, "g"); gAr.setAttribute("id", "mem-arrows");
    var gSt = document.createElementNS(SVGNS, "g"); gSt.setAttribute("id", "mem-strokes");
    var gPrev = document.createElementNS(SVGNS, "path");
    gPrev.setAttribute("id", "mem-preview"); gPrev.setAttribute("class", "hidden");
    gPrev.setAttribute("fill", "none"); gPrev.setAttribute("stroke-linecap", "round"); gPrev.setAttribute("stroke-linejoin", "round");
    svg.appendChild(defs); svg.appendChild(gAr); svg.appendChild(gSt); svg.appendChild(gPrev);
    var stickies = mk("div", null, "mem-stickies");
    /* skeleton placeholders: replaced by renderStickies on the first real paint */
    for (var ski = 0; ski < 3; ski++) {
      var ssk = mk("div", "nxt-skeleton mem-stk-skel");
      ssk.style.left = (40 + ski * 250) + "px";
      ssk.style.top = "60px";
      ssk.setAttribute("aria-hidden", "true");
      stickies.appendChild(ssk);
    }
    world.appendChild(frames); world.appendChild(svg); world.appendChild(stickies);
    vp.appendChild(world);
    wrap.appendChild(vp);

    var hint = mk("div", "mem-hint", "mem-boardHint");
    hint.textContent = "Drag the background to pan. Ctrl+scroll or pinch to zoom.";
    wrap.appendChild(hint);

    wireBoardInput(vp);
    return wrap;
  }

  function openBoard(id, silent) {
    if (!ui.built) buildView();
    var b = id ? getBoard(id) : null;
    if (!b) {
      var bs = getBoards();
      if (!bs.length) b = addBoard();
      else {
        var last = T.store.get("mem", "lastBoardId");
        b = (last && getBoard(last)) || bs[0];
      }
    }
    ui.board = b; ui.boardId = b.id;
    T.store.set("mem", "lastBoardId", b.id);
    touchRecent({ id: b.id, title: b.title || "Untitled board", updatedAt: b.updatedAt, kind: "board" });
    setScreen("board");
    syncBoardTitle();
    ui.selectedEl = null; ui.pendingArrowFrom = null;
    setTool("select", true);
    applyView(); renderBoard();
    if (!silent) updateHint("Drag the background to pan. Ctrl+scroll or pinch to zoom.");
  }
  function persistView() {
    if (ui.board) { saveBoard(ui.board); }
  }
  function updateHint(t) {
    var h = document.getElementById("mem-boardHint");
    if (h) h.textContent = t;
  }

  /* ---------- view transform ---------- */
  function view() {
    if (!ui.board) return { x: 0, y: 0, zoom: 1 };
    return ui.board.view;
  }
  function applyView() {
    var v = view();
    var world = document.getElementById("mem-boardWorld");
    var vp = document.getElementById("mem-boardViewport");
    if (world) world.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.zoom + ")";
    if (vp) {
      var gap = Math.max(8, 28 * v.zoom);
      vp.style.backgroundSize = gap + "px " + gap + "px";
      vp.style.backgroundPosition = v.x + "px " + v.y + "px";
    }
    var pct = document.getElementById("mem-zoomPct");
    if (pct) pct.textContent = Math.round(v.zoom * 100) + "%";
    paintArrows();
  }
  function screenToWorld(cx, cy) {
    var vp = document.getElementById("mem-boardViewport");
    var r = vp.getBoundingClientRect();
    var v = view();
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }
  function zoomBy(f, cx, cy) {
    var v = view();
    var vp = document.getElementById("mem-boardViewport");
    var r = vp.getBoundingClientRect();
    if (cx == null) cx = r.left + r.width / 2;
    if (cy == null) cy = r.top + r.height / 2;
    var before = screenToWorld(cx, cy);
    v.zoom = clamp(v.zoom * f, 0.25, 4);
    v.x = cx - r.left - before.x * v.zoom;
    v.y = cy - r.top - before.y * v.zoom;
    applyView(); saveBoardSoon();
  }
  function fitBoard() {
    var v = view();
    var vp = document.getElementById("mem-boardViewport");
    if (!vp || !ui.board) return;
    var r = vp.getBoundingClientRect();
    var els = ui.board.elements.filter(function (e) { return e.type === "sticky" || e.type === "frame"; });
    if (!els.length) { v.x = 80; v.y = 80; v.zoom = 1; applyView(); saveBoardSoon(); return; }
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach(function (e) {
      x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y);
      x1 = Math.max(x1, e.x + (e.w || 200)); y1 = Math.max(y1, e.y + (e.h || 160));
    });
    var z = clamp(Math.min((r.width - 120) / Math.max(1, x1 - x0), (r.height - 120) / Math.max(1, y1 - y0)), 0.25, 4);
    v.zoom = z;
    v.x = (r.width - (x1 - x0) * z) / 2 - x0 * z;
    v.y = (r.height - (y1 - y0) * z) / 2 - y0 * z;
    applyView(); saveBoardSoon();
  }

  /* ---------- tools ---------- */
  function setTool(t, silent) {
    ui.tool = t;
    ui.pendingArrowFrom = null;
    $all("#mem-boardTools .mem-tool").forEach(function (b) {
      var on = b.getAttribute("data-tool") === t;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderToolOpts();
    var hints = {
      select: "Drag the background to pan. Drag stickies by their header.",
      sticky: "Click anywhere on the board to drop a sticky note.",
      draw: "Drag on the board to draw freehand strokes.",
      arrow: "Click a source sticky, then a target sticky, to connect them.",
      frame: "Drag on the board to draw a labeled section frame.",
      eraser: "Tap a stroke to erase it."
    };
    if (!silent) updateHint(hints[t] || "");
  }
  function renderToolOpts() {
    var opts = document.getElementById("mem-toolOpts");
    if (!opts) return;
    opts.innerHTML = "";
    if (ui.tool === "draw") {
      DRAW_COLORS.forEach(function (c) {
        var s = btn(null, "Draw color", null, "mem-swatch" + (ui.drawColor === c ? " active" : ""));
        s.style.backgroundColor = c;
        s.addEventListener("click", function () {
          ui.drawColor = c;
          $all(".mem-swatch", opts).forEach(function (x) { x.classList.remove("active"); });
          s.classList.add("active");
        });
        opts.appendChild(s);
      });
      DRAW_WIDTHS.forEach(function (w) {
        var b = btn(null, "Width " + w + "px", "<span>" + w + "</span>", "mem-btn mem-icon" + (ui.drawWidth === w ? " active" : ""));
        b.addEventListener("click", function () { ui.drawWidth = w; renderToolOpts(); });
        opts.appendChild(b);
      });
    }
  }

  /* ---------- board rendering ---------- */
  function renderBoard() {
    if (!ui.board) return;
    renderFrames(); renderStickies(); renderStrokes(); paintArrows();
  }
  function renderFrames() {
    var layer = document.getElementById("mem-frames");
    if (!layer) return;
    layer.innerHTML = "";
    ui.board.elements.forEach(function (e) {
      if (e.type !== "frame") return;
      var f = mk("div", "mem-frame" + (ui.selectedEl === e.id ? " selected" : ""), "mem-frame-" + e.id);
      f.style.left = e.x + "px"; f.style.top = e.y + "px";
      f.style.width = e.w + "px"; f.style.height = e.h + "px";
      var lab = mk("div", "mem-frame-label");
      lab.textContent = e.label || "Section";
      lab.title = "Double-click to rename";
      lab.addEventListener("dblclick", function (ev) {
        ev.stopPropagation();
        lab.contentEditable = "true";
        try { lab.focus(); document.execCommand("selectAll", false, null); } catch (e2) {}
      });
      lab.addEventListener("blur", function () {
        lab.contentEditable = "false";
        e.label = lab.textContent.trim() || "Section";
        saveBoardSoon();
      });
      lab.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); lab.blur(); } });
      var del = btn(null, "Delete frame", icon("i-x"), "mem-frame-del");
      del.addEventListener("click", function (ev) {
        ev.stopPropagation();
        deleteEl(ui.board.id, e.id); renderBoard();
      });
      var rs = mk("span", "mem-resize");
      rs.title = "Resize";
      rs.addEventListener("pointerdown", function (ev) { startResize(ev, e, f, "frame"); });
      f.appendChild(lab); f.appendChild(del); f.appendChild(rs);
      f.addEventListener("pointerdown", function (ev) {
        if (ev.target === lab || ev.target === rs || ev.target.closest("button")) return;
        startDrag(ev, e, f, "frame");
      });
      layer.appendChild(f);
    });
  }
  function renderStickies() {
    var layer = document.getElementById("mem-stickies");
    if (!layer) return;
    layer.innerHTML = "";
    ui.board.elements.forEach(function (e) {
      if (e.type !== "sticky") return;
      layer.appendChild(buildStickyEl(e));
    });
  }
  /* ---------- sticky color: inline popover on desktop, bottom sheet on small screens ---------- */
  function isNarrow() {
    return (typeof window.matchMedia === "function") &&
      window.matchMedia("(max-width: 640px)").matches;
  }
  function onColorSheetKey(e) { if (e.key === "Escape") closeColorSheet(); }
  function onColorSheetResize() { if (!isNarrow()) closeColorSheet(); }
  function closeColorSheet() {
    var sh = document.getElementById("mem-colorSheet");
    if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
    var bd = document.getElementById("mem-colorSheetBackdrop");
    if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
    document.removeEventListener("keydown", onColorSheetKey);
    if (typeof window.removeEventListener === "function") window.removeEventListener("resize", onColorSheetResize);
  }
  function openColorSheet(s, stickyEl) {
    closeColorSheet();
    var root = viewEl();
    if (!root) return;
    var backdrop = mk("div", "mem-sheet-backdrop", "mem-colorSheetBackdrop");
    backdrop.addEventListener("click", closeColorSheet);
    var sheet = mk("div", "nxt-sheet", "mem-colorSheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Sticky color");
    var handle = mk("div", "nxt-sheet-handle");
    handle.setAttribute("aria-hidden", "true");
    sheet.appendChild(handle);
    var h = mk("div", "mem-sheet-title");
    h.textContent = "Sticky color";
    sheet.appendChild(h);
    var grid = mk("div", "mem-sheet-swatches");
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", "Sticky color");
    STICKY_COLORS.forEach(function (c) {
      var b = btn(null, c.n, null, "mem-swatch" + (s.color === c.v ? " active" : ""));
      b.style.backgroundColor = c.v;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", s.color === c.v ? "true" : "false");
      b.addEventListener("click", function () {
        s.color = c.v;
        if (stickyEl) stickyEl.style.background = c.v;
        saveBoardSoon();
        closeColorSheet();
        toast("Sticky color updated");
      });
      grid.appendChild(b);
    });
    sheet.appendChild(grid);
    var done = btn(null, "Done", "<span>Done</span>", "mem-btn mem-sheet-done");
    done.addEventListener("click", closeColorSheet);
    sheet.appendChild(done);
    root.appendChild(backdrop);
    root.appendChild(sheet);
    document.addEventListener("keydown", onColorSheetKey);
    if (typeof window.addEventListener === "function") window.addEventListener("resize", onColorSheetResize);
    done.focus();
  }
  function buildStickyEl(s) {
    var d = mk("div", "mem-sticky" + (ui.selectedEl === s.id ? " selected" : "") +
      (ui.pendingArrowFrom === s.id ? " arrow-src" : ""), "mem-stk-" + s.id);
    d.style.left = s.x + "px"; d.style.top = s.y + "px";
    d.style.width = s.w + "px"; d.style.minHeight = s.h + "px";
    d.style.background = s.color || "#FEF08A";
    d.setAttribute("data-el", s.id);

    var head = mk("div", "mem-sticky-head");
    var grip = mk("span", "mem-sticky-grip");
    grip.title = "Drag to move";
    var pal = btn(null, "Sticky color", icon("i-swatch"), "mem-btn mem-icon mem-sticky-pal");
    var del = btn(null, "Delete sticky", icon("i-x"), "mem-btn mem-icon mem-danger");
    del.addEventListener("click", function (ev) {
      ev.stopPropagation();
      deleteEl(ui.board.id, s.id);
      ui.selectedEl = null;
      renderBoard();
    });
    head.appendChild(grip); head.appendChild(pal); head.appendChild(del);
    head.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest("button")) return;
      startDrag(ev, s, d, "sticky");
    });
    d.appendChild(head);

    var colors = mk("div", "mem-sticky-colors hidden");
    STICKY_COLORS.forEach(function (c) {
      var sw = btn(null, c.n, null, "mem-swatch" + (s.color === c.v ? " active" : ""));
      sw.style.backgroundColor = c.v;
      sw.addEventListener("click", function (ev) {
        ev.stopPropagation();
        s.color = c.v; d.style.background = c.v; saveBoardSoon();
        $all(".mem-swatch", colors).forEach(function (x) { x.classList.remove("active"); });
        sw.classList.add("active");
      });
      colors.appendChild(sw);
    });
    pal.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (isNarrow()) { openColorSheet(s, d); return; }
      colors.classList.toggle("hidden");
    });
    d.appendChild(colors);

    var title = mk("input", "mem-sticky-title");
    title.type = "text"; title.placeholder = "Title"; title.value = s.title || "";
    title.setAttribute("aria-label", "Sticky title");
    markMy(title);
    title.addEventListener("input", function () { s.title = title.value; markMy(title); saveBoardSoon(); });
    title.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    d.appendChild(title);

    var body = mk("div", "mem-sticky-body");
    body.contentEditable = "true";
    body.innerHTML = s.html || "";
    body.setAttribute("aria-label", "Sticky text");
    body.setAttribute("data-ph", "Write here");
    markMy(body);
    body.addEventListener("input", function () { s.html = body.innerHTML; markMy(body); saveBoardSoon(); });
    body.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    d.appendChild(body);

    var foot = mk("div", "mem-sticky-foot");
    var send = btn(null, "Send to TXT", icon("i-export") + "<span>TXT</span>", "mem-btn mem-send mem-sm");
    send.addEventListener("click", function (ev) {
      ev.stopPropagation();
      sendToTxt(stickyToText(s));
    });
    foot.appendChild(send);
    var rs = mk("span", "mem-resize");
    rs.title = "Resize";
    rs.addEventListener("pointerdown", function (ev) { startResize(ev, s, d, "sticky"); });
    foot.appendChild(rs);
    d.appendChild(foot);

    d.addEventListener("pointerdown", function () {
      if (ui.tool === "arrow") { arrowPick(s.id); return; }
      if (ui.tool === "select") { ui.selectedEl = s.id; paintSelection(); }
    });
    return d;
  }
  function paintSelection() {
    $all("#mem-stickies .mem-sticky, #mem-frames .mem-frame").forEach(function (n) {
      var id = n.id.replace(/^mem-(stk|frame)-/, "");
      n.classList.toggle("selected", ui.selectedEl === id);
    });
  }
  function renderStrokes() {
    var g = document.getElementById("mem-strokes");
    if (!g) return;
    g.innerHTML = "";
    ui.board.elements.forEach(function (e) {
      if (e.type !== "stroke") return;
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", ptsToPath(e.pts));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", e.color);
      p.setAttribute("stroke-width", e.width);
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("data-el", e.id);
      p.style.pointerEvents = ui.tool === "eraser" ? "stroke" : "none";
      if (ui.tool === "eraser") {
        p.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          deleteEl(ui.board.id, e.id);
          renderStrokes();
          toast("Stroke erased");
        });
      }
      g.appendChild(p);
    });
  }
  function ptsToPath(pts) {
    if (!pts || !pts.length) return "";
    var d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length; i++) d += " L" + pts[i][0].toFixed(1) + "," + pts[i][1].toFixed(1);
    return d;
  }
  function arrowGeom(a, b) {
    var ax = a.x + a.w / 2, ay = a.y + (a.h || 160) / 2;
    var bx = b.x + b.w / 2, by = b.y + (b.h || 160) / 2;
    function edge(r, cx, cy, tx, ty) {
      var dx = tx - cx, dy = ty - cy;
      if (!dx && !dy) return { x: cx, y: cy };
      var hw = r.w / 2, hh = (r.h || 160) / 2;
      var sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
      var sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
      var s = Math.min(sx, sy);
      return { x: cx + dx * s, y: cy + dy * s };
    }
    var p1 = edge(a, ax, ay, bx, by), p2 = edge(b, bx, by, ax, ay);
    var mx = (p1.x + p2.x) / 2;
    return "M" + p1.x.toFixed(1) + "," + p1.y.toFixed(1) +
      " C" + mx.toFixed(1) + "," + p1.y.toFixed(1) + " " + mx.toFixed(1) + "," + p2.y.toFixed(1) +
      " " + p2.x.toFixed(1) + "," + p2.y.toFixed(1);
  }
  function paintArrows() {
    var g = document.getElementById("mem-arrows");
    if (!g || !ui.board) return;
    g.innerHTML = "";
    ui.board.elements.forEach(function (e) {
      if (e.type !== "arrow") return;
      var a = findEl(ui.board, e.from), b = findEl(ui.board, e.to);
      if (!a || !b) return;
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", arrowGeom(a, b));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", e.color || "#8B5CF6");
      p.setAttribute("stroke-width", "2.5");
      p.setAttribute("marker-end", "url(#mem-arrowHead)");
      p.setAttribute("data-el", e.id);
      p.style.pointerEvents = "stroke";
      p.style.cursor = "pointer";
      p.addEventListener("click", function (ev) {
        ev.stopPropagation();
        deleteEl(ui.board.id, e.id);
        paintArrows();
        toast("Connector removed");
      });
      p.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
      g.appendChild(p);
    });
  }
  function arrowPick(stickyId) {
    if (!ui.pendingArrowFrom) {
      ui.pendingArrowFrom = stickyId;
      renderStickies();
      updateHint("Source picked. Now click the target sticky. Esc cancels.");
    } else if (ui.pendingArrowFrom === stickyId) {
      ui.pendingArrowFrom = null;
      renderStickies();
      updateHint("Connector cancelled.");
    } else {
      var ar = addArrow(ui.board.id, ui.pendingArrowFrom, stickyId);
      ui.pendingArrowFrom = null;
      renderStickies(); paintArrows();
      if (ar) { updateHint("Connected."); toast("Stickies connected"); }
      else updateHint("Could not connect those stickies.");
    }
  }

  /* ---------- drag / resize ---------- */
  function startDrag(ev, modelEl, node, kind) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    var v = view();
    var sx = ev.clientX, sy = ev.clientY;
    var ox = modelEl.x, oy = modelEl.y;
    function onMove(e) {
      var dx = (e.clientX - sx) / v.zoom, dy = (e.clientY - sy) / v.zoom;
      var p = snapPoint(ox + dx, oy + dy);
      modelEl.x = Math.round(p.x); modelEl.y = Math.round(p.y);
      node.style.left = modelEl.x + "px"; node.style.top = modelEl.y + "px";
      if (kind === "sticky") paintArrows();
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      saveBoardSoon();
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }
  function startResize(ev, modelEl, node, kind) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    var v = view();
    var sx = ev.clientX, sy = ev.clientY;
    var ow = modelEl.w, oh = modelEl.h;
    function onMove(e) {
      var dx = (e.clientX - sx) / v.zoom, dy = (e.clientY - sy) / v.zoom;
      modelEl.w = Math.max(kind === "sticky" ? 140 : 200, Math.round(ow + dx));
      modelEl.h = Math.max(kind === "sticky" ? 100 : 120, Math.round(oh + dy));
      node.style.width = modelEl.w + "px";
      if (kind === "sticky") node.style.minHeight = modelEl.h + "px";
      else node.style.height = modelEl.h + "px";
      if (kind === "sticky") paintArrows();
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      saveBoardSoon();
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  /* ---------- board pointer input: pan, draw, frame, pinch, wheel ---------- */
  function wireBoardInput(vp) {
    var pointers = {};
    var panStart = null, pinchStart = null, drawPts = null, frameStart = null;
    var preview = null;

    vp.addEventListener("pointerdown", function (ev) {
      if (!ui.board) return;
      if (ev.target.closest && ev.target.closest(".mem-sticky, .mem-frame, .mem-topbar, .mem-tools")) return;
      vp.setPointerCapture && vp.setPointerCapture(ev.pointerId);
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var n = Object.keys(pointers).length;
      if (n === 2) {
        var ks = Object.keys(pointers);
        var p1 = pointers[ks[0]], p2 = pointers[ks[1]];
        pinchStart = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom: view().zoom, cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
        panStart = null; drawPts = null; frameStart = null;
        hidePreview();
        return;
      }
      if (n > 2) return;
      var w = screenToWorld(ev.clientX, ev.clientY);
      if (ui.tool === "sticky") {
        var s = addSticky(ui.board.id, { x: Math.round(w.x - 110), y: Math.round(w.y - 40) });
        renderStickies(); paintArrows();
        ui.selectedEl = s.id; paintSelection();
        toast("Sticky added");
        return;
      }
      if (ui.tool === "draw") {
        drawPts = [[w.x, w.y]];
        showPreview(drawPts);
        return;
      }
      if (ui.tool === "frame") {
        frameStart = { x: w.x, y: w.y };
        return;
      }
      if (ui.tool === "arrow") { ui.pendingArrowFrom = null; renderStickies(); return; }
      /* select tool, or space held: pan */
      panStart = { x: ev.clientX, y: ev.clientY, vx: view().x, vy: view().y };
    });

    vp.addEventListener("pointermove", function (ev) {
      if (!pointers[ev.pointerId]) return;
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ks = Object.keys(pointers);
      if (ks.length === 2 && pinchStart) {
        var p1 = pointers[ks[0]], p2 = pointers[ks[1]];
        var d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (d > 0) {
          var v = view();
          var cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
          var r = vp.getBoundingClientRect();
          var before = { x: (pinchStart.cx - r.left - v.x) / v.zoom, y: (pinchStart.cy - r.top - v.zoom) / v.zoom };
          v.zoom = clamp(pinchStart.zoom * d / pinchStart.d, 0.25, 4);
          v.x = cx - r.left - before.x * v.zoom;
          v.y = cy - r.top - before.y * v.zoom;
          applyView();
        }
        return;
      }
      if (drawPts) {
        var w = screenToWorld(ev.clientX, ev.clientY);
        var last = drawPts[drawPts.length - 1];
        if (Math.hypot(w.x - last[0], w.y - last[1]) > 2 / view().zoom) {
          drawPts.push([w.x, w.y]);
          showPreview(drawPts);
        }
        return;
      }
      if (frameStart) { drawFrameGhost(frameStart, screenToWorld(ev.clientX, ev.clientY)); return; }
      if (panStart) {
        var v2 = view();
        v2.x = panStart.vx + (ev.clientX - panStart.x);
        v2.y = panStart.vy + (ev.clientY - panStart.y);
        applyView();
      }
    });
    function endPointer(ev) {
      delete pointers[ev.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
      if (drawPts) {
        var pts = drawPts; drawPts = null; hidePreview();
        if (pts.length >= 2) { addStroke(ui.board.id, pts, ui.drawColor, ui.drawWidth); renderStrokes(); }
        return;
      }
      if (frameStart) {
        var w = screenToWorld(ev.clientX, ev.clientY);
        var fs = frameStart; frameStart = null; clearFrameGhost();
        var fw = Math.abs(w.x - fs.x), fh = Math.abs(w.y - fs.y);
        if (fw > 40 && fh > 30) {
          addFrame(ui.board.id, { x: Math.round(Math.min(fs.x, w.x)), y: Math.round(Math.min(fs.y, w.y)), w: Math.round(fw), h: Math.round(fh) });
          renderFrames();
          toast("Section frame added");
        }
        return;
      }
      if (panStart) { panStart = null; saveBoardSoon(); }
    }
    vp.addEventListener("pointerup", endPointer);
    vp.addEventListener("pointercancel", endPointer);

    vp.addEventListener("wheel", function (ev) {
      if (!ui.board) return;
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX, ev.clientY);
      } else {
        var v = view();
        var f = ev.deltaMode === 1 ? 16 : 1;
        v.x -= (ev.shiftKey ? ev.deltaY : ev.deltaX) * f;
        v.y -= (ev.shiftKey ? 0 : ev.deltaY) * f;
        applyView(); saveBoardSoon();
      }
    }, { passive: false });

    document.addEventListener("keydown", function (ev) {
      if (ui.screen !== "board" || !ui.visible) return;
      var t = ev.target;
      var tag = (t && t.tagName ? t.tagName : "").toLowerCase();
      var editing = tag === "input" || tag === "textarea" || (t && t.isContentEditable);
      if (ev.key === " ") { ui.spaceDown = true; }
      if (ev.key === "Escape") {
        if (ui.pendingArrowFrom) { ui.pendingArrowFrom = null; renderStickies(); updateHint("Connector cancelled."); }
        ui.selectedEl = null; paintSelection();
      }
      if (editing) return;
      var k = ev.key.toLowerCase();
      if (k === "v") setTool("select");
      else if (k === "s") setTool("sticky");
      else if (k === "d") setTool("draw");
      else if (k === "a") setTool("arrow");
      else if (k === "f") setTool("frame");
      else if (k === "e") setTool("eraser");
      else if ((ev.key === "Delete" || ev.key === "Backspace") && ui.selectedEl) {
        ev.preventDefault();
        deleteEl(ui.board.id, ui.selectedEl);
        ui.selectedEl = null;
        renderBoard();
        toast("Deleted");
      } else if ((ev.ctrlKey || ev.metaKey) && (k === "=" || k === "+")) { ev.preventDefault(); zoomBy(1.25); }
      else if ((ev.ctrlKey || ev.metaKey) && k === "-") { ev.preventDefault(); zoomBy(1 / 1.25); }
      else if ((ev.ctrlKey || ev.metaKey) && k === "0") { ev.preventDefault(); fitBoard(); }
    });
    document.addEventListener("keyup", function (ev) { if (ev.key === " ") ui.spaceDown = false; });

    function showPreview(pts) {
      preview = preview || document.getElementById("mem-preview");
      if (!preview) return;
      preview.classList.remove("hidden");
      preview.setAttribute("d", ptsToPath(pts));
      preview.setAttribute("stroke", ui.drawColor);
      preview.setAttribute("stroke-width", ui.drawWidth);
    }
    function hidePreview() {
      preview = preview || document.getElementById("mem-preview");
      if (preview) preview.classList.add("hidden");
    }
    var ghost = null;
    function drawFrameGhost(a, b) {
      clearFrameGhost();
      ghost = document.createElementNS(SVGNS, "rect");
      ghost.setAttribute("x", Math.min(a.x, b.x)); ghost.setAttribute("y", Math.min(a.y, b.y));
      ghost.setAttribute("width", Math.abs(b.x - a.x)); ghost.setAttribute("height", Math.abs(b.y - a.y));
      ghost.setAttribute("fill", "rgba(139,92,246,0.08)");
      ghost.setAttribute("stroke", "#8B5CF6"); ghost.setAttribute("stroke-dasharray", "6 4");
      ghost.setAttribute("pointer-events", "none");
      document.getElementById("mem-boardSvg").appendChild(ghost);
    }
    function clearFrameGhost() { if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); ghost = null; }
  }

  /* ================= commands ================= */
  function openMemApp() {
    if (T.ecosystem && typeof T.ecosystem.openApp === "function") T.ecosystem.openApp("mem");
    else show();
  }
  if (typeof T.register === "function") {
    T.register("mem.open", function () { openMemApp(); },
      { title: "Open MEM notes", cat: "NXT", icon: "i-file", match: "mem notes whiteboard open" });
    T.register("mem.home", function () { openMemApp(); goHome(); },
      { title: "MEM home", cat: "NXT", icon: "i-grid", match: "mem home start" });
    T.register("mem.new", function () {
      openMemApp(); goMasonry();
      var n = addNote("note"); renderMasonry(); focusNoteCard(n.id);
    }, { title: "New MEM note", cat: "NXT", icon: "i-plus", match: "mem new note create" });
    T.register("mem.new-checklist", function () {
      openMemApp(); goMasonry();
      var n = addNote("checklist"); renderMasonry(); focusNoteCard(n.id);
    }, { title: "New MEM checklist", cat: "NXT", icon: "i-checklist", match: "mem checklist todo" });
    T.register("mem.new-board", function () {
      openMemApp();
      var b = addBoard(); openBoard(b.id);
    }, { title: "New MEM whiteboard", cat: "NXT", icon: "i-shapes", match: "mem new board whiteboard" });
  }

  /* ================= bus ================= */
  T.bus.on("ecosystem:app", function (d) {
    if (d && d.app === "mem") show();
    else hide();
  });

  /* ================= public API ================= */
  T.mem = {
    show: show, hide: hide,
    goHome: goHome, goMasonry: goMasonry, openBoard: openBoard,
    addNote: addNote, deleteNote: deleteNote, duplicateNote: duplicateNote,
    addBoard: addBoard, deleteBoard: deleteBoard,
    addSticky: addSticky, moveSticky: moveSticky,
    addStroke: addStroke, addFrame: addFrame, addArrow: addArrow, deleteEl: deleteEl,
    sendToTxt: sendToTxt, noteToText: noteToText, stickyToText: stickyToText,
    setTagFilter: setTagFilter, setTool: setTool,
    getNotes: getNotes, getBoards: getBoards, getBoard: getBoard,
    zoomBy: zoomBy, fitBoard: fitBoard,
    settings: memSettings, setSettings: saveMemSettings,
    files: memFiles, snapPoint: snapPoint, duplicateBoard: duplicateBoard,
    openSettings: openSettings, closeSettings: closeSettings,
    isBuilt: function () { return ui.built; },
    visible: function () { return ui.visible; },
    screen: function () { return ui.screen; },
    currentBoard: function () { return ui.board; }
  };
})();
