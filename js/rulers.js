/* TXT rulers: horizontal/vertical tick render + draggable margin/indent markers.
   Owns #rulerH (#rulerHTicks, #mLeft, #mFirst, #mRight) and #rulerV (#rulerVTicks). */

(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$, $$ = T.$$;
  var bus = T.bus;

  var STEP = 12, INCH = 96;
  var lastGeom = { w: 816, h: 1056, margin: 96 };

  function rulerH() { return $("#rulerH"); }
  function ticksH() { return $("#rulerHTicks"); }
  function ticksV() { return $("#rulerVTicks"); }
  function mLeft() { return $("#mLeft"); }
  function mRight() { return $("#mRight"); }
  function mFirst() { return $("#mFirst"); }

  /* Center offset (px) of the w-wide tick strip inside the full-width ruler bar. */
  function centerOffset(w) {
    var rh = rulerH();
    if (!rh) return 0;
    return Math.max(0, (rh.clientWidth - w) / 2);
  }

  function renderTicks() {
    var th = ticksH(), tv = ticksV();
    var w = lastGeom.w, h = lastGeom.h, x, y, d;

    if (th) {
      th.innerHTML = "";
      th.style.width = w + "px";
      th.style.left = "50%";
      th.style.right = "auto";
      th.style.marginLeft = (-w / 2) + "px";
      var fh = document.createDocumentFragment();
      for (x = 0; x <= w; x += STEP) {
        d = document.createElement("div");
        d.className = "tick";
        d.style.left = x + "px";
        d.style.height = (x % INCH === 0 ? 12 : (x % (INCH / 2) === 0 ? 9 : 6)) + "px";
        fh.appendChild(d);
        if (x % INCH === 0) {
          var lab = document.createElement("div");
          lab.className = "tick-lab";
          lab.style.left = x + "px";
          lab.textContent = String(x / INCH);
          fh.appendChild(lab);
        }
      }
      th.appendChild(fh);
    }

    if (tv) {
      tv.innerHTML = "";
      tv.style.height = h + "px";
      var fv = document.createDocumentFragment();
      for (y = 0; y <= h; y += STEP) {
        d = document.createElement("div");
        d.className = "tick";
        d.style.top = y + "px";
        d.style.width = (y % INCH === 0 ? 12 : (y % (INCH / 2) === 0 ? 9 : 6)) + "px";
        d.style.height = "1px";
        fv.appendChild(d);
        if (y % INCH === 0) {
          var lab2 = document.createElement("div");
          lab2.className = "tick-lab";
          lab2.style.top = y + "px";
          lab2.style.left = "2px";
          lab2.style.bottom = "auto";
          lab2.style.transform = "translateY(-11px)";
          lab2.textContent = String(y / INCH);
          fv.appendChild(lab2);
        }
      }
      tv.appendChild(fv);
    }
    positionMarkers();
  }

  function currentIndent() {
    var b = T.sel.block();
    if (b && b.style && b.style.textIndent) {
      var v = parseInt(b.style.textIndent, 10);
      if (!isNaN(v)) return v;
    }
    return T.state.prefs.firstIndent || 0;
  }

  function positionMarkers() {
    var off = centerOffset(lastGeom.w);
    var m = lastGeom.margin;
    var ml = mLeft(), mr = mRight(), mf = mFirst();
    if (ml) ml.style.left = (off + m) + "px";
    if (mr) mr.style.left = (off + lastGeom.w - m) + "px";
    if (mf) mf.style.left = (off + m + currentIndent()) + "px";
  }

  function copyGeom() {
    var g = T.editor.geom;
    return {
      paper: g.paper, orient: g.orient, margin: g.margin,
      customMargin: g.customMargin, columns: g.columns, colDiv: g.colDiv
    };
  }

  function setLiveMargin(v) {
    var g = T.editor.geom;
    if (g.margin !== "custom") g.margin = "custom";
    g.customMargin = v;
    lastGeom.margin = v;
    document.documentElement.style.setProperty("--page-pad", v + "px");
    positionMarkers();
  }

  function finishMargin() {
    T.editor.applyGeom(); /* re-emits page:geom, normalizes markers */
    T.state.prefs.geom = copyGeom();
    T.savePrefs();
  }

  function dragMarker(el, onStart, onMove, onUp) {
    if (!el) return;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      var startX = e.clientX;
      var s0 = onStart ? onStart() : 0;
      function mv(ev) { onMove(ev.clientX - startX, s0); }
      function up() {
        el.removeEventListener("pointermove", mv);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (onUp) onUp();
      }
      el.addEventListener("pointermove", mv);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  function bindMarkers() {
    dragMarker(mLeft(),
      function () { return T.editor.marginPx(); },
      function (dx, start) {
        var v = T.clamp(Math.round(start + dx), 24, Math.floor(lastGeom.w / 2));
        setLiveMargin(v);
      },
      finishMargin);

    dragMarker(mRight(),
      function () { return T.editor.marginPx(); },
      function (dx, start) {
        var v = T.clamp(Math.round(start - dx), 24, Math.floor(lastGeom.w / 2));
        setLiveMargin(v);
      },
      finishMargin);

    dragMarker(mFirst(),
      function () { return currentIndent(); },
      function (dx, start) {
        var v = T.clamp(Math.round(start + dx), 0, Math.floor(lastGeom.w / 2));
        applyIndent(v);
      },
      function () {
        T.state.prefs.firstIndent = currentIndent();
        T.savePrefs();
        T.editor.markDirty();
      });
  }

  function applyIndent(v) {
    var b = T.sel.block();
    if (b) b.style.textIndent = v + "px";
    T.state.prefs.firstIndent = v;
    positionMarkers();
  }

  function onGeom(p) {
    lastGeom.w = p.w;
    lastGeom.h = p.h;
    lastGeom.margin = p.margin;
    renderTicks();
  }

  bus.on("page:geom", onGeom);
  bus.on("doc:open", function () {
    lastGeom.w = T.editor.pageW();
    lastGeom.h = T.editor.pageH();
    lastGeom.margin = T.editor.marginPx();
    renderTicks();
  });
  bus.on("sel:change", T.debounce(positionMarkers, 150));
  window.addEventListener("resize", T.debounce(positionMarkers, 150));

  /* restore persisted geometry, then initial render */
  (function init() {
    var saved = T.state.prefs.geom;
    if (saved && typeof saved === "object") {
      try { Object.assign(T.editor.geom, saved); } catch (e) {}
    }
    bindMarkers();
    lastGeom.w = T.editor.pageW();
    lastGeom.h = T.editor.pageH();
    lastGeom.margin = T.editor.marginPx();
    renderTicks();
  })();
})();
