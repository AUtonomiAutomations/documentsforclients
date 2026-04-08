/**
 * Background function — Netlify sends 202 immediately and keeps this running
 * up to 15 minutes.
 *
 * Webhook payload (from Make.com):
 *   POST /.netlify/functions/process-transcript-background
 *   Headers: x-webhook-secret: <WEBHOOK_SECRET>   (optional but recommended)
 *   Body:    { "transcript_id": "...", "meeting_url": "..." }
 */

import type { Handler } from "@netlify/functions";
import { fetchTranscript, formatTranscriptForClaude } from "../../src/fireflies";
import { generateDocs } from "../../src/claude";
import { htmlToPdf } from "../../src/pdf";
import {
  findItemByMeetingUrl,
  updateDriveFolderUrl,
  uploadFiles,
} from "../../src/monday";
import {
  findOrCreateClientFolder,
  uploadFilesToDrive,
} from "../../src/drive";

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  // ── Auth check (optional) ──────────────────────────────────────────────────
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const incoming = event.headers["x-webhook-secret"] ?? event.headers["X-Webhook-Secret"];
    if (incoming !== secret) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { transcript_id?: string; meeting_url?: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { transcript_id, meeting_url } = body;
  if (!transcript_id || !meeting_url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "transcript_id and meeting_url are required" }),
    };
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Pipeline] transcript_id=${transcript_id}`);
  console.log(`[Pipeline] meeting_url=${meeting_url}`);

  try {
    // ── Step 1: Fetch transcript ───────────────────────────────────────────
    console.log("\n[Step 1] Fetching transcript from Fireflies...");
    const transcript = await fetchTranscript(transcript_id);
    const clientName = transcript.title;  // use meeting title as client name fallback
    console.log(`[Fireflies] Title: ${clientName}`);

    // ── Step 2: Find Monday item ───────────────────────────────────────────
    console.log("\n[Step 2] Searching Monday for client...");
    const mondayItem = await findItemByMeetingUrl(meeting_url);
    const resolvedClientName = mondayItem?.name ?? clientName;
    console.log(`[Pipeline] Client name: ${resolvedClientName}`);

    // ── Step 3: Generate HTML docs ─────────────────────────────────────────
    console.log("\n[Step 3] Generating documents with Claude...");
    const transcriptText = formatTranscriptForClaude(transcript);
    const { specHtml, autoHtml } = await generateDocs(transcriptText, resolvedClientName);

    // ── Step 4: Convert to PDF ─────────────────────────────────────────────
    console.log("\n[Step 4] Converting to PDF...");
    const [specPdf, autoPdf] = await Promise.all([
      htmlToPdf(specHtml),
      htmlToPdf(autoHtml),
    ]);
    const autoHtmlBuffer = Buffer.from(autoHtml, "utf-8");
    console.log(`[PDF] spec=${specPdf.length} bytes, auto=${autoPdf.length} bytes`);

    // ── Step 5: Google Drive ───────────────────────────────────────────────
    console.log("\n[Step 5] Uploading to Google Drive...");
    const folder = await findOrCreateClientFolder(resolvedClientName);

    await uploadFilesToDrive(folder.id, resolvedClientName, specPdf, autoPdf, autoHtmlBuffer);

    if (folder.isNew) {
      console.log(`[Drive] New folder created: ${folder.url}`);
    }

    // ── Step 6: Upload to Monday ───────────────────────────────────────────
    if (mondayItem) {
      console.log("\n[Step 6] Uploading to Monday...");
      await uploadFiles(mondayItem.id, specPdf, autoPdf, autoHtmlBuffer, resolvedClientName);

      // If Drive folder was just created, update the Monday column
      if (folder.isNew) {
        await updateDriveFolderUrl(mondayItem.id, folder.url);
      }
    } else {
      console.log("\n[Step 6] No Monday item found — skipping Monday upload.");
    }

    console.log("\n[Pipeline] Done!");
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        client: resolvedClientName,
        monday_item_id: mondayItem?.id ?? null,
        drive_folder_url: folder.url,
        drive_folder_is_new: folder.isNew,
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Pipeline] ERROR:", message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
};
