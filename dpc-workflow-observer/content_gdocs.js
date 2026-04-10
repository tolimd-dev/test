// content_gdocs.js — Google Docs context extractor for DPC Workflow Observer
//
// Runs inside Google Docs pages. Extracts document structure (headings, doc type,
// editing vs. reading state) and reports it to the background service worker.
//
// PHI is stripped here, before anything leaves this script. The background only
// ever receives sanitized structural metadata — no patient names, dates, or content.

(function () {
  'use strict';

  let isEditing    = false;
  let editingTimer = null;
  let lastSentHash = null;
  let keyTimer     = null;

  // -------------------------------------------------------------------------
  // Detect active editing via keystrokes
  // -------------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    // Only count printable keys + common edit keys (not navigation-only)
    if (e.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(e.key)) {
      isEditing = true;
      clearTimeout(editingTimer);
      editingTimer = setTimeout(() => { isEditing = false; }, 5000);
    }
  }, true);

  // -------------------------------------------------------------------------
  // Extract heading list from the document
  // Tries two methods; gracefully returns [] if neither works.
  // -------------------------------------------------------------------------
  function extractHeadings() {
    // Method 1: Document outline/TOC panel (most reliable — visible when outline is open)
    const tocItems = document.querySelectorAll('.docs-toc-item');
    if (tocItems.length > 0) {
      return Array.from(tocItems)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 1 && t.length < 150);
    }

    // Method 2: ARIA heading roles (exposed in some Docs versions)
    const ariaHeadings = document.querySelectorAll('[role="heading"]');
    if (ariaHeadings.length > 0) {
      return Array.from(ariaHeadings)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 1 && t.length < 150);
    }

    return [];
  }

  // -------------------------------------------------------------------------
  // Classify document type from heading text
  // -------------------------------------------------------------------------
  function classifyDocType(headings) {
    const joined = headings.join(' ').toLowerCase();
    if (/\b(subjective|objective|assessment|plan|soap)\b/.test(joined))          return 'soap_note';
    if (/\b(referral|refer to|specialist consult)\b/.test(joined))               return 'referral_letter';
    if (/\b(active problems?|problem list|medications?|allergies|pmh)\b/.test(joined)) return 'chart_summary';
    if (/\b(prior auth|prior authorization)\b/.test(joined))                     return 'prior_auth';
    if (/\b(lab results?|laboratory)\b/.test(joined))                            return 'lab_review';
    if (headings.length > 0)                                                     return 'chart_note';
    return 'unknown';
  }

  // -------------------------------------------------------------------------
  // Strip PHI from heading text before sending to background
  //
  // Uses the document title to identify the patient name (Firstname.Lastname)
  // and removes it. Also strips date, SSN, and phone number patterns.
  // -------------------------------------------------------------------------
  function sanitizeHeadings(headings) {
    const titleEl  = document.querySelector('.docs-title-inner');
    const rawTitle = titleEl ? titleEl.textContent.trim() : '';

    // Patient name pattern used by the extension: Firstname.Lastname
    const nameMatch = rawTitle.match(/\b([A-Z][a-zA-Z'\-]+)\.([A-Z][a-zA-Z'\-]+)\b/);
    const nameParts = nameMatch
      ? [nameMatch[1], nameMatch[2]].filter(p => p.length > 2)
      : [];

    return headings.map(h => {
      let s = h;

      // Remove patient name parts (case-insensitive)
      for (const part of nameParts) {
        s = s.replace(new RegExp(part, 'gi'), '[patient]');
      }

      // Date patterns: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
      s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '[date]');
      s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[date]');

      // SSN-like patterns
      s = s.replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[id]');

      // Phone numbers
      s = s.replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]');

      return s.trim();
    }).filter(Boolean).slice(0, 20);
  }

  // -------------------------------------------------------------------------
  // Build and send sanitized context to the background service worker
  // -------------------------------------------------------------------------
  function sendContext() {
    const rawHeadings  = extractHeadings();
    const safeHeadings = sanitizeHeadings(rawHeadings);
    const docType      = classifyDocType(safeHeadings);

    const context = { headings: safeHeadings, docType, isEditing };

    // Only send when something actually changed (avoids unnecessary traffic)
    const hash = JSON.stringify(context);
    if (hash === lastSentHash) return;
    lastSentHash = hash;

    chrome.runtime.sendMessage({ type: 'GDOCS_CONTEXT', context }).catch(() => {});
  }

  // Initial extraction after the page settles (outline panel may load lazily)
  setTimeout(sendContext, 2500);

  // Periodic refresh so long-running sessions stay current
  setInterval(sendContext, 20000);

  // Also send shortly after any keypress (debounced)
  document.addEventListener('keydown', () => {
    clearTimeout(keyTimer);
    keyTimer = setTimeout(sendContext, 500);
  }, true);

})();
