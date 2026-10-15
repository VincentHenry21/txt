/* NXT PXL Develop Engine, CORE math.
   Pure functions only: no DOM, no canvas, no window-specific APIs.
   Exposed as window.TXT.PXL. The UI worker (develop-ui.js) and the
   test suite (test/pxl-engine.test.js) both consume this module.

   Pipeline order (single parametrized develop pass):
   exposure (2^EV) -> auto-tone black/white stretch -> white balance
   temp/tint -> contrast S-curve about 128 -> highlights/shadows/
   whites/blacks -> dehaze -> saturation -> vibrance (protects saturated
   pixels) -> HSL mixer -> B&W treatment -> tone curve (per-channel LUTs
   then RGB LUT) -> color grading (3 wheels + global, luminance, blend,
   balance) -> calibration (shadow tint + per-primary hue/sat).
   Image-level pass (developImageData) adds: clarity (local contrast),
   sharpening (3x3 unsharp kernel), luminance NR, color NR, lens CA
   reduction approx, lens vignette profile correction, vignette,
   procedural film grain, per-mask local adjustments, clipping views
   and before/after split rendering. No CSS filter shortcuts anywhere. */
(function () {
  "use strict";
  var root = (typeof window !== "undefined") ? window : ((typeof global !== "undefined") ? global : this);
  var T = root.TXT || (root.TXT = {});
  var PXL = {};

  /* ---------------- small helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smoothstep(e0, e1, x) {
    if (e1 <= e0) return x < e0 ? 0 : 1;
    var t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }
  function lumW(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; } /* 0..1 inputs */
  function deg2rad(d) { return d * Math.PI / 180; }

  /* ---------------- parameter model ---------------- */
  PXL.HUE_NAMES = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];

  function hslBlank() {
    var o = {}, i;
    for (i = 0; i < PXL.HUE_NAMES.length; i++) o[PXL.HUE_NAMES[i]] = { h: 0, s: 0, l: 0 };
    return o;
  }
  function wheelBlank() { return { h: 0, s: 0, lum: 0 }; }

  PXL.neutralParams = function () {
    return {
      exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
      clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
      temp: 0, tint: 0, bw: 0,
      tone: { black: 0, white: 1 }, /* auto-tone stretch points, 0..1 */
      curve: {
        rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        b: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
      },
      hsl: hslBlank(),
      grade: {
        shadows: wheelBlank(), midtones: wheelBlank(), highlights: wheelBlank(), global: wheelBlank(),
        blend: 100, balance: 0
      },
      detail: { sharpen: 0, radius: 1.0, lumNR: 0, colorNR: 0 },
      effects: {
        vignette: { amount: 0, midpoint: 50, roundness: 0, feather: 50 },
        grain: { amount: 0, size: 25, roughness: 50 }
      },
      calibration: {
        shadowTint: 0,
        red: { h: 0, s: 0 }, green: { h: 0, s: 0 }, blue: { h: 0, s: 0 }
      },
      lens: { ca: 0, vignetteCorr: 0 }
    };
  };

  /* Deep clone params. Mask weights (Float32Array) are runtime caches and
     are NOT cloned; geometry is kept so weights can be rebuilt.
     The tone-curve LUT cache is also dropped (it rebuilds on first use). */
  PXL.cloneParams = function (p) {
    return JSON.parse(JSON.stringify(p, function (k, v) {
      if (k === "_lutCache") return undefined;
      if (v && v.__isMaskWeight) return undefined;
      return v;
    }));
  };

  /* Scale a partial preset delta by intensity 0..200 (100 = full). */
  PXL.scalePreset = function (preset, intensity) {
    var base = PXL.neutralParams(), k = intensity / 100;
    function walk(dst, delta) {
      for (var key in delta) {
        if (!delta.hasOwnProperty(key)) continue;
        var dv = delta[key], bv = dst[key];
        if (dv && typeof dv === "object" && !Array.isArray(dv) && bv && typeof bv === "object") {
          walk(bv, dv);
        } else if (Array.isArray(dv)) {
          dst[key] = dv.map(function (pt) { return { x: pt.x, y: pt.y }; });
        } else if (typeof dv === "number" && typeof bv === "number") {
          dst[key] = bv + (dv - bv) * k;
        } else {
          dst[key] = dv;
        }
      }
    }
    walk(base, preset.params || {});
    return base;
  };

  /* ---------------- tone curve ---------------- */
  PXL.lutFromPoints = function (pts) {
    var s = (pts || []).slice().sort(function (a, b) { return a.x - b.x; });
    if (!s.length) s = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    var lut = new Array(256), i, k = 0;
    for (i = 0; i < 256; i++) {
      while (k < s.length - 2 && i > s[k + 1].x) k++;
      var p0 = s[k], p1 = s[k + 1] || p0;
      var x0 = clamp(p0.x, 0, 255), y0 = clamp(p0.y, 0, 255);
      var x1 = clamp(p1.x, 0, 255), y1 = clamp(p1.y, 0, 255);
      if (i <= x0) lut[i] = Math.round(y0);
      else if (i >= x1 || x1 === x0) lut[i] = Math.round(y1);
      else lut[i] = Math.round(y0 + (y1 - y0) * ((i - x0) / (x1 - x0)));
    }
    return lut;
  };
  PXL.CURVE_PRESETS = {
    linear: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    medium: [{ x: 0, y: 0 }, { x: 64, y: 56 }, { x: 128, y: 128 }, { x: 192, y: 200 }, { x: 255, y: 255 }],
    strong: [{ x: 0, y: 0 }, { x: 64, y: 44 }, { x: 128, y: 128 }, { x: 192, y: 212 }, { x: 255, y: 255 }],
    matte: [{ x: 0, y: 28 }, { x: 64, y: 72 }, { x: 128, y: 138 }, { x: 192, y: 200 }, { x: 255, y: 242 }]
  };

  /* ---------------- color conversion ---------------- */
  function rgb2hsl(r, g, b) { /* 0..1 in, h 0..360, s,l 0..1 out */
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (mx === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) { /* h 0..360 */
    h = ((h % 360) + 360) % 360 / 360;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2(p, q, h + 1 / 3); g = hue2(p, q, h); b = hue2(p, q, h - 1 / 3);
    }
    return [r, g, b];
  }
  function hue2(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  PXL.rgb2hsl = rgb2hsl;
  PXL.hsl2rgb = hsl2rgb;

  /* ---------------- per-pixel develop pass ----------------
     Pure: (r,g,b in 0..255, params) -> [r,g,b] 0..255 integers. */
  function buildCurveLuts(P) {
    if (!P._lutCache || P._lutCache.curve !== P.curve) {
      P._lutCache = {
        curve: P.curve,
        rgb: PXL.lutFromPoints(P.curve.rgb),
        r: PXL.lutFromPoints(P.curve.r),
        g: PXL.lutFromPoints(P.curve.g),
        b: PXL.lutFromPoints(P.curve.b)
      };
    }
    return P._lutCache;
  }

  PXL.developPixel = function (r, g, b, P) {
    var R = r / 255, G = g / 255, B = b / 255;
    var L, w, i;

    /* 1. exposure: 2^EV */
    var e = Math.pow(2, P.exposure || 0);
    R *= e; G *= e; B *= e;

    /* 2. auto-tone black/white point stretch */
    var tb = (P.tone && P.tone.black) || 0, tw = (P.tone && P.tone.white) || 1;
    if (tw - tb > 1e-6) {
      R = clamp01((R - tb) / (tw - tb));
      G = clamp01((G - tb) / (tw - tb));
      B = clamp01((B - tb) / (tw - tb));
    }

    /* 3. white balance temp/tint */
    var tp = (P.temp || 0) / 100, tn = (P.tint || 0) / 100;
    R += tp * 0.12; B -= tp * 0.12;
    G += tn * 0.06; R -= tn * 0.03; B -= tn * 0.03;

    /* 4. contrast: S-curve about 128 (0.5), windowed so extremes hold */
    var cf = (P.contrast || 0) / 100;
    if (cf !== 0) {
      var ch = [R, G, B];
      for (i = 0; i < 3; i++) {
        var v = ch[i], win = 4 * v * (1 - v);
        ch[i] = v + cf * (v - 0.5) * win;
      }
      R = ch[0]; G = ch[1]; B = ch[2];
    }

    /* 5. highlights / shadows / whites / blacks (luminance-weighted) */
    L = lumW(R, G, B);
    var wH = smoothstep(0.65, 1.0, L);
    var wS = 1 - smoothstep(0.0, 0.35, L);
    var wW = smoothstep(0.75, 1.0, L);
    var wB = 1 - smoothstep(0.0, 0.25, L);
    var mult = 1 + (P.highlights || 0) / 100 * wH + (P.shadows || 0) / 100 * wS +
      (P.whites || 0) / 100 * wW + (P.blacks || 0) / 100 * wB;
    R *= mult; G *= mult; B *= mult;

    /* 6. dehaze: midtone contrast plus a saturation lift */
    var dh = (P.dehaze || 0) / 100;
    if (dh !== 0) {
      L = lumW(R, G, B);
      var mid = 4 * L * (1 - L);
      R += dh * 0.14 * (R - 0.5) * 2 * mid;
      G += dh * 0.14 * (G - 0.5) * 2 * mid;
      B += dh * 0.14 * (B - 0.5) * 2 * mid;
    }

    /* 7. saturation, then vibrance (protects already-saturated pixels) */
    L = lumW(R, G, B);
    var satF = 1 + (P.saturation || 0) / 100 * (1 + dh * 0.25);
    R = L + (R - L) * satF; G = L + (G - L) * satF; B = L + (B - L) * satF;
    var vb = (P.vibrance || 0) / 100;
    if (vb !== 0) {
      var mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      var satNow = clamp01(mx - mn);
      var vs = 1 + vb * (1 - satNow);
      R = L + (R - L) * vs; G = L + (G - L) * vs; B = L + (B - L) * vs;
    }

    /* 8. HSL mixer: 8 hue sectors, triangular falloff */
    var hsl = P.hsl;
    if (hsl) {
      var c = rgb2hsl(clamp01(R), clamp01(G), clamp01(B));
      var h = c[0], s = c[1], l = c[2];
      var changed = false, dhh = 0, dss = 0, dll = 0;
      for (i = 0; i < 8; i++) {
        var adj = hsl[PXL.HUE_NAMES[i]];
        if (!adj || (adj.h === 0 && adj.s === 0 && adj.l === 0)) continue;
        var center = i * 45;
        var dd = Math.abs(((h - center + 540) % 360) - 180);
        dd = 180 - dd; /* angular distance 0..180 */
        w = clamp01(1 - dd / 45);
        if (w <= 0) continue;
        dhh += adj.h * w; dss += adj.s / 100 * w; dll += adj.l / 100 * w;
        changed = true;
      }
      if (changed) {
        var nc = hsl2rgb(h + dhh, clamp01(s + dss), clamp01(l + dll));
        R = nc[0]; G = nc[1]; B = nc[2];
      }
    }

    /* 9. B&W treatment: mix toward luminance gray */
    var bw = clamp((P.bw || 0) / 100, 0, 1);
    if (bw > 0) {
      L = lumW(R, G, B);
      R = R + (L - R) * bw; G = G + (L - G) * bw; B = B + (L - B) * bw;
    }

    /* 10. tone curve: per-channel LUTs, then the RGB master LUT */
    var luts = buildCurveLuts(P);
    var ri = clamp(Math.round(R * 255), 0, 255);
    var gi = clamp(Math.round(G * 255), 0, 255);
    var bi = clamp(Math.round(B * 255), 0, 255);
    R = luts.rgb[luts.r[ri]] / 255;
    G = luts.rgb[luts.g[gi]] / 255;
    B = luts.rgb[luts.b[bi]] / 255;

    /* 11. color grading: 3 wheels + global, luminance, blending, balance */
    var gr = P.grade;
    if (gr) {
      L = lumW(R, G, B);
      var bal = (gr.balance || 0) / 100;
      var gwS = 1 - smoothstep(0.05 + bal * 0.15, 0.5 + bal * 0.15, L);
      var gwH = smoothstep(0.5 + bal * 0.15, 0.95 + bal * 0.15, L);
      var gwM = clamp01(1 - gwS - gwH);
      var blend = (gr.blend == null ? 100 : gr.blend) / 100;
      var zones = [
        [gr.shadows, gwS], [gr.midtones, gwM], [gr.highlights, gwH], [gr.global, 1]
      ];
      for (i = 0; i < 4; i++) {
        var wz = zones[i][0], zw = zones[i][1] * blend;
        if (!wz || zw <= 0 || (wz.s === 0 && wz.lum === 0)) continue;
        var hr = deg2rad(wz.h || 0), sm = (wz.s || 0) / 100;
        var orr = sm * Math.cos(hr), ogg = sm * Math.cos(hr - 2.0944), obb = sm * Math.cos(hr + 2.0944);
        R += orr * zw * 0.25; G += ogg * zw * 0.25; B += obb * zw * 0.25;
        var lm = 1 + (wz.lum || 0) / 100 * zw;
        R *= lm; G *= lm; B *= lm;
      }
    }

    /* 12. calibration: shadow tint + per-primary hue/sat */
    var cal = P.calibration;
    if (cal) {
      if (cal.shadowTint) {
        L = lumW(R, G, B);
        var stw = 1 - smoothstep(0.0, 0.45, L);
        G += (cal.shadowTint / 100) * stw * 0.08;
      }
      var sum = R + G + B;
      if (sum > 1e-6) {
        var pr = R / sum, pg = G / sum, pb = B / sum;
        var hh = (cal.red.h || 0) * pr + (cal.green.h || 0) * pg + (cal.blue.h || 0) * pb;
        var ss = 1 + ((cal.red.s || 0) * pr + (cal.green.s || 0) * pg + (cal.blue.s || 0) * pb) / 100;
        if (hh !== 0 || ss !== 1) {
          var cc = rgb2hsl(clamp01(R), clamp01(G), clamp01(B));
          var nc2 = hsl2rgb(cc[0] + hh, clamp01(cc[1] * ss), cc[2]);
          R = nc2[0]; G = nc2[1]; B = nc2[2];
        }
      }
    }

    return [
      Math.round(clamp(R * 255, 0, 255)),
      Math.round(clamp(G * 255, 0, 255)),
      Math.round(clamp(B * 255, 0, 255))
    ];
  };

  /* ---------------- neighborhood helpers (pure) ---------------- */
  function boxBlurGray(src /*Float32Array w*h*/, w, h, radius) {
    var r = Math.max(1, Math.round(radius));
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    var x, y, i, j;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var acc = 0, n = 0;
        for (j = -r; j <= r; j++) {
          var xx = x + j; if (xx < 0) xx = 0; if (xx >= w) xx = w - 1;
          acc += src[y * w + xx]; n++;
        }
        tmp[y * w + x] = acc / n;
      }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var acc2 = 0, n2 = 0;
        for (i = -r; i <= r; i++) {
          var yy = y + i; if (yy < 0) yy = 0; if (yy >= h) yy = h - 1;
          acc2 += tmp[yy * w + x]; n2++;
        }
        out[y * w + x] = acc2 / n2;
      }
    }
    return out;
  }

  /* Integer hash noise in [-1,1], deterministic per (x,y,seed). */
  function hash2(x, y, seed) {
    var n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = (n ^ (n >> 13)) | 0;
    n = (n * 1274126177) | 0;
    n = (n ^ (n >> 16)) >>> 0;
    return n / 2147483648 - 1;
  }

  /* ---------------- full image develop ----------------
     src: Uint8ClampedArray (RGBA), w, h. Returns new Uint8ClampedArray.
     opts: { masks: [...], clip: null|"shadows"|"highlights",
             split: null | { frac: 0..1 }, before: Uint8ClampedArray|null } */
  PXL.developImageData = function (src, w, h, P, opts) {
    opts = opts || {};
    var n = w * h, out = new Uint8ClampedArray(src.length);
    var D = P.detail || {}, E = P.effects || {}, Ln = P.lens || {};
    var sharp = D.sharpen || 0, rad = D.radius || 1.0;
    var lumNR = (D.lumNR || 0) / 100, colorNR = (D.colorNR || 0) / 100;
    var clarity = (P.clarity || 0) / 100;
    var vig = E.vignette || {}, gr2 = E.grain || {};

    var needBlur8 = clarity !== 0;
    var needBlur3 = sharp !== 0 || lumNR > 0 || colorNR > 0;
    var blurL8 = null, blurL3 = null, blurR3 = null, blurG3 = null, blurB3 = null;
    var lum = null, i, x, y;
    if (needBlur8 || needBlur3) {
      lum = new Float32Array(n);
      for (i = 0; i < n; i++) lum[i] = lumW(src[i * 4] / 255, src[i * 4 + 1] / 255, src[i * 4 + 2] / 255);
      if (needBlur8) blurL8 = boxBlurGray(lum, w, h, clamp(Math.round(Math.min(w, h) / 40), 2, 12));
      if (needBlur3) {
        var rr = clamp(Math.round(rad * 1.5), 1, 5);
        blurL3 = boxBlurGray(lum, w, h, rr);
        if (sharp !== 0 || colorNR > 0) {
          var fr = new Float32Array(n), fg = new Float32Array(n), fb = new Float32Array(n);
          for (i = 0; i < n; i++) { fr[i] = src[i * 4] / 255; fg[i] = src[i * 4 + 1] / 255; fb[i] = src[i * 4 + 2] / 255; }
          blurR3 = boxBlurGray(fr, w, h, rr);
          blurG3 = boxBlurGray(fg, w, h, rr);
          blurB3 = boxBlurGray(fb, w, h, rr);
        }
      }
    }

    /* mask weights, rasterized once */
    var maskWs = [];
    var masks = opts.masks || [];
    for (var m = 0; m < masks.length; m++) {
      if (masks[m] && masks[m].enabled !== false) maskWs.push({ mask: masks[m], w: PXL.buildMaskWeights(masks[m], w, h, src) });
      else maskWs.push(null);
    }

    var cellPx = 1 + Math.round((gr2.size || 0) / 100 * 7);
    var grainAmt = (gr2.amount || 0) / 100, grainRough = (gr2.roughness == null ? 50 : gr2.roughness) / 100;
    var caAmt = (Ln.ca || 0) / 100, vigCorr = (Ln.vignetteCorr || 0) / 100;
    var vgAmt = (vig.amount || 0) / 100, vgMid = (vig.midpoint == null ? 50 : vig.midpoint) / 100;
    var vgRound = (vig.roundness || 0) / 100, vgFeather = (vig.feather == null ? 50 : vig.feather) / 100;
    var splitFrac = opts.split ? clamp(opts.split.frac == null ? 0.5 : opts.split.frac, 0, 1) : -1;
    var before = opts.before || null;

    /* Pre-warm the tone-curve LUT cache so masked-pixel merges share it. */
    PXL.developPixel(0, 0, 0, P);

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var idx = y * w + x, o = idx * 4;
        var useBefore = before && splitFrac >= 0 && (x / w) < splitFrac;
        var sr = src[o], sg = src[o + 1], sb = src[o + 2];
        if (useBefore) { out[o] = before[o]; out[o + 1] = before[o + 1]; out[o + 2] = before[o + 2]; out[o + 3] = src[o + 3]; continue; }

        var pxv = PXL.developPixel(sr, sg, sb, P);
        var R = pxv[0] / 255, G = pxv[1] / 255, B = pxv[2] / 255;
        var L = lumW(R, G, B);

        /* clarity: local contrast against a wide blur */
        if (clarity !== 0 && blurL8) {
          var mid = 4 * L * (1 - L);
          var lc = (L - blurL8[idx]) * clarity * 1.2 * mid;
          R += lc; G += lc; B += lc;
          L = lumW(R, G, B);
        }
        /* sharpening: 3x3-ish unsharp kernel */
        if (sharp !== 0 && blurR3) {
          var sa = sharp / 150;
          R += (R - blurR3[idx]) * sa; G += (G - blurG3[idx]) * sa; B += (B - blurB3[idx]) * sa;
          L = lumW(R, G, B);
        }
        /* noise reduction */
        if ((lumNR > 0 || colorNR > 0) && blurL3) {
          var Ln2 = L + (blurL3[idx] - L) * lumNR;
          var csc = 1 - colorNR;
          R = Ln2 + (R - L) * csc; G = Ln2 + (G - L) * csc; B = Ln2 + (B - L) * csc;
          L = Ln2;
        }
        /* lens: chromatic aberration reduction (approx) + vignette profile correction */
        var dxn = (x / w - 0.5) * 2, dyn = (y / h - 0.5) * 2;
        var dist = Math.sqrt(dxn * dxn + dyn * dyn) / Math.SQRT2;
        if (caAmt > 0) {
          var ck = caAmt * 0.35 * dist * dist;
          R = R + (G - R) * ck; B = B + (G - B) * ck;
        }
        if (vigCorr > 0) {
          var vc = 1 + vigCorr * 0.35 * dist * dist;
          R *= vc; G *= vc; B *= vc;
        }
        /* vignette: amount/midpoint/roundness/feather */
        if (vgAmt !== 0) {
          var shape = Math.pow(dist, 1 + vgRound);
          var inner = vgMid * 0.9;
          var span = Math.max(0.05, vgFeather * (1.4 - inner));
          var fall = smoothstep(inner, inner + span, shape);
          var vf = 1 + vgAmt * fall * 0.9;
          R *= vf; G *= vf; B *= vf;
        }
        /* film grain: procedural, size + roughness */
        if (grainAmt > 0) {
          var nPix = hash2(x, y, 7);
          var nCell = hash2(Math.floor(x / cellPx), Math.floor(y / cellPx), 99);
          var nz = nPix + (nCell - nPix) * grainRough;
          var ga = nz * grainAmt * 0.14;
          R += ga; G += ga; B += ga;
        }

        /* masks: local adjustments blended by per-pixel weight */
        for (var mi = 0; mi < maskWs.length; mi++) {
          var mw = maskWs[mi];
          if (!mw) continue;
          var wgt = mw.w[idx];
          if (wgt <= 0) continue;
          var mp = PXL.mergedMaskParams(P, mw.mask);
          var mpv = PXL.developPixel(sr, sg, sb, mp);
          R = R + (mpv[0] / 255 - R) * wgt;
          G = G + (mpv[1] / 255 - G) * wgt;
          B = B + (mpv[2] / 255 - B) * wgt;
        }

        var R8 = Math.round(clamp(R * 255, 0, 255));
        var G8 = Math.round(clamp(G * 255, 0, 255));
        var B8 = Math.round(clamp(B * 255, 0, 255));
        if (opts.clip === "shadows" && R8 === 0 && G8 === 0 && B8 === 0) { R8 = 0; G8 = 90; B8 = 255; }
        else if (opts.clip === "highlights" && R8 === 255 && G8 === 255 && B8 === 255) { R8 = 255; G8 = 40; B8 = 40; }
        out[o] = R8; out[o + 1] = G8; out[o + 2] = B8; out[o + 3] = src[o + 3];
      }
    }
    return out;
  };

  /* Merge a mask's local adjustments over the global params. */
  PXL.mergedMaskParams = function (P, mask) {
    var a = (mask && mask.adj) || {};
    var mp = PXL.neutralParams();
    var keys = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks",
      "clarity", "dehaze", "vibrance", "saturation", "temp", "tint", "bw"];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      mp[k] = (P[k] || 0) + (a[k] || 0);
    }
    mp.tone = P.tone; mp.curve = P.curve; mp.hsl = P.hsl;
    mp.grade = P.grade; mp.detail = P.detail; mp.effects = P.effects;
    mp.calibration = P.calibration; mp.lens = P.lens;
    mp._lutCache = P._lutCache; /* share the tone-curve LUT cache */
    return mp;
  };

  /* ---------------- masks ----------------
     mask = { id, type: "linear"|"radial"|"brush"|"heuristic",
              label, enabled, invert, feather (0..100),
              geom: {...}, strokes: [...], adj: {...} }
     geom linear: {x0,y0,x1,y1} in 0..1 doc space
     geom radial: {cx,cy,rx,ry} in 0..1
     strokes: [{x,y,r,feather,flow}] in doc pixels */
  PXL.buildMaskWeights = function (mask, w, h, src) {
    var out = new Float32Array(w * h);
    if (!mask || mask.enabled === false) return out;
    var feather = (mask.feather == null ? 50 : mask.feather) / 100;
    var x, y, idx;
    if (mask.type === "linear") {
      var g = mask.geom || { x0: 0.2, y0: 0.5, x1: 0.8, y1: 0.5 };
      var vx = g.x1 - g.x0, vy = g.y1 - g.y0;
      var len2 = vx * vx + vy * vy || 1e-9;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var t = ((x / w - g.x0) * vx + (y / h - g.y0) * vy) / len2;
        out[y * w + x] = smoothstep(0.5 - feather / 2, 0.5 + feather / 2, clamp01(t));
      }
    } else if (mask.type === "radial") {
      var rg = mask.geom || { cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3 };
      var rx = Math.max(0.01, rg.rx), ry = Math.max(0.01, rg.ry);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var ex = (x / w - rg.cx) / rx, ey = (y / h - rg.cy) / ry;
        var d = Math.sqrt(ex * ex + ey * ey);
        out[y * w + x] = 1 - smoothstep(1 - feather, 1, d);
      }
      if (mask.invert) for (idx = 0; idx < out.length; idx++) out[idx] = 1 - out[idx];
    } else if (mask.type === "brush") {
      var strokes = mask.strokes || [];
      for (var s = 0; s < strokes.length; s++) {
        var st = strokes[s], r = Math.max(1, st.r || 20);
        var x0 = Math.max(0, Math.floor(st.x - r)), x1 = Math.min(w - 1, Math.ceil(st.x + r));
        var y0 = Math.max(0, Math.floor(st.y - r)), y1 = Math.min(h - 1, Math.ceil(st.y + r));
        var flow = (st.flow == null ? 80 : st.flow) / 100;
        var fe = (st.feather == null ? 50 : st.feather) / 100;
        for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
          var dd = Math.sqrt((x - st.x) * (x - st.x) + (y - st.y) * (y - st.y)) / r;
          if (dd > 1) continue;
          var a2 = flow * (1 - smoothstep(1 - fe, 1, dd));
          var oi = y * w + x;
          out[oi] = Math.min(1, out[oi] + a2 * (1 - out[oi]));
        }
      }
    } else if (mask.type === "heuristic") {
      /* Beta heuristic selects, labeled honestly in the UI. */
      var kind = (mask.geom && mask.geom.kind) || "subject";
      var tmp = new Float32Array(w * h);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        var R = src[o], G = src[o + 1], B = src[o + 2];
        var score = 0;
        if (kind === "sky") {
          var yn = y / h;
          if (yn < 0.5 && B > R + 8 && B > G && (R + G + B) / 3 > 60) score = 1;
          else if (yn < 0.35 && B > R && B > G) score = 0.6;
        } else { /* subject: skin-tone region heuristic */
          var mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          if (R > 95 && G > 40 && B > 20 && (mx - mn) > 15 && Math.abs(R - G) > 15 && R > G && R > B) score = 1;
        }
        tmp[y * w + x] = score;
      }
      out = boxBlurGray(tmp, w, h, 2); /* soften the heuristic edges */
      if (mask.invert) for (idx = 0; idx < out.length; idx++) out[idx] = 1 - out[idx];
    }
    return out;
  };

  /* ---------------- histogram + clipping ---------------- */
  PXL.histogram = function (data) {
    var r = new Array(256).fill(0), g = new Array(256).fill(0),
      b = new Array(256).fill(0), l = new Array(256).fill(0);
    for (var i = 0; i < data.length; i += 4) {
      var R = data[i], G = data[i + 1], B = data[i + 2];
      r[R]++; g[G]++; b[B]++;
      l[clamp(Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B), 0, 255)]++;
    }
    return { r: r, g: g, b: b, lum: l };
  };
  PXL.clippingStats = function (data) {
    var black = 0, white = 0;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) black++;
      else if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) white++;
    }
    return { black: black, white: white };
  };

  /* Auto tone: stretch points from the 0.5 and 99.5 luminance percentiles. */
  PXL.autoTonePoints = function (data) {
    var hist = PXL.histogram(data).lum;
    var total = 0, i;
    for (i = 0; i < 256; i++) total += hist[i];
    if (!total) return { black: 0, white: 1 };
    var lo = total * 0.005, hi = total * 0.995, acc = 0, black = 0, white = 255;
    for (i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= lo && black === 0 && i > 0) black = i;
      if (acc >= hi) { white = i; break; }
    }
    if (white - black < 8) { black = 0; white = 255; }
    return { black: black / 255, white: white / 255 };
  };

  /* ---------------- presets: 8 folders x 4 ---------------- */
  PXL.PRESET_FOLDERS = ["H3NZ Signature", "Portrait", "Landscape", "Cinematic",
    "Black and White", "Vintage", "Vibrant", "Moody"];
  PXL.BUILTIN_PRESETS = [
    { name: "H3NZ Noir", folder: "H3NZ Signature", params: { contrast: 35, blacks: -30, clarity: 25, vibrance: -40, saturation: -70, vignette: { amount: -45, midpoint: 45, roundness: 0, feather: 60 } } },
    { name: "H3NZ Chrome", folder: "H3NZ Signature", params: { exposure: 0.3, contrast: 25, highlights: -20, clarity: 40, dehaze: 20, vibrance: 15, detail: { sharpen: 60, radius: 1.0, lumNR: 0, colorNR: 0 } } },
    { name: "H3NZ Ember", folder: "H3NZ Signature", params: { temp: 25, tint: 5, contrast: 15, highlights: -30, shadows: 15, vibrance: 35, grade: { shadows: { h: 20, s: 25, lum: 0 }, midtones: { h: 0, s: 0, lum: 0 }, highlights: { h: 40, s: 30, lum: 5 }, global: { h: 0, s: 0, lum: 0 }, blend: 100, balance: 0 } } },
    { name: "H3NZ Mist", folder: "H3NZ Signature", params: { exposure: 0.4, contrast: -20, blacks: 25, clarity: -30, dehaze: -25, saturation: -15, curve: { rgb: [{ x: 0, y: 18 }, { x: 255, y: 245 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } } },
    { name: "Soft Skin Glow", folder: "Portrait", params: { exposure: 0.25, temp: 8, contrast: -10, highlights: -15, clarity: -20, vibrance: 10, detail: { sharpen: 20, radius: 1.0, lumNR: 25, colorNR: 30 } } },
    { name: "Studio Clean", folder: "Portrait", params: { exposure: 0.35, contrast: 10, whites: 15, blacks: -10, clarity: 15, vibrance: 5, saturation: 5 } },
    { name: "Golden Hour Face", folder: "Portrait", params: { temp: 30, exposure: 0.2, highlights: -25, shadows: 20, vibrance: 25, grade: { shadows: { h: 0, s: 0, lum: 0 }, midtones: { h: 35, s: 12, lum: 0 }, highlights: { h: 45, s: 28, lum: 8 }, global: { h: 0, s: 0, lum: 0 }, blend: 90, balance: 0 } } },
    { name: "Editorial Matte", folder: "Portrait", params: { contrast: -5, blacks: 30, whites: -15, clarity: 10, saturation: -25, vibrance: 10, curve: { rgb: [{ x: 0, y: 22 }, { x: 255, y: 248 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } } },
    { name: "Alpine Crisp", folder: "Landscape", params: { exposure: 0.15, contrast: 20, highlights: -35, whites: -10, clarity: 45, dehaze: 30, vibrance: 20, temp: -8, detail: { sharpen: 70, radius: 1.2, lumNR: 10, colorNR: 10 } } },
    { name: "Emerald Valley", folder: "Landscape", params: { vibrance: 40, saturation: 10, temp: -5, dehaze: 15, clarity: 20, hsl: { red: { h: 0, s: 0, l: 0 }, orange: { h: 0, s: 0, l: 0 }, yellow: { h: -10, s: 15, l: 0 }, green: { h: 8, s: 30, l: -5 }, aqua: { h: 0, s: 0, l: 0 }, blue: { h: 0, s: 0, l: 0 }, purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 } } } },
    { name: "Desert Heat", folder: "Landscape", params: { temp: 35, exposure: 0.3, contrast: 15, highlights: -20, vibrance: 20, grade: { shadows: { h: 25, s: 20, lum: 0 }, midtones: { h: 0, s: 0, lum: 0 }, highlights: { h: 45, s: 35, lum: 10 }, global: { h: 0, s: 0, lum: 0 }, blend: 100, balance: 0 } } },
    { name: "Nordic Blue", folder: "Landscape", params: { temp: -30, tint: -5, contrast: 10, shadows: 15, clarity: 25, dehaze: 20, vibrance: 10, saturation: -10 } },
    { name: "Teal Ember", folder: "Cinematic", params: { temp: -12, contrast: 20, highlights: -20, shadows: 10, vibrance: 15, hsl: { red: { h: 0, s: 0, l: 0 }, orange: { h: -8, s: 20, l: 0 }, yellow: { h: 0, s: 0, l: 0 }, green: { h: 0, s: 0, l: 0 }, aqua: { h: 12, s: 25, l: -5 }, blue: { h: 0, s: 0, l: 0 }, purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 } }, grade: { shadows: { h: 195, s: 30, lum: 0 }, midtones: { h: 0, s: 0, lum: 0 }, highlights: { h: 38, s: 25, lum: 5 }, global: { h: 0, s: 0, lum: 0 }, blend: 100, balance: 0 }, effects: { vignette: { amount: -30, midpoint: 50, roundness: 0, feather: 55 }, grain: { amount: 18, size: 30, roughness: 60 } } } },
    { name: "Noir Cinema", folder: "Cinematic", params: { contrast: 40, blacks: -35, highlights: -25, clarity: 30, saturation: -60, vibrance: -20, effects: { vignette: { amount: -50, midpoint: 40, roundness: 0, feather: 65 }, grain: { amount: 25, size: 35, roughness: 55 } } } },
    { name: "Blockbuster Warm", folder: "Cinematic", params: { temp: 18, exposure: 0.15, contrast: 18, highlights: -15, vibrance: 30, saturation: 10, grade: { shadows: { h: 210, s: 18, lum: 0 }, midtones: { h: 0, s: 0, lum: 0 }, highlights: { h: 42, s: 22, lum: 6 }, global: { h: 0, s: 0, lum: 0 }, blend: 85, balance: 0 } } },
    { name: "Indie Fade", folder: "Cinematic", params: { contrast: -15, blacks: 35, whites: -20, saturation: -30, clarity: -10, temp: 8, curve: { rgb: [{ x: 0, y: 25 }, { x: 255, y: 240 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } } },
    { name: "Silver Gelatin", folder: "Black and White", params: { bw: 100, contrast: 25, blacks: -15, whites: 10, clarity: 20, grain: { amount: 0, size: 25, roughness: 50 } } },
    { name: "High Contrast Mono", folder: "Black and White", params: { bw: 100, contrast: 55, blacks: -40, whites: 20, clarity: 35 } },
    { name: "Soft Film Mono", folder: "Black and White", params: { bw: 100, contrast: -10, blacks: 20, clarity: -15, effects: { vignette: { amount: 0, midpoint: 50, roundness: 0, feather: 50 }, grain: { amount: 30, size: 40, roughness: 70 } } } },
    { name: "Infrared Dream", folder: "Black and White", params: { bw: 100, contrast: 15, highlights: 30, temp: -20, hsl: { red: { h: 0, s: 0, l: 0 }, orange: { h: 0, s: 0, l: 0 }, yellow: { h: 0, s: 0, l: 0 }, green: { h: 0, s: 0, l: 40 }, aqua: { h: 0, s: 0, l: 0 }, blue: { h: 0, s: 0, l: -20 }, purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 } } } },
    { name: "1974 Fade", folder: "Vintage", params: { contrast: -20, blacks: 30, saturation: -35, temp: 15, tint: 8, curve: { rgb: [{ x: 0, y: 30 }, { x: 255, y: 235 }], r: [{ x: 0, y: 8 }, { x: 255, y: 250 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 245 }] } } },
    { name: "Polaroid Warm", folder: "Vintage", params: { temp: 28, exposure: 0.3, contrast: -12, highlights: -10, saturation: -15, vibrance: 15, effects: { vignette: { amount: -35, midpoint: 55, roundness: 0, feather: 70 }, grain: { amount: 0, size: 25, roughness: 50 } } } },
    { name: "Kodachrome Pop", folder: "Vintage", params: { contrast: 22, saturation: 35, vibrance: 20, temp: 10, calibration: { shadowTint: 0, red: { h: 6, s: 15 }, green: { h: -4, s: 8 }, blue: { h: 0, s: 0 } } } },
    { name: "Sepia Archive", folder: "Vintage", params: { bw: 65, temp: 40, tint: 10, contrast: 10, blacks: 10, effects: { vignette: { amount: 0, midpoint: 50, roundness: 0, feather: 50 }, grain: { amount: 22, size: 45, roughness: 65 } } } },
    { name: "Tropical Punch", folder: "Vibrant", params: { vibrance: 55, saturation: 20, temp: 5, clarity: 15, dehaze: 10, hsl: { red: { h: 0, s: 15, l: 0 }, orange: { h: 0, s: 10, l: 0 }, yellow: { h: 0, s: 15, l: 0 }, green: { h: 0, s: 20, l: 0 }, aqua: { h: 0, s: 20, l: 0 }, blue: { h: 0, s: 25, l: 0 }, purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 10, l: 0 } } } },
    { name: "Neon Street", folder: "Vibrant", params: { contrast: 30, vibrance: 45, saturation: 25, clarity: 25, blacks: -15, temp: -5 } },
    { name: "Candy Pop", folder: "Vibrant", params: { exposure: 0.25, vibrance: 50, saturation: 30, contrast: 10, highlights: -10 } },
    { name: "Electric Bloom", folder: "Vibrant", params: { vibrance: 60, saturation: 15, clarity: 20, dehaze: 15, temp: -8, tint: 6 } },
    { name: "Midnight Blue", folder: "Moody", params: { exposure: -0.4, temp: -25, contrast: 20, shadows: -20, highlights: -15, vibrance: -10, saturation: -15, grade: { shadows: { h: 220, s: 28, lum: -5 }, midtones: { h: 0, s: 0, lum: 0 }, highlights: { h: 210, s: 12, lum: 0 }, global: { h: 0, s: 0, lum: 0 }, blend: 100, balance: -20 } } },
    { name: "Foggy Morning", folder: "Moody", params: { exposure: 0.3, contrast: -25, blacks: 30, clarity: -35, dehaze: -30, saturation: -25, temp: -10 } },
    { name: "Charcoal", folder: "Moody", params: { exposure: -0.3, contrast: 30, blacks: -25, saturation: -45, clarity: 20, vignette: { amount: -40, midpoint: 45, roundness: 0, feather: 60 } } },
    { name: "Candlelit", folder: "Moody", params: { exposure: -0.2, temp: 35, tint: 8, contrast: 15, shadows: -15, highlights: -20, vibrance: 20, grade: { shadows: { h: 15, s: 22, lum: 0 }, midtones: { h: 0, s: 0, lum: 0 }, highlights: { h: 40, s: 30, lum: 8 }, global: { h: 0, s: 0, lum: 0 }, blend: 95, balance: 10 } } }
  ];

  T.PXL = PXL;
})();
