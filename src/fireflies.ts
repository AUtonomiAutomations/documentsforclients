const FIREFLIES_GQL = "https://api.fireflies.ai/graphql";

export interface TranscriptData {
  title: string;
  date: string;
  participants: string[];
  fullText: string;
  summary: {
    overview?: string;
    shortSummary?: string;
    actionItems?: string;
    bulletPoints?: string;
  };
}

export async function fetchTranscript(transcriptId: string): Promise<TranscriptData> {
  const query = `
    query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        participants {
          displayName
        }
        sentences {
          speaker_name
          text
        }
        summary {
          overview
          short_summary
          action_items
          bullet_gist
        }
      }
    }
  `;

  const res = await fetch(FIREFLIES_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({ query, variables: { id: transcriptId } }),
  });

  if (!res.ok) {
    throw new Error(`Fireflies HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as any;

  if (data.errors?.length) {
    throw new Error(`Fireflies API error: ${JSON.stringify(data.errors)}`);
  }

  const t = data.data?.transcript;
  if (!t) {
    throw new Error(`Transcript "${transcriptId}" not found in Fireflies`);
  }

  // Build participant list
  const participants: string[] = (t.participants ?? [])
    .map((p: any) => p.displayName as string)
    .filter(Boolean);

  // Build full conversation text
  const lines: string[] = [];
  let lastSpeaker = "";
  for (const s of t.sentences ?? []) {
    const speaker = s.speaker_name || "Unknown";
    if (speaker !== lastSpeaker) {
      lines.push(`\n${speaker}:`);
      lastSpeaker = speaker;
    }
    lines.push(s.text);
  }

  const fullText = lines.join(" ").trim();

  return {
    title: t.title ?? "פגישה",
    date: t.date ? new Date(t.date).toLocaleDateString("he-IL") : "",
    participants,
    fullText,
    summary: {
      overview: t.summary?.overview ?? "",
      shortSummary: t.summary?.short_summary ?? "",
      actionItems: t.summary?.action_items ?? "",
      bulletPoints: t.summary?.bullet_gist ?? "",
    },
  };
}

export function formatTranscriptForClaude(t: TranscriptData): string {
  let text = `כותרת הפגישה: ${t.title}\n`;
  text += `תאריך: ${t.date}\n`;
  if (t.participants.length) {
    text += `משתתפים: ${t.participants.join(", ")}\n`;
  }

  if (t.summary.overview) {
    text += `\n=== סיכום ===\n${t.summary.overview}\n`;
  }
  if (t.summary.shortSummary) {
    text += `\n=== תקציר ===\n${t.summary.shortSummary}\n`;
  }
  if (t.summary.actionItems) {
    text += `\n=== משימות ===\n${t.summary.actionItems}\n`;
  }
  if (t.summary.bulletPoints) {
    text += `\n=== נקודות מפתח ===\n${t.summary.bulletPoints}\n`;
  }

  text += `\n=== שיחה מלאה ===\n${t.fullText}`;
  return text;
}
