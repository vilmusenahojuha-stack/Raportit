// ===============================
// Google Apps Script URL (Web App /exec)
const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbyfKDZS5YfpGJCpOgUKdH_crgomudKiaRAYSYPZg5VJsNGn3FRlAKgS_amRzupKHHBY6A/exec";
// ===============================

(function () {
  // --------- DOM ----------
  const tbody = document.querySelector("#raportti tbody");
  const statusMsg = document.getElementById("statusMsg");

  const el = (id) => document.getElementById(id);
  const val = (id) => (el(id)?.value || "").trim();

  // Modal
  const modal = el("modal");
  const r2 = el("r2");
  const rahti = el("rahti");
  const lastausPvm = el("lastausPvm");
  const lastausPaikka = el("lastausPaikka");
  const purkuPvm = el("purkuPvm");
  const purkuPaikka = el("purkuPaikka");
  const kuljettaja = el("kuljettaja");
  const maara = el("maara");
  const tonnit = el("tonnit");

  // Header fields
  const pvm = el("pvm");
  const auto = el("auto");
  const aloitusKm = el("aloitusKm");

  // Buttons
  const saveKuormaBtn = el("saveKuormaBtn");
  const closeModalBtn = el("closeModalBtn");
  const syncFailedBtn = el("syncFailedBtn");
  const finishBtn = el("finishBtn");

  // Datalists
  const lastausList = el("lastausList");
  const purkuList = el("purkuList");

  // --------- STATE ----------
  const ROWS_COUNT = 12;
  const LS_KEY = "kr_state_v1";
  const LS_LAST_DRIVER = "kr_last_driver_v1";
  const defaultDrivers = ["Tommi", "Juha", "Janne"];

  let rows = [];
  let currentIndex = -1;
  let lastDriver = localStorage.getItem(LS_LAST_DRIVER) || "";

  // --------- INIT ----------
  init();

  function init() {
    // set today for pvm if empty
    const today = isoDate(new Date());
    if (pvm && !pvm.value) pvm.value = today;

    // load state
    const saved = loadState();
    if (saved && Array.isArray(saved.rows) && saved.rows.length === ROWS_COUNT) {
      rows = saved.rows;
      if (auto && saved.auto != null) auto.value = saved.auto;
      if (aloitusKm && saved.aloitusKm != null) aloitusKm.value = saved.aloitusKm;
      if (pvm && saved.pvm != null) pvm.value = saved.pvm;
    } else {
      rows = createEmptyRows();
    }

    initDriverSelect();
    loadSavedLocations();
    renderTable();
    updateStatus();

    // Events
    tbody?.addEventListener("click", onTableClick);
    saveKuormaBtn && (saveKuormaBtn.onclick = saveKuorma);
    closeModalBtn && (closeModalBtn.onclick = closeModal);
    syncFailedBtn && (syncFailedBtn.onclick = sendFailedRows);
    finishBtn && (finishBtn.onclick = finishReport);

    // Persist header changes too
    [pvm, auto, aloitusKm].forEach((x) => {
      if (!x) return;
      x.addEventListener("change", persist);
      x.addEventListener("input", persist);
    });
  }

  function createEmptyRows() {
    const arr = [];
    for (let i = 0; i < ROWS_COUNT; i++) {
      arr.push({ index: i + 1, status: "empty", data: {} });
    }
    return arr;
  }

  // --------- TABLE ----------
  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.index = String(r.index);

      const d = r.data || {};
      tr.innerHTML = `
        <td>${r.index}</td>
        <td>${escapeHtml(d.r2 || "")}</td>
        <td>${escapeHtml(d.rahti || "")}</td>
        <td>${escapeHtml(d.lastausPvm || "")}</td>
        <td>${escapeHtml(d.lastausPaikka || "")}</td>
        <td>${escapeHtml(d.purkuPvm || "")}</td>
        <td>${escapeHtml(d.purkuPaikka || "")}</td>
        <td>${escapeHtml(d.kuljettaja || "")}</td>
        <td>${escapeHtml(d.maara || "")}</td>
        <td>${escapeHtml(d.tonnit || "")}</td>
        <td class="${statusClass(r.status)}">${statusSymbol(r.status)}</td>
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

  function onTableClick(e) {
    const tr = e.target.closest("tr");
    if (!tr) return;
    currentIndex = parseInt(tr.dataset.index, 10) - 1;
    openModal(rows[currentIndex]);
  }

  // --------- MODAL ----------
  function openModal(row) {
    if (!row) return;

    const d = row.data || {};
    const today = isoDate(new Date());

    r2.value = d.r2 || "";
    rahti.value = d.rahti || "";
    lastausPvm.value = d.lastausPvm || today;
    purkuPvm.value = d.purkuPvm || today;
    lastausPaikka.value = d.lastausPaikka || "";
    purkuPaikka.value = d.purkuPaikka || "";
    kuljettaja.value = d.kuljettaja || lastDriver || "";
    maara.value = d.maara || "";
    tonnit.value = d.tonnit || "";

    modal?.classList.remove("hidden");
  }

  function closeModal() {
    modal?.classList.add("hidden");
  }

  // --------- SAVE ROW ----------
  async function saveKuorma() {
    if (currentIndex < 0 || currentIndex >= rows.length) return;

    // driver add
    let drv = (kuljettaja.value || "").trim();
    if (drv === "Lisää uusi…") {
      const uusi = prompt("Syötä kuljettajan nimi:");
      if (uusi && uusi.trim()) {
        drv = uusi.trim();
        addDriver(drv);
        kuljettaja.value = drv;
      } else {
        return; // cancelled
      }
    }
    lastDriver = drv;
    localStorage.setItem(LS_LAST_DRIVER, lastDriver);

    const d = {
      r2: (r2.value || "").trim(),
      rahti: (rahti.value || "").trim(),
      lastausPvm: (lastausPvm.value || "").trim(),
      lastausPaikka: (lastausPaikka.value || "").trim(),
      purkuPvm: (purkuPvm.value || "").trim(),
      purkuPaikka: (purkuPaikka.value || "").trim(),
      kuljettaja: drv,
      maara: (maara.value || "").trim(),
      tonnit: (tonnit.value || "").trim(),
    };

    // save places for datalist
    saveLocation("lastausList", d.lastausPaikka);
    saveLocation("purkuList", d.purkuPaikka);

    rows[currentIndex].data = d;

    // If row has any content, attempt to send. If all empty, keep empty.
    if (hasAnyContent(d)) {
      await sendRow(currentIndex);
    } else {
      rows[currentIndex].status = "empty";
    }

    closeModal();
    renderTable();
    persist();
    updateStatus();
  }

  function hasAnyContent(d) {
    return Object.values(d).some((v) => String(v || "").trim().length > 0);
  }

  // --------- SEND ----------
  async function sendRow(i) {
    const row = rows[i];
    if (!row) return;

    // Basic URL check
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(SHEETS_URL)) {
      row.status = "fail";
      renderTable();
      persist();
      return;
    }

    row.status = "sending";
    renderTable();

    const header = {
      pvm: (pvm?.value || "").trim(),
      auto: (auto?.value || "").trim(),
      aloitusKm: (aloitusKm?.value || "").trim(),
    };

    const body = Object.assign({}, header, row.data || {});

    try {
      // IMPORTANT: text/plain avoids preflight/CORS issues in many GAS webapps
      const res = await fetch(SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });

      const txt = await res.text();
      console.log("Sheets response:", txt);

      let ok = false;
      try {
        const j = JSON.parse(txt);
        ok = j && j.ok === true;
      } catch {
        ok = (txt || "").trim().toUpperCase() === "OK";
      }

      row.status = res.ok && ok ? "ok" : "fail";
    } catch (err) {
      console.log("Fetch error:", err);
      row.status = "fail";
    }

    persist();
    renderTable();
    updateStatus();
  }

  async function sendFailedRows() {
    const failedIdx = rows
      .map((r, idx) => ({ r, idx }))
      .filter((x) => x.r.status === "fail")
      .map((x) => x.idx);

    if (failedIdx.length === 0) {
      setStatus("Ei epäonnistuneita lähetettäviä rivejä.");
      return;
    }

    setStatus(`Lähetetään ${failedIdx.length} epäonnistunutta...`);
    for (const idx of failedIdx) {
      await sendRow(idx);
    }
    setStatus("Yritetty lähettää epäonnistuneet.");
  }

  // --------- REPORT ----------
  function finishReport() {
    const filled = rows.filter((r) => r.status !== "empty").length;
    if (!confirm(`Päätetäänkö raportti ja aloitetaan uusi?\n\nTäytettyjä rivejä: ${filled}/${ROWS_COUNT}`))
      return;

    rows = createEmptyRows();
    currentIndex = -1;

    // keep header fields as-is (or clear if you want)
    renderTable();
    persist();
    updateStatus();
    setStatus("Uusi raportti aloitettu.");
  }

  function updateStatus() {
    const filled = rows.filter((r) => r.status !== "empty").length;
    const okCount = rows.filter((r) => r.status === "ok").length;
    const failCount = rows.filter((r) => r.status === "fail").length;

    let msg = `Täytettyjä rivejä: ${filled}/${ROWS_COUNT}`;
    if (okCount) msg += ` • Lähetetty: ${okCount}`;
    if (failCount) msg += ` • Epäonnistunut: ${failCount} (paina “Lähetä epäonnistuneet”)`;

    setStatus(msg);
  }

  function setStatus(text) {
    if (statusMsg) statusMsg.textContent = text;
  }

  // --------- DRIVERS ----------
  function initDriverSelect() {
    if (!kuljettaja) return;
    kuljettaja.innerHTML = "";

    defaultDrivers.forEach((d) => addDriver(d));
    addDriver("Lisää uusi…");

    if (lastDriver && [...kuljettaja.options].some((o) => o.value === lastDriver)) {
      kuljettaja.value = lastDriver;
    }
  }

  function addDriver(name) {
    if (!kuljettaja) return;
    if ([...kuljettaja.options].some((o) => o.value === name)) return;

    const opt = document.createElement("option");
    opt.value = opt.textContent = name;

    // keep "Lisää uusi…" last if exists
    const addNewOpt = [...kuljettaja.options].find((o) => o.value === "Lisää uusi…");
    if (addNewOpt) {
      kuljettaja.insertBefore(opt, addNewOpt);
    } else {
      kuljettaja.appendChild(opt);
    }
  }

  // --------- LOCATION MEMORY (localStorage) ----------
  function saveLocation(listId, value) {
    const v = (value || "").trim();
    if (!v) return;

    const key = `kr_${listId}_v1`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (!saved.includes(v)) {
      saved.push(v);
      localStorage.setItem(key, JSON.stringify(saved));
    }
    loadSavedLocations();
  }

  function loadSavedLocations() {
    fillDatalist("lastausList", lastausList);
    fillDatalist("purkuList", purkuList);
  }

  function fillDatalist(listId, listEl) {
    if (!listEl) return;
    const key = `kr_${listId}_v1`;
    const items = JSON.parse(localStorage.getItem(key) || "[]");
    listEl.innerHTML = "";
    items.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      listEl.appendChild(opt);
    });
  }

  // --------- PERSIST ----------
  function persist() {
    const state = {
      pvm: pvm?.value || "",
      auto: auto?.value || "",
      aloitusKm: aloitusKm?.value || "",
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

  // --------- UTILS ----------
  function isoDate(d) {
    return new Date(d).toISOString().slice(0, 10);
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