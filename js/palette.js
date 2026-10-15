/* TXT command palette: fuzzy search over commands plus document text hits.
 * Bus in: palette:open. Shell ids: cmdPalette / cmdInput / cmdList. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$, esc = T.esc, bus = T.bus;

  var pal = null, input = null, list = null;
  var items = [];   // rendered items: {type:'cmd',name,title,cat,icon,keys} | {type:'hit',label,block}
  var activeIdx = 0;

  function els() {
    pal = pal || document.getElementById("cmdPalette");
    input = input || document.getElementById("cmdInput");
    list = list || document.getElementById("cmdList");
    return !!(pal && input && list);
  }

  /* ---------- text search in the sheet ---------- */
  function docHits(query) {
    var hits = [];
    if (!query || !T.editor || typeof T.editor.sheetEl !== "function") return hits;
    var sheet = T.editor.sheetEl();
    if (!sheet) return hits;
    var q = query.toLowerCase();
    var kids = sheet.children;
    for (var i = 0; i < kids.length && hits.length < 8; i++) {
      var block = kids[i];
      var txt = (block.innerText || "").trim();
      if (!txt) continue;
      if (txt.toLowerCase().indexOf(q) < 0) continue;
      hits.push({ type: "hit", block: block, label: txt.length > 90 ? txt.slice(0, 90) + "..." : txt });
    }
    return hits;
  }

  /* ---------- render ---------- */
  function itemHtml(it) {
    var ic = it.type === "hit" ? "i-file" : (it.icon || "i-file");
    var cat = it.type === "hit" ? "In document" : (it.cat || "General");
    var keys = it.type === "hit" ? "" : (it.keys || "");
    return '<span class="pal-ic">' + T.icon(ic) + "</span>" +
      '<span class="pal-nm">' + esc(it.title || it.label) + "</span>" +
      '<span class="pal-cat">' + esc(cat) + "</span>" +
      (keys ? '<kbd class="pal-keys">' + esc(keys) + "</kbd>" : "");
  }

  function render(query) {
    if (!els()) return;
    var q = (query || "").trim().toLowerCase();
    items = [];
    T.listCommands().forEach(function (c) {
      var hay = ((c.title || "") + " " + (c.name || "") + " " + (c.cat || "") + " " + (c.match || "")).toLowerCase();
      if (!q || hay.indexOf(q) >= 0) {
        items.push({ type: "cmd", name: c.name, title: c.title, cat: c.cat, icon: c.icon, keys: c.keys });
      }
    });
    if (q) docHits(q).forEach(function (h) { items.push(h); });

    if (!items.length) {
      list.innerHTML = '<div class="pal-empty">No results</div>';
      activeIdx = -1;
      return;
    }
    var html = "";
    items.forEach(function (it, i) {
      html += '<button type="button" class="pal-item' + (i === 0 ? " active" : "") + '" data-i="' + i + '" role="option">' + itemHtml(it) + "</button>";
    });
    list.innerHTML = html;
    activeIdx = 0;
  }

  function setActive(i) {
    if (i < 0 || i >= items.length) return;
    activeIdx = i;
    $$(".pal-item", list).forEach(function (el, j) {
      el.classList.toggle("active", j === i);
    });
    var el = list.querySelector('.pal-item[data-i="' + i + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }

  /* ---------- run ---------- */
  function flash(el) {
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("pal-flash");
      var prev = el.style.outline;
      el.style.outline = "2px solid var(--accent, #2563EB)";
      el.style.outlineOffset = "3px";
      setTimeout(function () {
        el.classList.remove("pal-flash");
        el.style.outline = prev;
      }, 1400);
    } catch (e) { /* ignore */ }
  }

  function run(it) {
    if (!it) return;
    if (it.type === "hit") {
      close();
      flash(it.block);
    } else {
      close();
      T.cmd(it.name);
    }
  }

  /* ---------- open / close ---------- */
  function open() {
    if (!els()) return;
    pal.classList.remove("hidden");
    input.value = "";
    render("");
    input.focus();
  }

  function close() {
    if (pal) pal.classList.add("hidden");
  }

  bus.on("palette:open", open);
  bus.on("overlay:escape", close);

  /* ---------- wiring (DOM exists: scripts run at end of body) ---------- */
  function wire() {
    if (!els()) return;
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (items.length) setActive((activeIdx + 1) % items.length);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (items.length) setActive((activeIdx - 1 + items.length) % items.length);
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        run(items[activeIdx]);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    });
    list.addEventListener("mousemove", function (ev) {
      var el = ev.target;
      while (el && el !== list && !el.classList.contains("pal-item")) el = el.parentNode;
      if (el && el !== list) setActive(parseInt(el.getAttribute("data-i"), 10));
    });
    list.addEventListener("click", function (ev) {
      var el = ev.target;
      while (el && el !== list && !el.classList.contains("pal-item")) el = el.parentNode;
      if (el && el !== list) run(items[parseInt(el.getAttribute("data-i"), 10)]);
    });
    pal.addEventListener("mousedown", function (ev) {
      if (ev.target === pal) close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  T.palette = {
    open: open,
    close: close,
    _render: render // exposed for tests
  };
})();
