(function () {
  "use strict";

  var T = window.TXT;
  if (!T) return;

  var SUPPORTED = ("speechSynthesis" in window);

  /* Symbols needed by the dock that the shell sprite does not ship.
     Appended to the runtime sprite DOM once, no file touched. */
  function ensureSymbols() {
    var sprite = document.querySelector("svg symbol");
    if (!sprite) return;
    var svg = sprite.parentNode;
    var defs = [
      ["i-play", '<symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></symbol>'],
      ["i-pause", '<symbol id="i-pause" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></symbol>'],
      ["i-stop", '<symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5"/></symbol>']
    ];
    defs.forEach(function (d) {
      if (!document.getElementById(d[0])) {
        var tmp = document.createElement("div");
        tmp.innerHTML = d[1];
        svg.appendChild(tmp.firstChild);
      }
    });
  }

  /* Session state */
  var active = false;   // a read-aloud session is in progress
  var paused = false;   // synth currently paused within an active session
  var stopping = false; // suppress onerror noise while we cancel on purpose
  var blocks = [];
  var idx = 0;
  var dockBuilt = false;
  var currentVoiceURI = "";
  var currentRate = 1;
  var currentPitch = 1;

  function prefs() {
    if (!T.state.prefs.speech) T.state.prefs.speech = {};
    return T.state.prefs.speech;
  }

  function loadPrefs() {
    var p = prefs();
    currentVoiceURI = p.voiceURI || "";
    currentRate = (typeof p.rate === "number") ? p.rate : 1;
    currentPitch = (typeof p.pitch === "number") ? p.pitch : 1;
  }

  function savePrefs() {
    var p = prefs();
    p.voiceURI = currentVoiceURI;
    p.rate = currentRate;
    p.pitch = currentPitch;
    T.savePrefs();
  }

  /* ---------- dock ---------- */

  function dock() { return T.$("#speechDock"); }

  function buildDock() {
    if (dockBuilt) return;
    var d = dock();
    if (!d) return;
    ensureSymbols();
    d.innerHTML =
      '<button type="button" id="spPlay" class="icon-btn" title="Play or pause reading" aria-label="Play or pause reading"></button>' +
      '<button type="button" id="spStop" class="icon-btn" title="Stop reading" aria-label="Stop reading">' + T.icon("i-stop") + "</button>" +
      '<label><span>Voice</span><select id="spVoice" aria-label="Voice"></select></label>' +
      '<label><span>Pitch <b id="spPitchVal"></b></span><input type="range" id="spPitch" min="0.5" max="2" step="0.1" aria-label="Pitch"></label>' +
      '<label><span>Rate <b id="spRateVal"></b></span><input type="range" id="spRate" min="0.5" max="2.5" step="0.1" aria-label="Rate"></label>';

    T.$("#spPlay").addEventListener("click", function () { toggle(); });
    T.$("#spStop").addEventListener("click", function () { stop(); });

    var voiceSel = T.$("#spVoice");
    voiceSel.addEventListener("change", function () {
      currentVoiceURI = voiceSel.value;
      savePrefs();
    });

    var pitchEl = T.$("#spPitch");
    pitchEl.addEventListener("input", function () {
      currentPitch = parseFloat(pitchEl.value) || 1;
      T.$("#spPitchVal").textContent = currentPitch.toFixed(1);
      savePrefs();
    });

    var rateEl = T.$("#spRate");
    rateEl.addEventListener("input", function () {
      currentRate = parseFloat(rateEl.value) || 1;
      T.$("#spRateVal").textContent = currentRate.toFixed(1);
      savePrefs();
    });

    pitchEl.value = currentPitch;
    rateEl.value = currentRate;
    T.$("#spPitchVal").textContent = currentPitch.toFixed(1);
    T.$("#spRateVal").textContent = currentRate.toFixed(1);

    populateVoices();
    dockBuilt = true;
    updateDockUI();
  }

  function updateDockUI() {
    var btn = T.$("#spPlay");
    if (!btn) return;
    if (active && !paused) {
      btn.innerHTML = T.icon("i-pause");
      btn.title = "Pause reading";
      btn.setAttribute("aria-label", "Pause reading");
    } else {
      btn.innerHTML = T.icon("i-play");
      btn.title = active ? "Resume reading" : "Play from start";
      btn.setAttribute("aria-label", active ? "Resume reading" : "Play from start");
    }
  }

  function showDock() {
    buildDock();
    var d = dock();
    if (d) d.classList.remove("hidden");
  }

  function hideDock() {
    var d = dock();
    if (d) d.classList.add("hidden");
  }

  /* ---------- voices ---------- */

  function populateVoices() {
    if (!SUPPORTED) return;
    var sel = T.$("#spVoice");
    if (!sel) return;
    var voices = window.speechSynthesis.getVoices();
    sel.innerHTML = "";
    if (!voices.length) {
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Default voice";
      sel.appendChild(opt0);
      sel.value = "";
      return;
    }
    voices.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name + " (" + v.lang + ")" + (v.default ? " , default" : "");
      sel.appendChild(o);
    });
    var stillThere = voices.some(function (v) { return v.voiceURI === currentVoiceURI; });
    if (!stillThere && voices.length) currentVoiceURI = voices[0].voiceURI;
    sel.value = currentVoiceURI;
  }

  if (SUPPORTED && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.addEventListener("voiceschanged", populateVoices);
  }

  function pickVoice() {
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].voiceURI === currentVoiceURI) return voices[i];
    }
    return null;
  }

  /* ---------- reading ---------- */

  var READABLE = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, LI: 1, BLOCKQUOTE: 1 };

  function collectBlocks() {
    var out = [];
    var sheet = T.editor && T.editor.sheetEl ? T.editor.sheetEl() : null;
    if (!sheet) return out;
    var kids = sheet.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (READABLE[el.tagName] && (el.innerText || "").trim()) out.push(el);
    }
    return out;
  }

  function clearHighlight() {
    T.$$(".reading-para").forEach(function (el) { el.classList.remove("reading-para"); });
  }

  function speakAt(i) {
    if (!active) return;
    if (i >= blocks.length) { stop(); return; }
    var el = blocks[i];
    var text = (el.innerText || "").trim();
    if (!text) { speakAt(i + 1); return; }

    var u = new SpeechSynthesisUtterance(text);
    var voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = currentRate;
    u.pitch = currentPitch;

    u.onstart = function () {
      el.classList.add("reading-para");
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
      updateDockUI();
    };
    u.onend = function () {
      el.classList.remove("reading-para");
      idx = i + 1;
      if (active) speakAt(idx);
    };
    u.onerror = function (ev) {
      el.classList.remove("reading-para");
      if (stopping) return;
      var name = ev && ev.error ? ev.error : "unknown";
      if (name === "interrupted" || name === "canceled") return;
      stop();
      T.toast("Speech playback stopped (" + name + ")", "error");
    };

    window.speechSynthesis.speak(u);
  }

  function start() {
    blocks = collectBlocks();
    if (!blocks.length) {
      T.toast("Nothing to read on this page");
      return;
    }
    showDock();
    stopping = false;
    active = true;
    paused = false;
    idx = 0;
    updateDockUI();
    speakAt(0);
  }

  function toggle() {
    if (!SUPPORTED) {
      T.toast("Speech not supported in this browser");
      return;
    }
    buildDock();
    if (!active) { start(); return; }
    if (paused) {
      paused = false;
      stopping = false;
      window.speechSynthesis.resume();
    } else {
      paused = true;
      window.speechSynthesis.pause();
    }
    updateDockUI();
  }

  function stop() {
    if (!SUPPORTED) return;
    stopping = true;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    active = false;
    paused = false;
    blocks = [];
    idx = 0;
    clearHighlight();
    updateDockUI();
    hideDock();
    stopping = false;
  }

  function isPlaying() {
    return active && !paused;
  }

  loadPrefs();

  T.speech = {
    toggle: toggle,
    stop: stop,
    isPlaying: isPlaying
  };

  T.register("speech.toggle", function () { T.speech.toggle(); }, {
    title: "Read aloud",
    cat: "Accessibility",
    icon: "i-aloud"
  });
  T.register("speech.stop", function () { T.speech.stop(); }, {
    title: "Stop reading aloud",
    cat: "Accessibility",
    icon: "i-aloud"
  });
})();
