/* TXT app: editor, ribbon, documents, home, accounts, export wiring. Exposes window.TXTApp for js/word.js */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function uid() { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }
  function toast(msg) {
    var el = $(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }
  function saveBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function safeName(s) {
    return String(s || "document").trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "document";
  }
  function escAttr(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  /* ---------- i18n ---------- */
  var STRINGS = {
    en: {
      new: "New", open: "Open", export: "Export", home: "Home",
      fmtDocx: "Word document", fmtDoc: "Word 97 to 2003", fmtPdf: "Print to PDF", fmtOdt: "OpenDocument text",
      fmtRtf: "Rich text format", fmtHtml: "Web page", fmtMd: "Markdown", fmtTxt: "Plain text",
      tabFile: "File", tabHome: "Home", tabInsert: "Insert", tabLayout: "Layout", tabRefs: "References", tabReview: "Review", tabView: "View",
      grpNew: "New", grpPrint: "Print", grpFonts: "Fonts", grpInfo: "Info", grpClipboard: "Clipboard", grpFont: "Font",
      grpParagraph: "Paragraph", grpSpacing: "Spacing", grpStyles: "Styles", grpEditing: "Editing", grpPages: "Pages",
      grpTables: "Tables", grpMedia: "Media", grpLinks: "Links", grpHeaderFooter: "Header and Footer", grpText: "Text",
      grpPageSetup: "Page Setup", grpColumns: "Columns", grpToc: "Table of Contents", grpCitations: "Citations",
      grpFootnotes: "Footnotes", grpComments: "Comments", grpProofing: "Proofing", grpLanguage: "Language",
      grpZoom: "Zoom", grpShow: "Show", grpWindow: "Window",
      blankDoc: "Blank", print: "Print", wordCount: "Word count", header: "Header", footer: "Footer", pageNumber: "Page no.",
      dateTime: "Date", symbol: "Symbol", comment: "Comment", comments: "Comments", dropCap: "Drop cap",
      insertToc: "Contents", updateToc: "Update", language: "Language", outline: "Outline", showMarks: "Marks",
      zoomOut: "Zoom out", zoomIn: "Zoom in", pastePlain: "Paste plain text", selectAll: "Select all",
      growFont: "Grow font", shrinkFont: "Shrink font", multiLevel: "Multilevel list", paraSpacing: "Paragraph spacing",
      spacing: "Spacing", shading: "Shading", borders: "Borders",
      rowAbove: "Insert row above", rowBelow: "Insert row below", colLeft: "Insert column left", colRight: "Insert column right",
      delRow: "Delete row", delCol: "Delete column", delTable: "Delete table",
      orientation: "Orientation", portrait: "Portrait", landscape: "Landscape", legal: "Legal", a5: "A5",
      undo: "Undo (Ctrl+Z)", redo: "Redo (Ctrl+Y)", font: "Font", fontSize: "Font size",
      bold: "Bold (Ctrl+B)", italic: "Italic (Ctrl+I)", underline: "Underline (Ctrl+U)", strike: "Strikethrough",
      sub: "Subscript", sup: "Superscript", textColor: "Text color", hlColor: "Highlight color", clearFmt: "Clear formatting",
      paraStyle: "Paragraph style", normal: "Normal", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", quote: "Quote",
      alignLeft: "Align left", alignCenter: "Center", alignRight: "Align right", justify: "Justify",
      bulletList: "Bullet list", numList: "Numbered list", indentInc: "Increase indent", indentDec: "Decrease indent", lineSpacing: "Line spacing",
      insertLink: "Insert link", insertImage: "Insert image", insertTable: "Insert table", hr: "Horizontal line", pageBreak: "Page break",
      citeTitle: "Cite", biblioTitle: "Bibliography", footnoteTitle: "Footnote",
      findReplace: "Find and replace (Ctrl+F)", find: "Find", replaceWith: "Replace with", prev: "Previous", next: "Next",
      replace: "Replace", replaceAll: "All", close: "Close", documents: "Documents", pageSetup: "Page setup",
      webAddr: "Web address", textToShow: "Text to show", cancel: "Cancel", insert: "Insert",
      uploadFile: "Upload file", orPasteImg: "Or paste an image address", rows: "Rows", cols: "Columns",
      paperSize: "Paper size", a4: "A4", letter: "Letter", margins: "Margins", narrow: "Narrow", normalMargin: "Normal", wide: "Wide", apply: "Apply",
      references: "References", citeStyle: "Citation style", author: "Author", docTitle: "Title", year: "Year", publisher: "Publisher",
      sourceType: "Source type", book: "Book", journal: "Journal", website: "Website", urlLabel: "Link",
      bibliography: "Bibliography", footnoteText: "Footnote text",
      words: "words", characters: "characters", startTyping: "Start typing...", untitled: "Untitled document",
      saved: "Saved", saving: "Saving...", newDoc: "New document", docDeleted: "Document deleted",
      pageBreakInserted: "Page break inserted", opened: "Opened", downloaded: "Downloaded", replaced: "replaced",
      insertCitation: "Insert citation", insertFootnote: "Insert footnote", insertBibliography: "Insert bibliography",
      bibliographyUpdated: "Bibliography updated",
      fmtFonts: "Download fonts used", fontsNone: "No downloadable fonts in this document", fontsDownloading: "Downloading fonts...",
      searchDocs: "Search documents", newBlankDoc: "New blank document", browseTemplates: "Browse templates",
      templates: "Templates", recentDocs: "Recent documents",
      homeTag: "A fast word processor that saves automatically and exports everywhere.",
      account: "Account", signIn: "Sign in", signOut: "Sign out", yourName: "Your name", continue: "Continue",
      guest: "Guest", switchAccount: "Switch account", localNote: "Accounts are stored on this device only.",
      noDocs: "No documents yet. Create one to get started.", noResults: "No matches found.", useTemplate: "Use template",
      tplBlank: "Blank", tplBlankD: "Start from an empty page.", tplResume: "Resume", tplResumeD: "Clean one-page resume layout.",
      tplCover: "Cover Letter", tplCoverD: "Professional job application letter.", tplReport: "Business Report", tplReportD: "Summary, findings and table.",
      tplEssay: "Essay", tplEssayD: "Intro, body and conclusion structure.", tplMeeting: "Meeting Notes", tplMeetingD: "Agenda, decisions, action items.",
      tplResearch: "Research Paper", tplResearchD: "Abstract through references.", tplNews: "Newsletter", tplNewsD: "Headline story layout.",
      before: "Before", after: "After", points: "pt", lineRule: "Line spacing",
      lsSingle: "Single", ls115: "1.15", ls15: "1.5", lsDouble: "Double", lsAtLeast: "At least", lsExactly: "Exactly", lsMultiple: "Multiple",
      diffFirst: "Different first page", columns: "Columns", insertSymbol: "Insert symbol", insertDate: "Insert date/time",
      insertComment: "Add comment", commentText: "Comment", addComment: "Add", resolve: "Resolve", del: "Delete",
      tocTitle: "Contents", wcTitle: "Word count", paragraphs: "Paragraphs", charsNoSpaces: "Characters (no spaces)",
      headerOn: "Header on", headerOff: "Header off", footerOn: "Footer on", footerOff: "Footer off",
      needTable: "Place the cursor inside a table first.", commentAdded: "Comment added", tocInserted: "Table of contents inserted",
      tocUpdated: "Table of contents updated", dateInserted: "Date inserted", copied: "Copied",
      watermark: "Watermark", watermarkText: "Watermark text", watermarkStyle: "Style",
      diagonal: "Diagonal", horizontal: "Horizontal", remove: "Remove", wmSize: "Size", wmOpacity: "Opacity",
      wmPresets: "Presets", styleHarvard: "Harvard", styleIeee: "IEEE"
    },
    my: {
      new: "အသစ်", open: "ဖွင့်", export: "ထုတ်ယူ", home: "ပင်မ",
      fmtDocx: "Word စာရွက်စာတမ်း", fmtDoc: "Word 97-2003", fmtPdf: "PDF အဖြစ် ပရင့်ထုတ်", fmtOdt: "OpenDocument စာသား",
      fmtRtf: "RTF ဖော်မတ်", fmtHtml: "ဝက်ဘ်စာမျက်နှာ", fmtMd: "Markdown", fmtTxt: "ရိုးရိုးစာသား",
      tabFile: "ဖိုင်", tabHome: "ပင်မ", tabInsert: "ထည့်သွင်းရန်", tabLayout: "အပြင်အဆင်", tabRefs: "ကိုးကားချက်များ", tabReview: "ပြန်လည်သုံးသပ်ရန်", tabView: "ကြည့်ရှုရန်",
      grpNew: "အသစ်", grpPrint: "ပရင့်", grpFonts: "ဖောင့်", grpInfo: "အချက်အလက်", grpClipboard: "ကလစ်ဘုတ်", grpFont: "ဖောင့်",
      grpParagraph: "စာပိုဒ်", grpSpacing: "အကွာ", grpStyles: "ပုံစံများ", grpEditing: "တည်းဖြတ်ရန်", grpPages: "စာမျက်နှာများ",
      grpTables: "ဇယားများ", grpMedia: "မီဒီယာ", grpLinks: "လင့်ခ်များ", grpHeaderFooter: "ခေါင်းစီးနှင့် အောက်ခြေ", grpText: "စာသား",
      grpPageSetup: "စာမျက်နှာပြင်ဆင်ရန်", grpColumns: "ကော်လံများ", grpToc: "မာတိကာ", grpCitations: "ကိုးကားချက်များ",
      grpFootnotes: "အောက်ခြေမှတ်စုများ", grpComments: "မှတ်ချက်များ", grpProofing: "စစ်ဆေးရန်", grpLanguage: "ဘာသာစကား",
      grpZoom: "ချဲ့ကြည့်ရန်", grpShow: "ပြရန်", grpWindow: "ဝင်းဒိုး",
      blankDoc: "အလွတ်", print: "ပရင့်ထုတ်", wordCount: "စာလုံးရေတွက်", header: "ခေါင်းစီး", footer: "အောက်ခြေ", pageNumber: "စာမျက်နှာနံပါတ်",
      dateTime: "ရက်စွဲ", symbol: "သင်္ကေတ", comment: "မှတ်ချက်", comments: "မှတ်ချက်များ", dropCap: "အက္ခရာအကြီး",
      insertToc: "မာတိကာ", updateToc: "ပြင်ဆင်ရန်", language: "ဘာသာစကား", outline: "အကျဉ်းချုပ်", showMarks: "အမှတ်အသားများ",
      zoomOut: "သေးငယ်စေရန်", zoomIn: "ကြီးမားစေရန်", pastePlain: "ရိုးရိုးစာသားကူးထည့်ရန်", selectAll: "အားလုံးရွေးရန်",
      growFont: "စာလုံးကြီးရန်", shrinkFont: "စာလုံးသေးရန်", multiLevel: "အဆင့်စာရင်း", paraSpacing: "စာပိုဒ်အကွာ",
      spacing: "အကွာ", shading: "နောက်ခံအရောင်", borders: "ဘောင်မျဉ်းများ",
      rowAbove: "အပေါ်အတန်းထည့်ရန်", rowBelow: "အောက်အတန်းထည့်ရန်", colLeft: "ဘယ်ကော်လံထည့်ရန်", colRight: "ညာကော်လံထည့်ရန်",
      delRow: "အတန်းဖျက်ရန်", delCol: "ကော်လံဖျက်ရန်", delTable: "ဇယားဖျက်ရန်",
      orientation: "အလျားလိုက်/ဒေါင်လိုက်", portrait: "ဒေါင်လိုက်", landscape: "အလျားလိုက်", legal: "Legal", a5: "A5",
      undo: "နောက်ပြန်ဆုတ်ရန် (Ctrl+Z)", redo: "ပြန်လုပ်ရန် (Ctrl+Y)", font: "ဖောင့်", fontSize: "စာလုံးအရွယ်အစား",
      bold: "စာလုံးမဲ (Ctrl+B)", italic: "စာလုံးစောင်း (Ctrl+I)", underline: "အောက်မျဉ်း (Ctrl+U)", strike: "ဖြတ်မျဉ်း",
      sub: "အောက်စာလုံး", sup: "အပေါ်စာလုံး", textColor: "စာအရောင်", hlColor: "အသားပေးအရောင်", clearFmt: "ဖော်မတ်ရှင်းလင်းရန်",
      paraStyle: "စာပိုဒ်ပုံစံ", normal: "ပုံမှန်", h1: "ခေါင်းစဉ် ၁", h2: "ခေါင်းစဉ် ၂", h3: "ခေါင်းစဉ် ၃", quote: "ကိုးကားချက်",
      alignLeft: "ဘယ်ညှိ", alignCenter: "အလယ်ညှိ", alignRight: "ညာညှိ", justify: "ညီညှိရန်",
      bulletList: "အမှတ်စာရင်း", numList: "နံပါတ်စာရင်း", indentInc: "အကွာတိုးရန်", indentDec: "အကွာလျှော့ရန်", lineSpacing: "စာကြောင်းအကွာ",
      insertLink: "လင့်ခ်ထည့်ရန်", insertImage: "ပုံထည့်ရန်", insertTable: "ဇယားထည့်ရန်", hr: "အလျားလိုက်မျဉ်း", pageBreak: "စာမျက်နှာဖြတ်",
      citeTitle: "ကိုးကားရန်", biblioTitle: "ကျမ်းကိုးစာရင်း", footnoteTitle: "အောက်ခြေမှတ်စု",
      findReplace: "ရှာဖွေအစားထိုးရန် (Ctrl+F)", find: "ရှာဖွေရန်", replaceWith: "အစားထိုးမည့်စာ", prev: "ယခင်", next: "နောက်",
      replace: "အစားထိုး", replaceAll: "အားလုံး", close: "ပိတ်", documents: "စာရွက်စာတမ်းများ", pageSetup: "စာမျက်နှာပြင်ဆင်ရန်",
      webAddr: "ဝက်ဘ်လိပ်စာ", textToShow: "ပြမည့်စာသား", cancel: "မလုပ်တော့", insert: "ထည့်ရန်",
      uploadFile: "ဖိုင်တင်ရန်", orPasteImg: "သို့မဟုတ် ပုံလင့်ခ်ထည့်ပါ", rows: "အတန်းများ", cols: "ကော်လံများ",
      paperSize: "စာရွက်အရွယ်အစား", a4: "A4", letter: "Letter", margins: "အနားသတ်", narrow: "ကျဉ်း", normalMargin: "ပုံမှန်", wide: "ကျယ်", apply: "အသုံးပြု",
      references: "ကိုးကားချက်များ", citeStyle: "ကိုးကားပုံစံ", author: "စာရေးသူ", docTitle: "ခေါင်းစဉ်", year: "ခုနှစ်", publisher: "ထုတ်ဝေသူ",
      sourceType: "အရင်းအမြစ်အမျိုးအစား", book: "စာအုပ်", journal: "ဂျာနယ်", website: "ဝက်ဘ်ဆိုက်", urlLabel: "လင့်ခ်",
      bibliography: "ကျမ်းကိုးစာရင်း", footnoteText: "အောက်ခြေမှတ်စုစာသား",
      words: "စာလုံးရေ", characters: "အက္ခရာရေ", startTyping: "စတင်ရေးသားပါ...", untitled: "အမည်မဲ့စာရွက်စာတမ်း",
      saved: "သိမ်းပြီး", saving: "သိမ်းနေသည်...", newDoc: "စာရွက်စာတမ်းအသစ်", docDeleted: "စာရွက်စာတမ်းဖျက်ပြီး",
      pageBreakInserted: "စာမျက်နှာဖြတ်ထည့်ပြီး", opened: "ဖွင့်ပြီး", downloaded: "ဒေါင်းလုဒ်ရယူပြီး", replaced: "အစားထိုးပြီး",
      insertCitation: "ကိုးကားချက်ထည့်ရန်", insertFootnote: "အောက်ခြေမှတ်စုထည့်ရန်", insertBibliography: "ကျမ်းကိုးစာရင်းထည့်ရန်",
      bibliographyUpdated: "ကျမ်းကိုးစာရင်းပြင်ဆင်ပြီး",
      fmtFonts: "သုံးထားသောဖောင့်များဒေါင်းလုဒ်", fontsNone: "ဒေါင်းလုဒ်လုပ်နိုင်သောဖောင့်မရှိပါ", fontsDownloading: "ဖောင့်များဒေါင်းလုဒ်လုပ်နေသည်...",
      searchDocs: "စာရွက်စာတမ်းများရှာဖွေရန်", newBlankDoc: "စာရွက်အလွတ်အသစ်", browseTemplates: "ပုံစံများကြည့်ရန်",
      templates: "ပုံစံများ", recentDocs: "လတ်တလောစာရွက်စာတမ်းများ",
      homeTag: "အလိုအလျောက်သိမ်းပြီး နေရာတိုင်းထုတ်ယူနိုင်သော မြန်ဆန်သည့်စာစီစာရိုက်ကိရိယာ။",
      account: "အကောင့်", signIn: "ဝင်ရောက်ရန်", signOut: "ထွက်ရန်", yourName: "သင့်အမည်", continue: "ဆက်လုပ်ရန်",
      guest: "ဧည့်သည်", switchAccount: "အကောင့်ပြောင်းရန်", localNote: "အကောင့်များကို ဤစက်တွင်သာ သိမ်းဆည်းထားပါသည်။",
      noDocs: "စာရွက်စာတမ်း မရှိသေးပါ။ အသစ်တစ်ခု ဖန်တီးလိုက်ပါ။", noResults: "မတွေ့ပါ။", useTemplate: "ပုံစံသုံးရန်",
      tplBlank: "အလွတ်", tplBlankD: "စာမျက်နှာအလွတ်မှ စတင်ပါ။", tplResume: "ကိုယ်ရေးအကျဉ်း", tplResumeD: "သပ်ရပ်သော တစ်မျက်နှာပုံစံ။",
      tplCover: "လျှောက်လွှာ", tplCoverD: "အလုပ်လျှောက်လွှာပုံစံ။", tplReport: "အစီရင်ခံစာ", tplReportD: "အကျဉ်းချုပ်၊ တွေ့ရှိချက်နှင့် ဇယား။",
      tplEssay: "အက္ခရာစာစောင်", tplEssayD: "နိဒါန်း၊ အကြောင်းအရာနှင့် နိဂုံးပုံစံ။", tplMeeting: "အစည်းအဝေးမှတ်စု", tplMeetingD: "အစီအစဉ်၊ ဆုံးဖြတ်ချက်များ။",
      tplResearch: "သုတေသနစာတမ်း", tplResearchD: "အကျဉ်းချုပ်မှ ကိုးကားချက်အထိ။", tplNews: "သတင်းလွှာ", tplNewsD: "ခေါင်းကြီးပိုင်းသတင်းပုံစံ။",
      before: "အထက်", after: "အောက်", points: "pt", lineRule: "စာကြောင်းအကွာ",
      lsSingle: "တစ်ခုတည်း", ls115: "1.15", ls15: "1.5", lsDouble: "နှစ်ဆ", lsAtLeast: "အနည်းဆုံး", lsExactly: "အတိအကျ", lsMultiple: "အဆ",
      diffFirst: "ပထမစာမျက်နှာ ကွဲပြားစေရန်", columns: "ကော်လံများ", insertSymbol: "သင်္ကေတထည့်ရန်", insertDate: "ရက်စွဲထည့်ရန်",
      insertComment: "မှတ်ချက်ထည့်ရန်", commentText: "မှတ်ချက်", addComment: "ထည့်ရန်", resolve: "ဖြေရှင်းပြီး", del: "ဖျက်ရန်",
      tocTitle: "မာတိကာ", wcTitle: "စာလုံးရေတွက်ချက်", paragraphs: "စာပိုဒ်များ", charsNoSpaces: "အက္ခရာ (နေရာလွတ်မပါ)",
      headerOn: "ခေါင်းစီးဖွင့်ပြီး", headerOff: "ခေါင်းစီးပိတ်ပြီး", footerOn: "အောက်ခြေဖွင့်ပြီး", footerOff: "အောက်ခြေပိတ်ပြီး",
      needTable: "ပထမ ဇယားထဲတွင် ကာဆာချထားပါ။", commentAdded: "မှတ်ချက်ထည့်ပြီးပါပြီ", tocInserted: "မာတိကာထည့်ပြီးပါပြီ",
      tocUpdated: "မာတိကာပြင်ဆင်ပြီးပါပြီ", dateInserted: "ရက်စွဲထည့်ပြီးပါပြီ", copied: "ကူးယူပြီးပါပြီ",
      watermark: "ရေစာ", watermarkText: "ရေစာစာသား", watermarkStyle: "ပုံစံ",
      diagonal: "စောင်း", horizontal: "အလျားလိုက်", remove: "ဖယ်ရှားရန်", wmSize: "အရွယ်အစား", wmOpacity: "မှိန်ဖျော့မှု",
      wmPresets: "အဆင်သင့်များ", styleHarvard: "Harvard", styleIeee: "IEEE"
    }
  };
  function t(key) {
    var L = STRINGS[settings.lang] || STRINGS.en;
    if (L[key] !== undefined) return L[key];
    return STRINGS.en[key] !== undefined ? STRINGS.en[key] : key;
  }
  function applyLang() {
    document.documentElement.lang = settings.lang === "my" ? "my" : "en";
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$("[data-i18n-title]").forEach(function (el) { el.title = t(el.getAttribute("data-i18n-title")); });
    $$("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-i18n-ph")); });
    $("#btnLang").textContent = settings.lang === "my" ? "EN" : "မြန်မာ";
    sheet.setAttribute("data-ph", t("startTyping"));
    $("#docHeader").setAttribute("data-ph", t("header"));
    $("#docFooter").setAttribute("data-ph", t("footer"));
    renderHome();
    markSaved();
    updateCounts();
  }
  function toggleLang() {
    settings.lang = settings.lang === "my" ? "en" : "my";
    persistSettings();
    applyLang();
  }

  /* ---------- fonts ---------- */
  var FONTS = [
    { n: "Calibri", grp: "system" }, { n: "Arial", grp: "system" }, { n: "Helvetica", grp: "system" },
    { n: "Times New Roman", grp: "system" }, { n: "Georgia", grp: "system" }, { n: "Garamond", grp: "system" },
    { n: "Verdana", grp: "system" }, { n: "Tahoma", grp: "system" }, { n: "Trebuchet MS", grp: "system" },
    { n: "Cambria", grp: "system" }, { n: "Courier New", grp: "system" }, { n: "Comic Sans MS", grp: "system" },
    { n: "Impact", grp: "system" },
    { n: "Inter", g: "Inter", grp: "sans" }, { n: "Roboto", g: "Roboto", grp: "sans" },
    { n: "Open Sans", g: "Open+Sans", grp: "sans" }, { n: "Lato", g: "Lato", grp: "sans" },
    { n: "Montserrat", g: "Montserrat", grp: "sans" }, { n: "Poppins", g: "Poppins", grp: "sans" },
    { n: "Nunito", g: "Nunito", grp: "sans" }, { n: "Source Sans 3", g: "Source+Sans+3", grp: "sans" },
    { n: "Raleway", g: "Raleway", grp: "sans" }, { n: "Ubuntu", g: "Ubuntu", grp: "sans" },
    { n: "Work Sans", g: "Work+Sans", grp: "sans" }, { n: "DM Sans", g: "DM+Sans", grp: "sans" },
    { n: "Manrope", g: "Manrope", grp: "sans" }, { n: "Outfit", g: "Outfit", grp: "sans" },
    { n: "Rubik", g: "Rubik", grp: "sans" }, { n: "Karla", g: "Karla", grp: "sans" },
    { n: "Heebo", g: "Heebo", grp: "sans" }, { n: "Figtree", g: "Figtree", grp: "sans" },
    { n: "Playfair Display", g: "Playfair+Display", grp: "serif" }, { n: "Merriweather", g: "Merriweather", grp: "serif" },
    { n: "Lora", g: "Lora", grp: "serif" }, { n: "PT Serif", g: "PT+Serif", grp: "serif" },
    { n: "Source Serif 4", g: "Source+Serif+4", grp: "serif" }, { n: "Noto Serif", g: "Noto+Serif", grp: "serif" },
    { n: "Crimson Pro", g: "Crimson+Pro", grp: "serif" }, { n: "Libre Baskerville", g: "Libre+Baskerville", grp: "serif" },
    { n: "EB Garamond", g: "EB+Garamond", grp: "serif" },
    { n: "Roboto Mono", g: "Roboto+Mono", grp: "mono" }, { n: "Source Code Pro", g: "Source+Code+Pro", grp: "mono" },
    { n: "JetBrains Mono", g: "JetBrains+Mono", grp: "mono" }, { n: "IBM Plex Mono", g: "IBM+Plex+Mono", grp: "mono" },
    { n: "Space Mono", g: "Space+Mono", grp: "mono" },
    { n: "Oswald", g: "Oswald", grp: "display" }, { n: "Bebas Neue", g: "Bebas+Neue", grp: "display" },
    { n: "Anton", g: "Anton", grp: "display" }, { n: "Archivo Black", g: "Archivo+Black", grp: "display" },
    { n: "Lobster", g: "Lobster", grp: "display" }, { n: "Pacifico", g: "Pacifico", grp: "display" },
    { n: "Noto Sans Myanmar", g: "Noto+Sans+Myanmar", grp: "myanmar" },
    { n: "Noto Serif Myanmar", g: "Noto+Serif+Myanmar", grp: "myanmar" }
  ];
  function fontEntry(name) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].n === name) return FONTS[i];
    return null;
  }
  function googleFonts() { return FONTS.filter(function (f) { return f.g; }); }
  var SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 60, 72];

  /* ---------- state ---------- */
  var sheet = $("#sheet"), canvas = $("#canvas"), zoomWrap = $("#zoomWrap");
  var docHeader = $("#docHeader"), docFooter = $("#docFooter");
  var docs = [], currentId = null;
  var settings = { paper: "a4", margin: "normal", zoom: 1, lang: "en" };
  var savedRange = null;
  var PAPERS = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], a5: [148, 210] };
  var MARGINS = { narrow: 12.7, normal: 25.4, wide: 31.8 };
  var LS_DOCS_BASE = "txt.docs.v1", LS_SETTINGS = "txt.settings.v1";
  var LS_PROFILES = "txt.profiles.v1", LS_PROFILE = "txt.profile.v1";
  var AVATAR_COLORS = ["#4f46e5", "#059669", "#dc2626", "#ca8a04", "#0891b2", "#7c3aed"];
  var profiles = [], currentProfile = null;

  function docsKey() { return LS_DOCS_BASE + (currentProfile ? "." + currentProfile.uid : ""); }
  function blankDoc(name) {
    return { id: uid(), name: name || t("untitled"), updatedAt: Date.now(), html: "", citations: [], citeStyle: "apa",
      comments: [], headerHtml: "", footerHtml: "", headerOn: false, footerOn: false, diffFirst: false,
      columns: 1, orient: "portrait", paper: settings.paper || "a4", margin: settings.margin || "normal" };
  }
  function normalizeDoc(d) {
    if (!d.citations) d.citations = [];
    if (!d.citeStyle) d.citeStyle = "apa";
    if (!d.comments) d.comments = [];
    if (d.headerHtml === undefined) d.headerHtml = "";
    if (d.footerHtml === undefined) d.footerHtml = "";
    if (d.headerOn === undefined) d.headerOn = false;
    if (d.footerOn === undefined) d.footerOn = false;
    if (d.diffFirst === undefined) d.diffFirst = false;
    if (!d.columns) d.columns = 1;
    if (!d.orient) d.orient = "portrait";
    if (!d.paper) d.paper = settings.paper || "a4";
    if (!d.margin) d.margin = settings.margin || "normal";
    if (d.watermark === undefined) d.watermark = null;
    return d;
  }
  function loadProfiles() {
    try { profiles = JSON.parse(localStorage.getItem(LS_PROFILES) || "[]"); } catch (e) { profiles = []; }
    try { currentProfile = JSON.parse(localStorage.getItem(LS_PROFILE) || "null"); } catch (e) { currentProfile = null; }
    if (currentProfile && !profiles.some(function (p) { return p.uid === currentProfile.uid; })) currentProfile = null;
  }
  function persistProfiles() {
    try {
      localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
      localStorage.setItem(LS_PROFILE, JSON.stringify(currentProfile));
    } catch (e) {}
  }
  function loadState() {
    try { docs = JSON.parse(localStorage.getItem(docsKey()) || "[]"); } catch (e) { docs = []; }
    try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}")); } catch (e) {}
    docs.forEach(normalizeDoc);
    if (!docs.length) {
      var d = blankDoc("Welcome to TXT");
      d.html = "<h1>Welcome to TXT</h1>" +
        "<p>This is your new word processor. Everything here really works: select text and use the ribbon to make it <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, or give it <span style=\"color:#4f46e5\">color</span>.</p>" +
        "<h2>Try the features</h2>" +
        "<ul><li>Word-style ribbon: File, Home, Insert, Layout, References, Review, View</li><li>Headers, footers and page numbers</li><li>Table of contents, citations, footnotes and comments</li><li>Paragraph spacing in points, columns and page orientation</li></ul>" +
        "<p>Your work saves automatically in this browser. Use <strong>Export</strong> up top to download your document as DOCX, DOC, PDF, ODT, RTF, HTML, Markdown or plain text.</p><p><br></p>";
      docs = [d];
      currentId = d.id;
      persistDocs();
    } else if (!currentId || !docs.some(function (x) { return x.id === currentId; })) {
      currentId = docs[0].id;
    }
  }
  function persistDocs() {
    try { localStorage.setItem(docsKey(), JSON.stringify(docs)); } catch (e) { toast("Storage is full"); }
  }
  function persistSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (e) {}
  }
  function getDoc(id) { return docs.find(function (d) { return d.id === (id || currentId); }); }

  var saveStateEl = $("#saveState");
  function markDirty() { saveStateEl.textContent = t("saving"); }
  function markSaved() { saveStateEl.textContent = t("saved"); }
  function snapshotDoc() {
    var d = getDoc();
    if (!d) return;
    d.html = sheet.innerHTML;
    d.headerHtml = docHeader.innerHTML;
    d.footerHtml = docFooter.innerHTML;
    d.updatedAt = Date.now();
  }
  var persistCurrent = debounce(function () { snapshotDoc(); persistDocs(); markSaved(); renderDocList(); }, 700);
  function persistNow() { snapshotDoc(); persistDocs(); markSaved(); }

  /* ---------- sidebar document list ---------- */
  var docList = $("#docList"), docName = $("#docName");
  function fmtDate(ts) {
    var d = new Date(ts), now = new Date();
    var tm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? tm : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + tm;
  }
  function docMatches(d, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var tmp = document.createElement("div"); tmp.innerHTML = d.html || "";
    return d.name.toLowerCase().indexOf(q) >= 0 || tmp.textContent.toLowerCase().indexOf(q) >= 0;
  }
  function renderDocList() {
    var q = ($("#sideSearch").value || "").trim();
    docList.innerHTML = "";
    docs.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).forEach(function (d) {
      if (!docMatches(d, q)) return;
      var el = document.createElement("div");
      el.className = "doc-item" + (d.id === currentId ? " active" : "");
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = d.name; nm.title = d.name;
      var dt = document.createElement("span"); dt.className = "dt"; dt.textContent = fmtDate(d.updatedAt);
      var del = document.createElement("button"); del.className = "del"; del.title = t("del"); del.textContent = "×";
      del.addEventListener("click", function (e) { e.stopPropagation(); deleteDoc(d.id); });
      el.appendChild(nm); el.appendChild(dt); el.appendChild(del);
      el.addEventListener("click", function () { switchDoc(d.id); goEditor(); });
      el.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var inp = document.createElement("input");
        inp.value = d.name;
        el.innerHTML = ""; el.appendChild(inp);
        inp.focus(); inp.select();
        function done(save) {
          if (save && inp.value.trim()) { d.name = inp.value.trim(); if (d.id === currentId) docName.value = d.name; persistDocs(); }
          renderDocList(); renderHome();
        }
        inp.addEventListener("blur", function () { done(true); });
        inp.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") done(true);
          else if (ev.key === "Escape") done(false);
          ev.stopPropagation();
        });
        inp.addEventListener("click", function (ev) { ev.stopPropagation(); });
      });
      docList.appendChild(el);
    });
  }
  function loadDocIntoEditor(d) {
    sheet.innerHTML = d.html || "";
    docHeader.innerHTML = d.headerHtml || "";
    docFooter.innerHTML = d.footerHtml || "";
    docHeader.classList.toggle("hidden", !d.headerOn);
    docFooter.classList.toggle("hidden", !d.footerOn);
    docName.value = d.name;
    clearFind();
    applyPageSetup();
    renderWatermark();
    renderOutline();
    renderComments();
    updateCounts();
  }
  function renderWatermark() {
    var d = getDoc();
    var layer = $("#watermarkLayer");
    var wm = d && d.watermark;
    if (wm && wm.text) {
      layer.classList.remove("hidden");
      layer.innerHTML = '<div class="watermark-text ' + (wm.style === "horizontal" ? "horizontal" : "diagonal") + '"' +
        ' style="font-size:' + (wm.size || 72) + "px;color:" + (wm.color || "#9aa0b4") +
        ";opacity:" + (wm.opacity != null ? wm.opacity : 0.18) + '">' + escAttr(wm.text) + "</div>";
    } else {
      layer.classList.add("hidden");
      layer.innerHTML = "";
    }
  }
  function switchDoc(id) {
    if (id === currentId) return;
    persistNow();
    currentId = id;
    loadDocIntoEditor(getDoc());
    renderDocList();
  }
  function newDoc() {
    persistNow();
    var d = blankDoc();
    docs.unshift(d);
    currentId = d.id;
    loadDocIntoEditor(d);
    persistDocs(); renderDocList(); renderHome(); updateCounts();
    goEditor();
    sheet.focus();
    toast(t("newDoc"));
  }
  function newDocFromTemplate(tpl) {
    persistNow();
    var d = blankDoc(t(tpl.nameKey));
    d.html = tpl.html;
    docs.unshift(d);
    currentId = d.id;
    loadDocIntoEditor(d);
    persistDocs(); renderDocList(); renderHome(); updateCounts();
    goEditor();
    toast(t("useTemplate"));
  }
  function deleteDoc(id) {
    if (docs.length <= 1) { toast(t("newDoc")); return; }
    docs = docs.filter(function (d) { return d.id !== id; });
    if (id === currentId) { currentId = docs[0].id; loadDocIntoEditor(getDoc()); }
    persistDocs(); renderDocList(); renderHome(); updateCounts();
    toast(t("docDeleted"));
  }

  /* ---------- views: home / editor ---------- */
  var appMain = $("#appMain"), viewEditor = $("#viewEditor"), viewHome = $("#viewHome");
  function goHome() {
    persistNow();
    appMain.classList.remove("mode-editor"); appMain.classList.add("mode-home");
    renderHome();
  }
  function goEditor() {
    appMain.classList.remove("mode-home"); appMain.classList.add("mode-editor");
    viewEditor.classList.remove("hidden");
    setTimeout(applyZoom, 30);
  }
  function docSnippet(d) {
    var tmp = document.createElement("div"); tmp.innerHTML = d.html || "";
    return tmp.textContent.trim().slice(0, 120);
  }
  function docWords(d) {
    var tmp = document.createElement("div"); tmp.innerHTML = d.html || "";
    var tx = tmp.textContent.trim();
    return tx ? tx.split(/\s+/).length : 0;
  }
  function renderHome() {
    var q = ($("#homeSearch").value || "").trim();
    var grid = $("#recentGrid");
    grid.innerHTML = "";
    var list = docs.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).filter(function (d) { return docMatches(d, q); });
    if (!list.length) {
      grid.innerHTML = '<div class="empty-note">' + escAttr(q ? t("noResults") : t("noDocs")) + "</div>";
    }
    list.slice(0, 12).forEach(function (d) {
      var card = document.createElement("div");
      card.className = "doc-card";
      var h = document.createElement("h3"); h.textContent = d.name;
      var p = document.createElement("p"); p.textContent = docSnippet(d) || "—";
      var meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = docWords(d) + " " + t("words") + " · " + fmtDate(d.updatedAt);
      var del = document.createElement("button"); del.className = "del"; del.textContent = "×"; del.title = t("del");
      del.addEventListener("click", function (e) { e.stopPropagation(); deleteDoc(d.id); });
      card.appendChild(h); card.appendChild(p); card.appendChild(meta); card.appendChild(del);
      card.addEventListener("click", function () { switchDoc(d.id); goEditor(); });
      grid.appendChild(card);
    });
    var tg = $("#tplGrid");
    tg.innerHTML = "";
    (window.TXTTemplates || []).forEach(function (tpl) {
      var card = document.createElement("div");
      card.className = "tpl-card";
      var ic = document.createElement("div"); ic.className = "tpl-ico"; ic.textContent = tpl.icon;
      var h = document.createElement("h3"); h.textContent = t(tpl.nameKey);
      var p = document.createElement("p"); p.textContent = t(tpl.descKey);
      card.appendChild(ic); card.appendChild(h); card.appendChild(p);
      card.addEventListener("click", function () { newDocFromTemplate(tpl); });
      tg.appendChild(card);
    });
  }

  /* ---------- accounts (local profiles) ---------- */
  var btnAccount = $("#btnAccount");
  function refreshAccountBtn() {
    if (currentProfile) {
      btnAccount.textContent = currentProfile.name.charAt(0).toUpperCase();
      btnAccount.style.background = currentProfile.color;
    } else {
      btnAccount.textContent = "G";
      btnAccount.style.background = "#9aa0b4";
    }
  }
  function setProfile(p) {
    persistNow();
    currentProfile = p;
    persistProfiles();
    currentId = null;
    loadState();
    loadDocIntoEditor(getDoc());
    renderDocList(); renderHome(); refreshAccountBtn();
  }
  function openAccountPopover() {
    var html = "";
    if (currentProfile) {
      html += '<div class="acct-head"><span class="avatar-btn" style="background:' + currentProfile.color + '">' +
        escAttr(currentProfile.name.charAt(0).toUpperCase()) + '</span><div><div class="acct-name">' +
        escAttr(currentProfile.name) + '</div><div class="acct-sub">' + t("localNote") + "</div></div></div>";
      html += '<label>' + t("switchAccount") + "</label>";
      profiles.forEach(function (p) {
        if (p.uid === currentProfile.uid) return;
        html += '<button type="button" class="acct-item" data-uid="' + p.uid + '"><span class="avatar-btn" style="background:' +
          p.color + '">' + escAttr(p.name.charAt(0).toUpperCase()) + "</span><span>" + escAttr(p.name) + "</span></button>";
      });
      html += '<div class="row"><button type="button" class="pbtn" id="ppSignOut">' + t("signOut") + "</button></div>";
    } else {
      html += "<h4>" + t("signIn") + "</h4>";
      html += '<div class="acct-sub" style="margin-bottom:6px">' + t("localNote") + "</div>";
      html += "<label>" + t("yourName") + "</label>" + '<input id="ppAcctName" maxlength="30" placeholder="Thit Sar">';
      html += '<label>Color</label><div class="avatar-pick" id="ppAvatarPick">' +
        AVATAR_COLORS.map(function (c, i) {
          return '<button type="button" class="avatar-dot' + (i === 0 ? " sel" : "") + '" data-c="' + c + '" style="background:' + c + '">A</button>';
        }).join("") + "</div>";
      if (profiles.length) {
        html += "<label>" + t("switchAccount") + "</label>";
        profiles.forEach(function (p) {
          html += '<button type="button" class="acct-item" data-uid="' + p.uid + '"><span class="avatar-btn" style="background:' +
            p.color + '">' + escAttr(p.name.charAt(0).toUpperCase()) + "</span><span>" + escAttr(p.name) + "</span></button>";
        });
      }
      html += '<div class="row"><button type="button" class="pbtn go" id="ppSignIn">' + t("continue") + "</button></div>";
    }
    openPopover(btnAccount, html);
    var pick = $("#ppAvatarPick");
    if (pick) pick.addEventListener("click", function (e) {
      var b = e.target.closest(".avatar-dot");
      if (!b) return;
      $$(".avatar-dot", pick).forEach(function (x) { x.classList.remove("sel"); });
      b.classList.add("sel");
    });
    var si = $("#ppSignIn");
    if (si) si.addEventListener("click", function () {
      var name = $("#ppAcctName").value.trim();
      if (!name) { $("#ppAcctName").focus(); return; }
      var color = ($(".avatar-dot.sel", pick) || {}).getAttribute ? $(".avatar-dot.sel", pick).getAttribute("data-c") : AVATAR_COLORS[0];
      var p = { uid: uid(), name: name, color: color || AVATAR_COLORS[0] };
      profiles.push(p);
      closePopover();
      setProfile(p);
      toast(t("signIn") + ": " + name);
    });
    var so = $("#ppSignOut");
    if (so) so.addEventListener("click", function () { closePopover(); setProfile(null); toast(t("signOut")); });
    $$("#popover .acct-item").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = profiles.find(function (x) { return x.uid === b.getAttribute("data-uid"); });
        closePopover();
        if (p) setProfile(p);
      });
    });
  }
  btnAccount.addEventListener("click", openAccountPopover);

  /* ---------- selection helpers ---------- */
  function saveRange() {
    var sel = window.getSelection();
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    if (!savedRange) { sheet.focus(); return false; }
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }
  document.addEventListener("selectionchange", debounce(function () {
    var sel = window.getSelection();
    if (sel.rangeCount && sheet.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      updateToolbar();
    }
  }, 120));

  function currentBlock() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return null;
    var n = sel.anchorNode;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== sheet) {
      if (/^(P|H1|H2|H3|BLOCKQUOTE|LI|DIV|PRE)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  }
  function blocksInSelection() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return [];
    var range = sel.getRangeAt(0);
    var out = [];
    $$("p,h1,h2,h3,blockquote,li,pre", sheet).forEach(function (b) {
      try { if (range.intersectsNode(b)) out.push(b); } catch (e) {}
    });
    return out;
  }

  /* ---------- ribbon tabs ---------- */
  $$("#ribbonTabs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $$("#ribbonTabs button").forEach(function (x) { x.classList.remove("active"); });
      btn.classList.add("active");
      var tab = btn.getAttribute("data-tab");
      $$(".rpanel").forEach(function (p) {
        p.classList.toggle("hidden", p.getAttribute("data-panel") !== tab);
      });
    });
  });

  /* ---------- toolbar commands ---------- */
  viewEditor.addEventListener("mousedown", function (e) {
    if (e.target.closest("button.rbtn")) e.preventDefault();
  });
  $$("#viewEditor [data-cmd]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      restoreRange();
      var cmd = btn.getAttribute("data-cmd");
      document.execCommand("styleWithCSS", false, true);
      document.execCommand(cmd, false, null);
      sheet.focus();
      updateToolbar();
      markDirty(); persistCurrent();
    });
  });
  $("#btnUndo").addEventListener("click", function () { sheet.focus(); document.execCommand("undo"); markDirty(); persistCurrent(); });
  $("#btnRedo").addEventListener("click", function () { sheet.focus(); document.execCommand("redo"); markDirty(); persistCurrent(); });

  var fontFamily = $("#fontFamily"), fontSize = $("#fontSize"), blockStyle = $("#blockStyle"), lineSpacing = $("#lineSpacing");
  var FONT_GROUPS = [["system", "System"], ["sans", "Sans Serif"], ["serif", "Serif"], ["mono", "Monospace"], ["display", "Display"], ["myanmar", "Myanmar"]];
  var fontGroupEls = {};
  FONT_GROUPS.forEach(function (g) {
    var og = document.createElement("optgroup");
    og.label = g[1];
    fontFamily.appendChild(og);
    fontGroupEls[g[0]] = og;
  });
  FONTS.forEach(function (f) {
    var o = document.createElement("option");
    o.value = f.n; o.textContent = f.n; o.style.fontFamily = "'" + f.n + "', sans-serif";
    (fontGroupEls[f.grp] || fontGroupEls.system).appendChild(o);
  });
  SIZES.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s; o.textContent = s;
    fontSize.appendChild(o);
  });
  fontFamily.addEventListener("change", function () {
    if (!restoreRange()) return;
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("fontName", false, fontFamily.value);
    sheet.focus(); markDirty(); persistCurrent();
  });
  fontSize.addEventListener("change", function () { applyFontSize(parseInt(fontSize.value, 10)); });
  function applyFontSize(px) {
    if (!restoreRange()) return;
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("fontSize", false, "7");
    var guard = 0, f;
    while ((f = sheet.querySelector('font[size="7"]')) && guard++ < 50) {
      var s = document.createElement("span");
      s.style.fontSize = px + "px";
      s.innerHTML = f.innerHTML;
      f.replaceWith(s);
    }
    sheet.focus(); updateToolbar(); markDirty(); persistCurrent();
  }
  blockStyle.addEventListener("change", function () {
    if (!restoreRange()) return;
    var v = blockStyle.value;
    document.execCommand("styleWithCSS", false, true);
    if (v === "blockquote") {
      var b = currentBlock();
      if (b && b.tagName === "BLOCKQUOTE") document.execCommand("formatBlock", false, "p");
      else document.execCommand("formatBlock", false, "blockquote");
    } else {
      document.execCommand("formatBlock", false, v);
    }
    sheet.focus(); updateToolbar(); markDirty(); persistCurrent();
  });
  lineSpacing.addEventListener("change", function () {
    if (!restoreRange()) return;
    var v = parseFloat(lineSpacing.value);
    var blocks = blocksInSelection();
    (blocks.length ? blocks : [currentBlock()]).forEach(function (b) {
      if (b) b.style.lineHeight = v;
    });
    sheet.focus(); markDirty(); persistCurrent();
  });

  /* ---------- color swatches ---------- */
  var TEXT_COLORS = ["#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
    "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#0000ff",
    "#9900ff", "#ff00ff", "#4f46e5", "#2563eb", "#0891b2", "#059669",
    "#65a30d", "#ca8a04", "#dc2626", "#be123c", "#78350f", "#1e3a8a"];
  var HL_COLORS = ["#ffff00", "#00ff00", "#00ffff", "#ff00ff", "#ff9900",
    "#ff0000", "#0000ff", "#4f46e5", "#999999", "#ffffff"];
  function openColorPopover(anchor, colors, cmd, onPick) {
    saveRange();
    var sw = colors.map(function (c) {
      return '<button type="button" class="swatch" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
    }).join("");
    openPopover(anchor,
      '<div class="swatches">' + sw + '</div>' +
      '<div class="swatch-row"><input type="color" id="ppCustom" value="#000000"><span style="font-size:12px;color:var(--muted)">Custom</span></div>');
    $$("#popover .swatch").forEach(function (b) {
      b.addEventListener("click", function () { pickColor(cmd, b.getAttribute("data-c"), onPick); });
    });
    $("#ppCustom").addEventListener("input", function (e) { pickColor(cmd, e.target.value, onPick, true); });
  }
  function pickColor(cmd, color, onPick, keepOpen) {
    if (!restoreRange()) { if (!keepOpen) closePopover(); return; }
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(cmd, false, color);
    if (onPick) onPick(color);
    sheet.focus(); markDirty(); persistCurrent();
    if (!keepOpen) closePopover();
  }
  $("#btnTextColor").addEventListener("click", function () {
    openColorPopover(this, TEXT_COLORS, "foreColor", function (c) { $("#fgBar").style.background = c; });
  });
  $("#btnHlColor").addEventListener("click", function () {
    openColorPopover(this, HL_COLORS, "hiliteColor", null);
  });

  function ancestorFontSize() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return null;
    var n = sel.anchorNode;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== sheet) {
      if (n.style && n.style.fontSize) {
        var m = String(n.style.fontSize).match(/([\d.]+)px/);
        if (m) return Math.round(parseFloat(m[1]));
      }
      n = n.parentNode;
    }
    return null;
  }
  function updateToolbar() {
    try {
      ["bold", "italic", "underline", "strikeThrough", "subscript", "superscript",
       "insertUnorderedList", "insertOrderedList",
       "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"].forEach(function (cmd) {
        var btn = viewEditor.querySelector('[data-cmd="' + cmd + '"]');
        if (btn) btn.classList.toggle("active", document.queryCommandState(cmd));
      });
      var fn = document.queryCommandValue("fontName").replace(/["']/g, "");
      if (fn && fontEntry(fn)) fontFamily.value = fn;
      var fs = ancestorFontSize();
      fontSize.value = fs && SIZES.indexOf(fs) >= 0 ? String(fs) : "";
      var b = currentBlock();
      var tag = b ? b.tagName.toLowerCase() : "p";
      blockStyle.value = ["p", "h1", "h2", "h3", "blockquote"].indexOf(tag) >= 0 ? tag : "p";
    } catch (e) {}
  }

  /* ---------- popover ---------- */
  var popover = $("#popover");
  function popoverEl() { return popover; }
  function openPopover(anchor, html) {
    popover.innerHTML = html;
    popover.classList.remove("hidden");
    var r = anchor.getBoundingClientRect();
    popover.style.top = Math.min(window.innerHeight - popover.offsetHeight - 12, r.bottom + 8) + "px";
    popover.style.left = Math.max(8, Math.min(window.innerWidth - popover.offsetWidth - 12, r.left)) + "px";
    var first = popover.querySelector("input,select");
    if (first) first.focus();
  }
  function closePopover() { popover.classList.add("hidden"); popover.innerHTML = ""; }
  var POPOVER_ANCHORS = "#btnLink,#btnImage,#btnTable,#btnPageSetup,#btnCite,#btnBiblio,#btnFootnote,#btnTextColor,#btnHlColor,#btnAccount,#btnParaSpacing,#btnShading,#btnBorders,#btnDate,#btnSymbol,#btnComment,#btnHeader,#btnFooter,#btnWatermark";
  document.addEventListener("mousedown", function (e) {
    if (!popover.classList.contains("hidden") && !popover.contains(e.target) && !e.target.closest(POPOVER_ANCHORS)) closePopover();
    if (!$("#exportMenu").classList.contains("hidden") && !e.target.closest(".menu-wrap")) $("#exportMenu").classList.add("hidden");
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closePopover(); clearFind(); } });

  /* link */
  $("#btnLink").addEventListener("click", function () {
    saveRange();
    var sel = window.getSelection();
    var txt = sel.rangeCount ? sel.toString() : "";
    openPopover(this,
      "<h4>" + t("insertLink") + "</h4>" +
      '<label>' + t("webAddr") + '</label><input id="ppUrl" placeholder="https://example.com">' +
      '<label>' + t("textToShow") + '</label><input id="ppText" value="' + escAttr(txt) + '">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + t("insert") + "</button></div>");
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppGo").addEventListener("click", function () {
      var url = $("#ppUrl").value.trim(), text = $("#ppText").value.trim();
      if (!url) { closePopover(); return; }
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = "https://" + url;
      restoreRange();
      if (window.getSelection().isCollapsed && text) document.execCommand("insertHTML", false, '<a href="' + escAttr(url) + '">' + escAttr(text) + "</a>");
      else document.execCommand("createLink", false, url);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });

  /* image */
  $("#btnImage").addEventListener("click", function () {
    saveRange();
    openPopover(this,
      "<h4>" + t("insertImage") + "</h4>" +
      '<div class="row" style="justify-content:flex-start"><button type="button" class="pbtn go" id="ppUpload">' + t("uploadFile") + "</button></div>" +
      '<label>' + t("orPasteImg") + '</label><input id="ppImgUrl" placeholder="https://...">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + t("insert") + "</button></div>");
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppUpload").addEventListener("click", function () { closePopover(); $("#imageFile").click(); });
    $("#ppGo").addEventListener("click", function () {
      var url = $("#ppImgUrl").value.trim();
      if (!url) { closePopover(); return; }
      restoreRange();
      document.execCommand("insertImage", false, url);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });
  $("#imageFile").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      restoreRange();
      document.execCommand("insertImage", false, rd.result);
      sheet.focus(); markDirty(); persistCurrent();
    };
    rd.readAsDataURL(f);
    this.value = "";
  });

  /* table */
  $("#btnTable").addEventListener("click", function () {
    saveRange();
    openPopover(this,
      "<h4>" + t("insertTable") + "</h4>" +
      '<label>' + t("rows") + '</label><input id="ppRows" type="number" min="1" max="20" value="3">' +
      '<label>' + t("cols") + '</label><input id="ppCols" type="number" min="1" max="10" value="3">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + t("insert") + "</button></div>");
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppGo").addEventListener("click", function () {
      var rows = Math.max(1, Math.min(20, parseInt($("#ppRows").value, 10) || 3));
      var cols = Math.max(1, Math.min(10, parseInt($("#ppCols").value, 10) || 3));
      var html = '<table class="txt-table"><tbody>';
      for (var r = 0; r < rows; r++) {
        html += "<tr>";
        for (var c = 0; c < cols; c++) html += "<td><br></td>";
        html += "</tr>";
      }
      html += "</tbody></table><p><br></p>";
      restoreRange();
      document.execCommand("insertHTML", false, html);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });

  /* page break */
  $("#btnPageBreak").addEventListener("click", function () {
    restoreRange();
    document.execCommand("insertHTML", false, '<div class="page-break"></div><p><br></p>');
    sheet.focus(); markDirty(); persistCurrent();
    toast(t("pageBreakInserted"));
  });
  $("#btnHr").addEventListener("click", function () { /* data-cmd handles it */ });

  /* ---------- references: citations, bibliography, footnotes ---------- */
  function getCitations() {
    var d = getDoc();
    if (!d.citations) d.citations = [];
    return d.citations;
  }
  function citeNumber(id) {
    var c = getCitations();
    for (var i = 0; i < c.length; i++) if (c[i].id === id) return i + 1;
    return c.length;
  }
  function formatCitation(c, style, n) {
    var a = c.author || "", y = c.year || "n.d.", ti = c.title || "", p = c.publisher || "";
    if (style === "mla") {
      var s = a ? a + ". " : "";
      s += ti ? '"' + ti + '." ' : "";
      if (p) s += p + ", ";
      s += y + ".";
      return s;
    }
    if (style === "chicago") {
      var s2 = a ? a + ". " : "";
      s2 += y + ". ";
      if (ti) s2 += '"' + ti + '." ';
      if (p) s2 += p + ".";
      return s2;
    }
    if (style === "harvard") {
      var s4 = a ? a + " " : "";
      s4 += "(" + y + ") ";
      if (ti) s4 += ti + ", ";
      if (p) s4 += p + ".";
      return s4;
    }
    if (style === "ieee") {
      var s5 = "[" + n + "] ";
      s5 += a ? a + ', "' : "";
      s5 += ti ? ti + '," ' : "";
      if (p) s5 += p + ", ";
      s5 += y + ".";
      return s5;
    }
    var s3 = a ? a + " " : "";
    s3 += "(" + y + "). ";
    if (ti) s3 += ti + ". ";
    if (p) s3 += p + ".";
    return s3;
  }
  $("#btnCite").addEventListener("click", function () {
    saveRange();
    var d = getDoc();
    openPopover(this,
      "<h4>" + t("insertCitation") + "</h4>" +
      '<label>' + t("citeStyle") + '</label><select id="ppCStyle"><option value="apa">APA</option><option value="mla">MLA</option><option value="chicago">Chicago</option><option value="harvard">' + t("styleHarvard") + '</option><option value="ieee">' + t("styleIeee") + "</option></select>" +
      '<label>' + t("sourceType") + '</label><select id="ppCType"><option value="book">' + t("book") + '</option><option value="journal">' + t("journal") + '</option><option value="website">' + t("website") + "</option></select>" +
      '<label>' + t("author") + '</label><input id="ppCAuthor" placeholder="Smith, J.">' +
      '<label>' + t("docTitle") + '</label><input id="ppCTitle">' +
      '<label>' + t("year") + '</label><input id="ppCYear" placeholder="2026">' +
      '<label>' + t("publisher") + '</label><input id="ppCPub">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + t("insert") + "</button></div>");
    $("#ppCStyle").value = d.citeStyle || "apa";
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppGo").addEventListener("click", function () {
      var c = {
        id: uid(),
        type: $("#ppCType").value,
        author: $("#ppCAuthor").value.trim(),
        title: $("#ppCTitle").value.trim(),
        year: $("#ppCYear").value.trim(),
        publisher: $("#ppCPub").value.trim()
      };
      d.citeStyle = $("#ppCStyle").value;
      getCitations().push(c);
      var n = citeNumber(c.id);
      restoreRange();
      document.execCommand("insertHTML", false,
        '<span class="cite-marker" contenteditable="false" data-cite="' + c.id + '">[' + n + "]</span>&nbsp;");
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
      renderBibliography();
    });
  });
  function bibliographyHtml() {
    var d = getDoc();
    var style = d.citeStyle || "apa";
    return getCitations().map(function (c, i) {
      return '<p class="bib-entry" data-cite="' + c.id + '">' + escAttr(formatCitation(c, style, i + 1)) + "</p>";
    }).join("");
  }
  function renderBibliography() {
    var bib = sheet.querySelector(".biblio");
    if (bib) {
      var entries = bib.querySelector(".bib-entries");
      if (entries) entries.innerHTML = bibliographyHtml();
      markDirty(); persistCurrent();
      return true;
    }
    return false;
  }
  $("#btnBiblio").addEventListener("click", function () {
    if (!getCitations().length) { toast(t("insertCitation")); return; }
    if (renderBibliography()) { toast(t("bibliographyUpdated")); return; }
    saveRange();
    restoreRange();
    document.execCommand("insertHTML", false,
      '<div class="biblio"><h2>' + t("bibliography") + '</h2><div class="bib-entries">' +
      bibliographyHtml() + "</div></div><p><br></p>");
    sheet.focus(); markDirty(); persistCurrent();
  });
  $("#btnFootnote").addEventListener("click", function () {
    saveRange();
    openPopover(this,
      "<h4>" + t("insertFootnote") + "</h4>" +
      '<label>' + t("footnoteText") + '</label><input id="ppFnText">' +
      '<div class="row"><button type="button" class="pbtn" id="ppCancel">' + t("cancel") + '</button><button type="button" class="pbtn go" id="ppGo">' + t("insert") + "</button></div>");
    $("#ppCancel").addEventListener("click", closePopover);
    $("#ppGo").addEventListener("click", function () {
      var text = $("#ppFnText").value.trim();
      if (!text) { closePopover(); return; }
      var n = sheet.querySelectorAll(".fn-marker").length + 1;
      restoreRange();
      document.execCommand("insertHTML", false,
        '<sup class="fn-marker" contenteditable="false" data-fn="' + n + '">[' + n + "]</sup>&nbsp;");
      var sec = sheet.querySelector(".footnotes");
      if (!sec) {
        sec = document.createElement("div");
        sec.className = "footnotes";
        sec.innerHTML = "<hr>";
        sheet.appendChild(sec);
      }
      var p = document.createElement("p");
      p.className = "fn-entry";
      p.setAttribute("data-fn", n);
      p.innerHTML = "<sup>[" + n + "]</sup> " + escAttr(text);
      sec.appendChild(p);
      closePopover(); sheet.focus(); markDirty(); persistCurrent();
    });
  });

  /* ---------- find and replace ---------- */
  var findbar = $("#findbar"), findInput = $("#findInput"), replaceInput = $("#replaceInput");
  var findMarks = [], findIdx = -1;
  $("#btnFind").addEventListener("click", function () { toggleFind(); });
  function toggleFind(force) {
    var show = force !== undefined ? force : findbar.classList.contains("hidden");
    findbar.classList.toggle("hidden", !show);
    if (show) { findInput.focus(); findInput.select(); runFind(); }
    else clearFind();
  }
  function clearFind() {
    findMarks.forEach(function (m) {
      var tx = document.createTextNode(m.textContent);
      m.replaceWith(tx);
    });
    findMarks = []; findIdx = -1;
    $("#findCount").textContent = "";
    sheet.normalize();
  }
  function runFind() {
    clearFind();
    var term = findInput.value;
    if (!term) return;
    var walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.toLowerCase().includes(term.toLowerCase())) return NodeFilter.FILTER_REJECT;
        if (n.parentNode && n.parentNode.closest("mark.txt-find")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var low = term.toLowerCase();
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var tmp = text, idx, parts = [];
      while ((idx = tmp.toLowerCase().indexOf(low)) >= 0) {
        parts.push({ pre: tmp.slice(0, idx), match: tmp.slice(idx, idx + term.length) });
        tmp = tmp.slice(idx + term.length);
      }
      parts.push({ pre: tmp, match: null });
      parts.forEach(function (p) {
        if (p.pre) frag.appendChild(document.createTextNode(p.pre));
        if (p.match) {
          var m = document.createElement("mark");
          m.className = "txt-find"; m.textContent = p.match;
          frag.appendChild(m);
          findMarks.push(m);
        }
      });
      node.replaceWith(frag);
    });
    findIdx = findMarks.length ? 0 : -1;
    paintFind();
  }
  function paintFind() {
    findMarks.forEach(function (m, i) { m.classList.toggle("active", i === findIdx); });
    if (findIdx >= 0) {
      findMarks[findIdx].scrollIntoView({ block: "nearest" });
      $("#findCount").textContent = (findIdx + 1) + " of " + findMarks.length;
    } else {
      $("#findCount").textContent = findInput.value ? "0 found" : "";
    }
  }
  findInput.addEventListener("input", debounce(runFind, 250));
  $("#findNext").addEventListener("click", function () {
    if (!findMarks.length) return;
    findIdx = (findIdx + 1) % findMarks.length; paintFind();
  });
  $("#findPrev").addEventListener("click", function () {
    if (!findMarks.length) return;
    findIdx = (findIdx - 1 + findMarks.length) % findMarks.length; paintFind();
  });
  $("#replaceOne").addEventListener("click", function () {
    if (findIdx < 0) return;
    var m = findMarks[findIdx];
    m.replaceWith(document.createTextNode(replaceInput.value));
    sheet.normalize(); markDirty(); persistCurrent();
    runFindKeep(replaceInput.value ? findIdx : 0);
  });
  function runFindKeep(idx) {
    runFind();
    if (findMarks.length) { findIdx = Math.min(idx, findMarks.length - 1); paintFind(); }
  }
  $("#replaceAll").addEventListener("click", function () {
    if (!findMarks.length) return;
    var n = findMarks.length, rep = replaceInput.value;
    findMarks.forEach(function (m) { m.replaceWith(document.createTextNode(rep)); });
    sheet.normalize(); markDirty(); persistCurrent();
    runFind();
    toast(n + " " + t("replaced"));
  });
  $("#findClose").addEventListener("click", function () { toggleFind(false); sheet.focus(); });

  /* ---------- word count ---------- */
  var wordCount = $("#wordCount"), charCount = $("#charCount");
  function updateCounts() {
    var text = sheet.innerText || "";
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCount.textContent = words + " " + t("words");
    charCount.textContent = text.length + " " + t("characters");
  }
  var updateCountsSoon = debounce(updateCounts, 300);
  sheet.addEventListener("input", function () { markDirty(); persistCurrent(); updateCountsSoon(); renderOutlineSoon(); });
  docHeader.addEventListener("input", function () { markDirty(); persistCurrent(); });
  docFooter.addEventListener("input", function () { markDirty(); persistCurrent(); });
  sheet.addEventListener("keyup", updateToolbar);
  sheet.addEventListener("click", updateToolbar);
  sheet.addEventListener("paste", function () { setTimeout(function () { updateCounts(); markDirty(); persistCurrent(); }, 50); });

  /* ---------- zoom + page setup ---------- */
  var zoomSel = $("#zoomSel");
  function applyZoom() {
    var z = settings.zoom;
    sheet.style.transform = "scale(" + z + ")";
    var w = sheet.offsetWidth, h = sheet.offsetHeight;
    zoomWrap.style.height = Math.ceil(h * z) + "px";
    zoomWrap.style.width = Math.ceil(w * z) + "px";
    zoomSel.value = String(z);
  }
  zoomSel.addEventListener("change", function () {
    settings.zoom = parseFloat(zoomSel.value); persistSettings(); applyZoom();
  });
  $("#zoomIn").addEventListener("click", function () {
    var steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var i = steps.indexOf(settings.zoom);
    if (i < steps.length - 1) { settings.zoom = steps[i + 1]; persistSettings(); applyZoom(); }
  });
  $("#zoomOut").addEventListener("click", function () {
    var steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var i = steps.indexOf(settings.zoom);
    if (i > 0) { settings.zoom = steps[i - 1]; persistSettings(); applyZoom(); }
  });
  function applyPageSetup() {
    var d = getDoc();
    var paper = (d && d.paper) || settings.paper || "a4";
    var orient = (d && d.orient) || "portrait";
    var p = PAPERS[paper] || PAPERS.a4;
    var w = orient === "landscape" ? p[1] : p[0];
    var h = orient === "landscape" ? p[0] : p[1];
    var m = MARGINS[(d && d.margin) || settings.margin] || MARGINS.normal;
    sheet.style.width = w + "mm";
    sheet.style.minHeight = h + "mm";
    sheet.style.padding = m + "mm";
    var cols = (d && d.columns) || 1;
    sheet.style.columnCount = cols > 1 ? String(cols) : "";
    sheet.style.columnGap = cols > 1 ? "12mm" : "";
    var pname = { a4: "A4", letter: "Letter", legal: "Legal", a5: "A5" }[paper] || paper;
    $("#pageInfo").textContent = pname + " · " + t(orient) + " · " + cols + " " + t("columns").toLowerCase();
    applyZoom();
  }

  /* ---------- outline pane ---------- */
  var outlinePane = $("#outlinePane"), outlineList = $("#outlineList");
  function renderOutline() {
    outlineList.innerHTML = "";
    $$("h1,h2,h3", sheet).forEach(function (h) {
      var lvl = parseInt(h.tagName[1], 10);
      var item = document.createElement("div");
      item.className = "outline-item lvl" + lvl;
      item.textContent = h.textContent.trim().slice(0, 60) || "(empty heading)";
      item.addEventListener("click", function () { h.scrollIntoView({ block: "center" }); });
      outlineList.appendChild(item);
    });
  }
  var renderOutlineSoon = debounce(renderOutline, 500);

  /* ---------- comments pane ---------- */
  var commentsPane = $("#commentsPane"), commentsList = $("#commentsList");
  function getComments() {
    var d = getDoc();
    if (!d.comments) d.comments = [];
    return d.comments;
  }
  function renderComments() {
    commentsList.innerHTML = "";
    var cs = getComments();
    if (!cs.length) {
      commentsList.innerHTML = '<div class="empty-note" style="margin:0">—</div>';
      return;
    }
    cs.forEach(function (c) {
      var card = document.createElement("div");
      card.className = "cmt-card";
      var who = document.createElement("div"); who.className = "who"; who.textContent = c.author;
      var q = document.createElement("div"); q.className = "quote"; q.textContent = "“" + c.quote.slice(0, 80) + "”";
      var tx = document.createElement("div"); tx.textContent = c.text;
      var row = document.createElement("div"); row.className = "row";
      var bGo = document.createElement("button"); bGo.textContent = "→";
      bGo.addEventListener("click", function () {
        var sp = sheet.querySelector('span.cmt[data-cid="' + c.cid + '"]');
        if (sp) sp.scrollIntoView({ block: "center" });
      });
      var bDone = document.createElement("button"); bDone.textContent = t("resolve");
      bDone.addEventListener("click", function () {
        c.done = !c.done;
        var sp = sheet.querySelector('span.cmt[data-cid="' + c.cid + '"]');
        if (sp) sp.classList.toggle("done", !!c.done);
        markDirty(); persistCurrent(); renderComments();
      });
      var bDel = document.createElement("button"); bDel.textContent = t("del");
      bDel.addEventListener("click", function () {
        var d = getDoc();
        d.comments = d.comments.filter(function (x) { return x.cid !== c.cid; });
        var sp = sheet.querySelector('span.cmt[data-cid="' + c.cid + '"]');
        if (sp) {
          var tx2 = document.createTextNode(sp.textContent);
          sp.replaceWith(tx2);
        }
        markDirty(); persistCurrent(); renderComments();
      });
      row.appendChild(bGo); row.appendChild(bDone); row.appendChild(bDel);
      card.appendChild(who); card.appendChild(q); card.appendChild(tx); card.appendChild(row);
      commentsList.appendChild(card);
    });
  }

  /* ---------- top bar ---------- */
  $("#btnLang").addEventListener("click", toggleLang);
  $("#btnNew").addEventListener("click", newDoc);
  $("#btnNewSide").addEventListener("click", newDoc);
  $("#btnHome").addEventListener("click", goHome);
  $("#btnViewHome").addEventListener("click", goHome);
  $("#btnHomeNew").addEventListener("click", newDoc);
  $("#btnHomeTpl").addEventListener("click", function () {
    var el = $("#tplHeading");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  });
  $("#homeSearch").addEventListener("input", debounce(renderHome, 250));
  $("#sideSearch").addEventListener("input", debounce(renderDocList, 250));
  docName.addEventListener("input", function () {
    var d = getDoc();
    if (d) { d.name = docName.value.trim() || t("untitled"); persistCurrent(); renderDocList(); }
  });
  function openFilePicker() { $("#importFile").click(); }
  $("#btnImport").addEventListener("click", openFilePicker);
  $("#importFile").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var ext = f.name.split(".").pop().toLowerCase();
    var rd = new FileReader();
    rd.onload = function () {
      var html = "";
      if (ext === "md" || ext === "markdown") html = TXTConvert.markdownToHtml(String(rd.result));
      else if (ext === "html" || ext === "htm") html = TXTConvert.sanitizeHtml(String(rd.result));
      else html = "<p>" + TXTConvert.escHtml(String(rd.result)).replace(/\n/g, "<br>") + "</p>";
      persistNow();
      var d = blankDoc(f.name.replace(/\.[^.]+$/, ""));
      d.html = html;
      docs.unshift(d);
      currentId = d.id;
      loadDocIntoEditor(d);
      persistDocs(); renderDocList(); renderHome(); updateCounts();
      goEditor();
      toast(t("opened") + " " + f.name);
    };
    rd.readAsText(f);
    this.value = "";
  });

  $("#btnExport").addEventListener("click", function (e) {
    e.stopPropagation();
    $("#exportMenu").classList.toggle("hidden");
  });
  $$("#exportMenu [data-export]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $("#exportMenu").classList.add("hidden");
      doExport(btn.getAttribute("data-export"));
    });
  });

  /* ---------- export fonts used ---------- */
  function fontsUsedInDoc() {
    var model = TXTConvert.domToModel(sheet);
    var seen = {}, out = [];
    function scan(runs) {
      (runs || []).forEach(function (r) {
        if (r.font && !seen[r.font]) { seen[r.font] = 1; out.push(r.font); }
      });
    }
    model.forEach(function (b) {
      scan(b.runs);
      (b.rows || []).forEach(function (row) {
        row.forEach(function (c) { c.blocks.forEach(function (bb) { scan(bb.runs); }); });
      });
    });
    return out;
  }
  function parseFontCss(css) {
    var faces = css.split("@font-face").slice(1).map(function (blk) {
      var w = blk.match(/font-weight:\s*(\d+)/);
      var u = blk.match(/url\((https:[^)]+)\)/);
      var s = blk.match(/\/\*\s*([a-z-]+)\s*\*\//);
      return { weight: w ? w[1] : "", url: u ? u[1] : "", subset: s ? s[1] : "" };
    }).filter(function (f) { return f.url && (f.weight === "400" || f.weight === "700"); });
    var out = [];
    ["400", "700"].forEach(function (w) {
      var f = faces.find(function (x) { return x.weight === w && x.subset === "latin"; }) ||
              faces.find(function (x) { return x.weight === w; });
      if (f && !out.some(function (o) { return o.url === f.url; })) out.push(f);
    });
    return out;
  }
  function downloadGoogleFont(entry, idx) {
    setTimeout(function () {
      fetch("https://fonts.googleapis.com/css2?family=" + entry.g + ":wght@400;700&display=swap")
        .then(function (res) { return res.text(); })
        .then(function (css) {
          var faces = parseFontCss(css);
          if (!faces.length) { toast(entry.n + ": no file"); return; }
          faces.forEach(function (fc, j) {
            setTimeout(function () {
              fetch(fc.url).then(function (r) { return r.blob(); }).then(function (blob) {
                saveBlob(blob, entry.n + "-" + (fc.weight === "700" ? "Bold" : "Regular") + ".woff2");
              }).catch(function () { toast(entry.n + ": failed"); });
            }, j * 800);
          });
        })
        .catch(function () { toast(entry.n + ": failed"); });
    }, idx * 1500);
  }
  function exportFonts() {
    var used = fontsUsedInDoc().map(fontEntry).filter(function (f) { return f && f.g; });
    if (!used.length) { toast(t("fontsNone")); return; }
    toast(t("fontsDownloading"));
    used.forEach(downloadGoogleFont);
  }

  function exportOpts() {
    var d = getDoc() || {};
    return {
      headerHtml: d.headerOn ? (d.headerHtml || "") : "",
      footerHtml: d.footerOn ? (d.footerHtml || "") : "",
      diffFirst: !!d.diffFirst,
      columns: d.columns || 1,
      orient: d.orient || "portrait",
      paper: d.paper || settings.paper || "a4",
      watermark: d.watermark && d.watermark.text ? d.watermark : null
    };
  }
  function htmlToBlocks(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    return TXTConvert.domToModel(div);
  }
  function doExport(fmt) {
    persistNow();
    if (fmt === "fonts") { exportFonts(); return; }
    var model = TXTConvert.domToModel(sheet);
    var name = safeName(docName.value);
    var opts = exportOpts();
    if (fmt === "pdf") { window.print(); return; }
    if (fmt === "txt") { saveBlob(new Blob([TXTConvert.modelToText(model)], { type: "text/plain;charset=utf-8" }), name + ".txt"); }
    else if (fmt === "md") { saveBlob(new Blob([TXTConvert.modelToMarkdown(model)], { type: "text/markdown;charset=utf-8" }), name + ".md"); }
    else if (fmt === "html") {
      var usedGoogle = fontsUsedInDoc().map(fontEntry).filter(function (f) { return f && f.g; });
      var fontLink = usedGoogle.length ?
        '<link href="https://fonts.googleapis.com/css2?' +
        usedGoogle.map(function (f) { return "family=" + f.g + ":wght@400;700"; }).join("&") +
        '&display=swap" rel="stylesheet">' : "";
      saveBlob(new Blob([TXTConvert.modelToHtmlDoc(model, name, fontLink, opts)], { type: "text/html;charset=utf-8" }), name + ".html");
    }
    else if (fmt === "rtf") { saveBlob(new Blob([TXTConvert.modelToRtf(model, name, opts)], { type: "application/rtf;charset=utf-8" }), name + ".rtf"); }
    else if (fmt === "doc") { saveBlob(new Blob([TXTConvert.modelToWordHtml(model, name, opts)], { type: "application/msword;charset=utf-8" }), name + ".doc"); }
    else if (fmt === "odt") { saveBlob(new Blob([TXTConvert.modelToOdt(model, name, opts)], { type: "application/vnd.oasis.opendocument.text" }), name + ".odt"); }
    else if (fmt === "docx") {
      toast("Building DOCX...");
      var dxOpts = Object.assign({}, opts);
      dxOpts.headerBlocks = htmlToBlocks(opts.headerHtml);
      dxOpts.footerBlocks = htmlToBlocks(opts.footerHtml);
      TXTDocx.buildBlob(model, name, dxOpts).then(function (blob) {
        saveBlob(blob, name + ".docx");
        toast("DOCX " + t("downloaded").toLowerCase());
      }).catch(function (err) {
        toast("DOCX failed: " + err.message);
      });
      return;
    }
    toast(t("downloaded") + " " + name + "." + fmt);
  }
  function printDoc() { persistNow(); window.print(); }

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); toggleFind(true); }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); persistNow(); toast(t("saved")); }
  });
  window.addEventListener("beforeunload", persistNow);
  window.addEventListener("resize", debounce(applyZoom, 200));

  /* ---------- shared API for word.js ---------- */
  window.TXTApp = {
    $, $$, uid, debounce, toast, saveBlob, safeName, escAttr, t, toggleLang, applyLang,
    settings: settings, PAPERS: PAPERS, MARGINS: MARGINS,
    getDoc: getDoc, getDocs: function () { return docs; }, getCurrentId: function () { return currentId; },
    sheet: function () { return sheet; }, docHeader: function () { return docHeader; }, docFooter: function () { return docFooter; },
    viewEditor: function () { return viewEditor; },
    saveRange: saveRange, restoreRange: restoreRange,
    openPopover: openPopover, closePopover: closePopover, popoverEl: popoverEl,
    markDirty: markDirty, markSaved: markSaved, persistCurrent: persistCurrent, persistNow: persistNow,
    renderDocList: renderDocList, renderHome: renderHome, renderOutline: renderOutline, renderComments: renderComments,
    renderWatermark: renderWatermark,
    getComments: getComments, switchDoc: switchDoc, newDoc: newDoc, newDocFromTemplate: newDocFromTemplate,
    goHome: goHome, goEditor: goEditor, openFilePicker: openFilePicker,
    currentBlock: currentBlock, blocksInSelection: blocksInSelection, updateToolbar: updateToolbar,
    updateCounts: updateCounts, applyZoom: applyZoom, applyPageSetup: applyPageSetup,
    fontEntry: fontEntry, googleFonts: googleFonts, FONTS: FONTS, SIZES: SIZES,
    doExport: doExport, exportFonts: exportFonts, printDoc: printDoc,
    toggleFind: toggleFind, fontsUsedInDoc: fontsUsedInDoc,
    getProfile: function () { return currentProfile; }, setProfile: setProfile
  };

  /* ---------- init ---------- */
  document.execCommand("styleWithCSS", false, true);
  loadProfiles();
  loadState();
  loadDocIntoEditor(getDoc());
  renderDocList();
  renderHome();
  refreshAccountBtn();
  applyPageSetup();
  applyLang();
  goHome();
})();
