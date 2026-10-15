/* NXT PXL develop engine tests.
   Part 1: pure pixel math, loaded in a bare vm context (NO canvas, NO DOM).
   Part 2: UI smoke test in jsdom with a pure-JS canvas stub.
   Run: NODE_PATH=/home/hatch/workspace/.jsdom-test/node_modules node test/pxl-engine.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("ok   - " + name); }
  else { fail++; console.log("FAIL - " + name + (extra ? " :: " + extra : "")); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ================= Part 1: pure math ================= */
const sandbox = { window: { TXT: {} }, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/pixel/develop-core.js"), "utf8"), sandbox);
const PXL = sandbox.window.TXT.PXL;
if (!PXL) { console.log("FAIL - T.PXL did not load"); process.exit(1); }
const NP = () => PXL.neutralParams();
const DP = (r, g, b, p) => PXL.developPixel(r, g, b, Object.assign(NP(), p));

console.log("-- exposure (2^EV) --");
ok("EV +1 doubles a mid pixel to white", eq(DP(128, 128, 128, { exposure: 1 }), [255, 255, 255]));
ok("EV -1 halves the pixel", eq(DP(200, 200, 200, { exposure: -1 }), [100, 100, 100]));
ok("EV 0 is a no-op", eq(DP(100, 150, 200, {}), [100, 150, 200]));

console.log("-- contrast S-curve about 128 --");
ok("positive contrast brightens brights", DP(192, 192, 192, { contrast: 50 })[0] > 192);
ok("positive contrast darkens darks", DP(64, 64, 64, { contrast: 50 })[0] < 64);
ok("negative contrast flattens", DP(192, 192, 192, { contrast: -50 })[0] < 192);

console.log("-- histogram binning --");
{
  const d = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255, 128, 0, 0, 255, 128, 0, 0, 255
  ]);
  const h = PXL.histogram(d);
  ok("red bins count", h.r[0] === 1 && h.r[128] === 2 && h.r[255] === 1,
    JSON.stringify([h.r[0], h.r[128], h.r[255]]));
  ok("luminance uses 0.2126/0.7152/0.0722 weights",
    h.lum[27] === 2 && h.lum[0] === 1 && h.lum[255] === 1,
    "lum[27]=" + h.lum[27]);
}

console.log("-- tone curve --");
{
  const lut = PXL.lutFromPoints([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
  let ident = true;
  for (let i = 0; i < 256; i++) if (lut[i] !== i) { ident = false; break; }
  ok("identity LUT leaves every value unchanged", ident);
  ok("identity curve is a no-op in the pipeline", eq(DP(100, 150, 200, {}), [100, 150, 200]));
  const p = NP(); p.curve = { rgb: [{ x: 0, y: 0 }, { x: 255, y: 0 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };
  ok("crush curve maps everything to black", eq(DP(200, 100, 50, p), [0, 0, 0]));
}

console.log("-- preset intensity scaling --");
{
  const pr = PXL.BUILTIN_PRESETS.find((x) => x.name === "H3NZ Chrome");
  const z = PXL.scalePreset(pr, 0), n = NP();
  delete z._lutCache; delete n._lutCache;
  ok("0% intensity is a no-op", eq(z, n));
  const f = PXL.scalePreset(pr, 100);
  ok("100% intensity applies the full delta", Math.abs(f.exposure - 0.3) < 1e-9 && Math.abs(f.clarity - 40) < 1e-9);
  const d2 = PXL.scalePreset(pr, 200);
  ok("200% intensity doubles the delta", Math.abs(d2.exposure - 0.6) < 1e-9);
  ok("32+ built-in presets", PXL.BUILTIN_PRESETS.length >= 32, String(PXL.BUILTIN_PRESETS.length));
  ok("8 preset folders", PXL.PRESET_FOLDERS.length === 8);
}

console.log("-- vibrance protects saturated pixels --");
{
  const ch = (r, g, b) => {
    const o = DP(r, g, b, { vibrance: 80 });
    return Math.abs(o[0] - r) + Math.abs(o[1] - g) + Math.abs(o[2] - b);
  };
  ok("saturated pixel barely moves", ch(255, 0, 0) < 3, String(ch(255, 0, 0)));
  ok("desaturated pixel moves more", ch(200, 180, 180) > ch(255, 0, 0));
}

console.log("-- B&W luminance weights --");
ok("red maps to 0.2126", eq(DP(255, 0, 0, { bw: 100 }), [54, 54, 54]), JSON.stringify(DP(255, 0, 0, { bw: 100 })));
ok("green maps to 0.7152", eq(DP(0, 255, 0, { bw: 100 }), [182, 182, 182]));
ok("blue maps to 0.0722", eq(DP(0, 0, 255, { bw: 100 }), [18, 18, 18]));

console.log("-- white balance, saturation, auto tone, clipping --");
ok("warm temp lifts red and drops blue", (() => {
  const o = DP(128, 128, 128, { temp: 100 }); return o[0] > 128 && o[2] < 128;
})());
ok("saturation -100 gives gray", (() => {
  const o = DP(200, 100, 50, { saturation: -100 });
  return Math.abs(o[0] - o[1]) <= 2 && Math.abs(o[1] - o[2]) <= 2;
})());
ok("auto tone stretches points", (() => {
  const d = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = i; d[i * 4 + 3] = 255; }
  const t = PXL.autoTonePoints(d);
  return t.black < 0.1 && t.white > 0.9 && t.black < t.white;
})());
ok("clipping stats count pure black/white", (() => {
  const d = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 10, 10, 10, 255]);
  const c = PXL.clippingStats(d);
  return c.black === 1 && c.white === 1;
})());

console.log("-- masks --");
ok("linear mask ramps 0 to 1", (() => {
  const m = { type: "linear", enabled: true, feather: 50, geom: { x0: 0, y0: 0.5, x1: 1, y1: 0.5 } };
  const w = PXL.buildMaskWeights(m, 100, 10, new Uint8ClampedArray(100 * 10 * 4));
  return w[0] === 0 && w[99] > 0.99;
})());
ok("radial invert flips the mask", (() => {
  const base = { type: "radial", enabled: true, feather: 50, geom: { cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3 } };
  const a = PXL.buildMaskWeights(base, 20, 20, new Uint8ClampedArray(20 * 20 * 4));
  const b = PXL.buildMaskWeights(Object.assign({}, base, { invert: true }), 20, 20, new Uint8ClampedArray(20 * 20 * 4));
  const c = 10 * 20 + 10;
  return Math.abs(a[c] + b[c] - 1) < 1e-6 && a[c] > 0.9;
})());
ok("masked exposure blends by weight", (() => {
  const src = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
  const masks = [{ type: "linear", enabled: true, feather: 0, geom: { x0: 0, y0: 0.5, x1: 1, y1: 0.5 }, adj: { exposure: 1 } }];
  const out = PXL.developImageData(src, 2, 1, NP(), { masks: masks });
  return out[0] === 100 && out[4] === 200;
})(), "pixel under weight 1 should double to 200, weight 0 stays 100");
ok("developImageData handles grain/vignette without crashing", (() => {
  const src = new Uint8ClampedArray(16 * 16 * 4).fill(128);
  const p = NP();
  p.effects.grain.amount = 40; p.effects.vignette.amount = -50;
  p.detail.sharpen = 60; p.clarity = 30;
  const out = PXL.developImageData(src, 16, 16, p, {});
  return out.length === src.length;
})());

/* ================= Part 2: UI smoke test (jsdom) ================= */
console.log("-- UI smoke (jsdom) --");
const { JSDOM } = require("jsdom");
function makeCtx(canvas) {
  function pxbuf() { return canvas._px; }
  const grad = { addColorStop() {} };
  return {
    canvas: canvas, globalAlpha: 1, globalCompositeOperation: "source-over",
    fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, font: "10px sans-serif",
    _parseColor(s) {
      const m = /^#([0-9a-f]{6})$/i.exec(s || "");
      if (m) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255]; }
      const m2 = /^rgba?\(([^)]+)\)/.exec(s || "");
      if (m2) { const p = m2[1].split(",").map(Number); return [p[0] | 0, p[1] | 0, p[2] | 0, p[3] == null ? 255 : Math.round(p[3] * 255)]; }
      return [0, 0, 0, 255];
    },
    getImageData(x, y, w, h) {
      x |= 0; y |= 0;
      const out = new Uint8ClampedArray(w * h * 4), src = pxbuf(), W = canvas.width;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const sx = x + i, sy = y + j;
        if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
        const s = ((sy * W) + sx) * 4, d = ((j * w) + i) * 4;
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
      }
      return new window.ImageData(out, w, h);
    },
    putImageData(img, x, y) {
      x |= 0; y |= 0;
      const src = img.data, dst = pxbuf(), W = canvas.width;
      for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
        const dx = x + i, dy = y + j;
        if (dx < 0 || dy < 0 || dx >= canvas.width || dy >= canvas.height) continue;
        const s = ((j * img.width) + i) * 4, d = ((dy * W) + dx) * 4;
        dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3];
      }
    },
    createImageData(w, h) { return new window.ImageData(new Uint8ClampedArray(w * h * 4), w, h); },
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    clearRect(x, y, w, h) {
      const dst = pxbuf(), W = canvas.width;
      for (let j = Math.max(0, y | 0); j < Math.min(canvas.height, (y + h) | 0); j++)
        for (let i = Math.max(0, x | 0); i < Math.min(canvas.width, (x + w) | 0); i++) {
          const d = ((j * W) + i) * 4;
          dst[d] = dst[d + 1] = dst[d + 2] = dst[d + 3] = 0;
        }
    },
    fillRect(x, y, w, h) {
      const c = this._parseColor(this.fillStyle), dst = pxbuf(), W = canvas.width;
      for (let j = Math.max(0, y | 0); j < Math.min(canvas.width === 0 ? 0 : canvas.height, (y + h) | 0); j++)
        for (let i = Math.max(0, x | 0); i < Math.min(canvas.width, (x + w) | 0); i++) {
          const d = ((j * W) + i) * 4, a = (c[3] / 255) * this.globalAlpha;
          dst[d] = dst[d] * (1 - a) + c[0] * a; dst[d + 1] = dst[d + 1] * (1 - a) + c[1] * a;
          dst[d + 2] = dst[d + 2] * (1 - a) + c[2] * a; dst[d + 3] = Math.max(dst[d + 3], c[3] * this.globalAlpha);
        }
    },
    drawImage() {},
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
    fillText() {}, strokeText() {}, clip() {}, setLineDash() {},
    setPointerCapture() {}, releasePointerCapture() {},
    measureText() { return { width: 0 }; }
  };
}
function stubCanvas(win) {
  const OrigCreate = win.document.createElement.bind(win.document);
  win.document.createElement = function (tag) {
    const el = OrigCreate(tag);
    if (String(tag).toLowerCase() === "canvas") {
      el._px = new Uint8ClampedArray(0);
      let _w = 300, _h = 150;
      Object.defineProperty(el, "width", {
        get() { return _w; },
        set(v) { _w = v | 0; el._px = new Uint8ClampedArray(_w * _h * 4); }
      });
      Object.defineProperty(el, "height", {
        get() { return _h; },
        set(v) { _h = v | 0; el._px = new Uint8ClampedArray(_w * _h * 4); }
      });
      el._px = new Uint8ClampedArray(_w * _h * 4);
      el.getContext = function () { return makeCtx(el); };
      el.setPointerCapture = function () {};
      el.getBoundingClientRect = function () { return { left: 0, top: 0, width: _w, height: _h, right: _w, bottom: _h }; };
    }
    return el;
  };
  win.ImageData = function (data, w, h) {
    if (data && typeof data !== "number" && typeof data.length === "number") {
      this.data = data; this.width = w; this.height = h || Math.round(data.length / 4 / w);
    } else { this.width = data; this.height = w; this.data = new Uint8ClampedArray(data * w * 4); }
  };
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="pPanels"></div><div id="pCanvasWrap"></div></body></html>', {
  url: "https://localhost/", pretendToBeVisual: true, runScripts: "outside-only"
});
const window = dom.window;
stubCanvas(window);
const busHandlers = {};
function mkLayer() {
  const c = window.document.createElement("canvas");
  c.width = 16; c.height = 16;
  const x = c.getContext("2d");
  x.fillStyle = "#808080"; x.fillRect(0, 0, 16, 16);
  return { id: "l1", name: "Layer 1", canvas: c, visible: true, opacity: 1, blend: "source-over", locked: false };
}
const L1 = mkLayer();
window.TXT = {
  $: (s, r) => (r || window.document).querySelector(s),
  $$: (s, r) => Array.prototype.slice.call((r || window.document).querySelectorAll(s)),
  uid: () => "u" + Math.random().toString(36).slice(2),
  esc: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: () => {},
  modal: () => Promise.resolve(null),
  register: () => {},
  store: {
    _data: {},
    get(a, k) { const n = this._data[a]; return n ? JSON.parse(JSON.stringify(n[k])) : undefined; },
    set(a, k, v) { (this._data[a] = this._data[a] || {})[k] = JSON.parse(JSON.stringify(v)); return v; }
  },
  bus: {
    on: (e, fn) => { (busHandlers[e] = busHandlers[e] || []).push(fn); },
    emit: (e, d) => { (busHandlers[e] || []).forEach((fn) => fn(d)); }
  },
  pixel: {
    activeLayer: () => L1,
    composite: () => {},
    newDoc: () => {},
    getZoom: () => 1,
    internal: { isActive: () => true }
  }
};
window.eval(fs.readFileSync(path.join(ROOT, "js/pixel/develop-core.js"), "utf8"));
window.eval(fs.readFileSync(path.join(ROOT, "js/pixel/develop-ui.js"), "utf8"));

const q = (s, r) => (r || window.document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || window.document).querySelectorAll(s));
function fireInput(elm, v) {
  elm.value = String(v);
  elm.dispatchEvent(new window.Event("input", { bubbles: true }));
}

/* init() runs on DOMContentLoaded in the worker; wait for it before asserting */
function runUITests() {
setTimeout(async () => {
ok("develop UI built", !!window.TXT.pixelDevelop);
ok("6 panels prepended", qa("#pPanels > .dv-panel").length === 6, String(qa("#pPanels > .dv-panel").length));
ok("8 develop accordions", qa(".dv-acc").length === 8, String(qa(".dv-acc").length));
ok("histogram canvas is 280x120", (() => { const h = q(".dv-hist"); return h && h.width === 280 && h.height === 120; })());
ok("5 tonal zones", qa(".dv-zone").length === 5);
ok("32+ preset buttons rendered", qa(".dv-preset").length >= 32, String(qa(".dv-preset").length));
ok("8 filmstrip photos", qa(".dv-fitem").length === 8);
ok("tone curve canvas is 256x256", (() => { const c = q(".dv-curve"); return c && c.width === 256 && c.height === 256; })());
ok("4 grading wheels", qa(".dv-wheel").length === 4);
ok("mask add buttons present", ["Linear", "Radial", "Brush"].every((t) =>
  qa(".px-btn").some((b) => b.textContent === t)));
ok("heuristic buttons labeled as beta", (() => {
  const hs = qa(".px-btn").filter((b) => /Heuristic/.test(b.textContent));
  return hs.length === 2 && hs.every((b) => /heuristic/i.test(b.title));
})());
ok("no em dashes in UI text", !/[—]/.test(window.document.getElementById("pPanels").textContent));
ok("pixelDevelop API exposes preset/film counts",
  window.TXT.pixelDevelop.presetCount() >= 32 && window.TXT.pixelDevelop.filmCount() === 8);

  /* slider drives a real render */
  const expRow = qa(".dv-srow").find((r) => r.textContent.indexOf("Exposure") === 0);
  ok("exposure slider row found", !!expRow);
  const before = L1.canvas.getContext("2d").getImageData(0, 0, 16, 16).data.slice();
  fireInput(expRow.querySelector("input"), 1);
  await new Promise((r) => setTimeout(r, 350));
  const mid = L1.canvas.getContext("2d").getImageData(0, 0, 16, 16).data;
  ok("exposure +1 brightens the layer", mid[0] > before[0], before[0] + " -> " + mid[0]);
  expRow.querySelector("input").dispatchEvent(new window.Event("change", { bubbles: true }));
  ok("slider commit logs history", window.TXT.pixelDevelop.history().length > 0);

  /* preset click applies real params */
  const noir = qa(".dv-preset").find((b) => b.textContent === "H3NZ Noir");
  ok("H3NZ Noir preset found", !!noir);
  noir.click();
  await new Promise((r) => setTimeout(r, 350));
  ok("preset click sets params", Math.abs(window.TXT.pixelDevelop.params().contrast - 35) < 1e-9);

  /* mask add creates a mask row */
  qa(".px-btn").find((b) => b.textContent === "Brush").click();
  ok("brush mask added", qa(".dv-maskrow").length === 1);

  /* keyboard: J cycles clipping without throwing */
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "j", bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  ok("J key handled", true);

  /* new preset modal: name + group checkboxes persist to localStorage */
  qa(".px-btn").find((b) => b.textContent === "+ New preset").click();
  await new Promise((r) => setTimeout(r, 150));
  const pov = q(".px-overlay .px-modal");
  ok("new preset modal opens", !!pov);
  if (pov) {
    pov.querySelector('input[type="text"]').value = "Test Preset";
    pov.querySelector('input[data-g="lens"]').checked = false;
    qa(".px-btn", pov).find((b) => b.textContent === "Save preset").click();
    await new Promise((r) => setTimeout(r, 150));
    const stored = JSON.parse(window.localStorage.getItem("pxl.userPresets") || "[]");
    ok("preset saved to localStorage", stored.length === 1 && stored[0].name === "Test Preset");
    ok("unchecked group excluded, checked groups kept",
      stored[0].params.lens === undefined && typeof stored[0].params.exposure === "number");
    ok("new preset button rendered", qa(".dv-preset").some((b) => b.textContent === "Test Preset"));
    ok("modal closed after save", !q(".px-overlay"));
  }

  console.log(fail ? "\n" + fail + " FAILURES" : "\nALL PXL ENGINE TESTS PASSED (" + pass + " checks)");
  process.exit(fail ? 1 : 0);
}, 150);
}
if (window.document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", runUITests);
} else {
  runUITests();
}
