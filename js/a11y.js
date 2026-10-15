/* TXT accessibility: checker + immersive reader (line focus, spacing, POS, syllables).
   Exposes T.a11y per ARCHITECTURE.md section 9. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  function sheet() { return (T.editor && T.editor.sheetEl) ? T.editor.sheetEl() : null; }

  /* ---------------- word lists for part-of-speech highlight ---------------- */
  var NOUNS = ["time","people","way","day","man","thing","woman","life","child","world",
    "school","state","family","student","group","country","problem","hand","part","place",
    "case","week","company","system","program","question","government","number","night","point",
    "home","water","room","mother","area","money","story","fact","month","lot"];
  var VERBS = ["be","have","do","say","get","make","go","know","take","see",
    "come","think","look","want","give","use","find","tell","ask","seem",
    "feel","try","leave","call","keep","let","begin","help","talk","turn",
    "start","show","hear","play","run","move","like","live","believe","hold"];
  var ADJS = ["good","new","first","long","great","little","own","other","old","big",
    "high","different","small","large","next","early","young","important","few","public",
    "bad","same","able","best","better","low","last","major","full","black",
    "white","red","short","clear","free","strong","true","whole","local","certain"];

  var posClass = {};
  NOUNS.forEach(function (w) { posClass[w] = "noun"; });
  VERBS.forEach(function (w) { if (!posClass[w]) posClass[w] = "verb"; });
  ADJS.forEach(function (w) { if (!posClass[w]) posClass[w] = "adj"; });

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  var POS_RE = (function () {
    var words = Object.keys(posClass).sort(function (a, b) { return b.length - a.length; });
    return new RegExp("\\b(" + words.map(escRe).join("|") + ")\\b", "gi");
  })();

  var SYL_RE = /[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))/gi;
  var WORD_RE = /[A-Za-z\u00C0-\u024F']+/g;

  /* ---------------- one-time CSS ---------------- */
  var cssDone = false;
  function ensureCss() {
    if (cssDone || !document.head) return;
    cssDone = true;
    var st = document.createElement("style");
    st.id = "txt-a11y-css";
    st.textContent =
      ".syl{border-radius:3px;padding:0 1px}" +
      ".syl0{background:rgba(37,99,235,.16)}" +
      ".syl1{background:rgba(37,99,235,.05)}";
    document.head.appendChild(st);
  }

  /* ---------------- text-block helpers ---------------- */
  function textBlocks() {
    var s = sheet();
    return s ? $$("p, h1, h2, h3, h4, li, blockquote", s) : [];
  }

  function collectTextNodes(root) {
    var out = [];
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeValue && /[^\s]/.test(n.nodeValue)) out.push(n);
    }
    return out;
  }

  /* Generic: store original HTML per block, then run a per-text-node transform. */
  function overlayOn(store, cls, transform) {
    ensureCss();
    var blocks = textBlocks();
    store.clear();
    blocks.forEach(function (b) {
      if (!b.textContent || !b.textContent.trim()) return;
      if (b.querySelector("." + cls)) return; /* already processed */
      store.set(b, b.innerHTML);
      collectTextNodes(b).forEach(function (tn) { transform(b, tn); });
    });
  }
  function overlayOff(store) {
    store.forEach(function (html, el) {
      if (el.isConnected) { try { el.innerHTML = html; } catch (e) {} }
    });
    store.clear();
  }

  function splitNode(node, matches) {
    /* matches: [{start, end, wrap:fn(text)->Element}] sorted by start */
    var frag = document.createDocumentFragment();
    var text = node.nodeValue, last = 0;
    matches.forEach(function (m) {
      if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));
      frag.appendChild(m.wrap(text.slice(m.start, m.end)));
      last = m.end;
    });
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  /* ================= checker ================= */
  function parseColor(str) {
    var m = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(str || "");
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: (m[4] == null ? 1 : +m[4]) };
  }
  function chanLum(v) {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function luminance(c) { return 0.2126 * chanLum(c.r) + 0.7152 * chanLum(c.g) + 0.0722 * chanLum(c.b); }
  function ratio(fg, bg) {
    var l1 = luminance(fg), l2 = luminance(bg);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function effectiveBg(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function check() {
    var s = sheet();
    var out = [];
    if (!s) return out;

    /* a) images missing alt */
    $$("img", s).forEach(function (img) {
      var alt = img.getAttribute("alt");
      if (alt == null || alt.trim() === "") out.push({ type: "imgNoAlt", msg: "Image missing alt text", el: img });
    });

    /* b) skipped heading levels + c) empty headings */
    var prev = 0;
    $$("h1, h2, h3, h4", s).forEach(function (h) {
      var lv = parseInt(h.tagName.charAt(1), 10);
      if (!(h.textContent || "").trim()) out.push({ type: "emptyHeading", msg: "Empty heading", el: h });
      if (prev > 0 && lv > prev + 1) {
        out.push({ type: "skipHeading", msg: "Skipped heading level (H" + prev + " to H" + lv + ")", el: h });
      }
      prev = lv;
    });

    /* d) low contrast */
    try {
      var blocks = $$("p, h1, h2, h3, h4, li", s).filter(function (el) {
        return el.textContent && el.textContent.trim() !== "";
      }).slice(0, 40);
      blocks.forEach(function (el) {
        try {
          var cs = getComputedStyle(el);
          var fg = parseColor(cs.color);
          if (!fg) return;
          var bg = effectiveBg(el);
          var r = ratio(fg, bg);
          var fs = parseFloat(cs.fontSize) || 16;
          var need = fs < 18 ? 4.5 : 3;
          if (r < need) out.push({ type: "lowContrast", msg: "Low contrast text (ratio " + r.toFixed(1) + ")", el: el });
        } catch (e) { /* skip on error */ }
      });
    } catch (e) { /* skip on error */ }

    return out;
  }

  /* ================= line focus ================= */
  var lineHandler = null;
  function setLineFocus(n) {
    var mask = $("#lineMask"), stage = $("#stage");
    if (lineHandler && stage) { stage.removeEventListener("mousemove", lineHandler); lineHandler = null; }
    if (!mask || !stage) return;
    if (!n) {
      mask.classList.add("hidden");
      T.state.prefs.a11yLineFocus = 0;
      T.savePrefs();
      return;
    }
    n = (n === 1 || n === 5) ? n : 3;
    mask.classList.remove("hidden");
    var slit = mask.querySelector(".slit");
    var h = n * 34;
    if (slit) slit.style.height = h + "px";
    lineHandler = function (e) {
      var r = stage.getBoundingClientRect();
      var y = e.clientY - r.top - h / 2;
      if (slit) slit.style.top = y + "px";
    };
    stage.addEventListener("mousemove", lineHandler);
    T.state.prefs.a11yLineFocus = n;
    T.savePrefs();
  }

  /* ================= spacing boost ================= */
  function setSpacing(on) {
    var s = sheet();
    if (s) s.classList.toggle("txt-spacing", !!on);
    T.state.prefs.a11ySpacing = !!on;
    T.savePrefs();
  }

  /* ================= part-of-speech highlight ================= */
  var posStore = new Map();
  function setPOS(on) {
    on = !!on;
    if (on) {
      overlayOn(posStore, "pos-noun", function (b, tn) {
        var text = tn.nodeValue, matches = [], m;
        POS_RE.lastIndex = 0;
        while ((m = POS_RE.exec(text))) {
          matches.push({
            start: m.index, end: m.index + m[0].length,
            wrap: (function (word) {
              return function (t) {
                var sp = document.createElement("span");
                sp.className = "pos-" + (posClass[word.toLowerCase()] || "noun");
                sp.textContent = t;
                return sp;
              };
            })(m[0])
          });
        }
        if (matches.length) splitNode(tn, matches);
      });
    } else {
      overlayOff(posStore);
    }
    T.state.prefs.a11yPOS = on;
    T.savePrefs();
  }

  /* ================= syllable highlight ================= */
  var sylStore = new Map();
  function splitSyllables(word) {
    var out = [], m, last = 0;
    SYL_RE.lastIndex = 0;
    while ((m = SYL_RE.exec(word))) {
      var chunk = m[0];
      if (m.index > last) chunk = word.slice(last, m.index) + chunk; /* absorb unmatched gap */
      out.push(chunk);
      last = m.index + m[0].length;
    }
    if (last < word.length) {
      if (out.length) out[out.length - 1] += word.slice(last);
      else out.push(word.slice(last));
    }
    return out.length ? out : [word];
  }
  function setSyllables(on) {
    on = !!on;
    if (on) {
      overlayOn(sylStore, "syl", function (b, tn) {
        var text = tn.nodeValue, matches = [], m;
        WORD_RE.lastIndex = 0;
        while ((m = WORD_RE.exec(text))) {
          (function (start, end, word) {
            var syls = splitSyllables(word);
            matches.push({
              start: start, end: end,
              wrap: function () {
                var frag = document.createDocumentFragment();
                syls.forEach(function (sy, i) {
                  var sp = document.createElement("span");
                  sp.className = "syl syl" + (i % 2);
                  sp.textContent = sy;
                  frag.appendChild(sp);
                });
                return frag;
              }
            });
          })(m.index, m.index + m[0].length, m[0]);
        }
        if (matches.length) splitNode(tn, matches);
      });
    } else {
      overlayOff(sylStore);
    }
    T.state.prefs.a11ySyllables = on;
    T.savePrefs();
  }

  /* ================= public API ================= */
  T.a11y = {
    check: check,
    setLineFocus: setLineFocus,
    setSpacing: setSpacing,
    setPOS: setPOS,
    setSyllables: setSyllables
  };

  T.register("a11y.check", function () { return T.a11y.check(); },
    { title: "Check accessibility", cat: "Accessibility", icon: "i-shield" });
})();
