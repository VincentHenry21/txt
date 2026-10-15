/* NXT OS home: the front door of the project.
   Boot lands here instead of inside TXT. Each app keeps its own
   homescreen; this view launches apps and studios and surfaces
   recent files across the ecosystem. */
(function () {
  var T = window.TXT;
  if (!T) return;

  var APPS = [
    { id: "txt", code: "TXT", color: "#7C3AED", desc: "Flagship word processor", logo: "txt" },
    { id: "grd", code: "GRD", color: "#06B6D4", desc: "Spreadsheet grid and kanban", logo: "grd" },
    { id: "dck", code: "DCK", color: "#FF2E93", desc: "Slide deck generator", logo: "dck" },
    { id: "mem", code: "MEM", color: "#10B981", desc: "Notes and whiteboard", logo: "mem" },
    { id: "pdf", code: "PDF", color: "#F59E0B", desc: "PDF toolkit", logo: "pdf" },
    { id: "hub", code: "HUB", color: "#3B82F6", desc: "Files and storage", logo: "hub" },
    { id: "ascend", code: "ASC", color: "#0EA5E9", desc: "Study webapp by H3NZ", icon: "cap" }
  ];
  var STUDIOS = [
    { id: "word", code: "T", name: "TXT" },
    { id: "vac", code: "Va", name: "VAC", logo: "vac" },
    { id: "pixel", code: "Px", name: "PXL", logo: "pxl" }
  ];
  var APP_IDS = ["grd", "dck", "mem", "pdf", "hub"];

  var CAP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.6 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0z"/>' +
    '<path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';

  var built = false, view = null, searchInput = null, recentBox = null, profileBox = null;

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
    brand.appendChild(h("div", "nxt-brand-name", "NXT OS"));
    brand.appendChild(h("div", "nxt-brand-tag", "Documents, sheets, slides, boards, files and study. One OS home."));
    wrap.appendChild(brand);

    wrap.appendChild(buildProfile());

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
      var badge = h("span", "nxt-studio-badge", s.logo ? "" : s.code);
      if (s.logo && T.appLogoImg) {
        badge.className += " nxt-studio-logo";
        var sImg = T.appLogoImg(s.logo);
        if (sImg) badge.appendChild(sImg);
      }
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
      var badge = h("span", "nxt-tile-badge", null);
      var usedLogo = false;
      if (a.logo && T.appLogoImg) {
        /* user-supplied wordmark on a white app-icon tile */
        var lImg = T.appLogoImg(a.logo);
        if (lImg) {
          badge.className += " nxt-tile-logo";
          badge.appendChild(lImg);
          usedLogo = true;
        }
      }
      if (!usedLogo) badge.style.background = a.color;
      if (a.icon === "cap") {
        /* graduation-cap icon badge for Ascend (inline, no gradient ids) */
        badge.innerHTML = CAP_SVG;
        badge.style.display = "inline-flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
      } else if (!usedLogo) {
        badge.textContent = a.code;
      }
      t.appendChild(badge);
      t.appendChild(h("span", "nxt-tile-name", a.code));
      t.appendChild(h("span", "nxt-tile-desc", a.desc));
      (function (id) {
        t.addEventListener("click", function () { openAppTile(id); });
      })(a.id);
      grid.appendChild(t);
    });
    wrap.appendChild(grid);

    wrap.appendChild(h("div", "nxt-sec-head", "Learn"));
    var learnGrid = h("div", "nxt-grid", null);
    var tut = h("button", "nxt-tile", null);
    tut.type = "button";
    tut.setAttribute("data-search", "tutorials help guide learn how to");
    tut.setAttribute("aria-label", "Tutorials: step-by-step guides for every app");
    var tutBadge = h("span", "nxt-tile-badge", null);
    tutBadge.style.background = "#4F46E5";
    /* book icon (inline, no gradient ids) to avoid colliding with the NXT logo
       already rendered in the boot splash and login views */
    tutBadge.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
      '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
    tutBadge.style.display = "inline-flex";
    tutBadge.style.alignItems = "center";
    tutBadge.style.justifyContent = "center";
    tut.appendChild(tutBadge);
    tut.appendChild(h("span", "nxt-tile-name", "Tutorials"));
    tut.appendChild(h("span", "nxt-tile-desc", "Step-by-step guides for every app"));
    tut.addEventListener("click", function () {
      if (T.tutorials && T.tutorials.open) T.tutorials.open();
    });
    learnGrid.appendChild(tut);
    wrap.appendChild(learnGrid);

    wrap.appendChild(h("div", "nxt-sec-head", "Recent"));
    recentBox = h("div", "nxt-recents", null);
    wrap.appendChild(recentBox);

    view.appendChild(wrap);
    renderRecents();
    renderFooter(wrap);
  }

  /* ---------- username profile (localStorage-persisted, switchable) ---------- */
  function getUsername() {
    try { return (T.store && T.store.get("nxt", "username")) || ""; }
    catch (e) { return ""; }
  }
  function setUsername(name) {
    try { if (T.store) T.store.set("nxt", "username", name); } catch (e) {}
  }
  function buildProfile() {
    var box = h("div", "nxt-profile", null);
    profileBox = box;
    renderProfile(box);
    return box;
  }
  function renderProfile(box) {
    box.innerHTML = "";
    var name = getUsername();
    if (name) {
      var greet = h("div", "nxt-greet", null);
      greet.appendChild(document.createTextNode("Welcome "));
      var ub = document.createElement("button");
      ub.type = "button";
      ub.className = "nxt-user";
      ub.textContent = name;
      ub.title = "Switch user";
      ub.setAttribute("aria-label", "Signed in as " + name + ". Switch user.");
      ub.addEventListener("click", function () { renderProfileEdit(box); });
      greet.appendChild(ub);
      greet.appendChild(document.createTextNode(", what's your goal for today?"));
      box.appendChild(greet);
    } else {
      /* Signed-out users never see a form here: the dedicated login
         screen (T.nxtLogin) handles sign-in. This branch is a fallback
         that routes there. */
      var g2 = h("div", "nxt-greet", "Welcome, what's your goal for today?");
      box.appendChild(g2);
      var sbtn = document.createElement("button");
      sbtn.type = "button";
      sbtn.className = "nxt-name-btn";
      sbtn.textContent = "Sign in";
      sbtn.style.marginTop = "10px";
      sbtn.addEventListener("click", function () {
        if (T.nxtLogin) T.nxtLogin.show();
      });
      box.appendChild(sbtn);
    }
  }
  function renderProfileEdit(box) {
    box.innerHTML = "";
    var g = h("div", "nxt-greet", "Switch user");
    box.appendChild(g);
    var form = h("div", "nxt-signin", null);
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "nxt-name-input";
    inp.value = getUsername();
    inp.setAttribute("aria-label", "Username");
    inp.maxLength = 24;
    inp.autocomplete = "nickname";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nxt-name-btn";
    btn.textContent = "Switch";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "nxt-name-cancel";
    cancel.textContent = "Cancel";
    function save() {
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      setUsername(v);
      renderProfile(box);
    }
    btn.addEventListener("click", save);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
    cancel.addEventListener("click", function () { renderProfile(box); });
    form.appendChild(inp);
    form.appendChild(btn);
    form.appendChild(cancel);
    box.appendChild(form);
    inp.focus();
    inp.select();
  }

  /* ---------- footer with support link ---------- */
  function renderFooter(wrap) {
    var foot = h("div", "nxt-foot", null);
    foot.appendChild(h("span", "nxt-foot-brand", "NXT OS • Developed by H3NZ"));
    var links = h("div", "nxt-foot-links", null);
    [["Terms", "showTerms"], ["Privacy", "showPrivacy"], ["FAQ", "showFaq"], ["Settings", "showSettings"]].forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "nxt-foot-link";
      b.textContent = pair[0];
      b.addEventListener("click", function () { if (T.nxtLegal) T.nxtLegal[pair[1]](); });
      links.appendChild(b);
    });
    var a = document.createElement("a");
    a.className = "nxt-foot-support";
    a.href = "mailto:thitsarnextdoor@gmail.com";
    a.textContent = "Support: thitsarnextdoor@gmail.com";
    links.appendChild(a);
    foot.appendChild(links);
    wrap.appendChild(foot);
  }

  function show() {
    build();
    /* The dedicated login screen owns sign-in. Home never renders for a
       signed-out user; route them to T.nxtLogin instead. */
    if (!getUsername()) {
      if (T.nxtLogin) { T.nxtLogin.show(); return; }
    }
    renderRecents();
    if (profileBox) renderProfile(profileBox);
    if (searchInput) { searchInput.value = ""; applyFilter(""); }
    if (T.ecosystem && T.ecosystem.home) T.ecosystem.home();
    else if (view) {
      ["view-word", "view-vac", "view-pixel", "view-grd", "view-dck", "view-mem", "view-pdf", "view-hub", "view-ascend"].forEach(function (id) {
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
