/* NXT OS Tutorials viewer: App -> Tab -> Feature browser with search,
   "Try it" deep links, and persisted progress. Local only. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var PROG_KEY = "tutorialProgress";
  var view = null, built = false;
  var curApp = "txt", curTab = null, query = "";
  var expanded = {}; // featureKey -> true

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgIcon() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
      '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
  }
  function helpIcon() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }

  /* ---------- progress (T.store returns a fresh copy on every read) ---------- */
  function getProgress() {
    try {
      var p = T.store && T.store.get("nxt", PROG_KEY);
      return (p && typeof p === "object") ? p : {};
    } catch (e) { return {}; }
  }
  function setProgress(p) {
    try { if (T.store) T.store.set("nxt", PROG_KEY, p || {}); } catch (e) {}
  }
  function featureKey(appId, tabId, featId) { return appId + ":" + tabId + ":" + featId; }
  function isDone(appId, tabId, featId) { return !!getProgress()[featureKey(appId, tabId, featId)]; }
  function setDone(appId, tabId, featId, done) {
    var p = getProgress(); // fresh copy, mutate and persist the same object
    var k = featureKey(appId, tabId, featId);
    if (done) p[k] = 1; else delete p[k];
    setProgress(p);
  }
  function appStats(appId) {
    var app = T.NXT_TUTORIALS[appId], total = 0, done = 0;
    app.tabs.forEach(function (t) {
      t.features.forEach(function (f) {
        total++;
        if (isDone(appId, t.id, f.id)) done++;
      });
    });
    return { total: total, done: done };
  }
  function ringSVG(done, total, color, size) {
    size = size || 40;
    var r = 15.5, c = 2 * Math.PI * r;
    var frac = total ? done / total : 0;
    var off = c * (1 - frac);
    return '<svg class="nt-ring" width="' + size + '" height="' + size + '" viewBox="0 0 36 36" aria-hidden="true">' +
      '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="var(--line,#e5e7eb)" stroke-width="4"/>' +
      '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4" ' +
      'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
      'transform="rotate(-90 18 18)"/>' +
      '<text x="18" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">' + done + '</text></svg>';
  }

  /* ---------- Try it deep link ---------- */
  function tryFeature(appId, tabId, featTryTab) {
    var app = T.NXT_TUTORIALS[appId];
    if (!app) return;
    try {
      if (app.open.kind === "persona") {
        if (T.ecosystem && T.ecosystem.setPersona) T.ecosystem.setPersona(app.open.id);
      } else if (T.ecosystem && T.ecosystem.openApp) {
        T.ecosystem.openApp(app.open.id);
      }
    } catch (e) { return; }
    var target = featTryTab || tabId;
    if (!target) return;
    setTimeout(function () {
      try {
        if (appId === "txt" && T.ribbon && typeof T.ribbon.switchTab === "function") {
          T.ribbon.switchTab(target);
        } else if (appId === "dck") {
          var b = document.getElementById("dckr-tab-" + target);
          if (b) b.click();
        }
      } catch (e) {}
    }, 700);
  }

  /* ---------- rendering ---------- */
  function appIds() { return Object.keys(T.NXT_TUTORIALS || {}); }

  function renderApps(col) {
    col.innerHTML = "";
    appIds().forEach(function (id) {
      var app = T.NXT_TUTORIALS[id];
      var st = appStats(id);
      var b = h("button", "nt-app" + (id === curApp ? " active" : ""), null);
      b.type = "button";
      b.setAttribute("aria-label", app.name + " tutorials, " + st.done + " of " + st.total + " done");
      var logo = document.createElement("span");
      logo.className = "nt-app-logo";
      try { logo.innerHTML = (T.nxtLogos ? T.nxtLogos.get(id) : ""); } catch (e) {}
      b.appendChild(logo);
      var meta = h("span", "nt-app-meta", null);
      meta.appendChild(h("span", "nt-app-name", app.code));
      meta.appendChild(h("span", "nt-app-count", st.done + "/" + st.total));
      b.appendChild(meta);
      b.insertAdjacentHTML("beforeend", ringSVG(st.done, st.total, app.color, 34));
      (function (aid) {
        b.addEventListener("click", function () {
          curApp = aid;
          var tabs = T.NXT_TUTORIALS[aid].tabs;
          curTab = tabs.length ? tabs[0].id : null;
          query = "";
          var si = view.querySelector(".nt-search");
          if (si) si.value = "";
          render();
        });
      })(id);
      col.appendChild(b);
    });
  }

  function renderTabs(col) {
    col.innerHTML = "";
    var app = T.NXT_TUTORIALS[curApp];
    if (!app) return;
    app.tabs.forEach(function (t) {
      var done = 0;
      t.features.forEach(function (f) { if (isDone(curApp, t.id, f.id)) done++; });
      var b = h("button", "nt-tab" + (t.id === curTab ? " active" : ""), null);
      b.type = "button";
      b.appendChild(h("span", "nt-tab-title", t.title));
      b.appendChild(h("span", "nt-tab-count", done + "/" + t.features.length));
      (function (tid) {
        b.addEventListener("click", function () { curTab = tid; render(); });
      })(t.id);
      col.appendChild(b);
    });
  }

  function featureMatches(f, q) {
    if (!q) return true;
    var hay = (f.title + " " + f.steps.join(" ") + " " + (f.tip || "")).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function renderFeatures(col) {
    col.innerHTML = "";
    var q = query.trim().toLowerCase();
    if (q) {
      // search mode: features across all apps
      var hits = 0;
      appIds().forEach(function (aid) {
        var app = T.NXT_TUTORIALS[aid];
        app.tabs.forEach(function (t) {
          t.features.forEach(function (f) {
            if (featureMatches(f, q)) { hits++; col.appendChild(featureCard(aid, t.id, f, app.name + " / " + t.title)); }
          });
        });
      });
      if (!hits) col.appendChild(h("div", "nt-empty", "No tutorials match your search."));
      return;
    }
    var app = T.NXT_TUTORIALS[curApp];
    if (!app) return;
    var tab = null;
    app.tabs.forEach(function (t) { if (t.id === curTab) tab = t; });
    if (!tab) { tab = app.tabs[0]; curTab = tab ? tab.id : null; }
    if (!tab) return;
    var head = h("div", "nt-tabhead", null);
    head.appendChild(h("h2", null, tab.title));
    var st = { done: 0, total: tab.features.length };
    tab.features.forEach(function (f) { if (isDone(curApp, tab.id, f.id)) st.done++; });
    head.appendChild(h("span", "nt-tabhead-count", st.done + " of " + st.total + " done"));
    col.appendChild(head);
    tab.features.forEach(function (f) { col.appendChild(featureCard(curApp, tab.id, f, null)); });
  }

  function featureCard(appId, tabId, f, crumb) {
    var key = featureKey(appId, tabId, f.id);
    var done = isDone(appId, tabId, f.id);
    var card = h("article", "nt-feature" + (done ? " done" : ""), null);
    if (crumb) card.appendChild(h("div", "nt-crumb", crumb));
    var top = h("div", "nt-feature-top", null);
    var title = h("h3", null, f.title);
    top.appendChild(title);
    var actions = h("div", "nt-feature-actions", null);
    var tryBtn = h("button", "nt-btn nt-try", "Try it");
    tryBtn.type = "button";
    tryBtn.setAttribute("aria-label", "Try " + f.title + " in " + appId.toUpperCase());
    tryBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      tryFeature(appId, tabId, f.tryTab);
    });
    actions.appendChild(tryBtn);
    var doneBtn = h("button", "nt-btn nt-donebtn" + (done ? " on" : ""), done ? "Done" : "Mark done");
    doneBtn.type = "button";
    doneBtn.setAttribute("aria-pressed", done ? "true" : "false");
    doneBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setDone(appId, tabId, f.id, !isDone(appId, tabId, f.id));
      render();
    });
    actions.appendChild(doneBtn);
    var expBtn = h("button", "nt-exp", expanded[key] ? "Hide steps" : "Show steps");
    expBtn.type = "button";
    expBtn.setAttribute("aria-expanded", expanded[key] ? "true" : "false");
    expBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      expanded[key] = !expanded[key];
      render();
    });
    top.appendChild(actions);
    top.appendChild(expBtn);
    top.addEventListener("click", function () {
      expanded[key] = !expanded[key];
      render();
    });
    card.appendChild(top);
    if (expanded[key]) {
      var ol = h("ol", "nt-steps", null);
      f.steps.forEach(function (s, i) {
        var li = h("li", null, null);
        li.appendChild(h("span", "nt-step-n", String(i + 1)));
        li.appendChild(h("span", "nt-step-t", s));
        ol.appendChild(li);
      });
      card.appendChild(ol);
      if (f.tip) {
        var tip = h("div", "nt-tip", null);
        tip.appendChild(h("strong", null, "Tip: "));
        tip.appendChild(document.createTextNode(f.tip));
        card.appendChild(tip);
      }
    }
    return card;
  }

  function render() {
    if (!view) return;
    var appsCol = view.querySelector(".nt-apps");
    var tabsCol = view.querySelector(".nt-tabs");
    var featCol = view.querySelector(".nt-features");
    if (appsCol) renderApps(appsCol);
    if (tabsCol) renderTabs(tabsCol);
    if (featCol) renderFeatures(featCol);
  }

  function build() {
    view = document.getElementById("view-tutorials");
    if (!view || built) return;
    built = true;
    view.innerHTML = "";
    var wrap = h("div", "nt-wrap", null);

    var head = h("header", "nt-head", null);
    var back = h("button", "nt-back", null);
    back.type = "button";
    back.setAttribute("aria-label", "Back to NXT OS home");
    back.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/>' +
      '<path d="M12 19l-7-7 7-7"/></svg><span>Home</span>';
    back.addEventListener("click", function () {
      if (T.ecosystem && T.ecosystem.home) T.ecosystem.home();
    });
    head.appendChild(back);
    var title = h("div", "nt-title", null);
    title.innerHTML = svgIcon();
    title.appendChild(h("h1", null, "Tutorials"));
    head.appendChild(title);
    var search = h("input", "nt-search", null);
    search.type = "search";
    search.placeholder = "Search all tutorials";
    search.setAttribute("aria-label", "Search all tutorials");
    search.addEventListener("input", function () {
      query = search.value;
      renderFeatures(view.querySelector(".nt-features"));
    });
    head.appendChild(search);
    var credit = h("span", "nt-credit", "NXT Tutorials • Developed by H3NZ");
    head.appendChild(credit);
    wrap.appendChild(head);

    var body = h("div", "nt-body", null);
    var appsCol = h("nav", "nt-apps", null);
    appsCol.setAttribute("aria-label", "Apps");
    var tabsCol = h("nav", "nt-tabs", null);
    tabsCol.setAttribute("aria-label", "Tabs");
    var featCol = h("main", "nt-features", null);
    body.appendChild(appsCol);
    body.appendChild(tabsCol);
    body.appendChild(featCol);
    wrap.appendChild(body);
    view.appendChild(wrap);
    render();
  }

  /* ---------- help buttons in each app top bar ---------- */
  var VIEW_TO_APP = {
    "view-word": null, // persona-dependent
    "view-vac": "vac", "view-pixel": "pxl",
    "view-grd": "grd", "view-dck": "dck", "view-mem": "mem",
    "view-pdf": "pdf", "view-hub": "hub"
  };
  function appIdForView(viewId) {
    if (viewId === "view-word") {
      var p = null;
      try { p = T.ecosystem && T.ecosystem.persona; } catch (e) {}
      return p === "vac" ? "vac" : p === "pixel" ? "pxl" : "txt";
    }
    return VIEW_TO_APP[viewId] || null;
  }
  function injectHelpButtons() {
    var waffles = document.querySelectorAll(".waffle-btn");
    for (var i = 0; i < waffles.length; i++) {
      (function (w) {
        if (w.parentNode && w.parentNode.querySelector(".nt-helpbtn")) return;
        var sec = w.closest("section.view");
        var appId = sec ? appIdForView(sec.id) : null;
        if (!appId || !T.NXT_TUTORIALS[appId]) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "icon-btn nt-helpbtn";
        b.title = appId.toUpperCase() + " tutorials";
        b.setAttribute("aria-label", "Open " + appId.toUpperCase() + " tutorials");
        b.innerHTML = helpIcon();
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          openTutorials(appId);
        });
        w.parentNode.insertBefore(b, w.nextSibling);
      })(waffles[i]);
    }
  }

  /* ---------- public API ---------- */
  function openTutorials(appId) {
    build();
    if (appId && T.NXT_TUTORIALS[appId]) {
      curApp = appId;
      var tabs = T.NXT_TUTORIALS[appId].tabs;
      curTab = tabs.length ? tabs[0].id : null;
    }
    query = "";
    var si = view.querySelector(".nt-search");
    if (si) si.value = "";
    render();
    if (T.ecosystem && typeof T.ecosystem.showTutorials === "function") {
      T.ecosystem.showTutorials();
    }
  }

  function init() {
    build();
    injectHelpButtons();
    if (T.bus && T.bus.on) {
      T.bus.on("ecosystem:app", function () { setTimeout(injectHelpButtons, 400); });
      T.bus.on("ecosystem:home", function () { setTimeout(injectHelpButtons, 400); });
    }
    setTimeout(injectHelpButtons, 1500);
  }

  T.tutorials = {
    open: openTutorials,
    tryFeature: tryFeature,
    stats: appStats,
    _injectHelp: injectHelpButtons,
    _reset: function () { built = false; view = null; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 300);
  }
})();
