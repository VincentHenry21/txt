/* TXTConvert: document model + format converters.
   Works in the browser (window.TXTConvert) and in Node (module.exports). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TXTConvert = api;
})(typeof self !== "undefined" ? self : this, function () {

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function escRtfText(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (s[i] === "\\") out += "\\\\";
      else if (s[i] === "{") out += "\\{";
      else if (s[i] === "}") out += "\\}";
      else if (s[i] === "\n") out += "\\line ";
      else if (c < 128) out += s[i];
      else {
        var v = c > 32767 ? c - 65536 : c;
        out += "\\u" + v + "?";
      }
    }
    return out;
  }
  function toHexColor(css) {
    if (!css) return null;
    css = String(css).trim().toLowerCase();
    if (css === "transparent") return null;
    var m = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return "#" + h;
    }
    m = css.match(/^rgba?\(([^)]+)\)/);
    if (m) {
      var p = m[1].split(",").map(function (x) { return parseFloat(x); });
      if (p.length >= 3 && p.slice(0, 3).every(function (n) { return !isNaN(n); })) {
        var hex = "#" + p.slice(0, 3).map(function (n) {
          var v = Math.max(0, Math.min(255, Math.round(n)));
          return (v < 16 ? "0" : "") + v.toString(16);
        }).join("");
        if (p.length === 4 && p[3] === 0) return null;
        return hex;
      }
    }
    return null;
  }
  function firstFont(ff) {
    if (!ff) return null;
    return ff.split(",")[0].trim().replace(/^["']|["']$/g, "") || null;
  }
  function pxSize(v) {
    if (!v) return null;
    var m = String(v).match(/([\d.]+)px/);
    return m ? parseFloat(m[1]) : null;
  }

  /* ---------------- DOM -> model ---------------- */
  function inlineProps(el, base) {
    var p = Object.assign({}, base);
    var tag = el.tagName;
    if (tag === "B" || tag === "STRONG") p.b = true;
    if (tag === "I" || tag === "EM") p.i = true;
    if (tag === "U") p.u = true;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") p.s = true;
    if (tag === "SUB") p.sub = true;
    if (tag === "SUP") p.sup = true;
    if (tag === "CODE") p.code = true;
    if (tag === "A" && el.getAttribute("href")) p.link = el.getAttribute("href");
    var st = el.style || {};
    if (st.fontWeight === "bold" || parseInt(st.fontWeight, 10) >= 600) p.b = true;
    if (st.fontStyle === "italic") p.i = true;
    var td = (st.textDecoration || "") + " " + (st.textDecorationLine || "");
    if (/underline/.test(td)) p.u = true;
    if (/line-through/.test(td)) p.s = true;
    var c = toHexColor(st.color);
    if (c) p.color = c;
    var bg = toHexColor(st.backgroundColor);
    if (bg) p.bg = bg;
    var sz = pxSize(st.fontSize);
    if (sz) p.size = sz;
    var ff = firstFont(st.fontFamily);
    if (ff) p.font = ff;
    return p;
  }

  function collectRuns(node, props, runs) {
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        var t = k.nodeValue;
        if (t) runs.push(Object.assign({ t: t }, props));
      } else if (k.nodeType === 1) {
        var tag = k.tagName;
        if (tag === "SCRIPT" || tag === "STYLE") continue;
        if (tag === "BR") { runs.push(Object.assign({ t: "\n", br: true }, props)); continue; }
        if (tag === "IMG") {
          runs.push({ img: { src: k.getAttribute("src") || "", w: k.naturalWidth || parseInt(k.getAttribute("width"), 10) || 0, h: k.naturalHeight || parseInt(k.getAttribute("height"), 10) || 0 } });
          continue;
        }
        if (tag === "SPAN" && k.classList && k.classList.contains("pagenum")) {
          runs.push(Object.assign({ t: "#", pageNum: true }, props));
          continue;
        }
        collectRuns(k, inlineProps(k, props), runs);
      }
    }
  }

  function blockAlign(el) {
    var a = (el.style && el.style.textAlign) || el.getAttribute("align") || "";
    a = String(a).toLowerCase();
    if (a === "center" || a === "right" || a === "justify") return a;
    return "left";
  }
  function blockIndent(el) {
    var m = String((el.style && el.style.marginLeft) || "").match(/([\d.]+)px/);
    return m ? parseFloat(m[1]) : 0;
  }

  function ptVal(v) {
    var m = String(v || "").match(/([\d.]+)pt/);
    return m ? parseFloat(m[1]) : 0;
  }
  function blockProps(el) {
    var st = el.style || {}, o = {};
    var bf = ptVal(st.marginTop), af = ptVal(st.marginBottom);
    if (bf || af) o.spacing = { before: bf, after: af };
    if (st.lineHeight) {
      o.line = st.lineHeight;
      if (el.dataset && el.dataset.lineRule) o.lineRule = el.dataset.lineRule;
    }
    var bg = toHexColor(st.backgroundColor);
    if (bg) o.bg = bg;
    var bb = String(st.borderBottom || ""), bd = String(st.border || "");
    if (/solid/i.test(bb)) o.border = "bottom";
    else if (/solid/i.test(bd)) o.border = "box";
    return o;
  }

  function domToModel(root) {
    var blocks = [];
    function paraFrom(el, type) {
      var runs = [];
      collectRuns(el, {}, runs);
      blocks.push(Object.assign({ type: type, align: blockAlign(el), indent: blockIndent(el), runs: runs }, blockProps(el)));
    }
    function listItems(listEl, depth, target) {
      var arr = target || blocks;
      var ordered = listEl.tagName === "OL";
      var items = listEl.children;
      var n = 0;
      for (var i = 0; i < items.length; i++) {
        var li = items[i];
        if (li.tagName !== "LI") continue;
        n++;
        var runs = [];
        var sub = [];
        for (var j = 0; j < li.childNodes.length; j++) {
          var c = li.childNodes[j];
          if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) sub.push(c);
          else {
            var tmp = document.createElement("span");
            tmp.appendChild(c.cloneNode(true));
            collectRuns(tmp, {}, runs);
          }
        }
        arr.push({ type: "li", align: blockAlign(li), indent: 0, runs: runs, list: { ordered: ordered, depth: depth, num: n } });
        for (var s = 0; s < sub.length; s++) listItems(sub[s], depth + 1, target);
      }
    }
    function tableFrom(el) {
      var rows = [];
      var trs = el.querySelectorAll("tr");
      for (var i = 0; i < trs.length; i++) {
        var cells = [];
        var tds = trs[i].children;
        for (var j = 0; j < tds.length; j++) {
          var td = tds[j];
          if (td.tagName !== "TD" && td.tagName !== "TH") continue;
          var cellBlocks = [];
          var kids = td.childNodes;
          if (!kids.length) { cellBlocks.push({ type: "p", align: "left", indent: 0, runs: [] }); }
          for (var k = 0; k < kids.length; k++) {
            var cn = kids[k];
            if (cn.nodeType === 3) {
              if (cn.nodeValue.trim()) cellBlocks.push({ type: "p", align: "left", indent: 0, runs: [{ t: cn.nodeValue }] });
            } else if (cn.nodeType === 1) {
              walkBlock(cn, cellBlocks);
            }
          }
          cells.push({ header: td.tagName === "TH", blocks: cellBlocks.length ? cellBlocks : [{ type: "p", align: "left", indent: 0, runs: [] }] });
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) blocks.push({ type: "table", rows: rows });
    }
    function walkBlock(el, target) {
      var tag = el.tagName;
      var push = function (b) { (target || blocks).push(b); };
      if (tag === "P" || tag === "DIV" || tag === "H1" || tag === "H2" || tag === "H3" || tag === "BLOCKQUOTE" || tag === "PRE") {
        var type = tag === "DIV" ? "p" : tag.toLowerCase();
        if (el.classList && el.classList.contains("page-break")) { push({ type: "pagebreak" }); return; }
        if (el.classList && el.classList.contains("toc")) {
          var entries = [];
          el.querySelectorAll(".toc-entry").forEach(function (en) {
            var tx = en.textContent.trim();
            if (tx) entries.push({ text: tx, level: Math.min(3, Math.round((parseFloat(en.style.paddingLeft) || 0) / 18) + 1) });
          });
          push({ type: "toc", entries: entries });
          return;
        }
        var runs = [];
        collectRuns(el, {}, runs);
        push(Object.assign({ type: type, align: blockAlign(el), indent: blockIndent(el), runs: runs }, blockProps(el)));
      } else if (tag === "UL" || tag === "OL") {
        listItems(el, 0, target);
      } else if (tag === "TABLE") {
        tableFrom(el);
      } else if (tag === "HR") {
        push({ type: "hr" });
      } else if (tag === "IMG") {
        push({ type: "p", align: "left", indent: 0, runs: [{ img: { src: el.getAttribute("src") || "", w: el.naturalWidth || 0, h: el.naturalHeight || 0 } }] });
      } else {
        var runs2 = [];
        collectRuns(el, {}, runs2);
        if (runs2.length) push({ type: "p", align: "left", indent: 0, runs: runs2 });
      }
    }
    var kids = root.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        if (k.nodeValue.trim()) blocks.push({ type: "p", align: "left", indent: 0, runs: [{ t: k.nodeValue }] });
      } else if (k.nodeType === 1) {
        walkBlock(k);
      }
    }
    // fix table cell blocks: tableFrom used walkBlock with target; nested tables edge ignored
    return blocks;
  }

  function runsText(runs) {
    return runs.map(function (r) {
      if (r.img) return "[image]";
      if (r.pageNum) return "#";
      return r.t || "";
    }).join("");
  }

  /* ---------------- model -> TXT ---------------- */
  function modelToText(blocks) {
    var lines = [];
    blocks.forEach(function (b) {
      if (b.type === "hr") { lines.push("---"); lines.push(""); return; }
      if (b.type === "pagebreak") { lines.push(""); return; }
      if (b.type === "table") {
        b.rows.forEach(function (row) {
          lines.push(row.map(function (c) {
            return c.blocks.map(function (bb) { return runsText(bb.runs); }).join(" ");
          }).join(" | "));
        });
        lines.push("");
        return;
      }
      var t = runsText(b.runs).replace(/\n/g, " ");
      if (b.type === "li" && b.list) {
        var pad = new Array(b.list.depth * 4 + 1).join(" ");
        t = pad + (b.list.ordered ? b.list.num + ". " : "- ") + t;
      }
      lines.push(t);
      lines.push("");
    });
    return lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /* ---------------- model -> Markdown ---------------- */
  function mdRun(r) {
    if (r.pageNum) return "#";
    if (r.img) return "![](" + (r.img.src.length > 200 ? "" : r.img.src) + ")";
    var t = (r.t || "").replace(/\n/g, "  \n");
    if (!t.trim()) return t;
    if (r.code) t = "`" + t + "`";
    if (r.b) t = "**" + t + "**";
    if (r.i) t = "*" + t + "*";
    if (r.s) t = "~~" + t + "~~";
    if (r.sub) t = "<sub>" + t + "</sub>";
    if (r.sup) t = "<sup>" + t + "</sup>";
    if (r.u) t = "<u>" + t + "</u>";
    if (r.link) t = "[" + t + "](" + r.link + ")";
    return t;
  }
  function modelToMarkdown(blocks) {
    var out = [];
    blocks.forEach(function (b) {
      var body = (b.runs || []).map(mdRun).join("");
      if (b.type === "h1") out.push("# " + body);
      else if (b.type === "h2") out.push("## " + body);
      else if (b.type === "h3") out.push("### " + body);
      else if (b.type === "blockquote") out.push(body.split("\n").map(function (l) { return "> " + l; }).join("\n"));
      else if (b.type === "pre") out.push("```\n" + b.runs.map(function (r) { return r.t || ""; }).join("") + "\n```");
      else if (b.type === "hr") out.push("---");
      else if (b.type === "pagebreak") out.push("---");
      else if (b.type === "li" && b.list) {
        var pad = new Array(b.list.depth * 2 + 1).join("  ");
        out.push(pad + (b.list.ordered ? b.list.num + ". " : "- ") + body);
      }
      else if (b.type === "table") {
        var rows = b.rows.map(function (row) {
          return "| " + row.map(function (c) {
            return c.blocks.map(function (bb) { return bb.runs.map(mdRun).join(" ").replace(/\|/g, "\\|"); }).join(" ");
          }).join(" | ") + " |";
        });
        if (rows.length) {
          var cols = b.rows[0].length;
          var sep = "| " + new Array(cols).fill("---").join(" | ") + " |";
          out.push(rows[0] + "\n" + sep + (rows.length > 1 ? "\n" + rows.slice(1).join("\n") : ""));
        }
      }
      else out.push(body);
      out.push("");
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /* ---------------- Markdown -> HTML (import) ---------------- */
  function markdownToHtml(md) {
    var lines = String(md).replace(/\r\n/g, "\n").split("\n");
    var html = [], inUl = false, inOl = false, inQuote = false, inCode = false;
    function inline(s) {
      s = escHtml(s);
      s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
      s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\">$1</a>");
      return s;
    }
    function closeLists() {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (inOl) { html.push("</ol>"); inOl = false; }
      if (inQuote) { html.push("</blockquote>"); inQuote = false; }
    }
    lines.forEach(function (ln) {
      if (/^```/.test(ln)) { closeLists(); inCode = !inCode; html.push(inCode ? "<pre>" : "</pre>"); return; }
      if (inCode) { html.push(escHtml(ln)); return; }
      var m;
      if ((m = ln.match(/^(#{1,3})\s+(.*)/))) { closeLists(); html.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); }
      else if (/^\s*---\s*$/.test(ln)) { closeLists(); html.push("<hr>"); }
      else if ((m = ln.match(/^&gt;\s?(.*)/)) || (m = ln.match(/^>\s?(.*)/))) {
        if (inUl || inOl) closeLists();
        if (!inQuote) { html.push("<blockquote>"); inQuote = true; }
        html.push(inline(m[1]) + "<br>");
      }
      else if ((m = ln.match(/^\s*[-*]\s+(.*)/))) {
        if (inOl) { html.push("</ol>"); inOl = false; }
        if (inQuote) { html.push("</blockquote>"); inQuote = false; }
        if (!inUl) { html.push("<ul>"); inUl = true; }
        html.push("<li>" + inline(m[1]) + "</li>");
      }
      else if ((m = ln.match(/^\s*\d+\.\s+(.*)/))) {
        if (inUl) { html.push("</ul>"); inUl = false; }
        if (inQuote) { html.push("</blockquote>"); inQuote = false; }
        if (!inOl) { html.push("<ol>"); inOl = true; }
        html.push("<li>" + inline(m[1]) + "</li>");
      }
      else if (/^\s*$/.test(ln)) { closeLists(); }
      else { closeLists(); html.push("<p>" + inline(ln) + "</p>"); }
    });
    closeLists();
    if (inCode) html.push("</pre>");
    return html.join("\n");
  }

  /* ---------------- model -> HTML ---------------- */
  function htmlRun(r) {
    if (r.pageNum) return '<span class="pagenum">#</span>';
    if (r.img) {
      var dims = "";
      if (r.img.w) dims += ' width="' + r.img.w + '"';
      return '<img src="' + escHtml(r.img.src) + '"' + dims + ' style="max-width:100%">';
    }
    var t = escHtml(r.t || "").replace(/\n/g, "<br>");
    var st = [];
    if (r.b) t = "<strong>" + t + "</strong>";
    if (r.i) t = "<em>" + t + "</em>";
    if (r.u) st.push("text-decoration:underline");
    if (r.s) st.push("text-decoration:line-through");
    if (r.sub) t = "<sub>" + t + "</sub>";
    if (r.sup) t = "<sup>" + t + "</sup>";
    if (r.code) st.push("font-family:monospace");
    if (r.color) st.push("color:" + r.color);
    if (r.bg) st.push("background-color:" + r.bg);
    if (r.size) st.push("font-size:" + r.size + "px");
    if (r.font) st.push("font-family:'" + r.font.replace(/'/g, "") + "'");
    if (st.length) t = '<span style="' + st.join(";") + '">' + t + "</span>";
    if (r.link) t = '<a href="' + escHtml(r.link) + '">' + t + "</a>";
    return t;
  }
  function blockStyleAttr(b) {
    var s = [];
    if (b.align && b.align !== "left") s.push("text-align:" + b.align);
    if (b.spacing) {
      if (b.spacing.before) s.push("margin-top:" + b.spacing.before + "pt");
      if (b.spacing.after) s.push("margin-bottom:" + b.spacing.after + "pt");
    }
    if (b.line) s.push("line-height:" + b.line);
    if (b.bg) s.push("background-color:" + b.bg);
    if (b.border === "bottom") s.push("border-bottom:1pt solid #999");
    else if (b.border === "box") s.push("border:1pt solid #999");
    return s.length ? ' style="' + s.join(";") + '"' : "";
  }
  function modelToHtmlBody(blocks) {
    var out = [], listOpen = null, listDepth = -1;
    function closeList() {
      while (listOpen) { out.push("</" + listOpen + ">"); listOpen = null; }
      listDepth = -1;
    }
    blocks.forEach(function (b) {
      var body = (b.runs || []).map(htmlRun).join("") || "<br>";
      var bsa = blockStyleAttr(b);
      if (b.type === "li" && b.list) {
        var tag = b.list.ordered ? "ol" : "ul";
        if (listOpen !== tag) { closeList(); out.push("<" + tag + ">"); listOpen = tag; }
        out.push("<li>" + body + "</li>");
        return;
      }
      closeList();
      if (b.type === "h1" || b.type === "h2" || b.type === "h3") out.push("<" + b.type + bsa + ">" + body + "</" + b.type + ">");
      else if (b.type === "blockquote") out.push("<blockquote" + bsa + ">" + body + "</blockquote>");
      else if (b.type === "pre") out.push("<pre" + bsa + ">" + body + "</pre>");
      else if (b.type === "hr") out.push("<hr>");
      else if (b.type === "pagebreak") out.push('<div style="page-break-after:always"></div>');
      else if (b.type === "toc") {
        out.push('<div class="toc"><h2>Contents</h2>' + (b.entries || []).map(function (e) {
          return '<p style="padding-left:' + ((e.level - 1) * 18) + 'px">' + escHtml(e.text) + "</p>";
        }).join("") + "</div>");
      }
      else if (b.type === "table") {
        out.push('<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">');
        b.rows.forEach(function (row) {
          out.push("<tr>");
          row.forEach(function (c) {
            var cell = c.blocks.map(function (bb) { return bb.runs.map(htmlRun).join("") || "<br>"; }).join("<br>");
            out.push(c.header ? "<th>" + cell + "</th>" : "<td>" + cell + "</td>");
          });
          out.push("</tr>");
        });
        out.push("</table>");
      }
      else out.push("<p" + bsa + ">" + body + "</p>");
    });
    closeList();
    return out.join("\n");
  }
  function modelToHtmlDoc(blocks, title, fontLink, opts) {
    opts = opts || {};
    var colCss = opts.columns > 1 ? "main{column-count:" + opts.columns + ";column-gap:40px}" : "";
    var wm = "";
    if (opts.watermark && opts.watermark.text) {
      var w = opts.watermark;
      wm = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5">' +
        '<div style="font-size:' + (w.size || 72) + "px;font-weight:800;letter-spacing:4px;white-space:nowrap;color:" +
        (w.color || "#9aa0b4") + ";opacity:" + (w.opacity != null ? w.opacity : 0.18) +
        (w.style === "horizontal" ? "" : ";transform:rotate(-38deg)") + '">' + escHtml(w.text) + "</div></div>";
    }
    var hf = (opts.headerHtml ? "<header>" + opts.headerHtml + "</header>" : "") +
      (opts.footerHtml ? "<footer>" + opts.footerHtml + "</footer>" : "");
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' +
      escHtml(title || "TXT document") +
      '</title>\n' + (fontLink || "") +
      '<style>body{font-family:Calibri,Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}' + colCss + 'table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px 10px}img{max-width:100%}header{border-bottom:1px solid #ccc;margin-bottom:20px;color:#555}footer{border-top:1px solid #ccc;margin-top:20px;color:#555}</style>\n</head>\n<body>\n' + wm + '<main>\n' +
      modelToHtmlBody(blocks) + "\n</main>\n" + hf + "</body>\n</html>\n";
  }

  /* ---------------- model -> DOC (Word HTML) ---------------- */
  function modelToWordHtml(blocks, title, opts) {
    opts = opts || {};
    var hf = (opts.headerHtml ? '<div style="border-bottom:1pt solid #999;color:#555;font-size:9pt">' + opts.headerHtml + "</div>" : "") +
      (opts.footerHtml ? '<div style="border-top:1pt solid #999;color:#555;font-size:9pt">' + opts.footerHtml + "</div>" : "");
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n<head>\n<meta charset="utf-8">\n<title>' +
      escHtml(title || "TXT document") +
      '</title>\n<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->\n<style>\n@page{size:8.27in 11.69in;margin:1in}\nbody{font-family:Calibri,Arial,sans-serif;font-size:11pt}\ntable{border-collapse:collapse}\ntd,th{border:1pt solid #999;padding:4pt 8pt}\n</style>\n</head>\n<body>\n' +
      hf + modelToHtmlBody(blocks) + "\n</body>\n</html>";
  }

  /* ---------------- model -> RTF ---------------- */
  function htmlToTextLines(html) {
    return String(html || "")
      .replace(/<span[^>]*pagenum[^>]*>.*?<\/span>/gi, " [#] ")
      .replace(/<\/(p|div|h\d|li|tr|blockquote)>/gi, "\n")
      .replace(/<br[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n").map(function (s) { return s.replace(/\s+/g, " ").trim(); })
      .filter(function (s) { return s; });
  }
  function pageFieldRtf(s) {
    return s.split("[#]").join("{\\field{\\*\\fldinst PAGE}}");
  }
  function modelToRtf(blocks, title, opts) {
    opts = opts || {};
    var fonts = [], colors = [];
    function fontIdx(name) {
      var i = fonts.indexOf(name);
      if (i < 0) { fonts.push(name); i = fonts.length - 1; }
      return i;
    }
    function colorIdx(hex) {
      if (!hex) return 0;
      var i = colors.indexOf(hex);
      if (i < 0) { colors.push(hex); i = colors.length - 1; }
      return i + 1;
    }
    fontIdx("Calibri");
    blocks.forEach(function (b) {
      (b.runs || []).forEach(function (r) {
        if (r.font) fontIdx(r.font);
        if (r.color) colorIdx(r.color);
        if (r.bg) colorIdx(r.bg);
      });
      (b.rows || []).forEach(function (row) {
        row.forEach(function (c) {
          c.blocks.forEach(function (bb) {
            bb.runs.forEach(function (r) {
              if (r.font) fontIdx(r.font);
              if (r.color) colorIdx(r.color);
              if (r.bg) colorIdx(r.bg);
            });
          });
        });
      });
    });
    var out = ["{\\rtf1\\ansi\\deff0"];
    out.push("{\\fonttbl" + fonts.map(function (f, i) { return "{\\f" + i + " " + f.replace(/[{}]/g, "") + ";}"; }).join("") + "}");
    out.push("{\\colortbl;" + colors.map(function (c) {
      var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b2 = parseInt(c.slice(5, 7), 16);
      return "\\red" + r + "\\green" + g + "\\blue" + b2 + ";";
    }).join("") + "}");
    if (opts.columns > 1) out.push("\\cols" + opts.columns + "\\colsx720");
    if (opts.headerHtml) {
      htmlToTextLines(opts.headerHtml).forEach(function (ln) {
        out.push("{\\header\\pard\\qc " + pageFieldRtf(escRtfText(ln)) + "\\par}");
      });
    }
    if (opts.footerHtml) {
      htmlToTextLines(opts.footerHtml).forEach(function (ln) {
        out.push("{\\footer\\pard\\qc " + pageFieldRtf(escRtfText(ln)) + "\\par}");
      });
    }
    var alignMap = { left: "\\ql", center: "\\qc", right: "\\qr", justify: "\\qj" };
    function runRtf(r, para) {
      var s = "";
      if (r.pageNum) return "{\\field{\\*\\fldinst PAGE}}";
      if (r.img) {
        var src = r.img.src || "";
        var m = src.match(/^data:image\/(png|jpeg|jpg);base64,(.*)$/);
        if (m) {
          var kind = m[1] === "png" ? "\\pngblip" : "\\jpegblip";
          var w = r.img.w || 300, h = r.img.h || 200;
          var maxW = 9360;
          var tw = Math.round(w * 15), th = Math.round(h * 15);
          if (tw > maxW) { th = Math.round(th * maxW / tw); tw = maxW; }
          s += "{\\pict" + kind + "\\picwgoal" + tw + "\\pichgoal" + th + " " + m[2].replace(/\s/g, "") + "}";
        }
        return s;
      }
      var t = r.t || "";
      if (!t) return "";
      if (r.b) s += "\\b ";
      if (r.i) s += "\\i ";
      if (r.u) s += "\\ul ";
      if (r.s) s += "\\strike ";
      if (r.sub) s += "\\sub ";
      if (r.sup) s += "\\super ";
      if (r.font) s += "\\f" + fontIdx(r.font) + " ";
      if (r.size) s += "\\fs" + Math.round(r.size * 1.5) + " ";
      if (r.color) s += "\\cf" + colorIdx(r.color) + " ";
      if (r.bg) s += "\\highlight" + colorIdx(r.bg) + " ";
      s += escRtfText(t);
      if (r.b) s += "\\b0 ";
      if (r.i) s += "\\i0 ";
      if (r.u) s += "\\ul0 ";
      if (r.s) s += "\\strike0 ";
      if (r.sub || r.sup) s += "\\nosupersub ";
      if (r.color) s += "\\cf0 ";
      if (r.bg) s += "\\highlight0 ";
      return s;
    }
    function paraRtf(b, extra) {
      var p = "\\pard" + (alignMap[b.align] || "\\ql") + " ";
      if (b.indent) p += "\\li" + Math.round(b.indent * 15) + " ";
      if (b.spacing) {
        if (b.spacing.before) p += "\\sb" + Math.round(b.spacing.before * 20) + " ";
        if (b.spacing.after) p += "\\sa" + Math.round(b.spacing.after * 20) + " ";
      } else {
        p += "\\sa120 ";
      }
      if (b.line) {
        var lm = String(b.line).match(/([\d.]+)pt/);
        if (lm) p += "\\sl-" + Math.round(parseFloat(lm[1]) * 20) + "\\slmult0 ";
        else {
          var mult = parseFloat(b.line);
          if (mult) p += "\\sl" + Math.round(mult * 240) + "\\slmult1 ";
        }
      }
      var body = b.runs.map(function (r) { return runRtf(r); }).join("");
      if (b.type === "li" && b.list) {
        var li = Math.round((b.list.depth * 36 + 36) * 15);
        p = "\\pard" + (alignMap[b.align] || "\\ql") + " \\fi-360\\li" + li + " ";
        var marker = b.list.ordered ? b.list.num + ".\\tab " : "\\bullet\\tab ";
        return p + marker + body + "\\par\n";
      }
      return p + (extra || "") + body + "\\par\n";
    }
    blocks.forEach(function (b) {
      if (b.type === "hr") { out.push("\\pard\\qc \\sa120 \\emdash\\emdash\\emdash\\par\n"); return; }
      if (b.type === "pagebreak") { out.push("\\pard\\page\\par\n"); return; }
      if (b.type === "toc") {
        out.push("\\pard\\qc\\b Contents\\b0\\par\n");
        (b.entries || []).forEach(function (e) {
          out.push("\\pard\\li" + ((e.level - 1) * 360 + 360) + " " + pageFieldRtf(escRtfText(e.text)) + "\\par\n");
        });
        return;
      }
      if (b.type === "h1" || b.type === "h2" || b.type === "h3") {
        var sz = b.type === "h1" ? 32 : b.type === "h2" ? 26 : 22;
        out.push(paraRtf({ type: "p", align: b.align, indent: 0, runs: b.runs.map(function (r) { return Object.assign({}, r, { b: true, size: r.size || sz / 1.5 }); }) }));
        return;
      }
      if (b.type === "table") {
        var cols = Math.max.apply(null, b.rows.map(function (r) { return r.length; }));
        var cw = Math.floor(9360 / cols);
        b.rows.forEach(function (row) {
          var tdef = "\\trowd\\trgaph60";
          for (var i = 0; i < cols; i++) tdef += "\\cellx" + (cw * (i + 1));
          out.push(tdef + "\n");
          row.forEach(function (c) {
            c.blocks.forEach(function (bb, bi) {
              out.push("{\\intbl " + paraRtf(bb).replace(/\\par\n$/, "") + "\\cell}\n");
            });
          });
          out.push("\\row\n");
        });
        return;
      }
      if (b.type === "blockquote") {
        out.push(paraRtf({ type: "p", align: b.align, indent: 36, runs: b.runs }));
        return;
      }
      out.push(paraRtf(b));
    });
    out.push("}");
    return out.join("");
  }

  /* ---------------- CRC32 + stored ZIP ---------------- */
  var CRC_TABLE = (function () {
    var t = new Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;
    function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);
      var lh = [0x50, 0x4B, 0x03, 0x04].concat(u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var header = new Uint8Array(lh.concat(Array.prototype.slice.call(name)));
      chunks.push(header, data);
      var ch = [0x50, 0x4B, 0x01, 0x02].concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(ch.concat(Array.prototype.slice.call(name))));
      offset += header.length + data.length;
    });
    var cdStart = offset;
    var cdSize = 0;
    central.forEach(function (c) { chunks.push(c); cdSize += c.length; });
    var end = new Uint8Array([0x50, 0x4B, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0)));
    chunks.push(end);
    var total = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  /* ---------------- model -> ODT ---------------- */
  function odtTextWithPageNum(s) {
    return escXml(s).split("[#]").join("<text:page-number/>");
  }
  function modelToOdt(blocks, title, opts) {
    opts = opts || {};
    var enc = new TextEncoder();
    var pStyles = {}, tStyles = {}, pCount = 0, tCount = 0;
    function pKey(o) { return JSON.stringify(o); }
    function getPStyle(o) {
      var k = pKey(o);
      if (!pStyles[k]) {
        pCount++;
        var pp = [];
        if (o.align && o.align !== "left") pp.push('fo:text-align="' + o.align + '"');
        if (o.breakAfter) pp.push('fo:break-after="page"');
        if (o.borderBottom) pp.push('fo:border-bottom="0.5pt solid #999999" fo:padding-bottom="2pt"');
        if (o.before) pp.push('fo:margin-top="' + o.before + 'pt"');
        if (o.after) pp.push('fo:margin-bottom="' + o.after + 'pt"');
        if (o.line) pp.push('fo:line-height="' + escXml(String(o.line)) + '"');
        if (o.bg) pp.push('fo:background-color="' + o.bg + '"');
        var tp = [];
        if (o.bold) tp.push('fo:font-weight="bold"');
        if (o.size) tp.push('fo:font-size="' + o.size + 'pt"');
        pStyles[k] = { name: "P" + pCount, para: pp, text: tp };
      }
      return pStyles[k].name;
    }
    function pStyleOf(b, extra) {
      var o = Object.assign({ align: b.align }, extra);
      if (b.spacing) { o.before = b.spacing.before; o.after = b.spacing.after; }
      if (b.line) o.line = b.line;
      if (b.bg) o.bg = b.bg;
      return getPStyle(o);
    }
    function getTStyle(o) {
      var k = pKey(o);
      if (!tStyles[k]) {
        tCount++;
        var tp = [];
        if (o.b) tp.push('fo:font-weight="bold"');
        if (o.i) tp.push('fo:font-style="italic"');
        if (o.u) tp.push('style:text-underline-style="solid"');
        if (o.s) tp.push('style:text-line-through-style="solid"');
        if (o.color) tp.push('fo:color="' + o.color + '"');
        if (o.bg) tp.push('fo:background-color="' + o.bg + '"');
        if (o.size) tp.push('fo:font-size="' + Math.round(o.size * 0.75 * 10) / 10 + 'pt"');
        if (o.font) tp.push('style:font-name="' + escXml(o.font) + '"');
        tStyles[k] = { name: "T" + tCount, text: tp };
      }
      return tStyles[k].name;
    }
    var images = [], imgCount = 0;
    function odtRun(r) {
      if (r.pageNum) return "<text:page-number/>";
      if (r.img) {
        var src = r.img.src || "";
        var m = src.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.*)$/s);
        if (!m) return "";
        imgCount++;
        var ext = m[1] === "jpeg" ? "jpg" : m[1];
        var iname = "Pictures/img" + imgCount + "." + ext;
        var bin = Uint8Array.from(atob(m[2].replace(/\s/g, "")), function (c) { return c.charCodeAt(0); });
        images.push({ name: iname, data: bin, mime: "image/" + (ext === "jpg" ? "jpeg" : ext) });
        var w = r.img.w || 400, h = r.img.h || 300;
        var maxW = 15;
        var wc = w / 96 * 2.54, hc = h / 96 * 2.54;
        if (wc > maxW) { hc = hc * maxW / wc; wc = maxW; }
        return '<draw:frame draw:name="img' + imgCount + '" text:anchor-type="as-char" svg:width="' +
          wc.toFixed(2) + 'cm" svg:height="' + hc.toFixed(2) + 'cm" draw:z-index="0"><draw:image xlink:href="' +
          iname + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>';
      }
      var t = escXml(r.t || "").replace(/\n/g, "<text:line-break/>");
      var key = { b: !!r.b, i: !!r.i, u: !!r.u, s: !!r.s, color: r.color || null, bg: r.bg || null, size: r.size || null, font: r.font || null };
      var has = r.b || r.i || r.u || r.s || r.color || r.bg || r.size || r.font || r.code;
      if (r.code && !r.font) key.font = "Courier New";
      var inner = has ? '<text:span text:style-name="' + getTStyle(key) + '">' + t + "</text:span>" : t;
      if (r.link) inner = '<text:a xlink:type="simple" xlink:href="' + escXml(r.link) + '">' + inner + "</text:a>";
      return inner;
    }
    function odtPara(b, forceStyle) {
      var runs = b.runs.map(odtRun).join("") || "";
      var st = forceStyle || pStyleOf(b, {});
      return '<text:p text:style-name="' + st + '">' + runs + "</text:p>";
    }
    var body = [];
    var i = 0;
    function listLevelProps(depth, ordered) {
      var indent = (0.6 + depth * 0.6).toFixed(2);
      if (ordered) return '<text:list-level-style-number text:level="' + (depth + 1) + '" num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' + indent + 'cm" fo:text-indent="-0.6cm" fo:margin-left="' + indent + 'cm"/></style:list-level-properties></text:list-level-style-number>';
      return '<text:list-level-style-bullet text:level="' + (depth + 1) + '" text:bullet-char="\u2022"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' + indent + 'cm" fo:text-indent="-0.6cm" fo:margin-left="' + indent + 'cm"/></style:list-level-properties></text:list-level-style-bullet>';
    }
    while (i < blocks.length) {
      var b = blocks[i];
      if (b.type === "li" && b.list) {
        var ordered = b.list.ordered;
        var items = [];
        while (i < blocks.length && blocks[i].type === "li" && blocks[i].list && blocks[i].list.ordered === ordered) {
          items.push(blocks[i]); i++;
        }
        var styleName = ordered ? "Lnum" : "Lbul";
        var stack = [];
        var html = "";
        items.forEach(function (it) {
          var d = it.list.depth;
          while (stack.length > d + 1) { html += "</text:list>"; stack.pop(); }
          while (stack.length < d + 1) { html += '<text:list text:style-name="' + styleName + '">'; stack.push(1); }
          html += "<text:list-item>" + odtPara({ type: "p", align: it.align, runs: it.runs }) + "</text:list-item>";
        });
        while (stack.length) { html += "</text:list>"; stack.pop(); }
        body.push(html);
        continue;
      }
      if (b.type === "h1" || b.type === "h2" || b.type === "h3") {
        var lvl = parseInt(b.type[1], 10);
        var st = pStyleOf(b, { bold: true, size: lvl === 1 ? 18 : lvl === 2 ? 15 : 13 });
        body.push('<text:h text:style-name="' + st + '" text:outline-level="' + lvl + '">' + b.runs.map(odtRun).join("") + "</text:h>");
      }
      else if (b.type === "blockquote") body.push(odtPara({ type: "p", align: b.align, runs: b.runs }, pStyleOf(b, {})));
      else if (b.type === "toc") {
        body.push('<text:p text:style-name="' + getPStyle({ bold: true, size: 14 }) + '">Contents</text:p>');
        (b.entries || []).forEach(function (e) {
          body.push('<text:p text:style-name="' + getPStyle({}) + '">' + escXml(e.text) + "</text:p>");
        });
      }
      else if (b.type === "hr") body.push('<text:p text:style-name="' + getPStyle({ borderBottom: true }) + '"></text:p>');
      else if (b.type === "pagebreak") body.push('<text:p text:style-name="' + getPStyle({ breakAfter: true }) + '"></text:p>');
      else if (b.type === "table") {
        var cols = Math.max.apply(null, b.rows.map(function (r) { return r.length; }));
        var t = ['<table:table table:name="T' + (i + 1) + '">'];
        for (var ci = 0; ci < cols; ci++) t.push('<table:table-column table:style-name="TCw"/>');
        b.rows.forEach(function (row) {
          t.push("<table:table-row>");
          row.forEach(function (cell) {
            t.push('<table:table-cell table:style-name="TCb" office:value-type="string">');
            cell.blocks.forEach(function (cb) { t.push(odtPara(cb)); });
            t.push("</table:table-cell>");
          });
          for (var pad = row.length; pad < cols; pad++) t.push('<table:table-cell table:style-name="TCb"><text:p text:style-name="' + getPStyle({}) + '"/></table:table-cell>');
          t.push("</table:table-row>");
        });
        t.push("</table:table>");
        body.push(t.join(""));
      }
      else body.push(odtPara(b));
      i++;
    }
    var autoStyles = [];
    Object.keys(pStyles).forEach(function (k) {
      var s = pStyles[k];
      autoStyles.push('<style:style style:name="' + s.name + '" style:family="paragraph" style:parent-style-name="Standard">' +
        (s.para.length ? '<style:paragraph-properties ' + s.para.join(" ") + "/>" : "") +
        (s.text.length ? '<style:text-properties ' + s.text.join(" ") + "/>" : "") + "</style:style>");
    });
    Object.keys(tStyles).forEach(function (k) {
      var s2 = tStyles[k];
      autoStyles.push('<style:style style:name="' + s2.name + '" style:family="text"><style:text-properties ' + s2.text.join(" ") + "/></style:style>");
    });
    var listStyles = '<text:list-style style:name="Lbul">' + [0, 1, 2, 3, 4].map(function (d) { return listLevelProps(d, false); }).join("") + "</text:list-style>" +
      '<text:list-style style:name="Lnum">' + [0, 1, 2, 3, 4].map(function (d) { return listLevelProps(d, true); }).join("") + "</text:list-style>";
    var PAPER_CM = { a4: [21, 29.7], letter: [21.59, 27.94], legal: [21.59, 35.56], a5: [14.8, 21] };
    var pdims = PAPER_CM[opts.paper] || PAPER_CM.a4;
    var pland = opts.orient === "landscape";
    var ppw = (pland ? pdims[1] : pdims[0]).toFixed(2), pph = (pland ? pdims[0] : pdims[1]).toFixed(2);
    var colXml = opts.columns > 1 ? '<style:columns fo:column-count="' + opts.columns + '"/>' : "";
    var pageLayoutXml = '<style:page-layout style:name="PM0">' +
      '<style:page-layout-properties fo:page-width="' + ppw + 'cm" fo:page-height="' + pph + 'cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm">' + colXml + "</style:page-layout-properties>" +
      '<style:header-style><style:header-footer-properties fo:min-height="0.8cm"/></style:header-style>' +
      '<style:footer-style><style:header-footer-properties fo:min-height="0.8cm"/></style:footer-style>' +
      "</style:page-layout>";
    function hfParas(html) {
      return htmlToTextLines(html).map(function (ln) {
        return '<text:p text:style-name="HF">' + odtTextWithPageNum(ln) + "</text:p>";
      }).join("");
    }
    var masterXml = '<style:master-page style:name="Default" style:page-layout-name="PM0">' +
      (opts.headerHtml ? "<style:header>" + hfParas(opts.headerHtml) + "</style:header>" : "") +
      (opts.footerHtml ? "<style:footer>" + hfParas(opts.footerHtml) + "</style:footer>" : "") +
      "</style:master-page>";
    var hfStyle = '<style:style style:name="HF" style:family="paragraph"><style:text-properties fo:font-size="9pt" fo:color="#555555"/></style:style>';
    var contentXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2">\n' +
      "<office:automatic-styles>" + pageLayoutXml + hfStyle + autoStyles.join("") + listStyles +
      '<style:style style:name="TCw" style:family="table-column"><style:table-column-properties style:column-width="3cm"/></style:style>' +
      '<style:style style:name="TCb" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #999999" fo:padding="2pt"/></style:style>' +
      "</office:automatic-styles>\n" +
      "<office:master-styles>" + masterXml + "</office:master-styles>\n" +
      "<office:body><office:text>" + body.join("") + "</office:text></office:body>\n" +
      "</office:document-content>";
    var stylesXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">\n' +
      '<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.2cm"/><style:text-properties style:font-name="Calibri" fo:font-size="11pt"/></style:default-style>' +
      '<style:style style:name="Standard" style:family="paragraph" style:class="text"/></office:styles>\n' +
      "</office:document-styles>";
    var manifestFiles = [
      { fullPath: "/", type: "application/vnd.oasis.opendocument.text" },
      { fullPath: "content.xml", type: "text/xml" },
      { fullPath: "styles.xml", type: "text/xml" }
    ];
    images.forEach(function (im) { manifestFiles.push({ fullPath: im.name, type: im.mime }); });
    var manifestXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">\n' +
      manifestFiles.map(function (f) { return '<manifest:file-entry manifest:full-path="' + f.fullPath + '" manifest:media-type="' + f.type + '"/>'; }).join("\n") +
      "\n</manifest:manifest>";
    var files = [
      { name: "mimetype", data: enc.encode("application/vnd.oasis.opendocument.text") },
      { name: "content.xml", data: enc.encode(contentXml) },
      { name: "styles.xml", data: enc.encode(stylesXml) },
      { name: "META-INF/manifest.xml", data: enc.encode(manifestXml) }
    ];
    images.forEach(function (im) { files.push({ name: im.name, data: im.data }); });
    return zipStore(files);
  }

  /* ---------------- sanitize pasted/imported HTML ---------------- */
  function sanitizeHtml(html) {
    if (typeof DOMParser === "undefined") return html;
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach(function (el) { el.remove(); });
    doc.querySelectorAll("*").forEach(function (el) {
      for (var i = el.attributes.length - 1; i >= 0; i--) {
        var a = el.attributes[i];
        if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      }
    });
    return doc.body.innerHTML;
  }

  return {
    escHtml: escHtml,
    domToModel: domToModel,
    modelToText: modelToText,
    modelToMarkdown: modelToMarkdown,
    markdownToHtml: markdownToHtml,
    modelToHtmlDoc: modelToHtmlDoc,
    modelToHtmlBody: modelToHtmlBody,
    modelToWordHtml: modelToWordHtml,
    modelToRtf: modelToRtf,
    modelToOdt: modelToOdt,
    sanitizeHtml: sanitizeHtml,
    crc32: crc32,
    zipStore: zipStore
  };
});
