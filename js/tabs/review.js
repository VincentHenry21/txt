/* TXT Review tab: proofing, track changes, comments, AI copilot.
   Builds against the ribbon contract in ARCHITECTURE.md section 9.
   Load order note: changes.js, comments.js, ai.js, stats.js and inspector.js
   load AFTER this file, so their services are only touched inside command
   functions (runtime), never at module top level. */

(function () {
  "use strict";
  var T = window.TXT;

  T.ribbon.addTab({ id: "review", label: "Review", keytip: "R" });

  /* Service present and callable right now. Safe to run at runtime only. */
  function svc(mod, method) {
    return !!(T[mod] && typeof T[mod][method] === "function");
  }
  function missing(what) {
    T.toast(what + " is not available yet.", "error");
  }

  /* ---------- proofing ---------- */

  function openReadability() {
    if (svc("stats", "open")) T.stats.open();
    else missing("Readability statistics");
  }

  /* ---------- track changes ---------- */

  function trackToggle() {
    if (!svc("changes", "toggle")) { missing("Track changes"); return; }
    T.changes.toggle(); // T.changes.set() already emits changes:update with the new state
  }
  /* Toggle-button state function, evaluated by the ribbon at render time. */
  function trackState() {
    return svc("changes", "isOn") ? T.changes.isOn() : false;
  }
  function acceptAllChanges() {
    if (svc("changes", "acceptAll")) T.changes.acceptAll();
    else missing("Track changes");
  }
  function rejectAllChanges() {
    if (svc("changes", "rejectAll")) T.changes.rejectAll();
    else missing("Track changes");
  }
  function reviewChanges() {
    if (svc("inspector", "open")) T.inspector.open("changes");
    else missing("Change review");
  }

  /* ---------- comments ---------- */

  function newComment() {
    if (svc("comments", "add")) T.comments.add();
    else missing("Comments");
  }
  function showComments() {
    if (svc("inspector", "open")) T.inspector.open("comments");
    else missing("Comments");
  }

  /* ---------- AI copilot ---------- */

  function aiRun(action) {
    return function () {
      if (!svc("ai", "openPanel")) { missing("AI Copilot"); return; }
      var text = "";
      try { text = T.sel.text() || ""; } catch (e) { text = ""; }
      T.ai.openPanel(text, action);
    };
  }

  /* ---------- ribbon UI ---------- */

  var gProof = T.ribbon.group("review", "Proofing");
  gProof.appendChild(T.ribbon.btn({
    icon: "i-stats", label: "Readability", title: "Show readability statistics",
    cmd: "review.readability"
  }));

  var gTrack = T.ribbon.group("review", "Track Changes");
  gTrack.appendChild(T.ribbon.btn({
    icon: "i-track", label: "Track Changes", title: "Toggle change tracking",
    cmd: "changes.toggle", toggle: trackState
  }));
  gTrack.appendChild(T.ribbon.btn({
    icon: "i-check", label: "Accept All", title: "Accept all tracked changes",
    cmd: "changes.acceptAll"
  }));
  gTrack.appendChild(T.ribbon.btn({
    icon: "i-x", label: "Reject All", title: "Reject all tracked changes",
    cmd: "changes.rejectAll"
  }));
  gTrack.appendChild(T.ribbon.btn({
    icon: "i-eye", label: "Review Changes", title: "Review tracked changes one by one",
    cmd: "changes.list"
  }));

  var gCmt = T.ribbon.group("review", "Comments");
  gCmt.appendChild(T.ribbon.btn({
    icon: "i-comment", label: "New Comment", title: "Comment on the current selection",
    cmd: "comments.add"
  }));
  gCmt.appendChild(T.ribbon.btn({
    icon: "i-eye", label: "Show Comments", title: "Open the comments panel",
    cmd: "comments.show"
  }));

  var gAI = T.ribbon.group("review", "AI Copilot");
  var AI_ACTIONS = [
    { id: "clarify", label: "Clarify" },
    { id: "concise", label: "Concise" },
    { id: "expand", label: "Expand" },
    { id: "tone", label: "Tone" },
    { id: "grammar", label: "Grammar" },
    { id: "bullets", label: "Bullets" }
  ];
  AI_ACTIONS.forEach(function (a) {
    gAI.appendChild(T.ribbon.btn({
      icon: "i-ai", label: a.label, small: true,
      title: "AI: " + a.label.toLowerCase() + " the selected text",
      cmd: "ai." + a.id
    }));
  });

  /* ---------- commands ---------- */

  T.register("review.readability", openReadability, { title: "Readability statistics", cat: "Review", icon: "i-stats" });
  T.register("changes.toggle", trackToggle, { title: "Toggle track changes", cat: "Review", icon: "i-track" });
  T.register("changes.acceptAll", acceptAllChanges, { title: "Accept all changes", cat: "Review", icon: "i-check" });
  T.register("changes.rejectAll", rejectAllChanges, { title: "Reject all changes", cat: "Review", icon: "i-x" });
  T.register("changes.list", reviewChanges, { title: "Review changes", cat: "Review", icon: "i-eye" });
  T.register("comments.add", newComment, { title: "New comment", cat: "Review", icon: "i-comment" });
  T.register("comments.show", showComments, { title: "Show comments", cat: "Review", icon: "i-eye" });
  AI_ACTIONS.forEach(function (a) {
    T.register("ai." + a.id, aiRun(a.id), { title: "AI: " + a.label, cat: "Review", icon: "i-ai" });
  });

})();
