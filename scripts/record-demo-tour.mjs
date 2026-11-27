import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "src/main/resources/public");
const MEDIA_DIR = path.join(PUBLIC_DIR, "media");
const STYLES_PATH = path.join(PUBLIC_DIR, "styles.css");

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
const WINDOW_WIDTH = 1152;
const WINDOW_HEIGHT = 648;
const FRAME_MARGIN = 12;
const FOCUS_MARGIN = 24;
const ZOOM_COVER_THRESHOLD = 1.12;
const DEVICE_SCALE_FACTOR = 2;
const OUT_WIDTH = 1920;
const OUT_HEIGHT = 1080;
const FPS = 60;
const DURATION_SEC = 30;
const LOOP_REST_START = DURATION_SEC - 1;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const MAX_POSTER_BYTES = 200 * 1024;
const BITRATES = [1400, 1250, 1100];
const POSTER_TIME = 3.4;
const BOARD_CARD_GAP = 6;
const SIDEBAR_BOTTOM_PADDING = 16;
const CHAPTERS = { clipper: 0, board: 5, prep: 10, openings: 15, calendar: 20, insights: 25 };
const ACTIONS = {
  newPage: 0.62, focusLink: 1.08, pasteLink: 1.62, fill: 2.42, saveStripe: 3.9,
  grabStripe: 5.95, dropStripe: 7, filterPython: 8.55, openStripe: CHAPTERS.prep,
  markPracticed: 12.45,
  filterTerm: 16.3, saveOpening: 18.3,
  openExport: 21.7, downloadCalendar: 22.85,
  dissolve: LOOP_REST_START - 0.4
};

function findFfmpeg() {
  const candidates = [process.env.FFMPEG_BIN];

  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  if (fs.existsSync(cacheDir)) {
    for (const entry of fs.readdirSync(cacheDir)) {
      if (entry.startsWith("ffmpeg-")) {
        candidates.push(path.join(cacheDir, entry, "ffmpeg-mac"));
        candidates.push(path.join(cacheDir, entry, "ffmpeg-linux"));
      }
    }
  }

  for (const bin of candidates) {
    if (bin && fs.existsSync(bin)) return bin;
  }
  throw new Error("Could not locate Playwright ffmpeg binary.");
}

function buildSceneHtml(appCss) {
  const logoSvg = `<svg viewBox="0 0 40 40" width="32" height="32" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="9" fill="#0f172a"/><rect x="10" y="8.5" width="21" height="24" rx="3" fill="#faf9f6"/><path d="M14.5 16h11M14.5 20.5h11M14.5 25h7" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/><path d="M25 8.5h4.5v10l-2.25-1.8L25 18.5Z" fill="#b33812"/><g fill="#0f172a"><circle cx="10" cy="13" r="1.4"/><circle cx="10" cy="19" r="1.4"/><circle cx="10" cy="25" r="1.4"/></g></svg>`;

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8" />
<style>
${appCss}

/* Midnight-navy studio stage + floating macOS app window */
html, body {
  width: 1280px;
  height: 720px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #0b1120;
}

.demo-stage {
  position: relative;
  width: 1280px;
  height: 720px;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(64% 58% at 50% 42%, rgba(200, 67, 25, 0.14), transparent 70%),
    radial-gradient(56% 52% at 20% 18%, rgba(59, 130, 246, 0.14), transparent 65%),
    radial-gradient(48% 48% at 84% 82%, rgba(20, 184, 138, 0.08), transparent 65%),
    linear-gradient(155deg, #0b1120 0%, #111b2e 52%, #162033 100%);
}

/* Subtle studio vignette and ambient specular sweep */
.demo-stage::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, transparent 56%, rgba(4, 7, 15, 0.45) 100%);
  pointer-events: none;
  z-index: 2;
}

.demo-camera {
  position: relative;
  width: 1280px;
  height: 720px;
  transform-origin: 0 0;
  will-change: transform;
  z-index: 3;
}

.demo-window {
  --demo-border: #c4cbd2;
  position: absolute;
  left: ${(VIEWPORT_WIDTH - WINDOW_WIDTH) / 2}px;
  top: ${(VIEWPORT_HEIGHT - WINDOW_HEIGHT) / 2}px;
  width: ${WINDOW_WIDTH}px;
  height: ${WINDOW_HEIGHT}px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow:
    0 38px 90px -18px rgba(2, 6, 23, 0.82),
    0 12px 32px -8px rgba(2, 6, 23, 0.55),
    0 0 0 1px rgba(15, 23, 42, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  background: var(--paper);
}

.app.demo-app {
  width: 100%;
  height: 100%;
  max-width: none;
  border-radius: 0;
  box-shadow: none;
  grid-template-columns: 224px minmax(0, 1fr);
}

.demo-app .cover {
  padding: 16px 14px ${SIDEBAR_BOTTOM_PADDING}px;
}

.demo-traffic-lights {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 2px 6px 14px;
}
.demo-traffic-lights span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  display: block;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.25);
}
.demo-traffic-lights .tl-close { background: #ff5f57; }
.demo-traffic-lights .tl-min { background: #febc2e; }
.demo-traffic-lights .tl-max { background: #28c840; }

.demo-app .cover-label {
  margin-bottom: 14px;
}

.demo-app .cover kbd { opacity: 1; border-bottom-width: 1px; }

.demo-app .page-wrap {
  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.demo-app .page {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.demo-view-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  will-change: transform, opacity;
}

.demo-app .view {
  padding: 22px 32px 28px 48px;
  max-width: none;
}

.demo-app .view-head {
  margin-bottom: 14px;
  padding-bottom: 10px;
}

.demo-app .view-title {
  font-size: 1.92rem;
}

.demo-app .board {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  overflow: hidden;
}

.demo-app .board .column { min-width: 0; padding: 8px 7px; }
.demo-board-view .column-cards { position: relative; gap: ${BOARD_CARD_GAP}px; }
.demo-board-view .app-card { min-width: 0; gap: 3px; padding: 7px 6px 7px 9px; }
.demo-board-view .app-role { font-size: 0.93rem; }
.demo-board-view .app-card .chips { gap: 3px; }
.demo-board-view .app-card .chip { font-size: 0.62rem; padding: 2px 4px; }
.demo-board-view .drag-origin { opacity: 0.5; }
.demo-board-view .demo-history-stamp { font-size: 0.64rem; }
.demo-board-view :is(.view-head, .board) { max-width: 646px; }
.demo-app .strip-top { max-width: 605px; }
.demo-app .goal-card .card-title { width: max-content; }
.demo-app .goal-card .card-note { max-width: 144px; }
.demo-app .agenda-kind { width: 38px; white-space: nowrap; }

.demo-window :is(.card, .app-card, .column, .sheet-page, .prep-group, .demo-mock-card,
  .demo-modal-card, .demo-field-box, .demo-quickfill-display, .button:not(.primary),
  .filter-chip, .prep-mark[aria-pressed="false"]) {
  border: 1px solid var(--demo-border);
}

.demo-stage *, .demo-stage *::before, .demo-stage *::after {
  animation: none !important;
  transition: none !important;
}

.demo-opening-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr) 105px 88px 64px;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
}

.demo-opening-row + .demo-opening-row { border-top: 1px solid var(--demo-border); }
.demo-opening-row .button { min-height: 36px; }
.demo-app :is(.demo-openings-view, .demo-calendar-view) .view-head,
.demo-openings-feed { max-width: 646px; }
.demo-openings-list { padding: 4px 8px; }
.demo-export { position: relative; z-index: 8; }
.demo-export-menu { position: absolute; right: 0; top: calc(100% + 8px); width: max-content; padding: 6px; }
.demo-export-menu .button { background: var(--paper-2); }
.demo-prep-page { width: 624px; margin: 18px 28px 18px 42px; }
.demo-prep-page .prep-mark { min-width: 116px; justify-content: center; }
.demo-prep-page .entry-head { margin-bottom: 10px; }
.demo-prep-page .stepper { margin-bottom: 12px; }
.demo-prep-page .prep-q { padding: 5px 0; }
.demo-prep-page .prep-mark { min-height: 36px; }
.demo-prep-page .entry-fields { margin-bottom: 12px; }
.demo-prep-page :is(.entry-head, .stepper, .entry-fields, .prep-head, .prep-progress),
.demo-prep-page.prep-detail .prep-q:not([data-focus]) {
  opacity: var(--prep-context-opacity);
  visibility: var(--prep-context-visibility);
}
.demo-window .ring { width: 96px; height: 96px; }
.demo-app .demo-insights-view { max-width: 746px; margin-left: 0; }
.demo-window :is(.funnel-row, .skill-bar) { min-height: 34px; }
.demo-insights-view .funnel-row { grid-template-columns: 86px minmax(0, 1fr) 72px; }
.demo-insights-view .funnel-value { justify-self: end; }
.demo-insights-view :is(.funnel-bar, .skill-bar i) { min-width: 0; }

/* Hover and focus simulation classes */
.is-hovered {
  border-color: var(--accent-ink) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 24%, transparent), var(--shadow-md) !important;
}
.tab.is-hovered {
  background: var(--cover-hover) !important;
  color: var(--cover-ink) !important;
  box-shadow: none !important;
}
.button.primary.is-hovered {
  background: var(--primary-hover) !important;
  color: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent), 0 8px 18px -6px rgba(179, 56, 18, 0.45) !important;
}
.demo-autofill-flash {
  border-color: var(--accent-ink) !important;
  background: color-mix(in srgb, var(--accent-soft) 60%, var(--card)) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent) !important;
}

/* Modal overlay inside the floating window */
.demo-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(9, 12, 18, 0.48);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 30;
  opacity: 0;
  pointer-events: none;
}
.demo-modal-card {
  width: 644px;
  background: var(--card);
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  box-shadow: 0 28px 60px -14px rgba(15, 23, 42, 0.42), 0 0 0 1px rgba(15, 23, 42, 0.06);
  overflow: hidden;
  will-change: transform, opacity;
}
.demo-modal-card .sheet-head {
  padding: 13px 20px 10px;
}
.demo-modal-card .sheet-head h2 {
  font-size: 1.28rem;
}
.demo-modal-card .sheet-body {
  padding: 12px 20px;
}
.demo-modal-card .sheet-foot {
  padding: 10px 20px 12px;
}
.demo-typing-caret {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  background: var(--accent-ink);
  vertical-align: text-bottom;
  margin-left: 1px;
}
.demo-quickfill-display {
  display: flex;
  align-items: center;
  min-height: 40px;
  flex: 1;
  background: var(--card);
  border: 1.5px solid var(--line-strong);
  border-radius: 8px;
  padding: 7px 12px;
  font: 500 0.84rem/1.3 var(--mono);
  color: var(--ink);
  overflow: hidden;
  white-space: nowrap;
}
.demo-quickfill-display.is-focused {
  border-color: var(--focus);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 20%, transparent);
}
.demo-quickfill-placeholder {
  color: var(--faint);
  font-family: var(--sans);
}
.demo-field-box {
  background: var(--card);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  min-height: 38px;
  padding: 7px 11px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 6px;
}
.demo-field-box.is-empty {
  color: var(--faint);
  font-weight: 450;
}

/* Kanban drag ghost, drop slot, and stamp */
.demo-drop-slot {
  position: absolute;
  inset: 0 0 auto;
  border: 2px dashed var(--st-interview);
  background: color-mix(in srgb, var(--st-interview-bg) 55%, transparent);
  border-radius: 12px;
  box-sizing: border-box;
  overflow: hidden;
}
.demo-drag-card {
  position: absolute;
  width: 170px;
  z-index: 35;
  pointer-events: none;
  margin: 0;
  box-shadow: 0 26px 48px -12px rgba(15, 23, 42, 0.36), 0 0 0 2px var(--st-interview) !important;
  will-change: transform, left, top;
}
.demo-history-stamp {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--st-interview-bg);
  border: 1px solid color-mix(in srgb, var(--st-interview) 45%, transparent);
  color: var(--ink);
  font-size: 0.68rem;
  font-weight: 700;
  transform-origin: left center;
}

/* Mock interview score overlay card inside entry workflow */
.demo-mock-card {
  margin-top: 12px;
  background: var(--paper-2);
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  padding: 14px 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
}
.demo-mock-score-box {
  background: var(--st-saved-bg);
  border: 1.5px solid var(--st-saved);
  border-radius: 12px;
  padding: 10px 14px;
  text-align: center;
  min-width: 114px;
}
.demo-mock-score-box strong {
  display: block;
  font: 700 1.85rem/1 var(--serif);
  color: var(--ink);
}
.demo-mock-score-box span {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--good);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.demo-mock-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 6px;
}
.demo-metric-pill {
  background: var(--card);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--ink-2);
}
.demo-metric-pill.good {
  background: var(--st-saved-bg);
  border-color: var(--st-saved);
  color: var(--ink);
}

/* Toast notification inside floating window */
.demo-toast {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 55;
  background: var(--ink);
  color: var(--paper);
  border-radius: 12px;
  padding: 9px 15px;
  font-size: 0.84rem;
  font-weight: 650;
  box-shadow: 0 18px 34px -10px rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Top-level crisp Retina cursor and soft click halo */
.demo-ripple {
  position: absolute;
  width: 38px;
  height: 38px;
  margin-left: -19px;
  margin-top: -19px;
  border-radius: 50%;
  border: 2px solid rgba(200, 67, 25, 0.85);
  background: rgba(200, 67, 25, 0.14);
  pointer-events: none;
  z-index: 80;
}
.demo-cursor {
  position: absolute;
  left: 0;
  top: 0;
  width: 28px;
  height: 32px;
  pointer-events: none;
  z-index: 90;
  filter: drop-shadow(0 5px 10px rgba(2, 6, 23, 0.38));
  transform-origin: 4px 3px;
}
</style>
</head>
<body>
<div class="demo-stage" id="demo-stage">
  <div class="demo-camera" id="demo-camera">
    <div class="demo-window" id="demo-window">
      <div class="app demo-app">
        <aside class="cover" aria-label="Notebook">
          <div class="demo-traffic-lights" aria-hidden="true">
            <span class="tl-close"></span>
            <span class="tl-min"></span>
            <span class="tl-max"></span>
          </div>
          <div class="cover-label">
            <span class="cover-logo">${logoSvg}</span>
            <span class="cover-title">My Internship<br />Notebook</span>
            <span class="cover-sub">Applications &amp; interviews</span>
          </div>
          <div class="cover-actions">
            <button class="button primary cover-new" id="nav-new-btn" data-anchor="nav-new" type="button">
              <span>+ New application</span><kbd>N</kbd>
            </button>
            <div class="cover-search">
              <span>Search</span><kbd>Cmd+K</kbd>
            </div>
          </div>
          <nav class="tabs" aria-label="Sections">
            <a class="tab" id="nav-today" data-anchor="nav-today" style="--tab: var(--tab-today)"><span>Today</span></a>
            <a class="tab" id="nav-board" data-anchor="nav-board" style="--tab: var(--tab-board)"><span>Board</span><b class="tab-count" id="nav-board-count"></b></a>
            <a class="tab" id="nav-notebook" style="--tab: var(--tab-notebook)"><span>All pages</span><b class="tab-count" id="nav-page-count"></b></a>
            <a class="tab" id="nav-insights" data-anchor="nav-insights" style="--tab: var(--tab-insights)"><span>Insights</span></a>
          </nav>
          <div class="cover-footer" id="demo-sidebar-footer">
            <p class="storage-chip">Private to this browser</p>
          </div>
        </aside>
        <div class="page-wrap">
          <div class="binding" aria-hidden="true"></div>
          <main class="page" id="demo-page">
            <div class="demo-view-layer" id="demo-view-out" style="display:none;"></div>
            <div class="demo-view-layer" id="demo-view-in"></div>
          </main>
        </div>
      </div>

      <div class="demo-modal-backdrop" id="demo-modal"></div>
      <div class="demo-toast" id="demo-toast" style="display:none;"></div>
    </div>
  </div>

  <div class="demo-ripple" id="demo-ripple" style="display:none;"></div>
  <div class="demo-cursor" id="demo-cursor"></div>
</div>

<script>
(function () {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = t => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const quintOut = t => {
    const x = clamp(t, 0, 1);
    return 1 - Math.pow(1 - x, 5);
  };
  const quintInOut = t => {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2;
  };
  const cubicInOut = t => {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };

  // Analytical underdamped spring curve (0 -> 1 with slight natural Apple overshoot)
  function springOut(t, stiffness = 240, damping = 20) {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(stiffness);
    const zeta = damping / (2 * w0);
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const decay = Math.exp(-zeta * w0 * t);
      return 1 - decay * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
    }
    const decay = Math.exp(-w0 * t);
    return 1 - decay * (1 + w0 * t);
  }

  const seg = (t, t0, t1, fn = cubicInOut) => fn(clamp((t - t0) / (t1 - t0), 0, 1));
  const QUICK_URL = "https://boards.greenhouse.io/stripe/jobs/98765";
  const CHAPTER = ${JSON.stringify(CHAPTERS)};
  const AT = ${JSON.stringify(ACTIONS)};
  const LOOP_END = ${LOOP_REST_START};
  const VIEW_W = ${VIEWPORT_WIDTH}, VIEW_H = ${VIEWPORT_HEIGHT};
  const WIN_W = ${WINDOW_WIDTH}, WIN_H = ${WINDOW_HEIGHT}, MARGIN = ${FRAME_MARGIN};
  const STAGES = ["SAVED", "APPLIED", "INTERVIEW", "OFFER"];

  // Contextual macOS cursors (Arrow, Text I-Beam, Open Grab Hand, Closed Grabbing Hand)
  const CURSORS = {
    arrow: {
      hotspot: [4, 3],
      svg: \`<svg viewBox="0 0 28 32" width="26" height="30" aria-hidden="true"><path d="M4.2 2.6 L22.5 14.2 L13.8 16.4 L18.2 25.4 L14.6 27.1 L10.2 18.1 L4.4 23.4 Z" fill="#0f172a" stroke="#ffffff" stroke-width="2.1" stroke-linejoin="round"/></svg>\`
    },
    ibeam: {
      hotspot: [12, 15],
      svg: \`<svg viewBox="0 0 24 30" width="22" height="28" aria-hidden="true"><path d="M8 4.5 h8 M12 4.5 v21 M8 25.5 h8" stroke="#ffffff" stroke-width="4.2" stroke-linecap="round" fill="none"/><path d="M8 4.5 h8 M12 4.5 v21 M8 25.5 h8" stroke="#0f172a" stroke-width="2" stroke-linecap="round" fill="none"/></svg>\`
    },
    grab: {
      hotspot: [13, 13],
      svg: \`<svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true"><path d="M10.5 13V6.5a1.6 1.6 0 0 1 3.2 0V12m0-4.5a1.6 1.6 0 0 1 3.2 0V12m0-3.5a1.6 1.6 0 0 1 3.2 0V13m0-1.5a1.5 1.5 0 0 1 3 0v5.3c0 4.2-2.9 7.2-7 7.2h-1.8c-2.6 0-4.6-1.3-6.1-3.4l-2.6-3.7a1.5 1.5 0 0 1 2.4-1.8l2 2.2V9.5a1.5 1.5 0 0 1 3 0" fill="#ffffff" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>\`
    },
    grabbing: {
      hotspot: [13, 14],
      svg: \`<svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true"><path d="M9.5 13.5v-3a1.6 1.6 0 0 1 3.2 0v2m0-2.4a1.6 1.6 0 0 1 3.2 0v2.4m0-2a1.6 1.6 0 0 1 3.2 0v2.5m0-1.5a1.5 1.5 0 0 1 3 0v4.8c0 4.1-2.8 7-6.8 7h-1.8c-2.5 0-4.4-1.2-5.9-3.3l-2.1-3a1.5 1.5 0 0 1 2.4-1.8l1.6 1.6v-3.3z" fill="#ffffff" stroke="#0f172a" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/></svg>\`
    }
  };

  const DEMO = {
    weekday: { label: "Tuesday, Nov 17", index: 1, sent: [2, 3], goal: 6 },
    priorities: [
      { date: "Wed Nov 18", time: "10 am", title: "Cedar Grove technical screen", note: "Remote · 45 min" },
      { date: "Fri Nov 20", time: "Due", title: "Northwind application deadline", note: "Waterloo, ON · Backend Intern" }
    ],
    archived: { SAVED: 1, APPLIED: 7, INTERVIEW: 3, OFFER: 2 },
    applications: [
      { company: "Northwind", role: "Backend Intern", stage: "SAVED", skills: ["Python", "SQL"] },
      { company: "Figma", role: "Product Design Intern", stage: "SAVED", skills: ["Figma"] },
      { company: "Linear", role: "Software Intern", stage: "SAVED", skills: ["TypeScript"] },
      { company: "Shopify", role: "Frontend Intern", stage: "APPLIED", skills: ["TypeScript", "React"] },
      { company: "Datadog", role: "Platform Intern", stage: "APPLIED", skills: ["Go"] },
      { company: "Ramp", role: "Product Engineer Intern", stage: "APPLIED", skills: ["TypeScript"] },
      { company: "Cedar Grove", role: "ML Engineering Intern", stage: "INTERVIEW", skills: ["Python", "PyTorch"] },
      { company: "Ada", role: "Data Engineer Intern", stage: "INTERVIEW", skills: ["Python", "SQL"] },
      { company: "Vercel", role: "Web Platform Intern", stage: "INTERVIEW", skills: ["TypeScript"] },
      { company: "Kitebird", role: "Platform Intern", stage: "OFFER", skills: ["Go"] }
    ],
    stripe: { company: "Stripe", role: "Software Engineer Intern", location: "Seattle, WA", skills: ["Python", "Go", "SQL"] },
    openingTerm: "Summer 2027",
    openings: [
      { company: "Cloudflare", role: "Systems Engineer Intern", location: "Austin, TX", term: "Summer 2027", skills: ["Go"] },
      { company: "Notion", role: "Product Engineer Intern", location: "New York, NY", term: "Fall 2027" },
      { company: "Wealthsimple", role: "Software Developer Intern", location: "Toronto, ON", term: "Summer 2027" },
      { company: "Fathom", role: "Data Engineering Intern", location: "Vancouver, BC", term: "Summer 2027" },
      { company: "Sentry", role: "Developer Tools Intern", location: "Toronto, ON", term: "Summer 2027" },
      { company: "Zipline", role: "Flight Software Intern", location: "South SF, CA", term: "Summer 2027" }
    ],
    prep: { practiced: 3, total: 6, score: 88 }
  };
  const featuredOpening = DEMO.openings[0];
  const stripeSavedAt = AT.saveStripe + 0.15;
  const percent = (part, total) => Math.round(100 * part / total);

  function notebookAt(t) {
    const active = [...DEMO.applications];
    if (t >= stripeSavedAt) {
      active.push({ ...DEMO.stripe, stage: t >= AT.dropStripe ? "INTERVIEW" : "APPLIED" });
    }
    if (t >= AT.saveOpening) active.push({ ...featuredOpening, stage: "SAVED" });
    const counts = STAGES.map(stage => active.filter(app => app.stage === stage).length);
    const funnel = STAGES.map((_, i) => STAGES.slice(i).reduce(
      (total, stage, offset) => total + counts[i + offset] + DEMO.archived[stage], 0
    ));
    return { active, counts, funnel, total: funnel[0] };
  }

  function renderTodayView(t, { calendar = false } = {}) {
    const { active, counts, funnel } = notebookAt(t);
    const { weekday, priorities } = DEMO;
    const sentThisWeek = weekday.sent.reduce((sum, sent) => sum + sent, 0);
    const menuOpen = calendar && t >= AT.openExport && t < AT.downloadCalendar + 0.12;

    return \`
      <section class="view \${calendar ? "demo-calendar-view" : "demo-today-view"}">
        <header class="view-head">
          <div>
            <p class="eyebrow" style="--tab: var(--tab-today)">Today</p>
            <h1 class="view-title">\${calendar ? "Deadlines &amp; Calendar" : "Good morning, Jordan"}<span class="dot">.</span></h1>
            <p class="view-sub">\${weekday.label} · \${priorities.length} priorities due this week</p>
          </div>
          \${calendar ? \`
            <div class="demo-export">
              <button class="button \${t >= AT.openExport - 0.25 && t < AT.openExport ? "is-hovered" : ""}" data-anchor="open-export" aria-expanded="\${menuOpen}" type="button">Export</button>
              \${menuOpen ? \`<div class="card demo-export-menu">
                <button class="button \${t >= AT.downloadCalendar - 0.25 ? "is-hovered" : ""}" data-anchor="download-calendar" type="button">Download calendar (.ics)</button>
              </div>\` : ""}
            </div>\` : ""}
        </header>
        <section class="card strip" style="margin-bottom: 14px">
          <div class="strip-top">
            <div class="strip-figure"><strong>\${active.length}</strong><span>active applications</span></div>
            <div class="strip-rate">Response rate <b>\${percent(funnel[2], funnel[1])}%</b> (\${funnel[2]} of \${funnel[1]} sent)</div>
          </div>
          <div class="stack-bar">
            \${STAGES.map((stage, i) => \`<span style="flex-grow:\${counts[i]}; --s: var(--st-\${stage.toLowerCase()})"></span>\`).join("")}
          </div>
        </section>
        <div class="today-grid">
          <section class="card upcoming-card \${calendar ? "is-hovered" : ""}" data-anchor="radar-card" style="grid-column: span 7">
            <div class="card-head">
              <div>
                <h2 class="card-title">Deadline Radar</h2>
                <p class="card-note">Upcoming interviews and closing dates</p>
              </div>
            </div>
            <ul class="agenda">
              \${priorities.map((item, i) => \`
                <li class="agenda-day">
                  <span class="agenda-date">\${item.date}</span>
                  <div class="agenda-items">
                    <div class="agenda-item" style="background: var(--paper-2)">
                      <span class="agenda-kind" style="--s-bg: var(--st-\${i === 0 ? "interview" : "saved"}-bg)">\${item.time}</span>
                      <div class="agenda-text"><strong>\${item.title}</strong><span>\${item.note}</span></div>
                    </div>
                  </div>
                </li>\`).join("")}
            </ul>
            \${calendar ? '<p style="margin-top:16px"><span class="pill st-INTERVIEW">24 h and 2 h reminders</span></p>' : ""}
          </section>
          <section class="card goal-card" style="grid-column: span 5">
            <div class="card-head">
              <div>
                <h2 class="card-title">Weekly Goal</h2>
                <p class="card-note">Applications sent this week</p>
              </div>
            </div>
            <div class="ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="ring-track" cx="50" cy="50" r="42"></circle>
                <circle class="ring-fill" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="\${100 * sentThisWeek / weekday.goal} 100"></circle>
              </svg>
              <div class="ring-label"><strong>\${sentThisWeek} / \${weekday.goal}</strong><span>Sent</span></div>
            </div>
            <div class="week-dots">
              \${[..."MTWTFSS"].map((day, i) => \`
                <div class="week-dot \${i > weekday.index ? "future" : "has"} \${i === weekday.index ? "today" : ""}">
                  <i>\${day}</i><span>\${weekday.sent[i] ?? ""}</span>
                </div>\`).join("")}
            </div>
          </section>
        </div>
      </section>
    \`;
  }

  function renderBoardView(t, { measureDropSlot = false } = {}) {
    const isDragging = t >= AT.grabStripe && t < AT.dropStripe;
    const dropped = t >= AT.dropStripe;
    const filterPython = t >= AT.filterPython;
    const { active } = notebookAt(t);
    const matches = skill => active.filter(app => app.skills.includes(skill)).length;
    const cards = filterPython ? active.filter(app => app.skills.includes("Python")) : active;

    const dragP = seg(t, AT.grabStripe, AT.dropStripe, quintInOut);
    const lift = isDragging ? Math.sin(clamp((t - AT.grabStripe) / 0.25, 0, 1) * Math.PI * 0.5) *
      (1 - Math.pow(clamp((t - (AT.dropStripe - 0.18)) / 0.18, 0, 1), 2)) : 0;
    const dragStartPt = ANCHORS["card-stripe-applied"];
    const dragEndPt = ANCHORS["slot-interview"];
    const sourceHeight = dragStartPt?.height ?? 0;
    const slotGrow = measureDropSlot ? 1 : seg(t, AT.grabStripe, AT.grabStripe + 0.35, smoothstep);
    const settle = seg(t, AT.dropStripe, AT.dropStripe + 0.15, smoothstep);
    const interviewHeight = ANCHORS["card-stripe-interview"]?.height ?? sourceHeight;
    const landingStyle = dropped && settle < 1
      ? \`height:\${lerp(sourceHeight, interviewHeight, settle)}px; overflow:hidden;\` : "";
    const stamp = clamp(springOut(t - AT.dropStripe, 320, 20), 0, 1.1);

    const renderCard = (app, { ghost = false, style = "" } = {}) => {
      const stripe = app.company === DEMO.stripe.company;
      const hover = stripe && !ghost && (!dropped
        ? t >= AT.grabStripe - 0.22
        : t >= CHAPTER.prep - 0.25);
      const anchor = stripe && !ghost ? \`data-anchor="card-stripe-\${dropped ? "interview" : "applied"}"\` : "";
      const dragClass = ghost ? "demo-drag-card" : stripe && isDragging ? "drag-origin" : "";
      return \`
        <article class="app-card st-\${app.stage} \${dragClass} \${hover ? "is-hovered" : ""}" \${anchor} \${ghost ? 'aria-hidden="true"' : ""} style="\${style}">
          <div class="app-card-top"><span class="app-company">\${app.company}</span></div>
          <h3 class="app-role">\${app.role}</h3>
          \${app.location ? \`<div class="app-meta"><span>\${app.location}</span></div>\` : ""}
          <div class="chips">\${app.skills.map(skill => \`<span class="chip">\${skill}</span>\`).join("")}</div>
          \${stripe && dropped ? \`<span class="demo-history-stamp" style="transform:scale(\${stamp.toFixed(3)}); opacity:\${clamp(stamp * 1.4, 0, 1).toFixed(2)}">Moved to Interview</span>\` : ""}
        </article>\`;
    };

    const dragX = isDragging ? lerp(dragStartPt.x, dragEndPt.x, dragP) - pageOrigin.x : 0;
    const dragY = isDragging ? lerp(dragStartPt.y, dragEndPt.y, dragP) - pageOrigin.y - Math.sin(dragP * Math.PI) * 26 : 0;
    const ghostStyle = \`left:\${dragX}px; top:\${dragY}px; width:\${dragStartPt?.width}px; transform: translate(-50%, -50%) scale(\${1 + 0.048 * lift}) rotate(\${-1.8 * lift}deg)\`;

    return \`
      <section class="view demo-board-view">
        <header class="view-head">
          <div>
            <p class="eyebrow" style="--tab: var(--tab-board)">Board</p>
            <h1 class="view-title">Pipeline Board<span class="dot">.</span></h1>
          </div>
          <div class="filters" style="margin:0">
            <button type="button" class="filter-chip" aria-pressed="\${!filterPython}">All (\${active.length})</button>
            <button type="button" class="filter-chip \${t >= AT.filterPython - 0.25 && !filterPython ? "is-hovered" : ""}" data-anchor="chip-python" aria-pressed="\${filterPython}">Python (\${matches("Python")})</button>
            <button type="button" class="filter-chip" aria-pressed="false">TypeScript (\${matches("TypeScript")})</button>
          </div>
        </header>
        <div class="board">
          \${STAGES.map(stage => {
            const column = cards.filter(app => app.stage === stage);
            column.sort((a, b) => Number(b.company === DEMO.stripe.company) - Number(a.company === DEMO.stripe.company));
            const dropSlot = stage === "INTERVIEW" && (isDragging || measureDropSlot);
            const slotSpace = sourceHeight + ${BOARD_CARD_GAP};
            const padding = dropSlot ? slotSpace * slotGrow
              : stage === "APPLIED" && dropped ? slotSpace * (1 - settle) : 0;
            return \`<section class="column st-\${stage} \${isDragging && stage === "INTERVIEW" ? "drop" : ""}">
              <div class="column-head"><span class="dot"></span><h2>\${stage}</h2><span class="count">\${column.length}</span></div>
              <div class="column-cards" style="padding-top:\${padding}px">
                \${dropSlot ? \`<div class="demo-drop-slot" data-anchor="slot-interview" style="height:\${sourceHeight * slotGrow}px; opacity:\${slotGrow.toFixed(2)}"></div>\` : ""}
                \${column.length ? column.map(app => renderCard(app, {
                  style: app.company === DEMO.stripe.company ? landingStyle : ""
                })).join("") : '<p class="column-empty">No matches</p>'}
              </div>
            </section>\`;
          }).join("")}
        </div>
        \${isDragging ? renderCard({ ...DEMO.stripe, stage: "APPLIED" }, { ghost: true, style: ghostStyle }) : ""}
      </section>
    \`;
  }

  function renderOpeningsView(t) {
    const filtered = t >= AT.filterTerm;
    const saved = t >= AT.saveOpening;
    const { active } = notebookAt(t);
    const summerOpenings = DEMO.openings.filter(opening => opening.term === DEMO.openingTerm);
    const openings = filtered ? summerOpenings : DEMO.openings;
    return \`
      <section class="view demo-openings-view">
        <header class="view-head">
          <div>
            <p class="eyebrow" style="--tab: var(--tab-today)">Today</p>
            <h1 class="view-title">Internship Openings<span class="dot">.</span></h1>
            <p class="view-sub">\${openings.length} openings · \${active.length} active applications</p>
          </div>
          <button class="button \${t >= CHAPTER.calendar - 0.25 ? "is-hovered" : ""}" data-anchor="nav-calendar" type="button">Deadline Radar</button>
        </header>
        <div class="demo-openings-feed">
          <div class="filters" style="margin-bottom: 12px">
            <button class="filter-chip" aria-pressed="\${!filtered}" type="button">All terms (\${DEMO.openings.length})</button>
            <button class="filter-chip \${!filtered && t >= AT.filterTerm - 0.25 ? "is-hovered" : ""}" data-anchor="filter-term" aria-pressed="\${filtered}" type="button">\${DEMO.openingTerm} (\${summerOpenings.length})</button>
          </div>
          <div class="card demo-openings-list">
            \${openings.map(opening => {
              const featured = opening === featuredOpening;
              const isSaved = featured && saved;
              const hover = featured && !isSaved && t >= AT.saveOpening - 0.25;
              return \`
                <article class="demo-opening-row">
                  <strong>\${opening.company}</strong>
                  <span>\${opening.role}</span>
                  <small>\${opening.location}</small>
                  <small>\${opening.term}</small>
                  <button class="button small \${hover ? "is-hovered" : ""}" \${featured ? 'data-anchor="save-opening"' : ""} \${isSaved ? 'aria-pressed="true"' : ""} type="button">\${isSaved ? "Saved" : "Save"}</button>
                </article>\`;
            }).join("")}
          </div>
        </div>
      </section>
    \`;
  }

  let prepMockHeight = 0;
  let prepScroll = 0;
  function renderEntryPrepView(t, scrollTime = t) {
    const { company, role, location, skills } = DEMO.stripe;
    const { practiced, total, score } = DEMO.prep;
    const marked = t >= AT.markPracticed;
    const barWidth = 100 * (practiced + seg(t, AT.markPracticed, AT.markPracticed + 0.5, quintOut)) / total;
    const mockStart = AT.markPracticed + 0.18;
    const mockSpring = clamp(springOut(t - mockStart, 260, 21), 0, 1.06);
    const mockProgress = seg(t, mockStart, mockStart + 1.05, smoothstep);
    const mockScore = Math.round(lerp(62, score, mockProgress));
    const contextOpacity = 1 - seg(t, CHAPTER.prep + 0.4, PREP_SCROLL_START, smoothstep);
    const detailClass = FOCUS_SELECTORS.prep === PREP_DETAIL ? " prep-detail" : "";
    const questions = [
      { text: "Design an idempotent webhook delivery queue with retries in Go.", done: true },
      { text: "How would you trace a slow SQL query under production load?", done: false },
      { text: "Tell me about a system bottleneck you diagnosed and resolved (STAR).", done: marked, featured: true }
    ];

    return \`
      <article class="sheet-page demo-prep-page\${detailClass}" style="padding: 18px 28px 22px 76px; transform: translateY(\${-prepScrollOffset(scrollTime)}px); --prep-context-opacity: \${contextOpacity}; --prep-context-visibility: \${contextOpacity ? "visible" : "hidden"}">
        <div class="entry-head">
          <span class="entry-company">\${company}</span>
          <h1 class="entry-role" style="font-size: 1.78rem">\${role}</h1>
        </div>
        <div class="stepper">
          <div class="steps">
            <div class="step done st-SAVED"><span>Saved</span></div>
            <div class="step done st-APPLIED"><span>Applied</span></div>
            <div class="step current st-INTERVIEW"><span>Interview</span></div>
            <div class="step st-OFFER"><span>Offer</span></div>
          </div>
        </div>
        <div class="entry-fields">
          <div class="line-field"><span>Location</span><div style="padding:3px 0; font-weight:600">\${location}</div></div>
          <div class="line-field"><span>Skills</span><div style="padding:3px 0; font-weight:600">\${skills.join(", ")}</div></div>
        </div>
        <section class="prep" style="margin-top: 8px; padding-top: 12px">
          <div class="prep-head">
            <div>
              <h2 class="card-title">Role-matched interview prep</h2>
              <p class="prep-sub">Featured behavioral and backend prompts</p>
            </div>
            <span class="prep-summary">\${practiced + Number(marked)} of \${total} practiced</span>
          </div>
          <div class="prep-progress">
            <div class="prep-bar"><i style="width:\${barWidth.toFixed(1)}%"></i></div>
          </div>
          <div class="prep-group">
            <ul class="prep-list" style="padding: 4px 14px">
              \${questions.map(question => \`
                <li class="prep-q \${question.done ? "is-practiced" : ""}" \${question.featured ? 'data-focus="prep-question"' : ""}>
                  <span class="prep-text">\${question.text}</span>
                  <div class="prep-actions">
                    <button type="button" \${question.featured ? 'data-anchor="btn-mark-practiced"' : ""}
                      class="prep-mark practiced \${question.featured && t >= AT.markPracticed - 0.25 && !marked ? "is-hovered" : ""}" aria-pressed="\${question.done}">\${question.done ? "Practiced" : "Mark practiced"}</button>
                  </div>
                </li>\`).join("")}
            </ul>
          </div>
          <div class="demo-mock-card" style="min-height: \${prepMockHeight}px">
            <div class="demo-mock-score-box">
              <strong style="white-space:nowrap">\${t >= mockStart ? mockScore + " / 100" : "Mock"}</strong>
              <span>\${t >= mockStart ? "Readiness" : "Interview"}</span>
            </div>
            <div>
              <strong style="font-size: 0.94rem; color: var(--ink)">Timed mock interview</strong>
              <div class="demo-mock-metrics" style="transform: translateY(\${(1 - mockSpring) * 5}px)">
                \${t >= mockStart ? \`
                  <span class="demo-metric-pill good">STAR structure complete</span>
                  <span class="demo-metric-pill">\${Math.round(lerp(122, 138, mockProgress))} wpm</span>
                  <span class="demo-metric-pill">0 filler phrases</span>\` : '<span class="demo-metric-pill">Pace and STAR feedback</span>'}
              </div>
            </div>
          </div>
        </section>
      </article>
    \`;
  }

  function renderInsightsView(t, { active, funnel, total } = notebookAt(t)) {
    const [, sent, interview, offers] = funnel;
    const responseRate = percent(interview, sent);
    const barProgress = seg(t, CHAPTER.insights + 0.28, CHAPTER.insights + 1.28, quintOut);
    const barWidth = (value, max) => 100 * value / max * barProgress;
    const skillCounts = new Map();
    for (const app of active.filter(app => app.stage === "INTERVIEW" || app.stage === "OFFER")) {
      for (const skill of app.skills) skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
    }
    const topSkills = [...skillCounts].sort((a, b) => b[1] - a[1]).slice(0, 4);

    return \`
      <section class="view demo-insights-view">
        <header class="view-head">
          <div>
            <p class="eyebrow" style="--tab: var(--tab-insights)">Insights</p>
            <h1 class="view-title">Search Insights<span class="dot">.</span></h1>
            <p class="view-sub">Conversion rates and top skills across your notebook</p>
          </div>
        </header>
        <section class="kpis">
          <article class="card kpi"><p>Applications</p><strong>\${total}</strong><span>\${active.length} active</span></article>
          <article class="card kpi"><p>Response rate</p><strong>\${responseRate}%</strong><span>\${interview} of \${sent} sent</span></article>
          <article class="card kpi"><p>Interviews</p><strong>\${interview}</strong><span>\${responseRate}% of sent</span></article>
          <article class="card kpi"><p>Offers</p><strong>\${offers}</strong><span>\${percent(offers, sent)}% of sent</span></article>
          <article class="card kpi"><p>Mock score</p><strong>\${DEMO.prep.score}</strong><span>Out of 100</span></article>
        </section>
        <div class="insight-grid">
          <section class="card" data-anchor="funnel-card">
            <div class="card-head"><div><h2 class="card-title">Conversion Funnel</h2><p class="card-note">Share of all applications by stage reached</p></div></div>
            <div class="funnel">
              \${["Saved", "Applied", "Interview", "Offer"].map((label, i) => {
                const share = percent(funnel[i], total);
                return \`<div class="funnel-row">
                  <span>\${label}</span>
                  <div class="funnel-track"><div class="funnel-bar" style="width:\${barWidth(funnel[i], total)}%; background: var(--st-\${label.toLowerCase()})"></div></div>
                  <span class="funnel-value">\${funnel[i]} <small>(\${share}%)</small></span>
                </div>\`;
              }).join("")}
            </div>
          </section>
          <section class="card">
            <div class="card-head"><div><h2 class="card-title">Top Skills in Interviews</h2><p class="card-note">Most common tags among active interviews and offers</p></div></div>
            <div class="skill-bars">
              \${topSkills.map(([skill, count]) => \`<div class="skill-bar"><span>\${skill}</span><i style="width:\${barWidth(count, topSkills[0][1])}%"></i><b>\${count}</b></div>\`).join("")}
            </div>
          </section>
        </div>
      </section>
    \`;
  }

  function renderModal(t, { forceOpen = false } = {}) {
    const modal = document.getElementById("demo-modal");
    const openT = AT.newPage;
    const closeT = AT.saveStripe;

    if (!forceOpen && (t < openT || t >= closeT + 0.34)) {
      modal.style.opacity = "0";
      modal.innerHTML = "";
      return;
    }

    let backdropOpacity = 1;
    let cardScale = 1;
    let cardY = 0;

    if (!forceOpen) {
      if (t < openT + 0.36) {
        const dt = t - openT;
        const sp = springOut(dt, 280, 22);
        backdropOpacity = clamp(dt / 0.22, 0, 1);
        cardScale = lerp(0.92, 1, sp);
        cardY = lerp(14, 0, sp);
      } else if (t >= closeT) {
        const p = seg(t, closeT, closeT + 0.32, quintOut);
        backdropOpacity = 1 - p;
        cardScale = lerp(1, 0.94, p);
        cardY = lerp(0, 10, p);
      }
    }

    const focused = !forceOpen && t >= AT.focusLink && t < AT.fill;
    const pasted = forceOpen || t >= AT.pasteLink;

    const fillClickT = AT.fill;
    const filled = forceOpen || t >= fillClickT + 0.04;
    const fillHover = !forceOpen && t >= fillClickT - 0.17 && t < fillClickT;
    const saveHover = !forceOpen && t >= closeT - 0.35 && t < closeT;

    const fieldReveal = (idx) => {
      if (forceOpen) return { op: 1, flash: false };
      const start = fillClickT + 0.05 + idx * 0.065;
      if (t < start) return { op: 0, flash: false };
      return {
        op: clamp((t - start) / 0.16, 0, 1),
        flash: t >= start && t < start + 0.72
      };
    };

    const fields = [
      { label: "Company", val: DEMO.stripe.company, empty: "e.g. Shopify", idx: 0 },
      { label: "Role", val: DEMO.stripe.role, empty: "e.g. Backend Intern", idx: 1 },
      { label: "Location", val: DEMO.stripe.location, empty: "City or Remote", idx: 2 },
      { label: "Skills", val: DEMO.stripe.skills.join(", "), empty: "Comma separated", idx: 3 }
    ];

    modal.style.opacity = backdropOpacity.toFixed(3);
    modal.innerHTML = \`
      <div class="demo-modal-card" style="transform: translateY(\${cardY.toFixed(1)}px) scale(\${cardScale.toFixed(4)});">
        <header class="sheet-head">
          <div>
            <p class="eyebrow">New page</p>
            <h2>Add an application</h2>
          </div>
        </header>
        <div class="sheet-body">
          <div class="quickfill-bar">
            <span class="field-label">Quick fill from link or job text</span>
            <div class="quickfill-row">
              <div class="demo-quickfill-display \${focused ? "is-focused" : ""}" data-anchor="quickfill-input">
                \${pasted ? \`<span>\${QUICK_URL}</span>\` : '<span class="demo-quickfill-placeholder">Paste a job URL or title...</span>'}
                \${focused && pasted ? '<span class="demo-typing-caret"></span>' : ""}
              </div>
              <button class="button small \${fillHover ? "is-hovered" : ""}" data-anchor="quickfill-fill" type="button">Fill</button>
            </div>
          </div>
          <div class="field-grid">
            \${fields.map(f => {
              const rev = fieldReveal(f.idx);
              const showVal = filled && rev.op > 0;
              return \`
                <div class="field">
                  <span class="field-label">\${f.label}</span>
                  <div class="demo-field-box \${showVal ? (rev.flash ? "demo-autofill-flash" : "") : "is-empty"}" style="\${showVal && rev.op < 1 ? \`opacity:\${rev.op.toFixed(2)}; transform:translateY(\${((1 - rev.op) * 4).toFixed(1)}px);\` : ""}">\${showVal ? f.val : f.empty}</div>
                </div>
              \`;
            }).join("")}
          </div>
        </div>
        <footer class="sheet-foot">
          <button class="button ghost" type="button">Cancel</button>
          <button class="button primary \${saveHover ? "is-hovered" : ""}" data-anchor="modal-save" type="button">Save to notebook</button>
        </footer>
      </div>
    \`;
  }

  const WIN_LEFT = (VIEW_W - WIN_W) / 2;
  const WIN_TOP = (VIEW_H - WIN_H) / 2;
  const VIEW_TRANSITION_SEC = 0.32;
  const SWITCH_LEAD_SEC = 0.3;
  const BOARD_APPROACH = CHAPTER.board + VIEW_TRANSITION_SEC + 0.05;
  const PYTHON_APPROACH = 7.68;
  const BRAND_TEXT = ".cover-title, .cover-sub";
  const PREP_FULL = ".demo-prep-page :is(.prep-group, .demo-mock-card)";
  const PREP_DETAIL = '.demo-prep-page :is([data-focus="prep-question"], .demo-mock-card)';
  const PREP_SCROLL_START = CHAPTER.prep + 0.7;
  const PREP_SCROLL_END = CHAPTER.prep + 1.55;
  const PREP_HOLD_END = 13.97;
  const FOCUS_SELECTORS = {
    overview: "#demo-window",
    brand: BRAND_TEXT,
    "quick-fill": "#demo-modal .demo-modal-card, .demo-today-view .view-head > div",
    prep: PREP_FULL,
    export: BRAND_TEXT + ', .demo-calendar-view .view-head, [data-anchor="radar-card"], .demo-export-menu'
  };

  // [Time, target scale, focus].
  const CAMERA_KEYS = [
    [0, 1, "overview"],
    [AT.newPage, 1, "overview"],
    [1.92, 1.25, "quick-fill"],
    [3.20, 1.25, "quick-fill"],
    [4.60, 1, "overview"],
    [PREP_SCROLL_END, 1, "overview"],
    [12.75, 1.30, "prep"],
    [13.36, 1.30, "prep"],
    [14.66, 1, "overview"],
    [21.10, 1, "overview"],
    [22.36, 1.25, "export"],
    [22.95, 1.25, "export"],
    [24.30, 1, "overview"],
    [LOOP_END, 1, "overview"]
  ];
  const FOCUS_RECTS = {};

  function enclosingRect(rects) {
    return {
      left: Math.min(...rects.map(r => r.left)),
      top: Math.min(...rects.map(r => r.top)),
      right: Math.max(...rects.map(r => r.right)),
      bottom: Math.max(...rects.map(r => r.bottom))
    };
  }

  function focusRect(name, root = document) {
    const rects = [...root.querySelectorAll(FOCUS_SELECTORS[name])].filter(visible)
      .map(el => el.getBoundingClientRect());
    return rects.length ? enclosingRect(rects) : null;
  }

  function focusFit(rect) {
    return Math.min(
      (VIEW_W - 2 * ${FOCUS_MARGIN}) / (rect.right - rect.left),
      (VIEW_H - 2 * ${FOCUS_MARGIN}) / (rect.bottom - rect.top)
    );
  }

  function prepSelector(finalRect) {
    return focusFit(finalRect) < 1.2 ? PREP_DETAIL : PREP_FULL;
  }

  function prepScrollOffset(t) {
    return prepScroll * seg(t, PREP_SCROLL_START, PREP_SCROLL_END, quintInOut);
  }

  function verticalAim(rect, scale, offsetY = 0) {
    const margin = ${FOCUS_MARGIN} + 0.01;
    const room = VIEW_H - WIN_H * scale;
    const minRoom = Math.min(room * 0.005, room * 0.995);
    const maxRoom = Math.max(room * 0.005, room * 0.995);
    const minAim = margin - (rect.top - WIN_TOP) * scale;
    const maxAim = VIEW_H - margin - (rect.bottom - WIN_TOP) * scale;
    const centerY = (rect.top + rect.bottom) / 2 + offsetY;
    return clamp(clamp(VIEW_H / 2 - (centerY - WIN_TOP) * scale, minAim, maxAim), minRoom, maxRoom);
  }

  function cameraKeyPoses() {
    return CAMERA_KEYS.map(([time, targetScale, focus]) => {
      const rect = FOCUS_RECTS[focus];
      const fit = focusFit(rect);
      const scale = Math.min(targetScale, fit - 0.0001);
      const room = VIEW_H - WIN_H * scale;
      const brandAim = 1 - (FOCUS_RECTS.brand.top - WIN_TOP) * scale;
      const aim = Math.max(verticalAim(rect, scale, focus === "prep" ? 0 : -VIEW_H), brandAim);
      const vertical = focus === "overview" || room === 0 ? 0.5 : aim / room;
      return { time, scale, fit, focus, vertical };
    });
  }

  let cameraPoses;
  function computeCamera(t) {
    const i = cameraPoses.findLastIndex(key => key.time <= t);
    const a = cameraPoses[i];
    const b = cameraPoses[i + 1] ?? a;
    // A monotone cubic with zero tangents joins each move to its neighboring holds.
    const p = a === b ? 0 : seg(t, a.time, b.time, smoothstep);
    const scale = Math.exp(lerp(Math.log(a.scale), Math.log(b.scale), p));
    const close = a.focus === "overview" ? b : a;
    const blend = close.scale > 1 ? seg(scale, 1, Math.min(1.1, close.scale), smoothstep) : 0;
    const horizontal = lerp(0.5, 0.02, blend);
    const vertical = lerp(0.5, close.vertical, blend);
    // Align matching window and stage anchors so the zoom moves around its focal point.
    const tx = VIEW_W * horizontal - (WIN_LEFT + WIN_W * horizontal) * scale;
    const ty = VIEW_H * vertical - (WIN_TOP + WIN_H * vertical) * scale;
    return { scale, tx, ty, focus: scale <= 1.02 ? "overview" : close.focus };
  }

  const ANCHORS = {};
  let pageOrigin;
  function measureAnchors() {
    const view = document.getElementById("demo-view-in");
    const pageRect = document.getElementById("demo-page").getBoundingClientRect();
    pageOrigin = { x: pageRect.left, y: pageRect.top };

    const capture = (root, ...names) => {
      for (const name of names) {
        const el = root.querySelector('[data-anchor="' + name + '"]');
        const r = el?.getBoundingClientRect();
        if (!r?.width || !r.height) throw new Error("Missing cursor anchor: " + name);
        ANCHORS[name] = {
          x: r.left + r.width / 2, y: r.top + r.height / 2,
          left: r.left, top: r.top, width: r.width, height: r.height
        };
      }
    };

    const captureFocus = (...names) => {
      for (const name of names) {
        const current = focusRect(name);
        if (!current) throw new Error("Missing camera focus: " + name);
        const previous = FOCUS_RECTS[name];
        FOCUS_RECTS[name] = previous ? enclosingRect([previous, current]) : current;
      }
    };
    captureFocus("overview", "brand");
    capture(document, "nav-new", "nav-board", "nav-today", "nav-insights");
    view.innerHTML = renderTodayView(0);
    renderModal(0, { forceOpen: true });
    capture(document, "quickfill-input", "quickfill-fill", "modal-save");
    captureFocus("quick-fill");
    renderModal(0);

    view.innerHTML = renderBoardView(CHAPTER.board);
    capture(view, "card-stripe-applied", "chip-python");
    view.innerHTML = renderBoardView(CHAPTER.board, { measureDropSlot: true });
    capture(view, "slot-interview");
    view.innerHTML = renderBoardView(AT.filterPython);
    capture(view, "card-stripe-interview");
    view.innerHTML = renderEntryPrepView(PREP_HOLD_END);
    prepMockHeight = view.querySelector(".demo-mock-card").getBoundingClientRect().height;
    const fullPrep = focusRect("prep", view);
    if (!fullPrep) throw new Error("Missing camera focus: prep");
    FOCUS_SELECTORS.prep = prepSelector(fullPrep);
    const finalPrep = focusRect("prep", view);
    if (!finalPrep) throw new Error("Missing settled camera focus: prep");
    prepScroll = Math.max(0, (finalPrep.top + finalPrep.bottom - VIEW_H) / 2);
    view.innerHTML = renderEntryPrepView(PREP_HOLD_END);
    captureFocus("prep");
    view.innerHTML = renderEntryPrepView(CHAPTER.prep, PREP_HOLD_END);
    capture(view, "btn-mark-practiced");
    captureFocus("prep");
    view.innerHTML = renderEntryPrepView(AT.markPracticed + 0.18, PREP_HOLD_END);
    captureFocus("prep");
    view.innerHTML = renderOpeningsView(AT.filterTerm);
    capture(view, "filter-term", "save-opening", "nav-calendar");
    view.innerHTML = renderTodayView(AT.openExport, { calendar: true });
    capture(view, "open-export", "download-calendar", "radar-card");
    captureFocus("export");
    view.innerHTML = renderInsightsView(CHAPTER.insights);
    capture(view, "funnel-card");
  }

  function pt(name, dx = 0, dy = 0) {
    const a = ANCHORS[name];
    return { x: a.x + dx, y: a.y + dy, anchor: name };
  }

  function quadBezier(p0, p1, t, arcSign = 1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
    const offset = Math.min(44, dist * 0.16) * arcSign;
    const cx = (p0.x + p1.x) / 2 + (-dy / dist) * offset;
    const cy = (p0.y + p1.y) / 2 + (dx / dist) * offset;
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * cx + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * cy + t * t * p1.y
    };
  }

  const REST = { x: 740, y: 380 };
  const CLIPPER_READ = { x: 640, y: 455 };
  const PREP_READ = { x: 625, y: 515 };
  const OPENINGS_READ = { x: 705, y: 555 };
  const CALENDAR_READ = { x: 605, y: 500 };
  let cursorStops;

  function buildCursorTimeline() {
    // Each stop is [arrival, departure, target, cursor, arc direction to next stop].
    return [
      [0, 0, REST, "arrow", 1],
      [AT.newPage - 0.14, AT.newPage + 0.04, pt("nav-new"), "arrow", -1],
      [AT.focusLink - 0.03, 1.98, pt("quickfill-input", -30), "ibeam", -1],
      [AT.fill - 0.14, AT.fill + 0.06, pt("quickfill-fill"), "arrow", 1],
      [3.10, 3.10, CLIPPER_READ, "arrow", 1],
      [AT.saveStripe - 0.35, AT.saveStripe + 0.06, pt("modal-save"), "arrow", -1],
      [CHAPTER.board - 0.14, BOARD_APPROACH, pt("nav-board"), "arrow", 1],
      [AT.grabStripe - 0.25, AT.grabStripe, pt("card-stripe-applied"), "grab", 0],
      [AT.dropStripe, PYTHON_APPROACH, pt("slot-interview"), "grab", -1],
      [AT.filterPython - 0.21, AT.filterPython + 0.15, pt("chip-python"), "arrow", 1],
      [AT.openStripe - 0.27, AT.openStripe + 0.11, pt("card-stripe-interview"), "arrow", -1],
      [AT.markPracticed - 0.26, AT.markPracticed + 0.1, pt("btn-mark-practiced"), "arrow", 1],
      [13.5, 14.27, PREP_READ, "arrow", -1],
      [CHAPTER.openings - 0.18, CHAPTER.openings + 0.19, pt("nav-today"), "arrow", 1],
      [AT.filterTerm - 0.25, AT.filterTerm + 0.15, pt("filter-term"), "arrow", -1],
      [AT.saveOpening - 0.25, AT.saveOpening + 0.16, pt("save-opening"), "arrow", 1],
      [19.0, 19.4, OPENINGS_READ, "arrow", -1],
      [CHAPTER.calendar - 0.2, CHAPTER.calendar + 0.12, pt("nav-calendar"), "arrow", -1],
      [AT.openExport - 0.25, AT.openExport + 0.12, pt("open-export"), "arrow", 1],
      [AT.downloadCalendar - 0.25, AT.downloadCalendar + 0.12, pt("download-calendar"), "arrow", 1],
      [23.45, 23.95, pt("radar-card", 0, -8), "arrow", -1],
      [24.05, 24.15, CALENDAR_READ, "arrow", -1],
      [CHAPTER.insights - 0.2, CHAPTER.insights + 0.18, pt("nav-insights"), "arrow", 1],
      [26.32, 27.42, pt("funnel-card", -20, 10), "arrow", -1],
      [28.52, LOOP_END, REST, "arrow", 0]
    ];
  }

  const CLICKS = [
    [AT.newPage, "nav-new"], [AT.focusLink, "quickfill-input", -30],
    [AT.fill, "quickfill-fill"], [AT.saveStripe, "modal-save"],
    [CHAPTER.board, "nav-board"], [AT.grabStripe, "card-stripe-applied"], [AT.dropStripe, "slot-interview"],
    [AT.filterPython, "chip-python"], [AT.openStripe, "card-stripe-interview"],
    [AT.markPracticed, "btn-mark-practiced"], [CHAPTER.openings, "nav-today"],
    [AT.filterTerm, "filter-term"], [AT.saveOpening, "save-opening"],
    [CHAPTER.calendar, "nav-calendar"], [AT.openExport, "open-export"],
    [AT.downloadCalendar, "download-calendar"], [CHAPTER.insights, "nav-insights"]
  ];

  function cursorState(t) {
    const click = CLICKS.find(([time]) => t >= time - 0.06 && t <= time + 0.14);
    const pressDip = click ? 1 - 0.16 * clamp(t < click[0]
      ? (t - click[0] + 0.06) / 0.06
      : 1 - (t - click[0]) / 0.14, 0, 1) : 1;

    for (let i = 0; i < cursorStops.length; i++) {
      const [arrival, departure, pos, kind, sign] = cursorStops[i];
      if (t >= arrival && t <= departure) return { ...pos, kind, scale: pressDip };
      const next = cursorStops[i + 1];
      if (!next || t < departure || t >= next[0]) continue;
      const p = seg(t, departure, next[0], quintInOut);
      const dest = next[2];
      const dragging = departure === AT.grabStripe;
      const moved = dragging
        ? { x: lerp(pos.x, dest.x, p), y: lerp(pos.y, dest.y, p) - Math.sin(p * Math.PI) * 26 }
        : quadBezier(pos, dest, p, sign);
      return { ...moved, kind: dragging ? "grabbing" : "arrow", scale: pressDip };
    }
    return { ...REST, kind: "arrow", scale: 1 };
  }

  function activeRipple(t) {
    const click = CLICKS.find(([time]) => t >= time && t < time + 0.42);
    if (!click) return null;
    const [time, name, dx] = click;
    const p = seg(t, time, time + 0.42, quintOut);
    return { ...pt(name, dx), scale: 0.45 + p * 1.1, opacity: (1 - p) * 0.9 };
  }

  const SCENES = [
    [CHAPTER.clipper, "today", renderTodayView],
    [CHAPTER.board, "board", renderBoardView],
    [CHAPTER.prep, "board", renderEntryPrepView],
    [CHAPTER.openings, "today", renderOpeningsView],
    [CHAPTER.calendar, "today", t => renderTodayView(t, { calendar: true })],
    [CHAPTER.insights, "insights", renderInsightsView]
  ];
  const TOASTS = [
    [stripeSavedAt, 4.95, DEMO.stripe.company + " saved to notebook"],
    [AT.saveOpening, 19.10, featuredOpening.company + " saved to notebook"],
    [AT.downloadCalendar, 24.55, "Calendar file with 24 h and 2 h reminders"]
  ];

  let lastCursorKind = "";
  const sceneTime = t => t >= LOOP_END ? 0 : t;
  window.__setDemoTime = function (t) {
    t = sceneTime(t);
    const viewOut = document.getElementById("demo-view-out");
    const viewIn = document.getElementById("demo-view-in");
    const navNew = document.getElementById("nav-new-btn");
    const toast = document.getElementById("demo-toast");
    const sceneIndex = SCENES.findLastIndex(([start]) => t >= start);
    const [start, section, render] = SCENES[sceneIndex];
    const notebook = notebookAt(t);

    document.getElementById("nav-board-count").textContent = notebook.active.length;
    document.getElementById("nav-page-count").textContent = notebook.total;
    const nextSection = SCENES[sceneIndex + 1];
    for (const name of ["today", "board", "insights"]) {
      const tab = document.getElementById("nav-" + name);
      if (name === section) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
      tab.classList.toggle("is-hovered", name !== section && name === nextSection?.[1] && t >= nextSection[0] - 0.18);
    }
    navNew.classList.toggle("is-hovered", t >= AT.newPage - 0.14 && t < AT.newPage + 0.04);

    const transitionEnd = start + VIEW_TRANSITION_SEC;
    const isTransitioning = sceneIndex > 0 && t < transitionEnd;
    const dissolving = t >= AT.dissolve;
    const progress = dissolving ? seg(t, AT.dissolve, LOOP_END, smoothstep)
      : isTransitioning ? seg(t, start, transitionEnd, quintOut) : 1;
    const content = render === renderInsightsView ? render(t, notebook) : render(t);
    viewOut.style.display = isTransitioning || dissolving ? "block" : "none";
    viewOut.innerHTML = dissolving ? content
      : isTransitioning ? SCENES[sceneIndex - 1][2](start - 1 / ${FPS}) : "";
    viewOut.style.opacity = dissolving ? 1 : 1 - progress;
    viewOut.style.transform = isTransitioning ? \`translateY(\${-8 * progress}px)\` : "none";
    viewIn.innerHTML = dissolving ? renderTodayView(0) : content;
    viewIn.style.opacity = progress;
    viewIn.style.background = dissolving ? "inherit" : "";
    viewIn.style.transform = isTransitioning ? \`translateY(\${10 * (1 - progress)}px)\` : "none";

    const camera = document.getElementById("demo-camera");
    const cam = computeCamera(t);
    const windowBottom = (WIN_TOP + WIN_H) * cam.scale + cam.ty;
    const footerBottom = windowBottom - (1 + ${SIDEBAR_BOTTOM_PADDING}) * cam.scale;
    const footerOffset = Math.min(0, (VIEW_H - MARGIN - 1 - footerBottom) / cam.scale);
    document.getElementById("demo-sidebar-footer").style.transform = \`translateY(\${footerOffset}px)\`;
    const message = TOASTS.find(([from, until]) => t >= from && t < until);
    toast.style.display = message ? "flex" : "none";
    if (message) {
      const [from, until, label] = message;
      const rise = springOut(t - from, 280, 22);
      const fade = seg(t, until - 0.28, until, quintOut);
      const riseOffset = (1 - rise) * 12;
      const right = (WIN_LEFT + WIN_W) * cam.scale + cam.tx;
      if (toast.textContent !== label) toast.textContent = label;
      toast.style.opacity = clamp(rise * 1.4, 0, 1) * (1 - fade);
      toast.style.right = \`\${Math.max(20, (right - VIEW_W + MARGIN + 2) / cam.scale)}px\`;
      toast.style.bottom = \`\${Math.max(20, (windowBottom - VIEW_H + MARGIN + 2) / cam.scale + riseOffset)}px\`;
      toast.style.transform = \`translateY(\${riseOffset}px)\`;
    }
    renderModal(t);

    const squareCorners = seg(cam.scale, 1.04, ${ZOOM_COVER_THRESHOLD}, smoothstep);
    document.getElementById("demo-window").style.borderRadius = \`\${16 * (1 - squareCorners)}px\`;
    camera.style.transform =
      \`translate(\${cam.tx}px, \${cam.ty}px) scale(\${cam.scale})\`;

    const cur = cursorState(t);
    const cursor = document.getElementById("demo-cursor");
    const spec = CURSORS[cur.kind];
    const [hx, hy] = spec.hotspot;
    if (cur.kind !== lastCursorKind) {
      cursor.innerHTML = spec.svg;
      cursor.style.transformOrigin = \`\${hx}px \${hy}px\`;
      lastCursorKind = cur.kind;
    }
    cursor.style.transform = \`translate(\${cur.x * cam.scale + cam.tx - hx}px, \${cur.y * cam.scale + cam.ty - hy}px) scale(\${cur.scale})\`;

    const rip = activeRipple(t);
    const ripple = document.getElementById("demo-ripple");
    ripple.style.display = rip ? "block" : "none";
    if (rip) {
      ripple.style.left = \`\${rip.x * cam.scale + cam.tx}px\`;
      ripple.style.top = \`\${rip.y * cam.scale + cam.ty}px\`;
      ripple.style.transform = \`scale(\${rip.scale})\`;
      ripple.style.opacity = rip.opacity;
    }

    return cam;
  };

  const stageBounds = { left: 0, top: 0, right: VIEW_W, bottom: VIEW_H };
  const visible = el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const edgeMargin = (outer, inner) => Math.min(
    inner.left - outer.left, inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom
  );

  function partiallyClipped(rect) {
    return Math.min(rect.right, VIEW_W) > Math.max(rect.left, 0) &&
      Math.min(rect.bottom, VIEW_H) > Math.max(rect.top, 0) &&
      edgeMargin(stageBounds, rect) < -0.01;
  }

  function anchorMargin(name, cam, win) {
    const matches = [...win.querySelectorAll('[data-anchor="' + name + '"]')].filter(visible);
    if (!matches.length) {
      const a = ANCHORS[name];
      const left = a.left * cam.scale + cam.tx;
      const top = a.top * cam.scale + cam.ty;
      return edgeMargin(stageBounds, {
        left, top, right: left + a.width * cam.scale, bottom: top + a.height * cam.scale
      }) - MARGIN;
    }

    return Math.min(...matches.map(el => {
      const r = el.getBoundingClientRect();
      const margins = [edgeMargin(stageBounds, r) - MARGIN];
      for (const selector of [".board", ".demo-view-layer"]) {
        const viewport = el.closest(selector);
        if (viewport) margins.push(edgeMargin(viewport.getBoundingClientRect(), r));
      }
      return Math.min(...margins);
    }));
  }

  function inTransitionWindow(t) {
    return t >= AT.dissolve - SWITCH_LEAD_SEC ||
      SCENES.some(([start], i) => i > 0 && t >= start - SWITCH_LEAD_SEC && t < start + VIEW_TRANSITION_SEC);
  }

  window.__auditFrame = function (t) {
    const cam = window.__setDemoTime(t);
    const time = sceneTime(t);
    const windowEl = document.getElementById("demo-window");
    const win = windowEl.getBoundingClientRect();
    const focus = cam.focus === "overview" ? win : focusRect(cam.focus, windowEl);
    const toast = document.getElementById("demo-toast");
    const sidebar = windowEl.querySelector(".cover").getBoundingClientRect();
    const sidebarMargin = Math.max(sidebar.left + 12 * cam.scale, cam.scale - sidebar.right);
    const toastMargin = visible(toast) ? edgeMargin(stageBounds, toast.getBoundingClientRect()) : null;
    const textElements = windowEl.querySelectorAll(
      "h1, h2, .view-title, .card-title, .view-sub, .card-note, .prep-sub, .eyebrow, " + BRAND_TEXT +
      ", .storage-chip, .filter-chip, button, kbd, .kpi :is(p, strong, span), .strip-figure, .strip-rate, .ring-label > *, .demo-toast, " +
      ".demo-board-view .app-card :is(.app-company, .app-role, .app-meta span, .chip, .demo-history-stamp)"
    );
    const slicedText = [...textElements]
      .filter(el => visible(el) && partiallyClipped(el.getBoundingClientRect()))
      .map(el => el.textContent.trim().replace(/\s+/g, " "));

    const upcoming = new Set(cursorStops
      .filter(([arrival, departure, pos]) => pos.anchor && departure >= time && arrival <= time + 0.5)
      .map(([, , pos]) => pos.anchor));
    const margins = [...upcoming].map(name => [name, anchorMargin(name, cam, windowEl)]);
    const clippedAnchors = margins.filter(([, margin]) => margin < 0).map(([name]) => name);
    const cursorMargin = margins.length ? Math.min(...margins.map(([, margin]) => margin)) : null;

    let boardMargin = null;
    if (time >= BOARD_APPROACH && time < AT.grabStripe) {
      const board = windowEl.querySelector(".board");
      const viewport = board?.getBoundingClientRect();
      const applied = board?.querySelector(".column.st-APPLIED");
      const card = applied?.querySelector('[data-anchor="card-stripe-applied"]');
      if (!applied || !card) clippedAnchors.push("card-stripe-applied");
      else boardMargin = Math.min(
        edgeMargin(viewport, applied.getBoundingClientRect()),
        edgeMargin(viewport, card.getBoundingClientRect())
      );
    }

    const visibleWidth = Math.max(0, Math.min(win.right, VIEW_W) - Math.max(win.left, 0));
    const visibleHeight = Math.max(0, Math.min(win.bottom, VIEW_H) - Math.max(win.top, 0));
    const visibleArea = visibleWidth * visibleHeight;
    return {
      scale: cam.scale,
      tx: cam.tx,
      ty: cam.ty,
      focus: cam.focus,
      viewTransition: inTransitionWindow(t),
      focusMargin: focus ? edgeMargin(stageBounds, focus) : null,
      windowVisibleRatio: visibleArea / (win.width * win.height),
      emptyRatio: 1 - visibleArea / (VIEW_W * VIEW_H),
      sidebarMargin,
      toastMargin,
      cursorMargin,
      boardMargin,
      slicedText,
      clippedAnchors
    };
  };

  measureAnchors();
  cameraPoses = cameraKeyPoses();
  window.__cameraKeys = cameraPoses.map(({ time, scale, focus, fit }) => ({ time, scale, focus, fit }));
  cursorStops = buildCursorTimeline();
  window.__setDemoTime(0);
})();
</script>
</body>
</html>`;
}

function runEncoder(bin, args, label) {
  const result = spawnSync(bin, args, { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(label + " failed (" + (result.signal || result.status) + "): " + result.stderr.trim());
  }
}

function encodeWebm(ffmpegBin, framesPath, outPath) {
  const passLog = path.join(path.dirname(framesPath), "vpx_2pass");
  for (const kbps of BITRATES) {
    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-vcodec", "mjpeg", "-r", String(FPS), "-i", framesPath,
      "-vf", `scale=${OUT_WIDTH}:${OUT_HEIGHT}:flags=lanczos`,
      "-c:v", "libvpx", "-b:v", `${kbps}k`,
      "-force_key_frames", String(LOOP_REST_START),
      "-g", String(FPS), "-pix_fmt", "yuv420p",
      "-deadline", "good", "-cpu-used", "2", "-auto-alt-ref", "1", "-lag-in-frames", "25",
      "-passlogfile", passLog
    ];
    runEncoder(ffmpegBin, [...args, "-pass", "1", "-f", "webm", "/dev/null"], "WebM pass 1");
    runEncoder(ffmpegBin, [...args, "-pass", "2", "-f", "webm", outPath], "WebM pass 2");
    const size = fs.statSync(outPath).size;
    if (size > 0 && size <= MAX_VIDEO_BYTES) return size;
  }
  throw new Error("WebM did not meet the 5 MB limit at any target bitrate");
}

function encodeMp4WithSwift(framesPath, offsets, outPath) {
  const framesDir = path.dirname(framesPath);
  const swiftScript = path.join(framesDir, "encode_mp4.swift");
  const offsetsPath = path.join(framesDir, "offsets.json");
  const swiftSource = `
import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO

let args = CommandLine.arguments
let frames = try FileHandle(forReadingFrom: URL(fileURLWithPath: args[1]))
defer { try? frames.close() }
let offsetsData = try Data(contentsOf: URL(fileURLWithPath: args[2]))
let offsets = try JSONDecoder().decode([UInt64].self, from: offsetsData)
let outURL = URL(fileURLWithPath: args[3])
let bitrate = Int(args[4])!
let fps: Int32 = ${FPS}
let outWidth = ${OUT_WIDTH}
let outHeight = ${OUT_HEIGHT}

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true

let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: outWidth,
  AVVideoHeightKey: outHeight,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoMaxKeyFrameIntervalKey: 60,
    AVVideoExpectedSourceFrameRateKey: fps,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
  ]
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false

let attrs: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: outWidth,
  kCVPixelBufferHeightKey as String: outHeight
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
guard writer.canAdd(input) else { fatalError("Cannot add AVAssetWriterInput") }
writer.add(input)
guard writer.startWriting() else { fatalError("Cannot start writing: \\(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

func pixelBuffer(from jpegData: Data, pool: CVPixelBufferPool) -> CVPixelBuffer? {
  guard let source = CGImageSourceCreateWithData(jpegData as CFData, nil),
        let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
  var buffer: CVPixelBuffer?
  guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess,
        let pb = buffer, CVPixelBufferLockBaseAddress(pb, []) == kCVReturnSuccess else { return nil }
  defer { CVPixelBufferUnlockBaseAddress(pb, []) }
  guard let ctx = CGContext(
    data: CVPixelBufferGetBaseAddress(pb),
    width: outWidth,
    height: outHeight,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
  ) else { return nil }
  ctx.interpolationQuality = .high
  ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: outWidth, height: outHeight))
  return pb
}

let frameCount = offsets.count - 1
guard frameCount > 0, offsets.first == 0, let pool = adaptor.pixelBufferPool else {
  fatalError("Invalid frame offsets or missing pixel buffer pool")
}
for i in 0..<frameCount {
  try autoreleasepool {
    try frames.seek(toOffset: offsets[i])
    let count = Int(offsets[i + 1] - offsets[i])
    guard let jpeg = try frames.read(upToCount: count), jpeg.count == count,
          let buffer = pixelBuffer(from: jpeg, pool: pool) else {
      fatalError("Cannot decode frame \\(i)")
    }
    while !input.isReadyForMoreMediaData {
      guard writer.status == .writing else { fatalError("Writer stopped: \\(String(describing: writer.error))") }
      Thread.sleep(forTimeInterval: 0.005)
    }
    let pts = CMTime(value: CMTimeValue(i), timescale: fps)
    guard adaptor.append(buffer, withPresentationTime: pts) else {
      fatalError("Cannot append frame \\(i): \\(String(describing: writer.error))")
    }
  }
}

writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frameCount), timescale: fps))
input.markAsFinished()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
guard writer.status == .completed else { fatalError("MP4 write failed: \\(String(describing: writer.error))") }
`;
  fs.writeFileSync(swiftScript, swiftSource);
  fs.writeFileSync(offsetsPath, JSON.stringify(offsets));

  for (const kbps of BITRATES) {
    fs.rmSync(outPath, { force: true });
    runEncoder("/usr/bin/swift", [swiftScript, framesPath, offsetsPath, outPath, String(kbps * 1000)], "MP4 encoding");
    const size = fs.statSync(outPath).size;
    if (size > 0 && size <= MAX_VIDEO_BYTES) return size;
  }
  throw new Error("MP4 did not meet the 5 MB limit at any target bitrate");
}

function checkMp4Faststart(mp4Path) {
  const fd = fs.openSync(mp4Path, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);
    let sawMovie = false;
    for (let offset = 0; offset + 8 <= size;) {
      const read = fs.readSync(fd, header, 0, header.length, offset);
      if (read < 8) return false;
      const length = header.readUInt32BE(0);
      const atom = header.toString("ascii", 4, 8);
      const atomSize = length === 1 && read === 16 ? Number(header.readBigUInt64BE(8)) : length || size - offset;
      if (atomSize < (length === 1 ? 16 : 8) || offset + atomSize > size) return false;
      if (atom === "mdat") return sawMovie;
      if (atom === "moov") sawMovie = true;
      offset += atomSize;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

async function openScene(browser, sceneHtml, deviceScaleFactor) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor
  });
  const page = await context.newPage();
  let sceneError;
  page.on("pageerror", error => { sceneError ??= error; });
  await page.setContent(sceneHtml, { waitUntil: "load" });
  if (sceneError) throw sceneError;
  return page;
}

const MOTION_LIMITS = { zoomSpeed: 0.6, zoomAcceleration: 3, panSpeed: 700, panAcceleration: 3000 };

function cameraMotion(current, previous, prior) {
  if (!previous) return null;
  const dx = current.tx - previous.tx;
  const dy = current.ty - previous.ty;
  const ds = current.scale - previous.scale;
  return {
    zoomSpeed: Math.abs(ds) * FPS,
    zoomAcceleration: prior ? Math.abs(ds - (previous.scale - prior.scale)) * FPS ** 2 : 0,
    panSpeed: Math.hypot(dx, dy) * FPS,
    panAcceleration: prior ? Math.hypot(dx - (previous.tx - prior.tx), dy - (previous.ty - prior.ty)) * FPS ** 2 : 0
  };
}

async function frameReport(page, frame, previous, prior) {
  const t = frame / FPS;
  const result = await page.evaluate(time => window.__auditFrame(time), t);
  return { frame, t, ...result, motion: cameraMotion(result, previous, prior) };
}

const FRAMING_RULES = {
  focus: frame => (frame.focusMargin ?? -Infinity) - FOCUS_MARGIN,
  zoomedBackdrop: frame => frame.scale > ZOOM_COVER_THRESHOLD ? -frame.emptyRatio : null,
  overviewWindow: frame => frame.scale <= 1.11 ? frame.windowVisibleRatio - 1 + 1e-9 : null,
  sidebar: frame => frame.sidebarMargin,
  toast: frame => frame.toastMargin === null ? null : frame.toastMargin - FRAME_MARGIN,
  slicedText: frame => -frame.slicedText.length,
  cursor: frame => frame.clippedAnchors.length ? Math.min(frame.cursorMargin ?? 0, -0.01) : frame.cursorMargin,
  boardViewport: frame => frame.boardMargin === null ? null : frame.boardMargin + 0.01,
  viewTransition: frame => frame.viewTransition
    ? Math.min(0.001 - Math.abs(frame.scale - 1), -(frame.motion?.zoomSpeed ?? 0), -(frame.motion?.panSpeed ?? 0))
    : null,
  motion: frame => frame.motion
    ? Math.min(...Object.entries(MOTION_LIMITS).map(([name, limit]) => 1 - frame.motion[name] / limit))
    : null
};

function failsFraming(frame) {
  return Object.values(FRAMING_RULES).some(clearance => {
    const value = clearance(frame);
    return value !== null && value < 0;
  });
}

async function auditFrames(page) {
  const cameraKeys = await page.evaluate(() => window.__cameraKeys);
  const frames = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    frames.push(await frameReport(page, i, frames.at(-1), frames.at(-2)));
  }
  const failures = frames.filter(failsFraming);
  const worst = Object.fromEntries(Object.entries(FRAMING_RULES).map(([name, clearance]) => [
    name,
    frames.filter(frame => clearance(frame) !== null)
      .sort((a, b) => clearance(a) - clearance(b)).slice(0, 5)
  ]));
  const worstMotion = Object.fromEntries(Object.entries(MOTION_LIMITS).map(([name, limit]) => {
    const worstFrames = frames.slice(1).sort((a, b) => b.motion[name] - a.motion[name]).slice(0, 5)
      .map(({ frame, t, motion }) => ({ frame, t, value: motion[name] }));
    return [name, { limit, peak: worstFrames[0].value, worstFrames }];
  }));
  console.log(JSON.stringify({ frames: TOTAL_FRAMES, failures: failures.length, cameraKeys, worst, worstMotion }, null, 2));
  if (failures.length) throw new Error(`Framing audit failed on ${failures.length} frames`);
}

async function captureFrames(page, framesPath) {
  const offsets = [0];
  const fd = fs.openSync(framesPath, "wx");
  let previous;
  let prior;
  try {
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const report = await frameReport(page, i, previous, prior);
      if (failsFraming(report)) throw new Error(`Framing audit failed: ${JSON.stringify(report)}`);
      prior = previous;
      previous = report;
      const jpeg = await page.screenshot({ type: "jpeg", quality: 90 });
      for (let written = 0; written < jpeg.length;) {
        const size = fs.writeSync(fd, jpeg, written, jpeg.length - written);
        if (!size) throw new Error(`Could not write frame ${i}`);
        written += size;
      }
      offsets.push(offsets.at(-1) + jpeg.length);
    }
  } finally {
    fs.closeSync(fd);
  }
  return offsets;
}

async function capturePoster(browser, sceneHtml, posterPath) {
  const page = await openScene(browser, sceneHtml, 1);
  try {
    await page.evaluate(time => window.__setDemoTime(time), POSTER_TIME);
    for (const quality of [90, 85, 80]) {
      const jpeg = await page.screenshot({ type: "jpeg", quality });
      if (jpeg.length >= MAX_POSTER_BYTES) continue;
      fs.writeFileSync(posterPath, jpeg);
      return jpeg.length;
    }
    throw new Error("Poster did not meet the 200 KB limit");
  } finally {
    await page.context().close();
  }
}

async function main() {
  const audit = process.argv.includes("--audit");
  const sceneHtml = buildSceneHtml(fs.readFileSync(STYLES_PATH, "utf8"));
  const ffmpegBin = audit ? null : findFfmpeg();
  let browser = await chromium.launch({ headless: true });
  let tempDir;
  try {
    const page = await openScene(browser, sceneHtml, DEVICE_SCALE_FACTOR);
    if (audit) {
      await auditFrames(page);
      return;
    }

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(MEDIA_DIR, ".demo-tour-"));
    const framesPath = path.join(tempDir, "frames.mjpeg");
    const offsets = await captureFrames(page, framesPath);
    await page.context().close();

    const posterName = "demo-tour-poster.jpg";
    const webmName = "demo-tour.webm";
    const mp4Name = "demo-tour.mp4";
    const posterBytes = await capturePoster(browser, sceneHtml, path.join(tempDir, posterName));
    await browser.close();
    browser = null;
    const webmBytes = encodeWebm(ffmpegBin, framesPath, path.join(tempDir, webmName));
    const mp4Path = path.join(tempDir, mp4Name);
    const mp4Bytes = encodeMp4WithSwift(framesPath, offsets, mp4Path);
    const faststart = checkMp4Faststart(mp4Path);
    if (!faststart) throw new Error("MP4 moov atom must precede mdat");

    for (const name of [posterName, webmName, mp4Name]) {
      fs.renameSync(path.join(tempDir, name), path.join(MEDIA_DIR, name));
    }
    console.log(JSON.stringify({
      frames: TOTAL_FRAMES, fps: FPS, durationSec: DURATION_SEC, mp4Bytes, webmBytes, posterBytes, faststart
    }, null, 2));
  } finally {
    try {
      await browser?.close();
    } finally {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
