// Welcome page scroll motion: momentum wheel glide on desktop, native scroll on touch,
// reduced-motion fallback, and the engine staying out of the signed-in notebook.
import { expect, test } from "./fixtures.js";
import { openWelcome, seedSession } from "./helpers.js";

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const scrollY = page => page.evaluate(() => window.scrollY);
const nextFrame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));

async function openDesktopWelcome(page, testInfo) {
  test.skip(testInfo.project.name !== "desktop-chromium", "Wheel glide is desktop only");
  await openWelcome(page);
  await expect(page.locator("html")).toHaveClass(/motion-engine/);
  await page.mouse.move(640, 400);
}

test.describe("desktop momentum scrolling", () => {
  test("one wheel turn glides over several frames and settles on its target", async ({ page }, testInfo) => {
    await openDesktopWelcome(page, testInfo);
    await page.mouse.wheel(0, 400);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await nextFrame(page);
      seen.push(await scrollY(page));
    }
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(400);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    await page.evaluate(() => window.__motion.settle());
    expect(Math.abs((await scrollY(page)) - 400)).toBeLessThanOrEqual(2);
  });

  test("keyboard scrolling still moves the page", async ({ page }, testInfo) => {
    await openDesktopWelcome(page, testInfo);
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("PageDown");
    await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
    await page.keyboard.press("End");
    await expect.poll(() => scrollY(page)).toBeGreaterThan(1500);
    await page.keyboard.press("Home");
    await expect.poll(() => scrollY(page)).toBe(0);
  });

  test("ctrl + wheel is left to the browser for zooming", async ({ page }, testInfo) => {
    await openDesktopWelcome(page, testInfo);
    const prevented = await page.evaluate(() => {
      const event = new WheelEvent("wheel", { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true });
      document.querySelector("#landing-main").dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test("nav links glide each section under the header and keep today's focus rules", async ({ page }, testInfo) => {
    await openDesktopWelcome(page, testInfo);
    await page.locator('.landing-nav-link[data-scroll-to="features"]').click();
    await expect(page.locator("#features")).toBeFocused();
    await expect(page.locator("#features")).toBeInViewport();
    await page.locator('.landing-nav-link[data-scroll-to="signup"][data-auth-mode-trigger="signup"]').click();
    await expect(page.locator("#signup-name")).toBeFocused();
    await expect(page.locator("#signup")).toBeInViewport();
  });

  test("the sign-up success message holds the glide until the redirect", async ({ page }, testInfo) => {
    await openDesktopWelcome(page, testInfo);
    await page.locator("#signup-name").fill("Jordan Rivera");
    await page.locator("#signup-email").fill("jordan@example.edu");
    await page.locator("#signup-password").fill("Interview-ready-2026");
    await page.locator("#signup-submit").click();
    await expect(page.locator("#signup-success")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/motion-hold/);
    await expect(page.locator("#app")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("html")).not.toHaveClass(/motion-engine|motion-hold/);
  });
});

test.describe("when the engine stays off", () => {
  test("touch devices keep native scrolling", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-webkit", "Touch profile only");
    await openWelcome(page);
    await expect(page.locator("html")).not.toHaveClass(/motion-engine/);
    await expect(page.locator("#landing-shell")).toHaveClass(/motion-ready/);
  });

  test("reduced motion turns off the engine and the scenes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWelcome(page);
    await expect(page.locator("html")).not.toHaveClass(/motion-engine/);
    await expect(page.locator("#landing-shell")).not.toHaveClass(/motion-ready/);
  });

  test("signed-in visitors never get the engine or the test hook", async ({ page }) => {
    await seedSession(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/motion-engine/);
    expect(await page.evaluate(() => typeof window.__motion)).toBe("undefined");
  });
});
