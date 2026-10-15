/* TXT document statistics + readability modal. Exposes T.stats.open()
   per ARCHITECTURE.md section 9. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  function sheet() { return (T.editor && T.editor.sheetEl) ? T.editor.sheetEl() : null; }
  function docText() { return (T.editor && T.editor.textOf) ? (T.editor.textOf() || "") : ""; }

  var STOP = ["the","a","an","and","or","but","of","to","in","on","for","with","as","at",
    "by","from","is","are","was","were","be","been","it","this","that","these","those",
    "i","you","he","she","we","they","not","no","do","does","did","have","has","had",
    "will","would","can","could","should","there","their","what","which","who","when",
    "where","how","all","any","each","more","my","your","our","its","so","if","than",
    "then","into","about","over","after","before","between"];

  var PASSIVE_RE = /\b(am|is|are|was|were|be|been|being)\b\s+\w+ed\b/gi;
  var ADVERB_RE = /\b\w+ly\b/gi;

  /* ---------------- one-time CSS ---------------- */
  var cssDone = false;
  function ensureCss() {
    if (cssDone || !document.head) return;
    cssDone = true;
    var st = document.createElement("style");
    st.id = "txt-stats-css";
    st.textContent =
      ".stat-mark{background:rgba(250,204,21,.45);border-radius:3px}" +
      ".txt-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin:14px 0}" +
      ".txt-stat-cell{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}" +
      ".txt-stat-cell .v{font-size:19px;font-weight:700;line-height:1.25}" +
      ".txt-stat-cell .k{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:3px}" +
      ".txt-stat-wide{grid-column:1/-1}" +
      ".txt-stat-words{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;font-size:13px}" +
      ".txt-stat-words b{font-weight:700}" +
      ".txt-stat-btns{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap}" +
      ".txt-stat-btns .btn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}";
    document.head.appendChild(st);
  }

  /* ---------------- counters ---------------- */
  function countSyllables(word) {
    var w = String(word).toLowerCase().replace(/[^a-z]/g, "");
    if (w.length === 0) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]e|ed|es)$/, "").replace(/^y/, "");
    var m = w.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  function countRe(re, text) {
    re.lastIndex = 0;
    var n = 0, m;
    while ((m = re.exec(text))) {
      n++;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    re.lastIndex = 0;
    return n;
  }

  function fmtMin(mins) {
    if (!(mins > 0)) return "0 min";
    if (mins < 1) return Math.max(1, Math.round(mins * 60)) + " sec";
    var m = Math.floor(mins), s = Math.round((mins - m) * 60);
    return s > 0 ? m + " min " + s + " sec" : m + " min";
  }

  function compute() {
    var tx = docText();
    var trimmed = tx.trim();
    var wordsArr = trimmed ? trimmed.split(/\s+/) : [];
    var words = wordsArr.length;
    var chars = tx.length;
    var charsNoSpace = tx.replace(/\s/g, "").length;
    var sentences = tx.split(/[.!?]+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x !== ""; }).length;
    if (sentences === 0 && words > 0) sentences = 1;
    var s = sheet();
    var paras = 0;
    if (s) {
      paras = $$(":scope > *", s).filter(function (el) {
        return el.textContent && el.textContent.trim() !== "";
      }).length;
    }
    var sylTotal = 0;
    wordsArr.forEach(function (w) { sylTotal += countSyllables(w); });
    var grade = words > 0
      ? 0.39 * (words / sentences) + 11.8 * (sylTotal / words) - 15.59
      : 0;
    var freq = {};
    wordsArr.forEach(function (w) {
      var k = w.toLowerCase().replace(/[^a-z\u00C0-\u024F']/g, "").replace(/^'+|'+$/g, "");
      if (!k || STOP.indexOf(k) >= 0) return;
      freq[k] = (freq[k] || 0) + 1;
    });
    var top = Object.keys(freq).map(function (k) { return { w: k, n: freq[k] }; })
      .sort(function (a, b) { return b.n - a.n || (a.w < b.w ? -1 : 1); })
      .slice(0, 10);
    var passive = words > 0 ? (countRe(PASSIVE_RE, tx) / words) * 100 : 0;
    var adverbs = words > 0 ? (countRe(ADVERB_RE, tx) / words) * 100 : 0;
    return {
      words: words, chars: chars, charsNoSpace: charsNoSpace,
      sentences: sentences, paras: paras, grade: grade,
      readMin: words / 200, speakMin: words / 130,
      wps: sentences > 0 ? words / sentences : 0,
      passive: passive, adverbs: adverbs, top: top
    };
  }

  /* ---------------- highlight engine ---------------- */
  var hlStore = new Map(); /* block el -> original innerHTML */
  var hlKind = null;       /* 'passive' | 'adverb' | null */

  function hlBlocks() {
    var s = sheet();
    return s ? $$("p, h1, h2, h3, h4, li, blockquote", s) : [];
  }

  function clearHighlights() {
    hlStore.forEach(function (html, el) {
      if (el.isConnected) { try { el.innerHTML = html; } catch (e) {} }
    });
    hlStore.clear();
    hlKind = null;
  }

  function applyHighlight(kind) {
    clearHighlights();
    if (!kind) return;
    ensureCss();
    var re = kind === "passive" ? PASSIVE_RE : ADVERB_RE;
    hlBlocks().forEach(function (b) {
      if (!b.textContent || !b.textContent.trim()) return;
      if (b.querySelector(".stat-mark")) return;
      hlStore.set(b, b.innerHTML);
      var nodes = [];
      var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = tw.nextNode())) {
        if (n.nodeValue && /[^\s]/.test(n.nodeValue)) nodes.push(n);
      }
      nodes.forEach(function (tn) {
        var text = tn.nodeValue, matches = [], m;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
          matches.push({ start: m.index, end: m.index + m[0].length });
        }
        re.lastIndex = 0;
        if (!matches.length) return;
        var frag = document.createDocumentFragment(), last = 0;
        matches.forEach(function (mm) {
          if (mm.start > last) frag.appendChild(document.createTextNode(text.slice(last, mm.start)));
          var sp = document.createElement("span");
          sp.className = "stat-mark";
          sp.textContent = text.slice(mm.start, mm.end);
          frag.appendChild(sp);
          last = mm.end;
        });
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      });
    });
    hlKind = kind;
  }

  /* ---------------- modal ---------------- */
  function cell(value, label, sub) {
    return '<div class="txt-stat-cell"><div class="v">' + value + "</div>" +
      '<div class="k">' + T.esc(label) + "</div>" +
      (sub ? '<div class="k">' + T.esc(sub) + "</div>" : "") + "</div>";
  }

  function open() {
    ensureCss();
    var d = compute();
    var num = function (v) { return v.toLocaleString("en-US"); };
    var topHtml = d.top.length
      ? d.top.map(function (t) {
          return "<span><b>" + T.esc(t.w) + "</b> " + T.esc(String(t.n)) + "</span>";
        }).join("")
      : T.esc("None");
    var html =
      '<div class="txt-stat-grid">' +
      cell(num(d.words), "Words") +
      cell(num(d.chars), "Characters", num(d.charsNoSpace) + " without spaces") +
      cell(num(d.sentences), "Sentences") +
      cell(num(d.paras), "Paragraphs") +
      cell(d.grade.toFixed(1), "Flesch-Kincaid grade") +
      cell(T.esc(fmtMin(d.readMin)), "Reading time") +
      cell(T.esc(fmtMin(d.speakMin)), "Speaking time") +
      cell(d.wps.toFixed(1), "Avg words per sentence") +
      cell(d.passive.toFixed(1) + "%", "Passive voice") +
      cell(d.adverbs.toFixed(1) + "%", "Adverbs") +
      '<div class="txt-stat-cell txt-stat-wide"><div class="k">Top words</div>' +
      '<div class="txt-stat-words">' + topHtml + "</div></div>" +
      "</div>" +
      '<div class="txt-stat-btns">' +
      '<button type="button" class="btn ghost" data-hl="passive">Highlight passive</button>' +
      '<button type="button" class="btn ghost" data-hl="adverb">Highlight adverbs</button>' +
      "</div>";

    var p = T.modal({ title: T.t("statsTitle"), html: html, okText: T.t("close") });

    var wraps = $$("#modalRoot .modal-wrap");
    var wrap = wraps[wraps.length - 1];
    if (wrap) {
      $$("[data-hl]", wrap).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var kind = btn.getAttribute("data-hl");
          if (hlKind === kind) {
            applyHighlight(null);
            btn.classList.remove("on");
          } else {
            applyHighlight(kind);
            $$("[data-hl]", wrap).forEach(function (o) {
              o.classList.toggle("on", o === btn);
            });
          }
        });
      });
    }
    p.then(function () { clearHighlights(); });
    return p;
  }

  /* ================= public API ================= */
  T.stats = { open: open, compute: compute };

  T.register("stats.open", function () { T.stats.open(); },
    { title: "Document statistics", cat: "Review", icon: "i-stats" });
})();
