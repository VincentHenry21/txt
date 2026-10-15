/* NXT VAC geometry core (pure math, no DOM).
   Exposes T.vacGeom. Everything here is a pure function so it can be unit
   tested without a browser (see test/vac-engine.test.js).

   Contents:
   - adaptive cubic/quadratic Bezier flattening (recursive subdivision by
     flatness tolerance; a straight line yields exactly 2 points)
   - full SVG path `d` parser (M L H V C S Q T A Z, absolute + relative)
   - flattenD: path data -> polyline loops (arcs are sampled, beziers are
     adaptively subdivided; documented polygonal approximation used by the
     PDF/EPS exporters and the trace preview)
   - marching-squares raster -> vector trace (potrace-style contour
     extraction with saddle disambiguation by cell-center value)
   - box blur pre-process for tracing
   - smart-guide snap math
   - artboard hit-testing / export-box math
   - gradient stop serialization round-trip
   - minimal vector PDF + EPS writers (honest: curves are emitted as
     adaptively flattened polylines, text uses base-14 Helvetica)

   Conventions: IIFE, var T = window.TXT, no emojis. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) { return; }
  var G = {};

  function r3(n) { return Math.round(n * 1000) / 1000; }
  G.r3 = r3;

  /* ================= Bezier flattening ================= */
  function cubicAt(p0, p1, p2, p3, t) {
    var mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
    };
  }
  function quadAt(p0, p1, p2, t) {
    var mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
    };
  }
  /* Distance from point p to the line through a,b. */
  function distToLine(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy);
    if (len < 1e-12) { return Math.hypot(p.x - a.x, p.y - a.y); }
    return Math.abs((p.y - a.y) * dx - (p.x - a.x) * dy) / len;
  }
  /* Adaptive cubic flatten. Returns points INCLUDING both endpoints. */
  function flattenCubic(p0, p1, p2, p3, tol) {
    tol = tol === undefined ? 0.5 : tol;
    var pts = [{ x: p0.x, y: p0.y }];
    (function rec(a, b, c, d, depth) {
      var flat = Math.max(distToLine(b, a, d), distToLine(c, a, d));
      if (flat <= tol || depth >= 12) { pts.push({ x: d.x, y: d.y }); return; }
      var ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      var cd = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      var abc = { x: (ab.x + bc.x) / 2, y: (ab.y + bc.y) / 2 };
      var bcd = { x: (bc.x + cd.x) / 2, y: (bc.y + cd.y) / 2 };
      var mid = { x: (abc.x + bcd.x) / 2, y: (abc.y + bcd.y) / 2 };
      rec(a, ab, abc, mid, depth + 1);
      rec(mid, bcd, cd, d, depth + 1);
    })(p0, p1, p2, p3, 0);
    return pts;
  }
  function flattenQuad(p0, p1, p2, tol) {
    tol = tol === undefined ? 0.5 : tol;
    var pts = [{ x: p0.x, y: p0.y }];
    (function rec(a, b, c, depth) {
      var flat = distToLine(b, a, c);
      if (flat <= tol || depth >= 12) { pts.push({ x: c.x, y: c.y }); return; }
      var ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      var mid = { x: (ab.x + bc.x) / 2, y: (ab.y + bc.y) / 2 };
      rec(a, ab, mid, depth + 1);
      rec(mid, bc, c, depth + 1);
    })(p0, p1, p2, 0);
    return pts;
  }
  G.cubicAt = cubicAt;
  G.quadAt = quadAt;
  G.flattenCubic = flattenCubic;
  G.flattenQuad = flattenQuad;

  /* ================= path data parser ================= */
  /* Returns segments: [{c:'M'|'L'|'C'|'Q'|'Z', pts:[...]}] in absolute coords.
     S/T are resolved to C/Q by reflection; A is kept as {c:'A', pts:[rx,ry,rot,laf,sf,x,y]}. */
  function parseD(d) {
    var toks = String(d || "").match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
    var segs = [];
    if (!toks) { return segs; }
    var i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = "";
    var c1x = 0, c1y = 0, q1x = 0, q1y = 0, prevC = "";
    function isCmd(t) { return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(t); }
    function num() { return parseFloat(toks[i++]); }
    while (i < toks.length) {
      var t = toks[i++];
      if (!isCmd(t)) { i--; t = cmd || "M"; }
      var rel = t !== t.toUpperCase(), C = t.toUpperCase();
      cmd = t;
      if (C === "M") {
        var nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; sx = nx; sy = ny;
        segs.push({ c: "M", pts: [x, y] });
        cmd = rel ? "l" : "L";
        while (i < toks.length && !isCmd(toks[i])) {
          var ax = num(), ay = num();
          if (rel) { ax += x; ay += y; }
          x = ax; y = ay;
          segs.push({ c: "L", pts: [x, y] });
        }
      } else if (C === "Z") {
        segs.push({ c: "Z", pts: [] });
        x = sx; y = sy;
      } else if (C === "L") {
        do {
          var lx = num(), ly = num();
          if (rel) { lx += x; ly += y; }
          x = lx; y = ly;
          segs.push({ c: "L", pts: [x, y] });
        } while (i < toks.length && !isCmd(toks[i]));
      } else if (C === "H") {
        do { var hx = num(); if (rel) { hx += x; } x = hx; segs.push({ c: "L", pts: [x, y] }); }
        while (i < toks.length && !isCmd(toks[i]));
      } else if (C === "V") {
        do { var vy = num(); if (rel) { vy += y; } y = vy; segs.push({ c: "L", pts: [x, y] }); }
        while (i < toks.length && !isCmd(toks[i]));
      } else if (C === "C") {
        do {
          var p1x = num(), p1y = num(), p2x = num(), p2y = num(), ex = num(), ey = num();
          if (rel) { p1x += x; p1y += y; p2x += x; p2y += y; ex += x; ey += y; }
          segs.push({ c: "C", pts: [p1x, p1y, p2x, p2y, ex, ey] });
          c1x = p2x; c1y = p2y; x = ex; y = ey;
        } while (i < toks.length && !isCmd(toks[i]));
        prevC = "C";
      } else if (C === "S") {
        do {
          var s2x = num(), s2y = num(), sex = num(), sey = num();
          var s1x = (prevC === "C" || prevC === "S") ? 2 * x - c1x : x;
          var s1y = (prevC === "C" || prevC === "S") ? 2 * y - c1y : y;
          if (rel) { s2x += x; s2y += y; sex += x; sey += y; }
          segs.push({ c: "C", pts: [s1x, s1y, s2x, s2y, sex, sey] });
          c1x = s2x; c1y = s2y; x = sex; y = sey;
        } while (i < toks.length && !isCmd(toks[i]));
        prevC = "S";
      } else if (C === "Q") {
        do {
          var qx = num(), qy = num(), qex = num(), qey = num();
          if (rel) { qx += x; qy += y; qex += x; qey += y; }
          segs.push({ c: "Q", pts: [qx, qy, qex, qey] });
          q1x = qx; q1y = qy; x = qex; y = qey;
        } while (i < toks.length && !isCmd(toks[i]));
        prevC = "Q";
      } else if (C === "T") {
        do {
          var tx = num(), ty = num();
          var tqx = (prevC === "Q" || prevC === "T") ? 2 * x - q1x : x;
          var tqy = (prevC === "Q" || prevC === "T") ? 2 * y - q1y : y;
          if (rel) { tx += x; ty += y; }
          segs.push({ c: "Q", pts: [tqx, tqy, tx, ty] });
          q1x = tqx; q1y = tqy; x = tx; y = ty;
        } while (i < toks.length && !isCmd(toks[i]));
        prevC = "T";
      } else if (C === "A") {
        do {
          var rx = num(), ry = num(), rot = num(), laf = num(), sf = num();
          var aex = num(), aey = num();
          if (rel) { aex += x; aey += y; }
          segs.push({ c: "A", pts: [rx, ry, rot, laf, sf, aex, aey] });
          x = aex; y = aey;
        } while (i < toks.length && !isCmd(toks[i]));
        prevC = "A";
      }
      if (C !== "C" && C !== "S") { /* keep prevC for S */ }
      if (C !== "Q" && C !== "T") { /* keep prevC for T */ }
      if ("CS".indexOf(C) < 0) { if (prevC === "C" || prevC === "S") { /* refreshed below */ } }
      // normalize reflection memory: only S follows C/S, only T follows Q/T
      if (C === "C" || C === "S") { prevC = C; } else if (C === "Q" || C === "T") { prevC = C; } else { prevC = ""; }
    }
    return segs;
  }
  G.parseD = parseD;

  /* Sample an SVG arc (endpoint parameterization) into points. */
  function arcPoints(x1, y1, rx, ry, rot, laf, sf, x2, y2) {
    var pts = [];
    var phi = rot * Math.PI / 180;
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
    var y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (rx < 1e-9 || ry < 1e-9) { return [{ x: x2, y: y2 }]; }
    var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (lam > 1) { var s = Math.sqrt(lam); rx *= s; ry *= s; }
    var num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den2 = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = den2 < 1e-12 ? 0 : Math.sqrt(Math.max(0, num2 / den2));
    if (laf === sf) { co = -co; }
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x1 + x2) / 2;
    var cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) {
      var dot = ux * vx + uy * vy, len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (len < 1e-12) { return 0; }
      var a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
      return (ux * vy - uy * vx < 0) ? -a : a;
    }
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    var dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cxp) / ry);
    dt = dt % (2 * Math.PI);
    if (!sf && dt > 0) { dt -= 2 * Math.PI; }
    if (sf && dt < 0) { dt += 2 * Math.PI; }
    var n = Math.max(8, Math.ceil(Math.abs(dt) / (Math.PI / 36)));
    for (var k = 1; k <= n; k++) {
      var t = t1 + dt * k / n;
      pts.push({
        x: cx + rx * Math.cos(phi) * Math.cos(t) - ry * Math.sin(phi) * Math.sin(t),
        y: cy + rx * Math.sin(phi) * Math.cos(t) + ry * Math.cos(phi) * Math.sin(t)
      });
    }
    return pts;
  }

  /* Flatten path data into closed/open polyline loops.
     Returns [{pts:[{x,y}...], closed:bool}]. Curves are adaptively
     subdivided (tol), arcs are sampled every 5 degrees. */
  function flattenD(d, tol) {
    tol = tol === undefined ? 0.5 : tol;
    var segs = parseD(d);
    var loops = [], cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
    function pushPt(p) {
      var l = cur.pts[cur.pts.length - 1];
      if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-9) { cur.pts.push({ x: p.x, y: p.y }); }
    }
    segs.forEach(function (sg) {
      if (sg.c === "M") {
        if (cur && cur.pts.length) { loops.push(cur); }
        cx = sg.pts[0]; cy = sg.pts[1]; sx = cx; sy = cy;
        cur = { pts: [{ x: cx, y: cy }], closed: false };
      } else if (sg.c === "Z") {
        if (cur) { cur.closed = true; pushPt({ x: sx, y: sy }); loops.push(cur); cur = null; }
        cx = sx; cy = sy;
      } else if (sg.c === "L") {
        if (!cur) { cur = { pts: [{ x: cx, y: cy }], closed: false }; }
        cx = sg.pts[0]; cy = sg.pts[1];
        pushPt({ x: cx, y: cy });
      } else if (sg.c === "C") {
        if (!cur) { cur = { pts: [{ x: cx, y: cy }], closed: false }; }
        var p = sg.pts;
        var fp = flattenCubic({ x: cx, y: cy }, { x: p[0], y: p[1] }, { x: p[2], y: p[3] }, { x: p[4], y: p[5] }, tol);
        for (var k = 1; k < fp.length; k++) { pushPt(fp[k]); }
        cx = p[4]; cy = p[5];
      } else if (sg.c === "Q") {
        if (!cur) { cur = { pts: [{ x: cx, y: cy }], closed: false }; }
        var q = sg.pts;
        var fq = flattenQuad({ x: cx, y: cy }, { x: q[0], y: q[1] }, { x: q[2], y: q[3] }, tol);
        for (var k2 = 1; k2 < fq.length; k2++) { pushPt(fq[k2]); }
        cx = q[2]; cy = q[3];
      } else if (sg.c === "A") {
        if (!cur) { cur = { pts: [{ x: cx, y: cy }], closed: false }; }
        var a = sg.pts;
        var ap = arcPoints(cx, cy, a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
        ap.forEach(pushPt);
        cx = a[5]; cy = a[6];
      }
    });
    if (cur && cur.pts.length) { loops.push(cur); }
    return loops;
  }
  G.flattenD = flattenD;

  /* ================= polygon utils ================= */
  function polyBBox(pts) {
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function polyArea(pts) {
    var a = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += (pts[j].x * pts[i].y - pts[i].x * pts[j].y);
    }
    return a / 2;
  }
  function ptsToD(pts, close) {
    if (!pts.length) { return ""; }
    var d = "M" + r3(pts[0].x) + " " + r3(pts[0].y);
    for (var i = 1; i < pts.length; i++) { d += "L" + r3(pts[i].x) + " " + r3(pts[i].y); }
    return close === false ? d : d + "Z";
  }
  G.polyBBox = polyBBox;
  G.polyArea = polyArea;
  G.ptsToD = ptsToD;

  /* ================= box blur (trace pre-process) ================= */
  /* gray: array-like of 0..255, length W*H. radius 0 = copy. */
  function boxBlur(gray, W, H, radius) {
    var r = Math.max(0, Math.round(radius || 0));
    var out = new Float64Array(W * H);
    if (!r) {
      for (var i = 0; i < W * H; i++) { out[i] = gray[i]; }
      return out;
    }
    var tmp = new Float64Array(W * H), x, y, k;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var s = 0, n = 0;
        for (k = -r; k <= r; k++) {
          var xx = Math.min(W - 1, Math.max(0, x + k));
          s += gray[y * W + xx]; n++;
        }
        tmp[y * W + x] = s / n;
      }
    }
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var s2 = 0, n2 = 0;
        for (k = -r; k <= r; k++) {
          var yy = Math.min(H - 1, Math.max(0, y + k));
          s2 += tmp[yy * W + x]; n2++;
        }
        out[y * W + x] = s2 / n2;
      }
    }
    return out;
  }
  G.boxBlur = boxBlur;

  /* ================= marching-squares trace ================= */
  /* gray: array-like 0..255 length W*H. Pixels with value <= threshold are
     foreground (dark). Returns array of loops, each an array of {x,y} in
     image-pixel coordinates (0..W, 0..H). Contours use linear interpolation
     on the grayscale values, so edges sit between pixel centers.
     Saddle cells (cases 5 and 10) are disambiguated by the cell-center value:
     this is the standard potrace-style resolution. */
  function traceBitmap(gray, W, H, threshold) {
    var t = threshold === undefined ? 128 : threshold;
    var PW = W + 2, PH = H + 2;
    function val(x, y) {
      var ox = x - 1, oy = y - 1;
      if (ox < 0 || oy < 0 || ox >= W || oy >= H) { return 255; }
      return gray[oy * W + ox];
    }
    function fg(x, y) { return val(x, y) <= t; }
    function interp(v0, v1) {
      if (Math.abs(v1 - v0) < 1e-9) { return 0.5; }
      var tt = (t - v0) / (v1 - v0);
      return Math.min(1, Math.max(0, tt));
    }
    var segs = [];
    var y, x;
    for (y = 0; y < PH - 1; y++) {
      for (x = 0; x < PW - 1; x++) {
        var tl = fg(x, y) ? 8 : 0, tr = fg(x + 1, y) ? 4 : 0;
        var br = fg(x + 1, y + 1) ? 2 : 0, bl = fg(x, y + 1) ? 1 : 0;
        var idx = tl + tr + br + bl;
        if (idx === 0 || idx === 15) { continue; }
        var Tp = { x: x + interp(val(x, y), val(x + 1, y)), y: y };
        var Rp = { x: x + 1, y: y + interp(val(x + 1, y), val(x + 1, y + 1)) };
        var Bp = { x: x + interp(val(x, y + 1), val(x + 1, y + 1)), y: y + 1 };
        var Lp = { x: x, y: y + interp(val(x, y), val(x, y + 1)) };
        var pairs = null;
        if (idx === 5 || idx === 10) {
          var center = (val(x, y) + val(x + 1, y) + val(x + 1, y + 1) + val(x, y + 1)) / 4;
          var centerFg = center <= t;
          if (idx === 5) { pairs = centerFg ? [[Tp, Lp], [Bp, Rp]] : [[Tp, Rp], [Lp, Bp]]; }
          else { pairs = centerFg ? [[Tp, Rp], [Lp, Bp]] : [[Tp, Lp], [Bp, Rp]]; }
        } else {
          var table = {
            1: [[Lp, Bp]], 2: [[Bp, Rp]], 3: [[Lp, Rp]], 4: [[Tp, Rp]],
            6: [[Tp, Bp]], 7: [[Lp, Tp]], 8: [[Tp, Lp]], 9: [[Tp, Bp]],
            11: [[Tp, Rp]], 12: [[Lp, Rp]], 13: [[Bp, Rp]], 14: [[Lp, Bp]]
          };
          pairs = table[idx];
        }
        if (pairs) {
          for (var k = 0; k < pairs.length; k++) {
            segs.push({ ax: pairs[k][0].x - 1, ay: pairs[k][0].y - 1, bx: pairs[k][1].x - 1, by: pairs[k][1].y - 1, used: false });
          }
        }
      }
    }
    /* Chain segments into loops by endpoint proximity. */
    function key(px, py) { return Math.round(px * 1000) + "," + Math.round(py * 1000); }
    var startMap = {};
    segs.forEach(function (s, i) {
      var k = key(s.ax, s.ay);
      (startMap[k] = startMap[k] || []).push(i);
      var k2 = key(s.bx, s.by);
      (startMap[k2] = startMap[k2] || []).push(i);
    });
    function findNext(px, py, exclude) {
      var list = startMap[key(px, py)] || [];
      for (var i = 0; i < list.length; i++) {
        var s = segs[list[i]];
        if (!s.used && list[i] !== exclude) { return list[i]; }
      }
      return -1;
    }
    var loops = [];
    for (var si = 0; si < segs.length; si++) {
      if (segs[si].used) { continue; }
      var loop = [], cur = si, guard = 0;
      var ex = segs[si].ax, ey = segs[si].ay;
      loop.push({ x: ex, y: ey });
      while (guard++ < segs.length + 10) {
        var s = segs[cur];
        s.used = true;
        var nx, ny;
        if (Math.abs(s.ax - ex) < 1e-6 && Math.abs(s.ay - ey) < 1e-6) { nx = s.bx; ny = s.by; }
        else if (Math.abs(s.bx - ex) < 1e-6 && Math.abs(s.by - ey) < 1e-6) { nx = s.ax; ny = s.ay; }
        else { break; }
        ex = nx; ey = ny;
        var l = loop[loop.length - 1];
        if (Math.hypot(ex - l.x, ey - l.y) > 1e-9) { loop.push({ x: ex, y: ey }); }
        var ni = findNext(ex, ey, cur);
        if (ni < 0) { break; }
        cur = ni;
        var f = loop[0];
        if (Math.hypot(ex - f.x, ey - f.y) < 1e-6) { break; }
      }
      if (loop.length >= 3) { loops.push(loop); }
    }
    return loops;
  }
  G.traceBitmap = traceBitmap;
  function traceToD(loops) {
    return loops.map(function (lp) { return ptsToD(lp, true); }).join(" ");
  }
  G.traceToD = traceToD;

  /* ================= smart-guide snap math ================= */
  /* moving: [{x,y,w,h}] already translated by (dx,dy) candidate.
     statics: [{x,y,w,h}]. Returns {dx, dy, guides:[{axis:'x'|'y', pos}]}.
     Snaps moving edges/centers to static edges/centers within tol. */
  function snapDeltas(moving, statics, dx, dy, tol) {
    tol = tol === undefined ? 6 : tol;
    function edgesX(b) { return [b.x, b.x + b.w / 2, b.x + b.w]; }
    function edgesY(b) { return [b.y, b.y + b.h / 2, b.y + b.h]; }
    var guides = [];
    var mb = unionOfBoxes(moving.map(function (b) { return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }; }));
    if (!mb) { return { dx: dx, dy: dy, guides: guides }; }
    var mxs = edgesX(mb), mys = edgesY(mb);
    var bestX = null, bestY = null;
    statics.forEach(function (s) {
      edgesX(s).forEach(function (sx) {
        mxs.forEach(function (mx) {
          var d = sx - mx;
          if (Math.abs(d) > 1e-9 && Math.abs(d) <= tol && (bestX === null || Math.abs(d) < Math.abs(bestX.d))) {
            bestX = { d: d, pos: sx };
          }
        });
      });
      edgesY(s).forEach(function (sy) {
        mys.forEach(function (my) {
          var d2 = sy - my;
          if (Math.abs(d2) > 1e-9 && Math.abs(d2) <= tol && (bestY === null || Math.abs(d2) < Math.abs(bestY.d))) {
            bestY = { d: d2, pos: sy };
          }
        });
      });
    });
    if (bestX) { dx += bestX.d; guides.push({ axis: "x", pos: bestX.pos }); }
    if (bestY) { dy += bestY.d; guides.push({ axis: "y", pos: bestY.pos }); }
    return { dx: dx, dy: dy, guides: guides };
  }
  function unionOfBoxes(boxes) {
    var u = null;
    boxes.forEach(function (b) {
      if (!u) { u = { x: b.x, y: b.y, w: b.w, h: b.h }; return; }
      var x2 = Math.max(u.x + u.w, b.x + b.w), y2 = Math.max(u.y + u.h, b.y + b.h);
      u.x = Math.min(u.x, b.x); u.y = Math.min(u.y, b.y);
      u.w = x2 - u.x; u.h = y2 - u.y;
    });
    return u;
  }
  G.snapDeltas = snapDeltas;
  G.unionOfBoxes = unionOfBoxes;

  /* ================= artboard math ================= */
  /* Topmost artboard containing (x,y), or null. Artboards later in the array
     render on top. */
  function artboardAt(artboards, x, y) {
    var hit = null;
    (artboards || []).forEach(function (ab) {
      if (x >= ab.x && x <= ab.x + ab.w && y >= ab.y && y <= ab.y + ab.h) { hit = ab; }
    });
    return hit;
  }
  /* Export box for an artboard: {x,y,w,h} used as the SVG viewBox. */
  function artboardExportBox(ab) {
    return { x: r3(ab.x), y: r3(ab.y), w: Math.max(1, Math.round(ab.w)), h: Math.max(1, Math.round(ab.h)) };
  }
  G.artboardAt = artboardAt;
  G.artboardExportBox = artboardExportBox;

  /* ================= gradient serialization ================= */
  /* g: {type:'linear'|'radial', angle:deg, stops:[{o:0..100, c:'#rrggbb', op:0..1}]} */
  function serGradient(g) {
    var parts = [g.type === "radial" ? "radial" : "linear", String(Math.round(g.angle || 0))];
    (g.stops || []).forEach(function (s) {
      parts.push(Math.round(s.o) + ":" + s.c + ":" + (s.op === undefined ? 1 : s.op));
    });
    return parts.join("|");
  }
  function parseGradient(str) {
    var out = { type: "linear", angle: 0, stops: [] };
    if (!str) { return out; }
    var parts = String(str).split("|");
    out.type = parts[0] === "radial" ? "radial" : "linear";
    out.angle = parseFloat(parts[1]) || 0;
    for (var i = 2; i < parts.length; i++) {
      var f = parts[i].split(":");
      if (f.length < 2) { continue; }
      out.stops.push({
        o: Math.min(100, Math.max(0, parseFloat(f[0]) || 0)),
        c: /^#[0-9a-fA-F]{6}$/.test(f[1]) ? f[1] : "#000000",
        op: f[2] === undefined ? 1 : Math.min(1, Math.max(0, parseFloat(f[2])))
      });
    }
    out.stops.sort(function (a, b) { return a.o - b.o; });
    return out;
  }
  G.serGradient = serGradient;
  G.parseGradient = parseGradient;

  /* ================= color ================= */
  function hexToRgb(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
    if (!m) { return null; }
    return {
      r: parseInt(m[1].substr(0, 2), 16) / 255,
      g: parseInt(m[1].substr(2, 2), 16) / 255,
      b: parseInt(m[1].substr(4, 2), 16) / 255
    };
  }
  G.hexToRgb = hexToRgb;
  function rgbStr(c) {
    return r3(c.r) + " " + r3(c.g) + " " + r3(c.b);
  }

  /* ================= PDF writer ================= */
  /* shapes: [{loops:[[ {x,y} ]], fill:'#rrggbb'|null, stroke:'#rrggbb'|null,
               sw:number, opacity:number, texts:[{x,y,size,str,fill}]}]
     Coordinates are artboard-local (y down); the writer flips to PDF y-up.
     Curves arrive pre-flattened (see flattenD); this is documented in the
     export panel as a polygonal approximation. */
  function pdfPathOps(loops, H) {
    var s = "";
    loops.forEach(function (lp) {
      if (!lp.length) { return; }
      s += r3(lp[0].x) + " " + r3(H - lp[0].y) + " m\n";
      for (var i = 1; i < lp.length; i++) { s += r3(lp[i].x) + " " + r3(H - lp[i].y) + " l\n"; }
      s += "h\n";
    });
    return s;
  }
  function escPdfText(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
  }
  function buildPdf(w, h, shapes) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var content = "";
    var needGS = false;
    shapes.forEach(function (sh) {
      var op = (sh.opacity !== undefined && sh.opacity < 1) ? sh.opacity : 1;
      if (op < 1) { needGS = true; }
      var loops = sh.loops || [];
      if (loops.length && (sh.fill || sh.stroke)) {
        content += pdfPathOps(loops, h);
        if (op < 1) { content += "/GS1 gs\n"; }
        if (sh.fill && sh.stroke) {
          var fc = hexToRgb(sh.fill) || { r: 0.5, g: 0.5, b: 0.5 };
          var sc = hexToRgb(sh.stroke) || { r: 0, g: 0, b: 0 };
          content += rgbStr(fc) + " rg\n" + rgbStr(sc) + " RG\n" + r3(sh.sw || 1) + " w\nB\n";
        } else if (sh.fill) {
          var fc2 = hexToRgb(sh.fill) || { r: 0.5, g: 0.5, b: 0.5 };
          content += rgbStr(fc2) + " rg\nf\n";
        } else {
          var sc2 = hexToRgb(sh.stroke) || { r: 0, g: 0, b: 0 };
          content += rgbStr(sc2) + " RG\n" + r3(sh.sw || 1) + " w\nS\n";
        }
      }
      (sh.texts || []).forEach(function (tx) {
        var tc = hexToRgb(tx.fill) || { r: 0, g: 0, b: 0 };
        content += "BT /F1 " + r3(tx.size || 12) + " Tf " + rgbStr(tc) + " rg\n" +
          "1 0 0 -1 " + r3(tx.x) + " " + r3(h - tx.y) + " Tm\n" +
          "(" + escPdfText(tx.str) + ") Tj\nET\n";
      });
    });
    var objs = [];
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    var res = "<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>";
    if (needGS) { res += " /ExtGState << /GS1 << /Type /ExtGState /ca 1 /CA 1 >> >>"; }
    res += " >>";
    objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + h + "] /Contents 4 0 R /Resources " + res + " >>";
    objs[4] = "<< /Length " + content.length + " >>\nstream\n" + content + "endstream";
    var pdf = "%PDF-1.4\n";
    var offsets = [0];
    for (var i = 1; i <= 4; i++) {
      offsets[i] = pdf.length;
      pdf += i + " 0 obj\n" + objs[i] + "\nendobj\n";
    }
    var xrefAt = pdf.length;
    pdf += "xref\n0 5\n0000000000 65535 f \n";
    for (var k = 1; k <= 4; k++) {
      var off = String(offsets[k]);
      while (off.length < 10) { off = "0" + off; }
      pdf += off + " 00000 n \n";
    }
    pdf += "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF";
    return pdf;
  }
  G.buildPdf = buildPdf;

  /* ================= EPS writer ================= */
  /* Genuine EPS wrapper: vector path ops in PostScript. Labeled "EPS (wrapper)"
     in the UI because it is not a native Illustrator .ai file. */
  function buildEps(w, h, shapes) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var s = "%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: NXT VAC\n%%BoundingBox: 0 0 " + w + " " + h + "\n";
    s += "0 " + h + " translate\n1 -1 scale\n";
    shapes.forEach(function (sh) {
      var loops = sh.loops || [];
      if (loops.length && (sh.fill || sh.stroke)) {
        s += "newpath\n";
        loops.forEach(function (lp) {
          if (!lp.length) { return; }
          s += r3(lp[0].x) + " " + r3(lp[0].y) + " moveto\n";
          for (var i = 1; i < lp.length; i++) { s += r3(lp[i].x) + " " + r3(lp[i].y) + " lineto\n"; }
          s += "closepath\n";
        });
        if (sh.fill) {
          var fc = hexToRgb(sh.fill) || { r: 0.5, g: 0.5, b: 0.5 };
          s += r3(fc.r) + " " + r3(fc.g) + " " + r3(fc.b) + " setrgbcolor\n";
        }
        if (sh.fill && sh.stroke) {
          s += "gsave fill grestore\n";
          var sc = hexToRgb(sh.stroke) || { r: 0, g: 0, b: 0 };
          s += r3(sc.r) + " " + r3(sc.g) + " " + r3(sc.b) + " setrgbcolor\n" + r3(sh.sw || 1) + " setlinewidth\nstroke\n";
        } else if (sh.fill) { s += "fill\n"; }
        else {
          var sc2 = hexToRgb(sh.stroke) || { r: 0, g: 0, b: 0 };
          s += r3(sc2.r) + " " + r3(sc2.g) + " " + r3(sc2.b) + " setrgbcolor\n" + r3(sh.sw || 1) + " setlinewidth\nstroke\n";
        }
      }
      (sh.texts || []).forEach(function (tx) {
        var tc = hexToRgb(tx.fill) || { r: 0, g: 0, b: 0 };
        s += "/Helvetica findfont " + r3(tx.size || 12) + " scalefont setfont\n" +
          r3(tc.r) + " " + r3(tc.g) + " " + r3(tc.b) + " setrgbcolor\n" +
          r3(tx.x) + " " + r3(tx.y + (tx.size || 12)) + " moveto\n(" + escPdfText(tx.str) + ") show\n";
      });
    });
    s += "showpage\n%%EOF";
    return s;
  }
  G.buildEps = buildEps;

  T.vacGeom = G;
})();
