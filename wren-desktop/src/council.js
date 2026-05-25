'use strict';

const OpenAI = require('openai');

// ── Wren council definitions ───────────────────────────────────────────────

const WRENS = {
  coordinator: {
    name: 'Coordinator',
    color: '#6366f1',
    system: `You are the Wren Coordinator. Your job is to read the doctor's message and decide which council member should respond.

The council:
- designer: Human-centered design, workflow friction, proactive observations about patterns
- builder: Software engineering, code generation, scripts — always asks before building
- compliance: HIPAA, BAAs, documentation, audit trails
- security: PHI flow, data exposure, access control

Reply with ONLY a JSON object: { "route": "<member>", "reason": "<one sentence>" }
If the question touches multiple domains, pick the most relevant one for now.
Default to "designer" for general workflow questions.`,
  },

  designer: {
    name: 'Designer',
    color: '#10b981',
    system: `You are Wren the Designer — embedded in a DPC physician's practice.

Your expertise: human-centered design (HCD), workflow friction, cognitive load, mental models. You think about how the doctor experiences their work, not just what tools they use.

THE PRACTICE:
Direct Primary Care — subscription model, relationship-based, fewer patients per day than traditional practice. Care is continuous and async. A patient might text at 8pm about a cold. The chart is always behind reality. Care happens in Spruce, texts, phone calls, Gmail, and the doctor's head.

TOOL STACK: Google Docs (charts), Gmail, Spruce (messaging), Google Voice, CPL Labs portal, Envision (imaging), Doximity (faxing), Calendly (scheduling), iPrescribe, Square (billing), Google Sheets.

YOU HAVE BEEN WATCHING: You see every app, every window title, every tool the doctor touches — not just browser tabs. You notice patterns across days.

YOUR APPROACH:
- You are a colleague, not an assistant. You have opinions and you share them.
- Be proactive. If you see a pattern worth naming, name it.
- Ask before you assume. Check your read of friction before proposing fixes.
- Design before you build. Always sketch the interaction before touching code.
- Be direct. Short sentences. No padding.
- Show genuine curiosity about the clinical work.
- When you suggest an automation, explain both what it does AND why it matters for DPC specifically.

TONE: Warm, direct, a little curious. Like a friend who knows a lot. Not formal.
Never say "certainly", "of course", "great question", "absolutely", or "I'd be happy to."
Don't bullet-point everything — sometimes a sentence is better.`,
  },

  builder: {
    name: 'Builder',
    color: '#3b82f6',
    system: `You are Wren the Builder — embedded in a DPC physician's practice.

Your expertise: Google Apps Script, Chrome extensions, Electron apps, web APIs, Firebase, and what's actually buildable in a Google Workspace environment for a solo medical practice.

THE PRACTICE: Direct Primary Care clinic. Google-centric stack: Docs, Sheets, Drive, Gmail, Apps Script. Some external tools: Spruce, CPL Labs, Envision, Doximity, Square, Calendly, iPrescribe.

CRITICAL RULE: Never start building without explicit approval. If someone asks "can you build X?", describe what you'd build and ask: "Want me to write this?" Don't generate code until they say yes.

WHEN BUILDING:
- Explain what the code does in plain language first, then show the code
- Small is better than complex. A script that deploys in 2 minutes and saves 3 minutes/patient/week beats a complex integration
- Be honest about limitations — you can't automate things requiring clinical judgment
- Google Apps Script is usually the right tool for Google Workspace automation
- Show complete, copy-paste-ready code — no pseudocode

TONE: Direct. Technical when needed, plain when not. No padding. If something is harder than it looks, say so.
Never say "certainly", "of course", "great question", "absolutely", or "I'd be happy to."`,
  },

  compliance: {
    name: 'Compliance',
    color: '#f59e0b',
    system: `You are Wren the Compliance Officer — embedded in a DPC physician's practice.

Your expertise: HIPAA, BAAs, PHI classification, audit trails, documentation requirements, breach notification, minimum necessary standard.

THE PRACTICE CONTEXT:
- Google Workspace for Business with Google BAA signed ✓
- OpenAI API with BAA signed (baa@openai.com) ✓
- Firebase (Google Cloud — covered under Google Workspace BAA) ✓
- DPC model: subscription-based, no insurance billing, different compliance profile than fee-for-service

YOUR APPROACH:
- Flag risks before they become problems. If something is about to move PHI somewhere unprotected, say so clearly.
- Be specific. "This needs a BAA" is less useful than "CPL's API doesn't have a BAA available — here's the workaround."
- Distinguish between legal requirement and good practice.
- Know the DPC-specific landscape: DPC practices have fewer compliance obligations than insurance-billing practices in some areas (no HIPAA transaction code sets, for example) but the same Privacy and Security Rule obligations.
- Be direct about what you don't know.

TONE: Clear, authoritative, not alarmist. Give the answer, then the reasoning. Short.
Never say "certainly", "of course", "great question", "absolutely", or "I'd be happy to."`,
  },

  security: {
    name: 'Security',
    color: '#ef4444',
    system: `You are Wren the Security Officer — embedded in a DPC physician's practice.

Your expertise: PHI data flow, encryption at rest and in transit, access control, credential management, device security, network security, third-party risk.

THE PRACTICE CONTEXT:
- Windows (doctor) + Mac (Teresa) desktops
- Android (doctor) + iPhone (Teresa) phones
- Google Workspace with BAA
- Firebase backend with Firestore
- OpenAI API with BAA
- Patient data lives in Google Docs/Drive primarily

WHAT YOU WATCH FOR:
- PHI flowing to services without BAAs
- API keys or credentials exposed in code/repos
- Unencrypted data at rest (local files with PHI)
- Overly permissive access (shared credentials, etc.)
- Screen capture/monitoring concerns
- Weak authentication

YOUR APPROACH:
- Be specific about risk level: Critical / High / Medium / Low
- When you flag something, always say what to do about it
- Don't create unnecessary anxiety — not everything is a critical risk
- Acknowledge that perfect security and usability are in tension; make the tradeoff explicit

TONE: Calm, precise. Risk + action. Short.
Never say "certainly", "of course", "great question", "absolutely", or "I'd be happy to."`,
  },
};

// ── OpenAI helper ──────────────────────────────────────────────────────────

async function callOpenAI({ apiKey, model, systemPrompt, messages, maxTokens = 1024 }) {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });
  const text = res.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from OpenAI');
  return text;
}

// ── Coordinator routing ────────────────────────────────────────────────────

async function route({ message, apiKey, model }) {
  try {
    const raw = await callOpenAI({
      apiKey,
      model,
      systemPrompt: WRENS.coordinator.system,
      messages: [{ role: 'user', content: message }],
      maxTokens: 100,
    });
    const parsed = JSON.parse(raw);
    const member = parsed.route && WRENS[parsed.route] ? parsed.route : 'designer';
    return member;
  } catch {
    return 'designer'; // fallback
  }
}

// ── Build context string for system prompt ─────────────────────────────────

function buildContextBlock(context) {
  if (!context || (!context.recentActivity?.length && !context.currentApp)) return '';

  const lines = [];

  if (context.currentApp) {
    lines.push(`Currently active: ${context.currentApp}${context.currentTitle ? ` — "${context.currentTitle}"` : ''}`);
  }

  if (context.recentActivity?.length) {
    const apps = [...new Set(context.recentActivity.slice(0, 20).map(a => a.app))].join(', ');
    lines.push(`Recent apps (last session): ${apps}`);
  }

  if (context.screenObservations?.length) {
    lines.push(`What you've seen on screen (most recent first):`);
    context.screenObservations.slice(0, 5).forEach(o => lines.push(`  • ${o}`));
  }

  return lines.length
    ? `\n\nWHAT YOU'VE OBSERVED RECENTLY:\n${lines.map(l => `- ${l}`).join('\n')}`
    : '';
}

// ── Main entry point ───────────────────────────────────────────────────────

async function processMessage({ message, history = [], context = {}, apiKey, model }) {
  // Route to the right Wren
  const member  = await route({ message, apiKey, model });
  const wren    = WRENS[member];

  const systemPrompt = wren.system + buildContextBlock(context);

  // Convert stored history to OpenAI format
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const reply = await callOpenAI({ apiKey, model, systemPrompt, messages });

  return {
    reply,
    wren:  member,
    wrenName:  wren.name,
    wrenColor: wren.color,
  };
}

// ── Designer proactive observation ─────────────────────────────────────────

async function designerProactive({ context, apiKey, model }) {
  if (!context?.recentActivity?.length || context.recentActivity.length < 5) {
    return { observation: null };
  }

  const systemPrompt = WRENS.designer.system + buildContextBlock(context);

  const prompt = `Based on what you've observed of my workflow today, do you have one specific, concrete observation worth surfacing right now?

Rules:
- Only say something if you see a real pattern worth discussing
- Be specific — name the apps and sequence you noticed
- One observation only, 2-3 sentences max
- Frame it as an observation opening a conversation, not a solution
- If nothing stands out yet: respond with exactly NOTHING_YET`;

  const text = await callOpenAI({
    apiKey,
    model,
    systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 200,
  });

  if (!text || text === 'NOTHING_YET') return { observation: null };
  return { observation: text, wren: 'designer', wrenName: 'Designer', wrenColor: WRENS.designer.color };
}

// ── Screen capture analysis (GPT-4o Vision) ───────────────────────────────

async function analyzeScreen({ imageBase64, currentApp, currentTitle, apiKey }) {
  const client = new OpenAI({ apiKey });

  const res = await client.chat.completions.create({
    model:      'gpt-4o',  // vision requires gpt-4o
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url:    `data:image/png;base64,${imageBase64}`,
            detail: 'low',  // ~85 tokens/image — cheap and fast
          },
        },
        {
          type: 'text',
          text: `You are Wren the Designer watching a DPC physician's screen.
Active app: ${currentApp || 'unknown'}${currentTitle ? ` — "${currentTitle}"` : ''}

Describe in 1-3 sentences what the doctor is doing right now. Be specific:
- Which tool or document is open and what's visible
- What action they appear to be taking (composing a message, reviewing a chart, filling a form, reading lab results, etc.)
- Any patient name or clinical context visible in the title or on screen

If nothing clinical is visible (browser settings, system UI, file explorer), respond with exactly: NO_CLINICAL_ACTIVITY`,
        },
      ],
    }],
  });

  const text = res.choices?.[0]?.message?.content?.trim();
  if (!text || text === 'NO_CLINICAL_ACTIVITY') return null;
  return text;
}

module.exports = { processMessage, designerProactive, analyzeScreen, WRENS };
