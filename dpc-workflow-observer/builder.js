// builder.js — Generates actual Google Apps Scripts for each automation type.
// Loaded via importScripts() in the service worker.
// Each function returns { title, language, code, instructions[] }

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

function generateAutomation(automationType, ctx) {
  switch (automationType) {
    case 'lab_tracker':          return buildLabTracker(ctx);
    case 'referral_tracker':     return buildReferralTracker(ctx);
    case 'quick_encounter_note': return buildQuickEncounterNote(ctx);
    case 'active_summary_updater': return buildActiveSummaryUpdater(ctx);
    case 'appointment_prep':     return buildAppointmentPrep(ctx);
    default:                     return buildCustomScript(ctx);
  }
}

// ---------------------------------------------------------------------------
// 1. Lab / Imaging Tracker — sidebar in Google Docs
// ---------------------------------------------------------------------------

function buildLabTracker(_ctx) {
  const code = `
// ============================================================
// DPC Lab & Imaging Tracker — Google Apps Script
// Adds a sidebar to any patient Google Doc so you can log
// ordered tests and mark results received, without leaving the chart.
//
// SETUP: Open a patient's Google Doc → Extensions → Apps Script
//        Paste this code → Save → Run "addLabTrackerMenu" once.
// ============================================================

function onOpen() {
  DocumentApp.getUi()
    .createMenu('DPC Tools')
    .addItem('Log lab/imaging order', 'showLabOrderSidebar')
    .addItem('Mark results received', 'showResultsReceivedSidebar')
    .addToUi();
}

function addLabTrackerMenu() {
  // Run this once to install the menu permanently for this doc.
  onOpen();
}

// --- Sidebar HTML ---

function showLabOrderSidebar() {
  const html = HtmlService.createHtmlOutput(\`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      label { display: block; margin-top: 10px; font-weight: bold; font-size: 12px; color: #444; }
      input, select, textarea { width: 100%; padding: 6px; margin-top: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; box-sizing: border-box; }
      button { margin-top: 14px; width: 100%; padding: 8px; background: #1a6b4a; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
      button:hover { background: #155c3e; }
      .note { font-size: 11px; color: #777; margin-top: 8px; }
    </style>
    <form>
      <label>Type</label>
      <select id="orderType">
        <option value="Labs">Labs (CPL)</option>
        <option value="Imaging">Imaging (Envision)</option>
        <option value="Other">Other</option>
      </select>

      <label>Tests ordered (one per line)</label>
      <textarea id="tests" rows="4" placeholder="TSH\\nCMP\\nCBC"></textarea>

      <label>Reason / clinical question</label>
      <input type="text" id="reason" placeholder="e.g. fatigue workup" />

      <label>Follow-up in</label>
      <select id="followup">
        <option value="">No specific follow-up</option>
        <option value="3 days">3 days</option>
        <option value="1 week">1 week</option>
        <option value="2 weeks">2 weeks</option>
        <option value="1 month">1 month</option>
        <option value="When results back">When results back</option>
      </select>

      <button onclick="submitOrder()">Add to chart</button>
      <p class="note">This inserts a pending entry into the chart document.</p>
    </form>
    <script>
      function submitOrder() {
        const data = {
          orderType: document.getElementById('orderType').value,
          tests: document.getElementById('tests').value,
          reason: document.getElementById('reason').value,
          followup: document.getElementById('followup').value,
        };
        google.script.run.withSuccessHandler(() => {
          document.body.innerHTML = '<p style="color:#1a6b4a;padding:20px;">✓ Added to chart.</p>';
          setTimeout(() => google.script.host.close(), 1500);
        }).insertLabOrder(data);
      }
    </script>
  \`).setTitle('Log Order').setWidth(280);
  DocumentApp.getUi().showSidebar(html);
}

function showResultsReceivedSidebar() {
  const html = HtmlService.createHtmlOutput(\`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      label { display: block; margin-top: 10px; font-weight: bold; font-size: 12px; color: #444; }
      input, select, textarea { width: 100%; padding: 6px; margin-top: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; box-sizing: border-box; }
      button { margin-top: 14px; width: 100%; padding: 8px; background: #1a6b4a; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
    </style>
    <form>
      <label>Results summary</label>
      <textarea id="results" rows="4" placeholder="TSH 2.1 (normal)\\nCMP unremarkable"></textarea>

      <label>Assessment / plan update</label>
      <textarea id="plan" rows="3" placeholder="Continue current management, f/u in 3 months"></textarea>

      <label>Communicated to patient?</label>
      <select id="communicated">
        <option value="Not yet">Not yet</option>
        <option value="Via Spruce">Via Spruce</option>
        <option value="Via phone">Via phone</option>
        <option value="Via email">Via email</option>
        <option value="Reviewed at visit">Reviewed at visit</option>
      </select>

      <button onclick="submitResults()">Add to chart</button>
    </form>
    <script>
      function submitResults() {
        const data = {
          results: document.getElementById('results').value,
          plan: document.getElementById('plan').value,
          communicated: document.getElementById('communicated').value,
        };
        google.script.run.withSuccessHandler(() => {
          document.body.innerHTML = '<p style="color:#1a6b4a;padding:20px;">✓ Results added to chart.</p>';
          setTimeout(() => google.script.host.close(), 1500);
        }).insertLabResults(data);
      }
    </script>
  \`).setTitle('Results Received').setWidth(280);
  DocumentApp.getUi().showSidebar(html);
}

// --- Document manipulation ---

function insertLabOrder(data) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');

  const block = [
    '---',
    \`[\${data.orderType.toUpperCase()} ORDERED — \${date}]\`,
    \`Tests: \${data.tests.replace(/\\n/g, ', ')}\`,
    data.reason   ? \`Reason: \${data.reason}\`   : null,
    data.followup ? \`Follow-up: \${data.followup}\` : null,
    'Status: PENDING',
    '---',
  ].filter(Boolean).join('\\n');

  // Insert after the first paragraph (below any header)
  const para = body.insertParagraph(1, block);
  para.setAttributes({
    [DocumentApp.Attribute.FOREGROUND_COLOR]: '#1a6b4a',
    [DocumentApp.Attribute.FONT_SIZE]: 10,
    [DocumentApp.Attribute.FONT_FAMILY]: 'Courier New',
  });
}

function insertLabResults(data) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');

  const block = [
    '---',
    \`[RESULTS RECEIVED — \${date}]\`,
    data.results,
    \`Plan: \${data.plan}\`,
    \`Patient notified: \${data.communicated}\`,
    '---',
  ].filter(Boolean).join('\\n');

  body.insertParagraph(1, block).setAttributes({
    [DocumentApp.Attribute.FONT_SIZE]: 10,
    [DocumentApp.Attribute.FONT_FAMILY]: 'Courier New',
  });
}
`.trim();

  return {
    title: 'Lab & Imaging Tracker',
    language: 'javascript',
    code,
    instructions: [
      'Open any patient\'s Google Doc',
      'Click Extensions → Apps Script',
      'Delete the default code and paste this script',
      'Click Save (floppy disk icon), name the project "DPC Lab Tracker"',
      'Click Run → select "addLabTrackerMenu" → approve permissions',
      'Reload the Google Doc — a "DPC Tools" menu now appears',
      'To use on all patient docs, deploy as a Google Workspace Add-on (optional, advanced)',
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Referral Tracker — logs to sheet + stamps doc
// ---------------------------------------------------------------------------

function buildReferralTracker(_ctx) {
  const code = `
// ============================================================
// DPC Referral Tracker — Google Apps Script
// Run this from a patient's Google Doc or from a standalone script.
// Logs the referral to a tracking sheet AND stamps the doc.
//
// FIRST TIME: Set TRACKING_SHEET_ID below to your referral tracking
// Google Sheet ID (create a blank sheet first, copy ID from URL).
// ============================================================

const TRACKING_SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';

function onOpen() {
  DocumentApp.getUi()
    .createMenu('DPC Tools')
    .addItem('Log referral sent', 'showReferralSidebar')
    .addItem('Update referral status', 'showReferralUpdateSidebar')
    .addToUi();
}

function showReferralSidebar() {
  const html = HtmlService.createHtmlOutput(\`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      label { display: block; margin-top: 10px; font-weight: bold; font-size: 12px; color: #444; }
      input, select, textarea { width: 100%; padding: 6px; margin-top: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; box-sizing: border-box; }
      button { margin-top: 14px; width: 100%; padding: 8px; background: #1a6b4a; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
    </style>
    <form>
      <label>Specialty / provider</label>
      <input type="text" id="specialty" placeholder="Cardiology — Dr. Smith" />

      <label>Reason for referral</label>
      <textarea id="reason" rows="3" placeholder="Palpitations, rule out arrhythmia"></textarea>

      <label>Sent via</label>
      <select id="method">
        <option>Doximity fax</option>
        <option>Phone</option>
        <option>Direct message</option>
        <option>Patient self-referred</option>
      </select>

      <label>Urgency</label>
      <select id="urgency">
        <option>Routine</option>
        <option>Soon (2–4 weeks)</option>
        <option>Urgent</option>
      </select>

      <label>Follow up with patient in</label>
      <select id="followup">
        <option value="">No specific follow-up</option>
        <option value="2 weeks">2 weeks</option>
        <option value="1 month">1 month</option>
        <option value="When appt confirmed">When appointment confirmed</option>
        <option value="After specialist visit">After specialist visit</option>
      </select>

      <button onclick="submitReferral()">Log referral</button>
    </form>
    <script>
      function submitReferral() {
        const data = {
          specialty: document.getElementById('specialty').value,
          reason:    document.getElementById('reason').value,
          method:    document.getElementById('method').value,
          urgency:   document.getElementById('urgency').value,
          followup:  document.getElementById('followup').value,
        };
        google.script.run.withSuccessHandler(() => {
          document.body.innerHTML = '<p style="color:#1a6b4a;padding:20px;">✓ Referral logged.</p>';
          setTimeout(() => google.script.host.close(), 1500);
        }).logReferral(data);
      }
    </script>
  \`).setTitle('Log Referral').setWidth(290);
  DocumentApp.getUi().showSidebar(html);
}

function logReferral(data) {
  const date        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
  const doc         = DocumentApp.getActiveDocument();
  const patientName = doc.getName(); // "LastName.FirstName" from doc title

  // 1. Stamp the chart doc
  const block = [
    '---',
    \`[REFERRAL SENT — \${date}]\`,
    \`To: \${data.specialty}\`,
    \`Reason: \${data.reason}\`,
    \`Method: \${data.method} | Urgency: \${data.urgency}\`,
    data.followup ? \`Follow-up: \${data.followup}\` : null,
    'Status: PENDING — awaiting appointment',
    '---',
  ].filter(Boolean).join('\\n');

  doc.getBody().insertParagraph(1, block).setAttributes({
    [DocumentApp.Attribute.FONT_SIZE]: 10,
    [DocumentApp.Attribute.FONT_FAMILY]: 'Courier New',
    [DocumentApp.Attribute.FOREGROUND_COLOR]: '#1e40af',
  });

  // 2. Log to tracking sheet
  if (TRACKING_SHEET_ID && TRACKING_SHEET_ID !== 'PASTE_YOUR_SHEET_ID_HERE') {
    const ss    = SpreadsheetApp.openById(TRACKING_SHEET_ID);
    const sheet = ss.getSheetByName('Referrals') || ss.insertSheet('Referrals');

    // Add header row if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'Patient', 'Specialty', 'Reason', 'Method', 'Urgency', 'Follow-up', 'Status']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    }

    sheet.appendRow([date, patientName, data.specialty, data.reason, data.method, data.urgency, data.followup, 'Pending']);
  }
}
`.trim();

  return {
    title: 'Referral Tracker',
    language: 'javascript',
    code,
    instructions: [
      'Create a new Google Sheet for referral tracking — copy its ID from the URL (the long string between /d/ and /edit)',
      'Open a patient\'s Google Doc → Extensions → Apps Script',
      'Paste this script and replace PASTE_YOUR_SHEET_ID_HERE with your sheet ID',
      'Save → Run "onOpen" → approve permissions',
      'Reload the Google Doc — use DPC Tools → Log referral sent',
      'All referrals will appear in your tracking sheet with status "Pending"',
      'Update status manually in the sheet when appointments are confirmed or completed',
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Quick Encounter Note — keyboard-triggered timestamped note block
// ---------------------------------------------------------------------------

function buildQuickEncounterNote(_ctx) {
  const code = `
// ============================================================
// DPC Quick Encounter Note — Google Apps Script
// Inserts a structured, timestamped note block into the patient's
// chart doc in one click. Works from the DPC Tools menu.
// ============================================================

function onOpen() {
  DocumentApp.getUi()
    .createMenu('DPC Tools')
    .addItem('New encounter note', 'showEncounterSidebar')
    .addToUi();
}

function showEncounterSidebar() {
  const html = HtmlService.createHtmlOutput(\`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      label { display: block; margin-top: 10px; font-weight: bold; font-size: 12px; color: #444; }
      input, select, textarea { width: 100%; padding: 6px; margin-top: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; box-sizing: border-box; }
      button { margin-top: 14px; width: 100%; padding: 8px; background: #1a6b4a; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
      .quick-btn { background: #f0f4f1; color: #1a6b4a; border: 1px solid #c3e6d4; margin-top: 6px; font-size: 12px; padding: 6px; }
    </style>

    <label>Encounter type</label>
    <select id="type">
      <option>Text/Spruce message</option>
      <option>Phone call</option>
      <option>In-person visit</option>
      <option>Email</option>
      <option>Portal message</option>
      <option>After-hours contact</option>
    </select>

    <label>Chief complaint / reason</label>
    <input type="text" id="cc" placeholder="e.g. cough x 3 days, asking about refill" />

    <label>Assessment / plan</label>
    <textarea id="ap" rows="4" placeholder="e.g. Likely viral URI. Advised rest, fluids, OTC symptom management. RTC if not improved in 7 days or develops fever."></textarea>

    <label>Follow-up</label>
    <select id="followup">
      <option value="">None needed</option>
      <option value="PRN">PRN — patient will reach out if not improving</option>
      <option value="3 days">Check in 3 days</option>
      <option value="1 week">1 week</option>
      <option value="2 weeks">2 weeks</option>
      <option value="1 month">1 month</option>
    </select>

    <button onclick="submit()">Insert note</button>

    <script>
      function submit() {
        const data = {
          type:     document.getElementById('type').value,
          cc:       document.getElementById('cc').value,
          ap:       document.getElementById('ap').value,
          followup: document.getElementById('followup').value,
        };
        google.script.run.withSuccessHandler(() => {
          document.body.innerHTML = '<p style="color:#1a6b4a;padding:20px;">✓ Note added.</p>';
          setTimeout(() => google.script.host.close(), 1200);
        }).insertEncounterNote(data);
      }
    </script>
  \`).setTitle('Quick Note').setWidth(290);
  DocumentApp.getUi().showSidebar(html);
}

function insertEncounterNote(data) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const dt   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy h:mm a');

  const lines = [
    \`[\${data.type.toUpperCase()} — \${dt}]\`,
    \`CC: \${data.cc}\`,
    \`A/P: \${data.ap}\`,
    data.followup ? \`Follow-up: \${data.followup}\` : null,
  ].filter(Boolean);

  // Insert at top (after any existing header)
  const inserted = body.insertParagraph(1, lines.join('\\n'));
  inserted.setAttributes({
    [DocumentApp.Attribute.FONT_SIZE]: 11,
    [DocumentApp.Attribute.FONT_FAMILY]: 'Arial',
  });
  body.insertParagraph(2, '').setAttributes({ [DocumentApp.Attribute.FONT_SIZE]: 6 });
}
`.trim();

  return {
    title: 'Quick Encounter Note',
    language: 'javascript',
    code,
    instructions: [
      'Open a patient\'s Google Doc → Extensions → Apps Script',
      'Paste this script → Save → Run "onOpen" → approve permissions',
      'Reload the Google Doc — DPC Tools → New encounter note',
      'Fill in the type, complaint, and plan — it inserts a timestamped block at the top',
      'Works for texts, calls, walk-and-talk moments — anything that needs a chart entry',
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. Active Summary Updater — structured top-of-chart section
// ---------------------------------------------------------------------------

function buildActiveSummaryUpdater(_ctx) {
  const code = `
// ============================================================
// DPC Active Summary Updater — Google Apps Script
// Maintains a structured "Active Summary" block at the top of
// each patient's chart doc. Updates problems, pending items,
// and last contact in one sidebar action.
// ============================================================

const SUMMARY_START = '=== ACTIVE SUMMARY ===';
const SUMMARY_END   = '=== END ACTIVE SUMMARY ===';

function onOpen() {
  DocumentApp.getUi()
    .createMenu('DPC Tools')
    .addItem('Update active summary', 'showSummarySidebar')
    .addToUi();
}

function showSummarySidebar() {
  // Read existing summary to pre-populate the form
  const existing = getExistingSummary();

  const html = HtmlService.createHtmlOutput(\`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      label { display: block; margin-top: 12px; font-weight: bold; font-size: 12px; color: #444; }
      textarea, input { width: 100%; padding: 6px; margin-top: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; box-sizing: border-box; font-family: Arial, sans-serif; }
      button { margin-top: 14px; width: 100%; padding: 8px; background: #1a6b4a; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
      .hint { font-size: 10px; color: #999; margin-top: 3px; }
    </style>

    <label>Active problems</label>
    <textarea id="problems" rows="5" placeholder="• HTN — lisinopril 10mg, last BP 138/88 (3/15)&#10;• Hypothyroidism — levothyroxine 75mcg, TSH pending">\${escapeHtml(existing.problems)}</textarea>
    <p class="hint">One problem per line. Include meds and status.</p>

    <label>Pending items</label>
    <textarea id="pending" rows="4" placeholder="• TSH, CMP — ordered 3/20, not back yet&#10;• Cardiology referral — faxed 3/18, awaiting appt">\${escapeHtml(existing.pending)}</textarea>
    <p class="hint">Labs out, referrals awaiting, Rx pending, etc.</p>

    <label>Last contact</label>
    <input type="text" id="lastContact" placeholder="3/25 via Spruce — asked about fatigue" value="\${escapeHtml(existing.lastContact)}" />

    <label>Next step</label>
    <input type="text" id="nextStep" placeholder="F/U TSH when back" value="\${escapeHtml(existing.nextStep)}" />

    <button onclick="submit()">Update summary</button>

    <script>
      function escapeHtml(s) { return s; } // already escaped server-side
      function submit() {
        const data = {
          problems:    document.getElementById('problems').value,
          pending:     document.getElementById('pending').value,
          lastContact: document.getElementById('lastContact').value,
          nextStep:    document.getElementById('nextStep').value,
        };
        google.script.run.withSuccessHandler(() => {
          document.body.innerHTML = '<p style="color:#1a6b4a;padding:20px;">✓ Active summary updated.</p>';
          setTimeout(() => google.script.host.close(), 1200);
        }).updateActiveSummary(data);
      }
    </script>
  \`).setTitle('Active Summary').setWidth(300);
  DocumentApp.getUi().showSidebar(html);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getExistingSummary() {
  const body = DocumentApp.getActiveDocument().getBody();
  const text  = body.getText();
  const start = text.indexOf(SUMMARY_START);
  const end   = text.indexOf(SUMMARY_END);
  if (start === -1 || end === -1) return { problems: '', pending: '', lastContact: '', nextStep: '' };

  const block = text.substring(start + SUMMARY_START.length, end).trim();
  const extract = (label) => {
    const re = new RegExp(label + ':([\\\\s\\\\S]*?)(?=\\\\n[A-Z ]+:|$)', 'i');
    const m  = block.match(re);
    return m ? m[1].trim() : '';
  };

  return {
    problems:    extract('ACTIVE PROBLEMS'),
    pending:     extract('PENDING'),
    lastContact: extract('LAST CONTACT'),
    nextStep:    extract('NEXT STEP'),
  };
}

function updateActiveSummary(data) {
  const doc   = DocumentApp.getActiveDocument();
  const body  = doc.getBody();
  const date  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');

  const newBlock = [
    SUMMARY_START,
    \`Updated: \${date}\`,
    '',
    'ACTIVE PROBLEMS',
    data.problems || '(none documented)',
    '',
    'PENDING',
    data.pending || '(none)',
    '',
    \`LAST CONTACT: \${data.lastContact || '—'}\`,
    \`NEXT STEP: \${data.nextStep || '—'}\`,
    SUMMARY_END,
  ].join('\\n');

  const text  = body.getText();
  const start = text.indexOf(SUMMARY_START);
  const end   = text.indexOf(SUMMARY_END);

  if (start !== -1 && end !== -1) {
    // Replace existing block
    // Find and replace via paragraph iteration
    replaceSummaryBlock(body, newBlock);
  } else {
    // Insert at very top
    const para = body.insertParagraph(0, newBlock);
    para.setAttributes({
      [DocumentApp.Attribute.FONT_SIZE]: 10,
      [DocumentApp.Attribute.FONT_FAMILY]: 'Courier New',
      [DocumentApp.Attribute.FOREGROUND_COLOR]: '#1a6b4a',
    });
    body.insertParagraph(1, '').setAttributes({ [DocumentApp.Attribute.FONT_SIZE]: 6 });
  }
}

function replaceSummaryBlock(body, newBlock) {
  // Walk paragraphs to find and replace the summary section
  const numParas = body.getNumChildren();
  let inSummary = false;
  let startIdx  = -1;
  let endIdx    = -1;

  for (let i = 0; i < numParas; i++) {
    const el = body.getChild(i);
    if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const text = el.asText().getText();
    if (text.includes(SUMMARY_START)) { inSummary = true; startIdx = i; }
    if (text.includes(SUMMARY_END))   { endIdx = i; break; }
  }

  if (startIdx === -1) return;

  // Remove old summary paragraphs (back-to-front)
  for (let i = endIdx; i >= startIdx; i--) {
    body.getChild(i).removeFromParent();
  }

  // Insert new block at startIdx
  const para = body.insertParagraph(startIdx, newBlock);
  para.setAttributes({
    [DocumentApp.Attribute.FONT_SIZE]: 10,
    [DocumentApp.Attribute.FONT_FAMILY]: 'Courier New',
    [DocumentApp.Attribute.FOREGROUND_COLOR]: '#1a6b4a',
  });
}
`.trim();

  return {
    title: 'Active Summary Updater',
    language: 'javascript',
    code,
    instructions: [
      'Open a patient\'s Google Doc → Extensions → Apps Script',
      'Paste this script → Save → Run "onOpen" → approve permissions',
      'Reload the doc — DPC Tools → Update active summary',
      'The sidebar pre-populates with the existing summary if one exists',
      'Update problems, pending items, last contact, and next step',
      'It rewrites the === ACTIVE SUMMARY === block at the top of the doc',
      'Run this at end of any patient interaction to keep context current',
    ],
  };
}

// ---------------------------------------------------------------------------
// 5. Appointment Prep — triggered from a standalone script / Calendly webhook
// ---------------------------------------------------------------------------

function buildAppointmentPrep(_ctx) {
  const code = `
// ============================================================
// DPC Appointment Prep — Google Apps Script
// Run this before a patient visit to pull up their active summary
// and insert a blank visit note template, so you start the appointment
// with context already loaded.
//
// Can be triggered manually or via a time-based trigger set near
// your typical appointment times.
// ============================================================

// Set this to the ID of your "Patients" parent folder in Google Drive
const PATIENTS_FOLDER_ID = 'PASTE_YOUR_PATIENTS_FOLDER_ID_HERE';

function prepForPatient() {
  const ui = SpreadsheetApp.getUi ? SpreadsheetApp.getUi() : DocumentApp.getUi();
  const result = ui.prompt('Appointment Prep', 'Enter patient name (LastName.FirstName):', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;

  const name = result.getResponseText().trim();
  openAndPrepChart(name);
}

function openAndPrepChart(patientName) {
  // Find the patient's folder
  const folder = findPatientFolder(patientName);
  if (!folder) {
    Logger.log('Patient folder not found: ' + patientName);
    return;
  }

  // Find their chart doc
  const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  let chartDoc = null;
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().includes(patientName) || f.getName().toLowerCase().includes('chart')) {
      chartDoc = f;
      break;
    }
  }

  if (!chartDoc) {
    Logger.log('Chart doc not found for: ' + patientName);
    return;
  }

  // Open the doc
  const url = chartDoc.getUrl();
  Logger.log('Opening chart: ' + url);

  // Add a visit prep note to the doc
  const doc   = DocumentApp.openById(chartDoc.getId());
  const body  = doc.getBody();
  const date  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
  const time  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'h:mm a');

  const visitTemplate = [
    \`[VISIT NOTE — \${date} \${time}]\`,
    'Type: In-person visit',
    '',
    'CC: ',
    '',
    'S (Subjective): ',
    '',
    'O (Objective): ',
    '  Vitals: BP ___ HR ___ Wt ___',
    '',
    'A (Assessment): ',
    '',
    'P (Plan): ',
    '',
    'Follow-up: ',
  ].join('\\n');

  body.insertParagraph(1, visitTemplate).setAttributes({
    [DocumentApp.Attribute.FONT_SIZE]: 11,
    [DocumentApp.Attribute.FONT_FAMILY]: 'Arial',
  });
  body.insertParagraph(2, '').setAttributes({ [DocumentApp.Attribute.FONT_SIZE]: 6 });

  doc.saveAndClose();
  Logger.log('Visit template inserted for ' + patientName + '. Open: ' + url);
}

function findPatientFolder(name) {
  const root = DriveApp.getFolderById(PATIENTS_FOLDER_ID);
  const folders = root.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    if (f.getName() === name || f.getName().toLowerCase() === name.toLowerCase()) return f;
  }
  return null;
}

// Optional: Set up a daily trigger to prep charts for today's Calendly appointments
// (requires a Calendly webhook or a sheet where appointments are logged)
function createDailyTrigger() {
  ScriptApp.newTrigger('morningPrepPrompt')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .create();
}
`.trim();

  return {
    title: 'Appointment Prep',
    language: 'javascript',
    code,
    instructions: [
      'Go to script.google.com → New project → paste this code',
      'Set PATIENTS_FOLDER_ID to the ID of your "Patients" folder in Google Drive (from the URL)',
      'Save and run "prepForPatient" — it will prompt for a patient name',
      'It finds their chart, opens it, and inserts a blank visit note at the top',
      'Optional: run "createDailyTrigger" once to get a morning prompt at 7am with appointment prep',
    ],
  };
}

// ---------------------------------------------------------------------------
// Fallback for AI-suggested custom automation types
// ---------------------------------------------------------------------------

function buildCustomScript(_ctx) {
  return {
    title: 'Custom Automation',
    language: 'javascript',
    code: `// This automation type requires custom implementation.
// The suggestion above describes what it should do.
// Share this with your developer or ask the DPC Observer to generate it
// once you have more workflow data.`,
    instructions: [
      'This suggestion was identified by AI based on your workflow patterns.',
      'Use it as a brief to build a custom automation.',
    ],
  };
}
