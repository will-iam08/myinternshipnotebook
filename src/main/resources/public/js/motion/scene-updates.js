// Per-scene text updates (counters) for the welcome page scroll scenes.
// Motion itself lives in CSS, driven by the --p custom property the scene system writes.
// The static HTML already shows each scene's finished values, for reduced motion and no-JS visitors.
import { clamp } from "./motion-math.js";

const counterCache = new WeakMap();
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Writes a counter's text only when it changes, so a frame never touches the DOM needlessly. */
function setCounter(stage, name, text) {
  let counters = counterCache.get(stage);
  if (!counters) {
    counters = new Map([...stage.querySelectorAll("[data-counter]")].map(el => [el.dataset.counter, el]));
    counterCache.set(stage, counters);
  }
  const element = counters.get(name);
  if (element && element.textContent !== text) element.textContent = text;
}

const span = (p, start, length) => clamp((p - start) / length, 0, 1);
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export const SCENE_UPDATES = Object.freeze({
  clipper(p, stage) {
    const filled = Math.min(5, Math.floor((p - 0.5) / 0.056) + 1);
    const count = p >= 0.78 ? 5 : filled;
    setCounter(stage, "clip", p < 0.5 ? "Clip" : `Filled ${count} ${count === 1 ? "field" : "fields"}`);
  },
  pipeline(p, stage) {
    const moved = p >= 0.72;
    setCounter(stage, "applied", moved ? "11" : "12");
    setCounter(stage, "interview", moved ? "4" : "3");
  },
  import(p, stage) {
    const rows = p < 0.3 ? 0 : Math.min(48, Math.round(span(p, 0.3, 0.64) * 48));
    setCounter(stage, "import", p >= 0.94 ? "48 imported" : `${rows} / 48 rows`);
  },
  interview(p, stage) {
    const t = span(p, 0.18, 0.68);
    setCounter(stage, "score", String(Math.round(t * 88)));
    setCounter(stage, "timer", clock(Math.floor(t * 105)));
    setCounter(stage, "pace", p < 0.25 ? "-- wpm" : `${Math.round(118 + span(p, 0.25, 0.55) * 20)} wpm`);
  },
  reminders(p, stage) {
    const alerts = [0.29, 0.32, 0.35, 0.38].filter(at => p >= at).length;
    setCounter(stage, "alerts", `${alerts} ${alerts === 1 ? "alert" : "alerts"}`);
    setCounter(stage, "day", p < 0.46 ? "" : DAYS[Math.min(6, Math.floor(span(p, 0.46, 0.3) * 7))]);
  },
  insights(p, stage) {
    const rings = span(p, 0.22, 0.6);
    const bars = span(p, 0.06, 0.5);
    setCounter(stage, "r1", `${Math.round(rings * 75)}%`);
    setCounter(stage, "r2", `${Math.round(rings * 33)}%`);
    setCounter(stage, "r3", `${Math.round(rings * 11)}%`);
    setCounter(stage, "saved", String(Math.round(bars * 24)));
    setCounter(stage, "appliedTotal", String(Math.round(bars * 18)));
    setCounter(stage, "interviews", String(Math.round(bars * 6)));
    setCounter(stage, "offers", String(Math.round(bars * 2)));
  }
});
