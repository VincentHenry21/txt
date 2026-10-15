/* TXT Accessibility tab: read aloud, immersive reading aids, reading analysis.
   Ribbon tab + commands. Calls T.speech / T.a11y / T.inspector only at runtime
   (those modules load after this file). Reading preferences persist in state.prefs. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  function setOn(el, on) {
    if (!el) return;
    el.classList.toggle("active", !!on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function prefBool(k, dflt) {
    var v = T.state.prefs[k];
    return v == null ? dflt : !!v;
  }
  function setPref(k, v) {
    T.state.prefs[k] = v;
    T.savePrefs();
  }

  T.ribbon.addTab({ id: "access", label: "Accessibility", keytip: "A" });

  /* ---------------- Read Aloud ---------------- */
  var gAloud = T.ribbon.group("access", "Read Aloud");
  var aloudBtn = T.ribbon.btn({
    icon: "i-aloud", label: "Read Aloud", cmd: "speech.toggle", toggle: true,
    title: "Read the document aloud"
  });
  function refreshAloud() {
    var s = T.speech;
    setOn(aloudBtn, !!(s && s.isPlaying()));
  }
  T.register("speech.toggle", function () {
    var s = T.speech;
    if (!s) { T.toast("Read aloud is not available yet", "error"); return; }
    s.toggle();
    setTimeout(refreshAloud, 60);
  }, { title: "Read aloud", cat: "Accessibility", icon: "i-aloud" });
  T.bus.on("speech:update", refreshAloud);

  /* ---------------- Immersive ---------------- */
  var gImm = T.ribbon.group("access", "Immersive");
  var LINE_FOCUS_OPTS = [0, 1, 3, 5];
  var lineFocusN = parseInt(T.state.prefs.a11yLineFocus, 10);
  if (LINE_FOCUS_OPTS.indexOf(lineFocusN) < 0) lineFocusN = 0;
  var lineFocusBtn = T.ribbon.btn({
    icon: "i-eye", label: "Line Focus", cmd: "a11y.lineFocusMenu",
    title: "Highlight one or a few lines at a time while reading"
  });
  T.register("a11y.lineFocusMenu", function () {
    T.ribbon.openMenu(lineFocusBtn, LINE_FOCUS_OPTS.map(function (n) {
      return {
        label: n === 0 ? "Off" : n + (n === 1 ? " line" : " lines"),
        fn: function () { T.cmd("a11y.lineFocus", n); },
        active: n === lineFocusN
      };
    }));
  }, { title: "Line focus", cat: "Accessibility", icon: "i-eye" });
  T.register("a11y.lineFocus", function (n) {
    n = parseInt(n, 10);
    if (LINE_FOCUS_OPTS.indexOf(n) < 0) n = 0;
    lineFocusN = n;
    setPref("a11yLineFocus", n);
    var a = T.a11y;
    if (!a) { T.toast("Immersive reader is not available yet", "error"); return; }
    a.setLineFocus(n);
    T.toast(n === 0 ? "Line focus off" : "Line focus: " + n + (n === 1 ? " line" : " lines"));
  }, { title: "Set line focus", cat: "Accessibility", icon: "i-eye" });

  var spacingBtn = T.ribbon.btn({
    icon: "i-spacing", label: "Text Spacing", cmd: "a11y.spacing", toggle: true,
    title: "Increase letter and line spacing for readability"
  });
  T.register("a11y.spacing", function () {
    var on = !prefBool("a11ySpacing", false);
    setPref("a11ySpacing", on);
    var a = T.a11y;
    if (!a) { T.toast("Immersive reader is not available yet", "error"); return; }
    a.setSpacing(on);
    setOn(spacingBtn, on);
  }, { title: "Text spacing", cat: "Accessibility", icon: "i-spacing" });

  var dysBtn = T.ribbon.btn({
    icon: "i-case", label: "OpenDyslexic", cmd: "a11y.dyslexic", toggle: true,
    title: "Switch the document font to OpenDyslexic"
  });
  var dysPrevFont = "";
  function setDyslexic(on) {
    setPref("a11yDyslexic", !!on);
    var sheet = (T.editor && T.editor.sheetEl) ? T.editor.sheetEl() : null;
    if (!sheet) { T.toast("No document is open", "error"); return; }
    if (on) {
      T.fonts.ensure("OpenDyslexic");
      dysPrevFont = sheet.style.fontFamily || "";
      sheet.style.fontFamily = T.fonts.stackFor("OpenDyslexic");
    } else {
      sheet.style.fontFamily = dysPrevFont;
    }
    setOn(dysBtn, on);
  }
  T.register("a11y.dyslexic", function () {
    setDyslexic(!prefBool("a11yDyslexic", false));
  }, { title: "OpenDyslexic font", cat: "Accessibility", icon: "i-case" });

  var sylBtn = T.ribbon.btn({
    icon: "i-symbol", label: "Syllables", cmd: "a11y.syllables", toggle: true,
    title: "Show syllable breaks in words"
  });
  T.register("a11y.syllables", function () {
    var on = !prefBool("a11ySyllables", false);
    setPref("a11ySyllables", on);
    var a = T.a11y;
    if (!a) { T.toast("Immersive reader is not available yet", "error"); return; }
    a.setSyllables(on);
    setOn(sylBtn, on);
  }, { title: "Syllable breaks", cat: "Accessibility", icon: "i-symbol" });

  /* ---------------- Reading ---------------- */
  var gRead = T.ribbon.group("access", "Reading");
  var posBtn = T.ribbon.btn({
    icon: "i-pos", label: "POS Highlighter", cmd: "a11y.pos", toggle: true,
    title: "Highlight parts of speech in the document"
  });
  T.register("a11y.pos", function () {
    var on = !prefBool("a11yPOS", false);
    setPref("a11yPOS", on);
    var a = T.a11y;
    if (!a) { T.toast("Immersive reader is not available yet", "error"); return; }
    a.setPOS(on);
    setOn(posBtn, on);
  }, { title: "POS highlighter", cat: "Accessibility", icon: "i-pos" });

  T.ribbon.btn({
    icon: "i-check", label: "Check Accessibility", cmd: "a11y.check",
    title: "Check the document for accessibility issues"
  });
  T.register("a11y.check", function () {
    var a = T.a11y, insp = T.inspector;
    if (!a || !insp) { T.toast("Accessibility checker is not available yet", "error"); return; }
    var issues;
    try { issues = a.check(); } catch (e) { T.toast("Accessibility check failed", "error"); return; }
    insp.open("a11y", issues);
    T.toast(Array.isArray(issues) && issues.length
      ? "Found " + issues.length + " accessibility issue" + (issues.length === 1 ? "" : "s")
      : "No accessibility issues found");
  }, { title: "Check accessibility", cat: "Accessibility", icon: "i-check" });

  /* ---------------- restore persisted a11y state once the app is up ---------------- */
  setOn(spacingBtn, prefBool("a11ySpacing", false));
  setOn(sylBtn, prefBool("a11ySyllables", false));
  setOn(posBtn, prefBool("a11yPOS", false));
  setOn(dysBtn, prefBool("a11yDyslexic", false));
  T.bus.on("app:ready", function () {
    var a = T.a11y;
    if (!a) return;
    try {
      if (lineFocusN) a.setLineFocus(lineFocusN);
      if (prefBool("a11ySpacing", false)) a.setSpacing(true);
      if (prefBool("a11ySyllables", false)) a.setSyllables(true);
      if (prefBool("a11yPOS", false)) a.setPOS(true);
    } catch (e) {}
    if (prefBool("a11yDyslexic", false)) {
      var sheet = (T.editor && T.editor.sheetEl) ? T.editor.sheetEl() : null;
      if (sheet) {
        T.fonts.ensure("OpenDyslexic");
        dysPrevFont = sheet.style.fontFamily || "";
        sheet.style.fontFamily = T.fonts.stackFor("OpenDyslexic");
      }
    }
  });
})();
