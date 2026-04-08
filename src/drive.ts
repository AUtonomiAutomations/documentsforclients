import { google } from "googleapis";
import { Readable } from "stream";

const LEADS_FOLDER_NAME = "Leads";

// ── Auth ──────────────────────────────────────────────────────────────────────

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is not set");

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

// ── Find / create folder ──────────────────────────────────────────────────────

export interface DriveFolder {
  id: string;
  url: string;
  isNew: boolean;
}

export async function findOrCreateClientFolder(clientName: string): Promise<DriveFolder> {
  const drive = getDriveClient();

  // 1. Find "Leads" folder
  const leadsRes = await drive.files.list({
    q: `name='${LEADS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const leadsFolder = leadsRes.data.files?.[0];
  if (!leadsFolder?.id) {
    throw new Error(`"${LEADS_FOLDER_NAME}" folder not found in Google Drive. Create it and share it with the service account.`);
  }

  const leadsFolderId = leadsFolder.id;
  console.log(`[Drive] Leads folder id: ${leadsFolderId}`);

  // 2. Look for client subfolder
  const safeName = clientName.replace(/'/g, "\\'");
  const clientRes = await drive.files.list({
    q: `name='${safeName}' and '${leadsFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name, webViewLink)",
    spaces: "drive",
  });

  const existing = clientRes.data.files?.[0];
  if (existing?.id) {
    console.log(`[Drive] Found existing folder for "${clientName}"`);
    return { id: existing.id, url: existing.webViewLink!, isNew: false };
  }

  // 3. Create new subfolder
  console.log(`[Drive] Creating new folder for "${clientName}" inside Leads`);
  const created = await drive.files.create({
    requestBody: {
      name: clientName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [leadsFolderId],
    },
    fields: "id, webViewLink",
  });

  if (!created.data.id) throw new Error("Failed to create Drive folder");

  return { id: created.data.id, url: created.data.webViewLink!, isNew: true };
}

// ── Upload files ──────────────────────────────────────────────────────────────

export async function uploadFilesToDrive(
  folderId: string,
  clientName: string,
  specPdf: Buffer,
  autoPdf: Buffer,
  autoHtml: Buffer
): Promise<void> {
  const drive = getDriveClient();
  const safeClient = clientName.replace(/[^א-תa-zA-Z0-9 _-]/g, "").trim();

  await upload(drive, folderId, `אפיון_מערכת_${safeClient}.pdf`,       specPdf,  "application/pdf");
  await upload(drive, folderId, `אפיון_אוטומציות_${safeClient}.pdf`,    autoPdf,  "application/pdf");
  await upload(drive, folderId, `אפיון_אוטומציות_${safeClient}.html`,   autoHtml, "text/html");
}

async function upload(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  // Delete existing file with the same name to avoid duplicates
  const existing = await drive.files.list({
    q: `name='${name}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  });
  for (const f of existing.data.files ?? []) {
    await drive.files.delete({ fileId: f.id! });
  }

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: "id",
  });

  console.log(`[Drive] Uploaded ${name}`);
}
