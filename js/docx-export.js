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

  var PAPER_TWIPS = { a4: [11906, 16838], letter: [12240, 15840], legal: [12240, 20160], a5: [8391, 11906] };

  function buildDocument(docx, model, title, opts) {
    opts = opts || {};
    var children = [];

    function textRun(r) {
      if (r.pageNum) return new docx.SimpleField("PAGE", "#");
      var opts2 = { text: r.t || "" };
      if (r.b) opts2.bold = true;
      if (r.i) opts2.italics = true;
      if (r.u) opts2.underline = {};
      if (r.s) opts2.strike = true;
      if (r.sub) opts2.subScript = true;
      if (r.sup) opts2.superScript = true;
      if (r.color) opts2.color = hexNoHash(r.color);
      if (r.bg) opts2.highlight = nearestHighlight(r.bg);
      if (r.size) opts2.size = halfPoints(r.size);
      if (r.font) opts2.font = r.font;
      var run = new docx.TextRun(opts2);
      if (r.link) {
        return new docx.ExternalHyperlink({
          children: [new docx.TextRun(Object.assign({}, opts2, { style: "Hyperlink" }))],
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
        if (r.pageNum) { flush(); parts.push(textRun(r)); return; }
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
      var popts = { children: runsToInlines(b.runs || []) };
      if (b.type === "h1") popts.heading = docx.HeadingLevel.HEADING_1;
      else if (b.type === "h2") popts.heading = docx.HeadingLevel.HEADING_2;
      else if (b.type === "h3") popts.heading = docx.HeadingLevel.HEADING_3;
      popts.alignment = alignOf(b.align, docx);
      if (b.indent) popts.indent = { left: Math.round(b.indent * 15) };
      var sp = {};
      if (b.spacing) {
        if (b.spacing.before) sp.before = Math.round(b.spacing.before * 20);
        if (b.spacing.after) sp.after = Math.round(b.spacing.after * 20);
      }
      if (b.line) {
        var m = String(b.line).match(/([\d.]+)pt/);
        if (m) {
          sp.line = Math.round(parseFloat(m[1]) * 20);
          sp.lineRule = b.lineRule === "atleast" ? "atLeast" : "exact";
        } else {
          var mult = parseFloat(b.line);
          if (mult) { sp.line = Math.round(mult * 240); sp.lineRule = "auto"; }
        }
      }
      if (sp.before || sp.after || sp.line) popts.spacing = sp;
      if (b.bg) popts.shading = { fill: hexNoHash(b.bg) };
      if (b.border === "bottom") popts.border = { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" } };
      else if (b.border === "box") popts.border = {
        top: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" },
        bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" },
        left: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" },
        right: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" }
      };
      return new docx.Paragraph(popts);
    }

    function blocksToChildren(blocks) {
      var out = [];
      blocks.forEach(function (b) {
        if (b.type === "li" && b.list) {
          var ref = b.list.ordered ? "txt-num" : "txt-bul";
          out.push(new docx.Paragraph({
            children: runsToInlines(b.runs || []),
            alignment: alignOf(b.align, docx),
            numbering: { reference: ref, level: Math.min(b.list.depth, 8) }
          }));
          return;
        }
        if (b.type === "hr") {
          out.push(new docx.Paragraph({
            children: [new docx.TextRun("")],
            border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" } }
          }));
          return;
        }
        if (b.type === "pagebreak") {
          out.push(new docx.Paragraph({ children: [new docx.TextRun({ break: 1, breakType: "page" })] }));
          return;
        }
        if (b.type === "toc") {
          try {
            out.push(new docx.TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }));
          } catch (e) {
            out.push(new docx.Paragraph({ children: [new docx.TextRun({ text: "Contents", bold: true })] }));
            (b.entries || []).forEach(function (en) {
              out.push(new docx.Paragraph({
                children: [new docx.TextRun(en.text)],
                indent: { left: (en.level - 1) * 360 }
              }));
            });
          }
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
          out.push(new docx.Table({
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
          out.push(new docx.Paragraph({
            children: runsToInlines(b.runs || []),
            alignment: alignOf(b.align, docx),
            indent: { left: 720 },
            border: { left: { style: docx.BorderStyle.SINGLE, size: 12, color: "4F46E5" } }
          }));
          return;
        }
        out.push(paraFromBlock(b));
      });
      return out;
    }

    children = blocksToChildren(model);

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

    var dims = PAPER_TWIPS[opts.paper] || PAPER_TWIPS.a4;
    var sectionProps = {
      page: {
        size: {
          width: dims[0],
          height: dims[1],
          orientation: opts.orient === "landscape" ? "landscape" : "portrait"
        }
      }
    };
    if (opts.diffFirst) sectionProps.titlePage = true;
    var section = { children: children.length ? children : [new docx.Paragraph("")], properties: sectionProps };
    function hfDoc(kind, blocks) {
      if (!blocks || !blocks.length) return null;
      try {
        var kids = blocksToChildren(blocks);
        return kind === "header" ? new docx.Header({ children: kids }) : new docx.Footer({ children: kids });
      } catch (e) { return null; }
    }
    var hdr = hfDoc("header", opts.headerBlocks), ftr = hfDoc("footer", opts.footerBlocks);
    if (hdr || ftr) {
      section.headers = {};
      section.footers = {};
      if (hdr) section.headers.default = hdr;
      if (ftr) section.footers.default = ftr;
      if (opts.diffFirst) {
        if (hdr) section.headers.first = new docx.Header({ children: [new docx.Paragraph("")] });
        if (ftr) section.footers.first = new docx.Footer({ children: [new docx.Paragraph("")] });
      }
    }

    return new docx.Document({
      numbering: numbering,
      sections: [section],
      title: title || "TXT document"
    });
  }

  function buildBlob(model, title, opts) {
    var docx = (typeof window !== "undefined" && window.docx) || (typeof self !== "undefined" && self.docx);
    if (!docx) return Promise.reject(new Error("docx library not loaded"));
    var doc = buildDocument(docx, model, title, opts);
    return docx.Packer.toBlob(doc);
  }

  return { buildDocument: buildDocument, buildBlob: buildBlob };
});
