/* TXT ribbon module: tab switching, groups, buttons, menus, pill bar, KeyTips.
 * Defines window.TXT.ribbon per ARCHITECTURE.md section 9. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$, esc = T.esc, bus = T.bus;

  function R() { return document.getElementById("ribbon"); }
  function TabsEl() { return document.getElementById("ribbonTabs"); }
  function PanelsEl() { return document.getElementById("ribbonPanels"); }
  function PillEl() { return document.getElementById("pillBar"); }
  function KeysEl() { return document.getElementById("keytips"); }
  function StageEl() { return document.getElementById("stage"); }

  var tabIds = [];              // call order
  var pendingTabs = [];         // addTab calls before DOM exists
  var toggleBtns = [];          // buttons with _toggleFn to refresh
  var activeTabId = null;
  var keytipsOn = false;
  var initialized = false;

  /* ---------- addTab ---------- */
  function doAddTab(spec) {
    var tabs = TabsEl(), panels = PanelsEl();
    if (!tabs || !panels) return;
    if (tabIds.indexOf(spec.id) >= 0) return;
    tabIds.push(spec.id);

    var b = document.createElement("button");
    b.type = "button";
    b.className = "rtab";
    b.setAttribute("data-tab", spec.id);
    b.setAttribute("role", "tab");
    b.title = esc(spec.label || spec.id);
    b.textContent = spec.label || spec.id;
    if (spec.keytip) b.setAttribute("data-keytip", spec.keytip);
    b.addEventListener("click", function () { switchTab(spec.id); });
    tabs.appendChild(b);

    var sec = document.createElement("section");
    sec.className = "rpanel hidden";
    sec.setAttribute("data-panel", spec.id);
    sec.setAttribute("role", "tabpanel");
    panels.appendChild(sec);
  }

  function addTab(spec) {
    if (!TabsEl() || !PanelsEl()) { pendingTabs.push(spec); return; }
    doAddTab(spec);
  }

  /* ---------- group ---------- */
  function group(tabId, label) {
    var sec = document.querySelector('section[data-panel="' + tabId + '"]');
    var body = document.createElement("div");
    body.className = "rg-body";
    if (!sec) {
      console.warn("[TXT ribbon] group: no section for tab", tabId);
      return body; // detached
    }
    var wrap = document.createElement("div");
    wrap.className = "rgroup";
    var lab = document.createElement("div");
    lab.className = "rg-label";
    lab.textContent = label || "";
    wrap.appendChild(body);
    wrap.appendChild(lab);
    sec.appendChild(wrap);
    body._rgroup = wrap; // full group element (label + body) for show/hide
    return body;
  }

  /* ---------- button refresh for toggle functions ---------- */
  function refreshToggles() {
    toggleBtns.forEach(function (btn) {
      if (!btn.isConnected) return;
      try { btn.classList.toggle("active", !!btn._toggleFn()); }
      catch (e) { console.warn("[TXT ribbon] toggle fn threw", e); }
    });
  }
  var refreshTogglesDeb = T.debounce(refreshToggles, 120);
  bus.on("sel:change", refreshTogglesDeb);
  bus.on("doc:change", refreshTogglesDeb);

  /* ---------- btn ---------- */
  function btn(o) {
    o = o || {};
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rbtn" + (o.small ? " sm" : "") + (o.wide ? " wide" : "");
    b.title = o.title || o.label || "";
    var html = T.icon(o.icon || "i-file") + '<span class="rlab">' + esc(o.label || "") + "</span>";
    if (o.menu) html += '<svg class="caret" aria-hidden="true"><use href="#i-chev-d"/></svg>';
    b.innerHTML = html;
    if (o.keytip) b.setAttribute("data-keytip", o.keytip);

    b.addEventListener("click", function () {
      if (o.onClick) { o.onClick(); return; }
      if (o.cmd) {
        if (o.toggle === true) b.classList.toggle("active");
        T.cmd.apply(null, [o.cmd].concat(o.args || []));
      }
    });

    if (typeof o.toggle === "function") {
      b._toggleFn = o.toggle;
      toggleBtns.push(b);
      try { b.classList.toggle("active", !!o.toggle()); } catch (e) { /* ignore */ }
    } else if (o.toggle === true) {
      toggleBtns.push(b);
      b._toggleFn = function () { return b.classList.contains("active"); };
    }
    return b;
  }

  /* ---------- select ---------- */
  function select(o) {
    o = o || {};
    var s = document.createElement("select");
    s.className = "rsel sel" + (o.cls ? " " + o.cls : "");
    if (o.title) s.title = o.title;
    (o.options || []).forEach(function (opt) {
      var op = document.createElement("option");
      op.value = opt.v;
      op.textContent = opt.t;
      if (opt.v === o.value) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener("change", function () { if (o.onChange) o.onChange(s.value); });
    return s;
  }

  /* ---------- menu ---------- */
  var menuEl = null, menuAnchor = null;
  var menuDocDown = null, menuKeyDown = null, menuBusOff = null;

  function openMenu(anchorEl, items) {
    closeMenu();
    items = items || [];
    var m = document.createElement("div");
    m.className = "rmenu";
    m.setAttribute("role", "menu");
    items.forEach(function (it) {
      if (!it) return;
      if (it.sep) {
        var sep = document.createElement("div");
        sep.className = "mi-sep";
        m.appendChild(sep);
        return;
      }
      if (it.head) {
        var h = document.createElement("div");
        h.className = "mi-head";
        h.textContent = it.head;
        m.appendChild(h);
        return;
      }
      if (it.html != null) {
        var raw = document.createElement("div");
        raw.innerHTML = it.html;
        m.appendChild(raw);
        return;
      }
      var mi = document.createElement("button");
      mi.type = "button";
      mi.className = "mi" + (it.active ? " active" : "");
      mi.innerHTML = T.icon(it.icon || "i-file") + "<span>" + esc(it.label || "") + "</span>";
      mi.addEventListener("click", function () {
        closeMenu();
        if (it.fn) it.fn();
      });
      m.appendChild(mi);
    });
    document.body.appendChild(m);

    var r = anchorEl.getBoundingClientRect();
    var mh = m.offsetHeight || 200;
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.position = "fixed";
    m.style.top = top + "px";
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - (m.offsetWidth || 220) - 8)) + "px";
    m.style.zIndex = "1000";

    menuEl = m;
    menuAnchor = anchorEl;

    menuDocDown = function (ev) {
      if (menuEl && !menuEl.contains(ev.target) && ev.target !== anchorEl && !anchorEl.contains(ev.target)) closeMenu();
    };
    menuKeyDown = function (ev) { if (ev.key === "Escape") closeMenu(); };
    menuBusOff = bus.on("overlay:escape", closeMenu);
    document.addEventListener("mousedown", menuDocDown);
    document.addEventListener("keydown", menuKeyDown);
  }

  function closeMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
    menuAnchor = null;
    if (menuDocDown) { document.removeEventListener("mousedown", menuDocDown); menuDocDown = null; }
    if (menuKeyDown) { document.removeEventListener("keydown", menuKeyDown); menuKeyDown = null; }
    if (menuBusOff) { bus.off("overlay:escape", menuBusOff); menuBusOff = null; }
  }

  function menuBtn(o) {
    o = o || {};
    var b = btn({ icon: o.icon, label: o.label, title: o.title, keytip: o.keytip, small: o.small, wide: o.wide, menu: true });
    b.addEventListener("click", function () {
      openMenu(b, typeof o.items === "function" ? o.items() : o.items);
    });
    if (o.itemFn) b._itemFn = o.itemFn;
    return b;
  }

  function split(o) {
    o = o || {};
    var sp = document.createElement("span");
    sp.className = "split";
    var main = btn({ icon: o.icon, label: o.label, title: o.title, keytip: o.keytip });
    main.addEventListener("click", function () { T.cmd(o.cmd); });
    var caret = document.createElement("button");
    caret.type = "button";
    caret.className = "rbtn split-caret";
    caret.title = o.title || o.label || "";
    caret.innerHTML = '<svg class="caret" aria-hidden="true"><use href="#i-chev-d"/></svg>';
    caret.setAttribute("aria-label", "More options");
    caret.addEventListener("click", function () { openMenu(caret, o.items || []); });
    sp.appendChild(main);
    sp.appendChild(caret);
    return sp;
  }

  /* ---------- switchTab ---------- */
  function switchTab(id) {
    if (tabIds.indexOf(id) < 0) return;
    activeTabId = id;
    $$("#ribbonTabs [data-tab]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === id);
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === id ? "true" : "false");
    });
    $$("#ribbonPanels section[data-panel]").forEach(function (s) {
      s.classList.toggle("hidden", s.getAttribute("data-panel") !== id);
    });
    T.state.prefs.ribbonTab = id;
    T.savePrefs();
    if (keytipsOn) keytips(true);
  }

  /* ---------- setMode ---------- */
  function buildPillBar() {
    var p = PillEl();
    if (!p || p.getAttribute("data-built") === "1") return;
    p.setAttribute("data-built", "1");
    var defs = [
      { icon: "i-undo", label: "Undo", cmd: "doc.undo", title: "Undo" },
      { icon: "i-redo", label: "Redo", cmd: "doc.redo", title: "Redo" },
      { icon: "i-bold", label: "Bold", cmd: "fmt.bold", title: "Bold" },
      { icon: "i-italic", label: "Italic", cmd: "fmt.italic", title: "Italic" },
      { icon: "i-underline", label: "Underline", cmd: "fmt.underline", title: "Underline" },
      { icon: "i-page", label: "Headings", cmd: "fmt.headingCycle", title: "Cycle heading level" },
      { icon: "i-bullets", label: "Bullets", cmd: "fmt.bullets", title: "Bullet list" },
      { icon: "i-plus", label: "Comment", cmd: "comments.add", title: "Add comment" },
      { icon: "i-search", label: "AI", cmd: "ai.open", title: "AI assistant" }
    ];
    defs.forEach(function (d) {
      p.appendChild(btn({ icon: d.icon, label: d.label, cmd: d.cmd, title: d.title, small: true }));
    });
  }

  function setMode(mode) {
    var ribbon = R(), pill = PillEl();
    mode = mode === "compact" ? "compact" : mode === "zen" ? "zen" : "full";
    if (ribbon) {
      ribbon.classList.remove("mode-compact", "mode-zen");
      if (mode === "compact") ribbon.classList.add("mode-compact");
      if (mode === "zen") ribbon.classList.add("mode-zen");
    }
    if (pill) {
      if (mode === "zen") { buildPillBar(); pill.classList.remove("hidden"); }
      else pill.classList.add("hidden");
    }
    T.state.prefs.ribbonMode = mode;
    T.savePrefs();
    bus.emit("ribbon:mode", mode);
  }

  /* ---------- KeyTips ---------- */
  function clearKeytips() {
    var k = KeysEl();
    if (k) { k.innerHTML = ""; k.classList.add("hidden"); }
  }

  function badge(text, left, top) {
    var b = document.createElement("span");
    b.className = "kt-badge";
    b.textContent = text;
    b.setAttribute("style",
      "position:absolute;left:" + Math.round(left) + "px;top:" + Math.round(top) + "px;" +
      "min-width:18px;height:18px;line-height:18px;text-align:center;font-size:11px;font-weight:700;" +
      "background:var(--accent,#2563EB);color:#fff;border-radius:5px;padding:0 4px;z-index:121;pointer-events:none;");
    return b;
  }

  function keytips(show) {
    keytipsOn = !!show;
    var layer = KeysEl(), stage = StageEl();
    if (!layer || !stage) return;
    clearKeytips();
    if (!show) return;
    var sr = stage.getBoundingClientRect();
    layer.classList.remove("hidden");
    // tab letters
    $$("#ribbonTabs [data-tab]").forEach(function (b) {
      var kt = b.getAttribute("data-keytip");
      if (!kt) return;
      var r = b.getBoundingClientRect();
      layer.appendChild(badge(kt, r.left - sr.left, r.top - sr.top - 10));
    });
    // numbered controls in the active panel
    if (activeTabId) {
      var btns = $$('section[data-panel="' + activeTabId + '"] .rbtn', document);
      var n = 0;
      btns.forEach(function (b) {
        if (b.getClientRects().length === 0) return; // hidden or in hidden panel
        n += 1;
        var r = b.getBoundingClientRect();
        layer.appendChild(badge(String(n), r.left - sr.left + 2, r.top - sr.top - 10));
      });
    }
  }
  bus.on("keytips:toggle", function () { keytips(!keytipsOn); });
  bus.on("overlay:escape", function () { if (keytipsOn) keytips(false); });

  /* ---------- init ---------- */
  function init() {
    if (initialized) return;
    initialized = true;
    while (pendingTabs.length) doAddTab(pendingTabs.shift());

    var col = document.getElementById("ribbonCollapse");
    if (col) col.addEventListener("click", function () { R().classList.toggle("collapsed"); });

    setMode(T.state.prefs.ribbonMode || "full");
    var want = T.state.prefs.ribbonTab;
    switchTab(tabIds.indexOf(want) >= 0 ? want : (tabIds[0] || "home"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.addEventListener("load", init);

  T.ribbon = {
    addTab: addTab,
    group: group,
    btn: btn,
    select: select,
    menuBtn: menuBtn,
    split: split,
    openMenu: openMenu,
    closeMenu: closeMenu,
    switchTab: switchTab,
    setMode: setMode,
    keytips: keytips,
    _ready: function () { return initialized; },
    _activeTab: function () { return activeTabId; }
  };
})();
