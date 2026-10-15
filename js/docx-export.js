/* TXTDocx: model -> real .docx via the vendored docx library (window.docx). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TXTDocx = api;
})(typeof self !== "undefined" ? self : this, function () {

  function hexNoHash(h) {
    return String(h || "").replace("#", "").toUpperCase();
  }
  function halfPoints(px) {
    return Math.max(8, Math.round((px || 16) * 1.5));
  }
  var HIGHLIGHTS = {
    "FFFF00": "YELLOW", "00FF00": "GREEN", "00FFFF": "CYAN",
    "FF00FF": "MAGENTA", "0000FF": "BLUE", "FF0000": "RED",
    "000080": "DARK_BLUE", "008000": "DARK_GREEN", "800000": "DARK_RED",
    "808000": "DARK_YELLOW", "800080": "DARK_MAGENTA", "008080": "DARK_CYAN",
    "808080": "DARK_GRAY", "C0C0C0": "LIGHT_GRAY", "000000": "BLACK", "FFFFFF": "NONE"
  };
  function nearestHighlight(hex) {
    var h = hexNoHash(hex);
    if (HIGHLIGHTS[h]) return HIGHLIGHTS[h];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var best = "YELLOW", bestD = 1e12;
    Object.keys(HIGHLIGHTS).forEach(function (k) {
      if (k === "NONE") return;
      var kr = parseInt(k.slice(0, 2), 16), kg = parseInt(k.slice(2, 4), 16), kb = parseInt(k.slice(4, 6), 16);
      var d = (r - kr) * (r - kr) + (g - kg) * (g - kg) + (b - kb) * (b - kb);
      if (d < bestD) { bestD = d; best = HIGHLIGHTS[k]; }
    });
    return best;
  }
  function alignOf(a, docx) {
    return { left: docx.AlignmentType.LEFT, center: docx.AlignmentType.CENTER, right: docx.AlignmentType.RIGHT, justify: docx.AlignmentType.JUSTIFIED }[a] || docx.AlignmentType.LEFT;
  }

  function dataUrlToBytes(src) {
    var m = String(src || "").match(/^data:[^;]+;base64,(.*)$/s);
    if (!m) return null;
    var bin = atob(m[1].replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function buildDocument(docx, model, title) {
    var children = [];

    function textRun(r) {
      var opts = { text: r.t || "" };
      if (r.b) opts.bold = true;
      if (r.i) opts.italics = true;
      if (r.u) opts.underline = {};
      if (r.s) opts.strike = true;
      if (r.sub) opts.subScript = true;
      if (r.sup) opts.superScript = true;
      if (r.color) opts.color = hexNoHash(r.color);
      if (r.bg) opts.highlight = nearestHighlight(r.bg);
      if (r.size) opts.size = halfPoints(r.size);
      if (r.font) opts.font = r.font;
      var run = new docx.TextRun(opts);
      if (r.link) {
        return new docx.ExternalHyperlink({
          children: [new docx.TextRun(Object.assign({}, opts, { style: "Hyperlink" }))],
          link: r.link
        });
      }
      return run;
    }

    function runsToInlines(runs) {
      var parts = [], buf = [];
      function flush() {
        if (!buf.length) return;
        var text = buf.map(function (r) { return r.t || ""; }).join("");
        var first = buf[0];
        parts.push(textRun(Object.assign({}, first, { t: text })));
        buf = [];
      }
      runs.forEach(function (r) {
        if (r.img) {
          flush();
          var bytes = dataUrlToBytes(r.img.src);
          if (bytes) {
            var w = r.img.w || 400, h = r.img.h || 300;
            var maxW = 600;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            parts.push(new docx.ImageRun({ data: bytes, transformation: { width: w, height: h } }));
          }
        } else if (r.br || (r.t || "").indexOf("\n") >= 0) {
          flush();
          parts.push(new docx.TextRun({ break: 1 }));
        } else if (!r.link && buf.length && sameStyle(buf[0], r)) {
          buf.push(r);
        } else {
          flush();
          buf.push(r);
        }
      });
      flush();
      return parts;
    }
    function sameStyle(a, b) {
      return !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s &&
        !!a.sub === !!b.sub && !!a.sup === !!b.sup &&
        (a.color || "") === (b.color || "") && (a.bg || "") === (b.bg || "") &&
        (a.size || 0) === (b.size || 0) && (a.font || "") === (b.font || "") && !a.link && !b.link;
    }

    function paraFromBlock(b) {
      var opts = { children: runsToInlines(b.runs || []) };
      if (b.type === "h1") opts.heading = docx.HeadingLevel.HEADING_1;
      else if (b.type === "h2") opts.heading = docx.HeadingLevel.HEADING_2;
      else if (b.type === "h3") opts.heading = docx.HeadingLevel.HEADING_3;
      opts.alignment = alignOf(b.align, docx);
      if (b.indent) opts.indent = { left: Math.round(b.indent * 15) };
      return new docx.Paragraph(opts);
    }

    model.forEach(function (b) {
      if (b.type === "li" && b.list) {
        var ref = b.list.ordered ? "txt-num" : "txt-bul";
        children.push(new docx.Paragraph({
          children: runsToInlines(b.runs || []),
          alignment: alignOf(b.align, docx),
          numbering: { reference: ref, level: Math.min(b.list.depth, 8) }
        }));
        return;
      }
      if (b.type === "hr") {
        children.push(new docx.Paragraph({
          children: [new docx.TextRun("")],
          border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" } }
        }));
        return;
      }
      if (b.type === "pagebreak") {
        children.push(new docx.Paragraph({ children: [new docx.TextRun({ break: 1, breakType: "page" })] }));
        return;
      }
      if (b.type === "table") {
        var cols = Math.max.apply(null, b.rows.map(function (r) { return r.length; }));
        var rows = b.rows.map(function (row) {
          var cells = row.map(function (cell) {
            return new docx.TableCell({
              children: cell.blocks.map(paraFromBlock),
              shading: cell.header ? { fill: "EEF0F6" } : undefined
            });
          });
          while (cells.length < cols) cells.push(new docx.TableCell({ children: [new docx.Paragraph("")] }));
          return new docx.TableRow({ children: cells });
        });
        children.push(new docx.Table({
          rows: rows,
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
          borders: {
            top: { style: docx.BorderStyle.SINGLE, size: 4, color: "999999" },
            bottom: { style: docx.BorderStyle.SINGLE, size: 4, color: "999999" },
            left: { style: docx.BorderStyle.SINGLE, size: 4, color: "999999" },
            right: { style: docx.BorderStyle.SINGLE, size: 4, color: "999999" },
            insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 4, color: "999999" },
            insideVertical: { style: docx.BorderStyle.SINGLE, size: 4, color: "999999" }
          }
        }));
        return;
      }
      if (b.type === "blockquote") {
        children.push(new docx.Paragraph({
          children: runsToInlines(b.runs || []),
          alignment: alignOf(b.align, docx),
          indent: { left: 720 },
          border: { left: { style: docx.BorderStyle.SINGLE, size: 12, color: "4F46E5" } }
        }));
        return;
      }
      children.push(paraFromBlock(b));
    });

    var numbering = { config: [] };
    if (docx.LevelFormat) {
      numbering.config.push({
        reference: "txt-bul",
        levels: Array.from({ length: 9 }, function (_, lvl) {
          return {
            level: lvl,
            format: docx.LevelFormat.BULLET,
            text: "\u2022",
            alignment: docx.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } }
          };
        })
      });
      numbering.config.push({
        reference: "txt-num",
        levels: Array.from({ length: 9 }, function (_, lvl) {
          return {
            level: lvl,
            format: docx.LevelFormat.DECIMAL,
            text: "%" + (lvl + 1) + ".",
            alignment: docx.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } }
          };
        })
      });
    }

    return new docx.Document({
      numbering: numbering,
      sections: [{ children: children.length ? children : [new docx.Paragraph("")] }],
      title: title || "TXT document"
    });
  }

  function buildBlob(model, title) {
    var docx = (typeof window !== "undefined" && window.docx) || (typeof self !== "undefined" && self.docx);
    if (!docx) return Promise.reject(new Error("docx library not loaded"));
    var doc = buildDocument(docx, model, title);
    return docx.Packer.toBlob(doc);
  }

  return { buildDocument: buildDocument, buildBlob: buildBlob };
});
