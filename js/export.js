/* TXT export engine: HTML / MD / DOC / DOCX / TXT / RTF / ODT / PDF via Blob downloads. */
(function () {
  "use strict";
  var T = window.TXT;

  function sheetHtml() {
    var s = T.editor.sheetEl();
    return s ? s.innerHTML : "";
  }
  function docTitle() {
    var d = T.editor.getDoc();
    return (d && d.title ? d.title.replace(/\.txtdoc$/i, "") : "document");
  }
  function model() {
    var s = T.editor.sheetEl();
    return window.TXTConvert.domToModel(s);
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    T.toast(T.t("exportDone") + ": " + name);
  }
  function dlText(text, name, mime) {
    download(new Blob([text], { type: mime }), name);
  }

  var EXPORTERS = {
    html: function () {
      var m = model();
      dlText(window.TXTConvert.modelToHtmlDoc(m, docTitle()), docTitle() + ".html", "text/html");
    },
    md: function () {
      var m = model();
      dlText(window.TXTConvert.modelToMarkdown(m), docTitle() + ".md", "text/markdown");
    },
    doc: function () {
      var m = model();
      dlText(window.TXTConvert.modelToWordHtml(m, docTitle()), docTitle() + ".doc", "application/msword");
    },
    txt: function () {
      var m = model();
      dlText(window.TXTConvert.modelToText(m), docTitle() + ".txt", "text/plain");
    },
    rtf: function () {
      var m = model();
      dlText(window.TXTConvert.modelToRtf(m), docTitle() + ".rtf", "application/rtf");
    },
    odt: function () {
      var m = model();
      var bytes = window.TXTConvert.modelToOdt(m, docTitle());
      download(new Blob([bytes], { type: "application/vnd.oasis.opendocument.text" }), docTitle() + ".odt");
    },
    docx: function () {
      T.toast(T.t("docxBuilding"));
      var m = model();
      window.TXTDocx.buildBlob(m, docTitle(), {}).then(function (blob) {
        download(blob, docTitle() + ".docx");
      }).catch(function (e) {
        console.error(e);
        T.toast(T.t("docxFail"), "error");
      });
    },
    pdf: function () { window.print(); }
  };

  Object.keys(EXPORTERS).forEach(function (fmt) {
    var label = { html: "HTML document", md: "Markdown", doc: "Word (.doc)", docx: "Word (.docx)", txt: "Plain text", rtf: "Rich text", odt: "OpenDocument", pdf: "PDF (print)" }[fmt];
    T.register("export." + fmt, EXPORTERS[fmt], { title: "Export as " + label, cat: "Export", icon: "i-export" });
  });

  T.exporters = EXPORTERS;
  T.download = download;
})();
