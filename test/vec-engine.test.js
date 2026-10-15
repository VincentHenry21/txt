/* NXT VEC engine depth-upgrade tests.
   Part 1: pure geometry (T.vecGeom) in a bare vm sandbox, no DOM.
   Part 2: DOM integration in jsdom: artboard manager, pathfinder, align,
   distribute-with-spacing, swatches, outline mode, smart guides.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/vec-engine.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("ok   - " + name); }
  else { fail++; console.log("FAIL - " + name + (extra ? " :: " + extra : "")); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/* ================= Part 1: pure geometry ================= */
const sandbox = { window: { TXT: {} }, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/vector/geom.js"), "utf8"), sandbox);
const VG = sandbox.window.TXT.vecGeom;
if (!VG) { console.log("FAIL - T.vecGeom did not load"); process.exit(1); }

console.log("-- bezier flattening --");
{
  const p0 = { x: 0, y: 0 }, p1 = { x: 100, y: 0 }, p2 = { x: 100, y: 100 }, p3 = { x: 0, y: 100 };
  const pts = VG.flattenCubic(p0, p1, p2, p3, 0.5);
  // true curve midpoint at t=0.5 is (75, 50)
  const hit = pts.some(function (p) { return near(p.x, 75, 1) && near(p.y, 50, 1); });
  ok("flattened cubic passes through the true midpoint (75,50)", hit, JSON.stringify(pts.length) + " pts");
  ok("flattened cubic starts and ends on the endpoints",
    near(pts[0].x, 0, 1e-9) && near(pts[pts.length - 1].x, 0, 1e-9));
  const straight = VG.flattenCubic({ x: 0, y: 0 }, { x: 33, y: 0 }, { x: 66, y: 0 }, { x: 100, y: 0 }, 0.5);
  ok("adaptive flatten of a straight line yields exactly 2 points", straight.length === 2, "got " + straight.length);
  const q = VG.flattenQuad({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 0.5);
  const qhit = q.some(function (p) { return near(p.x, 50, 1) && near(p.y, 50, 1); });
  ok("flattened quad passes through the true midpoint (50,50)", qhit);
}
console.log("-- path parsing / flattening --");
{
  const segs = VG.parseD("m10 10l20 0");
  ok("relative moveto/lineto resolve to absolute",
    segs.length === 2 && segs[0].pts[0] === 10 && segs[1].pts[0] === 30, JSON.stringify(segs));
  const loops = VG.flattenD("M0 0L100 0L100 100L0 100Z");
  ok("flattenD of a rect path gives one closed loop", loops.length === 1 && loops[0].closed === true);
  const bb = VG.polyBBox(loops[0].pts);
  ok("rect loop bbox is 0,0,100,100", near(bb.x, 0, 1e-6) && near(bb.w, 100, 1e-6));
  ok("polyArea of the rect loop is 10000", near(Math.abs(VG.polyArea(loops[0].pts)), 10000, 1));
}
console.log("-- box blur --");
{
  const uni = new Float64Array(25).fill(128);
  const b = VG.boxBlur(uni, 5, 5, 2);
  ok("blur of a uniform image is a no-op", b.every(function (v) { return near(v, 128, 1e-9); }));
  const spike = new Float64Array(25).fill(0);
  spike[12] = 255;
  const bs = VG.boxBlur(spike, 5, 5, 1);
  ok("blur spreads a spike (center < 255, neighbor > 0)", bs[12] < 255 && bs[11] > 0);
}
console.log("-- marching-squares trace --");
{
  // 5x5 bitmap, dark 3x3 block at rows/cols 1..3. Boundary sits halfway
  // between pixel centers, so the outline bbox is 0.5,0.5,3,3.
  const W = 5, H = 5;
  const gray = new Float64Array(W * H).fill(255);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) gray[y * W + x] = 0;
  const loops = VG.traceBitmap(gray, W, H, 128);
  ok("trace finds at least one contour", loops.length >= 1, "got " + loops.length);
  const all = [];
  loops.forEach(function (lp) { lp.forEach(function (p) { all.push(p); }); });
  const bb = VG.polyBBox(all);
  ok("traced outline bbox matches the 3x3 block",
    near(bb.x, 0.5, 0.6) && near(bb.y, 0.5, 0.6) && near(bb.w, 3, 0.6) && near(bb.h, 3, 0.6),
    JSON.stringify(bb));
  const d = VG.traceToD(loops);
  ok("trace path data is non-empty closed path data", d.length > 10 && d.indexOf("M") === 0 && d.indexOf("Z") > 0);
  const empty = VG.traceBitmap(new Float64Array(W * H).fill(255), W, H, 128);
  ok("all-white bitmap traces to zero contours", empty.length === 0);
}
console.log("-- smart-guide snap math --");
{
  const moving = [{ x: 0, y: 0, w: 10, h: 10 }];
  const statics = [{ x: 20, y: 100, w: 10, h: 10 }];
  const r = VG.snapDeltas(moving, statics, 7, 0, 6);
  ok("moving edge snaps to the static edge (dx 7 -> 10)", near(r.dx, 10, 1e-9), "dx=" + r.dx);
  ok("snap reports the guide line", r.guides.length === 1 && r.guides[0].axis === "x" && near(r.guides[0].pos, 20, 1e-9));
  const r2 = VG.snapDeltas(moving, statics, 0, 0, 6);
  ok("no snap when far away", near(r2.dx, 0, 1e-9) && r2.guides.length === 0);
  const r3 = VG.snapDeltas(moving, [{ x: 0, y: 30, w: 10, h: 10 }], 0, 17, 6);
  ok("vertical center/edge snap works", near(r3.dy, 20, 1e-9), "dy=" + r3.dy);
}
console.log("-- artboard math --");
{
  const abs = [
    { id: "a1", name: "A", x: 0, y: 0, w: 100, h: 100 },
    { id: "a2", name: "B", x: 200, y: 0, w: 100, h: 100 }
  ];
  ok("artboardAt hits the right artboard", VG.artboardAt(abs, 250, 50).id === "a2");
  ok("artboardAt returns null outside", VG.artboardAt(abs, 150, 50) === null);
  const box = VG.artboardExportBox({ x: 10.4, y: 20.6, w: 100.2, h: 99.7 });
  ok("export box rounds to integer w/h", box.w === 100 && box.h === 100 && near(box.x, 10.4, 1e-9));
}
console.log("-- gradient serialization --");
{
  const g = { type: "linear", angle: 45, stops: [{ o: 0, c: "#ff0000", op: 1 }, { o: 100, c: "#0000ff", op: 0.5 }] };
  const s = VG.serGradient(g);
  const back = VG.parseGradient(s);
  ok("gradient round-trips type/angle/stops",
    back.type === "linear" && back.angle === 45 && back.stops.length === 2 &&
    back.stops[0].c === "#ff0000" && near(back.stops[1].op, 0.5, 1e-9), s);
  const rg = VG.parseGradient(VG.serGradient({ type: "radial", angle: 0, stops: [{ o: 50, c: "#84cc16" }] }));
  ok("radial gradient round-trips", rg.type === "radial" && rg.stops[0].o === 50);
}
console.log("-- pdf / eps writers --");
{
  const shapes = [{
    loops: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]],
    fill: "#ff0000", stroke: "#000000", sw: 2, opacity: 1
  }];
  const pdf = VG.buildPdf(100, 50, shapes);
  ok("pdf starts with %PDF-", pdf.indexOf("%PDF-1.4") === 0);
  ok("pdf has xref, trailer and %%EOF",
    pdf.indexOf("xref") > 0 && pdf.indexOf("trailer") > 0 && pdf.indexOf("%%EOF") === pdf.length - 5);
  ok("pdf declares the artboard MediaBox", pdf.indexOf("/MediaBox [0 0 100 50]") > 0);
  ok("pdf fills with the rect color", pdf.indexOf("1 0 0 rg") > 0);
  const pdfT = VG.buildPdf(200, 100, [{ texts: [{ x: 10, y: 20, size: 12, str: "Hi", fill: "#000000" }] }]);
  ok("pdf embeds text with base-14 Helvetica", pdfT.indexOf("/Helvetica") > 0 && pdfT.indexOf("(Hi) Tj") > 0);
  const eps = VG.buildEps(100, 50, shapes);
  ok("eps starts with the EPSF magic", eps.indexOf("%!PS-Adobe-3.0 EPSF-3.0") === 0);
  ok("eps has a BoundingBox", eps.indexOf("%%BoundingBox: 0 0 100 50") > 0);
  ok("eps contains vector path ops", eps.indexOf("moveto") > 0 && eps.indexOf("setrgbcolor") > 0);
}

/* ================= Part 2: jsdom integration ================= */
const dom = new JSDOM('<!DOCTYPE html><html><body><main id="views"></main></body></html>', {
  url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
});
const { window } = dom;
const listeners = {};
window.TXT = {
  bus: {
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: (ev, data) => { (listeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  cmds: {},
  register(name, fn, meta) { window.TXT.cmds[name] = { fn, meta: meta || {} }; },
  cmd(name, ...a) { const c = window.TXT.cmds[name]; if (c) { return c.fn(...a); } },
  t: (k) => k,
  uid: (() => { let n = 0; return () => "t" + (++n); })(),
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  debounce: (fn) => fn,
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: () => {}
};
window.TXT.store = {
  _d: {},
  get(a, k) { const n = this._d[a]; return n ? JSON.parse(JSON.stringify(n[k])) : undefined; },
  set(a, k, v) { (this._d[a] = this._d[a] || {})[k] = JSON.parse(JSON.stringify(v)); return v; },
  on() {}, emit() {}
};
window.TXT.modal = () => Promise.resolve(true);
window.Element.prototype.getCTM = function () { return null; };
window.DOMMatrix = function (a, b, c, d, e, f) {
  this.a = a === undefined ? 1 : a; this.b = b || 0; this.c = c || 0;
  this.d = d === undefined ? 1 : d; this.e = e || 0; this.f = f || 0;
};
window.DOMMatrix.prototype.translate = function (x, y) {
  return new window.DOMMatrix(this.a, this.b, this.c, this.d,
    this.e + this.a * x + this.c * y, this.f + this.b * x + this.d * y);
};
window.DOMMatrix.prototype.multiply = function (m) {
  return new window.DOMMatrix(
    this.a * m.a + this.c * m.b, this.b * m.a + this.d * m.b,
    this.a * m.c + this.c * m.d, this.b * m.c + this.d * m.d,
    this.a * m.e + this.c * m.f + this.e, this.b * m.e + this.d * m.f + this.f);
};
function load(rel) { window.eval(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
load("js/vector/geom.js");
load("js/vector/core.js");
load("js/vector/tools.js");
load("js/vector/ops.js");
load("js/vector/panels.js");
load("js/vector/engine.js");

const T = window.TXT, doc = window.document;
const SVGNS = "http://www.w3.org/2000/svg";
function mkRect(x, y, w, h, fill) {
  const r = doc.createElementNS(SVGNS, "rect");
  r.setAttribute("x", x); r.setAttribute("y", y);
  r.setAttribute("width", w); r.setAttribute("height", h);
  r.setAttribute("fill", fill || "#ffffff");
  r.setAttribute("stroke", "#1a1a1a");
  T.vector.activeLayer().appendChild(r);
  return r;
}

console.log("-- engine mount + artboards --");
T.vector.show();
ok("T.vecEngine exists", !!T.vecEngine);
ok("mount() succeeds once panels are built", T.vecEngine.mount() === true);
ok("artboards panel mounted", !!doc.querySelector('#vPanels .vp-panel[data-p="vec-artboards"]'));
ok("gradient/swatches/trace/view/export panels mounted",
  ["vec-gradient", "vec-swatches", "vec-trace", "vec-view", "vec-export"].every(
    (id) => !!doc.querySelector('#vPanels .vp-panel[data-p="' + id + '"]')));
ok("default swatches render as clickable chips",
  doc.querySelectorAll('#vPanels .vp-panel[data-p="vec-swatches"] .ve-swatch').length >= 5);
ok("old gradient panel is hidden", (() => {
  const o = doc.querySelector('#vPanels .vp-panel[data-p="gradient"]');
  return o && o.style.display === "none";
})());
ok("artboards group rendered in the svg", !!doc.querySelector("#vArtboardsG"));
ok("legacy artboard rect is hidden", (() => {
  const l = doc.querySelector("#vArtboard");
  return l && l.style.display === "none";
})());
{
  const before = T.vecEngine.artboards().length;
  const ab = T.vecEngine.addArtboard("Test", 300, 200);
  ok("addArtboard grows the list", T.vecEngine.artboards().length === before + 1);
  ok("new artboard is active", T.vecEngine.activeArtboard().id === ab.id);
  ok("artboard persisted to the store", (T.store.get("vector", "artboards") || []).length === before + 1);
  T.vecEngine.duplicateArtboard(ab.id, false);
  ok("duplicate adds another artboard", T.vecEngine.artboards().length === before + 2);
  const dup = T.vecEngine.artboards()[before + 1];
  T.vecEngine.deleteArtboard(dup.id);
  ok("delete removes the artboard", T.vecEngine.artboards().length === before + 1);
  T.vecEngine.setActiveArtboard(T.vecEngine.artboards()[0].id);
}
console.log("-- getSVG/setSVG carry artboards --");
{
  mkRect(10, 10, 40, 40);
  const s = T.vector.getSVG();
  ok("getSVG carries artboard metadata", s.indexOf("data-artboards-b64") > 0);
  ok("getSVG injects defs", s.indexOf("<defs") > 0 && s.indexOf("<defs") < s.indexOf("</svg>"));
  T.vector.newDoc();
  T.vector.setSVG(s);
  ok("setSVG restores the artboard count", T.vecEngine.artboards().length >= 1);
  ok("setSVG restores artwork", T.vector.getSVG().indexOf("<rect") > 0);
}
console.log("-- pathfinder on real rects --");
{
  T.vector.newDoc();
  const a = mkRect(0, 0, 100, 100, "#ff0000");
  const b = mkRect(50, 0, 100, 100, "#0000ff");
  T.vectorOps.unite([a, b]);
  const res = T.vector.selection()[0];
  ok("unite selects one result path", !!res && res.tagName === "path");
  const bb = T.vectorOps.localBBox(res);
  ok("unite bbox is the union (0,0,150,100)",
    near(bb.x, 0, 1) && near(bb.y, 0, 1) && near(bb.w, 150, 1) && near(bb.h, 100, 1), JSON.stringify(bb));
  T.vector.newDoc();
  const c = mkRect(0, 0, 100, 100, "#ff0000");
  const d = mkRect(50, 0, 100, 100, "#0000ff");
  T.vectorOps.minusFront([c, d]);
  const res2 = T.vector.selection()[0];
  const bb2 = T.vectorOps.localBBox(res2);
  ok("minus-front removes the overlap (0,0,50,100)",
    near(bb2.x, 0, 1) && near(bb2.y, 0, 1) && near(bb2.w, 50, 1) && near(bb2.h, 100, 1), JSON.stringify(bb2));
  T.vector.newDoc();
  const e = mkRect(0, 0, 100, 100);
  const f = mkRect(50, 50, 100, 100);
  T.vectorOps.intersect([e, f]);
  const bb3 = T.vectorOps.localBBox(T.vector.selection()[0]);
  ok("intersect bbox is the overlap (50,50,50,50)",
    near(bb3.x, 50, 1) && near(bb3.y, 50, 1) && near(bb3.w, 50, 1) && near(bb3.h, 50, 1), JSON.stringify(bb3));
}
console.log("-- align + distribute --");
{
  T.vector.newDoc();
  const a = mkRect(0, 0, 20, 20);
  const b = mkRect(100, 0, 40, 40);
  T.vectorOps.align([a, b], "centerX");
  const ba = T.vectorOps.visualBBox(a), bb = T.vectorOps.visualBBox(b);
  ok("align centerX matches centers", near(ba.x + ba.w / 2, bb.x + bb.w / 2, 0.01),
    JSON.stringify([ba, bb]));
  T.vector.newDoc();
  const r1 = mkRect(0, 0, 10, 10), r2 = mkRect(50, 0, 10, 10), r3 = mkRect(100, 0, 10, 10);
  T.vectorOps.distributeSpacing([r1, r2, r3], "x", 20);
  const x1 = T.vectorOps.visualBBox(r1).x, x2 = T.vectorOps.visualBBox(r2).x, x3 = T.vectorOps.visualBBox(r3).x;
  ok("distribute with exact 20px gap", near(x1, 0, 0.01) && near(x2, 30, 0.01) && near(x3, 60, 0.01),
    [x1, x2, x3].join(","));
  T.vector.newDoc();
  const s1 = mkRect(10, 10, 20, 20);
  const s2 = mkRect(200, 10, 20, 20);
  T.vectorOps.align([s1, s2], "left", { x: 0, y: 0, w: 800, h: 600 });
  ok("align-to-artboard moves both to x=0",
    near(T.vectorOps.visualBBox(s1).x, 0, 0.01) && near(T.vectorOps.visualBBox(s2).x, 0, 0.01));
}
console.log("-- swatches --");
{
  T.vector.newDoc();
  const r = mkRect(5, 5, 30, 30);
  T.vector.select([r]);
  const sw = T.vecEngine.swatches()[0];
  T.vecEngine.applySwatch(sw);
  ok("applySwatch sets a url() fill with the swatch reference",
    (r.getAttribute("fill") || "").indexOf("url(#vgsw-") === 0 && r.getAttribute("data-vsw") === sw.id);
  ok("swatch gradient def exists in the svg", !!doc.querySelector('[id="vgsw-' + sw.id + '"]'));
}
console.log("-- view modes --");
{
  T.vecEngine.setOutline(true);
  ok("outline mode adds the v-outline class", T.vector.svgEl().classList.contains("v-outline"));
  T.vector.newDoc();
  mkRect(10, 10, 40, 40);
  T.vecEngine.setOutline(true);
  ok("outline mode draws anchor squares", doc.querySelectorAll("[data-ol-anchor]").length >= 4);
  T.vecEngine.setOutline(false);
  ok("outline off removes anchors and the class",
    !T.vector.svgEl().classList.contains("v-outline") && doc.querySelectorAll("[data-ol-anchor]").length === 0);
  T.vectorGuides.set(true);
  ok("smart guides enable", T.vectorGuides.enabled() === true);
  T.vector.newDoc();
  const m1 = mkRect(0, 0, 10, 10), m2 = mkRect(30, 0, 10, 10);
  const sn = T.vectorGuides.snapMove([m1], 17, 0);
  ok("guide snapMove snaps the drag", near(sn.dx, 20, 1e-9) && sn.guides.length > 0, "dx=" + sn.dx);
  T.vectorGuides.set(false);
}
console.log("-- export svg uses artboard bounds --");
{
  T.vector.newDoc();
  mkRect(10, 10, 40, 40);
  const ab = T.vecEngine.activeArtboard();
  const s = T.vecEngine.exportArtboardSVG(ab);
  ok("export svg has the artboard viewBox",
    s.indexOf('viewBox="' + ab.x + " " + ab.y + " " + ab.w + " " + ab.h + '"') > 0);
  ok("export svg has no trace preview", s.indexOf("data-trace-preview") < 0);
  const shapes = T.vecEngine.shapesForExport(ab);
  ok("shapesForExport flattens artwork", shapes.length >= 1 && shapes[0].loops && shapes[0].loops.length === 1);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nALL VEC ENGINE TESTS PASSED");
process.exit(fail ? 1 : 0);
