// analyzer.js — Pattern detection + AI analysis
// Loaded via importScripts() in the service worker.
// HIPAA note: patient names are anonymized before leaving the device.

// ---------------------------------------------------------------------------
// Local pattern rules
// These fire without any API key — immediate value on day one.
// ---------------------------------------------------------------------------

const LOCAL_RULES = [
  {
    id: 'lab_chart_gap',
    title: 'Lab ordering → manual chart update',
    description: 'You visit the CPL portal then switch to a patient\'s chart shortly after. ' +
                 'Each time you\'re probably typing "labs ordered" manually into the doc.',
    benefit: 'Saves ~3–5 min per lab order. A sidebar in the patient\'s chart lets you log ordered tests in two clicks — no switching, no typing.',
    complexity: 'low',
    automationType: 'lab_tracker',
    icon: '🔬',
    detect(sequences) {
      return sequences.filter(s =>
        s.some(e => e.tool?.category === 'labs') &&
        s.some(e => e.tool?.category === 'chart')
      ).length >= 3;
    },
  },
  {
    id: 'referral_no_log',
    title: 'Referral sent — no chart record',
    description: 'After Doximity fax sessions you open the patient\'s chart. ' +
                 'The referral likely isn\'t logged in a searchable way, so you have to reconstruct it later.',
    benefit: 'Saves ~2–3 min per referral + eliminates the "did I fax that?" moment. One-click referral log that stamps the patient\'s doc and adds a row to a tracking sheet.',
    complexity: 'low',
    automationType: 'referral_tracker',
    icon: '📬',
    detect(sequences) {
      return sequences.filter(s =>
        s.some(e => e.tool?.category === 'fax') &&
        s.some(e => e.tool?.category === 'chart')
      ).length >= 2;
    },
  },
  {
    id: 'message_to_chart',
    title: 'Message received → chart not updated',
    description: 'You check Gmail or Spruce then open the patient\'s chart. ' +
                 'Whatever came in — a lab result reply, a symptom update — isn\'t automatically captured.',
    benefit: 'A quick-capture button lets you paste or summarize the message directly into the patient\'s active summary in one action.',
    complexity: 'low',
    automationType: 'quick_encounter_note',
    icon: '💬',
    detect(sequences) {
      return sequences.filter(s =>
        s.some(e => e.tool?.category === 'communication') &&
        s.some(e => e.tool?.category === 'chart')
      ).length >= 4;
    },
  },
  {
    id: 'multi_tool_lookup',
    title: 'Piecing together patient context from multiple tabs',
    description: 'You open 3+ different tools for the same patient in a short window. ' +
                 'That\'s the "what\'s going on with this patient?" tax — reconstructing context before you can respond.',
    benefit: 'A patient quick-view panel shows the last chart note, pending items, and recent activity in one place — no tab-hunting.',
    complexity: 'medium',
    automationType: 'active_summary_updater',
    icon: '🗂️',
    detect(sequences) {
      return sequences.filter(s => {
        const tools = new Set(s.map(e => e.tool?.name).filter(Boolean));
        return tools.size >= 3;
      }).length >= 3;
    },
  },
  {
    id: 'calendly_no_prep',
    title: 'Appointment scheduled — no chart prep',
    description: 'Calendly sessions aren\'t followed by chart activity. ' +
                 'When the appointment arrives, you\'re likely pulling up the chart cold.',
    benefit: 'Auto-trigger a chart prep note when an appointment books: pulls up the patient\'s active summary and adds a "scheduled visit" placeholder.',
    complexity: 'medium',
    automationType: 'appointment_prep',
    icon: '📅',
    detect(sequences) {
      return sequences.filter(s =>
        s.some(e => e.tool?.category === 'scheduling')
      ).length >= 3;
    },
  },
  {
    id: 'imaging_order',
    title: 'Imaging orders with no chart trail',
    description: 'You visit the Envision portal but the chart doesn\'t reflect an imaging order was placed.',
    benefit: 'Same as the lab tracker — a one-click "imaging ordered" entry that stamps the chart with what was ordered and when.',
    complexity: 'low',
    automationType: 'lab_tracker',
    icon: '🩻',
    detect(sequences) {
      return sequences.filter(s =>
        s.some(e => e.tool?.category === 'imaging') &&
        s.some(e => e.tool?.category === 'chart')
      ).length >= 2;
    },
  },
];

// ---------------------------------------------------------------------------
// Sequence extraction
// ---------------------------------------------------------------------------

function buildPatientSequences(log) {
  // Group by patient + day, find chains of events within 45 min of each other
  const byPatientDay = {};
  for (const entry of log) {
    if (!entry.patient || !entry.tool) continue;
    const key = `${entry.patient}|${entry.date}`;
    if (!byPatientDay[key]) byPatientDay[key] = [];
    byPatientDay[key].push(entry);
  }

  const sequences = [];
  for (const entries of Object.values(byPatientDay)) {
    const sorted = entries.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    let current = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i].startTime) - new Date(sorted[i-1].endTime || sorted[i-1].startTime);
      if (gap < 45 * 60 * 1000) {
        current.push(sorted[i]);
      } else {
        if (current.length > 0) sequences.push(current);
        current = [sorted[i]];
      }
    }
    if (current.length > 0) sequences.push(current);
  }
  return sequences;
}

function buildWorkflowStats(log) {
  const toolCounts = {};
  const categoryCounts = {};
  let totalDuration = 0;
  const daysActive = new Set();

  for (const e of log) {
    if (e.tool) {
      toolCounts[e.tool.name] = (toolCounts[e.tool.name] || 0) + 1;
      categoryCounts[e.tool.category] = (categoryCounts[e.tool.category] || 0) + 1;
    }
    totalDuration += e.duration || 0;
    if (e.date) daysActive.add(e.date);
  }

  return { toolCounts, categoryCounts, totalDuration, daysActive: daysActive.size };
}

// ---------------------------------------------------------------------------
// Local suggestion matching
// ---------------------------------------------------------------------------

function runLocalRules(log) {
  const sequences = buildPatientSequences(log);
  const found = [];
  for (const rule of LOCAL_RULES) {
    if (rule.detect(sequences)) {
      found.push({
        id: rule.id,
        title: rule.title,
        description: rule.description,
        benefit: rule.benefit,
        complexity: rule.complexity,
        automationType: rule.automationType,
        icon: rule.icon,
        source: 'pattern',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Claude API analysis (optional — richer, more personalized)
// ---------------------------------------------------------------------------

function anonymizeForAI(log) {
  // Replace real patient names with Patient A, Patient B, etc.
  const nameMap = {};
  let counter = 0;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function anonName(raw) {
    if (!raw) return null;
    if (!nameMap[raw]) {
      nameMap[raw] = counter < 26 ? `Patient ${letters[counter]}` : `Patient ${counter + 1}`;
      counter++;
    }
    return nameMap[raw];
  }

  const sequences = buildPatientSequences(log);
  const stats = buildWorkflowStats(log);

  const anonSequences = sequences.map(seq => ({
    patient: anonName(seq[0]?.patient),
    events: seq.map(e => ({
      tool: e.tool?.name || 'Unknown',
      category: e.tool?.category || 'unknown',
      duration: e.duration,
    })),
  }));

  return { sequences: anonSequences, stats, daysOfData: stats.daysActive };
}

async function callClaudeAPI(payload, apiKey) {
  const prompt = `You are a workflow automation expert for a Direct Primary Care (DPC) physician.
DPC is relationship-based primary care where a doctor sees fewer patients and handles care asynchronously — via text, phone, email, not just scheduled visits.

Here is an anonymized summary of this physician's actual workflow over ${payload.daysOfData} days:

TOOL USAGE:
${Object.entries(payload.stats.toolCounts).map(([k,v]) => `  ${k}: ${v} sessions`).join('\n')}

PATIENT CARE SEQUENCES (anonymized — tool chains within 45 min for same patient):
${payload.sequences.slice(0, 40).map(s =>
  `  [${s.patient || 'unknown patient'}]: ${s.events.map(e => e.tool).join(' → ')}`
).join('\n')}

Based on these real patterns, identify the top 3 automation opportunities I haven't already flagged.
Focus on the specific friction in DPC workflows: async care, chart lag, multi-tool lookup, and communication-driven clinical work.

Respond with a JSON array (no markdown, just the raw JSON array) where each item has:
{
  "id": "unique_snake_case_id",
  "title": "short title (under 60 chars)",
  "description": "1-2 sentences: what pattern you observed and why it's friction",
  "benefit": "1-2 sentences: what the automation does and time saved",
  "complexity": "low | medium | high",
  "automationType": "lab_tracker | referral_tracker | quick_encounter_note | active_summary_updater | appointment_prep | custom_script",
  "icon": "single emoji"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parse JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in Claude response');

  const suggestions = JSON.parse(jsonMatch[0]);
  return suggestions.map(s => ({
    ...s,
    source: 'ai',
    createdAt: new Date().toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Main entry point (called from background.js)
// ---------------------------------------------------------------------------

async function runAnalysis(log, apiKey) {
  const localSuggestions = runLocalRules(log);

  if (!apiKey || log.length < 8) {
    return localSuggestions;
  }

  try {
    const payload        = anonymizeForAI(log);
    const aiSuggestions  = await callClaudeAPI(payload, apiKey);

    // Merge: AI suggestions first, then local ones not already covered
    const aiIds = new Set(aiSuggestions.map(s => s.automationType));
    const filteredLocal = localSuggestions.filter(s => !aiIds.has(s.automationType));

    return [...aiSuggestions, ...filteredLocal];
  } catch (err) {
    console.error('[DPC Observer] AI analysis failed, using local rules only:', err.message);
    return localSuggestions;
  }
}
