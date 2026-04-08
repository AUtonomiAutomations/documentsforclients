const MONDAY_API = "https://api.monday.com/v2";
const SALES_BOARD_ID = "1606734305";

// Column IDs
const COL_MEETING_LINK = "link_mkkehh0j"; // Zoom/Meet link — search by this
const COL_DRIVE_FOLDER = "link0__1";       // Google Drive folder link
const COL_FILE_SPEC    = "file_mm1ge7yz";  // אפיון מערכת PDF
const COL_FILE_AUTO    = "file_mm1y6f4r";  // אפיון אוטומציות PDF
const COL_FILE_APP     = "file_mm26n1pf";  // מסמך לאפליקציה HTML

// ── GraphQL helper ────────────────────────────────────────────────────────────

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MONDAY_API_TOKEN}`,
      "Content-Type": "application/json",
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Monday API HTTP error: ${res.status}`);
  const data = (await res.json()) as any;
  if (data.errors?.length) throw new Error(`Monday GQL error: ${JSON.stringify(data.errors)}`);
  return data.data;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MondayItem {
  id: string;
  name: string;
  driveFolderUrl: string | null;
}

// ── Search by meeting URL ─────────────────────────────────────────────────────

export async function findItemByMeetingUrl(meetingUrl: string): Promise<MondayItem | null> {
  // Normalise: extract the unique path segment (works for Zoom and Google Meet)
  const urlCode = meetingUrl
    .replace(/\?.*$/, "")
    .split("/")
    .filter(Boolean)
    .pop() ?? "";

  console.log(`[Monday] Searching board ${SALES_BOARD_ID} for meeting code: ${urlCode}`);

  // Fetch all items (with pagination)
  let cursor: string | null = null;
  let found: MondayItem | null = null;

  do {
    const cursorArg = cursor ? `, cursor: "${cursor}"` : "";
    const data = await gql(`
      query {
        boards(ids: [${SALES_BOARD_ID}]) {
          items_page(limit: 200${cursorArg}) {
            cursor
            items {
              id
              name
              column_values(ids: ["${COL_MEETING_LINK}", "${COL_DRIVE_FOLDER}"]) {
                id text value
              }
            }
          }
        }
      }
    `);

    const page = data.boards[0].items_page;
    cursor = page.cursor ?? null;

    for (const item of page.items) {
      const meetingCol = item.column_values.find((c: any) => c.id === COL_MEETING_LINK);
      const driveCol   = item.column_values.find((c: any) => c.id === COL_DRIVE_FOLDER);

      const colUrl = extractLinkUrl(meetingCol);

      if (colUrl && (colUrl.includes(urlCode) || colUrl === meetingUrl)) {
        found = {
          id: item.id,
          name: item.name,
          driveFolderUrl: extractLinkUrl(driveCol),
        };
        break;
      }
    }

    if (found) break;
  } while (cursor);

  if (found) {
    console.log(`[Monday] Found item: ${found.name} (id=${found.id})`);
  } else {
    console.log("[Monday] No item matched the meeting URL");
  }

  return found;
}

function extractLinkUrl(col: any): string | null {
  if (!col) return null;
  // Monday link columns store URL as JSON: {"url":"...","text":"..."}
  try {
    const parsed = JSON.parse(col.value ?? "{}");
    return parsed.url || parsed.text || col.text || null;
  } catch {
    return col.text || null;
  }
}

// ── Update Drive folder column ────────────────────────────────────────────────

export async function updateDriveFolderUrl(itemId: string, folderUrl: string): Promise<void> {
  const val = JSON.stringify({ url: folderUrl, text: "תיקיית Drive" });
  await gql(
    `mutation ($item: ID!, $board: ID!, $col: String!, $val: JSON!) {
       change_column_value(item_id: $item, board_id: $board, column_id: $col, value: $val) { id }
     }`,
    {
      item: String(itemId),
      board: String(SALES_BOARD_ID),
      col: COL_DRIVE_FOLDER,
      val,
    }
  );
  console.log(`[Monday] Drive folder URL updated on item ${itemId}`);
}

// ── Upload files ──────────────────────────────────────────────────────────────

export async function uploadFiles(
  itemId: string,
  specPdf: Buffer,
  autoPdf: Buffer,
  autoHtml: Buffer,
  clientName: string
): Promise<void> {
  const safeClient = clientName.replace(/[^א-תa-zA-Z0-9 _-]/g, "").trim();

  await uploadFile(itemId, COL_FILE_SPEC, specPdf,    `אפיון_מערכת_${safeClient}.pdf`,  "application/pdf");
  await uploadFile(itemId, COL_FILE_AUTO, autoPdf,    `אפיון_אוטומציות_${safeClient}.pdf`, "application/pdf");
  await uploadFile(itemId, COL_FILE_APP,  autoHtml,   `אפיון_אוטומציות_${safeClient}.html`, "text/html");
}

async function uploadFile(
  itemId: string,
  columnId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<void> {
  const query = `mutation add_file($file: File!) {
    add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id }
  }`;

  const form = new FormData();
  form.append("query", query);
  const ab = fileBuffer.buffer as ArrayBuffer;
  form.append("variables[file]", new Blob([ab.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)], { type: mimeType }), filename);

  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MONDAY_API_TOKEN}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday file upload failed (${columnId}): ${res.status} ${text}`);
  }

  console.log(`[Monday] Uploaded ${filename} → column ${columnId}`);
}
