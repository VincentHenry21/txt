/* TXT AI Copilot: Pollinations keyless AI actions + inspector panel.
   Contract: ARCHITECTURE.md section 9 (T.ai).
   Loads after inspector.js (registerPanel/open available at top level). */
(function () {
  "use strict";

  var T = window.TXT;
  if (!T) return;

  var ACTIONS = ["clarify", "concise", "expand", "tone", "grammar", "bullets"];

  var LABELS = {
    clarify: "Improve clarity",
    concise: "Make concise",
    expand: "Expand with details",
    tone: "Executive tone",
    grammar: "Fix grammar",
    bullets: "Summarize into bullet points"
  };

  var PROMPTS = {
    clarify: "Rewrite the text for maximum clarity, keeping the original meaning and voice. Return only the rewritten text, no preamble.",
    concise: "Make the text concise: cut redundancy and filler while keeping every key fact. Return only the rewritten text, no preamble.",
    expand: "Expand with helpful detail, context, and concrete examples that strengthen the text. Return only the rewritten text, no preamble.",
    tone: "Rewrite in a polished executive tone: confident, professional, and crisp. Return only the rewritten text, no preamble.",
    grammar: "Fix grammar and spelling, return only corrected text, no preamble.",
    bullets: "Summarize into bullet points, one clear point per line. Return only the rewritten text, no preamble."
  };

  var ENDPOINT = "https://text.pollinations.ai/openai";
  var TIMEOUT_MS = 60000;

  /* Panel state: survives inspector.refresh() re-renders. */
  var panel = { action: "clarify", text: "", result: "", running: false, error: "" };

  /* ---------------- core run ---------------- */
  function run(action, text) {
    if (!text || !text.trim()) return Promise.reject(new Error("Select text first"));
    var sys = PROMPTS[action] || PROMPTS.clarify;
    var controller = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text }
        ]
      }),
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("AI request failed (HTTP " + res.status + ")");
      return res.json();
    }).then(function (json) {
      var content = json && json.choices && json.choices[0] &&
        json.choices[0].message && json.choices[0].message.content;
      return String(content == null ? "" : content).trim();
    }).catch(function (err) {
      clearTimeout(timer);
      if (timedOut) throw new Error("AI request timed out");
      if (err && err instanceof Error && /^AI request/.test(err.message)) throw err;
      throw new Error("AI request failed. Check your connection and retry.");
    });
  }

  /* ---------------- open ---------------- */
  function openPanel(presetText, action) {
    panel.action = action && PROMPTS[action] ? action : "clarify";
    panel.text = presetText || (T.sel && T.sel.text ? T.sel.text() : "") || "";
    panel.result = "";
    panel.error = "";
    panel.running = false;
    if (T.inspector && T.inspector.open) {
      T.inspector.open("ai", { text: panel.text, action: panel.action });
    }
  }

  /* ---------------- panel render ---------------- */
  function render(bodyEl, data) {
    if (data && typeof data.text === "string") panel.text = data.text;
    if (data && data.action && PROMPTS[data.action]) panel.action = data.action;

    bodyEl.innerHTML = "";
    injectStyles();

    var wrap = document.createElement("div");
    wrap.className = "ai-panel";

    /* action buttons */
    var actionsRow = document.createElement("div");
    actionsRow.className = "ai-actions";
    ACTIONS.forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ai-act" + (a === panel.action ? " active" : "");
      b.setAttribute("data-act", a);
      b.title = LABELS[a];
      b.textContent = actionShort(a);
      b.addEventListener("click", function () {
        panel.action = a;
        var btns = actionsRow.querySelectorAll(".ai-act");
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
        b.classList.add("active");
      });
      actionsRow.appendChild(b);
    });
    wrap.appendChild(actionsRow);

    /* input text */
    var ta = document.createElement("textarea");
    ta.className = "ai-input";
    ta.rows = 6;
    ta.placeholder = "Select text in the document, or paste it here.";
    ta.value = panel.text;
    ta.addEventListener("input", function () { panel.text = ta.value; });
    wrap.appendChild(ta);

    /* run row */
    var row = document.createElement("div");
    row.className = "ai-row";
    var runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "btn-primary ai-run";
    runBtn.textContent = "Run";
    row.appendChild(runBtn);
    wrap.appendChild(row);

    /* status (typing / error) */
    var status = document.createElement("div");
    status.className = "ai-status";
    wrap.appendChild(status);

    /* output */
    var out = document.createElement("div");
    out.className = "ai-out";
    out.style.display = "none";
    wrap.appendChild(out);

    /* output actions */
    var outRow = document.createElement("div");
    outRow.className = "ai-row ai-outrow";
    outRow.style.display = "none";
    var repBtn = document.createElement("button");
    repBtn.type = "button";
    repBtn.className = "btn ai-replace";
    repBtn.textContent = "Replace selection";
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn ai-copy";
    copyBtn.textContent = "Copy";
    var retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "btn ghost ai-retry";
    retryBtn.textContent = "Retry";
    outRow.appendChild(repBtn);
    outRow.appendChild(copyBtn);
    outRow.appendChild(retryBtn);
    wrap.appendChild(outRow);

    bodyEl.appendChild(wrap);

    function setRunning(on) {
      panel.running = on;
      runBtn.disabled = on;
      if (on) {
        status.innerHTML = "";
        var tw = document.createElement("div");
        tw.className = "ai-typing";
        tw.innerHTML = T.esc("AI is writing") +
          '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>';
        status.appendChild(tw);
        out.style.display = "none";
        outRow.style.display = "none";
      } else {
        status.innerHTML = "";
      }
    }

    function showResult(text) {
      panel.result = text;
      panel.error = "";
      out.style.display = "block";
      out.textContent = text;
      outRow.style.display = "flex";
    }

    function showError(msg) {
      panel.error = msg;
      status.innerHTML = "";
      var e = document.createElement("div");
      e.className = "ai-error";
      e.textContent = msg;
      var rb = document.createElement("button");
      rb.type = "button";
      rb.className = "btn ghost";
      rb.textContent = "Retry";
      rb.addEventListener("click", doRun);
      e.appendChild(rb);
      status.appendChild(e);
    }

    function doRun() {
      if (panel.running) return;
      panel.text = ta.value;
      setRunning(true);
      run(panel.action, panel.text).then(function (text) {
        setRunning(false);
        showResult(text);
      }).catch(function (err) {
        setRunning(false);
        var msg = (err && err.message) ? err.message : "AI request failed.";
        T.toast("AI request failed. Check your connection and retry.", "error");
        showError(msg);
      });
    }

    runBtn.addEventListener("click", doRun);

    repBtn.addEventListener("click", function () {
      if (!panel.result) return;
      /* restore the saved sheet selection, then replace it */
      if (T.sel && T.sel.restore) T.sel.restore();
      var r = T.sel && T.sel.range ? T.sel.range() : null;
      if (!r) { T.toast("Select text first", "error"); return; }
      var sheet = T.sel && T.sel.sheet ? T.sel.sheet() : null;
      if (!sheet || !(sheet === r.commonAncestorContainer || sheet.contains(r.commonAncestorContainer))) {
        T.toast("Select text first", "error");
        return;
      }
      if (r.collapsed) { T.toast("Select text first", "error"); return; }
      r.deleteContents();
      r.insertNode(document.createTextNode(panel.result));
      r.collapse(false);
      if (T.editor && T.editor.markDirty) T.editor.markDirty();
      if (T.bus) T.bus.emit("doc:change");
      T.toast("Replaced with AI text");
    });

    copyBtn.addEventListener("click", function () {
      if (!panel.result) return;
      copyText(panel.result).then(function () {
        T.toast("Copied to clipboard");
      }).catch(function () {
        T.toast("Copy failed", "error");
      });
    });

    retryBtn.addEventListener("click", doRun);

    /* restore prior result after refresh */
    if (panel.result) showResult(panel.result);
    if (panel.error && !panel.running) showError(panel.error);
  }

  function actionShort(a) {
    var map = { clarify: "Clarify", concise: "Concise", expand: "Expand", tone: "Tone", grammar: "Grammar", bullets: "Bullets" };
    return map[a] || a;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      }
      ta.remove();
    });
  }

  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected || !document.head) return;
    stylesInjected = true;
    var st = document.createElement("style");
    st.id = "txt-ai-styles";
    st.textContent =
      ".ai-panel{display:flex;flex-direction:column;gap:10px}" +
      ".ai-actions{display:flex;flex-wrap:wrap;gap:6px}" +
      ".ai-act{padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-size:12px;cursor:pointer}" +
      ".ai-act.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}" +
      ".ai-input{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--page,#fff);color:var(--ink);padding:10px;font-size:13px;resize:vertical}" +
      ".ai-row{display:flex;gap:8px}" +
      ".ai-typing{display:flex;align-items:center;gap:4px;color:var(--muted);font-size:13px;padding:6px 0}" +
      ".ai-dot{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:aiBlink 1.2s infinite}" +
      ".ai-dot:nth-child(2){animation-delay:.2s}.ai-dot:nth-child(3){animation-delay:.4s}" +
      "@keyframes aiBlink{0%,100%{opacity:.2}50%{opacity:1}}" +
      ".ai-out{border:1px solid var(--line);border-radius:8px;padding:10px;font-size:13px;line-height:1.6;white-space:pre-wrap;color:var(--ink);background:var(--accent-soft)}" +
      ".ai-error{border:1px solid #e5484d;border-radius:8px;padding:10px;font-size:13px;color:#e5484d;display:flex;flex-direction:column;gap:8px;align-items:flex-start}" +
      ".ai-outrow{display:none}";
    document.head.appendChild(st);
  }

  /* ---------------- public API ---------------- */
  T.ai = {
    ACTIONS: ACTIONS,
    run: run,
    openPanel: openPanel
  };

  /* ---------------- registrations ---------------- */
  var panelRegistered = false;
  function registerPanelNow() {
    if (panelRegistered) return true;
    if (!T.inspector || !T.inspector.registerPanel) return false;
    T.inspector.registerPanel("ai", "AI Copilot", render);
    panelRegistered = true;
    return true;
  }

  if (!registerPanelNow()) {
    /* inspector.js loads before ai.js, but tolerate races anyway */
    if (T.bus && T.bus.on) T.bus.on("inspector:ready", registerPanelNow);
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (registerPanelNow() || tries > 20) clearInterval(iv);
    }, 250);
  }

  T.register("ai.open", function () { openPanel(""); }, {
    title: "AI Copilot",
    cat: "Review",
    icon: "i-ai"
  });

})();
