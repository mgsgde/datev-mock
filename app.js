/* Unternehmen online (Mock) – Testziel für Klick-Automatisierung.
 * Kein Framework, kein Build, läuft per http:// und file://.
 * Gespeichert werden nur Metadaten (nie Dateiinhalte, nie Passwörter). */
(function () {
  "use strict";

  var STORAGE_KEY = "uo-mock-belege-v1";
  var SESSION_KEY = "uo-mock-session-v1";
  var STATUS_DELAY_MS = 2000;
  var ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
  var MANDANT = { name: "Musterfirma GmbH", nummer: "10001", berater: "12345" };

  var belege = loadBelege();
  var memorySession = null; // Fallback, falls sessionStorage blockiert ist

  function $(id) { return document.getElementById(id); }

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
  var VIEWS = ["login", "mandanten", "belege"];

  function route() {
    var hash = (window.location.hash || "").replace(/^#\/?/, "");
    var session = getSession();
    if (!session) hash = "login";
    else if (hash === "belege" && !session.mandant) hash = "mandanten";
    else if (VIEWS.indexOf(hash) < 0 || hash === "login") hash = session.mandant ? "belege" : "mandanten";

    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== hash; });
    $("topbar-right").hidden = hash === "login";
    document.body.setAttribute("data-view", hash);

    if (hash === "login") {
      $("login-error").hidden = true;
      $("input-passwort").value = "";
    } else if (hash === "mandanten") {
      $("topbar-meta").textContent = "Beraternummer " + MANDANT.berater;
    } else if (hash === "belege") {
      $("topbar-meta").textContent = "Beraternummer " + MANDANT.berater + " · Mandant " + MANDANT.nummer;
      renderBelege();
    }
    var want = "#/" + hash;
    if (window.location.hash !== want) {
      try { history.replaceState(null, "", want); } catch (e) { /* file:// in manchen Browsern */ }
    }
  }

  // ---------- Login ----------
  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var user = $("input-benutzername").value.trim();
    var pw = $("input-passwort").value;
    $("input-passwort").value = ""; // Passwort wird nie gespeichert
    if (!user || !pw) {
      $("login-error").hidden = false;
      return;
    }
    $("login-error").hidden = true;
    setSession({ user: user, mandant: null });
    window.location.hash = "#/mandanten";
  });

  // ---------- Abmelden ----------
  $("btn-abmelden").addEventListener("click", function (ev) {
    ev.preventDefault();
    setSession(null);
    clearUploadFeedback();
    $("input-benutzername").value = "";
    window.location.hash = "#/login";
    route();
  });

  // ---------- Mandantenauswahl ----------
  $("tile-mandant-10001").addEventListener("click", function () {
    var s = getSession() || {};
    s.mandant = MANDANT.nummer;
    setSession(s);
    window.location.hash = "#/belege";
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
    $("upload-results").hidden = true;
    $("upload-results-body").innerHTML = "";
    $("upload-idle").hidden = false;
  }

  function handleFiles(fileList) {
    clearUploadFeedback();
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    var belegtyp = $("select-belegtyp").value;
    var month = $("select-monat").value;
    var results = [];
    var added = 0;

    files.forEach(function (f) {
      var ext = extOf(f.name);
      if (ALLOWED_EXT.indexOf(ext) < 0) {
        results.push({ name: f.name, kind: "error", text: "Abgelehnt: Dateityp nicht erlaubt (nur PDF, JPG, PNG)" });
        return;
      }
      var dup = belege.some(function (b) { return b.name === f.name && b.size === f.size; });
      if (dup) {
        results.push({ name: f.name, kind: "dup", text: "Bereits vorhanden" });
        return;
      }
      var entry = {
        id: "b" + Date.now().toString(36) + "-" + belege.length,
        name: f.name,
        size: f.size,
        type: f.type || (ext === "pdf" ? "application/pdf" : "image/" + (ext === "jpg" ? "jpeg" : ext)),
        belegtyp: belegtyp,
        monat: month,
        timestamp: new Date().toISOString(),
        status: "Hochgeladen"
      };
      belege.push(entry);
      scheduleStatus(entry);
      added++;
      results.push({ name: f.name, kind: "ok", text: "Hochgeladen" });
    });

    saveBelege();

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

  var fileInput = $("input-datei");
  $("btn-belege-hochladen").addEventListener("click", function () {
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
      quelle: "Unternehmen online (Mock)",
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
    belege = [];
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignorieren */ }
    clearUploadFeedback();
    renderBelege();
  });

  // ---------- Start ----------
  buildMonthOptions();
  belege.forEach(function (b) { if (b.status !== "Bereitgestellt") scheduleStatus(b); });
  window.addEventListener("hashchange", route);
  route();
})();
