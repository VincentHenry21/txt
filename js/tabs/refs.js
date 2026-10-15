/* TXT References tab: table of contents, footnotes, citations.
   Builds against the ribbon contract in ARCHITECTURE.md section 9.
   Only T.ribbon.* and core services are touched at load time. */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;

  T.ribbon.addTab({ id: "refs", label: "References", keytip: "F" });

  /* ---------- shared helpers ---------- */

  function sheet() { return T.editor.sheetEl(); }

  function afterEdit() {
    var s = sheet();
    if (s) T.editor.ensureBlockIds(s);
    T.editor.markDirty();
    T.editor.layoutPages();
    T.editor.updateCounts();
  }

  /* Insert a node at the caret inside the sheet; falls back to the sheet end. */
  function insertNodeAtCaret(node) {
    var s = sheet();
    if (!s) return false;
    T.sel.restore();
    var placed = false;
    try {
      var r = T.sel.range();
      if (r && s.contains(r.commonAncestorContainer)) {
        r.deleteContents();
        r.insertNode(node);
        r.setStartAfter(node);
        r.collapse(true);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        placed = true;
      }
    } catch (e) { placed = false; }
    if (!placed) s.appendChild(node);
    if (s.focus) { try { s.focus({ preventScroll: true }); } catch (e2) { s.focus(); } }
    return true;
  }

  /* Direct-child H1/H2/H3 blocks in document order. */
  function docHeadings(s) {
    var out = [], kids = s.children, i, tg;
    for (i = 0; i < kids.length; i++) {
      tg = kids[i].tagName;
      if (tg === "H1" || tg === "H2" || tg === "H3") out.push(kids[i]);
    }
    return out;
  }

  /* ---------- table of contents ---------- */

  function buildTOC() {
    var s = sheet();
    if (!s) { T.toast("Open a document first."); return; }
    var old = $(".toc-block", s);
    if (old) old.remove();
    T.editor.ensureBlockIds(s);
    var heads = docHeadings(s);
    if (!heads.length) { T.toast("Add headings first."); return; }

    var toc = document.createElement("div");
    toc.className = "toc-block";
    var h = document.createElement("h2");
    h.textContent = "Contents";
    toc.appendChild(h);

    heads.forEach(function (hd) {
      var lvl = hd.tagName === "H1" ? 1 : (hd.tagName === "H2" ? 2 : 3);
      var line = document.createElement("div");
      line.className = "toc-line toc-l" + lvl;
      var a = document.createElement("a");
      a.href = "#";
      a.setAttribute("data-target", hd.getAttribute("data-bid") || "");
      a.textContent = hd.textContent.trim() || ("Heading " + lvl);
      var dots = document.createElement("span");
      dots.className = "dots";
      dots.setAttribute("aria-hidden", "true");
      var pg = document.createElement("span");
      pg.className = "pg";
      pg.textContent = String(T.editor.pageOfNode(hd));
      line.appendChild(a);
      line.appendChild(dots);
      line.appendChild(pg);
      toc.appendChild(line);
    });

    toc.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[data-target]") : null;
      if (!a) return;
      e.preventDefault();
      var s2 = sheet();
      if (!s2) return;
      var target = s2.querySelector('[data-bid="' + a.getAttribute("data-target") + '"]');
      if (target && target.scrollIntoView) target.scrollIntoView({ block: "start" });
    });

    s.insertBefore(toc, s.firstChild);
    afterEdit();
    T.toast("Table of contents updated.");
  }

  /* ---------- footnotes ---------- */

  function fnTray(s) {
    var tray = $(".fn-tray", s);
    if (!tray) {
      tray = document.createElement("div");
      tray.className = "fn-tray";
      s.appendChild(tray);
    }
    return tray;
  }

  function insertFootnote() {
    var s = sheet();
    if (!s) { T.toast("Open a document first."); return; }
    T.sel.save();
    T.modal({
      title: T.t("footnoteText"),
      sub: "The note is stored in the footnotes tray at the end of the document.",
      fields: [{ label: "Footnote text", key: "note", type: "textarea" }],
      okText: T.t("insert")
    }).then(function (vals) {
      if (!vals) return;
      var note = (vals.note || "").trim();
      if (!note) { T.toast("Type the footnote text first."); return; }
      var s2 = sheet();
      if (!s2) return;
      var n = $$(".fnref", s2).length + 1;

      var sup = document.createElement("sup");
      sup.className = "fnref";
      sup.setAttribute("data-fn", String(n));
      sup.textContent = "[" + n + "]";
      sup.title = note.length > 80 ? note.slice(0, 80) + "..." : note;
      insertNodeAtCaret(sup);

      var entry = document.createElement("div");
      entry.className = "fn-entry";
      entry.id = "fn-" + n;
      var esup = document.createElement("sup");
      esup.textContent = "[" + n + "] ";
      var span = document.createElement("span");
      span.textContent = note;
      entry.appendChild(esup);
      entry.appendChild(span);
      fnTray(s2).appendChild(entry);

      afterEdit();
    });
  }

  /* Clicking a footnote marker scrolls to its entry in the tray. */
  document.addEventListener("click", function (e) {
    var sup = e.target && e.target.closest ? e.target.closest("sup.fnref") : null;
    if (!sup) return;
    var s = sheet();
    if (!s || !s.contains(sup)) return;
    var entry = s.querySelector("#fn-" + sup.getAttribute("data-fn"));
    if (entry && entry.scrollIntoView) entry.scrollIntoView({ block: "center" });
  });

  /* ---------- citations ---------- */

  function formatCitation(style, d) {
    var a = d.author, y = d.year, ti = d.title, p = d.publisher;
    function clean(arr) {
      return arr.filter(function (x) { return !!x; }).join(" ").replace(/\s+/g, " ").trim();
    }
    if (style === "MLA") {
      var pub = p ? (y ? p + ", " + y + "." : p + ".") : (y ? y + "." : "");
      return clean([a ? a + "." : "", ti ? ti + "." : "", pub]);
    }
    if (style === "Chicago") {
      return clean([a ? a + "." : "", y ? y + "." : "", ti ? ti + "." : "", p ? p + "." : ""]);
    }
    var au = a ? (y ? a + " (" + y + ")." : a + ".") : (y ? "(" + y + ")." : "");
    return clean([au, ti ? ti + "." : "", p ? p + "." : ""]);
  }

  function bibList(s) {
    var bib = $(".bib-list", s);
    if (!bib) {
      bib = document.createElement("div");
      bib.className = "bib-list";
      var bh = document.createElement("h2");
      bh.textContent = "Bibliography";
      bib.appendChild(bh);
      s.appendChild(bib);
    }
    return bib;
  }

  function manageCitation() {
    var s = sheet();
    if (!s) { T.toast("Open a document first."); return; }
    T.sel.save();
    T.modal({
      title: "Citation Manager",
      sub: "The citation is inserted at the caret and added to the bibliography.",
      fields: [
        { label: T.t("citeStyle"), key: "style", type: "select", value: "APA",
          options: [{ v: "APA", t: "APA" }, { v: "MLA", t: "MLA" }, { v: "Chicago", t: "Chicago" }] },
        { label: "Author", key: "author", ph: "Smith, J." },
        { label: "Year", key: "year", ph: "2020" },
        { label: "Title", key: "title", ph: "Deep Work" },
        { label: "Publisher", key: "publisher", ph: "Grand Central" }
      ],
      okText: T.t("insert")
    }).then(function (vals) {
      if (!vals) return;
      var d = {
        author: (vals.author || "").trim(),
        year: (vals.year || "").trim(),
        title: (vals.title || "").trim(),
        publisher: (vals.publisher || "").trim()
      };
      if (!d.author && !d.title) { T.toast("Enter at least an author or a title."); return; }
      var formatted = formatCitation(vals.style || "APA", d);
      var s2 = sheet();
      if (!s2) return;

      var mark = document.createElement("span");
      mark.className = "cite-mark";
      mark.textContent = "(" + formatted + ")";
      insertNodeAtCaret(mark);

      var entry = document.createElement("div");
      entry.className = "bib-entry";
      entry.textContent = formatted;
      bibList(s2).appendChild(entry);

      afterEdit();
      T.toast("Citation added to the bibliography.");
    });
  }

  /* ---------- ribbon UI ---------- */

  var gToc = T.ribbon.group("refs", "Table of Contents");
  gToc.appendChild(T.ribbon.btn({
    icon: "i-toc", label: "Generate TOC", title: "Generate or update the table of contents",
    cmd: "refs.toc"
  }));

  var gFn = T.ribbon.group("refs", "Footnotes");
  gFn.appendChild(T.ribbon.btn({
    icon: "i-footnote", label: "Insert Footnote", title: "Insert a footnote at the caret",
    cmd: "refs.footnote"
  }));

  var gCite = T.ribbon.group("refs", "Citations");
  gCite.appendChild(T.ribbon.btn({
    icon: "i-book", label: "Citation Manager", title: "Insert a formatted citation and add it to the bibliography",
    cmd: "refs.cite"
  }));

  /* ---------- commands ---------- */

  T.register("refs.toc", buildTOC, { title: "Generate table of contents", cat: "References", icon: "i-toc" });
  T.register("refs.footnote", insertFootnote, { title: "Insert footnote", cat: "References", icon: "i-footnote" });
  T.register("refs.cite", manageCitation, { title: "Citation manager", cat: "References", icon: "i-book" });

})();
