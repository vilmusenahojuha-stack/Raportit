const ALLOWED_EMAIL = "juha.vilmusenaho2026@gmail.com";
const CLIENT_ID = "767469865393-5m24jc369g65fh5d51mcu1moocjd27r9.apps.googleusercontent.com";
const META_SHEET = "_META";
const META_PREFIX_LOADNO = "lastLoadNumber_";
const META_PREFIX_BROWSER = "browser_";
const META_PREFIX_ROW = "row_";

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "").trim();
  if (action === "ping") {
    return json_({ ok: true, ts: new Date().toISOString() });
  }
  return json_({ ok: true, hint: "Use POST to save or register browser." });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const body = JSON.parse(raw || "{}");
    const action = String(body.action || "").trim();

    if (action === "registerBrowser") {
      const idToken = String(body.idToken || "");
      const email = String(body.email || "");
      const browserKey = String(body.browserKey || "").trim();
      if (!idToken || !email || !browserKey) return json_({ ok: false, error: "missing_auth" });

      const ti = verifyIdToken_(idToken);
      if (!ti.ok) return json_({ ok: false, error: ti.error || "invalid_token" });
      if (ti.aud !== CLIENT_ID) return json_({ ok: false, error: "aud_mismatch" });
      if (ti.email !== ALLOWED_EMAIL || email !== ALLOWED_EMAIL) return json_({ ok: false, error: "forbidden_email" });

      setMetaValue_(META_PREFIX_BROWSER + browserKey, email);
      return json_({ ok: true, email: email });
    }

    const auth = resolveAuth_(body);
    if (!auth.ok) return json_({ ok: false, error: auth.error || "missing_auth" });

    const pvm = String(body.pvm || "").trim();
    const auto = sanitizeSheetName_(String(body.auto || "").trim());
    const aloitusKm = String(body.aloitusKm || "").trim();
    if (!pvm) return json_({ ok: false, error: "missing_pvm" });
    if (!auto) return json_({ ok: false, error: "missing_auto" });

    const tabName = targetTabName_(body, auto);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = getOrCreateSheet_(ss, tabName);
    ensureHeaders_(sh);

    const rowUid = String(body.rowUid || "").trim();
    const rowMeta = rowUid ? getRowMeta_(rowUid) : null;
    const suppliedLoadNo = String(body.loadNo || "").trim();
    const loadNo = (rowMeta && rowMeta.loadNo)
      ? String(rowMeta.loadNo)
      : (suppliedLoadNo || String(nextLoadNumber_(auto)));

    const row = [
      loadNo,
      pvm,
      auto,
      aloitusKm,
      String(body.r2 || ""),
      String(body.rahti || ""),
      String(body.lastausPvm || ""),
      String(body.lastausPaikka || ""),
      String(body.purkuPvm || ""),
      String(body.purkuPaikka || ""),
      String(body.kuljettaja || ""),
      String(body.maara || ""),
      String(body.tonnit || ""),
      String(body.tuote || ""),
      new Date(),
      auth.email,
    ];

    let targetSheet = sh;
    let targetRow = 0;
    if (rowMeta && rowMeta.tab && rowMeta.rowNumber) {
      const existingSheet = ss.getSheetByName(String(rowMeta.tab));
      const existingRow = Number(rowMeta.rowNumber) || 0;
      if (existingSheet && existingRow > 1) {
        ensureHeaders_(existingSheet);
        const width = row.length;
        const maxCols = existingSheet.getMaxColumns();
        if (maxCols < width) existingSheet.insertColumnsAfter(maxCols, width - maxCols);

        const shouldMove = String(existingSheet.getName()) !== String(tabName);
        if (shouldMove) {
          targetSheet.appendRow(row);
          targetRow = targetSheet.getLastRow();
          existingSheet.getRange(existingRow, 1, 1, width).clearContent();
        } else {
          existingSheet.getRange(existingRow, 1, 1, width).setValues([row]);
          targetSheet = existingSheet;
          targetRow = existingRow;
        }
      }
    }

    if (!targetRow) {
      targetSheet.appendRow(row);
      targetRow = targetSheet.getLastRow();
    }

    if (rowUid) {
      setRowMeta_(rowUid, {
        loadNo: String(loadNo),
        tab: targetSheet.getName(),
        rowNumber: targetRow,
      });
    }
    return json_({ ok: true, tab: targetSheet.getName(), loadNo: loadNo });
  } catch (err) {
    return json_({ ok: false, error: "exception", message: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function verifyIdToken_(idToken) {
  try {
    const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { ok: false, error: "invalid_token" };
    const data = JSON.parse(res.getContentText() || "{}");
    return { ok: true, aud: data.aud || "", email: data.email || "" };
  } catch (e) {
    return { ok: false, error: "invalid_token" };
  }
}


function resolveAuth_(body) {
  const browserKey = String(body.browserKey || "").trim();
  if (browserKey) {
    const savedEmail = getMetaValue_(META_PREFIX_BROWSER + browserKey);
    if (!savedEmail) return { ok: false, error: "unknown_browser" };
    if (savedEmail !== ALLOWED_EMAIL) return { ok: false, error: "invalid_browser" };
    return { ok: true, email: savedEmail, via: "browser" };
  }

  const idToken = String(body.idToken || "");
  const email = String(body.email || "");
  if (!idToken || !email) return { ok: false, error: "missing_auth" };
  const ti = verifyIdToken_(idToken);
  if (!ti.ok) return { ok: false, error: ti.error || "invalid_token" };
  if (ti.aud !== CLIENT_ID) return { ok: false, error: "aud_mismatch" };
  if (ti.email !== ALLOWED_EMAIL || email !== ALLOWED_EMAIL) return { ok: false, error: "forbidden_email" };
  return { ok: true, email: ti.email, via: "token" };
}

function getMetaValue_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(META_SHEET);
  if (!sh) sh = ss.insertSheet(META_SHEET);
  ensureMetaHeaders_(sh);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || "") === String(key)) return String(values[i][1] || "");
  }
  return "";
}

function setMetaValue_(key, value) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(META_SHEET);
    if (!sh) sh = ss.insertSheet(META_SHEET);
    ensureMetaHeaders_(sh);
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || "") === String(key)) {
        sh.getRange(i + 1, 2).setValue(String(value || ""));
        return;
      }
    }
    sh.appendRow([String(key), String(value || "")]);
  } finally {
    lock.releaseLock();
  }
}

function getRowMeta_(rowUid) {
  const raw = getMetaValue_(META_PREFIX_ROW + String(rowUid || "").trim());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {}
  return { loadNo: String(raw), tab: "", rowNumber: 0 };
}

function setRowMeta_(rowUid, meta) {
  setMetaValue_(META_PREFIX_ROW + String(rowUid || "").trim(), JSON.stringify(meta || {}));
}

function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders_(sh) {
  const headers = [
    "Kuorma #",
    "Päivämäärä",
    "Auto nro",
    "Aloitus km",
    "R2 / Asiakas",
    "Rahtikirja",
    "Lastaus pvm",
    "Lastauspaikka",
    "Purku pvm",
    "Purku paikka",
    "Kuljettaja",
    "Määrä (m³)",
    "Tonnit",
    "Tuote",
    "Tallennettu",
    "Käyttäjä (email)",
  ];
  const lastCol = headers.length;
  const lastRow = sh.getLastRow();

  if (lastRow === 0) {
    sh.getRange(1, 1, 1, lastCol).setValues([headers]);
  } else {
    const firstRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    const matches = headers.every(function (h, i) {
      return String(firstRow[i] || "").trim() === h;
    });
    const isEmpty = firstRow.every(function (v) {
      return String(v || "").trim() === "";
    });

    if (!matches) {
      if (isEmpty) {
        sh.getRange(1, 1, 1, lastCol).setValues([headers]);
      } else {
        sh.insertRowBefore(1);
        sh.getRange(1, 1, 1, lastCol).setValues([headers]);
      }
    }
  }

  sh.getRange(1, 1, 1, lastCol).setFontWeight("bold");
  sh.setFrozenRows(1);
}

function sanitizeSheetName_(s) {
  let x = String(s || "").trim();
  x = x.replace(/[\[\]\:\*\?\/\\]/g, "-");
  x = x.replace(/\s+/g, " ");
  if (x.length > 80) x = x.slice(0, 80);
  return x;
}


function targetTabName_(body, auto) {
  const loadDate = String(body.lastausPvm || "").trim();
  const reportDate = String(body.pvm || "").trim();
  const baseDate = loadDate || reportDate;
  return monthTabName_(baseDate, auto);
}

function monthTabName_(ymd, auto) {
  const d = parseYMD_(ymd);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return yyyy + "-" + mm + "__" + auto;
}

function weekTabName_(ymd, auto) {
  const d = parseYMD_(ymd);
  const w = isoWeek_(d);
  const ww = String(w.week).padStart(2, "0");
  return w.year + "-W" + ww + "__" + auto;
}

function parseYMD_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoWeek_(dateObj) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

function nextLoadNumber_(plate) {
  const p = sanitizeSheetName_(String(plate || "").trim());
  if (!p) throw new Error("missing_plate");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(META_SHEET);
    if (!sh) sh = ss.insertSheet(META_SHEET);
    ensureMetaHeaders_(sh);

    const key = META_PREFIX_LOADNO + p;
    const values = sh.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || "") === key) {
        rowIndex = i + 1;
        break;
      }
    }

    let current = 0;
    if (rowIndex > 0) {
      current = Number(values[rowIndex - 1][1] || 0) || 0;
    } else {
      rowIndex = sh.getLastRow() + 1;
      sh.getRange(rowIndex, 1, 1, 2).setValues([[key, 0]]);
    }

    const next = current + 1;
    sh.getRange(rowIndex, 2).setValue(next);
    return next;
  } finally {
    lock.releaseLock();
  }
}

function ensureMetaHeaders_(sh) {
  const headers = [["key", "value"]];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 2).setValues(headers);
    sh.getRange(1, 1, 1, 2).setFontWeight("bold");
    sh.setFrozenRows(1);
    return;
  }

  const row1 = sh.getRange(1, 1, 1, 2).getValues()[0];
  if (String(row1[0] || "") !== "key" || String(row1[1] || "") !== "value") {
    sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, 2).setValues(headers);
  }
  sh.getRange(1, 1, 1, 2).setFontWeight("bold");
  sh.setFrozenRows(1);
}
