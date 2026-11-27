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
const DEVICE_SCALE_FACTOR = 1.5; // 1920x1080 supersampled source capture
const OUT_WIDTH = 1280;
const OUT_HEIGHT = 720;
const FPS = 60;
const DURATION_SEC = 20.8;
const TOTAL_FRAMES = Math.round(FPS * DURATION_SEC); // 1248 frames
const MIN_VIDEO_BYTES = 400 * 1024;
const MAX_VIDEO_BYTES = 1450 * 1024;

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_BIN,
    "/Users/will/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac"
  ].filter(Boolean);

  const cacheDir = path.join(os.homedir(), "Library/Caches/ms-playwright");
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
  position: absolute;
  left: 72px;
  top: 42px;
  width: 1136px;
  height: 636px;
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
  width: 1136px;
  height: 636px;
  max-width: none;
  border-radius: 0;
  box-shadow: none;
  grid-template-columns: 224px minmax(0, 1fr);
}

.demo-app .cover {
  padding: 16px 14px 16px;
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

.demo-app .page-wrap {
  position: relative;
  min-width: 0;
  height: 636px;
  overflow: hidden;
}

.demo-app .page {
  position: relative;
  height: 636px;
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
  width: 540px;
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
            <a class="tab" id="nav-board" data-anchor="nav-board" style="--tab: var(--tab-board)"><span>Board</span><b class="tab-count" id="nav-board-count">10</b></a>
            <a class="tab" id="nav-notebook" style="--tab: var(--tab-notebook)"><span>All pages</span><b class="tab-count">13</b></a>
            <a class="tab" id="nav-insights" data-anchor="nav-insights" style="--tab: var(--tab-insights)"><span>Insights</span></a>
          </nav>
          <div class="cover-footer">
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

  function renderTodayView(t, { highlightRadar = false, countOverride = null } = {}) {
    const savedStripe = countOverride !== null ? countOverride : t >= 4.05;
    const activeCount = savedStripe ? 11 : 10;
    const appliedGrow = savedStripe ? 4 : 3;
    const radarPulse = highlightRadar ? seg(t, 18.4, 18.85, quintOut) : 0;

    return \`
      <header class="view-head">
        <div>
          <p class="eyebrow" style="--tab: var(--tab-today)">Today</p>
          <h1 class="view-title">Good morning, Jordan<span class="dot">.</span></h1>
          <p class="view-sub">Tuesday, Nov 17 - 3 priorities due this week</p>
        </div>
      </header>
      <section class="card strip" style="margin-bottom: 14px;">
        <div class="strip-top">
          <div class="strip-figure"><strong>\${activeCount}</strong><span>active applications</span></div>
          <div class="strip-rate">Response rate <b>42%</b> (5 of 12 sent)</div>
        </div>
        <div class="stack-bar">
          <span style="flex-grow:3; --s: var(--st-saved)"></span>
          <span style="flex-grow:\${appliedGrow}; --s: var(--st-applied)"></span>
          <span style="flex-grow:3; --s: var(--st-interview)"></span>
          <span style="flex-grow:1; --s: var(--st-offer)"></span>
        </div>
      </section>
      <div class="today-grid">
        <section class="card upcoming-card \${highlightRadar ? "is-hovered" : ""}" data-anchor="radar-card" style="grid-column: span 7; \${highlightRadar ? \`box-shadow: 0 0 0 \${(3 * radarPulse).toFixed(1)}px color-mix(in srgb, var(--accent) 22%, transparent), var(--shadow-md);\` : ""}">
          <div class="card-head">
            <div>
              <h2 class="card-title">Next up - Deadline Radar</h2>
              <p class="card-note">Upcoming interviews and closing dates</p>
            </div>
            <span class="pill st-INTERVIEW" style="\${highlightRadar ? "box-shadow: 0 0 0 2px color-mix(in srgb, var(--st-interview) 35%, transparent);" : ""}">24h &amp; 2h .ics reminders</span>
          </div>
          <ul class="agenda">
            <li class="agenda-day">
              <span class="agenda-date today">Tomorrow</span>
              <div class="agenda-items">
                <div class="agenda-item" style="background: var(--paper-2);">
                  <span class="agenda-kind" style="--s-bg: var(--st-interview-bg);">10a</span>
                  <div class="agenda-text">
                    <strong>Stripe - Technical Screen (45 min)</strong>
                    <span>Seattle, WA - Python, Go, SQL</span>
                  </div>
                </div>
              </div>
            </li>
            <li class="agenda-day">
              <span class="agenda-date">Fri Nov 20</span>
              <div class="agenda-items">
                <div class="agenda-item">
                  <span class="agenda-kind" style="--s-bg: var(--st-saved-bg);">Due</span>
                  <div class="agenda-text">
                    <strong>Northwind Robotics - Application Deadline</strong>
                    <span>Syncs to Apple &amp; Google Calendar via .ics</span>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>
        <section class="card goal-card" style="grid-column: span 5;">
          <div class="card-head">
            <div>
              <h2 class="card-title">Weekly Goal</h2>
              <p class="card-note">5 of 6 sent this week</p>
            </div>
          </div>
          <div class="week-dots">
            <div class="week-dot has"><i>M</i><span>1</span></div>
            <div class="week-dot has"><i>T</i><span>2</span></div>
            <div class="week-dot has"><i>W</i><span>1</span></div>
            <div class="week-dot has today"><i>T</i><span>1</span></div>
            <div class="week-dot future"><i>F</i><span>-</span></div>
            <div class="week-dot future"><i>S</i><span>-</span></div>
            <div class="week-dot future"><i>S</i><span>-</span></div>
          </div>
        </section>
      </div>
    \`;
  }

  function renderBoardView(t, { forcePreDrag = false, forcePostDrop = false } = {}) {
    const dragStart = 6.10;
    const dragEnd = 7.45;
    const isDragging = !forcePreDrag && !forcePostDrop && t >= dragStart && t < dragEnd;
    const dropped = forcePostDrop || (!forcePreDrag && t >= dragEnd);
    const filterPython = !forcePreDrag && !forcePostDrop && t >= 8.65;

    const dragP = seg(t, dragStart, dragEnd, quintInOut);
    const lift = isDragging ? Math.sin(clamp((t - dragStart) / 0.25, 0, 1) * Math.PI * 0.5) * (1 - Math.pow(clamp((t - (dragEnd - 0.18)) / 0.18, 0, 1), 2)) : 0;
    const slotGrow = isDragging ? smoothstep(clamp((t - 6.35) / 0.45, 0, 1)) : 0;
    const stampPop = dropped && !forcePostDrop ? clamp(springOut(t - dragEnd, 320, 20), 0, 1.1) : (forcePostDrop ? 1 : 0);

    // Filter out non-Python cards cleanly
    const filterP = filterPython ? seg(t, 8.65, 9.0, quintOut) : 0;
    const nonPyStyle = filterPython
      ? \`opacity:\${(1 - filterP).toFixed(3)}; transform: scale(\${(1 - 0.08 * filterP).toFixed(3)}); max-height:\${Math.round(140 * (1 - filterP))}px; margin-bottom:\${Math.round(8 * (1 - filterP))}px; padding-top:\${Math.round(11 * (1 - filterP))}px; padding-bottom:\${Math.round(11 * (1 - filterP))}px; overflow:hidden; border-width:\${filterP > 0.85 ? 0 : 1}px;\`
      : "";

    const stripeCardHover = !isDragging && !dropped && t >= 5.75 && t < dragStart;
    const stripePostHover = dropped && t >= 9.6 && t < 10.4;

    const stripeCardHtml = (showStamp) => \`
      <article class="app-card st-\${dropped ? "INTERVIEW" : "APPLIED"} \${stripeCardHover || stripePostHover ? "is-hovered" : ""}" data-anchor="\${dropped ? "card-stripe-interview" : "card-stripe-applied"}" style="\${dropped ? "border-color: var(--st-interview); box-shadow: 0 0 0 2px color-mix(in srgb, var(--st-interview) 26%, transparent), var(--shadow-md);" : ""}">
        <div class="app-card-top"><span class="app-company">Stripe</span></div>
        <h3 class="app-role">Software Engineer Intern</h3>
        <div class="app-meta"><span>Seattle, WA</span></div>
        <div class="chips"><span class="chip">Python</span><span class="chip">Go</span><span class="chip">SQL</span></div>
        \${showStamp ? \`<span class="demo-history-stamp" style="transform: scale(\${stampPop.toFixed(3)}); opacity: \${clamp(stampPop * 1.4, 0, 1).toFixed(2)};">Moved to Interview · Just now</span>\` : ""}
      </article>
    \`;

    // Drag start/end centers computed relative to #demo-page
    const dragStartPt = window.__BOARD_DRAG_START || { x: 432, y: 205 };
    const dragEndPt = window.__BOARD_DRAG_END || { x: 625, y: 196 };
    const dragX = lerp(dragStartPt.x, dragEndPt.x, dragP);
    const dragY = lerp(dragStartPt.y, dragEndPt.y, dragP) - Math.sin(dragP * Math.PI) * 26;
    const dragScale = 1 + 0.048 * lift;
    const dragRot = -1.8 * lift;

    return \`
      <header class="view-head">
        <div>
          <p class="eyebrow" style="--tab: var(--tab-board)">Board</p>
          <h1 class="view-title">Pipeline Board<span class="dot">.</span></h1>
        </div>
        <div class="filters" style="margin:0;">
          <button type="button" class="filter-chip" aria-pressed="\${!filterPython}">All (11)</button>
          <button type="button" class="filter-chip \${t >= 8.35 && t < 8.65 ? "is-hovered" : ""}" data-anchor="chip-python" aria-pressed="\${filterPython}">Python (4)</button>
          <button type="button" class="filter-chip" aria-pressed="false">TypeScript (4)</button>
        </div>
      </header>
      <div class="board" style="grid-auto-columns: minmax(170px, 1fr); gap: 10px;">
        <section class="column st-SAVED">
          <div class="column-head"><span class="dot"></span><h2>Saved</h2><span class="count">\${filterPython ? 1 : 3}</span></div>
          <div class="column-cards">
            <article class="app-card st-SAVED">
              <div class="app-card-top"><span class="app-company">Northwind</span></div>
              <h3 class="app-role">Backend Intern</h3>
              <div class="chips"><span class="chip">Python</span><span class="chip">SQL</span></div>
            </article>
            \${filterP < 0.99 ? \`<article class="app-card st-SAVED" style="\${nonPyStyle}"><div class="app-card-top"><span class="app-company">Figma</span></div><h3 class="app-role">Product Design</h3><div class="chips"><span class="chip">Figma</span></div></article>\` : ""}
          </div>
        </section>
        <section class="column st-APPLIED">
          <div class="column-head"><span class="dot"></span><h2>Applied</h2><span class="count">\${dropped || isDragging ? (filterPython ? 0 : 3) : (filterPython ? 1 : 4)}</span></div>
          <div class="column-cards">
            \${(!isDragging && !dropped) ? stripeCardHtml(false) : ""}
            \${filterP < 0.99 ? \`<article class="app-card st-APPLIED" style="\${nonPyStyle}"><div class="app-card-top"><span class="app-company">Shopify</span></div><h3 class="app-role">Frontend Intern</h3><div class="chips"><span class="chip">React</span></div></article>\` : ""}
          </div>
        </section>
        <section class="column st-INTERVIEW \${isDragging ? "drop" : ""}">
          <div class="column-head"><span class="dot"></span><h2>Interview</h2><span class="count">\${dropped ? (filterPython ? 2 : 4) : (filterPython ? 1 : 3)}</span></div>
          <div class="column-cards">
            \${isDragging ? \`<div class="demo-drop-slot" data-anchor="slot-interview" style="height:\${Math.round(108 * slotGrow)}px; opacity:\${slotGrow.toFixed(2)}; margin-bottom:\${Math.round(8 * slotGrow)}px;"></div>\` : ""}
            \${dropped ? stripeCardHtml(true) : ""}
            \${forcePreDrag ? \`<div class="demo-drop-slot" data-anchor="slot-interview" style="height:108px; opacity:0; position:relative; pointer-events:none;"></div>\` : ""}
            <article class="app-card st-INTERVIEW">
              <div class="app-card-top"><span class="app-company">Cedar Grove</span></div>
              <h3 class="app-role">ML Engineering Intern</h3>
              <div class="chips"><span class="chip">Python</span><span class="chip">PyTorch</span></div>
            </article>
          </div>
        </section>
        <section class="column st-OFFER">
          <div class="column-head"><span class="dot"></span><h2>Offer</h2><span class="count">\${filterPython ? 0 : 1}</span></div>
          <div class="column-cards">
            \${filterP < 0.99 ? \`<article class="app-card st-OFFER" style="\${nonPyStyle}"><div class="app-card-top"><span class="app-company">Kitebird</span></div><h3 class="app-role">Platform Intern</h3><div class="chips"><span class="chip">Go</span></div></article>\` : ""}
          </div>
        </section>
      </div>
      \${isDragging ? \`
        <article class="app-card st-APPLIED demo-drag-card" style="left:\${dragX.toFixed(1)}px; top:\${dragY.toFixed(1)}px; transform: translate(-50%, -50%) scale(\${dragScale.toFixed(4)}) rotate(\${dragRot.toFixed(2)}deg);">
          <div class="app-card-top"><span class="app-company">Stripe</span></div>
          <h3 class="app-role">Software Engineer Intern</h3>
          <div class="app-meta"><span>Seattle, WA</span></div>
          <div class="chips"><span class="chip">Python</span><span class="chip">Go</span><span class="chip">SQL</span></div>
        </article>
      \` : ""}
    \`;
  }

  function getMockStats(t) {
    const p = seg(t, 12.55, 13.35, quintOut);
    return {
      score: Math.round(lerp(62, 88, p)),
      wpm: Math.round(lerp(122, 138, p))
    };
  }

  function renderEntryPrepView(t, { forceScrollSettled = false } = {}) {
    const scrollOffset = forceScrollSettled ? 188 : seg(t, 10.85, 11.95, cubicInOut) * 188;
    const practiced = !forceScrollSettled && t >= 12.55;
    const barWidth = practiced ? lerp(50, 67, seg(t, 12.55, 13.05, quintOut)) : 50;
    const mockS = practiced ? clamp(springOut(t - 12.60, 260, 21), 0, 1.06) : 0;
    const mockOpacity = practiced ? clamp((t - 12.60) / 0.25, 0, 1) : 0;
    const { score, wpm } = getMockStats(t);

    return \`
      <div style="transform: translateY(-\${scrollOffset.toFixed(1)}px);">
        <article class="sheet-page" style="padding: 20px 30px 26px 68px;">
          <div class="entry-head" style="margin-bottom: 12px;">
            <span class="entry-company">Stripe</span>
            <h1 class="entry-role" style="font-size: 1.78rem;">Software Engineer Intern</h1>
          </div>
          <div class="stepper" style="margin-bottom: 16px;">
            <div class="steps">
              <div class="step done st-SAVED"><span>Saved</span></div>
              <div class="step done st-APPLIED"><span>Applied</span></div>
              <div class="step current st-INTERVIEW"><span>Interview</span></div>
              <div class="step st-OFFER"><span>Offer</span></div>
            </div>
          </div>
          <div class="entry-fields" style="margin-bottom: 12px;">
            <div class="line-field"><span>Location</span><div style="padding:3px 0; font-weight:600;">Seattle, WA</div></div>
            <div class="line-field"><span>Skills</span><div style="padding:3px 0; font-weight:600;">Python, Go, SQL</div></div>
          </div>
          <section class="prep" style="margin-top: 10px; padding-top: 12px;">
            <div class="prep-head">
              <div>
                <h2 class="card-title">Role-matched interview prep</h2>
                <p class="prep-sub">STAR behavioral and backend system prompts</p>
              </div>
              <span class="prep-summary">\${practiced ? "4 of 6 practiced" : "3 of 6 practiced"}</span>
            </div>
            <div class="prep-progress">
              <div class="prep-bar"><i style="width:\${barWidth.toFixed(1)}%"></i></div>
            </div>
            <div class="prep-group" style="background: var(--card);">
              <ul class="prep-list" style="padding: 4px 14px;">
                <li class="prep-q \${practiced ? "is-practiced" : ""}">
                  <span class="prep-text">Tell me about a system bottleneck you diagnosed and resolved (STAR).</span>
                  <div class="prep-actions">
                    <button type="button" data-anchor="btn-mark-practiced" class="prep-mark practiced \${t >= 12.15 && t < 12.55 ? "is-hovered" : ""}" aria-pressed="\${practiced}">\${practiced ? "Practiced" : "Mark practiced"}</button>
                  </div>
                </li>
                <li class="prep-q">
                  <span class="prep-text">Design an idempotent webhook delivery queue with retries in Go.</span>
                  <div class="prep-actions">
                    <button type="button" class="prep-mark practiced" aria-pressed="true">Practiced</button>
                  </div>
                </li>
              </ul>
            </div>
            <div class="demo-mock-card" style="opacity:\${mockOpacity.toFixed(3)}; transform: translateY(\${((1 - mockS) * 18).toFixed(1)}px) scale(\${lerp(0.96, 1, mockS).toFixed(3)});">
              <div class="demo-mock-score-box">
                <strong>\${score} / 100</strong>
                <span>Readiness</span>
              </div>
              <div>
                <strong style="font-size: 0.94rem; color: var(--ink);">Timed Mock Interview Feedback</strong>
                <div class="demo-mock-metrics">
                  <span class="demo-metric-pill good">STAR structure complete</span>
                  <span class="demo-metric-pill">\${wpm} wpm</span>
                  <span class="demo-metric-pill">0 filler phrases</span>
                </div>
              </div>
            </div>
          </section>
        </article>
      </div>
    \`;
  }

  function renderInsightsView(t) {
    const f0 = seg(t, 15.80, 16.55, quintOut);
    const f1 = seg(t, 15.88, 16.63, quintOut);
    const f2 = seg(t, 15.96, 16.71, quintOut);
    const f3 = seg(t, 16.04, 16.79, quintOut);

    return \`
      <header class="view-head">
        <div>
          <p class="eyebrow" style="--tab: var(--tab-insights)">Insights</p>
          <h1 class="view-title">Search Insights<span class="dot">.</span></h1>
          <p class="view-sub">Conversion rates and top skills across your notebook</p>
        </div>
      </header>
      <section class="kpis">
        <article class="card kpi"><p>Applications</p><strong>24</strong><span>11 active</span></article>
        <article class="card kpi"><p>Response rate</p><strong>42%</strong><span>+9% this month</span></article>
        <article class="card kpi"><p>Interviews</p><strong>5</strong><span>33% of applied</span></article>
        <article class="card kpi"><p>Offers</p><strong>2</strong><span>11% conversion</span></article>
        <article class="card kpi"><p>Prep practiced</p><strong>88%</strong><span>STAR complete</span></article>
      </section>
      <div class="insight-grid">
        <section class="card" data-anchor="funnel-card">
          <div class="card-head"><div><h2 class="card-title">Response-Rate Conversion Funnel</h2><p class="card-note">Stage progression across sent applications</p></div></div>
          <div class="funnel">
            <div class="funnel-row"><span>Saved</span><div class="funnel-track"><div class="funnel-bar" style="width:\${(100 * f0).toFixed(1)}%; background: var(--st-saved);"></div><span class="funnel-value">24 <small>(100%)</small></span></div></div>
            <div class="funnel-row"><span>Applied</span><div class="funnel-track"><div class="funnel-bar" style="width:\${(75 * f1).toFixed(1)}%; background: var(--st-applied);"></div><span class="funnel-value">18 <small>(75%)</small></span></div></div>
            <div class="funnel-row"><span>Interview</span><div class="funnel-track"><div class="funnel-bar" style="width:\${(33 * f2).toFixed(1)}%; background: var(--st-interview);"></div><span class="funnel-value">6 <small>(33%)</small></span></div></div>
            <div class="funnel-row"><span>Offer</span><div class="funnel-track"><div class="funnel-bar" style="width:\${(14 * f3).toFixed(1)}%; background: var(--st-offer);"></div><span class="funnel-value">2 <small>(11%)</small></span></div></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Top Skills in Interviews</h2><p class="card-note">Highest callback rate by tag</p></div></div>
          <div class="skill-bars">
            <div class="skill-bar"><span>Python</span><i style="width:\${(92 * f0).toFixed(1)}%"></i><b>9</b></div>
            <div class="skill-bar"><span>Go</span><i style="width:\${(72 * f1).toFixed(1)}%"></i><b>7</b></div>
            <div class="skill-bar"><span>SQL</span><i style="width:\${(64 * f2).toFixed(1)}%"></i><b>6</b></div>
            <div class="skill-bar"><span>TypeScript</span><i style="width:\${(52 * f3).toFixed(1)}%"></i><b>5</b></div>
          </div>
        </section>
      </div>
    \`;
  }

  function renderModal(t, { forceOpen = false } = {}) {
    const modal = document.getElementById("demo-modal");
    const openT = 0.62;
    const closeT = 3.92;

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

    const typingP = forceOpen ? 1 : seg(t, 1.15, 2.15, x => x);
    const typedCount = Math.round(typingP * QUICK_URL.length);
    const typedText = QUICK_URL.slice(0, typedCount);

    const fillClickT = 2.42;
    const filled = forceOpen || t >= fillClickT + 0.04;
    const fillHover = !forceOpen && t >= 2.25 && t < fillClickT;
    const saveHover = !forceOpen && t >= 3.55 && t < closeT;

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
      { label: "Company", val: "Stripe", empty: "e.g. Shopify", idx: 0 },
      { label: "Role", val: "Software Engineer Intern", empty: "e.g. Backend Intern", idx: 1 },
      { label: "Location", val: "Seattle, WA", empty: "City or Remote", idx: 2 },
      { label: "Skills", val: "Python, Go, SQL", empty: "Comma separated", idx: 3 }
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
              <div class="demo-quickfill-display \${forceOpen || (t >= 1.05 && t < fillClickT) ? "is-focused" : ""}" data-anchor="quickfill-input">
                \${typedCount > 0 ? \`<span>\${typedText}</span>\${!forceOpen && typingP < 1 ? '<span class="demo-typing-caret"></span>' : ''}\` : '<span class="demo-quickfill-placeholder">Paste a job URL or title...</span>'}
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

  // Camera keyframes: [time, scale, focusX, focusY] in unzoomed stage coords
  const CAMERA_KEYS = [
    [0.00, 1.00, 640, 360],
    [0.58, 1.04, 580, 340],
    [1.08, 1.35, 735, 335], // Modal quickfill & fields
    [3.50, 1.32, 745, 385], // Save button
    [4.45, 1.06, 520, 340], // Pull out to sidebar Board tab
    [5.20, 1.04, 560, 350],
    [5.85, 1.36, 650, 290], // Zoom into Applied + Interview columns
    [7.60, 1.32, 760, 285], // Card settled in Interview
    [8.30, 1.30, 960, 165], // Pan up-right to Python filter chip
    [9.40, 1.36, 785, 255], // Back to Stripe card in Interview
    [10.45, 1.08, 680, 340], // Entry page overview
    [11.80, 1.40, 770, 375], // Macro zoom onto Role-matched interview prep + Mock box
    [14.80, 1.34, 750, 390],
    [15.40, 1.08, 490, 360], // Pull back to sidebar Insights
    [16.15, 1.30, 730, 415], // Zoom onto Conversion Funnel & Top Skills
    [17.65, 1.08, 520, 350], // Pull back to sidebar Today
    [18.55, 1.26, 610, 395], // Focus on Deadline Radar (.ics alerts)
    [19.75, 1.24, 610, 395],
    [20.75, 1.00, 640, 360], // Exact t=0.0 resting frame for invisible loop
    [20.80, 1.00, 640, 360]
  ];

  function computeCamera(t) {
    let scale = 1, fx = 640, fy = 360;
    for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
      const [t0, s0, x0, y0] = CAMERA_KEYS[i];
      const [t1, s1, x1, y1] = CAMERA_KEYS[i + 1];
      if (t >= t0 && t <= t1) {
        const p = seg(t, t0, t1, cubicInOut);
        scale = lerp(s0, s1, p);
        fx = lerp(x0, x1, p);
        fy = lerp(y0, y1, p);
        break;
      }
    }
    const tx = 640 - fx * scale;
    const ty = 360 - fy * scale;
    return { scale, tx, ty };
  }

  // Pre-measured DOM anchor map populated once at init
  let ANCHORS = {};
  function measureAnchors() {
    const camEl = document.getElementById("demo-camera");
    camEl.style.transform = "translate(0px, 0px) scale(1)";
    const viewIn = document.getElementById("demo-view-in");
    const viewOut = document.getElementById("demo-view-out");
    viewOut.style.display = "none";

    const capture = (root = document) => {
      for (const el of root.querySelectorAll("[data-anchor]")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          ANCHORS[el.dataset.anchor] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
    };

    // 1. Today + Sidebar
    viewIn.innerHTML = renderTodayView(0);
    renderModal(0);
    capture();

    // 2. Modal open
    renderModal(3.2, { forceOpen: true });
    capture();
    renderModal(0);

    // 3. Board pre-drag (save Stripe card + Interview drop slot)
    viewIn.innerHTML = renderBoardView(5.6, { forcePreDrag: true });
    capture();
    const pageRect = document.getElementById("demo-page").getBoundingClientRect();
    if (ANCHORS["card-stripe-applied"]) {
      window.__BOARD_DRAG_START = {
        x: ANCHORS["card-stripe-applied"].x - pageRect.left,
        y: ANCHORS["card-stripe-applied"].y - pageRect.top
      };
    }
    if (ANCHORS["slot-interview"]) {
      window.__BOARD_DRAG_END = {
        x: ANCHORS["slot-interview"].x - pageRect.left,
        y: ANCHORS["slot-interview"].y - pageRect.top
      };
    }

    // 4. Board post-drop
    viewIn.innerHTML = renderBoardView(7.8, { forcePostDrop: true });
    capture();

    // 5. Entry prep scrolled
    viewIn.innerHTML = renderEntryPrepView(12.2, { forceScrollSettled: true });
    capture();

    // 6. Insights
    viewIn.innerHTML = renderInsightsView(16.8);
    capture();

    // Reset
    viewIn.innerHTML = "";
  }

  function pt(name, dx = 0, dy = 0) {
    const a = ANCHORS[name] || { x: 640, y: 360 };
    return { x: a.x + dx, y: a.y + dy };
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

  function buildCursorTimeline() {
    // Each segment: [t0, t1, targetA, targetB, arcSign, type]
    // Hold segments have same targetA === targetB
    const rest = { x: 740, y: 380 };
    const newBtn = pt("nav-new");
    const qInput = pt("quickfill-input", -30, 0);
    const qFill = pt("quickfill-fill");
    const mSave = pt("modal-save");
    const tabBoard = pt("nav-board");
    const cardApplied = pt("card-stripe-applied");
    const slotInterview = pt("slot-interview");
    const chipPy = pt("chip-python");
    const cardInterview = pt("card-stripe-interview");
    const btnMark = pt("btn-mark-practiced");
    const tabInsights = pt("nav-insights");
    const funnel = pt("funnel-card", -20, 10);
    const tabToday = pt("nav-today");
    const radar = pt("radar-card", 10, -18);

    return { rest, newBtn, qInput, qFill, mSave, tabBoard, cardApplied, slotInterview, chipPy, cardInterview, btnMark, tabInsights, funnel, tabToday, radar };
  }

  let C_PTS = null;
  function cursorState(t) {
    const c = C_PTS;
    const segs = [
      [0.00, 0.48, c.rest, c.newBtn, 1, "arrow"],
      [0.48, 0.66, c.newBtn, c.newBtn, 0, "arrow"],
      [0.66, 1.05, c.newBtn, c.qInput, -1, "arrow"],
      [1.05, 1.98, c.qInput, c.qInput, 0, "ibeam"],
      [1.98, 2.28, c.qInput, c.qFill, -1, "arrow"],
      [2.28, 2.48, c.qFill, c.qFill, 0, "arrow"],
      [2.48, 3.10, c.qFill, { x: 640, y: 455 }, 1, "arrow"],
      [3.10, 3.55, { x: 640, y: 455 }, c.mSave, 1, "arrow"],
      [3.55, 3.96, c.mSave, c.mSave, 0, "arrow"],
      [3.96, 4.92, c.mSave, c.tabBoard, -1, "arrow"],
      [4.92, 5.20, c.tabBoard, c.tabBoard, 0, "arrow"],
      [5.20, 5.82, c.tabBoard, c.cardApplied, 1, "arrow"],
      [5.82, 6.10, c.cardApplied, c.cardApplied, 0, "grab"],
      [6.10, 7.45, c.cardApplied, c.slotInterview, -1, "grabbing"],
      [7.45, 7.72, c.slotInterview, c.slotInterview, 0, "grab"],
      [7.72, 8.38, c.slotInterview, c.chipPy, -1, "arrow"],
      [8.38, 8.72, c.chipPy, c.chipPy, 0, "arrow"],
      [8.72, 9.65, c.chipPy, c.cardInterview, 1, "arrow"],
      [9.65, 10.38, c.cardInterview, c.cardInterview, 0, "arrow"],
      [10.38, 12.15, c.cardInterview, c.btnMark, -1, "arrow"],
      [12.15, 12.62, c.btnMark, c.btnMark, 0, "arrow"],
      [12.62, 13.60, c.btnMark, { x: 650, y: 480 }, 1, "arrow"],
      [13.60, 14.85, { x: 650, y: 480 }, { x: 650, y: 480 }, 0, "arrow"],
      [14.85, 15.32, { x: 650, y: 480 }, c.tabInsights, -1, "arrow"],
      [15.32, 15.60, c.tabInsights, c.tabInsights, 0, "arrow"],
      [15.60, 16.95, c.tabInsights, c.funnel, 1, "arrow"],
      [16.95, 17.55, c.funnel, c.funnel, 0, "arrow"],
      [17.55, 17.98, c.funnel, c.tabToday, -1, "arrow"],
      [17.98, 18.22, c.tabToday, c.tabToday, 0, "arrow"],
      [18.22, 19.10, c.tabToday, c.radar, 1, "arrow"],
      [19.10, 19.90, c.radar, c.radar, 0, "arrow"],
      [19.90, 20.80, c.radar, c.rest, -1, "arrow"]
    ];

    const clicks = [0.62, 1.08, 2.42, 3.90, 5.14, 8.65, 10.30, 12.55, 15.50, 18.14];
    let pressDip = 1;
    for (const ct of clicks) {
      if (t >= ct - 0.06 && t <= ct + 0.14) {
        const dp = t < ct ? (t - (ct - 0.06)) / 0.06 : 1 - (t - ct) / 0.14;
        pressDip = 1 - 0.16 * clamp(dp, 0, 1);
      }
    }

    for (const [t0, t1, a, b, sign, kind] of segs) {
      if (t >= t0 && t <= t1) {
        if (a === b) return { x: a.x, y: a.y, kind, scale: pressDip };
        const p = seg(t, t0, t1, quintInOut);
        const pos = kind === "grabbing"
          ? { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * 26 }
          : quadBezier(a, b, p, sign);
        return { x: pos.x, y: pos.y, kind, scale: pressDip };
      }
    }
    return { x: c.rest.x, y: c.rest.y, kind: "arrow", scale: 1 };
  }

  function activeRipple(t) {
    const clicks = [
      [0.62, C_PTS.newBtn],
      [2.42, C_PTS.qFill],
      [3.90, C_PTS.mSave],
      [5.14, C_PTS.tabBoard],
      [7.45, C_PTS.slotInterview],
      [8.65, C_PTS.chipPy],
      [10.30, C_PTS.cardInterview],
      [12.55, C_PTS.btnMark],
      [15.50, C_PTS.tabInsights],
      [18.14, C_PTS.tabToday]
    ];
    for (const [ct, ptObj] of clicks) {
      if (t >= ct && t <= ct + 0.42) {
        const p = seg(t, ct, ct + 0.42, quintOut);
        return { x: ptObj.x, y: ptObj.y, scale: 0.45 + p * 1.1, opacity: (1 - p) * 0.9 };
      }
    }
    return null;
  }

  function renderViewForTime(t) {
    if (t < 5.2) return { id: "today0", html: renderTodayView(t) };
    if (t < 10.4) return { id: "board", html: renderBoardView(t) };
    if (t < 15.6) return { id: "prep", html: renderEntryPrepView(t) };
    if (t < 18.2) return { id: "insights", html: renderInsightsView(t) };
    // Seamless wrap: crossfade back to exact t=0.0 count during final 0.45s
    if (t >= 20.35) {
      return { id: "today0_loop", html: renderTodayView(0, { highlightRadar: false, countOverride: false }) };
    }
    return { id: "today1", html: renderTodayView(t, { highlightRadar: t >= 18.3 && t < 20.1, countOverride: true }) };
  }

  const TRANSITIONS = [
    { at: 5.20, dur: 0.36, outHtml: (t) => renderTodayView(5.19), inId: "board" },
    { at: 10.40, dur: 0.36, outHtml: (t) => renderBoardView(10.39), inId: "prep" },
    { at: 15.60, dur: 0.36, outHtml: (t) => renderEntryPrepView(15.59), inId: "insights" },
    { at: 18.20, dur: 0.36, outHtml: (t) => renderInsightsView(18.19), inId: "today1" },
    { at: 20.35, dur: 0.40, outHtml: (t) => renderTodayView(20.34, { highlightRadar: false, countOverride: true }), inId: "today0_loop" }
  ];

  let lastCursorKind = "";
  window.__setDemoTime = function (t) {
    const viewOut = document.getElementById("demo-view-out");
    const viewIn = document.getElementById("demo-view-in");
    const navToday = document.getElementById("nav-today");
    const navBoard = document.getElementById("nav-board");
    const navInsights = document.getElementById("nav-insights");
    const navNew = document.getElementById("nav-new-btn");
    const boardCount = document.getElementById("nav-board-count");
    const toast = document.getElementById("demo-toast");

    [navToday, navBoard, navInsights].forEach(el => {
      el.removeAttribute("aria-current");
      el.classList.remove("is-hovered");
    });
    navNew.classList.remove("is-hovered");

    // Sidebar state
    boardCount.textContent = (t >= 4.05 && t < 20.4) ? "11" : "10";
    if (t < 5.2) {
      navToday.setAttribute("aria-current", "page");
      if (t >= 0.42 && t < 0.66) navNew.classList.add("is-hovered");
      if (t >= 4.85 && t < 5.20) navBoard.classList.add("is-hovered");
    } else if (t < 15.6) {
      navBoard.setAttribute("aria-current", "page");
      if (t >= 15.25 && t < 15.60) navInsights.classList.add("is-hovered");
    } else if (t < 18.2) {
      navInsights.setAttribute("aria-current", "page");
      if (t >= 17.90 && t < 18.20) navToday.classList.add("is-hovered");
    } else {
      navToday.setAttribute("aria-current", "page");
    }

    // Dual-layer view crossfade
    const currentView = renderViewForTime(t);
    const activeTx = TRANSITIONS.find(tx => t >= tx.at && t < tx.at + tx.dur && currentView.id === tx.inId);
    if (activeTx) {
      const p = seg(t, activeTx.at, activeTx.at + activeTx.dur, quintOut);
      viewOut.style.display = "block";
      viewOut.innerHTML = activeTx.outHtml(t);
      viewOut.style.opacity = (1 - p).toFixed(3);
      viewOut.style.transform = \`translateY(\${(-10 * p).toFixed(1)}px) scale(\${(1 - 0.015 * p).toFixed(4)})\`;

      viewIn.innerHTML = currentView.html;
      viewIn.style.opacity = p.toFixed(3);
      viewIn.style.transform = \`translateY(\${(14 * (1 - p)).toFixed(1)}px) scale(\${lerp(0.99, 1, p).toFixed(4)})\`;
    } else {
      viewOut.style.display = "none";
      viewOut.innerHTML = "";
      viewIn.innerHTML = currentView.html;
      viewIn.style.opacity = "1";
      viewIn.style.transform = "none";
    }

    // Toast animation (4.05 -> 5.05)
    if (t >= 4.05 && t < 5.05) {
      toast.style.display = "flex";
      const inP = t < 4.32 ? springOut(t - 4.05, 280, 22) : 1;
      const outP = t >= 4.78 ? seg(t, 4.78, 5.05, quintOut) : 0;
      toast.textContent = "Stripe saved to notebook";
      toast.style.opacity = (clamp(inP * 1.4, 0, 1) * (1 - outP)).toFixed(3);
      toast.style.transform = \`translateY(\${((1 - inP) * 14 + outP * 10).toFixed(1)}px)\`;
    } else {
      toast.style.display = "none";
    }

    renderModal(t);

    // Camera transform
    const cam = computeCamera(t);
    document.getElementById("demo-camera").style.transform =
      \`translate(\${cam.tx.toFixed(2)}px, \${cam.ty.toFixed(2)}px) scale(\${cam.scale.toFixed(4)})\`;

    // Cursor mapped through exact active camera transform so it stays crisp and pixel-accurate
    const cur = cursorState(t);
    const screenX = cur.x * cam.scale + cam.tx;
    const screenY = cur.y * cam.scale + cam.ty;
    const cursorEl = document.getElementById("demo-cursor");
    const spec = CURSORS[cur.kind] || CURSORS.arrow;
    if (cur.kind !== lastCursorKind) {
      cursorEl.innerHTML = spec.svg;
      cursorEl.style.transformOrigin = \`\${spec.hotspot[0]}px \${spec.hotspot[1]}px\`;
      lastCursorKind = cur.kind;
    }
    cursorEl.style.transform = \`translate(\${(screenX - spec.hotspot[0]).toFixed(2)}px, \${(screenY - spec.hotspot[1]).toFixed(2)}px) scale(\${cur.scale.toFixed(3)})\`;

    // Ripple mapped through camera transform
    const rip = activeRipple(t);
    const rippleEl = document.getElementById("demo-ripple");
    if (rip) {
      const rx = rip.x * cam.scale + cam.tx;
      const ry = rip.y * cam.scale + cam.ty;
      rippleEl.style.display = "block";
      rippleEl.style.left = \`\${rx.toFixed(1)}px\`;
      rippleEl.style.top = \`\${ry.toFixed(1)}px\`;
      rippleEl.style.transform = \`scale(\${rip.scale.toFixed(3)})\`;
      rippleEl.style.opacity = rip.opacity.toFixed(3);
    } else {
      rippleEl.style.display = "none";
    }
  };

  measureAnchors();
  C_PTS = buildCursorTimeline();
  window.__setDemoTime(0);
})();
</script>
</body>
</html>`;
}

function encodeWebm(ffmpegBin, frameBuffers, framesDir, outPath) {
  const mjpegBuffer = Buffer.concat(frameBuffers);
  const passLog = path.join(framesDir, "vpx_2pass");
  const webmTargetCap = 1200 * 1024;
  const profiles = [
    { outFps: FPS, kbps: 360, max: 480, gop: 240, lag: 25 },
    { outFps: 30, kbps: 360, max: 480, gop: 120, lag: 20 },
    { outFps: 30, kbps: 300, max: 400, gop: 120, lag: 20 }
  ];

  for (const { outFps, kbps, max, gop, lag } of profiles) {
    const commonArgs = [
      "-y",
      "-f", "image2pipe",
      "-framerate", String(FPS),
      "-vcodec", "mjpeg",
      "-i", "pipe:0",
      "-vf", `scale=${OUT_WIDTH}:${OUT_HEIGHT}:flags=lanczos`,
      "-r", String(outFps),
      "-c:v", "libvpx",
      "-b:v", `${kbps}k`,
      "-minrate", "100k",
      "-maxrate", `${max}k`,
      "-bufsize", "700k",
      "-qmin", "10",
      "-qmax", "63",
      "-g", String(gop),
      "-pix_fmt", "yuv420p",
      "-deadline", "good",
      "-cpu-used", "2",
      "-auto-alt-ref", "1",
      "-lag-in-frames", String(lag),
      "-passlogfile", passLog
    ];
    const pass1 = spawnSync(
      ffmpegBin,
      [...commonArgs, "-pass", "1", "-f", "webm", "/dev/null"],
      { input: mjpegBuffer, maxBuffer: 64 * 1024 * 1024 }
    );
    if (pass1.status !== 0) {
      throw new Error(`ffmpeg WebM pass 1 failed: ${pass1.stderr?.toString()}`);
    }
    const pass2 = spawnSync(
      ffmpegBin,
      [...commonArgs, "-pass", "2", "-f", "webm", outPath],
      { input: mjpegBuffer, maxBuffer: 64 * 1024 * 1024 }
    );
    if (pass2.status !== 0) {
      throw new Error(`ffmpeg WebM pass 2 failed: ${pass2.stderr?.toString()}`);
    }
    const size = fs.statSync(outPath).size;
    console.log(`WebM 2-pass ${outFps}fps bitrate=${kbps}k -> ${size} bytes`);
    if (size >= MIN_VIDEO_BYTES && size <= webmTargetCap) {
      return size;
    }
  }
  const finalSize = fs.statSync(outPath).size;
  if (finalSize > MAX_VIDEO_BYTES) {
    throw new Error(`WebM exceeded ${MAX_VIDEO_BYTES} bytes (${finalSize} bytes)`);
  }
  return finalSize;
}

function encodeMp4WithSwift(frameBuffers, framesDir, outPath) {
  const swiftScript = path.join(framesDir, "encode_mp4.swift");
  const swiftSource = `
import AVFoundation
import CoreVideo
import Foundation
import ImageIO

let args = CommandLine.arguments
let outPath = args[1]
let frameCount = Int(args[2])!
let fps = Int32(args[3])!
let bitrate = Int(args[4])!
let outWidth = ${OUT_WIDTH}
let outHeight = ${OUT_HEIGHT}

let outURL = URL(fileURLWithPath: outPath)
try? FileManager.default.removeItem(at: outURL)

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true

let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: outWidth,
  AVVideoHeightKey: outHeight,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoMaxKeyFrameIntervalKey: 180,
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
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func readExact(_ count: Int) -> Data? {
  var buf = Data()
  buf.reserveCapacity(count)
  while buf.count < count {
    let chunk = FileHandle.standardInput.readData(ofLength: count - buf.count)
    if chunk.isEmpty { return nil }
    buf.append(chunk)
  }
  return buf
}

func pixelBuffer(from jpegData: Data, pool: CVPixelBufferPool?) -> CVPixelBuffer? {
  guard let source = CGImageSourceCreateWithData(jpegData as CFData, nil),
        let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
  var buffer: CVPixelBuffer?
  if let pool = pool {
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
  } else {
    CVPixelBufferCreate(nil, outWidth, outHeight, kCVPixelFormatType_32ARGB, attrs as CFDictionary, &buffer)
  }
  guard let pb = buffer else { return nil }
  CVPixelBufferLockBaseAddress(pb, [])
  let data = CVPixelBufferGetBaseAddress(pb)
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  if let ctx = CGContext(
    data: data,
    width: outWidth,
    height: outHeight,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
  ) {
    ctx.interpolationQuality = CGInterpolationQuality.high
    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: outWidth, height: outHeight))
  }
  CVPixelBufferUnlockBaseAddress(pb, [])
  return pb
}

for i in 0..<frameCount {
  guard let lenData = readExact(4), lenData.count == 4 else {
    fatalError("Unexpected EOF reading frame length \\(i)")
  }
  let frameLen = lenData.withUnsafeBytes { Int($0.load(as: UInt32.self).bigEndian) }
  guard let jpegData = readExact(frameLen) else {
    fatalError("Unexpected EOF reading frame data \\(i)")
  }
  while !input.isReadyForMoreMediaData {
    Thread.sleep(forTimeInterval: 0.005)
  }
  guard let pb = pixelBuffer(from: jpegData, pool: adaptor.pixelBufferPool) else {
    fatalError("Failed to decode frame \\(i)")
  }
  let pts = CMTime(value: CMTimeValue(i), timescale: fps)
  adaptor.append(pb, withPresentationTime: pts)
}

input.markAsFinished()
let sema = DispatchSemaphore(value: 0)
writer.finishWriting { sema.signal() }
sema.wait()
if writer.status != .completed {
  fatalError("AVAssetWriter failed: \\(String(describing: writer.error))")
}
`;
  fs.writeFileSync(swiftScript, swiftSource);

  const chunks = [];
  for (const buf of frameBuffers) {
    const hdr = Buffer.allocUnsafe(4);
    hdr.writeUInt32BE(buf.length, 0);
    chunks.push(hdr, buf);
  }
  const packedFrames = Buffer.concat(chunks);

  const tempOut = path.join(framesDir, "temp_out.mp4");
  const bitrates = [340_000, 290_000, 250_000];
  for (const bps of bitrates) {
    const res = spawnSync(
      "/usr/bin/swift",
      [swiftScript, tempOut, String(TOTAL_FRAMES), String(FPS), String(bps)],
      { input: packedFrames, maxBuffer: 64 * 1024 * 1024 }
    );
    if (res.status !== 0) {
      throw new Error(`Swift MP4 encoding failed: ${res.stderr?.toString()}`);
    }
    const size = fs.statSync(tempOut).size;
    console.log(`MP4 bitrate=${bps} -> ${size} bytes`);
    if (size >= MIN_VIDEO_BYTES && size <= MAX_VIDEO_BYTES) {
      fs.copyFileSync(tempOut, outPath);
      return size;
    }
  }
  const finalSize = fs.statSync(tempOut).size;
  if (finalSize > MAX_VIDEO_BYTES) {
    throw new Error(`MP4 exceeded ${MAX_VIDEO_BYTES} bytes (${finalSize} bytes)`);
  }
  fs.copyFileSync(tempOut, outPath);
  return finalSize;
}

function checkMp4Faststart(mp4Path) {
  const buf = fs.readFileSync(mp4Path);
  const moovIdx = buf.indexOf(Buffer.from("moov"));
  const mdatIdx = buf.indexOf(Buffer.from("mdat"));
  return { moovIdx, mdatIdx, faststart: moovIdx !== -1 && mdatIdx !== -1 && moovIdx < mdatIdx };
}

async function main() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const appCss = fs.readFileSync(STYLES_PATH, "utf8");
  const ffmpegBin = findFfmpeg();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-tour-frames-"));

  const browser = await chromium.launch({ headless: true });
  try {
    const sceneHtml = buildSceneHtml(appCss);
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: DEVICE_SCALE_FACTOR
    });
    const page = await context.newPage();
    await page.setContent(sceneHtml, { waitUntil: "load" });

    const frameBuffers = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const t = i / FPS;
      await page.evaluate(time => window.__setDemoTime(time), t);
      frameBuffers.push(await page.screenshot({ type: "jpeg", quality: 84 }));
    }

    // Export crisp 1280x720 poster from the autofilled Stripe modal frame (t = 3.55s)
    const posterPath = path.join(MEDIA_DIR, "demo-tour-poster.jpg");
    const posterContext = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1
    });
    try {
      const posterPage = await posterContext.newPage();
      await posterPage.setContent(sceneHtml, { waitUntil: "load" });
      await posterPage.evaluate(() => window.__setDemoTime(3.55));
      await posterPage.screenshot({ path: posterPath, type: "jpeg", quality: 90 });
    } finally {
      await posterContext.close();
    }

    const mp4Path = path.join(MEDIA_DIR, "demo-tour.mp4");
    const webmPath = path.join(MEDIA_DIR, "demo-tour.webm");

    const webmBytes = encodeWebm(ffmpegBin, frameBuffers, tempDir, webmPath);
    const mp4Bytes = encodeMp4WithSwift(frameBuffers, tempDir, mp4Path);
    const posterBytes = fs.statSync(posterPath).size;
    const faststart = checkMp4Faststart(mp4Path);

    console.log(JSON.stringify({
      frames: TOTAL_FRAMES,
      fps: FPS,
      durationSec: DURATION_SEC,
      resolution: `${OUT_WIDTH}x${OUT_HEIGHT}`,
      posterBytes,
      mp4Bytes,
      webmBytes,
      faststart
    }, null, 2));

    if (!faststart.faststart) {
      throw new Error("MP4 is not faststart (moov atom must precede mdat)");
    }
  } finally {
    await browser.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
