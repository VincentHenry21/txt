/* TXT Vector Studio TOOLS (Illustrator persona, v5).
   Ten tools registered into T.vector's tool dock. Every tool genuinely
   manipulates the SVG DOM. Uses T.vector._x internals (stable within v5).
   Conventions: IIFE, var T = window.TXT, no emojis, no CSS zoom. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T || !T.vector) { return; }
  var X = T.vector._x;
  var SVGNS = X.SVGNS;
  var V = T.vector;

  /* ================= helpers ================= */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) { for (var k in attrs) { n.setAttribute(k, attrs[k]); } }
    if (parent) { parent.appendChild(n); }
    return n;
  }
  function fmt(n) { return Math.round(n * 100) / 100; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function applyPaint(n) {
    var p = V.paint;
    n.setAttribute("fill", p.fill);
    n.setAttribute("stroke", p.stroke);
    n.setAttribute("stroke-width", String(p.strokeWidth));
    n.setAttribute("opacity", String(p.opacity));
  }
  /* nearest artwork element under the pointer (skips overlay/artboard/pasteboard) */
  function artTarget(e) {
    var n = e.target;
    while (n && n !== X.canvas()) {
      if (X.isArtwork(n)) { return n; }
      n = n.parentNode;
    }
    return null;
  }
  function setM(elm, m) { elm.setAttribute("transform", X.matrixStr(m)); }
  function optRow(host, html) {
    var d = document.createElement("div");
    d.className = "v-opt-row";
    d.innerHTML = html;
    host.appendChild(d);
    return d;
  }
  function numOpt(host, label, val, min, max, step, fn, title) {
    var w = optRow(host, '<label title="' + T.esc(title || label) + '">' + T.esc(label) +
      ' <input type="number" value="' + val + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>');
    var inp = w.querySelector("input");
    inp.addEventListener("input", function () { fn(parseFloat(inp.value)); });
    return inp;
  }
  function selOpt(host, label, options, val, fn, title) {
    var w = optRow(host, '<label title="' + T.esc(title || label) + '">' + T.esc(label) + ' <select></select></label>');
    var s = w.querySelector("select");
    options.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o.v; op.textContent = o.t;
      if (o.v === val) { op.selected = true; }
      s.appendChild(op);
    });
    s.addEventListener("change", function () { fn(s.value); });
    return s;
  }
  function btnOpt(host, label, icon, fn, title, active) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "vbtn sm" + (active ? " active" : "");
    b.title = title || label;
    b.innerHTML = V.icon(icon) + "<span>" + T.esc(label) + "</span>";
    b.addEventListener("click", function () { fn(b); });
    host.appendChild(b);
    return b;
  }

  /* ================= SELECT (V) ================= */
  var selectState = null;
  function mapBox(a, b) {
    var sx = a.w > 0.01 ? b.w / a.w : 1, sy = a.h > 0.01 ? b.h / a.h : 1;
    return new DOMMatrix().translate(b.x, b.y).scale(sx, sy).translate(-a.x, -a.y);
  }
  V.registerTool({
    id: "select", label: "Select", key: "V", icon: "select", cursor: "default",
    down: function (e, p) {
      var h = e.target && e.target.getAttribute ? e.target.getAttribute("data-handle") : null;
      if (h && V.selection().length) {
        var items = V.selection().map(function (elm) { return { el: elm, base: X.relMatrix(elm) }; });
        var u = X.unionBox(V.selection());
        V.checkpoint();
        selectState = { mode: "handle", handle: h, items: items, u: u, start: p,
          cx: u.x + u.w / 2, cy: u.y + u.h / 2,
          a0: Math.atan2(p.y - (u.y + u.h / 2), p.x - (u.x + u.w / 2)) };
        return;
      }
      var t = artTarget(e);
      if (t) {
        var cur = V.selection();
        if (e.shiftKey) {
          var i = cur.indexOf(t);
          if (i >= 0) { cur.splice(i, 1); } else { cur.push(t); }
          V.select(cur);
        } else if (cur.indexOf(t) < 0) {
          V.select([t]);
        }
        V.checkpoint();
        selectState = {
          mode: "move", start: p,
          items: V.selection().map(function (elm) { return { el: elm, base: X.relMatrix(elm) }; })
        };
      } else {
        if (!e.shiftKey) { V.select([]); }
        V.checkpoint();
        selectState = { mode: "marquee", start: p, rect: null, keep: e.shiftKey ? V.selection() : [] };
      }
    },
    move: function (e, p) {
      if (!selectState) { return; }
      var st = selectState, i;
      if (st.mode === "move") {
        var dx = p.x - st.start.x, dy = p.y - st.start.y;
        for (i = 0; i < st.items.length; i++) {
          setM(st.items[i].el, new DOMMatrix().translate(dx, dy).multiply(st.items[i].base));
        }
        V.refresh();
      } else if (st.mode === "marquee") {
        var x = Math.min(st.start.x, p.x), y = Math.min(st.start.y, p.y);
        var w = Math.abs(p.x - st.start.x), h = Math.abs(p.y - st.start.y);
        var hits = [];
        V.layers().forEach(function (g) {
          Array.prototype.forEach.call(g.childNodes, function (n) {
            if (n.nodeType !== 1) { return; }
            var b = X.xformBox(n);
            if (b && b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y) { hits.push(n); }
          });
        });
        V.select(st.keep.concat(hits.filter(function (n) { return st.keep.indexOf(n) < 0; })));
        var s = 1 / X.zoom();
        X.ovEl("rect", { x: x, y: y, width: w, height: h, fill: "rgba(49,168,255,0.12)", stroke: "#31A8FF", "stroke-width": 1 * s, "stroke-dasharray": (4 * s) + " " + (3 * s) });
      } else if (st.mode === "handle") {
        applyHandle(st, p, e.shiftKey);
        V.refresh();
      }
    },
    up: function () {
      if (selectState) { selectState = null; V.commit(); }
    },
    dblclick: function (e, p) {
      var t = artTarget(e);
      if (t && t.tagName === "text") { editText(t); }
    },
    cancel: function () { var had = !!selectState; selectState = null; X.clearOv(); X.drawSelBox(); return had; }
  });

  function applyHandle(st, p, uniform) {
    var u = st.u, nub;
    if (st.handle === "rot") {
      var a1 = Math.atan2(p.y - st.cy, p.x - st.cx);
      var deg = (a1 - st.a0) * 180 / Math.PI;
      if (uniform) { deg = Math.round(deg / 15) * 15; }
      var M = new DOMMatrix().translate(st.cx, st.cy).rotate(deg).translate(-st.cx, -st.cy);
      st.items.forEach(function (it) { setM(it.el, M.multiply(it.base)); });
      return;
    }
    var nx = u.x, ny = u.y, nw = u.w, nh = u.h;
    var id = st.handle;
    if (id.indexOf("e") >= 0) { nw = Math.max(2, p.x - u.x); }
    if (id.indexOf("w") >= 0) { nx = Math.min(p.x, u.x + u.w - 2); nw = Math.max(2, u.x + u.w - nx); }
    if (id.indexOf("s") >= 0) { nh = Math.max(2, p.y - u.y); }
    if (id.indexOf("n") >= 0) { ny = Math.min(p.y, u.y + u.h - 2); nh = Math.max(2, u.y + u.h - ny); }
    if (uniform) {
      var sc = Math.max(nw / u.w, nh / u.h);
      if (id === "n" || id === "s") { nw = u.w * sc; nx = u.x + (u.w - nw) / 2; }
      else if (id === "e" || id === "w") { nh = u.h * sc; ny = u.y + (u.h - nh) / 2; }
      else { nw = u.w * sc; nh = u.h * sc; }
      if (id.indexOf("w") >= 0) { nx = u.x + u.w - nw; }
      if (id.indexOf("n") >= 0) { ny = u.y + u.h - nh; }
    }
    nub = { x: nx, y: ny, w: nw, h: nh };
    var M2 = mapBox(u, nub);
    st.items.forEach(function (it) { setM(it.el, M2.multiply(it.base)); });
  }

  /* ================= NODE / DIRECT SELECT (A) ================= */
  var nodeState = null;
  function parsePath(d) {
    var segs = [], cur = { x: 0, y: 0 }, start = { x: 0, y: 0 };
    var toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    var i = 0, cmd = null;
    function num() { return parseFloat(toks[i++]); }
    function abs(x, y, rel) { return rel ? { x: cur.x + x, y: cur.y + y } : { x: x, y: y }; }
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i++]; } else if (!cmd) { break; }
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), p;
      if (C === "M" || C === "L") {
        p = abs(num(), num(), rel); segs.push({ c: C, pts: [p.x, p.y] }); cur = p;
        if (C === "M") { start = { x: p.x, y: p.y }; }
        if (/[0-9\-\.]/.test(toks[i] || "")) { cmd = C === "M" ? (rel ? "l" : "L") : cmd; }
      } else if (C === "H") { var hx = num(); p = rel ? { x: cur.x + hx, y: cur.y } : { x: hx, y: cur.y }; segs.push({ c: "L", pts: [p.x, p.y] }); cur = p;
      } else if (C === "V") { var vy = num(); p = rel ? { x: cur.x, y: cur.y + vy } : { x: cur.x, y: vy }; segs.push({ c: "L", pts: [p.x, p.y] }); cur = p;
      } else if (C === "C") {
        var p1 = abs(num(), num(), rel), p2 = abs(num(), num(), rel), p3 = abs(num(), num(), rel);
        segs.push({ c: "C", pts: [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y] }); cur = p3;
      } else if (C === "S") {
        var q2 = abs(num(), num(), rel), q3 = abs(num(), num(), rel), q1 = { x: cur.x, y: cur.y };
        var prev = segs[segs.length - 1];
        if (prev && prev.c === "C") { q1 = { x: 2 * cur.x - prev.pts[2], y: 2 * cur.y - prev.pts[3] }; }
        segs.push({ c: "C", pts: [q1.x, q1.y, q2.x, q2.y, q3.x, q3.y] }); cur = q3;
      } else if (C === "Q") {
        var r1 = abs(num(), num(), rel), r2 = abs(num(), num(), rel);
        segs.push({ c: "Q", pts: [r1.x, r1.y, r2.x, r2.y] }); cur = r2;
      } else if (C === "T") {
        var t2 = abs(num(), num(), rel), t1 = { x: cur.x, y: cur.y };
        var pv = segs[segs.length - 1];
        if (pv && pv.c === "Q") { t1 = { x: 2 * cur.x - pv.pts[0], y: 2 * cur.y - pv.pts[1] }; }
        segs.push({ c: "Q", pts: [t1.x, t1.y, t2.x, t2.y] }); cur = t2;
      } else if (C === "A") {
        var rx = num(), ry = num(), rot = num(), laf = num(), sf = num();
        var ept = abs(num(), num(), rel);
        segs.push({ c: "A", pts: [rx, ry, rot, laf, sf, ept.x, ept.y] }); cur = ept;
      } else if (C === "Z") { segs.push({ c: "Z", pts: [] }); cur = { x: start.x, y: start.y };
      } else { break; }
    }
    return segs;
  }
  function segsToD(segs) {
    return segs.map(function (s) {
      if (s.c === "Z") { return "Z"; }
      return s.c + s.pts.map(function (n) { return fmt(n); }).join(" ");
    }).join(" ");
  }
  function nodeTarget(elm) {
    var tag = elm.tagName;
    if (tag === "path") { return { kind: "path", segs: parsePath(elm.getAttribute("d") || "") }; }
    if (tag === "rect") { return { kind: "rect" }; }
    if (tag === "ellipse") { return { kind: "ellipse" }; }
    if (tag === "circle") { return { kind: "circle" }; }
    if (tag === "polygon" || tag === "polyline") { return { kind: "poly" }; }
    if (tag === "line") { return { kind: "line" }; }
    if (tag === "text") { return { kind: "text" }; }
    return null;
  }
  function drawNodes() {
    X.clearOv();
    if (!nodeState) { X.drawSelBox(); return; }
    var st = nodeState, s = 1 / X.zoom();
    var inv = st.rel.inverse();
    function vp(x, y) { var q = new DOMPoint(x, y).matrixTransform(st.rel); return { x: q.x, y: q.y }; }
    function dot(x, y, r, fill, kind, data) {
      var p = vp(x, y);
      var c = X.ovEl("circle", { cx: p.x, cy: p.y, r: r * s, fill: fill, stroke: "#31A8FF", "stroke-width": 1.4 * s, cursor: "move" });
      c.style.pointerEvents = "all";
      c.setAttribute("data-node", kind);
      for (var k in data) { c.setAttribute("data-" + k, data[k]); }
      return p;
    }
    function anchorSq(x, y, data) {
      var p = vp(x, y), r = 4.5 * s;
      var q = X.ovEl("rect", { x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r, fill: "#fff", stroke: "#31A8FF", "stroke-width": 1.4 * s, cursor: "move" });
      q.style.pointerEvents = "all";
      q.setAttribute("data-node", "anchor");
      for (var k in data) { q.setAttribute("data-" + k, data[k]); }
      return p;
    }
    var t = st.target, elm = st.el;
    function numAttr(n, k) { return parseFloat(elm.getAttribute(k) || "0"); }
    if (t.kind === "path") {
      var anchors = [];
      t.segs.forEach(function (sg, si) {
        var n = sg.pts.length;
        if (!n) { return; }
        var ax = sg.pts[n - 2], ay = sg.pts[n - 1];
        anchors.push({ si: si, x: ax, y: ay });
        if (sg.c === "C") {
          var p0 = anchors.length > 1 ? anchors[anchors.length - 2] : (t.segs[0].pts.length ? { x: t.segs[0].pts[0], y: t.segs[0].pts[1] } : { x: ax, y: ay });
          var a = vp(ax, ay), c1 = vp(sg.pts[0], sg.pts[1]), c2 = vp(sg.pts[2], sg.pts[3]);
          X.ovEl("line", { x1: a.x, y1: a.y, x2: c1.x, y2: c1.y, stroke: "#31A8FF", "stroke-width": 1 * s });
          X.ovEl("line", { x1: a.x, y1: a.y, x2: c2.x, y2: c2.y, stroke: "#31A8FF", "stroke-width": 1 * s });
          dot(sg.pts[0], sg.pts[1], 3.2, "#fff", "ctrl", { seg: si, cp: "0" });
          dot(sg.pts[2], sg.pts[3], 3.2, "#fff", "ctrl", { seg: si, cp: "2" });
        } else if (sg.c === "Q") {
          var qa = vp(ax, ay), qc = vp(sg.pts[0], sg.pts[1]);
          X.ovEl("line", { x1: qa.x, y1: qa.y, x2: qc.x, y2: qc.y, stroke: "#31A8FF", "stroke-width": 1 * s });
          dot(sg.pts[0], sg.pts[1], 3.2, "#fff", "ctrl", { seg: si, cp: "0" });
        }
      });
      anchors.forEach(function (a, ai) { anchorSq(a.x, a.y, { seg: a.si, idx: ai }); });
    } else if (t.kind === "rect") {
      var x = numAttr(0, "x"), y = numAttr(0, "y"), w = numAttr(0, "width"), hh = numAttr(0, "height");
      [["x", "y", x, y], ["x2", "y", x + w, y], ["x", "y2", x, y + hh], ["x2", "y2", x + w, y + hh]].forEach(function (c) {
        anchorSq(c[2], c[3], { corner: c[0] + c[1] });
      });
    } else if (t.kind === "ellipse" || t.kind === "circle") {
      var cx = numAttr(0, "cx"), cy = numAttr(0, "cy");
      var rx = t.kind === "circle" ? numAttr(0, "r") : numAttr(0, "rx");
      var ry = t.kind === "circle" ? numAttr(0, "r") : numAttr(0, "ry");
      anchorSq(cx - rx, cy, { e: "l" }); anchorSq(cx + rx, cy, { e: "r" });
      anchorSq(cx, cy - ry, { e: "t" }); anchorSq(cx, cy + ry, { e: "b" });
    } else if (t.kind === "poly") {
      (elm.getAttribute("points") || "").trim().split(/[\s,]+/).forEach(function (_, pi, arr) {
        if (pi % 2) { return; }
        anchorSq(parseFloat(arr[pi]), parseFloat(arr[pi + 1]), { vi: pi / 2 });
      });
    } else if (t.kind === "line") {
      anchorSq(numAttr(0, "x1"), numAttr(0, "y1"), { le: "1" });
      anchorSq(numAttr(0, "x2"), numAttr(0, "y2"), { le: "2" });
    } else if (t.kind === "text") {
      anchorSq(numAttr(0, "x"), numAttr(0, "y"), { te: "1" });
    }
  }
  V.registerTool({
    id: "node", label: "Direct select", key: "A", icon: "node", cursor: "default",
    activate: function () { refreshNodeTarget(); },
    deactivate: function () { nodeState = null; },
    down: function (e, p) {
      var nn = e.target && e.target.getAttribute ? e.target.getAttribute("data-node") : null;
      if (nn && nodeState) {
        V.checkpoint();
        var g = e.target;
        nodeState.drag = {
          kind: nn, seg: g.getAttribute("data-seg"), cp: g.getAttribute("data-cp"),
          idx: g.getAttribute("data-idx"), corner: g.getAttribute("data-corner"),
          e: g.getAttribute("data-e"), vi: g.getAttribute("data-vi"),
          le: g.getAttribute("data-le"), te: g.getAttribute("data-te")
        };
        return;
      }
      var t = artTarget(e);
      if (t) {
        V.select([t]);
        refreshNodeTarget();
      } else { V.select([]); nodeState = null; X.clearOv(); }
    },
    move: function (e, p) {
      if (!nodeState || !nodeState.drag) { return; }
      nodeDragTo(p);
    },
    up: function () {
      if (nodeState && nodeState.drag) { nodeState.drag = null; V.commit(); }
    },
    cancel: function () { if (nodeState) { nodeState.drag = null; } return false; },
    options: function (host) {
      optRow(host, '<span class="v-hint">Drag points to reshape. Works on paths and basic shapes.</span>');
    }
  });
  function refreshNodeTarget() {
    var sels = V.selection();
    nodeState = null;
    if (!sels.length) { X.clearOv(); return; }
    var tgt = nodeTarget(sels[0]);
    if (!tgt) { X.clearOv(); X.drawSelBox(); return; }
    nodeState = { el: sels[0], target: tgt, rel: X.relMatrix(sels[0]), drag: null };
    drawNodes();
  }
  T.bus.on("vector:selection", function () {
    if (V.tool() && V.tool().id === "node") { refreshNodeTarget(); }
  });
  function nodeDragTo(p) {
    var st = nodeState, d = st.drag, elm = st.el, t = st.target;
    var inv = st.rel.inverse();
    var lp = new DOMPoint(p.x, p.y).matrixTransform(inv);
    function setA(k, v) { elm.setAttribute(k, String(fmt(v))); }
    function gA(k) { return parseFloat(elm.getAttribute(k) || "0"); }
    if (t.kind === "path") {
      var si = parseInt(d.seg, 10), sg = t.segs[si];
      if (!sg) { return; }
      if (d.kind === "anchor") {
        var n = sg.pts.length, ox = sg.pts[n - 2], oy = sg.pts[n - 1];
        var dx = lp.x - ox, dy = lp.y - oy;
        sg.pts[n - 2] = lp.x; sg.pts[n - 1] = lp.y;
        if (sg.c === "C") { sg.pts[0] += dx; sg.pts[1] += dy; sg.pts[2] += dx; sg.pts[3] += dy; }
        if (sg.c === "Q") { sg.pts[0] += dx; sg.pts[1] += dy; }
        var nx = t.segs[si + 1];
        if (nx && nx.c === "C") { nx.pts[0] += dx; nx.pts[1] += dy; }
        if (nx && nx.c === "Q") { nx.pts[0] += dx; nx.pts[1] += dy; }
      } else if (d.kind === "ctrl") {
        var ci = parseInt(d.cp, 10);
        sg.pts[ci] = lp.x; sg.pts[ci + 1] = lp.y;
      }
      elm.setAttribute("d", segsToD(t.segs));
    } else if (t.kind === "rect") {
      var x = gA("x"), y = gA("y"), w = gA("width"), h = gA("height");
      var c = d.corner || "";
      if (c.indexOf("x2") >= 0) { w = Math.max(1, lp.x - x); } else { var nx2 = Math.min(lp.x, x + w - 1); w = x + w - nx2; x = nx2; }
      if (c.indexOf("y2") >= 0) { h = Math.max(1, lp.y - y); } else { var ny2 = Math.min(lp.y, y + h - 1); h = y + h - ny2; y = ny2; }
      setA("x", x); setA("y", y); setA("width", w); setA("height", h);
    } else if (t.kind === "ellipse" || t.kind === "circle") {
      var cx = gA("cx"), cy = gA("cy");
      if (t.kind === "circle") {
        var rr = Math.max(1, Math.hypot(lp.x - cx, lp.y - cy)); setA("r", rr);
      } else {
        var rx = gA("rx"), ry = gA("ry");
        if (d.e === "l") { rx = Math.max(1, cx - lp.x); cx -= (rx - gA("rx")); }
        else if (d.e === "r") { rx = Math.max(1, lp.x - cx); }
        else if (d.e === "t") { ry = Math.max(1, cy - lp.y); cy -= (ry - gA("ry")); }
        else if (d.e === "b") { ry = Math.max(1, lp.y - cy); }
        setA("cx", cx); setA("cy", cy); setA("rx", rx); setA("ry", ry);
      }
    } else if (t.kind === "poly") {
      var pts = (elm.getAttribute("points") || "").trim().split(/[\s,]+/).map(parseFloat);
      var vi = parseInt(d.vi, 10);
      pts[vi * 2] = fmt(lp.x); pts[vi * 2 + 1] = fmt(lp.y);
      elm.setAttribute("points", pts.join(" "));
    } else if (t.kind === "line") {
      setA(d.le === "1" ? "x1" : "x2", lp.x); setA(d.le === "1" ? "y1" : "y2", lp.y);
    } else if (t.kind === "text") {
      setA("x", lp.x); setA("y", lp.y);
    }
    drawNodes();
  }

  /* ================= PEN (P) ================= */
  var penPts = null, penDrag = false;
  function penPreview(p) {
    X.clearOv(); X.drawSelBox();
    var s = 1 / X.zoom();
    if (penPts && penPts.length) {
      var d = "M" + penPts.map(function (q) { return fmt(q.x) + " " + fmt(q.y); }).join(" L");
      X.ovEl("path", { d: d, fill: "none", stroke: "#31A8FF", "stroke-width": 1.4 * s });
      penPts.forEach(function (q) {
        X.ovEl("rect", { x: q.x - 3 * s, y: q.y - 3 * s, width: 6 * s, height: 6 * s, fill: "#fff", stroke: "#31A8FF", "stroke-width": 1.2 * s });
      });
      var last = penPts[penPts.length - 1];
      X.ovEl("line", { x1: last.x, y1: last.y, x2: p.x, y2: p.y, stroke: "#31A8FF", "stroke-width": 1 * s, "stroke-dasharray": (4 * s) + " " + (3 * s) });
    }
  }
  function penFinish(closed) {
    if (!penPts || penPts.length < 2) { penPts = null; X.clearOv(); X.drawSelBox(); return; }
    var d = "M" + fmt(penPts[0].x) + " " + fmt(penPts[0].y);
    for (var i = 1; i < penPts.length; i++) {
      var a = penPts[i - 1], b = penPts[i];
      if (a.h2 && b.h1) { d += " C" + fmt(a.h2.x) + " " + fmt(a.h2.y) + " " + fmt(b.h1.x) + " " + fmt(b.h1.y) + " " + fmt(b.x) + " " + fmt(b.y); }
      else { d += " L" + fmt(b.x) + " " + fmt(b.y); }
    }
    if (closed) { d += " Z"; }
    V.checkpoint();
    var path = el("path", { d: d }, V.activeLayer());
    applyPaint(path);
    penPts = null;
    V.select([path]);
    V.commit();
  }
  V.registerTool({
    id: "pen", label: "Pen", key: "P", icon: "pen", cursor: "crosshair",
    activate: function () { penPts = null; },
    deactivate: function () { penPts = null; X.clearOv(); X.drawSelBox(); },
    down: function (e, p) {
      if (!penPts) { penPts = []; }
      if (penPts.length >= 2 && dist(p, penPts[0]) < 10 / X.zoom()) { penFinish(true); return; }
      penPts.push({ x: p.x, y: p.y, h1: null, h2: null });
      penDrag = true;
      penPreview(p);
    },
    move: function (e, p) {
      if (penPts && penDrag && penPts.length) {
        var a = penPts[penPts.length - 1];
        if (dist(p, a) > 4 / X.zoom()) {
          a.h2 = { x: p.x, y: p.y };
          a.h1 = { x: 2 * a.x - p.x, y: 2 * a.y - p.y };
        }
      }
      if (penPts) { penPreview(p); }
    },
    up: function () { penDrag = false; },
    dblclick: function () { penFinish(false); },
    toolKey: function (e) { if (e.key === "Enter") { penFinish(false); } },
    cancel: function () { var had = !!penPts; penPts = null; X.clearOv(); X.drawSelBox(); return had; },
    options: function (host) {
      optRow(host, '<span class="v-hint">Click to place anchors, drag for curves. Click the first point to close. Enter finishes.</span>');
    }
  });

  /* ================= SHAPES (M) ================= */
  var shapeKinds = ["rect", "round", "ellipse", "polygon", "star"];
  var shapeIdx = 0, shapeSides = 6, starPts = 5, roundR = 14;
  var shapeDrag = null;
  function polyPoints(cx, cy, r, n, rot, inner) {
    var pts = [];
    var steps = inner ? n * 2 : n;
    for (var i = 0; i < steps; i++) {
      var rr = inner && (i % 2) ? r * 0.5 : r;
      var a = rot + (i * 2 * Math.PI) / steps;
      pts.push(fmt(cx + rr * Math.cos(a)) + "," + fmt(cy + rr * Math.sin(a)));
    }
    return pts.join(" ");
  }
  V.registerTool({
    id: "shapes", label: "Shapes", key: "M", icon: "rect", cursor: "crosshair",
    onReselect: function () {
      shapeIdx = (shapeIdx + 1) % shapeKinds.length;
      V.repaintOptions();
    },
    options: function (host) {
      var row = optRow(host, "");
      shapeKinds.forEach(function (k, i) {
        btnOpt(row, k, k === "round" ? "rect" : k, function () { shapeIdx = i; V.repaintOptions(); }, "Shape: " + k, i === shapeIdx);
      });
      numOpt(host, "Sides", shapeSides, 3, 12, 1, function (v) { shapeSides = T.clamp(Math.round(v) || 6, 3, 12); }, "Polygon sides");
      numOpt(host, "Star pts", starPts, 3, 12, 1, function (v) { starPts = T.clamp(Math.round(v) || 5, 3, 12); }, "Star points");
      numOpt(host, "Corner", roundR, 0, 200, 1, function (v) { roundR = Math.max(0, v || 0); }, "Rounded rect corner radius");
    },
    down: function (e, p) {
      V.checkpoint();
      shapeDrag = { start: p, el: null };
    },
    move: function (e, p) {
      if (!shapeDrag) { return; }
      var st = shapeDrag, a = st.start;
      var x = Math.min(a.x, p.x), y = Math.min(a.y, p.y);
      var w = Math.abs(p.x - a.x), h = Math.abs(p.y - a.y);
      if (e.shiftKey) { var m = Math.max(w, h); w = m; h = m; x = p.x < a.x ? a.x - m : a.x; y = p.y < a.y ? a.y - m : a.y; }
      if (w < 1 && h < 1) { return; }
      if (st.el && st.el.parentNode) { st.el.parentNode.removeChild(st.el); }
      var kind = shapeKinds[shapeIdx], n;
      if (kind === "rect") { n = el("rect", { x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h) }); }
      else if (kind === "round") { n = el("rect", { x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h), rx: fmt(Math.min(roundR, w / 2, h / 2)) }); }
      else if (kind === "ellipse") { n = el("ellipse", { cx: fmt(x + w / 2), cy: fmt(y + h / 2), rx: fmt(w / 2), ry: fmt(h / 2) }); }
      else {
        var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
        var pts = kind === "polygon" ? polyPoints(cx, cy, r, shapeSides, -Math.PI / 2, false) : polyPoints(cx, cy, r, starPts, -Math.PI / 2, true);
        n = el("polygon", { points: pts });
        if (kind === "star") { n.setAttribute("data-star", "1"); }
      }
      applyPaint(n);
      V.activeLayer().appendChild(n);
      st.el = n;
    },
    up: function () {
      if (shapeDrag) {
        if (shapeDrag.el) { V.select([shapeDrag.el]); }
        shapeDrag = null;
        V.commit();
      }
    },
    cancel: function () {
      var had = !!shapeDrag;
      if (shapeDrag && shapeDrag.el && shapeDrag.el.parentNode) { shapeDrag.el.parentNode.removeChild(shapeDrag.el); }
      shapeDrag = null; return had;
    }
  });
  /* ================= BRUSH (B) ================= */
  var brushPts = null;
  function smoothPath(pts) {
    if (pts.length < 3) { return "M" + fmt(pts[0].x) + " " + fmt(pts[0].y) + " L" + fmt(pts[pts.length - 1].x) + " " + fmt(pts[pts.length - 1].y); }
    var d = "M" + fmt(pts[0].x) + " " + fmt(pts[0].y);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      var c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += " C" + fmt(c1.x) + " " + fmt(c1.y) + " " + fmt(c2.x) + " " + fmt(c2.y) + " " + fmt(p2.x) + " " + fmt(p2.y);
    }
    return d;
  }
  V.registerTool({
    id: "brush", label: "Brush", key: "B", icon: "brush", cursor: "crosshair",
    options: function (host) {
      numOpt(host, "Size", V.paint.strokeWidth, 0.5, 100, 0.5, function (v) { V.paint.strokeWidth = T.clamp(v || 1, 0.5, 100); }, "Brush size");
      optRow(host, '<span class="v-hint">Freehand strokes are smoothed into bezier paths.</span>');
    },
    down: function (e, p) { V.checkpoint(); brushPts = [p]; },
    move: function (e, p) {
      if (!brushPts) { return; }
      var last = brushPts[brushPts.length - 1];
      if (dist(p, last) > 2 / X.zoom()) { brushPts.push(p); }
    },
    up: function () {
      if (!brushPts) { return; }
      var pts = brushPts;
      brushPts = null;
      if (!pts.length) { return; }
      var n;
      if (pts.length === 1) {
        n = el("circle", { cx: fmt(pts[0].x), cy: fmt(pts[0].y), r: fmt(V.paint.strokeWidth / 2) });
      } else {
        n = el("path", { d: smoothPath(pts), fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
      }
      n.setAttribute("stroke", V.paint.stroke);
      n.setAttribute("stroke-width", String(V.paint.strokeWidth));
      n.setAttribute("opacity", String(V.paint.opacity));
      if (n.tagName === "circle") { n.setAttribute("fill", V.paint.stroke); n.setAttribute("stroke", "none"); }
      V.activeLayer().appendChild(n);
      V.select([n]);
      V.commit();
    },
    cancel: function () { var had = !!brushPts; brushPts = null; return had; }
  });

  /* ================= TYPE (T) ================= */
  var typeSize = 28, typeFamily = "Inter, sans-serif";
  function editText(t) {
    var b = X.xformBox(t);
    if (!b) { return; }
    V.beginTextEdit(b.x, b.y, t.textContent, function (v) {
      if (v === null) { return; }
      V.checkpoint();
      t.textContent = v;
      V.commit();
    });
  }
  V.registerTool({
    id: "type", label: "Type", key: "T", icon: "type", cursor: "text",
    options: function (host) {
      numOpt(host, "Size", typeSize, 6, 400, 1, function (v) { typeSize = T.clamp(Math.round(v) || 28, 6, 400); }, "Font size");
      selOpt(host, "Font", [
        { v: "Inter, sans-serif", t: "Inter" }, { v: "Georgia, serif", t: "Georgia" },
        { v: "Playfair Display, serif", t: "Playfair" }, { v: "JetBrains Mono, monospace", t: "JetBrains Mono" },
        { v: "Arial, sans-serif", t: "Arial" }, { v: "Noto Sans Myanmar, sans-serif", t: "Noto Myanmar" }
      ], typeFamily, function (v) { typeFamily = v; }, "Font family");
    },
    down: function (e, p) {
      var t = artTarget(e);
      if (t && t.tagName === "text") { editText(t); return; }
      var at = { x: p.x, y: p.y };
      V.beginTextEdit(at.x, at.y, "", function (v) {
        if (v === null || !v) { return; }
        V.checkpoint();
        var n = el("text", { x: fmt(at.x), y: fmt(at.y), "font-size": typeSize, "font-family": typeFamily, fill: V.paint.fill === "#ffffff" ? "#1a1a1a" : V.paint.fill }, V.activeLayer());
        n.textContent = v;
        V.select([n]);
        V.commit();
      });
    }
  });

  /* ================= EYEDROPPER (I) ================= */
  V.registerTool({
    id: "eyedropper", label: "Eyedropper", key: "I", icon: "eyedropper", cursor: "crosshair",
    down: function (e) {
      var t = artTarget(e);
      if (!t) { T.toast("Nothing to sample here."); return; }
      var f = t.getAttribute("fill"), s = t.getAttribute("stroke"), w = t.getAttribute("stroke-width");
      if (f && f !== "none") { V.paint.fill = f; }
      if (s && s !== "none") { V.paint.stroke = s; }
      if (w) { V.paint.strokeWidth = parseFloat(w) || V.paint.strokeWidth; }
      V.repaintOptions();
      T.toast("Sampled fill and stroke.");
    },
    options: function (host) {
      optRow(host, '<span class="v-hint">Click any shape to sample its fill and stroke.</span>');
    }
  });

  /* ================= HAND (H) ================= */
  V.registerTool({
    id: "hand", label: "Hand", key: "H", icon: "hand", cursor: "grab",
    options: function (host) {
      optRow(host, '<span class="v-hint">Drag to pan. Middle-drag pans with any tool. Ctrl+wheel zooms.</span>');
    }
  });

  /* ================= ZOOM (Z) ================= */
  V.registerTool({
    id: "zoom", label: "Zoom", key: "Z", icon: "zoom", cursor: "zoom-in",
    down: function (e) {
      X.zoomAt(e.clientX, e.clientY, e.altKey ? 1 / 1.4 : 1.4);
    },
    options: function (host) {
      optRow(host, '<span class="v-hint">Click to zoom in, Alt+click to zoom out.</span>');
      btnOpt(host, "Fit", "fit", function () { V.zoomFit(); }, "Fit artboard to view");
    }
  });

})();
