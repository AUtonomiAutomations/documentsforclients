import puppeteer from "puppeteer-core";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN env var is not set");

  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://chrome.browserless.io?token=${token}`,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 900 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60_000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.disconnect();
  }
}
