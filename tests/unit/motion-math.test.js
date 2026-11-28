import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FRAME_MS,
  damp,
  dampFactor,
  easeOutExpo,
  normalizeWheelDelta,
  range,
  sceneProgress
} from "../../src/main/resources/public/js/motion/motion-math.js";

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
