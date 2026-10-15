/* TXT floating selection toolbar + slash command menu.
   Owns #floatBar and #slashMenu inside #stage. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;
  var bus = T.bus;

  var HIGHLIGHT_YELLOW = "#FFFF00";

  function hasCmd(name) {
    var list = T.listCommands(), i;
    for (i = 0; i < list.length; i++) { if (list[i].name === name) return true; }
    return false;
  }

  /* ================= #floatBar ================= */
  var bar = $("#floatBar");

  function barBtn(iconId, title, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = T.icon(iconId);
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
    b.addEventListener("click", function (e) {
      e.preventDefault();
      fn();
    });
    return b;
  }
  function barSep() {
    var s = document.createElement("span");
    s.className = "sep";
    return s;
  }

  function cycleHeading() {
    var b = T.sel.block();
    var tag = b ? b.tagName : "P";
    if (tag === "H1") { T.cmd("style.h2"); }
    else if (tag === "H2") { T.cmd("style.h3"); }
    else if (tag === "H3") {
      if (hasCmd("style.body")) { T.cmd("style.body"); }
      else { document.execCommand("formatBlock", false, "<p>"); }
    }
    else { T.cmd("style.h1"); }
    T.editor.markDirty();
  }

  var btnBold, btnItalic;
  function buildBar() {
    if (!bar || bar.getAttribute("data-built")) return;
    btnBold = barBtn("i-bold", "Bold", function () { T.cmd("fmt.bold"); });
    btnItalic = barBtn("i-italic", "Italic", function () { T.cmd("fmt.italic"); });
    var btnHi = barBtn("i-highlighter", "Highlight", function () { T.cmd("fmt.highlight", HIGHLIGHT_YELLOW); });
    var btnHead = barBtn("i-case", "Cycle heading style (P, H1, H2, H3)", cycleHeading);
    var btnCmt = barBtn("i-comment", "Add comment", function () { if (T.comments) T.comments.add(); });
    var btnAi = barBtn("i-ai", "Ask AI", function () { if (T.ai) T.ai.openPanel(T.sel.text()); });
    bar.appendChild(btnBold);
    bar.appendChild(btnItalic);
    bar.appendChild(btnHi);
    bar.appendChild(barSep());
    bar.appendChild(btnHead);
    bar.appendChild(barSep());
    bar.appendChild(btnCmt);
    bar.appendChild(btnAi);
    bar.setAttribute("data-built", "1");
  }

  function hideBar() { if (bar) bar.classList.add("hidden"); }

  function showBar() {
    if (!bar) return;
    var r = T.sel.range();
    if (!r || !r.getBoundingClientRect) { hideBar(); return; }
    var rect;
    try { rect = r.getBoundingClientRect(); } catch (e) { hideBar(); return; }
    if (!rect || (rect.width === 0 && rect.height === 0)) { hideBar(); return; }
    var stage = $("#stage");
    if (!stage) { hideBar(); return; }
    var sr = stage.getBoundingClientRect();
    var top = rect.top - sr.top - 48;
    if (top < 8) top = rect.bottom - sr.top + 10;
    var left = T.clamp(rect.left - sr.left, 8, Math.max(8, sr.width - 300));
    try {
      btnBold.classList.toggle("active", !!document.queryCommandState("bold"));
      btnItalic.classList.toggle("active", !!document.queryCommandState("italic"));
    } catch (e) {}
    bar.style.top = top + "px";
    bar.style.left = left + "px";
    bar.classList.remove("hidden");
  }

  var onSelBar = T.debounce(function () {
    if (slashOpen) { hideBar(); return; }
    if (T.sel.collapsed()) { hideBar(); return; }
    var sheet = T.sel.sheet(), r = T.sel.range();
    if (!sheet || !r) { hideBar(); return; }
    var node = r.commonAncestorContainer;
    if (node !== sheet && !sheet.contains(node)) { hideBar(); return; }
    showBar();
  }, 150);
  bus.on("sel:change", onSelBar);
  bus.on("overlay:escape", hideBar);

  var pageScroll = $("#pageScroll");
  if (pageScroll) pageScroll.addEventListener("scroll", hideBar, { passive: true });

  /* ================= #slashMenu ================= */
  var menu = $("#slashMenu");
  var slashOpen = false, slashBlock = null, slashQuery = "";
  var currentItems = [], activeIdx = 0;

  var SLASH_ITEMS = [
    { id: "h1", label: "Heading 1", hint: "Large section title", icon: "i-case", cmd: "style.h1" },
    { id: "h2", label: "Heading 2", hint: "Medium section title", icon: "i-case", cmd: "style.h2" },
    { id: "h3", label: "Heading 3", hint: "Small section title", icon: "i-case", cmd: "style.h3" },
    { id: "table", label: "Table", hint: "Insert 3 x 3 table", icon: "i-table", cmd: "table.insert", args: [{ r: 3, c: 3 }] },
    { id: "callout", label: "Callout", hint: "Highlighted info box", icon: "i-callout", cmd: "insert.callout", args: ["info"] },
    { id: "checklist", label: "Checklist", hint: "Task list with checkboxes", icon: "i-checklist", cmd: "para.checklist" },
    { id: "divider", label: "Divider", hint: "Horizontal rule", icon: "i-hr", cmd: "insert.hr" },
    { id: "code", label: "Code Block", hint: "Monospace code block", icon: "i-code", cmd: "style.codeBlock" },
    { id: "date", label: "Date pill", hint: "Insert the current date", icon: "i-calendar", cmd: "hf.dateTime" }
  ];

  function filteredItems() {
    var q = slashQuery.toLowerCase();
    return SLASH_ITEMS.filter(function (it) {
      return !q || it.label.toLowerCase().indexOf(q) >= 0 || it.id.indexOf(q) >= 0;
    });
  }

  function setActive(i) {
    if (!currentItems.length) return;
    activeIdx = (i + currentItems.length) % currentItems.length;
    $$(".slash-item", menu).forEach(function (el, k) {
      el.classList.toggle("active", k === activeIdx);
    });
    var act = $$(".slash-item", menu)[activeIdx];
    if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
  }

  function renderSlashItems() {
    if (!menu) return;
    currentItems = filteredItems();
    activeIdx = 0;
    menu.innerHTML = "";
    if (!currentItems.length) {
      var none = document.createElement("div");
      none.className = "slash-item";
      none.style.cursor = "default";
      none.textContent = T.t("noMatches");
      menu.appendChild(none);
      return;
    }
    currentItems.forEach(function (it, k) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "slash-item" + (k === 0 ? " active" : "");
      b.setAttribute("role", "menuitem");
      var ic = document.createElement("span");
      ic.innerHTML = T.icon(it.icon);
      var tx = document.createElement("span");
      var t1 = document.createElement("div");
      t1.className = "t";
      t1.textContent = it.label;
      var t2 = document.createElement("div");
      t2.className = "d";
      t2.style.cssText = "font-size:11.5px;color:var(--muted)";
      t2.textContent = it.hint;
      tx.appendChild(t1);
      tx.appendChild(t2);
      b.appendChild(ic);
      b.appendChild(tx);
      b.addEventListener("mousedown", function (e) { e.preventDefault(); runItem(it); });
      menu.appendChild(b);
    });
  }

  function stripSlash(block) {
    if (!block || !block.parentNode) return;
    var tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = tw.nextNode())) {
      var i = n.data.indexOf("/");
      if (i >= 0) {
        n.data = n.data.slice(0, i) + n.data.slice(i + 1);
        break;
      }
    }
  }

  function runItem(it) {
    var block = slashBlock;
    closeSlash();
    var sheet = T.sel.sheet();
    if (sheet) {
      var r = T.sel.range();
      var inside = false;
      if (r) {
        var node = r.commonAncestorContainer;
        inside = (node === sheet || sheet.contains(node));
      }
      if (!inside) T.sel.restore();
    }
    var argv = [it.cmd].concat(it.args || []);
    T.cmd.apply(null, argv);
    stripSlash(block);
    T.editor.markDirty();
  }

  function openSlash(block, query) {
    if (!menu) return;
    slashOpen = true;
    slashBlock = block;
    slashQuery = query || "";
    renderSlashItems();
    var r = T.sel.range();
    var stage = $("#stage");
    if (r && r.getBoundingClientRect && stage) {
      var rect = r.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();
      menu.style.top = (rect.bottom - sr.top + 6) + "px";
      menu.style.left = T.clamp(rect.left - sr.left, 8, Math.max(8, sr.width - 320)) + "px";
    }
    menu.classList.remove("hidden");
    hideBar();
  }

  function closeSlash() {
    if (!slashOpen) return;
    slashOpen = false;
    slashBlock = null;
    currentItems = [];
    activeIdx = 0;
    if (menu) menu.classList.add("hidden");
  }

  bus.on("slash:maybe", function () {
    var sheet = T.sel.sheet();
    var block = T.sel.block();
    if (!sheet || !block || !sheet.contains(block)) return;
    var txt = block.textContent || "";
    if (txt.charAt(0) !== "/") return;
    openSlash(block, txt.slice(1));
  });

  bus.on("doc:change", function () {
    if (!slashOpen || !slashBlock) return;
    var b = T.sel.block();
    if (b !== slashBlock) { closeSlash(); return; }
    var txt = slashBlock.textContent || "";
    if (txt.charAt(0) !== "/") { closeSlash(); return; }
    slashQuery = txt.slice(1);
    renderSlashItems();
  });

  bus.on("sel:change", function () {
    if (!slashOpen) return;
    if (T.sel.block() !== slashBlock) closeSlash();
  });

  document.addEventListener("keydown", function (e) {
    if (!slashOpen) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      var it = currentItems[activeIdx];
      if (it) runItem(it);
    }
    else if (e.key === "Escape") { e.preventDefault(); closeSlash(); }
  });
  bus.on("overlay:escape", closeSlash);

  buildBar();
})();
