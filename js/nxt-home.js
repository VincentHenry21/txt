/* NXT Ecosystem home: the front door of the project.
   Boot lands here instead of inside TXT. Each app keeps its own
   homescreen; this view launches apps and studios and surfaces
   recent files across the ecosystem. */
(function () {
  var T = window.TXT;
  if (!T) return;

  var APPS = [
    { id: "txt", code: "TXT", color: "#2563EB", desc: "Flagship word processor" },
    { id: "grd", code: "GRD", color: "#10B981", desc: "Spreadsheet grid and kanban" },
    { id: "dck", code: "DCK", color: "#F97316", desc: "Slide deck generator" },
    { id: "mem", code: "MEM", color: "#8B5CF6", desc: "Notes and whiteboard" },
    { id: "pdf", code: "PDF", color: "#E11D48", desc: "PDF toolkit" },
    { id: "hub", code: "HUB", color: "#4F46E5", desc: "Files and storage" }
  ];
  var STUDIOS = [
    { id: "word", code: "W", name: "Word" },
    { id: "vector", code: "Ai", name: "Vector" },
    { id: "pixel", code: "Ps", name: "Pixel" }
  ];
  var APP_IDS = ["grd", "dck", "mem", "pdf", "hub"];

  var built = false, view = null, searchInput = null, recentBox = null;

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function appColor(id) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i].color;
    return "#6B7280";
  }

  function openAppTile(id) {
    if (T.ecosystem && T.ecosystem.openApp) T.ecosystem.openApp(id);
    if (id === "txt" && T.homescreen) T.homescreen.show();
  }

  function openRecent(r) {
    if (r.app === "txt") {
      if (T.ecosystem && T.ecosystem.openApp) T.ecosystem.openApp("txt");
      if (T.editor && T.editor.openDoc) T.editor.openDoc(r.id);
    } else {
      if (T.ecosystem && T.ecosystem.openApp) T.ecosystem.openApp(r.app);
    }
  }

  function collectRecents() {
    var out = [];
    try {
      (T.state.docs || []).slice(0, 6).forEach(function (m) {
        out.push({ app: "txt", id: m.id, title: m.title || "Untitled", ts: m.updatedAt || 0 });
      });
      if (T.store) {
        APP_IDS.forEach(function (a) {
          var rec = T.store.get(a, "recent") || [];
          rec.slice(0, 4).forEach(function (it) {
            if (!it || it.id == null) return;
            out.push({ app: a, id: it.id, title: it.title || it.name || "Untitled", ts: it.updatedAt || it.ts || 0 });
          });
        });
      }
    } catch (e) {}
    out.sort(function (x, y) { return (y.ts > x.ts ? 1 : y.ts < x.ts ? -1 : 0); });
    return out.slice(0, 8);
  }

  function relTime(ts) {
    if (T.relTime) { try { return T.relTime(ts); } catch (e) {} }
    return "";
  }

  function renderRecents() {
    if (!recentBox) return;
    recentBox.innerHTML = "";
    var recs = collectRecents();
    if (!recs.length) {
      recentBox.appendChild(h("p", "nxt-empty", "No recent files yet. Open an app to get started."));
      return;
    }
    recs.forEach(function (r) {
      var row = h("button", "nxt-recent-row", null);
      row.type = "button";
      row.setAttribute("data-search", (r.title + " " + r.app).toLowerCase());
      var b = h("span", "nxt-mini-badge", r.app.toUpperCase());
      b.style.background = appColor(r.app);
      var t = h("span", "nxt-recent-title", r.title);
      var m = h("span", "nxt-recent-meta", relTime(r.ts));
      row.appendChild(b); row.appendChild(t); row.appendChild(m);
      row.addEventListener("click", function () { openRecent(r); });
      recentBox.appendChild(row);
    });
  }

  function applyFilter(q) {
    q = (q || "").toLowerCase();
    var nodes = view.querySelectorAll("[data-search]");
    nodes.forEach(function (n) {
      var hit = !q || (n.getAttribute("data-search") || "").indexOf(q) >= 0;
      n.style.display = hit ? "" : "none";
    });
  }

  function firstVisible() {
    var tiles = view.querySelectorAll(".nxt-tile");
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].style.display !== "none") return tiles[i];
    }
    return null;
  }

  function build() {
    if (built) return;
    view = document.getElementById("view-home");
    if (!view) return;
    built = true;

    var wrap = h("div", "nxt-wrap", null);

    var brand = h("div", "nxt-brand", null);
    brand.appendChild(h("div", "nxt-brand-name", "NXT Ecosystem"));
    brand.appendChild(h("div", "nxt-brand-tag", "Documents, sheets, slides, boards and files. One home."));
    wrap.appendChild(brand);

    var sWrap = h("div", "nxt-search-wrap", null);
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "nxt-search";
    searchInput.placeholder = "Search apps and files";
    searchInput.setAttribute("aria-label", "Search apps and files");
    searchInput.addEventListener("input", function () { applyFilter(searchInput.value); });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var t = firstVisible();
        if (t) t.click();
      } else if (e.key === "Escape") {
        searchInput.value = "";
        applyFilter("");
      }
    });
    sWrap.appendChild(searchInput);
    wrap.appendChild(sWrap);

    wrap.appendChild(h("div", "nxt-sec-head", "Studios"));
    var sRow = h("div", "nxt-studios", null);
    STUDIOS.forEach(function (s) {
      var b = h("button", "nxt-studio", null);
      b.type = "button";
      b.setAttribute("data-search", (s.name + " studio").toLowerCase());
      b.setAttribute("aria-label", s.name + " studio");
      var badge = h("span", "nxt-studio-badge", s.code);
      b.appendChild(badge);
      b.appendChild(h("span", "nxt-studio-name", s.name));
      b.addEventListener("click", function () {
        if (T.ecosystem && T.ecosystem.setPersona) T.ecosystem.setPersona(s.id);
      });
      sRow.appendChild(b);
    });
    wrap.appendChild(sRow);

    wrap.appendChild(h("div", "nxt-sec-head", "Apps"));
    var grid = h("div", "nxt-grid", null);
    APPS.forEach(function (a) {
      var t = h("button", "nxt-tile", null);
      t.type = "button";
      t.setAttribute("data-search", (a.code + " " + a.desc).toLowerCase());
      t.setAttribute("aria-label", a.code + ": " + a.desc);
      var badge = h("span", "nxt-tile-badge", a.code);
      badge.style.background = a.color;
      t.appendChild(badge);
      t.appendChild(h("span", "nxt-tile-name", a.code));
      t.appendChild(h("span", "nxt-tile-desc", a.desc));
      (function (id) {
        t.addEventListener("click", function () { openAppTile(id); });
      })(a.id);
      grid.appendChild(t);
    });
    wrap.appendChild(grid);

    wrap.appendChild(h("div", "nxt-sec-head", "Recent"));
    recentBox = h("div", "nxt-recents", null);
    wrap.appendChild(recentBox);

    view.appendChild(wrap);
    renderRecents();
  }

  function show() {
    build();
    renderRecents();
    if (searchInput) { searchInput.value = ""; applyFilter(""); }
    if (T.ecosystem && T.ecosystem.home) T.ecosystem.home();
    else if (view) {
      ["view-word", "view-vector", "view-pixel", "view-grd", "view-dck", "view-mem", "view-pdf", "view-hub"].forEach(function (id) {
        var s = document.getElementById(id);
        if (s) s.classList.add("hidden");
      });
      view.classList.remove("hidden");
    }
  }

  function hide() {
    if (view) view.classList.add("hidden");
  }

  function isVisible() {
    return !!(view && !view.classList.contains("hidden"));
  }

  T.nxthome = { show: show, hide: hide, isVisible: isVisible };
})();
