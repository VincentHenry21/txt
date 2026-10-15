/* TXT ink engine: SVG drawing overlay (pen, fountain, highlighter, laser, eraser).
   Defines window.TXT.ink. Loads after js/tabs/draw.js; nothing here depends on draw.js.
   Shell notes: index.html ships #inkLayer as a <canvas> stub inside main#stage.
   A canvas cannot host SVG children, so at init this module swaps it for a <div>
   (same id and classes) and moves it inside #pageScroll so the overlay scrolls
   with the document and mouse-wheel scrolling keeps working in draw mode. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;
  var SVGNS = "http://www.w3.org/2000/svg";

  var TOOLS = ["pen", "fountain", "highlighter", "laser", "eraser"];
  var COLORS = [
    ["#111827", "Black"], ["#2563EB", "Blue"], ["#DC2626", "Red"], ["#059669", "Green"],
    ["#D97706", "Amber"], ["#7C3AED", "Purple"], ["#0EA5E9", "Sky"], ["#EC4899", "Pink"]
  ];
  var LASER_MS = 2000;

  var enabled = false;
  var tool = "pen";
  var color = "#111827";
  var size = 4;
  var strokes = []; /* {id, tool, color, size, points:[[x,y]...], el, ephemeral, timer} */
  var layer = null, svg = null, dock = null;
  var drawing = null, erasing = false;
  var curZ = 1; /* css px per page-coordinate px, measured at layout */
  var rafId = 0;

  function validTool(t) { return TOOLS.indexOf(t) !== -1; }
  function fmt(n) { return Math.round(n * 10) / 10; }

  /* ---------------- shell adaptation ---------------- */
  function ensureLayer() {
    var el = $("#inkLayer");
    if (!el) return null;
    if (el.tagName !== "DIV") {
      var div = document.createElement("div");
      div.id = el.id;
      div.className = el.className;
      el.parentNode.replaceChild(div, el);
      el = div;
    }
    var ps = $("#pageScroll");
    if (ps && el.parentNode !== ps) {
      try {
        if (window.getComputedStyle(ps).position === "static") ps.style.position = "relative";
      } catch (e) { /* keep going */ }
      ps.insertBefore(el, ps.firstChild);
    }
    el.style.overflow = "visible";
    var s = $("#inkSvg");
    if (!s) {
      s = document.createElementNS(SVGNS, "svg");
      s.setAttribute("id", "inkSvg");
      s.setAttribute("focusable", "false");
      s.setAttribute("aria-hidden", "true");
      s.style.display = "block";
      s.style.touchAction = "none";
      el.appendChild(s);
      s.addEventListener("pointerdown", onDown);
      s.addEventListener("pointermove", onMove);
      s.addEventListener("pointerup", onUp);
      s.addEventListener("pointercancel", onUp);
    }
    return el;
  }

  /* ---------------- geometry ----------------
     The svg is absolutely positioned inside #pageScroll (content coordinates)
     and aligned exactly over the #pages box, so it tracks scroll, zoom and
     view modes without any manual offset math. */
  function layout() {
    if (!layer || !svg) return;
    var ps = $("#pageScroll"), pages = $("#pages");
    if (!ps || !pages) return;
    var pr = pages.getBoundingClientRect();
    var sr = ps.getBoundingClientRect();
    if (pr.width < 2 || pr.height < 2) return; /* pages not laid out yet */
    var w = T.editor.pageW();
    var h = Math.max(pages.offsetHeight, pages.scrollHeight, T.editor.pageH());
    curZ = pr.width / w;
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.style.position = "absolute";
    svg.style.width = Math.round(pr.width) + "px";
    svg.style.height = Math.round(pr.height) + "px";
    svg.style.left = Math.round(pr.left - sr.left + ps.scrollLeft) + "px";
    svg.style.top = Math.round(pr.top - sr.top + ps.scrollTop) + "px";
  }
  function queueLayout() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(function () { rafId = 0; layout(); });
  }

  function ptFromEvent(e) {
    var r = svg.getBoundingClientRect();
    var z = curZ || 1;
    return [(e.clientX - r.left) / z, (e.clientY - r.top) / z];
  }
  function pressureOf(e) {
    var p = e.pressure;
    return (typeof p === "number" && p > 0) ? p : 0.5;
  }

  /* ---------------- stroke rendering ---------------- */
  function pathD(pts) {
    if (!pts.length) return "";
    if (pts.length === 1) {
      return "M" + fmt(pts[0][0]) + " " + fmt(pts[0][1]) + "l0.01 0.01";
    }
    var d = "M" + fmt(pts[0][0]) + " " + fmt(pts[0][1]);
    for (var i = 1; i < pts.length; i++) d += "L" + fmt(pts[i][0]) + " " + fmt(pts[i][1]);
    return d;
  }
  function strokeWidth(st, pressure) {
    if (st.tool === "highlighter") return st.size * 3;
    if (st.tool === "fountain") return st.size * (0.55 + 0.45 * pressure);
    return st.size;
  }
  function makePathEl(st, pressure) {
    var el = document.createElementNS(SVGNS, "path");
    el.setAttribute("d", pathD(st.points));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", st.color);
    el.setAttribute("stroke-width", fmt(strokeWidth(st, pressure == null ? 0.5 : pressure)));
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    if (st.tool === "highlighter") {
      el.setAttribute("opacity", "0.35");
      el.style.mixBlendMode = "multiply";
    }
    return el;
  }
  function renderAll() {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    strokes.forEach(function (st) {
      if (st.ephemeral) return;
      st.el = makePathEl(st, 0.5);
      svg.appendChild(st.el);
    });
  }

  /* ---------------- eraser ---------------- */
  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + t * dx, cy = ay + t * dy;
    var ex = px - cx, ey = py - cy;
    return Math.sqrt(ex * ex + ey * ey);
  }
  function hitStroke(st, p) {
    var thr = Math.max(8, st.size);
    var pts = st.points;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[i + 1] || a;
      if (distToSeg(p[0], p[1], a[0], a[1], b[0], b[1]) <= thr) return true;
    }
    return false;
  }
  function removeStroke(st) {
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
    var i = strokes.indexOf(st);
    if (i !== -1) strokes.splice(i, 1);
  }
  function eraseAt(p) {
    var removed = false;
    for (var i = strokes.length - 1; i >= 0; i--) {
      if (hitStroke(strokes[i], p)) { removeStroke(strokes[i]); removed = true; }
    }
    if (removed) T.editor.markDirty();
  }

  /* ---------------- laser fade ---------------- */
  function armLaserFade(st) {
    st.timer = setTimeout(function () {
      if (!st.el) return;
      st.el.style.transition = "opacity 0.6s ease";
      st.el.style.opacity = "0";
      st.timer = setTimeout(function () { removeStroke(st); }, 650);
    }, LASER_MS);
  }

  /* ---------------- pointer input ---------------- */
  function onDown(e) {
    if (!enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
    var p = ptFromEvent(e);
    if (tool === "eraser") { erasing = true; eraseAt(p); return; }
    drawing = {
      id: T.uid(), tool: tool, color: color, size: size,
      points: [p], el: null, ephemeral: tool === "laser", timer: null
    };
    drawing.el = makePathEl(drawing, pressureOf(e));
    svg.appendChild(drawing.el);
  }
  function onMove(e) {
    if (!enabled) return;
    var p = ptFromEvent(e);
    if (erasing) { eraseAt(p); return; }
    if (!drawing) return;
    var pts = drawing.points;
    var last = pts[pts.length - 1];
    var dx = p[0] - last[0], dy = p[1] - last[1];
    if (dx * dx + dy * dy < 2.25) return; /* ignore sub-1.5px jitter */
    pts.push(p);
    drawing.el.setAttribute("d", pathD(pts));
    if (drawing.tool === "fountain") {
      drawing.el.setAttribute("stroke-width", fmt(strokeWidth(drawing, pressureOf(e))));
    }
  }
  function finishStroke() {
    if (!drawing) return;
    var st = drawing;
    drawing = null;
    strokes.push(st);
    if (st.tool === "laser") armLaserFade(st);
    T.editor.markDirty();
  }
  function onUp() {
    if (erasing) { erasing = false; return; }
    finishStroke();
  }

  /* ---------------- persistence ---------------- */
  function persistable() {
    return strokes.filter(function (s) { return !s.ephemeral; }).map(function (s) {
      return {
        id: s.id, tool: s.tool, color: s.color, size: s.size,
        points: s.points.map(function (p) { return [p[0], p[1]]; })
      };
    });
  }
  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (s) {
      return s && validTool(s.tool) && Array.isArray(s.points) && s.points.length > 0 &&
        s.points.every(function (p) {
          return Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
        });
    }).map(function (s) {
      return {
        id: String(s.id || T.uid()),
        tool: s.tool,
        color: typeof s.color === "string" ? s.color : "#111827",
        size: T.clamp(Math.round(Number(s.size)) || 4, 1, 24),
        points: s.points.map(function (p) { return [Number(p[0]), Number(p[1])]; }),
        el: null, ephemeral: false, timer: null
      };
    });
  }

  /* ---------------- dock ---------------- */
  function injectDockCss() {
    if (document.getElementById("inkDockCss")) return;
    var st = document.createElement("style");
    st.id = "inkDockCss";
    st.textContent =
      ".ink-dock .icon-btn.active{background:var(--accent-soft);color:var(--accent);}" +
      ".ink-sep{width:1px;align-self:stretch;background:var(--line);margin:4px 2px;flex:none;}" +
      ".ink-dock .ink-size{accent-color:var(--accent);cursor:pointer;}";
    document.head.appendChild(st);
  }
  function buildDock() {
    var d = $("#inkDock");
    if (!d || d.getAttribute("data-built")) return;
    d.setAttribute("data-built", "1");
    injectDockCss();
    var tools = [
      ["pen", "i-pen", "Pen"],
      ["fountain", "i-fountain", "Fountain pen"],
      ["highlighter", "i-highlighter", "Highlighter"],
      ["laser", "i-laser", "Laser pointer"],
      ["eraser", "i-eraser", "Eraser"]
    ];
    var html = "";
    tools.forEach(function (t) {
      html += '<button type="button" class="icon-btn" data-tool="' + t[0] + '"' +
        ' title="' + t[2] + '" aria-label="' + t[2] + '">' + T.icon(t[1]) + "</button>";
    });
    html += '<span class="ink-sep" aria-hidden="true"></span>';
    COLORS.forEach(function (c) {
      html += '<button type="button" class="ink-sw" data-color="' + c[0] + '"' +
        ' title="' + c[1] + '" aria-label="Ink color ' + c[1] + '"' +
        ' style="background:' + c[0] + '"></button>';
    });
    html += '<span class="ink-sep" aria-hidden="true"></span>';
    html += '<input type="range" class="ink-size" min="1" max="24" step="1" value="' + size + '"' +
      ' title="Stroke thickness" aria-label="Stroke thickness">';
    html += '<span class="ink-sep" aria-hidden="true"></span>';
    html += '<button type="button" class="icon-btn" data-act="clear"' +
      ' title="Clear all ink" aria-label="Clear all ink">' + T.icon("i-trash") + "</button>";
    html += '<button type="button" class="icon-btn" data-act="close"' +
      ' title="Exit draw mode" aria-label="Exit draw mode">' + T.icon("i-x") + "</button>";
    d.innerHTML = html;
    dock = d;
    d.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!b || !d.contains(b)) return;
      if (b.hasAttribute("data-tool")) T.ink.setTool(b.getAttribute("data-tool"));
      else if (b.getAttribute("data-act") === "clear") T.cmd("ink.clear");
      else if (b.getAttribute("data-act") === "close") T.ink.setEnabled(false);
      else if (b.hasAttribute("data-color")) T.ink.setColor(b.getAttribute("data-color"));
    });
    d.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains("ink-size")) {
        T.ink.setSize(parseInt(t.value, 10));
      }
    });
    refreshDock();
  }
  function refreshDock() {
    if (!dock) return;
    var btns = dock.querySelectorAll("[data-tool]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-tool") === tool);
    }
    var dots = dock.querySelectorAll("[data-color]");
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.toggle("active",
        String(dots[j].getAttribute("data-color")).toLowerCase() === String(color).toLowerCase());
    }
    var r = dock.querySelector(".ink-size");
    if (r && document.activeElement !== r) r.value = String(size);
  }

  /* ---------------- public API ---------------- */
  T.ink = {
    setEnabled: function (b) {
      enabled = !!b;
      layer = ensureLayer();
      if (enabled) layout();
      if (layer) {
        layer.classList.toggle("hidden", !enabled);
        layer.classList.toggle("active", enabled);
      }
      if (dock) dock.classList.toggle("hidden", !enabled);
      if (!enabled) { finishStroke(); erasing = false; }
      refreshDock();
      T.bus.emit("ink:tool", { tool: tool, enabled: enabled });
    },
    setTool: function (t) {
      if (!validTool(t)) return;
      tool = t;
      refreshDock();
      T.bus.emit("ink:tool", { tool: tool, enabled: enabled });
    },
    setColor: function (c) {
      if (typeof c !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c)) return;
      color = c;
      refreshDock();
    },
    setSize: function (n) {
      size = T.clamp(Math.round(Number(n)) || 4, 1, 24);
      refreshDock();
      T.bus.emit("ink:size", { size: size });
    },
    clear: function () {
      strokes.slice().forEach(removeStroke);
      drawing = null;
      erasing = false;
      T.editor.markDirty();
    },
    save: function () {
      var d = T.editor.getDoc();
      var data = persistable();
      if (d) d.ink = data;
      return data;
    },
    load: function (list) {
      strokes = sanitize(list);
      renderAll();
    },
    isEnabled: function () { return enabled; },
    getTool: function () { return tool; },
    getColor: function () { return color; },
    getSize: function () { return size; }
  };

  /* ---------------- bus wiring ---------------- */
  T.bus.on("doc:saved", function (doc) { if (doc) doc.ink = persistable(); });
  T.bus.on("doc:open", function (doc) {
    T.ink.load(doc && doc.ink);
    queueLayout();
  });
  T.bus.on("page:geom", queueLayout);
  T.bus.on("page:change", queueLayout);
  window.addEventListener("resize", queueLayout);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !enabled) return;
    if (document.querySelector(".modal-wrap")) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    T.ink.setEnabled(false);
  });

  /* ---------------- init ---------------- */
  layer = ensureLayer();
  buildDock();
  queueLayout();
})();
