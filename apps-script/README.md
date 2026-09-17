# TLI Leverage Platform - Google Apps Script Observation Bridge

This directory contains the drop-in Google Apps Script telemetry bridge for the Authority Magazine Master Dashboard and Friday Marketing Automation.

## Overview
- Sole Execution Engine: Google Apps Script continues to execute all spreadsheet moves, Shopify orders, and email dispatches.
- Observation Only: `TLI_Bridge.gs` reports run start, progress metrics, draft logs, and completion status to the TLI Leverage Platform (`/admin/automation`).
- Fail-Safe & Non-Blocking: All HTTP network calls are wrapped in safe `try...catch` blocks with `muteHttpExceptions: true`. If TLI is unreachable or tokens are missing, your automations run completely uninterrupted.

## Setup Instructions

### Step 1: Obtain your Bridge Token
1. In Authority Central admin, click the **Automation Center** link in the navigation (or go to `https://tli.authoritymag.co/admin/automation`).
2. Go to the **Mailboxes & Controls** tab.
3. Locate **Friday Marketing Automation** (or **Master Dashboard Queue Updater**).
4. Click **Rotate Token**. Copy the generated Bearer token (starts with `am_bridge_...`).

### Step 2: Add Token to Google Apps Script Properties
1. Open the Google Apps Script project: [Friday & Master Dashboard Script](https://script.google.com/u/0/home/projects/1FDuqq-d8B0DCMgpRjD2hv2SWAJr3ndZe9lO2QQYFOZwqibdpm6v_2K8d/edit).
2. Click the gear icon (**Project Settings**) in the left sidebar.
3. Scroll down to **Script Properties** and click **Add script property**:
   - **Property**: `TLI_BRIDGE_TOKEN`
   - **Value**: *(Paste the bridge token copied from Step 1)*
4. (Optional) If testing against an alternate URL:
   - **Property**: `TLI_BRIDGE_URL`
   - **Value**: `https://tli.authoritymag.co`
5. Click **Save script properties**.

### Step 3: Add `TLI_Bridge.gs` to the Project
1. In the Apps Script editor, click the **+** icon next to **Files** and select **Script**.
2. Name the file: `TLI_Bridge`.
3. Copy the entire contents of `apps-script/TLI_Bridge.gs` and paste it into the editor.
4. Click the Save icon (or press `Ctrl+S`).

### Step 4: Verify the Connection
1. In the Apps Script toolbar function dropdown, select `tliBridgeTestConnection`.
2. Click **Run**.
3. Check the Execution Log:
   You should see: `SUCCESS! Connected to TLI Automation Center.`
4. In the TLI Automation Center (`/admin/automation`), the mailbox status will update to **CONNECTED** with an updated heartbeat timestamp!

### Step 5: Activate Telemetry for Scheduled Runs
You have two easy options:

#### Option A: Trigger the Telemetry Wrappers directly (Recommended)
In the Apps Script **Triggers** dashboard:
- Change the recurring Master Dashboard trigger (every 10 or 15 mins) to run `tliRunMasterDashboardWithTelemetry` instead of `runPhaseTwoMoveAndDate`.
- Change the Friday morning trigger to run `tliRunFridayAutomationWithTelemetry` instead of `runFridayAutomation`.

#### Option B: Inline Hook
Inside your existing `runFridayAutomation` function, you can optionally invoke `tliBridgeReportStart_` and `tliBridgeReportComplete_` directly.
