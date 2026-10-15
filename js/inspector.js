/* TXT inspector: right-side panel router (type | table | a11y, plus
   comments | changes | ai registered by their own workers).
   Defines T.inspector per ARCHITECTURE.md section 9. This file loads BEFORE
   changes.js, comments.js and ai.js, so T.inspector must be fully defined at
   top level here; those workers call T.inspector.registerPanel at their top
   level. T.a11y and T.changes only exist at runtime, so they are touched only
   inside render functions and event handlers. */
(function () {
  "use strict";

  var T = window.TXT;
  var $ = T.$;

  var panels = {};          /* id -> {title, render} */
  var current = null;       /* {id, data} */

  function inspEl() { return document.getElementById("inspector"); }
  function bodyEl() { return document.getElementById("inspBody"); }
  function titleEl() { return document.getElementById("inspTitle"); }
  function closeBtn() { return document.getElementById("inspClose"); }

  /* Run a command defensively: the fmt/para/table commands may not be
     registered yet (their owners load later or are work in progress). */
  function runCmd(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      return T.cmd.apply(null, [name].concat(args));
    } catch (e) {
      console.warn("[TXT inspector] command failed:", name, e);
      return undefined;
    }
  }

  /* ---------------- router core ---------------- */

  function registerPanel(id, title, renderFn) {
    if (!id || typeof renderFn !== "function") return;
    panels[id] = { title: title, render: renderFn };
    if (current && current.id === id) refresh();
  }

  function renderCurrent() {
    var b = bodyEl();
    if (!b) return;
    b.innerHTML = "";
    if (!current) return;
    var p = panels[current.id];
    if (!p) return;
    try {
      p.render(b, current.data);
    } catch (e) {
      console.error("[TXT inspector] render failed for panel:", current.id, e);
      b.innerHTML = "<p class=\"insp-empty\">This panel could not be shown.</p>";
    }
  }

  function open(id, data) {
    var p = panels[id];
    if (!p) {
      T.toast("Panel not available", "error");
      return;
    }
    var w = inspEl();
    if (w) w.classList.remove("hidden");
    var t = titleEl();
    if (t) t.textContent = p.title;
    current = { id: id, data: data };
    renderCurrent();
  }

  function close() {
    var w = inspEl();
    if (w) w.classList.add("hidden");
    var b = bodyEl();
    if (b) b.innerHTML = "";
    current = null;
  }

  function refresh() {
    if (!current) return;
    renderCurrent();
  }

  T.inspector = {
    registerPanel: registerPanel,
    open: open,
    close: close,
    refresh: refresh
  };

  /* ---------------- shell wiring (top level) ---------------- */

  var cb = closeBtn();
  if (cb) cb.addEventListener("click", function () { close(); });

  T.bus.on("inspector:open", function (p) {
    if (p && p.id) open(p.id, p.data);
  });

  /* ---------------- shared helpers ---------------- */

  function row(labelText, controlHtml) {
    return '<div class="insp-row"><span class="insp-lbl">' + T.esc(labelText) +
      "</span><span class=\"insp-ctl\">" + controlHtml + "</span></div>";
  }

  function group(titleText, innerHtml) {
    return '<div class="insp-group"><h4 class="insp-h">' + T.esc(titleText) +
      "</h4>" + innerHtml + "</div>";
  }

  function note(text) {
    return '<p class="insp-note">' + T.esc(text) + "</p>";
  }

  /* Element to read live formatting from: current block, else the anchor of the selection. */
  function fmtTarget() {
    try {
      var b = T.sel.block();
      if (b) return b;
      var r = T.sel.range();
      var n = r ? r.commonAncestorContainer : null;
      if (n && n.nodeType === 3) n = n.parentNode;
      if (n && n.nodeType === 1) return n;
    } catch (e) { /* selection unavailable */ }
    return null;
  }

  function computedStyle(prop) {
    var t = fmtTarget();
    if (!t) return "";
    try {
      var cs = window.getComputedStyle(t);
      return cs ? cs[prop] : "";
    } catch (e) { return ""; }
  }

  function firstFontName() {
    var raw = computedStyle("fontFamily");
    if (!raw) return "";
    return raw.split(",")[0].replace(/['"]/g, "").trim();
  }

  /* ---------------- built-in panel: Typography ---------------- */

  var LINE_HEIGHTS = [1.0, 1.15, 1.5, 2.0, 2.5];
  var LETTER_SPACINGS = [
    { v: "-0.5px", t: "Tight" },
    { v: "0px", t: "Normal" },
    { v: "1px", t: "Wide" },
    { v: "2px", t: "Extra wide" }
  ];

  function nearestLineHeight() {
    var lh = computedStyle("lineHeight");
    var fs = parseFloat(computedStyle("fontSize")) || 16;
    var mult = 1.5;
    if (lh) {
      if (lh.indexOf("px") > -1) mult = parseFloat(lh) / fs;
      else if (lh !== "normal") mult = parseFloat(lh);
    }
    var best = LINE_HEIGHTS[2];
    var bestD = Infinity;
    LINE_HEIGHTS.forEach(function (v) {
      var d = Math.abs(v - mult);
      if (d < bestD) { bestD = d; best = v; }
    });
    return String(best);
  }

  function currentLetterSpacing() {
    var ls = computedStyle("letterSpacing");
    if (!ls || ls === "normal") return "0px";
    return ls;
  }

  function fontStackFor(name) {
    try {
      if (T.fonts && T.fonts.stackFor) return T.fonts.stackFor(name);
    } catch (e) { /* fonts service unavailable */ }
    return name;
  }

  function renderTypePanel(body, data) {
    var names = [];
    try {
      if (T.fonts && T.fonts.names) names = T.fonts.names() || [];
    } catch (e) { names = []; }

    var curFont = firstFontName();
    var curSize = Math.round(parseFloat(computedStyle("fontSize")) || 16);
    var curLh = nearestLineHeight();
    var curLs = currentLetterSpacing();

    var fontOpts = names.map(function (n) {
      return '<option value="' + T.esc(n) + '"' +
        (curFont && n.toLowerCase() === curFont.toLowerCase() ? " selected" : "") +
        ">" + T.esc(n) + "</option>";
    }).join("");

    var lhOpts = LINE_HEIGHTS.map(function (v) {
      return '<option value="' + v + '"' + (String(v) === curLh ? " selected" : "") +
        ">" + v.toFixed(v === 1.15 ? 2 : 1) + "</option>";
    }).join("");

    var lsOpts = LETTER_SPACINGS.map(function (o) {
      return '<option value="' + T.esc(o.v) + '"' + (o.v === curLs ? " selected" : "") +
        ">" + T.esc(o.t) + "</option>";
    }).join("");

    body.innerHTML =
      group("Font", row("Family", '<select class="insp-sel" data-k="family">' + fontOpts + "</select>") +
        row("Size", '<button type="button" class="btn icon-btn" data-k="sizeDown" title="Decrease size">' +
          T.icon("i-minus") + "</button>" +
          '<span class="insp-val" data-k="sizeVal">' + T.esc(String(curSize)) + "px</span>" +
          '<button type="button" class="btn icon-btn" data-k="sizeUp" title="Increase size">' +
          T.icon("i-plus") + "</button>")) +
      group("Spacing", row("Line height", '<select class="insp-sel" data-k="lineHeight">' + lhOpts + "</select>") +
        row("Letter spacing", '<select class="insp-sel" data-k="letterSpacing">' + lsOpts + "</select>"));

    var famSel = body.querySelector('[data-k="family"]');
    if (famSel) famSel.addEventListener("change", function () {
      runCmd("fmt.fontFamily", fontStackFor(famSel.value));
      refresh();
    });

    function setSize(px) {
      px = T.clamp(Math.round(px), 8, 96);
      runCmd("fmt.fontSize", px);
      refresh();
    }
    var sizeVal = body.querySelector('[data-k="sizeVal"]');
    var curPx = curSize;
    var down = body.querySelector('[data-k="sizeDown"]');
    var up = body.querySelector('[data-k="sizeUp"]');
    if (down) down.addEventListener("click", function () { setSize(curPx - 1); });
    if (up) up.addEventListener("click", function () { setSize(curPx + 1); });
    if (sizeVal) sizeVal.textContent = String(curPx) + "px";

    var lhSel = body.querySelector('[data-k="lineHeight"]');
    if (lhSel) lhSel.addEventListener("change", function () {
      runCmd("para.lineSpacing", parseFloat(lhSel.value));
      refresh();
    });

    var lsSel = body.querySelector('[data-k="letterSpacing"]');
    if (lsSel) lsSel.addEventListener("change", function () {
      runCmd("fmt.letterSpacing", lsSel.value);
      refresh();
    });
  }

  registerPanel("type", "Typography", renderTypePanel);

  /* ---------------- built-in panel: Table Tools ---------------- */

  function renderTablePanel(body, data) {
    var buttons = [
      { k: "addRowAbove", label: "Add row above", icon: "i-table" },
      { k: "addRowBelow", label: "Add row below", icon: "i-table" },
      { k: "addColLeft", label: "Add column left", icon: "i-table" },
      { k: "addColRight", label: "Add column right", icon: "i-table" },
      { k: "deleteRow", label: "Delete row", icon: "i-trash" },
      { k: "deleteCol", label: "Delete column", icon: "i-trash" },
      { k: "zebra", label: "Toggle zebra stripes", icon: "i-zebra" },
      { k: "headerFill", label: "Toggle header fill", icon: "i-shading" }
    ];

    var html = '<div class="insp-btnlist">' + buttons.map(function (b) {
      return '<button type="button" class="btn insp-btn" data-cmd="table.' + b.k + '">' +
        T.icon(b.icon) + "<span>" + T.esc(b.label) + "</span></button>";
    }).join("") + "</div>" + note("Place the caret inside a table first.");

    body.innerHTML = html;

    var list = body.querySelectorAll("[data-cmd]");
    Array.prototype.forEach.call(list, function (btn) {
      btn.addEventListener("click", function () {
        runCmd(btn.getAttribute("data-cmd"));
      });
    });
  }

  registerPanel("table", "Table Tools", renderTablePanel);

  /* ---------------- built-in panel: Accessibility ---------------- */

  function flashEl(el) {
    if (!el || !el.scrollIntoView) return;
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { el.scrollIntoView(false); }
    el.classList.add("insp-flash");
    setTimeout(function () { el.classList.remove("insp-flash"); }, 1400);
  }

  function currentIssues() {
    if (!T.a11y || !T.a11y.check) return null;
    try { return T.a11y.check(); } catch (e) { return null; }
  }

  function renderA11yPanel(body, data) {
    var issues = Array.isArray(data) ? data : (currentIssues() || []);
    var count = issues.length;

    var head = '<div class="insp-a11y-head"><span class="insp-count">' +
      T.icon("i-shield") + " " + T.esc(String(count)) + " " +
      T.esc(count === 1 ? "issue" : "issues") + "</span>" +
      '<button type="button" class="btn" data-k="recheck">' + T.icon("i-search") +
      "<span>Re-check</span></button></div>";

    if (count === 0) {
      body.innerHTML = head + '<p class="insp-empty">' +
        T.icon("i-check") + " " + T.esc("No issues found. Nice work.") + "</p>";
    } else {
      var rows = issues.map(function (iss, i) {
        return '<div class="insp-issue"><span class="insp-issue-ic">' + T.icon("i-eye") + "</span>" +
          '<span class="insp-issue-msg">' + T.esc(iss && iss.msg ? String(iss.msg) : "Issue") + "</span>" +
          '<button type="button" class="btn insp-find" data-i="' + i + '">Find</button></div>';
      }).join("");
      body.innerHTML = head + '<div class="insp-issues">' + rows + "</div>";
    }

    var re = body.querySelector('[data-k="recheck"]');
    if (re) re.addEventListener("click", function () {
      var fresh = currentIssues();
      if (fresh === null) {
        T.toast("Accessibility checker is not ready yet", "error");
        return;
      }
      current = { id: "a11y", data: fresh };
      refresh();
    });

    var finds = body.querySelectorAll(".insp-find");
    Array.prototype.forEach.call(finds, function (btn) {
      btn.addEventListener("click", function () {
        var i = parseInt(btn.getAttribute("data-i"), 10);
        var iss = issues[i];
        var target = iss ? iss.el : null;
        if (!target || !document.contains(target)) {
          T.toast("The issue is no longer in the document", "error");
          return;
        }
        flashEl(target);
      });
    });
  }

  registerPanel("a11y", "Accessibility", renderA11yPanel);

  /* 'comments', 'changes' and 'ai' panels are registered by their own
     workers (js/comments.js, js/changes.js, js/ai.js) via
     T.inspector.registerPanel; this router handles them generically. */

})();
