/* NXT OS legal + settings: Terms, Privacy, FAQ, OS Settings as real in-app views.
   T.nxtLegal = { showTerms, showPrivacy, showFaq, showSettings, accepted, accept }. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var openView = null;

  function storeGet(k, fb) {
    try { var v = T.store && T.store.get("nxt", k); return (v === undefined || v === null) ? fb : v; }
    catch (e) { return fb; }
  }
  function storeSet(k, v) {
    try { if (T.store) T.store.set("nxt", k, v); } catch (e) {}
  }

  function accepted() { return storeGet("termsAccepted", false) === true; }
  function accept() { storeSet("termsAccepted", true); }

  var TERMS_HTML =
    "<h3>1. What NXT OS is</h3>" +
    "<p>NXT OS is a personal productivity suite developed by H3NZ. It includes the TXT word processor, GRD spreadsheets, DCK slide decks, MEM notes, PDF tools, HUB file browser, and the VAC and PXL studios. The suite runs as a web app in your browser.</p>" +
    "<h3>2. Your content stays yours</h3>" +
    "<p>Documents, sheets, decks, notes, and files you create belong to you. NXT OS does not claim ownership of your content.</p>" +
    "<h3>3. Local-first storage</h3>" +
    "<p>Your files and settings are stored locally in your browser. Clearing browser data may delete them. Export important work regularly using the built-in export options.</p>" +
    "<h3>4. Acceptable use</h3>" +
    "<p>Do not use NXT OS to create or distribute content that is unlawful, infringes the rights of others, or is intended to harm. You are responsible for what you create and share.</p>" +
    "<h3>5. No warranties</h3>" +
    "<p>NXT OS is provided as is, without warranties of any kind. H3NZ is not liable for data loss, interruptions, or damages arising from use of the suite.</p>" +
    "<h3>6. Changes</h3>" +
    "<p>These terms may be updated as NXT OS evolves. Continued use after changes means you accept the updated terms.</p>" +
    "<p class=\"nxtlegal-meta\">Last updated: October 2026 · NXT OS V1.0 · Developed by H3NZ</p>";

  var PRIVACY_HTML =
    "<h3>1. What we collect</h3>" +
    "<p>NXT OS collects almost nothing. Your username, theme choice, and settings are stored only in your browser's local storage on your own device. Your documents never leave your device unless you export or share them yourself.</p>" +
    "<h3>2. What we do not collect</h3>" +
    "<p>No account is required. There is no tracking, no analytics beacon, and no advertising profile. We do not sell or share personal data because we do not collect it.</p>" +
    "<h3>3. AI features</h3>" +
    "<p>Optional AI features send only the text you explicitly submit to the AI provider at the moment you use them. Do not submit sensitive personal information to AI features.</p>" +
    "<h3>4. Exports and sharing</h3>" +
    "<p>When you export a file or use the share sheet, your content goes wherever you choose to send it. NXT OS cannot control third-party services after you share.</p>" +
    "<h3>5. Your control</h3>" +
    "<p>Signing out from OS Settings removes your username from this device. Clearing browser storage removes all local data. Contact support at thitsarnextdoor@gmail.com with privacy questions.</p>" +
    "<p class=\"nxtlegal-meta\">Last updated: October 2026 · NXT OS V1.0 · Developed by H3NZ</p>";

  var FAQ = [
    ["What is NXT OS?", "NXT OS is a suite of eight productivity apps developed by H3NZ: TXT (word processor), GRD (spreadsheets and kanban), DCK (slide decks), MEM (notes), PDF (PDF tools), HUB (file browser), VAC (vector studio), and PXL (pixel studio). They share one launcher, one file system, and one design language."],
    ["Do I need an account?", "No. Pick a username on the launcher and everything is stored locally in your browser. There is no password and no cloud account required."],
    ["Where are my files stored?", "In your browser's local storage on this device. Use each app's export options to save copies to your device or share them elsewhere."],
    ["How do I switch between apps?", "Use the 9-dot launcher button in any app's top bar, the command palette (Ctrl+K), or the NXT home button to return to the launcher."],
    ["Can I change the theme?", "Yes. Open OS Settings from the launcher footer and pick Studio Light, Obsidian Pro, Editorial Sepia, or High Contrast. Each app also applies its own signature accent color."],
    ["What is the boot splash?", "A short welcome screen shown at launch. You can tap it to skip, or turn it off entirely in OS Settings."],
    ["How do I sign out or switch user?", "Open OS Settings and choose Sign out. Your files stay on the device; only the username is cleared. Anyone can then pick a new username."],
    ["Who do I contact for help?", "Email support at thitsarnextdoor@gmail.com. Include which app you were using and what happened."],
    ["Is my work private?", "Yes. Everything stays on your device unless you export or share it. See the Privacy Policy for details."]
  ];

  function shell(title, bodyHTML) {
    close();
    var wrap = document.createElement("div");
    wrap.className = "nxtlegal-wrap";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", title);
    var card = document.createElement("div");
    card.className = "nxtlegal-card";
    var head = document.createElement("div");
    head.className = "nxtlegal-head";
    var h2 = document.createElement("h2");
    h2.className = "nxtlegal-title";
    h2.textContent = title;
    var x = document.createElement("button");
    x.type = "button";
    x.className = "nxtlegal-close";
    x.textContent = "Close";
    x.setAttribute("aria-label", "Close " + title);
    x.addEventListener("click", close);
    head.appendChild(h2);
    head.appendChild(x);
    var body = document.createElement("div");
    body.className = "nxtlegal-body";
    body.innerHTML = bodyHTML;
    card.appendChild(head);
    card.appendChild(body);
    wrap.appendChild(card);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    openView = wrap;
    x.focus();
    return body;
  }
  function onKey(e) {
    if (e.key === "Escape" && openView) { close(); e.stopPropagation(); }
  }
  function close() {
    if (!openView) return;
    document.removeEventListener("keydown", onKey, true);
    if (openView.parentNode) openView.parentNode.removeChild(openView);
    openView = null;
  }

  function showTerms() { shell("Terms and Conditions", TERMS_HTML); }
  function showPrivacy() { shell("Privacy Policy", PRIVACY_HTML); }

  function showFaq() {
    var body = shell("Frequently Asked Questions", "");
    var acc = document.createElement("div");
    acc.className = "nxtlegal-faq";
    FAQ.forEach(function (qa, i) {
      var item = document.createElement("div");
      item.className = "nxtlegal-faq-item";
      var q = document.createElement("button");
      q.type = "button";
      q.className = "nxtlegal-faq-q";
      q.setAttribute("aria-expanded", "false");
      q.setAttribute("aria-controls", "nxtfaq-a" + i);
      var qt = document.createElement("span");
      qt.textContent = qa[0];
      var chev = document.createElement("span");
      chev.className = "nxtlegal-faq-chev";
      chev.textContent = "+";
      chev.setAttribute("aria-hidden", "true");
      q.appendChild(qt);
      q.appendChild(chev);
      var a = document.createElement("div");
      a.className = "nxtlegal-faq-a";
      a.id = "nxtfaq-a" + i;
      a.hidden = true;
      var p = document.createElement("p");
      p.textContent = qa[1];
      a.appendChild(p);
      q.addEventListener("click", function () {
        var open = a.hidden;
        a.hidden = !open;
        q.setAttribute("aria-expanded", String(open));
        chev.textContent = open ? "-" : "+";
      });
      item.appendChild(q);
      item.appendChild(a);
      acc.appendChild(item);
    });
    body.appendChild(acc);
  }

  function showSettings() {
    var body = shell("OS Settings", "");
    /* theme */
    var sec1 = document.createElement("section");
    sec1.className = "nxtlegal-sec";
    var h31 = document.createElement("h3");
    h31.textContent = "Appearance";
    sec1.appendChild(h31);
    var themeRow = document.createElement("div");
    themeRow.className = "nxtlegal-row";
    var lbl = document.createElement("label");
    lbl.className = "nxtlegal-label";
    lbl.textContent = "Theme";
    var sel = document.createElement("select");
    sel.className = "nxtlegal-select";
    sel.setAttribute("aria-label", "Theme");
    (T.themes ? T.themes.THEMES : ["studio", "obsidian", "sepia", "contrast"]).forEach(function (t) {
      var o = document.createElement("option");
      o.value = t;
      o.textContent = (T.themes && T.themes.NAMES && T.themes.NAMES[t]) || t;
      sel.appendChild(o);
    });
    sel.value = document.documentElement.getAttribute("data-theme") || "studio";
    sel.addEventListener("change", function () {
      if (T.themes) T.themes.apply(sel.value);
    });
    lbl.appendChild(sel);
    themeRow.appendChild(lbl);
    sec1.appendChild(themeRow);
    /* boot splash toggle */
    var sec2 = document.createElement("section");
    sec2.className = "nxtlegal-sec";
    var h32 = document.createElement("h3");
    h32.textContent = "Startup";
    sec2.appendChild(h32);
    var togRow = document.createElement("label");
    togRow.className = "nxtlegal-check";
    var tog = document.createElement("input");
    tog.type = "checkbox";
    tog.checked = storeGet("bootSplash", true) !== false;
    tog.setAttribute("aria-label", "Show welcome splash at startup");
    tog.addEventListener("change", function () { storeSet("bootSplash", tog.checked); });
    var togTx = document.createElement("span");
    togTx.textContent = "Show welcome splash at startup";
    togRow.appendChild(tog);
    togRow.appendChild(togTx);
    sec2.appendChild(togRow);
    /* account */
    var sec3 = document.createElement("section");
    sec3.className = "nxtlegal-sec";
    var h33 = document.createElement("h3");
    h33.textContent = "Account";
    sec3.appendChild(h33);
    var who = document.createElement("p");
    who.className = "nxtlegal-note";
    var uname = "";
    try { uname = (T.store && T.store.get("nxt", "username")) || ""; } catch (e) {}
    who.textContent = uname ? "Signed in as " + uname + " (local only)." : "Not signed in.";
    sec3.appendChild(who);
    var out = document.createElement("button");
    out.type = "button";
    out.className = "nxtlegal-btn";
    out.textContent = "Sign out";
    out.addEventListener("click", function () {
      try { if (T.store) T.store.set("nxt", "username", ""); } catch (e) {}
      close();
      if (T.nxtLogin) T.nxtLogin.show();
      else if (T.nxthome) T.nxthome.show();
      else window.location.reload();
    });
    sec3.appendChild(out);
    /* legal links */
    var sec4 = document.createElement("section");
    sec4.className = "nxtlegal-sec";
    var h34 = document.createElement("h3");
    h34.textContent = "Legal and help";
    sec4.appendChild(h34);
    [["Terms and Conditions", showTerms], ["Privacy Policy", showPrivacy], ["FAQ", showFaq]].forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "nxtlegal-link";
      b.textContent = pair[0];
      b.addEventListener("click", function () { close(); pair[1](); });
      sec4.appendChild(b);
    });
    /* about */
    var sec5 = document.createElement("section");
    sec5.className = "nxtlegal-sec";
    var h35 = document.createElement("h3");
    h35.textContent = "About";
    sec5.appendChild(h35);
    var about = document.createElement("p");
    about.className = "nxtlegal-note";
    about.textContent = "NXT OS V1.0 · Engineered and Developed by H3NZ";
    sec5.appendChild(about);
    var sup = document.createElement("a");
    sup.className = "nxtlegal-link";
    sup.href = "mailto:thitsarnextdoor@gmail.com";
    sup.textContent = "Support: thitsarnextdoor@gmail.com";
    sec5.appendChild(sup);

    [sec1, sec2, sec3, sec4, sec5].forEach(function (s) { body.appendChild(s); });
  }

  T.nxtLegal = {
    showTerms: showTerms, showPrivacy: showPrivacy, showFaq: showFaq,
    showSettings: showSettings, accepted: accepted, accept: accept, close: close,
    faqCount: function () { return FAQ.length; }
  };
})();
