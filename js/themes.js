/* TXT themes: 4-theme engine + white-paper toggle for Obsidian Pro. */
(function () {
  "use strict";
  var T = window.TXT;

  var THEMES = ["studio", "obsidian", "sepia", "contrast"];
  var NAMES = { studio: "Studio Light", obsidian: "Obsidian Pro", sepia: "Editorial Sepia", contrast: "High Contrast" };

  function apply(name, paper) {
    if (THEMES.indexOf(name) < 0) name = "studio";
    document.documentElement.setAttribute("data-theme", name);
    if (name === "obsidian") {
      document.documentElement.setAttribute("data-paper", paper || T.state.prefs.paper || "sheet");
    } else {
      document.documentElement.removeAttribute("data-paper");
    }
    T.state.prefs.theme = name;
    if (paper) T.state.prefs.paper = paper;
    T.savePrefs();
    var sel = document.getElementById("themePicker");
    if (sel) sel.value = name;
    var pt = document.getElementById("paperToggle");
    if (pt) pt.classList.toggle("hidden", name !== "obsidian");
    T.bus.emit("theme:change", { theme: name, paper: document.documentElement.getAttribute("data-paper") });
  }

  function togglePaper() {
    var cur = document.documentElement.getAttribute("data-paper") || "sheet";
    apply("obsidian", cur === "white" ? "sheet" : "white");
    T.toast(cur === "white" ? "Dark paper" : "White paper preview");
  }

  T.register("theme.set", function (name) { apply(name); }, { title: "Set theme", cat: "View", icon: "i-moon" });
  T.register("theme.cycle", function () {
    var i = THEMES.indexOf(document.documentElement.getAttribute("data-theme"));
    apply(THEMES[(i + 1) % THEMES.length]);
  }, { title: "Cycle theme", cat: "View", icon: "i-moon", match: "dark light mode" });
  T.register("theme.dark", function () { apply("obsidian"); }, { title: "Dark mode", cat: "View", icon: "i-moon", match: "dark night obsidian" });
  T.register("theme.light", function () { apply("studio"); }, { title: "Light mode", cat: "View", icon: "i-sun", match: "light day studio" });
  T.register("theme.sepia", function () { apply("sepia"); }, { title: "Sepia focus mode", cat: "View", icon: "i-eye", match: "sepia editorial eye strain" });
  T.register("theme.contrast", function () { apply("contrast"); }, { title: "High contrast mode", cat: "View", icon: "i-shield", match: "contrast accessibility wcag aaa" });
  T.register("theme.paperToggle", togglePaper, { title: "Toggle white paper", cat: "View", icon: "i-pagecolor" });

  T.themes = { apply: apply, togglePaper: togglePaper, THEMES: THEMES, NAMES: NAMES };
  T.bus.on("app:boot", function () { apply(T.state.prefs.theme || "studio", T.state.prefs.paper); });
})();
