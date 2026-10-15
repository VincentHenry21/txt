/* NXT OS Phase 1 workstream C: per-app splash cards.
   Shows a brief Adobe/MS-style splash card when the user opens an app or
   studio, then auto-dismisses. Bus-driven only; never edits ecosystem.js,
   index.html, or any app file.
     T.nxtSplash = { show(appId), hide() }
   Listened events: "ecosystem:app" ({app}), "ecosystem:persona" ({persona}),
   "ecosystem:home" ({}). Home skips the splash (boot splash covers launch).
   Degrades gracefully when T.bus or T.nxtLogos is missing. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  /* Display identity per target: name + logo id for T.nxtLogos.get(). */
  var IDENT = {
    txt:    { name: "TXT",    logoId: "txt" },
    word:   { name: "TXT",    logoId: "txt" },
    grd:    { name: "GRD",    logoId: "grd" },
    dck:    { name: "DCK",    logoId: "dck" },
    mem:    { name: "MEM",    logoId: "mem" },
    pdf:    { name: "PDF",    logoId: "pdf" },
    hub:    { name: "HUB",    logoId: "hub" },
    vector: { name: "VEC",    logoId: "vec" },
    pixel:  { name: "PXL",    logoId: "pxl" },
    home:   { name: "NXT OS", logoId: "nxt" }
  };

  var DEFAULT_ACCENT = "#7C3AED";
  var SHOW_MS = 600;        // normal auto-dismiss
  var HARD_MS = 1200;       // guaranteed removal, even if something stalls

  var current = null;       // the overlay node currently shown, if any
  var timers = [];          // active timer ids, cleared on hide
  var lastKey = null;       // display-identity key of the last shown splash

  function later(fn, ms) {
    var id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(function (id) { window.clearTimeout(id); });
    timers = [];
  }

  function accent() {
    try {
      var v = window.getComputedStyle(document.documentElement)
        .getPropertyValue("--nxt-accent");
      v = (v || "").trim();
      if (v) return v;
    } catch (e) { /* fall through */ }
    return DEFAULT_ACCENT;
  }

  function logoMarkup(logoId) {
    try {
      if (T.nxtLogos && typeof T.nxtLogos.get === "function") {
        var svg = T.nxtLogos.get(logoId);
        if (typeof svg === "string" && svg.indexOf("<svg") >= 0) return svg;
      }
    } catch (e) { /* fall through to badge */ }
    return "";
  }

  function hideNow() {
    clearTimers();
    if (current && current.parentNode) current.parentNode.removeChild(current);
    current = null;
  }

  function show(appId) {
    var ident = IDENT[appId];
    if (!ident) return;
    /* Skip no-op switches: the target is already the visible identity.
       Keys on display identity, so "txt" and "word" both resolve to TXT. */
    var key = ident.name + "|" + ident.logoId;
    if (key === lastKey) return;
    lastKey = key;
    hideNow();
    if (typeof document === "undefined" || !document.body) return;

    var acc = accent();
    var ov = document.createElement("div");
    ov.id = "nxtSplash";
    ov.className = "nxt-splash";
    ov.setAttribute("aria-hidden", "true");

    var card = document.createElement("div");
    card.className = "nxt-splash-card";
    card.style.setProperty("--nxacc", acc);

    var logoBox = document.createElement("div");
    logoBox.className = "nxt-splash-logo";
    var svg = logoMarkup(ident.logoId);
    if (svg) {
      logoBox.innerHTML = svg;
    } else {
      var badge = document.createElement("span");
      badge.className = "nxt-splash-badge";
      badge.textContent = ident.name;
      badge.style.setProperty("--nxacc", acc);
      logoBox.appendChild(badge);
    }
    card.appendChild(logoBox);

    var nameEl = document.createElement("div");
    nameEl.className = "nxt-splash-name";
    nameEl.textContent = ident.name;
    nameEl.style.color = acc;
    card.appendChild(nameEl);

    var cap = document.createElement("div");
    cap.className = "nxt-splash-cap";
    cap.textContent = "Engineered by H3NZ";
    card.appendChild(cap);

    var bar = document.createElement("div");
    bar.className = "nxt-splash-bar";
    bar.appendChild(document.createElement("i"));
    card.appendChild(bar);

    ov.appendChild(card);
    document.body.appendChild(ov);
    current = ov;

    /* Hide on the app's first real paint, whichever comes first. */
    try {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { if (current === ov) hideNow(); });
      });
    } catch (e) { /* timer fallback covers it */ }
    later(function () { if (current === ov) hideNow(); }, SHOW_MS);
    later(function () { if (current === ov) hideNow(); }, HARD_MS);
  }

  function hide() {
    hideNow();
  }

  function onApp(d) { if (d && d.app) show(d.app); }
  function onPersona(d) { if (d && d.persona) show(d.persona); }
  function onHome() { lastKey = "NXT OS|nxt"; hideNow(); }

  /* Bus wiring; graceful when T.bus is missing (manual T.nxtSplash.show works). */
  try {
    if (T.bus && typeof T.bus.on === "function") {
      T.bus.on("ecosystem:app", onApp);
      T.bus.on("ecosystem:persona", onPersona);
      T.bus.on("ecosystem:home", onHome);
    }
  } catch (e) { /* no crash */ }

  T.nxtSplash = { show: show, hide: hide };
})();
