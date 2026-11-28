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

const SCENES = ["clipper", "pipeline", "import", "interview", "reminders", "insights"];
const LIGHT_SCENES = ["clipper", "import", "reminders"];

/** Relative luminance (WCAG) of a CSS rgb()/rgba() color string. */
function luminance(color) {
  const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function sceneProgressAt(page, id, fraction) {
  return page.evaluate(async ([sceneId, f]) => {
    const wrapper = document.querySelector(`[data-scene="${sceneId}"]`);
    const top = wrapper.getBoundingClientRect().top + window.scrollY;
    const travel = wrapper.offsetHeight - window.innerHeight;
    window.scrollTo({ top: Math.round(top + travel * f), behavior: "instant" });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Number(wrapper.querySelector("[data-scene-stage]").style.getPropertyValue("--p"));
  }, [id, fraction]);
}

test.describe("scroll scenes", () => {
  test("every scene pins on desktop and its --p runs from 0 to 1 across its wrapper", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout");
    await openWelcome(page);
    for (const id of SCENES) {
      await expect(page.locator(`[data-scene="${id}"]`)).toHaveAttribute("data-pinned", "true");
      expect(await sceneProgressAt(page, id, 0)).toBeLessThanOrEqual(0.01);
      expect(Math.abs((await sceneProgressAt(page, id, 0.5)) - 0.5)).toBeLessThanOrEqual(0.02);
      expect(await sceneProgressAt(page, id, 1)).toBeGreaterThanOrEqual(0.99);
    }
  });

  test("light scenes are light in the light theme and never bright in the dark theme", async ({ page }) => {
    await openWelcome(page);
    const canvas = id => page.locator(`[data-scene="${id}"] [data-scene-stage]`).evaluate(el => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    for (const id of LIGHT_SCENES) expect(luminance(await canvas(id))).toBeGreaterThan(0.7);
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    for (const id of SCENES) expect(luminance(await canvas(id))).toBeLessThan(0.2);
  });

  test("switching the theme in the middle of a scene keeps its progress", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout");
    await openWelcome(page);
    const before = await sceneProgressAt(page, "pipeline", 0.4);
    await page.evaluate(async () => {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const after = await page.locator('[data-scene="pipeline"] [data-scene-stage]').evaluate(el => Number(el.style.getPropertyValue("--p")));
    expect(Math.abs(after - before)).toBeLessThanOrEqual(0.01);
  });

  test("at 200% zoom scenes that do not fit stop pinning and stay fully readable", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await openWelcome(page);
    for (const id of SCENES) {
      const wrapper = page.locator(`[data-scene="${id}"]`);
      await expect(wrapper).toHaveAttribute("data-pinned", "false");
      await wrapper.scrollIntoViewIfNeeded();
      await expect(wrapper.locator(".feature-title")).toBeVisible();
    }
  });

  test("scene counters follow progress", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout");
    await openWelcome(page);
    const interview = page.locator('[data-scene="pipeline"] [data-counter="interview"]');
    await page.evaluate(() => window.__motion.setProgress("pipeline", 0.5));
    await expect(interview).toHaveText("3");
    await page.evaluate(() => window.__motion.setProgress("pipeline", 1));
    await expect(interview).toHaveText("4");
  });

  test("reduced motion shows each scene's finished state in normal flow", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWelcome(page);
    for (const id of SCENES) {
      const stage = page.locator(`[data-scene="${id}"] [data-scene-stage]`);
      expect(await stage.evaluate(el => getComputedStyle(el).position)).not.toBe("sticky");
      const finale = stage.locator("[data-final]").first();
      expect(await finale.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
    }
  });

  for (const width of [320, 768, 1024, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openWelcome(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("headline and feature title text stay exactly the same after word reveals", async ({ page }) => {
    await openWelcome(page);
    await expect(page.locator("#hero-title")).toHaveText("Every internship application, one calm notebook.");
    expect(await page.locator("#hero-title").evaluate(el => el.textContent)).toBe("Every internship application, one calm notebook.");
    await expect(page.locator('[data-scene="clipper"] .feature-title')).toHaveText("One-Click Job Clipper and Paste Autofill");
  });
});

test("the header turns dark while a dark scene sits under it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout");
  await openWelcome(page);
  const header = page.locator(".landing-header");
  await sceneProgressAt(page, "pipeline", 0.5);
  await expect(header).toHaveClass(/landing-header-on-dark/);
  await sceneProgressAt(page, "clipper", 0.5);
  await expect(header).not.toHaveClass(/landing-header-on-dark/);
});

test.describe("final review fixes", () => {
  test("if the motion layer cannot start, the page stays readable and nothing throws", async ({ page }) => {
    await page.addInitScript(() => { delete window.ResizeObserver; });
    await openWelcome(page);
    await expect(page.locator("#landing-shell")).not.toHaveClass(/motion-ready/);
    await expect(page.locator("html")).not.toHaveClass(/motion-engine/);
    await expect(page).toHaveTitle("My Internship Notebook");
    const title = page.locator('[data-scene="clipper"] .feature-title');
    await title.scrollIntoViewIfNeeded();
    expect(await title.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
    expect(await page.locator('[data-scene="clipper"] .feature-description').evaluate(el => getComputedStyle(el).opacity)).toBe("1");
  });

  test("hero hand-off progress is written only where it is read", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout");
    await openWelcome(page);
    await page.evaluate(async () => {
      window.scrollTo({ top: 200, behavior: "instant" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    expect(await page.locator("#landing-shell").evaluate(el => el.style.getPropertyValue("--hero-p"))).toBe("");
    expect(Number(await page.locator(".landing-hero-media").evaluate(el => el.style.getPropertyValue("--hero-p")))).toBeGreaterThan(0);
  });

  test("scenes pin on a 1280x720 laptop screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout");
    await page.setViewportSize({ width: 1280, height: 720 });
    await openWelcome(page);
    for (const id of SCENES) await expect(page.locator(`[data-scene="${id}"]`)).toHaveAttribute("data-pinned", "true");
  });

  test("an unpinned scene waits at its start until it enters view, so it never plays backwards", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await openWelcome(page);
    const stage = page.locator('[data-scene="insights"] [data-scene-stage]');
    await expect(page.locator('[data-scene="insights"]')).toHaveAttribute("data-pinned", "false");
    expect((await stage.evaluate(el => getComputedStyle(el).getPropertyValue("--p"))).trim()).toBe("0");
  });

  test("split headlines keep one accessible name and hide the word masks", async ({ page }) => {
    await openWelcome(page);
    const hero = page.locator("#hero-title");
    await expect(hero).toHaveAttribute("aria-label", "Every internship application, one calm notebook.");
    await expect(hero).toHaveAccessibleName("Every internship application, one calm notebook.");
    expect(await hero.locator(".reveal-word").first().getAttribute("aria-hidden")).toBe("true");
  });
});
