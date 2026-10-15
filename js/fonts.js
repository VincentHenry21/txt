/* TXT font catalog: 15+ curated fonts across serif, sans, mono, accessibility. */
(function () {
  "use strict";
  var T = window.TXT;

  // name, stack, google (whether to ensure loaded via Google Fonts), group
  var FONTS = [
    { name: "Inter", stack: '"Inter", system-ui, sans-serif', google: true, group: "Sans" },
    { name: "Georgia", stack: 'Georgia, "Times New Roman", serif', group: "Serif" },
    { name: "Merriweather", stack: '"Merriweather", Georgia, serif', google: true, group: "Serif" },
    { name: "Playfair Display", stack: '"Playfair Display", Georgia, serif', google: true, group: "Serif" },
    { name: "Source Serif 4", stack: '"Source Serif 4", Georgia, serif', google: true, group: "Serif" },
    { name: "Lora", stack: '"Lora", Georgia, serif', google: true, group: "Serif" },
    { name: "Garamond", stack: 'Garamond, "Adobe Garamond", "Times New Roman", serif', group: "Serif" },
    { name: "Times New Roman", stack: '"Times New Roman", Times, serif', group: "Serif" },
    { name: "Arial", stack: 'Arial, Helvetica, sans-serif', group: "Sans" },
    { name: "Roboto", stack: '"Roboto", Arial, sans-serif', google: true, group: "Sans" },
    { name: "Lexend", stack: '"Lexend", "Inter", sans-serif', google: true, group: "Accessibility" },
    { name: "OpenDyslexic", stack: '"OpenDyslexic", "Comic Sans MS", sans-serif', google: true, group: "Accessibility" },
    { name: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace', google: true, group: "Mono" },
    { name: "Noto Sans Myanmar", stack: '"Noto Sans Myanmar", "Myanmar3", sans-serif', google: true, group: "Myanmar" },
    { name: "Noto Serif Myanmar", stack: '"Noto Serif Myanmar", "Myanmar3", serif', google: true, group: "Myanmar" },
    { name: "System Sans", stack: 'system-ui, -apple-system, "Segoe UI", sans-serif', group: "Sans" },
    { name: "System Serif", stack: 'Georgia, serif', group: "Serif" }
  ];

  var loaded = {};
  function ensure(name) {
    var f = null;
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].name === name) f = FONTS[i];
    if (!f || !f.google || loaded[name]) return;
    loaded[name] = true;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + ":wght@400;600;700;800&display=swap";
    document.head.appendChild(link);
  }

  function stackFor(name) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].name === name) return FONTS[i].stack;
    return name;
  }

  function names() { return FONTS.map(function (f) { return f.name; }); }

  T.fonts = { all: FONTS, ensure: ensure, stackFor: stackFor, names: names };
})();
