/* TXT homescreen (start view): brand header, live search, template gallery,
   recent documents, and local file import. Hides automatically on doc:open.
   Exposes T.homescreen = { show, hide, isVisible }. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  var root = null, searchEl = null, tplGrid = null, tplEmpty = null;
  var recList = null, recEmpty = null, fileInput = null;
  var visible = false;
  var lastTpls = [], lastRecs = [];

  function esc(s) { return T.esc(String(s == null ? "" : s)); }
  function icon(id) { return T.icon(id, ""); }

  /* ---------------- DOM ---------------- */
  function build() {
    root = $("#homescreen");
    if (!root) {
      root = document.createElement("div");
      root.id = "homescreen";
      var host = $("#view-word");
      if (host) host.appendChild(root);
      else document.body.appendChild(root);
    }
    root.className = "hs-wrap hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Start screen");
    root.innerHTML =
      '<div class="hs-inner">' +
        '<div class="hs-head">' +
          '<div class="hs-brand"><span class="hs-logo" aria-hidden="true">T</span>' +
            "<div><h1>TXT</h1><p>Flagship word processor</p></div></div>" +
          '<div class="hs-head-meta" id="hsDocCount"></div>' +
        "</div>" +
        '<div class="hs-search">' + icon("i-search") +
          '<input id="hsSearch" type="search" placeholder="Search templates and documents..." aria-label="Search templates and documents" autocomplete="off">' +
        "</div>" +
        '<section class="hs-sec" aria-label="New document">' +
          '<h2 class="hs-sec-title">New</h2>' +
          '<div class="hs-tpl-grid" id="hsTplGrid"></div>' +
          '<p class="hs-empty hidden" id="hsTplEmpty">No templates match your search.</p>' +
        "</section>" +
        '<section class="hs-sec" aria-label="Recent documents">' +
          '<h2 class="hs-sec-title">Recent</h2>' +
          '<div class="hs-rec-list" id="hsRecList"></div>' +
          '<p class="hs-empty hidden" id="hsRecEmpty">No recent documents yet. Start from a template above.</p>' +
        "</section>" +
        '<section class="hs-sec" aria-label="Open a file">' +
          '<h2 class="hs-sec-title">Open</h2>' +
          '<div class="hs-open-row">' +
            '<button type="button" class="btn" id="hsOpenFile">' + icon("i-file") + "<span>Open local file</span></button>" +
            '<p class="hs-open-note">Opens a .txt, .md or .html file as a new document.</p>' +
          "</div>" +
          '<input type="file" id="hsFileInput" accept=".txt,.md,.html" hidden>' +
        "</section>" +
      "</div>";

    var host = $("#view-word");
    if (host) host.appendChild(root);
    else document.body.appendChild(root);

    searchEl = $("#hsSearch", root);
    tplGrid = $("#hsTplGrid", root);
    tplEmpty = $("#hsTplEmpty", root);
    recList = $("#hsRecList", root);
    recEmpty = $("#hsRecEmpty", root);
    fileInput = $("#hsFileInput", root);

    searchEl.addEventListener("input", function () { render(searchEl.value); });
    searchEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); openFirst(); }
      else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        searchEl.value = "";
        render("");
      }
    });

    $("#hsOpenFile", root).addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (f && T.backstage && T.backstage.openLocal) T.backstage.openLocal(f);
      fileInput.value = "";
    });

    var hb = $("#homeBtn");
    if (hb) hb.addEventListener("click", function () { show(); });
  }

  /* ---------------- render ---------------- */
  function wordsLabel(m) {
    var w = m.words || 0;
    return w + (w === 1 ? " word" : " words");
  }

  function renderTemplates(q) {
    var all = (T.templates && T.templates.all) || [];
    q = (q || "").trim().toLowerCase();
    lastTpls = all.filter(function (tpl) {
      if (!q) return true;
      return (tpl.name + " " + (tpl.desc || "")).toLowerCase().indexOf(q) >= 0;
    });
    tplGrid.innerHTML = "";
    lastTpls.forEach(function (tpl) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "hs-tpl-card";
      card.innerHTML =
        '<span class="hs-tpl-ico">' + icon(tpl.icon || "i-page") + "</span>" +
        '<h3 class="hs-tpl-name">' + esc(tpl.name) + "</h3>" +
        '<p class="hs-tpl-desc">' + esc(tpl.desc || "") + "</p>";
      card.addEventListener("click", function () {
        T.editor.newDoc(tpl.name, tpl.html);
        T.toast("New document created");
      });
      tplGrid.appendChild(card);
    });
    tplEmpty.classList.toggle("hidden", lastTpls.length > 0);
  }

  function renderRecents(q) {
    var docs = T.state.docs || [];
    q = (q || "").trim().toLowerCase();
    lastRecs = docs.filter(function (m) {
      if (!q) return true;
      return String(m.title || "").toLowerCase().indexOf(q) >= 0;
    });
    recList.innerHTML = "";
    lastRecs.forEach(function (m) {
      var row = document.createElement("div");
      row.className = "hs-rec-row";
      row.innerHTML =
        '<span class="hs-rec-ico">' + icon("i-page") + "</span>" +
        '<div class="hs-rec-info"><h3 class="hs-rec-title">' + esc(m.title || T.t("untitled")) + "</h3>" +
        '<p class="hs-rec-meta">' + esc(T.relTime(m.updatedAt || Date.now())) + " · " + esc(wordsLabel(m)) + "</p></div>" +
        '<div class="hs-rec-actions">' +
          '<button type="button" class="btn hs-open">Open</button>' +
          '<button type="button" class="icon-btn hs-del" title="Delete document" aria-label="Delete document">' + icon("i-trash") + "</button>" +
        "</div>";
      row.querySelector(".hs-open").addEventListener("click", function () {
        T.editor.openDoc(m.id);
      });
      row.querySelector(".hs-del").addEventListener("click", function () {
        deleteDoc(m);
      });
      recList.appendChild(row);
    });
    var showEmpty = lastRecs.length === 0;
    recEmpty.classList.toggle("hidden", !showEmpty);
    recList.classList.toggle("hidden", showEmpty);
    recEmpty.textContent = q
      ? "No documents match your search."
      : "No recent documents yet. Start from a template above.";
  }

  function render(q) {
    renderTemplates(q);
    renderRecents(q);
    var n = (T.state.docs || []).length;
    var dc = $("#hsDocCount", root);
    if (dc) dc.textContent = n === 1 ? "1 document" : n + " documents";
  }

  function openFirst() {
    if (lastTpls.length) {
      var tpl = lastTpls[0];
      T.editor.newDoc(tpl.name, tpl.html);
      T.toast("New document created");
    } else if (lastRecs.length) {
      T.editor.openDoc(lastRecs[0].id);
    }
  }

  function deleteDoc(m) {
    T.modal({
      title: T.t("confirmTitle"),
      sub: T.t("deleteDoc"),
      okText: T.t("del")
    }).then(function (r) {
      if (!r) return;
      T.state.docs = (T.state.docs || []).filter(function (d) { return d.id !== m.id; });
      T.lsSet("txt:docs", T.state.docs);
      try {
        localStorage.removeItem("txt:doc:" + m.id);
        localStorage.removeItem(T.histKey(m.id));
      } catch (e) {}
      if (T.state.currentId === m.id && visible) {
        T.editor.newDoc(T.t("untitled"), "");
        show();
      }
      render(searchEl ? searchEl.value : "");
      T.toast(T.t("del") + ": " + (m.title || T.t("untitled")));
    });
  }

  /* ---------------- public ---------------- */
  function show() {
    if (!root) build();
    render(searchEl ? searchEl.value : "");
    root.classList.remove("hidden");
    visible = true;
    try {
      if (searchEl && window.matchMedia && window.matchMedia("(pointer:fine)").matches) {
        searchEl.focus();
      }
    } catch (e) {}
  }

  function hide() {
    visible = false;
    if (root) root.classList.add("hidden");
  }

  function isVisible() { return visible; }

  build();
  T.bus.on("doc:open", function () { hide(); });
  T.bus.on("overlay:escape", function () { if (visible && searchEl && searchEl.value) { searchEl.value = ""; render(""); } });

  T.homescreen = { show: show, hide: hide, isVisible: isVisible };
  T.register("home.show", show, {
    title: "Go to start screen",
    cat: "Document",
    icon: "i-home"
  });
})();
