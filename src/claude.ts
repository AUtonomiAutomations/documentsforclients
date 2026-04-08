import Anthropic from "@anthropic-ai/sdk";
import { SPEC_CSS, AUTO_CSS } from "./css";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Prompts ───────────────────────────────────────────────────────────────────

const SPEC_PROMPT = `\
You are generating a professional, client-facing system specification document in Hebrew for a Monday.com implementation.

The document must be beautifully structured, RTL (direction is set by CSS), and use ONLY the HTML classes listed below.
Do NOT invent new classes or add inline styles.

──────────────────────────────────────────
AVAILABLE HTML CLASSES:
──────────────────────────────────────────
SECTIONS:
  <div class="section-label">NN — label</div>
  <h1 class="s-title">Section Title</h1>

BOARD CARD:
  <div class="board">
    <div class="board-head bh-N">        <!-- N = 1(blue) 2(green) 3(red) 4(slate) 5(purple) 6(gold) 7(navy) 8(dark) -->
      <div class="board-head-icon">EMOJI</div>
      <div class="board-head-text"><h2>Name</h2><p>subtitle</p></div>
    </div>
    <div class="board-body">
      <div class="board-part">
        <div class="pt">Part Title</div>
        <!-- TABLE or CHIPS or AUTOS or CONNS here -->
      </div>
    </div>
  </div>

COLUMNS TABLE:
  <table><thead><tr><th>שם עמודה</th><th>סוג</th><th>תיאור</th></tr></thead>
  <tbody><tr><td class="fn">Name</td><td class="ft">Type</td><td>Description</td></tr></tbody></table>

STATUS CHIPS:
  <div class="chips">
    <span class="chip ch-blue">text</span>   <!-- also: ch-green ch-red ch-orange ch-yellow ch-gray ch-purple -->
  </div>

AUTOMATIONS LIST:
  <ul class="autos">
    <li><span class="an">1</span><span><span class="at">Trigger</span><span class="arr">→</span>Action</span></li>
  </ul>

CONNECTIONS:
  <div class="conns">
    <span class="cn cn-in">← Source Board</span>
    <span class="cn cn-out">→ Target Board</span>
  </div>

TOC (at the very top):
  <div class="toc"><div class="toc-title">תוכן העניינים</div>
    <div class="toc-grid">
      <div class="toc-item"><span class="toc-n">01</span>Section name</div>
    </div>
  </div>

──────────────────────────────────────────
MEETING TRANSCRIPT:
──────────────────────────────────────────
{transcript}

──────────────────────────────────────────
INSTRUCTIONS:
──────────────────────────────────────────
1. Analyze the transcript and identify ALL Monday.com boards/modules the client needs.
2. For each board: define all columns, statuses, automations, and connections to other boards.
3. Start with a TOC, then an overview table, then one section per board.
4. Write ALL text in Hebrew.
5. Every automation that creates a document must note: "עולה ל-Monday + נשלח ב-WhatsApp".
6. Output ONLY the inner HTML (what goes inside <div class="content">...</div>).
   Do NOT include <html>, <head>, <body>, <style>, or the .content wrapper div.
`;

const AUTO_PROMPT = `\
You are generating a professional Hebrew automations detail document for a Monday.com system.

Use ONLY the HTML classes listed below. All text in Hebrew.

──────────────────────────────────────────
AVAILABLE HTML CLASSES:
──────────────────────────────────────────
BOARD SECTION:
  <div class="board-section">
    <div class="board-title bt-N">EMOJI Board Name</div>   <!-- bt-1..bt-8 same colors as spec -->
    <div class="board-body">
      <!-- auto-cards here -->
    </div>
  </div>

AUTOMATION CARD:
  <div class="auto-card">
    <div class="auto-header">
      <div class="auto-num">N</div>
      <div class="auto-name">Automation Name</div>
      <span class="badge b-webhook">Webhook</span>  <!-- or b-schedule b-button b-external -->
    </div>
    <div class="trigger-line"><strong>טריגר:</strong> description</div>
    <div class="flow">
      <div class="flow-title">פלו ביצוע</div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="flow-connector">
            <div class="flow-dot fd-webhook"></div>   <!-- fd-webhook fd-schedule fd-button fd-external -->
            <div class="flow-line fl-webhook"></div>   <!-- fl-webhook fl-schedule fl-button fl-external -->
          </div>
          <div class="flow-text"><strong>Step title</strong> description</div>
        </div>
        <!-- last step has no flow-line -->
      </div>
    </div>
    <div class="systems">
      <span class="sys sys-monday">Monday.com</span>
      <!-- also: sys-whatsapp sys-email sys-google sys-manychat -->
    </div>
  </div>

DOCUMENT FLOW RULE BOX:
  <div class="doc-flow-card">
    <h3>כלל ברזל — כל מסמך שיוצא:</h3>
    <div class="doc-type-row">
      <div class="doc-type-name">📄 Document Name</div>
      <div class="doc-type-flow">step <span class="arr">→</span> step</div>
    </div>
  </div>

──────────────────────────────────────────
MEETING TRANSCRIPT:
──────────────────────────────────────────
{transcript}

──────────────────────────────────────────
INSTRUCTIONS:
──────────────────────────────────────────
1. Extract ALL automations from the transcript.
2. For each automation determine trigger type: Webhook (immediate event), Scheduled (time-based), Button (manual), External (from external system).
3. Write a detailed flow for each automation (3–5 steps).
4. Include a document flow section showing that EVERY document: uploads to Monday Files + sends via WhatsApp.
5. Include a summary table at the top (board, webhook count, scheduled count, button count, total).
6. Output ONLY the inner HTML (what goes inside <div class="content">...</div>).
`;

// ── Cover pages ───────────────────────────────────────────────────────────────

const COVER_SPEC = `
<div class="cover-page">
  <div class="cover-top">
    <div class="cover-label-top">מסמך אפיון מערכת</div>
    <div class="cover-logo">monday</div>
  </div>
  <div class="cover-center">
    <div class="cover-pre">הוכן עבור</div>
    <h1 class="cover-name">{clientName}</h1>
    <div class="cover-sub">אפיון מערכת ניהול עסקי מלאה ב-Monday.com</div>
    <div class="cover-line"></div>
    <div class="cover-intro">
      מסמך זה מתאר את המערכת המלאה שתבנה עבורך ב-Monday.com.<br>
      כל הבורדים, העמודות, האוטומציות והקישוריות — בפירוט מלא.
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-item"><strong>תאריך</strong><span>{date}</span></div>
    <div class="cover-sep"></div>
    <div class="cover-meta-item"><strong>פלטפורמה</strong><span>Monday.com</span></div>
    <div class="cover-sep"></div>
    <div class="cover-meta-item"><strong>סטטוס</strong><span>מוכן לביצוע</span></div>
  </div>
</div>
`;

const COVER_AUTO = `
<div class="cover-page">
  <div class="cover-top">
    <div class="cover-label-top">מסמך אוטומציות ותהליכים</div>
    <div class="cover-logo">monday</div>
  </div>
  <div class="cover-center">
    <div class="cover-pre">הוכן עבור</div>
    <h1 class="cover-name">אוטומציות המערכת<br>{clientName}</h1>
    <div class="cover-sub">פירוט מלא של כל הטריגרים, הפלואים והאינטגרציות</div>
    <div class="cover-line"></div>
    <div class="cover-intro">
      מסמך זה מפרט את כל האוטומציות שיבנו במערכת.<br>
      לכל אוטומציה: סוג טריגר, פלו מפורט, ומערכות מעורבות.
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-item"><strong>תאריך</strong><span>{date}</span></div>
    <div class="cover-sep"></div>
    <div class="cover-meta-item"><strong>פלטפורמה</strong><span>Monday.com</span></div>
    <div class="cover-sep"></div>
    <div class="cover-meta-item"><strong>סטטוס</strong><span>מוכן לביצוע</span></div>
  </div>
</div>
`;

// ── HTML wrapper ──────────────────────────────────────────────────────────────

function buildHtml(title: string, css: string, cover: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div class="page">
${cover}
<div class="content">
${body}
</div>
</div>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GeneratedDocs {
  specHtml: string;
  autoHtml: string; // used for both PDF and the onboarding HTML file
}

export async function generateDocs(
  transcriptText: string,
  clientName: string
): Promise<GeneratedDocs> {
  const date = new Date().toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  console.log("[Claude] Generating מסמך אפיון...");
  const specBody = await callClaude(SPEC_PROMPT.replace("{transcript}", transcriptText));

  console.log("[Claude] Generating מסמך אפיון אוטומציות...");
  const autoBody = await callClaude(AUTO_PROMPT.replace("{transcript}", transcriptText));

  const specHtml = buildHtml(
    `אפיון מערכת – ${clientName}`,
    SPEC_CSS,
    COVER_SPEC.replace(/{clientName}/g, clientName).replace(/{date}/g, date),
    specBody
  );

  const autoHtml = buildHtml(
    `אוטומציות – ${clientName}`,
    AUTO_CSS,
    COVER_AUTO.replace(/{clientName}/g, clientName).replace(/{date}/g, date),
    autoBody
  );

  return { specHtml, autoHtml };
}

async function callClaude(prompt: string): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");
  return block.text;
}
