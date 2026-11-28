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
  // The first frame counts as one 60 Hz frame, then three 50 ms frames: 166.7 ms of 400 ms.
  assert.equal(win.scrollY, 967);
  assert.equal(wheel(100), true);
  settle();
  assert.equal(win.scrollY, 1067); // the wheel adds 100 to where the glide was interrupted

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

for (const [position, delta] of [[0, -100], [9200, 100], [0, 0]]) {
  test(`wheel stays native when it cannot move from ${position} by ${delta}`, () => {
    const h = createHarness();
    h.win.scrollY = position;
    assert.equal(h.wheel(delta), false);
    assert.equal(h.frames.size, 0);
  });
}

test("non-cancelable wheel stays native", () => {
  const h = createHarness();
  assert.equal(h.wheel(100, { cancelable: false }), false);
  assert.equal(h.frames.size, 0);
});

test("invalid wheel deltas do not poison the engine", () => {
  const h = createHarness();
  for (const delta of [NaN, Infinity, -Infinity]) assert.equal(h.wheel(delta), false);
  h.wheel(100);
  h.settle();
  assert.equal(h.win.scrollY, 100);
});

test("invalid scrollTo arguments leave the page idle", () => {
  for (const [target, duration] of [[NaN, 400], [Infinity, 400], [100, NaN], [100, Infinity]]) {
    const h = createHarness();
    h.engine.scrollTo(target, { duration });
    assert.equal(h.frames.size, 0);
    assert.equal(h.win.scrollY, 0);
  }
});

test("invalid damping rates fall back to a settling glide", () => {
  for (const lambda of [NaN, Infinity, 0, -9]) {
    const h = createHarness({ lambda });
    h.wheel(100);
    h.settle();
    assert.equal(h.win.scrollY, 100);
  }
});

test("modal hold interrupts a programmatic glide", () => {
  const h = createHarness();
  h.engine.scrollTo(1000, { duration: 400 });
  h.step();
  const before = h.win.scrollY;
  h.classes.add("motion-hold");
  h.settle();
  assert.equal(h.win.scrollY, before);
});

test("fractional targets never overshoot during a glide", () => {
  const h = createHarness();
  h.engine.onFrame(y => assert.ok(y <= 0.6));
  h.engine.scrollTo(0.6, { duration: 800 });
  h.settle();
});

test("document shrink clamps the target without a window resize", () => {
  const h = createHarness();
  let observer;
  h.engine.stop();
  h.win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  };
  const engine = createScrollEngine({ win: h.win });
  engine.start();
  engine.scrollTo(9000, { duration: 800 });
  h.step();
  h.win.document.documentElement.scrollHeight = 5000;
  observer?.callback();
  h.settle();
  assert.equal(h.win.scrollY, 4200);
  engine.stop();
});

test("line and page wheel modes settle in pixels", () => {
  const h = createHarness();
  h.wheel(3, { deltaMode: 1 });
  h.settle();
  assert.equal(h.win.scrollY, 48);
  h.wheel(1, { deltaMode: 2 });
  h.settle();
  assert.equal(h.win.scrollY, 848);
});

test("disabling mid-glide stops both wheel and programmatic motion", () => {
  for (const programmatic of [false, true]) {
    let enabled = true;
    const h = createHarness({ isEnabled: () => enabled });
    if (programmatic) h.engine.scrollTo(1000, { duration: 400 });
    else h.wheel(1000);
    h.step();
    const before = h.win.scrollY;
    enabled = false;
    h.settle();
    assert.equal(h.win.scrollY, before);
  }
});

test("start and restart sleep without input and remove all listeners", () => {
  const h = createHarness();
  let writes = 0;
  h.engine.onFrame(() => writes++);
  for (let i = 0; i < 3; i++) {
    h.engine.start();
    h.listeners.get("resize")();
    h.listeners.get("scroll")();
    h.settle();
    assert.equal(writes, 0);
    h.engine.stop();
    h.engine.stop();
    assert.equal(h.listeners.size, 0);
    h.engine.start();
  }
  h.wheel(100);
  h.settle();
  assert.equal(h.win.scrollY, 100);
  const count = writes;
  h.settle();
  assert.equal(writes, count);
});

test("hidden overflow and nested scroll edges hand wheel to the page", () => {
  const h = createHarness();
  const scroller = {
    overflowY: "hidden", scrollTop: 40, scrollHeight: 200, clientHeight: 100,
    parentElement: h.win.document.body
  };
  assert.equal(h.wheel(100, { target: scroller }), true);
  h.settle();
  scroller.overflowY = "scroll";
  scroller.scrollTop = 0;
  assert.equal(h.wheel(-50, { target: scroller }), true);
  h.settle();
  assert.equal(h.win.scrollY, 50);
});

test("momentum that arrives after the target reaches the page end keeps gliding to the end", () => {
  const h = createHarness();
  h.win.scrollY = 9000;
  assert.equal(h.wheel(150), true);
  h.step();
  assert.equal(h.wheel(150), true);
  h.step();
  assert.equal(h.wheel(150), true, "an event at the clamped end must not fall through to a native jump mid-glide");
  h.settle();
  assert.equal(h.win.scrollY, 9200);
});

test("the first frame of a gesture moves the page even when its timestamp predates the wheel event", () => {
  const h = createHarness();
  h.wheel(300);
  h.step(-3);
  assert.ok(h.win.scrollY > 0, `first frame stayed at ${h.win.scrollY}`);
});
