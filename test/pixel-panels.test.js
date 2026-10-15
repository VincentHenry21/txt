/* Pixel panels smoke test: stubs canvas 2D in pure JS, provides a mock T.pixel
   implementing the contract, loads layers.js + adjust.js, exercises ops.
   Run: NODE_PATH=<jsdom dir> node test/pixel-panels.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");

/* ---------- pure-JS canvas 2D stub ---------- */
function makeCtx(canvas) {
  function px() { return canvas._px; }
  return {
    canvas: canvas,
    globalAlpha: 1, globalCompositeOperation: "source-over",
    fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1,
    _parseColor(s) {
      var m = /^#([0-9a-f]{6})$/i.exec(s || "");
      if (m) return [parseInt(m.slice(1, 3), 16), parseInt(m.slice(3, 5), 16), parseInt(m.slice(5, 7), 16), 255];
      var m2 = /^rgba?\(([^)]+)\)/.exec(s || "");
      if (m2) { var p = m2[1].split(",").map(Number); return [p[0] | 0, p[1] | 0, p[2] | 0, p[3] == null ? 255 : Math.round(p[3] * 255)]; }
      return [0, 0, 0, 255];
    },
    getImageData(x, y, w, h) {
      x |= 0; y |= 0;
      var out = new Uint8ClampedArray(w * h * 4), src = px(), W = canvas.width;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var sx = x + i, sy = y + j;
        if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
        var s = ((sy * W) + sx) * 4, d = ((j * w) + i) * 4;
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
      }
      return new window.ImageData(out, w, h);
    },
    putImageData(img, x, y) {
      x |= 0; y |= 0;
      var src = img.data, dst = px(), W = canvas.width;
      for (var j = 0; j < img.height; j++) for (var i = 0; i < img.width; i++) {
        var dx = x + i, dy = y + j;
        if (dx < 0 || dy < 0 || dx >= canvas.width || dy >= canvas.height) continue;
        var s = ((j * img.width) + i) * 4, d = ((dy * W) + dx) * 4;
        dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3];
      }
    },
    createImageData(w, h) { return new window.ImageData(new Uint8ClampedArray(w * h * 4), w, h); },
    clearRect(x, y, w, h) {
      var dst = px(), W = canvas.width;
      for (var j = Math.max(0, y | 0); j < Math.min(canvas.height, (y + h) | 0); j++)
        for (var i = Math.max(0, x | 0); i < Math.min(canvas.width, (x + w) | 0); i++) {
          var d = ((j * W) + i) * 4;
          dst[d] = dst[d + 1] = dst[d + 2] = dst[d + 3] = 0;
        }
    },
    fillRect(x, y, w, h) {
      var c = this._parseColor(this.fillStyle), dst = px(), W = canvas.width;
      for (var j = Math.max(0, y | 0); j < Math.min(canvas.height, (y + h) | 0); j++)
        for (var i = Math.max(0, x | 0); i < Math.min(canvas.width, (x + w) | 0); i++) {
          var d = ((j * W) + i) * 4, a = (c[3] / 255) * this.globalAlpha;
          dst[d] = dst[d] * (1 - a) + c[0] * a; dst[d + 1] = dst[d + 1] * (1 - a) + c[1] * a;
          dst[d + 2] = dst[d + 2] * (1 - a) + c[2] * a; dst[d + 3] = Math.max(dst[d + 3], c[3] * this.globalAlpha);
        }
    },
    drawImage(src) {
      var args = Array.prototype.slice.call(arguments, 1);
      var sw, sh, sx = 0, sy = 0, dx, dy, dw, dh;
      var sW = src.width, sH = src.height;
      if (args.length === 2) { dx = args[0]; dy = args[1]; dw = sW; dh = sH; }
      else if (args.length === 4) { dx = args[0]; dy = args[1]; dw = args[2]; dh = args[3]; }
      else { sx = args[0]; sy = args[1]; sw = args[2]; sh = args[3]; dx = args[4]; dy = args[5]; dw = args[6]; dh = args[7]; }
      sw = sw || sW; sh = sh || sH;
      var sctx = src.getContext("2d"), sdata = sctx.getImageData(0, 0, sW, sH).data;
      var dst = px(), W = canvas.width, ga = this.globalAlpha;
      for (var j = 0; j < dh; j++) for (var i = 0; i < dw; i++) {
        var txi = Math.min(sW - 1, Math.max(0, (sx + (i / dw) * sw) | 0));
        var tyi = Math.min(sH - 1, Math.max(0, (sy + (j / dh) * sh) | 0));
        var ddx = (dx + i) | 0, ddy = (dy + j) | 0;
        if (ddx < 0 || ddy < 0 || ddx >= canvas.width || ddy >= canvas.height) continue;
        var s = ((tyi * sW) + txi) * 4, d = ((ddy * W) + ddx) * 4;
        var a = (sdata[s + 3] / 255) * ga;
        dst[d] = dst[d] * (1 - a) + sdata[s] * a;
        dst[d + 1] = dst[d + 1] * (1 - a) + sdata[s + 1] * a;
        dst[d + 2] = dst[d + 2] * (1 - a) + sdata[s + 2] * a;
        dst[d + 3] = Math.min(255, dst[d + 3] + sdata[s + 3] * ga);
      }
    },
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {},
    measureText() { return { width: 0 }; }
  };
}
function stubCanvas(win) {
  var OrigCreate = win.document.createElement.bind(win.document);
  win.document.createElement = function (tag) {
    var el = OrigCreate(tag);
    if (String(tag).toLowerCase() === "canvas") {
      el._px = new Uint8ClampedArray(0);
      var _w = 300, _h = 150;
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
      el.getBoundingClientRect = function () { return { left: 0, top: 0, width: _w, height: _h, right: _w, bottom: _h }; };
    }
    return el;
  };
  win.ImageData = function (data, w, h) {
    // duck-type: data may be a Uint8ClampedArray from another realm
    if (data && typeof data !== "number" && typeof data.length === "number") {
      this.data = data; this.width = w; this.height = h || Math.round(data.length / 4 / w);
    } else { this.width = data; this.height = w; this.data = new Uint8ClampedArray(data * w * 4); }
  };
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="views"></div></body></html>', {
  url: "https://localhost/", pretendToBeVisual: true, runScripts: "outside-only"
});
const { window } = dom;
stubCanvas(window);

/* ---------- minimal TXT stub ---------- */
const cmds = {};
const busHandlers = {};
window.TXT = {
  $: (s, r) => (r || window.document).querySelector(s),
  $$: (s, r) => Array.prototype.slice.call((r || window.document).querySelectorAll(s)),
  uid: () => "u" + Math.random().toString(36).slice(2),
  esc: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  icon: (id) => '<svg><use href="#' + id + '"/></svg>',
  toast: (m) => { window.__toasts = window.__toasts || []; window.__toasts.push(m); },
  modal: (o) => { window.__modalOpts = o; return Promise.resolve({}); },
  register: (n, fn, m) => { cmds[n] = { fn, meta: m }; },
  cmd: (n, ...a) => cmds[n] && cmds[n].fn(...a),
  ecosystem: {
    _calls: [],
    toggleLauncher() { this._calls.push("toggleLauncher"); },
    setPersona(p) { this._calls.push("setPersona:" + p); }
  },
  store: {
    _evts: [], _data: {},
    emit(t, d) { this._evts.push({ t, d }); },
    get(a, k) { const n = this._data[a]; return n ? n[k] : undefined; },
    set(a, k, v) { (this._data[a] = this._data[a] || {})[k] = v; return v; }
  },
  bus: {
    on: (e, fn) => { (busHandlers[e] = busHandlers[e] || []).push(fn); },
    emit: (e, d) => { (busHandlers[e] || []).forEach((fn) => fn(d)); }
  }
};

/* ---------- load the REAL pixel core + tools (NXT phase 1) ---------- */
for (const f of ["js/pixel/core.js", "js/pixel/tools.js"]) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  window.eval(code);
}
const realPixel = window.TXT.pixel;
if (!realPixel || typeof realPixel.newDoc !== "function") {
  throw new Error("real T.pixel did not load");
}

/* ---------- mock T.pixel (contract) ---------- */
function mkLayer(name, w, h, fill) {
  const c = window.document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = fill; x.fillRect(0, 0, w, h);
  return { id: "l_" + name, name, canvas: c, visible: true, opacity: 1, blend: "source-over", locked: false };
}
const L0 = mkLayer("bg", 16, 16, "#808080");
window.TXT.pixel = {
  _layers: [L0], _active: L0.id, _composites: 0,
  layers() { return this._layers; },
  activeLayer() { return this._layers.find((l) => l.id === this._active) || null; },
  setActive(id) { this._active = id; },
  composite() { this._composites++; },
  getDataURL() { return "data:image/png;base64,AAA"; },
  newDoc() {}, loadDataURL() {}
};
/* ---------- load modules ---------- */
for (const f of ["js/pixel/layers.js", "js/pixel/adjust.js"]) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  window.eval(code);
}

function runTests() {
let failures = 0;
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("returned false"); console.log("  PASS " + name); }
  catch (e) { failures++; console.log("  FAIL " + name + " :: " + (e && e.message)); }
}
function fireInput(el, v) {
  el.value = String(v);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}
const q = (s, r) => (r || window.document).querySelector(s);
const qa = (s, r) => Array.prototype.slice.call((r || window.document).querySelectorAll(s));

console.log("-- layers panel --");
check("pPanels + layers panel built", () => !!q("#pPanels .px-panel") && qa(".px-layer").length === 1);
check("new layer", () => {
  q(".px-tbtn[title='New layer']").click();
  return window.TXT.pixel.layers().length === 2 && qa(".px-layer").length === 2;
});
check("duplicate layer", () => {
  qa(".px-tbtn").find((b) => b.title === "Duplicate layer").click();
  return window.TXT.pixel.layers().length === 3;
});
check("row click sets active", () => {
  const rows = qa(".px-layer");
  rows[0].click(); // top row
  const top = window.TXT.pixel.layers()[window.TXT.pixel.layers().length - 1];
  return window.TXT.pixel.activeLayer().id === top.id && rows[0].classList.contains("active");
});
check("opacity slider mutates layer", () => {
  const op = q(".px-layer.active .px-op");
  fireInput(op, 50);
  return Math.abs(window.TXT.pixel.activeLayer().opacity - 0.5) < 0.01;
});
check("blend select mutates layer", () => {
  const bs = q(".px-layer.active .px-blend");
  bs.value = "multiply"; bs.dispatchEvent(new window.Event("change", { bubbles: true }));
  return window.TXT.pixel.activeLayer().blend === "multiply";
});
check("eye toggles visibility", () => {
  const eye = qa(".px-layer.active .px-ibtn")[0];
  eye.click();
  return window.TXT.pixel.activeLayer().visible === false;
});
check("lock toggles", () => {
  const lock = qa(".px-layer.active .px-ibtn")[1];
  lock.click();
  const ok = window.TXT.pixel.activeLayer().locked === true;
  lock.click();
  return ok && window.TXT.pixel.activeLayer().locked === false;
});
check("move up/down reorders", () => {
  const P = window.TXT.pixel, before = P.layers().map((l) => l.id).join(",");
  qa(".px-tbtn").find((b) => b.title === "Move layer down").click();
  const after = P.layers().map((l) => l.id).join(",");
  return before !== after;
});
check("merge down reduces count", () => {
  const n = window.TXT.pixel.layers().length;
  qa(".px-tbtn").find((b) => b.title === "Merge down").click();
  return window.TXT.pixel.layers().length === n - 1;
});
check("flatten -> single layer", () => {
  Array.prototype.find.call(qa(".px-tbtn"), (b) => b.textContent === "Flatten").click();
  const ls = window.TXT.pixel.layers();
  return ls.length === 1 && ls[0].name === "Background";
});
check("delete blocked at one layer", () => {
  qa(".px-tbtn").find((b) => b.title === "Delete layer").click();
  return window.TXT.pixel.layers().length === 1 && (window.__toasts || []).length > 0;
});
check("CTA emits txt:insert-image", () => {
  q(".px-cta").click();
  const ev = window.TXT.store._evts.find((e) => e.t === "txt:insert-image");
  return !!ev && /^p\d+$/.test(ev.d.id) && ev.d.dataUrl.indexOf("data:image") === 0;
});

console.log("-- histogram + adjustments --");
check("histogram panel + canvas drawn", () => {
  const hc = q(".px-hist");
  return !!hc && hc.width === 232;
});
check("adjustment slider edits pixels + reset restores", () => {
  const L = window.TXT.pixel.activeLayer();
  L.locked = false; L.visible = true;
  const before = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data.slice();
  const rows = qa(".px-srow");
  const bright = rows.find((r) => r.textContent.indexOf("Brightness") === 0).querySelector("input");
  fireInput(bright, 50);
  const mid = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data;
  let changed = false;
  for (let i = 0; i < mid.length; i += 7) if (mid[i] !== before[i]) { changed = true; break; }
  if (!changed) throw new Error("pixels unchanged by brightness");
  // reset
  const btns = qa(".px-btn");
  btns.find((b) => b.textContent === "Reset").click();
  const after = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data;
  for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) throw new Error("reset did not restore px " + i);
  return true;
});
check("curves modal opens + apply", () => {
  qa(".px-btn").find((b) => b.textContent === "Curves").click();
  if (!q(".px-overlay .px-curve")) throw new Error("no curve canvas");
  const ok = q(".px-overlay .px-btn.primary");
  ok.click();
  return !q(".px-overlay");
});
check("levels modal opens + cancel restores", () => {
  const L = window.TXT.pixel.activeLayer();
  const before = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data.slice();
  qa(".px-btn").find((b) => b.textContent === "Levels").click();
  if (!q(".px-overlay")) throw new Error("no levels overlay");
  const lv = qa(".px-overlay .px-srow input")[0];
  fireInput(lv, 100); // black point up
  q(".px-overlay .px-btn:not(.primary)").click(); // cancel
  const after = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data;
  for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) throw new Error("cancel did not restore");
  return !q(".px-overlay");
});

console.log("-- filters --");
const filterNames = ["Blur", "Sharpen", "Grain", "Pixelate", "Vignette", "Duotone"];
filterNames.forEach((fn2) => {
  check("filter " + fn2 + " popover apply", () => {
    qa(".px-fgrid .px-btn").find((b) => b.textContent === fn2).click();
    if (!q(".px-pop")) throw new Error("no popover");
    const sl = q(".px-pop input[type=range]");
    if (sl) fireInput(sl, (parseFloat(sl.min) + parseFloat(sl.max)) / 2);
    const col = q(".px-pop input[type=color]");
    if (col) { col.value = "#ff0000"; col.dispatchEvent(new window.Event("input", { bubbles: true })); }
    q(".px-pop [data-x='ok']").click();
    return !q(".px-pop");
  });
});
check("filter cancel restores", () => {
  const L = window.TXT.pixel.activeLayer();
  const before = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data.slice();
  qa(".px-fgrid .px-btn").find((b) => b.textContent === "Blur").click();
  const sl = q(".px-pop input[type=range]");
  fireInput(sl, 20);
  q(".px-pop [data-x='no']").click();
  const after = L.canvas.getContext("2d").getImageData(0, 0, 16, 16).data;
  for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) throw new Error("cancel did not restore");
  return true;
});

console.log("-- per-app topbar / settings / files (NXT phase 1, real core) --");
const asyncPx = [];
function acheck(name, fn) { asyncPx.push({ name, fn }); }

check("topbar has studio badge, launcher, settings, files buttons", () => {
  const lb = q("#pxLauncher");
  if (!lb) throw new Error("no #pxLauncher");
  if (!lb.classList.contains("icon-btn") || !lb.classList.contains("waffle-btn")) throw new Error("launcher missing icon-btn waffle-btn classes");
  if (lb.querySelectorAll(".waffle-dots i").length !== 9) throw new Error("launcher does not have 9 dots");
  if (!q("#pxSettingsBtn")) throw new Error("no #pxSettingsBtn");
  if (!q("#pxFilesBtn")) throw new Error("no #pxFilesBtn");
  const nm = q("#view-pixel .px-sname");
  if (!nm || nm.textContent !== "Pixel") throw new Error("studio name missing");
  if (!q("#view-pixel .px-badge")) throw new Error("studio badge missing");
  return true;
});
check("launcher button calls T.ecosystem.toggleLauncher", () => {
  window.TXT.ecosystem._calls.length = 0;
  q("#pxLauncher").click();
  if (window.TXT.ecosystem._calls.indexOf("toggleLauncher") < 0) throw new Error("toggleLauncher not called");
  return true;
});
check("gear opens settings drawer with NXT about row", () => {
  const dr = q("#pxSettingsDrawer");
  if (!dr) throw new Error("no settings drawer");
  if (!dr.classList.contains("hidden")) throw new Error("drawer should start hidden");
  q("#pxSettingsBtn").click();
  if (dr.classList.contains("hidden")) throw new Error("drawer did not open");
  if (dr.textContent.indexOf("NXT OS") < 0) throw new Error("about row missing NXT OS");
  if (!dr.querySelector("#pxSetBrush")) throw new Error("no brush size input");
  if (!dr.querySelector("#pxSetChecker")) throw new Error("no checkerboard toggle");
  if (!dr.querySelector("#pxSetAuto")) throw new Error("no auto-select toggle");
  dr.querySelector('[data-x="close"]').click();
  if (!dr.classList.contains("hidden")) throw new Error("drawer did not close");
  return true;
});
check("settings persist; brush size changes the brush engine", () => {
  const d0 = realPixel.settings();
  if (d0.brushSize !== 28 || d0.checkerboard !== true || d0.autoSelectLayer !== false) {
    throw new Error("bad defaults " + JSON.stringify(d0));
  }
  realPixel.setSettings({ brushSize: 64 });
  const s = window.TXT.store.get("pixel", "settings");
  if (!s || s.brushSize !== 64) throw new Error("setting not persisted");
  if (realPixel.getBrush().size !== 64) throw new Error("brush engine not updated");
  // the tool options bar follows the new default
  const optVal = q("#pToolOpts .px-opt-v");
  if (optVal && optVal.textContent !== "64") throw new Error("options bar did not rebuild, shows " + optVal.textContent);
  realPixel.setSettings({ brushSize: 28 });
  if (realPixel.getBrush().size !== 28) throw new Error("reset failed");
  return true;
});
check("checkerboard toggle changes the canvas background", () => {
  realPixel.setSettings({ checkerboard: false });
  if (!q("#pCanvasWrap").classList.contains("px-checker-off")) throw new Error("class not applied");
  if (window.TXT.store.get("pixel", "settings").checkerboard !== false) throw new Error("not persisted");
  realPixel.setSettings({ checkerboard: true });
  if (q("#pCanvasWrap").classList.contains("px-checker-off")) throw new Error("class stuck on");
  return true;
});
check("auto-select picks the topmost opaque layer under the cursor", () => {
  realPixel.newDoc(16, 16);
  const layers = realPixel.layers();
  const bottom = layers[0];
  bottom.canvas.getContext("2d").fillStyle = "#ff0000";
  bottom.canvas.getContext("2d").fillRect(2, 2, 4, 4);
  const top = realPixel.addLayer("Top");
  realPixel.setSettings({ autoSelectLayer: true });
  const picked = realPixel.internal.pickLayerAt({ x: 3, y: 3 });
  if (!picked || picked.id !== bottom.id) throw new Error("did not pick the opaque bottom layer");
  if (realPixel.activeLayer().id !== bottom.id) throw new Error("active layer not updated");
  realPixel.setActive(top.id);
  const none = realPixel.internal.pickLayerAt({ x: 14, y: 14 });
  if (none !== null) throw new Error("should pick nothing over transparency");
  if (realPixel.activeLayer().id !== top.id) throw new Error("active layer changed on empty click");
  realPixel.setSettings({ autoSelectLayer: false });
  return true;
});
acheck("pixel files CRUD round trip; open restores via loadDataURL", async () => {
  const fakeURL = "data:image/png;base64,FAKEPIXELS";
  // stub toDataURL at the prototype so the real getDataURL path is exercised
  const proto = window.HTMLCanvasElement.prototype;
  const origToDataURL = proto.toDataURL;
  proto.toDataURL = function () { return fakeURL; };
  // stub Image so the real async decode path resolves in jsdom
  const OrigImage = window.Image;
  const createdImages = [];
  window.Image = function () {
    const self = this;
    createdImages.push(self);
    self.naturalWidth = 4; self.naturalHeight = 4;
    self.width = 4; self.height = 4;
    self.getContext = function () {
      return {
        getImageData: function (x, y, w, h) {
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        }
      };
    };
    setTimeout(() => { if (self.onload) self.onload(); }, 0);
  };
  try {
    const idA = realPixel.files.create("Shot A");
    let list = realPixel.files.list();
    if (list.length !== 1) throw new Error("create failed, len " + list.length);
    if (list[0].name !== "Shot A" || list[0].dataUrl !== fakeURL) throw new Error("record wrong");
    const stored = window.TXT.store.get("pixel", "files");
    if (!stored || stored.length !== 1 || stored[0].id !== idA) throw new Error("not persisted");
    const idB = realPixel.files.duplicate(idA);
    if (realPixel.files.list().length !== 2) throw new Error("duplicate failed");
    if (realPixel.files.list()[0].name !== "Shot A copy") throw new Error("duplicate name wrong");
    if (realPixel.files.rename(idB, "Shot B") !== true) throw new Error("rename failed");
    if (realPixel.files.list()[0].name !== "Shot B") throw new Error("rename not applied");
    if (realPixel.files.rename(idB, "") !== false) throw new Error("blank rename should fail");
    // open() must feed the stored dataUrl into the real decode path
    try {
      const ok = await realPixel.files.open(idA);
      if (ok !== true) throw new Error("open failed");
      if (!createdImages.length || createdImages[0].src !== fakeURL) {
        throw new Error("open did not decode the stored dataUrl");
      }
      if (!realPixel.layers().some((l) => l.name === "Image")) {
        throw new Error("decoded image layer not added to the doc");
      }
      if (realPixel.files.currentId() !== idA) throw new Error("currentId wrong");
    } finally { /* Image restored in outer finally */ }
    // delete confirms through T.modal (stub resolves truthy)
    const rm = await realPixel.files.remove(idB);
    if (rm !== true) throw new Error("remove failed");
    if (realPixel.files.list().length !== 1) throw new Error("remove did not delete");
    if (!window.__modalOpts || window.__modalOpts.title !== "Delete image") throw new Error("delete did not confirm via modal");
  } finally {
    proto.toDataURL = origToDataURL;
    window.Image = OrigImage;
  }
  return true;
});
acheck("files drawer opens, lists files, New button works", async () => {
  const dr = q("#pxFilesDrawer");
  if (!dr) throw new Error("no files drawer");
  q("#pxFilesBtn").click();
  if (dr.classList.contains("hidden")) throw new Error("drawer did not open");
  const rows = dr.querySelectorAll(".px-file-row");
  if (rows.length !== realPixel.files.list().length) {
    throw new Error("drawer rows " + rows.length + " != files " + realPixel.files.list().length);
  }
  if (!dr.querySelector("#pxFileNew")) throw new Error("no New button");
  const before = realPixel.files.list().length;
  dr.querySelector("#pxFileNew").click();
  await new Promise((res) => setTimeout(res, 30));
  if (realPixel.files.list().length !== before + 1) throw new Error("New button did not create");
  if (!window.__modalOpts || window.__modalOpts.title !== "New image") throw new Error("New did not prompt via modal");
  dr.querySelector('[data-x="close"]').click();
  if (!dr.classList.contains("hidden")) throw new Error("drawer did not close");
  return true;
});
check("no duplicate element IDs across the document", () => {
  const seen = {}, dupes = [];
  Array.prototype.forEach.call(window.document.querySelectorAll("[id]"), (n) => {
    if (seen[n.id]) dupes.push(n.id);
    seen[n.id] = 1;
  });
  if (dupes.length) throw new Error("duplicate ids: " + dupes.join(","));
  return true;
});

console.log("-- Pixel UI polish (Phase B) --");
check("panels show skeleton shimmer while initializing", () => {
  const n = qa(".px-panel.nxt-skeleton").length;
  if (n < 3) throw new Error("expected at least 3 skeleton panels, found " + n);
  return true;
});
check("mobile panels sheet: toggle button opens and closes the sheet", () => {
  const btn = q("#pPanelsBtn");
  if (!btn) throw new Error("no #pPanelsBtn");
  const panels = q("#pPanels");
  if (!panels) throw new Error("no #pPanels");
  if (!panels.classList.contains("nxt-sheet")) throw new Error("panels missing nxt-sheet class");
  if (!panels.querySelector(".nxt-sheet-handle")) throw new Error("no sheet handle");
  if (!q("#pSheetToolOpts")) throw new Error("no #pSheetToolOpts");
  if (btn.getAttribute("aria-expanded") !== "false") throw new Error("aria-expanded should start false");
  btn.click();
  if (!panels.classList.contains("open")) throw new Error("sheet did not open");
  if (btn.textContent !== "Close") throw new Error("button label did not switch to Close");
  if (btn.getAttribute("aria-expanded") !== "true") throw new Error("aria-expanded not true");
  btn.click();
  if (panels.classList.contains("open")) throw new Error("sheet did not close");
  if (btn.textContent !== "Panels") throw new Error("button label did not switch back");
  return true;
});
check("tool options move into the bottom sheet on mobile", () => {
  const origMM = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {} });
  try {
    window.TXT.cmd("pixel.tool.brush");
    const sheet = q("#pSheetToolOpts");
    if (!sheet.querySelector(".px-opt")) throw new Error("no tool options in sheet");
    if (!sheet.classList.contains("px-sheet-opts")) throw new Error("sheet opts missing px-sheet-opts class");
    if (!sheet.querySelector(".px-opt-v")) throw new Error("no readable value label in sheet");
    if (q("#pToolOpts").children.length !== 0) throw new Error("desktop options bar not cleared on mobile");
    return true;
  } finally { window.matchMedia = origMM; }
});
check("tool options stay in the top bar on desktop", () => {
  const origMM = window.matchMedia;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  try {
    window.TXT.cmd("pixel.tool.eraser");
    if (!q("#pToolOpts").children.length) throw new Error("no tool options in top bar");
    if (q("#pSheetToolOpts").children.length !== 0) throw new Error("sheet options not cleared on desktop");
    return true;
  } finally { window.matchMedia = origMM; }
});
check("pixel CSS carries the 44px, sheet, skeleton and iPad rules", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/pixel.css"), "utf8");
  const panelsCss = fs.readFileSync(path.join(ROOT, "css/pixel-panels.css"), "utf8");
  const need = [
    [/\.px-tool\s*\{[^}]*width:\s*44px/, "44px tool button width"],
    [/\.px-tool\s*\{[^}]*height:\s*44px/, "44px tool button height"],
    [/#pPanelsBtn\s*\{\s*display:\s*none/, "Panels button hidden on desktop"],
    [/\.nxt-skeleton\s*\{/, ".nxt-skeleton"],
    [/@keyframes\s+nxt-shimmer/, "nxt-shimmer keyframes"],
    [/\.nxt-sheet\s*\{[^}]*position:\s*fixed/, ".nxt-sheet fixed sheet"],
    [/\.nxt-sheet-handle\s*\{/, ".nxt-sheet-handle"],
    [/#pPanels\.open\s*\{[^}]*display:\s*flex/, "#pPanels.open shows the sheet"],
    [/\.px-layer\s*\{[^}]*min-height:\s*44px/, "44px layer rows on mobile"],
    [/width:\s*240px/, "240px iPad panels"],
    [/\.px-sheet-opts\s+\.px-opt\s*\{[^}]*min-height:\s*44px/, "44px sheet slider rows"]
  ];
  for (const pair of need) {
    if (!pair[0].test(css) && !pair[0].test(panelsCss)) throw new Error("missing CSS: " + pair[1]);
  }
  return true;
});

(async () => {
  for (const t of asyncPx) {
    try {
      const r = await t.fn();
      if (r === false) throw new Error("returned false");
      console.log("  PASS " + t.name);
    } catch (e) { failures++; console.log("  FAIL " + t.name + " :: " + (e && e.message)); }
  }
  console.log(failures ? "\n" + failures + " FAILURES" : "\nALL PIXEL PANEL TESTS PASSED");
  process.exit(failures ? 1 : 0);
})();
}

if (window.document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => setTimeout(runTests, 50));
} else {
  setTimeout(runTests, 50);
}
