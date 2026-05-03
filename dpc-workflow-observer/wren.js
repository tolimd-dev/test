// wren.js — Wren's core logic
// Loaded via importScripts() in the service worker.
//
// Wren is a design + software engineering partner for a DPC physician.
// She watches the workflow silently and speaks when she has something worth saying.
// She never transmits patient names or clinical content to the API —
// only anonymized tool sequences and patterns.

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

const WREN_MODELS = {
  observation: 'gpt-4o-mini',  // background / proactive observations
  chat:        'gpt-4o-mini',   // conversation (upgrade to gpt-4o in options)
};

// ---------------------------------------------------------------------------
// Workflow context builder
// Summarizes what Wren has observed — anonymized before any API call.
// ---------------------------------------------------------------------------

function buildWorkflowContext(log) {
  if (!log || log.length === 0) return null;

  const daysActive  = new Set(log.map(e => e.date).filter(Boolean));
  const toolCounts  = {};
  const catCounts   = {};

  for (const e of log) {
    if (e.tool) {
      toolCounts[e.tool.name] = (toolCounts[e.tool.name] || 0) + 1;
      catCounts[e.tool.category] = (catCounts[e.tool.category] || 0) + 1;
    }
  }

  // Anonymize patients
  const nameMap = {};
  let counter   = 0;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function anonName(raw) {
    if (!raw) return null;
    if (!nameMap[raw]) {
      nameMap[raw] = counter < 26 ? `Patient ${letters[counter]}` : `Patient ${counter + 1}`;
      counter++;
    }
    return nameMap[raw];
  }

  // Build patient activity summaries (anonymized)
  const byPatient = {};
  for (const e of log) {
    if (!e.patient || !e.tool) continue;
    const anon = anonName(e.patient);
    if (!byPatient[anon]) byPatient[anon] = [];
    byPatient[anon].push({ tool: e.tool.name, category: e.tool.category, date: e.date });
  }

  // Find repeated cross-tool sequences per patient
  const sequences = [];
  for (const [anon, events] of Object.entries(byPatient)) {
    const tools = events.map(e => e.tool);
    sequences.push(`${anon}: ${tools.join(' → ')}`);
  }

  // Tool frequency ranking
  const topTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  return {
    daysObserved: daysActive.size,
    totalEvents:  log.length,
    topTools,
    catCounts,
    sequences:    sequences.slice(0, 30),
    patientCount: Object.keys(byPatient).length,
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx) {
  const contextBlock = ctx ? `
WHAT YOU'VE OBSERVED SO FAR (anonymized — no real patient names):
- Days watched: ${ctx.daysObserved}
- Total workflow events: ${ctx.totalEvents}
- Patients touched: ${ctx.patientCount}
- Most-used tools: ${ctx.topTools}
- Tool categories by frequency: ${Object.entries(ctx.catCounts).map(([k,v]) => `${k}: ${v}`).join(', ')}
- Recent patient care sequences:
${ctx.sequences.map(s => `  ${s}`).join('\n')}
` : `
You haven't observed enough workflow data yet to have specific patterns to share.
Introduce yourself briefly and let the doctor know you're watching.
`;

  return `You are Wren — a design and software engineering partner embedded in a DPC physician's workflow.

You have two areas of deep expertise that you bring together:
1. Human-centered design (HCD) — you think about workflow friction, cognitive load, mental models, and what makes tools work for humans rather than against them
2. Software engineering — you know Google Apps Script, Chrome extensions, web APIs, and what's actually buildable in a Google Workspace environment for a solo medical practice

THE PRACTICE:
This is a Direct Primary Care (DPC) clinic — relationship-based, subscription model, fewer patients seen per day than traditional practice, and care happens asynchronously and continuously. A patient might text at 8pm about a symptom. The doctor might order labs while on a walk. Care isn't discrete encounters — it's an ongoing relationship. The chart (Google Docs) is always behind reality because care happens in Spruce, texts, phone calls, Gmail, and the doctor's head.

TOOL STACK:
Google Docs (patient charts), Gmail, Google Drive, Spruce (moving to for messaging), Google Voice (calls/texts), CPL Labs portal (lab orders), Envision (imaging orders), Doximity (faxing), Calendly (scheduling), iPrescribe (prescriptions), Square (billing), Google Sheets (references, lab prices, tracking).
${contextBlock}
YOUR APPROACH:
- You are a colleague and thought partner, not an assistant. You have opinions.
- Ask before you assume. When something seems like a friction point, check your read of it first.
- Design before you build. When there are multiple approaches, discuss the tradeoffs briefly before picking one.
- Be direct. Don't pad responses. If you have an observation, say it plainly.
- Show curiosity about the clinical work. DPC is interesting. The workflow problems are interesting.
- When you suggest an automation, explain both what it does AND why it matters for this specific practice model.
- Know your limits: you can't automate things that require manual clinical judgment. Be clear about that line.
- When you generate code, briefly explain what it does in plain language, then show the code.
- Small is better than complex. A script that takes 2 minutes to deploy and saves 3 minutes per patient per week is more valuable than a complex integration that breaks.

TONE:
Warm, direct, a little curious. Like a friend who happens to know a lot. Not formal. Not sycophantic. You can say "I'm not sure" or "I don't think that's the right approach" or "that's more complex than it needs to be."

Never say "certainly", "of course", "great question", "absolutely", or "I'd be happy to."
Don't use bullet points for everything — sometimes a sentence works better.
Keep responses focused. The doctor is busy.`;
}

// ---------------------------------------------------------------------------
// OpenAI API helper
// ---------------------------------------------------------------------------

async function callOpenAI(apiKey, model, systemPrompt, messages, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from API');
  return text;
}

// ---------------------------------------------------------------------------
// Proactive observation generator
// Called after a session ends — Wren decides if she has something worth saying.
// ---------------------------------------------------------------------------

async function generateProactiveObservation(log, apiKey, model) {
  const ctx = buildWorkflowContext(log);
  if (!ctx || ctx.daysObserved < 1 || ctx.totalEvents < 6) return null;

  const prompt = `Based on what you've observed, do you have one specific, concrete observation worth surfacing to the doctor right now?

Rules:
- Only say something if you genuinely see a pattern worth discussing
- Be specific — name the tools and the sequence you observed
- One observation only — not a list
- Keep it to 2-3 sentences max
- Frame it as an observation, not a solution — you're opening a conversation
- If you don't have anything concrete yet, respond with exactly: NOTHING_YET

Examples of good observations:
"I've noticed you go to CPL and then back to a patient's chart about 3 times a day — usually within 20 minutes of each other. I'm guessing you're ordering labs and then noting it manually. Worth talking about."
"You've opened Doximity twice this week and then immediately gone to the same patient's chart both times. That referral → chart update loop might be worth automating."

If you don't have a clear specific pattern yet: NOTHING_YET`;

  try {
    const text = await callOpenAI(
      apiKey,
      model || WREN_MODELS.observation,
      buildSystemPrompt(ctx),
      [{ role: 'user', content: prompt }],
      200
    );
    if (!text || text === 'NOTHING_YET') return null;
    return text;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat message sender
// ---------------------------------------------------------------------------

async function sendWrenMessage(userMessage, conversationHistory, log, apiKey, model) {
  const ctx    = buildWorkflowContext(log);
  const system = buildSystemPrompt(ctx);

  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  return callOpenAI(apiKey, model || WREN_MODELS.chat, system, messages, 1024);
}

// ---------------------------------------------------------------------------
// First-contact message
// Called when the user opens the Wren chat for the very first time.
// ---------------------------------------------------------------------------

async function generateFirstContactMessage(log, apiKey, model) {
  const ctx = buildWorkflowContext(log);

  const prompt = ctx && ctx.totalEvents >= 4
    ? `The doctor is opening your chat for the first time. You've been watching their workflow for ${ctx.daysObserved} day(s) and have seen ${ctx.totalEvents} events across ${ctx.patientCount} patients. Introduce yourself briefly — 2-3 sentences max — and share one specific thing you've noticed so far. Make it feel like you've been paying attention, not like a generic welcome message.`
    : `The doctor is opening your chat for the first time. You haven't seen much workflow data yet — just introduce yourself in 2-3 sentences. Tell them what you are, that you're watching, and that you'll reach out when you have something worth saying. Keep it short.`;

  try {
    return await callOpenAI(
      apiKey,
      model || WREN_MODELS.chat,
      buildSystemPrompt(ctx),
      [{ role: 'user', content: prompt }],
      200
    );
  } catch {
    return null;
  }
}
