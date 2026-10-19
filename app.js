/* Belege-Portal (DATEV-Ersatz) – Mock als Testziel für Klick-Automatisierung.
 * Kein Framework, kein Build, läuft per http:// und file://.
 * Gespeichert werden nur Metadaten (nie Dateiinhalte, nie Zugangsdaten).
 *
 * Testparameter in der URL (alle optional, siehe README):
 *   delay=1500   Spinner in ms bei jedem Seitenwechsel
 *   cookie=1     Cookie-Banner einmal pro Sitzung
 *   popup=1      Hinweis-Dialog beim ersten Öffnen von „Belege online“
 *   confirm=5    SmartLogin bestätigt sich nach 5 s von selbst (sonst Klick durch einen Menschen)
 *   timeout=120  Sitzung läuft nach 120 s ohne Aktion ab
 *   fail=0.3     Anteil der Uploads, die fehlschlagen (0 bis 1)
 *   slow=3000    Upload dauert 3000 ms pro Datei, mit Fortschrittsanzeige
 */
(function () {
  "use strict";

  var STORAGE_KEY = "uo-mock-belege-v1";
  var SESSION_KEY = "uo-mock-session-v1";
  var FLAGS_KEY = "uo-mock-flags-v1";
  var STATUS_DELAY_MS = 2000;
  var MAX_BYTES = 20 * 1024 * 1024;
  var ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
  var MANDANT = { name: "Musterfirma GmbH", nummer: "10001", berater: "12345" };

  var belege = loadBelege();
  var memorySession = null; // Fallback, falls sessionStorage blockiert ist
  var memoryFlags = {};
  var currentView = null;
  var busy = false;
  var confirmTimer = null;

  function $(id) { return document.getElementById(id); }

  // ---------- Testparameter ----------
  var P = (function () {
    var q = {};
    (window.location.search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      q[k] = i < 0 ? "1" : decodeURIComponent(kv.slice(i + 1));
    });
    function num(k, min, max) {
      var v = parseFloat(q[k]);
      if (isNaN(v)) return 0;
      return Math.min(max, Math.max(min, v));
    }
    return {
      delay: num("delay", 0, 30000),
      cookie: q.cookie === "1",
      popup: q.popup === "1",
      confirm: num("confirm", 0, 600),
      timeout: num("timeout", 0, 86400),
      fail: num("fail", 0, 1),
      slow: num("slow", 0, 60000)
    };
  })();

  function paramSummary() {
    var parts = [];
    if (P.delay) parts.push("delay=" + P.delay);
    if (P.cookie) parts.push("cookie");
    if (P.popup) parts.push("popup");
    if (P.confirm) parts.push("confirm=" + P.confirm);
    if (P.timeout) parts.push("timeout=" + P.timeout);
    if (P.fail) parts.push("fail=" + P.fail);
    if (P.slow) parts.push("slow=" + P.slow);
    return parts.join(" · ");
  }

  // ---------- Speicher (immer mit try/catch) ----------
  function loadBelege() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }
  function saveBelege() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(belege)); } catch (e) { /* ignorieren */ }
  }
  function getSession() {
    try {
      var raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignorieren */ }
    return memorySession;
  }
  function setSession(s) {
    memorySession = s;
    try {
      if (s) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignorieren */ }
  }
  // Einmal-pro-Sitzung-Merker (Cookie-Banner gesehen, Hinweis gesehen, Sitzung abgelaufen)
  function getFlag(k) {
    try {
      var raw = window.sessionStorage.getItem(FLAGS_KEY);
      if (raw) return !!JSON.parse(raw)[k];
    } catch (e) { /* ignorieren */ }
    return !!memoryFlags[k];
  }
  function setFlag(k, v) {
    memoryFlags[k] = v;
    try {
      var raw = window.sessionStorage.getItem(FLAGS_KEY);
      var f = raw ? JSON.parse(raw) : {};
      f[k] = v;
      window.sessionStorage.setItem(FLAGS_KEY, JSON.stringify(f));
    } catch (e) { /* ignorieren */ }
  }

  // ---------- Formatierung ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function monthLabel(key) { var p = key.split("-"); return p[1] + "/" + p[0]; }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(".", ",") + " KB";
    return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  }
  function extOf(name) {
    var i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- Routing ----------
  var VIEWS = ["login", "smartlogin", "mandanten", "belege"];

  function targetView() {
    var hash = (window.location.hash || "").replace(/^#\/?/, "");
    var session = getSession();
    if (!session) return hash === "smartlogin" ? "smartlogin" : "login";
    if (hash === "belege" && !session.mandant) return "mandanten";
    if (VIEWS.indexOf(hash) < 0 || hash === "login" || hash === "smartlogin") return session.mandant ? "belege" : "mandanten";
    return hash;
  }

  function route() {
    var view = targetView();
    var want = "#/" + view;
    if (window.location.hash !== want) {
      try { history.replaceState(null, "", want); } catch (e) { /* file:// in manchen Browsern */ }
    }
    if (view === currentView) return;
    currentView = view;
    if (P.delay > 0) {
      VIEWS.forEach(function (v) { $("view-" + v).hidden = true; });
      $("spinner").hidden = false;
      window.setTimeout(function () {
        $("spinner").hidden = true;
        if (currentView === view) showView(view);
      }, P.delay);
    } else {
      showView(view);
    }
  }

  function showView(view) {
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== view; });
    $("topbar-right").hidden = view === "login" || view === "smartlogin";
    document.body.setAttribute("data-view", view);
    if (confirmTimer) { window.clearTimeout(confirmTimer); confirmTimer = null; }

    if (view === "login") {
      $("login-timeout").hidden = !getFlag("expired");
    } else if (view === "smartlogin") {
      startSmartLogin();
    } else if (view === "mandanten") {
      $("topbar-meta").textContent = "Beraternummer " + MANDANT.berater;
    } else if (view === "belege") {
      $("topbar-meta").textContent = "Beraternummer " + MANDANT.berater + " · Mandant " + MANDANT.nummer;
      renderBelege();
      if (P.popup && !getFlag("popup")) $("popup-hinweis").hidden = false;
    }
  }

  function go(view) {
    window.location.hash = "#/" + view;
  }

  // ---------- Anmeldung mit SmartLogin ----------
  $("btn-smartlogin").addEventListener("click", function () {
    setFlag("expired", false);
    go("smartlogin");
  });

  // Fester Pseudo-QR (nicht scannbar): 25x25 Module mit den drei Ecken-Markern
  function buildQr() {
    var n = 25, seed = 10001, cells = [];
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function finder(x, y) {
      cells.push([x, y, 7, 7, 1], [x + 1, y + 1, 5, 5, 0], [x + 2, y + 2, 3, 3, 1]);
    }
    function inFinder(x, y) {
      return (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    }
    var rects = "";
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!inFinder(x, y) && rnd() < 0.5) rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    cells.forEach(function (c) {
      rects += '<rect x="' + c[0] + '" y="' + c[1] + '" width="' + c[2] + '" height="' + c[3] + '" fill="' + (c[4] ? "#1d2125" : "#ffffff") + '"/>';
    });
    $("smartlogin-qr").innerHTML = '<svg viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" fill="#1d2125" aria-label="Test-QR-Code">' + rects + "</svg>";
  }

  function startSmartLogin() {
    var st = $("smartlogin-status");
    st.className = "wait";
    st.textContent = "Warte auf Bestätigung am Smartphone …";
    // Mit confirm=N bestätigt „der Mensch“ nach N Sekunden, der Klick-Knopf entfällt
    $("btn-smartlogin-simulieren").hidden = P.confirm > 0;
    if (P.confirm > 0) confirmTimer = window.setTimeout(confirmSmartLogin, P.confirm * 1000);
  }

  function confirmSmartLogin() {
    if (currentView !== "smartlogin") return;
    var st = $("smartlogin-status");
    st.className = "wait ok";
    st.textContent = "Anmeldung bestätigt";
    setSession({ user: "smartlogin", mandant: null, last: Date.now() });
    go("mandanten");
  }
  $("btn-smartlogin-simulieren").addEventListener("click", confirmSmartLogin);

  // ---------- Abmelden ----------
  function logout(expired) {
    setSession(null);
    setFlag("expired", !!expired);
    clearUploadFeedback();
    $("popup-hinweis").hidden = true;
    go("login");
    route();
  }
  $("btn-abmelden").addEventListener("click", function (ev) {
    ev.preventDefault();
    logout(false);
  });

  // ---------- Sitzungs-Timeout ----------
  // Jede Aktion nach Ablauf führt zurück zur Anmeldung, die Aktion selbst wird verworfen.
  function checkSession(ev) {
    if (!P.timeout) return;
    var s = getSession();
    if (!s || currentView === "login" || currentView === "smartlogin") return;
    var now = Date.now();
    if (s.last && now - s.last > P.timeout * 1000) {
      ev.preventDefault();
      ev.stopPropagation();
      logout(true);
      return;
    }
    s.last = now;
    setSession(s);
  }
  ["click", "change", "drop"].forEach(function (t) { document.addEventListener(t, checkSession, true); });

  // ---------- Mandantenauswahl ----------
  $("tile-mandant-10001").addEventListener("click", function () {
    var s = getSession() || {};
    s.mandant = MANDANT.nummer;
    setSession(s);
    go("belege");
  });

  // ---------- Cookie-Banner und Hinweis ----------
  function closeCookie() { setFlag("cookie", true); $("cookie-banner").hidden = true; }
  $("btn-cookie-notwendig").addEventListener("click", closeCookie);
  $("btn-cookie-alle").addEventListener("click", closeCookie);
  $("btn-popup-schliessen").addEventListener("click", function () {
    setFlag("popup", true);
    $("popup-hinweis").hidden = true;
  });

  // ---------- Monatsfilter ----------
  function buildMonthOptions() {
    var sel = $("select-monat");
    var now = new Date();
    sel.innerHTML = "";
    for (var i = 0; i < 12; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var key = monthKey(d);
      sel.appendChild(el("option", { value: key }, monthLabel(key)));
    }
    sel.value = monthKey(now);
  }
  $("select-monat").addEventListener("change", renderBelege);

  // ---------- Tabelle ----------
  function renderBelege() {
    var month = $("select-monat").value;
    var body = $("beleg-tabelle-body");
    body.innerHTML = "";
    var rows = belege.filter(function (b) { return b.monat === month; });
    rows.forEach(function (b) {
      var tr = el("tr", { "data-testid": "beleg-row", "data-id": b.id, "data-dateiname": b.name, "data-status": b.status });
      tr.appendChild(el("td", { "data-testid": "beleg-dateiname" }, b.name));
      tr.appendChild(el("td", { "data-testid": "beleg-belegtyp" }, b.belegtyp));
      tr.appendChild(el("td", { "data-testid": "beleg-monat" }, monthLabel(b.monat)));
      tr.appendChild(el("td", { "class": "num", "data-testid": "beleg-groesse" }, fmtSize(b.size)));
      tr.appendChild(el("td", { "data-testid": "beleg-zeit" }, fmtDateTime(b.timestamp)));
      var td = el("td");
      var cls = b.status === "Bereitgestellt" ? "status-bereitgestellt" : "status-hochgeladen";
      td.appendChild(el("span", { "class": "status " + cls, "data-testid": "beleg-status" }, b.status));
      tr.appendChild(td);
      body.appendChild(tr);
    });
    $("beleg-leer").hidden = rows.length > 0;
    $("beleg-counter").textContent = rows.length + (rows.length === 1 ? " Beleg" : " Belege") + " im Monat " + monthLabel(month);
  }

  // ---------- Statuswechsel nach ~2 s ----------
  function scheduleStatus(b) {
    var age = Date.now() - new Date(b.timestamp).getTime();
    var wait = Math.max(0, STATUS_DELAY_MS - age);
    window.setTimeout(function () {
      b.status = "Bereitgestellt";
      saveBelege();
      if (document.body.getAttribute("data-view") === "belege") renderBelege();
    }, wait);
  }

  // ---------- Upload ----------
  function clearUploadFeedback() {
    $("upload-success").hidden = true;
    $("upload-error").hidden = true;
    $("upload-progress").hidden = true;
    $("upload-results").hidden = true;
    $("upload-results-body").innerHTML = "";
    $("upload-idle").hidden = false;
  }

  function setBusy(on) {
    busy = on;
    $("btn-belege-hochladen").disabled = on;
    $("btn-belege-hochladen").textContent = on ? "Upload läuft …" : "Belege hochladen";
  }

  function showProgress(done, total) {
    $("upload-idle").hidden = true;
    $("upload-progress").hidden = false;
    $("upload-progress-text").textContent = "Wird hochgeladen: Datei " + Math.min(done + 1, total) + " von " + total;
    $("upload-progress-fill").style.width = Math.round((done + 0.5) / total * 100) + "%";
  }

  function handleFiles(fileList) {
    if (busy) return;
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    clearUploadFeedback();

    var belegtyp = $("select-belegtyp").value;
    var month = $("select-monat").value;
    var results = [];
    var queue = [];

    // Sofort prüfen: Dateityp, Größe, Dublette
    files.forEach(function (f, i) {
      var ext = extOf(f.name);
      if (ALLOWED_EXT.indexOf(ext) < 0) {
        results[i] = { name: f.name, kind: "error", text: "Abgelehnt: Dateityp nicht erlaubt (nur PDF, JPG, PNG)" };
      } else if (f.size > MAX_BYTES) {
        results[i] = { name: f.name, kind: "error", text: "Abgelehnt: Datei größer als 20 MB" };
      } else if (belege.some(function (b) { return b.name === f.name && b.size === f.size; }) ||
                 queue.some(function (q) { return q.f.name === f.name && q.f.size === f.size; })) {
        results[i] = { name: f.name, kind: "dup", text: "Bereits vorhanden" };
      } else {
        queue.push({ f: f, i: i, ext: ext });
      }
    });

    var added = 0;
    function uploadOne(q) {
      if (P.fail > 0 && Math.random() < P.fail) {
        results[q.i] = { name: q.f.name, kind: "error", text: "Upload fehlgeschlagen, bitte erneut versuchen" };
        return;
      }
      var entry = {
        id: "b" + Date.now().toString(36) + "-" + belege.length,
        name: q.f.name,
        size: q.f.size,
        type: q.f.type || (q.ext === "pdf" ? "application/pdf" : "image/" + (q.ext === "jpg" ? "jpeg" : q.ext)),
        belegtyp: belegtyp,
        monat: month,
        timestamp: new Date().toISOString(),
        status: "Hochgeladen"
      };
      belege.push(entry);
      scheduleStatus(entry);
      added++;
      results[q.i] = { name: q.f.name, kind: "ok", text: "Hochgeladen" };
    }

    function finish() {
      saveBelege();
      setBusy(false);
      $("upload-progress").hidden = true;
      if (added > 0) {
        $("upload-success").textContent = added + (added === 1 ? " Beleg" : " Belege") + " hochgeladen";
        $("upload-success").hidden = false;
      }
      var problems = results.length - added;
      if (problems > 0) {
        $("upload-error").textContent = problems + (problems === 1 ? " Datei wurde" : " Dateien wurden") + " nicht übernommen";
        $("upload-error").hidden = false;
      }
      var rb = $("upload-results-body");
      results.forEach(function (r) {
        var tr = el("tr", { "class": "res-" + r.kind, "data-testid": "upload-result-" + r.kind, "data-dateiname": r.name });
        tr.appendChild(el("td", null, r.name));
        tr.appendChild(el("td", { "class": "res-text" }, r.text));
        rb.appendChild(tr);
      });
      $("upload-results").hidden = false;
      $("upload-idle").hidden = true;
      renderBelege();
    }

    if (P.slow > 0 && queue.length) {
      setBusy(true);
      var k = 0;
      showProgress(0, queue.length);
      (function next() {
        window.setTimeout(function () {
          uploadOne(queue[k]);
          k++;
          if (k < queue.length) { showProgress(k, queue.length); next(); }
          else finish();
        }, P.slow);
      })();
    } else {
      queue.forEach(uploadOne);
      finish();
    }
  }

  var fileInput = $("input-datei");
  $("btn-belege-hochladen").addEventListener("click", function () {
    if (busy) return;
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });

  // Drag & Drop: Browser soll Dateien nirgends selbst öffnen
  ["dragover", "drop"].forEach(function (t) {
    window.addEventListener(t, function (ev) { ev.preventDefault(); });
  });
  var dz = $("dropzone");
  dz.addEventListener("dragover", function (ev) { ev.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
  dz.addEventListener("drop", function (ev) {
    ev.preventDefault();
    dz.classList.remove("dragover");
    if (ev.dataTransfer && ev.dataTransfer.files) handleFiles(ev.dataTransfer.files);
  });

  // ---------- Protokoll ----------
  $("btn-protokoll").addEventListener("click", function () {
    var payload = {
      erstellt: new Date().toISOString(),
      quelle: "Belege-Portal (DATEV-Ersatz, Testumgebung)",
      testparameter: paramSummary() || "keine",
      beraternummer: MANDANT.berater,
      mandantennummer: MANDANT.nummer,
      anzahl: belege.length,
      belege: belege.map(function (b) {
        return { name: b.name, size: b.size, type: b.type, belegtyp: b.belegtyp, monat: monthLabel(b.monat), timestamp: b.timestamp, status: b.status };
      })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: "belege-protokoll-" + MANDANT.nummer + ".json" });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // ---------- Zurücksetzen ----------
  $("btn-reset").addEventListener("click", function () {
    if (busy) return;
    belege = [];
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignorieren */ }
    clearUploadFeedback();
    renderBelege();
  });

  // ---------- Start ----------
  buildQr();
  buildMonthOptions();
  var summary = paramSummary();
  if (summary) { $("mock-params").textContent = "Test: " + summary; $("mock-params").hidden = false; }
  if (P.cookie && !getFlag("cookie")) $("cookie-banner").hidden = false;
  belege.forEach(function (b) { if (b.status !== "Bereitgestellt") scheduleStatus(b); });
  window.addEventListener("hashchange", route);
  route();
})();
