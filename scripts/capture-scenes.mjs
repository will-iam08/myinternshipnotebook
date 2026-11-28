// Captures every welcome-page scroll scene at progress 0, 0.5 and 1, in the light and dark
// themes, on a desktop and a phone viewport, for visual review.
// Usage: npm run build && node scripts/capture-scenes.mjs <out-dir>
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4179;
const SCENES = ["clipper", "pipeline", "import", "interview", "reminders", "insights"];
const PROGRESS = [0, 0.5, 1];
const THEMES = ["light", "dark"];
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};

const outDir = path.resolve(process.argv[2] || path.join(ROOT, "scene-captures"));
mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "scripts/serve.mjs"), path.join(ROOT, "_site"), String(PORT)], { stdio: "ignore" });
const browser = await chromium.launch();
let count = 0;
try {
  await new Promise(resolve => setTimeout(resolve, 600));
  for (const [device, options] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
    await page.locator("#landing-shell").waitFor({ state: "visible" });
    // Finish every one-shot reveal so captures show settled copy.
    await page.evaluate(() => document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-revealed")));
    await page.waitForTimeout(900);
    for (const theme of THEMES) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const id of SCENES) {
        for (const p of PROGRESS) {
          await page.evaluate(async ([sceneId, progress]) => {
            const wrapper = document.querySelector(`[data-scene="${sceneId}"]`);
            const header = document.querySelector(".landing-header")?.offsetHeight || 0;
            const top = wrapper.getBoundingClientRect().top + window.scrollY - header;
            const travel = wrapper.dataset.pinned === "true" ? wrapper.offsetHeight - window.innerHeight : 0;
            window.scrollTo({ top: Math.max(0, Math.round(top + travel * progress)), behavior: "instant" });
            window.__motion?.setProgress(sceneId, progress);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }, [id, p]);
          // Unpinned scenes transition into place; give them time to settle.
          await page.waitForTimeout(device === "phone" ? 1300 : 150);
          const file = path.join(outDir, `${device}-${theme}-${id}-p${String(p).replace(".", "")}.png`);
          const pinned = await page.locator(`[data-scene="${id}"]`).getAttribute("data-pinned");
          // An unpinned scene is taller than the screen: capture the whole stage instead of the viewport.
          if (pinned === "true") await page.screenshot({ path: file });
          else await page.locator(`[data-scene="${id}"] [data-scene-stage]`).screenshot({ path: file });
          count++;
        }
        await page.evaluate(sceneId => window.__motion?.release(sceneId), id);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`Captured ${count} scene screenshots in ${outDir}`);
