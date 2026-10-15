/* TXT app bootstrap: boot sequence, global keys, core commands, showcase seed. */
(function () {
  "use strict";
  var T = window.TXT;
  var $ = T.$;

  /* ----- core editing commands (used by quick access + palette) ----- */
  T.register("doc.undo", function () { if (T.history) T.history.undo(); }, { title: "Undo", cat: "Document", icon: "i-undo", keys: "Ctrl+Z" });
  T.register("doc.redo", function () { if (T.history) T.history.redo(); }, { title: "Redo", cat: "Document", icon: "i-redo", keys: "Ctrl+Y" });
  T.register("doc.print", function () { window.print(); }, { title: "Print", cat: "Document", icon: "i-print", keys: "Ctrl+P" });
  T.register("doc.new", function () {
    T.modal({ title: T.t("newDoc"), sub: T.t("confirmNew"), okText: "Create" }).then(function (r) {
      if (!r) return;
      T.editor.saveNow();
      T.editor.newDoc("", "<p><br></p>");
      $("#docTitle").value = T.editor.getDoc().title;
    });
  }, { title: "New document", cat: "Document", icon: "i-plus" });
  T.register("doc.save", function () { T.editor.saveNow(); T.toast(T.t("saved")); }, { title: "Save now", cat: "Document", icon: "i-check", keys: "Ctrl+S" });
  T.register("view.focus", function () { document.body.classList.toggle("focus-mode"); }, { title: "Focus mode", cat: "View", icon: "i-focus" });

  function syncTitle() {
    var d = T.editor.getDoc();
    var v = $("#docTitle").value.trim() || T.t("untitled");
    if (d && v !== d.title) {
      d.title = v;
      T.editor.markDirty();
      var mt = $("#mTitle"); if (mt) mt.textContent = v;
      T.bus.emit("doc:title", v);
    }
  }

  function seed() {
    if (!T.state.docs.length) {
      var s = T.templates.showcase();
      var doc = T.editor.newDoc(s.title, s.html);
      setTimeout(function () {
        T.bus.emit("comments:seed", [
          { quote: "Executive Summary", text: "Maya: Please double-check the session length numbers before Friday.", who: "Maya" },
          { quote: "session length", text: "Leo: DOCX fidelity check is scheduled for Thursday.", who: "Leo" }
        ]);
      }, 400);
      return doc;
    }
    return T.editor.openDoc(T.state.docs[0].id);
  }

  function globalKeys(e) {
    var mod = e.ctrlKey || e.metaKey;
    var tag = (e.target.tagName || "").toLowerCase();
    var inField = tag === "input" || tag === "textarea" || tag === "select";
    var key = e.key.toLowerCase();
    if (mod && key === "k" && !inField) { e.preventDefault(); T.bus.emit("palette:open"); }
    else if (mod && key === "s") { e.preventDefault(); T.cmd("doc.save"); }
    else if (mod && key === "p" && !e.shiftKey) { e.preventDefault(); T.cmd("doc.print"); }
    else if (mod && key === "z" && !e.shiftKey && !inField) { e.preventDefault(); T.cmd("doc.undo"); }
    else if (mod && (key === "y" || (key === "z" && e.shiftKey)) && !inField) { e.preventDefault(); T.cmd("doc.redo"); }
    else if (e.key === "Escape") { T.bus.emit("overlay:escape"); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    T.bus.emit("app:boot");
    var doc = seed();
    $("#docTitle").value = doc.title;
    var mt = $("#mTitle"); if (mt) mt.textContent = doc.title;
    $("#docTitle").addEventListener("input", T.debounce(syncTitle, 500));
    $("#savePill").addEventListener("click", function () { T.bus.emit("history:open"); });
    $("#qaUndo").addEventListener("click", function () { T.cmd("doc.undo"); });
    $("#qaRedo").addEventListener("click", function () { T.cmd("doc.redo"); });
    $("#qaPrint").addEventListener("click", function () { T.cmd("doc.print"); });
    document.addEventListener("keydown", globalKeys);
    document.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("copy-code")) {
        var pre = e.target.closest("pre");
        var txt = pre ? pre.innerText.replace(/Copy$/, "").trim() : "";
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { T.toast(T.t("copied")); });
      }
    });
    if (T.homescreen) T.homescreen.show();
    T.bus.emit("app:ready");
  });
})();
