# Welcome Page Scroll Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the signed-out welcome page momentum wheel scrolling and six pinned, scroll-scrubbed feature scenes in the hero film's visual language.

**Architecture:** Three plain ES modules under `js/motion/`: pure math, a scroll engine that glides native document scroll from wheel input, and a scene system that pins sticky stages and writes scroll progress to the CSS variable `--p`. Scene animation is mostly CSS (`calc()` and `clamp()` on `--p`); JavaScript only writes progress and updates counters. A boot module wires both into the landing page from `app.js`.

**Tech Stack:** Vanilla JS (ES modules), CSS, Node test runner (`node --test`), Playwright 1.63 (desktop Chromium and iPhone 13 WebKit).

**Spec:** `docs/superpowers/specs/2026-11-27-welcome-scroll-motion-design.md`

**Branch:** `scroll-motion`, cut from `main` at `ea09b4a`.

**Who does what:**
- Tasks 1 to 3: Codex `gpt-6.2-sol`.
- Task 4: Codex `gpt-6-astra`, reviewing and hardening.
- Tasks 5 to 7: Claude.
- Task 6: Gemini 4 Neon co-designs scenes; Task 7: Neon reviews screenshots.
- Codex works in the main checkout on `js/motion/` and `tests/unit/motion-*.test.js` only, while Claude edits other files.

## Global Constraints

- Vanilla JS and CSS only. Zero third-party scripts at runtime. No npm runtime dependencies.
- Page weight under 3 MB, excluding the film (existing test in `tests/e2e/welcome.spec.js`).
- WCAG 2.2 AA in the light and dark themes.
- `prefers-reduced-motion: reduce`:
  - no engine, no pins, no parallax or reveals
  - scenes render their finished state in normal flow
- The engine runs only while `#landing-shell` is visible. The notebook app is untouched.
- Never move the page without visitor input (wheel, key, scrollbar, or a clicked link). Never call `history.pushState` on scroll.
- Only `transform` and `opacity` animate per frame. No `getBoundingClientRect()` inside the frame loop.
- Programmatic glide duration stays within `clampScrollDuration` (400 to 800 ms, in `js/landing.js`).
- Feature copy, order, and sign-up behavior are unchanged.
  - Create Account and Sign In links keep focusing `#signup-name`.
  - Hero headline `textContent` stays exactly `HERO_HEADLINE`.
- Bump `CACHE` in `src/main/resources/public/sw.js` to `internship-notebook-v43` and add each new `js/motion/*.js` file to `SHELL`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **macOS trackpad inertia.** The OS sends a long, decaying stream of small wheel deltas. The page must settle exactly on the summed target with no overshoot or "double momentum". Pinned in Task 2.
2. **Background tab or a frame stall.** Returning to the tab after `requestAnimationFrame` paused gives a huge `dt`. The page must not jump or overshoot. Pinned in Task 1 (dt cap) and Task 2.
3. **Resize or browser zoom mid-glide.** The target must clamp to the new maximum scroll. Scenes must re-measure and re-check fit. Pinned in Tasks 2 and 3.
4. **The browser moved the page without a `scroll` event the engine saw** (scroll restoration on Back, hash load). The next wheel must start from the real `scrollY`, not jump back. Pinned in Task 2.
5. **Theme toggled while a scene is on screen.** No progress jump. Light scenes in dark theme never show a bright canvas. Pinned in Task 6.

---

### Task 1: Motion math (Sol)

**Files:**
- Create: `src/main/resources/public/js/motion/motion-math.js`
- Test: `tests/unit/motion-math.test.js`

**Interfaces:**
- Produces (all pure, all exported):
  - `MAX_FRAME_MS = 64`
  - `LINE_HEIGHT_PX = 16`
  - `clamp(value: number, min: number, max: number): number`
  - `range(p: number, start: number, end: number): number`: local 0..1 within `[start, end]`, clamped
  - `dampFactor(lambda: number, dtMs: number): number`: `1 - Math.exp(-lambda * min(dtMs, MAX_FRAME_MS) / 1000)`
  - `damp(current: number, target: number, lambda: number, dtMs: number): number`
  - `normalizeWheelDelta({ deltaY: number, deltaMode: 0|1|2 }, viewportHeight: number): number`: pixels; mode 1 multiplies by `LINE_HEIGHT_PX`, mode 2 by `viewportHeight`
  - `easeOutExpo(t: number): number`: `t >= 1 ? 1 : 1 - 2 ** (-10 * t)`, input clamped to 0..1
  - `sceneProgress(scrollY: number, start: number, length: number, viewportHeight: number): number`: `clamp((scrollY - start) / max(1, length - viewportHeight), 0, 1)`

- [ ] **Step 1: Write the failing tests**

```js
test("damping converges the same at 60 Hz and 120 Hz", () => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1000, 9, 1000 / 60);
  for (let i = 0; i < 120; i++) b = damp(b, 1000, 9, 1000 / 120);
  assert.ok(Math.abs(a - b) < 0.5);
});
test("a stalled frame is capped and never overshoots", () => {
  assert.equal(dampFactor(9, 5000), dampFactor(9, MAX_FRAME_MS));
  assert.ok(damp(0, 100, 9, 5000) <= 100);
});
test("wheel deltas normalize to pixels", () => {
  assert.equal(normalizeWheelDelta({ deltaY: 3, deltaMode: 1 }, 800), 48);
  assert.equal(normalizeWheelDelta({ deltaY: 1, deltaMode: 2 }, 800), 800);
  assert.equal(normalizeWheelDelta({ deltaY: -120, deltaMode: 0 }, 800), -120);
});
test("range and sceneProgress clamp to 0..1", () => {
  assert.equal(range(0.35, 0.2, 0.5), 0.5);
  assert.equal(range(0.1, 0.2, 0.5), 0);
  assert.equal(sceneProgress(500, 1000, 2000, 800), 0);
  assert.equal(sceneProgress(1600, 1000, 2000, 800), 0.5);
  assert.equal(sceneProgress(9000, 1000, 2000, 800), 1);
});
test("easeOutExpo hits its ends", () => {
  assert.equal(easeOutExpo(0), 0);
  assert.equal(easeOutExpo(1), 1);
  assert.ok(easeOutExpo(0.5) > 0.9);
});
```

- [ ] **Step 2:** Run `node --test tests/unit/motion-math.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the exports listed above in `motion-math.js`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm run check`. Expected: "Syntax check passed".
- [ ] **Step 5:** Commit `js/motion/motion-math.js` and the test: "Motion math helpers for the welcome page scroll engine".

### Task 2: Scroll engine (Sol)

**Files:**
- Create: `src/main/resources/public/js/motion/scroll-engine.js`
- Test: `tests/unit/motion-engine.test.js`

**Interfaces:**
- Consumes: Task 1 `damp`, `normalizeWheelDelta`, `easeOutExpo`, `clamp`.
- Produces:
  - `createScrollEngine({ win = window, lambda = 9, isEnabled = () => true }): ScrollEngine`
  - `ScrollEngine.start(): void`: attaches listeners:
    - `wheel`, non-passive, on `win`
    - native `scroll`
    - `keydown` and `pointerdown`, used only to interrupt a programmatic glide
  - `ScrollEngine.stop(): void`: detaches listeners, cancels the frame, leaves `scrollY` where it is.
  - `ScrollEngine.scrollTo(targetY: number, { duration: number }): void`: expo-out glide. Any wheel, key, or pointer input interrupts it. When disabled, it jumps instantly.
  - `ScrollEngine.onFrame(cb: (scrollY: number) => void): () => void`: subscribe; returns unsubscribe.
  - `ScrollEngine.isActive(): boolean`
  - Exported helper `canElementScroll(el: Element|null, deltaY: number, win): boolean`: walks ancestors up to `body`. True when an ancestor has `overflow-y` of `auto` or `scroll`, `scrollHeight > clientHeight`, and room left in the delta's direction.
- Wheel handling:
  - Ignore the event (no `preventDefault`) when any of these hold:
    - `!isEnabled()`
    - `event.ctrlKey` or `event.metaKey`
    - `|deltaX| > |deltaY|`
    - `canElementScroll(event.target, deltaY, win)`
    - `win.document.documentElement.classList.contains("motion-hold")`. Claude adds `motion-hold` while a modal or the auth success overlay is open.
  - Otherwise call `preventDefault()`, set `target = clamp(target + delta, 0, maxScroll)`, and request a frame.
- `maxScroll` is `documentElement.scrollHeight - win.innerHeight`, read on each wheel event, not per frame.
- Each frame:
  - `current = damp(...)`, then `win.scrollTo({ top: Math.round(current), behavior: "instant" })`, then notify `onFrame`.
  - Stop requesting frames when `|target - current| < 0.5` (write the exact target last).
- Resync: on `scroll` events, or at the start of a wheel event, if `|win.scrollY - lastWritten| > 1`, set target and current to `win.scrollY`.

- [ ] **Step 1: Write the failing tests** with a fake `win`. The fake has:
  - `scrollY`, `innerHeight = 800`, a document `scrollHeight = 10000`
  - `scrollTo` that sets `scrollY`
  - manual `requestAnimationFrame` and `performance.now`
  - `addEventListener` that records handlers

  Tests:
  - `one wheel event glides over several frames then settles exactly on the target`: wheel 300 px → after frame 1, `0 < scrollY < 300`; after 120 frames of 16.7 ms, `scrollY === 300` and no frame is pending.
  - `trackpad stream of 40 decaying deltas settles on their sum without overshoot`: max `scrollY` seen is at most the sum.
  - `ctrl or meta wheel is not intercepted`: `preventDefault` not called, `scrollY` unchanged.
  - `a wheel over a scrollable element with room is left native`.
  - `an external scroll resyncs the next wheel`: set `scrollY = 5000` without an event, then wheel 100 → settles at 5100.
  - `target clamps to the document end and to 0`.
  - `scrollTo glides with expo-out and a wheel interrupts it`.
  - `a 5-second frame gap does not overshoot`.
  - `stop() removes every listener`.
  - `isEnabled() false: wheel stays native and scrollTo jumps`.
- [ ] **Step 2:** Run `node --test tests/unit/motion-engine.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `createScrollEngine` and `canElementScroll` as specified.
- [ ] **Step 4:** Run the test, then `npm run check`. Expected: PASS and "Syntax check passed".
- [ ] **Step 5:** Commit: "Scroll engine: momentum wheel glide on native document scroll".

### Task 3: Scene system (Sol)

**Files:**
- Create: `src/main/resources/public/js/motion/scenes.js`
- Test: `tests/unit/motion-scenes.test.js`

**Interfaces:**
- Consumes: Task 1 `sceneProgress`. Task 2 `ScrollEngine.onFrame`.
- Produces:
  - `createSceneSystem({ win = window, engine, headerHeight: () => number }): SceneSystem`
  - `SceneSystem.register(id: string, wrapper: HTMLElement, { update?: (p: number, stage: HTMLElement) => void }): void`
    - The stage is `wrapper.querySelector("[data-scene-stage]")`.
  - `SceneSystem.refresh(): void`
    - Re-measures each wrapper's top (page-absolute) and height, and the viewport height.
    - Re-checks fit: `stage.scrollHeight <= win.innerHeight - headerHeight()` sets `wrapper.dataset.pinned = "true"`, otherwise `"false"`.
    - Runs on `ResizeObserver` (wrappers and `documentElement`) and on `resize`.
  - `SceneSystem.render(scrollY: number): void`
    - For each active scene: `p = sceneProgress(...)`, sets `stage.style.setProperty("--p", p.toFixed(4))`, calls `update(p, stage)`.
    - An unpinned scene gets `p = 1` once it has entered the viewport, and 0 before. CSS gives unpinned stages a transition, so the scene "plays once".
  - `SceneSystem.setProgress(id: string, p: number): void`: test hook; forces `p` until `release(id)`.
  - `SceneSystem.release(id: string): void`
  - `SceneSystem.destroy(): void`
- Active gating: an `IntersectionObserver` with `rootMargin: "100% 0px"` adds `data-scene-active` (CSS uses it for `will-change`). Only active scenes render.
- Rendering is driven by `engine.onFrame` and by native `scroll` events (needed when the engine is disabled, for example on touch), batched to one frame.

- [ ] **Step 1: Write the failing tests** with fake wrappers (`offsetTop`, `offsetHeight`, stage `scrollHeight`, a `style.setProperty` spy) and a stubbed `IntersectionObserver` and `ResizeObserver`:
  - `progress is written to --p across the wrapper`: wrapper top 1000, height 2400, viewport 800; render(1000) gives `--p` "0.0000", render(1800) gives "0.5000", render(3400) gives "1.0000".
  - `a stage taller than the space under the header is not pinned and jumps to 1 after entering view`.
  - `refresh after a resize re-measures and re-checks fit`.
  - `inactive scenes are not rendered`.
  - `setProgress overrides until release`.
- [ ] **Step 2:** Run `node --test tests/unit/motion-scenes.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement as specified.
- [ ] **Step 4:** Run the test, then `npm run check`. Expected: PASS.
- [ ] **Step 5:** Commit: "Scene system: sticky pinned stages driven by scroll progress".

### Task 4: Adversarial review and hardening (Astra)

**Files:**
- Modify: `js/motion/*.js` and `tests/unit/motion-*.test.js` only.

- [ ] **Step 1:** Review Tasks 1 to 3 against the spec's engine section and this plan's Review Focus. For each defect, write a failing test first. Check at least:
  - A wheel while `scrollTo` is gliding.
  - `deltaMode` 1 on Firefox.
  - `isEnabled` flipping mid-glide (for example, reduced motion turned on).
  - Document height shrinking below the target.
  - Listener leaks after `stop()` then `start()`.
  - Frames requested while idle.
  - `NaN` or `Infinity` inputs.
  - `canElementScroll` on `overflow: hidden` and on elements at their scroll edge.
- [ ] **Step 2:** Fix each defect so its test passes. Run `npm run check && node --test "tests/unit/motion-*.test.js"`. Expected: all PASS.
- [ ] **Step 3:** Reply with a list of the defects found and fixed, and anything left open.
- [ ] **Step 4:** Commit: "Harden the scroll engine and scene system".

### Task 5: Landing integration (Claude)

**Files:**
- Create: `src/main/resources/public/js/motion/landing-motion.js`
- Modify: `src/main/resources/public/js/app.js`:
  - `smoothScrollToSection`, around line 3893
  - `syncShellVisibility`, around line 2490
  - modal and auth overlay open/close: toggle the `motion-hold` class on `<html>`
- Modify: `src/main/resources/public/styles.css`, rule `html:has(#landing-shell:not([hidden]))` near line 2176
- Modify: `src/main/resources/public/sw.js`
- Test: `tests/e2e/welcome-motion.spec.js`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  - `initLandingMotion({ shell: HTMLElement }): { destroy(): void, scrollTo(y: number, opts: { duration: number }): void }`
  - The motion is enabled when `!matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(pointer: fine) and (hover: hover)").matches && !shell.hidden`. Both media queries are re-evaluated on `change`.
  - Adds `motion-engine` to `<html>` while the engine is enabled. The CSS smooth-scroll rule becomes `html:has(#landing-shell:not([hidden])):not(.motion-engine)`.
  - Adds `motion-ready` to the shell after scenes register, unless reduced motion is on.
  - Registers `[data-scene]` wrappers. The scene `update` functions come from Task 6's `SCENE_UPDATES`.
  - Sets up `data-reveal` and `data-depth` (one `IntersectionObserver` for reveals; depth reads progress from `onFrame`).
  - Toggles the header class `landing-header-scrolled` at `scrollY > 24`.
  - Sets `--landing-header-h` on the shell from the header's `offsetHeight`, on load and in a `ResizeObserver`. Scenes pass it as `headerHeight`.
  - Exposes `window.__motion = { setProgress, release, settle }` only while the landing page shows. `settle()` resolves once no frame is pending.
  - `smoothScrollToSection` keeps its offset math and calls `motion.scrollTo(targetY, { duration: clampScrollDuration(duration) })`.
  - Focus handling is unchanged.

- [ ] **Step 1: Write the failing Playwright tests** in `welcome-motion.spec.js`:
  - `desktop wheel glides and settles` (desktop project): `page.mouse.wheel(0, 400)`; read `scrollY` over 5 frames, strictly increasing; after `__motion.settle()`, about 400 ± 2.
  - `keyboard scrolling still works`: Page Down, End, and Home move `scrollY`.
  - `ctrl + wheel is not intercepted`: the `defaultPrevented` flag stays false.
  - `nav links land under the header and keep today's focus`: the existing `#signup-name` assertion, plus Features heading focus.
  - `touch project keeps native scroll`: on iPhone, `<html>` has no `motion-engine` class.
  - `reduced motion: no engine, no motion-ready`: `page.emulateMedia({ reducedMotion: "reduce" })`.
  - `a modal open blocks the glide`.
  - `signed-in visitors never get the engine`: seed a session; `__motion` is undefined.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/welcome-motion.spec.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `landing-motion.js` and the `app.js`, CSS, and `sw.js` changes above.
- [ ] **Step 4:** Run the new spec plus `tests/e2e/welcome.spec.js` and `tests/e2e/entry-page.spec.js`. Expected: all pass on both projects.
- [ ] **Step 5:** Commit: "Wire the scroll engine into the welcome page".

### Task 6: Scenes, canvases, hero and header (Claude with Neon)

**Files:**
- Modify: `src/main/resources/public/index.html` (feature section around lines 143 to 368)
- Modify: `src/main/resources/public/styles.css` (new block after the landing section, near line 2546)
- Create: `src/main/resources/public/js/motion/scene-updates.js`
- Test: `tests/e2e/welcome-motion.spec.js` (extend)

**Interfaces:**
- Produces:
  - `SCENE_UPDATES: Record<"clipper"|"pipeline"|"import"|"interview"|"reminders"|"insights", (p: number, stage: HTMLElement) => void>`. These handle text counters only, for example the pipeline Interview count and the import total. Motion is CSS.
  - Markup per feature: wrap each existing `article.feature-card[data-feature-id]` in `<div class="scene" data-scene="<id>" data-canvas="light|dark">`, with the stage element `[data-scene-stage]` inside.
  - Keep every existing class and text that tests use: `feature-card`, `feature-title`, `feature-description`, `feature-icon`, `feature-visual`.
- CSS rules:
  - `.motion-ready .scene { height: var(--scene-length) }`. Lengths: clipper 200vh, pipeline 240vh, import 180vh, interview 220vh, reminders 200vh, insights 200vh.
  - Under `(pointer: coarse)`, lengths are times 0.75.
  - `.motion-ready .scene[data-pinned="true"] [data-scene-stage] { position: sticky; top: var(--landing-header-h); height: calc(100svh - var(--landing-header-h)) }`.
  - Sub-beats are written as `--b1: clamp(0, (var(--p) - 0.2) / 0.3, 1)` and used in `transform`, `opacity`, and `stroke-dashoffset` (rings).
  - Canvases: `data-canvas="light"` and `"dark"` use the film colors. Under `:root[data-theme="dark"]`, `light` maps to a second dark shade. Each canvas has a static film-grain layer (an inline SVG `feTurbulence` data URI at 2 to 3% opacity, no animation).
  - Choreography per scene: the spec's Section 3 table. Neon proposes concrete layer lists and keyframe ranges per scene first; Claude implements them.
  - Hero: the headline wraps "one calm notebook." in a terracotta keyword span (`textContent` unchanged) with a line reveal. The film card gets `data-depth` scale-out (1 to 0.94).
  - Header: clear at the top; `.landing-header-scrolled` restores today's background and blur.
  - Reveals: `[data-reveal]` starts at `translateY(105%)` with up to 3 degrees of skew, inside a mask and transitions over 700 ms with `cubic-bezier(0.16, 1, 0.3, 1)`, 70 ms stagger per line. Only under `.motion-ready`.

- [ ] **Step 1: Write the failing Playwright tests:**
  - `each scene's --p runs 0 to 1 across its wrapper`: use `__motion` and `scrollTo`.
  - `light scenes in dark theme have no bright canvas`: computed background luminance is below 0.2.
  - `toggling theme mid-scene keeps progress`.
  - `200% zoom unpins scenes that do not fit`: viewport 640×400.
  - `reduced motion shows every scene's final state in normal flow`.
  - `no horizontal overflow at 320, 768, 1024, 1440`.
  - `hero headline text is unchanged`.
- [ ] **Step 2:** Run the spec. Expected: the new tests FAIL.
- [ ] **Step 3:** Get Neon's per-scene layer and keyframe proposal (prompt includes the spec's Section 3 and the current `feature-visual` markup). Then implement the markup, CSS, and `scene-updates.js`.
- [ ] **Step 4:** Run `npm run check`, `npm run test:unit`, and `npx playwright test tests/e2e/welcome*.spec.js tests/e2e/entry-page.spec.js`. Expected: all pass on both projects.
- [ ] **Step 5:** Commit: "Six scroll-scrubbed feature scenes in the film's style".

### Task 7: Visual review, performance, and full verification (Claude, Neon reviews)

**Files:**
- Create: `scripts/capture-scenes.mjs`. It opens the built site with Playwright and writes PNGs for each scene at p = 0, 0.5, 1, in the light and dark themes, at desktop 1440×900 and phone 390×844, to a scratch folder.

- [ ] **Step 1:** Run `npm run build && node scripts/capture-scenes.mjs <out-dir>`. Expected: 72 PNGs.
- [ ] **Step 2:** Neon reviews the PNGs against the spec (film language, contrast, clipping, dead zones). Fix each verified defect. Repeat until Neon reports no defects that Claude can confirm.
- [ ] **Step 3:** Performance:
  - Record a Chromium trace of a full-page wheel scroll (`page.mouse.wheel` in steps).
  - Expected: no long task over 50 ms, and no `Layout` events inside the frame callbacks.
- [ ] **Step 4:** Full suite: `npm run check && npm run test:unit && npx playwright test`. Expected: all pass, including the 3 MB page weight and the zero-third-party-scripts tests.
- [ ] **Step 5:** Commit: "Scene capture script and review fixes". Report results to the owner, and ask before merging `scroll-motion` into `main`.
