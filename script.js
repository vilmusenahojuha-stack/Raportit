// ===============================
// CONFIG
const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbymG_aj2bW1EHmVVzKqeiKgcHrsEz2CRwjrDz9QlrOmR6_35wwzRfpP6Y2jh4mtZOWG/exec";
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

async function apiPost(body) {
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
  const txt = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(txt); } catch {}
  if (!res.ok) throw new Error((parsed && parsed.error) || "http_error");
  return parsed || { ok: false, error: "invalid_json" };
}

async function registerBrowserSession(idToken, email) {
  const browserKey = getOrCreateBrowserKey();
  const parsed = await apiPost({ action: "registerBrowser", idToken, email, browserKey });
  if (!(parsed && parsed.ok)) throw new Error(parsed?.error || "register_browser_failed");
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

function unlockApp(msg) {
  setAuthStatus(msg || "Kirjautunut.");
  setUserPill();
  lockApp(false);
  setLogoutVisible(true);
}

async function handleCredentialResponse(response) {
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
  unlockApp("Kirjautunut: " + loggedInEmail);

  try {
    await registerBrowserSession(token, email);
  } catch (err) {
    console.warn("Selainrekisteröinti epäonnistui, jatketaan tokenilla.", err);
    setAuthStatus("Kirjautunut: " + loggedInEmail + " • laitetta ei rekisteröity", false);
  }
}
window.handleCredentialResponse = handleCredentialResponse;

window.addEventListener("DOMContentLoaded", () => {
  const s = loadSession();
  getOrCreateBrowserKey();
  if (s.email === ALLOWED_EMAIL && (s.token || s.browserApproved)) {
    googleIdToken = s.token || null;
    loggedInEmail = s.email;
    unlockApp("Kirjautunut tällä laitteella: " + loggedInEmail);
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
  const LS_LAST_DRIVER = "kr_last_driver_v7";
  const LS_DRIVER_LIST = "kr_driver_list_v7";
  const STORAGE_VERSION = "v7";
  const DEFAULT_DRIVERS = ["Juha", "Tommi", "Janne"];

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
  let syncingOpenReport = false;

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
      if (aloitusKm) aloitusKm.value = lastKm;
    } else {
      rows = createEmptyRows();
      kmA = "";
      kmB = "";
      lastKm = "";
      activeReport = null;
      if (aloitusKm) aloitusKm.value = "";
    }

    initDriverSelect();
    loadSavedValues();
    renderTable();
    updateStatus();
    updateKmUI();

    tbody?.addEventListener("click", onTableClick);
    saveKuormaBtn?.addEventListener("click", saveKuorma);
    closeModalBtn?.addEventListener("click", closeModal);
    closeModalBtnX?.addEventListener("click", closeModal);
    syncFailedBtn?.addEventListener("click", sendFailedRows);
    finishBtn?.addEventListener("click", finishReport);

    [pvm, auto, aloitusKm].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => onHeaderChanged(el));
      el.addEventListener("input", () => onHeaderChanged(el));
    });

    btnSetKm?.addEventListener("click", () => {
      const cur = String(aloitusKm?.value || "").trim();
      const v = prompt("Syötä aloituskilometrit:", cur);
      if (v === null) return;
      const vv = String(v).trim();
      if (aloitusKm) aloitusKm.value = vv;
      lastKm = vv;
      if (currentIndex >= 6 || kmB) kmB = vv;
      else kmA = vv;
      persist();
      updateKmUI();
    });

    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeModal();
    });

    maybeRefreshOpenReport(false);
  }

  function onHeaderChanged(el) {
    if (el === aloitusKm) lastKm = String(aloitusKm.value || "").trim();
    if (el === auto && activeReport && normalizeVehicle(activeReport.vehicle) !== normalizeVehicle(auto.value)) {
      activeReport = null;
      rows.forEach((row) => {
        row.status = row.status === "empty" ? "empty" : "fail";
      });
      setStatus("Auto vaihtui. Tallenna rivit uudelleen uudelle autolle.");
    }
    persist();
    updateKmUI();
    if (el === auto && !hasLocalWork()) maybeRefreshOpenReport(false);
  }

  function createEmptyRows() {
    return Array.from({ length: ROWS_COUNT }, (_, i) => ({ index: i + 1, status: "empty", data: {} }));
  }

  function updateKmUI() {
    const v = String(aloitusKm?.value || lastKm || "").trim();
    if (kmValue) kmValue.textContent = v ? v : "—";
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

  function updateStatus(extraText = "") {
    const filled = rows.filter((r) => r.status !== "empty").length;
    const okCount = rows.filter((r) => r.status === "ok").length;
    const failCount = rows.filter((r) => r.status === "fail").length;
    let msg = `Täytettyjä rivejä: ${filled}/${ROWS_COUNT}`;
    if (activeReport?.reportNo) msg += ` • Raportti: ${activeReport.reportNo}`;
    if (okCount) msg += ` • Lähetetty: ${okCount}`;
    if (failCount) msg += ` • Epäonnistunut: ${failCount} (paina “Lähetä epäonnistuneet”)`;
    if (extraText) msg += ` • ${extraText}`;
    setStatus(msg);
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
    await openModal(rows[currentIndex]);
  }

  async function openModal(row) {
    if (!row) return;
    const d = row.data || {};
    const today = isoDate(new Date());

    r2.value = d.r2 || "";
    rahti.value = d.rahti || "";
    lastausPvm.value = d.lastausPvm || today;
    purkuPvm.value = d.purkuPvm || today;
    lastausPaikka.value = d.lastausPaikka || "";
    purkuPaikka.value = d.purkuPaikka || "";
    kuljettaja.value = d.kuljettaja || lastDriver || DEFAULT_DRIVERS[0];
    maara.value = d.maara || "";
    tonnit.value = d.tonnit || "";
    tuote.value = d.tuote || "";

    if (loadNoEl) loadNoEl.value = d.loadNo ? String(d.loadNo) : "Annetaan tallennettaessa";
    modal?.classList.remove("hidden");
  }

  function closeModal() { modal?.classList.add("hidden"); }

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
      reportId: oldData.reportId || activeReport?.reportId || null,
      reportNo: oldData.reportNo || activeReport?.reportNo || null,
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

    if (hasMeaningfulContent(d)) await sendRow(currentIndex);
    else {
      rows[currentIndex].status = "empty";
      persist();
      renderTable();
      updateStatus();
    }

    closeModal();
  }

  function hasMeaningfulContent(d) {
    return [d.r2, d.rahti, d.lastausPaikka, d.purkuPaikka, d.maara, d.tonnit, d.tuote].some((v) => String(v || "").trim().length > 0);
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
      kmA = String(v).trim();
      lastKm = kmA;
      if (aloitusKm) aloitusKm.value = kmA;
      persist();
      updateKmUI();
    }
    if (index === 5) {
      const v = prompt("Syötä aloituskilometrit (kuormat 7–12):", String(kmB || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      kmB = String(v).trim();
      lastKm = kmB;
      if (aloitusKm) aloitusKm.value = kmB;
      persist();
      updateKmUI();
    }
    if (index >= 6 && !String(kmB || "").trim()) {
      const v = prompt("Syötä aloituskilometrit (kuormat 7–12):", String(aloitusKm?.value || lastKm || "").trim());
      if (v === null || !String(v).trim()) return false;
      kmB = String(v).trim();
      lastKm = kmB;
      if (aloitusKm) aloitusKm.value = kmB;
      persist();
      updateKmUI();
    }
    return true;
  }

  async function maybeRefreshOpenReport(showStatus = true) {
    if (syncingOpenReport) return;
    const vehicle = normalizeVehicle(auto?.value || "");
    if (!vehicle || !requireAuthSilently()) return;
    syncingOpenReport = true;
    try {
      const parsed = await apiPost(authBody({ action: "getOpenReport", vehicle }));
      if (parsed?.ok) {
        activeReport = parsed.report || null;
        if (activeReport?.startKm && !String(aloitusKm?.value || "").trim()) {
          aloitusKm.value = activeReport.startKm;
          lastKm = activeReport.startKm;
          kmA = kmA || activeReport.startKm;
        }
        persist();
        if (showStatus) updateStatus(activeReport ? `Avoin raportti löytyi autolle ${vehicle}` : "Ei avointa raporttia");
      }
    } catch (err) {
      console.warn("Avoimen raportin haku epäonnistui", err);
    } finally {
      syncingOpenReport = false;
    }
  }

  function authBody(extra) {
    const s = loadSession();
    return Object.assign({}, extra || {}, {
      browserKey: s.browserKey || "",
      idToken: googleIdToken || s.token || "",
      email: loggedInEmail || s.email || "",
    });
  }

  function requireAuthSilently() {
    const s = loadSession();
    return loggedInEmail === ALLOWED_EMAIL && !!(googleIdToken || s.token || (s.browserApproved && s.browserKey));
  }

  async function sendRow(index) {
    const row = rows[index];
    if (!row) return;
    if (!requireAuthOrAlert()) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      return;
    }
    if (!SHEETS_URL) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      alert("SHEETS_URL puuttuu.");
      return;
    }

    const okKm = await ensureKmForRow(index);
    if (!okKm) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      return;
    }

    row.status = "sending";
    renderTable();
    persist();

    const plate = normalizeVehicle(auto?.value || "");
    if (!plate) {
      row.status = "fail";
      renderTable();
      persist();
      updateStatus();
      alert("Syötä Auto nro ennen tallennusta.");
      return;
    }

    const reportDate = String(pvm?.value || "").trim() || isoDate(new Date());
    const startKmForRow = index < 6 ? String(kmA || aloitusKm?.value || "").trim() : String(kmB || aloitusKm?.value || "").trim();
    const data = row.data || {};
    const rowUid = getOrCreateRowUid(row, index);
    const body = authBody({
      action: "saveLoad",
      rowUid,
      reportId: activeReport?.reportId || data.reportId || "",
      reportNo: activeReport?.reportNo || data.reportNo || "",
      reportDate,
      pvm: reportDate,
      auto: plate,
      vehicle: plate,
      aloitusKm: startKmForRow,
      startKm: startKmForRow,
      kmMark: startKmForRow,
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

    try {
      const parsed = await apiPost(body);
      if (!parsed?.ok) throw new Error(parsed?.error || "save_failed");
      row.data.loadNo = parsed.loadNo || row.data.loadNo || "";
      row.data.reportId = parsed.reportId || row.data.reportId || "";
      row.data.reportNo = parsed.reportNo || row.data.reportNo || "";
      if (loadNoEl && currentIndex === index) loadNoEl.value = String(row.data.loadNo || "");
      activeReport = {
        reportId: parsed.reportId,
        reportNo: parsed.reportNo,
        vehicle: parsed.vehicle || plate,
        reportDate,
        startKm: String(aloitusKm?.value || startKmForRow || "").trim(),
        status: "open",
      };
      row.status = "ok";
    } catch (err) {
      console.warn("Tallennus epäonnistui", err);
      row.status = "fail";
      const msg = String(err?.message || "");
      if (["invalid_token", "missing_auth"].includes(msg)) hardLock("Kirjautuminen vanhentui. Kirjaudu uudelleen.");
    }

    persist();
    renderTable();
    updateStatus();
  }

  async function sendFailedRows() {
    if (!requireAuthOrAlert()) return;
    const failedIdx = rows.map((r, idx) => ({ r, idx })).filter((x) => x.r.status === "fail").map((x) => x.idx);
    if (!failedIdx.length) {
      setStatus("Ei epäonnistuneita rivejä.");
      return;
    }
    setStatus(`Lähetetään ${failedIdx.length} epäonnistunutta...`);
    for (const idx of failedIdx) await sendRow(idx);
    updateStatus("Valmis");
  }

  async function finishReport() {
    if (!requireAuthOrAlert()) return;
    const filled = rows.filter((r) => r.status !== "empty").length;
    const failCount = rows.filter((r) => r.status === "fail" || r.status === "sending").length;
    if (failCount) {
      alert("Raporttia ei voi päättää ennen kuin kaikki rivit on lähetetty onnistuneesti.");
      return;
    }
    if (!confirm(`Päätetäänkö raportti ja aloitetaan uusi?\n\nTäytettyjä rivejä: ${filled}/${ROWS_COUNT}`)) return;

    const currentKm = String(aloitusKm?.value || lastKm || "").trim();
    const endKm = prompt("Syötä raportin lopetuskilometrit (voit jättää tyhjäksi):", currentKm);
    if (endKm === null) return;

    if (activeReport?.reportId) {
      try {
        const parsed = await apiPost(authBody({ action: "closeReport", reportId: activeReport.reportId, endKm: String(endKm).trim() }));
        if (!(parsed && parsed.ok)) throw new Error(parsed?.error || "close_failed");
      } catch (err) {
        alert("Raportin päättäminen epäonnistui. Raporttia ei nollattu.");
        return;
      }
    }

    const next = prompt("Syötä seuraavan raportin aloituskilometrit (voit jättää tyhjäksi):", String(endKm || "").trim());
    const nextKm = next == null ? "" : String(next).trim();

    rows = createEmptyRows();
    currentIndex = -1;
    kmA = nextKm;
    kmB = "";
    lastKm = nextKm;
    activeReport = null;
    if (aloitusKm) aloitusKm.value = nextKm;
    renderTable();
    persist();
    updateKmUI();
    updateStatus("Uusi raportti aloitettu");
    maybeRefreshOpenReport(false);
  }

  function initDriverSelect() {
    if (!kuljettaja) return;
    kuljettaja.innerHTML = "";
    const savedDrivers = loadDriverList();
    [...DEFAULT_DRIVERS, ...savedDrivers].forEach((name) => addDriver(name, false));
    addDriver("Lisää uusi…", false);
    const preferred = lastDriver && [...kuljettaja.options].some((o) => o.value === lastDriver) ? lastDriver : DEFAULT_DRIVERS[0];
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
    } catch { items = []; }
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
    } catch { items = []; }
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
      auto: auto?.value || "",
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
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
  }

  function hasLocalWork() { return rows.some((r) => r.status !== "empty"); }
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
  function normalizeVehicle(s) { return String(s || "").trim().toUpperCase().replace(/\s+/g, " "); }
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
