/************************************************************
 * Authority Operations Center read-only bridge
 *
 * Paste this at the bottom of the existing Apps Script project, then deploy
 * the script as a Web App. Store the shared secret in Script Properties as:
 *
 *   APPS_SCRIPT_AUTOMATION_SECRET
 *
 * The SaaS must set the same value as APPS_SCRIPT_AUTOMATION_SECRET and the
 * Web App URL as APPS_SCRIPT_AUTOMATION_URL.
 *
 * This bridge intentionally exposes only read-only actions:
 * - health_check
 * - get_status
 * - list_clients_summary
 ************************************************************/

const AOC_BRIDGE_VERSION = 'aoc-readonly-v1';
const AOC_SECRET_PROPERTY_NAME = 'APPS_SCRIPT_AUTOMATION_SECRET';
const AOC_MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    aocVerifyRequest_(request);

    if (request.action === 'health_check') {
      return aocJson_({
        ok: true,
        action: request.action,
        requestId: request.requestId,
        scriptName: 'Authority Press Automation',
        version: AOC_BRIDGE_VERSION,
        environment: 'production',
        deployedAt: null
      });
    }

    if (request.action === 'get_status') {
      return aocJson_(Object.assign({
        ok: true,
        action: request.action,
        requestId: request.requestId
      }, aocGetOperationsStatus_()));
    }

    if (request.action === 'list_clients_summary') {
      return aocJson_({
        ok: true,
        action: request.action,
        requestId: request.requestId,
        clients: aocListClientsSummary_()
      });
    }

    return aocJson_({
      ok: false,
      requestId: request.requestId || null,
      code: 'UNKNOWN_ACTION',
      message: 'Unknown read-only operations action.'
    });
  } catch (err) {
    return aocJson_({
      ok: false,
      code: 'BRIDGE_ERROR',
      message: err && err.message ? err.message : String(err)
    });
  }
}

function aocGetOperationsStatus_() {
  const props = PropertiesService.getScriptProperties();
  const report = aocGetReportStatus_(props);
  const pausedUntilMs = Number(props.getProperty(AP_EMAIL_QUOTA_PAUSED_UNTIL_PROPERTY) || 0);
  const liveTrigger = aocTriggerExists_(AP_RED_QUEUE_TRIGGER_FUNCTION);
  const followUpTrigger = aocTriggerExists_(AP_FOLLOW_UP_TRIGGER_FUNCTION);
  const dashboardTrigger = aocTriggerExists_(DASHBOARD_TRIGGER_FUNCTION);
  const errors = [];

  if (pausedUntilMs && pausedUntilMs > Date.now()) {
    errors.push({
      id: 'gmail-quota-paused',
      severity: 'warning',
      category: 'gmail_quota',
      label: 'Gmail quota pause',
      count: 1,
      detail: 'Email queue is paused until ' + new Date(pausedUntilMs).toISOString() + '.'
    });
  }

  if (report.failedLiveEmails > 0) {
    errors.push({
      id: 'failed-live-emails',
      severity: 'warning',
      category: 'invalid_email',
      label: 'Skipped or failed live-link emails',
      count: report.failedLiveEmails,
      detail: 'The latest report includes live-link rows that were skipped or failed.'
    });
  }

  return {
    scriptName: 'Authority Press Automation',
    version: AOC_BRIDGE_VERSION,
    environment: 'production',
    deployedAt: null,
    workflowMode: props.getProperty(AP_DAILY_WORKFLOW_MODE_PROPERTY) || null,
    report: report,
    quota: {
      pausedUntil: pausedUntilMs ? new Date(pausedUntilMs).toISOString() : null,
      remainingDailyQuota: aocGetRemainingDailyQuota_()
    },
    triggers: {
      liveEmailQueue: liveTrigger,
      followUpQueue: followUpTrigger,
      dashboardQueue: dashboardTrigger
    },
    counts: {
      clients: aocListClientsSummary_().length
    },
    errors: errors
  };
}

function aocGetReportStatus_(props) {
  const runId = props.getProperty(AP_MARKETING_REPORT_RUN_ID_PROPERTY);
  const startedAtMs = Number(props.getProperty(AP_MARKETING_REPORT_STARTED_AT_PROPERTY) || 0);
  const rows = runId ? aocGetMarketingReportRowsForRun_(runId) : [];
  const liveRows = rows.filter(function(row) { return row.type === 'LIVE'; });
  const followUpRows = rows.filter(function(row) { return row.type === 'FOLLOW_UP'; });
  const failedLiveRows = rows.filter(function(row) { return row.type === 'FAILED_LIVE'; });

  return {
    active: props.getProperty(AP_MARKETING_REPORT_ACTIVE_PROPERTY) === 'true',
    sent: props.getProperty(AP_MARKETING_REPORT_SENT_PROPERTY) === 'true',
    runId: runId || null,
    recipient: props.getProperty(AP_MARKETING_REPORT_RECIPIENT_PROPERTY) || null,
    startedAt: startedAtMs ? new Date(startedAtMs).toISOString() : null,
    liveEmails: liveRows.length,
    followUps: followUpRows.length,
    failedLiveEmails: failedLiveRows.length,
    totalRows: rows.length
  };
}

function aocGetMarketingReportRowsForRun_(runId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AP_MARKETING_REPORT_SHEET_NAME);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (String(row[0] || '') !== String(runId || '')) continue;

    rows.push({
      sentAt: row[1],
      type: String(row[2] || ''),
      email: String(row[3] || ''),
      firstName: String(row[4] || ''),
      nameCompany: String(row[5] || ''),
      topic: String(row[6] || ''),
      link: String(row[7] || ''),
      subject: String(row[8] || ''),
      masterRow: String(row[9] || ''),
      childRow: String(row[10] || '')
    });
  }

  return rows;
}

function aocListClientsSummary_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = apGetMasterDashboardSheet_(ss);
  const lastRow = masterSheet.getLastRow();
  const clients = [];

  if (lastRow < CONFIG.MASTER_START_ROW) return clients;

  const values = masterSheet
    .getRange(CONFIG.MASTER_START_ROW, 1, lastRow - CONFIG.MASTER_START_ROW + 1, CONFIG.MASTER_URL_COL)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const rowNumber = CONFIG.MASTER_START_ROW + i;
    const row = values[i];
    const sheetUrl = String(row[CONFIG.MASTER_URL_COL - 1] || '');
    const clientName = sheetUrl ? 'Master row ' + rowNumber : 'Unlinked row ' + rowNumber;

    clients.push({
      id: 'master-row-' + rowNumber,
      clientName: clientName,
      masterRow: String(rowNumber),
      managedBy: '',
      dueDate: aocDateToIso_(row[CONFIG.MASTER_DUE_DATE_COL - 1]),
      unpublishedCount: Number(row[CONFIG.MASTER_UNPUBLISHED_COL - 1] || 0),
      lastUpdated: aocDateToIso_(row[CONFIG.MASTER_UPDATED_COL - 1]),
      status: sheetUrl ? 'ready' : 'attention',
      statusLabel: sheetUrl ? 'Linked in master sheet' : 'Missing child sheet URL',
      sheetTitle: null,
      sheetUrl: sheetUrl || null
    });
  }

  return clients;
}

function aocVerifyRequest_(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Request body is required.');
  }
  if (!request.requestId) throw new Error('requestId is required.');
  if (!request.timestamp) throw new Error('timestamp is required.');
  if (!request.action) throw new Error('action is required.');

  const timestamp = new Date(request.timestamp).getTime();
  if (!timestamp || Math.abs(Date.now() - timestamp) > AOC_MAX_TIMESTAMP_SKEW_MS) {
    throw new Error('Request timestamp is stale.');
  }

  const secret = PropertiesService.getScriptProperties().getProperty(AOC_SECRET_PROPERTY_NAME);
  if (!secret) throw new Error('Apps Script automation secret is not configured.');
  if (!request.signature) throw new Error('signature is required.');

  const unsigned = {};
  Object.keys(request).forEach(function(key) {
    if (key !== 'signature') unsigned[key] = request[key];
  });

  const expected = aocHmac_(aocCanonicalJson_(unsigned), secret);
  if (String(expected) !== String(request.signature)) {
    throw new Error('Invalid request signature.');
  }
}

function aocHmac_(text, secret) {
  const bytes = Utilities.computeHmacSha256Signature(text, secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function aocCanonicalJson_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(function(item) { return aocCanonicalJson_(item); }).join(',') + ']';
  }
  return '{' + Object.keys(value).sort().map(function(key) {
    return JSON.stringify(key) + ':' + aocCanonicalJson_(value[key]);
  }).join(',') + '}';
}

function aocTriggerExists_(handlerName) {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handlerName) return true;
  }
  return false;
}

function aocGetRemainingDailyQuota_() {
  try {
    return MailApp.getRemainingDailyQuota();
  } catch (err) {
    return null;
  }
}

function aocDateToIso_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function aocJson_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
