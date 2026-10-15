/* DCK slide deck app (TXT ecosystem, v5 wave).
   Fills #view-dck. Homescreen (start view) + slide editor + presenter mode
   + TXT-to-DCK document generator + live GRD chart blocks.

   Dependency-free IIFE. Persists via T.store ('dck' namespace: decks, recent,
   pendingLive). Commands registered with the dck. prefix.
   Events: 'ecosystem:app' (bus), 'dck:generate', 'grd:live', 'grd:update'
   (store bus). No emojis, no em dashes, no CSS zoom, no alert(). */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  /* ============================================================
     utils
     ============================================================ */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function esc(s) {
    if (T.esc) return T.esc(s);
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function uid() {
    if (typeof T.uid === "function") return "dck-" + T.uid();
    return "dck-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function debounce(fn, ms) {
    if (typeof T.debounce === "function") return T.debounce(fn, ms);
    var t = null;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }
  function toast(msg, kind) { if (typeof T.toast === "function") T.toast(msg, kind); }
  function isMyText(s) { return /[\u1000-\u109F]/.test(String(s || "")); }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return ""; }
  }

  /* ============================================================
     model: layouts, themes, gradients, transitions
     ============================================================ */
  var LAYOUTS = {
    cover:   { name: "Executive Title",        hint: "Big title + subtitle" },
    compare: { name: "Two-Column Comparison",  hint: "Side-by-side columns" },
    kpi:     { name: "Big KPI Metric Callout", hint: "One giant number" },
    chart:   { name: "Live GRD Chart + Bullets", hint: "Chart left, bullets right" },
    roadmap: { name: "Roadmap Timeline",       hint: "Milestones across time" },
    blank:   { name: "Blank",                  hint: "Empty canvas" }
  };
  var THEMES = [
    { id: "studio",   name: "Studio",   bg: "#FFFFFF", bg2: "#EDF1F7", ink: "#111827", accent: "#2563EB" },
    { id: "obsidian", name: "Obsidian", bg: "#181A24", bg2: "#090A0F", ink: "#F9FAFB", accent: "#3B82F6" },
    { id: "carbon",   name: "Carbon",   bg: "#2D2D30", bg2: "#1E1E1E", ink: "#F3F4F6", accent: "#FF9A00" },
    { id: "paper",    name: "Paper",    bg: "#F4EFE6", bg2: "#EAE4D7", ink: "#2C251E", accent: "#9A6B2F" },
    { id: "sunset",   name: "Sunset",   bg: "#FFF1E6", bg2: "#FBD3A8", ink: "#431407", accent: "#F97316" },
    { id: "ocean",    name: "Ocean",    bg: "#E0F2FE", bg2: "#B7E0FB", ink: "#0C4A6E", accent: "#0284C7" }
  ];
  var GRADIENTS = [
    { id: "none",   name: "Solid",    css: null },
    { id: "g1",     name: "Sunrise",  css: "linear-gradient(135deg,#FFF1E6,#FBD3A8)" },
    { id: "g2",     name: "Midnight", css: "linear-gradient(135deg,#181A24,#090A0F)" },
    { id: "g3",     name: "Ember",    css: "linear-gradient(135deg,#2D2D30,#1E1E1E)" },
    { id: "g4",     name: "Lagoon",   css: "linear-gradient(135deg,#E0F2FE,#B7E0FB)" },
    { id: "g5",     name: "Brand",    css: "linear-gradient(135deg,#F97316,#C2410C)" }
  ];
  var TRANSITIONS = [
    { id: "none",       name: "None" },
    { id: "fade-up",    name: "Fade Up" },
    { id: "zoom-in",    name: "Zoom In" },
    { id: "slide-left", name: "Slide Left" }
  ];
  var TEMPLATES = [
    { id: "blank",  name: "Blank",           desc: "One empty slide" },
    { id: "pitch",  name: "Executive Pitch", desc: "Cover, problem, solution, KPI, roadmap" },
    { id: "kpi",    name: "KPI Review",      desc: "Cover, two metrics, live chart" }
  ];

  function themeOf(deck) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === (deck && deck.theme)) return THEMES[i];
    }
    return THEMES[0];
  }
  function gradientCss(deck) {
    if (!deck || !deck.gradient || deck.gradient === "none") return null;
    for (var i = 0; i < GRADIENTS.length; i++) {
      if (GRADIENTS[i].id === deck.gradient) return GRADIENTS[i].css;
    }
    return null;
  }

  /* ============================================================
     persistence
     ============================================================ */
  function loadDecks() {
    var d = (T.store && T.store.get) ? T.store.get("dck", "decks") : null;
    return (d && typeof d === "object") ? d : {};
  }
  function saveDecks(decks) {
    if (T.store && T.store.set) T.store.set("dck", "decks", decks || {});
  }
  function getDeck(id) { return loadDecks()[id] || null; }
  function putDeck(deck) {
    var decks = loadDecks();
    deck.updatedAt = Date.now();
    decks[deck.id] = deck;
    saveDecks(decks);
    touchRecent(deck);
  }
  function touchRecent(deck) {
    var r = (T.store && T.store.get) ? (T.store.get("dck", "recent") || []) : [];
    r = r.filter(function (x) { return x && x.id !== deck.id; });
    r.unshift({ id: deck.id, title: deck.title || "Untitled deck", updatedAt: deck.updatedAt || Date.now() });
    r = r.slice(0, 20);
    if (T.store && T.store.set) T.store.set("dck", "recent", r);
  }
  function dropRecent(id) {
    var r = (T.store && T.store.get) ? (T.store.get("dck", "recent") || []) : [];
    r = r.filter(function (x) { return x && x.id !== id; });
    if (T.store && T.store.set) T.store.set("dck", "recent", r);
  }
  function getPendingLive() {
    var p = (T.store && T.store.get) ? T.store.get("dck", "pendingLive") : null;
    return Array.isArray(p) ? p : [];
  }
  function setPendingLive(list) {
    if (T.store && T.store.set) T.store.set("dck", "pendingLive", list || []);
  }

  /* ============================================================
     per-app settings (persisted via T.store in the 'dck' namespace)
     ============================================================ */
  var DEFAULT_SETTINGS = {
    aspect: "16:9",      // default aspect ratio for newly created decks/slides
    transition: "fade",  // presenter entrance: none | fade | slide
    timer: true,         // show the elapsed timer in presenter mode
    spellcheck: true     // spellcheck on slide text editing surfaces
  };
  var SETTING_TRANSITIONS = { none: "none", fade: "fade-up", slide: "slide-left" };
  function getSettings() {
    var s = (T.store && T.store.get) ? T.store.get("dck", "settings") : null;
    var out = {}, k;
    for (k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k];
    if (s && typeof s === "object") {
      for (k in DEFAULT_SETTINGS) {
        if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
      }
    }
    return out;
  }
  function saveSettings(s) {
    if (T.store && T.store.set) T.store.set("dck", "settings", s);
  }
  function applySettings() {
    if (!built) return;
    if (view === "editor" && currentDeck()) {
      renderStage();
      renderFilmstrip();
    }
  }
  /* aspect ratio for a deck: the deck's own value (seeded from settings at
     creation), falling back to the live setting, then 16:9 */
  function settingsAspectRatio(deck) {
    var a = (deck && deck.aspect) || getSettings().aspect || "16:9";
    return a === "4:3" ? "4 / 3" : "16 / 9";
  }

  /* ============================================================
     slide / block factories
     ============================================================ */
  function mkSlide(layout) {
    return { id: uid(), layout: layout || "blank", blocks: [], notes: "" };
  }
  function mkBlock(type, geo, data) {
    var b = {
      id: uid(), type: type,
      x: geo.x, y: geo.y, w: geo.w, h: geo.h,
      html: "", text: "", rows: null, gridId: null, label: "", values: null,
      shape: "rect", fill: "#F97316", src: "", z: 0
    };
    data = data || {};
    for (var k in data) b[k] = data[k];
    return b;
  }
  /* default blocks per layout (geometry in % of the 16:9 stage) */
  function layoutBlocks(layout, theme) {
    var acc = (theme && theme.accent) || "#F97316";
    var ink = (theme && theme.ink) || "#111827";
    switch (layout) {
      case "cover":
        return [
          mkBlock("text", { x: 8, y: 26, w: 84, h: 22 },
            { html: "Deck title", cls: "dck-b-title", color: ink }),
          mkBlock("text", { x: 8, y: 50, w: 84, h: 12 },
            { html: "Subtitle goes here", cls: "dck-b-subtitle" })
        ];
      case "compare":
        return [
          mkBlock("text", { x: 6, y: 4, w: 88, h: 12 }, { html: "Comparison", cls: "dck-b-h2" }),
          mkBlock("bullets", { x: 6, y: 20, w: 40, h: 70 },
            { items: ["Point one", "Point two"], cls: "dck-b-body" }),
          mkBlock("bullets", { x: 54, y: 20, w: 40, h: 70 },
            { items: ["Point one", "Point two"], cls: "dck-b-body" })
        ];
      case "kpi":
        return [
          mkBlock("text", { x: 6, y: 6, w: 88, h: 12 }, { html: "Key metric", cls: "dck-b-h2" }),
          mkBlock("text", { x: 6, y: 26, w: 88, h: 30 },
            { html: "0", cls: "dck-b-kpi", color: acc }),
          mkBlock("text", { x: 6, y: 60, w: 88, h: 12 },
            { html: "Metric label", cls: "dck-b-body" })
        ];
      case "chart":
        return [
          mkBlock("text", { x: 5, y: 4, w: 90, h: 12 }, { html: "Live data", cls: "dck-b-h2" }),
          mkBlock("grd", { x: 5, y: 20, w: 56, h: 70 }, { label: "No live data yet", html: "" }),
          mkBlock("bullets", { x: 65, y: 20, w: 30, h: 70 },
            { items: ["Insight one", "Insight two"], cls: "dck-b-body" })
        ];
      case "roadmap":
        return [
          mkBlock("text", { x: 6, y: 4, w: 88, h: 12 }, { html: "Roadmap", cls: "dck-b-h2" }),
          mkBlock("text", { x: 6, y: 30, w: 20, h: 40 }, { html: "Q1", cls: "dck-b-mile" }),
          mkBlock("text", { x: 28, y: 30, w: 20, h: 40 }, { html: "Q2", cls: "dck-b-mile" }),
          mkBlock("text", { x: 52, y: 30, w: 20, h: 40 }, { html: "Q3", cls: "dck-b-mile" }),
          mkBlock("text", { x: 76, y: 30, w: 18, h: 40 }, { html: "Q4", cls: "dck-b-mile" })
        ];
      default:
        return [];
    }
  }
  function newDeck(title, templateId) {
    var st = getSettings();
    var deck = {
      id: uid(), title: title || "Untitled deck",
      theme: "studio", gradient: "none",
      transition: SETTING_TRANSITIONS[st.transition] || "fade-up",
      aspect: st.aspect || "16:9",
      slides: [], createdAt: Date.now(), updatedAt: Date.now()
    };
    var theme = themeOf(deck);
    function add(layout) {
      var s = mkSlide(layout);
      s.blocks = layoutBlocks(layout, theme);
      deck.slides.push(s);
      return s;
    }
    if (templateId === "pitch") {
      add("cover"); add("compare"); add("compare"); add("kpi"); add("roadmap");
    } else if (templateId === "kpi") {
      add("cover"); add("kpi"); add("kpi"); add("chart");
    } else {
      add("blank");
    }
    putDeck(deck);
    return deck;
  }

  /* ============================================================
     state
     ============================================================ */
  var built = false;
  var view = "home";            // 'home' | 'editor'
  var curDeckId = null;
  var curSlideIdx = 0;
  var selBlockId = null;
  var presenting = null;        // {deck, idx, startTs, timer}
  var laserOn = false;
  var saveSoon = debounce(function () { saveCurrent(); }, 400);

  function currentDeck() { return curDeckId ? getDeck(curDeckId) : null; }
  function currentSlide() {
    var d = currentDeck();
    if (!d || !d.slides.length) return null;
    curSlideIdx = clamp(curSlideIdx, 0, d.slides.length - 1);
    return d.slides[curSlideIdx];
  }
  function saveCurrent() {
    var d = currentDeck();
    if (d) putDeck(d);
  }

  /* ============================================================
     slide ops (exposed for tests)
     ============================================================ */
  function addSlide(layout) {
    var d = currentDeck();
    if (!d) return null;
    var s = mkSlide(layout || "blank");
    s.blocks = layoutBlocks(s.layout, themeOf(d));
    d.slides.splice(curSlideIdx + 1, 0, s);
    curSlideIdx = curSlideIdx + 1;
    selBlockId = null;
    putDeck(d);
    renderEditor();
    return s;
  }
  function duplicateSlide() {
    var d = currentDeck(), s = currentSlide();
    if (!d || !s) return null;
    var copy = JSON.parse(JSON.stringify(s));
    copy.id = uid();
    copy.blocks.forEach(function (b) { b.id = uid(); });
    d.slides.splice(curSlideIdx + 1, 0, copy);
    curSlideIdx = curSlideIdx + 1;
    putDeck(d);
    renderEditor();
    return copy;
  }
  function deleteSlide() {
    var d = currentDeck();
    if (!d || !d.slides.length) return false;
    confirmInline("Delete this slide?", function (yes) {
      if (!yes) return;
      var dd = currentDeck();
      dd.slides.splice(curSlideIdx, 1);
      if (!dd.slides.length) { var s = mkSlide("blank"); dd.slides.push(s); }
      curSlideIdx = clamp(curSlideIdx, 0, dd.slides.length - 1);
      selBlockId = null;
      putDeck(dd);
      renderEditor();
      toast("Slide deleted.");
    });
    return true;
  }
  function moveSlide(dir) {
    var d = currentDeck();
    if (!d) return;
    var i = curSlideIdx, j = i + dir;
    if (j < 0 || j >= d.slides.length) return;
    var tmp = d.slides[i]; d.slides[i] = d.slides[j]; d.slides[j] = tmp;
    curSlideIdx = j;
    putDeck(d);
    renderEditor();
  }
  function setSlideLayout(slide, layout) {
    if (!slide || !LAYOUTS[layout]) return false;
    var d = currentDeck();
    function apply() {
      slide.layout = layout;
      slide.blocks = layoutBlocks(layout, themeOf(d || { theme: "studio" }));
      selBlockId = null;
      if (d) putDeck(d);
      renderEditor();
    }
    if (slide.blocks && slide.blocks.length) {
      confirmInline("Replace this slide's content with the \"" + LAYOUTS[layout].name + "\" layout?", function (yes) {
        if (yes) apply();
      });
    } else {
      apply();
    }
    return true;
  }
  function insertBlock(type, data) {
    var d = currentDeck(), s = currentSlide();
    if (!d || !s) return null;
    var theme = themeOf(d);
    var geo = { x: 30, y: 35, w: 40, h: 30 };
    if (type === "text") { geo = { x: 10, y: 40, w: 80, h: 20 }; }
    if (type === "bullets") { geo = { x: 10, y: 25, w: 80, h: 60 }; }
    if (type === "image") { geo = { x: 28, y: 22, w: 44, h: 56 }; }
    if (type === "table") { geo = { x: 8, y: 28, w: 84, h: 55 }; }
    if (type === "grd") { geo = { x: 5, y: 18, w: 56, h: 68 }; }
    if (type === "shape") { geo = { x: 38, y: 38, w: 24, h: 24 }; }
    var b = mkBlock(type, geo, data || {});
    if (type === "text" && !b.html) b.html = "New text";
    if (type === "bullets" && !b.items) b.items = ["New bullet"];
    if (type === "shape" && !b.fill) b.fill = theme.accent;
    b.z = s.blocks.length ? Math.max.apply(null, s.blocks.map(function (x) { return x.z || 0; })) + 1 : 1;
    s.blocks.push(b);
    selBlockId = b.id;
    putDeck(d);
    renderEditor();
    return b;
  }
  function deleteBlock() {
    var d = currentDeck(), s = currentSlide();
    if (!d || !s || !selBlockId) return false;
    s.blocks = s.blocks.filter(function (b) { return b.id !== selBlockId; });
    selBlockId = null;
    putDeck(d);
    renderEditor();
    return true;
  }
  function shiftBlockZ(dir) {
    var d = currentDeck(), s = currentSlide();
    if (!d || !s || !selBlockId) return;
    var b = null;
    s.blocks.forEach(function (x) { if (x.id === selBlockId) b = x; });
    if (!b) return;
    b.z = (b.z || 0) + dir;
    putDeck(d);
    renderEditor();
  }

  /* ============================================================
     inline confirm dialog (no alert())
     ============================================================ */
  function confirmInline(message, cb) {
    var root = $("dck-root");
    var ov = el("div", "dck-confirm-ov");
    ov.id = "dck-confirm";
    var box = el("div", "dck-confirm");
    box.appendChild(el("p", "dck-confirm-msg", message));
    var row = el("div", "dck-confirm-row");
    var no = el("button", "dck-btn", "Cancel");
    no.id = "dck-confirm-no";
    var yes = el("button", "dck-btn dck-btn-danger", "Delete");
    yes.id = "dck-confirm-yes";
    row.appendChild(no); row.appendChild(yes);
    box.appendChild(row);
    ov.appendChild(box);
    (root || document.body).appendChild(ov);
    function done(v) {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.removeEventListener("keydown", onKey, true);
      cb(v);
    }
    function onKey(e) { if (e.key === "Escape") done(false); }
    document.addEventListener("keydown", onKey, true);
    no.addEventListener("click", function () { done(false); });
    yes.addEventListener("click", function () { done(true); });
    ov.addEventListener("click", function (e) { if (e.target === ov) done(false); });
    setTimeout(function () { try { yes.focus(); } catch (e) {} }, 30);
  }

  /* ============================================================
     block rendering
     ============================================================ */
  function blockEl(b, deck, mode) {
    // mode: 'stage' | 'thumb' | 'present'
    var n = el("div", "dck-block dck-b-" + b.type);
    n.setAttribute("data-bid", b.id);
    n.style.left = b.x + "%";
    n.style.top = b.y + "%";
    n.style.width = b.w + "%";
    n.style.height = b.h + "%";
    n.style.zIndex = String(10 + (b.z || 0));
    var theme = themeOf(deck);
    if (b.color) n.style.color = b.color;
    if (b.type === "text") {
      n.classList.add(b.cls || "dck-b-body");
      if (mode === "stage") {
        n.contentEditable = "true";
        n.spellcheck = getSettings().spellcheck;
      }
      n.innerHTML = b.html || "";
      if (isMyText(n.textContent)) n.setAttribute("lang", "my");
      if (mode === "stage") {
        n.addEventListener("input", function () {
          if (isMyText(n.textContent)) n.setAttribute("lang", "my");
          else n.removeAttribute("lang");
          b.html = n.innerHTML;
          saveSoon();
        });
        n.addEventListener("blur", function () { b.html = n.innerHTML; saveCurrent(); });
      }
    } else if (b.type === "bullets") {
      n.classList.add(b.cls || "dck-b-body");
      var ul = el("ul", "dck-bullets");
      (b.items || []).forEach(function (it) {
        var li = document.createElement("li");
        if (mode === "stage") {
          li.contentEditable = "true";
          li.spellcheck = getSettings().spellcheck;
        }
        li.textContent = it;
        ul.appendChild(li);
      });
      n.appendChild(ul);
      if (mode === "stage") {
        ul.addEventListener("input", function () {
          b.items = Array.prototype.map.call(ul.querySelectorAll("li"), function (li) { return li.textContent; });
          saveSoon();
        });
        ul.addEventListener("blur", function () {
          b.items = Array.prototype.map.call(ul.querySelectorAll("li"), function (li) { return li.textContent; });
          saveCurrent();
        }, true);
      }
    } else if (b.type === "shape") {
      n.classList.add("dck-shape");
      n.style.background = b.fill || theme.accent;
      if (b.shape === "ellipse") n.style.borderRadius = "50%";
    } else if (b.type === "image") {
      var img = document.createElement("img");
      img.src = b.src || "";
      img.alt = "Slide image";
      img.draggable = false;
      n.appendChild(img);
    } else if (b.type === "table") {
      n.appendChild(tableFromRows(b.rows || []));
    } else if (b.type === "grd") {
      var badge = el("span", "dck-live-badge", "LIVE - GRD");
      n.appendChild(badge);
      if (b.label) n.appendChild(el("div", "dck-grd-label", b.label));
      var holder = el("div", "dck-grd-html");
      holder.innerHTML = b.html || "<p class=\"dck-grd-empty\">Waiting for live GRD data.</p>";
      n.appendChild(holder);
    }
    if (mode === "stage") {
      if (b.id === selBlockId) n.classList.add("sel");
      n.addEventListener("pointerdown", function (e) { onBlockPointerDown(e, b, n, "move"); });
      var mv = el("span", "dck-move", "");
      mv.id = "dck-move-" + b.id;
      mv.title = "Drag to move";
      mv.setAttribute("aria-label", "Move block");
      mv.addEventListener("pointerdown", function (e) { onBlockPointerDown(e, b, n, "move"); });
      n.appendChild(mv);
      var rs = el("span", "dck-resize", "");
      rs.id = "dck-resize-" + b.id;
      rs.title = "Drag to resize";
      rs.setAttribute("aria-label", "Resize block");
      rs.addEventListener("pointerdown", function (e) { onBlockPointerDown(e, b, n, "resize"); });
      n.appendChild(rs);
    }
    return n;
  }
  function tableFromRows(rows) {
    var t = document.createElement("table");
    t.className = "dck-table";
    rows.forEach(function (row, ri) {
      var tr = document.createElement("tr");
      row.forEach(function (cell) {
        var c = document.createElement(ri === 0 ? "th" : "td");
        c.textContent = cell == null ? "" : String(cell);
        tr.appendChild(c);
      });
      t.appendChild(tr);
    });
    return t;
  }
  function valuesToHtml(values) {
    if (!Array.isArray(values) || !values.length) return "";
    var rows = values.map(function (r) {
      return Array.isArray(r) ? r : [r];
    });
    var div = document.createElement("div");
    div.appendChild(tableFromRows(rows.map(function (r) {
      return r.map(function (c) { return c == null ? "" : String(c); });
    })));
    return div.innerHTML;
  }

  /* ============================================================
     drag / resize with snap guides
     ============================================================ */
  var dragState = null;
  function stageRect() {
    var st = $("dck-stage");
    return st ? st.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 450 };
  }
  function showGuides(stage, vx, hx) {
    hideGuides(stage);
    if (vx !== null) {
      var g = el("div", "dck-guide-v");
      g.style.left = vx + "%";
      stage.appendChild(g);
    }
    if (hx !== null) {
      var g2 = el("div", "dck-guide-h");
      g2.style.top = hx + "%";
      stage.appendChild(g2);
    }
  }
  function hideGuides(stage) {
    if (!stage) return;
    Array.prototype.forEach.call(stage.querySelectorAll(".dck-guide-v,.dck-guide-h"), function (g) {
      g.parentNode.removeChild(g);
    });
  }
  function snapVal(v, targets, tol) {
    for (var i = 0; i < targets.length; i++) {
      if (Math.abs(v - targets[i]) <= tol) return { v: targets[i], hit: true };
    }
    return { v: v, hit: false };
  }
  function onBlockPointerDown(e, b, node, mode) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target && e.target.isContentEditable && mode === "move" &&
        !e.target.classList.contains("dck-move") && !e.target.classList.contains("dck-resize")) {
      // let text editing win when the caret is already inside; still select
      selectBlock(b.id, false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    selectBlock(b.id, true);
    var r = stageRect();
    dragState = {
      b: b, node: node, mode: mode,
      sx: e.clientX, sy: e.clientY,
      ox: b.x, oy: b.y, ow: b.w, oh: b.h,
      rw: r.width || 1, rh: r.height || 1
    };
    try { node.setPointerCapture(e.pointerId); } catch (err) {}
    node.addEventListener("pointermove", onDragMove);
    node.addEventListener("pointerup", onDragEnd, { once: true });
    node.addEventListener("pointercancel", onDragEnd, { once: true });
  }
  function onDragMove(e) {
    var ds = dragState;
    if (!ds) return;
    var dxp = ((e.clientX - ds.sx) / ds.rw) * 100;
    var dyp = ((e.clientY - ds.sy) / ds.rh) * 100;
    var stage = $("dck-stage");
    var tol = 1.2, gv = null, gh = null;
    if (ds.mode === "move") {
      var nx = clamp(ds.ox + dxp, 0, 100 - ds.ow);
      var ny = clamp(ds.oy + dyp, 0, 100 - ds.oh);
      var s = currentSlide();
      var tx = [0, 50 - ds.ow / 2, 100 - ds.ow];
      var ty = [0, 50 - ds.oh / 2, 100 - ds.oh];
      if (s) {
        s.blocks.forEach(function (o) {
          if (o.id === ds.b.id) return;
          tx.push(o.x, o.x + o.w - ds.ow, o.x + o.w / 2 - ds.ow / 2);
          ty.push(o.y, o.y + o.h - ds.oh, o.y + o.h / 2 - ds.oh / 2);
        });
      }
      var sxr = snapVal(nx, tx, tol), syr = snapVal(ny, ty, tol);
      nx = sxr.v; ny = syr.v;
      if (sxr.hit) gv = nx + ds.ow / 2 <= 50.6 && nx + ds.ow / 2 >= 49.4 ? 50 : (Math.abs(nx) < tol ? 0 : (Math.abs(nx + ds.ow - 100) < tol ? 100 : null));
      if (syr.hit) gh = Math.abs(ny + ds.oh / 2 - 50) < tol ? 50 : (Math.abs(ny) < tol ? 0 : (Math.abs(ny + ds.oh - 100) < tol ? 100 : null));
      ds.b.x = Math.round(nx * 100) / 100;
      ds.b.y = Math.round(ny * 100) / 100;
      ds.node.style.left = ds.b.x + "%";
      ds.node.style.top = ds.b.y + "%";
      showGuides(stage, gv, gh);
    } else {
      var nw = clamp(ds.ow + dxp, 5, 100 - ds.ox);
      var nh = clamp(ds.oh + dyp, 5, 100 - ds.oy);
      ds.b.w = Math.round(nw * 100) / 100;
      ds.b.h = Math.round(nh * 100) / 100;
      ds.node.style.width = ds.b.w + "%";
      ds.node.style.height = ds.b.h + "%";
    }
  }
  function onDragEnd(e) {
    var ds = dragState;
    dragState = null;
    if (!ds) return;
    ds.node.removeEventListener("pointermove", onDragMove);
    hideGuides($("dck-stage"));
    saveCurrent();
  }
  function selectBlock(id, rerender) {
    selBlockId = id;
    if (rerender !== false) renderStage();
    else {
      var st = $("dck-stage");
      if (st) {
        Array.prototype.forEach.call(st.querySelectorAll(".dck-block"), function (n) {
          n.classList.toggle("sel", n.getAttribute("data-bid") === id);
        });
      }
    }
    renderBlockBar();
  }

  /* ============================================================
     homescreen
     ============================================================ */
  function buildHome(root) {
    var home = el("div", "eco-home");
    home.id = "dck-home";
    var head = el("div", "eco-home-head");
    var badge = el("span", "app-badge", "DCK");
    badge.id = "dck-badge";
    badge.style.background = "#F97316";
    head.appendChild(badge);
    var htxt = el("div");
    htxt.appendChild(el("h1", null, "DCK"));
    htxt.appendChild(el("p", null, "Slide decks that build themselves."));
    head.appendChild(htxt);
    var spacer = el("div", "spacer");
    head.appendChild(spacer);
    var search = document.createElement("input");
    search.id = "dck-home-search";
    search.className = "eco-home-search";
    search.type = "search";
    search.placeholder = "Search decks";
    search.setAttribute("aria-label", "Search decks");
    head.appendChild(search);
    home.appendChild(head);

    var gen = el("button", "dck-btn dck-btn-accent dck-gen", "Generate Slide Deck from TXT Document");
    gen.id = "dck-gen-btn";
    gen.addEventListener("click", function () { generateFromDocument(); });
    home.appendChild(gen);

    var secT = el("div", "eco-home-sec");
    secT.appendChild(el("h2", null, "Start new"));
    var tplWrap = el("div", "eco-home-new");
    tplWrap.id = "dck-home-new";
    TEMPLATES.forEach(function (t) {
      var card = el("button", "eco-home-tpl");
      card.id = "dck-tpl-" + t.id;
      card.appendChild(el("strong", null, t.name));
      card.appendChild(el("span", null, t.desc));
      card.setAttribute("aria-label", "New deck from template: " + t.name);
      (function (tpl) {
        card.addEventListener("click", function () {
          var deck = newDeck(tpl.name + " deck", tpl.id);
          openEditor(deck.id);
        });
      })(t);
      tplWrap.appendChild(card);
    });
    secT.appendChild(tplWrap);
    home.appendChild(secT);

    var secR = el("div", "eco-home-sec");
    var secRHead = el("div", "dck-sec-head");
    secRHead.appendChild(el("h2", null, "Your decks"));
    var newDeckBtn = el("button", "dck-btn dck-btn-accent dck-filebtn", "New deck");
    newDeckBtn.id = "dck-new-deck";
    newDeckBtn.setAttribute("aria-label", "Create a new deck");
    newDeckBtn.addEventListener("click", function () {
      var rec = files.create("Untitled deck");
      if (rec) openEditor(rec.id);
    });
    secRHead.appendChild(newDeckBtn);
    secR.appendChild(secRHead);
    var grid = el("div", "eco-home-grid");
    grid.id = "dck-home-recent";
    secR.appendChild(grid);
    var empty = el("div", "eco-home-empty", "No decks yet. Generate one from your document or start from a template.");
    empty.id = "dck-home-empty";
    secR.appendChild(empty);
    home.appendChild(secR);

    var foot = el("div", "dck-home-foot", "Part of NXT Ecosystem");
    foot.id = "dck-home-footer";
    home.appendChild(foot);

    search.addEventListener("input", function () { renderRecent(search.value); });
    root.appendChild(home);
    renderRecent("");
  }
  function currentQuery() {
    var si = $("dck-home-search");
    return si ? si.value : "";
  }
  function renderRecent(query) {
    var grid = $("dck-home-recent"), empty = $("dck-home-empty");
    if (!grid) return;
    grid.innerHTML = "";
    var q = (query || "").toLowerCase();
    var shown = 0;
    files.list().forEach(function (rec) {
      if (q && rec.name.toLowerCase().indexOf(q) < 0) return;
      shown++;
      var card = el("div", "eco-home-card");
      card.id = "dck-recent-" + rec.id;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", "Open deck: " + rec.name);
      card.appendChild(el("h3", null, rec.name));
      card.appendChild(el("div", "meta", rec.slides + " slides · " + fmtDate(rec.updatedAt)));
      var row = el("div", "row");
      function act(label, suffix, aria, fn, danger) {
        var b = el("button", "dck-btn dck-filebtn" + (danger ? " dck-btn-danger" : ""), label);
        b.id = "dck-file-" + suffix + "-" + rec.id;
        b.setAttribute("aria-label", aria + ": " + rec.name);
        b.addEventListener("click", function (ev) { ev.stopPropagation(); fn(); });
        row.appendChild(b);
        return b;
      }
      act("Open", "open", "Open deck", function () { files.open(rec.id); });
      act("Rename", "rename", "Rename deck", function () { renameDeck(rec.id, rec.name); });
      act("Duplicate", "dup", "Duplicate deck", function () { files.duplicate(rec.id); });
      act("Delete", "del", "Delete deck", function () { files.remove(rec.id); }, true);
      card.appendChild(row);
      function go() { files.open(rec.id); }
      card.addEventListener("click", go);
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
      });
      grid.appendChild(card);
    });
    if (empty) empty.style.display = shown ? "none" : "";
  }

  /* ============================================================
     editor
     ============================================================ */
  function buildEditor(root) {
    var ed = el("div", "dck-editor");
    ed.id = "dck-editor";
    ed.style.display = "none";

    // toolbar
    var tb = el("div", "dck-toolbar");
    tb.id = "dck-toolbar";
    var back = el("button", "dck-btn", "Home");
    back.id = "dck-back";
    back.setAttribute("aria-label", "Back to DCK home");
    back.addEventListener("click", function () { saveCurrent(); showHome(); });
    var title = document.createElement("input");
    title.id = "dck-title";
    title.className = "dck-title-input";
    title.setAttribute("aria-label", "Deck title");
    title.addEventListener("input", function () {
      var d = currentDeck();
      if (d) { d.title = title.value; saveSoon(); }
    });
    title.addEventListener("blur", saveCurrent);
    var tbSpacer = el("div", "dck-tb-spacer");
    var bNew = el("button", "dck-btn", "New Slide");
    bNew.id = "dck-newslide";
    bNew.addEventListener("click", function () { addSlide("blank"); });
    var bGen = el("button", "dck-btn", "From Document");
    bGen.id = "dck-fromdoc";
    bGen.title = "Regenerate slides from the current TXT document";
    bGen.addEventListener("click", function () { generateFromDocument(); });
    var bPresent = el("button", "dck-btn dck-btn-accent", "Present");
    bPresent.id = "dck-presentbtn";
    bPresent.addEventListener("click", function () { present(); });
    tb.appendChild(back); tb.appendChild(title); tb.appendChild(tbSpacer);
    tb.appendChild(bNew); tb.appendChild(bGen); tb.appendChild(bPresent);
    ed.appendChild(tb);

    // insert bar
    var ib = el("div", "dck-insertbar");
    ib.id = "dck-insertbar";
    var inserts = [
      ["text", "Text"], ["bullets", "Bullets"], ["shape", "Shape"],
      ["image", "Image"], ["table", "Table"], ["grd", "Live GRD"]
    ];
    inserts.forEach(function (pair, i) {
      var b = el("button", "dck-btn dck-btn-small", pair[1]);
      b.id = "dck-ins-" + pair[0];
      b.setAttribute("aria-label", "Insert " + pair[1] + " block");
      (function (type) {
        b.addEventListener("click", function () {
          if (type === "image") { $("dck-file").click(); return; }
          if (type === "table") {
            insertBlock("table", { rows: [["Header 1", "Header 2"], ["", ""]] });
            return;
          }
          insertBlock(type);
        });
      })(pair[0]);
      ib.appendChild(b);
    });
    var file = document.createElement("input");
    file.type = "file";
    file.id = "dck-file";
    file.accept = "image/*";
    file.style.display = "none";
    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { insertBlock("image", { src: String(rd.result || "") }); };
      rd.onerror = function () { toast("Could not read that image.", "error"); };
      rd.readAsDataURL(f);
    });
    ib.appendChild(file);
    var shapeRow = el("span", "dck-shapes");
    ["rect", "ellipse"].forEach(function (sh) {
      var b = el("button", "dck-btn dck-btn-small", sh === "rect" ? "Rectangle" : "Ellipse");
      b.id = "dck-shape-" + sh;
      b.addEventListener("click", function () { insertBlock("shape", { shape: sh }); });
      shapeRow.appendChild(b);
    });
    ib.appendChild(shapeRow);
    ed.appendChild(ib);

    // main row
    var main = el("div", "dck-main");
    main.id = "dck-main";
    var fs = el("div", "dck-filmstrip");
    fs.id = "dck-filmstrip";
    fs.setAttribute("aria-label", "Slides");
    main.appendChild(fs);
    var stageWrap = el("div", "dck-stagewrap");
    stageWrap.id = "dck-stagewrap";
    var stage = el("div", "dck-stage");
    stage.id = "dck-stage";
    stageWrap.appendChild(stage);
    var blockBar = el("div", "dck-blockbar");
    blockBar.id = "dck-blockbar";
    stageWrap.appendChild(blockBar);
    main.appendChild(stageWrap);
    var insp = el("div", "dck-inspector");
    insp.id = "dck-inspector";
    main.appendChild(insp);
    ed.appendChild(main);

    // notes tray
    var notes = el("div", "dck-notes");
    notes.id = "dck-notes";
    var nhead = el("button", "dck-notes-head", "Speaker notes");
    nhead.id = "dck-notes-head";
    nhead.setAttribute("aria-expanded", "false");
    nhead.addEventListener("click", function () {
      var body = $("dck-notes-body");
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "";
      nhead.setAttribute("aria-expanded", open ? "false" : "true");
    });
    notes.appendChild(nhead);
    var nbody = el("div", "dck-notes-body");
    nbody.id = "dck-notes-body";
    nbody.style.display = "none";
    var ta = document.createElement("textarea");
    ta.id = "dck-notes-text";
    ta.placeholder = "Notes for this slide (visible in presenter mode)";
    ta.setAttribute("aria-label", "Speaker notes for current slide");
    ta.addEventListener("input", function () {
      var s = currentSlide();
      if (s) { s.notes = ta.value; saveSoon(); }
    });
    ta.addEventListener("blur", saveCurrent);
    nbody.appendChild(ta);
    notes.appendChild(nbody);
    ed.appendChild(notes);

    root.appendChild(ed);
  }

  function renderFilmstrip() {
    var fs = $("dck-filmstrip");
    if (!fs) return;
    fs.innerHTML = "";
    var d = currentDeck();
    if (!d) return;
    d.slides.forEach(function (s, i) {
      var item = el("div", "dck-thumb" + (i === curSlideIdx ? " active" : ""));
      item.id = "dck-thumb-" + s.id;
      item.draggable = true;
      item.setAttribute("data-idx", String(i));
      var mini = el("div", "dck-mini");
      mini.style.aspectRatio = settingsAspectRatio(d);
      s.blocks.forEach(function (b) { mini.appendChild(blockEl(b, d, "thumb")); });
      item.appendChild(mini);
      var meta = el("div", "dck-thumb-meta");
      meta.appendChild(el("span", "dck-thumb-num", String(i + 1)));
      meta.appendChild(el("span", "dck-thumb-layout", LAYOUTS[s.layout] ? LAYOUTS[s.layout].name : s.layout));
      item.appendChild(meta);
      var ctl = el("div", "dck-thumb-ctl");
      var up = el("button", "dck-btn dck-btn-small", "Up");
      up.id = "dck-up-" + s.id;
      up.setAttribute("aria-label", "Move slide " + (i + 1) + " up");
      up.disabled = i === 0;
      up.addEventListener("click", function (ev) { ev.stopPropagation(); curSlideIdx = i; moveSlide(-1); });
      var dn = el("button", "dck-btn dck-btn-small", "Down");
      dn.id = "dck-dn-" + s.id;
      dn.setAttribute("aria-label", "Move slide " + (i + 1) + " down");
      dn.disabled = i === d.slides.length - 1;
      dn.addEventListener("click", function (ev) { ev.stopPropagation(); curSlideIdx = i; moveSlide(1); });
      var lay = document.createElement("select");
      lay.id = "dck-layout-" + s.id;
      lay.className = "dck-layout-sel";
      lay.setAttribute("aria-label", "Layout for slide " + (i + 1));
      Object.keys(LAYOUTS).forEach(function (lk) {
        var o = document.createElement("option");
        o.value = lk; o.textContent = LAYOUTS[lk].name;
        if (lk === s.layout) o.selected = true;
        lay.appendChild(o);
      });
      lay.addEventListener("change", function (ev) {
        ev.stopPropagation();
        curSlideIdx = i;
        setSlideLayout(s, lay.value);
      });
      lay.addEventListener("click", function (ev) { ev.stopPropagation(); });
      var dup = el("button", "dck-btn dck-btn-small", "Duplicate");
      dup.id = "dck-dup-" + s.id;
      dup.setAttribute("aria-label", "Duplicate slide " + (i + 1));
      dup.addEventListener("click", function (ev) { ev.stopPropagation(); curSlideIdx = i; duplicateSlide(); });
      var del = el("button", "dck-btn dck-btn-small dck-btn-danger", "Delete");
      del.id = "dck-delslide-" + s.id;
      del.setAttribute("aria-label", "Delete slide " + (i + 1));
      del.addEventListener("click", function (ev) { ev.stopPropagation(); curSlideIdx = i; deleteSlide(); });
      ctl.appendChild(up); ctl.appendChild(dn); ctl.appendChild(lay);
      ctl.appendChild(dup); ctl.appendChild(del);
      item.appendChild(ctl);
      item.addEventListener("click", function () {
        curSlideIdx = i; selBlockId = null;
        renderEditor();
      });
      item.addEventListener("dragstart", function (ev) {
        ev.dataTransfer.setData("text/dck-slide", String(i));
        ev.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragover", function (ev) { ev.preventDefault(); });
      item.addEventListener("drop", function (ev) {
        ev.preventDefault();
        var from = parseInt(ev.dataTransfer.getData("text/dck-slide"), 10);
        var dd = currentDeck();
        if (isNaN(from) || !dd || from === i) return;
        var mv = dd.slides.splice(from, 1)[0];
        dd.slides.splice(i, 0, mv);
        curSlideIdx = i;
        putDeck(dd);
        renderEditor();
      });
      fs.appendChild(item);
    });
    var add = el("button", "dck-btn dck-addslide", "+ New Slide");
    add.id = "dck-addslide";
    add.addEventListener("click", function () { addSlide("blank"); });
    fs.appendChild(add);
  }

  function renderStage() {
    var stage = $("dck-stage");
    var d = currentDeck(), s = currentSlide();
    if (!stage || !d || !s) return;
    stage.innerHTML = "";
    var theme = themeOf(d);
    var grad = gradientCss(d);
    stage.style.background = grad || ("linear-gradient(135deg," + theme.bg + "," + theme.bg2 + ")");
    stage.style.color = theme.ink;
    stage.style.aspectRatio = settingsAspectRatio(d);
    stage.style.setProperty("--dck-accent", theme.accent);
    var ordered = s.blocks.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    ordered.forEach(function (b) { stage.appendChild(blockEl(b, d, "stage")); });
    renderBlockBar();
  }

  function renderBlockBar() {
    var bar = $("dck-blockbar");
    if (!bar) return;
    bar.innerHTML = "";
    var s = currentSlide();
    if (!s || !selBlockId) { bar.style.display = "none"; return; }
    bar.style.display = "";
    var acts = [
      ["dck-bb-up", "Bring forward", function () { shiftBlockZ(1); }],
      ["dck-bb-dn", "Send backward", function () { shiftBlockZ(-1); }],
      ["dck-bb-del", "Delete block", function () { deleteBlock(); }]
    ];
    acts.forEach(function (a) {
      var b = el("button", "dck-btn dck-btn-small", a[1]);
      b.id = a[0];
      b.addEventListener("click", a[2]);
      bar.appendChild(b);
    });
  }

  function renderInspector() {
    var insp = $("dck-inspector");
    var d = currentDeck();
    if (!insp || !d) return;
    insp.innerHTML = "";
    insp.appendChild(el("h3", "dck-insp-h", "Design"));

    insp.appendChild(el("div", "dck-insp-label", "Slide theme"));
    var sw = el("div", "dck-swatches");
    sw.id = "dck-theme-swatches";
    THEMES.forEach(function (t) {
      var b = el("button", "dck-swatch" + (d.theme === t.id ? " active" : ""));
      b.id = "dck-theme-" + t.id;
      b.title = t.name;
      b.setAttribute("aria-label", "Apply theme: " + t.name);
      b.setAttribute("aria-pressed", d.theme === t.id ? "true" : "false");
      b.style.background = "linear-gradient(135deg," + t.bg + " 50%," + t.bg2 + " 50%)";
      b.style.borderColor = t.accent;
      (function (tid) {
        b.addEventListener("click", function () {
          var dd = currentDeck();
          if (!dd) return;
          dd.theme = tid;
          putDeck(dd);
          renderEditor();
        });
      })(t.id);
      sw.appendChild(b);
    });
    insp.appendChild(sw);

    insp.appendChild(el("div", "dck-insp-label", "Background"));
    var gr = el("div", "dck-swatches");
    gr.id = "dck-gradient-swatches";
    GRADIENTS.forEach(function (g) {
      var b = el("button", "dck-swatch" + (d.gradient === g.id ? " active" : ""));
      b.id = "dck-grad-" + g.id;
      b.title = g.name;
      b.setAttribute("aria-label", "Background: " + g.name);
      b.setAttribute("aria-pressed", d.gradient === g.id ? "true" : "false");
      b.style.background = g.css || "var(--surface)";
      (function (gid) {
        b.addEventListener("click", function () {
          var dd = currentDeck();
          if (!dd) return;
          dd.gradient = gid;
          putDeck(dd);
          renderEditor();
        });
      })(g.id);
      gr.appendChild(b);
    });
    insp.appendChild(gr);

    insp.appendChild(el("div", "dck-insp-label", "Entrance transition"));
    var tr = document.createElement("select");
    tr.id = "dck-transition";
    tr.className = "dck-select";
    tr.setAttribute("aria-label", "Entrance transition for presenter mode");
    TRANSITIONS.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id; o.textContent = t.name;
      if (t.id === d.transition) o.selected = true;
      tr.appendChild(o);
    });
    tr.addEventListener("change", function () {
      var dd = currentDeck();
      if (!dd) return;
      dd.transition = tr.value;
      putDeck(dd);
      toast("Transition: " + tr.options[tr.selectedIndex].text);
    });
    insp.appendChild(tr);

    insp.appendChild(el("div", "dck-insp-label", "Slide layout"));
    var lay = document.createElement("select");
    lay.id = "dck-inspector-layout";
    lay.className = "dck-select";
    lay.setAttribute("aria-label", "Layout for current slide");
    var s = currentSlide();
    Object.keys(LAYOUTS).forEach(function (lk) {
      var o = document.createElement("option");
      o.value = lk; o.textContent = LAYOUTS[lk].name;
      if (s && lk === s.layout) o.selected = true;
      lay.appendChild(o);
    });
    lay.addEventListener("change", function () {
      var ss = currentSlide();
      if (ss) setSlideLayout(ss, lay.value);
    });
    insp.appendChild(lay);
  }

  function renderNotes() {
    var ta = $("dck-notes-text");
    var s = currentSlide();
    if (ta && s && document.activeElement !== ta) ta.value = s.notes || "";
  }

  function renderEditor() {
    var d = currentDeck();
    if (!d) { showHome(); return; }
    var t = $("dck-title");
    if (t && document.activeElement !== t) t.value = d.title || "";
    renderFilmstrip();
    renderStage();
    renderInspector();
    renderNotes();
  }

  function showHome() {
    view = "home";
    var h = $("dck-home"), e = $("dck-editor");
    if (h) h.style.display = "";
    if (e) e.style.display = "none";
    renderRecent($("dck-home-search") ? $("dck-home-search").value : "");
  }
  function openEditor(deckId) {
    var deck = getDeck(deckId);
    if (!deck) { toast("Deck not found.", "error"); return; }
    curDeckId = deckId;
    curSlideIdx = 0;
    selBlockId = null;
    view = "editor";
    var h = $("dck-home"), e = $("dck-editor");
    if (h) h.style.display = "none";
    if (e) e.style.display = "";
    // flush pending live GRD blocks into the first slide
    var pending = getPendingLive();
    if (pending.length) {
      setPendingLive([]);
      pending.forEach(function (p) { insertGrdBlock(p, deck.slides[0]); });
      putDeck(deck);
      toast("Inserted " + pending.length + " pending live GRD block(s).");
    }
    renderEditor();
  }

  /* ============================================================
     TXT-to-DCK generator
     ============================================================ */
  function cleanText(n) {
    return String((n && n.textContent) || "").replace(/\s+/g, " ").trim();
  }
  function tableRows(table) {
    var rows = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      var cells = [];
      Array.prototype.forEach.call(tr.querySelectorAll("th,td"), function (c) {
        cells.push(cleanText(c));
      });
      if (cells.length) rows.push(cells);
    });
    return rows;
  }
  function grdInfo(n) {
    var d = n.dataset || {};
    return {
      id: n.getAttribute("data-grid") || n.getAttribute("data-grid-id") || d.grid || uid(),
      label: n.getAttribute("data-label") || d.label || "Live GRD data",
      html: n.innerHTML || "",
      values: null
    };
  }
  /* Parse the live word sheet into deck sections. Pure and testable:
     returns { title, subtitle, slides: [{ title, bullets[], tables[], grds[] }] }
     where slides[0] is the cover (title+subtitle) and each subsequent h1/h2
     becomes a slide. .live-grd blocks become their own 'chart' slides. */
  function parseDocument(sheetEl) {
    if (!sheetEl || !sheetEl.children) return null;
    var title = "", subtitle = "";
    var subtitleEl = null; // the paragraph consumed as the subtitle; skip it in the walk
    var sections = []; // {title, bullets[], tables[], grds[]}
    var cur = null;
    var kids = sheetEl.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      var tag = (k.tagName || "").toUpperCase();
      var cls = k.className || "";
      if (tag === "H1") {
        var t = cleanText(k);
        if (!title) {
          title = t;
          // subtitle = first non-empty paragraph right after this h1
          for (var j = i + 1; j < kids.length; j++) {
            var nk = kids[j];
            var ntag = (nk.tagName || "").toUpperCase();
            if (ntag === "P") {
              var pt = cleanText(nk);
              if (pt) { subtitle = pt.slice(0, 140); subtitleEl = nk; break; }
            } else if (ntag === "H1" || ntag === "H2") break;
          }
        } else {
          cur = { title: t, bullets: [], tables: [], grds: [] };
          sections.push(cur);
        }
      } else if (tag === "H2") {
        cur = { title: cleanText(k), bullets: [], tables: [], grds: [] };
        sections.push(cur);
      } else if (tag === "H3") {
        if (!cur) { cur = { title: "", bullets: [], tables: [], grds: [] }; sections.push(cur); }
        cur.bullets.push({ text: cleanText(k), strong: true });
      } else if (tag === "UL" || tag === "OL") {
        if (!cur) { cur = { title: "", bullets: [], tables: [], grds: [] }; sections.push(cur); }
        Array.prototype.forEach.call(k.querySelectorAll("li"), function (li) {
          var tx = cleanText(li);
          if (tx) cur.bullets.push({ text: tx });
        });
      } else if (tag === "P") {
        if (k === subtitleEl) continue; // already used as the cover subtitle
        var ptx = cleanText(k);
        if (ptx) {
          if (!cur) { cur = { title: "", bullets: [], tables: [], grds: [] }; sections.push(cur); }
          cur.bullets.push({ text: ptx });
        }
      } else if (tag === "TABLE") {
        var rows = tableRows(k);
        if (rows.length) {
          if (!cur) { cur = { title: "", bullets: [], tables: [], grds: [] }; sections.push(cur); }
          cur.tables.push(rows);
        }
      } else if (cls.indexOf("live-grd") >= 0 || k.hasAttribute("data-grid") || k.hasAttribute("data-grid-id")) {
        if (!cur) { cur = { title: "", bullets: [], tables: [], grds: [] }; sections.push(cur); }
        cur.grds.push(grdInfo(k));
      }
    }
    if (!title) title = "Untitled Deck";
    return { title: title, subtitle: subtitle, slides: sections };
  }

  function bulletText(item) {
    return (typeof item === "string") ? item : (item && item.text) || "";
  }
  function buildDeckFromParse(p) {
    var deck = newDeck(p.title, "blank");
    deck.slides = [];
    var theme = themeOf(deck);
    // cover
    var cover = mkSlide("cover");
    cover.blocks = [
      mkBlock("text", { x: 8, y: 26, w: 84, h: 22 }, { html: esc(p.title), cls: "dck-b-title" }),
      mkBlock("text", { x: 8, y: 50, w: 84, h: 12 },
        { html: esc(p.subtitle || ""), cls: "dck-b-subtitle" })
    ];
    deck.slides.push(cover);
    p.slides.forEach(function (sec) {
      var hasContent = sec.bullets.length || sec.tables.length || sec.grds.length || sec.title;
      if (!hasContent) return;
      var s = mkSlide(sec.grds.length && !sec.bullets.length && !sec.tables.length ? "chart" : "blank");
      var y = 6;
      if (sec.title) {
        s.blocks.push(mkBlock("text", { x: 6, y: y, w: 88, h: 12 },
          { html: esc(sec.title), cls: "dck-b-h2" }));
        y += 16;
      }
      if (sec.bullets.length) {
        s.blocks.push(mkBlock("bullets", { x: 6, y: y, w: 88, h: 50 },
          { items: sec.bullets.map(bulletText), cls: "dck-b-body" }));
        y += 52;
      }
      sec.tables.forEach(function (rows) {
        s.blocks.push(mkBlock("table", { x: 6, y: Math.min(y, 60), w: 88, h: 30 }, { rows: rows }));
        y += 32;
      });
      deck.slides.push(s);
      // each live GRD block becomes its own chart slide
      sec.grds.forEach(function (g, gi) {
        var cs = mkSlide("chart");
        cs.blocks = [
          mkBlock("text", { x: 5, y: 4, w: 90, h: 12 },
            { html: esc(sec.title || g.label), cls: "dck-b-h2" }),
          mkBlock("grd", { x: 5, y: 20, w: 56, h: 70 },
            { gridId: g.id, label: g.label, html: g.html, values: g.values }),
          mkBlock("bullets", { x: 65, y: 20, w: 30, h: 70 },
            { items: sec.bullets.length ? sec.bullets.map(bulletText) : ["Live data from GRD"], cls: "dck-b-body" })
        ];
        deck.slides.push(cs);
      });
    });
    if (deck.slides.length === 1) {
      // document had no sections at all: put a hint bullet on the cover
      cover.blocks.push(mkBlock("bullets", { x: 8, y: 64, w: 84, h: 26 },
        { items: ["No headings found in the document."], cls: "dck-b-body" }));
    }
    putDeck(deck);
    return deck;
  }
  function generateFromDocument() {
    var sheet = (T.sel && typeof T.sel.sheet === "function") ? T.sel.sheet() : null;
    if (!sheet) {
      toast("No live TXT document is open to generate from.", "error");
      return null;
    }
    var parsed = parseDocument(sheet);
    if (!parsed) {
      toast("Could not read the document.", "error");
      return null;
    }
    var deck = buildDeckFromParse(parsed);
    openEditor(deck.id);
    toast("Deck generated: " + deck.slides.length + " slides.");
    return deck;
  }

  /* ============================================================
     live GRD blocks
     ============================================================ */
  function insertGrdBlock(d, slide) {
    if (!d) return null;
    var b = mkBlock("grd", { x: 5, y: 18, w: 56, h: 68 }, {
      gridId: d.id, label: d.label || "Live GRD data",
      html: d.html || (d.values ? valuesToHtml(d.values) : ""),
      values: d.values || null
    });
    if (slide) slide.blocks.push(b);
    return b;
  }
  function findGrdBlock(gridId) {
    var decks = loadDecks();
    for (var id in decks) {
      var deck = decks[id];
      for (var i = 0; i < deck.slides.length; i++) {
        var s = deck.slides[i];
        for (var j = 0; j < s.blocks.length; j++) {
          var b = s.blocks[j];
          if (b.type === "grd" && b.gridId === gridId) return { deck: deck, slide: s, block: b };
        }
      }
    }
    return null;
  }
  function onGrdLive(d) {
    if (!d || !d.id) return;
    // refresh in place if this grid is already on a slide
    var hit = findGrdBlock(d.id);
    if (hit) {
      hit.block.label = d.label || hit.block.label;
      hit.block.html = d.html || (d.values ? valuesToHtml(d.values) : hit.block.html);
      hit.block.values = d.values || hit.block.values;
      putDeck(hit.deck);
      if (view === "editor") renderStage();
      toast("Live GRD block refreshed.");
      return;
    }
    var deck = currentDeck(), slide = currentSlide();
    if (view === "editor" && deck && slide) {
      insertGrdBlock(d, slide);
      putDeck(deck);
      renderEditor();
      toast("Live GRD chart inserted on this slide.");
    } else {
      var pending = getPendingLive();
      pending.push({ id: d.id, label: d.label, html: d.html, values: d.values });
      setPendingLive(pending);
      toast("Live GRD chart saved. Open a deck to place it.");
    }
  }
  function onGrdUpdate(d) {
    if (!d || !d.id) return;
    var hit = findGrdBlock(d.id);
    if (!hit) return;
    hit.block.values = d.values;
    if (d.values) hit.block.html = valuesToHtml(d.values);
    putDeck(hit.deck);
    if (view === "editor" && hit.deck.id === curDeckId) renderStage();
    toast("Live GRD block updated.");
  }

  /* ============================================================
     presenter mode
     ============================================================ */
  function present() {
    var deck = currentDeck();
    if (!deck || !deck.slides.length) {
      toast("Open a deck with at least one slide first.", "error");
      return;
    }
    closeSettings();
    if ($("dck-present")) exitPresent();
    var ov = el("div", "dck-present");
    ov.id = "dck-present";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "Presenter mode");
    var pstage = el("div", "dck-present-stage");
    pstage.id = "dck-present-stage";
    var notes = el("div", "dck-present-notes");
    notes.id = "dck-present-notes";
    var bar = el("div", "dck-present-bar");
    bar.id = "dck-present-bar";
    var prev = el("button", "dck-btn", "Prev");
    prev.id = "dck-p-prev";
    prev.addEventListener("click", function (e) { e.stopPropagation(); pNav(-1); });
    var next = el("button", "dck-btn", "Next");
    next.id = "dck-p-next";
    next.addEventListener("click", function (e) { e.stopPropagation(); pNav(1); });
    var count = el("span", "dck-p-count", "");
    count.id = "dck-p-count";
    var timer = el("span", "dck-p-timer", "00:00");
    timer.id = "dck-p-timer";
    if (!getSettings().timer) timer.style.display = "none";
    var laser = el("button", "dck-btn", "Laser");
    laser.id = "dck-p-laser";
    laser.setAttribute("aria-pressed", "false");
    laser.addEventListener("click", function (e) { e.stopPropagation(); toggleLaser(); });
    var exit = el("button", "dck-btn", "Exit");
    exit.id = "dck-p-exit";
    exit.addEventListener("click", function (e) { e.stopPropagation(); exitPresent(); });
    bar.appendChild(prev); bar.appendChild(next); bar.appendChild(count);
    bar.appendChild(timer); bar.appendChild(laser); bar.appendChild(exit);
    var dot = el("div", "dck-laser-dot");
    dot.id = "dck-laser-dot";
    dot.style.display = "none";
    ov.appendChild(pstage); ov.appendChild(notes); ov.appendChild(bar); ov.appendChild(dot);
    document.body.appendChild(ov);
    presenting = { deck: deck, idx: curSlideIdx || 0, startTs: Date.now(), timer: null };
    renderPresentSlide();
    presenting.timer = setInterval(function () {
      var t = $("dck-p-timer");
      if (!t || !presenting) return;
      var s = Math.floor((Date.now() - presenting.startTs) / 1000);
      var mm = String(Math.floor(s / 60)).padStart(2, "0");
      var ss = String(s % 60).padStart(2, "0");
      t.textContent = mm + ":" + ss;
    }, 1000);
    document.addEventListener("keydown", onPresentKey, true);
    ov.addEventListener("mousemove", onPresentMouse);
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target === pstage) pNav(1);
    });
    try {
      if (typeof ov.requestFullscreen === "function") {
        var r = ov.requestFullscreen();
        if (r && typeof r.catch === "function") r.catch(function () {});
      }
    } catch (e) { /* fullscreen unavailable; overlay still works */ }
    if (T.bus && T.bus.emit) T.bus.emit("dck:present", { on: true, deck: deck.id });
  }
  function renderPresentSlide() {
    if (!presenting) return;
    var deck = presenting.deck;
    var i = clamp(presenting.idx, 0, deck.slides.length - 1);
    presenting.idx = i;
    var s = deck.slides[i];
    var stage = $("dck-present-stage");
    var theme = themeOf(deck);
    var grad = gradientCss(deck);
    stage.innerHTML = "";
    stage.style.background = grad || ("linear-gradient(135deg," + theme.bg + "," + theme.bg2 + ")");
    stage.style.color = theme.ink;
    stage.style.setProperty("--dck-accent", theme.accent);
    // presenter transition: the deck's own choice wins unless it is the
    // factory default ("none"), in which case the DCK setting applies
    var st = getSettings().transition;
    var tr = (deck.transition && deck.transition !== "none")
      ? deck.transition
      : (SETTING_TRANSITIONS[st] || "none");
    stage.classList.remove("dck-tr-fade-up", "dck-tr-zoom-in", "dck-tr-slide-left");
    if (tr !== "none") {
      // re-trigger the entrance animation
      void stage.offsetWidth;
      stage.classList.add("dck-tr-" + tr);
    }
    s.blocks.forEach(function (b) { stage.appendChild(blockEl(b, deck, "present")); });
    var count = $("dck-p-count");
    if (count) count.textContent = (i + 1) + " / " + deck.slides.length;
    var notes = $("dck-present-notes");
    if (notes) {
      notes.innerHTML = "";
      if (s.notes) {
        notes.appendChild(el("div", "dck-p-notes-h", "Speaker notes"));
        notes.appendChild(el("div", "dck-p-notes-t", s.notes));
      } else {
        notes.appendChild(el("div", "dck-p-notes-h dck-dim", "No speaker notes for this slide"));
      }
    }
  }
  function pNav(dir) {
    if (!presenting) return;
    var n = presenting.idx + dir;
    if (n < 0 || n >= presenting.deck.slides.length) return;
    presenting.idx = n;
    renderPresentSlide();
  }
  function onPresentKey(e) {
    if (!presenting) return;
    if (e.key === "Escape") { e.preventDefault(); exitPresent(); }
    else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); pNav(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); pNav(-1); }
    else if (e.key === "Home") { e.preventDefault(); presenting.idx = 0; renderPresentSlide(); }
    else if (e.key === "End") { e.preventDefault(); presenting.idx = presenting.deck.slides.length - 1; renderPresentSlide(); }
  }
  function onPresentMouse(e) {
    var dot = $("dck-laser-dot");
    var ov = $("dck-present");
    if (!dot || !ov) return;
    if (!laserOn) { dot.style.display = "none"; return; }
    dot.style.display = "";
    dot.style.left = (e.clientX - 8) + "px";
    dot.style.top = (e.clientY - 8) + "px";
  }
  function toggleLaser() {
    laserOn = !laserOn;
    var ov = $("dck-present");
    var btn = $("dck-p-laser");
    if (ov) ov.classList.toggle("dck-laser-on", laserOn);
    if (btn) {
      btn.setAttribute("aria-pressed", laserOn ? "true" : "false");
      btn.classList.toggle("active", laserOn);
    }
    if (!laserOn) {
      var dot = $("dck-laser-dot");
      if (dot) dot.style.display = "none";
    }
  }
  function exitPresent() {
    if (presenting && presenting.timer) clearInterval(presenting.timer);
    presenting = null;
    laserOn = false;
    document.removeEventListener("keydown", onPresentKey, true);
    var ov = $("dck-present");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        var r = document.exitFullscreen();
        if (r && typeof r.catch === "function") r.catch(function () {});
      }
    } catch (e) {}
    if (T.bus && T.bus.emit) T.bus.emit("dck:present", { on: false });
  }

  /* ============================================================
     per-app top bar (launcher + settings), settings drawer,
     and the per-app file model
     ============================================================ */
  var GEAR_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

  function buildTopbar(root) {
    var bar = el("div", "dck-topbar");
    bar.id = "dck-topbar";
    bar.setAttribute("role", "banner");
    bar.setAttribute("aria-label", "DCK app bar");
    var badge = el("span", "app-badge", "DCK");
    badge.id = "dck-topbar-badge";
    badge.style.background = "#F97316";
    badge.setAttribute("aria-hidden", "true");
    bar.appendChild(badge);
    bar.appendChild(el("span", "dck-topbar-name", "DCK"));
    var spacer = el("div", "dck-topbar-spacer");
    bar.appendChild(spacer);
    var waffle = el("button", "icon-btn waffle-btn");
    waffle.id = "dck-launcher-btn";
    waffle.type = "button";
    waffle.setAttribute("aria-label", "Open app launcher");
    waffle.setAttribute("aria-haspopup", "true");
    var dots = el("span", "waffle-dots");
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 9; i++) dots.appendChild(document.createElement("i"));
    waffle.appendChild(dots);
    waffle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (T.ecosystem && typeof T.ecosystem.toggleLauncher === "function") {
        T.ecosystem.toggleLauncher();
      } else {
        toast("App launcher is not available right now.", "error");
      }
    });
    bar.appendChild(waffle);
    var gear = el("button", "icon-btn");
    gear.id = "dck-settings-btn";
    gear.type = "button";
    gear.setAttribute("aria-label", "DCK settings");
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener("click", function () { openSettings(); });
    bar.appendChild(gear);
    root.appendChild(bar);
  }

  function setRow(labelText, hintText, control) {
    var row = el("div", "dck-set-row");
    var txt = el("div", "dck-set-text");
    txt.appendChild(el("strong", null, labelText));
    if (hintText) txt.appendChild(el("small", null, hintText));
    row.appendChild(txt);
    row.appendChild(control);
    return row;
  }
  function buildSettings(root) {
    var ov = el("div", "dck-drawer-ov");
    ov.id = "dck-settings-ov";
    ov.style.display = "none";
    var panel = el("div", "dck-drawer");
    panel.id = "dck-settings";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "DCK settings");
    var head = el("div", "dck-drawer-head");
    head.appendChild(el("h2", null, "DCK Settings"));
    var close = el("button", "icon-btn");
    close.id = "dck-settings-close";
    close.type = "button";
    close.setAttribute("aria-label", "Close settings");
    close.innerHTML = (typeof T.icon === "function") ? T.icon("i-x") : "X";
    close.addEventListener("click", closeSettings);
    head.appendChild(close);
    panel.appendChild(head);
    var body = el("div", "dck-drawer-body");

    var aspect = document.createElement("select");
    aspect.id = "dck-set-aspect";
    aspect.className = "dck-set-select";
    aspect.setAttribute("aria-label", "Default aspect ratio for new decks");
    [["16:9", "16:9 (widescreen)"], ["4:3", "4:3 (classic)"]].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o[0]; opt.textContent = o[1];
      aspect.appendChild(opt);
    });
    aspect.addEventListener("change", function () {
      var s = getSettings();
      s.aspect = aspect.value;
      saveSettings(s);
      toast("Default aspect ratio: " + aspect.value + ". Applies to newly created decks.");
    });
    body.appendChild(setRow("Default aspect ratio",
      "Used when you create a new deck.", aspect));

    var trans = document.createElement("select");
    trans.id = "dck-set-transition";
    trans.className = "dck-set-select";
    trans.setAttribute("aria-label", "Slide transition for presenter mode");
    [["none", "None"], ["fade", "Fade"], ["slide", "Slide"]].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o[0]; opt.textContent = o[1];
      trans.appendChild(opt);
    });
    trans.addEventListener("change", function () {
      var s = getSettings();
      s.transition = trans.value;
      saveSettings(s);
      toast("Slide transition: " + trans.options[trans.selectedIndex].text + ". Used in presenter mode.");
    });
    body.appendChild(setRow("Slide transition",
      "Entrance animation used in presenter mode.", trans));

    function toggleRow(id, title, hint, key) {
      var lab = document.createElement("label");
      lab.className = "dck-set-row";
      lab.setAttribute("for", id);
      var txt = el("div", "dck-set-text");
      txt.appendChild(el("strong", null, title));
      txt.appendChild(el("small", null, hint));
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.className = "dck-switch";
      cb.addEventListener("change", function () {
        var s = getSettings();
        s[key] = cb.checked;
        saveSettings(s);
        applySettings();
        toast(title + (cb.checked ? " on." : " off."));
      });
      lab.appendChild(txt);
      lab.appendChild(cb);
      return lab;
    }
    body.appendChild(toggleRow("dck-set-timer", "Presenter timer",
      "Show the elapsed timer in presenter mode.", "timer"));
    body.appendChild(toggleRow("dck-set-spellcheck", "Spellcheck",
      "Underline spelling on slide text while editing.", "spellcheck"));

    var about = el("div", "dck-set-about");
    about.id = "dck-settings-about";
    about.appendChild(el("div", "dck-set-about-t", "About"));
    about.appendChild(el("p", null,
      "DCK is part of the NXT Ecosystem. Build slide decks from your TXT documents, drop in live GRD charts, and present anywhere."));
    body.appendChild(about);

    panel.appendChild(body);
    ov.appendChild(panel);
    ov.addEventListener("click", function (e) { if (e.target === ov) closeSettings(); });
    root.appendChild(ov);
  }
  function onSettingsKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closeSettings(); }
  }
  function openSettings() {
    ensureBuilt();
    var ov = $("dck-settings-ov");
    if (!ov) return;
    var s = getSettings();
    var aspect = $("dck-set-aspect"), trans = $("dck-set-transition"),
        timer = $("dck-set-timer"), spell = $("dck-set-spellcheck");
    if (aspect) aspect.value = s.aspect;
    if (trans) trans.value = s.transition;
    if (timer) timer.checked = !!s.timer;
    if (spell) spell.checked = !!s.spellcheck;
    ov.style.display = "";
    document.addEventListener("keydown", onSettingsKey, true);
    var c = $("dck-settings-close");
    if (c) { try { c.focus(); } catch (e) {} }
  }
  function closeSettings() {
    var ov = $("dck-settings-ov");
    if (ov) ov.style.display = "none";
    document.removeEventListener("keydown", onSettingsKey, true);
  }

  /* ---- per-app file model: records are {id, name, updatedAt} plus the
     deck payload already persisted in the 'dck' store namespace ---- */
  function fileRecord(deck) {
    if (!deck) return null;
    return {
      id: deck.id,
      name: deck.title || "Untitled deck",
      updatedAt: deck.updatedAt || 0,
      slides: (deck.slides || []).length,
      deck: deck
    };
  }
  function modalConfirm(opts) {
    if (T.modal && typeof T.modal === "function") {
      try {
        var r = T.modal(opts);
        if (r && typeof r.then === "function") {
          return r.then(function (v) { return !!v; }, function () { return false; });
        }
      } catch (e) { /* fall through to the inline confirm */ }
    }
    return new Promise(function (resolve) {
      confirmInline((opts && opts.title) || "Are you sure?", resolve);
    });
  }
  var files = {
    list: function () {
      var decks = loadDecks(), out = [];
      for (var id in decks) {
        var rec = fileRecord(decks[id]);
        if (rec) out.push(rec);
      }
      out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return out;
    },
    create: function (name) {
      var deck = newDeck(name || "Untitled deck", "blank");
      return fileRecord(deck);
    },
    rename: function (id, name) {
      var deck = getDeck(id);
      if (!deck) return null;
      var n = String(name == null ? "" : name).trim();
      if (!n) return fileRecord(deck);
      deck.title = n;
      putDeck(deck);
      touchRecent(deck);
      if (built) {
        if (curDeckId === id && view === "editor") renderEditor();
        renderRecent(currentQuery());
      }
      return fileRecord(deck);
    },
    duplicate: function (id) {
      var deck = getDeck(id);
      if (!deck) return null;
      var copy = JSON.parse(JSON.stringify(deck));
      copy.id = uid();
      copy.title = (deck.title || "Untitled deck") + " copy";
      copy.createdAt = Date.now();
      (copy.slides || []).forEach(function (s) {
        s.id = uid();
        (s.blocks || []).forEach(function (b) { b.id = uid(); });
      });
      putDeck(copy);
      if (built) renderRecent(currentQuery());
      toast("Deck duplicated.");
      return fileRecord(copy);
    },
    remove: function (id) {
      var deck = getDeck(id);
      var name = deck ? (deck.title || "Untitled deck") : "this deck";
      return modalConfirm({
        title: "Delete deck?",
        sub: "Delete \"" + name + "\"? This cannot be undone.",
        okText: "Delete",
        danger: true
      }).then(function (yes) {
        if (!yes) return false;
        var decks = loadDecks();
        delete decks[id];
        saveDecks(decks);
        dropRecent(id);
        if (curDeckId === id) {
          curDeckId = null;
          if (built) showHome();
        }
        if (built) renderRecent(currentQuery());
        toast("Deck deleted.");
        return true;
      });
    },
    open: function (id) { openEditor(id); }
  };
  function renameDeck(id, currentName) {
    if (!(T.modal && typeof T.modal === "function")) {
      toast("Rename is not available right now.", "error");
      return Promise.resolve(null);
    }
    var r;
    try {
      r = T.modal({
        title: "Rename deck",
        okText: "Rename",
        fields: [{ key: "name", label: "Deck name", type: "text", value: currentName || "" }]
      });
    } catch (e) { return Promise.resolve(null); }
    return Promise.resolve(r).then(function (out) {
      if (!out || !String(out.name || "").trim()) return null;
      var rec = files.rename(id, out.name);
      if (rec) toast("Deck renamed.");
      return rec;
    });
  }

  /* ============================================================
     shell: show / hide / lazy build
     ============================================================ */
  function ensureBuilt() {
    if (built) return;
    built = true;
    var viewEl = $("view-dck");
    if (!viewEl) return;
    var root = el("div", "dck-root");
    root.id = "dck-root";
    viewEl.appendChild(root);
    buildTopbar(root);
    buildHome(root);
    buildEditor(root);
    buildSettings(root);
    applySettings();
  }
  function show() {
    ensureBuilt();
    applySettings();
    var viewEl = $("view-dck");
    if (viewEl) viewEl.classList.remove("hidden");
    if (view === "editor" && currentDeck()) renderEditor();
    else showHome();
  }
  function hide() {
    if (presenting) exitPresent();
    var viewEl = $("view-dck");
    if (viewEl) viewEl.classList.add("hidden");
  }

  /* ============================================================
     events + commands
     ============================================================ */
  if (T.bus && T.bus.on) {
    T.bus.on("ecosystem:app", function (p) {
      if (p && p.app === "dck") show();
    });
  }
  if (T.store && T.store.on) {
    T.store.on("dck:generate", function () { generateFromDocument(); });
    T.store.on("grd:live", onGrdLive);
    T.store.on("grd:update", onGrdUpdate);
  }
  if (T.register) {
    T.register("dck.new", function () {
      var deck = newDeck("Untitled deck", "blank");
      show();
      openEditor(deck.id);
    }, { title: "New DCK deck", cat: "DCK", match: "new deck slides presentation" });
    T.register("dck.home", function () { show(); }, {
      title: "DCK home", cat: "DCK", match: "deck home start"
    });
    T.register("dck.present", function () { show(); present(); }, {
      title: "Present current deck", cat: "DCK", match: "present slideshow fullscreen"
    });
    T.register("dck.generate", function () { generateFromDocument(); }, {
      title: "Generate deck from TXT document", cat: "DCK", match: "generate slides from document"
    });
    T.register("dck.newSlide", function () { addSlide("blank"); }, {
      title: "New slide", cat: "DCK", match: "new slide add"
    });
  }

  /* ============================================================
     public API
     ============================================================ */
  T.dck = {
    show: show,
    hide: hide,
    newDeck: function (title, templateId) {
      var deck = newDeck(title, templateId);
      show();
      openEditor(deck.id);
      return deck;
    },
    openDeck: openEditor,
    generateFromDocument: generateFromDocument,
    parseDocument: parseDocument,
    addSlide: addSlide,
    duplicateSlide: duplicateSlide,
    deleteSlide: deleteSlide,
    moveSlide: moveSlide,
    setSlideLayout: setSlideLayout,
    insertBlock: insertBlock,
    deleteBlock: deleteBlock,
    present: present,
    exitPresent: exitPresent,
    currentDeck: currentDeck,
    currentSlide: currentSlide,
    saveNow: saveCurrent,
    layouts: LAYOUTS,
    themes: THEMES,
    transitions: TRANSITIONS,
    files: files,
    getSettings: getSettings,
    applySettings: applySettings,
    openSettings: openSettings,
    _built: function () { return built; }
  };
})();
