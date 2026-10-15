/* TXT Home tab: clipboard, typography, inline, paragraph, styles.
   Builds the Home ribbon tab via T.ribbon and registers all Home commands.
   Depends on: core.js (TXT), fonts.js (T.fonts), editor.js (T.editor),
   ribbon.js (T.ribbon, loaded before this file). */

(function () {
  "use strict";

  var T = window.TXT;
  if (!T || !T.ribbon) {
    if (window.console && window.console.warn) window.console.warn("[TXT] home tab skipped: T.ribbon unavailable");
    return;
  }

  /* ================= palettes ================= */

  var TEXT_COLORS = [
    "#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#FFFFFF",
    "#C00000", "#E06666", "#F4CCCC",
    "#E36C0A", "#F6B26B", "#FCE5CD",
    "#BF9000", "#FFD966", "#FFF2CC",
    "#38761D", "#6AA84F", "#D9EAD3",
    "#0B5394", "#3D85C6", "#CFE2F3",
    "#674EA7", "#8E7CC3", "#D9D2E9"
  ];

  var HIGHLIGHTS = [
    "#FFFF00", "#7FFF00", "#00FFFF", "#FF66FF", "#FF9933", "#FF3333",
    "#FFF9C4", "#C8E6C9", "#BBDEFB", "#F8BBD0", "#E1BEE7", "#FFE0B2"
  ];

  var FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 44, 48, 60, 72, 96];
  var LINE_HEIGHTS = ["1.0", "1.15", "1.5", "2.0", "2.5", "3.0"];
  var LETTER_SPACING = [["0", "None"], ["0.5px", "0.5 px"], ["1px", "1 px"], ["2px", "2 px"], ["3px", "3 px"]];
  var CASES = [["upper", "UPPERCASE"], ["lower", "lowercase"], ["title", "Title Case"], ["sentence", "Sentence case"]];
  var UNDERLINES = [["solid", "Solid"], ["double", "Double"], ["wavy", "Wavy"], ["dotted", "Dotted"]];
  var BORDERS = [["none", "None"], ["bottom", "Bottom border"], ["top", "Top border"], ["box", "Box border"]];

  var STYLE_DEFS = [
    ["style.normal", "Normal"],
    ["style.noSpacing", "No Spacing"],
    ["style.title", "Title"],
    ["style.subtitle", "Subtitle"],
    ["style.h1", "Heading 1"],
    ["style.h2", "Heading 2"],
    ["style.h3", "Heading 3"],
    ["style.blockquote", "Blockquote"],
    ["style.intenseQuote", "Intense Quote"],
    ["style.codeBlock", "Code Block"],
    ["style.callout", "Callout Box"]
  ];

  var STYLE_MAP = {
    normal: { tag: "p", cls: "" },
    noSpacing: { tag: "p", cls: "", style: { marginTop: "0px", marginBottom: "0px" } },
    title: { tag: "p", cls: "doc-title" },
    subtitle: { tag: "p", cls: "doc-subtitle" },
    h1: { tag: "h1", cls: "" },
    h2: { tag: "h2", cls: "" },
    h3: { tag: "h3", cls: "" },
    blockquote: { tag: "blockquote", cls: "" },
    intenseQuote: { tag: "blockquote", cls: "intense" },
    codeBlock: { tag: "pre", cls: "codeblock" },
    callout: { tag: "div", cls: "callout info" }
  };

  /* ================= selection plumbing ================= */

  function sheet() { return T.sel.sheet(); }

  /* Focus the sheet, keep the live selection when it is inside the sheet,
     otherwise restore the last saved range, run fn, then mark dirty. */
  function withSel(fn) {
    var sh = sheet();
    if (!sh) return;
    var sel = window.getSelection();
    var live = sel.rangeCount ? sel.getRangeAt(0) : null;
    var inSheet = !!(live && (sh === live.commonAncestorContainer || sh.contains(live.commonAncestorContainer)));
    if (!inSheet) T.sel.restore();
    else T.sel.focusSheet();
    fn();
    T.editor.markDirty();
  }

  function anchorEl() {
    var r = T.sel.range();
    if (!r) return null;
    var n = r.commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    return (n && n.nodeType === 1) ? n : null;
  }

  function needText() {
    if (T.sel.collapsed()) { T.toast("Select text first", "error"); return false; }
    return true;
  }

  function wrapSelection(tag, styleObj, attrs) {
    var sh = sheet();
    var r = T.sel.range();
    if (!sh || !r || r.collapsed) return false;
    if (!sh.contains(r.commonAncestorContainer)) return false;
    var el = document.createElement(tag || "span");
    var k;
    if (styleObj) {
      for (k in styleObj) {
        if (Object.prototype.hasOwnProperty.call(styleObj, k)) el.style[k] = styleObj[k];
      }
    }
    if (attrs) {
      for (k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
      }
    }
    try {
      r.surroundContents(el);
    } catch (e) {
      try {
        var frag = r.extractContents();
        el.appendChild(frag);
        r.insertNode(el);
      } catch (e2) {
        return false;
      }
    }
    mergeWithSiblings(el);
    return true;
  }

  /* Merge a newly wrapped span with adjacent spans carrying the identical
     tag + style so repeated formatting does not nest spans per operation. */
  function mergeWithSiblings(el) {
    if (!el || !el.parentNode) return;
    var key = function (n) {
      return n.tagName + "|" + (n.getAttribute("style") || "") + "|" + (n.className || "");
    };
    var k = key(el), p = el.parentNode, sib;
    sib = el.previousSibling;
    while (sib && sib.nodeType === 1 && key(sib) === k) {
      var ps = sib.previousSibling;
      while (sib.firstChild) el.insertBefore(sib.firstChild, el.firstChild);
      sib.remove();
      sib = ps;
    }
    sib = el.nextSibling;
    while (sib && sib.nodeType === 1 && key(sib) === k) {
      var ns = sib.nextSibling;
      while (sib.firstChild) el.appendChild(sib.firstChild);
      sib.remove();
      sib = ns;
    }
  }

  var BLOCK_SEL = "p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,div";

  function blocksInSelection() {
    var sh = sheet();
    if (!sh) return [];
    var r = T.sel.range();
    var b;
    if (!r) { b = T.sel.block(); return b ? [b] : []; }
    if (r.collapsed) { b = T.sel.block(); return b ? [b] : []; }
    var out = [];
    var all = sh.querySelectorAll(BLOCK_SEL);
    for (var i = 0; i < all.length; i++) {
      try { if (r.intersectsNode(all[i])) out.push(all[i]); } catch (e) { /* ignore */ }
    }
    /* keep only outermost blocks: drop a node whose ancestor is also selected */
    out = out.filter(function (el) {
      var p = el.parentNode;
      while (p && p !== sh) {
        if (out.indexOf(p) >= 0) return false;
        p = p.parentNode;
      }
      return true;
    });
    if (!out.length) { b = T.sel.block(); if (b) out.push(b); }
    return out;
  }

  function applyBlockStyle(styleObj) {
    var blocks = blocksInSelection();
    if (!blocks.length) { T.toast("Place the cursor in a paragraph first", "error"); return false; }
    blocks.forEach(function (b) {
      for (var k in styleObj) b.style[k] = styleObj[k];
    });
    return true;
  }

  function selFontPx() {
    var el = anchorEl();
    if (!el || !el.getBoundingClientRect) return 16;
    var v = parseFloat(window.getComputedStyle(el).fontSize);
    return v || 16;
  }

  function execCmd(name) {
    try { return document.execCommand(name, false, null); }
    catch (e) { return false; }
  }

  function copyBid(from, to) {
    var bid = from.getAttribute("data-bid");
    if (bid) to.setAttribute("data-bid", bid);
  }

  /* ================= clipboard commands ================= */

  T.register("clip.paste", function () {
    withSel(function () { /* focus + restore only */ });
    var ok = execCmd("paste");
    if (!ok) T.toast("Press Ctrl+V to paste", "error");
  }, { title: "Paste", cat: "Home", icon: "i-paste" });

  T.register("clip.cut", function () {
    withSel(function () { execCmd("cut"); });
  }, { title: "Cut", cat: "Home", icon: "i-cut" });

  T.register("clip.copy", function () {
    withSel(function () { execCmd("copy"); });
    T.toast("Copied");
  }, { title: "Copy", cat: "Home", icon: "i-copy" });

  var painterArmed = false;
  var painterStyle = null;

  function disarmPainter(applied) {
    painterArmed = false;
    painterStyle = null;
    T.toast(applied ? "Style painted" : "Format painter off");
  }

  T.register("clip.painter", function () {
    if (painterArmed) { disarmPainter(false); return; }
    var el = anchorEl();
    if (!el) { T.toast("Select formatted text first", "error"); return; }
    var cs = window.getComputedStyle(el);
    painterStyle = {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      textDecoration: cs.textDecoration
    };
    painterArmed = true;
    T.toast("Format painter ready. Select text to paint the style.");
  }, { title: "Format Painter", cat: "Home", icon: "i-painter" });

  document.addEventListener("mouseup", function (e) {
    if (!painterArmed) return;
    var sh = sheet();
    if (!sh || !e.target || !sh.contains(e.target)) return;
    setTimeout(function () {
      if (!painterArmed || !painterStyle) return;
      var r = T.sel.range();
      if (r && !r.collapsed && sh.contains(r.commonAncestorContainer)) {
        if (wrapSelection("span", painterStyle)) T.editor.markDirty();
        disarmPainter(true);
      }
    }, 40);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && painterArmed) disarmPainter(false);
  });

  /* ================= typography commands ================= */

  function fontByStack(stack) {
    for (var i = 0; i < T.fonts.all.length; i++) {
      if (T.fonts.all[i].stack === stack) return T.fonts.all[i];
    }
    return null;
  }

  /* Restyle the selection: if it exactly covers a single span, update that
     span in place instead of nesting a new one. */
  function restyleSelection(styleObj) {
    var sh = sheet();
    var r = T.sel.range();
    if (!sh || !r || r.collapsed || !sh.contains(r.commonAncestorContainer)) return false;
    var anc = r.commonAncestorContainer;
    if (anc.nodeType === 3) anc = anc.parentNode;
    if (anc && anc.tagName === "SPAN") {
      try {
        var rr = document.createRange();
        rr.selectNodeContents(anc);
        if (r.compareBoundaryPoints(Range.START_TO_START, rr) <= 0 &&
            r.compareBoundaryPoints(Range.END_TO_END, rr) >= 0) {
          var k;
          for (k in styleObj) {
            if (Object.prototype.hasOwnProperty.call(styleObj, k)) anc.style[k] = styleObj[k];
          }
          mergeWithSiblings(anc);
          return true;
        }
      } catch (e) { /* fall through to wrap */ }
    }
    return wrapSelection("span", styleObj);
  }

  T.register("fmt.fontFamily", function (stack) {
    if (!stack || !needText()) return;
    var f = fontByStack(stack);
    if (f) T.fonts.ensure(f.name);
    withSel(function () { restyleSelection({ fontFamily: stack }); });
  }, { title: "Font", cat: "Home", icon: "i-case" });

  T.register("fmt.fontSize", function (pt) {
    pt = parseFloat(pt);
    if (!pt || !needText()) return;
    var px = Math.round(pt * 96 / 72);
    withSel(function () { restyleSelection({ fontSize: px + "px" }); });
  }, { title: "Font Size", cat: "Home", icon: "i-case" });

  T.register("fmt.fontGrow", function () {
    if (!needText()) return;
    var next = T.clamp(Math.round(selFontPx()) + 2, 6, 400);
    withSel(function () { restyleSelection({ fontSize: next + "px" }); });
  }, { title: "Grow Font", cat: "Home", icon: "i-plus" });

  T.register("fmt.fontShrink", function () {
    if (!needText()) return;
    var next = T.clamp(Math.round(selFontPx()) - 2, 6, 400);
    withSel(function () { restyleSelection({ fontSize: next + "px" }); });
  }, { title: "Shrink Font", cat: "Home", icon: "i-minus" });

  T.register("fmt.letterSpacing", function (v) {
    if (v == null || !needText()) return;
    withSel(function () { wrapSelection("span", { letterSpacing: String(v) }); });
  }, { title: "Letter Spacing", cat: "Home", icon: "i-spacing" });

  function sentenceCase(s) {
    return s.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, function (m) { return m.toUpperCase(); });
  }

  function transformTextNode(tn, mode) {
    var t = tn.nodeValue;
    if (mode === "upper") tn.nodeValue = t.toUpperCase();
    else if (mode === "lower") tn.nodeValue = t.toLowerCase();
    else if (mode === "title") {
      tn.nodeValue = t.replace(/\w\S*/g, function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
    }
    else if (mode === "sentence") tn.nodeValue = sentenceCase(t);
  }

  T.register("fmt.case", function (mode) {
    if (!mode || !needText()) return;
    withSel(function () {
      var r = T.sel.range();
      if (!r) return;
      var root = r.commonAncestorContainer;
      if (root.nodeType === 3) { transformTextNode(root, mode); return; }
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          return r.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (tn) { transformTextNode(tn, mode); });
    });
  }, { title: "Change Case", cat: "Home", icon: "i-case" });

  T.register("fmt.clear", function () {
    if (!needText()) return;
    withSel(function () {
      execCmd("removeFormat");
      var r = T.sel.range();
      var sh = sheet();
      if (!r || !sh) return;
      /* unwrap bare formatting spans (keep classed spans: comments, marks, etc.) */
      var spans = sh.querySelectorAll("span");
      var doomed = [];
      for (var i = 0; i < spans.length; i++) {
        var sp = spans[i];
        if (!sp.className && r.intersectsNode(sp)) doomed.push(sp);
      }
      doomed.forEach(function (sp) {
        var p = sp.parentNode;
        while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
        p.removeChild(sp);
      });
    });
  }, { title: "Clear Formatting", cat: "Home", icon: "i-eraser" });

  /* ================= inline commands ================= */

  T.register("fmt.bold", function () {
    withSel(function () { execCmd("bold"); });
  }, { title: "Bold", cat: "Home", icon: "i-bold" });

  T.register("fmt.italic", function () {
    withSel(function () { execCmd("italic"); });
  }, { title: "Italic", cat: "Home", icon: "i-italic" });

  T.register("fmt.underline", function () {
    withSel(function () { execCmd("underline"); });
  }, { title: "Underline", cat: "Home", icon: "i-underline" });

  T.register("fmt.underlineStyle", function (style) {
    if (!style || !needText()) return;
    withSel(function () {
      wrapSelection("span", { textDecorationLine: "underline", textDecorationStyle: style });
    });
  }, { title: "Underline Style", cat: "Home", icon: "i-underline" });

  T.register("fmt.strike", function () {
    withSel(function () { execCmd("strikeThrough"); });
  }, { title: "Strikethrough", cat: "Home", icon: "i-strike" });

  T.register("fmt.sub", function () {
    withSel(function () { execCmd("subscript"); });
  }, { title: "Subscript", cat: "Home", icon: "i-minus" });

  T.register("fmt.sup", function () {
    withSel(function () { execCmd("superscript"); });
  }, { title: "Superscript", cat: "Home", icon: "i-plus" });

  T.register("fmt.textColor", function (color) {
    if (!color || !needText()) return;
    withSel(function () { wrapSelection("span", { color: color }); });
  }, { title: "Text Color", cat: "Home", icon: "i-swatch" });

  T.register("fmt.highlight", function (color) {
    if (!color || !needText()) return;
    withSel(function () { wrapSelection("span", { backgroundColor: color }); });
  }, { title: "Highlight", cat: "Home", icon: "i-highlighter" });

  T.register("fmt.shadow", function () {
    if (!needText()) return;
    var el = anchorEl();
    var has = false;
    if (el) {
      try { has = window.getComputedStyle(el).textShadow !== "none"; } catch (e) { has = false; }
    }
    withSel(function () {
      wrapSelection("span", { textShadow: has ? "none" : "1px 1px 3px rgba(15,23,42,.45)" });
    });
  }, { title: "Text Shadow", cat: "Home", icon: "i-shadow" });

  /* ================= paragraph commands ================= */

  T.register("para.bullets", function () {
    withSel(function () { execCmd("insertUnorderedList"); });
  }, { title: "Bullets", cat: "Home", icon: "i-bullets" });

  T.register("para.numbered", function () {
    withSel(function () { execCmd("insertOrderedList"); });
  }, { title: "Numbering", cat: "Home", icon: "i-numbering" });

  function ensureCheck(li) {
    var cb = li.querySelector("input.task-check");
    if (!cb) {
      cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "task-check";
      cb.setAttribute("tabindex", "-1");
      cb.setAttribute("aria-label", "Task checkbox");
      cb.style.marginRight = "8px";
      cb.style.cursor = "pointer";
      li.insertBefore(cb, li.firstChild);
    }
    cb.checked = li.classList.contains("done");
  }

  function unwrapTaskList(ul) {
    var frag = document.createDocumentFragment();
    var kids = Array.prototype.slice.call(ul.children);
    kids.forEach(function (li) {
      var cb = li.querySelector("input.task-check");
      if (cb) cb.remove();
      var p = document.createElement("p");
      p.innerHTML = li.innerHTML || "<br>";
      copyBid(li, p);
      frag.appendChild(p);
    });
    ul.parentNode.replaceChild(frag, ul);
  }

  function toggleChecklist() {
    withSel(function () {
      var sh = sheet();
      var blocks = blocksInSelection();
      if (!blocks.length || !sh) { T.toast("Place the cursor in a paragraph first", "error"); return; }
      var uls = [], paras = [];
      blocks.forEach(function (b) {
        if (b.tagName === "LI") {
          var u = b.parentNode;
          if (u && uls.indexOf(u) < 0) uls.push(u);
        } else {
          var inner = b.querySelectorAll("ul,ol");
          if (inner.length) {
            for (var i = 0; i < inner.length; i++) {
              if (uls.indexOf(inner[i]) < 0) uls.push(inner[i]);
            }
          } else if (paras.indexOf(b) < 0) {
            paras.push(b);
          }
        }
      });
      uls.forEach(function (ul) {
        if (ul.classList.contains("task-list")) {
          unwrapTaskList(ul);
        } else {
          ul.classList.add("task-list");
          Array.prototype.forEach.call(ul.children, ensureCheck);
        }
      });
      paras.forEach(function (p) {
        var ul = document.createElement("ul");
        ul.className = "task-list";
        var li = document.createElement("li");
        li.innerHTML = p.innerHTML || "<br>";
        copyBid(p, li);
        ul.appendChild(li);
        ensureCheck(li);
        p.parentNode.replaceChild(ul, p);
      });
      T.editor.ensureBlockIds(sh);
    });
  }

  T.register("para.checklist", function () { toggleChecklist(); },
    { title: "Checklist", cat: "Home", icon: "i-checklist" });

  /* checkbox clicks inside the sheet toggle the task state */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains("task-check")) return;
    var sh = sheet();
    if (!sh || !sh.contains(t)) return;
    e.preventDefault();
    t.checked = !t.checked;
    var li = t.closest ? t.closest("li") : null;
    if (li) li.classList.toggle("done", t.checked);
    T.editor.markDirty();
  });

  T.register("para.outdent", function () {
    withSel(function () { execCmd("outdent"); });
  }, { title: "Decrease Indent", cat: "Home", icon: "i-outdent" });

  T.register("para.indent", function () {
    withSel(function () { execCmd("indent"); });
  }, { title: "Increase Indent", cat: "Home", icon: "i-indent" });

  T.register("para.lineSpacing", function (v) {
    if (v == null) return;
    withSel(function () { applyBlockStyle({ lineHeight: String(v) }); });
  }, { title: "Line Spacing", cat: "Home", icon: "i-spacing" });

  T.register("para.spaceAfter", function (on) {
    withSel(function () { applyBlockStyle({ marginBottom: on ? "12px" : "" }); });
  }, { title: "Space After Paragraph", cat: "Home", icon: "i-spacing" });

  T.register("para.alignLeft", function () {
    withSel(function () { execCmd("justifyLeft"); });
  }, { title: "Align Left", cat: "Home", icon: "i-align-l" });

  T.register("para.alignCenter", function () {
    withSel(function () { execCmd("justifyCenter"); });
  }, { title: "Center", cat: "Home", icon: "i-align-c" });

  T.register("para.alignRight", function () {
    withSel(function () { execCmd("justifyRight"); });
  }, { title: "Align Right", cat: "Home", icon: "i-align-r" });

  T.register("para.alignJustify", function () {
    withSel(function () { execCmd("justifyFull"); });
  }, { title: "Justify", cat: "Home", icon: "i-align-j" });

  T.register("para.shading", function () {
    T.modal({
      title: "Paragraph shading",
      sub: "Pick a background color for the current paragraph.",
      fields: [{ key: "color", label: "Shading color", type: "color", value: "#FEF3C7" }],
      okText: "Apply"
    }).then(function (vals) {
      if (!vals || !vals.color) return;
      withSel(function () { applyBlockStyle({ backgroundColor: vals.color }); });
    });
  }, { title: "Shading", cat: "Home", icon: "i-shading" });

  T.register("para.border", function (mode) {
    withSel(function () {
      var blocks = blocksInSelection();
      if (!blocks.length) { T.toast("Place the cursor in a paragraph first", "error"); return; }
      blocks.forEach(function (b) {
        b.style.border = "";
        b.style.borderTop = "";
        b.style.borderRight = "";
        b.style.borderBottom = "";
        b.style.borderLeft = "";
        var c = "1px solid #9CA3AF";
        if (mode === "bottom") b.style.borderBottom = c;
        else if (mode === "top") b.style.borderTop = c;
        else if (mode === "box") b.style.border = c;
      });
    });
  }, { title: "Borders", cat: "Home", icon: "i-border" });

  /* ================= style commands ================= */

  function applyStyle(name) {
    var def = STYLE_MAP[name];
    if (!def) return;
    withSel(function () {
      var sh = sheet();
      var blocks = blocksInSelection();
      if (!blocks.length || !sh) { T.toast("Place the cursor in a paragraph first", "error"); return; }
      blocks.forEach(function (b) {
        if (b.tagName === "LI") return;
        var el = document.createElement(def.tag);
        el.innerHTML = b.innerHTML || "<br>";
        if (def.cls) el.className = def.cls;
        copyBid(b, el);
        if (def.style) {
          for (var k in def.style) el.style[k] = def.style[k];
        }
        b.parentNode.replaceChild(el, b);
      });
      T.editor.ensureBlockIds(sh);
    });
  }

  var STYLE_ICONS = {
    normal: "i-file", noSpacing: "i-spacing", title: "i-case", subtitle: "i-case",
    h1: "i-case", h2: "i-case", h3: "i-case",
    blockquote: "i-quote", intenseQuote: "i-quote", codeBlock: "i-code", callout: "i-callout"
  };
  var STYLE_TITLES = {
    normal: "Normal", noSpacing: "No Spacing", title: "Title", subtitle: "Subtitle",
    h1: "Heading 1", h2: "Heading 2", h3: "Heading 3",
    blockquote: "Blockquote", intenseQuote: "Intense Quote", codeBlock: "Code Block", callout: "Callout Box"
  };
  Object.keys(STYLE_MAP).forEach(function (key) {
    (function (k) {
      T.register("style." + k, function () { applyStyle(k); },
        { title: STYLE_TITLES[k], cat: "Home", icon: STYLE_ICONS[k] || "i-file" });
    })(key);
  });

  /* ================= swatch popups ================= */

  function swatchHtml(kind, colors) {
    var cells = colors.map(function (c) {
      return '<button type="button" class="sw-pick" data-kind="' + kind + '" data-color="' + c + '"' +
        ' title="' + c + '" aria-label="Color ' + c + '"' +
        ' style="width:26px;height:26px;border-radius:7px;border:1px solid rgba(120,120,120,.35);' +
        'background:' + c + ';cursor:pointer;padding:0"></button>';
    }).join("");
    return '<div><div style="display:grid;grid-template-columns:repeat(6,26px);gap:5px;padding:8px;">' +
      cells + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-top:1px solid var(--line);' +
      'font-size:12px;color:var(--muted);"><span>Custom</span>' +
      '<input type="color" class="sw-custom" data-kind="' + kind + '" value="' +
      (kind === "hl" ? "#FFFF00" : "#2563EB") + '"' +
      ' style="width:34px;height:26px;border:1px solid var(--line);border-radius:6px;background:none;' +
      'cursor:pointer;padding:0"></div></div>';
  }

  /* delegated: swatch buttons rendered inside ribbon menus */
  document.addEventListener("click", function (e) {
    var el = (e.target && e.target.closest) ? e.target.closest(".sw-pick") : null;
    if (!el) return;
    var kind = el.getAttribute("data-kind");
    var color = el.getAttribute("data-color");
    if (kind === "hl") T.cmd("fmt.highlight", color);
    else T.cmd("fmt.textColor", color);
    if (T.ribbon.closeMenu) T.ribbon.closeMenu();
  });

  document.addEventListener("change", function (e) {
    var el = (e.target && e.target.closest) ? e.target.closest(".sw-custom") : null;
    if (!el) return;
    var kind = el.getAttribute("data-kind");
    if (kind === "hl") T.cmd("fmt.highlight", el.value);
    else T.cmd("fmt.textColor", el.value);
    if (T.ribbon.closeMenu) T.ribbon.closeMenu();
  });

  /* ================= ribbon build ================= */

  T.ribbon.addTab({ id: "home", label: "Home", keytip: "H" });

  function rowWrap(body) {
    var d = document.createElement("div");
    d.className = "rrow";
    body.appendChild(d);
    return d;
  }

  /* text-glyph button (grow/shrink, sub/sup) using existing .rbtn styles */
  function glyphBtn(row, glyph, title, cmdName) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rbtn sm";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = '<span style="font-size:14px;font-weight:700;line-height:1">' + T.esc(glyph) + "</span>";
    b.addEventListener("click", function () { T.cmd(cmdName); });
    row.appendChild(b);
    return b;
  }

  /* ----- Clipboard ----- */
  var gClip = T.ribbon.group("home", "Clipboard");
  gClip.appendChild(T.ribbon.split({
    icon: "i-paste", label: "Paste", title: "Paste (Ctrl+V)", cmd: "clip.paste", keytip: "V",
    items: [{
      label: "Paste plain text",
      active: !!T.state.prefs.pastePlain,
      fn: function () {
        T.state.prefs.pastePlain = !T.state.prefs.pastePlain;
        T.savePrefs();
        T.toast(T.state.prefs.pastePlain ? "Plain text paste on" : "Plain text paste off");
      }
    }]
  }));
  gClip.appendChild(T.ribbon.btn({ icon: "i-cut", label: "Cut", title: "Cut (Ctrl+X)", cmd: "clip.cut", keytip: "X" }));
  gClip.appendChild(T.ribbon.btn({ icon: "i-copy", label: "Copy", title: "Copy (Ctrl+C)", cmd: "clip.copy", keytip: "C" }));
  gClip.appendChild(T.ribbon.btn({
    icon: "i-painter", label: "Painter", title: "Format painter", cmd: "clip.painter",
    toggle: true, keytip: "P"
  }));

  /* ----- Typography ----- */
  var gType = T.ribbon.group("home", "Typography");
  var tRow1 = rowWrap(gType);
  var tRow2 = rowWrap(gType);

  var fontSel = T.ribbon.select({
    options: T.fonts.all.map(function (f) { return { v: f.stack, t: f.name }; }),
    value: T.fonts.stackFor("Inter"),
    cls: "w-font",
    title: "Font",
    onChange: function () { T.cmd("fmt.fontFamily", fontSel.value); }
  });
  tRow1.appendChild(fontSel);

  var sizeSel = T.ribbon.select({
    options: FONT_SIZES.map(function (pt) { return { v: String(pt), t: pt + " pt" }; }),
    value: "12",
    cls: "w-size",
    title: "Font size",
    onChange: function () { T.cmd("fmt.fontSize", sizeSel.value); }
  });
  tRow1.appendChild(sizeSel);

  glyphBtn(tRow1, "A↑", "Grow font", "fmt.fontGrow");
  glyphBtn(tRow1, "A↓", "Shrink font", "fmt.fontShrink");

  tRow2.appendChild(T.ribbon.menuBtn({
    icon: "i-spacing", label: "Spacing", title: "Letter spacing",
    items: LETTER_SPACING.map(function (p) {
      return { label: p[1], fn: function () { T.cmd("fmt.letterSpacing", p[0]); } };
    })
  }));
  tRow2.appendChild(T.ribbon.menuBtn({
    icon: "i-case", label: "Case", title: "Change case",
    items: CASES.map(function (c) {
      return { label: c[1], fn: function () { T.cmd("fmt.case", c[0]); } };
    })
  }));
  tRow2.appendChild(T.ribbon.btn({
    icon: "i-eraser", label: "Clear", title: "Clear formatting",
    cmd: "fmt.clear", small: true
  }));

  /* ----- Inline ----- */
  var gIn = T.ribbon.group("home", "Inline");
  var iRow1 = rowWrap(gIn);
  var iRow2 = rowWrap(gIn);

  iRow1.appendChild(T.ribbon.btn({
    icon: "i-bold", label: "Bold", title: "Bold (Ctrl+B)", cmd: "fmt.bold",
    toggle: true, keytip: "B", small: true
  }));
  iRow1.appendChild(T.ribbon.btn({
    icon: "i-italic", label: "Italic", title: "Italic (Ctrl+I)", cmd: "fmt.italic",
    toggle: true, keytip: "I", small: true
  }));
  iRow1.appendChild(T.ribbon.split({
    icon: "i-underline", label: "Underline", title: "Underline (Ctrl+U)",
    cmd: "fmt.underline", keytip: "U",
    items: UNDERLINES.map(function (u) {
      return { label: u[1], fn: function () { T.cmd("fmt.underlineStyle", u[0]); } };
    })
  }));
  iRow1.appendChild(T.ribbon.btn({
    icon: "i-strike", label: "Strike", title: "Strikethrough", cmd: "fmt.strike",
    toggle: true, small: true
  }));
  glyphBtn(iRow1, "X₂", "Subscript", "fmt.sub");
  glyphBtn(iRow1, "X²", "Superscript", "fmt.sup");

  iRow2.appendChild(T.ribbon.menuBtn({
    icon: "i-swatch", label: "Text color", title: "Text color",
    items: [{ html: swatchHtml("text", TEXT_COLORS) }]
  }));
  iRow2.appendChild(T.ribbon.menuBtn({
    icon: "i-highlighter", label: "Highlight", title: "Highlight",
    items: [
      { label: "No highlight", fn: function () { T.cmd("fmt.highlight", "transparent"); } },
      { sep: true },
      { html: swatchHtml("hl", HIGHLIGHTS) }
    ]
  }));
  iRow2.appendChild(T.ribbon.btn({
    icon: "i-shadow", label: "Shadow", title: "Text shadow", cmd: "fmt.shadow",
    toggle: true, small: true
  }));

  /* ----- Paragraph ----- */
  var gPara = T.ribbon.group("home", "Paragraph");
  var pRow1 = rowWrap(gPara);
  var pRow2 = rowWrap(gPara);

  pRow1.appendChild(T.ribbon.btn({
    icon: "i-bullets", label: "Bullets", title: "Bulleted list", cmd: "para.bullets",
    toggle: true, keytip: "L", small: true
  }));
  pRow1.appendChild(T.ribbon.btn({
    icon: "i-numbering", label: "Numbering", title: "Numbered list", cmd: "para.numbered",
    toggle: true, keytip: "N", small: true
  }));
  pRow1.appendChild(T.ribbon.btn({
    icon: "i-checklist", label: "Tasks", title: "Checklist", cmd: "para.checklist",
    toggle: true, small: true
  }));
  pRow1.appendChild(T.ribbon.btn({
    icon: "i-outdent", label: "Outdent", title: "Decrease indent",
    cmd: "para.outdent", small: true
  }));
  pRow1.appendChild(T.ribbon.btn({
    icon: "i-indent", label: "Indent", title: "Increase indent",
    cmd: "para.indent", small: true
  }));

  var lineItems = LINE_HEIGHTS.map(function (h) {
    return { label: h, fn: function () { T.cmd("para.lineSpacing", h); } };
  });
  lineItems.push({ sep: true });
  lineItems.push({ label: "Add space after paragraph", fn: function () { T.cmd("para.spaceAfter", true); } });
  lineItems.push({ label: "Remove space after paragraph", fn: function () { T.cmd("para.spaceAfter", false); } });
  pRow2.appendChild(T.ribbon.menuBtn({
    icon: "i-spacing", label: "Line", title: "Line spacing", items: lineItems
  }));
  pRow2.appendChild(T.ribbon.btn({
    icon: "i-align-l", label: "Left", title: "Align left",
    cmd: "para.alignLeft", small: true
  }));
  pRow2.appendChild(T.ribbon.btn({
    icon: "i-align-c", label: "Center", title: "Center",
    cmd: "para.alignCenter", small: true
  }));
  pRow2.appendChild(T.ribbon.btn({
    icon: "i-align-r", label: "Right", title: "Align right",
    cmd: "para.alignRight", small: true
  }));
  pRow2.appendChild(T.ribbon.btn({
    icon: "i-align-j", label: "Justify", title: "Justify",
    cmd: "para.alignJustify", small: true
  }));
  pRow2.appendChild(T.ribbon.btn({
    icon: "i-shading", label: "Shading", title: "Paragraph shading",
    cmd: "para.shading", small: true
  }));
  pRow2.appendChild(T.ribbon.menuBtn({
    icon: "i-border", label: "Border", title: "Paragraph border",
    items: BORDERS.map(function (bd) {
      return { label: bd[1], fn: function () { T.cmd("para.border", bd[0]); } };
    })
  }));

  /* ----- Styles ----- */
  var gStyles = T.ribbon.group("home", "Styles");
  var pills = document.createElement("div");
  pills.className = "style-pills";
  STYLE_DEFS.forEach(function (d) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "style-pill";
    b.textContent = d[1];
    b.title = d[1];
    b.addEventListener("click", function () { T.cmd(d[0]); });
    pills.appendChild(b);
  });
  gStyles.appendChild(pills);

  /* ================= selection reflection ================= */

  function syncFontUI() {
    if (!fontSel || !sizeSel) return;
    var el = anchorEl();
    if (!el) return;
    var cs;
    try { cs = window.getComputedStyle(el); } catch (e) { return; }
    var fam = (cs.fontFamily || "").toLowerCase();
    var first = fam.split(",")[0].replace(/["']/g, "").trim();
    var best = null;
    var i;
    for (i = 0; i < T.fonts.all.length; i++) {
      if (T.fonts.all[i].name.toLowerCase() === first) { best = T.fonts.all[i]; break; }
    }
    if (!best) {
      var bestLen = 0;
      for (i = 0; i < T.fonts.all.length; i++) {
        var nm = T.fonts.all[i].name.toLowerCase();
        if (nm.length > bestLen && fam.indexOf(nm) !== -1) { best = T.fonts.all[i]; bestLen = nm.length; }
      }
    }
    if (best && fontSel.value !== best.stack) fontSel.value = best.stack;
    var px = parseFloat(cs.fontSize);
    if (px) {
      var pt = px * 72 / 96;
      var near = FONT_SIZES[0];
      var nd = Math.abs(FONT_SIZES[0] - pt);
      for (var j = 1; j < FONT_SIZES.length; j++) {
        var d = Math.abs(FONT_SIZES[j] - pt);
        if (d < nd) { nd = d; near = FONT_SIZES[j]; }
      }
      if (sizeSel.value !== String(near)) sizeSel.value = String(near);
    }
  }
  T.bus.on("sel:change", syncFontUI);

})();
