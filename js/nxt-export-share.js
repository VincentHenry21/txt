/* NXT OS unified Export / Share.
   One dialog for every app: pick a real format, name the file, then
   Download to the device, share through the native share sheet, or copy text.
   Every format offered is genuinely produced by the app's own code; nothing
   is faked. Binary PDF import stays unsupported and is not offered anywhere.
   Conventions: IIFE, var T = window.TXT, T.bus, T.store, no emojis,
   no em dashes, no CSS zoom. */
(function () {
  "use strict";
  var T = (typeof window !== "undefined" && window.TXT) ? window.TXT : null;
  var HAS_DOM = typeof document !== "undefined" && typeof window !== "undefined";

  /* ================= pure writers (also exported for Node tests) ================= */

  function strToBytes(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }
  function escXml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /* Minimal stored (uncompressed) ZIP writer. Returns Uint8Array. Genuine ZIP. */
  function crc32(data) {
    var table = crc32._t;
    if (!table) {
      table = crc32._t = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c;
      }
    }
    var crc = -1;
    for (var i = 0; i < data.length; i++) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 255];
    return (crc ^ -1) >>> 0;
  }
  function zipStored(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nameB = strToBytes(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, nameB.length, true); ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true); ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    });
    var cdLen = central.reduce(function (a, p) { return a + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdLen, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (a, p) { return a + p.length; }, 0);
    var out = new Uint8Array(total), o = 0;
    all.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  /* ---- GRD: A1 cell map -> CSV / XLSX ---- */
  function parseA1(addr) {
    var m = /^([A-Z]+)(\d+)$/.exec(String(addr || "").toUpperCase());
    if (!m) return null;
    var col = 0, letters = m[1];
    for (var i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
    return { c: col - 1, r: parseInt(m[2], 10) - 1 };
  }
  function cellText(v) {
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }
  function gridBounds(cellMap) {
    var maxR = -1, maxC = -1;
    Object.keys(cellMap).forEach(function (a) {
      var p = parseA1(a);
      if (p && cellText(cellMap[a]) !== "") {
        if (p.r > maxR) maxR = p.r;
        if (p.c > maxC) maxC = p.c;
      }
    });
    return { rows: maxR + 1, cols: maxC + 1 };
  }
  function gridCellsToCsv(cellMap) {
    var b = gridBounds(cellMap), lines = [];
    var lookup = {};
    Object.keys(cellMap).forEach(function (a) {
      var p = parseA1(a);
      if (p) lookup[p.r + ":" + p.c] = cellText(cellMap[a]);
    });
    for (var r = 0; r < b.rows; r++) {
      var row = [];
      for (var c = 0; c < b.cols; c++) {
        var v = lookup[r + ":" + c] || "";
        row.push(/["\n\r,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
      }
      lines.push(row.join(","));
    }
    return lines.join("\r\n");
  }
  function gridCellsToJson(cellMap, title) {
    return JSON.stringify({ app: "NXT GRD", title: title || "sheet", cells: cellMap }, null, 2);
  }
  function gridCellsToXlsx(cellMap, title) {
    var b = gridBounds(cellMap);
    var lookup = {};
    Object.keys(cellMap).forEach(function (a) {
      var p = parseA1(a);
      if (p) lookup[p.r + ":" + p.c] = cellText(cellMap[a]);
    });
    var rows = "";
    for (var r = 0; r < b.rows; r++) {
      var cells = "";
      for (var c = 0; c < b.cols; c++) {
        var v = lookup[r + ":" + c] || "";
        cells += '<c r="' + colName(c) + (r + 1) + '" t="inlineStr"><is><t>' +
          escXml(v) + "</t></is></c>";
      }
      rows += '<row r="' + (r + 1) + '">' + cells + "</row>";
    }
    function colName(c) {
      var s = "";
      c++;
      while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
      return s;
    }
    var ct = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var wb = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets><sheet name=\"" + escXml(String(title || "Sheet1").slice(0, 31)) +
      '" sheetId="1" r:id="rId1"/></sheets></workbook>';
    var wbRels = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    var sheet = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + rows + "</sheetData></worksheet>";
    return zipStored([
      { name: "[Content_Types].xml", data: strToBytes(ct) },
      { name: "_rels/.rels", data: strToBytes(rels) },
      { name: "xl/workbook.xml", data: strToBytes(wb) },
      { name: "xl/_rels/workbook.xml.rels", data: strToBytes(wbRels) },
      { name: "xl/worksheets/sheet1.xml", data: strToBytes(sheet) }
    ]);
  }

  /* ---- MEM: notes -> Markdown / text / JSON ---- */
  function stripHtml(html) {
    return String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n").trim();
  }
  function noteTitleOf(n) {
    var t = String((n && n.title) || "").trim();
    return t || "Untitled note";
  }
  function noteBodyText(n) {
    if (!n) return "";
    if (n.kind === "checklist") {
      return (n.items || []).map(function (it) {
        return (it.done ? "[x] " : "[ ] ") + (it.text || "");
      }).join("\n");
    }
    return stripHtml(n.html);
  }
  function notesToMarkdown(notes) {
    var out = [];
    (notes || []).forEach(function (n) {
      out.push("## " + noteTitleOf(n));
      var body = noteBodyText(n);
      if (body) out.push(body);
      out.push("");
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  function notesToText(notes) {
    var out = [];
    (notes || []).forEach(function (n) {
      out.push(noteTitleOf(n));
      var body = noteBodyText(n);
      if (body) out.push(body);
      out.push("");
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  function memBackupJson(notes, boards) {
    return JSON.stringify({ app: "NXT MEM", exportedAt: new Date().toISOString(),
      notes: notes || [], boards: boards || [] }, null, 2);
  }

  /* ================= download + native share ================= */

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 4000);
  }
  function shareState() {
    var hasShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    var hasCanShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
    return { hasShare: hasShare, hasCanShare: hasCanShare };
  }
  function canShareFile(file) {
    var st = shareState();
    if (!st.hasShare) return false;
    try {
      if (st.hasCanShare) return !!navigator.canShare({ files: [file] });
      return true;
    } catch (e) { return false; }
  }
  function toast(msg, kind) {
    if (T.toast) T.toast(msg, kind);
  }
  function doDownload(res) {
    downloadBlob(res.blob, res.filename);
    toast("Downloaded " + res.filename + ".");
  }
  function doShare(res) {
    var file;
    try {
      file = new File([res.blob], res.filename, { type: res.mime || res.blob.type || "application/octet-stream" });
    } catch (e) {
      doDownload(res);
      toast("Sharing is not available here, so the file was downloaded instead.", "error");
      return;
    }
    if (canShareFile(file)) {
      var p = null;
      try { p = navigator.share({ files: [file], title: res.filename }); }
      catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function () {
        toast("Shared " + res.filename + ".");
      }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        doDownload(res);
        toast("Share was blocked, so the file was downloaded instead. You can share it from your Files app.", "error");
      });
    } else {
      doDownload(res);
      var st = shareState();
      toast(st.hasShare
        ? "This device or browser cannot share files of this type, so it was downloaded instead."
        : "Native sharing is not available in this browser, so the file was downloaded instead.", "error");
    }
  }
  function doCopyText(text, label) {
    function done() { toast((label || "Text") + " copied."); }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      } catch (e) { toast("Copy failed.", "error"); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }
  function safeBase(name) {
    return String(name || "file").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "file";
  }

  /* ================= per-app format registry =================
     Each format: { id, label, ext, mime, note, kind: "file"|"print",
                    build: function(appCtx) -> Promise<{blob, filename, mime}> } */

  function txtCtx() {
    var C = window.TXTConvert, ed = T.editor;
    if (!C || !ed || typeof ed.sheetEl !== "function") throw new Error("TXT is not ready.");
    var m = C.domToModel(ed.sheetEl());
    var d = (typeof ed.getDoc === "function") ? ed.getDoc() : null;
    var title = safeBase(d && d.title ? String(d.title).replace(/\.txtdoc$/i, "") : "document");
    return { C: C, m: m, title: title };
  }
  function dckCtx() {
    var deck = (T.dck && typeof T.dck.currentDeck === "function") ? T.dck.currentDeck() : null;
    if (!deck || !(deck.slides || []).length) throw new Error("Open a deck with slides first.");
    if (!T.dckEngine) throw new Error("DCK engine is not ready.");
    return { deck: deck, title: safeBase(deck.title || "deck") };
  }
  function pxlCanvas() {
    var px = T.pixel;
    if (!px || typeof px.layers !== "function") throw new Error("PXL is not ready.");
    var layers = px.layers() || [];
    var vis = layers.filter(function (L) { return L && L.visible !== false && L.canvas && L.canvas.width; });
    if (!vis.length) throw new Error("Nothing to export. Open an image first.");
    var w = 0, h = 0;
    vis.forEach(function (L) { w = Math.max(w, L.canvas.width); h = Math.max(h, L.canvas.height); });
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d");
    vis.forEach(function (L) {
      x.globalAlpha = (typeof L.opacity === "number") ? L.opacity : 1;
      try { x.globalCompositeOperation = L.blend || "source-over"; } catch (e) {}
      x.drawImage(L.canvas, 0, 0);
    });
    x.globalAlpha = 1;
    return c;
  }
  function vacCtx() {
    if (!T.vacEngine || !T.vacGeom) throw new Error("VAC is not ready.");
    var ab = T.vacEngine.activeArtboard();
    if (!ab) throw new Error("No artboard. Create one first.");
    var base = safeBase(ab.name || "artboard").toLowerCase();
    return { ab: ab, base: base };
  }
  function grdCtx() {
    if (!T.grd || typeof T.grd.current !== "function") throw new Error("GRD is not ready.");
    var doc = T.grd.current();
    if (!doc || !doc.grid) throw new Error("Open a sheet first.");
    var grid = doc.grid, map = {};
    Object.keys(grid.cells).forEach(function (addr) {
      try {
        var r = T.grd.getValue(grid, addr);
        map[addr] = (r && r.e) ? r.e : (r ? r.v : "");
      } catch (e) { map[addr] = ""; }
    });
    return { map: map, title: safeBase(doc.title || "sheet") };
  }
  function memCtx() {
    if (!T.mem || typeof T.mem.getNotes !== "function") throw new Error("MEM is not ready.");
    var notes = T.mem.getNotes() || [];
    var boards = (typeof T.mem.getBoards === "function") ? (T.mem.getBoards() || []) : [];
    if (!notes.length && !boards.length) throw new Error("Nothing to export. Create a note or board first.");
    return { notes: notes, boards: boards };
  }
  function pdfCtx() {
    if (!T.pdf || typeof T.pdf.getDoc !== "function") throw new Error("PDF is not ready.");
    var doc = T.pdf.getDoc();
    if (!doc) throw new Error("Open a document first.");
    return { doc: doc, title: safeBase(doc.title || "document") };
  }
  function hubItemBlob(item) {
    var content = String((item && item.content) || "");
    var type = item && item.type;
    var ext = type === "svg" ? "svg" : type === "image" ? "png" : type === "html" ? "html" : "txt";
    var mime = type === "svg" ? "image/svg+xml" : type === "image" ? "image/png"
      : type === "html" ? "text/html" : "text/plain";
    var blob;
    var dm = content.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (dm) {
      var isB64 = !!dm[2], raw = dm[3] || "";
      var bytes;
      if (isB64) {
        var bin = atob(raw.replace(/\s/g, ""));
        bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        try { bytes = strToBytes(decodeURIComponent(raw)); }
        catch (e) { bytes = strToBytes(raw); }
      }
      blob = new Blob([bytes], { type: (dm[1] || mime) });
    } else {
      blob = new Blob([content], { type: mime + ";charset=utf-8" });
    }
    return { blob: blob, filename: safeBase(item.title || "shelf-item") + "." + ext, mime: mime };
  }

  function txtFormats() {
    function file(id, label, ext, mime, note, fn, kind) {
      return { id: id, label: label, ext: ext, mime: mime, note: note || "",
               kind: kind || "file", build: fn || null };
    }
    return [
      file("docx", "Word document", "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Fully formatted, opens in Word and Pages", function () {
          var c = txtCtx();
          return window.TXTDocx.buildBlob(c.m, c.title, {}).then(function (blob) {
            return { blob: blob, filename: c.title + ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
          });
        }),
      file("pdf-print", "PDF", "pdf", "application/pdf", "Via the print dialog: choose Save as PDF",
        null, "print"),
      file("html", "Web page", "html", "text/html", "Standalone HTML file", function () {
        var c = txtCtx();
        return { blob: new Blob([c.C.modelToHtmlDoc(c.m, c.title)], { type: "text/html" }),
          filename: c.title + ".html", mime: "text/html" };
      }),
      file("md", "Markdown", "md", "text/markdown", "Plain-text formatting", function () {
        var c = txtCtx();
        return { blob: new Blob([c.C.modelToMarkdown(c.m)], { type: "text/markdown" }),
          filename: c.title + ".md", mime: "text/markdown" };
      }),
      file("txt", "Plain text", "txt", "text/plain", "No formatting", function () {
        var c = txtCtx();
        return { blob: new Blob([c.C.modelToText(c.m)], { type: "text/plain" }),
          filename: c.title + ".txt", mime: "text/plain" };
      }),
      file("rtf", "Rich text", "rtf", "application/rtf", "Opens in WordPad and TextEdit", function () {
        var c = txtCtx();
        return { blob: new Blob([c.C.modelToRtf(c.m)], { type: "application/rtf" }),
          filename: c.title + ".rtf", mime: "application/rtf" };
      }),
      file("odt", "OpenDocument", "odt", "application/vnd.oasis.opendocument.text",
        "Opens in Word and LibreOffice", function () {
          var c = txtCtx();
          return { blob: new Blob([c.C.modelToOdt(c.m, c.title)],
            { type: "application/vnd.oasis.opendocument.text" }),
            filename: c.title + ".odt", mime: "application/vnd.oasis.opendocument.text" };
        }),
      file("doc", "Word 97-2003", "doc", "application/msword", "Opens in Word (HTML-based .doc)", function () {
        var c = txtCtx();
        return { blob: new Blob([c.C.modelToWordHtml(c.m, c.title)], { type: "application/msword" }),
          filename: c.title + ".doc", mime: "application/msword" };
      })
    ];
  }
  function dckFormats() {
    return [
      { id: "pptx", label: "PowerPoint", ext: "pptx",
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        note: "Real .pptx, opens in PowerPoint and Keynote", kind: "file",
        build: function () {
          var c = dckCtx();
          var bytes = T.dckEngine.buildPptx(c.deck);
          return { blob: new Blob([bytes],
            { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }),
            filename: c.title + ".pptx",
            mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
        } },
      { id: "html5", label: "Web player", ext: "html", mime: "text/html",
        note: "Self-playing slideshow in one file", kind: "file",
        build: function () {
          var c = dckCtx();
          return { blob: new Blob([T.dckEngine.buildHtml5(c.deck)], { type: "text/html" }),
            filename: c.title + "-player.html", mime: "text/html" };
        } },
      { id: "png", label: "Slide images", ext: "zip", mime: "application/zip",
        note: "Every slide as a PNG, bundled in a ZIP", kind: "file",
        build: function () {
          var c = dckCtx();
          var jobs = c.deck.slides.map(function (s, i) {
            return T.dckEngine.renderSlidePngBlob(c.deck, s, i).then(function (blob) {
              return blob.arrayBuffer().then(function (ab) {
                return { name: c.title + "-slide-" + (i + 1) + ".png", data: new Uint8Array(ab) };
              });
            });
          });
          return Promise.all(jobs).then(function (files) {
            var zip = T.dckEngine.zipStored(files);
            return { blob: new Blob([zip], { type: "application/zip" }),
              filename: c.title + "-slides.zip", mime: "application/zip" };
          });
        } },
      { id: "pdf-print", label: "PDF", ext: "pdf", mime: "application/pdf",
        note: "Via the print dialog: choose Save as PDF", kind: "print", build: null }
    ];
  }
  function pxlFormats() {
    function raster(ext, mime, note) {
      return { id: ext, label: ext.toUpperCase(), ext: ext, mime: mime, note: note, kind: "file",
        build: function () {
          var c = pxlCanvas();
          return new Promise(function (resolve, reject) {
            try {
              c.toBlob(function (b) {
                if (b) resolve({ blob: b, filename: safeBase("pxl-image") + "." + ext, mime: mime });
                else reject(new Error("Render failed."));
              }, mime, 0.92);
            } catch (e) { reject(e); }
          });
        } };
    }
    return [
      raster("jpg", "image/jpeg", "Small file, best for sharing photos"),
      raster("png", "image/png", "Lossless quality"),
      raster("webp", "image/webp", "Modern, small and sharp")
    ];
  }
  function vacFormats() {
    return [
      { id: "svg", label: "SVG vector", ext: "svg", mime: "image/svg+xml",
        note: "Infinitely scalable, opens in browsers and design apps", kind: "file",
        build: function () {
          var c = vacCtx();
          return { blob: new Blob([T.vacEngine.exportArtboardSVG(c.ab)], { type: "image/svg+xml" }),
            filename: c.base + ".svg", mime: "image/svg+xml" };
        } },
      { id: "png", label: "PNG image", ext: "png", mime: "image/png",
        note: "Rasterized at 2x for crisp sharing", kind: "file",
        build: function () {
          var c = vacCtx();
          return T.vacEngine.rasterizeArtboardPNG(2).then(function (blob) {
            return { blob: blob, filename: c.base + "@2x.png", mime: "image/png" };
          });
        } },
      { id: "pdf", label: "PDF", ext: "pdf", mime: "application/pdf",
        note: "Vector PDF, curves flattened", kind: "file",
        build: function () {
          var c = vacCtx();
          var box = T.vacGeom.artboardExportBox(c.ab);
          var pdf = T.vacGeom.buildPdf(box.w, box.h, T.vacEngine.shapesForExport(c.ab));
          return { blob: new Blob([pdf], { type: "application/pdf" }),
            filename: c.base + ".pdf", mime: "application/pdf" };
        } },
      { id: "eps", label: "EPS", ext: "eps", mime: "application/postscript",
        note: "PostScript vector, opens in Illustrator", kind: "file",
        build: function () {
          var c = vacCtx();
          var box = T.vacGeom.artboardExportBox(c.ab);
          var eps = T.vacGeom.buildEps(box.w, box.h, T.vacEngine.shapesForExport(c.ab));
          return { blob: new Blob([eps], { type: "application/postscript" }),
            filename: c.base + ".eps", mime: "application/postscript" };
        } }
    ];
  }
  function grdFormats() {
    return [
      { id: "xlsx", label: "Excel workbook", ext: "xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        note: "Real .xlsx, opens in Excel and Sheets", kind: "file",
        build: function () {
          var c = grdCtx();
          var bytes = gridCellsToXlsx(c.map, c.title);
          return { blob: new Blob([bytes],
            { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
            filename: c.title + ".xlsx",
            mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
        } },
      { id: "csv", label: "CSV", ext: "csv", mime: "text/csv",
        note: "Comma-separated values", kind: "file",
        build: function () {
          var c = grdCtx();
          return { blob: new Blob([gridCellsToCsv(c.map)], { type: "text/csv" }),
            filename: c.title + ".csv", mime: "text/csv" };
        } },
      { id: "json", label: "JSON data", ext: "json", mime: "application/json",
        note: "Raw cell data for developers", kind: "file",
        build: function () {
          var c = grdCtx();
          return { blob: new Blob([gridCellsToJson(c.map, c.title)], { type: "application/json" }),
            filename: c.title + ".json", mime: "application/json" };
        } }
    ];
  }
  function memFormats() {
    return [
      { id: "md", label: "Markdown", ext: "md", mime: "text/markdown",
        note: "All notes in one file", kind: "file",
        build: function () {
          var c = memCtx();
          return { blob: new Blob([notesToMarkdown(c.notes)], { type: "text/markdown" }),
            filename: "mem-notes.md", mime: "text/markdown" };
        } },
      { id: "txt", label: "Plain text", ext: "txt", mime: "text/plain",
        note: "All notes in one file", kind: "file",
        build: function () {
          var c = memCtx();
          return { blob: new Blob([notesToText(c.notes)], { type: "text/plain" }),
            filename: "mem-notes.txt", mime: "text/plain" };
        } },
      { id: "json", label: "Backup (JSON)", ext: "json", mime: "application/json",
        note: "Notes and boards, for safekeeping", kind: "file",
        build: function () {
          var c = memCtx();
          return { blob: new Blob([memBackupJson(c.notes, c.boards)], { type: "application/json" }),
            filename: "mem-backup.json", mime: "application/json" };
        } }
    ];
  }
  function pdfFormats() {
    return [
      { id: "html", label: "Web page", ext: "html", mime: "text/html",
        note: "Document as a standalone page", kind: "file",
        build: function () {
          var c = pdfCtx();
          return { blob: new Blob([T.pdf.exportHTML()], { type: "text/html" }),
            filename: c.title + ".html", mime: "text/html" };
        } },
      { id: "txt", label: "Plain text", ext: "txt", mime: "text/plain",
        note: "Just the text", kind: "file",
        build: function () {
          var c = pdfCtx();
          return { blob: new Blob([T.pdf.exportTXT()], { type: "text/plain" }),
            filename: c.title + ".txt", mime: "text/plain" };
        } },
      { id: "pdf-print", label: "PDF", ext: "pdf", mime: "application/pdf",
        note: "Via the print dialog: choose Save as PDF", kind: "print", build: null }
    ];
  }
  function hubFormats() {
    var items = [];
    try { items = (T.hub && typeof T.hub.getShelf === "function") ? (T.hub.getShelf() || []) : []; }
    catch (e) { items = []; }
    return items.map(function (it, i) {
      var r = hubItemBlob(it);
      return { id: "item-" + i, label: String(it.title || "Shelf item"), ext: r.filename.split(".").pop(),
        mime: r.mime, note: "Original file from your shelf", kind: "file",
        build: function () { return hubItemBlob(it); } };
    });
  }

  var REGISTRY = {
    txt: { name: "TXT", formats: txtFormats },
    dck: { name: "DCK", formats: dckFormats },
    pxl: { name: "PXL", formats: pxlFormats },
    vac: { name: "VAC", formats: vacFormats },
    grd: { name: "GRD", formats: grdFormats },
    mem: { name: "MEM", formats: memFormats },
    pdf: { name: "PDF", formats: pdfFormats },
    hub: { name: "HUB", formats: hubFormats }
  };
  function formatsFor(appId) {
    var e = REGISTRY[appId];
    if (!e) return [];
    try { return e.formats() || []; } catch (err) { return []; }
  }

  /* ================= the dialog ================= */

  var APP_LABEL = { txt: "TXT", dck: "DCK", pxl: "PXL", vac: "VAC", grd: "GRD", mem: "MEM", pdf: "PDF", hub: "HUB" };
  var overlay = null;

  function closeDialog() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle("nxes-busy", !!busy);
    if (busy) btn.setAttribute("data-label", btn.textContent);
    btn.textContent = busy ? "Working..." : (label || btn.getAttribute("data-label") || btn.textContent);
  }
  function openDialog(appId) {
    closeDialog();
    var formats = formatsFor(appId);
    var label = APP_LABEL[appId] || appId.toUpperCase();
    overlay = document.createElement("div");
    overlay.className = "nxes-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Export and share from " + label);
    var isHub = appId === "hub";
    var listTitle = isHub ? "Choose a file from your shelf" : "Choose a format";
    var html = '<div class="nxes-card">' +
      '<div class="nxes-head"><div><div class="nxes-title">Export / Share</div>' +
      '<div class="nxes-sub">' + escXml(label) + " · Developed by H3NZ</div></div>" +
      '<button type="button" class="nxes-x" aria-label="Close">×</button></div>' +
      '<div class="nxes-secttl">' + escXml(listTitle) + "</div>" +
      '<div class="nxes-list" role="radiogroup" aria-label="Formats">';
    if (!formats.length) {
      html += '<div class="nxes-empty">' +
        (isHub ? "Your shelf is empty. Pin something to the HUB first."
               : "Nothing to export yet in " + escXml(label) + ".") + "</div>";
    } else {
      formats.forEach(function (f, i) {
        html += '<label class="nxes-opt' + (i === 0 ? " nxes-sel" : "") + '">' +
          '<input type="radio" name="nxes-fmt" value="' + escXml(f.id) + '"' + (i === 0 ? " checked" : "") + ">" +
          '<span class="nxes-optmain"><span class="nxes-optlabel">' + escXml(f.label) + "</span>" +
          (f.note ? '<span class="nxes-optnote">' + escXml(f.note) + "</span>" : "") + "</span>" +
          '<span class="nxes-ext">.' + escXml(f.ext) + "</span></label>";
      });
    }
    html += "</div>";
    var st = shareState();
    html += '<label class="nxes-namelbl">File name<input type="text" class="nxes-name" value="' +
      escXml(defaultName(appId, formats[0])) + '" maxlength="80" aria-label="File name"></label>';
    html += '<div class="nxes-shareline">' + (st.hasShare
      ? "Native share sheet is available on this device."
      : "Native sharing is not available in this browser. Share falls back to download.") + "</div>";
    html += '<div class="nxes-actions">' +
      '<button type="button" class="nxes-btn nxes-primary" data-act="download">Download to device</button>' +
      '<button type="button" class="nxes-btn" data-act="share">Share</button>' +
      '<button type="button" class="nxes-btn nxes-copybtn" data-act="copy">Copy text</button>' +
      "</div></div>";
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    var card = overlay.querySelector(".nxes-card");
    overlay.querySelector(".nxes-x").addEventListener("click", closeDialog);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeDialog(); });
    var opts = overlay.querySelectorAll(".nxes-opt");
    opts.forEach(function (o) {
      o.addEventListener("click", function () {
        opts.forEach(function (x) { x.classList.remove("nxes-sel"); });
        o.classList.add("nxes-sel");
        syncActions();
      });
    });
    function selFormat() {
      var r = overlay.querySelector('input[name="nxes-fmt"]:checked');
      var id = r ? r.value : null;
      for (var i = 0; i < formats.length; i++) if (formats[i].id === id) return formats[i];
      return formats[0] || null;
    }
    function isTextish(f) {
      return !!f && /^(text\/|application\/(json|rtf))/.test(f.mime || "");
    }
    var nameInput = overlay.querySelector(".nxes-name");
    var copyBtn = overlay.querySelector('[data-act="copy"]');
    var dlBtn = overlay.querySelector('[data-act="download"]');
    var shareBtn = overlay.querySelector('[data-act="share"]');
    function syncActions() {
      var f = selFormat();
      if (!f) {
        [dlBtn, shareBtn, copyBtn].forEach(function (b) { b.disabled = true; });
        nameInput.disabled = true;
        return;
      }
      var isPrint = f.kind === "print";
      nameInput.disabled = isPrint;
      dlBtn.disabled = isPrint;
      shareBtn.disabled = isPrint;
      dlBtn.textContent = "Download to device";
      shareBtn.textContent = "Share";
      copyBtn.style.display = (!isPrint && isTextish(f)) ? "" : "none";
      if (isPrint) {
        dlBtn.textContent = "Print / Save as PDF";
        dlBtn.disabled = false;
      }
    }
    function withName(f, res) {
      var base = safeBase(nameInput.value || defaultName(appId, f));
      if (base.toLowerCase().slice(-(f.ext.length + 1)) !== "." + f.ext.toLowerCase()) base += "." + f.ext;
      res.filename = base;
      return res;
    }
    function runBuild(f) {
      if (f.kind === "print") { window.print(); return Promise.resolve(null); }
      var out;
      try { out = f.build(); } catch (e) { return Promise.reject(e); }
      return Promise.resolve(out).then(function (res) {
        if (!res || !res.blob) throw new Error("Export produced nothing.");
        return withName(f, res);
      });
    }
    dlBtn.addEventListener("click", function () {
      var f = selFormat();
      if (!f) return;
      if (f.kind === "print") { window.print(); return; }
      setBusy(dlBtn, true);
      runBuild(f).then(function (res) {
        doDownload(res);
        closeDialog();
      }).catch(function (e) {
        setBusy(dlBtn, false);
        toast("Export failed: " + (e && e.message ? e.message : "unknown error"), "error");
      });
    });
    shareBtn.addEventListener("click", function () {
      var f = selFormat();
      if (!f || f.kind === "print") return;
      setBusy(shareBtn, true);
      runBuild(f).then(function (res) {
        setBusy(shareBtn, false);
        doShare(res);
        closeDialog();
      }).catch(function (e) {
        setBusy(shareBtn, false);
        toast("Export failed: " + (e && e.message ? e.message : "unknown error"), "error");
      });
    });
    copyBtn.addEventListener("click", function () {
      var f = selFormat();
      if (!f || f.kind === "print") return;
      setBusy(copyBtn, true, "Copy text");
      runBuild(f).then(function (res) {
        setBusy(copyBtn, false, "Copy text");
        res.blob.text().then(function (t) { doCopyText(t, f.label); },
          function () { toast("Copy failed.", "error"); });
      }).catch(function (e) {
        setBusy(copyBtn, false, "Copy text");
        toast("Export failed: " + (e && e.message ? e.message : "unknown error"), "error");
      });
    });
    function onKey(e) {
      if (e.key === "Escape") { closeDialog(); document.removeEventListener("keydown", onKey); }
    }
    document.addEventListener("keydown", onKey);
    syncActions();
    var first = overlay.querySelector(".nxes-name");
    if (first) setTimeout(function () { try { first.focus(); first.select(); } catch (e) {} }, 60);
  }
  function defaultName(appId, f) {
    try {
      if (appId === "txt") return txtCtx().title;
      if (appId === "dck") return dckCtx().title;
      if (appId === "grd") return grdCtx().title;
      if (appId === "pdf") return pdfCtx().title;
      if (appId === "vac") return vacCtx().base;
    } catch (e) {}
    if (f && f.id && f.id.indexOf("item-") === 0) return f.label;
    return { txt: "document", dck: "deck", pxl: "pxl-image", vac: "artboard",
             grd: "sheet", mem: "mem-notes", pdf: "document", hub: "shelf-item" }[appId] || "file";
  }

  /* ================= entry-point buttons in each app top bar ================= */

  var VIEW_TO_APP = {
    "view-vac": "vac", "view-pixel": "pxl",
    "view-grd": "grd", "view-dck": "dck", "view-mem": "mem",
    "view-pdf": "pdf", "view-hub": "hub", "view-word": null
  };
  function appIdForView(viewId) {
    if (viewId === "view-word") {
      var p = null;
      try { p = T.ecosystem && T.ecosystem.persona; } catch (e) {}
      return p === "vac" ? "vac" : p === "pixel" ? "pxl" : "txt";
    }
    return VIEW_TO_APP[viewId] || null;
  }
  function currentAppId() {
    var secs = document.querySelectorAll("section.view");
    for (var i = 0; i < secs.length; i++) {
      if (!secs[i].classList.contains("hidden")) {
        var id = appIdForView(secs[i].id);
        if (id && REGISTRY[id]) return id;
      }
    }
    return null;
  }
  function shareIcon() {
    if (T.icon) { try { return T.icon("i-export"); } catch (e) {} }
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/>' +
      '<polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  }
  function injectButtons() {
    var waffles = document.querySelectorAll(".waffle-btn");
    for (var i = 0; i < waffles.length; i++) {
      (function (w) {
        if (w.parentNode && w.parentNode.querySelector(".nxes-sharebtn")) return;
        var sec = w.closest("section.view");
        if (!sec || sec.id === "view-ascend") return;
        var appId = sec ? appIdForView(sec.id) : null;
        if (!appId || !REGISTRY[appId]) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "icon-btn nxes-sharebtn";
        var nm = (APP_LABEL[appId] || appId).toUpperCase();
        b.title = "Export / Share from " + nm;
        b.setAttribute("aria-label", "Export or share from " + nm);
        b.innerHTML = shareIcon();
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          openDialog(appId);
        });
        w.parentNode.insertBefore(b, w.nextSibling);
      })(waffles[i]);
    }
  }
  function boot() {
    if (!T || !HAS_DOM) return;
    injectButtons();
    if (T.bus && T.bus.on) {
      T.bus.on("persona:switch", function () { setTimeout(injectButtons, 60); });
      T.bus.on("ecosystem:persona", function () { setTimeout(injectButtons, 60); });
    }
    var mo = null;
    try {
      mo = new MutationObserver(function () { injectButtons(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (T && HAS_DOM) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      setTimeout(boot, 0);
    }
  }

  var api = {
    open: (T && HAS_DOM) ? openDialog : function () { throw new Error("Export/Share needs a browser."); },
    formats: formatsFor,
    apps: function () { return Object.keys(REGISTRY); },
    downloadBlob: (T && HAS_DOM) ? downloadBlob : function () { throw new Error("Export/Share needs a browser."); },
    shareState: (typeof navigator !== "undefined") ? shareState : function () { return { hasShare: false, hasCanShare: false }; },
    canShareFile: canShareFile,
    doShare: (T && HAS_DOM) ? doShare : function () { throw new Error("Export/Share needs a browser."); },
    currentAppId: (T && HAS_DOM) ? currentAppId : function () { return null; },
    /* pure writers, unit-testable */
    _zipStored: zipStored,
    _crc32: crc32,
    _gridCellsToCsv: gridCellsToCsv,
    _gridCellsToJson: gridCellsToJson,
    _gridCellsToXlsx: gridCellsToXlsx,
    _notesToMarkdown: notesToMarkdown,
    _notesToText: notesToText,
    _memBackupJson: memBackupJson,
    _hubItemBlob: hubItemBlob,
    _safeBase: safeBase
  };
  if (T) T.exportShare = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  /* command-palette entry */
  try {
    if (T && T.register) {
      T.register("nxt.exportShare", function () {
        var appId = currentAppId();
        if (appId) openDialog(appId);
        else if (T.toast) T.toast("Open an app first.", "error");
      }, { title: "Export / Share", cat: "NXT", icon: "i-export" });
    }
  } catch (e) {}
})();
