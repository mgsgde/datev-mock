/* Belege-Portal (Testumgebung) als Testziel für Klick-Automatisierung.
 * Kein Framework, kein Build, läuft per http:// und file://.
 * Gespeichert werden nur Metadaten (nie Dateiinhalte, nie Zugangsdaten).
 *
 * Testparameter in der URL (alle optional, siehe README):
 *   delay=1500   Spinner in ms bei jedem Seitenwechsel
 *   cookie=1     Cookie-Banner einmal pro Sitzung
 *   popup=1      Hinweis-Dialog beim ersten Öffnen von „Upload online“
 *   confirm=5    SmartLogin bestätigt sich nach 5 s von selbst (sonst Klick durch einen Menschen)
 *   timeout=120  Sitzung läuft nach 120 s ohne Aktion ab
 *   fail=0.3     Anteil der Dateien, deren Übertragung fehlschlägt (0 bis 1)
 *   slow=3000    Übertragung dauert 3000 ms pro Datei, mit Fortschrittsanzeige
 *   version=alt  ältere Upload-Version: zusätzlich TXT, DOCX, XLSX, MSG erlaubt
 */
(function () {
  "use strict";

  var STORAGE_KEY = "uo-mock-belege-v2";
  var SESSION_KEY = "uo-mock-session-v2";
  var FLAGS_KEY = "uo-mock-flags-v2";
  var VERFAHREN_KEY = "uo-mock-verfahren-v1";
  var MAX_BYTES = 20 * 1024 * 1024;
  var MAX_FILES = 300;
  var EXT_NEU = ["pdf", "gif", "jpg", "jpeg", "tif", "tiff", "png", "xml"];
  var EXT_ALT = EXT_NEU.concat(["txt", "docx", "xlsx", "msg"]);
  var TYPEN = ["Rechnungseingang", "Rechnungsausgang", "Kasse", "Sonstige"];
  var MANDANT = { name: "Musterfirma GmbH", nummer: "10001", berater: "12345" };

  var belege = loadBelege();
  var memorySession = null; // Fallback, falls sessionStorage blockiert ist
  var memoryFlags = {};
  var currentView = null;
  var busy = false;
  var confirmTimer = null;
  var activeTyp = TYPEN[0];
  var pending = {};            // Belegtyp -> [File], noch nicht übertragen
  var dupQueue = [];           // Dubletten der letzten Übertragung, nacheinander gemeldet
  TYPEN.forEach(function (t) { pending[t] = []; });

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
      slow: num("slow", 0, 60000),
      alt: q.version === "alt"
    };
  })();
  var ALLOWED_EXT = P.alt ? EXT_ALT : EXT_NEU;

  function paramSummary() {
    var parts = [];
    if (P.delay) parts.push("delay=" + P.delay);
    if (P.cookie) parts.push("cookie");
    if (P.popup) parts.push("popup");
    if (P.confirm) parts.push("confirm=" + P.confirm);
    if (P.timeout) parts.push("timeout=" + P.timeout);
    if (P.fail) parts.push("fail=" + P.fail);
    if (P.slow) parts.push("slow=" + P.slow);
    if (P.alt) parts.push("version=alt");
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
  function getVerfahren() {
    try { return window.localStorage.getItem(VERFAHREN_KEY); } catch (e) { return null; }
  }
  function setVerfahren(v) {
    try {
      if (v) window.localStorage.setItem(VERFAHREN_KEY, v);
      else window.localStorage.removeItem(VERFAHREN_KEY);
    } catch (e) { /* ignorieren */ }
  }

  // ---------- Formatierung ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
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
  function dateien(n) { return n + (n === 1 ? " Datei" : " Dateien"); }
  function pendingTotal() {
    return TYPEN.reduce(function (s, t) { return s + pending[t].length; }, 0);
  }

  // ---------- Routing ----------
  var AUTH_VIEWS = ["login", "smartlogin"];
  var APP_VIEWS = ["unternehmen", "uebersicht", "upload", "belege"];
  var TITLES = { unternehmen: "Unternehmen auswählen", uebersicht: "Übersicht", upload: "Upload online", belege: "Belege online" };

  function targetView() {
    var hash = (window.location.hash || "").replace(/^#\/?/, "");
    var session = getSession();
    if (!session) return hash === "smartlogin" ? "smartlogin" : "login";
    if (!session.unternehmen) return "unternehmen";
    if (APP_VIEWS.indexOf(hash) < 0) return "uebersicht";
    return hash;
  }

  function hideAll() {
    AUTH_VIEWS.concat(APP_VIEWS).forEach(function (v) { $("view-" + v).hidden = true; });
  }

  function route() {
    var view = targetView();
    var want = "#/" + view;
    if (window.location.hash !== want) {
      try { history.replaceState(null, "", want); } catch (e) { /* file:// in manchen Browsern */ }
    }
    if (view === currentView) return;
    currentView = view;
    $("user-menu").hidden = true;
    if (P.delay > 0) {
      hideAll();
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
    var isAuth = AUTH_VIEWS.indexOf(view) >= 0;
    hideAll();
    $("view-" + view).hidden = false;
    $("auth").hidden = !isAuth;
    $("app").hidden = isAuth;
    document.body.setAttribute("data-view", view);
    if (confirmTimer) { window.clearTimeout(confirmTimer); confirmTimer = null; }
    if (!isAuth) $("app-name").textContent = TITLES[view];

    if (view === "login") {
      showLogin();
    } else if (view === "smartlogin") {
      startSmartLogin();
    } else if (view === "uebersicht") {
      $("dash-anzahl").textContent = belege.length;
    } else if (view === "upload") {
      enterUpload();
    } else if (view === "belege") {
      renderBelege();
    }
  }

  function go(view) {
    window.location.hash = "#/" + view;
  }

  // ---------- Anmeldung: Verfahren wählen ----------
  function showLogin() {
    $("login-timeout").hidden = !getFlag("expired");
    $("login-error").hidden = true;
    var immer = getVerfahren() === "smartlogin";
    $("radio-smartlogin").checked = immer;
    $("check-immer").checked = immer;
  }
  $("radio-smartlogin").addEventListener("change", function () { $("login-error").hidden = true; });
  $("btn-weiter").addEventListener("click", function () {
    if (!$("radio-smartlogin").checked) {
      $("login-error").hidden = false;
      return;
    }
    setVerfahren($("check-immer").checked ? "smartlogin" : null);
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
      rects += '<rect x="' + c[0] + '" y="' + c[1] + '" width="' + c[2] + '" height="' + c[3] + '" fill="' + (c[4] ? "#1c2328" : "#ffffff") + '"/>';
    });
    $("smartlogin-qr").innerHTML = '<svg viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" fill="#1c2328" aria-label="Test-QR-Code">' + rects + "</svg>";
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
    setSession({ unternehmen: null, last: Date.now() });
    go("unternehmen");
  }
  $("btn-smartlogin-simulieren").addEventListener("click", confirmSmartLogin);

  // ---------- Unternehmen ----------
  $("row-unternehmen-10001").addEventListener("click", function () {
    var s = getSession() || {};
    s.unternehmen = MANDANT.nummer;
    setSession(s);
    go("uebersicht");
  });
  $("btn-unternehmen").addEventListener("click", function () {
    if (busy) return;
    var s = getSession();
    if (s) { s.unternehmen = null; setSession(s); }
    go("unternehmen");
  });

  // ---------- Benutzermenü und Abmelden ----------
  $("btn-benutzer").addEventListener("click", function (ev) {
    ev.stopPropagation();
    $("user-menu").hidden = !$("user-menu").hidden;
  });
  document.addEventListener("click", function (ev) {
    if (!$("user-menu").hidden && !$("user-menu").contains(ev.target)) $("user-menu").hidden = true;
  });

  function logout(expired) {
    setSession(null);
    setFlag("expired", !!expired);
    busy = false;
    TYPEN.forEach(function (t) { pending[t] = []; });
    dupQueue = [];
    $("dublette").hidden = true;
    $("popup-hinweis").hidden = true;
    $("user-menu").hidden = true;
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
    if (!s || AUTH_VIEWS.indexOf(currentView) >= 0) return;
    if (ev.target && $("testbar").contains(ev.target)) return;
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

  // ---------- Cookie-Banner und Hinweis ----------
  function closeCookie() { setFlag("cookie", true); $("cookie-banner").hidden = true; }
  $("btn-cookie-notwendig").addEventListener("click", closeCookie);
  $("btn-cookie-alle").addEventListener("click", closeCookie);
  $("btn-popup-schliessen").addEventListener("click", function () {
    setFlag("popup", true);
    $("popup-hinweis").hidden = true;
  });

  // ---------- Übersicht ----------
  $("btn-belege-hochladen").addEventListener("click", function () { go("upload"); });

  // ---------- Upload online ----------
  function enterUpload() {
    // „Übertragene Dateien“ gilt nur für diesen Besuch der Seite
    $("uebertragen-list").innerHTML = "";
    $("uebertragen-box").hidden = true;
    $("select-weiter").value = "";
    hideNotices();
    renderUpload();
    if (P.popup && !getFlag("popup")) $("popup-hinweis").hidden = false;
  }

  function hideNotices() {
    $("upload-error").hidden = true;
    $("upload-progress").hidden = true;
  }
  function showError(text) {
    $("upload-progress").hidden = true;
    $("upload-error").textContent = text;
    $("upload-error").hidden = false;
  }

  function renderUpload() {
    TYPEN.forEach(function (t) {
      var tab = $("tab-" + t.toLowerCase());
      var n = pending[t].length;
      tab.classList.toggle("active", t === activeTyp);
      tab.setAttribute("aria-selected", t === activeTyp ? "true" : "false");
      tab.querySelector(".tab-count").textContent = n ? " (" + n + ")" : "";
    });
    $("dz-typ").textContent = activeTyp;

    var list = $("pv-list");
    list.innerHTML = "";
    var files = pending[activeTyp];
    if (!files.length) {
      list.appendChild(el("li", { "class": "pv-empty" }, "Ziehen Sie Dateien in die Fläche oben oder wählen Sie Dateien aus."));
    }
    files.forEach(function (f, i) {
      var ext = extOf(f.name);
      var li = el("li", { "data-testid": "pv-row", "data-dateiname": f.name });
      li.appendChild(el("span", { "class": "pv-type" + (ext === "pdf" ? "" : " img") }, ext.toUpperCase().slice(0, 4)));
      li.appendChild(el("span", { "class": "pv-name" }, f.name));
      li.appendChild(el("span", { "class": "pv-size" }, fmtSize(f.size)));
      var x = el("button", { type: "button", "class": "pv-x", "data-testid": "pv-entfernen", "aria-label": "Entfernen" }, "✕");
      x.addEventListener("click", function () {
        if (busy) return;
        pending[activeTyp].splice(i, 1);
        renderUpload();
      });
      li.appendChild(x);
      list.appendChild(li);
    });

    $("pv-info").textContent = files.length ? dateien(files.length) + " ausgewählt" : "Keine Dateien ausgewählt";
    var total = pendingTotal();
    var btn = $("btn-uebertragen");
    btn.disabled = busy || total === 0;
    btn.textContent = busy ? "Übertragung läuft …" : (total ? dateien(total) + " übertragen" : "Dateien übertragen");
  }

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (tab) {
    tab.addEventListener("click", function () {
      if (busy) return;
      activeTyp = tab.getAttribute("data-typ");
      renderUpload();
    });
  });

  function addFiles(fileList) {
    if (busy) return;
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    hideNotices();
    var rejected = [];
    var tooMany = false;
    files.forEach(function (f) {
      var ext = extOf(f.name);
      if (ALLOWED_EXT.indexOf(ext) < 0) {
        rejected.push(f.name + ": Dateiformat wird nicht unterstützt");
      } else if (f.size > MAX_BYTES) {
        rejected.push(f.name + ": Datei ist größer als 20 MB");
      } else if (pendingTotal() >= MAX_FILES) {
        tooMany = true;
      } else if (!pending[activeTyp].some(function (p) { return p.name === f.name && p.size === f.size; })) {
        pending[activeTyp].push(f);
      }
    });
    if (tooMany) {
      showError("Es können höchstens " + MAX_FILES + " Dateien auf einmal übertragen werden.");
    } else if (rejected.length === 1) {
      showError(rejected[0]);
    } else if (rejected.length > 1) {
      showError(rejected.length + " Dateien wurden nicht übernommen (Format nicht unterstützt oder größer als 20 MB).");
    }
    renderUpload();
  }

  var fileInput = $("input-datei");
  function openPicker() {
    if (busy) return;
    fileInput.value = "";
    fileInput.click();
  }
  $("btn-dateien-auswaehlen").addEventListener("click", openPicker);
  $("btn-weitere-dateien").addEventListener("click", openPicker);
  fileInput.addEventListener("change", function () {
    addFiles(fileInput.files);
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
    if (ev.dataTransfer && ev.dataTransfer.files) addFiles(ev.dataTransfer.files);
  });

  // ---------- Übertragen ----------
  function addDone(entry) {
    var li = el("li", { "data-testid": "uebertragen-row", "data-dateiname": entry.name });
    li.appendChild(el("div", { "class": "done-name" }, entry.name));
    li.appendChild(el("div", { "class": "done-meta" }, entry.belegtyp + " · " + fmtSize(entry.size) + " · " + fmtDateTime(entry.timestamp)));
    $("uebertragen-list").appendChild(li);
    var n = $("uebertragen-list").children.length;
    $("uebertragen-titel").textContent = "Übertragene Dateien (" + n + ")";
    $("uebertragen-box").hidden = false;
  }

  function showProgress(done, total) {
    $("upload-error").hidden = true;
    $("upload-progress").textContent = "Wird übertragen: Datei " + Math.min(done + 1, total) + " von " + total;
    $("upload-progress").hidden = false;
  }

  $("btn-uebertragen").addEventListener("click", function () {
    if (busy) return;
    var queue = [];
    TYPEN.forEach(function (t) { pending[t].forEach(function (f) { queue.push({ f: f, typ: t }); }); });
    if (!queue.length) return;
    hideNotices();
    var failed = {};
    TYPEN.forEach(function (t) { failed[t] = []; });
    var nFailed = 0;
    dupQueue = [];

    function one(q) {
      var f = q.f;
      if (belege.some(function (b) { return b.name === f.name && b.size === f.size; })) {
        dupQueue.push({ name: f.name, size: f.size, typ: q.typ });
        return;
      }
      if (P.fail > 0 && Math.random() < P.fail) {
        failed[q.typ].push(f);
        nFailed++;
        return;
      }
      var ext = extOf(f.name);
      var entry = {
        id: "b" + Date.now().toString(36) + "-" + belege.length,
        name: f.name,
        size: f.size,
        type: f.type || ext,
        belegtyp: q.typ,
        timestamp: new Date().toISOString()
      };
      belege.push(entry);
      addDone(entry);
    }

    function finish() {
      saveBelege();
      busy = false;
      pending = failed;  // fehlgeschlagene bleiben zum erneuten Übertragen stehen
      $("upload-progress").hidden = true;
      if (nFailed) showError(dateien(nFailed) + (nFailed === 1 ? " konnte" : " konnten") + " nicht übertragen werden. Bitte erneut versuchen.");
      renderUpload();
      nextDup();
    }

    busy = true;
    if (P.slow > 0) {
      var k = 0;
      renderUpload();
      showProgress(0, queue.length);
      (function next() {
        window.setTimeout(function () {
          if (!busy) return; // abgemeldet
          one(queue[k]);
          k++;
          if (k < queue.length) { showProgress(k, queue.length); next(); }
          else finish();
        }, P.slow);
      })();
    } else {
      queue.forEach(one);
      finish();
    }
  });

  // Dublette: Hinweisfenster pro Datei, nacheinander
  function nextDup() {
    var d = dupQueue.shift();
    if (!d) { $("dublette").hidden = true; return; }
    $("dublette-datei").textContent = d.name + "\n" + fmtSize(d.size) + " · " + d.typ;
    $("dublette").setAttribute("data-dateiname", d.name);
    $("dublette").hidden = false;
  }
  $("btn-dublette-schliessen").addEventListener("click", nextDup);
  $("btn-original-anzeigen").addEventListener("click", function () {
    dupQueue = [];
    $("dublette").hidden = true;
    go("belege");
  });

  $("select-weiter").addEventListener("change", function () {
    var v = $("select-weiter").value;
    if (v) go(v);
  });

  // ---------- Belege online ----------
  function renderBelege() {
    var body = $("beleg-tabelle-body");
    body.innerHTML = "";
    var rows = belege.slice().sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
    rows.forEach(function (b) {
      var tr = el("tr", { "data-testid": "beleg-row", "data-id": b.id, "data-dateiname": b.name });
      tr.appendChild(el("td", { "data-testid": "beleg-dateiname" }, b.name));
      tr.appendChild(el("td", { "data-testid": "beleg-belegtyp" }, b.belegtyp));
      tr.appendChild(el("td", { "data-testid": "beleg-zeit" }, fmtDateTime(b.timestamp)));
      tr.appendChild(el("td", { "class": "num", "data-testid": "beleg-groesse" }, fmtSize(b.size)));
      body.appendChild(tr);
    });
    $("beleg-leer").hidden = rows.length > 0;
    $("beleg-counter").textContent = rows.length + (rows.length === 1 ? " Beleg" : " Belege") + " in der Belegablage";
  }

  // ---------- Protokoll ----------
  $("btn-protokoll").addEventListener("click", function () {
    var payload = {
      erstellt: new Date().toISOString(),
      quelle: "Belege-Portal (Testumgebung)",
      testparameter: paramSummary() || "keine",
      beraternummer: MANDANT.berater,
      mandantennummer: MANDANT.nummer,
      anzahl: belege.length,
      belege: belege.map(function (b) {
        return { name: b.name, size: b.size, type: b.type, belegtyp: b.belegtyp, timestamp: b.timestamp };
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
    TYPEN.forEach(function (t) { pending[t] = []; });
    $("uebertragen-list").innerHTML = "";
    $("uebertragen-box").hidden = true;
    hideNotices();
    renderUpload();
    renderBelege();
    $("dash-anzahl").textContent = "0";
  });

  // ---------- Start ----------
  buildQr();
  var summary = paramSummary();
  if (summary) { $("mock-params").textContent = "Test: " + summary; $("mock-params").title = summary; $("mock-params").hidden = false; }
  if (P.cookie && !getFlag("cookie")) $("cookie-banner").hidden = false;
  window.addEventListener("hashchange", route);
  route();
})();
