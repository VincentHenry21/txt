/* TXT Draw tab: ribbon controls for the ink engine.
   ribbon.js loads before this file, so T.ribbon.* is safe at top level.
   T.ink (js/ink.js) loads AFTER this file: call it only inside command
   functions and event handlers, never at module top level. */
(function () {
  "use strict";
  var T = window.TXT;

  var COLORS = [
    ["#111827", "Black"],
    ["#2563EB", "Blue"],
    ["#DC2626", "Red"],
    ["#059669", "Green"],
    ["#D97706", "Amber"],
    ["#7C3AED", "Purple"],
    ["#0EA5E9", "Sky"],
    ["#EC4899", "Pink"]
  ];

  var TOOLS = [
    ["pen", "i-pen", "Pen", "ink.toolPen", "Ballpoint pen"],
    ["fountain", "i-fountain", "Fountain Pen", "ink.toolFountain", "Fountain pen, stroke tapers with pressure"],
    ["highlighter", "i-highlighter", "Highlighter", "ink.toolHighlighter", "Translucent highlighter stroke"],
    ["laser", "i-laser", "Laser Pointer", "ink.toolLaser", "Temporary stroke, fades after 2 seconds"],
    ["eraser", "i-eraser", "Eraser", "ink.toolEraser", "Erase ink strokes"]
  ];

  /* Module-local mirror of ink state, synced via the ink:tool bus event
     emitted by js/ink.js. Ribbon toggle buttons read these. */
  var currentTool = "pen";
  var drawEnabled = false;
  var currentSize = 4;

  function syncToggles() {
    if (T.ribbon && typeof T.ribbon.refresh === "function") {
      try { T.ribbon.refresh(); } catch (e) { /* ribbon has no refresh, toggles evaluated on render */ }
    }
  }

  T.bus.on("ink:tool", function (d) {
    if (!d) return;
    if (typeof d.tool === "string") currentTool = d.tool;
    if (typeof d.enabled === "boolean") drawEnabled = d.enabled;
    syncToggles();
  });
  T.bus.on("ink:size", function (d) {
    if (d && typeof d.size === "number") currentSize = d.size;
  });

  /* ---------------- commands (Draw category) ---------------- */
  T.register("ink.toolPen", function () { T.ink.setTool("pen"); T.ink.setEnabled(true); },
    { title: "Pen", cat: "Draw", icon: "i-pen" });
  T.register("ink.toolFountain", function () { T.ink.setTool("fountain"); T.ink.setEnabled(true); },
    { title: "Fountain Pen", cat: "Draw", icon: "i-fountain" });
  T.register("ink.toolHighlighter", function () { T.ink.setTool("highlighter"); T.ink.setEnabled(true); },
    { title: "Highlighter", cat: "Draw", icon: "i-highlighter" });
  T.register("ink.toolLaser", function () { T.ink.setTool("laser"); T.ink.setEnabled(true); },
    { title: "Laser Pointer", cat: "Draw", icon: "i-laser" });
  T.register("ink.toolEraser", function () { T.ink.setTool("eraser"); T.ink.setEnabled(true); },
    { title: "Eraser", cat: "Draw", icon: "i-eraser" });
  T.register("ink.setColor", function (c) { T.ink.setColor(c); },
    { title: "Ink color", cat: "Draw", icon: "i-swatch" });
  T.register("ink.setSize", function (n) { T.ink.setSize(n); },
    { title: "Stroke thickness", cat: "Draw", icon: "i-minus" });
  T.register("ink.clear", function () {
    T.modal({
      title: "Clear all ink",
      sub: "Remove every ink stroke in this document? This cannot be undone.",
      okText: "Clear all"
    }).then(function (r) { if (r) T.ink.clear(); });
  }, { title: "Clear all ink", cat: "Draw", icon: "i-trash" });
  T.register("ink.exit", function () { T.ink.setEnabled(false); },
    { title: "Exit draw mode", cat: "Draw", icon: "i-x" });

  /* ---------------- ribbon tab ---------------- */
  T.ribbon.addTab({ id: "draw", label: "Draw", keytip: "D" });

  var gTools = T.ribbon.group("draw", "Tools");
  TOOLS.forEach(function (t) {
    var toolId = t[0], icon = t[1], label = t[2], cmdName = t[3], title = t[4];
    gTools.appendChild(T.ribbon.btn({
      icon: icon,
      label: label,
      cmd: cmdName,
      title: title,
      toggle: function () { return drawEnabled && currentTool === toolId; }
    }));
  });

  var gStroke = T.ribbon.group("draw", "Stroke");
  gStroke.appendChild(T.ribbon.menuBtn({
    icon: "i-swatch",
    label: "Color",
    title: "Ink color",
    items: COLORS.map(function (c) {
      var hex = c[0], name = c[1];
      return {
        label: name,
        fn: function () { T.cmd("ink.setColor", hex); }
      };
    })
  }));
  gStroke.appendChild(T.ribbon.menuBtn({
    icon: "i-minus",
    label: "Thickness",
    title: "Stroke thickness, 1 to 24",
    items: [{
      html: '<label class="ink-thick">Thickness ' +
        '<input type="range" class="ink-thick-range" min="1" max="24" step="1" value="' + currentSize + '"> ' +
        '<span class="ink-thick-val">' + currentSize + "</span></label>"
    }]
  }));

  /* Thickness slider lives inside a ribbon popup, so wire it with a
     delegated listener instead of reaching into ribbon internals. */
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains("ink-thick-range")) return;
    var n = parseInt(t.value, 10);
    if (isNaN(n)) return;
    T.cmd("ink.setSize", n);
    var wrap = t.closest ? t.closest(".ink-thick") : null;
    var val = wrap ? wrap.querySelector(".ink-thick-val") : null;
    if (val) val.textContent = String(n);
  });

  var gInk = T.ribbon.group("draw", "Ink");
  gInk.appendChild(T.ribbon.btn({
    icon: "i-trash", label: "Clear All", cmd: "ink.clear", title: "Remove all ink strokes"
  }));
  gInk.appendChild(T.ribbon.btn({
    icon: "i-x", label: "Exit Draw", cmd: "ink.exit", title: "Exit draw mode"
  }));
})();
