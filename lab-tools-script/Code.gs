// Code.gs — Lab Tools for DPC patient charts
// Paste this entire file into your Apps Script editor (replacing existing code)

var LABS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1ShnFk1VWWF_xxmitcAhGmpKLUnjHJ9HOKZRsUAB1CPM/edit';
var LABS_SHEET_NAME = 'Mila Labs';

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  DocumentApp.getUi().createMenu('Lab Tools')
    .addItem('Open Lab Picker', 'openLabPicker')
    .addSeparator()
    .addItem('Check for Labs', 'checkForLabs')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Lab Picker sidebar
// ---------------------------------------------------------------------------

function openLabPicker() {
  var html = HtmlService.createHtmlOutputFromFile('LabPicker')
    .setTitle('Lab Picker')
    .setWidth(280);
  DocumentApp.getUi().showSidebar(html);
}

// Called by sidebar to get lab list
function getLabList() {
  try {
    var ss = SpreadsheetApp.openByUrl(LABS_SHEET_URL);
    var sheet = ss.getSheetByName(LABS_SHEET_NAME);
    if (!sheet) throw new Error('Sheet "' + LABS_SHEET_NAME + '" not found');

    var data = sheet.getDataRange().getValues();
    var labs = [];
    for (var i = 1; i < data.length; i++) {  // skip header row
      var name = String(data[i][0] || '').trim();
      var cost = data[i][1] != null && data[i][1] !== '' ? data[i][1] : null;
      var notes = String(data[i][2] || '').trim();
      if (!name) continue;
      labs.push({
        name: name,
        cost: cost !== null ? '$' + Number(cost).toFixed(2) : '',
        notes: notes,
      });
    }
    return labs;
  } catch (e) {
    throw new Error('Could not load labs: ' + e.message);
  }
}

// Called by sidebar when user clicks a lab name — inserts at cursor
function insertLabAtCursor(labName) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();

  if (!cursor) {
    // No cursor (nothing selected/focused) — append to end of last paragraph
    var body = doc.getBody();
    var lastPara = body.getNumChildren() - 1;
    var el = body.getChild(lastPara);
    if (el.getType() === DocumentApp.ElementType.PARAGRAPH) {
      el.asParagraph().appendText(labName);
    } else {
      body.appendParagraph(labName);
    }
    return { inserted: true, method: 'appended' };
  }

  var element = cursor.getElement();
  var offset  = cursor.getOffset();

  // Walk up to find the paragraph text element
  if (element.getType() === DocumentApp.ElementType.TEXT) {
    element.asText().insertText(offset, labName);
  } else if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
    element.asParagraph().editAsText().insertText(offset, labName);
  } else {
    // Fallback: insert a new paragraph after the cursor's parent paragraph
    var parent = element.getParent();
    var parentIndex = doc.getBody().getChildIndex(parent.getParent ? parent.getParent() : parent);
    doc.getBody().insertParagraph(parentIndex + 1, labName);
  }

  return { inserted: true, method: 'cursor' };
}

// ---------------------------------------------------------------------------
// Lab Checker (existing functionality — kept intact)
// ---------------------------------------------------------------------------

function getLabContext(docText, labName) {
  var lowerText = docText.toLowerCase();
  var pos = lowerText.indexOf(labName.toLowerCase());
  if (pos === -1) return '';
  var start = pos;
  while (start > 0 && docText[start-1] !== '\n' && docText[start-1] !== '.' && (pos-start) < 200) start--;
  var end = pos + labName.length;
  while (end < docText.length && docText[end] !== '\n' && docText[end] !== '.' && (end-pos) < 200) end++;
  var context = docText.substring(start, end).trim();
  return context.length > 160 ? context.substring(0, 160) + '\u2026' : context;
}

function getCheckStatus(context) {
  var lower = context.toLowerCase();
  var orderWords = ['order', 'check', 'need', 'recheck', 'draw', 'send', 'obtain', 'repeat', 'follow up', 'follow-up', 'consider', 'due', 'get '];
  var doneWords  = [' had ', 'done', 'last ', 'previous', 'prior', 'completed', 'result', 'showed', ' was ', ' were ', 'came back', 'returned', 'reviewed'];
  var hasOrder = orderWords.some(function(w) { return lower.indexOf(w) !== -1; });
  var hasDone  = doneWords.some(function(w)  { return lower.indexOf(w) !== -1; });
  if (hasDone && !hasOrder) return 'historical';
  if (hasOrder) return 'needs-ordering';
  return 'unclear';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function checkForLabs() {
  var doc  = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var text = body.getText();

  var ss    = SpreadsheetApp.openByUrl(LABS_SHEET_URL);
  var sheet = ss.getSheetByName(LABS_SHEET_NAME);
  var data  = sheet.getDataRange().getValues();

  var found = [];
  for (var i = 1; i < data.length; i++) {
    var labName = String(data[i][0] || '').trim();
    var cost    = data[i][1];
    var notes   = String(data[i][2] || '').trim();
    var code    = String(data[i][3] || '').trim();
    if (!labName) continue;

    var escaped = labName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re      = new RegExp('\\b' + escaped + '\\b', 'i');
    if (re.test(text)) {
      var context = getLabContext(text, labName);
      var status  = getCheckStatus(context);
      found.push({
        name:    labName,
        cost:    cost,
        notes:   notes,
        code:    code,
        context: context,
        status:  status,
      });
    }
  }

  if (found.length === 0) {
    DocumentApp.getUi().alert('No labs from your spreadsheet were found in this note.\n\nTip: Use Lab Picker (Lab Tools → Open Lab Picker) to insert exact lab names while writing.');
    return;
  }

  var rows = found.map(function(lab) {
    var statusBadge = '';
    var checked = '';
    if (lab.status === 'needs-ordering') {
      statusBadge = '<span class="badge badge-order">needs ordering</span>';
      checked = 'checked';
    } else if (lab.status === 'historical') {
      statusBadge = '<span class="badge badge-done">historical</span>';
    } else {
      statusBadge = '<span class="badge badge-unclear">unclear</span>';
    }

    var costStr  = (lab.cost !== '' && lab.cost != null) ? '$' + Number(lab.cost).toFixed(2) : '';
    var notesStr = lab.notes ? '<span class="lab-notes">' + escHtml(lab.notes) + '</span>' : '';
    var codeStr  = lab.code  ? '<span class="lab-code">'  + escHtml(lab.code)  + '</span>' : '';
    var ctx      = lab.context ? '<div class="context">\u201c' + escHtml(lab.context) + '\u201d</div>' : '';

    return '<tr>' +
      '<td><input type="checkbox" name="lab" value="' + escHtml(lab.name) + '" data-cost="' + escHtml(String(lab.cost||'')) + '" ' + checked + '></td>' +
      '<td>' + escHtml(lab.name) + ' ' + notesStr + ' ' + codeStr + '</td>' +
      '<td class="cost">' + costStr + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '</tr>' +
      '<tr><td colspan="4">' + ctx + '</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;margin:0;padding:16px;background:#f8f9fa;color:#212529}' +
    'h2{margin:0 0 12px;font-size:15px}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;padding:5px 8px;border-bottom:2px solid #e5e7eb;text-align:left}' +
    'td{padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top}' +
    'tr:nth-child(4n+3) td{background:#fafafa}' +
    '.cost{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600}' +
    '.badge-order{background:#fef3c7;color:#92400e}' +
    '.badge-done{background:#d1fae5;color:#065f46}' +
    '.badge-unclear{background:#f3f4f6;color:#6b7280}' +
    '.lab-notes{font-size:11px;color:#9ca3af;margin-left:4px}' +
    '.lab-code{font-size:11px;color:#a78bfa;margin-left:4px}' +
    '.context{font-size:11px;color:#6b7280;padding:2px 0 6px 24px;font-style:italic}' +
    '#total{font-weight:700;padding:10px 8px;font-size:14px}' +
    '.btn{padding:8px 20px;border-radius:5px;font-size:13px;cursor:pointer;border:none;margin-top:14px}' +
    '.btn-primary{background:#1a6b4a;color:#fff}.btn-primary:hover{background:#155c3e}' +
    '.btn-cancel{background:#f3f4f6;color:#374151;margin-left:8px}.btn-cancel:hover{background:#e5e7eb}' +
    '</style></head><body>' +
    '<h2>Labs found in note</h2>' +
    '<table><thead><tr><th></th><th>Lab</th><th>Cost</th><th>Status</th></tr></thead>' +
    '<tbody id="tbody">' + rows + '</tbody>' +
    '<tfoot><tr><td colspan="3" id="total"></td><td></td></tr></tfoot>' +
    '</table>' +
    '<button class="btn btn-primary" onclick="submit()">Generate Quote</button>' +
    '<button class="btn btn-cancel" onclick="google.script.host.close()">Cancel</button>' +
    '<script>' +
    'function updateTotal(){var cbs=document.querySelectorAll("input[type=checkbox]:checked");var t=0;cbs.forEach(function(c){var v=parseFloat(c.dataset.cost);if(!isNaN(v))t+=v;});document.getElementById("total").textContent=cbs.length+" selected — $"+t.toFixed(2);}' +
    'document.querySelectorAll("input[type=checkbox]").forEach(function(c){c.addEventListener("change",updateTotal);});' +
    'updateTotal();' +
    'function submit(){var sel=[];document.querySelectorAll("input[type=checkbox]:checked").forEach(function(c){sel.push(c.value);});if(!sel.length){alert("Select at least one lab.");return;}google.script.run.withSuccessHandler(function(url){google.script.host.close();}).processSelectedLabs(sel);}' +
    '<\/script></body></html>';

  var ui = HtmlService.createHtmlOutput(html).setWidth(620).setHeight(480);
  DocumentApp.getUi().showModalDialog(ui, 'Lab Quote');
}

function processSelectedLabs(selectedLabNames) {
  var doc      = DocumentApp.getActiveDocument();
  var docTitle = doc.getName();

  var ss    = SpreadsheetApp.openByUrl(LABS_SHEET_URL);
  var sheet = ss.getSheetByName(LABS_SHEET_NAME);
  var data  = sheet.getDataRange().getValues();

  var labMap = {};
  for (var i = 1; i < data.length; i++) {
    var n = String(data[i][0] || '').trim();
    if (n) labMap[n.toLowerCase()] = { name: n, cost: data[i][1], notes: String(data[i][2]||'').trim(), code: String(data[i][3]||'').trim() };
  }

  var rows = selectedLabNames.map(function(name) {
    var lab = labMap[name.toLowerCase()] || { name: name, cost: '', notes: '', code: '' };
    return [lab.name, lab.cost !== '' && lab.cost != null ? Number(lab.cost) : '', lab.notes, lab.code];
  });

  var total = rows.reduce(function(sum, r) { return sum + (typeof r[1] === 'number' ? r[1] : 0); }, 0);

  // Create standalone quote spreadsheet
  var dateStr   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var quoteName = 'Lab Quote — ' + docTitle + ' — ' + dateStr;
  var newSS     = SpreadsheetApp.create(quoteName);
  var newSheet  = newSS.getActiveSheet();
  newSheet.setName('Quote');

  // Header
  newSheet.appendRow(['Lab', 'Cost', 'Notes', 'Code']);
  var headerRange = newSheet.getRange(1, 1, 1, 4);
  headerRange.setBackground('#1a6b4a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');

  // Data rows
  rows.forEach(function(row, idx) {
    newSheet.appendRow(row);
    if (idx % 2 === 1) newSheet.getRange(idx + 2, 1, 1, 4).setBackground('#f0f4f1');
  });

  // Total row
  newSheet.appendRow(['TOTAL', total, '', '']);
  var totalRow = newSheet.getRange(rows.length + 2, 1, 1, 4);
  totalRow.setFontWeight('bold');
  totalRow.setBackground('#e8f0eb');

  // Format cost column
  newSheet.getRange(2, 2, rows.length + 1, 1).setNumberFormat('$#,##0.00');
  newSheet.autoResizeColumns(1, 4);

  // Log to master sheet "Lab quote" tab
  try {
    var logSheet = ss.getSheetByName('Lab quote');
    if (!logSheet) logSheet = ss.insertSheet('Lab quote');
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(['Date', 'Patient', 'Lab', 'Cost', 'Notes', 'Code']);
    }
    rows.forEach(function(row) {
      logSheet.appendRow([dateStr, docTitle, row[0], row[1], row[2], row[3]]);
    });
  } catch (e) {
    // Non-fatal — quote was already created
  }

  return newSS.getUrl();
}
