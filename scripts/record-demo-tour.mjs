import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS, LOGO } from "../src/main/resources/public/js/ui/icons.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "src/main/resources/public");
const MEDIA_DIR = path.join(PUBLIC_DIR, "media");

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
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
const POSTER_TIME = 4.1;
const CHAPTERS = { clipper: 0, board: 5, prep: 10, openings: 15, calendar: 20, insights: 25 };

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

function createTimeline(chapters, loopEnd) {
  const whip = 0.18;
  const dissolve = loopEnd - 0.4;
  const shots = [
    ["hook", "clipper", chapters.clipper], ["quick", "clipper", 1.8],
    ["board", "board", chapters.board], ["drag", "board", 6.8],
    ["prep", "prep", chapters.prep], ["readiness", "prep", 12.65],
    ["openings", "openings", chapters.openings], ["opening", "openings", 17.05],
    ["calendar", "calendar", chapters.calendar], ["confirmed", "calendar", 22.8],
    ["insights", "insights", chapters.insights], ["outro", "insights", 26.8]
  ].map(([id, chapter, start]) => ({ id, chapter, start, dark: (chapters[chapter] / 5) % 2 === 0 }));
  const actions = {
    newApplication: 2.55, paste: 2.93, scan: 3.27, saveStripe: 4.75,
    grab: 7.5, drop: 8.3, python: 9.25,
    term: 15.9, saveOpening: 18.1, export: 20.9, download: 21.95
  };
  const clicks = [
    ["quick", "new", actions.newApplication], ["quick", "save-stripe", actions.saveStripe],
    ["drag", "stripe", actions.grab], ["drag", "python", actions.python],
    ["openings", "term", actions.term], ["opening", "save-opening", actions.saveOpening],
    ["calendar", "export", actions.export], ["calendar", "download", actions.download]
  ].map(([shot, target, at]) => ({ shot, target, at }));
  const clamp = x => Math.min(1, Math.max(0, x));
  const smooth = x => x * x * (3 - 2 * x);
  const out = x => x === 1 ? 1 : 1 - 2 ** (-10 * x);
  const progress = (t, from, to, ease = smooth) => ease(clamp((t - from) / (to - from)));
  const spring = x => x <= 0 ? 0 : 1 - Math.exp(-12 * x) * (Math.cos(20 * x) + 0.6 * Math.sin(20 * x));

  function at(t) {
    if (t >= loopEnd) t = 0;
    const index = shots.findLastIndex(shot => t >= shot.start);
    const shot = shots[index];
    const previous = shots[index - 1];
    const whipping = previous?.chapter === shot.chapter && t < shot.start + whip;
    const pan = whipping ? progress(t, shot.start, shot.start + whip, out) : 0;
    const mix = whipping ? progress(t, shot.start, shot.start + whip) : 0;
    const layers = whipping ? [
      { shot: previous, t: shot.start, shift: -112 * pan, opacity: 1 - mix },
      { shot, t, shift: 112 * (1 - pan), opacity: mix }
    ] : [{ shot, t, shift: 0, opacity: 1 }];
    if (t >= dissolve) {
      layers.push({ shot: shots[0], t: 0, shift: 0, opacity: progress(t, dissolve, loopEnd), canvas: true });
    }
    return { t, shot, whipping, layers };
  }

  const stages = [
    { label: "Saved", color: "#16a34a", wash: "#e2f5e9", ink: "#12693b" },
    { label: "Applied", color: "#2563eb", wash: "#e4edff", ink: "#1846ac" },
    { label: "Interview", color: "#df950d", wash: "#fff0d4", ink: "#8a4e00" },
    { label: "Offer", color: "#1baf7a", wash: "#dcf7ef", ink: "#12684e" }
  ];
  const initial = [
    ["Northwind", "Backend Intern", 0, ["Python", "SQL"]],
    ["Figma", "Product Design Intern", 0, ["Figma"]],
    ["Linear", "Software Intern", 0, ["TypeScript"]],
    ["Shopify", "Frontend Intern", 1, ["TypeScript", "React"]],
    ["Datadog", "Platform Intern", 1, ["Go"]],
    ["Ramp", "Product Engineer Intern", 1, ["TypeScript"]],
    ["Cedar Grove", "Platform Intern", 2, ["Python", "Go"]],
    ["Ada", "Data Engineer Intern", 2, ["Python", "SQL"]],
    ["Vercel", "Web Platform Intern", 2, ["TypeScript"]],
    ["Kitebird", "Platform Intern", 3, ["Go"]]
  ].map(([company, role, stage, skills]) => ({ company, role, stage, skills }));
  const stripe = { company: "Stripe", role: "Software Engineer Intern", location: "Seattle, WA", skills: ["Python", "Go", "SQL"] };
  const term = "Summer 2027";
  const openings = [
    ["Cloudflare", "Systems Engineer Intern", "Austin, TX", term],
    ["Notion", "Product Engineer Intern", "New York, NY", "Fall 2027"],
    ["Wealthsimple", "Software Developer Intern", "Toronto, ON", term],
    ["Fathom", "Data Engineering Intern", "Vancouver, BC", term],
    ["Sentry", "Developer Tools Intern", "Toronto, ON", term]
  ].map(([company, role, location, term]) => ({ company, role, location, term }));
  const readiness = 88;

  function notebook(t) {
    const active = [...initial];
    if (t >= actions.saveStripe) active.push({ ...stripe, stage: t < actions.drop ? 1 : 2 });
    if (t >= actions.saveOpening) active.push({ ...openings[0], stage: 0, skills: ["Go"] });
    const columns = stages.map((_, i) => active.filter(app => app.stage === i));
    const python = active.filter(app => app.skills.includes("Python"));
    const funnel = columns.map((_, i) => columns.slice(i).flat().length);
    const counts = new Map();
    for (const app of active.filter(app => app.stage >= 2)) {
      for (const skill of app.skills) counts.set(skill, (counts.get(skill) || 0) + 1);
    }
    const skills = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { active, columns, python, funnel, skills };
  }

  return { at, shots, actions, clicks, whip, dissolve, progress, out, spring,
    stages, stripe, openings, term, readiness, notebook };
}

function buildSceneHtml(icons, logo) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
:root {
  font: 16px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --ink: #0f172a;
  --porcelain: #faf9f6;
  --terra: #b33812;
  --cobalt: #2563eb;
  --green: #1baf7a;
  --paper-line: #e3e6ee;
  --muted: #49576e;
}
*, *::before, *::after { box-sizing: border-box; }
html, body, main { width: 100%; height: 100%; margin: 0; overflow: hidden; }
main { position: relative; isolation: isolate; }
h1, h2, h3, p { margin: 0; }
button { font: inherit; }
svg { display: block; flex: none; }
em { color: var(--accent); font-style: normal; }
.canvas, .shot { position: absolute; inset: 0; }
.canvas.dark {
  --accent: #d94e28;
  color: #fff;
  background: radial-gradient(ellipse at 42% 112%, #d94e2849, transparent 57%),
    radial-gradient(ellipse at 67% 107%, #2563eb46, transparent 58%),
    linear-gradient(149deg, #090c12 35%, #070a12);
}
.canvas.light {
  --accent: #b33812;
  color: var(--ink);
  background: radial-gradient(ellipse at 42% 2%, #fff 16%, transparent 74%),
    linear-gradient(150deg, #fff, #f2f0ea 54%, #e8ecf4);
}
.shot-title {
  position: absolute; top: 65px; left: 0; width: 100%; text-align: center;
  font-size: 59px; line-height: 1.04; font-weight: 750; letter-spacing: -.065em;
}
.space { position: absolute; perspective: 1400px; transform-style: preserve-3d; }
.tilt, .mount { position: relative; transform-style: preserve-3d; }
.mount::before {
  content: ""; position: absolute; inset: 8% 1% -5%; border-radius: 28%;
  background: radial-gradient(ellipse at 16% 75%, #d94e2875, transparent 66%),
    radial-gradient(ellipse at 87% 22%, #2563eb80, transparent 67%),
    radial-gradient(ellipse at 82% 92%, #1baf7a6e, transparent 60%);
  filter: blur(30px); transform: translateZ(-36px);
}
.surface {
  position: relative; transform: translateZ(8px); color: var(--ink);
  background: linear-gradient(148deg, #fff 0%, var(--porcelain) 100%);
  border: 1px solid #fff; border-radius: 26px;
  box-shadow: 0 30px 64px -27px #080e2459, 0 10px 24px -14px #080e244a, 0 0 0 1px #0f172a16;
}
.dark .surface { box-shadow: 0 36px 75px -22px #000b, 0 0 0 1px #fff2; }
.icon { width: 20px; height: 20px; }
.logo { display: flex; align-items: center; }
.logo svg { width: 34px; height: 34px; }
.chip, .button {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  position: relative; white-space: nowrap; border-radius: 999px; font-weight: 680;
}
.chip { padding: 6px 11px; background: #edf0f6; color: #35445d; font-size: 13px; }
.button { padding: 10px 15px; background: #fff; color: var(--ink); border: 1px solid #d4dbe8; }
.button.primary { background: var(--terra); border-color: #94310f; color: #fff; }
.button.active { background: #e4edff; border-color: #a7bff9; color: #1846ac; }
.button.done { background: #e2f5e9; border-color: #b4e0c4; color: #12693b; }
.button.pressed { filter: brightness(.92); }
.hitpoint { position: absolute; top: 50%; left: 50%; width: 0; height: 0; pointer-events: none; }
.check-svg { width: 100%; height: 100%; overflow: visible; }
.badge {
  display: grid; place-items: center; width: 35px; height: 35px;
  color: #137553; border-radius: 50%; background: #dff8ed; box-shadow: inset 0 0 0 1px #1baf7a38;
}
.badge svg { width: 22px; height: 22px; }
.typing-caret { display: inline-block; width: .045em; height: .82em; margin-left: .09em; vertical-align: -.025em; background: currentColor; }

.hook-title {
  position: absolute; top: 248px; left: 120px; right: 120px; z-index: 1;
  font-size: 90px; line-height: 1.03; letter-spacing: -.066em; font-weight: 750; text-align: center;
  text-shadow: 0 4px 44px #070a12;
}
.hook-title > span { display: block; min-height: 1.03em; }
.ghost-layer { position: absolute; inset: 0; pointer-events: none; }
.ghost .surface { padding: 18px; color: #b3c0d7; background: #151d30; border-color: #7d8da84d; }
.ghost .mount::before { opacity: .46; }
.ghost h2 { font-size: 20px; }
.ghost p { margin: 8px 0 15px; font-size: 14px; }
.ghost-grid { height: 112px; margin-top: 15px; border: 1px solid #8094b44d; border-radius: 6px;
  background: repeating-linear-gradient(to right, transparent 0 41px, #8094b44d 41px 42px),
    repeating-linear-gradient(to bottom, transparent 0 21px, #8094b44d 21px 22px),
    linear-gradient(#364560 21px, transparent 21px); }
.ghost-lines { display: grid; gap: 9px; }
.ghost-lines i { height: 5px; border-radius: 3px; background: #7283a25c; }
.ghost-lines i:nth-child(2) { width: 76%; }
.ghost-lines i:nth-child(3) { width: 56%; }

.new-application .surface { padding: 17px; border-radius: 29px; }
.new-application .button { width: 100%; font-size: 32px; padding: 23px 20px; letter-spacing: -.035em; }
.new-application .icon { width: 28px; height: 28px; }
.quick .surface { padding: 23px; }
.quick-head { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
.quick-head h2 { font-size: 28px; letter-spacing: -.045em; }
.quick-head .app-icon { background: #eee8ff; color: #5536a6; }
.app-icon {
  width: 40px; height: 40px; display: grid; place-items: center; flex: none;
  border-radius: 12px; background: #f9e6df; color: var(--terra); font-weight: 760;
}
.link-bar {
  display: flex; align-items: center; gap: 10px; height: 51px; padding: 0 13px;
  border: 1px solid #b4c0d8; border-radius: 12px; background: #f0f4fb; color: #263654;
  font: 550 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; white-space: nowrap;
}
.quick-result { position: relative; margin-top: 16px; height: 172px; padding: 11px 12px; background: #edf1f684; border-radius: 12px; }
.quick-result p { font-size: 13px; color: var(--muted); font-weight: 680; margin-bottom: 10px; }
.quick-fields { display: flex; flex-wrap: wrap; align-content: start; gap: 8px; }
.quick-fields .chip { justify-content: flex-start; border: 1px solid #d9e3f0; background: #fff; font-size: 15px; padding: 7px 11px; }
.quick-fields .skill { background: #e4edff; color: #1846ac; border-color: #cbdafe; }
.quick-fields .icon { width: 15px; height: 15px; }
.reticle, .scan-beam { position: absolute; pointer-events: none; }
.reticle { inset: -1px; width: calc(100% + 2px); height: calc(100% + 2px); color: #2563eb; filter: drop-shadow(0 0 5px #447fff9c); }
.scan-beam { left: 5px; right: 5px; height: 2px; background: #65a0ff; box-shadow: 0 0 12px 3px #488aff83; }
.quick-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; height: 42px; }
.quick-foot .button { min-width: 168px; }
.quick-foot > span { color: var(--muted); font-weight: 670; font-size: 14px; }
.flank { position: absolute; top: 315px; width: 295px; font-size: 48px; font-weight: 750; letter-spacing: -.065em; line-height: 1.03; }
.flank.left { right: 942px; text-align: right; }
.flank.right { left: 941px; }

.window .surface { border-radius: 17px; }
.chrome { display: grid; grid-template-columns: 88px 1fr 88px; align-items: center; padding: 0 14px; height: 37px; background: #fbfcfe; border-radius: 17px 17px 0 0; border-bottom: 1px solid var(--paper-line); }
.traffic { display: flex; gap: 6px; }
.traffic i { width: 9px; height: 9px; border-radius: 50%; background: #ff6058; }
.traffic i:nth-child(2) { background: #ffbb36; }
.traffic i:nth-child(3) { background: #2ac845; }
.window-name { text-align: center; font-size: 11px; font-weight: 650; color: #4d5c74; }
.window-body { display: grid; grid-template-columns: 171px minmax(0, 1fr); height: 443px; }
.sidebar { display: flex; flex-direction: column; gap: 7px; padding: 17px 11px; background: var(--ink); color: #f8fafc; border-radius: 0 0 0 16px; }
.sidebar .logo { gap: 6px; font-size: 12px; line-height: 1.13; font-weight: 740; margin-bottom: 16px; }
.sidebar nav { display: grid; gap: 5px; }
.sidebar .tab { display: flex; gap: 9px; align-items: center; padding: 8px; border-radius: 7px; font-size: 12px; color: #c7d1e4; }
.sidebar .tab[aria-current] { color: #fff; background: #ffffff1d; font-weight: 720; }
.sidebar .icon { width: 15px; height: 15px; }
.sidebar-count { display: flex; align-items: center; gap: 6px; margin: auto 5px 0; font-size: 12px; color: #c7d1e4; }
.sidebar-count::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #1baf7a; }
.window-content { padding: 19px 22px; }
.pane-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.pane-header h2 { font-size: 32px; letter-spacing: -.048em; }
.filters { display: flex; align-items: center; gap: 7px; margin-bottom: 13px; }
.filters .button, .pane-header .button { font-size: 12px; padding: 6px 11px; }
.column-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.column { padding: 8px; border-radius: 11px; background: #edf0f6; min-height: 236px; }
.column h3 { display: flex; align-items: center; gap: 6px; margin: 1px 0 8px; font-size: 12px; color: var(--stage-ink); }
.column h3 i { width: 6px; height: 6px; border-radius: 50%; background: var(--stage-color); }
.column h3 b { border-radius: 5px; background: var(--stage-wash); margin-left: auto; padding: 3px 5px; }
.mini-card { padding: 7px; min-height: 45px; background: #fff; border: 1px solid #e0e6ef; border-left: 2px solid var(--stage-color); border-radius: 6px; margin-top: 5px; }
.mini-card b, .mini-card span { display: block; }
.mini-card b { font-size: 12px; }
.mini-card span { font-size: 10px; color: var(--muted); }

.lanes { position: absolute; left: 258px; right: 258px; top: 204px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
.lane { min-height: 313px; padding: 17px 22px; border-radius: 27px; border: 1.5px dashed #aab8cf; background: #ffffff8c; color: var(--stage-ink); }
.lane > b { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; }
.lane > b::before { content: ""; width: 8px; height: 8px; background: var(--stage-color); border-radius: 50%; }
.lane:last-child { background: #fff3dd80; border-color: #d9b77d; }
.drag-card .surface {
  padding: 17px 19px; min-height: 202px;
  box-shadow: 0 calc(30px + 22px * var(--lift, 0)) calc(63px + 28px * var(--lift, 0)) -25px #080e246b, 0 0 0 1px #0f172a16;
}
.drag-card [data-anchor] { position: relative; min-height: 166px; }
.drag-card h2 { margin: 12px 0 1px; font-size: 29px; letter-spacing: -.04em; }
.drag-card p { color: var(--muted); font-size: 14px; }
.drag-card .tags { display: flex; gap: 5px; margin-top: 12px; }
.drag-card .status { float: right; position: relative; width: 95px; height: 28px; }
.status .chip { position: absolute; inset: 0; background: var(--stage-wash); color: var(--stage-ink); }
.stamp { display: flex; align-items: center; justify-content: center; gap: 6px; position: absolute; inset: auto 0 -51px; color: #12694c; font-size: 17px; font-weight: 750; white-space: nowrap; }
.stamp svg { width: 27px; height: 27px; color: #1baf7a; }
.python-filter { position: absolute; left: 0; right: 0; top: 551px; display: flex; justify-content: center; align-items: center; gap: 8px; }
.python-filter .button { min-width: 118px; }
.python-results { position: absolute; inset: 49px 0 auto; display: flex; justify-content: center; align-items: center; gap: 7px; }
.python-results .chip { background: #fff; border: 1px solid #d4dbe8; }

.prep-pill .surface { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px 15px 22px; border-radius: 999px; }
.prep-pill h2 { flex: 1; font-size: 23px; letter-spacing: -.035em; }
.prep-pill .app-icon { margin-right: 14px; background: #eef2f8; color: #33496c; border-radius: 50%; }
.prep-pill .badge { width: 40px; height: 40px; }
.ring-orbit { width: 336px; height: 336px; display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle, #10251f, #101b22 55%, #09141d 68%); border: 1px solid #1baf7a2e; box-shadow: 0 0 95px -28px #1baf7a76, inset 0 0 32px #1baf7a19; }
.ring-orbit > svg { position: absolute; inset: 14px; width: 306px; height: 306px; filter: drop-shadow(0 0 8px #1baf7aab); }
.score { position: relative; text-align: center; color: #fff; font-variant-numeric: tabular-nums; }
.score b { font-size: 87px; font-weight: 760; letter-spacing: -.074em; }
.score span { color: #b9cbcb; margin-left: 6px; font-size: 24px; font-weight: 650; }
.score p { margin-top: 4px; font-size: 19px; font-weight: 640; color: #baf2dc; }
.score .check-svg { color: #1baf7a; width: 31px; height: 31px; margin: 10px auto 0; }

.feed { border-radius: 12px; border: 1px solid var(--paper-line); background: #fff; }
.feed-row { display: grid; grid-template-columns: 114px 1fr 87px 86px 52px; gap: 8px; align-items: center; padding: 11px 9px 11px 12px; font-size: 11px; }
.feed-row + .feed-row { border-top: 1px solid var(--paper-line); }
.feed-row b { font-size: 12px; }
.feed-row .chip, .feed-row .button { font-size: 10px; padding: 4px 5px; }
.opening-card .surface { padding: 23px 27px; }
.opening-top { display: flex; align-items: center; gap: 15px; }
.opening-top .app-icon { width: 51px; height: 51px; border-radius: 15px; }
.opening-top .icon { width: 23px; height: 23px; }
.opening-top h2 { font-size: 34px; letter-spacing: -.05em; }
.opening-top .button { margin-left: auto; min-width: 106px; font-size: 17px; }
.opening-card h3 { margin: 25px 0 12px; font-size: 27px; letter-spacing: -.04em; }
.opening-meta { display: flex; align-items: center; gap: 8px; }
.opening-meta .chip { font-size: 15px; }
.opening-meta .icon { width: 16px; height: 16px; }
.opening-count { position: absolute; top: 500px; left: 0; right: 0; text-align: center; font-size: 17px; font-weight: 700; color: var(--muted); }
.opening-count b { color: #12694c; }
.toast {
  position: absolute; left: 50%; top: 549px; width: max-content;
  display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #ccd9d5;
  border-radius: 999px; padding: 8px 17px 8px 9px; color: var(--ink);
  font-size: 15px; font-weight: 700; box-shadow: 0 12px 26px #0f172a20;
}
.toast .badge { width: 29px; height: 29px; }

.radar .surface { padding: 24px; }
.radar-head { position: relative; display: flex; align-items: center; gap: 12px; height: 42px; margin-bottom: 18px; z-index: 1; }
.radar-head h2 { font-size: 30px; letter-spacing: -.05em; }
.radar-head > .button, .radar-head > .chip { margin-left: auto; }
.export-menu { position: absolute; right: 0; top: 50px; background: #fff; padding: 6px; border: 1px solid #d3dbe8; border-radius: 12px; box-shadow: 0 12px 24px #0f172a30; }
.export-menu .button { border-radius: 8px; background: #f0f4fb; }
.radar-event { display: grid; grid-template-columns: 65px 1fr; gap: 14px; align-items: center; padding: 14px 16px; background: #edf1f6; border-radius: 13px; }
.radar-event + .radar-event { margin-top: 9px; }
.date { display: grid; justify-items: center; gap: 1px; padding: 8px; border-radius: 9px; background: #fff; color: #465672; font-size: 12px; font-weight: 670; }
.date b { font-size: 25px; line-height: 1; color: var(--ink); }
.radar-event h3 { font-size: 17px; margin-bottom: 5px; }
.radar-event .chip { font-size: 11px; color: #8a4e00; background: #fff0d4; }
.radar-event p { color: var(--muted); font-size: 13px; }
.confirm-card .surface { display: flex; align-items: center; gap: 17px; padding: 16px 25px 16px 17px; border-radius: 999px; }
.confirm-card .check-svg { width: 53px; height: 53px; color: #1baf7a; filter: drop-shadow(0 0 7px #1baf7a79); }
.confirm-card h2 { font-size: 23px; letter-spacing: -.032em; }

.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-bottom: 12px; }
.kpi, .chart { background: #fff; border: 1px solid var(--paper-line); border-radius: 12px; padding: 12px; }
.kpi p { color: var(--muted); font-size: 12px; font-weight: 680; }
.kpi b { display: block; margin-top: 5px; font-size: 26px; letter-spacing: -.045em; }
.insight-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 9px; }
.chart h3 { font-size: 16px; margin-bottom: 13px; letter-spacing: -.028em; }
.chart-row { display: grid; grid-template-columns: 54px minmax(0, 1fr) 62px; gap: 7px; align-items: center; margin-top: 10px; font-size: 11px; }
.chart-row b { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.chart-row small { color: var(--muted); font-size: inherit; font-weight: 500; }
.chart-track { height: 10px; background: #eef1f6; border-radius: 999px; }
.chart-track i { display: block; width: 100%; height: 100%; background: var(--bar); border-radius: inherit; transform-origin: left; }
.skills .chart-row { grid-template-columns: 59px minmax(0, 1fr) 15px; }

.outro h1 { position: absolute; left: 0; right: 0; top: 242px; text-align: center; font-size: 112px; letter-spacing: -.072em; font-weight: 760; }
.lockup { position: absolute; inset: 288px 0 auto; display: grid; justify-items: center; }
.lockup .logo svg { width: 92px; height: 92px; filter: drop-shadow(0 14px 18px #152a4a36); }
.lockup h2 { margin: 10px 0 20px; font-size: 42px; letter-spacing: -.055em; }
.domain { color: #fff; background: #0f172a; border: 1px solid #44506d; padding: 12px 25px; border-radius: 999px; font-size: 18px; font-weight: 670; box-shadow: 0 5px 34px #2563eb44, 0 7px 35px #d94e2837; }

.cursor, .ripple { position: absolute; top: 0; left: 0; pointer-events: none; }
.cursor { z-index: 3; filter: drop-shadow(0 2px 3px #090c1259); }
.ripple { z-index: 2; width: 38px; height: 38px; border-radius: 50%; border: 2px solid #5880e4; box-shadow: 0 0 0 1px #fff8; }
</style>
</head>
<body><main></main>
<script>
const timeline = (${createTimeline.toString()})(${JSON.stringify(CHAPTERS)}, ${LOOP_REST_START});
(${installScene.toString()})(timeline, ${JSON.stringify(icons)}, ${JSON.stringify(logo)});
</script>
</body>
</html>`;
}

function installScene(timeline, icons, logo) {
  const { actions, at, clicks, notebook, openings, out, progress, readiness, spring, stages, stripe, term } = timeline;
  const root = document.querySelector("main");
  const quickUrl = "https://boards.greenhouse.io/stripe/jobs/98765";
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const brand = (text = "") => `<span class="logo">${logo}${text}</span>`;
  const title = (lead, accent) => `<h1 class="shot-title">${lead ? lead + " " : ""}<em>${accent}</em></h1>`;
  const chip = (label, className = "") => `<span class="chip ${className}">${label}</span>`;
  const stageStyle = ({ color, wash, ink }) => `--stage-color:${color};--stage-wash:${wash};--stage-ink:${ink}`;
  const hitpoint = '<i class="hitpoint" aria-hidden="true"></i>';
  const pressed = (t, when) => t >= when && t < when + 0.08 ? "pressed" : "";
  const button = (label, target = "", className = "") => `<button type="button" class="button ${className}" ${target ? `data-anchor="${target}"` : ""}>${label}${target ? hitpoint : ""}</button>`;
  const fadeUp = (p, distance = 18) => `opacity:${Math.max(0, Math.min(p, 1))};transform:translateY(${(1 - p) * distance}px)`;

  function rig(name, t, { x, y, w, rx = 0, ry = 0, scale = 1, sway = 1, age, alpha = 1, lift = 0 }, html) {
    const dx = Math.sin(t * 1.35 + x / 370) * 6 * sway;
    const dy = Math.sin(t * 1.7 + y / 270) * 4 * sway;
    const push = 1 + Math.sin(t * 1.1) * 0.014 * sway;
    const drift = `translate(${dx}px,${dy}px) rotateX(${rx + dy * .22}deg) rotateY(${ry + dx * .2}deg) scale(${scale * push})`;
    const p = age === undefined ? 1 : spring(age);
    const mount = p === 1 ? "" : ` style="transform:translateY(${(1 - p) * 22}px) scale(${.9 + .1 * p});opacity:${progress(age, 0, .19, out)}"`;
    return `<div class="space ${name}" style="left:${x}px;top:${y}px;width:${w}px${lift ? `;--lift:${lift}` : ""}" data-drift="${name}">
      <div class="tilt" style="transform:${drift}"><div class="mount"${mount}><div class="surface"${alpha === 1 ? "" : ` style="opacity:${alpha}"`}>${html}</div></div></div>
    </div>`;
  }

  function check(p, ring = false) {
    return `<svg class="check-svg" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${ring ? `<circle cx="20" cy="20" r="17" opacity=".18"/><circle cx="20" cy="20" r="17" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}" transform="rotate(-90 20 20)"/>` : ""}
      <path d="m12 20 5.5 5.5L28 14.5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}"/>
    </svg>`;
  }

  function hook(t) {
    const word = "internships";
    const suffix = "in a spreadsheet?";
    const count = Math.floor(progress(t, 0.025, 1.43, x => x) * (word.length + suffix.length));
    const tail = count < word.length ? "" : suffix.slice(0, count - word.length);
    const caret = `<i class="typing-caret" style="opacity:${Math.floor(t / .26) % 2 ? 0 : 1}" aria-hidden="true"></i>`;
    const ghosts = [
      [{ x: 96, y: 116, w: 302, rx: 9, ry: -12, sway: 1.45 }, 3.4, .75, '<h2>Internship tracker</h2><div class="ghost-grid"></div>'],
      [{ x: 920, y: 98, w: 242, rx: -6, ry: 12, sway: .68 }, 5.7, .59, '<h2>Software Intern</h2><p>Application</p><div class="ghost-lines"><i></i><i></i><i></i></div>'],
      [{ x: 842, y: 492, w: 296, rx: 8, ry: -10, sway: 1.22 }, 3, .69, '<h2>Product Engineering</h2><p>Interview</p><div class="ghost-lines"><i></i><i></i><i></i></div>'],
      [{ x: 154, y: 493, w: 196, rx: -10, ry: 10, sway: .82 }, 6.8, .45, '<h2>Applications</h2><div class="ghost-grid"></div>']
    ];
    return ghosts.map(([pose, blur, alpha, content], i) => `<div class="ghost-layer" style="filter:blur(${blur}px)" aria-hidden="true">${rig(`ghost ghost-${i}`, t, { ...pose, alpha }, content)}</div>`).join("") +
      `<h1 class="hook-title"><span>Still tracking <em>${word.slice(0, count)}</em>${count < word.length ? caret : ""}</span>
        <span>${tail}${count >= word.length ? caret : ""}</span></h1>`;
  }

  function quick(t, age) {
    const head = title("1-Click Job", "Clipper");
    const open = actions.newApplication + .09;
    if (t < open) {
      return head + rig("new-application", age, { x: 404, y: 295, w: 472, rx: 8, ry: -10, age },
        button(icon("plus") + "New application", "new", "primary " + pressed(t, actions.newApplication)));
    }
    const typed = quickUrl.slice(0, Math.floor(quickUrl.length * progress(t, actions.paste, actions.paste + .26, x => x)));
    const bar = `<header class="quick-head"><span class="app-icon">${icon("link")}</span><h2>Quick Fill</h2></header>
      <div class="link-bar">${icon("link")}<span>${typed || "Paste a job link"}${t >= actions.paste && t < actions.scan ? '<i class="typing-caret"></i>' : ""}</span></div>`;
    const paste = `<p class="flank left" style="${fadeUp(progress(t, open + .09, open + .48, out))}">Paste <em>any link.</em></p>`;
    const barExit = progress(t, actions.scan, actions.scan + .18);
    const barCard = barExit < 1 ? rig("quick quick-bar", age, { x: 374, y: 229, w: 532, rx: 7, ry: -9, age: t - open, alpha: 1 - barExit }, bar) : "";
    if (t < actions.scan) return head + barCard + paste;
    const scan = progress(t, actions.scan, 4.26, out);
    const beam = progress(t, actions.scan, 4.18);
    const locked = progress(t, 4.12, 4.42);
    const fields = [
      [stripe.company, "notebook", 3.61], [stripe.role, "file", 3.72], [stripe.location, "pin", 3.83],
      ...stripe.skills.map((skill, i) => [skill, "", 3.93 + i * .05])
    ];
    const badges = fields.map(([label, glyph, from]) =>
      `<span style="${fadeUp(spring(t - from), 12)}">${chip((glyph ? icon(glyph) : "") + label, glyph ? "" : "skill")}</span>`
    ).join("");
    const saved = t >= actions.saveStripe;
    const filled = `<p class="flank right" style="${fadeUp(progress(t, 3.71, 4.16, out))}">Every field<br><em>filled.</em></p>`;
    const card = bar + `<div class="quick-result">
        <p>Instant link parsing</p><div class="quick-fields">${badges}</div>
        <svg class="reticle" viewBox="0 0 480 172" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="opacity:${scan * (1 - .8 * locked)}" aria-hidden="true">
          <path d="M2 25V2h25 M453 2h25v23 M478 147v23h-25 M27 170H2v-23"/>
        </svg>
        <i class="scan-beam" style="top:${8 + 83 * beam}%;opacity:${Math.sin(Math.PI * beam) * .64}" aria-hidden="true"></i>
      </div>
      <footer class="quick-foot"><span>${notebook(t).active.length} active applications</span>
        ${t >= 4.17 ? button(saved ? icon("check") + "Saved" : "Save to notebook", "save-stripe", (saved ? "done " : "primary ") + pressed(t, actions.saveStripe)) : ""}
      </footer>`;
    return head + barCard + rig("quick", age, { x: 374, y: 196, w: 532, rx: 7, ry: -9, age: t - actions.scan }, card) + paste + filled;
  }

  function appWindow(t, age, tab, content, flip = 1) {
    const nav = [["Today", "today"], ["Board", "board"], ["Applications", "notebook"], ["Insights", "insights"]];
    return rig("window", age, { x: 180, y: 166, w: 920, rx: 5, ry: -7 * flip }, `
      <div class="chrome"><span class="traffic" aria-hidden="true"><i></i><i></i><i></i></span><span class="window-name">My Internship Notebook</span></div>
      <div class="window-body">
        <aside class="sidebar">${brand("My Internship<br>Notebook")}
          <nav>${nav.map(([label, glyph]) => `<span class="tab" ${label === tab ? 'aria-current="page"' : ""}>${icon(glyph)}${label}</span>`).join("")}</nav>
          <p class="sidebar-count">${notebook(t).active.length} active applications</p>
        </aside>
        <section class="window-content">${content}</section>
      </div>`);
  }

  function board(t, age) {
    const { active, columns, python } = notebook(t);
    const cards = columns.map((apps, i) => `<section class="column" style="${stageStyle(stages[i])}">
      <h3><i></i>${stages[i].label}<b>${apps.length}</b></h3>
      ${apps.map(app => `<div class="mini-card"><b>${app.company}</b><span>${app.role}</span></div>`).join("")}</section>`
    ).join("");
    const content = `<header class="pane-header"><h2>Board</h2>${button(icon("plus") + "New application", "", "primary")}</header>
      <div class="filters">${button(`All (${active.length})`, "", "active")}${button(`Python (${python.length})`)}</div>
      <div class="column-grid">${cards}</div>`;
    return title("Pipeline", "Board") + appWindow(t, age, "Board", content);
  }

  function drag(t, age) {
    const travel = progress(t, actions.grab, actions.drop);
    const lift = Math.sin(Math.PI * travel);
    const stage = progress(t, actions.drop, actions.drop + .23, out);
    const stamp = spring(t - actions.drop - .09);
    const { active, columns, python } = notebook(t);
    const filtered = t >= actions.python;
    const visible = filtered ? columns.map(apps => apps.filter(app => python.includes(app))) : columns;
    const lanes = [1, 2].map(i => `<div class="lane" style="${stageStyle(stages[i])}"><b>${stages[i].label} · ${visible[i].length}</b></div>`).join("");
    const card = `<div data-anchor="stripe">${hitpoint}
      <span class="status">${[1, 2].map(i => `<span class="chip" style="${stageStyle(stages[i])};opacity:${i === 1 ? 1 - stage : stage}">${stages[i].label}</span>`).join("")}</span>
      <span class="app-icon" style="background:#eeeafd;color:#5546ab">S</span><h2>${stripe.company}</h2><p>${stripe.role}</p>
      <div class="tags">${stripe.skills.map(skill => chip(skill)).join("")}</div>
      <div class="stamp" style="${fadeUp(stamp, 14)}">${check(progress(t, actions.drop + .1, actions.drop + .58, out), true)}Interview · Nov 17</div>
    </div>`;
    return title("Pipeline", "Board") + `<div class="lanes">${lanes}</div>` +
      rig("drag-card", age, { x: 284 + 402 * travel, y: 264 - 48 * lift, w: 310, rx: 6 + 5 * lift, ry: -7 + 14 * travel, scale: 1 + .064 * lift, sway: .42, lift }, card) +
      `<div class="python-filter">${chip(`All (${active.length})`)}${button(`Python (${python.length})`, "python", (filtered ? "active " : "") + pressed(t, actions.python))}
        ${filtered ? `<div class="python-results" style="${fadeUp(spring(t - actions.python), 11)}">
          ${python.map(app => chip(app.company + " · " + stages[app.stage].label)).join("")}
        </div>` : ""}</div>`;
  }

  function prep(t, age) {
    const cues = [["STAR structure", "notebook"], ["Speaking pace · 138 wpm", "clock"], ["Technical depth", "board"]];
    return title("Interview Prep", "& Mock") + cues.map(([label, glyph], i) => {
      const tick = progress(age, .58 + i * .49, .94 + i * .49, out);
      const content = `<span class="app-icon">${icon(glyph)}</span><h2>${label}</h2>
        <span class="badge" style="opacity:${.2 + .8 * tick}">${check(tick)}</span>`;
      return rig(`prep-pill prep-${i}`, age,
        { x: 353 + i * 18, y: 207 + i * 111, w: 538, rx: 5 - i * 4, ry: -9 + i * 6, sway: .65, age: age + .06 - i * .24 },
        content);
    }).join("");
  }

  function score(t, age) {
    const p = progress(age, .15, 1.5, out);
    const tick = progress(age, 1.1, 1.65, out);
    return title("Interview", "readiness") + `
      <div class="ring-orbit" style="position:absolute;left:472px;top:194px;${fadeUp(spring(age), 16)}">
        <svg viewBox="0 0 306 306" fill="none" stroke-width="9" stroke-linecap="round" aria-hidden="true">
          <circle cx="153" cy="153" r="140" stroke="#254c40"/><circle cx="153" cy="153" r="140" stroke="#1baf7a" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - readiness / 100 * p}" transform="rotate(-90 153 153)"/>
        </svg>
        <div class="score"><b>${Math.round(readiness * p)}</b><span>/ 100</span><p>Readiness</p>${check(tick)}</div>
      </div>`;
  }

  function feed(t, age) {
    const filtered = t >= actions.term;
    const rows = filtered ? openings.filter(app => app.term === term) : openings;
    const content = `<header class="pane-header"><h2>Today's openings</h2></header>
      <div class="filters">${button("All terms", "", filtered ? "" : "active")}${button(icon("calendar") + term, "term", (filtered ? "active " : "") + pressed(t, actions.term))}</div>
      <div class="feed">${rows.map(app => `<div class="feed-row"><b>${app.company}</b><span>${app.role}</span><span>${app.location}</span>${chip(app.term)}${button("Save")}</div>`).join("")}</div>`;
    return title("Internship", "Openings") + appWindow(t, age, "Today", content, -1);
  }

  function opening(t, age) {
    const app = openings[0];
    const saved = t >= actions.saveOpening;
    const pop = spring(t - actions.saveOpening);
    const toast = saved ? `<div class="toast" role="status" style="translate:-50% 0;${fadeUp(pop, 17)}">
      <span class="badge">${check(progress(t, actions.saveOpening, actions.saveOpening + .36, out))}</span>${app.company} saved to notebook</div>` : "";
    const card = `<div class="opening-top"><span class="app-icon">${icon("external")}</span><h2>${app.company}</h2>
        ${button(saved ? icon("check") + "Saved" : "Save", "save-opening", (saved ? "done " : "primary ") + pressed(t, actions.saveOpening))}
      </div><h3>${app.role}</h3>
      <div class="opening-meta">${chip(icon("pin") + app.location)}${chip(icon("calendar") + app.term)}</div>`;
    return title("Internship", "Openings") + rig("opening-card", age, { x: 338, y: 252, w: 604, rx: 7, ry: 10 }, card) +
      `<p class="opening-count"><b>${notebook(t).active.length}</b> active applications</p>` + toast;
  }

  function radar(t, age) {
    const menu = t >= actions.export + .09 && t < actions.download + .12;
    const downloaded = t >= actions.download + .12;
    const content = `<header class="radar-head"><span class="app-icon">${icon("calendar")}</span><h2>Deadline Radar</h2>
        ${downloaded ? chip(icon("check") + "Downloaded") : button(icon("download") + "Export", "export", pressed(t, actions.export))}
        ${menu ? `<div class="export-menu" style="${fadeUp(progress(t, actions.export + .09, actions.export + .27, out), -7)}">
          ${button("Download calendar (.ics)", "download", pressed(t, actions.download))}
        </div>` : ""}
      </header>
      <article class="radar-event"><div class="date">NOV<b>18</b></div><div><h3>Cedar Grove technical screen</h3>${chip("Upcoming interview · 10 am")}</div></article>
      <article class="radar-event"><div class="date">NOV<b>20</b></div><div><h3>Northwind application deadline</h3><p>Waterloo, ON · Backend Intern</p></div></article>`;
    return title("Deadlines", "& Calendar") + rig("radar", age, { x: 339, y: 219, w: 602, rx: 8, ry: -11 }, content);
  }

  function confirmed(t, age) {
    const p = progress(age, .09, .78, out);
    return title("Deadlines", "& Calendar") + rig("confirm-card", age, { x: 341, y: 316, w: 598, rx: 7, ry: -9, age },
      `${check(p, true)}<h2>Calendar file with 24 h and 2 h reminders</h2>`);
  }

  function insights(t, age) {
    const { active, funnel, skills } = notebook(t);
    const percent = (count, total) => Math.round(count / total * 100);
    const row = (label, amount, max, value, from, color) => `<div class="chart-row"><span>${label}</span>
      <div class="chart-track"><i style="--bar:${color};transform:scaleX(${amount / max * progress(age, from, from + .67, out)})"></i></div>
      <b>${value}</b></div>`;
    const charts = `<div class="insight-grid"><section class="chart"><h3>Conversion funnel</h3>
      ${funnel.map((n, i) => row(stages[i].label, n, active.length, `${n} <small>(${percent(n, active.length)}%)</small>`, .19 + i * .12, stages[i].color)).join("")}
      </section><section class="chart skills"><h3>Top interview skills</h3>
      ${skills.map(([skill, n], i) => row(skill, n, skills[0][1], n, .41 + i * .12, "#2563eb")).join("")}</section></div>`;
    const metrics = [["Active applications", active.length], ["Response rate", percent(funnel[2], funnel[1]) + "%"], ["Mock readiness", readiness + " / 100"]];
    const content = `<header class="pane-header"><h2>Search insights</h2></header>
      <div class="kpis">${metrics.map(([label, value]) => `<div class="kpi"><p>${label}</p><b>${value}</b></div>`).join("")}</div>` + charts;
    return title("", "Insights") + appWindow(t, age, "Insights", content, -1);
  }

  function outro(t, age) {
    const shift = progress(age, .48, 1.04, out);
    const enter = progress(age, 0, .35, out);
    return `<div class="outro"><h1 style="opacity:${enter};transform:translateY(${20 * (1 - enter) - 105 * shift}px) scale(${1 - .39 * shift})">Stay in <em>control.</em></h1>
      <div class="lockup" style="${fadeUp(spring(age - .62), 28)}">${brand()}<h2>My Internship Notebook</h2>
        <span class="domain" style="${fadeUp(spring(age - .88), 20)}">internshipnotebook.app</span>
      </div></div>`;
  }

  const render = { hook, quick, board, drag, prep, readiness: score, openings: feed, opening, calendar: radar, confirmed, insights, outro };
  const cursors = {
    pointer: { x: 4, y: 3, path: "M4 3 29 20 17.8 21.8l5.3 11-4.6 2.2-5.3-11L4 32Z" },
    hand: { x: 14, y: 17, path: "M14 17V8a2.2 2.2 0 0 1 4.4 0v8-4a2.1 2.1 0 0 1 4.2 0v5-3a2.1 2.1 0 0 1 4.2 0v5-2a2.1 2.1 0 0 1 4.2 0v6c0 5.4-3.6 9-8.8 9h-2.7c-3.2 0-5.7-1.9-7.7-4.6l-4-5.6a2.1 2.1 0 0 1 3.2-2.7l3 3.6Z" }
  };

  function rectMargin(outer, inner) {
    return Math.min(inner.left - outer.left, inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom);
  }

  const visible = el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  function fullyVisible(el) {
    if (!el || !visible(el)) return false;
    for (let node = el; node !== root; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) < .99) return false;
    }
    return true;
  }
  const anchor = (shot, target) => root.querySelector(`[data-shot="${shot}"] [data-anchor="${target}"]`);
  function point(el) {
    const { left, top } = el.querySelector(".hitpoint").getBoundingClientRect();
    return { x: left, y: top };
  }

  function paintCursor(t, shot) {
    const click = clicks.find(click => click.shot === shot && t >= click.at - .37 && t < click.at + .3);
    const dragging = shot === "drag" && t >= actions.grab && t < actions.drop + .3;
    if (!click && !dragging) return null;
    const target = dragging ? "stripe" : click.target;
    const el = anchor(shot, target);
    if (!el) return null;
    const when = dragging ? actions.grab : click.at;
    const p = progress(t, when - .37, when);
    const since = t - when;
    const { x, y } = point(el);
    const xOffset = -76 * (1 - p);
    const yOffset = 56 * (1 - p) - Math.sin(Math.PI * p) * 14;
    const hold = dragging && t < actions.drop;
    const released = dragging && !hold;
    const end = released ? actions.drop : when;
    const exit = target === "new" ? progress(t, end + .04, end + .09)
      : target === "download" ? progress(t, end + .06, end + .12)
      : progress(t, end + .14, end + .3);
    const alpha = progress(t, when - .37, when - .22) * (hold ? 1 : 1 - exit);
    const press = since < 0 ? 0 : Math.sin(Math.PI * progress(t, when, when + .13, x => x));
    const size = 1 - .14 * press;
    const cursor = target === "stripe" ? cursors.hand : cursors.pointer;
    const ripple = since >= 0 && since < .24 ? `<div class="ripple" style="transform:translate(${x - 19}px,${y - 19}px) scale(${.27 + progress(t, when, when + .24, out)});opacity:${alpha * (1 - progress(t, when, when + .24))}"></div>` : "";
    root.insertAdjacentHTML("beforeend", ripple + `
      <svg class="cursor" width="38" height="38" viewBox="0 0 38 38" style="transform-origin:${cursor.x}px ${cursor.y}px;transform:translate(${x + xOffset - cursor.x}px,${y + yOffset - cursor.y}px) scale(${size});opacity:${alpha}" aria-hidden="true">
        <path d="${cursor.path}" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/>
      </svg>`);
    return { target, hotspot: [cursor.x, cursor.y] };
  }

  const mode = shot => shot.dark ? "dark" : "light";
  function renderFrame(time) {
    const frame = at(time);
    const layerHtml = ({ shot, t, shift, opacity }) => {
      const effect = !frame.whipping ? "" : `transform:translateX(${shift}px);filter:blur(${Math.min(9, Math.abs(shift) / 9)}px);`;
      return `<section class="shot" data-shot="${shot.id}" style="${effect}${opacity === 1 ? "" : `opacity:${opacity}`}">${render[shot.id](t, t - shot.start)}</section>`;
    };
    const dissolve = frame.layers.find(layer => layer.canvas);
    root.innerHTML = `<div class="canvas ${mode(frame.shot)}">${frame.layers.filter(layer => !layer.canvas).map(layerHtml).join("")}</div>` +
      (dissolve ? `<div class="canvas ${mode(dissolve.shot)}" style="opacity:${dissolve.opacity}">${layerHtml({ ...dissolve, opacity: 1 })}</div>` : "");
    const cursor = paintCursor(frame.t, frame.shot.id);
    return { frame, cursor };
  }

  window.__setDemoTime = renderFrame;
  window.__auditFrame = time => {
    const { frame, cursor } = renderFrame(time);
    const bounds = root.getBoundingClientRect();
    const slices = [];
    if (!frame.whipping) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || !visible(node.parentElement)) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          const margin = rectMargin(bounds, rect);
          if (margin < -.01) slices.push({ text: node.textContent.trim(), margin });
        }
      }
    }
    const targets = clicks.filter(click => time >= click.at - .500001 && time <= click.at + .000001).map(click => {
      const el = anchor(click.shot, click.target);
      const margin = fullyVisible(el) ? rectMargin(bounds, el.getBoundingClientRect()) : -1000;
      let error = 0;
      if (Math.abs(time - click.at) <= .000001) {
        const pointer = root.querySelector(".cursor");
        if (cursor?.target === click.target && pointer && el) {
          const tip = new DOMPoint(...cursor.hotspot).matrixTransform(pointer.getScreenCTM());
          const hit = point(el);
          error = Math.hypot(tip.x - hit.x, tip.y - hit.y);
        } else {
          error = 1000;
        }
      }
      return { target: click.target, margin, error };
    });
    const toast = root.querySelector(".toast");
    const drift = {};
    for (const el of root.querySelectorAll(`[data-shot="${frame.shot.id}"] [data-drift]`)) {
      const rect = el.querySelector(".tilt")?.getBoundingClientRect() ?? el.getBoundingClientRect();
      drift[el.dataset.drift] = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, rect.width, rect.height];
    }
    const canvas = root.firstElementChild;
    return {
      shot: frame.shot.id, chapter: frame.shot.chapter, whipping: frame.whipping,
      canvas: canvas.classList.contains("dark") ? "dark" : "light", background: getComputedStyle(canvas).backgroundImage,
      slicedText: slices, targets, toastMargin: toast && visible(toast) ? rectMargin(bounds, toast.getBoundingClientRect()) : null,
      drift
    };
  };
  renderFrame(0);
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
import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import VideoToolbox

let fps: Int32 = ${FPS}
let frameDuration = CMTime(value: 1, timescale: fps)
let keyframes: Set<Int64> = ${JSON.stringify([...Object.values(CHAPTERS), LOOP_REST_START].map(t => t * FPS))}
let outWidth = ${OUT_WIDTH}
let outHeight = ${OUT_HEIGHT}

struct EncodingError: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}

func checkVT(_ status: OSStatus, _ operation: String) throws {
  guard status == noErr else { throw EncodingError("\\(operation) failed (OSStatus \\(status))") }
}

final class MP4Output: @unchecked Sendable {
  private let lock = NSLock()
  private let writer: AVAssetWriter
  private var input: AVAssetWriterInput?
  private var writtenFrames: Int64 = 0
  private var failure: Error?

  init(url: URL) throws {
    writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
  }

  private func start(with sample: CMSampleBuffer) throws -> AVAssetWriterInput {
    guard let format = CMSampleBufferGetFormatDescription(sample) else {
      throw EncodingError("Missing H.264 format description")
    }
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: format)
    input.expectsMediaDataInRealTime = false
    guard writer.canAdd(input) else { throw EncodingError("Cannot add H.264 passthrough input") }
    writer.add(input)
    guard writer.startWriting() else { throw EncodingError("Cannot start MP4 writer: \\(String(describing: writer.error))") }
    writer.startSession(atSourceTime: .zero)
    self.input = input
    return input
  }

  func receive(_ status: OSStatus, _ flags: VTEncodeInfoFlags, _ sample: CMSampleBuffer?) {
    lock.withLock {
      guard failure == nil else { return }
      do {
        try checkVT(status, "Encoding frame \\(writtenFrames)")
        let expectedPTS = CMTime(value: writtenFrames, timescale: fps)
        guard !flags.contains(.frameDropped), let sample, CMSampleBufferDataIsReady(sample),
              CMSampleBufferGetPresentationTimeStamp(sample) == expectedPTS else {
          throw EncodingError("Missing or out-of-order encoded frame \\(writtenFrames)")
        }
        let input = try self.input ?? start(with: sample)
        while !input.isReadyForMoreMediaData {
          guard writer.status == .writing else {
            throw EncodingError("MP4 writer stopped: \\(String(describing: writer.error))")
          }
          Thread.sleep(forTimeInterval: 0.005)
        }
        guard input.append(sample) else {
          throw EncodingError("Cannot write encoded frame \\(writtenFrames): \\(String(describing: writer.error))")
        }
        writtenFrames += 1
      } catch {
        failure = error
      }
    }
  }

  func checkFailure() throws {
    try lock.withLock {
      if let failure { throw failure }
    }
  }

  func finish(frameCount: Int) async throws {
    // VideoToolbox has drained its callbacks before the writer is finalized.
    let input = try lock.withLock {
      if let failure { throw failure }
      guard let input = self.input, writtenFrames == Int64(frameCount) else {
        throw EncodingError("MP4 writer received \\(writtenFrames) of \\(frameCount) frames")
      }
      return input
    }
    writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frameCount), timescale: fps))
    input.markAsFinished()
    await writer.finishWriting()
    guard writer.status == .completed else { throw EncodingError("MP4 write failed: \\(String(describing: writer.error))") }
  }
}

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
    bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue
  ) else { return nil }
  ctx.interpolationQuality = .high
  ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: outWidth, height: outHeight))
  return pb
}

func verifyKeyframes(in url: URL) async throws {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else {
    throw EncodingError("MP4 has no video track")
  }
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw EncodingError("Cannot read MP4 keyframes: \\(String(describing: reader.error))") }
  var missing = keyframes
  while let sample = output.copyNextSampleBuffer() {
    let pts = CMSampleBufferGetPresentationTimeStamp(sample)
    let index = CMTimeConvertScale(pts, timescale: fps, method: .roundHalfAwayFromZero).value
    guard missing.contains(index), pts == CMTime(value: index, timescale: fps) else { continue }
    let flags = (CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[String: Any]])?.first
    if flags?[kCMSampleAttachmentKey_NotSync as String] as? Bool != true,
       flags?[kCMSampleAttachmentKey_PartialSync as String] as? Bool != true {
      missing.remove(index)
    }
  }
  guard reader.status == .completed else { throw EncodingError("MP4 keyframe read failed: \\(String(describing: reader.error))") }
  guard missing.isEmpty else {
    let times = missing.sorted().map { String($0 / Int64(fps)) }.joined(separator: ", ")
    throw EncodingError("MP4 is missing required keyframes at seconds \\(times)")
  }
}

func encode() async throws {
  let args = CommandLine.arguments
  let frames = try FileHandle(forReadingFrom: URL(fileURLWithPath: args[1]))
  defer { try? frames.close() }
  let offsetsData = try Data(contentsOf: URL(fileURLWithPath: args[2]))
  let offsets = try JSONDecoder().decode([UInt64].self, from: offsetsData)
  let frameCount = offsets.count - 1
  guard frameCount == ${TOTAL_FRAMES}, offsets.first == 0,
        zip(offsets, offsets.dropFirst()).allSatisfy({ $0.0 < $0.1 }) else {
    throw EncodingError("Invalid frame offsets")
  }
  let outURL = URL(fileURLWithPath: args[3])
  let output = try MP4Output(url: outURL)

  let attributes = [
    kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
    kCVPixelBufferWidthKey as String: outWidth,
    kCVPixelBufferHeightKey as String: outHeight
  ]
  var session: VTCompressionSession?
  try checkVT(VTCompressionSessionCreate(
    allocator: nil, width: Int32(outWidth), height: Int32(outHeight), codecType: kCMVideoCodecType_H264,
    encoderSpecification: nil, imageBufferAttributes: attributes as CFDictionary, compressedDataAllocator: nil,
    outputCallback: nil, refcon: nil, compressionSessionOut: &session
  ), "Creating H.264 session")
  guard let session else { throw EncodingError("Missing H.264 session") }
  defer { VTCompressionSessionInvalidate(session) }

  let properties: [String: Any] = [
    kVTCompressionPropertyKey_ProfileLevel as String: kVTProfileLevel_H264_High_AutoLevel,
    kVTCompressionPropertyKey_AverageBitRate as String: Int(args[4])!,
    kVTCompressionPropertyKey_DataRateLimits as String: [${MAX_VIDEO_BYTES}, ${DURATION_SEC}],
    kVTCompressionPropertyKey_ExpectedFrameRate as String: fps,
    kVTCompressionPropertyKey_MaxKeyFrameInterval as String: ${FPS},
    kVTCompressionPropertyKey_RealTime as String: false,
    kVTCompressionPropertyKey_AllowFrameReordering as String: false,
    kVTCompressionPropertyKey_MaxFrameDelayCount as String: 8
  ]
  try checkVT(VTSessionSetProperties(session, propertyDictionary: properties as CFDictionary), "Configuring H.264 session")
  try checkVT(VTCompressionSessionPrepareToEncodeFrames(session), "Preparing H.264 session")
  guard let pool = VTCompressionSessionGetPixelBufferPool(session) else {
    throw EncodingError("Missing H.264 pixel buffer pool")
  }

  let forceKeyframe = [kVTEncodeFrameOptionKey_ForceKeyFrame as String: true] as CFDictionary
  for i in 0..<frameCount {
    try autoreleasepool {
      try frames.seek(toOffset: offsets[i])
      let count = Int(offsets[i + 1] - offsets[i])
      guard let jpeg = try frames.read(upToCount: count), jpeg.count == count,
            let buffer = pixelBuffer(from: jpeg, pool: pool) else {
        throw EncodingError("Cannot decode frame \\(i)")
      }
      let index = CMTimeValue(i)
      let pts = CMTime(value: index, timescale: fps)
      var flags = VTEncodeInfoFlags()
      try checkVT(VTCompressionSessionEncodeFrame(
        session, imageBuffer: buffer, presentationTimeStamp: pts, duration: frameDuration,
        frameProperties: keyframes.contains(index) ? forceKeyframe : nil, infoFlagsOut: &flags
      ) { status, info, sample in
        output.receive(status, info, sample)
      }, "Submitting frame \\(i)")
      guard !flags.contains(.frameDropped) else { throw EncodingError("Encoder dropped frame \\(i)") }
      try output.checkFailure()
    }
  }

  try checkVT(VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid), "Draining H.264 session")
  try await output.finish(frameCount: frameCount)
  try await verifyKeyframes(in: outURL)
}

do {
  try await encode()
} catch {
  FileHandle.standardError.write(Data("MP4 encoding failed: \\(error)\\n".utf8))
  exit(EXIT_FAILURE)
}
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

const DRIFT_LIMITS = { speed: 80, acceleration: 600 };
const DRAG_LIMITS = { speed: 880, acceleration: 5700 };

function measureMotion(frame, previous, prior) {
  if (frame.whipping || previous?.whipping || frame.shot !== previous?.shot) return [];
  return Object.entries(frame.drift).flatMap(([name, position]) => {
    const before = previous.drift[name];
    if (!before) return [];
    const delta = position.map((value, i) => value - before[i]);
    const earlier = prior?.shot === frame.shot && !prior.whipping ? prior.drift[name] : null;
    const speed = Math.hypot(...delta) * FPS;
    const acceleration = earlier ? Math.hypot(...delta.map((value, i) => value - (before[i] - earlier[i]))) * FPS ** 2 : 0;
    const limit = name === "drag-card" ? DRAG_LIMITS : DRIFT_LIMITS;
    return [{ name, speed, acceleration, margin: 1 - Math.max(speed / limit.speed, acceleration / limit.acceleration) }];
  });
}

async function frameReport(page, frame, previous, prior) {
  const t = frame / FPS;
  const result = await page.evaluate(time => window.__auditFrame(time), t);
  const chapter = Object.entries(CHAPTERS).findLast(([, start]) => t >= start);
  const expected = chapter[1] % 10 === 0 ? "dark" : "light";
  const color = expected === "dark" ? "rgb(9, 12, 18)" : "rgb(232, 236, 244)";
  const checkCanvas = t < LOOP_REST_START;
  const canvasMargin = checkCanvas ? Number(result.chapter === chapter[0] && result.canvas === expected && result.background.includes(color) &&
    (t !== chapter[1] || !result.whipping)) - 1 : null;
  return { frame, t, ...result, canvasMargin, motion: measureMotion(result, previous, prior), seam: null };
}

const FRAMING_RULES = {
  slicedText: report => report.whipping ? null : Math.min(0, ...report.slicedText.map(slice => slice.margin)),
  cursor: report => report.targets.length ? Math.min(...report.targets.map(target => Math.min(target.margin, .01 - target.error))) : null,
  toast: report => report.toastMargin === null ? null : report.toastMargin - 12,
  motion: report => report.motion.length ? Math.min(...report.motion.map(item => item.margin)) : null,
  loopSeam: report => report.seam,
  chapterCanvas: report => report.canvasMargin
};

function failsFraming(report) {
  return Object.values(FRAMING_RULES).some(clearance => clearance(report) < 0);
}

async function auditFrames(page) {
  const frames = [];
  let opening;
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const report = await frameReport(page, frame, frames.at(-1), frames.at(-2));
    if (frame === 0) opening = await page.screenshot({ type: "png" });
    if (frame >= LOOP_REST_START * FPS) {
      const held = await page.screenshot({ type: "png" });
      report.seam = held.equals(opening) ? 0 : -1;
    }
    frames.push(report);
  }
  const failures = frames.filter(failsFraming);
  const worst = Object.fromEntries(Object.entries(FRAMING_RULES).map(([name, clearance]) => [
    name,
    frames.map(report => ({ report, margin: clearance(report) })).filter(item => item.margin !== null)
      .sort((a, b) => a.margin - b.margin).slice(0, 5)
      .map(({ report, margin }) => {
        const { frame, t, shot, canvas, slicedText, targets, toastMargin, motion, seam } = report;
        const details = { slicedText, cursor: targets, toast: toastMargin, motion, loopSeam: seam, chapterCanvas: canvas };
        return { frame, t, shot, margin, value: details[name] };
      })
  ]));
  console.log(JSON.stringify({ frames: TOTAL_FRAMES, failures: failures.length, chapters: CHAPTERS,
    motionLimits: { drift: DRIFT_LIMITS, drag: DRAG_LIMITS }, worst }, null, 2));
  if (failures.length) throw new Error(`Framing audit failed on ${failures.length} frames`);
}

async function captureFrames(page, framesPath) {
  const offsets = [0];
  const fd = fs.openSync(framesPath, "wx");
  let opening;
  let previous;
  let prior;
  try {
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const report = await frameReport(page, i, previous, prior);
      if (failsFraming(report)) throw new Error(`Framing audit failed: ${JSON.stringify(report)}`);
      prior = previous;
      previous = report;
      const jpeg = i >= LOOP_REST_START * FPS ? opening : await page.screenshot({ type: "jpeg", quality: 90 });
      if (i === 0) opening = jpeg;
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
  const sceneHtml = buildSceneHtml(ICONS, LOGO);
  const ffmpegBin = audit ? null : findFfmpeg();
  let browser = await chromium.launch({ headless: true });
  try {
    const page = await openScene(browser, sceneHtml, DEVICE_SCALE_FACTOR);
    if (audit) {
      await auditFrames(page);
      return;
    }

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(MEDIA_DIR, ".demo-tour-"));
    try {
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
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
    }
  } finally {
    await browser?.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
