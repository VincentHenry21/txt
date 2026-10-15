/* GRD spreadsheet app for the TXT ecosystem.
   Dependency-free IIFE module. Builds its UI lazily into #view-grd.
   T.grd = { show, hide, newGrid, setCell, getCell, getValue, evaluate,
             parse, openDoc, current, newDoc, pushLiveTable, ... }.
   Pure engine (tokenizer, parser, evaluator, dependency recalc) is DOM-free
   and fully unit-testable; the UI layer sits on top.
   Contract: listens on T.bus 'ecosystem:app' for app==='grd'; persists via
   T.store 'grd' namespace; commands prefixed 'grd.'; all ids prefixed 'grd-';
   no emojis, no em dashes, theme-aware CSS variables, no CSS zoom. */
(function () {
  "use strict";
  var T = window.TXT;

  /* ---------------- small utils (guarded for minimal test stubs) ---------------- */
  var _uidN = 0;
  function uid(p) {
    if (T.uid) return T.uid();
    _uidN += 1;
    return (p || "grd") + "-" + Date.now().toString(36) + "-" + _uidN;
  }
  function esc(s) {
    if (T.esc) return T.esc(s);
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function toast(msg, kind) {
    if (T.toast) T.toast(msg, kind || "info");
  }
  function icon(name) {
    if (T.icon) return T.icon(name);
    return "";
  }
  /* Gear glyph drawn inline: index.html ships no i-gear symbol, so the
     per-app settings button carries its own SVG (no emoji, currentColor). */
  var GEAR_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/></svg>';
  function debounce(fn, ms) {
    if (T.debounce) return T.debounce(fn, ms);
    var t = null;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms || 300);
    };
  }

  /* =====================================================================
     PART 1: pure formula engine (no DOM)
     Grammar:
       expr    := cmp
       cmp     := add (('=' | '<>' | '!=' | '<=' | '>=' | '<' | '>') add)?
       add     := mul (('+' | '-') mul)*
       mul     := unary (('*' | '/') unary)*
       unary   := '-' unary | primary
       primary := NUMBER | STRING | TRUE | FALSE | REF | FUNC '(' args ')' | '(' expr ')'
       args    := (REF ':' REF | expr) (',' (REF ':' REF | expr))*
     Errors: #DIV/0, #REF, #CYCLE, #VALUE, #NAME. Empty cells coerce to 0 in
     arithmetic and "" in string context.
     ===================================================================== */
  var MAX_COL = 26, MAX_ROW = 100;

  function colName(c) { // 0-based -> "A".."Z"
    return String.fromCharCode(65 + c);
  }
  function colIndex(name) { // "A".."Z" -> 0-based, -1 if invalid
    var n = name.toUpperCase();
    if (!/^[A-Z]$/.test(n)) return -1;
    return n.charCodeAt(0) - 65;
  }
  function addrOf(c, r) { return colName(c) + (r + 1); } // 0-based -> "A1"
  function parseAddr(a) {
    var m = /^([A-Za-z]{1,2})([0-9]{1,3})$/.exec(String(a || "").trim());
    if (!m) return null;
    var c = colIndex(m[1]);
    var r = parseInt(m[2], 10) - 1;
    if (c < 0 || c >= MAX_COL || r < 0 || r >= MAX_ROW) return null;
    return { c: c, r: r, addr: colName(c) + (r + 1) };
  }
  function normAddr(a) {
    var p = parseAddr(a);
    return p ? p.addr : null;
  }
  function inBounds(c, r) { return c >= 0 && c < MAX_COL && r >= 0 && r < MAX_ROW; }

  function isFormula(raw) {
    return typeof raw === "string" && raw.charAt(0) === "=" && raw.length > 1;
  }

  /* ---------- tokenizer ---------- */
  var TOK = { NUM: 1, STR: 2, REF: 3, IDENT: 4, OP: 5, EOF: 6 };
  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    function err(msg) { throw { formula: true, message: msg }; }
    while (i < n) {
      var ch = src.charAt(i);
      if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }
      if ((ch >= "0" && ch <= "9") || (ch === "." && i + 1 < n && src.charAt(i + 1) >= "0" && src.charAt(i + 1) <= "9")) {
        var m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i));
        toks.push({ t: TOK.NUM, v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (ch === '"') {
        var s = "", j = i + 1;
        while (j < n && src.charAt(j) !== '"') { s += src.charAt(j); j++; }
        if (j >= n) err("unterminated string");
        toks.push({ t: TOK.STR, v: s });
        i = j + 1;
        continue;
      }
      var rm = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,3})/.exec(src.slice(i));
      if (rm && /[0-9]/.test(rm[0])) {
        var col = colIndex(rm[1]);
        var row = parseInt(rm[2], 10) - 1;
        if (col < 0 || col >= MAX_COL || row < 0 || row >= MAX_ROW) {
          toks.push({ t: TOK.REF, bad: true, v: rm[0].toUpperCase() });
        } else {
          toks.push({ t: TOK.REF, v: colName(col) + (row + 1) });
        }
        i += rm[0].length;
        continue;
      }
      var im = /^[A-Za-z][A-Za-z0-9._]*/.exec(src.slice(i));
      if (im) { toks.push({ t: TOK.IDENT, v: im[0].toUpperCase() }); i += im[0].length; continue; }
      var two = src.substr(i, 2);
      if (two === "<=" || two === ">=" || two === "<>" || two === "!=") {
        toks.push({ t: TOK.OP, v: two === "!=" ? "<>" : two }); i += 2; continue;
      }
      if ("+-*/(),:<>= ".indexOf(ch) >= 0 && ch !== " ") {
        toks.push({ t: TOK.OP, v: ch }); i++; continue;
      }
      err("unexpected character '" + ch + "'");
    }
    toks.push({ t: TOK.EOF });
    return toks;
  }

  /* ---------- parser -> AST, collects refs ---------- */
  function parse(src) {
    var body = String(src);
    if (body.charAt(0) === "=") body = body.slice(1);
    var toks, pos = 0, refs = [];
    function err(msg) { throw { formula: true, message: msg }; }
    try { toks = tokenize(body); }
    catch (e) { return { ast: { k: "err", code: "VALUE" }, refs: [], perr: e.message }; }
    function peek() { return toks[pos]; }
    function next() { return toks[pos++]; }
    function expectOp(v) {
      var tk = next();
      if (tk.t !== TOK.OP || tk.v !== v) err("expected '" + v + "'");
    }
    function addRef(a) { if (refs.indexOf(a) < 0) refs.push(a); }

    function pExpr() { return pCmp(); }
    function pCmp() {
      var l = pAdd();
      var tk = peek();
      if (tk.t === TOK.OP && ["=", "<>", "<=", ">=", "<", ">"].indexOf(tk.v) >= 0) {
        next();
        return { k: "cmp", op: tk.v, l: l, r: pAdd() };
      }
      return l;
    }
    function pAdd() {
      var l = pMul();
      for (;;) {
        var tk = peek();
        if (tk.t === TOK.OP && (tk.v === "+" || tk.v === "-")) { next(); l = { k: "bin", op: tk.v, l: l, r: pMul() }; }
        else return l;
      }
    }
    function pMul() {
      var l = pUnary();
      for (;;) {
        var tk = peek();
        if (tk.t === TOK.OP && (tk.v === "*" || tk.v === "/")) { next(); l = { k: "bin", op: tk.v, l: l, r: pUnary() }; }
        else return l;
      }
    }
    function pUnary() {
      var tk = peek();
      if (tk.t === TOK.OP && tk.v === "-") { next(); return { k: "neg", x: pUnary() }; }
      return pPrimary();
    }
    function pPrimary() {
      var tk = next();
      if (tk.t === TOK.NUM) return { k: "num", v: tk.v };
      if (tk.t === TOK.STR) return { k: "str", v: tk.v };
      if (tk.t === TOK.REF) {
        if (tk.bad) return { k: "err", code: "REF" };
        addRef(tk.v);
        return { k: "ref", a: tk.v };
      }
      if (tk.t === TOK.IDENT) {
        if (tk.v === "TRUE") return { k: "bool", v: true };
        if (tk.v === "FALSE") return { k: "bool", v: false };
        var nx = peek();
        if (nx.t === TOK.OP && nx.v === "(") {
          next();
          var args = [];
          if (!(peek().t === TOK.OP && peek().v === ")")) {
            for (;;) { args.push(pArg()); var c = peek(); if (c.t === TOK.OP && c.v === ",") { next(); continue; } break; }
          }
          expectOp(")");
          return { k: "call", name: tk.v, args: args };
        }
        return { k: "err", code: "NAME" };
      }
      if (tk.t === TOK.OP && tk.v === "(") {
        var e = pExpr();
        expectOp(")");
        return e;
      }
      err("unexpected token");
      return { k: "err", code: "VALUE" };
    }
    function pArg() { // range literal or expression
      var tk = peek();
      if (tk.t === TOK.REF) {
        var save = pos;
        next();
        var c = peek();
        if (c.t === TOK.OP && c.v === ":") {
          next();
          var tk2 = next();
          if (tk2.t !== TOK.REF) err("bad range");
          if (tk.bad || tk2.bad) return { k: "err", code: "REF" };
          var p1 = parseAddr(tk.v), p2 = parseAddr(tk2.v);
          var cells = [];
          for (var rr = Math.min(p1.r, p2.r); rr <= Math.max(p1.r, p2.r); rr++)
            for (var cc = Math.min(p1.c, p2.c); cc <= Math.max(p1.c, p2.c); cc++) {
              var a2 = addrOf(cc, rr);
              cells.push(a2);
              addRef(a2);
            }
          return { k: "range", cells: cells };
        }
        pos = save;
      }
      return pExpr();
    }
    try {
      var ast = pExpr();
      if (peek().t !== TOK.EOF) err("trailing input");
      return { ast: ast, refs: refs, perr: null };
    } catch (e) {
      return { ast: { k: "err", code: "VALUE" }, refs: refs, perr: e.message };
    }
  }

  /* ---------- value helpers ---------- */
  function V(v, e) { return { v: v, e: e || null }; }
  function isErr(x) { return !!x.e; }
  function toNum(x) {
    if (isErr(x)) return x;
    var v = x.v;
    if (v === null || v === undefined || v === "") return V(0);
    if (typeof v === "number") return V(v);
    if (typeof v === "boolean") return V(v ? 1 : 0);
    var s = String(v).trim().replace(/,/g, "");
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return V(parseFloat(s));
    return V(0, "VALUE");
  }
  function toStr(x) {
    if (isErr(x)) return x;
    var v = x.v;
    if (v === null || v === undefined) return V("");
    if (typeof v === "boolean") return V(v ? "TRUE" : "FALSE");
    return V(String(v));
  }
  function truthy(x) {
    if (isErr(x)) return x;
    var v = x.v;
    if (v === null || v === undefined) return V(false);
    if (typeof v === "boolean") return V(v);
    if (typeof v === "number") return V(v !== 0);
    return V(String(v).length > 0);
  }
  function coerceRaw(raw) {
    if (raw === undefined || raw === null || raw === "") return V(null);
    if (typeof raw === "number") return V(raw);
    if (typeof raw === "boolean") return V(raw);
    var s = String(raw).trim();
    var up = s.toUpperCase();
    if (up === "TRUE") return V(true);
    if (up === "FALSE") return V(false);
    return V(s);
  }
  function cmpVals(l, r, op) {
    if (isErr(l)) return l;
    if (isErr(r)) return r;
    var ln = toNum(l), rn = toNum(r);
    var numeric = !ln.e && !rn.e && (typeof l.v === "number" || typeof r.v === "number" || l.v === null || r.v === null || typeof l.v === "boolean" || typeof r.v === "boolean");
    var res;
    if (numeric && !ln.e && !rn.e) {
      var a = ln.v, b = rn.v;
      res = op === "=" ? a === b : op === "<>" ? a !== b : op === "<" ? a < b :
            op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
    } else {
      var sa = toStr(l).v.toLowerCase(), sb = toStr(r).v.toLowerCase();
      res = op === "=" ? sa === sb : op === "<>" ? sa !== sb : op === "<" ? sa < sb :
            op === ">" ? sa > sb : op === "<=" ? sa <= sb : sa >= sb;
    }
    return V(res);
  }
  function fmtErr(code) { return "#" + code; }

  var FNAMES = { SUM: 1, AVERAGE: 1, MIN: 1, MAX: 1, COUNT: 1, IF: 1 };

  function evalAST(node, lookup) {
    switch (node.k) {
      case "num": return V(node.v);
      case "str": return V(node.v);
      case "bool": return V(node.v);
      case "err": return V(0, node.code);
      case "ref": return lookup(node.a);
      case "neg": {
        var x = toNum(evalAST(node.x, lookup));
        return isErr(x) ? x : V(-x.v);
      }
      case "bin": {
        var l = evalAST(node.l, lookup), r = evalAST(node.r, lookup);
        if (isErr(l)) return l;
        if (isErr(r)) return r;
        var a = toNum(l), b = toNum(r);
        if (isErr(a)) return a;
        if (isErr(b)) return b;
        if (node.op === "+") return V(a.v + b.v);
        if (node.op === "-") return V(a.v - b.v);
        if (node.op === "*") return V(a.v * b.v);
        if (b.v === 0) return V(0, "DIV/0");
        return V(a.v / b.v);
      }
      case "cmp": {
        var cl = evalAST(node.l, lookup), cr = evalAST(node.r, lookup);
        return cmpVals(cl, cr, node.op);
      }
      case "range": {
        var vals = node.cells.map(function (a) { return lookup(a); });
        return V(vals);
      }
      case "call": {
        if (!FNAMES[node.name]) return V(0, "NAME");
        return evalCall(node, lookup);
      }
    }
    return V(0, "VALUE");
  }

  function flattenNums(args, lookup, out) {
    out = out || [];
    for (var i = 0; i < args.length; i++) {
      var r = evalAST(args[i], lookup);
      if (isErr(r)) return { err: r.e };
      if (Array.isArray(r.v)) {
        for (var j = 0; j < r.v.length; j++) {
          var e = r.v[j];
          if (isErr(e)) return { err: e.e };
          if (e.v === null || e.v === undefined || e.v === "") continue;
          var n = toNum(e);
          if (isErr(n)) continue; // text in ranges is ignored
          out.push(n.v);
        }
      } else {
        if (r.v === null || r.v === undefined || r.v === "") continue;
        var n2 = toNum(r);
        if (isErr(n2)) return { err: n2.e };
        out.push(n2.v);
      }
    }
    return { nums: out };
  }

  function evalCall(node, lookup) {
    var name = node.name, args = node.args;
    if (name === "IF") {
      if (args.length < 2) return V(0, "VALUE");
      var c = truthy(evalAST(args[0], lookup));
      if (isErr(c)) return c;
      var branch = c.v ? args[1] : (args[2] || { k: "bool", v: false });
      return evalAST(branch, lookup);
    }
    var f = flattenNums(args, lookup);
    if (f.err) return V(0, f.err);
    var nums = f.nums;
    if (name === "SUM") {
      var s = 0; for (var i = 0; i < nums.length; i++) s += nums[i];
      return V(s);
    }
    if (name === "COUNT") return V(nums.length);
    if (name === "AVERAGE") {
      if (!nums.length) return V(0, "DIV/0");
      var t = 0; for (var j = 0; j < nums.length; j++) t += nums[j];
      return V(t / nums.length);
    }
    if (name === "MIN") return V(nums.length ? Math.min.apply(null, nums) : 0);
    if (name === "MAX") return V(nums.length ? Math.max.apply(null, nums) : 0);
    return V(0, "NAME");
  }

  /* =====================================================================
     PART 2: grid model (DOM-free). A grid holds raw cells, per-cell format
     metadata, parsed refs per formula cell, and a computed cache for
     formula results. Dependency recalc: on setCell, invalidate the edited
     cell plus all transitive dependents, then recompute each invalidated
     formula cell with a visiting set for cycle detection (#CYCLE).
     ===================================================================== */
  function newGrid() {
    return {
      cells: {},     // addr -> raw (string | number | boolean)
      formats: {},   // addr -> {bold, fg, bg, numfmt, ctype}
      refs: {},      // addr -> [ref addrs] (formula cells only)
      computed: {}   // addr -> {v, e} (formula cells only, fresh)
    };
  }

  function dependentsOf(grid, addr) {
    var out = [];
    for (var d in grid.refs) {
      if (grid.refs.hasOwnProperty(d)) {
        var rs = grid.refs[d];
        for (var i = 0; i < rs.length; i++) {
          if (rs[i] === addr) { out.push(d); break; }
        }
      }
    }
    return out;
  }

  function invalidateFrom(grid, start) {
    var seen = {}, queue = [start], order = [];
    seen[start] = 1;
    while (queue.length) {
      var a = queue.shift();
      order.push(a);
      delete grid.computed[a];
      var deps = dependentsOf(grid, a);
      for (var i = 0; i < deps.length; i++) {
        if (!seen[deps[i]]) { seen[deps[i]] = 1; queue.push(deps[i]); }
      }
    }
    return order;
  }

  function computeCell(grid, addr, stack) {
    if (grid.computed.hasOwnProperty(addr)) return grid.computed[addr];
    var raw = grid.cells[addr];
    if (!isFormula(raw)) {
      var r = coerceRaw(raw);
      return r; // non-formula cells are not cached (cheap)
    }
    stack = stack || {};
    if (stack[addr]) return V(0, "CYCLE");
    var pr = parse(raw);
    if (pr.perr && !pr.ast) return V(0, "VALUE");
    stack[addr] = 1;
    function lookup(a) {
      var rr = grid.cells[a];
      if (isFormula(rr)) return computeCell(grid, a, stack);
      return coerceRaw(rr);
    }
    var out = evalAST(pr.ast, lookup);
    delete stack[addr];
    grid.computed[addr] = out;
    return out;
  }

  function refreshInvalidated(grid, order) {
    for (var i = 0; i < order.length; i++) {
      var a = order[i];
      if (isFormula(grid.cells[a])) computeCell(grid, a, {});
    }
  }

  function setCell(grid, addr, raw) {
    addr = normAddr(addr);
    if (!addr) return false;
    if (raw === "" || raw === undefined || raw === null) {
      delete grid.cells[addr];
    } else {
      grid.cells[addr] = raw;
    }
    if (isFormula(raw)) {
      var pr = parse(raw);
      grid.refs[addr] = pr.refs || [];
    } else {
      delete grid.refs[addr];
    }
    delete grid.computed[addr];
    var order = invalidateFrom(grid, addr);
    refreshInvalidated(grid, order);
    return true;
  }

  function getValue(grid, addr) { // {v, e}
    addr = normAddr(addr);
    if (!addr) return V(0, "REF");
    var raw = grid.cells[addr];
    if (isFormula(raw)) return computeCell(grid, addr, {});
    return coerceRaw(raw);
  }

  function getCell(grid, addr) {
    addr = normAddr(addr);
    if (!addr) return { raw: undefined, value: null, err: "REF" };
    var r = getValue(grid, addr);
    return { raw: grid.cells[addr], value: r.v, err: r.e };
  }

  function evaluate(grid, src) { // evaluate an arbitrary formula string against grid
    var pr = parse(src);
    function lookup(a) {
      var raw = grid.cells[a];
      if (isFormula(raw)) return computeCell(grid, a, {});
      return coerceRaw(raw);
    }
    return evalAST(pr.ast, lookup);
  }

  function recalcAll(grid) {
    grid.computed = {};
    for (var a in grid.cells) {
      if (grid.cells.hasOwnProperty(a) && isFormula(grid.cells[a])) computeCell(grid, a, {});
    }
  }

  function usedRange(grid) {
    var maxR = -1, maxC = -1;
    for (var a in grid.cells) {
      if (!grid.cells.hasOwnProperty(a)) continue;
      var p = parseAddr(a);
      if (p) { if (p.r > maxR) maxR = p.r; if (p.c > maxC) maxC = p.c; }
    }
    return { rows: maxR + 1, cols: maxC + 1 };
  }

  /* ---------- display formatting ---------- */
  var NUMFMTS = ["general", "currency", "percent", "progress", "pill"];
  var CTYPES = ["text", "number", "date", "checkbox"];

  function fmtOf(grid, addr) {
    var f = grid.formats[addr];
    if (!f) { f = {}; grid.formats[addr] = f; }
    return f;
  }
  function groupNum(n) {
    var parts = String(n).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }
  function displayOf(grid, addr) {
    var r = getValue(grid, addr);
    if (r.e) return fmtErr(r.e);
    var v = r.v;
    var f = grid.formats[addr] || {};
    var nf = f.numfmt || "general";
    if (v === null || v === undefined) return "";
    if (f.ctype === "checkbox") return v ? "TRUE" : "FALSE";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (nf === "percent") {
      var n = toNum(r);
      return isErr(n) ? fmtErr(n.e) : (n.v * 100) + "%";
    }
    if (nf === "currency") {
      var c = toNum(r);
      if (isErr(c)) return String(v);
      return "Ks " + groupNum(Math.round(c.v * 100) / 100);
    }
    if (typeof v === "number") {
      var rv = Math.round(v * 1e10) / 1e10;
      return groupNum(rv);
    }
    return String(v);
  }

  /* =====================================================================
     PART 3: documents + persistence via T.store ('grd' namespace)
     doc = { id, title, createdAt, updatedAt, grid, colWidths:{c:px},
             kanban:{statusCol, titleCol}, charts:[], live:[] }
     ===================================================================== */
  var docs = {};      // id -> doc (in-memory)
  var currentId = null;
  var storeOK = !!(T.store && T.store.get && T.store.set);

  function nowISO() { return new Date().toISOString(); }

  function serializeDoc(d) {
    return {
      id: d.id, title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt,
      grid: d.grid, colWidths: d.colWidths, kanban: d.kanban,
      charts: d.charts, live: d.live
    };
  }
  function deserializeDoc(o) {
    var g = newGrid();
    if (o.grid) {
      g.cells = o.grid.cells || {};
      g.formats = o.grid.formats || {};
    }
    var d = {
      id: o.id, title: o.title || "Untitled sheet",
      createdAt: o.createdAt || nowISO(), updatedAt: o.updatedAt || nowISO(),
      grid: g, colWidths: o.colWidths || {},
      kanban: o.kanban || { statusCol: "C", titleCol: "A" },
      charts: o.charts || [], live: o.live || []
    };
    if (o.grid && o.grid.refs) g.refs = o.grid.refs;
    else { // rebuild refs + computed for formula cells
      for (var a in g.cells) {
        if (g.cells.hasOwnProperty(a) && isFormula(g.cells[a])) {
          g.refs[a] = (parse(g.cells[a]).refs) || [];
        }
      }
    }
    recalcAll(g);
    return d;
  }

  function persist() {
    if (!storeOK) return;
    var all = {};
    for (var id in docs) {
      if (docs.hasOwnProperty(id)) all[id] = serializeDoc(docs[id]);
    }
    T.store.set("grd", "docs", all);
  }
  var persistSoon = debounce(persist, 400);

  function loadPersisted() {
    if (!storeOK) return;
    var all = T.store.get("grd", "docs") || {};
    for (var id in all) {
      if (all.hasOwnProperty(id) && !docs[id]) {
        try { docs[id] = deserializeDoc(all[id]); } catch (e) { /* skip corrupt */ }
      }
    }
  }

  function touchRecent(doc) {
    if (!storeOK) return;
    var rec = T.store.get("grd", "recent") || [];
    rec = rec.filter(function (r) { return r.id !== doc.id; });
    rec.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
    T.store.set("grd", "recent", rec.slice(0, 20));
  }

  function docSaved(doc) {
    doc.updatedAt = nowISO();
    touchRecent(doc);
    persistSoon();
  }

  /* ---------- templates ---------- */
  var TEMPLATES = [
    { id: "blank", name: "Blank", desc: "Empty 26 x 100 grid." },
    { id: "budget", name: "Budget", desc: "Monthly budget with totals." },
    { id: "kanban", name: "Kanban", desc: "Task board with status column." },
    { id: "gradebook", name: "Gradebook", desc: "Student scores with averages." }
  ];

  function applyTemplate(doc, tid) {
    var g = doc.grid;
    function put(a, raw, fmt) {
      setCell(g, a, raw);
      if (fmt) {
        var f = fmtOf(g, a);
        for (var k in fmt) if (fmt.hasOwnProperty(k)) f[k] = fmt[k];
      }
    }
    if (tid === "budget") {
      put("A1", "Item", { bold: true }); put("B1", "Category", { bold: true }); put("C1", "Amount", { bold: true });
      var rows = [["Rent", "Housing", 350000], ["Groceries", "Food", 180000], ["Transport", "Travel", 60000], ["Internet", "Bills", 45000], ["Savings", "Savings", 100000]];
      rows.forEach(function (r, i) {
        var n = i + 2;
        put("A" + n, r[0]); put("B" + n, r[1]); put("C" + n, r[2], { numfmt: "currency" });
      });
      put("A7", "Total", { bold: true }); put("C7", "=SUM(C2:C6)", { bold: true, numfmt: "currency" });
      put("A8", "Average", { bold: true }); put("C8", "=AVERAGE(C2:C6)", { numfmt: "currency" });
    } else if (tid === "kanban") {
      put("A1", "Task", { bold: true }); put("B1", "Owner", { bold: true }); put("C1", "Status", { bold: true });
      var tasks = [["Design homepage", "Thit Sar", "Doing"], ["Write launch post", "Thit Sar", "Todo"], ["Fix login bug", "Thit Sar", "Todo"], ["Ship v1", "Thit Sar", "Done"]];
      tasks.forEach(function (r, i) {
        var n = i + 2;
        put("A" + n, r[0]); put("B" + n, r[1]); put("C" + n, r[2], { numfmt: "pill" });
      });
      doc.kanban = { statusCol: "C", titleCol: "A" };
    } else if (tid === "gradebook") {
      put("A1", "Student", { bold: true }); put("B1", "Quiz 1", { bold: true }); put("C1", "Quiz 2", { bold: true }); put("D1", "Average", { bold: true });
      var studs = [["Aung", 82, 91], ["May", 76, 88], ["Zaw", 90, 84]];
      studs.forEach(function (r, i) {
        var n = i + 2;
        put("A" + n, r[0]); put("B" + n, r[1]); put("C" + n, r[2]); put("D" + n, "=AVERAGE(B" + n + ":C" + n + ")");
      });
      put("A5", "Class average", { bold: true }); put("D5", "=AVERAGE(D2:D4)", { bold: true });
    }
  }

  function newDoc(title, templateId) {
    loadPersisted();
    var d = {
      id: uid("grd"), title: title || "Untitled sheet",
      createdAt: nowISO(), updatedAt: nowISO(),
      grid: newGrid(), colWidths: {},
      kanban: { statusCol: "C", titleCol: "A" },
      charts: [], live: []
    };
    if (templateId && templateId !== "blank") applyTemplate(d, templateId);
    docs[d.id] = d;
    docSaved(d);
    return d;
  }

  function openDoc(id) {
    loadPersisted();
    var d = docs[id];
    if (d) { currentId = id; docSaved(d); }
    return d || null;
  }
  function current() { return currentId ? docs[currentId] || null : null; }
  function allDocs() {
    loadPersisted();
    return Object.keys(docs).map(function (id) { return docs[id]; });
  }
  function deleteDoc(id) {
    if (docs[id]) {
      delete docs[id];
      if (currentId === id) currentId = null;
      if (storeOK) {
        var rec = T.store.get("grd", "recent") || [];
        T.store.set("grd", "recent", rec.filter(function (r) { return r.id !== id; }));
      }
      persistSoon();
      return true;
    }
    return false;
  }

  /* =====================================================================
     Per-app file model for spreadsheets. Records carry {id, name, updatedAt}
     plus the sheet payload (the doc the app already persists under
     T.store 'grd' / 'docs', so existing saved sheets keep working).
     UI confirms destructive removes through confirmDlg (T.modal-backed).
     ===================================================================== */
  function fileRec(d) {
    return { id: d.id, name: d.title, updatedAt: d.updatedAt, doc: d };
  }
  function listFiles() {
    var all = allDocs().map(fileRec);
    all.sort(function (a, b) {
      return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
    });
    return all;
  }
  var files = {
    list: listFiles,
    create: function (name) {
      var t = String(name == null ? "" : name).trim();
      var d = newDoc(t || "Untitled sheet");
      openDoc(d.id);
      if (built) {
        E.title.value = d.title;
        renderHome(); switchSub("app"); switchTab("grid");
      }
      return fileRec(d);
    },
    rename: function (id, name) {
      var d = docs[id];
      if (!d) return null;
      var t = String(name == null ? "" : name).trim();
      d.title = t || "Untitled sheet";
      docSaved(d);
      if (built && current() && current().id === id) E.title.value = d.title;
      return fileRec(d);
    },
    duplicate: function (id) {
      loadPersisted();
      var d = docs[id];
      if (!d) return null;
      var snap = JSON.parse(JSON.stringify(serializeDoc(d))); // deep copy: no shared arrays
      var c = deserializeDoc(snap);
      c.id = uid("grd");
      c.title = d.title + " copy";
      c.createdAt = nowISO();
      c.updatedAt = nowISO();
      docs[c.id] = c;
      docSaved(c);
      return fileRec(c);
    },
    remove: function (id) { return deleteDoc(id); },
    open: function (id) {
      var d = openDoc(id);
      if (!d) return null;
      if (built) {
        E.title.value = d.title;
        renderHome(); switchSub("app"); switchTab("grid");
      }
      return fileRec(d);
    }
  };

  /* =====================================================================
     PART 4: UI shell. show() builds lazily into #view-grd. Sub-views:
     home (eco-home contract), grid, kanban, charts.
     ===================================================================== */
  var built = false;
  var E = {};               // element cache
  var ui = {
    sub: "home",            // home | app
    tab: "grid",            // grid | kanban | charts
    sel: { c: 0, r: 0, ec: 0, er: 0 }, // anchor c,r ; head ec,er (0-based)
    editing: false,
    highlighted: []
  };
  var ROW_H = 30, HEAD_H = 30, ROWHEAD_W = 46;

  function mk(tag, cls, id) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (id) d.id = id;
    return d;
  }
  function btn(label, id, cls, title) {
    var b = mk("button", cls || "", id);
    b.type = "button";
    b.textContent = label;
    if (title) b.title = title;
    return b;
  }
  function selRange() {
    var s = ui.sel;
    return {
      c0: Math.min(s.c, s.ec), c1: Math.max(s.c, s.ec),
      r0: Math.min(s.r, s.er), r1: Math.max(s.r, s.er)
    };
  }
  function rangeAddrStr(rg) {
    return addrOf(rg.c0, rg.r0) + (rg.c0 === rg.c1 && rg.r0 === rg.r1 ? "" : ":" + addrOf(rg.c1, rg.r1));
  }

  function show() {
    var host = document.getElementById("view-grd");
    if (!host) return;
    if (!built) build(host);
    applySettings();
    renderHome();
    switchSub("home");
  }
  function hide() {
    if (!built) return; // shell toggles #view-grd visibility; nothing to do
  }

  function switchSub(which) {
    ui.sub = which;
    E.home.classList.toggle("hidden", which !== "home");
    E.app.classList.toggle("hidden", which !== "app");
    if (which === "app") switchTab(ui.tab || "grid");
  }
  function switchTab(tab) {
    ui.tab = tab;
    ["grid", "kanban", "charts"].forEach(function (t) {
      var v = E["view" + t[0].toUpperCase() + t.slice(1)];
      if (v) v.classList.toggle("hidden", t !== tab);
      var tb = E["tab" + t[0].toUpperCase() + t.slice(1)];
      if (tb) tb.classList.toggle("active", t === tab);
    });
    if (tab === "kanban") renderKanban();
    if (tab === "charts") renderCharts();
    if (tab === "grid") { renderCells(); paintSelection(); }
  }

  /* ---------------- per-app settings (persisted via T.store 'grd' / 'settings') ----------------
     Applied on app init and on every change through applySettings(). */
  var DEFAULT_SETTINGS = {
    showGridlines: true,
    defaultNumFmt: "general",   // general | number | currency | percent
    freezeHeaderRow: false,
    compactRowHeight: false
  };
  var SETTING_NUMFMTS = ["general", "number", "currency", "percent"];

  function settings() {
    var s = (storeOK && T.store.get("grd", "settings")) || {};
    var out = {};
    for (var k in DEFAULT_SETTINGS) {
      if (DEFAULT_SETTINGS.hasOwnProperty(k)) {
        var v = s[k];
        out[k] = (v === undefined) ? DEFAULT_SETTINGS[k] : v;
      }
    }
    if (SETTING_NUMFMTS.indexOf(out.defaultNumFmt) < 0) out.defaultNumFmt = "general";
    return out;
  }
  function saveSettings(patch) {
    var s = settings();
    for (var k in patch) {
      if (patch.hasOwnProperty(k) && DEFAULT_SETTINGS.hasOwnProperty(k)) s[k] = patch[k];
    }
    if (storeOK) T.store.set("grd", "settings", s);
    applySettings();
    return s;
  }
  function rowH() { return settings().compactRowHeight ? 22 : 30; }
  function applySettings() {
    var s = settings();
    if (E.grid) {
      E.grid.classList.toggle("grd-no-gridlines", !s.showGridlines);
      E.grid.classList.toggle("grd-freeze-row1", !!s.freezeHeaderRow);
      E.grid.classList.toggle("grd-compact", !!s.compactRowHeight);
    }
    syncSettingsUI();
  }
  function syncSettingsUI() {
    var s = settings();
    var g = document.getElementById("grd-set-gridlines");
    if (g) g.checked = !!s.showGridlines;
    var nf = document.getElementById("grd-set-numfmt");
    if (nf) nf.value = s.defaultNumFmt;
    var fr = document.getElementById("grd-set-freezerow");
    if (fr) fr.checked = !!s.freezeHeaderRow;
    var cp = document.getElementById("grd-set-compact");
    if (cp) cp.checked = !!s.compactRowHeight;
  }
  /* Newly entered values inherit the default number format unless the cell
     already carries an explicit format (user-chosen formats are kept). */
  function applyDefaultNumFmt(d, addr) {
    var def = settings().defaultNumFmt || "general";
    if (def === "general" || !d) return;
    var f = d.grid.formats[addr];
    if (!f || !f.numfmt) fmtOf(d.grid, addr).numfmt = def;
  }

  /* Promise confirm: T.modal when available, otherwise a local dialog inside
     #view-grd. Resolves truthy on confirm, falsy on cancel. */
  function confirmDlg(opts) {
    opts = opts || {};
    if (T.modal) {
      try { return Promise.resolve(T.modal(opts)); } catch (e) { /* fall through */ }
    }
    return new Promise(function (resolve) {
      var root = document.getElementById("grd-root") || document.body;
      var wrap = mk("div", "grd-confirm-wrap");
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-label", opts.title || "Confirm");
      var box = mk("div", "grd-confirm-box");
      var h = mk("h3", "grd-confirm-title");
      h.textContent = opts.title || "Are you sure?";
      box.appendChild(h);
      if (opts.sub) {
        var p = mk("p", "grd-confirm-sub");
        p.textContent = opts.sub;
        box.appendChild(p);
      }
      var row = mk("div", "grd-confirm-row");
      var cancel = btn("Cancel", "", "grd-btn", "Cancel");
      var ok = btn(opts.okText || "OK", "", "grd-btn " + (opts.danger ? "grd-btn-danger" : "grd-btn-accent"), opts.okText || "OK");
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      cancel.addEventListener("click", function () { done(false); });
      ok.addEventListener("click", function () { done(true); });
      wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) done(false); });
      wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") done(false); });
      row.appendChild(cancel); row.appendChild(ok);
      box.appendChild(row); wrap.appendChild(box);
      root.appendChild(wrap);
      ok.focus();
    });
  }

  /* ---------------- homescreen ---------------- */
  function build(host) {
    host.innerHTML = "";
    var root = mk("div", "", "grd-root");
    host.appendChild(root);

    /* ---- home ---- */
    var home = mk("div", "eco-home", "grd-home");
    var head = mk("div", "eco-home-head");
    var badge = mk("span", "eco-badge", "grd-badge");
    badge.textContent = "GRD";
    badge.style.background = "#06B6D4";
    var htitle = mk("div", "eco-home-titles");
    var h1 = mk("h1", "", "grd-home-title");
    h1.textContent = "GRD Spreadsheet";
    var hsub = mk("p", "eco-home-sub", "grd-home-sub");
    hsub.textContent = "Grids, kanban boards and charts. Push live tables into TXT.";
    htitle.appendChild(h1); htitle.appendChild(hsub);
    var hactions = mk("div", "eco-home-actions");
    var newBtn = btn("New sheet", "grd-new-sheet", "eco-btn-primary", "Create a new spreadsheet");
    newBtn.addEventListener("click", function () {
      files.create("Untitled sheet");
    });
    hactions.appendChild(newBtn);
    head.appendChild(badge); head.appendChild(htitle); head.appendChild(hactions);
    home.appendChild(head);

    var search = mk("input", "eco-home-search", "grd-search");
    search.type = "search";
    search.placeholder = "Search sheets and templates";
    search.setAttribute("aria-label", "Search sheets and templates");
    search.addEventListener("input", renderHome);
    home.appendChild(search);

    var secR = mk("div", "eco-home-sec", "grd-sec-recent");
    var h2r = mk("h2", "", "grd-recent-h");
    h2r.textContent = "Recent sheets";
    secR.appendChild(h2r);
    var gridR = mk("div", "eco-home-grid", "grd-recent-grid");
    secR.appendChild(gridR);
    home.appendChild(secR);

    var secN = mk("div", "eco-home-new", "grd-sec-new");
    var h2n = mk("h2", "", "grd-new-h");
    h2n.textContent = "New from template";
    secN.appendChild(h2n);
    var gridN = mk("div", "eco-home-grid", "grd-tpl-grid");
    secN.appendChild(gridN);
    home.appendChild(secN);

    var empty = mk("div", "eco-home-empty", "grd-home-empty");
    empty.textContent = "No sheets yet. Create one from a template above.";
    home.appendChild(empty);

    var foot = mk("div", "eco-home-foot", "grd-home-foot");
    foot.textContent = "Part of NXT OS";
    home.appendChild(foot);

    root.appendChild(home);
    E.home = home;

    /* ---- app workspace ---- */
    var app = mk("div", "grd-app hidden", "grd-app");
    var top = mk("div", "grd-topbar", "grd-topbar");
    var back = btn("Back", "grd-back", "grd-btn", "Back to GRD home");
    back.addEventListener("click", function () { renderHome(); switchSub("home"); });
    top.appendChild(back);
    var badge = mk("span", "grd-appbadge", "grd-top-badge");
    badge.innerHTML = icon("i-grid");
    badge.setAttribute("aria-hidden", "true");
    top.appendChild(badge);
    var appname = mk("span", "grd-appname", "grd-appname");
    appname.textContent = "GRD";
    top.appendChild(appname);
    var title = mk("input", "grd-title", "grd-title");
    title.setAttribute("aria-label", "Sheet title");
    title.addEventListener("change", function () {
      var d = current();
      if (d) { d.title = title.value.trim() || "Untitled sheet"; docSaved(d); renderHome(); }
    });
    top.appendChild(title);
    var tabs = mk("div", "grd-tabs", "grd-tabs");
    [["Grid", "grid"], ["Kanban", "kanban"], ["Charts", "charts"]].forEach(function (td) {
      var t = btn(td[0], "grd-tab-" + td[1], "grd-tab", td[0] + " view");
      t.addEventListener("click", function () { switchTab(td[1]); });
      tabs.appendChild(t);
      E["tab" + td[1][0].toUpperCase() + td[1].slice(1)] = t;
    });
    top.appendChild(tabs);
    var push = btn("Push to TXT", "grd-push-live", "grd-btn grd-btn-accent", "Push the selected range as a live table into the TXT word document");
    push.addEventListener("click", function () { pushSelectionToTxt(); });
    top.appendChild(push);
    var spacer = mk("div", "grd-spacer", "grd-spacer");
    spacer.setAttribute("aria-hidden", "true");
    top.appendChild(spacer);
    /* per-app 9-dot launcher */
    var launch = mk("button", "icon-btn waffle-btn", "grd-launcher");
    launch.type = "button";
    launch.title = "Open app launcher";
    launch.setAttribute("aria-label", "Open app launcher");
    var dots = mk("span", "waffle-dots");
    dots.setAttribute("aria-hidden", "true");
    for (var di = 0; di < 9; di++) dots.appendChild(mk("i"));
    launch.appendChild(dots);
    launch.addEventListener("click", function (e) {
      e.stopPropagation();
      if (T.ecosystem && T.ecosystem.toggleLauncher) T.ecosystem.toggleLauncher();
    });
    top.appendChild(launch);
    /* per-app settings */
    var gear = mk("button", "icon-btn", "grd-settings-btn");
    gear.type = "button";
    gear.title = "GRD settings";
    gear.setAttribute("aria-label", "GRD settings");
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener("click", function (e) { e.stopPropagation(); toggleSettings(); });
    top.appendChild(gear);
    app.appendChild(top);

    buildGridView(app);
    buildKanbanView(app);
    buildChartsView(app);
    root.appendChild(app);
    E.app = app;
    E.title = title;
    buildSettings(root);

    built = true;
  }

  /* ---------------- settings drawer (inside #view-grd) ---------------- */
  function buildSettings(root) {
    var wrap = mk("div", "grd-settings hidden", "grd-settings");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "GRD settings");
    var scrim = mk("div", "grd-set-scrim");
    scrim.addEventListener("click", closeSettings);
    wrap.appendChild(scrim);
    var panel = mk("div", "grd-set-panel", "grd-settings-panel");
    var head = mk("div", "grd-set-head");
    var h = mk("h2", "", "grd-settings-title");
    h.textContent = "GRD settings";
    var close = mk("button", "icon-btn", "grd-settings-close");
    close.type = "button";
    close.title = "Close settings";
    close.setAttribute("aria-label", "Close settings");
    close.innerHTML = icon("i-x");
    close.addEventListener("click", closeSettings);
    head.appendChild(h); head.appendChild(close);
    panel.appendChild(head);
    var body = mk("div", "grd-set-body");
    function toggleRow(id, title, desc, key) {
      var lab = mk("label", "grd-set-row");
      var tx = mk("span", "grd-set-text");
      var t1 = mk("span", "grd-set-title"); t1.textContent = title;
      var d1 = mk("span", "grd-set-desc"); d1.textContent = desc;
      tx.appendChild(t1); tx.appendChild(d1);
      var inp = mk("input", "grd-switch", id);
      inp.type = "checkbox";
      inp.addEventListener("change", function () {
        var p = {}; p[key] = inp.checked;
        saveSettings(p);
      });
      lab.appendChild(tx); lab.appendChild(inp);
      return lab;
    }
    body.appendChild(toggleRow("grd-set-gridlines", "Show gridlines", "Show cell borders in the sheet", "showGridlines"));
    var nfRow = mk("div", "grd-set-row");
    var nfTx = mk("span", "grd-set-text");
    var nfT = mk("span", "grd-set-title"); nfT.textContent = "Default number format";
    var nfD = mk("span", "grd-set-desc"); nfD.textContent = "Applied to values you type next";
    nfTx.appendChild(nfT); nfTx.appendChild(nfD);
    var nfSel = mk("select", "grd-set-select", "grd-set-numfmt");
    nfSel.setAttribute("aria-label", "Default number format");
    [["general", "General"], ["number", "Number"], ["currency", "Currency"], ["percent", "Percent"]].forEach(function (o) {
      var op = mk("option"); op.value = o[0]; op.textContent = o[1]; nfSel.appendChild(op);
    });
    nfSel.addEventListener("change", function () { saveSettings({ defaultNumFmt: nfSel.value }); });
    nfRow.appendChild(nfTx); nfRow.appendChild(nfSel);
    body.appendChild(nfRow);
    body.appendChild(toggleRow("grd-set-freezerow", "Freeze header row", "Keep row 1 visible while scrolling", "freezeHeaderRow"));
    body.appendChild(toggleRow("grd-set-compact", "Compact row height", "Use shorter rows in the grid", "compactRowHeight"));
    var about = mk("div", "grd-set-row grd-set-about");
    var abTx = mk("span", "grd-set-text");
    var abT = mk("span", "grd-set-title"); abT.textContent = "About";
    var abD = mk("span", "grd-set-desc"); abD.textContent = "GRD Spreadsheet, part of NXT OS.";
    abTx.appendChild(abT); abTx.appendChild(abD);
    about.appendChild(abTx);
    body.appendChild(about);
    panel.appendChild(body);
    wrap.appendChild(panel);
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); closeSettings(); }
    });
    root.appendChild(wrap);
    E.settings = wrap;
  }
  function toggleSettings() {
    if (!E.settings) return;
    if (E.settings.classList.contains("hidden")) openSettings(); else closeSettings();
  }
  function openSettings() {
    if (!E.settings) return;
    syncSettingsUI();
    E.settings.classList.remove("hidden");
    var c = document.getElementById("grd-settings-close");
    if (c) c.focus();
  }
  function closeSettings() {
    if (!E.settings) return;
    E.settings.classList.add("hidden");
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  /* Homescreen: skeleton-first paint. Grids render asynchronously so the
     .nxt-skeleton shimmer shows while large lists are built; on fast renders
     the timeout fires before the browser paints, so there is no flicker. */
  var homeSeq = 0; // guards the async paint against rapid re-renders

  function collectHomeItems(q) {
    var filesOut = [];
    files.list().forEach(function (f) {
      if (q && (f.name || "").toLowerCase().indexOf(q) < 0) return;
      filesOut.push(f);
    });
    var tplsOut = [];
    TEMPLATES.forEach(function (tp) {
      if (q && (tp.name + " " + tp.desc).toLowerCase().indexOf(q) < 0) return;
      tplsOut.push(tp);
    });
    return { files: filesOut, tpls: tplsOut };
  }

  function homeSkeletonCard() {
    var s = mk("div", "eco-home-card nxt-skeleton");
    s.style.minHeight = "104px";
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  function paintHomeSkeletons(rg, tg, items) {
    rg.innerHTML = ""; tg.innerHTML = "";
    var n = 0;
    items.files.forEach(function () { if (n < 8) { rg.appendChild(homeSkeletonCard()); n++; } });
    n = 0;
    items.tpls.forEach(function () { if (n < 8) { tg.appendChild(homeSkeletonCard()); n++; } });
  }

  function fileCard(f) {
    var card = mk("div", "eco-home-card");
    var t = mk("div", "eco-card-title"); t.textContent = f.name || "Untitled sheet";
    var m = mk("div", "eco-card-meta"); m.textContent = "Updated " + fmtDate(f.updatedAt);
    var open = btn("Open", "", "eco-btn", "Open this sheet");
    open.addEventListener("click", function () {
      if (!files.open(f.id)) { toast("That sheet is no longer available.", "error"); renderHome(); }
    });
    var rn = btn("Rename", "", "eco-btn", "Rename this sheet");
    rn.addEventListener("click", function () { startInlineRename(card, t, f); });
    var dup = btn("Duplicate", "", "eco-btn", "Duplicate this sheet");
    dup.addEventListener("click", function () {
      if (files.duplicate(f.id)) { toast("Sheet duplicated."); renderHome(); }
    });
    var del = btn("Delete", "", "eco-btn eco-btn-danger", "Delete this sheet");
    del.addEventListener("click", function () {
      confirmDlg({
        title: "Delete sheet?",
        sub: "Delete \"" + (f.name || "Untitled sheet") + "\" permanently?",
        okText: "Delete",
        danger: true
      }).then(function (ok) {
        if (ok && files.remove(f.id)) { toast("Sheet deleted."); renderHome(); }
      });
    });
    var row = mk("div", "eco-card-actions");
    row.appendChild(open); row.appendChild(rn); row.appendChild(dup); row.appendChild(del);
    card.appendChild(t); card.appendChild(m); card.appendChild(row);
    return card;
  }

  function tplCard(tp) {
    var card = mk("div", "eco-home-card eco-tpl-card");
    var t = mk("div", "eco-card-title"); t.textContent = tp.name;
    var m = mk("div", "eco-card-meta"); m.textContent = tp.desc;
    var use = btn("Use template", "", "eco-btn", "Create a new sheet from the " + tp.name + " template");
    use.addEventListener("click", function () {
      var d = newDoc(tp.name + " sheet", tp.id);
      openDoc(d.id);
      switchSub("app");
      switchTab(tp.id === "kanban" ? "kanban" : "grid");
    });
    card.appendChild(t); card.appendChild(m); card.appendChild(use);
    return card;
  }

  function paintHomeCards(rg, tg, items, q) {
    rg.innerHTML = ""; tg.innerHTML = "";
    items.files.forEach(function (f) { rg.appendChild(fileCard(f)); });
    items.tpls.forEach(function (tp) { tg.appendChild(tplCard(tp)); });
    var shown = items.files.length + items.tpls.length;
    var anyFiles = files.list().length > 0;
    document.getElementById("grd-sec-recent").style.display = (anyFiles || !q) ? "" : "none";
    document.getElementById("grd-home-empty").classList.toggle("hidden", shown > 0);
  }

  function renderHome() {
    if (!built) return;
    var q = "";
    var sEl = document.getElementById("grd-search");
    if (sEl) { q = (sEl.value || "").trim().toLowerCase(); E.search = sEl; }
    var rg = document.getElementById("grd-recent-grid");
    var tg = document.getElementById("grd-tpl-grid");
    if (!rg || !tg) return;
    var items = collectHomeItems(q);
    paintHomeSkeletons(rg, tg, items);
    var seq = ++homeSeq;
    setTimeout(function () {
      if (seq !== homeSeq || !built) return;
      paintHomeCards(rg, tg, items, q);
    }, 0);
  }

  /* Inline rename inside a homescreen file card (no modal needed). */
  function startInlineRename(card, titleEl, f) {
    if (card.querySelector(".grd-rename-input")) return;
    var inp = mk("input", "grd-rename-input");
    inp.value = f.name || "";
    inp.setAttribute("aria-label", "Sheet name");
    inp.maxLength = 120;
    titleEl.style.display = "none";
    card.insertBefore(inp, titleEl.nextSibling);
    inp.focus(); inp.select();
    var done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      if (commit) files.rename(f.id, inp.value);
      renderHome();
    }
    inp.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    inp.addEventListener("blur", function () { finish(true); });
  }

  /* ---------------- grid view ---------------- */
  function colW(c) {
    var d = current();
    return (d && d.colWidths[c]) || 110;
  }

  function buildGridView(app) {
    var v = mk("div", "grd-view", "grd-view-grid");
    /* formula bar */
    var fx = mk("div", "grd-fxbar");
    var name = mk("input", "grd-namebox", "grd-namebox");
    name.readOnly = true; name.value = "A1";
    name.setAttribute("aria-label", "Active cell");
    var fxLab = mk("span", "grd-fxlab"); fxLab.textContent = "fx";
    var fxi = mk("input", "grd-fxinput", "grd-fx");
    fxi.setAttribute("aria-label", "Formula bar");
    fxi.placeholder = "Type a value or formula, e.g. =SUM(A1:A10)";
    fxi.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { commitFx(); moveSel(1, 0); }
      else if (e.key === "Escape") { syncFxBar(); fxi.blur(); }
      e.stopPropagation();
    });
    fxi.addEventListener("blur", function () { /* commit on blur only if changed via Enter already */ });
    /* Mobile (<=640px) opens the formatbar as a bottom sheet; the toggle
       button is only visible there (see css/grd.css). */
    var fmtT = btn("Format", "grd-fmt-toggle", "grd-btn", "Open format controls");
    fmtT.setAttribute("aria-expanded", "false");
    fmtT.setAttribute("aria-controls", "grd-formatbar");
    fmtT.addEventListener("click", function () { toggleFmtSheet(); });
    fx.appendChild(name); fx.appendChild(fxLab); fx.appendChild(fmtT); fx.appendChild(fxi);
    v.appendChild(fx);
    E.namebox = name; E.fx = fxi;

    /* format toolbar: inline on desktop, a shared .nxt-sheet bottom sheet
       on <=640px (the .nxt-sheet chrome only applies inside that media
       query, so desktop is unaffected). */
    var ft = mk("div", "grd-formatbar nxt-sheet", "grd-formatbar");
    var fthandle = mk("div", "nxt-sheet-handle");
    fthandle.setAttribute("aria-hidden", "true");
    ft.appendChild(fthandle);
    var fthead = mk("div", "grd-fmt-head");
    var fttitle = mk("span", "grd-fmt-title"); fttitle.textContent = "Format";
    var fmtClose = btn("Close", "grd-fmt-close", "grd-btn", "Close format panel");
    fmtClose.addEventListener("click", function () { toggleFmtSheet(false); });
    fthead.appendChild(fttitle); fthead.appendChild(fmtClose);
    ft.appendChild(fthead);
    var bold = btn("B", "grd-f-bold", "grd-tbtn grd-tbtn-bold", "Bold");
    bold.addEventListener("click", function () { toggleBold(); });
    var fg = mk("input", "", "grd-f-fg"); fg.type = "color"; fg.value = "#111111"; fg.title = "Text color";
    fg.setAttribute("aria-label", "Text color");
    fg.addEventListener("input", function () { applyFmt({ fg: fg.value }); });
    var bg = mk("input", "", "grd-f-bg"); bg.type = "color"; bg.value = "#ffffff"; bg.title = "Fill color";
    bg.setAttribute("aria-label", "Fill color");
    bg.addEventListener("input", function () { applyFmt({ bg: bg.value }); });
    var nf = mk("select", "", "grd-f-numfmt"); nf.setAttribute("aria-label", "Number format");
    [["general", "General"], ["currency", "Currency"], ["percent", "Percent"], ["progress", "Progress bar"], ["pill", "Status pill"]].forEach(function (o) {
      var op = mk("option"); op.value = o[0]; op.textContent = o[1]; nf.appendChild(op);
    });
    nf.addEventListener("change", function () { applyFmt({ numfmt: nf.value }); });
    var ct = mk("select", "", "grd-f-ctype"); ct.setAttribute("aria-label", "Cell type");
    [["text", "Text"], ["number", "Number"], ["date", "Date"], ["checkbox", "Checkbox"]].forEach(function (o) {
      var op = mk("option"); op.value = o[0]; op.textContent = o[1]; ct.appendChild(op);
    });
    ct.addEventListener("change", function () { applyCtype(ct.value); });
    var sAsc = btn("A-Z", "grd-sort-asc", "grd-tbtn", "Sort rows A to Z by this column");
    sAsc.addEventListener("click", function () { sortByColumn(ui.sel.c, 1); });
    var sDesc = btn("Z-A", "grd-sort-desc", "grd-tbtn", "Sort rows Z to A by this column");
    sDesc.addEventListener("click", function () { sortByColumn(ui.sel.c, -1); });
    var clr = btn("Clear", "grd-clear", "grd-tbtn", "Clear contents and formatting of selection");
    clr.addEventListener("click", clearSelection);
    [bold, fg, bg, nf, ct, sAsc, sDesc, clr].forEach(function (x) { ft.appendChild(x); });
    v.appendChild(ft);
    E.numfmtSel = nf; E.ctypeSel = ct; E.boldBtn = bold;
    E.fmtBar = ft;

    /* mobile sheet: tap outside or Escape closes */
    var fmtScrim = mk("div", "grd-fmt-scrim", "grd-fmt-scrim");
    fmtScrim.setAttribute("aria-hidden", "true");
    fmtScrim.addEventListener("click", function () { toggleFmtSheet(false); });
    v.appendChild(fmtScrim);
    E.fmtScrim = fmtScrim;
    ft.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { toggleFmtSheet(false); e.stopPropagation(); }
    });

    /* grid */
    var wrap = mk("div", "grd-gridwrap", "grd-gridwrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("aria-label", "Spreadsheet grid");
    var grid = mk("div", "grd-grid", "grd-grid");
    wrap.appendChild(grid);
    var editor = mk("input", "grd-editor hidden", "grd-editor");
    editor.setAttribute("aria-label", "Cell editor");
    grid.appendChild(editor);
    v.appendChild(wrap);
    E.grid = grid; E.wrap = wrap; E.editor = editor;

    buildGridSkeleton();

    /* selection + edit via delegation */
    grid.addEventListener("mousedown", onGridMouseDown);
    grid.addEventListener("dblclick", onGridDblClick);
    grid.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains("grd-check")) {
        var a = t.getAttribute("data-addr");
        var d = current();
        if (d && a) { setCell(d.grid, a, t.checked); afterEdit(a); }
      }
    });
    editor.addEventListener("keydown", onEditorKey);
    editor.addEventListener("blur", function () { if (ui.editing) commitEditor(true); });

    var status = mk("div", "grd-status", "grd-gridstatus");
    var statusLeft = mk("span", "grd-status-left");
    var statusRight = mk("span", "grd-status-right");
    statusRight.textContent = "NXT GRD • Developed by H3NZ";
    status.appendChild(statusLeft);
    status.appendChild(statusRight);
    v.appendChild(status);
    E.gridstatus = statusLeft;

    app.appendChild(v);
    E.viewGrid = v;

    document.addEventListener("keydown", onDocKey);
  }

  /* Opens/closes the mobile Format bottom sheet (no-op on desktop: the
     sheet chrome only exists inside the <=640px media query). */
  function toggleFmtSheet(force) {
    var ft = E.fmtBar || document.getElementById("grd-formatbar");
    if (!ft) return;
    var open = typeof force === "boolean" ? force : !ft.classList.contains("grd-open");
    ft.classList.toggle("grd-open", open);
    var sc = E.fmtScrim || document.getElementById("grd-fmt-scrim");
    if (sc) sc.classList.toggle("grd-open", open);
    var t = document.getElementById("grd-fmt-toggle");
    if (t) t.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function buildGridSkeleton() {
    var g = E.grid;
    g.querySelectorAll(".grd-cell,.grd-ch,.grd-rh,.grd-corner").forEach(function (n) { n.remove(); });
    var corner = mk("div", "grd-corner"); g.appendChild(corner);
    for (var c = 0; c < MAX_COL; c++) {
      (function (cc) {
        var h = mk("div", "grd-ch"); h.textContent = colName(cc); h.setAttribute("data-col", cc);
        var rz = mk("span", "grd-resize"); rz.title = "Drag to resize column";
        rz.addEventListener("mousedown", function (e) { startResize(e, cc); });
        h.appendChild(rz);
        h.addEventListener("click", function () {
          ui.sel = { c: cc, r: 0, ec: cc, er: MAX_ROW - 1 };
          paintSelection(); syncFxBar(); updateStatusBar();
        });
        g.appendChild(h);
      })(c);
    }
    for (var r = 0; r < MAX_ROW; r++) {
      (function (rr) {
        var rh = mk("div", "grd-rh"); rh.textContent = String(rr + 1);
        rh.setAttribute("data-r", rr);
        rh.addEventListener("click", function () {
          ui.sel = { c: 0, r: rr, ec: MAX_COL - 1, er: rr };
          paintSelection(); syncFxBar(); updateStatusBar();
        });
        g.appendChild(rh);
        for (var c2 = 0; c2 < MAX_COL; c2++) {
          var cell = mk("div", "grd-cell");
          cell.setAttribute("data-c", c2); cell.setAttribute("data-r", rr);
          cell.setAttribute("data-addr", addrOf(c2, rr));
          g.appendChild(cell);
        }
      })(r);
    }
    applyColWidths();
  }

  function applyColWidths() {
    var cols = [ROWHEAD_W + "px"];
    for (var c = 0; c < MAX_COL; c++) cols.push(colW(c) + "px");
    E.grid.style.gridTemplateColumns = cols.join(" ");
  }

  function cellEls() {
    return E.grid.querySelectorAll(".grd-cell");
  }

  function pillClass(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    if (s === "done") return "grd-pill-done";
    if (s === "doing") return "grd-pill-doing";
    if (s === "todo") return "grd-pill-todo";
    return "grd-pill-other";
  }

  function renderCells() {
    var d = current();
    if (!d) return;
    var g = d.grid;
    var cells = cellEls();
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var a = cell.getAttribute("data-addr");
      var f = g.formats[a] || {};
      var raw = g.cells[a];
      cell.classList.toggle("grd-bold", !!f.bold);
      cell.style.color = f.fg || "";
      cell.style.background = f.bg || "";
      // clear previous special content
      if (cell.firstChild) cell.textContent = "";
      if (raw === undefined) { cell.textContent = ""; continue; }
      if (f.ctype === "checkbox") {
        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.className = "grd-check"; cb.setAttribute("data-addr", a);
        var vv = getValue(g, a);
        cb.checked = !!vv.v && !vv.e;
        cb.setAttribute("aria-label", "Checkbox " + a);
        cell.appendChild(cb);
        continue;
      }
      var nf = f.numfmt || "general";
      if (nf === "progress") {
        var pv = getValue(g, a);
        var pct = 0;
        if (!pv.e && typeof pv.v === "number") pct = Math.max(0, Math.min(100, pv.v <= 1 && pv.v >= 0 ? pv.v * 100 : pv.v));
        var bar = document.createElement("span"); bar.className = "grd-progress";
        var fill = document.createElement("span"); fill.className = "grd-progress-fill";
        fill.style.width = pct + "%";
        bar.appendChild(fill);
        var lab = document.createElement("span"); lab.className = "grd-progress-lab";
        lab.textContent = Math.round(pct) + "%";
        cell.appendChild(bar); cell.appendChild(lab);
        continue;
      }
      if (nf === "pill" && raw !== "") {
        var p = document.createElement("span");
        p.className = "grd-pill " + pillClass(displayOf(g, a));
        p.textContent = displayOf(g, a);
        cell.appendChild(p);
        continue;
      }
      cell.textContent = displayOf(g, a);
    }
  }

  function clearHighlight() {
    ui.highlighted.forEach(function (n) { n.classList.remove("grd-active", "grd-inrange"); });
    ui.highlighted = [];
  }
  function paintSelection() {
    clearHighlight();
    var rg = selRange();
    var cells = cellEls();
    for (var r = rg.r0; r <= rg.r1; r++) {
      for (var c = rg.c0; c <= rg.c1; c++) {
        var idx = r * MAX_COL + c;
        var cell = cells[idx];
        if (!cell) continue;
        var active = (c === ui.sel.ec && r === ui.sel.er);
        cell.classList.add(active ? "grd-active" : "grd-inrange");
        ui.highlighted.push(cell);
      }
    }
  }

  function syncFxBar() {
    var d = current();
    var a = addrOf(ui.sel.ec, ui.sel.er);
    E.namebox.value = rangeAddrStr(selRange());
    if (!d) { E.fx.value = ""; return; }
    var raw = d.grid.cells[a];
    E.fx.value = raw === undefined || raw === null ? "" : String(raw);
    var f = d.grid.formats[a] || {};
    E.numfmtSel.value = f.numfmt || "general";
    E.ctypeSel.value = f.ctype || "text";
    E.boldBtn.classList.toggle("on", !!f.bold);
  }

  function updateStatusBar() {
    var d = current();
    var rg = selRange();
    var n = (rg.c1 - rg.c0 + 1) * (rg.r1 - rg.r0 + 1);
    var txt = rangeAddrStr(rg) + "  ·  " + n + " cell" + (n === 1 ? "" : "s");
    if (d) {
      var sum = 0, cnt = 0;
      for (var r = rg.r0; r <= rg.r1; r++)
        for (var c = rg.c0; c <= rg.c1; c++) {
          var vv = getValue(d.grid, addrOf(c, r));
          if (!vv.e && typeof vv.v === "number") { sum += vv.v; cnt++; }
        }
      if (cnt > 0) txt += "  ·  Sum " + groupNum(Math.round(sum * 1e10) / 1e10) + "  ·  Count " + cnt;
    }
    E.gridstatus.textContent = txt;
  }

  function setActive(c, r, extend) {
    c = Math.max(0, Math.min(MAX_COL - 1, c));
    r = Math.max(0, Math.min(MAX_ROW - 1, r));
    if (extend) { ui.sel.ec = c; ui.sel.er = r; }
    else ui.sel = { c: c, r: r, ec: c, er: r };
    paintSelection(); syncFxBar(); updateStatusBar();
    scrollCellIntoView(c, r);
  }
  function scrollCellIntoView(c, r) {
    var idx = r * MAX_COL + c;
    var cell = cellEls()[idx];
    if (cell && cell.scrollIntoView) {
      try { cell.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
    }
  }
  function moveSel(dc, dr) {
    setActive(ui.sel.ec + dc, ui.sel.er + dr, false);
  }

  /* ---------- mouse ---------- */
  function onGridMouseDown(e) {
    var t = e.target;
    if (t.classList && t.classList.contains("grd-resize")) return;
    if (t.classList && t.classList.contains("grd-check")) {
      var a0 = t.getAttribute("data-addr");
      var p0 = parseAddr(a0);
      if (p0) setActive(p0.c, p0.r, false);
      return; // let the checkbox toggle itself; change handler writes back
    }
    var cell = t.closest ? t.closest(".grd-cell") : null;
    if (!cell) return;
    var c = parseInt(cell.getAttribute("data-c"), 10);
    var r = parseInt(cell.getAttribute("data-r"), 10);
    setActive(c, r, e.shiftKey);
    E.wrap.focus();
  }
  function onGridDblClick(e) {
    var cell = e.target.closest ? e.target.closest(".grd-cell") : null;
    if (!cell) return;
    startEdit();
  }

  /* ---------- keyboard ---------- */
  function grdVisible() {
    var host = document.getElementById("view-grd");
    return built && host && !host.classList.contains("hidden") && ui.sub === "app" && ui.tab === "grid";
  }
  function onDocKey(e) {
    if (!grdVisible() || ui.editing) return;
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
    var k = e.key;
    var handled = true;
    if (k === "ArrowUp") setActive(ui.sel.ec, ui.sel.er - 1, e.shiftKey);
    else if (k === "ArrowDown") setActive(ui.sel.ec, ui.sel.er + 1, e.shiftKey);
    else if (k === "ArrowLeft") setActive(ui.sel.ec - 1, ui.sel.er, e.shiftKey);
    else if (k === "ArrowRight") setActive(ui.sel.ec + 1, ui.sel.er, e.shiftKey);
    else if (k === "Home") setActive(0, ui.sel.er, e.shiftKey);
    else if (k === "End") setActive(MAX_COL - 1, ui.sel.er, e.shiftKey);
    else if (k === "Enter") { if (e.shiftKey) moveSel(0, -1); else moveSel(0, 1); }
    else if (k === "Tab") { e.preventDefault(); moveSel(e.shiftKey ? -1 : 1, 0); }
    else if (k === "F2") startEdit();
    else if (k === "Delete" || k === "Backspace") clearSelection();
    else if (k === "Escape") { /* nothing */ }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) startEdit(k);
    else handled = false;
    if (handled) e.preventDefault();
  }

  /* ---------- editing ---------- */
  function startEdit(initial) {
    var d = current();
    if (!d) return;
    var a = addrOf(ui.sel.ec, ui.sel.er);
    var f = d.grid.formats[a] || {};
    if (f.ctype === "checkbox") {
      var cur = getValue(d.grid, a);
      setCell(d.grid, a, !(cur.v && !cur.e));
      afterEdit(a);
      return;
    }
    var raw = d.grid.cells[a];
    E.editor.value = initial !== undefined ? initial : (raw === undefined || raw === null ? "" : String(raw));
    var cell = cellEls()[ui.sel.er * MAX_COL + ui.sel.ec];
    if (cell) {
      E.editor.style.left = cell.offsetLeft + "px";
      E.editor.style.top = cell.offsetTop + "px";
      E.editor.style.width = Math.max(colW(ui.sel.ec) - 2, 40) + "px";
      E.editor.style.height = rowH() + "px";
    }
    E.editor.classList.remove("hidden");
    ui.editing = true;
    E.editor.focus();
    if (initial !== undefined) { try { E.editor.setSelectionRange(1, 1); } catch (e) {} }
    else { E.editor.select(); }
  }
  function onEditorKey(e) {
    e.stopPropagation();
    if (e.key === "Enter") { commitEditor(true); moveSel(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Tab") { e.preventDefault(); commitEditor(true); moveSel(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === "Escape") { cancelEditor(); }
  }
  /* Write a value through the normal commit path: model update, default number
     format for newly entered values, then the full UI refresh. */
  function commitValue(addr, raw) {
    var d = current();
    if (!d) return false;
    setCell(d.grid, addr, raw);
    applyDefaultNumFmt(d, addr);
    afterEdit(addr);
    return true;
  }
  function commitEditor(refocus) {
    if (!ui.editing) return;
    var d = current();
    var a = addrOf(ui.sel.ec, ui.sel.er);
    var val = E.editor.value;
    E.editor.classList.add("hidden");
    ui.editing = false;
    if (d) commitValue(a, coerceInput(val));
    if (refocus && E.wrap) E.wrap.focus();
  }
  function cancelEditor() {
    E.editor.classList.add("hidden");
    ui.editing = false;
    if (E.wrap) E.wrap.focus();
  }
  function commitFx() {
    var d = current();
    if (!d) return;
    var a = addrOf(ui.sel.ec, ui.sel.er);
    commitValue(a, coerceInput(E.fx.value));
  }
  function coerceInput(val) {
    if (val === "") return "";
    if (val.charAt(0) === "=") return val;
    var up = val.trim().toUpperCase();
    if (up === "TRUE") return true;
    if (up === "FALSE") return false;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(val.trim())) return parseFloat(val.trim());
    return val;
  }

  function afterEdit(changedAddr) {
    var d = current();
    if (!d) return;
    docSaved(d);
    renderCells();
    paintSelection();
    syncFxBar();
    updateStatusBar();
    updateLiveBlocks(changedAddr);
    if (ui.tab === "charts") renderCharts();
    if (ui.tab === "kanban") renderKanban();
  }

  /* ---------- format actions ---------- */
  function eachSelected(fn) {
    var d = current();
    if (!d) return;
    var rg = selRange();
    for (var r = rg.r0; r <= rg.r1; r++)
      for (var c = rg.c0; c <= rg.c1; c++) fn(addrOf(c, r));
    docSaved(d);
    renderCells();
    paintSelection();
    syncFxBar();
  }
  function toggleBold() {
    var d = current(); if (!d) return;
    var a = addrOf(ui.sel.ec, ui.sel.er);
    var to = !((d.grid.formats[a] || {}).bold);
    eachSelected(function (x) { fmtOf(d.grid, x).bold = to; });
  }
  function applyFmt(patch) {
    var d = current(); if (!d) return;
    eachSelected(function (x) {
      var f = fmtOf(d.grid, x);
      for (var k in patch) if (patch.hasOwnProperty(k)) f[k] = patch[k];
    });
  }
  function applyCtype(ctype) {
    var d = current(); if (!d) return;
    eachSelected(function (x) {
      var f = fmtOf(d.grid, x);
      f.ctype = ctype;
      if (ctype === "checkbox") {
        var vv = getValue(d.grid, x);
        setCell(d.grid, x, !!(vv.v && !vv.e));
      }
    });
    renderCells();
  }
  function clearSelection() {
    var d = current(); if (!d) return;
    eachSelected(function (x) {
      delete d.grid.cells[x];
      delete d.grid.formats[x];
      delete d.grid.refs[x];
      delete d.grid.computed[x];
    });
    recalcAll(d.grid);
    renderCells(); paintSelection(); syncFxBar(); updateStatusBar();
  }

  /* ---------- sorting ---------- */
  function sortKeyOf(grid, addr) {
    var r = getValue(grid, addr);
    if (r.e) return { t: 2, v: "" };
    if (r.v === null || r.v === undefined || r.v === "") return { t: 2, v: "" };
    if (typeof r.v === "number") return { t: 0, v: r.v };
    return { t: 1, v: String(r.v).toLowerCase() };
  }
  function sortByColumn(c, dir) {
    var d = current(); if (!d) return;
    var g = d.grid;
    var ur = usedRange(g);
    if (ur.rows < 2) { toast("Nothing to sort."); return; }
    var rows = [];
    for (var r = 0; r < ur.rows; r++) rows.push(r);
    var decorated = rows.map(function (r, i) { return { r: r, i: i, k: sortKeyOf(g, addrOf(c, r)) }; });
    decorated.sort(function (a, b) {
      if (a.k.t !== b.k.t) return (a.k.t - b.k.t) * dir;
      var av = a.k.v, bv = b.k.v;
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return cmp * dir;
      return a.i - b.i;
    });
    // snapshot all columns for involved rows
    var snap = {};
    decorated.forEach(function (dd) {
      var rowSnap = [];
      for (var cc = 0; cc < MAX_COL; cc++) {
        var a = addrOf(cc, dd.r);
        rowSnap.push({ raw: g.cells[a], fmt: g.formats[a] ? JSON.parse(JSON.stringify(g.formats[a])) : undefined });
      }
      snap[dd.r] = rowSnap;
    });
    decorated.forEach(function (dd, newR) {
      var old = snap[dd.r];
      for (var cc = 0; cc < MAX_COL; cc++) {
        var a2 = addrOf(cc, newR);
        if (old[cc].raw === undefined) delete g.cells[a2]; else g.cells[a2] = old[cc].raw;
        if (old[cc].fmt === undefined) delete g.formats[a2]; else g.formats[a2] = old[cc].fmt;
      }
    });
    // rebuild refs for formula cells
    g.refs = {};
    for (var a3 in g.cells) {
      if (g.cells.hasOwnProperty(a3) && isFormula(g.cells[a3])) g.refs[a3] = (parse(g.cells[a3]).refs) || [];
    }
    recalcAll(g);
    docSaved(d);
    renderCells(); paintSelection(); syncFxBar(); updateStatusBar();
    toast("Sorted by column " + colName(c) + (dir > 0 ? " (A to Z)." : " (Z to A)."));
  }

  /* ---------- column resize ---------- */
  function startResize(e, c) {
    e.preventDefault(); e.stopPropagation();
    var d = current();
    var startX = e.clientX, startW = colW(c);
    function mv(ev) {
      var w = Math.max(40, Math.min(400, startW + ev.clientX - startX));
      if (d) { d.colWidths[c] = w; }
      applyColWidths();
    }
    function up() {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
      if (d) docSaved(d);
    }
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  }

  /* ---------------- kanban view ---------------- */
  var KB_COLS = [
    { id: "todo", label: "Todo", status: "Todo" },
    { id: "doing", label: "Doing", status: "Doing" },
    { id: "done", label: "Done", status: "Done" },
    { id: "other", label: "Other", status: "" }
  ];

  function buildKanbanView(app) {
    var v = mk("div", "grd-view hidden", "grd-view-kanban");
    var cfg = mk("div", "grd-kb-config");
    var lab1 = mk("label", "", "grd-kb-lab1"); lab1.textContent = "Status column ";
    var sc = mk("select", "", "grd-kb-statuscol"); sc.setAttribute("aria-label", "Status column");
    var lab2 = mk("label", "", "grd-kb-lab2"); lab2.textContent = "Title column ";
    var tc = mk("select", "", "grd-kb-titlecol"); tc.setAttribute("aria-label", "Title column");
    for (var c = 0; c < MAX_COL; c++) {
      var o1 = mk("option"); o1.value = colName(c); o1.textContent = colName(c); sc.appendChild(o1);
      var o2 = mk("option"); o2.value = colName(c); o2.textContent = colName(c); tc.appendChild(o2);
    }
    sc.addEventListener("change", function () { var d = current(); if (d) { d.kanban.statusCol = sc.value; docSaved(d); renderKanban(); } });
    tc.addEventListener("change", function () { var d = current(); if (d) { d.kanban.titleCol = tc.value; docSaved(d); renderKanban(); } });
    lab1.appendChild(sc); lab2.appendChild(tc);
    cfg.appendChild(lab1); cfg.appendChild(lab2);
    var hint = mk("span", "grd-kb-hint", "grd-kb-hint");
    hint.textContent = "Drag cards between columns, or use the status menu on touch.";
    cfg.appendChild(hint);
    v.appendChild(cfg);
    var board = mk("div", "grd-kb-board", "grd-kb-board");
    v.appendChild(board);
    app.appendChild(v);
    E.viewKanban = v; E.kbBoard = board; E.kbStatus = sc; E.kbTitle = tc;
  }

  function kbStatusOf(displayVal) {
    var s = String(displayVal == null ? "" : displayVal).trim().toLowerCase();
    if (s === "todo") return "todo";
    if (s === "doing") return "doing";
    if (s === "done") return "done";
    return "other";
  }

  function renderKanban() {
    var d = current();
    if (!d || !E.kbBoard) return;
    var g = d.grid;
    var sc = d.kanban.statusCol || "C", tc = d.kanban.titleCol || "A";
    E.kbStatus.value = sc; E.kbTitle.value = tc;
    var ur = usedRange(g);
    var buckets = { todo: [], doing: [], done: [], other: [] };
    for (var r = 0; r < ur.rows; r++) {
      var title = displayOf(g, tc + (r + 1));
      var status = displayOf(g, sc + (r + 1));
      var hasAny = title !== "" || status !== "";
      if (!hasAny) {
        for (var c = 0; c < MAX_COL && !hasAny; c++) {
          if (g.cells[addrOf(c, r)] !== undefined) hasAny = true;
        }
      }
      if (!hasAny) continue;
      buckets[kbStatusOf(status)].push({ row: r, title: title || ("Row " + (r + 1)), status: status });
    }
    E.kbBoard.innerHTML = "";
    KB_COLS.forEach(function (col) {
      var colEl = mk("div", "grd-kb-col");
      colEl.setAttribute("data-kb", col.id);
      var hd = mk("div", "grd-kb-colhead");
      hd.textContent = col.label + " (" + buckets[col.id].length + ")";
      colEl.appendChild(hd);
      var list = mk("div", "grd-kb-list");
      buckets[col.id].forEach(function (card) {
        list.appendChild(kbCard(d, card, sc, tc));
      });
      var add = btn("+ Add card", "", "grd-kb-add", "Add a card to " + col.label);
      add.addEventListener("click", function () {
        var d2 = current(); if (!d2) return;
        var nr = usedRange(d2.grid).rows; // 0-based count -> next row index
        setCell(d2.grid, tc + (nr + 1), "New task");
        if (col.status) setCell(d2.grid, sc + (nr + 1), col.status);
        docSaved(d2);
        renderCells();
        renderKanban();
      });
      colEl.appendChild(list);
      colEl.appendChild(add);
      // HTML5 drag targets
      colEl.addEventListener("dragover", function (e) { e.preventDefault(); colEl.classList.add("grd-drop"); });
      colEl.addEventListener("dragleave", function () { colEl.classList.remove("grd-drop"); });
      colEl.addEventListener("drop", function (e) {
        e.preventDefault();
        colEl.classList.remove("grd-drop");
        var row = parseInt(e.dataTransfer.getData("text/grd-row"), 10);
        var d3 = current();
        if (d3 && !isNaN(row)) {
          setCell(d3.grid, sc + (row + 1), col.status);
          afterEdit(sc + (row + 1));
        }
      });
      E.kbBoard.appendChild(colEl);
    });
  }

  function kbCard(d, card, sc, tc) {
    var elc = mk("div", "grd-kb-card");
    elc.draggable = true;
    elc.setAttribute("data-row", card.row);
    var title = mk("div", "grd-kb-title");
    title.textContent = card.title;
    title.title = "Double-click to edit";
    title.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      var inp = mk("input", "grd-kb-edit");
      inp.value = String(d.grid.cells[tc + (card.row + 1)] == null ? "" : d.grid.cells[tc + (card.row + 1)]);
      inp.setAttribute("aria-label", "Edit card title");
      title.innerHTML = "";
      title.appendChild(inp);
      inp.focus(); inp.select();
      function done(commit) {
        if (commit) {
          var d2 = current();
          if (d2) { setCell(d2.grid, tc + (card.row + 1), inp.value); afterEdit(tc + (card.row + 1)); }
        } else renderKanban();
      }
      inp.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
        if (ev.key === "Enter") done(true);
        else if (ev.key === "Escape") done(false);
      });
      inp.addEventListener("blur", function () { done(true); });
    });
    var meta = mk("div", "grd-kb-meta");
    meta.textContent = "Row " + (card.row + 1);
    var pill = mk("span", "grd-pill " + pillClass(card.status || "Todo"));
    pill.textContent = card.status || "None";
    var mv = mk("select", "grd-kb-move");
    mv.setAttribute("aria-label", "Move card to column");
    [["", "Move to..."], ["Todo", "Todo"], ["Doing", "Doing"], ["Done", "Done"]].forEach(function (o) {
      var op = mk("option"); op.value = o[0]; op.textContent = o[1]; mv.appendChild(op);
    });
    mv.addEventListener("change", function () {
      var d2 = current();
      if (d2 && mv.value) { setCell(d2.grid, sc + (card.row + 1), mv.value); afterEdit(sc + (card.row + 1)); }
    });
    var del = btn("Delete", "", "grd-kb-del", "Delete this row");
    del.addEventListener("click", function () {
      var d2 = current();
      if (!d2) return;
      for (var c = 0; c < MAX_COL; c++) {
        var a = addrOf(c, card.row);
        delete d2.grid.cells[a]; delete d2.grid.formats[a];
        delete d2.grid.refs[a]; delete d2.grid.computed[a];
      }
      recalcAll(d2.grid);
      docSaved(d2);
      renderCells();
      renderKanban();
    });
    var row2 = mk("div", "grd-kb-actions");
    row2.appendChild(mv); row2.appendChild(del);
    elc.appendChild(title); elc.appendChild(meta); elc.appendChild(pill); elc.appendChild(row2);
    elc.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/grd-row", String(card.row));
      e.dataTransfer.effectAllowed = "move";
    });
    return elc;
  }

  /* ---------------- charts view ---------------- */
  var CHART_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"];

  function buildChartsView(app) {
    var v = mk("div", "grd-view hidden", "grd-view-charts");
    var ctl = mk("div", "grd-ch-controls");
    var lab = mk("label", "", "grd-ch-lab"); lab.textContent = "Range ";
    var rg = mk("input", "", "grd-ch-range");
    rg.value = "A1:B6"; rg.setAttribute("aria-label", "Chart data range, e.g. A1:B6");
    rg.placeholder = "A1:B6";
    var ty = mk("select", "", "grd-ch-type"); ty.setAttribute("aria-label", "Chart type");
    [["bar", "Bar"], ["line", "Line"], ["pie", "Pie"]].forEach(function (o) {
      var op = mk("option"); op.value = o[0]; op.textContent = o[1]; ty.appendChild(op);
    });
    var ti = mk("input", "", "grd-ch-title");
    ti.placeholder = "Chart title"; ti.setAttribute("aria-label", "Chart title");
    var add = btn("Add chart", "grd-ch-add", "grd-btn", "Create a chart from the range");
    add.addEventListener("click", function () {
      var d = current(); if (!d) return;
      var range = rg.value.trim();
      if (!parseRangeStr(range)) { toast("Enter a valid range like A1:B6.", "error"); return; }
      d.charts.push({ id: uid("ch"), type: ty.value, range: range, title: ti.value.trim() || (ty.value + " chart") });
      docSaved(d);
      renderCharts();
    });
    lab.appendChild(rg);
    ctl.appendChild(lab); ctl.appendChild(ty); ctl.appendChild(ti); ctl.appendChild(add);
    var hint = mk("span", "grd-ch-hint", "grd-ch-hint2");
    hint.textContent = "First row holds series names, first column holds labels. Charts re-render on every edit.";
    ctl.appendChild(hint);
    v.appendChild(ctl);
    var list = mk("div", "grd-ch-list", "grd-ch-list");
    v.appendChild(list);
    app.appendChild(v);
    E.viewCharts = v; E.chList = list; E.chRange = rg; E.chType = ty; E.chTitle = ti;
  }

  function parseRangeStr(s) {
    var m = /^([A-Za-z]{1,2}[0-9]{1,3})(?::([A-Za-z]{1,2}[0-9]{1,3}))?$/.exec((s || "").trim());
    if (!m) return null;
    var p1 = parseAddr(m[1]);
    if (!p1) return null;
    var p2 = m[2] ? parseAddr(m[2]) : p1;
    if (!p2) return null;
    return {
      c0: Math.min(p1.c, p2.c), c1: Math.max(p1.c, p2.c),
      r0: Math.min(p1.r, p2.r), r1: Math.max(p1.r, p2.r)
    };
  }
  function rangeIntersects(rangeStr, addr) {
    var rg = parseRangeStr(rangeStr);
    var p = parseAddr(addr);
    if (!rg || !p) return false;
    return p.c >= rg.c0 && p.c <= rg.c1 && p.r >= rg.r0 && p.r <= rg.r1;
  }

  function chartData(doc, chart) {
    var rg = parseRangeStr(chart.range);
    var out = { labels: [], series: [] };
    if (!rg) return out;
    var g = doc.grid;
    for (var c = rg.c0 + 1; c <= rg.c1; c++) {
      out.series.push({ name: displayOf(g, addrOf(c, rg.r0)) || colName(c), data: [] });
    }
    for (var r = rg.r0 + 1; r <= rg.r1; r++) {
      out.labels.push(displayOf(g, addrOf(rg.c0, r)));
      for (var s = 0; s < out.series.length; s++) {
        var vv = getValue(g, addrOf(rg.c0 + 1 + s, r));
        var n = toNum(vv);
        out.series[s].data.push(isErr(n) ? 0 : n.v);
      }
    }
    return out;
  }

  function chartSVG(doc, chart) {
    var data = chartData(doc, chart);
    var W = 560, H = 320, L = 48, Rr = 16, Tp = 30, B = 52;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(chart.title) + '">';
    svg += '<text x="' + (W / 2) + '" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor">' + esc(chart.title) + "</text>";
    var has = data.series.length && data.labels.length && data.series.some(function (s) { return s.data.some(function (x) { return x !== 0; }); });
    if (!has) {
      svg += '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="13" fill="currentColor">No numeric data in ' + esc(chart.range) + "</text></svg>";
      return svg;
    }
    if (chart.type === "pie") {
      var vals = data.series[0].data;
      var total = vals.reduce(function (a, b) { return a + b; }, 0) || 1;
      var cx = W / 2 - 60, cy = H / 2 + 10, rad = 105, ang = -Math.PI / 2;
      for (var i = 0; i < vals.length; i++) {
        var frac = vals[i] / total;
        var a2 = ang + frac * Math.PI * 2;
        var big = frac > 0.5 ? 1 : 0;
        var x1 = cx + rad * Math.cos(ang), y1 = cy + rad * Math.sin(ang);
        var x2 = cx + rad * Math.cos(a2), y2 = cy + rad * Math.sin(a2);
        if (frac > 0) {
          svg += '<path d="M' + cx + "," + cy + " L" + x1.toFixed(1) + "," + y1.toFixed(1) +
            " A" + rad + "," + rad + " 0 " + big + " 1 " + x2.toFixed(1) + "," + y2.toFixed(1) + ' Z" fill="' + CHART_COLORS[i % CHART_COLORS.length] + '" stroke="#fff" stroke-width="1"/>';
        }
        ang = a2;
      }
      var lx = cx + rad + 24, ly = cy - rad + 8;
      for (var j = 0; j < data.labels.length; j++) {
        var pct = Math.round((vals[j] / total) * 100);
        svg += '<rect x="' + lx + '" y="' + ly + '" width="12" height="12" fill="' + CHART_COLORS[j % CHART_COLORS.length] + '"/>' +
          '<text x="' + (lx + 18) + '" y="' + (ly + 11) + '" font-size="12" fill="currentColor">' + esc(data.labels[j] || ("Item " + (j + 1))) + " " + pct + "%</text>";
        ly += 22;
      }
      svg += "</svg>";
      return svg;
    }
    var all = [];
    data.series.forEach(function (s) { s.data.forEach(function (x) { all.push(x); }); });
    var max = Math.max.apply(null, all.concat([0]));
    var min = Math.min.apply(null, all.concat([0]));
    if (max === min) { max = min + 1; }
    var pw = W - L - Rr, ph = H - Tp - B;
    function X(i) { return L + (i + 0.5) * (pw / data.labels.length); }
    function Y(v) { return Tp + ph - ((v - min) / (max - min)) * ph; }
    svg += '<line x1="' + L + '" y1="' + Tp + '" x2="' + L + '" y2="' + (Tp + ph) + '" stroke="currentColor" stroke-width="1"/>';
    svg += '<line x1="' + L + '" y1="' + (Tp + ph) + '" x2="' + (L + pw) + '" y2="' + (Tp + ph) + '" stroke="currentColor" stroke-width="1"/>';
    for (var g2 = 0; g2 <= 4; g2++) {
      var gv = min + ((max - min) * g2) / 4;
      var gy = Y(gv);
      svg += '<text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="currentColor">' + esc(groupNum(Math.round(gv * 100) / 100)) + "</text>";
    }
    if (chart.type === "bar") {
      var ns = data.series.length;
      var slot = pw / data.labels.length;
      var bw = Math.min(38, (slot * 0.7) / ns);
      data.labels.forEach(function (lab, i) {
        data.series.forEach(function (s, si) {
          var bx = X(i) - (ns * bw) / 2 + si * bw;
          var by = Y(s.data[i]);
          var bh = Tp + ph - by;
          svg += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" fill="' + CHART_COLORS[si % CHART_COLORS.length] + '"/>';
        });
        var t = String(lab || "");
        if (t.length > 12) t = t.slice(0, 11) + ".";
        svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Tp + ph + 16) + '" text-anchor="middle" font-size="10" fill="currentColor">' + esc(t) + "</text>";
      });
    } else { // line
      data.series.forEach(function (s, si) {
        var pts = s.data.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" ");
        svg += '<polyline points="' + pts + '" fill="none" stroke="' + CHART_COLORS[si % CHART_COLORS.length] + '" stroke-width="2"/>';
        s.data.forEach(function (v, i) {
          svg += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3" fill="' + CHART_COLORS[si % CHART_COLORS.length] + '"/>';
        });
      });
      data.labels.forEach(function (lab, i) {
        var t = String(lab || "");
        if (t.length > 12) t = t.slice(0, 11) + ".";
        svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Tp + ph + 16) + '" text-anchor="middle" font-size="10" fill="currentColor">' + esc(t) + "</text>";
      });
    }
    var lgx = L + 8, lgy = 26;
    data.series.forEach(function (s, si) {
      svg += '<rect x="' + lgx + '" y="' + (lgy - 9) + '" width="10" height="10" fill="' + CHART_COLORS[si % CHART_COLORS.length] + '"/>' +
        '<text x="' + (lgx + 14) + '" y="' + lgy + '" font-size="11" fill="currentColor">' + esc(s.name) + "</text>";
      lgx += 14 + String(s.name).length * 7 + 18;
    });
    svg += "</svg>";
    return svg;
  }

  function renderCharts() {
    var d = current();
    if (!d || !E.chList) return;
    E.chList.innerHTML = "";
    if (!d.charts.length) {
      var p = mk("p", "grd-ch-none");
      p.textContent = "No charts yet. Pick a range above and add one.";
      E.chList.appendChild(p);
      return;
    }
    d.charts.forEach(function (ch) {
      var item = mk("div", "grd-ch-item");
      var hd = mk("div", "grd-ch-itemhead");
      var t = mk("span", "grd-ch-itemtitle");
      t.textContent = ch.title + "  ·  " + ch.type + "  ·  " + ch.range;
      var push = btn("Push to TXT", "", "grd-btn grd-btn-small", "Push this chart as a live block into the TXT word document");
      push.addEventListener("click", function () { pushChartToTxt(ch); });
      var del = btn("Delete", "", "grd-btn grd-btn-small grd-btn-danger", "Delete this chart");
      del.addEventListener("click", function () {
        var d2 = current(); if (!d2) return;
        d2.charts = d2.charts.filter(function (x) { return x.id !== ch.id; });
        d2.live = d2.live.filter(function (b) { return b.chartId !== ch.id; });
        docSaved(d2);
        renderCharts();
      });
      hd.appendChild(t); hd.appendChild(push); hd.appendChild(del);
      var body = mk("div", "grd-ch-svg");
      body.innerHTML = chartSVG(d, ch);
      item.appendChild(hd); item.appendChild(body);
      E.chList.appendChild(item);
    });
  }

  /* ---------------- cross-app: live push to TXT ---------------- */
  function emitLive(evt, payload) {
    if (T.store && T.store.emit) T.store.emit(evt, payload);
  }

  function tableValues(doc, rangeStr) {
    var rg = parseRangeStr(rangeStr);
    var rows = [];
    if (!rg) return rows;
    for (var r = rg.r0; r <= rg.r1; r++) {
      var row = [];
      for (var c = rg.c0; c <= rg.c1; c++) row.push(displayOf(doc.grid, addrOf(c, r)));
      rows.push(row);
    }
    return rows;
  }
  function tableHTML(values) {
    var h = '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;">';
    values.forEach(function (row, ri) {
      h += "<tr>";
      row.forEach(function (cell) {
        h += ri === 0
          ? '<th style="background:#f3f4f6;text-align:left;">' + esc(cell) + "</th>"
          : "<td>" + esc(cell) + "</td>";
      });
      h += "</tr>";
    });
    return h + "</table>";
  }

  // Testable, UI-free: register + emit a live table block for a doc.
  function pushLiveTable(doc, rangeStr, label) {
    if (!doc || !parseRangeStr(rangeStr)) return null;
    var values = tableValues(doc, rangeStr);
    var block = {
      id: uid("live"), kind: "table",
      label: label || (doc.title + " " + rangeStr),
      range: rangeStr
    };
    doc.live.push(block);
    docSaved(doc);
    emitLive("grd:live", { id: block.id, label: block.label, html: tableHTML(values), values: values });
    return block;
  }
  function pushLiveChart(doc, chart) {
    if (!doc || !chart) return null;
    var data = chartData(doc, chart);
    var block = {
      id: uid("live"), kind: "chart",
      label: chart.title || (doc.title + " chart"),
      chartId: chart.id, range: chart.range
    };
    doc.live.push(block);
    docSaved(doc);
    emitLive("grd:live", { id: block.id, label: block.label, html: chartSVG(doc, chart), values: data });
    return block;
  }
  // Testable, UI-free: re-emit grd:update for blocks affected by an edit.
  function updateLive(doc, changedAddr) {
    if (!doc || !doc.live) return 0;
    var n = 0;
    doc.live.forEach(function (b) {
      if (!rangeIntersects(b.range, changedAddr)) return;
      if (b.kind === "table") {
        emitLive("grd:update", { id: b.id, values: tableValues(doc, b.range) });
        n++;
      } else if (b.kind === "chart") {
        var ch = null;
        (doc.charts || []).forEach(function (x) { if (x.id === b.chartId) ch = x; });
        if (ch) { emitLive("grd:update", { id: b.id, values: chartData(doc, ch) }); n++; }
      }
    });
    return n;
  }

  // UI wrappers for the current doc.
  function pushSelectionToTxt() {
    var d = current();
    if (!d) { toast("Open a sheet first.", "error"); return; }
    var range = rangeAddrStr(selRange());
    var b = pushLiveTable(d, range, d.title + " " + range);
    if (b) toast("Live table pushed to TXT. Edits will refresh it.");
  }
  function pushChartToTxt(chart) {
    var d = current();
    if (!d) return;
    var b = pushLiveChart(d, chart);
    if (b) toast("Live chart pushed to TXT. Edits will refresh it.");
  }
  function updateLiveBlocks(changedAddr) {
    var d = current();
    if (d) updateLive(d, changedAddr);
  }

  /* ---------------- commands, bus wiring, public API ---------------- */
  function regCommands() {
    if (!T.register) return;
    T.register("grd.new", function () {
      var d = newDoc();
      openDoc(d.id);
      show(); switchSub("app"); switchTab("grid");
    }, { title: "New GRD spreadsheet", cat: "GRD", icon: "i-grid", match: "grd new spreadsheet sheet" });
    T.register("grd.home", function () {
      show(); renderHome(); switchSub("home");
    }, { title: "GRD home", cat: "GRD", icon: "i-grid", match: "grd home sheets" });
    T.register("grd.grid", function () {
      var d = current(); if (!d) { toast("Open a sheet first.", "error"); return; }
      show(); switchSub("app"); switchTab("grid");
    }, { title: "GRD grid view", cat: "GRD", icon: "i-grid", match: "grd grid cells" });
    T.register("grd.kanban", function () {
      var d = current(); if (!d) { toast("Open a sheet first.", "error"); return; }
      show(); switchSub("app"); switchTab("kanban");
    }, { title: "GRD kanban view", cat: "GRD", icon: "i-grid", match: "grd kanban board tasks" });
    T.register("grd.charts", function () {
      var d = current(); if (!d) { toast("Open a sheet first.", "error"); return; }
      show(); switchSub("app"); switchTab("charts");
    }, { title: "GRD charts view", cat: "GRD", icon: "i-grid", match: "grd chart graph" });
    T.register("grd.push-live", function () {
      show(); switchSub("app"); switchTab("grid");
      pushSelectionToTxt();
    }, { title: "Push GRD selection to TXT", cat: "GRD", icon: "i-grid", match: "grd push live table txt" });
  }

  if (T.bus && T.bus.on) {
    T.bus.on("ecosystem:app", function (p) {
      if (p && p.app === "grd") show();
    });
  }
  regCommands();

  /* ---------------- public API ---------------- */
  T.grd = {
    show: show,
    hide: hide,
    // pure engine / model (DOM-free, testable)
    newGrid: newGrid,
    setCell: setCell,
    getCell: getCell,
    getValue: getValue,
    evaluate: evaluate,
    parse: parse,
    recalcAll: recalcAll,
    displayOf: displayOf,
    addrOf: addrOf,
    parseAddr: parseAddr,
    colName: colName,
    // docs
    newDoc: newDoc,
    openDoc: openDoc,
    current: current,
    allDocs: allDocs,
    deleteDoc: deleteDoc,
    templates: function () { return TEMPLATES.slice(); },
    // per-app file model: {id, name, updatedAt} records + sheet payload
    files: files,
    // per-app settings (persisted in T.store 'grd' / 'settings')
    settings: settings,
    saveSettings: saveSettings,
    applySettings: applySettings,
    openSettings: openSettings,
    closeSettings: closeSettings,
    // write path used by the cell editor and formula bar
    commitValue: commitValue,
    // cross-app live blocks (DOM-free)
    pushLiveTable: pushLiveTable,
    pushLiveChart: pushLiveChart,
    updateLive: updateLive,
    chartData: chartData,
    // ui helpers (need built view)
    goHome: function () { if (built) { renderHome(); switchSub("home"); } },
    openTab: function (t) { if (built) { switchSub("app"); switchTab(t); } },
    selection: function () { return rangeAddrStr(selRange()); }
  };
})();
