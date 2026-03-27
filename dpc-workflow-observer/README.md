# DPC Workflow Observer — Chrome Extension

Silently watches which clinical tools you use and when, so we can figure out what to automate.

All data stays in `chrome.storage.local` — nothing leaves your device.

---

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dpc-workflow-observer` folder

The extension icon appears in your toolbar. Pin it for quick access.

### Icons (required to avoid console warnings)

Chrome needs PNG icons. Create three square PNG images and place them at:
- `icons/icon16.png` (16×16)
- `icons/icon48.png` (48×48)
- `icons/icon128.png` (128×128)

Any simple image works during development. You can use a green square as a placeholder.

---

## What it tracks

- Which tab is active and for how long (minimum 4 seconds before logging)
- Which clinical tool is being used (Google Docs, Gmail, Spruce, CPL, Doximity, Envision, Calendly, iPrescribe, etc.)
- Patient name — extracted from Google Doc titles in `LastName.FirstName` format
- Browser focus (pauses tracking when you switch away from Chrome)

Nothing outside recognized tools generates meaningful log entries.

---

## Using it

**Popup** (click the extension icon): Shows what's currently being tracked and today's quick stats.

**Dashboard** (click "View Dashboard"):
- **By Patient** — all activity grouped per patient, which tools were used, for how long
- **Timeline** — chronological view of your day
- Add a **note** to any entry if you want to annotate what you were doing
- **Export CSV** to share or analyze patterns

**Settings** (click "Settings"):
- Add/edit the URLs for CPL and Envision portals (they vary by region — paste the hostname from your browser)
- Adjust the patient name regex if your naming convention is different

---

## Privacy

- All data is stored in `chrome.storage.local` only
- `chrome.storage.sync` is never used (no data goes to Google's sync servers)
- No external servers, no analytics, no third-party code
- Covered under your Google Workspace BAA since it only reads what's already on your screen

---

## After a week or two

Export a CSV or share the dashboard view. Patterns across tools and patients will reveal where the real friction is, and that's what we'll automate next.
