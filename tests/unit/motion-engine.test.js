import assert from "node:assert/strict";
import test from "node:test";
import { createScrollEngine } from "../../src/main/resources/public/js/motion/scroll-engine.js";

function createHarness(options) {
  let now = 0;
  let nextFrameId = 0;
  const frames = new Map();
  const listeners = new Map();
  const classes = new Set();
  const body = {};
  const root = { scrollHeight: 10000, classList: { contains: name => classes.has(name) } };
  const win = {
    scrollY: 0,
    innerHeight: 800,
    document: { body, documentElement: root },
    getComputedStyle: element => ({ overflowY: element.overflowY }),
    scrollTo({ top, behavior }) {
      assert.equal(behavior, "instant");
      this.scrollY = top;
    },
    performance: { now: () => now },
    requestAnimationFrame(callback) {
      frames.set(++nextFrameId, callback);
      return nextFrameId;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(type, handler, settings) {
      if (type === "wheel") assert.equal(settings.passive, false);
      assert.equal(listeners.has(type), false);
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      assert.equal(listeners.get(type), handler);
      listeners.delete(type);
    }
  };
  const engine = createScrollEngine({ win, ...options });
  engine.start();

  function step(ms = 16.7) {
    now += ms;
    const queued = [...frames.values()];
    frames.clear();
    for (const callback of queued) callback(now);
  }

  return {
    win, engine, frames, listeners, classes, step,
    wheel(deltaY, overrides) {
      let prevented = false;
      listeners.get("wheel")({
        deltaX: 0, deltaY, deltaMode: 0, target: body,
        preventDefault() { prevented = true; },
        ...overrides
      });
      return prevented;
    },
    settle() {
      for (let i = 0; i < 120; i++) step();
      assert.equal(frames.size, 0);
      assert.equal(engine.isActive(), false);
    }
  };
}

test("one wheel event glides over several frames then settles exactly on the target", () => {
  const { win, engine, wheel, step, settle, frames } = createHarness();
  const positions = [];
  const unsubscribe = engine.onFrame(y => positions.push(y));
  assert.equal(frames.size, 0);
  assert.equal(wheel(300), true);
  assert.equal(engine.isActive(), true);
  step();
  assert.ok(win.scrollY > 0 && win.scrollY < 300);
  assert.deepEqual(positions, [win.scrollY]);
  settle();
  assert.equal(win.scrollY, 300);
  assert.equal(positions.at(-1), 300);

  unsubscribe();
  const count = positions.length;
  wheel(100);
  settle();
  assert.equal(positions.length, count);
});

test("trackpad stream of 40 decaying deltas settles on their sum without overshoot", () => {
  const { win, engine, wheel, step, settle } = createHarness();
  let max = 0;
  engine.onFrame(y => { max = Math.max(max, y); });
  let sum = 0;
  for (let i = 0; i < 40; i++) {
    const delta = 40 * 0.875 ** i;
    sum += delta;
    wheel(delta);
    step();
  }
  settle();
  assert.equal(win.scrollY, sum);
  assert.ok(max <= sum);
});

test("ctrl or meta wheel is not intercepted", () => {
  const { win, wheel, classes, settle } = createHarness();
  assert.equal(wheel(300, { ctrlKey: true }), false);
  assert.equal(wheel(300, { metaKey: true }), false);
  assert.equal(wheel(30, { deltaX: -50 }), false);
  classes.add("motion-hold");
  assert.equal(wheel(300), false);
  settle();
  assert.equal(win.scrollY, 0);
});

test("a wheel over a scrollable element with room is left native", () => {
  const { win, wheel, settle } = createHarness();
  const scroller = {
    overflowY: "auto", scrollTop: 40, scrollHeight: 200, clientHeight: 100,
    parentElement: win.document.body
  };
  const target = { parentElement: scroller };
  assert.equal(wheel(300, { target }), false);
  assert.equal(wheel(-300, { target }), false);
  settle();
  assert.equal(win.scrollY, 0);

  scroller.scrollTop = 100;
  assert.equal(wheel(300, { target }), true);
  settle();
  assert.equal(win.scrollY, 300);
});

test("an external scroll resyncs the next wheel", () => {
  const { win, wheel, listeners, step, settle } = createHarness();
  win.scrollY = 5000;
  wheel(100);
  settle();
  assert.equal(win.scrollY, 5100);

  wheel(300);
  step();
  win.scrollY = 4000;
  listeners.get("scroll")();
  settle();
  assert.equal(win.scrollY, 4000);
});

test("target clamps to the document end and to 0", () => {
  const { win, wheel, listeners, step, settle } = createHarness();
  wheel(20000);
  settle();
  assert.equal(win.scrollY, 9200);
  wheel(-20000);
  settle();
  assert.equal(win.scrollY, 0);

  wheel(20000);
  step();
  win.document.documentElement.scrollHeight = 5000;
  listeners.get("resize")();
  settle();
  assert.equal(win.scrollY, 4200);
});

test("scrollTo glides with expo-out and a wheel interrupts it", () => {
  const { win, engine, wheel, listeners, step, settle } = createHarness();
  engine.scrollTo(1024, { duration: 400 });
  for (let i = 0; i < 4; i++) step(50);
  assert.equal(win.scrollY, 992);
  assert.equal(wheel(100), true);
  settle();
  assert.equal(win.scrollY, 1092);

  for (const type of ["keydown", "pointerdown"]) {
    engine.scrollTo(2000, { duration: 400 });
    step();
    const interruptedAt = win.scrollY;
    listeners.get(type)();
    settle();
    assert.equal(win.scrollY, interruptedAt);
  }
});

test("a 5-second frame gap does not overshoot", () => {
  const { win, wheel, step, settle } = createHarness();
  wheel(1000);
  step(5000);
  assert.ok(win.scrollY > 0 && win.scrollY < 1000);
  settle();
  assert.equal(win.scrollY, 1000);
});

test("stop() removes every listener", () => {
  const { win, engine, wheel, listeners, step, settle } = createHarness();
  for (const type of ["wheel", "scroll", "keydown", "pointerdown"]) {
    assert.equal(listeners.has(type), true);
  }
  wheel(300);
  step();
  const stoppedAt = win.scrollY;
  engine.stop();
  assert.equal(listeners.size, 0);
  settle();
  assert.equal(win.scrollY, stoppedAt);
});

test("isEnabled() false: wheel stays native and scrollTo jumps", () => {
  const { win, engine, wheel, frames } = createHarness({ isEnabled: () => false });
  assert.equal(wheel(300), false);
  assert.equal(win.scrollY, 0);
  assert.equal(frames.size, 0);
  engine.scrollTo(800, { duration: 400 });
  assert.equal(win.scrollY, 800);
  assert.equal(frames.size, 0);
});
