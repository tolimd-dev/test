// Code.gs — Lab Tools for DPC patient charts
// Paste this entire file into your Apps Script editor (replacing existing code)

var LABS_SHEET_URL  = 'https://docs.google.com/spreadsheets/d/1ShnFk1VWWF_xxmitcAhGmpKLUnjHJ9HOKZRsUAB1CPM/edit';
var LABS_SHEET_NAME = 'Mila Labs';
var HIGHLIGHT_COLOR = '#fff9c4';  // soft yellow used for in-doc highlights

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  DocumentApp.getUi().createMenu('Lab Tools')
    .addItem('Open Lab Assistant', 'openLabSidebar')
    .addSeparator()
    .addItem('Clear Highlights', 'clearAllHighlights')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Lab Assistant sidebar (ambient, auto-scanning)
// ---------------------------------------------------------------------------

function openLabSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('LabSidebar')
    .setTitle('Lab Assistant')
    .setWidth(300);
  DocumentApp.getUi().showSidebar(html);
}

// Returns all labs from the spreadsheet
function getLabList() {
  var ss    = SpreadsheetApp.openByUrl(LABS_SHEET_URL);
  var sheet = ss.getSheetByName(LABS_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + LABS_SHEET_NAME + '" not found');
  var data = sheet.getDataRange().getValues();
  var labs = [];
  for (var i = 1; i < data.length; i++) {
    var name  = String(data[i][0] || '').trim();
    var cost  = (data[i][1] !== '' && data[i][1] != null) ? Number(data[i][1]) : null;
    var notes = String(data[i][2] || '').trim();
    var code  = String(data[i][3] || '').trim();
    if (!name) continue;
    labs.push({ name: name, cost: cost, notes: notes, code: code });
  }
  return labs;
}

// Scans document text and returns matched labs with context + status.
// Called by sidebar on load and on each auto-refresh.
function scanDocumentForLabs() {
  var doc  = DocumentApp.getActiveDocument();
  var text = doc.getBody().getText();
  var labs = getLabList();
  var found = [];
  for (var i = 0; i < labs.length; i++) {
    var lab     = labs[i];
    var escaped = lab.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re      = new RegExp('\\b' + escaped + '\\b', 'i');
    if (!re.test(text)) continue;
    var context = _getContext(text, lab.name);
    var status  = _getStatus(context);
    found.push({
      name:    lab.name,
      cost:    lab.cost,
      notes:   lab.notes,
      code:    lab.code,
      context: context,
      status:  status,
    });
  }
  return found;
}

// Highlights labs in the document with soft yellow background.
// labNames is an array of lab name strings.
function highlightLabsInDoc(labNames) {
  var body  = DocumentApp.getActiveDocument().getBody();
  var count = 0;
  for (var i = 0; i < labNames.length; i++) {
    var escaped = labNames[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var result  = body.findText(escaped);
    while (result) {
      result.getElement().asText()
        .setBackgroundColor(result.getStartOffset(), result.getEndOffsetInclusive(), HIGHLIGHT_COLOR);
      count++;
      result = body.findText(escaped, result);
    }
  }
  return count;
}

// Removes yellow highlight from specific lab names.
function clearLabHighlights(labNames) {
  var body = DocumentApp.getActiveDocument().getBody();
  for (var i = 0; i < labNames.length; i++) {
    var escaped = labNames[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var result  = body.findText(escaped);
    while (result) {
      result.getElement().asText()
        .setBackgroundColor(result.getStartOffset(), result.getEndOffsetInclusive(), null);
      result = body.findText(escaped, result);
    }
  }
}

// Clears ALL highlights in document (menu item and sidebar "Clear" button)
function clearAllHighlights() {
  var body  = DocumentApp.getActiveDocument().getBody();
  var text  = body.editAsText();
  // Walk through and remove all background colors we set
  // (removes all background colors from entire document — quick and reliable)
  var fullText = body.getText();
  if (fullText.length > 0) text.setBackgroundColor(0, fullText.length - 1, null);
}

// Inserts a lab name at the current cursor position (for manual picker)
function insertLabAtCursor(labName) {
  var doc    = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();
  if (!cursor) {
    var body = doc.getBody();
    var el   = body.getChild(body.getNumChildren() - 1);
    if (el.getType() === DocumentApp.ElementType.PARAGRAPH) {
      el.asParagraph().appendText(labName);
    } else {
      body.appendParagraph(labName);
    }
    return;
  }
  var element = cursor.getElement();
  var offset  = cursor.getOffset();
  if (element.getType() === DocumentApp.ElementType.TEXT) {
    element.asText().insertText(offset, labName);
  } else if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
    element.asParagraph().editAsText().insertText(offset, labName);
  } else {
    var parent = element.getParent();
    var idx    = doc.getBody().getChildIndex(parent.getParent ? parent.getParent() : parent);
    doc.getBody().insertParagraph(idx + 1, labName);
  }
}

// Generates the quote spreadsheet and logs to master sheet.
// selectedLabNames: array of lab name strings
// Returns the URL of the new quote spreadsheet.
function processSelectedLabs(selectedLabNames) {
  var doc      = DocumentApp.getActiveDocument();
  var docTitle = doc.getName();

  var ss    = SpreadsheetApp.openByUrl(LABS_SHEET_URL);
  var sheet = ss.getSheetByName(LABS_SHEET_NAME);
  var data  = sheet.getDataRange().getValues();

  // Build a lookup map by lowercase lab name
  var labMap = {};
  for (var i = 1; i < data.length; i++) {
    var n = String(data[i][0] || '').trim();
    if (n) labMap[n.toLowerCase()] = {
      name:  n,
      cost:  (data[i][1] !== '' && data[i][1] != null) ? Number(data[i][1]) : null,
      notes: String(data[i][2] || '').trim(),
      code:  String(data[i][3] || '').trim(),
    };
  }

  var rows  = selectedLabNames.map(function(name) {
    var lab = labMap[name.toLowerCase()] || { name: name, cost: null, notes: '', code: '' };
    return [lab.name, lab.cost !== null ? lab.cost : '', lab.notes, lab.code];
  });
  var total = rows.reduce(function(s, r) { return s + (typeof r[1] === 'number' ? r[1] : 0); }, 0);

  // Create standalone quote spreadsheet
  var dateStr   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var quoteName = 'Lab Quote — ' + docTitle + ' — ' + dateStr;
  var newSS     = SpreadsheetApp.create(quoteName);
  var qs        = newSS.getActiveSheet();
  qs.setName('Quote');

  qs.appendRow(['Lab', 'Cost', 'Notes', 'Code']);
  var hdr = qs.getRange(1, 1, 1, 4);
  hdr.setBackground('#1a6b4a');
  hdr.setFontColor('#ffffff');
  hdr.setFontWeight('bold');

  rows.forEach(function(row, idx) {
    qs.appendRow(row);
    if (idx % 2 === 1) qs.getRange(idx + 2, 1, 1, 4).setBackground('#f0f4f1');
  });

  qs.appendRow(['TOTAL', total, '', '']);
  var tr = qs.getRange(rows.length + 2, 1, 1, 4);
  tr.setFontWeight('bold');
  tr.setBackground('#e8f0eb');

  if (rows.length > 0) {
    qs.getRange(2, 2, rows.length + 1, 1).setNumberFormat('$#,##0.00');
  }
  qs.autoResizeColumns(1, 4);

  // Log to "Lab quote" tab in master sheet
  try {
    var log = ss.getSheetByName('Lab quote') || ss.insertSheet('Lab quote');
    if (log.getLastRow() === 0) log.appendRow(['Date', 'Patient', 'Lab', 'Cost', 'Notes', 'Code']);
    rows.forEach(function(r) { log.appendRow([dateStr, docTitle, r[0], r[1], r[2], r[3]]); });
  } catch (e) { /* non-fatal */ }

  return newSS.getUrl();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _getContext(docText, labName) {
  var lower = docText.toLowerCase();
  var pos   = lower.indexOf(labName.toLowerCase());
  if (pos === -1) return '';
  var start = pos;
  while (start > 0 && docText[start-1] !== '\n' && docText[start-1] !== '.' && (pos-start) < 200) start--;
  var end = pos + labName.length;
  while (end < docText.length && docText[end] !== '\n' && docText[end] !== '.' && (end-pos) < 200) end++;
  var ctx = docText.substring(start, end).trim();
  return ctx.length > 180 ? ctx.substring(0, 180) + '\u2026' : ctx;
}

function _getStatus(context) {
  var lower      = context.toLowerCase();
  var orderWords = ['order', 'check', 'need', 'recheck', 'draw', 'send', 'obtain', 'repeat', 'follow up', 'follow-up', 'consider', 'due', 'get '];
  var doneWords  = [' had ', 'done', 'last ', 'previous', 'prior', 'completed', 'result', 'showed', ' was ', ' were ', 'came back', 'returned', 'reviewed'];
  var hasOrder   = orderWords.some(function(w) { return lower.indexOf(w) !== -1; });
  var hasDone    = doneWords.some(function(w)  { return lower.indexOf(w) !== -1; });
  if (hasDone && !hasOrder) return 'historical';
  if (hasOrder) return 'needs-ordering';
  return 'unclear';
}
