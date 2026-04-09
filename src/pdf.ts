import puppeteer from "puppeteer-core";
// @ts-ignore — no types shipped with this package
import chromium from "@sparticuz/chromium-min";
import { chmodSync } from "fs";

const CHROMIUM_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = await chromium.executablePath(CHROMIUM_URL);
  try { chmodSync(executablePath, 0o755); } catch {}

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();

    // Set Hebrew-friendly viewport
    await page.setViewport({ width: 1240, height: 900 });

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60_000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
