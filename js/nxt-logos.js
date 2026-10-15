/* NXT OS Phase 1 workstream E: nine custom SVG logos.
   Hand-authored geometric marks, viewBox 0 0 48 48. Exposes:
     T.nxtLogos = { get(id), ids() }
   ids() returns the nine app ids. get(id) returns an inline SVG markup
   string; unknown ids fall back to the nxt logo. */
(function () {
  "use strict";
  var T = window.TXT;

  var IDS = ["nxt", "txt", "pxl", "vac", "pdf", "grd", "dck", "mem", "hub"];

  /* Interlocking 3D geometric prism forming an NXT monogram, with an H3NZ
     micro-engraving. Titanium/champagne palette. */
  function logoNxt() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="NXT">' +
      '<defs><linearGradient id="nxt-g1" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#E2E8F0"/><stop offset="1" stop-color="#94A3B8"/></linearGradient>' +
      '<linearGradient id="nxt-g2" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#C084FC"/></linearGradient></defs>' +
      '<polygon points="10,38 10,10 17,10 17,30 31,10 38,10 38,38 31,38 31,18 17,38" fill="url(#nxt-g1)"/>' +
      '<polygon points="14,6 20,6 14,12" fill="#38BDF8" opacity="0.85"/>' +
      '<polygon points="34,42 40,42 34,36" fill="#C084FC" opacity="0.85"/>' +
      '<polygon points="10,38 17,38 13.5,44" fill="url(#nxt-g2)" opacity="0.55"/>' +
      '<text x="24" y="44" font-family="monospace" font-size="3.4" letter-spacing="1.2" ' +
      'text-anchor="middle" fill="#64748B">H3NZ</text></svg>';
  }

  /* Faceted amethyst crystal page-fold with a precision serif T suspended
     inside. #7C3AED family. */
  function logoTxt() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="TXT">' +
      '<defs><linearGradient id="txt-g1" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#A78BFA"/><stop offset="1" stop-color="#7C3AED"/></linearGradient>' +
      '<linearGradient id="txt-g2" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#C4B5FD"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs>' +
      '<polygon points="24,4 40,14 40,34 24,44 8,34 8,14" fill="url(#txt-g1)"/>' +
      '<polygon points="24,4 40,14 24,24 8,14" fill="url(#txt-g2)" opacity="0.75"/>' +
      '<polygon points="24,24 40,14 40,34 24,44" fill="#5B21B6" opacity="0.35"/>' +
      '<polygon points="40,14 32,20 32,12" fill="#EDE9FE" opacity="0.9"/>' +
      '<polygon points="8,14 16,20 16,12" fill="#DDD6FE" opacity="0.9"/>' +
      '<text x="24" y="33" font-family="Georgia, serif" font-size="17" font-weight="bold" ' +
      'text-anchor="middle" fill="#FFFFFF">T</text></svg>';
  }

  /* Multi-blade camera aperture iris intersecting stacked isometric pixel
     planes, with a Px mark. #EC4899 family. */
  function logoPxl() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="PXL">' +
      '<defs><linearGradient id="pxl-g1" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#F472B6"/><stop offset="1" stop-color="#EC4899"/></linearGradient>' +
      '<radialGradient id="pxl-g2" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#FBCFE3"/><stop offset="1" stop-color="#DB2777"/></radialGradient></defs>' +
      '<rect x="6" y="30" width="9" height="9" transform="skewY(-8)" fill="#F9A8D4" opacity="0.6"/>' +
      '<rect x="17" y="32" width="9" height="9" transform="skewY(-8)" fill="#F472B6" opacity="0.7"/>' +
      '<rect x="28" y="34" width="9" height="9" transform="skewY(-8)" fill="#EC4899" opacity="0.8"/>' +
      '<g transform="rotate(0 24 22)">' +
      '<polygon points="24,6 38,14 38,30 24,38 10,30 10,14" fill="none" stroke="url(#pxl-g1)" stroke-width="3"/>' +
      '<polygon points="24,13 32,18 32,26 24,31 16,26 16,18" fill="url(#pxl-g2)"/>' +
      '<path d="M24 6 L24 13 M38 14 L32 18 M38 30 L32 26 M24 38 L24 31 M10 30 L16 26 M10 14 L16 18" ' +
      'stroke="#831843" stroke-width="1.4"/></g>' +
      '<text x="24" y="28" font-family="Verdana, sans-serif" font-size="9" font-weight="bold" ' +
      'text-anchor="middle" fill="#FFFFFF">Px</text></svg>';
  }

  /* Precision compass nib plotting a cubic Bezier S-curve with glowing
     diamond anchor handles, Vc mark. #84CC16 family. */
  function logoVac() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="VAC">' +
      '<defs><linearGradient id="vac-g1" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#A3E635"/><stop offset="1" stop-color="#65A30D"/></linearGradient>' +
      '<filter id="vac-glow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="1.2" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<path d="M8 36 C 16 36, 16 12, 24 12 S 32 36, 40 36" fill="none" ' +
      'stroke="url(#vac-g1)" stroke-width="3.2" stroke-linecap="round"/>' +
      '<polygon points="8,32 12,36 8,40 4,36" fill="#A3E635" filter="url(#vac-glow)"/>' +
      '<polygon points="40,32 44,36 40,40 36,36" fill="#65A30D" filter="url(#vac-glow)"/>' +
      '<polygon points="24,8 28,12 24,16 20,12" fill="#D9F99D" filter="url(#vac-glow)"/>' +
      '<polygon points="33,6 41,6 41,14 37,10" fill="#3F6212"/>' +
      '<polygon points="33,6 37,10 33,14" fill="#65A30D"/>' +
      '<text x="24" y="33" font-family="Verdana, sans-serif" font-size="9" font-weight="bold" ' +
      'text-anchor="middle" fill="#1A2E05">Vc</text></svg>';
  }

  /* Geometric key shield woven with a continuous golden Mobius document
     ribbon, Pf mark. #F59E0B family. */
  function logoPdf() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="PDF">' +
      '<defs><linearGradient id="pdf-g1" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#D97706"/></linearGradient>' +
      '<linearGradient id="pdf-g2" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#FCD34D"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>' +
      '<path d="M24 4 L40 10 V24 C40 34 32 40 24 44 C16 40 8 34 8 24 V10 Z" fill="#78350A"/>' +
      '<path d="M24 8 L36 12.5 V24 C36 31.5 30 36.5 24 39.5 C18 36.5 12 31.5 12 24 V12.5 Z" fill="url(#pdf-g1)"/>' +
      '<path d="M14 30 C 18 22, 24 30, 30 22 C 33 17, 30 12, 26 14 C 22 16, 28 22, 34 20" ' +
      'fill="none" stroke="url(#pdf-g2)" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M14 34 C 20 28, 28 34, 34 28" fill="none" stroke="#92400E" ' +
      'stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>' +
      '<text x="24" y="30" font-family="Verdana, sans-serif" font-size="10" font-weight="bold" ' +
      'text-anchor="middle" fill="#451A03">Pf</text></svg>';
  }

  /* Isometric 3D data matrix cube with a glowing cyan ascending wave,
     Gd mark. #06B6D4 family. */
  function logoGrd() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="GRD">' +
      '<defs><linearGradient id="grd-g1" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#0284C7"/></linearGradient>' +
      '<linearGradient id="grd-g2" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#A5F3FC"/><stop offset="1" stop-color="#06B6D4"/></linearGradient>' +
      '<filter id="grd-glow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="1.4" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<polygon points="24,5 40,14 24,23 8,14" fill="url(#grd-g2)"/>' +
      '<polygon points="8,14 24,23 24,41 8,32" fill="#0E7490"/>' +
      '<polygon points="40,14 24,23 24,41 40,32" fill="url(#grd-g1)"/>' +
      '<g fill="#E0F2FE"><circle cx="16" cy="16" r="1.1"/><circle cx="24" cy="12" r="1.1"/>' +
      '<circle cx="32" cy="16" r="1.1"/><circle cx="20" cy="27" r="1.1"/><circle cx="28" cy="27" r="1.1"/></g>' +
      '<path d="M10 36 C 16 30, 20 34, 26 26 C 30 20, 34 22, 38 14" fill="none" ' +
      'stroke="#CFFAFE" stroke-width="2.4" stroke-linecap="round" filter="url(#grd-glow)"/>' +
      '<text x="24" y="37" font-family="Verdana, sans-serif" font-size="8.5" font-weight="bold" ' +
      'text-anchor="middle" fill="#FFFFFF">Gd</text></svg>';
  }

  /* Overlapping 16:9 widescreen glass frames projecting a prismatic
     spotlight beam, Dk mark. #FF2E93 family. */
  function logoDck() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="DCK">' +
      '<defs><linearGradient id="dck-g1" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FF7AB8"/><stop offset="1" stop-color="#FF2E93"/></linearGradient>' +
      '<linearGradient id="dck-beam" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#FF2E93" stop-opacity="0.85"/>' +
      '<stop offset="0.5" stop-color="#C084FC" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="#38BDF8" stop-opacity="0.35"/></linearGradient></defs>' +
      '<polygon points="24,30 40,22 40,42 24,40" fill="url(#dck-beam)"/>' +
      '<rect x="4" y="8" width="24" height="13.5" rx="2" fill="none" stroke="#FF7AB8" ' +
      'stroke-width="2.4" opacity="0.75"/>' +
      '<rect x="12" y="14" width="24" height="13.5" rx="2" fill="url(#dck-g1)"/>' +
      '<rect x="12" y="14" width="24" height="13.5" rx="2" fill="#FFFFFF" opacity="0.18"/>' +
      '<rect x="18" y="17.5" width="12" height="2" rx="1" fill="#FFFFFF" opacity="0.85"/>' +
      '<rect x="18" y="21.5" width="8" height="2" rx="1" fill="#FFFFFF" opacity="0.55"/>' +
      '<text x="24" y="25.5" font-family="Verdana, sans-serif" font-size="7.5" font-weight="bold" ' +
      'text-anchor="middle" fill="#FFFFFF">Dk</text></svg>';
  }

  /* Neural constellation nodes inside a folded origami thought card,
     Mm mark. #10B981 family. */
  function logoMem() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="MEM">' +
      '<defs><linearGradient id="mem-g1" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#6EE7B7"/><stop offset="1" stop-color="#10B981"/></linearGradient>' +
      '<linearGradient id="mem-g2" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#A7F3D0"/><stop offset="1" stop-color="#059669"/></linearGradient></defs>' +
      '<polygon points="10,8 32,8 40,16 40,40 10,40" fill="url(#mem-g1)"/>' +
      '<polygon points="32,8 40,16 32,16" fill="url(#mem-g2)"/>' +
      '<polygon points="10,8 24,8 24,40 10,40" fill="#065F46" opacity="0.22"/>' +
      '<g stroke="#D1FAE5" stroke-width="1" opacity="0.9">' +
      '<line x1="18" y1="18" x2="26" y2="14"/><line x1="26" y1="14" x2="32" y2="22"/>' +
      '<line x1="18" y1="18" x2="22" y2="27"/><line x1="22" y1="27" x2="31" y2="30"/>' +
      '<line x1="26" y1="14" x2="22" y2="27"/></g>' +
      '<g fill="#ECFDF5"><circle cx="18" cy="18" r="2"/><circle cx="26" cy="14" r="2.4"/>' +
      '<circle cx="32" cy="22" r="2"/><circle cx="22" cy="27" r="2"/><circle cx="31" cy="30" r="1.6"/></g>' +
      '<text x="25" y="39" font-family="Verdana, sans-serif" font-size="8" font-weight="bold" ' +
      'text-anchor="middle" fill="#022C22">Mm</text></svg>';
  }

  /* Hexagonal orbital cloud core with 8 satellite nodes, Hb mark.
     #3B82F6 family. */
  function logoHub() {
    function sats() {
      var pts = "", i, a, x, y, r;
      for (i = 0; i < 8; i++) {
        a = Math.PI / 4 * i - Math.PI / 2;
        x = (24 + 19 * Math.cos(a)).toFixed(1);
        y = (24 + 19 * Math.sin(a)).toFixed(1);
        r = (i % 2 === 0) ? 2.4 : 1.8;
        pts += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#93C5FD"/>';
      }
      return pts;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="HUB">' +
      '<defs><radialGradient id="hub-g1" cx="0.5" cy="0.5" r="0.55">' +
      '<stop offset="0" stop-color="#BFDBFE"/><stop offset="1" stop-color="#3B82F6"/></radialGradient></defs>' +
      '<ellipse cx="24" cy="24" rx="19" ry="19" fill="none" stroke="#60A5FA" ' +
      'stroke-width="1.2" stroke-dasharray="3 3" opacity="0.7"/>' +
      '<ellipse cx="24" cy="24" rx="19" ry="9" fill="none" stroke="#93C5FD" ' +
      'stroke-width="1" opacity="0.5" transform="rotate(30 24 24)"/>' +
      '<polygon points="24,10 36,17 36,31 24,38 12,31 12,17" fill="url(#hub-g1)"/>' +
      '<polygon points="24,10 36,17 24,24 12,17" fill="#DBEAFE" opacity="0.55"/>' +
      sats() +
      '<text x="24" y="29" font-family="Verdana, sans-serif" font-size="10" font-weight="bold" ' +
      'text-anchor="middle" fill="#FFFFFF">Hb</text></svg>';
  }

  var BUILDERS = {
    nxt: logoNxt, txt: logoTxt, pxl: logoPxl, vac: logoVac, pdf: logoPdf,
    grd: logoGrd, dck: logoDck, mem: logoMem, hub: logoHub
  };

  T.nxtLogos = {
    ids: function () { return IDS.slice(); },
    get: function (id) {
      var fn = BUILDERS[id] || BUILDERS.nxt;
      return fn();
    }
  };
})();
