/* NXT OS theme switcher (workstream D, Phase 1 Identity). IIFE module.
   Exposes T.nxtTheme = { apply(appId), current() }.
   apply() sets document.documentElement.dataset.nxtApp, persists the choice
   to T.store ('nxt', 'app'), and emits T.bus 'nxt:theme' with { app }.
   On load the persisted value is restored (default 'home'). */
(function () {
  "use strict";
  var T = window.TXT = window.TXT || {};

  var APPS = ["home", "txt", "grd", "dck", "mem", "pdf", "hub", "vector", "pixel"];
  var DEFAULT_APP = "home";

  function valid(app) {
    return APPS.indexOf(app) >= 0;
  }

  function current() {
    var v = document.documentElement.getAttribute("data-nxt-app");
    return valid(v) ? v : DEFAULT_APP;
  }

  function apply(appId) {
    if (!valid(appId)) return;
    document.documentElement.setAttribute("data-nxt-app", appId);
    try {
      if (T.store && typeof T.store.set === "function") T.store.set("nxt", "app", appId);
    } catch (e) { /* storage unavailable; theme still applies in-memory */ }
    try {
      if (T.bus && typeof T.bus.emit === "function") T.bus.emit("nxt:theme", { app: appId });
    } catch (e) { /* bus not ready yet; theme still applies in-memory */ }
  }

  /* restore persisted app on load */
  var saved = null;
  try {
    if (T.store && typeof T.store.get === "function") saved = T.store.get("nxt", "app");
  } catch (e) { saved = null; }
  apply(valid(saved) ? saved : DEFAULT_APP);

  T.nxtTheme = { apply: apply, current: current };
})();
