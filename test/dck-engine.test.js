/* DCK engine depth-upgrade test (jsdom).
   Stubs window.TXT minimally, loads js/dck/dck.js then js/dck/dck-engine.js,
   then verifies the engine: morph math, transition registry, SmartArt,
   compiler mapping, PPTX output, animation sequencing, remove-background
   heuristic, ink hit-testing, ribbon mount.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/dck-engine.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><main id="views"><section id="view-dck" class="view hidden"></section></main></body></html>',
  { url: "https://localhost/", pretendToBeVisual: true, runScripts: "dangerously" }
);
const { window } = dom;

const busListeners = {};
const storeDb = {};
window.TXT = {
  bus: {
    on: (ev, fn) => { (busListeners[ev] = busListeners[ev] || []).push(fn); },
    emit: (ev, data) => { (busListeners[ev] || []).slice().forEach((fn) => fn(data)); }
  },
  store: {
    get: (app, key) => {
      const ns = storeDb[app];
      if (!ns) return undefined;
      return key === undefined ? ns : ns[key];
    },
    set: (app, key, val) => {
      if (!app) return;
      storeDb[app] = storeDb[app] || {};
      storeDb[app][key] = val;
      return val;
    },
    on: () => {}, emit: () => {}
  },
  cmds: {},
  register(name, fn, meta) { window.TXT.cmds[name] = { fn, meta: meta || {} }; },
  t: (k) => k,
  uid: (() => { let n = 0; return () => "t" + (++n); })(),
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  debounce: (fn) => fn,
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: () => {},
  ecosystem: { toggleLauncher: () => {}, openApp: () => {} },
  modal: () => Promise.resolve(null),
  sel: null
};
window.eval(fs.readFileSync(path.join(ROOT, "js/dck/dck.js"), "utf8"));
window.eval(fs.readFileSync(path.join(ROOT, "js/dck/dck-engine.js"), "utf8"));

const T = window.TXT, E = T.dckEngine;
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond) {
  if (cond) { pass++; console.log("ok   - " + name); }
  else { fail++; failures.push(name); console.log("FAIL - " + name); }
}
function eq(name, a, b) { ok(name + " (got " + JSON.stringify(a) + ")", a === b); }
function near(name, a, b) { ok(name + " (got " + a + ")", Math.abs(a - b) < 1e-9); }

/* ---------- 1. engine loaded ---------- */
ok("T.dckEngine exists", !!E);

/* ---------- 2. morph interpolation math ---------- */
{
  const m = E.morphInterp({ x: 0, y: 0, w: 10, h: 10, rot: 0, op: 0 },
                          { x: 100, y: 50, w: 20, h: 30, rot: 90, op: 1 }, 0.5);
  near("morph x midpoint", m.x, 50);
  near("morph y midpoint", m.y, 25);
  near("morph w midpoint", m.w, 15);
  near("morph h midpoint", m.h, 20);
  near("morph rot midpoint", m.rot, 45);
  near("morph opacity midpoint", m.op, 0.5);
  const e0 = E.morphInterp({ x: 5 }, { x: 9 }, 0);
  eq("morph t=0 returns start", e0.x, 5);
  const e1 = E.morphInterp({ x: 5 }, { x: 9 }, 1);
  eq("morph t=1 returns end", e1.x, 9);
}

/* ---------- 3. transition registry: every id resolves to a real function ---------- */
{
  const ids = E.transitionIds;
  ok("at least 12 transitions registered", ids.length >= 12);
  let allFn = true;
  ids.forEach((id) => {
    const t = E.transitions[id];
    if (!t || typeof t.apply !== "function") { allFn = false; }
  });
  ok("all registered transitions resolve to real apply functions", allFn);
  ["none", "fade", "pushL", "pushR", "pushU", "pushD", "wipe", "split",
   "reveal", "cover", "zoom", "flip", "cube"].forEach((id) => {
    ok("transition '" + id + "' present", ids.indexOf(id) >= 0);
  });
  eq("legacy 'fade-up' resolves to 'fade'", E.resolveTransition("fade-up"), "fade");
  eq("legacy 'slide-left' resolves to 'pushL'", E.resolveTransition("slide-left"), "pushL");
  eq("unknown transition resolves to 'none'", E.resolveTransition("bogus"), "none");
}

/* ---------- 4. SmartArt: chevron flow renders N chevrons for N items ---------- */
{
  const svg = E.smartart("chevron", [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }], "#FF2E93");
  const chevrons = (svg.match(/<polygon/g) || []).length;
  eq("chevron flow: 4 items -> 4 polygons", chevrons, 4);
  ok("chevron svg contains item text", svg.indexOf("C") >= 0);
  const one = E.smartart("chevron", [{ text: "Solo" }], "#FF2E93");
  eq("chevron flow: 1 item -> 1 polygon", (one.match(/<polygon/g) || []).length, 1);
  ["cycle", "hierarchy", "pyramid", "venn", "timeline", "matrix", "swot"].forEach((d) => {
    const s = E.smartart(d, [{ text: "A" }, { text: "B" }, { text: "C" }], "#FF2E93");
    ok("smartart '" + d + "' renders svg", s.indexOf("<svg") === 0 && s.indexOf("</svg>") > 0);
  });
  eq("smartart list has 8 diagrams", E.smartartList.length, 8);
}

/* ---------- 5. chart svg ---------- */
{
  const svg = E.chart({ chartType: "bar", title: "Sales", labels: ["A", "B"], values: [5, 10] });
  ok("bar chart renders rects", (svg.match(/<rect/g) || []).length >= 2);
  const line = E.chart({ chartType: "line", labels: ["A", "B"], values: [5, 10] });
  ok("line chart renders polyline", line.indexOf("<polyline") >= 0);
  const pie = E.chart({ chartType: "pie", labels: ["A", "B"], values: [5, 10] });
  ok("pie chart renders paths", pie.indexOf("<path") >= 0);
}

/* ---------- 6. TXT-to-DCK compiler mapping ---------- */
{
  const doc = window.document.createElement("div");
  doc.innerHTML =
    "<h1>My Report</h1><p>Intro paragraph.</p>" +
    "<h1>Part One</h1><p>Some text.</p>" +
    "<h2>Details</h2><ul><li>point one</li><li>point two</li></ul>" +
    "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>" +
    "<h2>More</h2><p>closing</p>";
  const parsed = T.dck.parseDocument(doc);
  ok("parseDocument reads doc title", parsed.title === "My Report");
  eq("second H1 marked as divider section", parsed.slides[0].divider, true);
  eq("H2 becomes a content section", parsed.slides[1].title, "Details");
  const plan = E.compileMap(parsed);
  eq("plan[0] is the cover", plan[0].layout, "cover");
  eq("plan[1]: H1 -> section divider", plan[1].layout, "divider");
  eq("plan[2]: H2 -> content slide", plan[2].layout, "content");
  eq("plan[3]: H2 -> content slide", plan[3].layout, "content");
  // real end-to-end through the deck builder
  T.sel = { sheet: () => doc };
  const built = T.dck.generateFromDocument();
  T.sel = null;
  ok("generateFromDocument builds a deck", !!built && built.slides.length >= 4);
  eq("built slide 2 uses divider layout", built.slides[1].layout, "divider");
  ok("divider title carries a morph id", built.slides[1].blocks.some((b) => b.morphId === "dck-title"));
  ok("cover title carries a morph id", built.slides[0].blocks.some((b) => b.morphId === "dck-title"));
}

/* ---------- 7. PPTX: PK magic + title text ---------- */
{
  const deck = {
    title: "Quarterly Review Q3",
    theme: "studio",
    slides: [
      { blocks: [
        { id: "b1", type: "text", x: 8, y: 10, w: 84, h: 20, html: "Quarterly Review Q3", cls: "dck-b-title" },
        { id: "b2", type: "bullets", x: 8, y: 35, w: 84, h: 50, items: ["Revenue up", "Costs flat"], cls: "dck-b-body" }
      ] },
      { blocks: [
        { id: "b3", type: "table", x: 8, y: 20, w: 84, h: 40, rows: [["Q", "Rev"], ["Q3", "120"]] }
      ] }
    ]
  };
  const bytes = E.buildPptx(deck);
  ok("pptx output is non-trivial", bytes.length > 2000);
  eq("pptx starts with PK magic (0x50)", bytes[0], 0x50);
  eq("pptx starts with PK magic (0x4B)", bytes[1], 0x4B);
  const buf = Buffer.from(bytes);
  ok("pptx contains the deck title text", buf.indexOf("Quarterly Review Q3") >= 0);
  ok("pptx contains bullet text", buf.indexOf("Revenue up") >= 0);
  ok("pptx contains the H3NZ stamp", buf.indexOf("Developed by H3NZ") >= 0);
  ok("pptx declares both slides", buf.indexOf("ppt/slides/slide2.xml") >= 0);
}

/* ---------- 8. animation sequence reorder ---------- */
{
  eq("move up swaps", JSON.stringify(E.moveSeqItem(["a", "b", "c"], "b", -1)), '["b","a","c"]');
  eq("move down swaps", JSON.stringify(E.moveSeqItem(["a", "b", "c"], "b", 1)), '["a","c","b"]');
  eq("move past start is a no-op", JSON.stringify(E.moveSeqItem(["a", "b"], "a", -1)), '["a","b"]');
  eq("move past end is a no-op", JSON.stringify(E.moveSeqItem(["a", "b"], "b", 1)), '["a","b"]');
  eq("unknown id is a no-op", JSON.stringify(E.moveSeqItem(["a"], "z", 1)), '["a"]');
}

/* ---------- 9. remove-background heuristic (pure) ---------- */
{
  const w = 4, h = 4;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = 255; px[i * 4 + 1] = 255; px[i * 4 + 2] = 255; px[i * 4 + 3] = 255; }
  // red 2x2 island in the middle
  [[1, 1], [2, 1], [1, 2], [2, 2]].forEach(([x, y]) => {
    const i = (y * w + x) * 4;
    px[i] = 200; px[i + 1] = 30; px[i + 2] = 30;
  });
  const cleared = E.floodFillAlpha(px, w, h, 28);
  eq("corners cleared, island kept (12 px)", cleared, 12);
  const ci = (1 * w + 1) * 4;
  eq("island pixel keeps alpha", px[ci + 3], 255);
  eq("corner pixel is transparent", px[3], 0);
}

/* ---------- 10. ink hit test ---------- */
{
  const strokes = [{ pts: [[0, 0], [10, 10]] }, { pts: [[50, 50], [60, 60]] }];
  eq("hit near first stroke", E.inkHitTest(strokes, 5, 5.4, 2), 0);
  eq("hit near second stroke", E.inkHitTest(strokes, 55, 55, 2), 1);
  eq("miss returns -1", E.inkHitTest(strokes, 90, 10, 2), -1);
}

/* ---------- 11. slideHtml serializer ---------- */
{
  const deck = { theme: "studio", aspect: "16:9", slideNumbers: true };
  const slide = { blocks: [
    { id: "t1", type: "text", x: 8, y: 10, w: 84, h: 20, html: "Hello", cls: "dck-b-title", morphId: "dck-title", z: 1 },
    { id: "c1", type: "chart", x: 8, y: 35, w: 40, h: 50, chartType: "bar", labels: ["A"], values: [3], z: 2 },
    { id: "s1", type: "smartart", x: 52, y: 35, w: 40, h: 50, diagram: "chevron", items: [{ text: "X" }], z: 3 }
  ], ink: [{ tool: "pen", color: "#111111", width: 0.6, pts: [[1, 1], [2, 2]] }] };
  const html = E.slideHtml(deck, slide, 2);
  ok("serializer keeps morph id", html.indexOf('data-morph-id="dck-title"') >= 0);
  ok("serializer embeds chart svg", html.indexOf("<svg") >= 0);
  ok("serializer renders slide number 3", html.indexOf(">3</div>") >= 0);
  ok("serializer embeds ink path", html.indexOf("<path") >= 0);
  const myHtml = E.slideHtml(deck, { blocks: [
    { id: "m1", type: "text", x: 8, y: 10, w: 84, h: 20, html: "မင်္ဂလာပါ", cls: "dck-b-body" }
  ] }, 0);
  ok("myanmar text gets lang=my", myHtml.indexOf('lang="my"') >= 0);
}

/* ---------- 11b. native SVG renderer (PNG-safe, no foreignObject) ---------- */
{
  const deck = { theme: "studio", aspect: "16:9", slideNumbers: true };
  const slide = { blocks: [
    { id: "t1", type: "text", x: 8, y: 10, w: 84, h: 20, html: "Hello <b>World</b>", cls: "dck-b-title", z: 1 },
    { id: "b1", type: "bullets", x: 8, y: 35, w: 40, h: 30, items: ["Alpha", "Beta"], cls: "dck-b-body", z: 2 },
    { id: "c1", type: "chart", x: 52, y: 35, w: 40, h: 30, chartType: "pie", labels: ["A", "B"], values: [3, 7], z: 3 },
    { id: "s1", type: "shape", x: 8, y: 70, w: 20, h: 15, shape: "ellipse", fill: "#FF2E93", z: 4 }
  ], ink: [{ tool: "pen", color: "#111111", width: 1, pts: [[1, 1], [5, 8]] }] };
  const r = E.slideSvgNative(deck, slide, 1);
  ok("native svg has no foreignObject", r.svg.indexOf("foreignObject") < 0);
  ok("native svg keeps text", r.svg.indexOf("Hello") >= 0 && r.svg.indexOf("World") >= 0);
  ok("native svg keeps bold run", r.svg.indexOf('font-weight="700"') >= 0);
  ok("native svg keeps bullets", r.svg.indexOf("Alpha") >= 0);
  ok("native svg nests chart", r.svg.indexOf("<path") >= 0);
  ok("native svg draws ellipse", r.svg.indexOf("<ellipse") >= 0);
  ok("native svg keeps ink", (r.svg.match(/<path/g) || []).length >= 2);
  ok("native svg slide number", r.svg.indexOf(">2</text>") >= 0);
  eq("native svg width 1280", r.W, 1280);
  const v = E.slideSvgNative({ theme: "studio", aspect: "9:16" }, { blocks: [] }, 0);
  eq("native svg 9:16 height", v.H, Math.round(1280 * 16 / 9));
}

/* ---------- 12. presenter console html ---------- */
{
  const deck = { theme: "studio", aspect: "16:9", title: "Demo" };
  const data = [{ html: E.slideHtml(deck, { blocks: [] }, 0), notes: "Say hi.", n: 1 }];
  const ch = E.buildConsoleHtml(data, 0, "Demo");
  ok("console html stamps H3NZ", ch.indexOf("Developed by H3NZ") >= 0);
  ok("console html has blackout control", ch.indexOf("Blackout") >= 0);
  ok("console html has laser control", ch.indexOf("Laser") >= 0);
  ok("console html carries slide data", ch.indexOf("SLIDES=") >= 0);
  ok("console html has no literal </script> inside strings",
    (ch.match(/<script>/g) || []).length === 1);
}

/* ---------- 13. ribbon mounts when the editor opens ---------- */
{
  const deck = T.dck.newDeck("Engine Test Deck", "blank");
  ok("deck created", !!deck);
  const rib = window.document.getElementById("dck-ribbon");
  ok("ribbon exists after show()", !!rib);
  const tabs = rib ? rib.querySelectorAll(".dckr-tab") : [];
  eq("ribbon has 8 tabs", tabs.length, 8);
  const names = Array.prototype.map.call(tabs, (t) => t.textContent).join("|");
  ["Home", "Insert", "Draw", "Design", "Transitions", "Animations", "Slide Show", "View"]
    .forEach((n) => ok("ribbon tab '" + n + "'", names.indexOf(n) >= 0));
  ok("engine reports ribbon built", E._ribbonBuilt());
  // switch tabs programmatically
  E.setRibbonTab("transitions");
  const panel = window.document.getElementById("dckr-panel-transitions");
  ok("transitions panel shows after tab switch", !!panel && panel.style.display !== "none");
  const trBtns = panel.querySelectorAll(".dckr-btn");
  ok("transitions panel has buttons for every transition", trBtns.length >= E.transitionIds.length);
  E.setRibbonTab("home");
}

console.log(failures.length ? "\n" + failures.length + " FAILURES: " + failures.join(", ") : "\nALL DCK ENGINE TESTS PASSED (" + pass + " passed)");
process.exit(failures.length ? 1 : 0);
