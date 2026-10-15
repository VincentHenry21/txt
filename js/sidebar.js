/* TXT sidebar: outline tree, page thumbnails, find and replace. */
(function () {
  "use strict";

  var T = window.TXT;
  if (!T) { return; }
  var $ = T.$, $$ = T.$$;

  /* ---------- helpers ---------- */
  function sheet() {
    try { return T.editor.sheetEl(); } catch (e) { return null; }
  }
  function pages() {
    try { return T.editor.pagesEl(); } catch (e) { return null; }
  }
  function scroller() { return $("#pageScroll"); }
  function pageW() { try { return T.editor.pageW(); } catch (e) { return 816; } }
  function pageH() { try { return T.editor.pageH(); } catch (e) { return 1056; } }

  /* Scroll a node into view inside #pageScroll with a fixed headroom. */
  function scrollNodeIntoView(el, headroom) {
    var scr = scroller();
    if (!scr || !el) { return; }
    var pg = pages();
    var anchor = pg || scr;
    var r = el.getBoundingClientRect();
    var pr = anchor.getBoundingClientRect();
    var top = r.top - pr.top;
    var y = top - (typeof headroom === "number" ? headroom : 80);
    scr.scrollTop = Math.max(0, y);
  }

  function flashEl(el) {
    if (!el) { return; }
    el.classList.add("ol-flash");
    window.setTimeout(function () { el.classList.remove("ol-flash"); }, 700);
  }

  /* ---------- 1. side tabs ---------- */
  var PANES = ["outline", "pages", "find"];

  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function switchPane(name) {
    if (PANES.indexOf(name) === -1) { name = "outline"; }
    $$(".side-tabs button[data-spane]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-spane") === name);
    });
    $$(".side-body .side-pane").forEach(function (p) {
      p.classList.add("hidden");
    });
    var pane = $("#pane" + capFirst(name));
    if (pane) { pane.classList.remove("hidden"); }
    T.state.prefs.sidebarPane = name;
    T.savePrefs();
  }

  function initTabs() {
    $$(".side-tabs button[data-spane]").forEach(function (b) {
      b.addEventListener("click", function () {
        switchPane(b.getAttribute("data-spane"));
      });
    });
    switchPane(T.state.prefs.sidebarPane || "outline");
  }

  /* ---------- collapse ---------- */
  function initCollapse() {
    var sidebar = $("#sidebar");
    var btn = $("#sideCollapse");
    if (!sidebar || !btn) { return; }
    if (T.state.prefs.sidebarOpen === false) { sidebar.classList.add("collapsed"); }
    btn.addEventListener("click", function () {
      sidebar.classList.toggle("collapsed");
      T.state.prefs.sidebarOpen = !sidebar.classList.contains("collapsed");
      T.savePrefs();
    });
  }

  /* ---------- bus: sidebar:find ---------- */
  T.bus.on("sidebar:find", function () {
    var sidebar = $("#sidebar");
    if (sidebar) { sidebar.classList.remove("collapsed"); }
    T.state.prefs.sidebarOpen = true;
    T.savePrefs();
    switchPane("find");
    var ft = $("#findText");
    if (ft) { ft.focus(); ft.select(); }
  });

  /* ---------- 3. outline ---------- */
  function outlineHeadings() {
    var sh = sheet();
    if (!sh) { return []; }
    return $$("H1,H2,H3,H4", sh);
  }

  function rebuildOutline() {
    var tree = $("#outlineTree");
    var filterInput = $("#outlineSearch");
    if (!tree) { return; }
    var filter = filterInput ? filterInput.value.trim().toLowerCase() : "";
    tree.innerHTML = "";
    var headings = outlineHeadings();
    var shown = 0;
    headings.forEach(function (h) {
      var text = (h.textContent || "").trim();
      if (!text) { return; }
      if (filter && text.toLowerCase().indexOf(filter) === -1) { return; }
      var tag = (h.tagName || "H1").toUpperCase();
      var lv = tag === "H1" ? 1 : tag === "H2" ? 2 : 3;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ol-item lv" + lv;
      btn.textContent = text;
      btn.title = text;
      btn.addEventListener("click", function () {
        scrollNodeIntoView(h, 80);
        flashEl(h);
      });
      tree.appendChild(btn);
      shown++;
    });
    if (!shown) {
      var empty = document.createElement("div");
      empty.className = "ol-empty";
      empty.textContent = headings.length ? "No headings match" : "No headings yet";
      tree.appendChild(empty);
    }
  }

  var rebuildOutlineDebounced = T.debounce(rebuildOutline, 400);

  function initOutline() {
    var filterInput = $("#outlineSearch");
    if (filterInput) {
      filterInput.addEventListener("input", T.debounce(rebuildOutline, 150));
    }
    T.bus.on("outline:update", rebuildOutline);
    T.bus.on("doc:open", rebuildOutline);
    T.bus.on("doc:change", rebuildOutlineDebounced);
  }

  /* ---------- 4. thumbnails + bookmarks ---------- */
  function rebuildThumbs(count) {
    var list = $("#thumbList");
    if (!list) { return; }
    var sh = sheet();
    if (typeof count !== "number" || count < 1) {
      try { count = T.editor.pageCount(); } catch (e) { count = 1; }
    }
    list.innerHTML = "";

    /* bookmarks section */
    if (sh) {
      var bms = $$("[data-bookmark]", sh).filter(function (el) {
        return el.getAttribute("data-bookmark");
      });
      if (bms.length) {
        var sec = document.createElement("div");
        sec.className = "bm-section";
        var head = document.createElement("div");
        head.className = "bm-head";
        head.textContent = "Bookmarks";
        sec.appendChild(head);
        bms.forEach(function (el) {
          var name = el.getAttribute("data-bookmark");
          var b = document.createElement("button");
          b.type = "button";
          b.className = "bm-item";
          b.innerHTML = T.icon("i-bookmark", "bm-ico") + "<span></span>";
          var label = b.querySelector("span");
          if (label) { label.textContent = name; }
          b.title = name;
          b.addEventListener("click", function () {
            scrollNodeIntoView(el, 80);
            flashEl(el);
          });
          sec.appendChild(b);
        });
        list.appendChild(sec);
      }
    }

    /* page thumbnails */
    var pw = pageW(), ph = pageH();
    var listW = list.clientWidth;
    var thumbWidth = (listW && listW > 40) ? listW - 24 : 200;
    var s = thumbWidth / pw;
    var html = sh ? sh.innerHTML : "";
    var activeIdx = 0;
    try { activeIdx = Math.max(0, T.editor.caretPage() - 1); } catch (e) { /* keep 0 */ }

    for (var i = 0; i < count; i++) {
      (function (idx) {
        var thumb = document.createElement("div");
        thumb.className = "thumb" + (idx === activeIdx ? " active" : "");
        thumb.setAttribute("data-page", String(idx + 1));
        var view = document.createElement("div");
        view.className = "thumb-view";
        view.style.height = Math.round(ph * s) + "px";
        var inner = document.createElement("div");
        inner.className = "thumb-inner";
        inner.style.width = pw + "px";
        inner.style.transform = "scale(" + s + ") translateY(" + (-idx * ph) + "px)";
        inner.innerHTML = html;
        view.appendChild(inner);
        thumb.appendChild(view);
        var num = document.createElement("span");
        num.className = "thumb-num";
        num.textContent = String(idx + 1);
        thumb.appendChild(num);
        thumb.addEventListener("click", function () {
          var scr = scroller();
          if (scr) { scr.scrollTop = idx * ph; }
        });
        list.appendChild(thumb);
      })(i);
    }
  }

  function highlightActiveThumb() {
    var idx = 0;
    try { idx = Math.max(0, T.editor.caretPage() - 1); } catch (e) { /* keep 0 */ }
    $$("#thumbList .thumb").forEach(function (th, i) {
      th.classList.toggle("active", i === idx);
    });
  }

  var rebuildThumbsDebounced = T.debounce(function () { rebuildThumbs(); }, 600);

  function initThumbs() {
    T.bus.on("page:change", function (data) {
      rebuildThumbs(data && data.count);
    });
    T.bus.on("doc:open", function () { rebuildThumbs(); });
    T.bus.on("doc:change", rebuildThumbsDebounced);
    T.bus.on("sel:change", T.debounce(highlightActiveThumb, 150));
  }

  /* ---------- 5. find and replace ---------- */
  var findState = { matches: [], index: -1 };

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findPattern() {
    var ft = $("#findText");
    var q = ft ? ft.value : "";
    if (!q) { return null; }
    var mc = $("#matchCase") ? $("#matchCase").checked : false;
    var ww = $("#wholeWord") ? $("#wholeWord").checked : false;
    var src = escapeRegExp(q);
    if (ww) { src = "\\b" + src + "\\b"; }
    try { return new RegExp(src, mc ? "g" : "gi"); }
    catch (e) { return null; }
  }

  function clearMarks() {
    var sh = sheet();
    if (!sh) { return; }
    var marks = $$("mark.find-hit", sh);
    marks.forEach(function (m) {
      var tn = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(tn, m);
    });
    if (sh.normalize) { sh.normalize(); }
    findState.matches = [];
    findState.index = -1;
  }

  function setCountText() {
    var el = $("#findCount");
    if (!el) { return; }
    var n = findState.matches.length;
    if (!n) { el.textContent = "No matches"; }
    else { el.textContent = (findState.index + 1) + " of " + n + " matches"; }
  }

  function markCurrent() {
    findState.matches.forEach(function (m, i) {
      m.classList.toggle("current", i === findState.index);
    });
  }

  function scanFind() {
    clearMarks();
    var pattern = findPattern();
    var ft = $("#findText");
    var query = ft ? ft.value : "";
    if (!pattern || !query) { setCountText(); return; }
    var sh = sheet();
    if (!sh) { setCountText(); return; }

    var walker = document.createTreeWalker(sh, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue) { return NodeFilter.FILTER_REJECT; }
        var p = node.parentNode;
        if (p && p.nodeType === 1 && p.tagName === "MARK" && p.classList.contains("find-hit")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) { nodes.push(n); }

    var marks = [];
    nodes.forEach(function (tn) {
      pattern.lastIndex = 0;
      var text = tn.nodeValue;
      var hits = [];
      var m;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0].length === 0) { pattern.lastIndex++; continue; }
        hits.push({ start: m.index, end: m.index + m[0].length });
      }
      /* split and wrap from end to start so offsets stay valid */
      for (var i = hits.length - 1; i >= 0; i--) {
        var h = hits[i];
        var after = tn.splitText(h.end);
        var mid = tn.splitText(h.start);
        var mark = document.createElement("mark");
        mark.className = "find-hit";
        mid.parentNode.insertBefore(mark, mid);
        mark.appendChild(mid);
        marks.unshift(mark);
        tn = after;
      }
    });

    findState.matches = marks;
    findState.index = marks.length ? 0 : -1;
    markCurrent();
    setCountText();
    if (marks.length) {
      scrollNodeIntoView(marks[0], 80);
      flashEl(marks[0]);
    }
  }

  var scanFindDebounced = T.debounce(scanFind, 200);

  function gotoMatch(delta) {
    var n = findState.matches.length;
    if (!n) { return; }
    findState.index = ((findState.index + delta) % n + n) % n;
    markCurrent();
    setCountText();
    var el = findState.matches[findState.index];
    if (el) { scrollNodeIntoView(el, 80); }
  }

  function replaceOne() {
    var n = findState.matches.length;
    var idx = findState.index;
    if (!n || idx < 0 || idx >= n) { return; }
    var rep = $("#replaceText");
    var val = rep ? rep.value : "";
    var mark = findState.matches[idx];
    var tn = document.createTextNode(val);
    mark.parentNode.replaceChild(tn, mark);
    if (T.editor.markDirty) { T.editor.markDirty(); }
    scanFind();
    /* restore caret near the replacement */
    findState.index = Math.min(idx, findState.matches.length - 1);
    markCurrent();
    setCountText();
  }

  function replaceAll() {
    var n = findState.matches.length;
    if (!n) { return; }
    var rep = $("#replaceText");
    var val = rep ? rep.value : "";
    findState.matches.forEach(function (mark) {
      var tn = document.createTextNode(val);
      mark.parentNode.replaceChild(tn, mark);
    });
    var sh = sheet();
    if (sh && sh.normalize) { sh.normalize(); }
    findState.matches = [];
    findState.index = -1;
    setCountText();
    if (T.editor.markDirty) { T.editor.markDirty(); }
    T.toast(String(n) + " replaced", "ok");
  }

  function initFind() {
    var ft = $("#findText");
    if (!ft) { return; }

    ft.addEventListener("input", scanFindDebounced);
    ft.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        gotoMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearMarks();
        setCountText();
      }
    });

    var mc = $("#matchCase"), ww = $("#wholeWord");
    if (mc) { mc.addEventListener("change", scanFind); }
    if (ww) { ww.addEventListener("change", scanFind); }

    var prev = $("#findPrev"), next = $("#findNext");
    if (prev) { prev.addEventListener("click", function () { gotoMatch(-1); }); }
    if (next) { next.addEventListener("click", function () { gotoMatch(1); }); }

    var r1 = $("#replaceOne"), ra = $("#replaceAll");
    if (r1) { r1.addEventListener("click", replaceOne); }
    if (ra) { ra.addEventListener("click", replaceAll); }

    var pane = $("#paneFind");
    if (pane) {
      pane.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && document.activeElement !== ft) {
          clearMarks();
          setCountText();
        }
      });
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    initTabs();
    initCollapse();
    initOutline();
    initThumbs();
    initFind();
    rebuildOutline();
    rebuildThumbs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
