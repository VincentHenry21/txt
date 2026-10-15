/* NXT OS Ascend integration: the Ascend study webapp as a first-class
   ecosystem app. Opens https://ascend-study-564.netlify.app inside NXT OS
   in a dedicated view with a real iframe, loading and error states, and a
   working top bar (back, reload, open in new tab).
   Exposes T.ascend = { open(), close(), isOpen(), reload(), openExternal() }. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var ASCEND_URL = "https://ascend-study-564.netlify.app";
  var LOAD_TIMEOUT_MS = 20000;
  var SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";

  var CAP_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.6 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0z"/>' +
    '<path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';
  var EXT_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';

  var built = false, view = null, frame = null;
  var loadingEl = null, errorEl = null, errorMsg = null;
  var loaded = false, timer = null, opened = false, firstOpen = true;

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function showLoading() {
    if (loadingEl) loadingEl.classList.remove("hidden");
    if (errorEl) errorEl.classList.add("hidden");
  }
  function showError(msg) {
    clearTimer();
    if (loadingEl) loadingEl.classList.add("hidden");
    if (errorMsg && msg) errorMsg.textContent = msg;
    if (errorEl) errorEl.classList.remove("hidden");
  }
  function showFrame() {
    clearTimer();
    loaded = true;
    if (loadingEl) loadingEl.classList.add("hidden");
    if (errorEl) errorEl.classList.add("hidden");
  }

  function onFrameLoad() {
    /* Fires when the frame document finishes loading. Note: a remote error
       page (e.g. a host 404 page) also fires load, so this confirms the
       frame navigated, not that Ascend itself rendered. The timeout below
       covers the case where nothing loads at all (offline, DNS). */
    showFrame();
  }
  function onTimeout() {
    timer = null;
    if (!loaded) showError("Ascend did not respond in time. Check your connection and try again.");
  }

  function startLoad() {
    if (!frame) return;
    loaded = false;
    showLoading();
    clearTimer();
    /* Re-assigning src re-navigates even when the URL is unchanged. */
    try { frame.src = ASCEND_URL; } catch (e) { /* ignore */ }
    timer = setTimeout(onTimeout, LOAD_TIMEOUT_MS);
  }

  function stampLastOpened() {
    try {
      if (T.store && typeof T.store.set === "function") {
        T.store.set("nxt", "ascendLastOpened", Date.now());
      }
    } catch (e) { /* storage unavailable; the app still works */ }
  }

  function goHome() {
    if (T.nxthome && typeof T.nxthome.show === "function") T.nxthome.show();
    else if (T.ecosystem && typeof T.ecosystem.home === "function") T.ecosystem.home();
  }

  function openExternal() {
    try {
      window.open(ASCEND_URL, "_blank", "noopener");
    } catch (e) {
      /* popup blocked: fall back to a same-tab navigation is worse than
         telling the truth, so surface the URL via the error state */
      showError("The new tab was blocked. Copy this address: " + ASCEND_URL);
    }
  }

  function build() {
    if (built) return;
    view = document.getElementById("view-ascend");
    if (!view) return;
    built = true;

    var top = h("div", "nxt-asc-top", null);

    var back = h("button", "icon-btn nxt-asc-btn", null);
    back.type = "button";
    back.title = "Back to NXT home";
    back.setAttribute("aria-label", "Back to NXT home");
    back.innerHTML = '<svg><use href="#i-back"/></svg>';
    back.addEventListener("click", goHome);
    top.appendChild(back);

    var badge = h("span", "nxt-asc-badge", null);
    badge.innerHTML = CAP_SVG;
    badge.setAttribute("aria-hidden", "true");
    top.appendChild(badge);

    var titles = h("div", "nxt-asc-titles", null);
    titles.appendChild(h("div", "nxt-asc-name", "Ascend"));
    titles.appendChild(h("div", "nxt-asc-sub", "Study webapp, part of the NXT ecosystem"));
    top.appendChild(titles);

    var spacer = h("div", "nxt-asc-spacer", null);
    top.appendChild(spacer);

    var reload = h("button", "icon-btn nxt-asc-btn", null);
    reload.type = "button";
    reload.title = "Reload Ascend";
    reload.setAttribute("aria-label", "Reload Ascend");
    reload.innerHTML = '<svg><use href="#i-history"/></svg>';
    reload.addEventListener("click", function () { startLoad(); });
    top.appendChild(reload);

    var ext = h("button", "nxt-asc-ext", null);
    ext.type = "button";
    ext.title = "Open Ascend in a new tab";
    ext.setAttribute("aria-label", "Open Ascend in a new tab");
    ext.innerHTML = EXT_SVG + "<span>Open in new tab</span>";
    ext.addEventListener("click", openExternal);
    top.appendChild(ext);

    view.appendChild(top);

    var body = h("div", "nxt-asc-body", null);

    frame = document.createElement("iframe");
    frame.className = "nxt-asc-frame";
    frame.title = "Ascend study webapp";
    frame.setAttribute("sandbox", SANDBOX);
    frame.setAttribute("allow", "fullscreen");
    frame.addEventListener("load", onFrameLoad);
    body.appendChild(frame);

    loadingEl = h("div", "nxt-asc-loading", null);
    var spin = h("div", "nxt-asc-spinner", null);
    spin.setAttribute("aria-hidden", "true");
    loadingEl.appendChild(spin);
    loadingEl.appendChild(h("div", "nxt-asc-loading-t", "Loading Ascend..."));
    loadingEl.setAttribute("role", "status");
    loadingEl.setAttribute("aria-live", "polite");
    body.appendChild(loadingEl);

    errorEl = h("div", "nxt-asc-error hidden", null);
    errorEl.appendChild(h("div", "nxt-asc-err-t", "Ascend could not be loaded."));
    errorMsg = h("div", "nxt-asc-err-m", "Check your connection and try again.");
    errorEl.appendChild(errorMsg);
    var errBtns = h("div", "nxt-asc-err-btns", null);
    var retry = h("button", "nxt-asc-retry", "Retry");
    retry.type = "button";
    retry.addEventListener("click", function () { startLoad(); });
    var ext2 = h("button", "nxt-asc-ext2", "Open in new tab");
    ext2.type = "button";
    ext2.addEventListener("click", openExternal);
    errBtns.appendChild(retry);
    errBtns.appendChild(ext2);
    errorEl.appendChild(errBtns);
    body.appendChild(errorEl);

    view.appendChild(body);

    var credit = h("div", "nxt-asc-credit", "Ascend by H3NZ, running inside NXT OS • Developed by H3NZ");
    view.appendChild(credit);
  }

  function open() {
    build();
    if (!view) return;
    opened = true;
    stampLastOpened();
    /* First open (or a failed previous load) starts the frame. A healthy
       loaded frame is left alone so the user's Ascend session survives
       switching apps. */
    if (firstOpen || !loaded) {
      firstOpen = false;
      startLoad();
    } else {
      showFrame();
    }
  }

  function close() {
    opened = false;
    clearTimer();
  }

  function isOpen() { return opened; }

  function reload() { startLoad(); }

  T.ascend = {
    open: open,
    close: close,
    isOpen: isOpen,
    reload: reload,
    openExternal: openExternal,
    URL: ASCEND_URL,
    SANDBOX: SANDBOX,
    /* test hook: shrink the load timeout in jsdom */
    _setLoadTimeout: function (ms) { LOAD_TIMEOUT_MS = ms; }
  };
})();
