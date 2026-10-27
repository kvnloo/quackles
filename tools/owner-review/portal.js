/* Local review portal UI. Loopback only. Records decisions; never promotes a render. */
"use strict";
(function () {
  var state = null;
  var active = null;         // active scene id
  var showing = {};          // scene id -> layer index currently displayed
  var el = function (id) { return document.getElementById(id); };
  var IMGW = Math.min(1200, Math.round((window.innerWidth || 420) *
                Math.min(2, window.devicePixelRatio || 1)));

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function src(layer) { return layer.url + "?width=" + IMGW; }

  function toast(msg, kind) {
    var t = el("toast");
    t.textContent = msg; t.className = "toast " + (kind || "");
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { t.hidden = true; }, 2600);
  }

  async function getState() {
    var r = await fetch("/api/state", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("state " + r.status);
    state = await r.json();
    if (!active || !state.scenes.some(function (s) { return s.id === active; })) {
      active = state.scenes.length ? state.scenes[0].id : null;
    }
    render();
  }

  async function post(path, body) {
    var r = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Owner-Token": state ? state.token : ""
      },
      body: JSON.stringify(body || {})
    });
    var data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  }

  function scene() {
    return state.scenes.filter(function (s) { return s.id === active; })[0];
  }
  function lastPick(sc) {
    var picks = (state.notes || []).filter(function (n) {
      return n.scene === sc.id && n.kind === "pick" && sc.candidate &&
             n.candidate && n.candidate.id === sc.candidate.id;
    });
    return picks.length ? picks[picks.length - 1].answer : null;
  }
  function pickedOption(sc, decId) {
    var ds = (state.notes || []).filter(function (n) {
      return n.scene === sc.id && n.kind === "decision" && n.decision_id === decId;
    });
    return ds.length ? ds[ds.length - 1].answer : null;
  }

  function rid(prefix, sc) {
    return (prefix + "-" + sc.id + "-" + (sc.candidate ? sc.candidate.id : "x") +
            "-" + Date.now()).replace(/[^A-Za-z0-9_-]/g, "");
  }

  function renderTabs() {
    var nav = el("tabs");
    var fresh = state.results || [];
    nav.innerHTML = state.scenes.map(function (s) {
      var sel = s.id === active;
      var dot = fresh.indexOf(s.id) >= 0 ? '<span class="dot"></span>' : "";
      return '<button class="tab" role="tab" data-scene="' + esc(s.id) + '" aria-selected="' +
        sel + '">' + esc(s.id) + dot + "</button>";
    }).join("");
  }

  function renderScene() {
    var stage = el("stage");
    var sc = scene();
    if (!sc) { stage.innerHTML = '<p class="loading">No scenes available.</p>'; return; }
    if (!sc.candidate) {
      stage.innerHTML = '<div class="scene-head"><h1>' + esc(sc.id) +
        '</h1></div><p class="empty">No current render for this scene yet.</p>';
      return;
    }
    var layers = sc.layers || [];
    if (showing[sc.id] == null) {
      var ci = layers.map(function (l) { return l.id; }).indexOf(sc.candidate.id);
      showing[sc.id] = ci >= 0 ? ci : 0;
    }
    var cur = layers[showing[sc.id]] || sc.candidate;
    var ref = layers.filter(function (l) { return l.label === "REFERENCE"; })[0];
    var picked = lastPick(sc);

    var html = "";
    html += '<div class="scene-head"><h1>' + esc(sc.id) +
      (sc.pending ? '<span class="badge">pending</span>' : "") +
      '</h1><span class="round">round ' + esc(sc.round) + "</span></div>";

    html += '<div class="viewer"><span class="vlabel">' + esc(cur.label) + "</span>" +
      '<img id="mainimg" alt="' + esc(sc.id + " " + cur.label) + '" src="' + esc(src(cur)) + '">' +
      (ref ? '<span class="hint">hold REF to compare</span>' : "") + "</div>";

    html += '<div class="layers">' + layers.map(function (l, i) {
      return '<button class="layer" data-li="' + i + '" aria-pressed="' +
        (i === showing[sc.id]) + '">' + esc(l.label) + "</button>";
    }).join("") +
      (ref ? '<button class="layer hold" id="holdref">hold&nbsp;REF</button>' : "") + "</div>";

    if (sc.notes) html += '<div class="notes">' + esc(sc.notes) + "</div>";

    html += '<div class="decide">' +
      btn("keep", "Keep", "accept", picked) +
      btn("revert", "Revert", "reject", picked) +
      btn("talk", "Talk", "discuss", picked) + "</div>";

    var qs = (state.decisions || []).filter(function (d) { return d.scene === sc.id; });
    qs.forEach(function (d) {
      var chosen = pickedOption(sc, d.id);
      html += '<div class="q" data-dec="' + esc(d.id) + '"><p>' + esc(d.question) + "</p><div class='opts'>" +
        d.options.map(function (o) {
          return '<button data-opt="' + esc(o) + '" aria-pressed="' + (o === chosen) + '">' +
            esc(o) + "</button>";
        }).join("") + "</div></div>";
    });

    html += renderLog(sc);
    stage.innerHTML = html;
  }

  function btn(cls, label, sub, picked) {
    return '<button class="' + cls + '" data-pick="' + cls + '" aria-pressed="' +
      (picked === cls) + '">' + label + "<small>" + sub + "</small></button>";
  }

  function renderLog(sc) {
    var rows = (state.notes || []).filter(function (n) { return n.scene === sc.id; }).slice(-8).reverse();
    if (!rows.length) return '<div class="log"><h2>Recorded</h2><p class="empty">Nothing yet.</p></div>';
    return '<div class="log"><h2>Recorded</h2><ul>' + rows.map(function (n) {
      var what = n.kind === "note" ? esc(n.text || "") : esc(n.answer || n.text || "");
      var t = (n.timestamp || "").replace("T", " ").slice(0, 16);
      return "<li><span class='k'>" + esc(n.kind) + "</span>" + what +
        "<span class='t'>" + esc(t) + "</span></li>";
    }).join("") + "</ul></div>";
  }

  function render() {
    if (!state) return;
    renderTabs();
    renderScene();
    var f = el("foot");
    f.textContent = "provider " + (state.provider || "queue") +
      " · " + (state.scenes.length) + " scenes · " +
      (state.last_visit ? "last seen " + state.last_visit.replace("T", " ").slice(0, 16) : "first visit");
  }

  async function sendPick(answer) {
    var sc = scene();
    if (!sc || !sc.candidate) return;
    try {
      await post("/api/submit", {
        id: rid("pick", sc), kind: "pick", scene: sc.id,
        candidate: { id: sc.candidate.id, sha256: sc.candidate.sha256 }, answer: answer
      });
      toast("Recorded: " + answer, "ok");
      await getState();
    } catch (e) {
      toast(e.message, "err");
      if (/refresh|changed/i.test(e.message)) getState();
    }
  }

  async function sendDecision(decId, option) {
    var sc = scene();
    if (!sc || !sc.candidate) return;
    try {
      await post("/api/submit", {
        id: rid("dec-" + decId, sc), kind: "decision", scene: sc.id,
        candidate: { id: sc.candidate.id, sha256: sc.candidate.sha256 },
        decision_id: decId, answer: option
      });
      toast("Recorded: " + option, "ok");
      await getState();
    } catch (e) { toast(e.message, "err"); }
  }

  // event delegation
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.classList.contains("tab")) { active = t.dataset.scene; render(); return; }
    if (t.dataset.li != null) {
      showing[active] = parseInt(t.dataset.li, 10); renderScene(); return;
    }
    if (t.dataset.pick) { sendPick({ keep: "keep", revert: "revert", talk: "talk" }[t.dataset.pick]); return; }
    if (t.dataset.opt != null) {
      var q = t.closest(".q"); sendDecision(q.dataset.dec, t.dataset.opt); return;
    }
    if (t.id === "refresh") { getState().catch(function (e) { toast(e.message, "err"); }); return; }
    if (t.id === "seen") {
      post("/api/visit", {}).then(getState).then(function () { toast("Marked reviewed", "ok"); })
        .catch(function (e) { toast(e.message, "err"); });
      return;
    }
  });

  // press-and-hold REFERENCE compare
  function holdBind(down) {
    return function (ev) {
      if (ev.target.id !== "holdref") return;
      ev.preventDefault();
      var sc = scene(); if (!sc) return;
      var ref = (sc.layers || []).filter(function (l) { return l.label === "REFERENCE"; })[0];
      var img = el("mainimg");
      if (!ref || !img) return;
      if (down) { img.dataset.restore = img.src; img.src = src(ref); }
      else if (img.dataset.restore) { img.src = img.dataset.restore; }
    };
  }
  document.addEventListener("pointerdown", holdBind(true));
  document.addEventListener("pointerup", holdBind(false));
  document.addEventListener("pointercancel", holdBind(false));

  getState().catch(function (e) {
    el("stage").innerHTML = '<p class="empty">Could not load portal: ' + esc(e.message) + "</p>";
  });
})();
