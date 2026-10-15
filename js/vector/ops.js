/* TXT Vector Studio: geometry ops for the Illustrator persona.
   Exposes T.vectorOps: shape flattening, 2D transforms, bbox helpers,
   and Pathfinder boolean ops (Unite, Minus Front, Intersect, Exclude).

   FLATTENING APPROXIMATION (documented per spec): boolean ops run on
   polygons, not curves. Every selected shape is first converted to a
   polygon: rects keep exact corners (rounded corners are arc-sampled),
   ellipses/circles are sampled at 72 points, beziers are subdivided
   (cubic 16 segs, quadratic 12 segs), arcs are sampled every 5 degrees.
   Only the element's own `transform` attribute is applied; ancestor
   (layer group) transforms are ignored. Open paths, lines, text and
   images have no area and are skipped by Pathfinder with a toast.
   For <path> with several subpaths, the largest closed subpath is used.
   Degenerate cases (coincident edges, single-point touches, holes) fall
   back to keeping the original shapes with an explanatory toast instead
   of producing garbage geometry. */

(function () {
  "use strict";
  var T = window.TXT;
  var SVGNS = "http://www.w3.org/2000/svg";
  var EPS = 1e-9;
  /* Adaptive Bezier subdivision from the engine's pure geometry module
     (loaded before this file). Falls back to fixed subdivision when absent. */
  var VG = T.vecGeom || null;

  function r2(n) { return Math.round(n * 100) / 100; }
  function fnum(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }

  /* ================= 2D matrices [a,b,c,d,e,f] ================= */
  function matMul(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }
  function matPt(m, x, y) {
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  }
  /* Parse an SVG transform attribute into a matrix. */
  function parseTransform(str) {
    var m = [1, 0, 0, 1, 0, 0];
    if (!str) return m;
    var re = /(translate|scale|rotate|skewX|skewY|matrix)\s*\(([^)]*)\)/g, mt;
    while ((mt = re.exec(str))) {
      var args = mt[2].trim().split(/[\s,]+/).filter(function (s) { return s.length; }).map(parseFloat);
      var name = mt[1], t = [1, 0, 0, 1, 0, 0];
      if (name === "translate") t = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
      else if (name === "scale") { var sy = args[1] === undefined ? args[0] : args[1]; t = [args[0] || 1, 0, 0, sy || 1, 0, 0]; }
      else if (name === "rotate") {
        var a = (args[0] || 0) * Math.PI / 180, cx = args[1] || 0, cy = args[2] || 0;
        var cos = Math.cos(a), sin = Math.sin(a);
        t = [cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos];
      }
      else if (name === "skewX") t = [1, 0, Math.tan((args[0] || 0) * Math.PI / 180), 1, 0, 0];
      else if (name === "skewY") t = [1, Math.tan((args[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
      else if (name === "matrix" && args.length >= 6) t = args.slice(0, 6);
      m = matMul(m, t);
    }
    return m;
  }

  /* ================= path parsing + flattening ================= */
  function parsePath(d) {
    var toks = String(d || "").match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
    var subs = [];
    if (!toks) return subs;
    var i = 0, x = 0, y = 0, sx = 0, sy = 0, lastCmd = "";
    var cx1 = 0, cy1 = 0, qx1 = 0, qy1 = 0, cur = null;
    function isCmd(t) { return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(t); }
    function num() { return parseFloat(toks[i++]); }
    function startSub(nx, ny) { cur = [{ x: nx, y: ny }]; subs.push(cur); x = nx; y = ny; sx = nx; sy = ny; }
    function ensure() { if (!cur) startSub(x, y); }
    function line(nx, ny) { ensure(); cur.push({ x: nx, y: ny }); x = nx; y = ny; }
    function cubicTo(x1, y1, x2, y2, ex, ey) {
      ensure();
      if (VG) {
        var fp = VG.flattenCubic({ x: x, y: y }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: ex, y: ey }, 0.5);
        for (var k = 1; k < fp.length; k++) { cur.push(fp[k]); }
      } else {
        var p0x = x, p0y = y, n = 16, k2, t, mt, px, py;
        for (k2 = 1; k2 <= n; k2++) {
          t = k2 / n; mt = 1 - t;
          px = mt * mt * mt * p0x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * ex;
          py = mt * mt * mt * p0y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * ey;
          cur.push({ x: px, y: py });
        }
      }
      x = ex; y = ey;
    }
    function quadTo(x1, y1, ex, ey) {
      ensure();
      if (VG) {
        var fq = VG.flattenQuad({ x: x, y: y }, { x: x1, y: y1 }, { x: ex, y: ey }, 0.5);
        for (var k3 = 1; k3 < fq.length; k3++) { cur.push(fq[k3]); }
      } else {
        var p0x = x, p0y = y, n = 12, k4, t, mt, px, py;
        for (k4 = 1; k4 <= n; k4++) {
          t = k4 / n; mt = 1 - t;
          px = mt * mt * p0x + 2 * mt * t * x1 + t * t * ex;
          py = mt * mt * p0y + 2 * mt * t * y1 + t * t * ey;
          cur.push({ x: px, y: py });
        }
      }
      x = ex; y = ey;
    }
    function arcTo(rx, ry, rot, laf, sf, ex, ey) {
      ensure();
      var x1 = x, y1 = y, x2 = ex, y2 = ey;
      var phi = rot * Math.PI / 180;
      var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
      var x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
      var y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
      rx = Math.abs(rx); ry = Math.abs(ry);
      if (rx < EPS || ry < EPS) { line(ex, ey); return; }
      var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
      if (lam > 1) { var s = Math.sqrt(lam); rx *= s; ry *= s; }
      var num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
      var den2 = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
      var co = den2 < 1e-12 ? 0 : Math.sqrt(Math.max(0, num2 / den2));
      if (laf === sf) co = -co;
      var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
      var cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x1 + x2) / 2;
      var cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y1 + y2) / 2;
      function ang(ux, uy, vx, vy) {
        var dot = ux * vx + uy * vy, len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        if (len < 1e-12) return 0;
        var a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
        return (ux * vy - uy * vx < 0) ? -a : a;
      }
      var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      var dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      dt = dt % (2 * Math.PI);
      if (!sf && dt > 0) dt -= 2 * Math.PI;
      if (sf && dt < 0) dt += 2 * Math.PI;
      var n2 = Math.max(8, Math.ceil(Math.abs(dt) / (Math.PI / 36)));
      for (var k = 1; k <= n2; k++) {
        var t = t1 + dt * k / n2;
        var exx = cx + rx * Math.cos(phi) * Math.cos(t) - ry * Math.sin(phi) * Math.sin(t);
        var eyy = cy + rx * Math.sin(phi) * Math.cos(t) + ry * Math.cos(phi) * Math.sin(t);
        cur.push({ x: exx, y: eyy });
      }
      x = ex; y = ey;
    }
    while (i < toks.length) {
      var t = toks[i++];
      if (!isCmd(t)) { i--; t = lastCmd || "M"; }
      var rel = (t !== t.toUpperCase()), c = t.toUpperCase(), more;
      if (c === "M") {
        var nx = num(), ny = num(); if (rel) { nx += x; ny += y; }
        startSub(nx, ny); lastCmd = "L";
        while (i < toks.length && !isCmd(toks[i])) { var ax = num(), ay = num(); if (rel) { ax += x; ay += y; } line(ax, ay); }
        cx1 = x; cy1 = y; qx1 = x; qy1 = y;
      } else if (c === "Z") { if (cur && cur.length) cur.push({ x: sx, y: sy }); x = sx; y = sy; lastCmd = "Z"; }
      else if (c === "L") {
        do { var lx = num(), ly = num(); if (rel) { lx += x; ly += y; } line(lx, ly); } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "L"; cx1 = x; cy1 = y; qx1 = x; qy1 = y;
      } else if (c === "H") {
        do { var hx = num(); if (rel) hx += x; line(hx, y); } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "H";
      } else if (c === "V") {
        do { var vy = num(); if (rel) vy += y; line(x, vy); } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "V";
      } else if (c === "C") {
        do {
          var c1x = num(), c1y = num(), c2x = num(), c2y = num(), cex = num(), cey = num();
          if (rel) { c1x += x; c1y += y; c2x += x; c2y += y; cex += x; cey += y; }
          cubicTo(c1x, c1y, c2x, c2y, cex, cey); cx1 = c2x; cy1 = c2y;
        } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "C";
      } else if (c === "S") {
        do {
          var s2x = num(), s2y = num(), sex = num(), sey = num();
          var s1x = (lastCmd === "C" || lastCmd === "S") ? 2 * x - cx1 : x;
          var s1y = (lastCmd === "C" || lastCmd === "S") ? 2 * y - cy1 : y;
          if (rel) { s2x += x; s2y += y; sex += x; sey += y; }
          cubicTo(s1x, s1y, s2x, s2y, sex, sey); cx1 = s2x; cy1 = s2y;
        } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "S";
      } else if (c === "Q") {
        do {
          var q1x = num(), q1y = num(), qex = num(), qey = num();
          if (rel) { q1x += x; q1y += y; qex += x; qey += y; }
          quadTo(q1x, q1y, qex, qey); qx1 = q1x; qy1 = q1y;
        } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "Q";
      } else if (c === "T") {
        do {
          var tex = num(), tey = num();
          var tqx = (lastCmd === "Q" || lastCmd === "T") ? 2 * x - qx1 : x;
          var tqy = (lastCmd === "Q" || lastCmd === "T") ? 2 * y - qy1 : y;
          if (rel) { tex += x; tey += y; }
          quadTo(tqx, tqy, tex, tey); qx1 = tqx; qy1 = tqy;
        } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "T";
      } else if (c === "A") {
        do {
          var arx = num(), ary = num(), arot = num(), laf = num(), asf = num(), aex = num(), aey = num();
          if (rel) { aex += x; aey += y; }
          arcTo(arx, ary, arot, laf, asf, aex, aey);
        } while ((more = i < toks.length && !isCmd(toks[i])));
        lastCmd = "A";
      }
    }
    return subs;
  }

  function polyArea(p) {
    var a = 0;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x * p[i].y - p[i].x * p[j].y);
    return a / 2;
  }
  function cleanPoly(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = out[out.length - 1];
      if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-7) out.push({ x: p.x, y: p.y });
    }
    if (out.length > 1) {
      var f = out[0], l = out[out.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-7) out.pop();
    }
    return out.length >= 3 ? out : null;
  }

  /* Convert one SVG shape element to a flattened polygon (own transform applied).
     Returns null for elements with no area (line, text, image, open paths). */
  function shapeToPolygon(el) {
    var tag = (el.tagName || "").toLowerCase(), pts = null, i;
    if (tag === "rect") {
      var x = fnum(el.getAttribute("x"), 0), y = fnum(el.getAttribute("y"), 0);
      var w = fnum(el.getAttribute("width"), 0), h = fnum(el.getAttribute("height"), 0);
      if (w <= 0 || h <= 0) return null;
      var rx = Math.min(fnum(el.getAttribute("rx"), 0), w / 2, h / 2);
      var ry = el.hasAttribute("ry") ? Math.min(fnum(el.getAttribute("ry"), 0), w / 2, h / 2) : rx;
      pts = [];
      if (rx <= 0 || ry <= 0) {
        pts = [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }];
      } else {
        var corners = [
          { cx: x + w - rx, cy: y + ry, a0: -Math.PI / 2 },
          { cx: x + w - rx, cy: y + h - ry, a0: 0 },
          { cx: x + rx, cy: y + h - ry, a0: Math.PI / 2 },
          { cx: x + rx, cy: y + ry, a0: Math.PI }
        ];
        for (i = 0; i < 4; i++) {
          var cn = corners[i];
          for (var k = 0; k <= 6; k++) {
            var a = cn.a0 + (Math.PI / 2) * (k / 6);
            pts.push({ x: cn.cx + rx * Math.cos(a), y: cn.cy + ry * Math.sin(a) });
          }
        }
      }
    } else if (tag === "circle" || tag === "ellipse") {
      var ecx = fnum(el.getAttribute("cx"), 0), ecy = fnum(el.getAttribute("cy"), 0);
      var erx = tag === "circle" ? fnum(el.getAttribute("r"), 0) : fnum(el.getAttribute("rx"), 0);
      var ery = tag === "circle" ? erx : fnum(el.getAttribute("ry"), 0);
      if (erx <= 0 || ery <= 0) return null;
      pts = [];
      for (i = 0; i < 72; i++) { var a2 = (i / 72) * 2 * Math.PI; pts.push({ x: ecx + erx * Math.cos(a2), y: ecy + ery * Math.sin(a2) }); }
    } else if (tag === "polygon" || tag === "polyline") {
      var raw = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
      pts = [];
      for (i = 0; i + 1 < raw.length; i += 2) pts.push({ x: raw[i], y: raw[i + 1] });
      if (tag === "polyline") return null; // open: no area
    } else if (tag === "path") {
      var subs = parsePath(el.getAttribute("d"));
      var best = null, bestA = 0;
      subs.forEach(function (sp) {
        if (sp.length < 3) return;
        var f = sp[0], l = sp[sp.length - 1];
        var closed = Math.hypot(f.x - l.x, f.y - l.y) < 1e-6;
        if (!closed) return;
        var a = Math.abs(polyArea(sp));
        if (a > bestA) { bestA = a; best = sp; }
      });
      if (!best || bestA < 1e-9) return null;
      pts = best;
    } else {
      return null;
    }
    var m = parseTransform(el.getAttribute("transform"));
    var out = pts.map(function (p) { return matPt(m, p.x, p.y); });
    return cleanPoly(out);
  }

  /* ================= point in polygon / segment intersection ================= */
  function pip(pt, poly) {
    var inside = false, i, j;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function segInt(p1, p2, p3, p4) {
    var d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-12) return null;
    var t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    var u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    t = Math.min(1, Math.max(0, t)); u = Math.min(1, Math.max(0, u));
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t: t, u: u };
  }

  /* ================= Greiner-Hormann boolean ops ================= */
  function ghNode(x, y) {
    return { x: x, y: y, next: null, prev: null, inter: false, entry: false, done: false, neighbor: null, _u: undefined };
  }
  function ghList(poly) {
    var head = null, prev = null;
    poly.forEach(function (p) {
      var n = ghNode(p.x, p.y);
      if (!head) head = n;
      if (prev) { prev.next = n; n.prev = prev; }
      prev = n;
    });
    head.prev = prev; prev.next = head;
    return { head: head };
  }
  function spliceAfter(node, ins) {
    ins.next = node.next; ins.prev = node;
    node.next.prev = ins; node.next = ins;
  }
  /* Insert node into clip edge (c -> c.next) keeping u order. */
  function insertSorted(c, node, u) {
    node._u = u;
    var cur = c;
    while (cur.next._u !== undefined && cur.next._u < u) cur = cur.next;
    spliceAfter(cur, node);
  }
  function polysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (Math.abs(a[i].x - b[i].x) > 1e-6 || Math.abs(a[i].y - b[i].y) > 1e-6) return false;
    }
    return true;
  }

  /* Degenerate-touch filter for Greiner-Hormann.
     When an intersection lands exactly on a subject vertex (t ~= 0 or 1),
     the subject may merely GRAZE the clip boundary instead of crossing it
     (e.g. a subject corner lying exactly on a clip edge, or arriving along
     it). Such touches create phantom entry/exit flips that send the tracer
     into an infinite loop and produce garbage loops. This keeps the hit only
     when the subject path properly crosses the clip edge's line at the touch
     vertex, i.e. the two incident subject edges lie on strictly opposite
     sides of that line. For vertex-on-vertex touches both incident clip
     edges are tried. Honest limitation: a true crossing exactly through a
     clip vertex at a grazing angle can be misclassified as a touch; those
     cases fall back to keeping the input shapes (see runOp). */
  function touchCrosses(sN, hh) {
    var t = hh.r.t, V, eInFar, eOutFar;
    if (t < 1e-7) { V = sN; eInFar = V.prev; eOutFar = V.next; }
    else { V = sN.next; eInFar = sN; eOutFar = V.next; }
    if (!eInFar || !eOutFar || eInFar === V || eOutFar === V) { return true; }
    var cA = hh.c, cB = hh.c.next;
    if (!cB) { return true; }
    function side(ax, ay, bx, by, p) {
      return (bx - ax) * (p.y - ay) - (by - ay) * (p.x - ax);
    }
    var s1 = side(cA.x, cA.y, cB.x, cB.y, eInFar);
    var s2 = side(cA.x, cA.y, cB.x, cB.y, eOutFar);
    if ((s1 > 1e-9 && s2 < -1e-9) || (s1 < -1e-9 && s2 > 1e-9)) { return true; }
    var u = hh.r.u;
    if ((u < 1e-7 || u > 1 - 1e-7) && cA.prev) {
      var pA = cA.prev;
      var t1 = side(pA.x, pA.y, cA.x, cA.y, eInFar);
      var t2 = side(pA.x, pA.y, cA.x, cA.y, eOutFar);
      if ((t1 > 1e-9 && t2 < -1e-9) || (t1 < -1e-9 && t2 > 1e-9)) { return true; }
    }
    return false;
  }
  function ghBuild(S, C, sPoly, cPoly) {
    // collect original subject edges first (insertions mutate next pointers)
    var edges = [], s0 = S.head;
    do { edges.push(s0); s0 = s0.next; } while (s0 !== S.head);
    edges.forEach(function (sN) {
      var hits = [], cN = C.head;
      do {
        var r = segInt(sN, sN.next, cN, cN.next);
        if (r) hits.push({ c: cN, r: r });
        cN = cN.next;
      } while (cN !== C.head);
      hits.sort(function (a, b) { return a.r.t - b.r.t; });
      var prevIns = sN, lastT = -1;
      hits.forEach(function (hh) {
        if (hh.r.t - lastT < 1e-9) return; // dedupe coincident hits on this edge
        lastT = hh.r.t;
        if ((hh.r.t < 1e-7 || hh.r.t > 1 - 1e-7) && !touchCrosses(sN, hh)) { return; } // grazing touch: skip

        var sn, cn;
        if (hh.r.t < 1e-7) sn = sN;
        else if (hh.r.t > 1 - 1e-7) sn = sN.next;
        else { sn = ghNode(hh.r.x, hh.r.y); spliceAfter(prevIns, sn); prevIns = sn; }
        sn.inter = true;
        if (hh.r.u < 1e-7) cn = hh.c;
        else if (hh.r.u > 1 - 1e-7) cn = hh.c.next;
        else { cn = ghNode(hh.r.x, hh.r.y); insertSorted(hh.c, cn, hh.r.u); }
        cn.inter = true;
        if (!sn.neighbor) sn.neighbor = cn;
        if (!cn.neighbor) cn.neighbor = sn;
      });
    });
    // entry/exit: midpoint of edge after each intersection, tested against the other polygon
    var n = S.head;
    do {
      if (n.inter) n.entry = pip({ x: (n.x + n.next.x) / 2, y: (n.y + n.next.y) / 2 }, cPoly);
      n = n.next;
    } while (n !== S.head);
    n = C.head;
    do {
      if (n.inter) n.entry = pip({ x: (n.x + n.next.x) / 2, y: (n.y + n.next.y) / 2 }, sPoly);
      n = n.next;
    } while (n !== C.head);
  }

  /* Generic forward traversal. startEntry: begin at subject intersections whose
     entry === startEntry. switchS/switchC: jump lists when node.entry === value. */
  function ghTrace(S, C, startEntry, switchS, switchC) {
    var loops = [], starts = [], n = S.head;
    do { if (n.inter && !n.done && n.entry === startEntry) starts.push(n); n = n.next; } while (n !== S.head);
    starts.forEach(function (st) {
      if (st.done) return;
      var loop = [], cur = st, onS = true, guard = 0;
      do {
        var lp = loop[loop.length - 1];
        if (!lp || Math.hypot(cur.x - lp.x, cur.y - lp.y) > 1e-7) loop.push({ x: cur.x, y: cur.y });
        cur.done = true;
        if (cur.neighbor) cur.neighbor.done = true;
        cur = cur.next;
        if (cur.inter) {
          var sw = onS ? (cur.entry === switchS) : (cur.entry === switchC);
          if (sw && cur.neighbor) { cur = cur.neighbor; onS = !onS; }
        }
        guard++;
      } while (cur !== st && guard < 20000);
      var cl = cleanPoly(loop);
      if (cl) loops.push(cl);
    });
    return loops;
  }

  /* Difference S-C: start at subject exits, follow subject; at entries jump to
     clip and walk it BACKWARD; jump back to subject at the neighbor of an exit. */
  function ghDiff(S, C) {
    var loops = [], starts = [], n = S.head, m = C.head;
    do { n.done = false; n = n.next; } while (n !== S.head);
    do { m.done = false; m = m.next; } while (m !== C.head);
    n = S.head;
    do { if (n.inter && !n.done && n.entry === false) starts.push(n); n = n.next; } while (n !== S.head);
    starts.forEach(function (st) {
      if (st.done) return;
      var loop = [], cur = st, onS = true, back = false, guard = 0;
      do {
        var lp = loop[loop.length - 1];
        if (!lp || Math.hypot(cur.x - lp.x, cur.y - lp.y) > 1e-7) loop.push({ x: cur.x, y: cur.y });
        cur.done = true;
        if (cur.neighbor) cur.neighbor.done = true;
        cur = back ? cur.prev : cur.next;
        if (cur.inter) {
          if (onS && cur.entry === true && cur.neighbor) { cur = cur.neighbor; onS = false; back = true; }
          else if (!onS && cur.neighbor && cur.neighbor.entry === false) { cur = cur.neighbor; onS = true; back = false; }
        }
        guard++;
      } while (cur !== st && guard < 20000);
      var cl = cleanPoly(loop);
      if (cl) loops.push(cl);
    });
    return loops;
  }

  function ghBinary(sPoly, cPoly, op) {
    if (polysEqual(sPoly, cPoly)) {
      if (op === "intersect" || op === "unite") return [sPoly.slice()];
      return []; // minus / exclude of identical shapes is empty
    }
    var S = ghList(sPoly), C = ghList(cPoly);
    try { ghBuild(S, C, sPoly, cPoly); } catch (e) { return null; }
    var hasInter = false, n = S.head;
    do { if (n.inter) { hasInter = true; break; } n = n.next; } while (n !== S.head);
    if (!hasInter) {
      // containment / disjoint cases via point-in-polygon
      var sIn = pip(sPoly[0], cPoly), cIn = pip(cPoly[0], sPoly);
      if (op === "intersect") return sIn ? [sPoly.slice()] : (cIn ? [cPoly.slice()] : []);
      if (op === "unite") return sIn ? [cPoly.slice()] : (cIn ? [sPoly.slice()] : [sPoly.slice(), cPoly.slice()]);
      if (op === "minus") return sIn ? [] : [sPoly.slice()]; // cIn would need a hole; keep subject
      return sIn ? [cPoly.slice()] : (cIn ? [sPoly.slice()] : [sPoly.slice(), cPoly.slice()]); // exclude
    }
    if (op === "intersect") return ghTrace(S, C, true, false, false);
    if (op === "unite") return ghTrace(S, C, false, true, true);
    if (op === "minus") return ghDiff(S, C);
    // exclude = (S-C) union (C-S)
    return ghDiff(S, C).concat(ghDiff(C, S));
  }

  function foldPolys(polys, op) {
    if (op === "minus") {
      var res = [polys[0]];
      for (var i = 1; i < polys.length; i++) {
        var out = [];
        res.forEach(function (p) {
          var r = ghBinary(p, polys[i], "minus");
          if (r) out = out.concat(r);
        });
        res = out;
        if (!res.length) break;
      }
      return res;
    }
    var acc = [polys[0]];
    for (var j = 1; j < polys.length; j++) {
      var acc2 = [];
      acc.forEach(function (p) {
        var r2 = ghBinary(p, polys[j], op);
        if (r2) acc2 = acc2.concat(r2);
      });
      if (!acc2.length && op === "intersect") return [];
      acc = acc2.length ? acc2 : acc;
    }
    return acc;
  }

  /* ================= bbox helpers ================= */
  function localBBox(el) {
    try {
      if (typeof el.getBBox === "function") {
        var b = el.getBBox();
        if (b && isFinite(b.width) && isFinite(b.height)) return { x: b.x, y: b.y, w: b.width, h: b.height };
      }
    } catch (e) { /* fall through to manual */ }
    var tag = (el.tagName || "").toLowerCase(), i, p;
    if (tag === "rect") return { x: fnum(el.getAttribute("x"), 0), y: fnum(el.getAttribute("y"), 0), w: fnum(el.getAttribute("width"), 0), h: fnum(el.getAttribute("height"), 0) };
    if (tag === "circle") { var r = fnum(el.getAttribute("r"), 0); return { x: fnum(el.getAttribute("cx"), 0) - r, y: fnum(el.getAttribute("cy"), 0) - r, w: r * 2, h: r * 2 }; }
    if (tag === "ellipse") { var rx = fnum(el.getAttribute("rx"), 0), ry = fnum(el.getAttribute("ry"), 0); return { x: fnum(el.getAttribute("cx"), 0) - rx, y: fnum(el.getAttribute("cy"), 0) - ry, w: rx * 2, h: ry * 2 }; }
    if (tag === "line") {
      var x1 = fnum(el.getAttribute("x1"), 0), y1 = fnum(el.getAttribute("y1"), 0);
      var x2 = fnum(el.getAttribute("x2"), 0), y2 = fnum(el.getAttribute("y2"), 0);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    }
    if (tag === "polygon" || tag === "polyline") {
      var raw = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(parseFloat).filter(function (nn) { return !isNaN(nn); });
      var xs = [], ys = [];
      for (i = 0; i + 1 < raw.length; i += 2) { xs.push(raw[i]); ys.push(raw[i + 1]); }
      if (!xs.length) return null;
      var x0 = Math.min.apply(null, xs), x9 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y9 = Math.max.apply(null, ys);
      return { x: x0, y: y0, w: x9 - x0, h: y9 - y0 };
    }
    if (tag === "path") {
      var poly = shapeToPolygon(el);
      if (!poly) return null;
      var bx = poly.map(function (pt) { return pt.x; }), by = poly.map(function (pt) { return pt.y; });
      var ax = Math.min.apply(null, bx), ex = Math.max.apply(null, bx);
      var ay = Math.min.apply(null, by), ey = Math.max.apply(null, by);
      return { x: ax, y: ay, w: ex - ax, h: ey - ay };
    }
    return null;
  }
  /* Visual (axis-aligned, own-transform applied) bbox. */
  function visualBBox(el) {
    var b = localBBox(el);
    if (!b) return null;
    var m = parseTransform(el.getAttribute("transform"));
    var pts = [matPt(m, b.x, b.y), matPt(m, b.x + b.w, b.y), matPt(m, b.x, b.y + b.h), matPt(m, b.x + b.w, b.y + b.h)];
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function unionBox(boxes) {
    var xs = [], ys = [], xe = [], ye = [];
    boxes.forEach(function (b) { xs.push(b.x); ys.push(b.y); xe.push(b.x + b.w); ye.push(b.y + b.h); });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xe) - x0, h: Math.max.apply(null, ye) - y0 };
  }

  /* Untransformed base box, cached until the transform attribute changes
     externally (panel edits update the cache themselves). */
  function getBase(el) {
    var cur = el.getAttribute("transform") || "";
    if (el._vBase && el._vT === cur) return el._vBase;
    if (cur) el.removeAttribute("transform");
    var b = localBBox(el);
    if (cur) el.setAttribute("transform", cur);
    if (!b || b.w <= 0 || b.h <= 0) return null;
    el._vBase = b; el._vT = cur;
    if (el._vRot === undefined) el._vRot = 0;
    return b;
  }
  function getRot(el) { return el._vRot || 0; }
  /* Set box {x,y,w,h,rotation}: composes translate/rotate/scale from the base box. */
  function applyBox(el, box) {
    var base = getBase(el);
    if (!base) return false;
    var w = Math.max(0.5, box.w), h = Math.max(0.5, box.h), rot = box.rotation || 0;
    var sx = w / base.w, sy = h / base.h;
    var cx = box.x + w / 2, cy = box.y + h / 2;
    var bx = base.x + base.w / 2, by = base.y + base.h / 2;
    var t = "translate(" + r2(cx) + " " + r2(cy) + ") rotate(" + r2(rot) + ") scale(" + r2(sx) + " " + r2(sy) + ") translate(" + r2(-bx) + " " + r2(-by) + ")";
    el.setAttribute("transform", t);
    el._vT = t; el._vRot = rot;
    return true;
  }
  /* Translate in parent space (prepend), used by align/distribute. */
  function nudge(el, dx, dy) {
    if (!dx && !dy) return;
    var cur = el.getAttribute("transform") || "";
    var t = "translate(" + r2(dx) + " " + r2(dy) + ")" + (cur ? " " + cur : "");
    el.setAttribute("transform", t);
    /* _vT no longer matches: next panel edit re-captures the base. */
  }

  /* ================= pathfinder entry points ================= */
  function isShape(el) {
    var t = (el.tagName || "").toLowerCase();
    return t === "rect" || t === "circle" || t === "ellipse" || t === "polygon" || t === "polyline" || t === "path" || t === "line";
  }
  function collectShapes(els) {
    var out = [];
    (els || []).forEach(function (el) {
      if (!el || !el.tagName) return;
      var t = el.tagName.toLowerCase();
      if (t === "g") {
        Array.prototype.forEach.call(el.querySelectorAll("rect,circle,ellipse,polygon,polyline,path,line"), function (s) { out.push(s); });
      } else if (isShape(el)) out.push(el);
    });
    return out;
  }
  function docOrder(els) {
    return els.slice().sort(function (a, b) {
      if (a === b) return 0;
      var p = a.compareDocumentPosition(b);
      /* eslint-disable no-bitwise */
      if (p & 4) return -1; // b follows a
      if (p & 2) return 1;
      return 0;
    });
  }
  function polyToD(poly) {
    var pts = [];
    poly.forEach(function (p) {
      var l = pts[pts.length - 1];
      if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-6) pts.push(p);
    });
    if (pts.length < 3) return "";
    var d = "M" + r2(pts[0].x) + " " + r2(pts[0].y);
    for (var i = 1; i < pts.length; i++) d += "L" + r2(pts[i].x) + " " + r2(pts[i].y);
    return d + "Z";
  }
  function changed() { T.bus.emit("vector:change"); }

  function runOp(op, els, label) {
    if (!T.vector || typeof T.vector.select !== "function") return;
    var shapes = docOrder(collectShapes(els));
    if (shapes.length < 2) { T.toast("Select two or more shapes for " + label + ".", "error"); return; }
    var items = [], skipped = 0;
    shapes.forEach(function (s) {
      var p = null;
      try { p = shapeToPolygon(s); } catch (e) { p = null; }
      if (p) items.push({ el: s, poly: p }); else skipped++;
    });
    if (items.length < 2) { T.toast("Need two or more closed shapes for " + label + ".", "error"); return; }
    if (skipped) T.toast(skipped + " item(s) have no area and were skipped.");
    var polys = items.map(function (it) { return it.poly; });
    var loops = null;
    try { loops = foldPolys(polys, op); } catch (e) { loops = null; }
    if (!loops || !loops.length) { T.toast(label + ": the result was empty, shapes kept.", "error"); return; }
    var d = loops.map(polyToD).filter(Boolean).join(" ");
    if (!d) { T.toast(label + ": the result was empty, shapes kept.", "error"); return; }
    var svg = T.vector.svgEl();
    var back = items[0].el, parent = back.parentNode || svg;
    var np = document.createElementNS(SVGNS, "path");
    np.setAttribute("d", d);
    np.setAttribute("fill-rule", "evenodd");
    ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "opacity"].forEach(function (a) {
      var v = back.getAttribute(a);
      if (v !== null && v !== undefined) np.setAttribute(a, v);
    });
    if (!np.getAttribute("fill")) np.setAttribute("fill", "#31A8FF");
    parent.appendChild(np);
    items.forEach(function (it) { if (it.el.parentNode) it.el.parentNode.removeChild(it.el); });
    T.vector.select([np]);
    changed();
    T.toast(label + " applied.");
  }

  function unite(els) { runOp("unite", els, "Unite"); }
  function minusFront(els) { runOp("minus", els, "Minus Front"); }
  function intersect(els) { runOp("intersect", els, "Intersect"); }
  function exclude(els) { runOp("exclude", els, "Exclude"); }

  /* Align the selection bbox edges/centers. mode: left|centerX|right|top|centerY|bottom.
     refBox (optional): align to this box instead of the selection union
     (used for align-to-artboard). */
  function align(els, mode, refBox) {
    var list = collectShapes(els);
    if (list.length < 2) { T.toast("Select two or more shapes to align.", "error"); return; }
    var boxes = list.map(visualBBox).filter(Boolean);
    if (boxes.length < 2) return;
    var u = refBox || unionBox(boxes), tx = 0, ty = 0;
    list.forEach(function (el, i) {
      var b = visualBBox(el);
      if (!b) return;
      var dx = 0, dy = 0;
      if (mode === "left") dx = u.x - b.x;
      else if (mode === "centerX") dx = (u.x + u.w / 2) - (b.x + b.w / 2);
      else if (mode === "right") dx = (u.x + u.w) - (b.x + b.w);
      else if (mode === "top") dy = u.y - b.y;
      else if (mode === "centerY") dy = (u.y + u.h / 2) - (b.y + b.h / 2);
      else if (mode === "bottom") dy = (u.y + u.h) - (b.y + b.h);
      nudge(el, r2(dx), r2(dy));
    });
    changed();
  }
  /* Distribute centers evenly along an axis. axis: 'x'|'y'. Keeps first/last fixed. */
  function distribute(els, axis) {
    var list = collectShapes(els);
    if (list.length < 3) { T.toast("Select three or more shapes to distribute.", "error"); return; }
    var items = list.map(function (el) { return { el: el, b: visualBBox(el) }; }).filter(function (o) { return o.b; });
    if (items.length < 3) return;
    var key = axis === "x" ? function (o) { return o.b.x + o.b.w / 2; } : function (o) { return o.b.y + o.b.h / 2; };
    items.sort(function (a, b) { return key(a) - key(b); });
    var first = key(items[0]), last = key(items[items.length - 1]);
    var step = (last - first) / (items.length - 1);
    items.forEach(function (o, i) {
      if (i === 0 || i === items.length - 1) return;
      var want = first + step * i, cur = key(o), d = r2(want - cur);
      if (axis === "x") nudge(o.el, d, 0); else nudge(o.el, 0, d);
    });
    changed();
  }

  /* Distribute with an exact pixel gap between object edges along an axis.
     Keeps the first object's leading edge fixed. */
  function distributeSpacing(els, axis, gap) {
    var list = collectShapes(els);
    if (list.length < 3) { T.toast("Select three or more shapes to distribute.", "error"); return; }
    gap = Math.max(0, parseFloat(gap) || 0);
    var items = list.map(function (el) { return { el: el, b: visualBBox(el) }; }).filter(function (o) { return o.b; });
    if (items.length < 3) return;
    items.sort(function (a, b) { return (axis === "x" ? a.b.x - b.b.x : a.b.y - b.b.y); });
    var pos = axis === "x" ? items[0].b.x : items[0].b.y;
    items.forEach(function (o) {
      var b = visualBBox(o.el);
      if (!b) return;
      var d = r2(pos - (axis === "x" ? b.x : b.y));
      if (axis === "x") { nudge(o.el, d, 0); pos += b.w + gap; }
      else { nudge(o.el, 0, d); pos += b.h + gap; }
    });
    changed();
  }

  T.vectorOps = {
    parseTransform: parseTransform, matPt: matPt,
    shapeToPolygon: shapeToPolygon, polyToD: polyToD,
    localBBox: localBBox, visualBBox: visualBBox, unionBox: unionBox,
    getBase: getBase, getRot: getRot, applyBox: applyBox, nudge: nudge,
    unite: unite, minusFront: minusFront, intersect: intersect, exclude: exclude,
    align: align, distribute: distribute, distributeSpacing: distributeSpacing,
    changed: changed, r2: r2
  };
})();
