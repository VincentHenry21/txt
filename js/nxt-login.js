/* NXT OS dedicated login screen: a full-screen sign-in view shown on launch
   when no username is stored. Flow: boot splash -> login -> home.
   T.nxtLogin = { show, hide, isVisible }. Username persists under
   T.store "nxt"/"username"; terms acceptance under "nxt"/"termsAccepted". */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var VIEW_ID = "view-login";
  var built = false, view = null;
  var inp = null, chk = null, btn = null, err = null;

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function getUsername() {
    try { return (T.store && T.store.get("nxt", "username")) || ""; }
    catch (e) { return ""; }
  }
  function setUsername(name) {
    try { if (T.store) T.store.set("nxt", "username", name); } catch (e) {}
  }

  function logoHTML() {
    var svg = "";
    try {
      if (T.nxtLogos && typeof T.nxtLogos.get === "function") {
        var l = T.nxtLogos.get("nxt");
        if (l) svg = typeof l === "string" ? l : (l.outerHTML || "");
      }
    } catch (e) { svg = ""; }
    if (svg) return '<span class="nxtlogin-logo" aria-hidden="true">' + svg + "</span>";
    return '<span class="nxtlogin-logo-fallback" aria-hidden="true">NXT</span>';
  }

  function showError(msg) {
    if (!err) return;
    err.textContent = msg || "";
    err.hidden = !msg;
  }

  function submit() {
    var name = inp.value.trim();
    if (!name) {
      showError("Please choose a username to continue.");
      inp.focus();
      return;
    }
    if (!chk.checked) {
      showError("Please accept the Terms and Conditions to continue.");
      chk.focus();
      return;
    }
    showError("");
    setUsername(name);
    if (T.nxtLegal && typeof T.nxtLegal.accept === "function") T.nxtLegal.accept();
    hide();
    if (T.nxthome) T.nxthome.show();
  }

  function build() {
    if (built) return;
    view = document.getElementById(VIEW_ID);
    if (!view) return;
    built = true;

    var wrap = h("div", "nxtlogin-wrap", null);

    var brand = h("div", "nxtlogin-brand", null);
    brand.innerHTML =
      '<div class="nxtlogin-logo-row">' + logoHTML() + "</div>" +
      '<div class="nxtlogin-word">NXT OS</div>' +
      '<div class="nxtlogin-welcome">Welcome to NXT OS Suite V1.0</div>' +
      '<div class="nxtlogin-by">Engineered &amp; Developed by H3NZ</div>';
    wrap.appendChild(brand);

    var card = h("div", "nxtlogin-card", null);
    card.appendChild(h("div", "nxtlogin-title", "Sign in"));

    var lbl = h("label", "nxtlogin-label", "Username");
    lbl.setAttribute("for", "nxtlogin-name");
    card.appendChild(lbl);
    inp = document.createElement("input");
    inp.type = "text";
    inp.id = "nxtlogin-name";
    inp.className = "nxtlogin-input";
    inp.placeholder = "Choose a username";
    inp.setAttribute("aria-label", "Choose a username");
    inp.maxLength = 24;
    inp.autocomplete = "nickname";
    inp.addEventListener("input", function () { showError(""); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    card.appendChild(inp);

    var tRow = h("label", "nxtlogin-terms", null);
    chk = document.createElement("input");
    chk.type = "checkbox";
    chk.setAttribute("aria-label", "I agree to the Terms and Conditions");
    chk.addEventListener("change", function () { showError(""); });
    var tTx = document.createElement("span");
    tTx.appendChild(document.createTextNode("I agree to the "));
    var tLink = document.createElement("button");
    tLink.type = "button";
    tLink.className = "nxtlogin-terms-link";
    tLink.textContent = "Terms and Conditions";
    tLink.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (T.nxtLegal) T.nxtLegal.showTerms();
    });
    tTx.appendChild(tLink);
    tRow.appendChild(chk);
    tRow.appendChild(tTx);
    card.appendChild(tRow);

    err = h("div", "nxtlogin-err", null);
    err.setAttribute("role", "alert");
    err.setAttribute("aria-live", "assertive");
    err.hidden = true;
    card.appendChild(err);

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nxtlogin-btn";
    btn.textContent = "Get started";
    btn.addEventListener("click", submit);
    card.appendChild(btn);
    wrap.appendChild(card);

    var foot = h("div", "nxtlogin-foot", null);
    [["Terms", "showTerms"], ["Privacy", "showPrivacy"], ["FAQ", "showFaq"]].forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "nxtlogin-link";
      b.textContent = pair[0];
      b.addEventListener("click", function () { if (T.nxtLegal) T.nxtLegal[pair[1]](); });
      foot.appendChild(b);
    });
    var sup = document.createElement("a");
    sup.className = "nxtlogin-support";
    sup.href = "mailto:thitsarnextdoor@gmail.com";
    sup.textContent = "Support: thitsarnextdoor@gmail.com";
    foot.appendChild(sup);
    wrap.appendChild(foot);

    view.appendChild(wrap);
  }

  function show() {
    build();
    if (!view) return;
    /* reset the form every time the login screen appears */
    if (inp) inp.value = "";
    if (chk) chk.checked = false;
    showError("");
    if (T.ecosystem && typeof T.ecosystem.login === "function") {
      T.ecosystem.login();
    } else {
      var views = document.querySelectorAll(".view");
      for (var i = 0; i < views.length; i++) {
        views[i].classList.toggle("hidden", views[i].id !== VIEW_ID);
      }
      if (T.nxtTheme && typeof T.nxtTheme.apply === "function") {
        try { T.nxtTheme.apply("home"); } catch (e) {}
      }
    }
    if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { try { inp.focus(); } catch (e2) {} } }
  }

  function hide() {
    if (view) view.classList.add("hidden");
  }

  function isVisible() {
    return !!(view && !view.classList.contains("hidden"));
  }

  T.nxtLogin = { show: show, hide: hide, isVisible: isVisible };
})();
