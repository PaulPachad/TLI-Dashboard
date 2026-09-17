/**
 * TLI Leverage Platform - Google Apps Script Durable Observation Bridge
 *
 * This module sends telemetry from Google Apps Script to the TLI Leverage Platform
 * (https://tli.authoritymag.co) for the Master Dashboard Queue Updater and Friday Marketing Automation.
 *
 * DESIGN PRINCIPLES:
 * 1. Non-Intrusive & Non-Blocking: Every HTTP call is wrapped in try...catch with muteHttpExceptions.
 *    If TLI is unreachable or token is not configured, the script logs a warning and proceeds normally.
 * 2. Zero Business Logic Alteration: Existing spreadsheet movers, Shopify orders, and email dispatches
 *    remain 100% untouched and execute as the sole engine.
 * 3. Unified Authentication: Uses Bearer token am_bridge_* stored in Script Properties.
 */

var TLI_BRIDGE_CONFIG = {
  DEFAULT_BASE_URL: 'https://tli.authoritymag.co',
  PROP_URL_KEY: 'TLI_BRIDGE_URL',
  PROP_TOKEN_KEY: 'TLI_BRIDGE_TOKEN',
  WORKFLOW_MASTER_DASHBOARD: 'MASTER_DASHBOARD_UPDATER',
  WORKFLOW_FRIDAY_MARKETING: 'AUTHORITY_PRESS_MARKETING'
};

/**
 * Retrieves the base URL and bridge token from Script Properties.
 * @return {{baseUrl: string, token: string}|null}
 */
function tliBridgeGetConfig_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty(TLI_BRIDGE_CONFIG.PROP_TOKEN_KEY);
    var baseUrl = props.getProperty(TLI_BRIDGE_CONFIG.PROP_URL_KEY) || TLI_BRIDGE_CONFIG.DEFAULT_BASE_URL;
    baseUrl = baseUrl.replace(/\/+$/, '');

    if (!token) {
      Logger.log('[TLI Bridge] TLI_BRIDGE_TOKEN is not set in Script Properties. Telemetry will be skipped.');
      return null;
    }
    return { baseUrl: baseUrl, token: token.trim() };
  } catch (e) {
    Logger.log('[TLI Bridge] Error accessing Script Properties: ' + e);
    return null;
  }
}

/**
 * Reports the start of an automation run to TLI.
 * @param {string} workflowType - e.g. MASTER_DASHBOARD_UPDATER or AUTHORITY_PRESS_MARKETING
 * @param {string} summary - Brief human-readable summary
 * @param {Object} metadata - Optional extra metrics
 * @return {string|null} The run ID created in TLI, or null
 */
function tliBridgeReportStart_(workflowType, summary, metadata) {
  var config = tliBridgeGetConfig_();
  if (!config) return null;

  try {
    var url = config.baseUrl + '/api/automation/bridge/status';
    var payload = {
      action: 'start_run',
      workflowType: workflowType,
      status: 'RUNNING',
      authStatus: 'OK',
      summary: summary || 'Automation run started',
      metadata: metadata || {}
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + config.token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      var data = JSON.parse(response.getContentText());
      var runId = data.run && data.run.id ? data.run.id : null;
      Logger.log('[TLI Bridge] Run started logged successfully. Run ID: ' + runId);
      return runId;
    } else {
      Logger.log('[TLI Bridge] Start run returned HTTP ' + code + ': ' + response.getContentText());
      return null;
    }
  } catch (e) {
    Logger.log('[TLI Bridge] Failed to report run start: ' + e);
    return null;
  }
}

/**
 * Reports the completion or failure of an automation run.
 * @param {string|null} runId - The run ID returned by tliBridgeReportStart_
 * @param {string} workflowType - Workflow identifier
 * @param {Object} metrics - Metrics dictionary
 * @param {string} summary - Final human-readable summary
 * @param {string} status - SUCCESS, WARNING, or ERROR
 */
function tliBridgeReportComplete_(runId, workflowType, metrics, summary, status) {
  var config = tliBridgeGetConfig_();
  if (!config) return;

  try {
    var url = config.baseUrl + '/api/automation/bridge/status';
    metrics = metrics || {};
    var payload = {
      workflowType: workflowType,
      authStatus: 'OK',
      bridgeStatus: 'CONNECTED',
      run: {
        id: runId || undefined,
        status: status || 'SUCCESS',
        emailsScanned: metrics.portalsScanned || metrics.emailsScanned || 0,
        draftsCreated: metrics.rowsMoved || metrics.liveEmailsSent || metrics.draftsCreated || 0,
        skippedCount: metrics.mockupsWaiting || metrics.skippedCount || 0,
        warningCount: metrics.warningCount || 0,
        errorCount: metrics.errorCount || 0,
        summary: summary || 'Automation run completed',
        metadata: metrics
      }
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + config.token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log('[TLI Bridge] Run complete reported with HTTP ' + response.getResponseCode());
  } catch (e) {
    Logger.log('[TLI Bridge] Failed to report run completion: ' + e);
  }
}

/**
 * Logs an array of detailed item events (moved drafts, live emails sent, shopify syncs).
 * @param {string} workflowType
 * @param {Array<Object>} entries
 */
function tliBridgeReportLogs_(workflowType, entries) {
  if (!entries || !entries.length) return;
  var config = tliBridgeGetConfig_();
  if (!config) return;

  try {
    var url = config.baseUrl + '/api/automation/bridge/run-log';
    var payload = {
      workflowType: workflowType,
      entries: entries
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + config.token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log('[TLI Bridge] Logged ' + entries.length + ' events with HTTP ' + response.getResponseCode());
  } catch (e) {
    Logger.log('[TLI Bridge] Failed to report log entries: ' + e);
  }
}

/**
 * Helper to construct a single log entry object.
 */
function tliBridgeCreateLogEntry_(runId, workflowType, status, recipient, subject, urlOrThread, reason, metadata) {
  return {
    runId: runId || null,
    workflowType: workflowType,
    status: status || 'INFO',
    recipient: recipient ? String(recipient).slice(0, 320) : null,
    subject: subject ? String(subject).slice(0, 500) : null,
    gmailThreadId: urlOrThread ? String(urlOrThread).slice(0, 200) : null,
    matchedUrl: urlOrThread && String(urlOrThread).indexOf('http') === 0 ? String(urlOrThread).slice(0, 1000) : null,
    reason: reason ? String(reason).slice(0, 1000) : null,
    metadata: metadata || {}
  };
}

/**
 * Wrapper for the Master Dashboard Queue Updater.
 * Wrap your call to runPhaseTwoMoveAndDate (or equivalent) with this function.
 *
 * Example trigger setup:
 * Instead of triggering `runPhaseTwoMoveAndDate` directly, trigger `tliRunMasterDashboardWithTelemetry`.
 */
function tliRunMasterDashboardWithTelemetry() {
  var workflow = TLI_BRIDGE_CONFIG.WORKFLOW_MASTER_DASHBOARD;
  var startTime = new Date().getTime();
  var runId = tliBridgeReportStart_(
    workflow,
    'Master Dashboard Updater: Scanning child queue spreadsheets',
    { startedAt: new Date().toISOString() }
  );

  var logEntries = [];
  var metrics = {
    portalsScanned: 0,
    rowsMoved: 0,
    datesAssigned: 0,
    overdueCount: 0,
    errorCount: 0
  };

  try {
    if (typeof runPhaseTwoMoveAndDate === 'function') {
      runPhaseTwoMoveAndDate();
    } else if (typeof mainMoveDraftsAndSchedulePublishDates === 'function') {
      mainMoveDraftsAndSchedulePublishDates();
    } else {
      throw new Error('Neither runPhaseTwoMoveAndDate nor mainMoveDraftsAndSchedulePublishDates was found.');
    }

    var elapsedSec = Math.round((new Date().getTime() - startTime) / 1000);
    var summary = 'Master Dashboard scan finished in ' + elapsedSec + 's.';

    tliBridgeReportComplete_(runId, workflow, metrics, summary, 'SUCCESS');
    if (logEntries.length > 0) {
      tliBridgeReportLogs_(workflow, logEntries);
    }
  } catch (err) {
    Logger.log('[TLI Bridge] Error during Master Dashboard run: ' + err);
    metrics.errorCount = 1;
    var errSummary = 'Master Dashboard error: ' + (err.message || err);
    tliBridgeReportComplete_(runId, workflow, metrics, errSummary, 'ERROR');
    throw err; // Re-throw so standard Apps Script failure monitoring continues to function
  }
}

/**
 * Wrapper for the Friday Marketing Automation.
 * Wrap your call to runFridayAutomation (or runAuthorityPressMarketingAutomationAfterMockups_) with this function.
 *
 * Example trigger setup:
 * Instead of triggering `runFridayAutomation` directly, trigger `tliRunFridayAutomationWithTelemetry`.
 */
function tliRunFridayAutomationWithTelemetry() {
  var workflow = TLI_BRIDGE_CONFIG.WORKFLOW_FRIDAY_MARKETING;
  var startTime = new Date().getTime();
  var runId = tliBridgeReportStart_(
    workflow,
    'Friday Marketing Automation: Starting Red Queue mockup check & email sync',
    { startedAt: new Date().toISOString() }
  );

  var metrics = {
    liveEmailsSent: 0,
    followupsSent: 0,
    mockupsWaiting: 0,
    shopifySynced: 0,
    purchasesSkipped: 0,
    errorCount: 0
  };

  try {
    if (typeof runFridayAutomation === 'function') {
      runFridayAutomation();
    } else if (typeof runAuthorityPressMarketingAutomationAfterMockups_ === 'function') {
      runAuthorityPressMarketingAutomationAfterMockups_();
    } else {
      throw new Error('Neither runFridayAutomation nor runAuthorityPressMarketingAutomationAfterMockups_ was found.');
    }

    var elapsedSec = Math.round((new Date().getTime() - startTime) / 1000);
    var summary = 'Friday Marketing run finished in ' + elapsedSec + 's.';

    tliBridgeReportComplete_(runId, workflow, metrics, summary, 'SUCCESS');
  } catch (err) {
    Logger.log('[TLI Bridge] Error during Friday Automation run: ' + err);
    metrics.errorCount = 1;
    var errSummary = 'Friday Automation error: ' + (err.message || err);
    tliBridgeReportComplete_(runId, workflow, metrics, errSummary, 'ERROR');
    throw err;
  }
}

/**
 * Manual test function to verify connectivity between Apps Script and TLI Leverage Platform.
 * Run this function directly from the Apps Script editor to test your bridge token.
 */
function tliBridgeTestConnection() {
  var config = tliBridgeGetConfig_();
  if (!config) {
    Logger.log('FAILED: TLI_BRIDGE_TOKEN is not configured in Script Properties.');
    return;
  }

  Logger.log('Testing connection to: ' + config.baseUrl);
  try {
    var response = UrlFetchApp.fetch(config.baseUrl + '/api/automation/bridge/status', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + config.token },
      payload: JSON.stringify({
        action: 'heartbeat',
        authStatus: 'OK',
        bridgeStatus: 'CONNECTED'
      }),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var text = response.getContentText();
    if (code === 200) {
      Logger.log('SUCCESS! Connected to TLI Automation Center. Response: ' + text);
    } else {
      Logger.log('FAILED with HTTP ' + code + ': ' + text);
    }
  } catch (e) {
    Logger.log('EXCEPTION during test connection: ' + e);
  }
}
