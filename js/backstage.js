/* TXT backstage (file drawer): New / Open / Export / History / Settings.
   Owns only the #backstage shell zones. Every control is wired to real state. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  var NAV = [
    { id: "new", label: "New", icon: "i-plus" },
    { id: "open", label: "Open", icon: "i-file" },
    { id: "export", label: "Export", icon: "i-export" },
    { id: "history", label: "History", icon: "i-history" },
    { id: "settings", label: "Settings", icon: "i-swatch" }
  ];

  function backEl() { return $("#backstage"); }

  function open(view) {
    var b = backEl();
    if (!b) return;
    view = view || "new";
    b.classList.remove("hidden");
    renderNav(view);
    render(view);
  }

  function close() {
    var b = backEl();
    if (b) b.classList.add("hidden");
  }

  function isOpen() {
    var b = backEl();
    return !!(b && !b.classList.contains("hidden"));
  }

  function renderNav(current) {
    var nav = $("#bsNav");
    if (!nav) return;
    nav.innerHTML = "";
    NAV.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bs-nav-btn" + (item.id === current ? " active" : "");
      btn.setAttribute("data-view", item.id);
      btn.innerHTML = T.icon(item.icon, "tic") + "<span>" + T.esc(item.label) + "</span>";
      btn.addEventListener("click", function () {
        renderNav(item.id);
        render(item.id);
      });
      nav.appendChild(btn);
    });
  }

  function head(main, title, sub) {
    var h = document.createElement("div");
    h.className = "bs-head";
    h.innerHTML = "<h2>" + T.esc(title) + "</h2>" + (sub ? "<p class=\"bs-sub\">" + T.esc(sub) + "</p>" : "");
    main.appendChild(h);
  }

  /* ---------------- view: new ---------------- */
  function renderNew(main) {
    head(main, "New Document", "Start from a template or a blank sheet.");
    var grid = document.createElement("div");
    grid.className = "tpl-cards";
    T.templates.all.forEach(function (tpl) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "tpl-card";
      card.innerHTML = '<span class="tic">' + T.icon(tpl.icon || "i-file") + "</span>" +
        "<h3>" + T.esc(tpl.name) + "</h3><p>" + T.esc(tpl.desc || "") + "</p>";
      card.addEventListener("click", function () {
        T.editor.newDoc(tpl.name, tpl.html);
        close();
        T.toast("New document created");
      });
      grid.appendChild(card);
    });
    main.appendChild(grid);
  }

  /* ---------------- view: open ---------------- */
  function wordsLabel(m) {
    var w = m.words || 0;
    return w + (w === 1 ? " word" : " words");
  }

  function renderOpen(main) {
    head(main, "Open", "Recent documents and local files.");

    var recent = document.createElement("div");
    recent.className = "bs-sec";
    recent.innerHTML = "<h3>Recent documents</h3>";
    var docs = T.state.docs || [];
    if (!docs.length) {
      recent.innerHTML += '<p class="bs-empty">No documents yet. Create one from the New tab.</p>';
    } else {
      var list = document.createElement("div");
      list.className = "hist-list";
      docs.forEach(function (m) {
        var row = document.createElement("div");
        row.className = "hist-item";
        row.innerHTML =
          '<div class="hist-info"><span class="hist-title">' + T.esc(m.title || T.t("untitled")) + "</span>" +
          '<span class="hist-meta">' + T.esc(T.relTime(m.updatedAt || Date.now())) + " · " + T.esc(wordsLabel(m)) + "</span></div>" +
          '<div class="hist-actions"><button type="button" class="btn ghost hist-open">Open</button>' +
          '<button type="button" class="icon-btn hist-del" title="' + T.esc(T.t("del")) + '">' + T.icon("i-trash") + "</button></div>";
        row.querySelector(".hist-open").addEventListener("click", function () {
          T.editor.openDoc(m.id);
          close();
        });
        row.querySelector(".hist-del").addEventListener("click", function () {
          confirmDeleteDoc(m);
        });
        list.appendChild(row);
      });
      recent.appendChild(list);
    }
    main.appendChild(recent);

    var local = document.createElement("div");
    local.className = "bs-sec";
    local.innerHTML = "<h3>Open local file</h3>" +
      '<p class="bs-sub">Opens a .txt, .md or .html file as a new document.</p>' +
      '<label class="btn ghost file-btn">Choose file<input type="file" id="bsFile" accept=".txt,.md,.html" hidden></label>';
    main.appendChild(local);
    var input = local.querySelector("#bsFile");
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) openLocalFile(input.files[0]);
      input.value = "";
    });
  }

  function confirmDeleteDoc(m) {
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
      if (T.state.currentId === m.id) {
        T.editor.newDoc(T.t("untitled"), "");
      }
      renderCurrentView();
      T.toast(T.t("del") + ": " + (m.title || T.t("untitled")));
    });
  }

  /* Re-render the currently active view (after a destructive change). */
  function renderCurrentView() {
    var id = "open";
    var nav = $("#bsNav");
    if (nav) {
      var active = nav.querySelector(".bs-nav-btn.active");
      if (active) id = active.getAttribute("data-view") || id;
    }
    render(id);
  }

  function openLocalFile(file) {
    var reader = new FileReader();
    reader.addEventListener("load", function () {
      var text = String(reader.result || "");
      var name = file.name || "Untitled";
      var ext = name.toLowerCase().split(".").pop();
      var html;
      if (ext === "html") {
        html = text.replace(/<script[\s\S]*?<\/script>/gi, "");
      } else if (ext === "md") {
        html = markdownToHtml(text);
      } else {
        html = text.split(/\n{2,}/).map(function (p) {
          return "<p>" + T.esc(p.trim()).replace(/\n/g, "<br>") + "</p>";
        }).join("");
      }
      T.editor.newDoc(name.replace(/\.(txt|md|html)$/i, ""), html);
      close();
      T.toast("New document created");
    });
    reader.readAsText(file);
  }

  /* ---------------- markdown -> html ---------------- */
  function mdInline(s) {
    s = T.esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    s = s.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
    return s;
  }

  function mdTable(rows) {
    function cells(r) {
      var c = r.split("|");
      if (c.length && c[0].trim() === "") c.shift();
      if (c.length && c[c.length - 1].trim() === "") c.pop();
      return c.map(function (x) { return mdInline(x.trim()); });
    }
    var body = rows.slice();
    var headRow = cells(body.shift());
    if (body.length && /^[\s:\-|]+$/.test(body[0])) body.shift();
    var h = "<table class=\"txt-table\"><tr>" +
      headRow.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr>";
    var b = body.map(function (r) {
      return "<tr>" + cells(r).map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
    }).join("");
    return h + b + "</table>";
  }

  function markdownToHtml(src) {
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0;
    function isTable(l) { return /^\s*\|.*\|\s*$/.test(l); }
    while (i < lines.length) {
      var line = lines[i], t = line.trim(), m;
      if (!t) { i++; continue; }
      if ((m = t.match(/^###\s+(.+)/))) { out.push("<h3>" + mdInline(m[1]) + "</h3>"); i++; continue; }
      if ((m = t.match(/^##\s+(.+)/))) { out.push("<h2>" + mdInline(m[1]) + "</h2>"); i++; continue; }
      if ((m = t.match(/^#\s+(.+)/))) { out.push("<h1>" + mdInline(m[1]) + "</h1>"); i++; continue; }
      if ((m = t.match(/^>\s?(.*)/))) { out.push("<blockquote><p>" + mdInline(m[1]) + "</p></blockquote>"); i++; continue; }
      if (/^[-*]\s+/.test(t)) {
        var ul = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          ul.push("<li>" + mdInline(lines[i].trim().replace(/^[-*]\s+/, "")) + "</li>");
          i++;
        }
        out.push("<ul>" + ul.join("") + "</ul>");
        continue;
      }
      if (/^\d+\.\s+/.test(t)) {
        var ol = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          ol.push("<li>" + mdInline(lines[i].trim().replace(/^\d+\.\s+/, "")) + "</li>");
          i++;
        }
        out.push("<ol>" + ol.join("") + "</ol>");
        continue;
      }
      if (isTable(t)) {
        var rows = [];
        while (i < lines.length && isTable(lines[i])) { rows.push(lines[i].trim()); i++; }
        if (rows.length >= 2) out.push(mdTable(rows));
        else out.push("<p>" + mdInline(rows[0]) + "</p>");
        continue;
      }
      out.push("<p>" + mdInline(t) + "</p>");
      i++;
    }
    return out.join("");
  }

  /* ---------------- view: export ---------------- */
  function renderExport(main) {
    head(main, "Export", "Download the current document in another format. PDF uses the print dialog.");
    var grid = document.createElement("div");
    grid.className = "tpl-cards";
    var cmds = T.listCommands().filter(function (c) { return c.name.indexOf("export.") === 0; });
    cmds.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tpl-card";
      btn.innerHTML = '<span class="tic">' + T.icon(c.icon || "i-export") + "</span>" +
        "<h3>" + T.esc(c.title) + "</h3><p>" + T.esc(c.cat) + "</p>";
      btn.addEventListener("click", function () {
        T.cmd(c.name);
        T.toast(T.t("exportDone"));
      });
      grid.appendChild(btn);
    });
    main.appendChild(grid);
  }

  /* ---------------- view: history ---------------- */
  function renderHistory(main) {
    var doc = T.editor.getDoc();
    head(main, "Version History", doc ? "Versions of " + doc.title : "No document open.");
    var list = doc ? T.lsGet(T.histKey(doc.id), []) : [];
    var wrap = document.createElement("div");
    wrap.className = "hist-list";
    if (!list.length) {
      wrap.innerHTML = '<p class="bs-empty">' + T.esc(T.t("historyEmpty")) + "</p>";
    } else {
      list.forEach(function (snap, idx) {
        var row = document.createElement("div");
        row.className = "hist-item";
        var words = snap.words != null ? snap.words : countWordsOf(snap.html);
        row.innerHTML =
          '<div class="hist-info"><span class="hist-title">' + T.esc(T.relTime(snap.ts)) + "</span>" +
          '<span class="hist-meta">' + T.esc(words + (words === 1 ? " word" : " words")) +
          (idx === 0 ? " · current" : "") + "</span></div>" +
          '<div class="hist-actions"><button type="button" class="btn ghost hist-prev">' + T.esc(T.t("preview")) + "</button>" +
          '<button type="button" class="btn ghost hist-rst">' + T.esc(T.t("restore")) + "</button></div>";
        row.querySelector(".hist-prev").addEventListener("click", function () {
          T.modal({
            title: T.t("preview") + " · " + T.relTime(snap.ts),
            html: '<div class="hist-preview">' + snap.html + "</div>",
            okText: T.t("close")
          });
        });
        row.querySelector(".hist-rst").addEventListener("click", function () {
          T.modal({
            title: T.t("confirmTitle"),
            sub: "Restore the version from " + T.relTime(snap.ts) + "? Your current content stays in history.",
            okText: T.t("restore")
          }).then(function (r) {
            if (!r) return;
            var sheet = T.editor.sheetEl();
            if (!sheet) { T.toast("No document open", "error"); return; }
            sheet.innerHTML = snap.html || "";
            T.editor.markDirty();
            T.editor.saveNow();
            T.toast("Version restored");
          });
        });
        wrap.appendChild(row);
      });
    }
    main.appendChild(wrap);
  }

  function countWordsOf(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    var tx = div.textContent || "";
    var m = tx.trim().match(/\S+/g);
    return m ? m.length : 0;
  }

  /* ---------------- view: settings ---------------- */
  function renderSettings(main) {
    head(main, "Settings", "Preferences are stored on this device.");
    var prefs = T.state.prefs;
    var themes = T.themes.NAMES || {};
    var themeOpts = Object.keys(themes).map(function (k) {
      return '<option value="' + T.esc(k) + '"' + (k === prefs.theme ? " selected" : "") + ">" + T.esc(themes[k]) + "</option>";
    }).join("");

    var form = document.createElement("div");
    form.className = "set-form";
    form.innerHTML =
      '<div class="set-row"><label for="setGoal">Word goal</label>' +
      '<input type="number" id="setGoal" min="0" step="50" value="' + T.esc(String(prefs.wordGoal != null ? prefs.wordGoal : 500)) + '"></div>' +
      '<div class="set-row check"><label><input type="checkbox" id="setPastePlain"' + (prefs.pastePlain ? " checked" : "") + '> Paste as plain text by default</label></div>' +
      '<div class="set-row"><label for="setAuthor">Author name for track changes</label>' +
      '<input type="text" id="setAuthor" value="' + T.esc(prefs.authorName || "") + '" placeholder="Your name"></div>' +
      '<div class="set-row"><label for="setTheme">Theme</label>' +
      '<select id="setTheme">' + themeOpts + "</select></div>" +
      '<div class="set-row"><button type="button" class="btn-primary" id="setSave">Save</button></div>';
    main.appendChild(form);

    var goal = form.querySelector("#setGoal");
    var plain = form.querySelector("#setPastePlain");
    var author = form.querySelector("#setAuthor");
    var themeSel = form.querySelector("#setTheme");

    themeSel.addEventListener("change", function () {
      T.themes.apply(themeSel.value);
      T.toast("Theme: " + themeSel.options[themeSel.selectedIndex].text);
    });

    form.querySelector("#setSave").addEventListener("click", function () {
      var g = parseInt(goal.value, 10);
      prefs.wordGoal = isNaN(g) ? 500 : Math.max(0, g);
      prefs.pastePlain = !!plain.checked;
      prefs.authorName = author.value.trim();
      prefs.theme = themeSel.value;
      T.savePrefs();
      T.toast("Settings saved");
      T.bus.emit("prefs:change", { prefs: prefs });
    });
  }

  /* ---------------- router ---------------- */
  function render(view) {
    var main = $("#bsMain");
    if (!main) return;
    main.innerHTML = "";
    main.setAttribute("data-view", view);
    if (view === "new") renderNew(main);
    else if (view === "open") renderOpen(main);
    else if (view === "export") renderExport(main);
    else if (view === "history") renderHistory(main);
    else if (view === "settings") renderSettings(main);
    else renderNew(main);
  }

  /* ---------------- wiring ---------------- */
  var closeBtn = $("#bsClose");
  if (closeBtn) closeBtn.addEventListener("click", close);

  T.bus.on("history:open", function () { open("history"); });
  T.bus.on("overlay:escape", function () { if (isOpen()) close(); });

  T.backstage = { open: open, close: close, isOpen: isOpen, openLocal: openLocalFile };

  T.register("backstage.open", function (view) { open(view || "new"); }, {
    title: "Open file menu",
    cat: "Document",
    icon: "i-file"
  });

})();
