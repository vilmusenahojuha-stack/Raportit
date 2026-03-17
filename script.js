// ===============================
// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxKhPbU5gZhRsF9Xlob-ozPRqKKVUntknrZCj2HNtsoBsquigNASKRSZHDKQ5ydK5vAqA/exec";
// ===============================

const LS_TOKEN = "kr_idtoken_v3";
const LS_EMAIL = "kr_email_v3";
const LS_BROWSER_KEY = "kr_browser_key_v1";
const LS_BROWSER_OK = "kr_browser_ok_v1";

let googleIdToken = null;
let loggedInEmail = null;

function $(id) { return document.getElementById(id); }

function lockApp(isLocked) {
  const app = $("appRoot");
  if (!app) return;
  if (isLocked) app.classList.add("app-locked");
  else app.classList.remove("app-locked");
}

function setAuthStatus(msg, isError = false) {
  const el = $("authStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "authstatus" + (isError ? " error" : "");
}

function setLogoutVisible(v) {
  const b = $("btnLogout");
  if (b) b.style.display = v ? "" : "none";
}

function setUserPill() {
  const pill = $("pillUser");
  if (!pill) return;
  pill.textContent = loggedInEmail ? loggedInEmail : "";
}

function saveSession(token, email) {
  localStorage.setItem(LS_TOKEN, token || "");
  localStorage.setItem(LS_EMAIL, email || "");
}

function clearSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
  localStorage.removeItem(LS_BROWSER_OK);
}

function loadSession() {
  return {
    token: localStorage.getItem(LS_TOKEN) || "",
    email: localStorage.getItem(LS_EMAIL) || "",
    browserKey: localStorage.getItem(LS_BROWSER_KEY) || "",
    browserApproved: localStorage.getItem(LS_BROWSER_OK) === "1",
  };
}

function getOrCreateBrowserKey() {
  let key = localStorage.getItem(LS_BROWSER_KEY) || "";
  if (!key) {
    key = "b_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(LS_BROWSER_KEY, key);
  }
  return key;
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1] || "";
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
    const json = decodeURIComponent(Array.from(atob(padded)).map((ch) => {
      const hex = ch.charCodeAt(0).toString(16).padStart(2, "0");
      return "%" + hex;
    }).join(""));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function registerBrowserSession(idToken, email) {
  const browserKey = getOrCreateBrowserKey();
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "registerBrowser", idToken, email, browserKey }),
  });
  const parsed = await safeJson(res);
  if (!(res.ok && parsed?.ok)) throw new Error(parsed?.error || "register_browser_failed");
  localStorage.setItem(LS_BROWSER_OK, "1");
  localStorage.setItem(LS_EMAIL, email);
  return browserKey;
}

function hardLock(reason) {
  clearSession();
  googleIdToken = null;
  loggedInEmail = null;
  setUserPill();
  lockApp(true);
  setLogoutVisible(false);
  setAuthStatus(reason || "Kirjautuminen vaaditaan.", true);
  try { google?.accounts?.id?.disableAutoSelect?.(); } catch {}
}

function handleCredentialResponse(response) {
  setAuthStatus("Kirjaudutaan…");
  const token = response?.credential || null;
  if (!token) return hardLock("Kirjautuminen epäonnistui.");

  const payload = decodeJwtPayload(token);
  const email = payload?.email || null;

  if (!email) return hardLock("Sähköpostia ei saatu tokenista.");
  if (email !== ALLOWED_EMAIL) return hardLock("Tällä tilillä ei ole käyttöoikeutta.");

  googleIdToken = token;
  loggedInEmail = email;
  saveSession(token, email);

  registerBrowserSession(token, email).then(() => {
    setAuthStatus("Kirjautunut: " + loggedInEmail);
    setUserPill();
    lockApp(false);
    setLogoutVisible(true);
  }).catch((err) => {
    console.warn("Selainrekisteröinti epäonnistui", err);
    hardLock("Kirjautuminen epäonnistui tällä laitteella.");
  });
}
window.handleCredentialResponse = handleCredentialResponse;

window.addEventListener("DOMContentLoaded", () => {
  const s = loadSession();
  getOrCreateBrowserKey();
  if (s.browserApproved && s.email === ALLOWED_EMAIL) {
    googleIdToken = s.token || null;
    loggedInEmail = s.email;
    setAuthStatus("Kirjautunut tällä laitteella: " + loggedInEmail);
    setUserPill();
    lockApp(false);
    setLogoutVisible(true);
  } else {
    lockApp(true);
    setLogoutVisible(false);
    setAuthStatus("Kirjautuminen vaaditaan.");
  }

  $("btnLogout")?.addEventListener("click", () => {
    hardLock("Kirjauduttu ulos.");
  });
});

(function () {
  const ROWS_COUNT = 12;
  const LS_KEY = "kr_state_v9";
  const LS_LAST_DRIVER = "kr_last_driver_v9";
  const LS_DRIVER_LIST = "kr_driver_list_v9";
  const STORAGE_VERSION = "v9";
  const DEFAULT_DRIVERS = ["Juha", "Tommi", "Janne"];
  const AUTH_ERRORS = ["invalid_token", "aud_mismatch", "forbidden_email", "unknown_browser", "invalid_browser", "missing_auth"];

  const tbody = document.querySelector("#raportti tbody");
  const statusMsg = $("statusMsg");

  const modal = $("modal");
  const loadNoEl = $("loadNo");
  const r2 = $("r2");
  const rahti = $("rahti");
  const lastausPvm = $("lastausPvm");
  const lastausPaikka = $("lastausPaikka");
  const purkuPvm = $("purkuPvm");
  const purkuPaikka = $("purkuPaikka");
  const kuljettaja = $("kuljettaja");
  const maara = $("maara");
  const tonnit = $("tonnit");
  const tuote = $("tuote");

  const pvm = $("pvm");
  const auto = $("auto");
  const aloitusKm = $("aloitusKm");
  const kmValue = $("kmValue");
  const btnSetKm = $("btnSetKm");

  const saveKuormaBtn = $("saveKuormaBtn");
  const closeModalBtn = $("closeModalBtn");
  const closeModalBtnX = $("closeModalBtnX");
  const syncFailedBtn = $("syncFailedBtn");
  const finishBtn = $("finishBtn");

  const lastausList = $("lastausList");
  const purkuList = $("purkuList");
  const tuoteList = $("tuoteList");

  let rows = [];
  let currentIndex = -1;
  let kmA = "";
  let kmB = "";
  let lastKm = "";
  let lastDriver = localStorage.getItem(LS_LAST_DRIVER) || "";
  let activeReport = null;

  init();

  function init() {
    const today = isoDate(new Date());
    if (pvm && !pvm.value) pvm.value = today;

    const saved = loadState();
    if (saved && Array.isArray(saved.rows) && saved.rows.length === ROWS_COUNT) {
      rows = saved.rows.map((r, idx) => ({
        index: idx + 1,
        status: r.status || "empty",
        data: r.data || {},
      }));
      if (auto && saved.auto != null) auto.value = saved.auto;
      if (pvm && saved.pvm != null) pvm.value = saved.pvm;
      kmA = String(saved.kmA || "").trim();
      kmB = String(saved.kmB || "").trim();
      lastKm = String(saved.lastKm || saved.aloitusKm || "").trim();
      activeReport = saved.activeReport || null;
      if (aloitusKm) aloitusKm.value = String(saved.aloitusKm || lastKm || "").trim();
    } else {
      rows = createEmptyRows();
      kmA = "";
      kmB = "";
      lastKm = "";
      activeReport = null;
      if (aloitusKm) aloitusKm.value = "";
    }

    syncInputsToActiveReport(false);
    initDriverSelect();
    loadSavedValues();
    renderTable();
    updateKmUI();
    updateStatus();

    tbody?.addEventListener("click", onTableClick);
    saveKuormaBtn?.addEventListener("click", saveKuorma);
    closeModalBtn?.addEventListener("click", closeModal);
    closeModalBtnX?.addEventListener("click", closeModal);
    syncFailedBtn?.addEventListener("click", sendFailedRows);
    finishBtn?.addEventListener("click", finishReport);

    [pvm, auto, aloitusKm].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => onHeaderInputChange(el));
      el.addEventListener("input", () => onHeaderInputChange(el));
    });

    btnSetKm?.addEventListener("click", () => {
      const cur = String(aloitusKm?.value || lastKm || "").trim();
      const v = prompt("Syötä aloituskilometrit:", cur);
      if (v === null) return;
      applyStartKm(String(v).trim(), currentIndex >= 6 || String(kmB).trim().length > 0);
      persist();
      updateKmUI();
      updateStatus();
    });

    kuljettaja?.addEventListener("change", () => {
      if (kuljettaja.value !== "Lisää uusi…") return;
      const uusi = prompt("Syötä kuljettajan nimi:");
      if (!uusi || !uusi.trim()) {
        kuljettaja.value = lastDriver || DEFAULT_DRIVERS[0];
        return;
      }
      const drv = uusi.trim();
      addDriver(drv, true);
      kuljettaja.value = drv;
      lastDriver = drv;
      localStorage.setItem(LS_LAST_DRIVER, lastDriver);
    });

    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeModal();
    });
  }

  function onHeaderInputChange(el) {
    if (el === auto) auto.value = normalizeVehicle(auto.value);
    if (el === aloitusKm) lastKm = String(aloitusKm.value || "").trim();

    if (activeReport && rows.some((r) => r.status !== "empty")) {
      const typedVehicle = normalizeVehicle(auto?.value || "");
      if (typedVehicle && activeReport.vehicle && typedVehicle !== activeReport.vehicle) {
        auto.value = activeReport.vehicle;
        alert("Raportin autoa ei voi vaihtaa kesken raportin. Päätä raportti ensin.");
      }
      const typedDate = String(pvm?.value || "").trim();
      if (typedDate && activeReport.reportDate && typedDate !== activeReport.reportDate) {
        pvm.value = activeReport.reportDate;
        alert("Raportin päivämäärää ei voi vaihtaa kesken raportin. Päätä raportti ensin.");
      }
    }

    persist();
    updateKmUI();
    updateStatus();
  }

  function createEmptyRows() {
    return Array.from({ length: ROWS_COUNT }, (_, i) => ({ index: i + 1, status: "empty", data: {} }));
  }

  function applyStartKm(value, useSecondHalf) {
    const vv = String(value || "").trim();
    if (aloitusKm) aloitusKm.value = vv;
    lastKm = vv;
    if (useSecondHalf) kmB = vv;
    else kmA = vv;
  }

  function syncInputsToActiveReport(persistAfter = true) {
    if (!activeReport) {
      updateKmUI();
      if (persistAfter) persist();
      return;
    }
    if (auto && activeReport.vehicle) auto.value = activeReport.vehicle;
    if (pvm && activeReport.reportDate) pvm.value = activeReport.reportDate;
    if (activeReport.startKm && !String(aloitusKm?.value || "").trim()) {
      if (aloitusKm) aloitusKm.value = activeReport.startKm;
      if (!kmA) kmA = activeReport.startKm;
      if (!lastKm) lastKm = activeReport.startKm;
    }
    updateKmUI();
    if (persistAfter) persist();
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach((row) => {
      const d = row.data || {};
      const tr = document.createElement("tr");
      tr.dataset.index = String(row.index);
      tr.innerHTML = `
        <td>${row.index}</td>
        <td>${escapeHtml(d.loadNo || "")}</td>
        <td>${escapeHtml(d.r2 || "")}</td>
        <td>${escapeHtml(d.rahti || "")}</td>
        <td>${escapeHtml(formatDateForTable(d.lastausPvm) || "")}</td>
        <td>${escapeHtml(d.lastausPaikka || "")}</td>
        <td>${escapeHtml(formatDateForTable(d.purkuPvm) || "")}</td>
        <td>${escapeHtml(d.purkuPaikka || "")}</td>
        <td>${escapeHtml(d.kuljettaja || "")}</td>
        <td>${escapeHtml(d.maara || "")}</td>
        <td>${escapeHtml(d.tonnit || "")}</td>
        <td>${escapeHtml(d.tuote || "")}</td>
        <td class="${statusClass(row.status)}">${statusSymbol(row.status)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function statusSymbol(s) {
    if (s === "ok") return "✓";
    if (s === "fail") return "!";
    if (s === "sending") return "…";
    return "";
  }

  function statusClass(s) {
    if (s === "ok") return "status-ok";
    if (s === "fail") return "status-fail";
    if (s === "sending") return "status-wait";
    return "";
  }

  function setStatus(text) {
    if (statusMsg) statusMsg.textContent = text || "";
  }

  function updateStatus() {
    const filled = rows.filter((r) => r.status !== "empty").length;
    const okCount = rows.filter((r) => r.status === "ok").length;
    const failCount = rows.filter((r) => r.status === "fail").length;
    const sendingCount = rows.filter((r) => r.status === "sending").length;

    const parts = [];
    if (activeReport?.reportNo) parts.push(`Raportti ${activeReport.reportNo}`);
    if (activeReport?.vehicle) parts.push(activeReport.vehicle);
    parts.push(`Täytettyjä rivejä: ${filled}/${ROWS_COUNT}`);
    if (okCount) parts.push(`Lähetetty: ${okCount}`);
    if (sendingCount) parts.push(`Lähetetään: ${sendingCount}`);
    if (failCount) parts.push(`Epäonnistunut: ${failCount} (paina “Lähetä epäonnistuneet”)`);
    setStatus(parts.join(" • "));
  }

  function requireAuthOrAlert() {
    const s = loadSession();
    if (loggedInEmail === ALLOWED_EMAIL && (googleIdToken || (s.browserApproved && s.browserKey))) {
      return true;
    }
    hardLock("Kirjautuminen vaaditaan.");
    alert("Kirjaudu sisään ennen käyttöä.");
    return false;
  }

  async function onTableClick(e) {
    if (!requireAuthOrAlert()) return;
    const tr = e.target.closest("tr");
    if (!tr) return;
    currentIndex = parseInt(tr.dataset.index, 10) - 1;
    openModal(rows[currentIndex]);
  }

  function openModal(row) {
    if (!row) return;
    const d = row.data || {};
    const defaultDate = String(pvm?.value || "").trim() || isoDate(new Date());

    r2.value = d.r2 || "";
    rahti.value = d.rahti || "";
    lastausPvm.value = d.lastausPvm || defaultDate;
    purkuPvm.value = d.purkuPvm || defaultDate;
    lastausPaikka.value = d.lastausPaikka || "";
    purkuPaikka.value = d.purkuPaikka || "";
    kuljettaja.value = d.kuljettaja || lastDriver || DEFAULT_DRIVERS[0];
    maara.value = d.maara || "";
    tonnit.value = d.tonnit || "";
    tuote.value = d.tuote || "";

    if (loadNoEl) loadNoEl.value = d.loadNo ? String(d.loadNo) : "Annetaan tallennettaessa";
    modal?.classList.remove("hidden");
  }

  function closeModal() {
    modal?.classList.add("hidden");
  }

  async function saveKuorma() {
    if (!requireAuthOrAlert()) return;
    if (currentIndex < 0 || currentIndex >= rows.length) return;

    let drv = String(kuljettaja.value || "").trim();
    if (drv === "Lisää uusi…") {
      const uusi = prompt("Syötä kuljettajan nimi:");
      if (!uusi || !uusi.trim()) return;
      drv = uusi.trim();
      addDriver(drv, true);
      kuljettaja.value = drv;
    }
    lastDriver = drv;
    localStorage.setItem(LS_LAST_DRIVER, lastDriver);

    const oldData = rows[currentIndex].data || {};
    const d = {
      rowUid: oldData.rowUid || null,
      loadNo: oldData.loadNo || null,
      r2: String(r2.value || "").trim(),
      rahti: String(rahti.value || "").trim(),
      lastausPvm: String(lastausPvm.value || "").trim(),
      lastausPaikka: String(lastausPaikka.value || "").trim(),
      purkuPvm: String(purkuPvm.value || "").trim(),
      purkuPaikka: String(purkuPaikka.value || "").trim(),
      kuljettaja: drv,
      maara: String(maara.value || "").trim(),
      tonnit: String(tonnit.value || "").trim(),
      tuote: String(tuote.value || "").trim(),
    };

    rows[currentIndex].data = d;
    saveSuggestion("lastausList", d.lastausPaikka);
    saveSuggestion("purkuList", d.purkuPaikka);
    saveSuggestion("tuoteList", d.tuote);

    if (hasMeaningfulContent(d)) {
      await sendRow(currentIndex);
    } else {
      rows[currentIndex].status = "empty";
      persist();
      renderTable();
      updateStatus();
    }

    closeModal();
  }

  function hasMeaningfulContent(d) {
    return [d.r2, d.rahti, d.lastausPaikka, d.purkuPaikka, d.maara, d.tonnit, d.tuote]
      .some((v) => String(v || "").trim().length > 0);
  }

  function getOrCreateRowUid(row, index) {
    if (!row) return "";
    if (!row.data) row.data = {};
    let uid = String(row.data.rowUid || "").trim();
    if (!uid) {
      uid = `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${index + 1}`;
      row.data.rowUid = uid;
    }
    return uid;
  }

  async function ensureKmForRow(index) {
    if (index === 0 && !String(kmA || "").trim()) {
      const v = prompt("Syötä aloituskilometrit (kuormat 1–6):", String(aloitusKm?.value || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      applyStartKm(String(v).trim(), false);
      persist();
      updateKmUI();
    }

    if (index === 5) {
      const v = prompt("Syötä aloituskilometrit (kuormat 7–12):", String(kmB || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      applyStartKm(String(v).trim(), true);
      persist();
      updateKmUI();
    }

    if (index >= 6 && !String(kmB || "").trim()) {
      const v = prompt("Syötä aloituskilometrit (kuormat 7–12):", String(aloitusKm?.value || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      applyStartKm(String(v).trim(), true);
      persist();
      updateKmUI();
    }

    return true;
  }

  async function ensureActiveReport() {
    if (!requireAuthOrAlert()) throw new Error("auth_required");
    const plate = normalizeVehicle(auto?.value || "");
    if (!plate) throw new Error("missing_vehicle");
    if (auto) auto.value = plate;

    if (activeReport) {
      if (activeReport.vehicle !== plate) throw new Error("report_vehicle_locked");
      if (pvm && activeReport.reportDate && pvm.value !== activeReport.reportDate) pvm.value = activeReport.reportDate;
      return activeReport;
    }

    const reportDate = String(pvm?.value || "").trim() || isoDate(new Date());
    const startKm = String((aloitusKm?.value || kmA || lastKm || "")).trim();
    const parsed = await postJson({
      action: "createOrGetReport",
      vehicle: plate,
      reportDate,
      startKm,
    });

    if (!parsed?.ok || !parsed.report?.reportId) {
      handleAuthErrors(parsed);
      throw new Error(parsed?.error || "create_report_failed");
    }

    activeReport = normalizeReport(parsed.report);
    syncInputsToActiveReport(true);
    updateStatus();
    return activeReport;
  }

  async function sendRow(index) {
    const row = rows[index];
    if (!row) return;

    try {
      if (!SHEETS_URL || SHEETS_URL.includes("PASTE_YOUR_APPS_SCRIPT_WEBAPP_EXEC_URL_HERE")) {
        throw new Error("missing_sheets_url");
      }

      const okKm = await ensureKmForRow(index);
      if (!okKm) throw new Error("missing_km");

      row.status = "sending";
      renderTable();
      persist();
      updateStatus();

      const report = await ensureActiveReport();
      const data = row.data || {};
      const rowUid = getOrCreateRowUid(row, index);
      const startKmForRow = index < 6 ? String(kmA || "").trim() : String(kmB || "").trim();

      const parsed = await postJson({
        action: "saveLoad",
        rowUid,
        reportId: report.reportId,
        reportNo: report.reportNo,
        vehicle: report.vehicle,
        reportDate: report.reportDate,
        startKm: startKmForRow,
        loadNo: data.loadNo || "",
        r2: data.r2 || "",
        rahti: data.rahti || "",
        lastausPvm: data.lastausPvm || "",
        lastausPaikka: data.lastausPaikka || "",
        purkuPvm: data.purkuPvm || "",
        purkuPaikka: data.purkuPaikka || "",
        kuljettaja: data.kuljettaja || "",
        maara: data.maara || "",
        tonnit: data.tonnit || "",
        tuote: data.tuote || "",
      });

      if (!parsed?.ok) {
        handleAuthErrors(parsed);
        throw new Error(parsed?.error || "save_failed");
      }

      if (parsed.loadNo) row.data.loadNo = String(parsed.loadNo);
      if (parsed.report?.reportId) {
        activeReport = normalizeReport(parsed.report);
        syncInputsToActiveReport(false);
      }
      row.status = "ok";
    } catch (err) {
      console.warn("Tallennus epäonnistui", err);
      if (String(err?.message || "") === "report_vehicle_locked") {
        alert("Raportin autoa ei voi vaihtaa kesken raportin. Päätä raportti ensin.");
        syncInputsToActiveReport(false);
      } else if (String(err?.message || "") === "missing_vehicle") {
        alert("Syötä Auto nro ennen tallennusta.");
      } else if (String(err?.message || "") === "missing_sheets_url") {
        alert("SHEETS_URL puuttuu. Lisää Apps Script /exec URL script.js:ään.");
      }
      row.status = "fail";
    }

    persist();
    renderTable();
    updateStatus();
  }

  async function sendFailedRows() {
    if (!requireAuthOrAlert()) return;
    const failedIdx = rows.map((r, idx) => ({ r, idx })).filter((x) => x.r.status === "fail").map((x) => x.idx);
    if (!failedIdx.length) {
      setStatus(activeStatusPrefix() + "Ei epäonnistuneita rivejä.");
      updateStatus();
      return;
    }
    for (const idx of failedIdx) {
      await sendRow(idx);
    }
    updateStatus();
  }

  async function finishReport() {
    if (!requireAuthOrAlert()) return;
    if (rows.some((r) => r.status === "sending")) {
      alert("Odota että lähetys valmistuu ennen raportin päättämistä.");
      return;
    }
    if (rows.some((r) => r.status === "fail")) {
      alert("Lähetä epäonnistuneet rivit ennen raportin päättämistä.");
      return;
    }

    const filled = rows.filter((r) => r.status !== "empty").length;
    if (!activeReport) {
      if (!confirm(`Aloitetaanko uusi tyhjä raportti?\n\nTäytettyjä rivejä: ${filled}/${ROWS_COUNT}`)) return;
      resetForNextReport(String(aloitusKm?.value || "").trim());
      return;
    }

    if (!confirm(`Päätetäänkö raportti ${activeReport.reportNo} ja aloitetaan uusi?\n\nTäytettyjä rivejä: ${filled}/${ROWS_COUNT}`)) return;

    const kmPrompt = prompt("Syötä raportin lopetus km (voit käyttää samaa seuraavan raportin aloitukseen):", String(aloitusKm?.value || lastKm || "").trim());
    if (kmPrompt === null) return;
    const endKm = String(kmPrompt).trim();

    try {
      const parsed = await postJson({
        action: "closeReport",
        reportId: activeReport.reportId,
        endKm,
      });
      if (!parsed?.ok) {
        handleAuthErrors(parsed);
        throw new Error(parsed?.error || "close_report_failed");
      }
      resetForNextReport(endKm);
      setStatus(`Raportti ${activeReport?.reportNo || ""} päätetty.`.trim());
      updateStatus();
    } catch (err) {
      console.warn("Raportin päättäminen epäonnistui", err);
      alert("Raportin päättäminen epäonnistui.");
    }
  }

  function resetForNextReport(nextKm) {
    rows = createEmptyRows();
    currentIndex = -1;
    activeReport = null;
    kmA = String(nextKm || "").trim();
    kmB = "";
    lastKm = kmA;
    if (aloitusKm) aloitusKm.value = kmA;
    renderTable();
    persist();
    updateKmUI();
    updateStatus();
  }

  function activeStatusPrefix() {
    if (!activeReport?.reportNo) return "";
    return `Raportti ${activeReport.reportNo} • `;
  }

  function normalizeReport(report) {
    return {
      reportId: String(report?.reportId || "").trim(),
      reportNo: String(report?.reportNo || "").trim(),
      vehicle: normalizeVehicle(report?.vehicle || ""),
      reportDate: String(report?.reportDate || "").trim(),
      startKm: String(report?.startKm || "").trim(),
      endKm: String(report?.endKm || "").trim(),
      status: String(report?.status || "").trim(),
    };
  }

  function initDriverSelect() {
    if (!kuljettaja) return;
    kuljettaja.innerHTML = "";
    const savedDrivers = loadDriverList();
    [...DEFAULT_DRIVERS, ...savedDrivers].forEach((name) => addDriver(name, false));
    addDriver("Lisää uusi…", false);
    const preferred = lastDriver && [...kuljettaja.options].some((o) => o.value === lastDriver)
      ? lastDriver
      : DEFAULT_DRIVERS[0];
    kuljettaja.value = preferred;
  }

  function addDriver(name, persistList) {
    const clean = String(name || "").trim();
    if (!clean || !kuljettaja) return;
    if ([...kuljettaja.options].some((o) => o.value === clean)) return;
    const opt = document.createElement("option");
    opt.value = clean;
    opt.textContent = clean;
    const addNewOpt = [...kuljettaja.options].find((o) => o.value === "Lisää uusi…");
    if (addNewOpt) kuljettaja.insertBefore(opt, addNewOpt);
    else kuljettaja.appendChild(opt);
    if (persistList && clean !== "Lisää uusi…") saveDriverList(clean);
  }

  function loadDriverList() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_DRIVER_LIST) || "[]");
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveDriverList(name) {
    const arr = loadDriverList();
    if (!arr.includes(name) && !DEFAULT_DRIVERS.includes(name)) {
      arr.push(name);
      localStorage.setItem(LS_DRIVER_LIST, JSON.stringify(arr));
    }
  }

  function saveSuggestion(listId, value) {
    const v = String(value || "").trim();
    if (!v) return;
    const key = `kr_${listId}_${STORAGE_VERSION}`;
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
    if (!items.includes(v)) {
      items.push(v);
      localStorage.setItem(key, JSON.stringify(items));
    }
    loadSavedValues();
  }

  function loadSavedValues() {
    fillDatalist("lastausList", lastausList);
    fillDatalist("purkuList", purkuList);
    fillDatalist("tuoteList", tuoteList);
  }

  function fillDatalist(listId, listEl) {
    if (!listEl) return;
    const key = `kr_${listId}_${STORAGE_VERSION}`;
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
    listEl.innerHTML = "";
    items.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      listEl.appendChild(opt);
    });
  }

  function persist() {
    const state = {
      pvm: pvm?.value || "",
      auto: normalizeVehicle(auto?.value || ""),
      aloitusKm: aloitusKm?.value || "",
      kmA,
      kmB,
      lastKm,
      activeReport,
      rows,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {
      return null;
    }
  }

  function normalizeVehicle(value) {
    return String(value || "").trim().toUpperCase();
  }

  async function postJson(body) {
    const payload = {
      browserKey: loadSession().browserKey || "",
      idToken: googleIdToken,
      email: loggedInEmail || "",
      ...body,
    };
    const res = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const parsed = await safeJson(res);
    if (!res.ok) throw new Error(parsed?.error || "http_error");
    return parsed;
  }

  async function safeJson(res) {
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      return { ok: false, raw: txt };
    }
  }

  function handleAuthErrors(parsed) {
    if (AUTH_ERRORS.includes(String(parsed?.error || ""))) {
      hardLock("Kirjautuminen vanhentui. Kirjaudu uudelleen.");
    }
  }

  function isoDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateForTable(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!m) return ymd || "";
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  function updateKmUI() {
    const v = String(aloitusKm?.value || lastKm || "").trim();
    if (kmValue) kmValue.textContent = v ? v : "—";
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
