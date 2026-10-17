/* DCK engine depth upgrade (NXT OS).
   Ribbon (8 tabs), 12 transitions + true morph, block animations + pane,
   SmartArt engine, chart blocks, ink drawing, slide master, slide sorter,
   notes page, presenter console (2nd window), export (HTML5/PDF handout/
   PPTX/PNG), heuristic remove-background.

   Dependency-free IIFE. Loads AFTER js/dck/dck.js and extends T.dck via its
   public API (withCurrentSlide/withBlock/mutateDeck/render/presentGo).
   Everything here is genuinely functional: no dead buttons, no alert().
   No emojis, no em dashes, no CSS zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T || !T.dck) return;
  var D = T.dck;

  /* ============================================================
     utils
     ============================================================ */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function esc(s) {
    if (T.esc) return T.esc(s);
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function escXml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function uid() {
    if (typeof T.uid === "function") return "dckx-" + T.uid();
    return "dckx-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function toast(msg, kind) { if (typeof T.toast === "function") T.toast(msg, kind); }
  function isMyText(s) { return /[\u1000-\u109F]/.test(String(s || "")); }
  function icon(id) { return (typeof T.icon === "function") ? T.icon(id) : ""; }

  /* ============================================================
     pure: morph interpolation math
     rects: {x, y, w, h, rot, op}. t in [0,1].
     ============================================================ */
  function morphInterp(a, b, t) {
    t = clamp(t, 0, 1);
    function n(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }
    return {
      x: n(a.x) + (n(b.x) - n(a.x)) * t,
      y: n(a.y) + (n(b.y) - n(a.y)) * t,
      w: n(a.w) + (n(b.w) - n(a.w)) * t,
      h: n(a.h) + (n(b.h) - n(a.h)) * t,
      rot: n(a.rot) + (n(b.rot) - n(a.rot)) * t,
      op: (a.op == null ? 1 : n(a.op)) + ((b.op == null ? 1 : n(b.op)) - (a.op == null ? 1 : n(a.op))) * t
    };
  }

  /* ============================================================
     pure-ish: WAAPI helper (falls back to instant when unavailable)
     ============================================================ */
  function waapi(elm, kf, opt, done) {
    var finished = false;
    function fin() { if (!finished) { finished = true; if (typeof done === "function") done(); } }
    try {
      if (elm && typeof elm.animate === "function") {
        var a = elm.animate(kf, opt);
        if (a && a.finished && typeof a.finished.then === "function") {
          a.finished.then(fin, fin);
          return;
        }
      }
    } catch (e) { /* fall through to instant */ }
    fin();
  }

  /* ============================================================
     12-transition registry. Each apply(oldL, newL, durMs, done) animates
     two absolutely-positioned layers (inset 0) inside the stage.
     ============================================================ */
  function prepLayer(l, above) {
    l.style.position = "absolute";
    l.style.inset = "0";
    l.style.zIndex = above ? "2" : "1";
    return l;
  }
  var TRANSITIONS = {
    none: { name: "None", apply: function (oldL, newL, dur, done) {
      if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
      prepLayer(newL, true); newL.style.opacity = "1"; done();
    } },
    fade: { name: "Fade", apply: function (oldL, newL, dur, done) {
      prepLayer(newL, true); newL.style.opacity = "0";
      waapi(newL, [{ opacity: "0" }, { opacity: "1" }],
        { duration: dur, easing: "ease", fill: "forwards" }, function () {
          newL.style.opacity = "1";
          if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
          done();
        });
    } },
    pushL: { name: "Push Left", apply: function (oldL, newL, dur, done) {
      push(oldL, newL, dur, done, "-100%", "0", "100%");
    } },
    pushR: { name: "Push Right", apply: function (oldL, newL, dur, done) {
      push(oldL, newL, dur, done, "100%", "0", "-100%");
    } },
    pushU: { name: "Push Up", apply: function (oldL, newL, dur, done) {
      push(oldL, newL, dur, done, "0,-100%", "0,0", "0,100%", true);
    } },
    pushD: { name: "Push Down", apply: function (oldL, newL, dur, done) {
      push(oldL, newL, dur, done, "0,100%", "0,0", "0,-100%", true);
    } },
    wipe: { name: "Wipe", apply: function (oldL, newL, dur, done) {
      prepLayer(newL, true);
      newL.style.clipPath = "inset(0 100% 0 0)";
      waapi(newL, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
        { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, function () {
          newL.style.clipPath = "none";
          if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
          done();
        });
    } },
    split: { name: "Split", apply: function (oldL, newL, dur, done) {
      prepLayer(newL, true);
      var from = "polygon(50% 0, 50% 0, 50% 100%, 50% 100%)";
      var to = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
      newL.style.clipPath = from;
      waapi(newL, [{ clipPath: from }, { clipPath: to }],
        { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, function () {
          newL.style.clipPath = "none";
          if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
          done();
        });
    } },
    reveal: { name: "Reveal", apply: function (oldL, newL, dur, done) {
      prepLayer(newL, false); prepLayer(oldL, true);
      waapi(oldL, [{ transform: "translateY(0)" }, { transform: "translateY(101%)" }],
        { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, function () {
          prepLayer(newL, true);
          if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
          done();
        });
    } },
    cover: { name: "Cover", apply: function (oldL, newL, dur, done) {
      prepLayer(oldL, false); prepLayer(newL, true);
      newL.style.transform = "translateY(101%)";
      waapi(newL, [{ transform: "translateY(101%)" }, { transform: "translateY(0)" }],
        { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, function () {
          newL.style.transform = "";
          if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
          done();
        });
    } },
    zoom: { name: "Zoom", apply: function (oldL, newL, dur, done) {
      prepLayer(newL, true);
      waapi(newL, [
        { opacity: "0", transform: "scale(0.6)" },
        { opacity: "1", transform: "scale(1)" }
      ], { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, function () {
        newL.style.opacity = "1"; newL.style.transform = "";
        if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
        done();
      });
    } },
    flip: { name: "Flip", apply: function (oldL, newL, dur, done) {
      var half = Math.max(60, dur / 2);
      prepLayer(oldL, true); prepLayer(newL, true);
      newL.style.visibility = "hidden";
      oldL.style.transformStyle = "preserve-3d";
      waapi(oldL, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-90deg)" }],
        { duration: half, easing: "ease-in", fill: "forwards" }, function () {
          if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
          newL.style.visibility = "";
          waapi(newL, [{ transform: "rotateY(90deg)" }, { transform: "rotateY(0deg)" }],
            { duration: half, easing: "ease-out", fill: "forwards" }, function () {
              newL.style.transform = "";
              done();
            });
        });
    } },
    cube: { name: "Cube (approx)", apply: function (oldL, newL, dur, done) {
      prepLayer(oldL, true); prepLayer(newL, true);
      var p1 = waapi(oldL, [
        { transform: "rotateY(0deg) translateX(0)", opacity: "1" },
        { transform: "rotateY(-55deg) translateX(-22%)", opacity: "0.35" }
      ], { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, null);
      newL.style.transform = "rotateY(55deg) translateX(22%)";
      newL.style.opacity = "0.35";
      waapi(newL, [
        { transform: "rotateY(55deg) translateX(22%)", opacity: "0.35" },
        { transform: "rotateY(0deg) translateX(0)", opacity: "1" }
      ], { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }, function () {
        newL.style.transform = ""; newL.style.opacity = "1";
        if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
        done();
      });
      void p1;
    } }
  };
  function push(oldL, newL, dur, done, oldTo, mid, newFrom, vertical) {
    function tr(v) {
      if (vertical) { var p = String(v).split(","); return "translateY(" + p[1] + ")"; }
      return "translateX(" + v + ")";
    }
    prepLayer(oldL, false); prepLayer(newL, true);
    newL.style.transform = tr(newFrom);
    var d1 = false, d2 = false;
    function fin() { if (d1 && d2) {
      newL.style.transform = "";
      if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
      done();
    } }
    waapi(oldL, [{ transform: tr(mid) }, { transform: tr(oldTo) }],
      { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" },
      function () { d1 = true; fin(); });
    waapi(newL, [{ transform: tr(newFrom) }, { transform: tr(mid) }],
      { duration: dur, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" },
      function () { d2 = true; fin(); });
  }
  var TRANSITION_IDS = ["none", "fade", "pushL", "pushR", "pushU", "pushD",
    "wipe", "split", "reveal", "cover", "zoom", "flip", "cube"];
  /* legacy ids from the original 4-transition set */
  var LEGACY_TR = { "fade-up": "fade", "zoom-in": "zoom", "slide-left": "pushL" };
  function resolveTransition(id) {
    if (TRANSITIONS[id]) return id;
    if (LEGACY_TR[id]) return LEGACY_TR[id];
    return "none";
  }

  /* ============================================================
     SMARTART: 8 real diagrams rendered as SVG from a live item list.
     items: [{text}]. Pure: returns an SVG string.
     ============================================================ */
  var SMARTARTS = [
    { id: "chevron",  name: "Process Chevron Flow" },
    { id: "cycle",    name: "Cycle" },
    { id: "hierarchy", name: "Hierarchy Org Chart" },
    { id: "pyramid",  name: "Pyramid Funnel" },
    { id: "venn",     name: "Venn" },
    { id: "timeline", name: "Timeline" },
    { id: "matrix",   name: "Matrix Grid" },
    { id: "swot",     name: "SWOT Quadrant" }
  ];
  var SA_COLORS = ["#FF2E93", "#F97316", "#FACC15", "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899"];
  function saText(x, y, s, size, anchor, fill) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || "middle") +
      '" font-size="' + (size || 15) + '" fill="' + (fill || "#111827") +
      '" font-family="inherit">' + escXml(s) + "</text>";
  }
  function smartartSvg(diagram, items, accent) {
    items = (items || []).filter(function (it) { return it && String(it.text || "").trim(); });
    if (!items.length) items = [{ text: "Item 1" }];
    var n = items.length, i, out = "";
    var W = 600, H = 360;
    out += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H +
      '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img">';
    out += '<defs><marker id="saArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" ' +
      'markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6B7280"/></marker></defs>';
    function col(k) { return SA_COLORS[k % SA_COLORS.length]; }
    if (diagram === "chevron") {
      var cw = Math.min(150, (W - 20) / n), chh = 120, y0 = (H - chh) / 2, tip = 34;
      for (i = 0; i < n; i++) {
        var x0 = 10 + i * cw;
        var pts = x0 + "," + y0 + " " + (x0 + cw - tip) + "," + y0 + " " + (x0 + cw) + "," + (y0 + chh / 2) +
          " " + (x0 + cw - tip) + "," + (y0 + chh) + " " + x0 + "," + (y0 + chh) + " " + (x0 + tip) + "," + (y0 + chh / 2);
        out += '<polygon points="' + pts + '" fill="' + col(i) + '" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>';
        out += saText(x0 + cw / 2 + 8, y0 + chh / 2 + 5, String(items[i].text).slice(0, 18), 14, "middle", "#fff");
      }
    } else if (diagram === "cycle") {
      var cx = W / 2, cy = H / 2, r = 105, nr = 44;
      for (i = 0; i < n; i++) {
        var a1 = (i / n) * Math.PI * 2 - Math.PI / 2;
        var a2 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
        var am = (a1 + a2) / 2;
        var mx = cx + Math.cos(am) * r, my = cy + Math.sin(am) * r;
        var x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
        var x2 = cx + Math.cos(a2) * r, y2 = cy + Math.sin(a2) * r;
        out += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
          '" y2="' + y2.toFixed(1) + '" stroke="#9CA3AF" stroke-width="3" marker-end="url(#saArr)"/>';
        out += '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="' + nr +
          '" fill="' + col(i) + '" fill-opacity="0.9" stroke="#fff" stroke-width="2"/>';
        out += saText(mx.toFixed(1), (my + 5).toFixed(1), String(items[i].text).slice(0, 14), 13, "middle", "#fff");
      }
    } else if (diagram === "hierarchy") {
      var rootW = 170, rootH = 52, rx = (W - rootW) / 2, ry = 24;
      out += '<rect x="' + rx + '" y="' + ry + '" width="' + rootW + '" height="' + rootH +
        '" rx="8" fill="' + (accent || "#FF2E93") + '"/>';
      out += saText(W / 2, ry + 32, String(items[0].text).slice(0, 22), 15, "middle", "#fff");
      var kids = items.slice(1), kn = Math.max(kids.length, 1);
      var kw = Math.min(150, (W - 20) / kn), ky = 200, kh = 56;
      for (i = 0; i < kids.length; i++) {
        var kx = 10 + i * kw + (kw - Math.min(kw - 8, 142)) / 2;
        var bw = Math.min(kw - 8, 142);
        out += '<line x1="' + (W / 2) + '" y1="' + (ry + rootH) + '" x2="' + (kx + bw / 2).toFixed(1) +
          '" y2="' + ky + '" stroke="#9CA3AF" stroke-width="2"/>';
        out += '<rect x="' + kx.toFixed(1) + '" y="' + ky + '" width="' + bw + '" height="' + kh +
          '" rx="8" fill="' + col(i + 1) + '" fill-opacity="0.9"/>';
        out += saText((kx + bw / 2).toFixed(1), ky + 34, String(kids[i].text).slice(0, 18), 13, "middle", "#fff");
      }
    } else if (diagram === "pyramid") {
      var topW = 120, botW = 520, ph = (H - 40) / n;
      for (i = 0; i < n; i++) {
        var wTop = topW + (botW - topW) * (i / n);
        var wBot = topW + (botW - topW) * ((i + 1) / n);
        var py = 20 + i * ph;
        var p = ((W - wTop) / 2) + "," + py + " " + ((W + wTop) / 2) + "," + py + " " +
          ((W + wBot) / 2) + "," + (py + ph) + " " + ((W - wBot) / 2) + "," + (py + ph);
        out += '<polygon points="' + p + '" fill="' + col(i) + '" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>';
        out += saText(W / 2, py + ph / 2 + 5, String(items[i].text).slice(0, 20), 14, "middle", "#fff");
      }
    } else if (diagram === "venn") {
      var vcols = ["#FF2E93", "#3B82F6", "#22C55E"];
      var vcx = [W / 2 - 80, W / 2 + 80, W / 2], vcy = [H / 2, H / 2, H / 2 - 40];
      var vn = Math.min(n, 3);
      for (i = 0; i < vn; i++) {
        out += '<circle cx="' + vcx[i] + '" cy="' + vcy[i] + '" r="95" fill="' + vcols[i] +
          '" fill-opacity="0.45" stroke="' + vcols[i] + '" stroke-width="2"/>';
        out += saText(vcx[i] + (i === 2 ? 0 : (i === 0 ? -52 : 52)), vcy[i] + (i === 2 ? -58 : 4),
          String(items[i].text).slice(0, 16), 14, "middle", "#111827");
      }
    } else if (diagram === "timeline") {
      var ty = H / 2;
      out += '<line x1="30" y1="' + ty + '" x2="' + (W - 30) + '" y2="' + ty +
        '" stroke="#9CA3AF" stroke-width="4" marker-end="url(#saArr)"/>';
      for (i = 0; i < n; i++) {
        var tx = 40 + i * ((W - 80) / Math.max(n - 1, 1));
        out += '<circle cx="' + tx.toFixed(1) + '" cy="' + ty + '" r="11" fill="' + col(i) +
          '" stroke="#fff" stroke-width="3"/>';
        var above = i % 2 === 0;
        out += saText(tx.toFixed(1), above ? ty - 34 : ty + 46, String(items[i].text).slice(0, 20), 14, "middle", "#111827");
        out += '<line x1="' + tx.toFixed(1) + '" y1="' + (above ? ty - 12 : ty + 12) + '" x2="' +
          tx.toFixed(1) + '" y2="' + (above ? ty - 24 : ty + 30) + '" stroke="#9CA3AF" stroke-width="2"/>';
      }
    } else if (diagram === "matrix") {
      var mw = (W - 40) / 2, mh = (H - 40) / 2;
      for (i = 0; i < 4; i++) {
        var mx2 = 20 + (i % 2) * mw, my2 = 20 + Math.floor(i / 2) * mh;
        var it = items[i] || { text: "Item " + (i + 1) };
        out += '<rect x="' + mx2 + '" y="' + my2 + '" width="' + mw + '" height="' + mh +
          '" rx="6" fill="' + col(i) + '" fill-opacity="0.28" stroke="' + col(i) + '" stroke-width="2"/>';
        out += saText(mx2 + mw / 2, my2 + mh / 2 + 5, String(it.text).slice(0, 22), 15, "middle", "#111827");
      }
    } else if (diagram === "swot") {
      var heads = ["S", "W", "O", "T"];
      var full = ["Strengths", "Weaknesses", "Opportunities", "Threats"];
      var sw = (W - 40) / 2, sh = (H - 40) / 2;
      for (i = 0; i < 4; i++) {
        var sx = 20 + (i % 2) * sw, sy = 20 + Math.floor(i / 2) * sh;
        var sit = items[i] || { text: "" };
        out += '<rect x="' + sx + '" y="' + sy + '" width="' + sw + '" height="' + sh +
          '" rx="6" fill="' + col(i) + '" fill-opacity="0.22" stroke="' + col(i) + '" stroke-width="2"/>';
        out += '<text x="' + (sx + 14) + '" y="' + (sy + 30) + '" font-size="17" font-weight="800" fill="' +
          col(i) + '" font-family="inherit">' + heads[i] + " · " + full[i] + "</text>";
        var words = String(sit.text || "").slice(0, 60);
        out += '<text x="' + (sx + 14) + '" y="' + (sy + 58) + '" font-size="14" fill="#111827" font-family="inherit">' +
          escXml(words) + "</text>";
      }
    }
    out += "</svg>";
    return out;
  }
  function smartartName(id) {
    for (var i = 0; i < SMARTARTS.length; i++) if (SMARTARTS[i].id === id) return SMARTARTS[i].name;
    return id;
  }

  /* ============================================================
     CHART block: bar / line / pie drawn from real data arrays.
     cfg: {chartType, title, labels[], values[]}. Pure SVG string.
     ============================================================ */
  var CHART_COLORS = ["#FF2E93", "#3B82F6", "#22C55E", "#F59E0B", "#8B5CF6", "#06B6D4", "#EF4444", "#84CC16"];
  function chartSvg(cfg) {
    cfg = cfg || {};
    var type = cfg.chartType || "bar";
    var labels = cfg.labels || [], values = cfg.values || [];
    var W = 600, H = 360, padL = 46, padB = 44, padT = 40;
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H +
      '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img">';
    if (cfg.title) out += saText(W / 2, 24, String(cfg.title).slice(0, 40), 17, "middle", "#111827");
    var n = Math.max(values.length, 1);
    var max = 0, i;
    for (i = 0; i < values.length; i++) max = Math.max(max, Number(values[i]) || 0);
    if (max <= 0) max = 1;
    if (type === "pie") {
      var total = 0;
      for (i = 0; i < values.length; i++) total += Number(values[i]) || 0;
      if (total <= 0) total = 1;
      var cx = W / 2 - 60, cy = H / 2 + 10, r = 120, ang = -Math.PI / 2;
      for (i = 0; i < values.length; i++) {
        var frac = (Number(values[i]) || 0) / total;
        var a2 = ang + frac * Math.PI * 2;
        var big = frac > 0.5 ? 1 : 0;
        var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
        var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        if (frac > 0.001) {
          out += '<path d="M' + cx + "," + cy + " L" + x1.toFixed(1) + "," + y1.toFixed(1) +
            " A" + r + "," + r + " 0 " + big + " 1 " + x2.toFixed(1) + "," + y2.toFixed(1) +
            ' Z" fill="' + CHART_COLORS[i % CHART_COLORS.length] + '" stroke="#fff" stroke-width="2"/>';
        }
        var lx = W - 150, ly = 70 + i * 26;
        out += '<rect x="' + lx + '" y="' + (ly - 12) + '" width="14" height="14" fill="' +
          CHART_COLORS[i % CHART_COLORS.length] + '"/>';
        out += '<text x="' + (lx + 20) + '" y="' + ly + '" font-size="13" fill="#111827" font-family="inherit">' +
          escXml(String(labels[i] || ("Item " + (i + 1))).slice(0, 18)) + "</text>";
        ang = a2;
      }
    } else {
      var cw = W - padL - 14, chh = H - padT - padB;
      out += '<line x1="' + padL + '" y1="' + (padT + chh) + '" x2="' + (padL + cw) + '" y2="' + (padT + chh) + '" stroke="#9CA3AF" stroke-width="2"/>';
      // y gridlines
      for (var g = 0; g <= 4; g++) {
        var gy = padT + chh - (g / 4) * chh;
        out += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + cw) + '" y2="' + gy + '" stroke="#E5E7EB" stroke-width="1"/>';
        out += '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" font-size="11" fill="#6B7280" text-anchor="end" font-family="inherit">' +
          (Math.round(max * g / 4 * 100) / 100) + "</text>";
      }
      var slot = cw / n;
      var pts = [];
      for (i = 0; i < n; i++) {
        var v = Number(values[i]) || 0;
        var bh = (v / max) * chh;
        var bx = padL + i * slot;
        if (type === "bar") {
          var bw = Math.min(slot * 0.62, 90);
          var bx0 = bx + (slot - bw) / 2, by0 = padT + chh - bh;
          out += '<rect x="' + bx0.toFixed(1) + '" y="' + by0.toFixed(1) + '" width="' + bw.toFixed(1) +
            '" height="' + bh.toFixed(1) + '" rx="4" fill="' + CHART_COLORS[i % CHART_COLORS.length] + '"/>';
        } else {
          pts.push((bx + slot / 2).toFixed(1) + "," + (padT + chh - bh).toFixed(1));
        }
        var lab = String(labels[i] || ("P" + (i + 1))).slice(0, 12);
        out += '<text x="' + (bx + slot / 2).toFixed(1) + '" y="' + (padT + chh + 18) +
          '" font-size="12" fill="#4B5563" text-anchor="middle" font-family="inherit">' + escXml(lab) + "</text>";
      }
      if (type === "line" && pts.length) {
        out += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#FF2E93" stroke-width="3" stroke-linejoin="round"/>';
        for (i = 0; i < pts.length; i++) {
          var pp = pts[i].split(",");
          out += '<circle cx="' + pp[0] + '" cy="' + pp[1] + '" r="5" fill="#FF2E93" stroke="#fff" stroke-width="2"/>';
        }
      }
    }
    out += "</svg>";
    return out;
  }

  /* ============================================================
     pure: TXT-to-DCK compile mapping (mirrors the deck builder rules).
     parsed: {title, subtitle, slides:[{title, divider, bullets[], tables[], grds[]}]}
     returns: [{layout, title}] in build order.
     ============================================================ */
  function compileMap(parsed) {
    var plan = [];
    if (!parsed) return plan;
    plan.push({ layout: "cover", title: parsed.title || "Untitled Deck" });
    (parsed.slides || []).forEach(function (sec) {
      var has = (sec.bullets && sec.bullets.length) || (sec.tables && sec.tables.length) ||
        (sec.grds && sec.grds.length) || sec.title;
      if (!has) return;
      if (sec.divider) { plan.push({ layout: "divider", title: sec.title || "" }); return; }
      if (sec.grds && sec.grds.length && !(sec.bullets && sec.bullets.length) && !(sec.tables && sec.tables.length)) {
        plan.push({ layout: "chart", title: sec.title || "" });
      } else {
        plan.push({ layout: "content", title: sec.title || "" });
      }
      (sec.grds || []).forEach(function () { plan.push({ layout: "chart", title: sec.title || "" }); });
    });
    return plan;
  }

  /* ============================================================
     pure: heuristic remove-background.
     Flood-fills from the 4 corners: pixels similar (per-channel <= tol)
     to the corner color become transparent. Operates on a
     Uint8ClampedArray-like RGBA buffer. Returns cleared pixel count.
     ============================================================ */
  function floodFillAlpha(px, w, h, tol) {
    tol = (tol == null) ? 28 : tol;
    var seen = new Uint8Array(w * h);
    var stack = [];
    function corner(x, y) {
      var i = (y * w + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    }
    function similar(i, ref) {
      return Math.abs(px[i] - ref[0]) <= tol && Math.abs(px[i + 1] - ref[1]) <= tol &&
        Math.abs(px[i + 2] - ref[2]) <= tol;
    }
    var corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    for (var c = 0; c < 4; c++) {
      var ref = corner(corners[c][0], corners[c][1]);
      stack.push(corners[c][0], corners[c][1]);
      while (stack.length) {
        var y = stack.pop(), x = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        var idx = y * w + x;
        if (seen[idx]) continue;
        seen[idx] = 1;
        var pi = idx * 4;
        if (px[pi + 3] === 0) continue;
        if (!similar(pi, ref)) continue;
        px[pi + 3] = 0;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
    }
    var cleared = 0;
    for (var k = 0; k < w * h; k++) if (px[k * 4 + 3] === 0) cleared++;
    return cleared;
  }

  /* ============================================================
     pure: animation sequence reorder. seq: [blockId...]
     ============================================================ */
  function moveSeqItem(seq, id, dir) {
    seq = (seq || []).slice();
    var i = seq.indexOf(id);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= seq.length) return seq;
    var t = seq[i]; seq[i] = seq[j]; seq[j] = t;
    return seq;
  }

  /* ============================================================
     pure: ink stroke hit test (for the eraser). strokes: [{pts:[[x,y]..]}]
     coords in % units. Returns the stroke index or -1.
     ============================================================ */
  function inkHitTest(strokes, x, y, tol) {
    tol = tol == null ? 2 : tol;
    for (var s = 0; s < strokes.length; s++) {
      var pts = strokes[s].pts || [];
      for (var i = 0; i < pts.length - 1; i++) {
        var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
        var dx = bx - ax, dy = by - ay;
        var len2 = dx * dx + dy * dy;
        var t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
        t = clamp(t, 0, 1);
        var px = ax + dx * t, py = ay + dy * t;
        if (Math.hypot(x - px, y - py) <= tol) return s;
      }
      if (pts.length === 1 && Math.hypot(x - pts[0][0], y - pts[0][1]) <= tol) return s;
    }
    return -1;
  }

  /* ============================================================
     Static slide serializer: one self-contained HTML string per slide
     with inline styles (% geometry, px type at a reference width).
     Used by the HTML5 player, presenter console, PNG export, print
     handout and the slide sorter.
     ============================================================ */
  var FS_CLS = { "dck-b-title": 4.2, "dck-b-subtitle": 2, "dck-b-h2": 2.6,
    "dck-b-body": 1.7, "dck-b-kpi": 8, "dck-b-mile": 1.6 };
  function themeOfDeck(deck) {
    var th = (D.themes || []);
    for (var i = 0; i < th.length; i++) if (th[i].id === (deck && deck.theme)) return th[i];
    return th[0] || { bg: "#FFFFFF", bg2: "#EDF1F7", ink: "#111827", accent: "#FF2E93" };
  }
  function aspectPair(deck) {
    var a = (deck && deck.aspect) || "16:9";
    return a === "4:3" ? [4, 3] : (a === "9:16" ? [9, 16] : [16, 9]);
  }
  function blockText(b) {
    if (b.type === "text") return String(b.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (b.type === "bullets") return (b.items || []).join(" ");
    return "";
  }
  function slideHtml(deck, slide, idx, opts) {
    opts = opts || {};
    var theme = themeOfDeck(deck);
    var ap = aspectPair(deck);
    var refW = 1280, refH = Math.round(1280 * ap[1] / ap[0]);
    var bg = deck.bgSolid || ("linear-gradient(135deg," + theme.bg + "," + theme.bg2 + ")");
    var h = '<div class="dckx-ss" data-aspect="' + esc(deck.aspect || "16:9") + '" style="position:relative;width:100%;' +
      "aspect-ratio:" + ap[0] + "/" + ap[1] + ";background:" + bg + ";color:" + theme.ink +
      ";overflow:hidden;border-radius:8px;\">";
    var blocks = (slide.blocks || []).slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    blocks.forEach(function (b) {
      var st = "position:absolute;left:" + b.x + "%;top:" + b.y + "%;width:" + b.w + "%;height:" + b.h +
        "%;z-index:" + (10 + (b.z || 0)) + ";overflow:hidden;box-sizing:border-box;";
      if (b.color) st += "color:" + b.color + ";";
      if (b.align) st += "text-align:" + b.align + ";";
      var fsCqw = b.fsCqw || FS_CLS[b.cls] || 1.7;
      st += "font-size:" + (fsCqw * refW / 100).toFixed(1) + "px;";
      var inner = "", cls = b.cls || "dck-b-body";
      var my = isMyText(blockText(b)) ? ' lang="my"' : "";
      if (b.type === "text") {
        var fw = /title|kpi/.test(cls) ? "800" : (/h2|mile/.test(cls) ? "700" : "400");
        inner = '<div' + my + ' style="font-weight:' + fw + ";line-height:" +
          (isMyText(blockText(b)) ? "1.85" : "1.35") + '">' + (b.html || "") + "</div>";
      } else if (b.type === "bullets") {
        inner = "<ul" + my + ' style="margin:0;padding-left:1.4em;line-height:' +
          (isMyText((b.items || []).join(" ")) ? "1.85" : "1.5") + '">' +
          (b.items || []).map(function (it) { return "<li>" + esc(it) + "</li>"; }).join("") + "</ul>";
      } else if (b.type === "shape") {
        st += "background:" + (b.fill || theme.accent) + ";" +
          (b.shape === "ellipse" ? "border-radius:50%;" : "border-radius:6px;");
      } else if (b.type === "image") {
        inner = b.src ? '<img src="' + b.src + '" alt="" style="width:100%;height:100%;object-fit:contain;"/>' :
          '<div style="width:100%;height:100%;border:2px dashed #9CA3AF;border-radius:6px;"></div>';
      } else if (b.type === "table") {
        inner = '<table style="width:100%;border-collapse:collapse;font-size:0.75em;">' +
          (b.rows || []).map(function (row, ri) {
            return "<tr>" + row.map(function (c) {
              var tag = ri === 0 ? "th" : "td";
              return "<" + tag + ' style="border:1px solid #9CA3AF;padding:4px 8px;' +
                (ri === 0 ? "background:" + theme.accent + ";color:#fff;" : "") + '">' +
                esc(c) + "</" + tag + ">";
            }).join("") + "</tr>";
          }).join("") + "</table>";
      } else if (b.type === "grd") {
        inner = '<div style="font-size:0.7em;opacity:0.85;"><strong>LIVE · GRD</strong><br>' +
          esc(b.label || "") + "</div><div style='font-size:0.7em'>" + (b.html || "") + "</div>";
      } else if (b.type === "chart") {
        inner = chartSvg({ chartType: b.chartType, title: b.chartTitle, labels: b.labels, values: b.values });
      } else if (b.type === "smartart") {
        inner = smartartSvg(b.diagram, b.items, theme.accent);
      }
      var morph = b.morphId ? ' data-morph-id="' + esc(b.morphId) + '"' : "";
      h += '<div class="dckx-ssb"' + morph + ' data-bid="' + esc(b.id) + '" style="' + st + '">' + inner + "</div>";
    });
    // ink overlay
    var ink = slide.ink || [];
    if (ink.length) {
      h += '<svg class="dckx-ssink" viewBox="0 0 100 100" preserveAspectRatio="none" ' +
        'style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;">';
      ink.forEach(function (st2) {
        var d = (st2.pts || []).map(function (p, k) { return (k ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2); }).join(" ");
        h += '<path d="' + d + '" fill="none" stroke="' + esc(st2.color || "#111827") +
          '" stroke-width="' + (st2.width || 0.6) + '" stroke-linecap="round" stroke-linejoin="round" ' +
          (st2.tool === "high" ? 'opacity="0.45"' : "") + ' vector-effect="non-scaling-stroke"/>';
      });
      h += "</svg>";
    }
    if (deck.slideNumbers && typeof idx === "number") {
      h += '<div class="dckx-ssnum" style="position:absolute;right:2%;bottom:2.5%;font-size:14px;opacity:0.6;z-index:60;">' + (idx + 1) + "</div>";
    }
    h += "</div>";
    return h;
  }

  /* ============================================================
     PPTX export: genuine .pptx (ZIP package, stored entries).
     Minimal writer: local headers + central directory, method 0.
     ============================================================ */
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[n] = c;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function strToBytes(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF;
    return b;
  }
  function zipStored(files) {
    // files: [{name, data:Uint8Array}]. Returns Uint8Array of the .zip.
    var enc = strToBytes;
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nameB = enc(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true); // method 0 = stored
      lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, nameB.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    });
    var cdStart = offset;
    var cdLen = 0;
    central.forEach(function (p) { cdLen += p.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdLen, true);
    end.setUint32(16, cdStart, true);
    end.setUint16(20, 0, true);
    var total = offset + cdLen + 22;
    var out = new Uint8Array(total), pos = 0;
    function push(p) { out.set(p, pos); pos += p.length; }
    parts.forEach(push); central.forEach(push); push(new Uint8Array(end.buffer));
    return out;
  }
  function pptxColor(hex) {
    var m = /^#?([0-9a-fA-F]{6})/.exec(String(hex || ""));
    return m ? m[1].toUpperCase() : "FF2E93";
  }
  function pptxTextBox(x, y, cx, cy, runs, sizePt) {
    // runs: [{t, b, i, color}]
    var r = runs.map(function (rn) {
      return "<a:r><a:rPr " + (rn.b ? 'b="1"' : "") + (rn.i ? ' i="1"' : "") +
        ' sz="' + Math.round((sizePt || 18) * 100) + '"><a:solidFill><a:srgbClr val="' +
        pptxColor(rn.color || "111827") + '"/></a:solidFill></a:rPr><a:t>' +
        escXml(rn.t) + "</a:t></a:r>";
    }).join("");
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + (pptxTextBox._id = (pptxTextBox._id || 2) + 1) +
      '" name="txt"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x +
      '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect">' +
      '<a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p>' +
      r + "</a:p></p:txBody></p:sp>";
  }
  var EMU_IN = 914400, SLD_W = Math.round(13.333 * EMU_IN), SLD_H = Math.round(7.5 * EMU_IN);
  function pptxSlideXml(deck, slide, idx) {
    var theme = themeOfDeck(deck);
    var shapes = "";
    (slide.blocks || []).forEach(function (b) {
      var x = Math.round((b.x / 100) * SLD_W), y = Math.round((b.y / 100) * SLD_H);
      var cx = Math.round((b.w / 100) * SLD_W), cy = Math.round((b.h / 100) * SLD_H);
      var runs = [];
      if (b.type === "text") {
        var t = blockText(b);
        if (t) runs = [{ t: t, color: b.color || theme.ink }];
      } else if (b.type === "bullets") {
        (b.items || []).forEach(function (it, k) {
          runs.push({ t: (k ? "\n• " : "• ") + it, color: b.color || theme.ink });
        });
      } else if (b.type === "table") {
        (b.rows || []).forEach(function (row) { runs.push({ t: row.join(" | ") + "\n", color: theme.ink }); });
      } else if (b.type === "chart") {
        runs = [{ t: (b.chartTitle || "Chart") + "\n" + (b.labels || []).map(function (l, k) {
          return l + ": " + (b.values || [])[k];
        }).join(", "), color: theme.ink }];
      } else if (b.type === "smartart") {
        runs = [{ t: smartartName(b.diagram) + "\n" + (b.items || []).map(function (it) { return it.text; }).join(" · "), color: theme.ink }];
      } else if (b.type === "grd") {
        runs = [{ t: "Live GRD: " + (b.label || ""), color: theme.ink }];
      }
      if (runs.length) shapes += pptxTextBox(x, y, cx, cy, runs, b.cls === "dck-b-title" ? 32 : 18);
    });
    // H3NZ stamp
    shapes += pptxTextBox(SLD_W - Math.round(2.2 * EMU_IN), SLD_H - Math.round(0.45 * EMU_IN),
      Math.round(2 * EMU_IN), Math.round(0.35 * EMU_IN),
      [{ t: "Developed by H3NZ", color: "888888" }], 10);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + SLD_W + '" cy="' + SLD_H +
      '"/><a:chOff x="0" y="0"/><a:chExt cx="' + SLD_W + '" cy="' + SLD_H + '"/></a:xfrm></p:grpSpPr>' +
      shapes + "</p:spTree></p:cSld>" +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }
  function buildPptx(deck) {
    pptxTextBox._id = 2;
    var n = (deck.slides || []).length;
    var files = [];
    var overrides = "";
    for (var i = 1; i <= n; i++) {
      overrides += '<Override PartName="/ppt/slides/slide' + i + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    }
    files.push({ name: "[Content_Types].xml", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      overrides + "</Types>") });
    files.push({ name: "_rels/.rels", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      "</Relationships>") });
    var slideRels = "", slideRefs = "";
    for (var s = 1; s <= n; s++) {
      slideRefs += '<p:sldId id="' + (255 + s) + '" r:id="rId' + s + '"/>';
      slideRels += '<Relationship Id="rId' + s + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + s + '.xml"/>';
    }
    files.push({ name: "ppt/presentation.xml", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      "<p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rIdM\"/></p:sldMasterIdLst>" +
      "<p:sldIdLst>" + slideRefs + "</p:sldIdLst>" +
      '<p:sldSz cx="' + SLD_W + '" cy="' + SLD_H + '" type="screen16x9"/>' +
      "<p:notesSz cx=\"6858000\" cy=\"9144000\"/></p:presentation>") });
    files.push({ name: "ppt/_rels/presentation.xml.rels", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      slideRels + "</Relationships>") });
    for (var k = 1; k <= n; k++) {
      files.push({ name: "ppt/slides/slide" + k + ".xml",
        data: strToBytes(pptxSlideXml(deck, deck.slides[k - 1], k - 1)) });
      files.push({ name: "ppt/slides/_rels/slide" + k + ".xml.rels", data: strToBytes(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        "</Relationships>") });
    }
    var layoutXml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
      '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/>' +
      '</p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + SLD_W + '" cy="' + SLD_H +
      '"/><a:chOff x="0" y="0"/><a:chExt cx="' + SLD_W + '" cy="' + SLD_H + '"/></a:xfrm></p:grpSpPr>' +
      "</p:spTree></p:cSld>" +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
    files.push({ name: "ppt/slideLayouts/slideLayout1.xml", data: strToBytes(layoutXml) });
    files.push({ name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      "</Relationships>") });
    files.push({ name: "ppt/slideMasters/slideMaster1.xml", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + SLD_W + '" cy="' + SLD_H +
      '"/><a:chOff x="0" y="0"/><a:chExt cx="' + SLD_W + '" cy="' + SLD_H + '"/></a:xfrm></p:grpSpPr>' +
      "</p:spTree></p:cSld>" +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdL"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle></p:txStyles>' +
      "</p:sldMaster>") });
    files.push({ name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
      "</Relationships>") });
    files.push({ name: "ppt/theme/theme1.xml", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NXT DCK">' +
      "<a:themeElements><a:clrScheme name=\"NXT\"><a:dk1><a:srgbClr val=\"111827\"/></a:dk1>" +
      "<a:lt1><a:srgbClr val=\"FFFFFF\"/></a:lt1><a:accent1><a:srgbClr val=\"FF2E93\"/></a:accent1>" +
      "</a:clrScheme></a:themeElements></a:theme>") });
    var now = new Date().toISOString();
    files.push({ name: "docProps/core.xml", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + escXml(deck.title || "Untitled deck") +
      "</dc:title><dc:creator>NXT DCK</dc:creator><dcterms:created xmlns:dcterms=\"http://purl.org/dc/terms/\" " +
      "xsi:type=\"dcterms:W3CDTF\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">" + now +
      "</dcterms:created></cp:coreProperties>") });
    files.push({ name: "docProps/app.xml", data: strToBytes(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      "<Application>NXT DCK</Application><Slides>" + n + "</Slides></Properties>") });
    return zipStored(files);
  }
  function downloadBytes(bytes, filename, mime) {
    var blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch (e) {}
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 4000);
  }
  function safeName(s) {
    return String(s || "deck").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "deck";
  }

  /* ============================================================
     EXPORT: HTML5 standalone player
     ============================================================ */
  function buildHtml5(deck) {
    var slides = deck.slides.map(function (s, i) { return slideHtml(deck, s, i); });
    var notes = deck.slides.map(function (s) { return s.notes || ""; });
    var trOf = deck.slides.map(function (s) { return resolveTransition(s.transition || deck.transition || "none"); });
    var dur = clamp(Number(deck.transitionDur) || 0.6, 0.25, 5) * 1000;
    var cssText =
      "html,body{margin:0;height:100%;background:#0B0D14;color:#F9FAFB;font-family:system-ui,sans-serif;overflow:hidden}" +
      "#st{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}" +
      ".sl{position:absolute;width:min(96vw,150vh);max-height:94vh;aspect-ratio:16/9}" +
      ".sl .dckx-ss{width:100%;height:100%;box-shadow:0 20px 60px rgba(0,0,0,.5)}" +
      "#bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;" +
      "padding:10px 16px;background:rgba(10,12,20,.72);backdrop-filter:blur(8px);font-size:13px}" +
      "#bar button{background:#FF2E93;border:0;color:#fff;border-radius:8px;padding:7px 14px;cursor:pointer;font-weight:700}" +
      "#bar button.ghost{background:transparent;border:1px solid #4B5563}" +
      "#stamp{margin-left:auto;opacity:.65}" +
      '[lang="my"]{line-height:1.85}';
    var js =
      "var slides=" + JSON.stringify(slides) + ";\n" +
      "var notes=" + JSON.stringify(notes) + ";\n" +
      "var trs=" + JSON.stringify(trOf) + ";\n" +
      "var DUR=" + dur + ", idx=0, st=document.getElementById('st'), cur=null;\n" +
      "function layer(html){var d=document.createElement('div');d.className='sl';d.innerHTML=html;return d;}\n" +
      "function anim(oldL,newL,tr,done){\n" +
      "  newL.style.zIndex=2;oldL&&(oldL.style.zIndex=1);\n" +
      "  function fin(){if(oldL&&oldL.parentNode)oldL.parentNode.removeChild(oldL);done&&done();}\n" +
      "  if(tr==='fade'){newL.animate([{opacity:0},{opacity:1}],{duration:DUR,fill:'forwards'}).finished.then(fin,fin);}\n" +
      "  else if(tr==='zoom'){newL.animate([{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1)'}],{duration:DUR,easing:'cubic-bezier(0.22,1,0.36,1)',fill:'forwards'}).finished.then(fin,fin);}\n" +
      "  else if(tr.indexOf('push')===0){var ax=tr==='pushL'?['100%','-100%']:tr==='pushR'?['-100%','100%']:tr==='pushU'?['0,100%','0,-100%']:['0,-100%','0,100%'];\n" +
      "    var t=function(v){return v.indexOf(',')>=0?'translateY('+v.split(',')[1]+')':'translateX('+v+')';};\n" +
      "    newL.style.transform=t(ax[0]);\n" +
      "    var p1=oldL?oldL.animate([{transform:t('0,0')},{transform:t(ax[1])}],{duration:DUR,fill:'forwards'}).finished:null;\n" +
      "    newL.animate([{transform:t(ax[0])},{transform:t('0,0')}],{duration:DUR,fill:'forwards'}).finished.then(fin,fin);}\n" +
      "  else if(tr==='wipe'){newL.style.clipPath='inset(0 100% 0 0)';newL.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)'}],{duration:DUR,fill:'forwards'}).finished.then(fin,fin);}\n" +
      "  else if(tr==='flip'){var h=Math.max(80,DUR/2);newL.style.visibility='hidden';\n" +
      "    oldL.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(-90deg)'}],{duration:h,easing:'ease-in',fill:'forwards'}).finished.then(function(){\n" +
      "      if(oldL.parentNode)oldL.parentNode.removeChild(oldL);newL.style.visibility='';\n" +
      "      newL.animate([{transform:'rotateY(90deg)'},{transform:'rotateY(0deg)'}],{duration:h,easing:'ease-out',fill:'forwards'}).finished.then(fin,fin);},fin);}\n" +
      "  else{fin();}\n" +
      "}\n" +
      "function morph(oldL,newL){\n" +
      "  if(!oldL)return;\n" +
      "  newL.querySelectorAll('[data-morph-id]').forEach(function(nEl){\n" +
      "    var id=nEl.getAttribute('data-morph-id');\n" +
      "    var oEl=oldL.querySelector('[data-morph-id=\"'+id+'\"]');\n" +
      "    if(!oEl)return;\n" +
      "    var ro=oEl.getBoundingClientRect(),rn=nEl.getBoundingClientRect();\n" +
      "    if(!ro.width||!rn.width)return;\n" +
      "    var dx=ro.left-rn.left,dy=ro.top-rn.top,sx=ro.width/rn.width,sy=ro.height/rn.height;\n" +
      "    nEl.animate([{transform:'translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')',opacity:0.2},{transform:'none',opacity:1}],{duration:DUR,easing:'cubic-bezier(0.22,1,0.36,1)'});\n" +
      "  });\n" +
      "}\n" +
      "function show(i){\n" +
      "  i=Math.max(0,Math.min(slides.length-1,i));\n" +
      "  var nL=layer(slides[i]),oL=cur;\n" +
      "  st.appendChild(nL);morph(oL,nL);anim(oL,nL,trs[i]||'none',function(){});\n" +
      "  cur=nL;idx=i;\n" +
      "  document.getElementById('count').textContent=(i+1)+' / '+slides.length;\n" +
      "}\n" +
      "document.getElementById('prev').onclick=function(){show(idx-1);};\n" +
      "document.getElementById('next').onclick=function(){show(idx+1);};\n" +
      "document.addEventListener('keydown',function(e){\n" +
      "  if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();show(idx+1);}\n" +
      "  else if(e.key==='ArrowLeft'){e.preventDefault();show(idx-1);}\n" +
      "  else if(e.key==='Home'){show(0);}else if(e.key==='End'){show(slides.length-1);}\n" +
      "});\n" +
      "st.addEventListener('click',function(e){if(e.target===st)show(idx+1);});\n" +
      "show(0);\n";
    var doc = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>" + esc(deck.title || "Deck") + " · NXT DCK</title><style>" + cssText + "</style></head><body>" +
      "<div id=\"st\"></div>" +
      "<div id=\"bar\"><button id=\"prev\">Prev</button><button id=\"next\">Next</button>" +
      "<span id=\"count\"></span><span id=\"stamp\">Developed by H3NZ</span></div>" +
      "<script>" + js + "<\/script></body></html>";
    return doc;
  }
  function exportHtml5() {
    var deck = D.currentDeck();
    if (!deck || !deck.slides.length) { toast("Open a deck with slides first.", "error"); return; }
    downloadBytes(strToBytes(buildHtml5(deck)), safeName(deck.title) + "-player.html", "text/html");
    toast("HTML5 player downloaded.");
  }
  /* Promise-based single-slide PNG raster, for the unified Export/Share dialog. */
  function renderSlidePngBlob(deck, s, i) {
    return new Promise(function (resolve, reject) {
      try {
        var r = slideSvgForPng(deck, s, i);
        var url = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml;charset=utf-8" }));
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement("canvas");
            c.width = r.W; c.height = r.H;
            c.getContext("2d").drawImage(img, 0, 0, r.W, r.H);
            URL.revokeObjectURL(url);
            if (c.toBlob) c.toBlob(function (b) { b ? resolve(b) : reject(new Error("raster failed")); }, "image/png");
            else reject(new Error("toBlob missing"));
          } catch (e) { try { URL.revokeObjectURL(url); } catch (_) {} reject(e); }
        };
        img.onerror = function () { try { URL.revokeObjectURL(url); } catch (_) {} reject(new Error("svg load failed")); };
        img.src = url;
      } catch (e) { reject(e); }
    });
  }

  /* ============================================================
     EXPORT: PDF handout via print (honest: uses the print pipeline)
     ============================================================ */
  function exportPrint() {
    var deck = D.currentDeck();
    if (!deck || !deck.slides.length) { toast("Open a deck with slides first.", "error"); return; }
    var old = $("dckx-print");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var root = el("div", "");
    root.id = "dckx-print";
    root.appendChild(el("h1", "dckx-print-title", deck.title || "Untitled deck"));
    deck.slides.forEach(function (s, i) {
      var page = el("div", "dckx-print-page");
      var wrap = el("div", "dckx-print-slide");
      wrap.innerHTML = slideHtml(deck, s, i);
      page.appendChild(wrap);
      var cap = el("div", "dckx-print-cap", "Slide " + (i + 1) + " of " + deck.slides.length);
      page.appendChild(cap);
      if (s.notes) page.appendChild(el("div", "dckx-print-notes", "Notes: " + s.notes));
      var lines = el("div", "dckx-print-lines");
      for (var l = 0; l < 4; l++) lines.appendChild(el("div", "dckx-print-line"));
      page.appendChild(lines);
      page.appendChild(el("div", "dckx-print-stamp", "Developed by H3NZ"));
      root.appendChild(page);
    });
    document.body.appendChild(root);
    toast("Print dialog opened. Choose Save as PDF for the handout.");
    setTimeout(function () { window.print(); }, 60);
  }

  /* ============================================================
     EXPORT: PNG bundle (each slide via SVG foreignObject to canvas)
     ============================================================ */
  function slideSvgForPng(deck, slide, idx) {
    // native SVG (no foreignObject): canvas-safe, no taint
    return slideSvgNative(deck, slide, idx);
  }
  function exportPng() {
    var deck = D.currentDeck();
    if (!deck || !deck.slides.length) { toast("Open a deck with slides first.", "error"); return; }
    if (typeof Image === "undefined" || !document.createElement("canvas").getContext) {
      toast("PNG export needs canvas support.", "error"); return;
    }
    toast("Rendering " + deck.slides.length + " PNGs. Downloads start shortly.");
    deck.slides.forEach(function (s, i) {
      setTimeout(function () {
        try {
          var r = slideSvgForPng(deck, s, i);
          var url = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml;charset=utf-8" }));
          var img = new Image();
          img.onload = function () {
            try {
              var c = document.createElement("canvas");
              c.width = r.W; c.height = r.H;
              c.getContext("2d").drawImage(img, 0, 0, r.W, r.H);
              URL.revokeObjectURL(url);
              if (c.toBlob) {
                c.toBlob(function (blob) {
                  if (!blob) { toast("PNG render failed for slide " + (i + 1) + ".", "error"); return; }
                  var a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = safeName(deck.title) + "-slide-" + (i + 1) + ".png";
                  document.body.appendChild(a); a.click();
                  setTimeout(function () {
                    try { URL.revokeObjectURL(a.href); } catch (e) {}
                    if (a.parentNode) a.parentNode.removeChild(a);
                  }, 4000);
                }, "image/png");
              }
            } catch (e) { toast("PNG render failed for slide " + (i + 1) + ".", "error"); }
          };
          img.onerror = function () { toast("PNG render failed for slide " + (i + 1) + ".", "error"); };
          img.src = url;
        } catch (e) { toast("PNG render failed for slide " + (i + 1) + ".", "error"); }
      }, i * 700);
    });
  }

  /* ============================================================
     EXPORT: PPTX download
     ============================================================ */
  function exportPptx() {
    var deck = D.currentDeck();
    if (!deck || !deck.slides.length) { toast("Open a deck with slides first.", "error"); return; }
    try {
      var bytes = buildPptx(deck);
      downloadBytes(bytes, safeName(deck.title) + ".pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      toast("PPTX downloaded (" + deck.slides.length + " slides).");
    } catch (e) {
      toast("PPTX export failed: " + (e && e.message), "error");
    }
  }

  /* ============================================================
     stage decoration: ink overlay + slide numbers + master vars
     (called from dck.js renderStage via the decorateStage hook)
     ============================================================ */
  function inkSvg(slide, interactive) {
    var ink = slide.ink || [];
    if (!ink.length && !interactive) return null;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "dckx-ink");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    ink.forEach(function (st) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      var d = (st.pts || []).map(function (pt, k) {
        return (k ? "L" : "M") + pt[0].toFixed(2) + " " + pt[1].toFixed(2);
      }).join(" ");
      p.setAttribute("d", d || "M0 0");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", st.color || "#111827");
      p.setAttribute("stroke-width", String(st.width || 0.6));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("vector-effect", "non-scaling-stroke");
      if (st.tool === "high") p.setAttribute("opacity", "0.45");
      svg.appendChild(p);
    });
    return svg;
  }
  function decorateStage(stage, deck, slide, mode) {
    if (!stage || !deck || !slide) return;
    // slide master cascade via CSS vars
    var m = deck.master;
    if (m) {
      stage.dataset.master = "1";
      if (m.titleColor) stage.style.setProperty("--mTitleC", m.titleColor);
      if (m.titleSize) stage.style.setProperty("--mTitleS", m.titleSize + "cqw");
      if (m.bodyColor) stage.style.setProperty("--mBodyC", m.bodyColor);
      if (m.bodySize) stage.style.setProperty("--mBodyS", m.bodySize + "cqw");
      if (m.accent) stage.style.setProperty("--dck-accent", m.accent);
    } else {
      delete stage.dataset.master;
    }
    // ink overlay
    var old = stage.querySelector(":scope > .dckx-ink");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (mode === "stage") {
      var svg = inkSvg(slide, drawTool !== null);
      if (svg) {
        svg.id = "dckx-ink";
        svg.style.pointerEvents = drawTool ? "auto" : "none";
        svg.style.cursor = drawTool ? "crosshair" : "default";
        if (drawTool) bindInkDraw(svg, slide);
        stage.appendChild(svg);
      }
    } else if ((slide.ink || []).length) {
      var s2 = inkSvg(slide, false);
      if (s2) { s2.style.pointerEvents = "none"; stage.appendChild(s2); }
    }
    // slide numbers
    var num = stage.querySelector(":scope > .dckx-slidenum");
    if (num && num.parentNode) num.parentNode.removeChild(num);
    if (deck.slideNumbers) {
      var nn = el("div", "dckx-slidenum", String(D.curSlideIndex() + 1));
      stage.appendChild(nn);
    }
  }

  /* ============================================================
     block animations: entrance / exit playback with WAAPI
     ============================================================ */
  var ANIM_E = {
    appear: { name: "Appear" },
    fadein: { name: "Fade In" },
    flyL: { name: "Fly In Left" }, flyR: { name: "Fly In Right" },
    flyU: { name: "Fly In Up" }, flyD: { name: "Fly In Down" },
    zoomin: { name: "Zoom In" }
  };
  var ANIM_X = {
    disappear: { name: "Disappear" },
    fadeout: { name: "Fade Out" }
  };
  function entranceKf(type) {
    switch (type) {
      case "fadein": return [{ opacity: "0" }, { opacity: "1" }];
      case "flyL": return [{ opacity: "0", transform: "translateX(-40px)" }, { opacity: "1", transform: "translateX(0)" }];
      case "flyR": return [{ opacity: "0", transform: "translateX(40px)" }, { opacity: "1", transform: "translateX(0)" }];
      case "flyU": return [{ opacity: "0", transform: "translateY(-40px)" }, { opacity: "1", transform: "translateY(0)" }];
      case "flyD": return [{ opacity: "0", transform: "translateY(40px)" }, { opacity: "1", transform: "translateY(0)" }];
      case "zoomin": return [{ opacity: "0", transform: "scale(0.5)" }, { opacity: "1", transform: "scale(1)" }];
      default: return null;
    }
  }
  function exitKf(type) {
    switch (type) {
      case "fadeout": return [{ opacity: "1" }, { opacity: "0" }];
      default: return null;
    }
  }
  function animSeq(slide) {
    var seq = (slide.animSeq || []).filter(function (id) {
      return (slide.blocks || []).some(function (b) { return b.id === id && (b.animE || b.animX); });
    });
    (slide.blocks || []).forEach(function (b) {
      if ((b.animE || b.animX) && seq.indexOf(b.id) < 0) seq.push(b.id);
    });
    return seq;
  }
  function blockById(slide, id) {
    var out = null;
    (slide.blocks || []).forEach(function (b) { if (b.id === id) out = b; });
    return out;
  }
  function playEntrance(container, slide) {
    var seq = animSeq(slide);
    seq.forEach(function (id) {
      var b = blockById(slide, id);
      if (!b || !b.animE) return;
      var node = container.querySelector('[data-bid="' + b.id + '"]');
      if (!node) return;
      var kf = entranceKf(b.animE.type);
      var dur = clamp(Number(b.animE.dur) || 0.5, 0.1, 10) * 1000;
      var delay = clamp(Number(b.animE.delay) || 0, 0, 10) * 1000;
      if (!kf) { node.style.opacity = "1"; return; }
      waapi(node, kf, { duration: dur, delay: delay, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" }, null);
    });
  }
  function playSlideExit(stage, slide, done) {
    var seq = animSeq(slide).reverse();
    var jobs = [];
    seq.forEach(function (id) {
      var b = blockById(slide, id);
      if (!b || !b.animX) return;
      var node = stage ? stage.querySelector('[data-bid="' + b.id + '"]') : null;
      jobs.push({ b: b, node: node });
    });
    if (!jobs.length) { done(); return; }
    var maxMs = 0, finished = 0;
    jobs.forEach(function (j) {
      var dur = clamp(Number(j.b.animX.dur) || 0.4, 0.1, 10) * 1000;
      var delay = clamp(Number(j.b.animX.delay) || 0, 0, 10) * 1000;
      maxMs = Math.max(maxMs, dur + delay);
      if (!j.node) { jobDone(); return; }
      if (j.b.animX.type === "disappear") {
        setTimeout(function () { j.node.style.visibility = "hidden"; jobDone(); }, delay);
        return;
      }
      var kf = exitKf(j.b.animX.type);
      if (!kf) { jobDone(); return; }
      waapi(j.node, kf, { duration: dur, delay: delay, easing: "ease", fill: "forwards" }, jobDone);
    });
    function jobDone() {
      finished++;
      if (finished >= jobs.length) done();
    }
    // safety: never trap navigation longer than the longest animation + 400ms
    setTimeout(function () { if (finished < jobs.length) { finished = jobs.length; done(); } }, maxMs + 400);
  }

  /* ============================================================
     TRUE MORPH: FLIP interpolation for [data-morph-id] pairs
     ============================================================ */
  function morphFlip(oldLayer, newLayer, durMs) {
    if (!oldLayer || !newLayer) return;
    var news = newLayer.querySelectorAll("[data-morph-id]");
    Array.prototype.forEach.call(news, function (nEl) {
      var id = nEl.getAttribute("data-morph-id");
      var oEl = oldLayer.querySelector('[data-morph-id="' + id + '"]');
      if (!oEl) return;
      var ro, rn;
      try {
        ro = oEl.getBoundingClientRect(); rn = nEl.getBoundingClientRect();
      } catch (e) { return; }
      if (!ro.width || !rn.width) return;
      var dx = ro.left - rn.left, dy = ro.top - rn.top;
      var sx = ro.width / rn.width, sy = ro.height / rn.height;
      var rot = 0;
      var orot = oEl.getAttribute("data-morph-rot"), nrot = nEl.getAttribute("data-morph-rot");
      if (orot != null && nrot != null) rot = parseFloat(orot) || 0;
      function tf(t) {
        var m = morphInterp({ x: dx, y: dy, w: sx, h: sy, rot: rot, op: 0.25 },
          { x: 0, y: 0, w: 1, h: 1, rot: 0, op: 1 }, t);
        return "translate(" + m.x + "px," + m.y + "px) scale(" + m.w + "," + m.h + ")" +
          (m.rot ? " rotate(" + m.rot + "deg)" : "");
      }
      try {
        if (typeof nEl.animate === "function") {
          nEl.animate([
            { transform: tf(0), opacity: "0.25" },
            { transform: tf(1), opacity: "1" }
          ], { duration: durMs, easing: "cubic-bezier(0.22,1,0.36,1)" });
        }
      } catch (e) { /* morph is progressive enhancement */ }
    });
  }

  /* ============================================================
     presentRender: engine-driven slide change in presenter mode.
     Returns true (handled). Builds layered content with the 12
     transitions, morph FLIP, entrance animations, ink, slide numbers.
     ============================================================ */
  function newSlideLayer(deck, slide, idx) {
    // fixed reference box (1280 wide) scaled to fit: keeps type, ink and
    // SmartArt pixel-faithful at any present size
    var ap = aspectPair(deck);
    var W = 1280, H = Math.round(1280 * ap[1] / ap[0]);
    var layer = el("div", "dck-pr-new");
    var box = el("div", "dck-pr-box");
    box.style.width = W + "px";
    box.style.height = H + "px";
    box.innerHTML = slideHtml(deck, slide, idx);
    layer.appendChild(box);
    layer._fit = function (stage) {
      var sw = stage.clientWidth || W, sh = stage.clientHeight || H;
      var k = Math.min(sw / W, sh / H);
      box.style.transform = "scale(" + k + ")";
      box.style.transformOrigin = "center center";
    };
    return layer;
  }
  function presentRender(stage, deck, slide, prevIdx, idx) {
    var newL = newSlideLayer(deck, slide, idx);
    var oldL = stage.querySelector(":scope > .dck-pr-cur, :scope > .dck-pr-new");
    var trId = resolveTransition(
      (prevIdx == null) ? "none" : (slide.transition || deck.transition || "none"));
    var dur = clamp(Number(deck.transitionDur) || 0.6, 0.25, 5) * 1000;
    stage.appendChild(newL);
    newL._fit(stage);
    if (!oldL || trId === "none") {
      if (oldL && oldL.parentNode) oldL.parentNode.removeChild(oldL);
      newL.className = "dck-pr-cur";
      prepLayer(newL, true);
      playEntrance(newL, slide);
      return true;
    }
    prepLayer(oldL, false);
    morphFlip(oldL, newL, dur);
    var entry = TRANSITIONS[trId] || TRANSITIONS.none;
    entry.apply(oldL, newL, dur, function () {
      newL.className = "dck-pr-cur";
      prepLayer(newL, true);
      playEntrance(newL, slide);
    });
    return true;
  }

  /* ============================================================
     engine block rendering (called from dck.js blockEl for
     engine-owned types: chart, smartart)
     ============================================================ */
  function renderBlock(b, deck, mode, n) {
    var theme = themeOfDeck(deck);
    if (b.type === "chart") {
      n.innerHTML = chartSvg({
        chartType: b.chartType || "bar", title: b.chartTitle || "",
        labels: b.labels || [], values: b.values || []
      });
      return true;
    }
    if (b.type === "smartart") {
      n.innerHTML = smartartSvg(b.diagram || "chevron", b.items || [], theme.accent);
      return true;
    }
    return false;
  }

  /* ============================================================
     RIBBON state
     ============================================================ */
  var drawTool = null;      // null | 'pen' | 'high' | 'eraser'
  var inkColor = "#FF2E93", inkWidth = 0.7;
  var ribbonTab = "home";
  var viewMode = "normal";  // normal | sorter | notes | master
  var sorterSel = {};
  var ribbonBuilt = false;

  function selBlock() {
    var id = D.selectedBlockId();
    if (!id) return null;
    var s = D.currentSlide();
    return s ? blockById(s, id) : null;
  }
  function needBlock() {
    var b = selBlock();
    if (!b) toast("Select a block on the slide first.");
    return b;
  }
  function needTextBlock() {
    var b = selBlock();
    if (!b || (b.type !== "text" && b.type !== "bullets")) {
      toast("Select a text block first.");
      return null;
    }
    return b;
  }

  /* ---------- ribbon skeleton ---------- */
  function rGroup(panel, label) {
    var g = el("div", "dckr-group");
    var body = el("div", "dckr-body");
    g.appendChild(body);
    g.appendChild(el("div", "dckr-label", label));
    panel.appendChild(g);
    return body;
  }
  function rBtn(body, id, label, ic, fn, opts) {
    var b = el("button", "dckr-btn" + (opts && opts.small ? " sm" : ""));
    b.id = id;
    b.type = "button";
    if (ic) {
      var sp = el("span", "dckr-ic");
      sp.innerHTML = icon(ic);
      b.appendChild(sp);
    }
    b.appendChild(el("span", "dckr-lab", label));
    if (opts && opts.title) b.title = opts.title;
    b.addEventListener("click", function (e) { e.stopPropagation(); fn(b); });
    if (opts && opts.keepFocus) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
    }
    body.appendChild(b);
    return b;
  }
  function rCtl(body, node) { body.appendChild(node); return node; }

  function buildRibbon() {
    if (ribbonBuilt) return;
    var ed = $("dck-editor");
    if (!ed) return;
    ribbonBuilt = true;
    var rib = el("div", "");
    rib.id = "dck-ribbon";
    var tabs = el("div", "dckr-tabs");
    tabs.id = "dckr-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "DCK ribbon tabs");
    var panels = el("div", "dckr-panels");
    panels.id = "dckr-panels";
    rib.appendChild(tabs); rib.appendChild(panels);
    var tb = $("dck-toolbar");
    if (tb && tb.parentNode) tb.parentNode.insertBefore(rib, tb.nextSibling);
    else ed.insertBefore(rib, ed.firstChild);
    // keep the hidden image file input alive (image upload target)
    var fi = $("dck-file");
    if (fi) rib.appendChild(fi);

    TABS.forEach(function (t) {
      var tbBtn = el("button", "dckr-tab");
      tbBtn.id = "dckr-tab-" + t.id;
      tbBtn.type = "button";
      tbBtn.textContent = t.name;
      tbBtn.setAttribute("role", "tab");
      tbBtn.setAttribute("aria-selected", "false");
      (function (tid) {
        tbBtn.addEventListener("click", function () { setRibbonTab(tid); });
      })(t.id);
      tabs.appendChild(tbBtn);
      var panel = el("div", "dckr-panel");
      panel.id = "dckr-panel-" + t.id;
      panel.setAttribute("role", "tabpanel");
      panel.style.display = "none";
      t.build(panel);
      panels.appendChild(panel);
    });
    setRibbonTab("home");
    // F5 / Shift+F5 slideshow shortcuts inside the editor
    ed.addEventListener("keydown", function (e) {
      if (e.key === "F5") {
        e.preventDefault();
        if (e.shiftKey) presentFromCurrent(); else presentFromStart();
      }
    });
  }
  function setRibbonTab(id) {
    ribbonTab = id;
    Array.prototype.forEach.call(document.querySelectorAll("#dckr-tabs .dckr-tab"), function (t) {
      var on = t.id === "dckr-tab-" + id;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("#dckr-panels .dckr-panel"), function (p) {
      p.style.display = p.id === "dckr-panel-" + id ? "" : "none";
    });
    refreshRibbon();
  }
  function markActive(id, on) {
    var b = $(id);
    if (b) b.classList.toggle("active", !!on);
  }

  /* ---------- popups ---------- */
  function closePopups() {
    var p = $("dckx-pop");
    if (p && p.parentNode) p.parentNode.removeChild(p);
    document.removeEventListener("pointerdown", onDocPop, true);
  }
  function onDocPop(e) {
    var p = $("dckx-pop");
    if (p && !p.contains(e.target)) closePopups();
  }
  function openPopup(anchor, buildFn) {
    closePopups();
    var rib = $("dck-ribbon");
    if (!rib || !anchor) return;
    var p = el("div", "dckx-pop");
    p.id = "dckx-pop";
    p.setAttribute("role", "dialog");
    buildFn(p);
    rib.appendChild(p);
    var rr = rib.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    p.style.left = clamp(ar.left - rr.left, 8, Math.max(8, rr.width - 320)) + "px";
    p.style.top = (ar.bottom - rr.top + 6) + "px";
    setTimeout(function () { document.addEventListener("pointerdown", onDocPop, true); }, 10);
  }
  function popupTitle(p, t) { p.appendChild(el("div", "dckx-pop-t", t)); }
  function popupGrid(p, items, onPick) {
    var g = el("div", "dckx-pop-grid");
    items.forEach(function (it) {
      var b = el("button", "dckx-pop-item");
      b.type = "button";
      b.appendChild(el("strong", null, it.name));
      if (it.hint) b.appendChild(el("span", null, it.hint));
      (function (item) {
        b.addEventListener("click", function () { closePopups(); onPick(item); });
      })(it);
      g.appendChild(b);
    });
    p.appendChild(g);
  }

  /* ---------- tab builders ---------- */
  var TABS = [
    { id: "home", name: "Home", build: buildHomeTab },
    { id: "insert", name: "Insert", build: buildInsertTab },
    { id: "draw", name: "Draw", build: buildDrawTab },
    { id: "design", name: "Design", build: buildDesignTab },
    { id: "transitions", name: "Transitions", build: buildTransitionsTab },
    { id: "animations", name: "Animations", build: buildAnimationsTab },
    { id: "slideshow", name: "Slide Show", build: buildSlideshowTab },
    { id: "view", name: "View", build: buildViewTab }
  ];

  function buildHomeTab(panel) {
    var g = rGroup(panel, "Slides");
    rBtn(g, "dckr-newslide", "New Slide", "i-plus", function (b) {
      openPopup(b, function (p) {
        popupTitle(p, "Choose a layout");
        var items = Object.keys(D.layouts).map(function (k) {
          return { id: k, name: D.layouts[k].name, hint: D.layouts[k].hint };
        });
        popupGrid(p, items, function (it) { D.addSlide(it.id); refreshRibbon(); });
      });
    }, { title: "Insert a new slide with a layout" });
    rBtn(g, "dckr-duplicate", "Duplicate", "i-copy", function () { D.duplicateSlide(); refreshRibbon(); });
    rBtn(g, "dckr-delslide", "Delete", "i-trash", function () { D.deleteSlide(); refreshRibbon(); });

    g = rGroup(panel, "Text");
    rBtn(g, "dckr-bold", "Bold", "i-bold", function () { fmtExec("bold"); }, { keepFocus: true, small: true });
    rBtn(g, "dckr-italic", "Italic", "i-italic", function () { fmtExec("italic"); }, { keepFocus: true, small: true });
    rBtn(g, "dckr-uline", "Underline", "i-underline", function () { fmtExec("underline"); }, { keepFocus: true, small: true });
    rBtn(g, "dckr-fminus", "A-", "", function () { fontSizeStep(-1); }, { small: true, title: "Decrease font size" });
    rBtn(g, "dckr-fplus", "A+", "", function () { fontSizeStep(1); }, { small: true, title: "Increase font size" });
    rBtn(g, "dckr-al", "Left", "i-align-l", function () { setAlign("left"); }, { keepFocus: true, small: true });
    rBtn(g, "dckr-ac", "Center", "i-align-c", function () { setAlign("center"); }, { keepFocus: true, small: true });
    rBtn(g, "dckr-ar", "Right", "i-align-r", function () { setAlign("right"); }, { keepFocus: true, small: true });
    rBtn(g, "dckr-aj", "Justify", "i-align-j", function () { setAlign("justify"); }, { keepFocus: true, small: true });

    g = rGroup(panel, "Arrange");
    rBtn(g, "dckr-fwd", "Forward", "", function () { zShift(1); }, { small: true, title: "Bring forward" });
    rBtn(g, "dckr-bwd", "Backward", "", function () { zShift(-1); }, { small: true, title: "Send backward" });
    rBtn(g, "dckr-front", "To Front", "", function () { zExtreme("front"); }, { small: true });
    rBtn(g, "dckr-back", "To Back", "", function () { zExtreme("back"); }, { small: true });
    rBtn(g, "dckr-delblock", "Delete", "i-trash", function () { D.deleteBlock(); refreshRibbon(); });
  }
  function fmtExec(cmd) {
    var b = needTextBlock();
    if (!b) return;
    try {
      if (typeof document.execCommand === "function") document.execCommand(cmd, false, null);
    } catch (e) { /* older engines */ }
  }
  function fontSizeStep(dir) {
    var b = needTextBlock();
    if (!b) return;
    var cur = b.fsCqw || FS_CLS[b.cls] || 1.7;
    var next = Math.round(clamp(cur + dir * 0.3, 0.6, 12) * 10) / 10;
    var id = b.id;
    D.withBlock(id, function (bb) { bb.fsCqw = next; });
    D.render();
  }
  function setAlign(a) {
    var b = needTextBlock();
    if (!b) return;
    var id = b.id;
    D.withBlock(id, function (bb) { bb.align = a; });
    D.render();
  }
  function zShift(dir) {
    var b = needBlock();
    if (!b) return;
    var id = b.id;
    D.withBlock(id, function (bb) { bb.z = (bb.z || 0) + dir; });
    D.render();
  }
  function zExtreme(which) {
    var b = needBlock();
    if (!b) return;
    var s = D.currentSlide(), id = b.id, zs = (s.blocks || []).map(function (x) { return x.z || 0; });
    var target = which === "front" ? Math.max.apply(null, zs.concat([0])) + 1
      : Math.min.apply(null, zs.concat([0])) - 1;
    D.withBlock(id, function (bb) { bb.z = target; });
    D.render();
  }

  function buildInsertTab(panel) {
    var g = rGroup(panel, "Blocks");
    rBtn(g, "dckr-ins-text", "Text", "i-text", function () { D.insertBlock("text"); });
    rBtn(g, "dckr-ins-bullets", "Bullets", "i-bullets", function () { D.insertBlock("bullets"); });
    rBtn(g, "dckr-ins-table", "Table", "i-table", function () {
      D.insertBlock("table", { rows: [["Header 1", "Header 2", "Header 3"], ["", "", ""], ["", "", ""]] });
    });
    rBtn(g, "dckr-ins-rect", "Rectangle", "", function () { D.insertBlock("shape", { shape: "rect" }); }, { small: true });
    rBtn(g, "dckr-ins-ellipse", "Ellipse", "", function () { D.insertBlock("shape", { shape: "ellipse" }); }, { small: true });
    rBtn(g, "dckr-ins-pic", "Picture", "i-image", function () {
      var fi = $("dck-file");
      if (fi) fi.click();
      else toast("Image upload is not ready.", "error");
    });
    rBtn(g, "dckr-ins-chart", "Chart", "i-chart", function (b) {
      openPopup(b, function (p) {
        popupTitle(p, "Chart type");
        popupGrid(p, [
          { id: "bar", name: "Bar", hint: "Compare values" },
          { id: "line", name: "Line", hint: "Show a trend" },
          { id: "pie", name: "Pie", hint: "Show shares" }
        ], function (it) {
          D.insertBlock("chart", {
            chartType: it.id, chartTitle: "Chart title",
            labels: ["A", "B", "C", "D"], values: [12, 19, 7, 14]
          });
          refreshRibbon();
        });
      });
    });
    rBtn(g, "dckr-ins-sa", "SmartArt", "i-grid", function (b) {
      openPopup(b, function (p) {
        popupTitle(p, "SmartArt diagram");
        popupGrid(p, SMARTARTS.map(function (s) { return { id: s.id, name: s.name }; }), function (it) {
          D.insertBlock("smartart", {
            diagram: it.id,
            items: [{ text: "First" }, { text: "Second" }, { text: "Third" }]
          });
          refreshRibbon();
        });
      });
    });
    rBtn(g, "dckr-ins-num", "Slide #", "", function () {
      D.mutateDeck(function (d) { d.slideNumbers = !d.slideNumbers; });
      toast("Slide numbers " + (D.currentDeck().slideNumbers ? "on." : "off."));
      refreshRibbon();
    }, { title: "Toggle slide numbers" });

    g = rGroup(panel, "Picture Tools");
    var rbg = rBtn(g, "dckr-rmbg", "Remove BG", "i-eraser", removeBackground,
      { title: "Remove Background, basic (heuristic): flood-fills transparent from the image corners" });
    rbg.appendChild(el("span", "dckr-sub", "basic (heuristic)"));

    g = rGroup(panel, "Document");
    rBtn(g, "dckr-compile", "Compile from TXT", "i-file", function () {
      D.generateFromDocument();
      refreshRibbon();
    }, { title: "Build a deck from the current TXT document" });

    // contextual editors (visible when a chart / smartart block is selected)
    var ce = el("div", "dckr-context");
    ce.id = "dckx-chartedit";
    ce.style.display = "none";
    panel.appendChild(ce);
    var se = el("div", "dckr-context");
    se.id = "dckx-saedit";
    se.style.display = "none";
    panel.appendChild(se);
  }

  function buildDrawTab(panel) {
    var g = rGroup(panel, "Ink");
    rBtn(g, "dckr-pen", "Pen", "i-pen", function () { setDrawTool("pen"); });
    rBtn(g, "dckr-high", "Highlighter", "i-highlighter", function () { setDrawTool("high"); });
    rBtn(g, "dckr-eraser", "Eraser", "i-eraser", function () { setDrawTool("eraser"); });
    rBtn(g, "dckr-clearink", "Clear Ink", "i-trash", function () {
      D.withCurrentSlide(function (s) { s.ink = []; });
      D.render();
      toast("Ink cleared.");
    });
    g = rGroup(panel, "Pen Style");
    var col = document.createElement("input");
    col.type = "color"; col.id = "dckr-inkcolor"; col.value = inkColor;
    col.setAttribute("aria-label", "Ink color");
    col.addEventListener("input", function () { inkColor = col.value; });
    var cw = el("label", "dckr-lab2", "Color");
    cw.appendChild(col);
    rCtl(g, cw);
    var rng = document.createElement("input");
    rng.type = "range"; rng.id = "dckr-inkwidth";
    rng.min = "0.3"; rng.max = "2.5"; rng.step = "0.1"; rng.value = String(inkWidth);
    rng.setAttribute("aria-label", "Ink width");
    rng.addEventListener("input", function () { inkWidth = parseFloat(rng.value) || 0.7; });
    var rw = el("label", "dckr-lab2", "Width");
    rw.appendChild(rng);
    rCtl(g, rw);
    var hint = el("div", "dckr-hint",
      "Pick a tool, then draw on the slide. Ink is stored per slide and shows in present mode and exports.");
    rCtl(rGroup(panel, "About"), hint);
  }
  function setDrawTool(t) {
    drawTool = (drawTool === t) ? null : t;
    D.render();
    if (drawTool) toast("Draw tool: " + t + ". Draw on the slide, click again to stop.");
    refreshRibbon();
  }

  function buildDesignTab(panel) {
    var g = rGroup(panel, "Themes");
    var sw = el("div", "dckr-swatches");
    (D.themes || []).forEach(function (t) {
      var b = el("button", "dckr-swatch");
      b.id = "dckr-theme-" + t.id;
      b.type = "button";
      b.title = t.name;
      b.setAttribute("aria-label", "Apply theme: " + t.name);
      b.style.background = "linear-gradient(135deg," + t.bg + " 50%," + t.bg2 + " 50%)";
      b.style.borderColor = t.accent;
      (function (tid, tname) {
        b.addEventListener("click", function () {
          D.mutateDeck(function (d) { d.theme = tid; });
          toast("Theme: " + tname + ".");
          refreshRibbon();
        });
      })(t.id, t.name);
      sw.appendChild(b);
    });
    g.appendChild(sw);

    g = rGroup(panel, "Slide Size");
    [["16:9", "16:9"], ["4:3", "4:3"], ["9:16", "9:16"]].forEach(function (a) {
      rBtn(g, "dckr-aspect-" + a[0].replace(":", ""), a[1], "", function () {
        D.mutateDeck(function (d) { d.aspect = a[0]; });
        toast("Slide size: " + a[0] + ".");
        refreshRibbon();
      }, { small: true });
    });

    g = rGroup(panel, "Background");
    var bgc = document.createElement("input");
    bgc.type = "color"; bgc.id = "dckr-bgcolor"; bgc.value = "#ffffff";
    bgc.setAttribute("aria-label", "Custom solid background");
    bgc.addEventListener("input", function () {
      D.mutateDeck(function (d) { d.bgSolid = bgc.value; d.gradient = "none"; });
    });
    var bw = el("label", "dckr-lab2", "Solid");
    bw.appendChild(bgc);
    rCtl(g, bw);
    rBtn(g, "dckr-bgclear", "Reset BG", "", function () {
      D.mutateDeck(function (d) { d.bgSolid = null; });
      toast("Background reset to theme.");
    }, { small: true });
  }

  function buildTransitionsTab(panel) {
    var g = rGroup(panel, "Transition");
    TRANSITION_IDS.forEach(function (id) {
      rBtn(g, "dckr-tr-" + id, TRANSITIONS[id].name, "", function () {
        D.withCurrentSlide(function (s) { s.transition = id; });
        toast("Transition: " + TRANSITIONS[id].name + ".");
        refreshRibbon();
      }, { small: true, title: "Apply to this slide" });
    });
    g = rGroup(panel, "Timing");
    var rng = document.createElement("input");
    rng.type = "range"; rng.id = "dckr-trdur";
    rng.min = "0.25"; rng.max = "5"; rng.step = "0.25"; rng.value = "0.6";
    rng.setAttribute("aria-label", "Transition duration in seconds");
    var durLab = el("span", "dckr-val", "0.60s");
    rng.addEventListener("input", function () {
      var v = parseFloat(rng.value) || 0.6;
      durLab.textContent = v.toFixed(2) + "s";
      D.mutateDeck(function (d) { d.transitionDur = v; });
    });
    var dw = el("label", "dckr-lab2", "Duration");
    dw.appendChild(rng); dw.appendChild(durLab);
    rCtl(g, dw);
    rBtn(g, "dckr-trprev", "Preview", "i-eye", previewTransition);
    rBtn(g, "dckr-trall", "Apply to All", "", function () {
      var s = D.currentSlide();
      var tid = s ? (s.transition || "none") : "none";
      D.mutateDeck(function (d) {
        d.transition = tid;
        (d.slides || []).forEach(function (x) { x.transition = tid; });
      });
      toast("Transition applied to all slides.");
      refreshRibbon();
    });
    var mh = el("div", "dckr-hint",
      "Blocks with the same morph ID on consecutive slides glide between positions during the transition. Set a morph ID in the Animations pane.");
    rCtl(rGroup(panel, "Morph"), mh);
  }
  function previewTransition() {
    var stage = $("dck-stage"), deck = D.currentDeck(), s = D.currentSlide();
    if (!stage || !deck || !s) { toast("Open a deck first.", "error"); return; }
    var oldL = el("div", "dck-pr-cur");
    oldL.innerHTML = stage.innerHTML;
    prepLayer(oldL, false);
    var newL = newSlideLayer(deck, s, D.curSlideIndex());
    stage.appendChild(oldL);
    stage.appendChild(newL);
    newL._fit(stage);
    var trId = resolveTransition(s.transition || deck.transition || "fade");
    var dur = clamp(Number(deck.transitionDur) || 0.6, 0.25, 5) * 1000;
    morphFlip(oldL, newL, dur);
    (TRANSITIONS[trId] || TRANSITIONS.none).apply(oldL, newL, dur, function () {
      D.render(); // restore the editable stage
    });
    // safety restore
    setTimeout(function () { if ($("dck-stage") && !$("dck-stage").querySelector(".dck-block")) D.render(); }, dur + 800);
  }

  function buildAnimationsTab(panel) {
    var g = rGroup(panel, "Entrance");
    rBtn(g, "dckr-ae-appear", "Appear", "", function () { applyAnim("E", "appear"); }, { small: true });
    rBtn(g, "dckr-ae-fadein", "Fade In", "", function () { applyAnim("E", "fadein"); }, { small: true });
    rBtn(g, "dckr-ae-flyL", "Fly L", "", function () { applyAnim("E", "flyL"); }, { small: true });
    rBtn(g, "dckr-ae-flyR", "Fly R", "", function () { applyAnim("E", "flyR"); }, { small: true });
    rBtn(g, "dckr-ae-flyU", "Fly U", "", function () { applyAnim("E", "flyU"); }, { small: true });
    rBtn(g, "dckr-ae-flyD", "Fly D", "", function () { applyAnim("E", "flyD"); }, { small: true });
    rBtn(g, "dckr-ae-zoomin", "Zoom", "", function () { applyAnim("E", "zoomin"); }, { small: true });
    g = rGroup(panel, "Exit");
    rBtn(g, "dckr-ax-disappear", "Disappear", "", function () { applyAnim("X", "disappear"); }, { small: true });
    rBtn(g, "dckr-ax-fadeout", "Fade Out", "", function () { applyAnim("X", "fadeout"); }, { small: true });
    g = rGroup(panel, "Pane");
    rBtn(g, "dckr-pane", "Animation Pane", "i-list", function () { toggleAnimPane(); });
    rBtn(g, "dckr-aniprev", "Preview", "i-eye", function () {
      var stage = $("dck-stage"), s = D.currentSlide();
      if (stage && s) playEntrance(stage, s);
    });
  }
  function applyAnim(kind, type) {
    var b = needBlock();
    if (!b) return;
    var id = b.id;
    D.withCurrentSlide(function (s) {
      var bb = blockById(s, id);
      if (!bb) return;
      if (kind === "E") bb.animE = { type: type, dur: 0.5, delay: 0 };
      else bb.animX = { type: type, dur: 0.4, delay: 0 };
      s.animSeq = s.animSeq || [];
      if (s.animSeq.indexOf(id) < 0) s.animSeq.push(id);
    });
    D.render();
    var stage = $("dck-stage"), s = D.currentSlide();
    if (stage && s && kind === "E") {
      var node = stage.querySelector('[data-bid="' + id + '"]');
      var bb2 = blockById(s, id);
      if (node && bb2 && bb2.animE) {
        var kf = entranceKf(bb2.animE.type);
        if (kf) waapi(node, kf, { duration: 500, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" }, null);
      }
    }
    refreshRibbon();
  }

  function buildSlideshowTab(panel) {
    var g = rGroup(panel, "Present");
    rBtn(g, "dckr-ss-begin", "From Start", "i-play", presentFromStart, { title: "Start from the first slide (F5)" });
    rBtn(g, "dckr-ss-cur", "From Current", "", presentFromCurrent, { title: "Start from the current slide (Shift+F5)" });
    rBtn(g, "dckr-ss-console", "Presenter View", "i-present", openPresenterConsole,
      { title: "Open the presenter console in a second window" });
    g = rGroup(panel, "Options");
    rBtn(g, "dckr-ss-hide", "Hide Slide", "i-eye-off", function () {
      D.withCurrentSlide(function (s) { s.hidden = !s.hidden; });
      toast(D.currentSlide().hidden ? "Slide hidden from the show." : "Slide visible in the show.");
      refreshRibbon();
    });
    rBtn(g, "dckr-ss-loop", "Loop", "i-repeat", function () {
      D.mutateDeck(function (d) { d.loop = !d.loop; });
      toast("Loop " + (D.currentDeck().loop ? "on." : "off."));
      refreshRibbon();
    });
  }
  function presentFromStart() {
    if (!D.currentDeck()) { toast("Open a deck first.", "error"); return; }
    D.setSlideIndex(0);
    D.present();
  }
  function presentFromCurrent() {
    if (!D.currentDeck()) { toast("Open a deck first.", "error"); return; }
    D.present();
  }

  function buildViewTab(panel) {
    var g = rGroup(panel, "Views");
    rBtn(g, "dckr-v-normal", "Normal", "", function () { setViewMode("normal"); });
    rBtn(g, "dckr-v-sorter", "Sorter", "i-grid", function () { setViewMode("sorter"); });
    rBtn(g, "dckr-v-notes", "Notes", "i-notes", function () { setViewMode("notes"); });
    rBtn(g, "dckr-v-master", "Master", "i-sliders", function () { setViewMode("master"); });
    g = rGroup(panel, "Export");
    rBtn(g, "dckr-x-html", "HTML5", "i-globe", exportHtml5, { title: "Standalone interactive player (.html)" });
    rBtn(g, "dckr-x-pdf", "PDF Handout", "i-print", exportPrint, { title: "Print-styled handout, save as PDF" });
    rBtn(g, "dckr-x-pptx", "PPTX", "i-export", exportPptx, { title: "Real PowerPoint file (.pptx)" });
    rBtn(g, "dckr-x-png", "PNG", "i-image", exportPng, { title: "One PNG per slide" });
  }

  /* ============================================================
     contextual editors: chart + smartart (live in the Insert tab)
     ============================================================ */
  function refreshContextEditors() {
    var b = selBlock();
    var ce = $("dckx-chartedit"), se = $("dckx-saedit");
    if (ce) { ce.style.display = (b && b.type === "chart") ? "" : "none"; if (b && b.type === "chart") buildChartEditor(ce, b); }
    if (se) { se.style.display = (b && b.type === "smartart") ? "" : "none"; if (b && b.type === "smartart") buildSmartartEditor(se, b); }
  }
  function labeledInput(label, value, onChange, type) {
    var w = el("label", "dckr-lab2", label);
    var inp = document.createElement("input");
    inp.type = type || "text";
    inp.value = value == null ? "" : String(value);
    inp.addEventListener("input", function () { onChange(inp.value); });
    w.appendChild(inp);
    return w;
  }
  function buildChartEditor(box, b) {
    box.innerHTML = "";
    box.appendChild(el("div", "dckr-ctx-t", "Chart: live data"));
    var bid = b.id;
    box.appendChild(labeledInput("Title", b.chartTitle || "", function (v) {
      D.withBlock(bid, function (bb) { bb.chartTitle = v; }); D.render();
    }));
    var tw = el("label", "dckr-lab2", "Type");
    var tsel = document.createElement("select");
    ["bar", "line", "pie"].forEach(function (t) {
      var o = document.createElement("option");
      o.value = t; o.textContent = t[0].toUpperCase() + t.slice(1);
      if ((b.chartType || "bar") === t) o.selected = true;
      tsel.appendChild(o);
    });
    tsel.addEventListener("change", function () {
      D.withBlock(bid, function (bb) { bb.chartType = tsel.value; }); D.render();
    });
    tw.appendChild(tsel);
    box.appendChild(tw);
    var rows = el("div", "dckr-rows");
    var labels = (b.labels || []).slice(), values = (b.values || []).slice();
    var len = Math.max(labels.length, values.length, 1);
    function paint() {
      rows.innerHTML = "";
      for (var i = 0; i < len; i++) {
        (function (k) {
          var r = el("div", "dckr-row");
          var li = document.createElement("input");
          li.value = labels[k] || ""; li.placeholder = "Label"; li.setAttribute("aria-label", "Label " + (k + 1));
          var vi = document.createElement("input");
          vi.value = values[k] == null ? "" : values[k]; vi.placeholder = "Value";
          vi.setAttribute("aria-label", "Value " + (k + 1)); vi.inputMode = "decimal";
          function commit() {
            labels[k] = li.value; values[k] = parseFloat(vi.value) || 0;
            D.withBlock(bid, function (bb) { bb.labels = labels.slice(); bb.values = values.slice(); });
            D.render();
          }
          li.addEventListener("change", commit);
          vi.addEventListener("change", commit);
          var del = el("button", "dckr-mini", "x");
          del.type = "button"; del.setAttribute("aria-label", "Remove row " + (k + 1));
          del.addEventListener("click", function () {
            labels.splice(k, 1); values.splice(k, 1); len = Math.max(labels.length, values.length, 1);
            D.withBlock(bid, function (bb) { bb.labels = labels.slice(); bb.values = values.slice(); });
            D.render();
          });
          r.appendChild(li); r.appendChild(vi); r.appendChild(del);
          rows.appendChild(r);
        })(i);
      }
    }
    paint();
    box.appendChild(rows);
    var add = el("button", "dckr-mini wide", "+ Add row");
    add.type = "button";
    add.addEventListener("click", function () {
      labels.push(""); values.push(0); len++;
      D.withBlock(bid, function (bb) { bb.labels = labels.slice(); bb.values = values.slice(); });
      D.render();
    });
    box.appendChild(add);
  }
  function buildSmartartEditor(box, b) {
    box.innerHTML = "";
    box.appendChild(el("div", "dckr-ctx-t", "SmartArt: live text list"));
    var bid = b.id;
    var tw = el("label", "dckr-lab2", "Diagram");
    var tsel = document.createElement("select");
    SMARTARTS.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id; o.textContent = s.name;
      if ((b.diagram || "chevron") === s.id) o.selected = true;
      tsel.appendChild(o);
    });
    tsel.addEventListener("change", function () {
      D.withBlock(bid, function (bb) { bb.diagram = tsel.value; }); D.render();
    });
    tw.appendChild(tsel);
    box.appendChild(tw);
    var items = (b.items || []).map(function (it) { return { text: it.text || "" }; });
    var list = el("div", "dckr-rows");
    function paint() {
      list.innerHTML = "";
      items.forEach(function (it, k) {
        var r = el("div", "dckr-row");
        var inp = document.createElement("input");
        inp.value = it.text; inp.placeholder = "Item " + (k + 1);
        inp.setAttribute("aria-label", "SmartArt item " + (k + 1));
        inp.addEventListener("input", function () {
          it.text = inp.value;
          D.withBlock(bid, function (bb) { bb.items = items.map(function (x) { return { text: x.text }; }); });
          D.render();
        });
        var del = el("button", "dckr-mini", "x");
        del.type = "button"; del.setAttribute("aria-label", "Remove item " + (k + 1));
        del.addEventListener("click", function () {
          items.splice(k, 1);
          D.withBlock(bid, function (bb) { bb.items = items.map(function (x) { return { text: x.text }; }); });
          D.render();
        });
        r.appendChild(inp); r.appendChild(del);
        list.appendChild(r);
      });
    }
    paint();
    box.appendChild(list);
    var add = el("button", "dckr-mini wide", "+ Add item");
    add.type = "button";
    add.addEventListener("click", function () {
      items.push({ text: "New item" });
      D.withBlock(bid, function (bb) { bb.items = items.map(function (x) { return { text: x.text }; }); });
      D.render();
    });
    box.appendChild(add);
  }

  /* ============================================================
     animation pane
     ============================================================ */
  function buildAnimPane() {
    if ($("dckx-animPane")) return;
    var ed = $("dck-editor");
    if (!ed) return;
    var p = el("div", "");
    p.id = "dckx-animPane";
    p.style.display = "none";
    p.setAttribute("role", "complementary");
    p.setAttribute("aria-label", "Animation pane");
    ed.appendChild(p);
  }
  function toggleAnimPane(force) {
    buildAnimPane();
    var p = $("dckx-animPane");
    if (!p) return;
    var show = (typeof force === "boolean") ? force : p.style.display === "none";
    p.style.display = show ? "" : "none";
    if (show) refreshPane();
    markActive("dckr-pane", show);
  }
  function animLabel(b) {
    var t = blockText(b).slice(0, 24) || b.type;
    return b.type + " · " + t;
  }
  function refreshPane() {
    var p = $("dckx-animPane");
    if (!p || p.style.display === "none") return;
    p.innerHTML = "";
    var head = el("div", "dckx-pane-h");
    head.appendChild(el("strong", null, "Animation Pane"));
    var x = el("button", "dckr-mini", "x");
    x.type = "button"; x.setAttribute("aria-label", "Close animation pane");
    x.addEventListener("click", function () { toggleAnimPane(false); });
    head.appendChild(x);
    p.appendChild(head);
    var s = D.currentSlide();
    if (!s) { p.appendChild(el("div", "dckx-pane-empty", "No slide selected.")); return; }
    var seq = animSeq(s);
    if (!seq.length) {
      p.appendChild(el("div", "dckx-pane-empty",
        "No animations on this slide. Select a block, then pick an entrance or exit on the Animations tab."));
    }
    seq.forEach(function (id, k) {
      var b = blockById(s, id);
      if (!b) return;
      var row = el("div", "dckx-arow");
      row.appendChild(el("span", "dckx-anum", String(k + 1)));
      var info = el("div", "dckx-ainfo");
      info.appendChild(el("div", "dckx-aname", animLabel(b)));
      function selFor(kind, cur) {
        var wrap = el("label", "dckr-lab2", kind === "E" ? "In" : "Out");
        var sel = document.createElement("select");
        var opts = kind === "E" ? [["", "None"]].concat(Object.keys(ANIM_E).map(function (kk) { return [kk, ANIM_E[kk].name]; }))
          : [["", "None"]].concat(Object.keys(ANIM_X).map(function (kk) { return [kk, ANIM_X[kk].name]; }));
        opts.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0]; op.textContent = o[1];
          if ((cur && cur.type) === o[0]) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener("change", function () {
          D.withBlock(id, function (bb) {
            if (kind === "E") bb.animE = sel.value ? { type: sel.value, dur: 0.5, delay: 0 } : null;
            else bb.animX = sel.value ? { type: sel.value, dur: 0.4, delay: 0 } : null;
          });
          D.render();
        });
        wrap.appendChild(sel);
        return wrap;
      }
      info.appendChild(selFor("E", b.animE));
      info.appendChild(selFor("X", b.animX));
      var dl = labeledInput("Delay (s)", (b.animE && b.animE.delay) || 0, function (v) {
        D.withBlock(id, function (bb) {
          if (bb.animE) bb.animE.delay = clamp(parseFloat(v) || 0, 0, 10);
          if (bb.animX) bb.animX.delay = clamp(parseFloat(v) || 0, 0, 10);
        });
      }, "number");
      info.appendChild(dl);
      row.appendChild(info);
      var ctl = el("div", "dckx-actl");
      [["up", -1, "Move up"], ["dn", 1, "Move down"]].forEach(function (d) {
        var mb = el("button", "dckr-mini", d[0]);
        mb.type = "button"; mb.title = d[2]; mb.setAttribute("aria-label", d[2]);
        mb.disabled = (d[1] < 0 && k === 0) || (d[1] > 0 && k === seq.length - 1);
        (function (dir) {
          mb.addEventListener("click", function () {
            D.withCurrentSlide(function (ss) { ss.animSeq = moveSeqItem(ss.animSeq || [], id, dir); });
            D.render();
          });
        })(d[1]);
        ctl.appendChild(mb);
      });
      var rm = el("button", "dckr-mini", "x");
      rm.type = "button"; rm.title = "Remove animations"; rm.setAttribute("aria-label", "Remove animations");
      rm.addEventListener("click", function () {
        D.withCurrentSlide(function (ss) {
          var bb = blockById(ss, id);
          if (bb) { bb.animE = null; bb.animX = null; }
          ss.animSeq = (ss.animSeq || []).filter(function (x) { return x !== id; });
        });
        D.render();
      });
      ctl.appendChild(rm);
      row.appendChild(ctl);
      p.appendChild(row);
    });
    // morph id for the selected block
    var b = selBlock();
    var mf = el("div", "dckx-morph");
    mf.appendChild(el("div", "dckr-ctx-t", "Morph"));
    if (b) {
      mf.appendChild(labeledInput("Morph ID (match on next slide)", b.morphId || "", function (v) {
        var id = b.id;
        D.withBlock(id, function (bb) { bb.morphId = String(v).trim() || null; });
      }));
    } else {
      mf.appendChild(el("div", "dckx-pane-empty", "Select a block to set its morph ID."));
    }
    var pv = el("button", "dckr-btn wide", "");
    pv.type = "button";
    pv.appendChild(el("span", "dckr-lab", "Preview Sequence"));
    pv.addEventListener("click", function () {
      var stage = $("dck-stage"), ss = D.currentSlide();
      if (stage && ss) playEntrance(stage, ss);
    });
    mf.appendChild(pv);
    p.appendChild(mf);
  }

  /* ============================================================
     ink drawing on the stage overlay
     ============================================================ */
  function bindInkDraw(svg, slide) {
    var pts = null, preview = null;
    function pos(e) {
      var r = svg.getBoundingClientRect();
      return [clamp(((e.clientX - r.left) / (r.width || 1)) * 100, 0, 100),
        clamp(((e.clientY - r.top) / (r.height || 1)) * 100, 0, 100)];
    }
    function eraseAt(x, y) {
      D.withCurrentSlide(function (s) {
        var ink = s.ink || [];
        var i = inkHitTest(ink, x, y, 2.5);
        if (i >= 0) ink.splice(i, 1);
      });
      D.render();
    }
    svg.addEventListener("pointerdown", function (e) {
      if (!drawTool || (e.button !== undefined && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation();
      var p = pos(e);
      if (drawTool === "eraser") { eraseAt(p[0], p[1]); return; }
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      pts = [p];
      preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
      preview.setAttribute("fill", "none");
      preview.setAttribute("stroke", inkColor);
      preview.setAttribute("stroke-width", String(drawTool === "high" ? 1.6 : inkWidth));
      preview.setAttribute("stroke-linecap", "round");
      preview.setAttribute("stroke-linejoin", "round");
      preview.setAttribute("vector-effect", "non-scaling-stroke");
      if (drawTool === "high") preview.setAttribute("opacity", "0.45");
      svg.appendChild(preview);
      function move(ev) {
        var q = pos(ev);
        var last = pts[pts.length - 1];
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.15) return;
        pts.push(q);
        preview.setAttribute("d", pts.map(function (pt, k) {
          return (k ? "L" : "M") + pt[0].toFixed(2) + " " + pt[1].toFixed(2);
        }).join(" "));
      }
      function up() {
        svg.removeEventListener("pointermove", move);
        svg.removeEventListener("pointerup", up);
        svg.removeEventListener("pointercancel", up);
        if (pts && pts.length) {
          var stroke = {
            tool: drawTool, color: inkColor,
            width: drawTool === "high" ? 1.6 : inkWidth, pts: pts
          };
          D.withCurrentSlide(function (s) { s.ink = s.ink || []; s.ink.push(stroke); });
        }
        pts = null; preview = null;
        D.render();
      }
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", up);
    });
  }

  /* ============================================================
     remove background (basic, heuristic)
     ============================================================ */
  function removeBackground() {
    var b = selBlock();
    if (!b || b.type !== "image" || !b.src) {
      toast("Select a picture block first.", "error");
      return;
    }
    var bid = b.id;
    toast("Removing background (basic, heuristic)...");
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) throw new Error("empty");
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var idata = ctx.getImageData(0, 0, w, h);
        var cleared = floodFillAlpha(idata.data, w, h, 32);
        ctx.putImageData(idata, 0, 0);
        var url = c.toDataURL("image/png");
        D.withBlock(bid, function (bb) { bb.src = url; });
        D.render();
        toast("Background removed (basic, heuristic). " + cleared + " px cleared.");
      } catch (e) {
        toast("Could not process that image.", "error");
      }
    };
    img.onerror = function () { toast("Could not read that image.", "error"); };
    img.src = b.src;
  }

  /* ============================================================
     ribbon refresh + mount
     ============================================================ */
  function refreshRibbon() {
    if (!ribbonBuilt) return;
    var deck = D.currentDeck(), s = D.currentSlide();
    var trId = s ? resolveTransition(s.transition || (deck && deck.transition) || "none") : "none";
    TRANSITION_IDS.forEach(function (id) { markActive("dckr-tr-" + id, id === trId); });
    markActive("dckr-pen", drawTool === "pen");
    markActive("dckr-high", drawTool === "high");
    markActive("dckr-eraser", drawTool === "eraser");
    markActive("dckr-ins-num", !!(deck && deck.slideNumbers));
    markActive("dckr-ss-hide", !!(s && s.hidden));
    markActive("dckr-ss-loop", !!(deck && deck.loop));
    markActive("dckr-v-normal", viewMode === "normal");
    markActive("dckr-v-sorter", viewMode === "sorter");
    markActive("dckr-v-notes", viewMode === "notes");
    markActive("dckr-v-master", viewMode === "master");
    (D.themes || []).forEach(function (t) { markActive("dckr-theme-" + t.id, deck && deck.theme === t.id); });
    ["169", "43", "916"].forEach(function (k, i) {
      markActive("dckr-aspect-" + k, deck && deck.aspect === ["16:9", "4:3", "9:16"][i]);
    });
    var dur = $("dckr-trdur");
    if (dur && deck) {
      var dv = clamp(Number(deck.transitionDur) || 0.6, 0.25, 5);
      dur.value = String(dv);
      var lab = dur.parentNode && dur.parentNode.querySelector(".dckr-val");
      if (lab) lab.textContent = dv.toFixed(2) + "s";
    }
    refreshContextEditors();
    refreshPane();
    if (viewMode !== "normal") renderViewPane();
  }
  function onEditorRender() {
    refreshRibbon();
  }
  function afterShow() {
    buildRibbon();
    buildAnimPane();
    var ed = $("dck-editor");
    if (ed && ed.style.display === "none" && viewMode !== "normal") setViewMode("normal");
    refreshRibbon();
  }

  /* ============================================================
     PRESENTER CONSOLE (second window)
     ============================================================ */
  function openPresenterConsole() {
    var deck = D.currentDeck();
    if (!deck || !deck.slides.length) { toast("Open a deck with slides first.", "error"); return; }
    if (!D.presentState()) D.present();
    var st = D.presentState();
    var startIdx = st ? st.idx : 0;
    var pw = null;
    try {
      pw = window.open("", "_blank", "width=1240,height=800,menubar=no,toolbar=no,location=no,status=no");
    } catch (e) { pw = null; }
    if (!pw) { toast("Popup blocked. Allow popups for the presenter view.", "error"); return; }
    var data = deck.slides.map(function (s, i) {
      return { html: slideHtml(deck, s, i), notes: s.notes || "", n: i + 1, hidden: !!s.hidden };
    });
    try {
      pw.document.write(buildConsoleHtml(data, startIdx, deck.title || "Untitled deck"));
      pw.document.close();
      pw.focus();
    } catch (e) {
      toast("Could not open the presenter console.", "error");
    }
  }
  function buildConsoleHtml(data, startIdx, title) {
    var css =
      "html,body{margin:0;height:100%;background:#0B0D14;color:#F1F5F9;font-family:system-ui,sans-serif}" +
      "#ch{display:flex;gap:14px;align-items:center;padding:10px 16px;background:#111524;border-bottom:1px solid #232842}" +
      "#ch strong{font-size:15px}#cClock{margin-left:auto;opacity:.75;font-variant-numeric:tabular-nums}" +
      "#cCount{font-weight:700;color:#FF2E93}" +
      "#cm{display:flex;height:calc(100% - 118px);min-height:0}" +
      "#cLeft{flex:1 1 60%;display:flex;flex-direction:column;padding:14px;min-width:0}" +
      "#cSlideWrap{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#000;border-radius:10px;overflow:hidden}" +
      "#cSlide{width:100%;max-height:100%}#cSlide .dckx-ss{box-shadow:none}" +
      "#cBlack{position:absolute;inset:0;background:#000;display:none;z-index:5}" +
      "#cLaser{position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#ff5b5b 30%,rgba(255,0,0,.25) 70%);box-shadow:0 0 12px 4px rgba(255,40,40,.8);display:none;z-index:6;pointer-events:none}" +
      "#cTools{display:flex;gap:8px;padding-top:10px}" +
      "#cTools button,#cRight button{background:#1B2138;border:1px solid #2C3557;color:#F1F5F9;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:600}" +
      "#cTools button.on,#cRight button.on{background:#FF2E93;border-color:#FF2E93}" +
      "#cRight{flex:0 0 40%;max-width:460px;border-left:1px solid #232842;padding:14px;overflow-y:auto}" +
      "#cRight h3{margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#9AA3C0}" +
      "#cTimer{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums}" +
      "#cTimerBox{display:flex;gap:8px;align-items:center}" +
      "#cNext{border:1px solid #2C3557;border-radius:8px;overflow:hidden}" +
      "#cNotes{background:#111524;border:1px solid #232842;border-radius:8px;padding:10px;min-height:70px;white-space:pre-wrap;font-size:14px}" +
      "#cFilm{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}" +
      ".cThumb{border:2px solid transparent;border-radius:6px;overflow:hidden;cursor:pointer}" +
      ".cThumb.on{border-color:#FF2E93}.cThumb.dim{opacity:.45}" +
      ".cEnd{padding:30px;text-align:center;opacity:.6}" +
      "#cf{padding:8px 16px;border-top:1px solid #232842;font-size:12px;opacity:.6}" +
      '[lang="my"]{line-height:1.85}';
    var js =
      "var SLIDES=" + JSON.stringify(data).replace(/<\//g, "<\\/") + ";\n" +
      "var idx=" + startIdx + ";\n" +
      "var cSlide=document.getElementById('cSlide'),cNext=document.getElementById('cNext')," +
      "cNotes=document.getElementById('cNotes'),cCount=document.getElementById('cCount')," +
      "cTimer=document.getElementById('cTimer'),cClock=document.getElementById('cClock')," +
      "cBlack=document.getElementById('cBlack'),cLaser=document.getElementById('cLaser')," +
      "cSlideWrap=document.getElementById('cSlideWrap'),cFilm=document.getElementById('cFilm');\n" +
      "function sync(i){try{var o=window.opener;if(o&&!o.closed&&o.TXT&&o.TXT.dck&&o.TXT.dck.presentGo){o.TXT.dck.presentGo(i);}}catch(e){}}\n" +
      "function render(){\n" +
      "  cSlide.innerHTML=SLIDES[idx].html;\n" +
      "  cNext.innerHTML=SLIDES[idx+1]?SLIDES[idx+1].html:'<div class=\"cEnd\">End of show</div>';\n" +
      "  cNotes.textContent=SLIDES[idx].notes||'No speaker notes for this slide.';\n" +
      "  cCount.textContent=(idx+1)+' / '+SLIDES.length;\n" +
      "  SLIDES.forEach(function(s,i){if(s._el)s._el.classList.toggle('on',i===idx);});\n" +
      "}\n" +
      "function go(i){idx=Math.max(0,Math.min(SLIDES.length-1,i));render();sync(idx);}\n" +
      "var t0=Date.now(),acc=0,paused=false;\n" +
      "function fmt(ms){var s=Math.floor(ms/1000);var m=Math.floor(s/60);return (m<10?'0':'')+m+':'+((s%60<10?'0':'')+(s%60));}\n" +
      "setInterval(function(){if(!paused)cTimer.textContent=fmt(acc+Date.now()-t0);},500);\n" +
      "setInterval(function(){cClock.textContent=new Date().toLocaleTimeString();},1000);\n" +
      "document.getElementById('cPause').onclick=function(){paused=!paused;if(paused){acc+=Date.now()-t0;}else{t0=Date.now();}this.textContent=paused?'Resume':'Pause';this.classList.toggle('on',paused);};\n" +
      "document.getElementById('cReset').onclick=function(){acc=0;t0=Date.now();paused=false;var pb=document.getElementById('cPause');pb.textContent='Pause';pb.classList.remove('on');};\n" +
      "var black=false,laser=false;\n" +
      "var cBlackB=document.getElementById('cBlackB'),cLaserB=document.getElementById('cLaserB');\n" +
      "function setBlack(v){black=v;cBlack.style.display=v?'block':'none';cBlackB.classList.toggle('on',v);}\n" +
      "cBlackB.onclick=function(){setBlack(!black);};\n" +
      "cLaserB.onclick=function(){laser=!laser;cLaserB.classList.toggle('on',laser);if(!laser)cLaser.style.display='none';};\n" +
      "cSlideWrap.addEventListener('mousemove',function(e){if(!laser)return;var r=cSlideWrap.getBoundingClientRect();cLaser.style.display='block';cLaser.style.left=(e.clientX-r.left-9)+'px';cLaser.style.top=(e.clientY-r.top-9)+'px';});\n" +
      "document.getElementById('cPrev').onclick=function(){go(idx-1);};\n" +
      "document.getElementById('cNextB').onclick=function(){go(idx+1);};\n" +
      "document.addEventListener('keydown',function(e){\n" +
      "  if(e.key==='b'||e.key==='B'){setBlack(!black);}\n" +
      "  else if(e.key==='l'||e.key==='L'){cLaserB.onclick();}\n" +
      "  else if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();go(idx+1);}\n" +
      "  else if(e.key==='ArrowLeft'){e.preventDefault();go(idx-1);}\n" +
      "  else if(e.key==='Home'){go(0);}else if(e.key==='End'){go(SLIDES.length-1);}\n" +
      "  else if(e.key==='Escape'){window.close();}\n" +
      "});\n" +
      "SLIDES.forEach(function(s,i){var d=document.createElement('div');d.className='cThumb'+(s.hidden?' dim':'');d.innerHTML=s.html;d.title='Slide '+s.n+(s.hidden?' (hidden)':'');d.onclick=function(){go(i);};cFilm.appendChild(d);s._el=d;});\n" +
      "go(idx);\n";
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
      "<title>Presenter Console · " + esc(title) + "</title>" +
      "<style>" + css + "</style></head><body>" +
      "<header id=\"ch\"><strong>" + esc(title) + "</strong>" +
      "<span id=\"cClock\"></span><span id=\"cCount\"></span></header>" +
      "<main id=\"cm\"><section id=\"cLeft\">" +
      "<div id=\"cSlideWrap\"><div id=\"cSlide\"></div><div id=\"cBlack\"></div><div id=\"cLaser\"></div></div>" +
      "<div id=\"cTools\"><button id=\"cPrev\" type=\"button\">Prev</button>" +
      "<button id=\"cNextB\" type=\"button\">Next</button>" +
      "<button id=\"cBlackB\" type=\"button\">Blackout (B)</button>" +
      "<button id=\"cLaserB\" type=\"button\">Laser (L)</button></div>" +
      "</section><aside id=\"cRight\">" +
      "<div id=\"cTimerBox\"><div id=\"cTimer\">00:00</div>" +
      "<button id=\"cPause\" type=\"button\">Pause</button>" +
      "<button id=\"cReset\" type=\"button\">Reset</button></div>" +
      "<h3>Up next</h3><div id=\"cNext\"></div>" +
      "<h3>Speaker notes</h3><div id=\"cNotes\"></div>" +
      "<h3>Slides</h3><div id=\"cFilm\"></div>" +
      "</aside></main><footer id=\"cf\">Developed by H3NZ</footer>" +
      "<script>" + js + "<\/script></body></html>";
  }

  /* ============================================================
     VIEW MODES: sorter / notes page / slide master
     ============================================================ */
  function setViewMode(m) {
    viewMode = m;
    sorterSel = {};
    var ed = $("dck-editor");
    if (!ed) return;
    var pane = $("dckx-viewpane");
    if (!pane) {
      pane = el("div", "");
      pane.id = "dckx-viewpane";
      pane.style.display = "none";
      pane.tabIndex = -1;
      ed.appendChild(pane);
    }
    var main = $("dck-main"), notes = $("dck-notes");
    if (m === "normal") {
      pane.style.display = "none";
      if (main) main.style.display = "";
      if (notes) notes.style.display = "";
    } else {
      if (main) main.style.display = "none";
      if (notes) notes.style.display = "none";
      pane.style.display = "";
      renderViewPane();
    }
    refreshRibbon();
  }
  function renderViewPane() {
    var pane = $("dckx-viewpane");
    if (!pane || viewMode === "normal") return;
    // never rebuild while the user is typing inside the pane
    if (pane.contains(document.activeElement) && document.activeElement !== pane) return;
    var deck = D.currentDeck();
    pane.innerHTML = "";
    if (!deck) { pane.appendChild(el("div", "dckx-pane-empty", "No deck open.")); return; }
    if (viewMode === "sorter") renderSorter(pane, deck);
    else if (viewMode === "notes") renderNotesPage(pane, deck);
    else if (viewMode === "master") renderMaster(pane, deck);
  }
  function viewToolbar(pane, title) {
    var bar = el("div", "dckx-vbar");
    var back = el("button", "dckr-btn wide sm2", "");
    back.type = "button";
    back.appendChild(el("span", "dckr-lab", "Back to Normal"));
    back.addEventListener("click", function () { setViewMode("normal"); });
    bar.appendChild(back);
    bar.appendChild(el("strong", "dckx-vtitle", title));
    pane.appendChild(bar);
    return bar;
  }
  function renderSorter(pane, deck) {
    var bar = viewToolbar(pane, "Slide Sorter");
    var del = el("button", "dckr-btn sm2 danger", "");
    del.type = "button";
    del.appendChild(el("span", "dckr-lab", "Delete Selected"));
    del.addEventListener("click", deleteSorterSel);
    bar.appendChild(del);
    pane.appendChild(el("div", "dckx-hint",
      "Click to select, Ctrl/Cmd+click for multi-select, drag to reorder, double-click to edit. Delete key removes the selection."));
    var grid = el("div", "dckx-sortgrid");
    deck.slides.forEach(function (s, i) {
      var card = el("div", "dckx-scard" + (sorterSel[i] ? " sel" : ""));
      card.draggable = true;
      card.setAttribute("data-i", String(i));
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Slide " + (i + 1) + (s.hidden ? ", hidden" : ""));
      var thumb = el("div", "dckx-sthumb");
      thumb.innerHTML = slideHtml(deck, s, i);
      card.appendChild(thumb);
      var meta = el("div", "dckx-smeta");
      meta.appendChild(el("span", "dckx-snum", String(i + 1)));
      if (s.hidden) meta.appendChild(el("span", "dckx-shidden", "hidden"));
      card.appendChild(meta);
      card.addEventListener("click", function (e) {
        if (e.ctrlKey || e.metaKey) {
          if (sorterSel[i]) delete sorterSel[i]; else sorterSel[i] = 1;
        } else {
          sorterSel = {}; sorterSel[i] = 1;
        }
        renderViewPane();
      });
      card.addEventListener("dblclick", function () {
        D.setSlideIndex(i);
        setViewMode("normal");
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSorterSel(); }
        else if (e.key === "Enter") { D.setSlideIndex(i); setViewMode("normal"); }
      });
      card.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/dckx-sort", String(i));
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragover", function (e) { e.preventDefault(); card.classList.add("drop"); });
      card.addEventListener("dragleave", function () { card.classList.remove("drop"); });
      card.addEventListener("drop", function (e) {
        e.preventDefault();
        card.classList.remove("drop");
        var from = parseInt(e.dataTransfer.getData("text/dckx-sort"), 10);
        if (isNaN(from) || from === i) return;
        D.mutateDeck(function (d) {
          var mv = d.slides.splice(from, 1)[0];
          d.slides.splice(i, 0, mv);
        });
        sorterSel = {};
        renderViewPane();
      });
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    pane.onkeydown = function (e) {
      if ((e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        deleteSorterSel();
      }
    };
  }
  function deleteSorterSel() {
    var idxs = Object.keys(sorterSel).map(Number).sort(function (a, b) { return b - a; });
    if (!idxs.length) { toast("Select slides first (click, or Ctrl+click)."); return; }
    D.mutateDeck(function (d) {
      idxs.forEach(function (i) { d.slides.splice(i, 1); });
      if (!d.slides.length) d.slides.push({ id: uid(), layout: "blank", blocks: [], notes: "" });
    });
    sorterSel = {};
    toast(idxs.length + " slide(s) deleted.");
    renderViewPane();
  }
  function renderNotesPage(pane, deck) {
    viewToolbar(pane, "Notes Page");
    deck.slides.forEach(function (s, i) {
      var row = el("div", "dckx-noterow");
      var thumb = el("div", "dckx-nthumb");
      thumb.innerHTML = slideHtml(deck, s, i);
      row.appendChild(thumb);
      var ta = document.createElement("textarea");
      ta.className = "dckx-noteta";
      ta.value = s.notes || "";
      ta.placeholder = "Speaker notes for slide " + (i + 1);
      ta.setAttribute("aria-label", "Notes for slide " + (i + 1));
      (function (idx) {
        ta.addEventListener("change", function () {
          D.mutateDeck(function (d) { d.slides[idx].notes = ta.value; });
          toast("Notes saved for slide " + (idx + 1) + ".");
        });
      })(i);
      row.appendChild(ta);
      pane.appendChild(row);
    });
  }
  function renderMaster(pane, deck) {
    viewToolbar(pane, "Slide Master");
    pane.appendChild(el("div", "dckx-hint",
      "Master text styles cascade to every slide: titles, body text and the accent color. Leave a field empty to keep the theme value."));
    var m = deck.master || {};
    var form = el("div", "dckx-mform");
    function colorRow(key, label) {
      var w = el("label", "dckr-lab2", label);
      var inp = document.createElement("input");
      inp.type = "color";
      inp.value = /^#[0-9a-fA-F]{6}$/.test(m[key] || "") ? m[key] : "#111827";
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!m[key];
      chk.title = "Override";
      chk.setAttribute("aria-label", "Override " + label);
      function commit() {
        readMaster(form, deck);
      }
      inp.addEventListener("input", commit);
      chk.addEventListener("change", commit);
      w.appendChild(chk); w.appendChild(inp);
      w._key = key; w._inp = inp; w._chk = chk;
      return w;
    }
    function sizeRow(key, label, min, max) {
      var w = el("label", "dckr-lab2", label + " (cqw)");
      var rng = document.createElement("input");
      rng.type = "range"; rng.min = String(min); rng.max = String(max); rng.step = "0.1";
      rng.value = String(m[key] || (key === "titleSize" ? 4.2 : 1.7));
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!m[key];
      chk.setAttribute("aria-label", "Override " + label);
      function commit() { readMaster(form, deck); }
      rng.addEventListener("input", commit);
      chk.addEventListener("change", commit);
      var val = el("span", "dckr-val", rng.value);
      rng.addEventListener("input", function () { val.textContent = rng.value; });
      w.appendChild(chk); w.appendChild(rng); w.appendChild(val);
      w._key = key; w._inp = rng; w._chk = chk;
      return w;
    }
    form.appendChild(colorRow("titleColor", "Title color"));
    form.appendChild(sizeRow("titleSize", "Title size", 2, 8));
    form.appendChild(colorRow("bodyColor", "Body color"));
    form.appendChild(sizeRow("bodySize", "Body size", 0.8, 3));
    form.appendChild(colorRow("accent", "Accent"));
    pane.appendChild(form);
    var reset = el("button", "dckr-btn sm2", "");
    reset.type = "button";
    reset.appendChild(el("span", "dckr-lab", "Reset Master"));
    reset.addEventListener("click", function () {
      D.mutateDeck(function (d) { d.master = null; });
      renderViewPane();
      toast("Master styles cleared.");
    });
    pane.appendChild(reset);
    var pv = el("div", "dckx-mpreview");
    pv.id = "dckx-mpreview";
    pane.appendChild(pv);
    updateMasterPreview(deck);
  }
  function readMaster(form, deck) {
    var m = {};
    Array.prototype.forEach.call(form.querySelectorAll("label.dckr-lab2"), function (w) {
      if (!w._key) return;
      if (w._chk && w._chk.checked) {
        m[w._key] = /Size$/.test(w._key) ? parseFloat(w._inp.value) : w._inp.value;
      }
    });
    D.mutateDeck(function (d) { d.master = m; });
    updateMasterPreview(deck);
  }
  function updateMasterPreview(deck) {
    var pv = $("dckx-mpreview");
    if (!pv) return;
    var theme = themeOfDeck(deck);
    var m = (D.currentDeck() && D.currentDeck().master) || {};
    var s = D.currentSlide();
    var title = "Slide title", body = "Body text style";
    if (s) {
      (s.blocks || []).forEach(function (b) {
        var t = blockText(b);
        if (!t) return;
        if (/title|h2/.test(b.cls || "") && title === "Slide title") title = t.slice(0, 60);
        else if (/body|bullets/.test(b.cls || "") && body === "Body text style") body = t.slice(0, 90);
      });
    }
    var ts = (m.titleSize || 4.2) * 6.4, bs = (m.bodySize || 1.7) * 6.4;
    pv.innerHTML = "";
    pv.style.background = "linear-gradient(135deg," + theme.bg + "," + theme.bg2 + ")";
    pv.style.color = theme.ink;
    var acc = el("div", "dckx-mpv-acc", "Accent");
    acc.style.background = m.accent || theme.accent;
    pv.appendChild(acc);
    var th = el("div", "dckx-mpv-title", title);
    th.style.color = m.titleColor || theme.ink;
    th.style.fontSize = ts.toFixed(1) + "px";
    if (isMyText(title)) th.setAttribute("lang", "my");
    pv.appendChild(th);
    var bh = el("div", "dckx-mpv-body", body);
    bh.style.color = m.bodyColor || theme.ink;
    bh.style.fontSize = bs.toFixed(1) + "px";
    if (isMyText(body)) bh.setAttribute("lang", "my");
    pv.appendChild(bh);
  }

  /* ============================================================
     mount: wrap T.dck entry points so the ribbon builds lazily
     with the editor (the editor DOM is built lazily on show()).
     ============================================================ */
  var _show = D.show, _open = D.openDeck;
  D.show = function () { _show(); afterShow(); };
  D.openDeck = function (id) { _open(id); afterShow(); };

  /* ============================================================
     public API
     ============================================================ */
  T.dckEngine = {
    // pure / testable
    morphInterp: morphInterp,
    transitions: TRANSITIONS,
    transitionIds: TRANSITION_IDS,
    resolveTransition: resolveTransition,
    smartart: smartartSvg,
    smartartList: SMARTARTS,
    smartartName: smartartName,
    chart: chartSvg,
    compileMap: compileMap,
    floodFillAlpha: floodFillAlpha,
    moveSeqItem: moveSeqItem,
    inkHitTest: inkHitTest,
    crc32: crc32,
    zipStored: zipStored,
    buildPptx: buildPptx,
    slideHtml: slideHtml,
    slideSvgNative: slideSvgNative,
    // app integration
    renderBlock: renderBlock,
    decorateStage: decorateStage,
    presentRender: presentRender,
    playSlideExit: playSlideExit,
    playEntrance: playEntrance,
    exportHtml5: exportHtml5,
    buildHtml5: buildHtml5,
    renderSlidePngBlob: renderSlidePngBlob,
    exportPrint: exportPrint,
    exportPng: exportPng,
    exportPptx: exportPptx,
    openPresenterConsole: openPresenterConsole,
    buildConsoleHtml: buildConsoleHtml,
    setViewMode: setViewMode,
    viewMode: function () { return viewMode; },
    toggleAnimPane: toggleAnimPane,
    setRibbonTab: setRibbonTab,
    onEditorRender: onEditorRender,
    onEditorBuilt: function () { afterShow(); },
    presentFromStart: presentFromStart,
    presentFromCurrent: presentFromCurrent,
    removeBackground: removeBackground,
    _ribbonBuilt: function () { return ribbonBuilt; }
  };
  /* ============================================================
     NATIVE SVG slide renderer (no foreignObject): used for PNG export.
     SVG-as-image with foreignObject taints canvas in Chrome/Firefox,
     so PNG export renders the slide as pure SVG: rects, text runs,
     tables, nested chart/SmartArt SVGs, ink paths.
     ============================================================ */
  function richLines(html) {
    // tiny rich-text tokenizer: lines -> runs [{t,b,i,u}]
    var lines = [], cur = [], run = { t: "", b: false, i: false, u: false };
    function pushRun() {
      if (run.t) cur.push({ t: run.t, b: run.b, i: run.i, u: run.u });
      run = { t: "", b: run.b, i: run.i, u: run.u };
    }
    function newLine() { pushRun(); lines.push(cur); cur = []; }
    var re = /<\/?(b|strong|i|em|u|br|p|div|li|ul|ol)[^>]*>|[^<]+/gi, m;
    while ((m = re.exec(String(html || "")))) {
      var tok = m[0];
      if (tok.charAt(0) === "<") {
        var closing = tok.charAt(1) === "/";
        var tag = tok.replace(/[<>\/]/g, "").split(" ")[0].toLowerCase();
        if (tag === "br" || tag === "p" || tag === "div" || tag === "li" ||
            tag === "ul" || tag === "ol") { newLine(); }
        else if (tag === "b" || tag === "strong") { pushRun(); run.b = !closing; }
        else if (tag === "i" || tag === "em") { pushRun(); run.i = !closing; }
        else if (tag === "u") { pushRun(); run.u = !closing; }
      } else {
        run.t += tok.replace(/\s+/g, " ");
      }
    }
    pushRun();
    if (cur.length) lines.push(cur);
    return lines;
  }
  function innerSvg(inner) {
    // strip the outer <svg> wrapper so chart/smartart can nest
    return String(inner).replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  }
  function slideSvgNative(deck, slide, idx) {
    var theme = themeOfDeck(deck);
    var ap = aspectPair(deck);
    var W = 1280, H = Math.round(1280 * ap[1] / ap[0]);
    var gid = "dckg" + Math.random().toString(36).slice(2, 9);
    var out = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">';
    out += "<defs>";
    if (!deck.bgSolid) {
      out += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + theme.bg + '"/>' +
        '<stop offset="1" stop-color="' + theme.bg2 + '"/></linearGradient>';
    }
    out += "</defs>";
    out += '<rect width="' + W + '" height="' + H + '" fill="' +
      (deck.bgSolid ? escXml(deck.bgSolid) : "url(#" + gid + ")") + '"/>';
    var blocks = (slide.blocks || []).slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    blocks.forEach(function (b, bi) {
      var x = b.x / 100 * W, y = b.y / 100 * H, w = b.w / 100 * W, h = b.h / 100 * H;
      var cid = "dckc" + bi + gid;
      out += '<clipPath id="' + cid + '"><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"/></clipPath>';
      out += '<g clip-path="url(#' + cid + ')">';
      var fsPx = (b.fsCqw || FS_CLS[b.cls] || 1.7) * W / 100;
      var color = b.color || theme.ink;
      var anchor = b.align === "center" ? "middle" : (b.align === "right" ? "end" : "start");
      var tx = b.align === "center" ? x + w / 2 : (b.align === "right" ? x + w : x);
      if (b.type === "text" || b.type === "bullets") {
        var html = b.type === "bullets"
          ? (b.items || []).map(function (it) { return "<li>" + esc(it) + "</li>"; }).join("")
          : (b.html || "");
        var lines = richLines(html);
        var my = isMyText(lines.map(function (l) {
          return l.map(function (r) { return r.t; }).join("");
        }).join(" "));
        var lh = fsPx * (my ? 1.85 : 1.35);
        var ty = y + fsPx * 1.02;
        lines.forEach(function (line) {
          if (ty > y + h + fsPx) return;
          // flatten to chars, greedy word wrap by estimated width
          var chars = [];
          line.forEach(function (r) {
            r.t.split("").forEach(function (ch) {
              chars.push({ ch: ch, b: r.b, i: r.i, u: r.u });
            });
          });
          var words = [], cw = null;
          chars.forEach(function (c) {
            if (c.ch === " ") { if (cw) { words.push(cw); cw = null; } words.push({ sp: true }); }
            else { cw = cw || { chs: [] }; cw.chs.push(c); }
          });
          if (cw) words.push(cw);
          var estW = function (c) { return fsPx * (c.b ? 0.62 : 0.55); };
          var vlines = [], vl = [], vlw = 0;
          words.forEach(function (wd) {
            if (wd.sp) { vl.push(wd); return; }
            var ww = wd.chs.reduce(function (a, c) { return a + estW(c); }, 0);
            if (vlw + ww > w && vl.length) { vlines.push(vl); vl = []; vlw = 0; }
            vl.push(wd); vlw += ww;
          });
          if (vl.length) vlines.push(vl);
          vlines.forEach(function (vln) {
            if (ty > y + h + fsPx) return;
            var tsp = "";
            var cur = null;
            function flush() {
              if (cur && cur.t) {
                tsp += '<tspan font-weight="' + (cur.b ? "700" : "400") + '"' +
                  (cur.i ? ' font-style="italic"' : "") +
                  (cur.u ? ' text-decoration="underline"' : "") + ">" +
                  escXml(cur.t) + "</tspan>";
              }
              cur = null;
            }
            vln.forEach(function (wd) {
              if (wd.sp) {
                if (!cur) cur = { t: "", b: false, i: false, u: false };
                cur.t += " ";
                return;
              }
              wd.chs.forEach(function (c) {
                if (!cur || cur.b !== c.b || cur.i !== c.i || cur.u !== c.u) {
                  flush();
                  cur = { t: "", b: c.b, i: c.i, u: c.u };
                }
                cur.t += c.ch;
              });
            });
            flush();
            var prefix = (b.type === "bullets" && vln === vlines[0]) ? "• " : "";
            out += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="' + anchor +
              '" font-size="' + fsPx.toFixed(1) + '" fill="' + escXml(color) +
              '" font-family="system-ui,sans-serif">' + escXml(prefix) + tsp + "</text>";
            ty += lh;
          });
        });
      } else if (b.type === "shape") {
        if (b.shape === "ellipse") {
          out += '<ellipse cx="' + (x + w / 2).toFixed(1) + '" cy="' + (y + h / 2).toFixed(1) +
            '" rx="' + (w / 2).toFixed(1) + '" ry="' + (h / 2).toFixed(1) +
            '" fill="' + escXml(b.fill || theme.accent) + '"/>';
        } else {
          out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
            '" height="' + h.toFixed(1) + '" rx="6" fill="' + escXml(b.fill || theme.accent) + '"/>';
        }
      } else if (b.type === "image") {
        if (b.src) {
          out += '<image x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
            '" height="' + h.toFixed(1) + '" preserveAspectRatio="xMidYMid meet" href="' +
            b.src + '" xlink:href="' + b.src + '"/>';
        } else {
          out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
            '" height="' + h.toFixed(1) + '" fill="none" stroke="#9CA3AF" stroke-width="3" stroke-dasharray="12 8"/>';
        }
      } else if (b.type === "table") {
        var rows = b.rows || [];
        var rh = rows.length ? h / rows.length : h;
        rows.forEach(function (row, ri) {
          var cn = row.length || 1, cwid = w / cn;
          row.forEach(function (cell, ci) {
            var cxp = x + ci * cwid, cyp = y + ri * rh;
            out += '<rect x="' + cxp.toFixed(1) + '" y="' + cyp.toFixed(1) + '" width="' + cwid.toFixed(1) +
              '" height="' + rh.toFixed(1) + '" fill="' + (ri === 0 ? escXml(theme.accent) : "none") +
              '" fill-opacity="' + (ri === 0 ? "1" : "0") + '" stroke="#9CA3AF" stroke-width="1.5"/>';
            out += '<text x="' + (cxp + 8).toFixed(1) + '" y="' + (cyp + rh / 2 + fsPx * 0.28).toFixed(1) +
              '" font-size="' + (fsPx * 0.75).toFixed(1) + '" fill="' + (ri === 0 ? "#ffffff" : escXml(color)) +
              '"' + (ri === 0 ? ' font-weight="700"' : "") + ' font-family="system-ui,sans-serif">' +
              escXml(String(cell == null ? "" : cell)).slice(0, 40) + "</text>";
          });
        });
      } else if (b.type === "grd") {
        var gt = "Live GRD: " + (b.label || "");
        var gtxt = String(b.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        out += '<text x="' + x.toFixed(1) + '" y="' + (y + fsPx).toFixed(1) + '" font-size="' +
          fsPx.toFixed(1) + '" font-weight="700" fill="' + escXml(color) +
          '" font-family="system-ui,sans-serif">' + escXml(gt).slice(0, 60) + "</text>";
        out += '<text x="' + x.toFixed(1) + '" y="' + (y + fsPx * 2.4).toFixed(1) + '" font-size="' +
          (fsPx * 0.75).toFixed(1) + '" fill="' + escXml(color) +
          '" font-family="system-ui,sans-serif">' + escXml(gtxt) + "</text>";
      } else if (b.type === "chart" || b.type === "smartart") {
        var inner = b.type === "chart"
          ? chartSvg({ chartType: b.chartType, title: b.chartTitle, labels: b.labels, values: b.values })
          : smartartSvg(b.diagram, b.items, theme.accent);
        out += '<svg x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
          '" height="' + h.toFixed(1) + '" viewBox="0 0 600 360">' + innerSvg(inner) + "</svg>";
      }
      out += "</g>";
    });
    // ink
    (slide.ink || []).forEach(function (st) {
      var d = (st.pts || []).map(function (p, k) {
        return (k ? "L" : "M") + (p[0] / 100 * W).toFixed(1) + " " + (p[1] / 100 * H).toFixed(1);
      }).join(" ");
      out += '<path d="' + d + '" fill="none" stroke="' + escXml(st.color || "#111827") +
        '" stroke-width="' + (st.width || 0.6) + '" stroke-linecap="round" stroke-linejoin="round"' +
        (st.tool === "high" ? ' opacity="0.45"' : "") + "/>";
    });
    if (deck.slideNumbers && typeof idx === "number") {
      out += '<text x="' + (W - 30) + '" y="' + (H - 24) + '" text-anchor="end" font-size="22" ' +
        'fill="' + escXml(theme.ink) + '" opacity="0.6" font-family="system-ui,sans-serif">' + (idx + 1) + "</text>";
    }
    out += "</svg>";
    return { svg: out, W: W, H: H };
  }

})();
