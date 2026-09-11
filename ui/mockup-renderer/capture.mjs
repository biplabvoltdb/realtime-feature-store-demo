import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "/Users/koojon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const appSource = fileURLToPath(new URL("./index.html", import.meta.url));
const contactSource = fileURLToPath(new URL("./contact.html", import.meta.url));
const outputDir = fileURLToPath(new URL("../design-screens/", import.meta.url));
const pages = process.argv.slice(2);
const canonicalOrder = [
  "overview",
  "architecture",
  "schema",
  "procedures",
  "sql",
  "explorer",
  "hygiene",
  "benchmarks",
  "sizing",
  "runbook",
  "settings",
];

if (pages.length === 0) {
  throw new Error("Pass one or more page ids to capture.");
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromePath });

try {
  for (const pageId of pages) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const isContact = pageId === "contact";
    const url = isContact
      ? pathToFileURL(contactSource).href
      : `${pathToFileURL(appSource).href}?page=${encodeURIComponent(pageId)}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(async () => document.fonts.ready);
    const canonicalIndex = canonicalOrder.indexOf(pageId);
    const order = isContact ? "00" : String(canonicalIndex >= 0 ? canonicalIndex + 1 : 99).padStart(2, "0");
    const name = isContact ? "contact-sheet" : pageId;
    const output = path.join(outputDir, `${order}-${name}.png`);
    await page.screenshot({ path: output, fullPage: false, animations: "disabled", caret: "hide" });
    await page.close();
    process.stdout.write(`${output}\n`);
  }
} finally {
  await browser.close();
}
