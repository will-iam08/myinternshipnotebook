import assert from "node:assert/strict";
import test from "node:test";
import { createSceneSystem } from "../../src/main/resources/public/js/motion/scenes.js";

function createHarness({ stageHeight = 600 } = {}) {
  let onEngineFrame;
  let nextFrameId = 0;
  let intersection;
  let resize;
  const listeners = new Map();
  const frames = new Map();
  const properties = new Map();
  const updates = [];
  const root = {};
  const stage = {
    scrollHeight: stageHeight,
    style: {
      setProperty(name, value) { properties.set(name, value); },
      removeProperty(name) { properties.delete(name); }
    }
  };
  const wrapper = {
    offsetTop: 1000,
    offsetHeight: 2400,
    dataset: {},
    querySelector(selector) {
      assert.equal(selector, "[data-scene-stage]");
      return stage;
    },
    getBoundingClientRect() { return { top: this.offsetTop - win.scrollY, height: this.offsetHeight }; }
  };

  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
    }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }

  const win = {
    scrollY: 0,
    innerHeight: 800,
    document: { documentElement: root },
    IntersectionObserver: class extends Observer {
      constructor(callback, options) {
        super(callback);
        assert.equal(options.rootMargin, "100% 0px");
        intersection = this;
      }
    },
    ResizeObserver: class extends Observer {
      constructor(callback) {
        super(callback);
        resize = this;
      }
    },
    requestAnimationFrame(callback) {
      frames.set(++nextFrameId, callback);
      return nextFrameId;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      assert.equal(listeners.get(type), handler);
      listeners.delete(type);
    }
  };
  const engine = {
    onFrame(callback) {
      onEngineFrame = callback;
      return () => { onEngineFrame = undefined; };
    }
  };
  const scenes = createSceneSystem({ win, engine, headerHeight: () => 100 });
  scenes.register("feature", wrapper, { update: (p, element) => updates.push([p, element]) });

  return {
    scenes, win, wrapper, stage, updates, frames, listeners, intersection, resize,
    progress: () => properties.get("--p"),
    engineFrame: () => onEngineFrame,
    activate(isIntersecting = true) {
      assert.equal(intersection.targets.has(wrapper), true);
      intersection.callback([{ target: wrapper, isIntersecting }]);
    },
    step() {
      const queued = [...frames.values()];
      frames.clear();
      for (const callback of queued) callback();
    }
  };
}

test("progress is written to --p across the wrapper", () => {
  const { scenes, wrapper, stage, progress, updates, activate } = createHarness();
  activate();
  assert.equal(wrapper.dataset.pinned, "true");
  scenes.render(1000);
  assert.equal(progress(), "0.0000");
  scenes.render(1800);
  assert.equal(progress(), "0.5000");
  scenes.render(3400);
  assert.equal(progress(), "1.0000");
  assert.deepEqual(updates, [[0, stage], [0.5, stage], [1, stage]]);
});

test("a stage taller than the space under the header is not pinned and jumps to 1 after entering view", () => {
  const { scenes, wrapper, progress, activate } = createHarness({ stageHeight: 720 });
  activate();
  assert.equal(wrapper.dataset.pinned, "false");
  scenes.render(200);
  assert.equal(progress(), "0.0000");
  scenes.render(201);
  assert.equal(progress(), "1.0000");
  scenes.render(200);
  assert.equal(progress(), "1.0000");
});

test("refresh after a resize re-measures and re-checks fit", () => {
  const { win, wrapper, listeners, resize, progress, activate, step } = createHarness({ stageHeight: 720 });
  activate();
  assert.equal(wrapper.dataset.pinned, "false");
  assert.deepEqual(resize.targets, new Set([win.document.documentElement, wrapper]));

  win.innerHeight = 1200;
  win.scrollY = 1800;
  wrapper.offsetTop = 1200;
  wrapper.offsetHeight = 2400;
  listeners.get("resize")();
  step();
  assert.equal(wrapper.dataset.pinned, "true");
  assert.equal(progress(), "0.5000");

  wrapper.offsetHeight = 3600;
  resize.callback();
  step();
  assert.equal(progress(), "0.2500");
});

test("inactive scenes are not rendered", () => {
  const { scenes, win, wrapper, updates, listeners, frames, intersection, resize, progress, activate, engineFrame, step } = createHarness();
  scenes.render(1800);
  assert.equal(progress(), undefined);
  activate();
  assert.ok(Object.hasOwn(wrapper.dataset, "sceneActive"));
  win.scrollY = 1400;
  listeners.get("scroll")();
  engineFrame()(1800);
  assert.equal(frames.size, 0);
  assert.equal(progress(), "0.5000");
  assert.equal(updates.length, 1);

  activate(false);
  assert.equal(Object.hasOwn(wrapper.dataset, "sceneActive"), false);
  scenes.render(2400);
  assert.equal(updates.length, 1);
  scenes.destroy();
  assert.equal(engineFrame(), undefined);
  assert.equal(listeners.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(intersection.targets.size, 0);
  assert.equal(resize.targets.size, 0);
});

test("setProgress overrides until release", () => {
  const { scenes, win, progress, activate, step } = createHarness();
  activate();
  scenes.setProgress("feature", 0.75);
  scenes.render(1000);
  assert.equal(progress(), "0.7500");
  scenes.render(3400);
  assert.equal(progress(), "0.7500");
  win.scrollY = 1800;
  scenes.release("feature");
  step();
  assert.equal(progress(), "0.5000");
});

test("invalid progress cannot corrupt scene styles", () => {
  const h = createHarness();
  h.activate();
  h.scenes.setProgress("feature", 0.5);
  for (const p of [NaN, Infinity, -Infinity]) {
    h.scenes.setProgress("feature", p);
    h.scenes.render(1000);
    assert.equal(h.progress(), "0.5000");
  }
  h.scenes.setProgress("feature", 2);
  h.scenes.render(1000);
  assert.equal(h.progress(), "1.0000");
  h.scenes.release("feature");
  h.scenes.render(1800);
  h.scenes.render(NaN);
  assert.equal(h.progress(), "0.5000");
});

test("render reads cached geometry and frame batching sleeps when idle", () => {
  const h = createHarness();
  h.activate();
  h.step();
  h.wrapper.getBoundingClientRect = () => { throw new Error("layout read in render"); };
  for (const [object, key] of [[h.stage, "scrollHeight"], [h.wrapper, "offsetHeight"], [h.win, "innerHeight"]]) {
    Object.defineProperty(object, key, { get() { throw new Error(`layout read: ${key}`); } });
  }
  h.scenes.render(1800);
  assert.equal(h.progress(), "0.5000");
  h.engineFrame()(2000);
  assert.equal(h.progress(), "0.6250");
  h.engineFrame()(2200);
  assert.equal(h.progress(), "0.7500");
  assert.equal(h.frames.size, 0);
  h.step();
  assert.equal(h.frames.size, 0);
});

test("an engine frame renders scenes in that same frame, not one frame later", () => {
  const { progress, activate, engineFrame, frames, step } = createHarness();
  activate();
  step();
  engineFrame()(1800);
  assert.equal(progress(), "0.5000");
  assert.equal(frames.size, 0);
});
