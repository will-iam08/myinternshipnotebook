# Hero Demo Film Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 30 s, six-chapter, 60 fps, sharp-text landing-page film that loads after the page, built on Antigravity's draft.

**Architecture:** The page side (pills, chapter times, deferred playback, tests, cache) is one task. The recorder (`scripts/record-demo-tour.mjs`) is rewritten by Codex in its own worktree branched from `hero-film`, with a built-in framing audit. Recording, frame review (Claude plus Gemini via Antigravity) and the full test run close the loop.

**Tech Stack:** Vanilla JS/HTML/CSS, Playwright (dev only), Playwright's ffmpeg (VP8), macOS Swift AVAssetWriter (H.264), node --test.

**Spec:** `docs/superpowers/specs/2026-11-26-hero-demo-film-design.md`

## Global Constraints
- Duration 30.0 s, FPS 60, 1800 frames; chapters `[0, 5, 10, 15, 20, 25]`.
- Capture 1280x720 at deviceScaleFactor 2; output 1920x1080 for MP4 and WebM.
- WebM: libvpx VP8, type `video/webm; codecs="vp8"`. MP4: H.264 via AVAssetWriter, faststart.
- Each video file at most 5 MB (5 * 1024 * 1024 bytes); poster 1280x720 JPEG under 200 KB.
- No em dashes; no AI tool names in code, comments or commits; zero runtime dependencies.
- Bump `CACHE` in `sw.js` for any shell change.

## Review Focus
- Reduced motion: a visitor with prefers-reduced-motion must get the poster and a paused video, never autoplay. Test in Task 1.
- Video fails to load (no codec, 404): the poster stays and the pills stay usable. Existing `markHeroVideoFailed` path; Task 1 keeps its test passing.
- Clicking a pill before the deferred playback has started must still seek to that chapter. Test in Task 1.
- A camera keyframe that frames the window badly: the recorder must fail loudly, not ship a bad frame. Audit in Task 2.
- Running the recorder on a nearly full disk or low memory: frames stream to disk one at a time, and the temp folder is removed on success and failure. Task 2.

---

### Task 1: Page integration (Claude)

**Files:**
- Modify: `src/main/resources/public/index.html:108-133` (video attributes, six pills)
- Modify: `src/main/resources/public/styles.css` (`.hero-workflow-pills` grid: 3 columns at 900px and up, 2 below, 1 at phones)
- Modify: `src/main/resources/public/js/app.js` (`HERO_CHAPTERS`, deferred start)
- Modify: `src/main/resources/public/sw.js` (`CACHE` to v42)
- Test: `tests/e2e/welcome.spec.js`

**Interfaces:**
- Produces: `HERO_CHAPTERS = [0, 5, 10, 15, 20, 25]`; video markup without `autoplay`, with `preload="none"`; playback starts in `initLandingPage` after `window` `load` unless reduced motion.
- Pill labels: `1-Click Job Clipper`, `Pipeline Board`, `Interview Prep & Mock`, `Internship Openings`, `Deadlines & Calendar`, `Insights`.

- [ ] **Step 1: Update tests first**
  - Hero test: assert `muted`, `loop`, `playsinline`; assert no `autoplay`; assert `preload` is `none`; after `page.waitForFunction(() => document.readyState === "complete")`, poll that the video is playing (`!el.paused`).
  - Pills test: `toHaveCount(6)`, `expectedTimes = [0, 5, 10, 15, 20, 25]`, timeupdate checks at 11.5 s (index 2) and 26.0 s (index 5).
  - New test: with `page.emulateMedia({ reducedMotion: "reduce" })`, after load the video is paused and the poster attribute is set.
  - New test: clicking pill index 3 immediately after `openWelcome` (before load completes) ends with `currentTime` within 1 s of 15.
  - Page weight: skip responses whose `resourceType()` is `media` in the 3 MB total; new test reads `fs.statSync` of `src/main/resources/public/media/demo-tour.{mp4,webm}` and asserts each is at most `5 * 1024 * 1024`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/welcome.spec.js --workers=2` and see the new assertions fail.
- [ ] **Step 3: Implement** the markup, CSS, `HERO_CHAPTERS`, deferred start (`window.addEventListener("load", ...)`, or start now if `document.readyState === "complete"`), and the cache bump. Update the video `aria-label` to name the six workflows.
- [ ] **Step 4: Run** `npm run check && npm run test:unit && npx playwright test tests/e2e/welcome.spec.js --workers=2`. Expected: all pass except the file-size test until Task 3 replaces the media (note it, do not weaken it).
- [ ] **Step 5: Commit** on `hero-film`.

### Task 2: Recorder rewrite (Codex, GPT-6.2, worktree `../myinternshipnotebook-film` on branch `hero-film-recorder` from `hero-film`)

**Files:**
- Modify: `scripts/record-demo-tour.mjs`

**Interfaces:**
- Consumes: the scene, springs, cursor and camera code from Antigravity's draft.
- Produces: `node scripts/record-demo-tour.mjs` writes the three media files and prints JSON `{ frames: 1800, fps: 60, durationSec: 30, mp4Bytes, webmBytes, posterBytes, faststart: true }`. `node scripts/record-demo-tour.mjs --audit` renders every frame's state without screenshots and exits non-zero on any framing failure.

- [ ] **Step 1: Framing audit** `window.__auditFrame(t)` returns `{ windowVisibleRatio, clippedAnchors: string[], emptyRatio }`. Rules: the active camera target and any visible toast are fully inside the 1280x720 stage with 12 px margin; empty backdrop covers at most 22% of the stage when zoomed; `clippedAnchors` is empty for every anchor the cursor will touch within 0.5 s. `--audit` runs it at every frame and prints the worst frames.
- [ ] **Step 2: Run** `--audit` on the draft and record that it fails (4.4 s, 6.6 s, 8.6 s, 12.2 s are known bad).
- [ ] **Step 3: Storyboard** to 30 s with chapters at 0, 5, 10, 15, 20, 25 as in the spec. New scenes: Internship Openings (Today feed with a term filter chip, a list of 5 to 6 openings with company, role, location, term, and a Save button; click the filter, then Save on one, a toast confirms, the active count goes up), and Deadlines and Calendar (Deadline Radar highlighted, open Export, click "Download calendar (.ics)", a toast "Calendar file with 24 h and 2 h reminders" appears). End with a 0.4 s dissolve to the exact t = 0 frame.
- [ ] **Step 4: Data consistency** one data object drives every scene: active count, board column counts equal rendered cards, filter counts match, the weekly goal ring on Tuesday with no counts after it, "N priorities" equals listed items.
- [ ] **Step 5: Visual fidelity** inputs, buttons and cards keep visible borders (at least 1px solid with contrast about 1.3:1 against their background so compression keeps them); the "Fill" control looks like a button.
- [ ] **Step 6: Capture and encode** deviceScaleFactor 2; write each JPEG (quality 90) straight to an open `frames.mjpeg` file with `fs.writeSync` and keep only a running list of frame byte offsets; WebM two-pass VP8 at 60 fps from `-f image2pipe -vcodec mjpeg -r 60 -i frames.mjpeg -vf scale=1920:1080:flags=lanczos`, bitrate ladder 1400k, 1250k, 1100k picking the first result at most 5 MB; MP4 via Swift reading the same `frames.mjpeg` by offsets (no stdin, no giant buffers), 1920x1080, `interpolationQuality = .high`, `AVVideoMaxKeyFrameIntervalKey: 60`, `shouldOptimizeForNetworkUse = true`, ladder 1.4, 1.25, 1.1 Mbps. Poster at the autofilled modal frame (about 3.4 s) with a deviceScaleFactor 1 context. Temp folder removed in `finally`.
- [ ] **Step 7: Run** `node --check scripts/record-demo-tour.mjs` and `node scripts/record-demo-tour.mjs --audit`. Expected: zero failures.
- [ ] **Step 8: Commit** on `hero-film-recorder`. Do not push.

### Task 3: Record and review (Claude, Gemini via Antigravity)

- [ ] **Step 1:** Run `node scripts/record-demo-tour.mjs` in the recorder worktree. Expected: JSON with `faststart: true`, both files at most 5 MB.
- [ ] **Step 2:** Extract about 30 frames with the Swift frame script (chapter starts, every click, mid-moves, 29.9 s and 0 s). Claude reviews every frame; Gemini 4 Hydrogen reviews the same set against a written checklist (target hit, no clipping, sharp text, borders visible, data consistent).
- [ ] **Step 3:** Send defects back to the Codex session; re-record; repeat until both reviews pass.
- [ ] **Step 4:** Merge `hero-film-recorder` into `hero-film`.

### Task 4: Full verification (Claude)

- [ ] **Step 1: Run** `npm run build && npm run check && npm run test:unit && npx playwright test tests/e2e/welcome.spec.js tests/e2e/entry-page.spec.js`. Expected: all pass.
- [ ] **Step 2:** Show the owner the final video and frames; merge to `main` and push only on their OK.
