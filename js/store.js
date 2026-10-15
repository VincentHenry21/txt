/* TXT ecosystem store: namespaced reactive state shared across the
   word/vac/pixel personas and the 6 companion apps.

   T.store = {
     get(app, key), set(app, key, val),   // persisted to localStorage TXT_ECOSYSTEM_STORE
     on(evt, fn), emit(evt, data)         // local bus + BroadcastChannel('txt_sync_bus')
   };

   emit() fires local listeners AND posts to the channel; incoming channel
   messages re-emit locally (never re-posted, so no loops). When
   BroadcastChannel is unavailable the store degrades to a local bus. */
(function () {
  "use strict";
  var T = window.TXT;

  var LS_KEY = "TXT_ECOSYSTEM_STORE";
  var CHANNEL = "txt_sync_bus";

  function loadAll() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    } catch (e) { return {}; }
  }
  function saveAll(data) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* storage full or blocked */ }
  }

  function get(app, key) {
    var data = loadAll();
    if (!app) return data;
    var ns = data[app];
    if (!ns) return undefined;
    return (key === undefined) ? ns : ns[key];
  }
  function set(app, key, val) {
    if (!app) return;
    var data = loadAll();
    if (!data[app] || typeof data[app] !== "object") data[app] = {};
    data[app][key] = val;
    saveAll(data);
    return val;
  }

  /* ---------- event bus + cross-tab channel ---------- */
  var listeners = {};
  function on(evt, fn) {
    if (!evt || typeof fn !== "function") return fn;
    (listeners[evt] = listeners[evt] || []).push(fn);
    return fn;
  }
  function off(evt, fn) {
    var a = listeners[evt];
    if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  function fireLocal(evt, data) {
    var a = listeners[evt];
    if (!a) return;
    a.slice().forEach(function (fn) {
      try { fn(data); } catch (e) { console.error("[TXT store]", evt, e); }
    });
  }

  var channel = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = function (ev) {
        var msg = ev && ev.data;
        if (!msg || typeof msg !== "object" || !msg.evt) return;
        fireLocal(msg.evt, msg.data); // re-emit locally; never re-post
      };
    }
  } catch (e) { channel = null; }

  function emit(evt, data) {
    if (!evt) return;
    fireLocal(evt, data);
    if (channel) {
      try { channel.postMessage({ evt: evt, data: data === undefined ? null : data }); }
      catch (e) { /* channel closed; local delivery already done */ }
    }
  }

  T.store = { get: get, set: set, on: on, off: off, emit: emit };

  /* One-time migration: the vector studio was renamed to VAC. If data exists
     under the old "vector" namespace and nothing is stored under "vac" yet,
     copy it over so no work is lost. The old namespace is left in place. */
  (function migrateVectorToVac() {
    try {
      var data = loadAll();
      if (data && data.vector && typeof data.vector === "object" && !data.vac) {
        data.vac = JSON.parse(JSON.stringify(data.vector));
        saveAll(data);
      }
    } catch (e) { /* storage blocked; the app continues without the migration */ }
  })();
})();
