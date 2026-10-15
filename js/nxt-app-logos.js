/* NXT OS user-supplied app logos: wordmark artwork extracted from
   DigiCash_2.pdf (one logo per app). The page-4 artwork is labeled VAC; it
   is applied to the VAC app without renaming anything, pending the user's
   decision. Ascend has no supplied logo and keeps its graduation-cap badge.
   The older hand-authored SVG set (T.nxtLogos, used by boot/login/splash)
   is left untouched.
   Run: loaded before ecosystem.js and nxt-home.js in index.html. */
(function () {
  "use strict";
  var T = window.TXT;
  if (!T) return;

  var LOGOS = {
    txt: "assets/logos/txt.png",
    grd: "assets/logos/grd.png",
    dck: "assets/logos/dck.png",
    vac: "assets/logos/vac.png",
    pxl: "assets/logos/pxl.png",
    mem: "assets/logos/mem.png",
    hub: "assets/logos/hub.png",
    pdf: "assets/logos/pdf.png"
  };

  T.appLogos = LOGOS;

  /* Build an <img> for an app logo. Returns null for unknown ids. */
  T.appLogoImg = function (id, cls) {
    if (!LOGOS[id]) return null;
    var img = document.createElement("img");
    img.src = LOGOS[id];
    img.alt = id.toUpperCase() + " logo";
    img.className = cls || "app-logo-img";
    img.draggable = false;
    return img;
  };
})();
