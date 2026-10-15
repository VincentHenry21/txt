/* TXT statusbar (zone F): page info, word counts, cursor, badges,
   view buttons, focus mode, zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  function ed() { return T.editor; }

  /* ---------- page info ---------- */
  var pgInfo = $("#pgInfo");
  function updatePg() {
    if (!pgInfo) return;
    var e = ed();
    if (!e) { pgInfo.textContent = "Page 1 of 1"; return; }
    var cur = (e.caretPage && e.caretPage()) || 1;
    var total = (e.pageCount && e.pageCount()) || 1;
    pgInfo.textContent = "Page " + cur + " of " + total;
  }
  var updatePgDeb = T.debounce(updatePg, 150);
  T.bus.on("page:change", updatePg);
  T.bus.on("sel:change", updatePgDeb);
  T.bus.on("doc:open", updatePg);
  if (pgInfo) pgInfo.addEventListener("click", function () { T.bus.emit("sidebar:find"); });

  /* ---------- word / char counts ---------- */
  var wcWords = $("#wcWords"), wcChars = $("#wcChars");
  T.bus.on("counts", function (c) {
    if (wcWords) wcWords.textContent = (c ? c.words : 0) + " words";
    if (wcChars) wcChars.textContent = (c ? c.chars : 0) + " characters";
  });
  var wcBtn = $("#wcBtn");
  if (wcBtn) wcBtn.addEventListener("click", function () {
    if (T.stats && T.stats.open) T.stats.open();
    else T.toast("Statistics are not ready yet.", "error");
  });

  /* ---------- cursor position ---------- */
  var cursorPos = $("#cursorPos");
  T.bus.on("cursor", function (c) {
    if (cursorPos && c) cursorPos.textContent = "Ln " + c.ln + ", Col " + c.col;
  });

  /* ---------- track changes badge ---------- */
  var tcBadge = $("#tcBadge");
  function setTcBadge(on) {
    if (!tcBadge) return;
    tcBadge.textContent = "Track Changes: " + (on ? "ON" : "OFF");
    tcBadge.classList.toggle("on", !!on);
  }
  if (tcBadge) {
    tcBadge.addEventListener("click", function () {
      if (T.changes && T.changes.toggle) T.changes.toggle();
    });
  }
  T.bus.on("changes:update", function (d) { setTcBadge(d ? d.on : false); });
  setTcBadge(!!T.state.prefs.trackChanges);

  /* ---------- accessibility badge ---------- */
  var a11yBadge = $("#a11yBadge");
  if (a11yBadge) {
    a11yBadge.style.cursor = "pointer";
    a11yBadge.addEventListener("click", function () {
      if (!(T.a11y && T.a11y.check)) { T.toast("Accessibility checker not ready.", "error"); return; }
      var issues = T.a11y.check();
      if (T.inspector && T.inspector.open) T.inspector.open("a11y", issues);
      if (issues && issues.length) {
        a11yBadge.textContent = "Accessibility: " + issues.length + " issues";
        a11yBadge.classList.remove("ok");
        a11yBadge.classList.add("warn");
      } else {
        a11yBadge.textContent = "Accessibility: Good";
        a11yBadge.classList.remove("warn");
        a11yBadge.classList.add("ok");
      }
    });
  }

  /* ---------- view buttons ---------- */
  var stage = $("#stage");
  var viewBtns = { print: $("#vwPrint"), web: $("#vwWeb"), immersive: $("#vwImmersive") };
  function setView(mode) {
    if (stage) {
      stage.classList.remove("view-web", "view-outline", "immersive");
      if (mode === "web") stage.classList.add("view-web");
      else if (mode === "immersive") stage.classList.add("immersive");
    }
    Object.keys(viewBtns).forEach(function (k) {
      if (viewBtns[k]) viewBtns[k].classList.toggle("active", k === mode);
    });
    T.state.prefs.view = mode;
    T.savePrefs();
  }
  Object.keys(viewBtns).forEach(function (k) {
    if (viewBtns[k]) viewBtns[k].addEventListener("click", function () { setView(k); });
  });
  var savedView = T.state.prefs.view || "print";
  setView(savedView === "web" ? "web" : savedView === "immersive" ? "immersive" : "print");

  /* ---------- focus mode ---------- */
  var focusBtn = $("#focusBtn");
  if (focusBtn) focusBtn.addEventListener("click", function () { T.cmd("view.focus"); });

  /* ---------- zoom ---------- */
  var zoomWrap = $("#zoomWrap");
  var zoomSlider = $("#zoomSlider"), zoomPct = $("#zoomPct");
  var zoomOut = $("#zoomOut"), zoomIn = $("#zoomIn");
  function applyZoom(z) {
    z = T.clamp(z, 0.5, 2);
    if (zoomWrap) zoomWrap.style.transform = "scale(" + z + ")";
    var pct = Math.round(z * 100);
    if (zoomSlider) zoomSlider.value = String(pct);
    if (zoomPct) zoomPct.textContent = pct + "%";
    T.state.prefs.zoom = z;
    T.savePrefs();
  }
  function stepZoom(delta) {
    var pct = Math.round((T.state.prefs.zoom || 1) * 100);
    applyZoom(T.clamp((pct + delta) / 100, 0.5, 2));
  }
  if (zoomSlider) {
    zoomSlider.addEventListener("input", function () { applyZoom(parseInt(zoomSlider.value, 10) / 100); });
  }
  if (zoomOut) zoomOut.addEventListener("click", function () { stepZoom(-10); });
  if (zoomIn) zoomIn.addEventListener("click", function () { stepZoom(10); });
  if (zoomPct) zoomPct.addEventListener("click", function () { applyZoom(1); });
  T.bus.on("doc:open", function () { applyZoom(T.state.prefs.zoom || 1); });
  applyZoom(T.state.prefs.zoom || 1);
})();
